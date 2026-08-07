import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import FormData from 'form-data';
const fetch = async (url: any, init?: any) => {
  const module = await import('node-fetch');
  return module.default(url, init);
};
import dotenv from 'dotenv';
import { ModelEvaluation, IEvalResult } from '../models/Evaluation';
import { TrainingHistory } from '../models/TrainingHistory';
import { isZipFile, extractForEvaluation, cleanupTempDir, DatasetMetadata } from '../services/zipService';
import { getAuthUserId } from '../utils/auth';
import { configService } from '../services/configService';
import { apiKeyService } from '../services/apiKeyService';
import { RESEARCH_MODEL_CATALOG } from '../config/modelCatalog';
import {
  HUMAN_AUDIT_RUBRIC_VERSION,
  buildHumanAuditSummary,
  computeHumanOutcomes,
  deriveHumanAiConflict,
  validateHumanAuditScores,
} from '../services/humanAuditService';
dotenv.config();

type LargeLlmReferenceJob = {
  jobId: string;
  ownerId: string;
  evalId: string;
  model: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  detail: string;
  result?: Record<string, any>;
  error?: string;
  createdAt: string;
};

const largeLlmReferenceJobs = new Map<string, LargeLlmReferenceJob>();

type Version1SharedReferenceJob = {
  jobId: string;
  ownerId: string;
  evalId: string;
  trainingJobId: string;
  model: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  detail: string;
  result?: Record<string, any>;
  error?: string;
  createdAt: string;
};

const version1SharedReferenceJobs = new Map<string, Version1SharedReferenceJob>();

type PromptTrace = {
  content: string;
  source: 'test_file' | 'zip_metadata' | 'training_history' | 'service_default';
  version: string;
  hash: string;
};

function readEvaluationRecords(filePath: string): any[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsedRecords: any[] = filePath.toLowerCase().endsWith('.jsonl')
    ? raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    : (() => {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    })();
  return parsedRecords.flatMap(record => {
    if (Array.isArray(record?.conversations)) return record.conversations;
    if (Array.isArray(record?.items)) return record.items;
    return [record];
  });
}

function validateLockedTestFile(filePath: string) {
  const records = readEvaluationRecords(filePath);
  const aliases: Record<string, string> = {
    EN: 'ENGLISH', ENG: 'ENGLISH', ENGLISH: 'ENGLISH',
    MATH: 'MATH', MATHEMATICS: 'MATH',
    HIS: 'HISTORY', HIST: 'HISTORY', HISTORY: 'HISTORY',
  };
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  const errors: string[] = [];
  records.forEach((record, index) => {
    const metadata = record?.metadata && typeof record.metadata === 'object' ? record.metadata : {};
    const itemId = String(record?.item_id || record?.itemId || record?.id || metadata.item_id || metadata.id || '').trim();
    const rawSubject = String(record?.subject || record?.course || record?.label || metadata.subject || '').trim().toUpperCase();
    const subject = aliases[rawSubject] || rawSubject;
    if (!itemId) errors.push(`row ${index + 1}: missing explicit item_id`);
    else if (seen.has(itemId)) errors.push(`duplicate item_id: ${itemId}`);
    seen.add(itemId);
    if (!['ENGLISH', 'MATH', 'HISTORY'].includes(subject)) errors.push(`${itemId || index + 1}: invalid subject ${subject || 'missing'}`);
    else counts[subject] = (counts[subject] || 0) + 1;
    const messages = Array.isArray(record?.messages) ? record.messages : [];
    const userCount = messages.filter((message: any) => message?.role === 'user').length;
    if (userCount < 1) errors.push(`${itemId || index + 1}: expected at least one user message, found ${userCount}`);
    if (!String(record?.reference_answer || '').trim() && !(Array.isArray(record?.gold_key_points) && record.gold_key_points.length > 0)) {
      errors.push(`${itemId || index + 1}: missing reference_answer/gold_key_points`);
    }
  });
  const confirmatorySampleSize = Object.keys(counts).length > 0
    && Object.values(counts).every(count => count === 50);
  if (!records.length) errors.push('dataset is empty');
  if (errors.length) throw new Error(errors.slice(0, 12).join('; '));
  return {
    itemCount: records.length,
    subjectCounts: counts,
    expectedItemsPerSubject: 50,
    confirmatorySampleSize,
    fileSha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    contentSha256: crypto.createHash('sha256').update(JSON.stringify(records), 'utf8').digest('hex'),
  };
}

function readEmbeddedSystemPrompt(filePath: string): string {
  const records = readEvaluationRecords(filePath);
  const prompts = new Set<string>();
  for (const record of records) {
    const topLevel = typeof record?.system_prompt === 'string' ? record.system_prompt.trim() : '';
    if (topLevel) prompts.add(topLevel);
    if (Array.isArray(record?.messages)) {
      for (const message of record.messages) {
        if (String(message?.role || '').toLowerCase() !== 'system') continue;
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        if (content) prompts.add(content);
      }
    }
  }
  if (prompts.size > 1) {
    // Row-level prompts are legacy data only when a TrainingHistory prompt is
    // available. Do not reject an otherwise valid locked test just because an
    // older export contains mixed prompts; the AutoTrain prompt is injected
    // uniformly at replay time.
    console.warn('[Backend] Test dataset contains multiple embedded system prompts; ignoring them in favour of the AutoTrain prompt.');
    return '';
  }
  return [...prompts][0] || '';
}

function resolveEvaluationPrompt(
  embeddedPrompt: string,
  zipMetadata: DatasetMetadata | null,
  history: { systemPrompt?: string; systemPromptVersion?: string },
): PromptTrace {
  const zipPrompt = String(zipMetadata?.systemPrompt || '').trim();
  const historyPrompt = String(history.systemPrompt || '').trim();
  const defaultPrompt = 'Bạn là gia sư Socratic cho học sinh THCS/THPT Việt Nam. Đọc kỹ lượt mới nhất. Nếu học sinh sai, không xác nhận là đúng và không đưa ngay đáp án; chỉ hỏi một câu gợi mở ngắn. Nếu học sinh đúng, xác nhận ngắn rồi hỏi bước tiếp theo. Không lặp phản hồi, không bịa dữ kiện, luôn kiểm tra công thức và đơn vị.';
  // The prompt registered with AutoTrain is the canonical experimental
  // condition. Test exports may contain an older per-row prompt; using that
  // prompt at evaluation would turn a Base-vs-Fine-tuned comparison into a
  // different-prompt experiment.
  const content = historyPrompt || zipPrompt || embeddedPrompt || defaultPrompt;
  const source: PromptTrace['source'] = historyPrompt
    ? 'training_history'
    : zipPrompt
      ? 'zip_metadata'
      : embeddedPrompt
        ? 'test_file'
        : 'service_default';
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  const declaredVersion = source === 'training_history'
    ? String(history.systemPromptVersion || '').trim()
    : String(zipMetadata?.systemPromptVersion || '').trim();
  return {
    content,
    source,
    version: declaredVersion || `${source}-${hash.slice(0, 12)}`,
    hash,
  };
}

function getOwnerFilter(req: Request): { ownerId?: string } {
  const ownerId = getAuthUserId(req);
  return ownerId ? { ownerId } : {};
}

