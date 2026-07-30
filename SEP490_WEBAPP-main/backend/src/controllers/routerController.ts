import { Request, Response } from 'express';
import { RoutingDecisionLog } from '../models/RoutingDecisionLog';
import { decideHybridRoute } from '../services/routing/routingOrchestrator';
import { DEFAULT_ROUTING_THRESHOLDS, RoutingMode, RoutingThresholds } from '../services/routing/routingTypes';
import { getAuthUserId } from '../utils/auth';
import { configService } from '../services/configService';
import { ModelVersion, ModelVersionStatus } from '../models/ModelVersion';
import crypto from 'crypto';

const fetch = async (url: string, init?: any) => {
  const module = await import('node-fetch');
  return module.default(url, init);
};

const gpuHeaders = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'Bypass-Tunnel-Reminder': 'true',
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  accounting?: string;
};

const consumeSseResponse = async (
  response: any,
  startedAt: number,
): Promise<{ text: string; tokenUsage: TokenUsage | null; inferenceId: string | null; ttftMs: number | null }> => {
  let text = '';
  let tokenUsage: TokenUsage | null = null;
  let inferenceId: string | null = null;
  let firstTokenAt: number | null = null;
  let buffer = '';

  const consumeLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const data = JSON.parse(payload);
      if (typeof data.text === 'string') {
        if (data.text.length > 0 && firstTokenAt === null) firstTokenAt = Date.now();
        text += data.text;
      }
      if (data.usage) {
        tokenUsage = {
          inputTokens: Number(data.usage.input_tokens ?? data.usage.inputTokens ?? 0),
          outputTokens: Number(data.usage.output_tokens ?? data.usage.outputTokens ?? 0),
          totalTokens: Number(data.usage.total_tokens ?? data.usage.totalTokens ?? 0),
          accounting: data.usage.accounting ? String(data.usage.accounting) : undefined,
        };
      }
      if (data.inference_id) inferenceId = String(data.inference_id);
    } catch { /* ignore malformed SSE chunks */ }
  };

  if (!response.body) throw new Error('GPU returned an empty SSE body');
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    buffer += Buffer.from(chunk).toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(consumeLine);
  }
  if (buffer) consumeLine(buffer);
  return {
    text: text.trim(),
    tokenUsage,
    inferenceId,
    ttftMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
  };
};

