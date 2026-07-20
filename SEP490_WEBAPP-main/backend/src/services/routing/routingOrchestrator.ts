import crypto from 'crypto';
import mongoose from 'mongoose';
import { ModelRegistry } from '../../models/ModelRegistry';
import { ModelVersion, ModelVersionStatus } from '../../models/ModelVersion';
import { RoutingDecisionLog } from '../../models/RoutingDecisionLog';
import { apiKeyService } from '../apiKeyService';
import { hybridRoute } from './hybridRouter';
import { HybridRoutingDecision, RoutingContext, RoutingMode, RoutingSubject, RoutingThresholds } from './routingTypes';

const inferLegacySubject = (name: string): RoutingSubject => {
  const value = name.toLowerCase();
  if (/english|tieng anh|language/.test(value)) return 'ENGLISH';
  if (/math|toán|toan/.test(value)) return 'MATH';
  if (/phys|physical|vật lý|vat ly/.test(value)) return 'PHYSICS';
  if (/chem|hóa|hoa hoc/.test(value)) return 'CHEMISTRY';
  if (/general|chung|fallback/.test(value)) return 'GENERAL';
  return 'UNKNOWN';
};

export const getActiveSubjectModelMap = async (ownerId: string): Promise<Record<string, string>> => {
  const registries = await ModelRegistry.find({ ownerId, routerEnabled: { $ne: false } }).lean();
  const map: Record<string, string> = {};
  for (const registry of registries) {
    const version = await ModelVersion.findOne({
      ownerId,
      modelRegistryId: registry._id,
      status: ModelVersionStatus.USE,
      routerEnabled: { $ne: false },
    }).sort({ updatedAt: -1 }).lean();
    if (!version?.hfRepoId) continue;
    const explicitSubject = (version.subject || registry.subject) as RoutingSubject | undefined;
    const subject = explicitSubject && explicitSubject !== 'UNKNOWN'
      ? explicitSubject
      : inferLegacySubject(registry.name);
    if (subject !== 'UNKNOWN' && !map[subject]) map[subject] = version.hfRepoId;
  }
  return map;
};

export const decideHybridRoute = async (args: {
  ownerId: string;
  question: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousSubject?: RoutingSubject;
  mode?: RoutingMode;
  sessionId?: string;
  modelMap?: Record<string, string>;
  persistLog?: boolean;
  thresholds?: Partial<RoutingThresholds>;
}): Promise<HybridRoutingDecision> => {
  const mode = args.mode || 'hybrid';
  const modelMap = { ...(await getActiveSubjectModelMap(args.ownerId)), ...(args.modelMap || {}) };
  let provider;
  if (mode === 'llm' || mode === 'hybrid') {
    try { provider = await apiKeyService.createProvider(args.ownerId, 'openrouter', true, 'google/gemini-2.5-flash'); }
    catch { provider = undefined; }
  }
  const context: RoutingContext = {
    question: args.question,
    history: args.history || [],
    previousSubject: args.previousSubject,
  };
  const decision = await hybridRoute({ context, mode, modelMap, llmProvider: provider, thresholds: args.thresholds });

  if (args.persistLog !== false && mongoose.Types.ObjectId.isValid(args.ownerId)) {
    await RoutingDecisionLog.create({
      ownerId: args.ownerId,
      sessionId: args.sessionId,
      inputHash: crypto.createHash('sha256').update(args.question).digest('hex'),
      mode,
      ruleResult: decision.ruleResult,
      llmResult: decision.llmResult,
      finalSubject: decision.subject,
      selectedModel: decision.selectedModel,
      strategy: decision.strategy,
      confidence: decision.confidence,
      needClarification: decision.needClarification,
      llmCalled: decision.llmCalled,
      latencyMs: decision.latencyMs,
    });
  }
  return decision;
};