// ---------------------------------------------------------------------------
// Helper: lấy GPU status — kiểm tra trước khi dispatch eval
// ---------------------------------------------------------------------------
type GpuStatus = {
  can_create_eval: boolean;
  active_evals: number;
  active_training: boolean;
  max_evals: number;
  vram_free_mb: number;
  vram_total_mb: number;
  vram_used_mb: number;
  gpu_util: number;
  eval_checkpoint_protocol: number;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchGpuStatusOnce(): Promise<GpuStatus | null> {
  const headers = { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' };
  // Older workers expose /api/system/resources while newer workers expose the
  // eval-specific endpoint. Supporting both prevents a harmless route mismatch
  // from being recorded as a failed evaluation.
  for (const endpoint of ['/api/system-eval/resources', '/api/system/resources']) {
    try {
      const resp = await fetch(`${configService.getGpuUrl()}${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(30000), // Increased from 15000 for slow network on localtunnel
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      // console.log('[Backend] GPU status response:', data);

      // Ensure all required fields are present, calculate missing ones
      const result = {
        can_create_eval: data.can_create_eval ?? true,
        active_evals: data.active_evals ?? 0,
        active_training: data.active_training ?? false,
        max_evals: data.max_evals ?? 3,
        vram_free_mb: data.vram_free_mb ?? (data.vram_total_mb - data.vram_used_mb),
        vram_total_mb: data.vram_total_mb,
        vram_used_mb: data.vram_used_mb,
        gpu_util: data.gpu_util ?? 0,
        eval_checkpoint_protocol: Number(data.eval_checkpoint_protocol ?? 0),
      };

      return result;
    } catch (err) {
      console.warn(`[Backend] GPU status check failed at ${endpoint}:`, err);
    }
  }
  return null;
}

async function getGpuStatus(): Promise<GpuStatus | null> {
  // LocalTunnel/Colab can briefly return 502/503 while the worker finishes a
  // model unload. Do not turn one transient response into a permanent FAILED
  // evaluation row.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const status = await fetchGpuStatusOnce();
    if (status) return status;
    if (attempt < 3) await wait(attempt * 1000);
  }
  return null;
}

type GpuActiveEvaluation = { eval_job_id: string; status: string; job_id?: string };

type GpuEvalRecoveryState = {
  state: 'active' | 'resumable' | 'completed' | 'missing' | 'unknown';
  payload?: any;
};

async function getGpuEvalRecoveryState(evalJobId: string): Promise<GpuEvalRecoveryState> {
  try {
    const response = await fetch(
      `${configService.getGpuUrl()}/api/eval/status/${encodeURIComponent(evalJobId)}`,
      {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
        signal: AbortSignal.timeout(7000),
      },
    );
    const text = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 500) }; }

    if (response.status === 404 && payload?.status === 'NOT_FOUND') {
      return { state: 'missing', payload };
    }
    if (!response.ok) return { state: 'unknown', payload };

    const status = String(payload?.status || '').toUpperCase();
    if (['PENDING', 'RUNNING', 'EVALUATING'].includes(status)) return { state: 'active', payload };
    if (status === 'INTERRUPTED' && payload?.resumable === true) return { state: 'resumable', payload };
    if (status === 'COMPLETED') return { state: 'completed', payload };
    return { state: 'unknown', payload };
  } catch {
    return { state: 'unknown' };
  }
}

async function getGpuActiveEvaluations(): Promise<GpuActiveEvaluation[] | null> {
  try {
    const response = await fetch(`${configService.getGpuUrl()}/api/eval/active`, {
      headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null; // Compatibility with workers not deployed yet.
    const payload = await response.json() as any;
    if (!Array.isArray(payload?.jobs)) return null;
    return payload.jobs
      .filter((job: any) => typeof job?.eval_job_id === 'string' && job.eval_job_id)
      .map((job: any) => ({
        eval_job_id: String(job.eval_job_id),
        status: String(job.status || 'UNKNOWN'),
        job_id: job.job_id ? String(job.job_id) : undefined,
      }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: POST multipart/form-data với Content-Length (giống trainController)
// ---------------------------------------------------------------------------
async function fetchWithForm(url: string, form: FormData): Promise<ReturnType<typeof fetch>> {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) {
        reject(new Error(`Could not compute form length: ${err.message}`));
        return;
      }
      resolve(
        fetch(url, {
          method: 'POST',
          body: form,
          headers: {
            ...form.getHeaders(),
            'Content-Length': String(length),
            'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
          },
        })
      );
    });
  });
}

function normalizePerConvResults(perConvResults: unknown): IEvalResult[] {
  if (!Array.isArray(perConvResults)) return [];
  return perConvResults
    .filter((r: any) => r !== null && r !== undefined)
    .map((r: any) => ({
      item_id: r.item_id ? String(r.item_id) : undefined,
      conv_index: Number(r.conv_index ?? 0),
      num_turns: Number(r.num_turns ?? 0),
      avg_latency_ms: Number(r.avg_latency_ms ?? 0),
      subject: String(r.subject ?? 'UNGROUPED'),
      selected_model: r.selected_model ? String(r.selected_model) : undefined,
      route_strategy: r.route_strategy ? String(r.route_strategy) : undefined,
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
      total_tokens: Number(r.total_tokens ?? 0),
      generation_status: r.generation_status ? String(r.generation_status) : undefined,
      failure_type: r.failure_type == null ? null : String(r.failure_type),
      first_attempt_failed: Boolean(r.first_attempt_failed),
      output_limit_reached: Boolean(r.output_limit_reached),
      telemetry: r.telemetry && typeof r.telemetry === 'object' ? r.telemetry : {},
      prompt_trace: r.prompt_trace && typeof r.prompt_trace === 'object' ? r.prompt_trace : {},
      reference_trace: r.reference_trace && typeof r.reference_trace === 'object' ? r.reference_trace : {},
      reference_answer: r.reference_answer ? String(r.reference_answer) : '',
      gold_key_points: Array.isArray(r.gold_key_points) ? r.gold_key_points.map(String) : [],
      judge_status: r.judge_status ? String(r.judge_status) : undefined,
      judge_response_id: r.judge_response_id ? String(r.judge_response_id) : undefined,
      effective_judge_model: r.effective_judge_model ? String(r.effective_judge_model) : undefined,
      judge_error: r.judge_error ? String(r.judge_error) : undefined,
      judge_router_metadata: r.judge_router_metadata ?? null,
      judge_blinded: Boolean(r.judge_blinded),
      judge_randomization_seed: r.judge_randomization_seed == null
        ? undefined : Number(r.judge_randomization_seed),
      replay_turns: Array.isArray(r.replay_turns) ? r.replay_turns : [],
      criteria_scores: r.criteria_scores ?? {},
      criteria_reasons: r.criteria_reasons ?? {},
      group_scores: r.group_scores ?? {},
      non_scoring: r.non_scoring ?? {},
      confidence: r.confidence ?? null,
    }));
}

function normalizeEvalResult(result: any) {
  const normalizedResults = normalizePerConvResults(
    result.perConvResults ?? result.per_conv_results ?? result.results ?? []
  );

  // summary từ GPU đã đúng format — chỉ cần pass through + fallback
  const summary = result.summary && typeof result.summary === 'object'
    ? result.summary
    : {};

  const baseSummary = result.baseSummary && typeof result.baseSummary === 'object'
    ? result.baseSummary : null;

  return {
    totalConversations: Number(result.totalConversations ?? result.totalSamples ?? normalizedResults.length),
    validConversations: Number(result.validConversations ?? normalizedResults.length),
    evalMode: (result.evalMode === 'paired') ? 'paired' : 'single',
    ftModelRepo: result.ftModelRepo ?? undefined,
    baseModelRepo: result.baseModelRepo ?? undefined,
    results: normalizedResults,
    baseResults: normalizePerConvResults(result.basePerConvResults ?? []),
    summary,
    baseSummary,
    delta: result.delta ?? null,
    flags: Array.isArray(result.flags) ? result.flags : [],
    researchStatistics: result.researchStatistics ?? null,
    adaptiveDiagnostic: result.adaptiveDiagnostic ?? null,
    hypothesisDecisions: result.hypothesisDecisions ?? null,
    pairIntegrity: result.pairIntegrity ?? null,
    confirmatoryEligible: Boolean(result.confirmatoryEligible),
    datasetValidation: result.datasetValidation ?? null,
    protocolManifest: result.protocolManifest ?? null,
    environmentManifest: result.environmentManifest ?? null,
    loadMetrics: result.loadMetrics ?? null,
    gpuResult: result,
  };
}

/** A Judge transport/parser failure must never be persisted as a score of 0. */
function getJudgeValidationError(results: IEvalResult[]): string | null {
  const failureMarkers = ['judge_error', 'parse_miss', 'no_api_key', 'judge failed'];
  for (const item of results) {
    if (item.judge_status === 'failed') {
      return `AI Judge failed for item ${item.item_id || item.conv_index}: ${item.judge_error || 'missing score'}`;
    }
    for (const reason of Object.values(item.criteria_reasons || {})) {
      const value = String(reason || '').toLowerCase();
      if (failureMarkers.some(marker => value.includes(marker))) {
        return `AI Judge không chấm hợp lệ (conversation #${item.conv_index}): ${String(reason).slice(0, 240)}`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/model-eval/run/:jobId
// FE upload file đánh giá → BE forward sang GPU service POST /api/eval/start
// GPU nhận file + hf_repo_id → load model → chạy run_auto_evaluation()
// ---------------------------------------------------------------------------
export const runEvaluation = async (req: Request, res: Response) => {
  let zipTempDir: string | null = null;
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;

    // 1. Lấy TrainingHistory để lấy hf_repo_id và model_max_length
    const history = await TrainingHistory.findOne({ jobId, ownerId });
    if (!history) {
      return res.status(404).json({ error: 'Job không tồn tại trong database' });
    }
    if (!['COMPLETED', 'EVALUATING'].includes(history.status)) {
      return res.status(400).json({
        error: `Job phải ở trạng thái COMPLETED để đánh giá (hiện tại: ${history.status})`,
      });
    }
    if (!history.hfRepoId) {
      return res.status(400).json({
        error: 'Job chưa có hfRepoId — model phải đã được push lên HuggingFace Hub',
      });
    }

    // 2. Kiểm tra file eval được upload
    const evalFile = req.file;
    if (!evalFile) {
      return res.status(400).json({ error: 'Thiếu file đánh giá (eval_file)' });
    }
    // Preserve the user-visible source name before a ZIP may replace the
    // multer file fields with its extracted test file.
    const uploadedEvalFileName = evalFile.originalname;

    // ── ZIP Extraction ─────────────────────────────────────────────────────────
    let zipMetadata: DatasetMetadata | null = null;
    if (isZipFile(evalFile.originalname)) {
      try {
        const extracted = extractForEvaluation(evalFile.path);
        zipMetadata = extracted.metadata;
        zipTempDir = extracted.tempDir;

        // Replace multer file properties with extracted dataset
        evalFile.path = extracted.dataFilePath;
        evalFile.originalname = extracted.dataFileName;
        evalFile.size = fs.statSync(extracted.dataFilePath).size;
        evalFile.mimetype = 'application/json';

        console.log('[Backend] ZIP extracted for evaluation:', extracted.dataFileName);
        if (zipMetadata) {
          console.log('[Backend] ZIP metadata found:', JSON.stringify(zipMetadata));
        }
      } catch (zipErr: any) {
        fs.unlink(evalFile.path, () => { });
        return res.status(400).json({ error: zipErr.message || 'Failed to extract ZIP file.' });
      }
    }

    // 3. Tạo eval_job_id
    const eval_job_id = `eval_${uuidv4()}`;
    const baseModelRepo = String(history.baseModel || '').trim();
    const requestedBaseModel = String(req.body.base_model_hf_repo || '').trim();
    if (!baseModelRepo) {
      fs.unlink(evalFile.path, () => { });
      if (zipTempDir) cleanupTempDir(zipTempDir);
      return res.status(400).json({
        error: 'TrainingHistory does not contain the exact precursor Base model required for paired evaluation.',
      });
    }
    if (requestedBaseModel && requestedBaseModel !== baseModelRepo) {
      fs.unlink(evalFile.path, () => { });
      if (zipTempDir) cleanupTempDir(zipTempDir);
      return res.status(400).json({
        error: `Base model mismatch: training job used ${baseModelRepo}, not ${requestedBaseModel}.`,
      });
    }
    console.log(`[Backend] Starting eval ${eval_job_id} for job ${jobId} → model=${history.hfRepoId}`);
    console.log(`[Backend] base_model_hf_repo from req.body: '${req.body.base_model_hf_repo}'`);
    console.log(`[Backend] req.body keys:`, Object.keys(req.body));

    const judgeApiKey = await apiKeyService.getApiKeyForUser(ownerId, 'openrouter');
    if (!judgeApiKey) {
      fs.unlink(evalFile.path, () => { });
      return res.status(400).json({
        error: 'missing_openrouter_key',
        message: 'Hãy cấu hình OpenRouter API key trước khi chạy Gemini Judge.',
      });
    }

    let lockedDatasetTrace: ReturnType<typeof validateLockedTestFile>;
    try {
      lockedDatasetTrace = validateLockedTestFile(evalFile.path);
      const declaredTestHash = String(zipMetadata?.datasetHashes?.test_sha256 || '').trim();
      if (declaredTestHash && declaredTestHash !== lockedDatasetTrace.contentSha256) {
        throw new Error(`test_dataset hash mismatch: metadata=${declaredTestHash}, actual=${lockedDatasetTrace.contentSha256}`);
      }
    } catch (datasetErr: any) {
      fs.unlink(evalFile.path, () => { });
      if (zipTempDir) cleanupTempDir(zipTempDir);
      return res.status(400).json({
        error: 'invalid_locked_test_dataset',
        message: datasetErr.message || 'Dataset does not satisfy the locked RP5 protocol.',
      });
    }

    let embeddedSystemPrompt = '';
    try {
      embeddedSystemPrompt = readEmbeddedSystemPrompt(evalFile.path);
    } catch (promptErr: any) {
      fs.unlink(evalFile.path, () => { });
      if (zipTempDir) cleanupTempDir(zipTempDir);
      return res.status(400).json({
        error: 'invalid_test_system_prompt',
        message: promptErr.message || 'Could not read system prompt from test dataset.',
      });
    }
    const promptTrace = resolveEvaluationPrompt(embeddedSystemPrompt, zipMetadata, history);
    const evalSystemPrompt = promptTrace.content;
    if (embeddedSystemPrompt && history.systemPrompt && embeddedSystemPrompt.trim() !== history.systemPrompt.trim()) {
      console.warn('[Backend] Test-file system prompt differs from TrainingHistory; the AutoTrain prompt is authoritative and the embedded prompt was ignored.');
    }
    console.log(
      `[Backend] Eval system_prompt source=${promptTrace.source} version=${promptTrace.version} ` +
      `hash=${promptTrace.hash.slice(0, 12)} chars=${evalSystemPrompt.length}`
    );
    console.log('[Backend] Locked RP5 generation: greedy, max_new_tokens=512, warmup=1, bootstrap=10000');

    const existingRecoverableEval = await ModelEvaluation.findOne({
      ownerId,
      jobId,
      datasetFileHash: lockedDatasetTrace.fileSha256,
      status: { $in: ['PENDING', 'RUNNING', 'EVALUATING', 'INTERRUPTED', 'DISCONNECTED'] },
    }).sort({ startedAt: -1 }).select('modelEvalId status').lean();
    if (existingRecoverableEval) {
      const recovery = await getGpuEvalRecoveryState(existingRecoverableEval.modelEvalId);
      if (recovery.state === 'missing') {
        await ModelEvaluation.updateOne(
          { modelEvalId: existingRecoverableEval.modelEvalId, ownerId },
          {
            $set: {
              status: 'FAILED',
              error: 'GPU worker has neither this evaluation job nor a durable checkpoint.',
              failureStage: 'gpu_checkpoint_missing',
              completedAt: new Date(),
            },
          },
        );
      } else {
        fs.unlink(evalFile.path, () => { });
        if (zipTempDir) cleanupTempDir(zipTempDir);
        const resumable = recovery.state === 'resumable';
        const active = recovery.state === 'active';
        return res.status(active || resumable ? 409 : 503).json({
          error: 'eval_already_active_or_resumable',
          message: resumable
            ? 'Evaluation này có checkpoint đã được GPU xác nhận. Hãy bấm Resume để tránh tốn token.'
            : active
              ? 'Evaluation cùng dataset đang chạy. Hãy kết nối lại tiến trình thay vì tạo job trùng.'
              : 'Chưa xác minh được job cũ trên GPU. Không tạo job trùng cho đến khi kết nối GPU ổn định.',
          eval_job_id: existingRecoverableEval.modelEvalId,
          status: existingRecoverableEval.status,
          resumable,
        });
      }
    }

    const config = {
      eval_job_id,
      job_id: jobId,
      hf_repo_id: history.hfRepoId,
      hf_token: history.hfToken || '',
      model_max_length: history.parameters?.modelMaxLength || 2048,
      judge_model: RESEARCH_MODEL_CATALOG.judge,
      judge_provider: 'openrouter',
      judge_api_key: judgeApiKey,
      base_model_hf_repo: baseModelRepo,
      system_prompt: evalSystemPrompt,
      system_prompt_source: promptTrace.source,
      system_prompt_version: promptTrace.version,
      system_prompt_hash: promptTrace.hash,
      protocol_mode: 'locked_single_turn',
      prompt_variant: 'P1',
      subject_override: '',
      max_new_tokens: 512,
      warmup_runs: 1,
      bootstrap_resamples: 10000,
      bootstrap_seed: 42,
      temperature: 0,
      top_p: 1,
      repetition_penalty: 1,
      eval_file_name: zipMetadata?.datasetVersionName || uploadedEvalFileName,
      dataset_file_sha256: lockedDatasetTrace.fileSha256,
      subject_counts: lockedDatasetTrace.subjectCounts,
    };

    // 4. Tạo Evaluation record trong MongoDB với status PENDING
    await ModelEvaluation.create({
      ownerId,
      modelEvalId: eval_job_id,
      jobId,
      status: 'PENDING',
      totalConversations: 0,
      validConversations: 0,
      results: [],
      evalMode: config.base_model_hf_repo ? 'paired' : 'single',
      ftModelRepo: history.hfRepoId,
      baseModelRepo: config.base_model_hf_repo || undefined,
      judgeModel: config.judge_model,
      // Dataset & Prompt traceability from ZIP metadata
      systemPrompt: evalSystemPrompt,
      systemPromptVersion: promptTrace.version,
      systemPromptSource: promptTrace.source,
      systemPromptHash: promptTrace.hash,
      datasetVersionId: zipMetadata?.datasetVersionId || '',
      datasetVersionName: zipMetadata?.datasetVersionName || uploadedEvalFileName,
      datasetMetadata: zipMetadata || undefined,
      datasetFileHash: lockedDatasetTrace.fileSha256,
      datasetValidation: lockedDatasetTrace,
      summary: {
        knowledge: 0,
        socratic: 0,
        exploratory_overall: null,
        overall: null,
        group_a: null, group_b: null, group_c: null, group_d: null,
        criteria: {},
        non_scoring: {},
        max_possible: 5,
      },
      startedAt: new Date(),
    });

    const form = new FormData();
    form.append('config', JSON.stringify(config));
    form.append('eval_file', fs.createReadStream(evalFile.path), {
      filename: evalFile.originalname,
      contentType: evalFile.mimetype || 'application/octet-stream',
      knownLength: evalFile.size,
    });

    // 6. Kiểm tra GPU trước khi dispatch
    const gpuStatus = await getGpuStatus();
    if (!gpuStatus) {
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        { status: 'FAILED', error: 'GPU service không phản hồi trước khi dispatch evaluation.', failureStage: 'gpu_preflight', completedAt: new Date() },
      );
      return res.status(503).json({ error: 'gpu_offline', message: 'GPU service không phản hồi' });
    }
    if (gpuStatus.eval_checkpoint_protocol < 1) {
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        {
          status: 'FAILED',
          error: 'GPU worker đang chạy app.py cũ, chưa hỗ trợ Eval checkpoint protocol v1.',
          failureStage: 'gpu_checkpoint_capability',
          completedAt: new Date(),
        },
      );
      return res.status(503).json({
        error: 'gpu_checkpoint_not_deployed',
        message: 'GPU đang chạy app.py cũ chưa có checkpoint. Hãy restart worker bằng bản standalone mới trước khi chạy Eval để tránh mất token.',
      });
    }
    if (!gpuStatus.can_create_eval) {
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        { status: 'FAILED', error: `GPU đang bận (${gpuStatus.active_evals}/${gpuStatus.max_evals} slots).`, failureStage: 'gpu_capacity', completedAt: new Date() },
      );
      return res.status(503).json({
        error: 'worker_busy',
        message: `GPU đang bận (${gpuStatus.active_evals}/${gpuStatus.max_evals} slots, VRAM free: ${Math.round(gpuStatus.vram_free_mb / 1024)}GB)`,
        active_evals: gpuStatus.active_evals,
        max_evals: gpuStatus.max_evals,
        vram_free_mb: gpuStatus.vram_free_mb,
      });
    }

    // 7. Forward sang GPU service
    console.log(`[Backend] Forwarding eval to GPU: /api/eval/start (slots: ${gpuStatus.active_evals}/${gpuStatus.max_evals})`);
    const gpuResponse = await fetchWithForm(`${configService.getGpuUrl()}/api/eval/start`, form);

    if (gpuResponse.status === 409) {
      // Race condition: GPU vừa nhận job khác trong khoảng thời gian ngắn
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        { status: 'FAILED', error: 'GPU vừa nhận job khác nên không còn slot trống.', failureStage: 'gpu_dispatch', completedAt: new Date() },
      );
      return res.status(503).json({ error: 'worker_busy', message: 'GPU vừa nhận job khác, vui lòng thử lại' });
    }

    const responseText = await gpuResponse.text();
    console.log(`[Backend] GPU eval response (${gpuResponse.status}): ${responseText.slice(0, 300)}`);

    let gpuData: any;
    try {
      gpuData = JSON.parse(responseText);
    } catch {
      // Dọn file tạm nếu GPU lỗi
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        {
          status: 'FAILED',
          error: `GPU service trả về dữ liệu không phải JSON: ${responseText.slice(0, 300)}`,
          failureStage: 'gpu_dispatch_response',
          completedAt: new Date(),
        },
      );
      return res.status(502).json({
        error: 'GPU service trả về non-JSON',
        raw: responseText.slice(0, 500),
      });
    }

    if (!gpuResponse.ok) {
      fs.unlink(evalFile.path, () => { });
      await ModelEvaluation.updateOne(
        { modelEvalId: eval_job_id, ownerId },
        {
          status: 'FAILED',
          error: String(gpuData?.message || gpuData?.error || `GPU trả về HTTP ${gpuResponse.status}`).slice(0, 1000),
          failureStage: 'gpu_dispatch',
          gpuResult: gpuData,
          completedAt: new Date(),
        },
      );
      return res.status(gpuResponse.status).json(gpuData);
    }

    await ModelEvaluation.updateOne(
      { modelEvalId: eval_job_id, ownerId },
      { status: 'RUNNING' }
    );

    // 8. Xóa file tạm (GPU đã lưu bản của nó rồi)
    fs.unlink(evalFile.path, (err) => {
      if (err) console.warn(`[Backend] Could not delete eval temp file: ${evalFile.path}`);
    });

    // Clean up ZIP temp dir if used
    if (zipTempDir) cleanupTempDir(zipTempDir);

    return res.status(201).json({
      eval_job_id,
      message: 'Eval job started',
    });
  } catch (err: any) {
    console.error('[Backend] runEvaluation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to start evaluation' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/model-eval/stream/:evalJobId
// SSE — poll GPU /api/eval/status/:evalJobId mỗi 2s
// Khi COMPLETED → gọi GPU lấy result → lưu MongoDB → update TrainingHistory
// ---------------------------------------------------------------------------
export const streamEvalStatus = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { evalJobId } = req.params;

  if (!evalJobId || evalJobId === 'null' || evalJobId === 'undefined') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Invalid evalJobId' })}\n\n`);
    res.end();
    return;
  }

  const scopedEval = await ModelEvaluation.findOne({ modelEvalId: evalJobId, ownerId }).select('_id').lean();
  if (!scopedEval) {
    res.status(404).json({ error: 'Evaluation not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({
    status: 'RUNNING',
    progress: 0,
    stage_label: 'Ket noi backend',
    stage_detail: 'Da ket noi SSE, dang hoi GPU worker...',
  })}\n\n`);

  // A tunnel/worker outage returns 503 repeatedly. Do not keep a phantom
  // evaluation alive and flood the browser log forever.
  let consecutiveGpuStatusErrors = 0;
  const intervalId = setInterval(async () => {
    try {
      const response = await fetch(`${configService.getGpuUrl()}/api/eval/status/${evalJobId}`, {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
      });
      const text = await response.text();
      if (!response.ok) {
        consecutiveGpuStatusErrors += 1;
        // A localtunnel endpoint can briefly route to a stale worker while the
        // active GPU job continues on the correct worker. A single 404 is not
        // proof that the GPU job was lost; require repeated failures.
        let errorPayload: any = null;
        try { errorPayload = JSON.parse(text); } catch { errorPayload = null; }
        const missingGpuJob = response.status === 404 && errorPayload?.status === 'NOT_FOUND';
        const terminalGpuError = consecutiveGpuStatusErrors >= 3;
        const terminalStatus = missingGpuJob ? 'LOST' : 'DISCONNECTED';
        const statusPayload = {
          status: terminalGpuError ? terminalStatus : 'GPU_STATUS_ERROR',
          progress: 0,
          stage_label: terminalGpuError
            ? (missingGpuJob ? 'GPU không còn Eval Job' : 'Mất kết nối GPU')
            : 'Kết nối GPU tạm thời lỗi',
          stage_detail: terminalGpuError
            ? (missingGpuJob
              ? 'GPU xác nhận không có job và không có checkpoint có thể Resume.'
              : 'Chưa thể xác nhận job hoặc checkpoint vì GPU không phản hồi. Không tự chạy lại evaluation.')
            : `GPU status endpoint trả về HTTP ${response.status} (${consecutiveGpuStatusErrors}/3). Đang thử lại; không chạy lại evaluation lúc này.`,
          error: text?.slice(0, 300),
          resumable: false,
        };
        res.write(`data: ${JSON.stringify(statusPayload)}\n\n`);
        if (terminalGpuError) {
          clearInterval(intervalId);
          await ModelEvaluation.updateOne(
            { modelEvalId: evalJobId, ownerId },
            {
              status: missingGpuJob ? 'FAILED' : 'DISCONNECTED',
              error: statusPayload.error || statusPayload.stage_detail,
              failureStage: missingGpuJob ? 'gpu_job_lost' : 'gpu_status_unreachable',
              gpuResult: statusPayload,
              ...(missingGpuJob ? { completedAt: new Date() } : {}),
            },
          );
          res.write(`event: end\ndata: ${JSON.stringify(statusPayload)}\n\n`);
          res.end();
        }
        return;
      }
      consecutiveGpuStatusErrors = 0;

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return; // bỏ qua tick này nếu GPU trả HTML/error
      }

      if (['PENDING', 'RUNNING', 'EVALUATING'].includes(data.status)) {
        await ModelEvaluation.updateOne(
          { modelEvalId: evalJobId, ownerId },
          { status: data.status }
        );
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return;
      }

      if (data.status === 'INTERRUPTED') {
        clearInterval(intervalId);
        const resumable = data.resumable === true;
        await ModelEvaluation.updateOne(
          { modelEvalId: evalJobId, ownerId },
          {
            status: resumable ? 'INTERRUPTED' : 'DISCONNECTED',
            error: String(data.error || data.stage_detail || 'Evaluation interrupted.').slice(0, 1000),
            failureStage: resumable ? 'gpu_interrupted_checkpointed' : 'gpu_interrupted_unverified',
          },
        );
        const safePayload = resumable
          ? { ...data, resumable: true }
          : { ...data, status: 'DISCONNECTED', resumable: false };
        res.write(`data: ${JSON.stringify(safePayload)}\n\n`);
        res.write(`event: end\ndata: ${JSON.stringify(safePayload)}\n\n`);
        res.end();
        return;
      }

      if (['COMPLETED', 'FAILED'].includes(data.status)) {
        clearInterval(intervalId);

        if (data.status === 'COMPLETED') {
          // Lấy kết quả từ GPU rồi lưu MongoDB
          const persisted = await _fetchAndSaveResult(evalJobId, ownerId);
          if (!persisted.saved) {
            data = {
              ...data,
              status: 'FAILED',
              error: persisted.error || 'Kết quả AI Judge không hợp lệ',
              stage_label: 'Kết quả không hợp lệ',
              stage_detail: 'AI Judge gặp lỗi nên run này không được dùng để chấm điểm hoặc so sánh.',
            };
          }
        } else {
          // FAILED — cập nhật DB
          await ModelEvaluation.updateOne(
            { modelEvalId: evalJobId, ownerId },
            {
              status: 'FAILED',
              error: String(data.error || data.message || data.stage_detail || 'GPU worker báo evaluation thất bại.').slice(0, 1000),
              failureStage: data.stage_label || data.stage || 'gpu_runtime',
              gpuResult: data,
              completedAt: new Date(),
            },
          );
          // Tìm jobId để update TrainingHistory
          const evalDoc = await ModelEvaluation.findOne({ modelEvalId: evalJobId, ownerId });
          if (evalDoc) {
            await TrainingHistory.updateOne(
              { jobId: evalDoc.jobId, ownerId },
              { status: 'COMPLETED' } // rollback về COMPLETED để có thể thử lại
            );
          }
        }

        // Only notify the browser after MongoDB has the final result. Otherwise
        // the detail screen can open against a half-saved eval record.
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.write(`event: end\ndata: ${JSON.stringify(data)}\n\n`);
        res.end();
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      clearInterval(intervalId);
      res.end();
    }
  }, 2000);

  req.on('close', () => clearInterval(intervalId));
};

export const getActiveEvaluation = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const activeStatuses = ['PENDING', 'RUNNING', 'EVALUATING'];
  const gpuEvaluations = await getGpuActiveEvaluations();
  let evaluation: any = null;

  if (gpuEvaluations) {
    const gpuEvalIds = gpuEvaluations.map(job => job.eval_job_id);
    evaluation = gpuEvalIds.length
      ? await ModelEvaluation.findOne({ ownerId, modelEvalId: { $in: gpuEvalIds } })
        .sort({ startedAt: -1 })
        .select('modelEvalId jobId status startedAt')
        .lean()
      : null;

    // Reconcile stale DB rows individually. Absence from /active does not prove
    // that a checkpoint exists, so never manufacture a resumable state here.
    const staleEvaluations = await ModelEvaluation.find({
      ownerId,
      status: { $in: activeStatuses },
      modelEvalId: { $nin: gpuEvalIds },
      startedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) },
    }).select('modelEvalId').lean();
    for (const stale of staleEvaluations) {
      const recovery = await getGpuEvalRecoveryState(stale.modelEvalId);
      if (recovery.state === 'missing') {
        await ModelEvaluation.updateOne(
          { modelEvalId: stale.modelEvalId, ownerId },
          {
            $set: {
              status: 'FAILED',
              error: 'GPU worker has neither this evaluation job nor a durable checkpoint.',
              failureStage: 'gpu_job_lost',
              completedAt: new Date(),
            }
          },
        );
      } else if (recovery.state === 'resumable') {
        await ModelEvaluation.updateOne(
          { modelEvalId: stale.modelEvalId, ownerId },
          { $set: { status: 'INTERRUPTED', failureStage: 'gpu_interrupted_checkpointed' } },
        );
      } else if (recovery.state === 'unknown') {
        await ModelEvaluation.updateOne(
          { modelEvalId: stale.modelEvalId, ownerId },
          { $set: { status: 'DISCONNECTED', failureStage: 'gpu_status_unreachable' } },
        );
      }
    }
  } else {
    // Backward-compatible path until the updated worker image is deployed.
    evaluation = await ModelEvaluation.findOne({
      ownerId,
      status: { $in: activeStatuses },
    })
      .sort({ startedAt: -1 })
      .select('modelEvalId jobId status startedAt')
      .lean();
  }

  if (evaluation) return res.json(evaluation);

  const interruptedEvaluation = await ModelEvaluation.findOne({
    ownerId,
    status: { $in: ['INTERRUPTED', 'DISCONNECTED'] },
  })
    .sort({ updatedAt: -1 })
    .select('modelEvalId jobId status startedAt')
    .lean();
  if (interruptedEvaluation) {
    const recovery = await getGpuEvalRecoveryState(interruptedEvaluation.modelEvalId);
    if (recovery.state === 'resumable') {
      return res.json({ ...interruptedEvaluation, status: 'INTERRUPTED', resumable: true });
    }
    if (recovery.state === 'active') {
      return res.json({ ...interruptedEvaluation, status: recovery.payload?.status || 'RUNNING', resumable: false });
    }
    if (recovery.state === 'missing') {
      await ModelEvaluation.updateOne(
        { modelEvalId: interruptedEvaluation.modelEvalId, ownerId },
        {
          $set: {
            status: 'FAILED',
            error: 'GPU worker has neither this evaluation job nor a durable checkpoint.',
            failureStage: 'gpu_checkpoint_missing',
            completedAt: new Date(),
          }
        },
      );
    } else {
      return res.json({
        ...interruptedEvaluation,
        status: 'DISCONNECTED',
        resumable: false,
        reason: 'gpu_unreachable',
        message: 'Chưa thể xác nhận job hoặc checkpoint vì GPU không phản hồi.',
      });
    }
  }

  const gpuStatus = await getGpuStatus();
  if (!gpuStatus) {
    return res.json({
      modelEvalId: null,
      reason: 'gpu_offline',
      message: 'GPU worker không phản hồi.',
    });
  }

  if (gpuStatus.active_training) {
    return res.json({
      modelEvalId: null,
      reason: 'training_active',
      message: 'GPU đang chạy AutoTrain, không có Eval Job của tài khoản hiện tại.',
      gpuStatus,
    });
  }

  if (gpuStatus.active_evals > 0) {
    const gpuEvalIds = gpuEvaluations?.map(job => job.eval_job_id) || [];
    const trackedActiveEvaluations = gpuEvalIds.length
      ? await ModelEvaluation.countDocuments({ modelEvalId: { $in: gpuEvalIds } })
      : await ModelEvaluation.countDocuments({ status: { $in: activeStatuses } });
    return res.json({
      modelEvalId: null,
      reason: trackedActiveEvaluations > 0 ? 'another_account' : 'untracked_gpu_job',
      message: trackedActiveEvaluations > 0
        ? 'GPU đang chạy Eval Job của tài khoản khác.'
        : 'GPU đang chạy một Eval Job không còn bản ghi tương ứng trong backend.',
      gpuStatus,
    });
  }

  if (!gpuStatus.can_create_eval) {
    return res.json({
      modelEvalId: null,
      reason: 'insufficient_vram',
      message: 'GPU không có Eval Job đang chạy nhưng VRAM trống dưới ngưỡng an toàn.',
      gpuStatus,
    });
  }

  return res.json({ modelEvalId: null, reason: 'idle', message: 'Không có Eval Job đang chạy.' });
};

export const resumeEvaluation = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const { evalJobId } = req.params;
  const evaluation = await ModelEvaluation.findOne({ modelEvalId: evalJobId, ownerId }).lean();
  if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });
  if (evaluation.status === 'COMPLETED') {
    return res.status(409).json({ error: 'Evaluation is already completed.' });
  }

  const [judgeApiKey, history] = await Promise.all([
    apiKeyService.getApiKeyForUser(ownerId, 'openrouter'),
    TrainingHistory.findOne({ jobId: evaluation.jobId, ownerId }).select('hfToken').lean(),
  ]);
  if (!judgeApiKey) {
    return res.status(400).json({ error: 'missing_openrouter_key', message: 'OpenRouter API key is required to resume Judge.' });
  }

  const gpuResponse = await fetch(`${configService.getGpuUrl()}/api/eval/resume/${encodeURIComponent(evalJobId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'Bypass-Tunnel-Reminder': 'true',
    },
    body: JSON.stringify({
      judge_api_key: judgeApiKey,
      hf_token: String((history as any)?.hfToken || ''),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const responseText = await gpuResponse.text();
  let payload: any;
  try { payload = JSON.parse(responseText); } catch { payload = { error: responseText.slice(0, 500) }; }

  if (!gpuResponse.ok) {
    if (gpuResponse.status === 404 && payload?.error === 'checkpoint_not_found') {
      await ModelEvaluation.updateOne(
        { modelEvalId: evalJobId, ownerId },
        {
          $set: {
            status: 'FAILED',
            error: 'GPU worker has no durable checkpoint for this evaluation.',
            failureStage: 'gpu_checkpoint_missing',
            completedAt: new Date(),
          },
        },
      );
    }
    const status = gpuResponse.status === 404 ? 409 : gpuResponse.status;
    return res.status(status).json({
      ...payload,
      message: payload?.error === 'checkpoint_not_found'
        ? 'Eval cũ chưa có checkpoint nên không thể cứu; hãy chạy lại sau khi deploy bản checkpoint mới.'
        : payload?.message,
    });
  }

  await ModelEvaluation.updateOne(
    { modelEvalId: evalJobId, ownerId },
    {
      $set: { status: 'RUNNING', startedAt: new Date() },
      $unset: { completedAt: 1, error: 1, failureStage: 1 },
    },
  );
  return res.status(202).json(payload);
};

// ---------------------------------------------------------------------------
// Helper nội bộ: lấy kết quả từ GPU → lưu Evaluation MongoDB.
// Evaluation completion must never change the user's official/pinned model.
// ---------------------------------------------------------------------------
async function _fetchAndSaveResult(evalJobId: string, ownerId: string): Promise<{ saved: boolean; error?: string }> {
  try {
    const resp = await fetch(`${configService.getGpuUrl()}/api/eval/result/${evalJobId}`, {
      headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
    });

    if (!resp.ok) {
      console.error(`[Backend] GPU /api/eval/result trả về ${resp.status}`);
      return { saved: false, error: `GPU result HTTP ${resp.status}` };
    }

    const result = (await resp.json()) as Record<string, any>;

    if (!result || result.status === 'PENDING') {
      console.warn(`[Backend] Eval result chưa sẵn sàng cho ${evalJobId}`);
      return { saved: false, error: 'GPU result chưa sẵn sàng' };
    }

    const normalized = normalizeEvalResult(result);
    const judgeValidationError = getJudgeValidationError([...normalized.results, ...normalized.baseResults]);
    if (judgeValidationError) {
      await ModelEvaluation.updateOne(
        { modelEvalId: evalJobId, ownerId },
        {
          status: 'FAILED',
          error: judgeValidationError,
          failureStage: 'judge_validation',
          gpuResult: { ...result, validation_error: judgeValidationError },
          completedAt: new Date(),
        }
      );
      const failedEval = await ModelEvaluation.findOne({ modelEvalId: evalJobId, ownerId }).lean();
      if (failedEval) {
        await TrainingHistory.updateOne({ jobId: failedEval.jobId, ownerId }, { status: 'COMPLETED' });
      }
      console.error(`[Backend] Eval ${evalJobId} rejected: ${judgeValidationError}`);
      return { saved: false, error: judgeValidationError };
    }

    // Lưu vào Evaluation collection
    await ModelEvaluation.findOneAndUpdate(
      { modelEvalId: evalJobId, ownerId },
      {
        status: 'COMPLETED',
        evalMode: normalized.evalMode,
        ftModelRepo: normalized.ftModelRepo,
        baseModelRepo: normalized.baseModelRepo,
        totalConversations: normalized.totalConversations,
        validConversations: normalized.validConversations,
        results: normalized.results,
        baseResults: normalized.baseResults,
        summary: normalized.summary,
        baseSummary: normalized.baseSummary,
        delta: normalized.delta,
        gpuResult: normalized.gpuResult,
        judgeModel: result.judgeModel ?? undefined,
        startedAt: result.startedAt ? new Date(result.startedAt) : new Date(),
        completedAt: result.completedAt ? new Date(result.completedAt) : new Date(),
        flags: normalized.flags,
        researchStatistics: normalized.researchStatistics,
        adaptiveDiagnostic: normalized.adaptiveDiagnostic,
        hypothesisDecisions: normalized.hypothesisDecisions,
        pairIntegrity: normalized.pairIntegrity,
        confirmatoryEligible: normalized.confirmatoryEligible,
        datasetValidation: normalized.datasetValidation,
        protocolManifest: normalized.protocolManifest,
        environmentManifest: normalized.environmentManifest,
        loadMetrics: normalized.loadMetrics,
      },
      { upsert: true }
    );

    // Keep training complete, but leave pinnedEvalId untouched. Pinning is an
    // explicit user action through POST /model-eval/pin/:evalId only.
    await TrainingHistory.updateOne(
      { jobId: result.jobId, ownerId },
      { $set: { status: 'COMPLETED' } },
    );

    console.log(`[Backend] ✅ Eval result saved for ${evalJobId}, job ${result.jobId} → COMPLETED (not pinned)`);
    // MongoDB is now authoritative; release potentially large replay/Judge
    // checkpoint files from the worker volume without affecting the result.
    void fetch(`${configService.getGpuUrl()}/api/eval/checkpoint/${encodeURIComponent(evalJobId)}`, {
      method: 'DELETE',
      headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
    }).catch(error => console.warn(`[Backend] Could not clean eval checkpoint ${evalJobId}:`, error));
    return { saved: true };
  } catch (err: any) {
    console.error(`[Backend] _fetchAndSaveResult error for ${evalJobId}:`, err.message);
    return { saved: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// GET /api/model-eval/gpu-status
// FE gọi để hiển thị GPU status widget và quyết định có cho tạo eval mới không
// ---------------------------------------------------------------------------
export const getGpuStatusEndpoint = async (_req: Request, res: Response) => {
  const status = await getGpuStatus();
  if (!status) {
    return res.status(503).json({ error: 'gpu_offline', message: 'GPU service không phản hồi' });
  }
  return res.json(status);
};

// ---------------------------------------------------------------------------
// POST /api/model-eval/save
// Dùng cho manual trigger từ fetchAndSaveEvalResult (trainController)
// Body: kết quả eval trực tiếp từ GPU (format cũ, modelEvalId = "eval_<jobId>")
// ---------------------------------------------------------------------------
export const saveEvalResult = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = req.body;
    if (!result || !result.modelEvalId || !result.jobId) {
      return res.status(400).json({ error: 'Missing modelEvalId or jobId in body' });
    }

    const normalized = normalizeEvalResult(result);
    const judgeValidationError = getJudgeValidationError([...normalized.results, ...normalized.baseResults]);
    if (judgeValidationError) {
      return res.status(422).json({ error: judgeValidationError, status: 'FAILED' });
    }

    await ModelEvaluation.findOneAndUpdate(
      { modelEvalId: result.modelEvalId, ownerId },
      {
        ownerId,
        modelEvalId: result.modelEvalId,
        jobId: result.jobId,
        status: result.status || 'COMPLETED',
        evalMode: normalized.evalMode,
        ftModelRepo: normalized.ftModelRepo,
        baseModelRepo: normalized.baseModelRepo,
        totalConversations: normalized.totalConversations,
        validConversations: normalized.validConversations,
        results: normalized.results,
        baseResults: normalized.baseResults,
        summary: normalized.summary,
        baseSummary: normalized.baseSummary,
        delta: normalized.delta,
        gpuResult: normalized.gpuResult,
        researchStatistics: normalized.researchStatistics,
        adaptiveDiagnostic: normalized.adaptiveDiagnostic,
        hypothesisDecisions: normalized.hypothesisDecisions,
        pairIntegrity: normalized.pairIntegrity,
        confirmatoryEligible: normalized.confirmatoryEligible,
        datasetValidation: normalized.datasetValidation,
        protocolManifest: normalized.protocolManifest,
        environmentManifest: normalized.environmentManifest,
        loadMetrics: normalized.loadMetrics,
        startedAt: result.startedAt ? new Date(result.startedAt) : new Date(),
        completedAt: result.completedAt ? new Date(result.completedAt) : new Date(),
      },
      { upsert: true, returnDocument: 'after' }
    );

    await TrainingHistory.updateOne(
      { jobId: result.jobId, ownerId },
      { $set: { status: 'COMPLETED' } },
    );

    console.log(`[Backend] ✅ Eval saved via /api/model-eval/save for job ${result.jobId}`);
    return res.status(200).json({ message: 'Eval saved successfully' });
  } catch (err: any) {
    console.error('[Backend] saveEvalResult error:', err);
    return res.status(500).json({ error: err.message || 'Failed to save eval result' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/model-eval/:evalId
// Trả Evaluation record cho ModelEvalResultScreen
// ---------------------------------------------------------------------------
export const exportEvaluationArtifact = async (req: Request, res: Response) => {
  try {
    const ownerFilter = getOwnerFilter(req);
    const evaluation = await ModelEvaluation.findOne({
      modelEvalId: req.params.evalId,
      ...ownerFilter,
    }).lean();
    if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });

    const artifact: Record<string, any> = { ...evaluation };
    artifact.humanAudit = buildHumanAuditSummary((evaluation.results || []) as any[]);
    delete artifact.ownerId;
    delete artifact.__v;
    const safeId = String(evaluation.modelEvalId).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeId}_rp5_artifact.json"`);
    return res.status(200).send(JSON.stringify(artifact, null, 2));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to export evaluation artifact' });
  }
};

export const getEvaluation = async (req: Request, res: Response) => {
  try {
    const ownerFilter = getOwnerFilter(req);

    const { evalId } = req.params;
    const doc = await ModelEvaluation.findOne({ modelEvalId: evalId, ...ownerFilter }).lean();
    if (!doc) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }
    // Kiểm tra xem eval này có đang được pin không
    const history = await TrainingHistory.findOne({ jobId: doc.jobId, ...ownerFilter })
      .select('pinnedEvalId projectName')
      .lean();
    return res.json({
      ...doc,
      isPinned: history?.pinnedEvalId === evalId,
      projectName: history?.projectName ?? '',
      humanAudit: buildHumanAuditSummary((doc.results || []) as any[]),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get evaluation' });
  }
};

// ---------------------------------------------------------------------------
// PUT /api/model-eval/:evalId/extended-references
// Persist extended comparison references (Large-LLM & Version 1 shared FT)
// into MongoDB so they are accessible from any machine/browser.
// ---------------------------------------------------------------------------
export const saveExtendedReferences = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
    const { evalId } = req.params;
    const references = req.body?.references;
    if (!Array.isArray(references)) {
      return res.status(400).json({ error: 'references must be an array' });
    }
    // Sanitize: only keep known fields to avoid storing arbitrary data
    const sanitized = references.slice(0, 5).map((ref: any) => ({
      comparisonRole: String(ref.comparisonRole || 'large_llm'),
      model: String(ref.model || ''),
      judgeModel: String(ref.judgeModel || ''),
      total: Number(ref.total || 0),
      valid: Number(ref.valid || 0),
      knowledge: ref.knowledge != null ? Number(ref.knowledge) : null,
      socratic: ref.socratic != null ? Number(ref.socratic) : null,
      a1ViolationRate: ref.a1ViolationRate != null ? Number(ref.a1ViolationRate) : null,
      e2eMedianMs: ref.e2eMedianMs != null ? Number(ref.e2eMedianMs) : null,
      throughputMean: ref.throughputMean != null ? Number(ref.throughputMean) : null,
      outputLimitRate: ref.outputLimitRate != null ? Number(ref.outputLimitRate) : null,
      costPer100Usd: ref.costPer100Usd != null ? Number(ref.costPer100Usd) : null,
      outputTokensMean: ref.outputTokensMean != null ? Number(ref.outputTokensMean) : null,
      totalInputTokens: ref.totalInputTokens != null ? Number(ref.totalInputTokens) : null,
      totalOutputTokens: ref.totalOutputTokens != null ? Number(ref.totalOutputTokens) : null,
      totalTokens: ref.totalTokens != null ? Number(ref.totalTokens) : null,
      runValidity: String(ref.runValidity || 'unknown'),
      protocolMatch: Boolean(ref.protocolMatch),
      protocolNotes: Array.isArray(ref.protocolNotes) ? ref.protocolNotes.map(String) : [],
    }));
    const result = await ModelEvaluation.updateOne(
      { modelEvalId: evalId, ownerId },
      { $set: { extendedReferences: sanitized } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }
    return res.json({ saved: sanitized.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save extended references' });
  }
};

// ---------------------------------------------------------------------------
// Large-LLM contextual references. These runs intentionally remain separate
// from the paired Base-vs-FT causal comparison.
// ---------------------------------------------------------------------------
export const getLargeLlmReferenceModels = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) throw new Error(`OpenRouter catalog returned HTTP ${response.status}`);
    const payload: any = await response.json();
    const eligibleModels = (Array.isArray(payload?.data) ? payload.data : [])
      .filter((model: any) => {
        const parameters = Array.isArray(model?.supported_parameters) ? model.supported_parameters : [];
        const modality = String(model?.architecture?.modality || '');
        return (parameters.includes('max_tokens') || parameters.includes('max_completion_tokens'))
          && (!modality || modality.includes('text'));
      })
      .map((model: any) => ({
        id: String(model.id),
        name: String(model.name || model.id),
        contextLength: Number(model.context_length || 0),
        created: Number(model.created || 0),
        promptPrice: model.pricing?.prompt ?? null,
        completionPrice: model.pricing?.completion ?? null,
      }));

    // The OpenRouter catalog contains more than 1,000 eligible models.  The
    // UI keeps a bounded list for responsiveness, but the relevant reference
    // model must not disappear merely because it is older than newer catalog
    // entries.  Keep it at the front when it remains available in the catalog.
    const pinnedReferenceIds = new Set([
      'qwen/qwen-2.5-72b-instruct',
    ]);
    const pinnedModels = eligibleModels
      .filter((model: any) => pinnedReferenceIds.has(model.id))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    const recentModels = eligibleModels
      .filter((model: any) => !pinnedReferenceIds.has(model.id))
      .sort((a: any, b: any) => b.created - a.created || a.name.localeCompare(b.name))
      .slice(0, 1000);
    const models = [...pinnedModels, ...recentModels];
    return res.json({ models });
  } catch (err: any) {
    return res.status(502).json({ error: err.message || 'Could not load OpenRouter model catalog' });
  }
};

export const runLargeLlmReference = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  const evalId = String(req.params.evalId || '');
  const model = String(req.body?.model || '').trim();
  const uploaded = req.file;
  if (!uploaded) return res.status(400).json({ error: 'locked_test_file_required' });
  if (!/^[A-Za-z0-9._:/-]{3,200}$/.test(model)) {
    fs.unlink(uploaded.path, () => { });
    return res.status(400).json({ error: 'invalid_model_id' });
  }

  let extractedTempDir = '';
  let datasetPath = uploaded.path;
  let datasetName = uploaded.originalname;
  try {
    const evaluation = await ModelEvaluation.findOne({ ownerId, modelEvalId: evalId, status: 'COMPLETED' }).lean();
    if (!evaluation) throw Object.assign(new Error('Evaluation not found or not completed'), { statusCode: 404 });
    const openRouterKey = await apiKeyService.getApiKeyForUser(ownerId, 'openrouter');
    if (!openRouterKey) throw Object.assign(new Error('OpenRouter API key is not configured'), { statusCode: 422 });
    const catalogResponse = await fetch('https://openrouter.ai/api/v1/models');
    const catalogPayload: any = catalogResponse.ok ? await catalogResponse.json() : { data: [] };
    const exactModel = (Array.isArray(catalogPayload?.data) ? catalogPayload.data : [])
      .find((item: any) => String(item?.id || '') === model);
    if (!exactModel) {
      throw Object.assign(
        new Error('Model không tồn tại trên OpenRouter. Hãy chọn model bằng thẻ trong danh sách, không nhập tên tự do.'),
        { statusCode: 422 },
      );
    }

    if (isZipFile(uploaded.originalname)) {
      const extracted = extractForEvaluation(uploaded.path);
      datasetPath = extracted.dataFilePath;
      datasetName = extracted.dataFileName;
      extractedTempDir = extracted.tempDir;
    }
    const validation = validateLockedTestFile(datasetPath);
    const expectedHash = String((evaluation.datasetValidation as any)?.contentSha256 || '');
    if (expectedHash && validation.contentSha256 !== expectedHash) {
      throw Object.assign(new Error('Tập test không trùng với lần Base–FT đang xem.'), { statusCode: 422 });
    }

    const scriptCandidates = [
      path.resolve(process.cwd(), 'python-runner', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '..', '..', 'python-runner', 'run_large_llm_reference.py'),
      path.resolve(process.cwd(), 'scripts', 'run_large_llm_reference.py'),
      path.resolve(process.cwd(), '..', 'scripts', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '..', 'scripts', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '..', '..', 'scripts', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '..', '..', '..', 'scripts', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'run_large_llm_reference.py'),
      path.resolve(__dirname, '../../../../scripts/run_large_llm_reference.py'),
    ];
    const scriptPath = scriptCandidates.find(candidate => fs.existsSync(candidate));
    if (!scriptPath) throw new Error('Large-LLM runner script was not found');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sep490-large-llm-'));
    const outputPath = path.join(tempDir, 'result.json');
    const promptPath = path.join(tempDir, 'system_prompt.txt');
    const evaluationPrompt = String(evaluation.systemPrompt || '').trim();
    if (evaluationPrompt) fs.writeFileSync(promptPath, evaluationPrompt, 'utf8');
    const referenceJobId = `large-llm-${uuidv4()}`;
    const job: LargeLlmReferenceJob = {
      jobId: referenceJobId,
      ownerId,
      evalId,
      model,
      status: 'PENDING',
      progress: 0,
      detail: `Đã khóa ${validation.itemCount} câu từ ${datasetName}`,
      createdAt: new Date().toISOString(),
    };
    largeLlmReferenceJobs.set(referenceJobId, job);

    const args = [
      '-u',
      scriptPath,
      '--dataset', datasetPath,
      '--model', model,
      '--output', outputPath,
      '--judge-model', String(evaluation.judgeModel || RESEARCH_MODEL_CATALOG.judge),
      '--prompt-variant', 'P1',
      '--prompt-version', String(evaluation.systemPromptVersion || evaluation.protocolManifest?.prompt_version || 'RP4-locked-v1'),
      '--max-new-tokens', '512',
      '--seed', '42',
    ];
    if (evaluationPrompt) args.push('--prompt-file', promptPath);
    const python = process.env.RP5_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const child = spawn(python, args, {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, OPENROUTER_API_KEY: openRouterKey },
      windowsHide: true,
    });
    job.status = 'RUNNING';
    job.detail = `Đang chạy ${model}`;

    let stderr = '';
    const onOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const matches = [...text.matchAll(/\[(\d+)\/(\d+)\]/g)];
      const latest = matches[matches.length - 1];
      if (latest) {
        const current = Number(latest[1]);
        const total = Math.max(1, Number(latest[2]));
        job.progress = Math.min(95, Math.round(current * 95 / total));
        job.detail = `Đã xử lý ${current}/${total} câu`;
      }
    };
    child.stdout.on('data', onOutput);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-8000);
    });
    child.on('error', error => {
      job.status = 'FAILED';
      job.error = error.message;
      job.detail = 'Không khởi động được runner';
    });
    child.on('close', code => {
      try {
        if (code !== 0 || !fs.existsSync(outputPath)) throw new Error(stderr.trim() || `Runner exited with code ${code}`);
        job.result = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        job.status = 'COMPLETED';
        job.progress = 100;
        job.detail = 'Đã hoàn tất so sánh LLM lớn';
      } catch (error: any) {
        job.status = 'FAILED';
        job.error = error.message || 'Large-LLM reference failed';
        job.detail = 'Chạy LLM lớn thất bại';
      } finally {
        if (extractedTempDir) cleanupTempDir(extractedTempDir);
        fs.unlink(uploaded.path, () => { });
        fs.rm(tempDir, { recursive: true, force: true }, () => { });
      }
    });

    return res.status(202).json({ referenceJobId, status: job.status });
  } catch (err: any) {
    if (extractedTempDir) cleanupTempDir(extractedTempDir);
    fs.unlink(uploaded.path, () => { });
    return res.status(Number(err.statusCode || 500)).json({ error: err.message || 'Could not start large-LLM reference' });
  }
};

