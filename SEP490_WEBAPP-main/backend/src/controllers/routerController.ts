import { Request, Response } from 'express';
import { RoutingDecisionLog } from '../models/RoutingDecisionLog';
import { decideHybridRoute } from '../services/routing/routingOrchestrator';
import { RoutingMode } from '../services/routing/routingTypes';
import { getAuthUserId } from '../utils/auth';
import { configService } from '../services/configService';

const fetch = async (url: string, init?: any) => {
  const module = await import('node-fetch');
  return module.default(url, init);
};

const gpuHeaders = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'Bypass-Tunnel-Reminder': 'true',
};

const extractSseText = (body: string): string => body
  .split(/\r?\n/)
  .filter(line => line.startsWith('data: '))
  .map(line => line.slice(6).trim())
  .filter(payload => payload && payload !== '[DONE]')
  .map(payload => {
    try { return String(JSON.parse(payload).text || ''); } catch { return ''; }
  })
  .join('')
  .trim();

const inferOnGpu = async (args: {
  modelId: string;
  slotId: number;
  text: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt?: string;
  generation: Record<string, unknown>;
}): Promise<{ text: string; latencyMs: number }> => {
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
  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try { detail = JSON.parse(raw).error || raw; } catch { /* retain raw */ }
    throw new Error(`GPU inference failed for ${args.modelId}: ${detail}`);
  }
  const text = extractSseText(raw);
  if (!text) throw new Error(`GPU returned an empty response for ${args.modelId}`);
  return { text, latencyMs: Date.now() - started };
};

