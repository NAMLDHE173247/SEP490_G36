import { Request, Response } from 'express';
const fetch = async (url: any, init?: any) => {
  const module = await import('node-fetch');
  return module.default(url, init);
};
import { ChatHistory } from '../models/ChatHistory';
import { ModelVersion, ModelVersionStatus } from '../models/ModelVersion';
import { getAuthUserId } from '../utils/auth';
import { configService } from '../services/configService';
import { apiKeyService } from '../services/apiKeyService';
import { routeVerifiedSubject, SubjectModelMap } from '../services/subjectModelRouter';
import { decideHybridRoute } from '../services/routing/routingOrchestrator';
import { HybridRoutingDecision, RoutingMode } from '../services/routing/routingTypes';

const getGpuUrl = (instanceId?: number) => configService.getGpuUrl(instanceId);

const fetchWithTransientTunnelRetry = async (
  url: string,
  init?: any,
  attempts = 3,
): Promise<any> => {
  let response: any;
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      response = await fetch(url, init);
      if (![502, 503, 504].includes(response.status) || attempt === attempts) {
        return response;
      }
      // Consume the transient response before retrying so its socket can close.
      await response.text().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  if (response) return response;
  throw lastError || new Error(`GPU tunnel request failed: ${url}`);
};

type GpuHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  subject?: string;
};

const normalizeHistory = (history: unknown): GpuHistoryMessage[] => {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized = history
    .map((item: any) => {
      const role = item?.role === 'user' || item?.role === 'assistant' ? item.role : null;
      const content = typeof item?.content === 'string' ? item.content.trim() : '';

      if (!role || !content) {
        return null;
      }

      const subject = typeof item?.subject === 'string' ? item.subject.trim().toUpperCase() : '';
      return { role, content, ...(subject ? { subject } : {}) };
    })
    .filter((item): item is GpuHistoryMessage => item !== null);

  // The GPU chat template requires completed turns in the exact order
  // user -> assistant -> user -> assistant. Taking an odd number of messages
  // (the old slice(-5)) could cut the first user message off and make history
  // start with assistant. Rebuild complete pairs and retain the latest 5 turns.
  const pairs: GpuHistoryMessage[][] = [];
  let pendingUser: GpuHistoryMessage | null = null;
  for (const message of normalized) {
    if (message.role === 'user') {
      // If malformed input contains consecutive users, keep the latest one.
      pendingUser = message;
      continue;
    }
    if (pendingUser) {
      pairs.push([pendingUser, message]);
      pendingUser = null;
    }
    // Orphan/consecutive assistant messages are ignored.
  }

  return pairs.slice(-5).flat();
};

const selectRelevantHistory = (
  history: GpuHistoryMessage[],
  subject?: string,
  maxTurns = 2,
  maxCharacters = 2_400,
): GpuHistoryMessage[] => {
  const pairs: GpuHistoryMessage[][] = [];
  for (let index = 0; index < history.length - 1; index += 1) {
    if (history[index].role === 'user' && history[index + 1].role === 'assistant') {
      pairs.push([history[index], history[index + 1]]);
      index += 1;
    }
  }
  const normalizedSubject = String(subject || '').trim().toUpperCase();
  const candidates = normalizedSubject
    ? pairs.filter(pair => pair.some(message => message.subject === normalizedSubject))
    : pairs;
  const selected: GpuHistoryMessage[][] = [];
  let usedCharacters = 0;
  for (const pair of candidates.slice().reverse()) {
    const pairCharacters = pair.reduce((sum, message) => sum + message.content.length, 0);
    if (selected.length >= maxTurns || (selected.length > 0 && usedCharacters + pairCharacters > maxCharacters)) break;
    selected.unshift(pair);
    usedCharacters += pairCharacters;
  }
  return selected.flat().map(({ role, content }) => ({ role, content }));
};