export const getLargeLlmReferenceStatus = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  const job = largeLlmReferenceJobs.get(String(req.params.referenceJobId || ''));
  if (!job || job.ownerId !== ownerId) return res.status(404).json({ error: 'Reference job not found' });
  return res.json(job);
};

async function pollVersion1SharedReference(referenceJobId: string, gpuEvalId: string, failures = 0): Promise<void> {
  const job = version1SharedReferenceJobs.get(referenceJobId);
  if (!job || ['COMPLETED', 'FAILED'].includes(job.status)) return;

  try {
    const response = await fetch(
      `${configService.getGpuUrl()}/api/eval/status/${encodeURIComponent(gpuEvalId)}`,
      {
        headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
        signal: AbortSignal.timeout(10000),
      },
    );
    const text = await response.text();
    if (!response.ok) throw new Error(`GPU status HTTP ${response.status}: ${text.slice(0, 240)}`);
    const payload: any = JSON.parse(text);
    const status = String(payload?.status || '').toUpperCase();

    job.progress = Number(payload?.progress || job.progress || 0);
    job.detail = String(payload?.stage_detail || payload?.stage_label || `GPU: ${status}`);

    if (status === 'COMPLETED') {
      const resultResponse = await fetch(
        `${configService.getGpuUrl()}/api/eval/result/${encodeURIComponent(gpuEvalId)}`,
        {
          headers: { 'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true' },
          signal: AbortSignal.timeout(30000),
        },
      );
      const resultText = await resultResponse.text();
      if (!resultResponse.ok) throw new Error(`GPU result HTTP ${resultResponse.status}: ${resultText.slice(0, 500)}`);
      const result: any = JSON.parse(resultText);
      if (String(result?.status || '').toUpperCase() !== 'COMPLETED') {
        throw new Error(result?.error || 'GPU did not return a completed Version 1 result');
      }
      job.result = {
        ...result,
        comparisonRole: 'version1_shared_ft',
        requestedModel: job.model,
      };
      job.status = 'COMPLETED';
      job.progress = 100;
      job.detail = 'Đã chấm xong mô hình Version 1 fine-tune chung ba môn';
      return;
    }

    if (['FAILED', 'INTERRUPTED', 'LOST'].includes(status)) {
      job.status = 'FAILED';
      job.error = String(payload?.error || payload?.stage_detail || `GPU ${status}`);
      job.detail = 'Đánh giá Version 1 thất bại';
      return;
    }

    job.status = 'RUNNING';
    setTimeout(() => void pollVersion1SharedReference(referenceJobId, gpuEvalId, 0), 2500);
  } catch (error: any) {
    const nextFailures = failures + 1;
    if (nextFailures >= 10) {
      job.status = 'FAILED';
      job.error = error.message || 'Không đọc được trạng thái GPU';
      job.detail = 'Mất kết nối với GPU khi chấm Version 1';
      return;
    }
    job.detail = `Kết nối GPU tạm thời lỗi (${nextFailures}/10), đang thử lại`;
    setTimeout(() => void pollVersion1SharedReference(referenceJobId, gpuEvalId, nextFailures), 3000);
  }
}