const loadIntoSlot = async (modelId: string, slotId: number): Promise<void> => {
  const url = configService.getGpuUrl(slotId);
  const response = await fetch(`${url}/api/model/load`, {
    method: 'POST', headers: gpuHeaders,
    body: JSON.stringify({ hf_model_id: modelId, instanceId: slotId }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Cannot load ${modelId} into GPU slot ${slotId}: ${raw}`);
  }
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
    const modes: RoutingMode[] = Array.isArray(req.body.modes) ? req.body.modes : ['rule', 'llm', 'hybrid'];
    const results: any = {};
    for (const mode of modes) {
      let subjectCorrect = 0, intentCorrect = 0, clarificationCorrect = 0, exact = 0, llmCalls = 0, latency = 0;
      let intentLabelCount = 0, clarificationLabelCount = 0, exactLabelCount = 0;
      const items = [];
      for (const testCase of cases) {
        const decision = await decideHybridRoute({
          ownerId,
          question: String(testCase.question || ''),
          history: testCase.history || [],
          mode,
          modelMap: req.body.subject_model_map || {},
          persistLog: false,
        });
        const s = decision.subject === testCase.gold_subject;
        const hasIntentLabel = typeof testCase.gold_intent === 'string' && testCase.gold_intent.trim().length > 0;
        const hasClarificationLabel = typeof testCase.gold_need_clarification === 'boolean';
        const i = hasIntentLabel ? decision.intent === testCase.gold_intent : null;
        const c = hasClarificationLabel ? decision.needClarification === testCase.gold_need_clarification : null;
        subjectCorrect += Number(s);
        if (i !== null) { intentCorrect += Number(i); intentLabelCount += 1; }
        if (c !== null) { clarificationCorrect += Number(c); clarificationLabelCount += 1; }
        if (i !== null && c !== null) { exact += Number(s && i && c); exactLabelCount += 1; }
        llmCalls += Number(decision.llmCalled); latency += decision.latencyMs;
        items.push({ id: testCase.id, gold_subject: testCase.gold_subject, decision, correct: { subject: s, intent: i, clarification: c } });
      }
      const n = cases.length;
      results[mode] = {
        total: n,
        primary_subject_accuracy: subjectCorrect / n,
        intent_accuracy: intentLabelCount ? intentCorrect / intentLabelCount : null,
        need_clarification_accuracy: clarificationLabelCount ? clarificationCorrect / clarificationLabelCount : null,
        exact_match_accuracy: exactLabelCount ? exact / exactLabelCount : null,
        labeled_intent_cases: intentLabelCount,
        labeled_clarification_cases: clarificationLabelCount,
        avg_router_latency_ms: latency / n,
        llm_call_rate: llmCalls / n,
        items,
      };
    }
    res.json({ generatedAt: new Date().toISOString(), results });
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

/**
 * End-to-end D experiment: route every student turn, generate with the routed
 * specialist, and return a portable replay report for the Gemini Judge stage.
 */
export const runEndToEndRouterEval = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const cases = Array.isArray(req.body.cases) ? req.body.cases : [];
    if (!cases.length || cases.length > 30) return void res.status(400).json({ error: 'cases must contain 1..30 conversations' });
    const modelMap = req.body.subject_model_map || {};
    const generation = {
      max_new_tokens: Math.min(Math.max(Number(req.body.max_new_tokens) || 192, 32), 512),
      temperature: Math.min(Math.max(Number(req.body.temperature) || 0.2, 0), 1),
      top_p: 0.9,
      top_k: 40,
      repetition_penalty: 1.1,
      do_sample: true,
    };
    const slotByModel = new Map<string, number>();
    const slotModels: string[] = [];
    const report: any[] = [];
    let totalGenerationLatencyMs = 0;
    let totalRouterLatencyMs = 0;

    for (const [caseIndex, testCase] of cases.entries()) {
      const turns = Array.isArray(testCase.turns) && testCase.turns.length
        ? testCase.turns.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [String(testCase.question || '').trim()].filter(Boolean);
      if (!turns.length) throw new Error(`Case ${testCase.id || caseIndex} has no student turns`);
      const replay: Array<any> = [];
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      const routeTrace: any[] = [];

      for (const studentText of turns) {
        const decision = await decideHybridRoute({
          ownerId, question: studentText, history, mode: 'hybrid', modelMap, persistLog: true,
        });
        totalRouterLatencyMs += decision.latencyMs;
        if (decision.needClarification || !decision.selectedModel) {
          throw new Error(`Case ${testCase.id || caseIndex}: Router needs clarification at turn ${routeTrace.length + 1}`);
        }
        const modelId = decision.selectedModel;
        let slotId = slotByModel.get(modelId);
        if (!slotId) {
          if (slotModels.length >= 2) throw new Error('End-to-end benchmark currently supports at most two routed models per run.');
          slotId = slotModels.length + 1;
          await loadIntoSlot(modelId, slotId);
          slotModels.push(modelId);
          slotByModel.set(modelId, slotId);
        }
        const generated = await inferOnGpu({
          modelId, slotId, text: studentText, history,
          systemPrompt: testCase.system_prompt,
          generation,
        });
        totalGenerationLatencyMs += generated.latencyMs;
        replay.push(
          { role: 'user', content: studentText },
          { role: 'assistant', content: generated.text, selected_model: modelId, route_strategy: decision.strategy, router_latency_ms: decision.latencyMs, generation_latency_ms: generated.latencyMs },
        );
        history.push({ role: 'user', content: studentText }, { role: 'assistant', content: generated.text });
        routeTrace.push({ subject: decision.subject, selected_model: modelId, strategy: decision.strategy, router_latency_ms: decision.latencyMs, generation_latency_ms: generated.latencyMs });
      }
      report.push({
        conversation_id: String(testCase.id || `router-${caseIndex + 1}`),
        gold_subject: testCase.gold_subject || null,
        replay_turns: replay,
        route_trace: routeTrace,
      });
    }

    const totalTurns = report.reduce((sum, item) => sum + item.route_trace.length, 0);
    return void res.json({
      status: 'COMPLETED',
      eval_mode: 'hybrid_router_end_to_end',
      generated_at: new Date().toISOString(),
      generation_config: generation,
      loaded_models: slotModels,
      total_conversations: report.length,
      total_turns: totalTurns,
      avg_router_latency_ms: totalTurns ? totalRouterLatencyMs / totalTurns : 0,
      avg_generation_latency_ms: totalTurns ? totalGenerationLatencyMs / totalTurns : 0,
      conversations: report,
    });
  } catch (error: any) {
    return void res.status(500).json({ error: error.message || 'End-to-end router evaluation failed' });
  }
};