type ManualHybridModelAcquisition = {
  slotId: number;
  previousModel: string | null;
  selectedModel: string;
  cacheHit: boolean;
  loadAction: 'cache_hit' | 'cold_load' | 'switch_load';
  modelSwitchLatencyMs: number;
  evicted: boolean;
};

/**
 * The normal Chat screen uses one explicit GPU slot. Hybrid inference must
 * therefore make the selected model resident before calling /api/infer/stream.
 * Returning the acquisition metadata lets the UI measure real switching cost
 * instead of folding it invisibly into the wall-clock response time.
 */
const acquireManualHybridModel = async (
  targetUrl: string,
  selectedModel: string,
  slotId: number,
  pinned = false,
): Promise<ManualHybridModelAcquisition> => {
  const tunnelHeaders = {
    'ngrok-skip-browser-warning': 'true',
    'Bypass-Tunnel-Reminder': 'true',
  };
  let previousModel: string | null = null;
  try {
    const statusResponse = await fetchWithTransientTunnelRetry(`${targetUrl}/api/model/status`, {
      headers: tunnelHeaders,
    });
    if (statusResponse.ok) {
      const status: any = await statusResponse.json();
      previousModel = status?.slots?.[String(slotId)]?.model_id || null;
    }
  } catch {
    // A failed status probe is not fatal; /api/model/load remains authoritative.
  }

  if (previousModel === selectedModel) {
    return {
      slotId,
      previousModel,
      selectedModel,
      cacheHit: true,
      loadAction: 'cache_hit',
      modelSwitchLatencyMs: 0,
      evicted: false,
    };
  }

  const loadStartedAt = Date.now();
  const loadResponse = await fetchWithTransientTunnelRetry(`${targetUrl}/api/model/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...tunnelHeaders },
    body: JSON.stringify({ hf_model_id: selectedModel, instanceId: slotId, pinned }),
  });
  const raw = await loadResponse.text();
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { payload = { message: raw }; }
  if (!loadResponse.ok) {
    throw new Error(payload.error || payload.message || `Không thể load ${selectedModel} vào GPU slot ${slotId}`);
  }

  const message = String(payload.message || '');
  const cacheHit = /bỏ qua|bo qua|already|skip/i.test(message);
  const effectivePrevious = previousModel || (cacheHit ? selectedModel : null);
  return {
    slotId,
    previousModel: effectivePrevious,
    selectedModel,
    cacheHit,
    loadAction: cacheHit ? 'cache_hit' : effectivePrevious ? 'switch_load' : 'cold_load',
    modelSwitchLatencyMs: cacheHit ? 0 : Date.now() - loadStartedAt,
    evicted: Boolean(effectivePrevious && effectivePrevious !== selectedModel && !cacheHit),
  };
};


export const validateModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { model, provider } = req.body;

    if (!provider || provider === 'local') {
      // Local model validation (existing logic if any, or just return ok for now)
      res.json({ valid: true });
      return;
    }

    let llmProvider;
    const normalizedProvider = String(provider).toLowerCase();
    const userId = getAuthUserId(req);
    if (userId) {
      llmProvider = await apiKeyService.createProvider(userId, normalizedProvider, false);
    }

    if (llmProvider) {
      // Test the model with a very simple, short prompt
      await llmProvider.generateContent('ping', model, 'Respond only with "pong"');
      res.json({ valid: true });
    } else {
      res.status(400).json({ error: 'Provider không hợp lệ' });
    }
  } catch (error: any) {
    console.error('[validateModel] Error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const chatWithAI = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      text_input,
      hf_hub_id,
      message,
      model,
      modelRegistryId, // New: support using production model from registry
      system_prompt,
      max_new_tokens,
      temperature,
      top_k,
      top_p,
      repetition_penalty,
      provider, // New: external provider like 'openrouter', 'gemini', etc.
      history
    } = req.body;

    const actualMessage = text_input || message;
    let actualModelId = hf_hub_id || model;

    // If modelRegistryId is provided, fetch the Use version's HF ID
    if (modelRegistryId && !actualModelId) {
      const activeVersion = await ModelVersion.findOne({
        ownerId,
        modelRegistryId,
        status: ModelVersionStatus.USE
      });
      if (activeVersion && activeVersion.hfRepoId) {
        actualModelId = activeVersion.hfRepoId;
        console.log(`[chatWithAI] Using Active model from Registry ${modelRegistryId}: ${actualModelId}`);
      } else {
        res.status(404).json({ error: 'Không tìm thấy phiên bản Active (Use) nào cho Model Registry này.' });
        return;
      }
    }

    if (!actualMessage) {
      res.status(400).json({ error: 'message là bắt buộc' });
      return;
    }

    // --- CASE 1: External LLM Provider (OpenRouter, Gemini, etc.) ---
    if (provider) {
      const normalizedProvider = String(provider).toLowerCase();
      const llmProvider = await apiKeyService.createProvider(ownerId, normalizedProvider, false);

      if (llmProvider) {
        console.log(`[chatWithAI] Using external provider: ${normalizedProvider}`);
        // If using OpenRouter or Gemini, pass the model ID
        const reply = await llmProvider.generateContent(actualMessage, actualModelId, system_prompt);
        res.json({ reply, result: reply });
        return;
      }
    }

    // --- CASE 2: Fine-tuned Model (Local/GPU Service) ---
    if (!actualModelId) {
      res.status(400).json({ error: 'hf_model_id là bắt buộc khi không dùng external provider' });
      return;
    }

    const { instanceId } = req.body;
    const targetUrl = getGpuUrl(instanceId);
    const normalizedHistory = normalizeHistory(history);

    const inferResponse = await fetch(`${targetUrl}/api/infer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({
        hf_model_id: actualModelId,
        text_input: actualMessage,
        history: normalizedHistory,
        instanceId: instanceId ?? 1,
        system_prompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty
      })
    });

    if (!inferResponse.ok) {
      const errorData: any = await inferResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ GPU service: ${inferResponse.statusText}`);
    }

    const data: any = await inferResponse.json();
    res.json({ reply: data.result || 'Không có phản hồi', result: data.result });

  } catch (error: any) {
    console.error('Chat AI Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python inference', details: error.message });
  }
};

export const inferWithAI = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      text_input,
      hf_model_id,
      hf_hub_id, // Compatibility with ChatView's local-model payload
      modelRegistryId, // New: support registry for single inference
      system_prompt,
      max_new_tokens,
      temperature,
      top_k,
      top_p,
      repetition_penalty,
      provider, // New: support external providers
      history,
      subject,
      subject_model_map,
      routing_mode,
      previous_subject,
      session_id,
    } = req.body;

    if (!text_input) {
      res.status(400).json({ error: 'text_input là bắt buộc' });
      return;
    }

    let actualModelId = hf_model_id || hf_hub_id;
    let routingDecision: ReturnType<typeof routeVerifiedSubject> | HybridRoutingDecision | null = null;

    if (!actualModelId && ['rule', 'llm', 'hybrid'].includes(String(routing_mode || ''))) {
      routingDecision = await decideHybridRoute({
        ownerId,
        question: text_input,
        history: normalizeHistory(history),
        previousSubject: typeof previous_subject === 'string' ? previous_subject : undefined,
        mode: routing_mode as RoutingMode,
        sessionId: session_id,
        modelMap: subject_model_map,
      });
      if (routingDecision.needClarification || !routingDecision.selectedModel) {
        res.status(422).json({
          error: 'need_clarification',
          message: 'Câu hỏi chưa đủ rõ để chọn mô hình. Vui lòng cho biết môn học hoặc bài đang làm.',
          routing: routingDecision,
        });
        return;
      }
      actualModelId = routingDecision.selectedModel;
    }

    if (!actualModelId && subject && subject_model_map && typeof subject_model_map === 'object') {
      routingDecision = routeVerifiedSubject(subject, subject_model_map as SubjectModelMap);
      actualModelId = routingDecision.selectedModel;
    }

    // If modelRegistryId is provided, fetch the Active version's HF ID
    if (modelRegistryId && !actualModelId) {
      const activeVersion = await ModelVersion.findOne({
        ownerId,
        modelRegistryId,
        status: ModelVersionStatus.USE
      });
      if (activeVersion && activeVersion.hfRepoId) {
        actualModelId = activeVersion.hfRepoId;
      } else {
        res.status(404).json({ error: 'Không tìm thấy phiên bản Active cho Model Registry này.' });
        return;
      }
    }

    // --- CASE 1: External LLM Provider ---
    if (provider) {
      const normalizedProvider = String(provider).toLowerCase();
      const llmProvider = await apiKeyService.createProvider(ownerId, normalizedProvider, false);

      if (llmProvider) {
        console.log(`[inferWithAI] Using external provider: ${normalizedProvider}`);
        const result = await llmProvider.generateContent(text_input, actualModelId, system_prompt);
        res.json({ result });
        return;
      }
    }

    // --- CASE 2: GPU Service ---
    if (!actualModelId) {
      res.status(400).json({ error: 'hf_model_id là bắt buộc khi không dùng external provider' });
      return;
    }

    const { instanceId } = req.body;
    const targetUrl = getGpuUrl(instanceId);
    const normalizedHistory = normalizeHistory(history);

    const inferResponse = await fetch(`${targetUrl}/api/infer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({
        hf_model_id: actualModelId,
        text_input: text_input,
        history: normalizedHistory,
        instanceId: instanceId ?? 1,
        system_prompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty
      })
    });

    if (!inferResponse.ok) {
      const errorData: any = await inferResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ Python backend: ${inferResponse.statusText}`);
    }

    const data: any = await inferResponse.json();
    res.json({
      ...data,
      routing: routingDecision || {
        subject: subject || null,
        selectedModel: actualModelId,
        fallbackUsed: false,
        strategy: 'direct-model',
      },
    });

  } catch (error: any) {
    console.error('Inference AI Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python inference', details: error.message });
  }
};

export const chatWithAIStream = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      text_input,
      hf_hub_id,
      message,
      model,
      modelRegistryId, // New: support using production model from registry
      system_prompt,
      max_new_tokens,
      temperature,
      top_k,
      top_p,
      repetition_penalty,
      provider,
      history
    } = req.body;

    const actualMessage = text_input || message;
    let actualModelId = hf_hub_id || model;

    // If modelRegistryId is provided, fetch the Active (Use) version's HF ID
    if (modelRegistryId && !actualModelId) {
      const activeVersion = await ModelVersion.findOne({
        ownerId,
        modelRegistryId,
        status: ModelVersionStatus.USE
      });
      if (activeVersion && activeVersion.hfRepoId) {
        actualModelId = activeVersion.hfRepoId;
      } else {
        res.status(404).json({ error: 'Không tìm thấy phiên bản Active (Use) cho Model Registry này.' });
        return;
      }
    }

    if (!actualMessage) {
      res.status(400).json({ error: 'message là bắt buộc' });
      return;
    }

    // --- CASE 1: External Provider (Non-streaming fallback for now) ---
    if (provider) {
      const normalizedProvider = String(provider).toLowerCase();
      const llmProvider = await apiKeyService.createProvider(ownerId, normalizedProvider, false);

      if (llmProvider) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const reply = await llmProvider.generateContent(actualMessage, actualModelId, system_prompt);

        res.write(`data: ${JSON.stringify({ text: reply })}\n\n`);
        res.write(`data: ${JSON.stringify({ is_final: true })}\n\n`);
        res.end();
        return;
      }
    }

    // --- CASE 2: GPU Service Stream ---
    if (!actualModelId) {
      res.status(400).json({ error: 'hf_model_id là bắt buộc khi không dùng external provider' });
      return;
    }

    const { instanceId } = req.body;
    const targetUrl = getGpuUrl(instanceId);
    const normalizedHistory = normalizeHistory(history);
    console.log(`[chatWithAIStream] req.body.instanceId=${JSON.stringify(req.body.instanceId)}, slot=${instanceId ?? 1}`);

    const inferResponse = await fetch(`${targetUrl}/api/infer/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({
        hf_model_id: actualModelId,
        text_input: actualMessage,
        history: normalizedHistory,
        instanceId: instanceId ?? 1,
        system_prompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty
      })
    });

    if (!inferResponse.ok) {
      // If not OK, python might not return a stream but a JSON error
      let errorMessage = `Lỗi từ GPU service: ${inferResponse.statusText}`;
      try {
        const errorData: any = await inferResponse.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Ignore JSON parse error on non-ok response
      }
      res.status(inferResponse.status).json({ error: errorMessage });
      return;
    }

    // Set headers for SSE
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
    }

    // Manually handle the stream from Python server to Express response
    if (inferResponse.body) {
      let streamFinished = false;
      const reader = (inferResponse.body as any);

      reader.on('data', (chunk: Buffer) => {
        if (!streamFinished) {
          res.write(chunk);
        }
      });

      const finishStream = () => {
        if (streamFinished || res.writableEnded) return;
        streamFinished = true;

        const input_parameters = {
          do_sample: true,
          max_new_tokens,
          repetition_penalty,
          system_prompt,
          temperature,
          text_input: actualMessage,
          top_k,
          top_p
        };
        const finalChunk = JSON.stringify({
          is_final: true,
          input_parameters,
        });
        res.write(`data: ${finalChunk}\n\n`);
        res.end();
      };

      reader.on('end', finishStream);
      reader.on('close', finishStream);
      reader.on('error', (err: Error) => {
        console.error('Stream error:', err);
        if (!res.writableEnded) {
          res.end();
        }
      });
    } else {
      res.status(500).json({ error: 'Không nhận được luồng dữ liệu từ GPU service' });
    }

  } catch (error: any) {
    console.error('Chat AI Stream Proxy Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python inference stream', details: error.message });
    } else {
      res.end(`data: ${JSON.stringify({ error: 'Kết nối stream bị gián đoạn: ' + error.message })}\n\n`);
    }
  }
};