// Run the Version 1 shared three-subject fine-tuned model as a local reference.
// It uses the exact locked test, prompt and Judge from the specialist evaluation
// currently being viewed. This isolates model weights instead of introducing a
// second OpenRouter model or an unrelated base model.
export const runVersion1SharedReference = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

  const evalId = String(req.params.evalId || '');
  const trainingJobId = String(req.body?.training_job_id || '').trim();
  const uploaded = req.file;
  if (!uploaded) return res.status(400).json({ error: 'locked_test_file_required' });
  if (!trainingJobId) {
    fs.unlink(uploaded.path, () => { });
    return res.status(400).json({ error: 'version1_training_job_required' });
  }

  let extractedTempDir = '';
  let datasetPath = uploaded.path;
  let datasetName = uploaded.originalname;
  const cleanup = () => {
    if (extractedTempDir) cleanupTempDir(extractedTempDir);
    fs.unlink(uploaded.path, () => { });
  };

  try {
    const [evaluation, version1History] = await Promise.all([
      ModelEvaluation.findOne({ ownerId, modelEvalId: evalId, status: 'COMPLETED' }).lean(),
      TrainingHistory.findOne({ ownerId, jobId: trainingJobId }).lean(),
    ]);
    if (!evaluation) throw Object.assign(new Error('Evaluation not found or not completed'), { statusCode: 404 });
    if (!version1History) throw Object.assign(new Error('Không tìm thấy training job Version 1'), { statusCode: 404 });
    if (!['COMPLETED', 'EVALUATING'].includes(String(version1History.status))) {
      throw Object.assign(new Error('Training job Version 1 chưa hoàn thành'), { statusCode: 422 });
    }
    if (!version1History.hfRepoId) {
      throw Object.assign(new Error('Training job Version 1 chưa có Hugging Face repo'), { statusCode: 422 });
    }
    if (trainingJobId === evaluation.jobId) {
      throw Object.assign(new Error('Hãy chọn job V1 fine-tune chung ba môn, không chọn lại specialist đang xem'), { statusCode: 422 });
    }

    const duplicate = [...version1SharedReferenceJobs.values()].find(item =>
      item.ownerId === ownerId
      && item.evalId === evalId
      && item.trainingJobId === trainingJobId
      && ['PENDING', 'RUNNING'].includes(item.status),
    );
    if (duplicate) {
      cleanup();
      return res.status(409).json({
        error: 'version1_reference_already_running',
        referenceJobId: duplicate.jobId,
        status: duplicate.status,
      });
    }

    if (isZipFile(uploaded.originalname)) {
      const extracted = extractForEvaluation(uploaded.path);
      datasetPath = extracted.dataFilePath;
      datasetName = extracted.dataFileName;
      extractedTempDir = extracted.tempDir;
    }
    const validation = validateLockedTestFile(datasetPath);
    const expectedHash = String((evaluation.datasetValidation as any)?.contentSha256 || '');
    if (expectedHash && validation.contentSha256 !== expectedHash) {
      throw Object.assign(new Error('Tập test không trùng với lần specialist Base–FT đang xem'), { statusCode: 422 });
    }

    const judgeApiKey = await apiKeyService.getApiKeyForUser(ownerId, 'openrouter');
    if (!judgeApiKey) throw Object.assign(new Error('OpenRouter API key is not configured'), { statusCode: 422 });

    const gpuStatus = await getGpuStatus();
    if (!gpuStatus) throw Object.assign(new Error('GPU service không phản hồi'), { statusCode: 503 });
    if (!gpuStatus.can_create_eval) {
      throw Object.assign(new Error(`GPU đang bận (${gpuStatus.active_evals}/${gpuStatus.max_evals} slots)`), { statusCode: 503 });
    }

    const gpuEvalId = `eval_v1_${uuidv4()}`;
    const modelRepo = String(version1History.hfRepoId);
    const config = {
      eval_job_id: gpuEvalId,
      job_id: trainingJobId,
      hf_repo_id: modelRepo,
      hf_token: version1History.hfToken || '',
      model_max_length: version1History.parameters?.modelMaxLength || 2048,
      judge_model: evaluation.judgeModel || RESEARCH_MODEL_CATALOG.judge,
      judge_provider: 'openrouter',
      judge_api_key: judgeApiKey,
      base_model_hf_repo: String(version1History.baseModel || ''),
      system_prompt: String(evaluation.systemPrompt || ''),
      system_prompt_source: 'specialist_evaluation_reference',
      system_prompt_version: evaluation.systemPromptVersion || evaluation.protocolManifest?.prompt_version || 'RP4-locked-v1',
      system_prompt_hash: evaluation.systemPromptHash || '',
      protocol_mode: 'locked_single_turn',
      reference_run_kind: 'version1_shared_ft',
      prompt_variant: 'P1',
      subject_override: '',
      max_new_tokens: 512,
      warmup_runs: 1,
      bootstrap_resamples: 10000,
      bootstrap_seed: 42,
      temperature: 0,
      top_p: 1,
      repetition_penalty: 1,
      eval_file_name: datasetName,
      dataset_file_sha256: validation.fileSha256,
      subject_counts: validation.subjectCounts,
    };

    const form = new FormData();
    form.append('config', JSON.stringify(config));
    form.append('eval_file', fs.createReadStream(datasetPath), {
      filename: datasetName,
      contentType: 'application/json',
      knownLength: fs.statSync(datasetPath).size,
    });
    const gpuResponse = await fetchWithForm(`${configService.getGpuUrl()}/api/eval/start`, form);
    const responseText = await gpuResponse.text();
    let gpuPayload: any = null;
    try { gpuPayload = JSON.parse(responseText); } catch { gpuPayload = null; }
    if (!gpuResponse.ok) {
      throw Object.assign(
        new Error(gpuPayload?.message || gpuPayload?.error || `GPU HTTP ${gpuResponse.status}: ${responseText.slice(0, 300)}`),
        { statusCode: gpuResponse.status },
      );
    }

    const referenceJobId = `version1-shared-${uuidv4()}`;
    const job: Version1SharedReferenceJob = {
      jobId: referenceJobId,
      ownerId,
      evalId,
      trainingJobId,
      model: modelRepo,
      status: 'RUNNING',
      progress: 0,
      detail: `Đã khóa ${validation.itemCount} câu; đang nạp Version 1`,
      createdAt: new Date().toISOString(),
    };
    version1SharedReferenceJobs.set(referenceJobId, job);
    cleanup();
    void pollVersion1SharedReference(referenceJobId, gpuEvalId);
    return res.status(202).json({ referenceJobId, status: job.status, model: modelRepo });
  } catch (err: any) {
    cleanup();
    return res.status(Number(err.statusCode || 500)).json({ error: err.message || 'Could not start Version 1 shared reference' });
  }
};