const inferOnGpu = async (args: {
  modelId: string;
  slotId: number;
  text: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  generation: Record<string, unknown>;
}): Promise<{ text: string; latencyMs: number; ttftMs: number | null; decodeLatencyMs: number | null; tokenUsage: TokenUsage | null; inferenceId: string | null }> => {
  const started = Date.now();
  const url = configService.getGpuUrl(args.slotId);
  const response = await fetch(`${url}/api/infer/stream`, {
    method: 'POST', headers: gpuHeaders,
    body: JSON.stringify({
      hf_model_id: args.modelId,
      instanceId: args.slotId,
      text_input: args.text,
      history: args.history.slice(-10),
      system_prompt: args.systemPrompt,
      ...args.generation,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try { detail = JSON.parse(raw).error || raw; } catch { /* retain raw */ }
    throw new Error(`GPU inference failed for ${args.modelId}: ${detail}`);
  }
  const parsed = await consumeSseResponse(response, started);
  if (!parsed.text) throw new Error(`GPU returned an empty response for ${args.modelId}`);
  const latencyMs = Date.now() - started;
  return {
    ...parsed,
    latencyMs,
    decodeLatencyMs: parsed.ttftMs === null ? null : Math.max(0, latencyMs - parsed.ttftMs),
  };
};

type ModelLoadResult = { latencyMs: number; cacheHit: boolean; message: string };

const loadIntoSlot = async (modelId: string, slotId: number): Promise<ModelLoadResult> => {
  const started = Date.now();
  const url = configService.getGpuUrl(slotId);
  const response = await fetch(`${url}/api/model/load`, {
    method: 'POST', headers: gpuHeaders,
    body: JSON.stringify({ hf_model_id: modelId, instanceId: slotId }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Cannot load ${modelId} into GPU slot ${slotId}: ${raw}`);
  }
  let message = raw;
  try { message = String(JSON.parse(raw).message || raw); } catch { /* retain raw */ }
  const cacheHit = /bỏ qua|bo qua|already|skip/i.test(message);
  return { latencyMs: Date.now() - started, cacheHit, message };
};

const readGpuSlotModels = async (): Promise<Map<number, string>> => {
  const slotModels = new Map<number, string>();
  await Promise.all([1, 2].map(async slotId => {
    try {
      const response = await fetch(`${configService.getGpuUrl(slotId)}/api/model/status`, {
        method: 'GET', headers: gpuHeaders, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return;
      const data = await response.json() as any;
      const slot = data?.slots?.[String(slotId)];
      if (slot?.loaded && slot?.model_id) slotModels.set(slotId, String(slot.model_id));
    } catch { /* older GPU service or unavailable status endpoint */ }
  }));
  return slotModels;
};

type ClassificationMetric = { precision: number; recall: number; f1: number; support: number };

const normalizedLabel = (value: unknown): string => String(value || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';

const buildClassificationMetrics = (gold: string[], predicted: string[]) => {
  const labels = [...new Set([...gold, ...predicted])].sort();
  const confusionMatrix: Record<string, Record<string, number>> = {};
  labels.forEach(actual => { confusionMatrix[actual] = {}; labels.forEach(pred => { confusionMatrix[actual][pred] = 0; }); });
  gold.forEach((actual, index) => { confusionMatrix[actual][predicted[index]] += 1; });

  const perClass: Record<string, ClassificationMetric> = {};
  for (const label of labels) {
    const tp = confusionMatrix[label][label];
    const fp = labels.reduce((sum, actual) => sum + (actual === label ? 0 : confusionMatrix[actual][label]), 0);
    const fn = labels.reduce((sum, predictedLabel) => sum + (predictedLabel === label ? 0 : confusionMatrix[label][predictedLabel]), 0);
    const support = labels.reduce((sum, predictedLabel) => sum + confusionMatrix[label][predictedLabel], 0);
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[label] = { precision, recall, f1, support };
  }
  const supportedLabels = labels.filter(label => perClass[label].support > 0);
  const macroF1 = supportedLabels.length
    ? supportedLabels.reduce((sum, label) => sum + perClass[label].f1, 0) / supportedLabels.length
    : 0;
  return { labels, per_class: perClass, macro_f1: macroF1, confusion_matrix: confusionMatrix };
};

const classifyRoutingError = (decision: any, goldSubject: string): string | null => {
  if (decision.subject === goldSubject) return null;
  if (decision.needClarification) return 'incorrect_clarification_or_abstention';
  if (decision.isInterdisciplinary) return 'interdisciplinary_misroute';
  if (decision.llmCalled) return 'semantic_router_misroute';
  return 'rule_router_misroute';
};

const BENCHMARK_VARIANTS = [
  'rule', 'llm', 'hybrid',
  'hybrid_no_history', 'hybrid_no_previous_subject',
  'hybrid_strict', 'hybrid_lenient',
] as const;
type RouterBenchmarkVariant = typeof BENCHMARK_VARIANTS[number];

const resolveBenchmarkVariant = (variant: RouterBenchmarkVariant, custom?: Partial<RoutingThresholds>) => {
  const strict = { ruleConfidence: 0.9, ruleMargin: 0.35, llmConfidence: 0.8 };
  const lenient = { ruleConfidence: 0.65, ruleMargin: 0.1, llmConfidence: 0.55 };
  return {
    mode: (variant.startsWith('hybrid_') ? 'hybrid' : variant) as RoutingMode,
    useHistory: variant !== 'hybrid_no_history',
    usePreviousSubject: variant !== 'hybrid_no_previous_subject',
    thresholds: variant === 'hybrid_strict' ? strict : variant === 'hybrid_lenient' ? lenient : custom,
  };
};

const decisionSignature = (decision: any): string => [
  normalizedLabel(decision.subject),
  String(decision.intent || 'unknown'),
  decision.needClarification ? 'clarify' : 'answer',
  String(decision.strategy || 'unknown'),
].join('|');

const mostFrequent = <T>(values: T[], key: (value: T) => string): { value: T; ratio: number; counts: Record<string, number> } => {
  const counts: Record<string, number> = {};
  for (const value of values) counts[key(value)] = (counts[key(value)] || 0) + 1;
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const value = values.find(item => key(item) === winner[0]) as T;
  return { value, ratio: winner[1] / values.length, counts };
};

const getRouterTokenUsage = (decision: any): TokenUsage | null => {
  const usage = decision.llmResult?.tokenUsage || (decision.llmCalled ? decision.tokenUsage : null);
  if (!usage) return null;
  return {
    inputTokens: Number(usage.inputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
    totalTokens: Number(usage.totalTokens || 0),
    accounting: usage.accounting,
  };
};

export const decideRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const question = String(req.body.question || req.body.text_input || '').trim();
    if (!question) return void res.status(400).json({ error: 'question is required' });
    const decision = await decideHybridRoute({
      ownerId,
      question,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      mode: (req.body.mode || 'hybrid') as RoutingMode,
      sessionId: req.body.session_id,
      modelMap: req.body.subject_model_map,
    });
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const evaluateRouter = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const cases = Array.isArray(req.body.cases) ? req.body.cases : [];
    if (!cases.length || cases.length > 1000) return void res.status(400).json({ error: 'cases must contain 1..1000 items' });
    const requestedModes = (Array.isArray(req.body.modes) ? req.body.modes : ['rule', 'llm', 'hybrid'])
      .map((value: unknown) => String(value)) as RouterBenchmarkVariant[];
    const invalidModes = requestedModes.filter(mode => !(BENCHMARK_VARIANTS as readonly string[]).includes(mode));
    if (invalidModes.length) return void res.status(400).json({ error: `Unsupported benchmark modes: ${invalidModes.join(', ')}` });
    const modes = [...new Set(requestedModes)];
    const repetitions = Math.min(Math.max(Number(req.body.repetitions) || 1, 1), 5);
    const generatedAt = new Date().toISOString();
    const inputHash = crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex');
    const testDistribution = cases.reduce((acc: Record<string, number>, item: any) => {
      const subject = normalizedLabel(item.gold_subject || item.subject);
      acc[subject] = (acc[subject] || 0) + 1;
      return acc;
    }, {});
    const results: any = {};
    for (const variant of modes) {
      const variantConfig = resolveBenchmarkVariant(variant, req.body.thresholds || undefined);
      let subjectCorrect = 0, intentCorrect = 0, clarificationCorrect = 0, exact = 0, llmCalls = 0, latency = 0;
      let intentLabelCount = 0, clarificationLabelCount = 0, exactLabelCount = 0;
      let stabilityTotal = 0, measuredUsageRuns = 0;
      const tokenTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      const items = [];
      const goldSubjects: string[] = [];
      const predictedSubjects: string[] = [];
      const errorBreakdown: Record<string, number> = {};
      for (const testCase of cases) {
        const goldSubject = normalizedLabel(testCase.gold_subject || testCase.subject);
        const decisions = [];
        for (let run = 0; run < repetitions; run += 1) {
          const current = await decideHybridRoute({
            ownerId,
            question: String(testCase.question || ''),
            history: variantConfig.useHistory ? (testCase.history || []) : [],
            previousSubject: variantConfig.usePreviousSubject && typeof testCase.previous_subject === 'string'
              ? testCase.previous_subject
              : undefined,
            mode: variantConfig.mode,
            modelMap: req.body.subject_model_map || {},
            persistLog: false,
            thresholds: variantConfig.thresholds,
          });
          decisions.push(current);
          llmCalls += Number(current.llmCalled);
          latency += current.latencyMs;
          const usage = getRouterTokenUsage(current);
          if (usage) {
            measuredUsageRuns += 1;
            tokenTotals.inputTokens += usage.inputTokens;
            tokenTotals.outputTokens += usage.outputTokens;
            tokenTotals.totalTokens += usage.totalTokens;
          }
        }
        const stable = mostFrequent(decisions, decisionSignature);
        const decision = stable.value;
        stabilityTotal += stable.ratio;
        const predictedSubject = normalizedLabel(decision.subject);
        const s = predictedSubject === goldSubject;
        const hasIntentLabel = typeof testCase.gold_intent === 'string' && testCase.gold_intent.trim().length > 0;
        const hasClarificationLabel = typeof testCase.gold_need_clarification === 'boolean';
        const i = hasIntentLabel ? decision.intent === testCase.gold_intent : null;
        const c = hasClarificationLabel ? decision.needClarification === testCase.gold_need_clarification : null;
        subjectCorrect += Number(s);
        if (i !== null) { intentCorrect += Number(i); intentLabelCount += 1; }
        if (c !== null) { clarificationCorrect += Number(c); clarificationLabelCount += 1; }
        if (i !== null && c !== null) { exact += Number(s && i && c); exactLabelCount += 1; }
        goldSubjects.push(goldSubject);
        predictedSubjects.push(predictedSubject);
        const errorType = classifyRoutingError(decision, goldSubject);
        if (errorType) errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
        items.push({
          id: testCase.id,
          gold_subject: goldSubject,
          predicted_subject: predictedSubject,
          error_type: errorType,
          decision,
          correct: { subject: s, intent: i, clarification: c },
          repeated_runs: repetitions,
          routing_stability: repetitions > 1 ? stable.ratio : null,
          decision_signature_counts: stable.counts,
        });
      }
      const n = cases.length;
      const totalRuns = n * repetitions;
      const classification = buildClassificationMetrics(goldSubjects, predictedSubjects);
      results[variant] = {
        total: n,
        repetitions,
        primary_subject_accuracy: subjectCorrect / n,
        subject_labels: classification.labels,
        subject_metrics: classification.per_class,
        macro_f1: classification.macro_f1,
        confusion_matrix: classification.confusion_matrix,
        routing_error_breakdown: errorBreakdown,
        intent_accuracy: intentLabelCount ? intentCorrect / intentLabelCount : null,
        need_clarification_accuracy: clarificationLabelCount ? clarificationCorrect / clarificationLabelCount : null,
        exact_match_accuracy: exactLabelCount ? exact / exactLabelCount : null,
        labeled_intent_cases: intentLabelCount,
        labeled_clarification_cases: clarificationLabelCount,
        avg_router_latency_ms: latency / totalRuns,
        llm_call_rate: llmCalls / totalRuns,
        routing_stability: repetitions > 1 ? stabilityTotal / n : null,
        router_token_usage: {
          ...tokenTotals,
          measured_run_coverage: measuredUsageRuns / totalRuns,
          avg_total_tokens_per_run: measuredUsageRuns ? tokenTotals.totalTokens / measuredUsageRuns : null,
          accounting: measuredUsageRuns ? 'provider_reported' : 'not_available',
        },
        items,
      };
    }
    res.json({
      generatedAt,
      evaluation_manifest: {
        case_count: cases.length,
        modes,
        repetitions,
        input_sha256: inputHash,
        subject_distribution: testDistribution,
        default_thresholds: DEFAULT_ROUTING_THRESHOLDS,
        requested_thresholds: req.body.thresholds || null,
        ablation_thresholds: {
          hybrid_strict: resolveBenchmarkVariant('hybrid_strict').thresholds,
          hybrid_lenient: resolveBenchmarkVariant('hybrid_lenient').thresholds,
        },
      },
      results,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getRouterMetrics = async (req: Request, res: Response): Promise<void> => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
  const logs = await RoutingDecisionLog.find({ ownerId }).sort({ createdAt: -1 }).limit(500).lean();
  const n = Math.max(1, logs.length);
  res.json({
    total: logs.length,
    llm_call_rate: logs.filter(item => item.llmCalled).length / n,
    clarification_rate: logs.filter(item => item.needClarification).length / n,
    avg_latency_ms: logs.reduce((sum, item) => sum + item.latencyMs, 0) / n,
    strategy_counts: logs.reduce((acc: Record<string, number>, item) => (acc[item.strategy] = (acc[item.strategy] || 0) + 1, acc), {}),
    recent: logs.slice(0, 50),
  });
};

const END_TO_END_CONDITIONS = ['pooled', 'oracle', 'hybrid'] as const;
type EndToEndCondition = typeof END_TO_END_CONDITIONS[number];

const tokenizeForStability = (value: string): Set<string> => new Set(
  value.toLocaleLowerCase('vi').split(/[^\p{L}\p{N}]+/u).filter(Boolean),
);

const jaccard = (left: string, right: string): number => {
  const a = tokenizeForStability(left);
  const b = tokenizeForStability(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
};

const averagePairwiseResponseStability = (runs: any[]): number | null => {
  if (runs.length < 2) return null;
  const responses = runs.map(run => run.replay_turns
    .filter((message: any) => message.role === 'assistant')
    .map((message: any) => message.content)
    .join(' '));
  let sum = 0, pairs = 0;
  for (let i = 0; i < responses.length; i += 1) {
    for (let j = i + 1; j < responses.length; j += 1) {
      sum += jaccard(responses[i], responses[j]);
      pairs += 1;
    }
  }
  return pairs ? sum / pairs : null;
};

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const coefficientOfVariation = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
};

/**
 * RP5 comparative experiment.  The same conversation set is replayed under
 * pooled, oracle and hybrid conditions, producing judge-ready conversations
 * plus routing/generation telemetry and model provenance.
 */
export const runEndToEndRouterEval = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const cases = Array.isArray(req.body.cases) ? req.body.cases : [];
    if (!cases.length || cases.length > 30) return void res.status(400).json({ error: 'cases must contain 1..30 conversations' });

    const requestedConditions = (Array.isArray(req.body.conditions) ? req.body.conditions : END_TO_END_CONDITIONS)
      .map((value: unknown) => String(value)) as EndToEndCondition[];
    const invalidConditions = requestedConditions.filter(value => !(END_TO_END_CONDITIONS as readonly string[]).includes(value));
    if (invalidConditions.length) return void res.status(400).json({ error: `Unsupported conditions: ${invalidConditions.join(', ')}` });
    const conditions = [...new Set(requestedConditions)];
    const repetitions = Math.min(Math.max(Number(req.body.repetitions) || 1, 1), 3);
    const modelMap: Record<string, string> = req.body.subject_model_map || {};
    const pooledModelId = String(req.body.pooled_model_id || modelMap.GENERAL || modelMap.DEFAULT || '').trim();
    if (conditions.includes('pooled') && !pooledModelId) {
      return void res.status(400).json({ error: 'pooled_model_id (or GENERAL/DEFAULT in subject_model_map) is required for pooled evaluation' });
    }

    if (conditions.includes('oracle')) {
      const requiredSubjects = new Set<string>();
      for (const testCase of cases) {
        const turnLabels = Array.isArray(testCase.turn_gold_subjects) ? testCase.turn_gold_subjects : [];
        if (turnLabels.length) turnLabels.forEach((value: unknown) => requiredSubjects.add(normalizedLabel(value)));
        else requiredSubjects.add(normalizedLabel(testCase.gold_subject || testCase.subject));
      }
      const missing = [...requiredSubjects].filter(subject => subject === 'UNKNOWN' || !modelMap[subject]);
      if (missing.length) return void res.status(400).json({ error: `Oracle evaluation requires an explicit model for: ${missing.join(', ')}` });
    }

    const requestedTemperature = Number(req.body.temperature);
    const temperature = Number.isFinite(requestedTemperature) ? Math.min(Math.max(requestedTemperature, 0), 1) : 0.2;
    const generation = {
      max_new_tokens: Math.min(Math.max(Number(req.body.max_new_tokens) || 192, 32), 512),
      temperature,
      top_p: 0.9,
      top_k: 40,
      repetition_penalty: 1.1,
      do_sample: typeof req.body.do_sample === 'boolean' ? req.body.do_sample : temperature > 0,
    };
    const inputHash = crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex');
    const modelMapHash = crypto.createHash('sha256').update(JSON.stringify(modelMap)).digest('hex');

    // The GPU service exposes two slots. Initialize the scheduler from the
    // service so repeated campaigns do not forget models that are already warm.
    const slotByModel = new Map<string, number>();
    const modelBySlot = await readGpuSlotModels();
    for (const [slotId, modelId] of modelBySlot.entries()) slotByModel.set(modelId, slotId);
    const initialSlotSnapshot = Object.fromEntries([...modelBySlot.entries()].map(([slot, model]) => [String(slot), model]));
    const loadedModels = new Set<string>(modelBySlot.values());
    const slotLastUsed = new Map<number, number>([...modelBySlot.keys()].map(slot => [slot, 0]));
    let accessCounter = 0;
    type SlotAcquisition = {
      slotId: number;
      cacheHit: boolean;
      previousModel: string | null;
      loadAction: 'cache_hit' | 'cold_load' | 'switch_load';
      modelSwitchLatencyMs: number;
      evicted: boolean;
    };
    const acquireSlot = async (modelId: string): Promise<SlotAcquisition> => {
      accessCounter += 1;
      const existing = slotByModel.get(modelId);
      if (existing) {
        slotLastUsed.set(existing, accessCounter);
        return {
          slotId: existing, cacheHit: true, previousModel: modelId,
          loadAction: 'cache_hit', modelSwitchLatencyMs: 0, evicted: false,
        };
      }
      let slotId = [1, 2].find(value => !modelBySlot.has(value));
      if (!slotId) {
        slotId = [1, 2].sort((left, right) => (slotLastUsed.get(left) || 0) - (slotLastUsed.get(right) || 0))[0];
      }
      const previousModel = modelBySlot.get(slotId) || null;
      if (previousModel) slotByModel.delete(previousModel);
      const loaded = await loadIntoSlot(modelId, slotId);
      modelBySlot.set(slotId, modelId);
      slotByModel.set(modelId, slotId);
      slotLastUsed.set(slotId, accessCounter);
      loadedModels.add(modelId);
      const cacheHit = loaded.cacheHit;
      const effectivePrevious = previousModel || (cacheHit ? modelId : null);
      return {
        slotId,
        cacheHit,
        previousModel: effectivePrevious,
        loadAction: cacheHit ? 'cache_hit' : previousModel ? 'switch_load' : 'cold_load',
        modelSwitchLatencyMs: loaded.latencyMs,
        evicted: Boolean(previousModel && previousModel !== modelId),
      };
    };

    const modelProvenance: Record<string, any> = {};
    const captureModelProvenance = async (modelId: string, subject: string): Promise<void> => {
      if (modelProvenance[modelId]) return;
      const version = await ModelVersion.findOne({ ownerId, hfRepoId: modelId, status: ModelVersionStatus.USE })
        .sort({ updatedAt: -1 })
        .lean();
      modelProvenance[modelId] = version ? {
        model_id: modelId,
        version: version.version,
        subject: version.subject || subject,
        training_history_id: version.trainingHistoryId ? String(version.trainingHistoryId) : null,
        dataset: version.datasetInfo || null,
        train_config: version.configSnapshot || null,
        train_loss: version.metrics?.loss ?? null,
        model_eval_overall: version.metrics?.overallScore ?? null,
      } : { model_id: modelId, subject, registry_snapshot_found: false };
    };

    const conditionReports: Record<string, any> = {};
    const allJudgeReadyCases: any[] = [];
    for (const condition of conditions) {
      const conversations: any[] = [];
      const counters = {
        turns: 0, routerLatencyMs: 0, generationLatencyMs: 0, clarifications: 0,
        modelSwitchLatencyMs: 0, ttftMs: 0, decodeLatencyMs: 0, endToEndLatencyMs: 0,
        measuredTtft: 0, cacheHits: 0, coldLoads: 0, switchLoads: 0, evictions: 0,
        llmCalls: 0, generationCalls: 0, measuredGenerationUsage: 0, measuredRouterUsage: 0,
        generationInputTokens: 0, generationOutputTokens: 0, generationTotalTokens: 0,
        routerInputTokens: 0, routerOutputTokens: 0, routerTotalTokens: 0,
      };
      const endToEndLatencySamples: number[] = [];

      for (const [caseIndex, testCase] of cases.entries()) {
        const turns = Array.isArray(testCase.turns) && testCase.turns.length
          ? testCase.turns.map((value: unknown) => String(value).trim()).filter(Boolean)
          : [String(testCase.question || '').trim()].filter(Boolean);
        if (!turns.length) throw new Error(`Case ${testCase.id || caseIndex} has no student turns`);
        const conversationId = String(testCase.id || `router-${caseIndex + 1}`);
        const repeatedRuns: any[] = [];

        for (let repetition = 1; repetition <= repetitions; repetition += 1) {
          const replay: any[] = [];
          const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
          const routeTrace: any[] = [];
          let runGenerationLatencyMs = 0, runRouterLatencyMs = 0, runModelSwitchLatencyMs = 0;
          let runEndToEndLatencyMs = 0, runTokens = 0;

          for (const [turnIndex, studentText] of turns.entries()) {
            const turnStartedAt = Date.now();
            let subject: string;
            let selectedModel: string | undefined;
            let strategy: string;
            let routerLatencyMs = 0;
            let clarification = false;
            let routerTokenUsage: TokenUsage | null = null;

            if (condition === 'pooled') {
              subject = 'POOLED';
              selectedModel = pooledModelId;
              strategy = 'pooled_direct';
            } else if (condition === 'oracle') {
              subject = normalizedLabel(testCase.turn_gold_subjects?.[turnIndex] || testCase.gold_subject || testCase.subject);
              selectedModel = modelMap[subject];
              strategy = 'oracle';
            } else {
              const decision = await decideHybridRoute({
                ownerId,
                question: studentText,
                history,
                previousSubject: routeTrace.length ? routeTrace[routeTrace.length - 1].subject : undefined,
                mode: 'hybrid',
                modelMap,
                persistLog: false,
                thresholds: req.body.thresholds || undefined,
              });
              subject = normalizedLabel(decision.subject);
              selectedModel = decision.selectedModel;
              strategy = decision.strategy;
              routerLatencyMs = decision.latencyMs;
              clarification = decision.needClarification || !selectedModel;
              routerTokenUsage = getRouterTokenUsage(decision);
              counters.llmCalls += Number(decision.llmCalled);
            }

            counters.turns += 1;
            counters.routerLatencyMs += routerLatencyMs;
            runRouterLatencyMs += routerLatencyMs;
            if (routerTokenUsage) {
              counters.measuredRouterUsage += 1;
              counters.routerInputTokens += routerTokenUsage.inputTokens;
              counters.routerOutputTokens += routerTokenUsage.outputTokens;
              counters.routerTotalTokens += routerTokenUsage.totalTokens;
            }

            let assistantText: string;
            let generationLatencyMs = 0;
            let modelSwitchLatencyMs = 0;
            let ttftMs: number | null = null;
            let decodeLatencyMs: number | null = null;
            let cacheHit: boolean | null = null;
            let loadAction: SlotAcquisition['loadAction'] | null = null;
            let previousModel: string | null = null;
            let evicted = false;
            let slotId: number | null = null;
            let generationTokenUsage: TokenUsage | null = null;
            let inferenceId: string | null = null;
            if (clarification || !selectedModel) {
              counters.clarifications += 1;
              assistantText = 'Mình chưa đủ thông tin để chọn môn học phù hợp. Em hãy nói rõ môn học hoặc cung cấp thêm dữ kiện nhé.';
            } else {
              await captureModelProvenance(selectedModel, subject);
              const acquisition = await acquireSlot(selectedModel);
              slotId = acquisition.slotId;
              modelSwitchLatencyMs = acquisition.modelSwitchLatencyMs;
              cacheHit = acquisition.cacheHit;
              loadAction = acquisition.loadAction;
              previousModel = acquisition.previousModel;
              evicted = acquisition.evicted;
              const generated = await inferOnGpu({
                modelId: selectedModel,
                slotId: acquisition.slotId,
                text: studentText,
                history,
                systemPrompt: testCase.system_prompt,
                generation,
              });
              assistantText = generated.text;
              generationLatencyMs = generated.latencyMs;
              ttftMs = generated.ttftMs;
              decodeLatencyMs = generated.decodeLatencyMs;
              generationTokenUsage = generated.tokenUsage;
              inferenceId = generated.inferenceId;
              counters.generationCalls += 1;
              counters.generationLatencyMs += generationLatencyMs;
              counters.modelSwitchLatencyMs += modelSwitchLatencyMs;
              counters.cacheHits += Number(cacheHit);
              counters.coldLoads += Number(loadAction === 'cold_load');
              counters.switchLoads += Number(loadAction === 'switch_load');
              counters.evictions += Number(evicted);
              if (ttftMs !== null) {
                counters.ttftMs += ttftMs;
                counters.measuredTtft += 1;
              }
              if (decodeLatencyMs !== null) counters.decodeLatencyMs += decodeLatencyMs;
              runGenerationLatencyMs += generationLatencyMs;
              runModelSwitchLatencyMs += modelSwitchLatencyMs;
              if (generationTokenUsage) {
                counters.measuredGenerationUsage += 1;
                counters.generationInputTokens += generationTokenUsage.inputTokens;
                counters.generationOutputTokens += generationTokenUsage.outputTokens;
                counters.generationTotalTokens += generationTokenUsage.totalTokens;
                runTokens += generationTokenUsage.totalTokens;
              }
            }

            const endToEndLatencyMs = Date.now() - turnStartedAt;
            counters.endToEndLatencyMs += endToEndLatencyMs;
            runEndToEndLatencyMs += endToEndLatencyMs;
            endToEndLatencySamples.push(endToEndLatencyMs);

            replay.push(
              { role: 'user', content: studentText },
              {
                role: 'assistant', content: assistantText, eval_condition: condition,
                selected_model: selectedModel || null, route_strategy: strategy,
                router_latency_ms: routerLatencyMs, generation_latency_ms: generationLatencyMs,
                model_switch_latency_ms: modelSwitchLatencyMs, ttft_ms: ttftMs,
                decode_latency_ms: decodeLatencyMs, end_to_end_latency_ms: endToEndLatencyMs,
                gpu_slot_id: slotId, model_cache_hit: cacheHit, model_load_action: loadAction,
                previous_model: previousModel, model_evicted: evicted,
                router_token_usage: routerTokenUsage, generation_token_usage: generationTokenUsage,
                inference_id: inferenceId,
              },
            );
            history.push({ role: 'user', content: studentText }, { role: 'assistant', content: assistantText });
            routeTrace.push({
              turn: turnIndex + 1, subject, selected_model: selectedModel || null, strategy,
              need_clarification: clarification, router_latency_ms: routerLatencyMs,
              generation_latency_ms: generationLatencyMs, model_switch_latency_ms: modelSwitchLatencyMs,
              ttft_ms: ttftMs, decode_latency_ms: decodeLatencyMs, end_to_end_latency_ms: endToEndLatencyMs,
              gpu_slot_id: slotId, model_cache_hit: cacheHit, model_load_action: loadAction,
              previous_model: previousModel, model_evicted: evicted, router_token_usage: routerTokenUsage,
              generation_token_usage: generationTokenUsage, inference_id: inferenceId,
            });
          }

          const run = {
            repetition,
            replay_turns: replay,
            route_trace: routeTrace,
            total_router_latency_ms: runRouterLatencyMs,
            total_model_switch_latency_ms: runModelSwitchLatencyMs,
            total_generation_latency_ms: runGenerationLatencyMs,
            total_end_to_end_latency_ms: runEndToEndLatencyMs,
            total_generation_tokens: runTokens,
          };
          repeatedRuns.push(run);
          const judgeCase = {
            conversation_id: conversationId,
            repetition,
            eval_condition: condition,
            gold_subject: testCase.gold_subject || testCase.subject || null,
            system_prompt: testCase.system_prompt || null,
            messages: replay.map(({ role, content }: any) => ({ role, content })),
          };
          allJudgeReadyCases.push(judgeCase);
        }

        const routeSignatures = repeatedRuns.map(run => run.route_trace
          .map((turn: any) => `${turn.subject}|${turn.selected_model}|${turn.strategy}`)
          .join('>'));
        const routeStability = mostFrequent(routeSignatures, value => value).ratio;
        conversations.push({
          conversation_id: conversationId,
          gold_subject: testCase.gold_subject || testCase.subject || null,
          repetitions: repeatedRuns,
          routing_stability: repetitions > 1 ? routeStability : null,
          response_stability_jaccard: averagePairwiseResponseStability(repeatedRuns),
          // Compatibility fields for existing one-run replay consumers.
          replay_turns: repeatedRuns[0].replay_turns,
          route_trace: repeatedRuns[0].route_trace,
        });
      }

      const stabilityValues = conversations.map(value => value.routing_stability).filter((value: any) => value !== null);
      const responseStabilityValues = conversations.map(value => value.response_stability_jaccard).filter((value: any) => value !== null);
      conditionReports[condition] = {
        eval_condition: condition,
        summary: {
          conversations: conversations.length,
          repetitions,
          total_turns: counters.turns,
          clarification_rate: counters.turns ? counters.clarifications / counters.turns : 0,
          llm_call_rate: counters.turns ? counters.llmCalls / counters.turns : 0,
          avg_router_latency_ms: counters.turns ? counters.routerLatencyMs / counters.turns : 0,
          avg_model_switch_latency_ms: counters.generationCalls ? counters.modelSwitchLatencyMs / counters.generationCalls : 0,
          avg_generation_latency_ms: counters.generationCalls ? counters.generationLatencyMs / counters.generationCalls : 0,
          avg_ttft_ms: counters.measuredTtft ? counters.ttftMs / counters.measuredTtft : null,
          avg_decode_latency_ms: counters.measuredTtft ? counters.decodeLatencyMs / counters.measuredTtft : null,
          avg_end_to_end_latency_ms: counters.turns ? counters.endToEndLatencyMs / counters.turns : 0,
          median_end_to_end_latency_ms: percentile(endToEndLatencySamples, 0.5),
          p95_end_to_end_latency_ms: percentile(endToEndLatencySamples, 0.95),
          end_to_end_latency_cv: coefficientOfVariation(endToEndLatencySamples),
          model_cache: {
            cache_hits: counters.cacheHits,
            cache_hit_rate: counters.generationCalls ? counters.cacheHits / counters.generationCalls : 0,
            cold_loads: counters.coldLoads,
            switch_loads: counters.switchLoads,
            evictions: counters.evictions,
          },
          routing_stability: stabilityValues.length ? stabilityValues.reduce((sum: number, value: number) => sum + value, 0) / stabilityValues.length : null,
          response_stability_jaccard: responseStabilityValues.length ? responseStabilityValues.reduce((sum: number, value: number) => sum + value, 0) / responseStabilityValues.length : null,
          router_token_usage: {
            input_tokens: counters.routerInputTokens,
            output_tokens: counters.routerOutputTokens,
            total_tokens: counters.routerTotalTokens,
            measured_run_coverage: counters.turns ? counters.measuredRouterUsage / counters.turns : 0,
          },
          generation_token_usage: {
            input_tokens: counters.generationInputTokens,
            output_tokens: counters.generationOutputTokens,
            total_tokens: counters.generationTotalTokens,
            measured_call_coverage: counters.generationCalls ? counters.measuredGenerationUsage / counters.generationCalls : 0,
            accounting: counters.measuredGenerationUsage ? 'model_tokenizer' : 'not_available',
          },
        },
        conversations,
      };
    }

    const primarySummary = conditionReports.hybrid?.summary || conditionReports[conditions[0]]?.summary;
    return void res.json({
      status: 'COMPLETED',
      eval_mode: 'rp5_comparative_end_to_end',
      generated_at: new Date().toISOString(),
      evaluation_manifest: {
        conditions,
        repetitions,
        case_count: cases.length,
        input_sha256: inputHash,
        subject_model_map_sha256: modelMapHash,
        pooled_model_id: conditions.includes('pooled') ? pooledModelId : null,
        router_thresholds: req.body.thresholds || DEFAULT_ROUTING_THRESHOLDS,
        gpu_slot_policy: 'two-slot cache-aware LRU replacement',
        gpu_slot_snapshot_at_start: initialSlotSnapshot,
        latency_decomposition: {
          router_latency_ms: 'route decision only',
          model_switch_latency_ms: 'slot acquisition/model load before inference',
          ttft_ms: 'GPU inference request to first non-empty SSE token',
          decode_latency_ms: 'first token to completed SSE response',
          end_to_end_latency_ms: 'turn start to completed response',
        },
        response_stability_metric: 'mean pairwise token-set Jaccard',
        quality_scores_status: 'pending external Model Eval judge',
      },
      generation_config: generation,
      loaded_models: [...loadedModels],
      model_provenance: modelProvenance,
      total_conversations: cases.length,
      total_condition_runs: cases.length * conditions.length * repetitions,
      // Kept for compatibility with the original Hybrid replay card in the UI.
      avg_router_latency_ms: primarySummary?.avg_router_latency_ms || 0,
      avg_model_switch_latency_ms: primarySummary?.avg_model_switch_latency_ms || 0,
      avg_generation_latency_ms: primarySummary?.avg_generation_latency_ms || 0,
      avg_ttft_ms: primarySummary?.avg_ttft_ms ?? null,
      avg_end_to_end_latency_ms: primarySummary?.avg_end_to_end_latency_ms || 0,
      total_turns: primarySummary?.total_turns || 0,
      conditions: conditionReports,
      judge_ready_cases: allJudgeReadyCases,
    });
  } catch (error: any) {
    return void res.status(500).json({ error: error.message || 'End-to-end router evaluation failed' });
  }
};