export const inferWithAIStream = async (req: Request, res: Response): Promise<void> => {
  const requestStartedAt = Date.now();
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      text_input,
      hf_model_id,
      hf_hub_id, // Compatibility with ChatView's streaming payload
      modelRegistryId, // New: support registry for single inference stream
      system_prompt,
      max_new_tokens,
      temperature,
      top_k,
      top_p,
      repetition_penalty,
      provider,
      history,
      routing_mode,
      previous_subject,
      subject_model_map,
      session_id,
    } = req.body;

    if (!text_input) {
      res.status(400).json({ error: 'text_input là bắt buộc' });
      return;
    }

    let actualModelId = hf_model_id || hf_hub_id;
    let routingDecision: HybridRoutingDecision | null = null;
    let routerLatencyMs = 0;
    if (!actualModelId && ['rule', 'llm', 'hybrid'].includes(String(routing_mode || ''))) {
      const routingStartedAt = Date.now();
      routingDecision = await decideHybridRoute({
        ownerId,
        question: text_input,
        history: normalizeHistory(history),
        previousSubject: typeof previous_subject === 'string' ? previous_subject : undefined,
        mode: routing_mode as RoutingMode,
        sessionId: session_id,
        modelMap: subject_model_map,
      });
      routerLatencyMs = Number(routingDecision.latencyMs) || (Date.now() - routingStartedAt);
      if (routingDecision.needClarification || !routingDecision.selectedModel) {
        res.status(422).json({
          error: 'need_clarification',
          message: 'Câu hỏi chưa đủ rõ để chọn mô hình. Vui lòng cho biết môn học hoặc bài đang làm.',
          routing: routingDecision,
        });
        return;
      }
      actualModelId = routingDecision.selectedModel;
    }

    // If modelRegistryId is provided, fetch the Active (Use) version's HF ID
    if (modelRegistryId && !actualModelId) {
      const activeVersion = await ModelVersion.findOne({
        ownerId,
        modelRegistryId,
        status: ModelVersionStatus.USE
      });
      if (activeVersion && activeVersion.hfRepoId) {
        actualModelId = activeVersion.hfRepoId;
      } else {
        res.status(404).json({ error: 'Không tìm thấy phiên bản Active (Use) cho Model Registry này.' });
        return;
      }
    }

    const effectiveSystemPrompt = system_prompt || (
      routingDecision?.subject === 'ENGLISH'
        ? 'You are a concise Socratic English tutor. Reply in natural English when the latest student message is in English. Guide the learner with a short explanation or one useful follow-up question. Do not switch to Vietnamese unless the student writes in Vietnamese or explicitly requests it.'
        : undefined
    );

    // --- CASE 1: External Provider (Non-streaming fallback) ---
    if (provider) {
      const normalizedProvider = String(provider).toLowerCase();
      const llmProvider = await apiKeyService.createProvider(ownerId, normalizedProvider, false);

      if (llmProvider) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const result = await llmProvider.generateContent(text_input, actualModelId, effectiveSystemPrompt);
        res.write(`data: ${JSON.stringify({ text: result })}\n\n`);
        res.write(`data: ${JSON.stringify({ is_final: true })}\n\n`);
        res.end();
        return;
      }
    }

    // --- CASE 2: GPU Service Stream ---
    if (!actualModelId) {
      res.status(400).json({ error: 'hf_model_id là bắt buộc khi không dùng external provider' });
      return;
    }

    const { instanceId } = req.body;
    const requestedSlotId = Number(instanceId ?? 1);
    const fallbackRoute = Boolean(routingDecision && ['OTHER', 'GENERAL'].includes(routingDecision.subject));
    const slotId = routingDecision ? (fallbackRoute ? 1 : 2) : requestedSlotId;
    const targetUrl = getGpuUrl(slotId);
    const normalizedHistory = selectRelevantHistory(normalizeHistory(history), routingDecision?.subject);
    console.log(`[inferWithAIStream] req.body.instanceId=${JSON.stringify(req.body.instanceId)}, slot=${instanceId ?? 1}`);

    // Keep the browser/tunnel connection alive while a Hybrid-selected model
    // is downloaded or swapped into the requested GPU slot.
    if (routingDecision) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({
        stage: 'model_acquisition',
        selected_model: actualModelId,
        slot_id: slotId,
        routing: routingDecision,
        router_latency_ms: routerLatencyMs,
      })}\n\n`);
      heartbeatTimer = setInterval(() => {
        if (!res.writableEnded) res.write(`: hybrid-model-load-heartbeat ${Date.now()}\n\n`);
      }, 10000);
      res.on('close', stopHeartbeat);
    }

    let acquisition: ManualHybridModelAcquisition = {
      slotId,
      previousModel: actualModelId,
      selectedModel: actualModelId,
      cacheHit: true,
      loadAction: 'cache_hit',
      modelSwitchLatencyMs: 0,
      evicted: false,
    };
    if (routingDecision) {
      acquisition = await acquireManualHybridModel(targetUrl, actualModelId, slotId, fallbackRoute);
    }

    const generationStartedAt = Date.now();
    const inferResponse = await fetchWithTransientTunnelRetry(`${targetUrl}/api/infer/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({
        hf_model_id: actualModelId,
        text_input: text_input,
        history: normalizedHistory,
        instanceId: slotId,
        system_prompt: effectiveSystemPrompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty
      })
    }, routingDecision ? 2 : 1);

    if (!inferResponse.ok) {
      let errorMessage = `Lỗi từ Python backend: ${inferResponse.statusText}`;
      try {
        const errorData: any = await inferResponse.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Ignore JSON parse error on non-ok response
      }
      stopHeartbeat();
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
      } else {
        res.status(inferResponse.status).json({ error: errorMessage });
      }
      return;
    }

    // Set headers for SSE
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
    }

    // Manually handle the stream
    if (inferResponse.body) {
      let streamFinished = false;
      const reader = (inferResponse.body as any);
      let firstTokenAt: number | null = null;
      let upstreamBuffer = '';
      let inferenceId: string | null = null;
      let tokenUsage: any = null;
      let upstreamDoneReceived = false;

      reader.on('data', (chunk: Buffer) => {
        if (!streamFinished) {
          upstreamBuffer += chunk.toString('utf8');
          const lines = upstreamBuffer.split('\n');
          upstreamBuffer = lines.pop() || '';
          for (const line of lines) {
            if (line === 'data: [DONE]') {
              upstreamDoneReceived = true;
              continue;
            }
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const text = parsed.response ?? parsed.text;
              if (firstTokenAt === null && typeof text === 'string' && text.length > 0) {
                firstTokenAt = Date.now();
              }
              if (parsed.inference_id) inferenceId = String(parsed.inference_id);
              if (parsed.usage) tokenUsage = parsed.usage;
            } catch {
              // Keep proxying malformed/non-JSON diagnostic events unchanged.
            }
          }
          res.write(chunk);
        }
      });

      const finishStream = () => {
        if (streamFinished || res.writableEnded) return;
        streamFinished = true;
        stopHeartbeat();

        const completedAt = Date.now();
        const generationLatencyMs = completedAt - generationStartedAt;
        const ttftMs = firstTokenAt === null ? null : firstTokenAt - generationStartedAt;
        const decodeLatencyMs = ttftMs === null ? null : Math.max(0, generationLatencyMs - ttftMs);
        const endToEndLatencyMs = completedAt - requestStartedAt;

        const input_parameters = {
          do_sample: true,
          max_new_tokens,
          repetition_penalty,
          system_prompt: effectiveSystemPrompt,
          temperature,
          text_input,
          top_k,
          top_p
        };
        const manualHybridMetrics = {
          measured_at: new Date(completedAt).toISOString(),
          routing_mode: routing_mode || (routingDecision ? 'hybrid' : 'direct'),
          subject: routingDecision?.subject || null,
          route_strategy: routingDecision?.strategy || 'direct-model',
          router_latency_ms: routerLatencyMs,
          model_switch_latency_ms: acquisition.modelSwitchLatencyMs,
          generation_latency_ms: generationLatencyMs,
          ttft_ms: ttftMs,
          decode_latency_ms: decodeLatencyMs,
          end_to_end_latency_ms: endToEndLatencyMs,
          previous_model: acquisition.previousModel,
          selected_model: actualModelId,
          gpu_slot_id: acquisition.slotId,
          model_cache_hit: acquisition.cacheHit,
          model_load_action: acquisition.loadAction,
          model_evicted: acquisition.evicted,
          history_messages_sent: normalizedHistory.length,
          history_characters_sent: normalizedHistory.reduce((sum, message) => sum + message.content.length, 0),
          inference_id: inferenceId,
          token_usage: tokenUsage,
        };
        const finalChunk = JSON.stringify({
          is_final: true,
          input_parameters,
          routing: routingDecision,
          manual_hybrid_metrics: manualHybridMetrics,
        });
        res.write(`data: ${finalChunk}\n\n`);
        res.end();
      };

      reader.on('end', finishStream);
      reader.on('close', finishStream);
      reader.on('error', (err: Error) => {
        console.error('Stream error:', err);
        // Some tunnels reset the upstream socket immediately after forwarding
        // [DONE]. The answer is complete in that case, so still emit the final
        // telemetry event instead of silently losing the selected model/logs.
        if (upstreamDoneReceived) {
          finishStream();
          return;
        }
        stopHeartbeat();
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: `GPU stream interrupted: ${err.message}` })}\n\n`);
          res.end();
        }
      });
    } else {
      res.status(500).json({ error: 'Không nhận được luồng dữ liệu từ GPU service' });
    }

  } catch (error: any) {
    stopHeartbeat();
    console.error('Inference AI Stream Proxy Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python inference stream', details: error.message });
    } else {
      // Send the raw error message so the UI can display it
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
};

export const saveChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userMessage, aiMessage, model, responseTime } = req.body;

    if (!userMessage || !aiMessage || !model || responseTime === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const newHistory = new ChatHistory({
      ownerId,
      userMessage,
      aiMessage,
      model,
      responseTime
    });

    await newHistory.save();
    res.status(201).json({ message: 'Saved successfully', data: newHistory });
  } catch (error: any) {
    console.error('Save Chat History Error:', error);
    res.status(500).json({ error: 'Failed to save chat history', details: error.message });
  }
};

export const getChatHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const history = await ChatHistory.find({ ownerId })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(history);
  } catch (error: any) {
    console.error('Get Chat History Error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history', details: error.message });
  }
};

export const loadModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { hf_model_id, system_prompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty, pinned, force_reload } = req.body;

    if (!hf_model_id) {
      res.status(400).json({ error: 'hf_model_id là bắt buộc' });
      return;
    }

    const { instanceId } = req.body;
    const targetUrl = getGpuUrl(instanceId);
    console.log(`[loadModel] req.body.instanceId=${JSON.stringify(req.body.instanceId)}, resolved slot=${instanceId ?? 1}, url=${targetUrl}`);

    const loadResponse = await fetch(`${targetUrl}/api/model/load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      },
      body: JSON.stringify({ hf_model_id, instance_id: instanceId ?? 1, system_prompt, max_new_tokens, temperature, top_k, top_p, repetition_penalty, pinned, force_reload })
    });

    if (!loadResponse.ok) {
      const errorData: any = await loadResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ Python backend: ${loadResponse.statusText}`);
    }

    const data: any = await loadResponse.json();
    res.json(data);

  } catch (error: any) {
    console.error('Load Model Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python model load', details: error.message });
  }
};

export const stopInference = async (req: Request, res: Response): Promise<void> => {
  try {
    const slotId = parseInt(req.params.slotId);
    if (isNaN(slotId) || slotId < 1) {
      res.status(400).json({ error: 'slotId không hợp lệ' });
      return;
    }

    const targetUrl = getGpuUrl(slotId);
    console.log(`[stopInference] Sending stop signal to slot ${slotId}, url=${targetUrl}`);

    const response = await fetch(`${targetUrl}/api/infer/stop/${slotId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      }
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ GPU service: ${response.statusText}`);
    }

    const data: any = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Stop Inference Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi khi gửi tín hiệu dừng inference' });
  }
};

export const unloadModel = async (req: Request, res: Response): Promise<void> => {
  try {
    const slotId = parseInt(req.params.slotId);
    if (isNaN(slotId) || slotId < 1) {
      res.status(400).json({ error: 'slotId không hợp lệ' });
      return;
    }

    const targetUrl = getGpuUrl(slotId);
    console.log(`[unloadModel] Unloading slot ${slotId}, url=${targetUrl}`);

    const response = await fetch(`${targetUrl}/api/model/unload/${slotId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      }
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ GPU service: ${response.statusText}`);
    }

    const data: any = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Unload Model Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi khi unload model' });
  }
};

export const getInferenceLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { inference_id, instanceId } = req.query;
    const targetUrl = getGpuUrl(instanceId ? Number(instanceId) : undefined);

    let url = `${targetUrl}/api/infer/logs`;
    if (inference_id) {
      url += `/${inference_id}`;
    }

    const response = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true', 'Bypass-Tunnel-Reminder': 'true'
      }
    });

    if (!response.ok) {
      const errorData: any = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Lỗi từ Python backend: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Get Inference Logs Proxy Error:', error);
    res.status(500).json({ error: error.message || 'Có lỗi xảy ra khi gọi Python logs', details: error.message });
  }
};