export const getVersion1SharedReferenceStatus = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });
  const job = version1SharedReferenceJobs.get(String(req.params.referenceJobId || ''));
  if (!job || job.ownerId !== ownerId) return res.status(404).json({ error: 'Version 1 reference job not found' });
  return res.json(job);
};

// ---------------------------------------------------------------------------
// GET /api/model-eval/leaderboard
// Chỉ job đã có eval được chọn (pinned) — ít nhất 1 lần eval xong có pinnedEvalId
// ---------------------------------------------------------------------------
export const getEvaluatedModels = async (req: Request, res: Response) => {
  try {
    const ownerFilter = getOwnerFilter(req);

    const evaluatedJobIds = await ModelEvaluation.distinct('jobId', ownerFilter);
    const histories = await TrainingHistory.find({
      ...ownerFilter,
      jobId: { $in: evaluatedJobIds },
    }).sort({ completedAt: -1 }).lean();

    const result = await Promise.all(
      histories.map(async (h) => {
        const latestAttempt = await ModelEvaluation.findOne({ ...ownerFilter, jobId: h.jobId })
          .sort({ createdAt: -1 })
          .lean();
        const latestEval = await ModelEvaluation.findOne({ ...ownerFilter, jobId: h.jobId, status: 'COMPLETED' })
          .sort({ completedAt: -1 })
          .lean();

        let displayEval = latestEval || latestAttempt;
        if (h.pinnedEvalId) {
          const pinned = await ModelEvaluation.findOne({
            ...ownerFilter,
            jobId: h.jobId,
            modelEvalId: h.pinnedEvalId,
            status: 'COMPLETED',
          }).lean();
          if (pinned) displayEval = pinned;
        }

        const modelEvalId = displayEval?.modelEvalId ?? null;

        return {
          jobId: h.jobId,
          projectName: h.projectName,
          baseModel: h.baseModel,
          completedAt: h.completedAt,
          trainingDuration: h.trainingDuration,
          /** ID eval dùng cho điểm + nút View — ưu tiên eval Official (pinned), không có thì mới nhất */
          modelEvalId,
          pinnedEvalId: h.pinnedEvalId ?? null,
          status: displayEval?.status ?? latestAttempt?.status ?? 'UNKNOWN',
          error: displayEval?.error ?? null,
          failureStage: displayEval?.failureStage ?? null,
          latestAttemptId: latestAttempt?.modelEvalId ?? null,
          latestAttemptStatus: latestAttempt?.status ?? null,
          latestAttemptError: latestAttempt?.error ?? null,
          judgeModel: displayEval?.judgeModel ?? null,
          totalConversations: displayEval?.totalConversations ?? 0,
          flags: displayEval?.flags ?? [],
          scores: {
            knowledge: displayEval?.status === 'COMPLETED'
              ? displayEval?.summary?.knowledge ?? displayEval?.summary?.criteria?.B1 ?? null
              : null,
            socratic: displayEval?.status === 'COMPLETED'
              ? displayEval?.summary?.socratic ?? displayEval?.summary?.group_a ?? null
              : null,
            exploratory_overall: displayEval?.status === 'COMPLETED'
              ? displayEval?.summary?.exploratory_overall ?? displayEval?.summary?.overall ?? null
              : null,
            overall: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.overall ?? null : null,
            group_a: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.group_a ?? null : null,
            group_b: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.group_b ?? null : null,
            group_c: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.group_c ?? null : null,
            group_d: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.group_d ?? null : null,
            criteria: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.criteria ?? null : null,
            avg_latency_ms: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.avg_latency_ms ?? null : null,
            non_scoring: displayEval?.status === 'COMPLETED' ? displayEval?.summary?.non_scoring ?? null : null,
          },
        };
      })
    );

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get evaluated models' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/model-eval/history/:jobId
// Trả tất cả Evaluation của 1 job (để xem lịch sử eval nhiều lần)
// ---------------------------------------------------------------------------
export const getEvalHistory = async (req: Request, res: Response) => {
  try {
    const ownerFilter = getOwnerFilter(req);

    const { jobId } = req.params;

    // Lấy pinnedEvalId từ TrainingHistory
    const history = await TrainingHistory.findOne({ jobId, ...ownerFilter }).select('pinnedEvalId projectName baseModel').lean();

    const evals = await ModelEvaluation.find({ ...ownerFilter, jobId })
      .sort({ createdAt: -1 })
      .select('modelEvalId jobId status error failureStage totalConversations judgeModel summary startedAt completedAt createdAt systemPromptVersion datasetVersionName')
      .lean();

    // Gắn isPinned vào từng eval
    const evalsWithPin = evals.map((e) => ({
      ...e,
      isPinned: e.modelEvalId === history?.pinnedEvalId,
    }));

    return res.json({
      jobId,
      projectName: history?.projectName ?? '',
      baseModel: history?.baseModel ?? '',
      pinnedEvalId: history?.pinnedEvalId ?? null,
      evals: evalsWithPin,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get eval history' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/model-eval/pin/:evalId
// Pin 1 eval làm "official" cho leaderboard — cập nhật TrainingHistory.pinnedEvalId
// Eval cũ được unpin tự động (chỉ 1 eval được pin tại 1 thời điểm)
// ---------------------------------------------------------------------------
export const pinEvaluation = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { evalId } = req.params;

    // Tìm eval để lấy jobId
    const evalDoc = await ModelEvaluation.findOne({ ownerId, modelEvalId: evalId, status: 'COMPLETED' });
    if (!evalDoc) {
      return res.status(404).json({ error: 'Evaluation not found or not completed' });
    }
    if (!evalDoc.confirmatoryEligible) {
      return res.status(422).json({
        error: 'Only confirmatory-eligible evaluations can be pinned as official.',
        flags: evalDoc.flags || [],
      });
    }

    // Update pinnedEvalId trên TrainingHistory (ghi đè eval cũ)
    const result = await TrainingHistory.findOneAndUpdate(
      { jobId: evalDoc.jobId, ownerId },
      { pinnedEvalId: evalId },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Training job not found' });
    }

    console.log(`[Backend] 📌 Pinned eval ${evalId} as official for job ${evalDoc.jobId}`);
    return res.status(200).json({
      message: 'Eval pinned successfully',
      jobId: evalDoc.jobId,
      pinnedEvalId: evalId,
    });
  } catch (err: any) {
    console.error('[Backend] pinEvaluation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to pin evaluation' });
  }
};

export const unpinEvaluation = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

    const { evalId } = req.params;
    const evalDoc = await ModelEvaluation.findOne({ ownerId, modelEvalId: evalId }).select('jobId').lean();
    if (!evalDoc) return res.status(404).json({ error: 'Evaluation not found' });

    const result = await TrainingHistory.findOneAndUpdate(
      { jobId: evalDoc.jobId, ownerId, pinnedEvalId: evalId },
      { $set: { pinnedEvalId: null } },
      { returnDocument: 'after' },
    );
    if (!result) return res.status(409).json({ error: 'Evaluation is not currently pinned.' });

    return res.status(200).json({ message: 'Evaluation unpinned', jobId: evalDoc.jobId, pinnedEvalId: null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to unpin evaluation' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/model-eval/:evalId
// Xóa eval; nếu đang pin thì bỏ pin. Never choose a replacement automatically.
// ---------------------------------------------------------------------------
export const deleteEvaluation = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { evalId } = req.params;
    const evalDoc = await ModelEvaluation.findOne({ ownerId, modelEvalId: evalId });
    if (!evalDoc) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    const { jobId } = evalDoc;
    const history = await TrainingHistory.findOne({ jobId, ownerId }).select('pinnedEvalId').lean();
    const wasPinned = history?.pinnedEvalId === evalId;

    await ModelEvaluation.deleteOne({ ownerId, modelEvalId: evalId });

    let newPinnedEvalId: string | null = history?.pinnedEvalId ?? null;
    if (wasPinned) {
      newPinnedEvalId = null;
      await TrainingHistory.updateOne({ jobId, ownerId }, { $set: { pinnedEvalId: null } });
      console.log(`[Backend] Deleted pinned eval ${evalId}; job ${jobId} is now unpinned.`);
    }

    return res.json({
      message: 'Evaluation deleted',
      newPinnedEvalId: wasPinned ? newPinnedEvalId : history?.pinnedEvalId ?? null,
    });
  } catch (err: any) {
    console.error('[Backend] deleteEvaluation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete evaluation' });
  }
};

type CompareWinner = 'a' | 'b' | 'tie';

function scoreWinner(va: number | null | undefined, vb: number | null | undefined, higherIsBetter = true): CompareWinner {
  if (va == null && vb == null) return 'tie';
  if (va == null) return 'b';
  if (vb == null) return 'a';
  const eps = 1e-6;
  if (Math.abs(va - vb) < eps) return 'tie';
  if (higherIsBetter) return va > vb ? 'a' : 'b';
  return va < vb ? 'a' : 'b';
}

// ---------------------------------------------------------------------------
// GET /api/model-eval/compare?a=&b=
// So sánh 2 eval: metadata + điểm + mẫu trùng instruction (inner join)
// ---------------------------------------------------------------------------
export const compareEvaluations = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const aId = typeof req.query.a === 'string' ? req.query.a : '';
    const bId = typeof req.query.b === 'string' ? req.query.b : '';
    if (!aId || !bId) {
      return res.status(400).json({ error: 'Thiếu query a hoặc b' });
    }
    if (aId === bId) {
      return res.status(400).json({ error: 'Hai eval phải khác nhau' });
    }

    const [evalA, evalB] = await Promise.all([
      ModelEvaluation.findOne({ ownerId, modelEvalId: aId }).lean(),
      ModelEvaluation.findOne({ ownerId, modelEvalId: bId }).lean(),
    ]);
    if (!evalA || !evalB) {
      return res.status(404).json({ error: 'Không tìm thấy một hoặc cả hai bản đánh giá' });
    }

    const [histA, histB] = await Promise.all([
      TrainingHistory.findOne({ ownerId, jobId: evalA.jobId }).select('projectName').lean(),
      TrainingHistory.findOne({ ownerId, jobId: evalB.jobId }).select('projectName').lean(),
    ]);

    const mapA = new Map<number, (typeof evalA.results)[0]>();
    for (const r of evalA.results || []) {
      if (r.conv_index != null) mapA.set(r.conv_index, r);
    }

    const matchedSamples: {
      conv_index: number;
      num_turns_a: number;
      num_turns_b: number;
      knowledge_a: number;
      knowledge_b: number;
      delta_knowledge: number;
      socratic_a: number;
      socratic_b: number;
      delta_socratic: number;
      overall_a: number;
      overall_b: number;
      delta_overall: number;
    }[] = [];

    for (const rowB of evalB.results || []) {
      const rowA = mapA.get(rowB.conv_index);
      if (!rowA) continue;
      const knowledgeA = rowA.group_scores?.knowledge ?? rowA.criteria_scores?.B1 ?? 0;
      const knowledgeB = rowB.group_scores?.knowledge ?? rowB.criteria_scores?.B1 ?? 0;
      const socraticA = rowA.group_scores?.socratic
        ?? ((Number(rowA.criteria_scores?.A1 || 0) + Number(rowA.criteria_scores?.A2 || 0) + Number(rowA.criteria_scores?.A3 || 0)) / 3);
      const socraticB = rowB.group_scores?.socratic
        ?? ((Number(rowB.criteria_scores?.A1 || 0) + Number(rowB.criteria_scores?.A2 || 0) + Number(rowB.criteria_scores?.A3 || 0)) / 3);
      matchedSamples.push({
        conv_index: rowB.conv_index,
        num_turns_a: rowA.num_turns,
        num_turns_b: rowB.num_turns,
        knowledge_a: knowledgeA,
        knowledge_b: knowledgeB,
        delta_knowledge: knowledgeB - knowledgeA,
        socratic_a: socraticA,
        socratic_b: socraticB,
        delta_socratic: socraticB - socraticA,
        overall_a: rowA.group_scores?.exploratory_overall ?? rowA.group_scores?.overall ?? 0,
        overall_b: rowB.group_scores?.exploratory_overall ?? rowB.group_scores?.overall ?? 0,
        delta_overall:
          (rowB.group_scores?.exploratory_overall ?? rowB.group_scores?.overall ?? 0)
          - (rowA.group_scores?.exploratory_overall ?? rowA.group_scores?.overall ?? 0),
      });
    }

    const lenA = evalA.results?.length ?? 0;
    const lenB = evalB.results?.length ?? 0;
    const differentTestSets =
      evalA.totalConversations !== evalB.totalConversations ||
      lenA !== lenB ||
      matchedSamples.length < lenA ||
      matchedSamples.length < lenB;

    const sA = evalA.summary;
    const sB = evalB.summary;
    const criteriaKeys = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2'];

    const scoreSummary = {
      knowledge: {
        a: sA?.knowledge ?? sA?.criteria?.B1 ?? null,
        b: sB?.knowledge ?? sB?.criteria?.B1 ?? null,
        winner: scoreWinner(sA?.knowledge ?? sA?.criteria?.B1, sB?.knowledge ?? sB?.criteria?.B1),
      },
      socratic: {
        a: sA?.socratic ?? sA?.group_a ?? null,
        b: sB?.socratic ?? sB?.group_a ?? null,
        winner: scoreWinner(sA?.socratic ?? sA?.group_a, sB?.socratic ?? sB?.group_a),
      },
      criteria: Object.fromEntries(criteriaKeys.map(key => {
        const a = sA?.criteria?.[key] ?? null;
        const b = sB?.criteria?.[key] ?? null;
        return [key, { a, b, winner: scoreWinner(a, b) }];
      })),
      overall: {
        a: sA?.exploratory_overall ?? sA?.overall ?? null,
        b: sB?.exploratory_overall ?? sB?.overall ?? null,
        winner: scoreWinner(
          sA?.exploratory_overall ?? sA?.overall,
          sB?.exploratory_overall ?? sB?.overall,
        ),
      },
      group_a: {
        a: sA?.group_a ?? null,
        b: sB?.group_a ?? null,
        winner: scoreWinner(sA?.group_a, sB?.group_a),
      },
      group_b: {
        a: sA?.group_b ?? null,
        b: sB?.group_b ?? null,
        winner: scoreWinner(sA?.group_b, sB?.group_b),
      },
      group_c: {
        a: sA?.group_c ?? null,
        b: sB?.group_c ?? null,
        winner: scoreWinner(sA?.group_c, sB?.group_c),
      },
      group_d: {
        a: sA?.group_d ?? null,
        b: sB?.group_d ?? null,
        winner: scoreWinner(sA?.group_d, sB?.group_d),
      },
      bleu: {
        a: sA?.non_scoring?.bleu ?? null,
        b: sB?.non_scoring?.bleu ?? null,
        winner: scoreWinner(sA?.non_scoring?.bleu, sB?.non_scoring?.bleu),
      },
      rouge_l: {
        a: sA?.non_scoring?.rouge_l ?? null,
        b: sB?.non_scoring?.rouge_l ?? null,
        winner: scoreWinner(sA?.non_scoring?.rouge_l, sB?.non_scoring?.rouge_l),
      },
    };

    const runA = {
      modelEvalId: evalA.modelEvalId,
      jobId: evalA.jobId,
      projectName: histA?.projectName ?? '',
      judgeModel: evalA.judgeModel ?? '',
      completedAt: evalA.completedAt,
      totalConversations: evalA.totalConversations,
    };
    const runB = {
      modelEvalId: evalB.modelEvalId,
      jobId: evalB.jobId,
      projectName: histB?.projectName ?? '',
      judgeModel: evalB.judgeModel ?? '',
      completedAt: evalB.completedAt,
      totalConversations: evalB.totalConversations,
    };

    return res.json({
      runA,
      runB,
      scoreSummary,
      matchedSamples,
      matchedCount: matchedSamples.length,
      differentTestSetsNote: differentTestSets,
    });
  } catch (err: any) {
    console.error('[Backend] compareEvaluations error:', err);
    return res.status(500).json({ error: err.message || 'Failed to compare evaluations' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/model-eval/:evalId/review/:convIndex
// Body: { verdict?: 'skip', human_scores?: A1..D1, human_reasons?: {}, note?, reviewer }
// ---------------------------------------------------------------------------
export const reviewConversation = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { evalId, convIndex } = req.params;
    const { verdict, note, reviewer, human_scores, human_reasons } = req.body;

    if (verdict && !['agree', 'disagree', 'skip'].includes(verdict)) {
      return res.status(400).json({ error: 'verdict phải là agree | disagree | skip' });
    }

    const idx = parseInt(convIndex);
    if (isNaN(idx)) {
      return res.status(400).json({ error: 'convIndex không hợp lệ' });
    }

    const evalDoc = await ModelEvaluation.findOne({ ownerId, modelEvalId: evalId });
    if (!evalDoc) return res.status(404).json({ error: 'Evaluation not found' });

    // Tìm conversation theo conv_index
    const convResult = evalDoc.results.find((r: any) => r.conv_index === idx);
    if (!convResult) return res.status(404).json({ error: `Conversation ${idx} not found` });

    const reviewerName = String(reviewer || '').trim();
    if (!reviewerName) return res.status(400).json({ error: 'Cần tên người thẩm định' });

    let review: Record<string, any>;
    if (verdict === 'skip') {
      review = {
        verdict: 'skip',
        note: String(note || '').trim() || undefined,
        reviewer: reviewerName,
        reviewed_at: new Date(),
        rubric_version: HUMAN_AUDIT_RUBRIC_VERSION,
      };
    } else {
      let validated;
      try {
        validated = validateHumanAuditScores(human_scores, human_reasons);
      } catch (validationError: any) {
        return res.status(400).json({ error: validationError.message || 'Điểm Human Audit không hợp lệ' });
      }
      const humanOutcomes = computeHumanOutcomes(validated.scores);
      const conflict = deriveHumanAiConflict(
        convResult.criteria_scores as unknown as Record<string, unknown>,
        validated.scores,
      );
      review = {
        verdict: conflict.has_conflict ? 'disagree' : 'agree',
        note: String(note || '').trim() || undefined,
        reviewer: reviewerName,
        reviewed_at: new Date(),
        rubric_version: HUMAN_AUDIT_RUBRIC_VERSION,
        human_scores: validated.scores,
        human_reasons: validated.reasons,
        human_outcomes: humanOutcomes,
        ai_scores_snapshot: { ...(convResult.criteria_scores as unknown as Record<string, number>) },
        conflict,
      };
    }

    convResult.human_review = review as any;

    await evalDoc.save();

    const stats = buildHumanAuditSummary(evalDoc.results as any[]);

    return res.json({
      message: 'Review saved',
      conv_index: idx,
      review,
      humanAudit: stats,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
