import crypto from 'crypto';
import mongoose from 'mongoose';
import { ModelRegistry } from '../../models/ModelRegistry';
import { ModelVersion, ModelVersionStatus } from '../../models/ModelVersion';
import { RoutingDecisionLog } from '../../models/RoutingDecisionLog';
import { apiKeyService } from '../apiKeyService';
import { hybridRoute } from './hybridRouter';
import { ruleBasedRoute } from './ruleBasedRouter';
import { HybridRoutingDecision, RoutingContext, RoutingMode, RoutingSubject, RoutingThresholds } from './routingTypes';

const ACTIVE_MODEL_MAP_TTL_MS = 30_000;
const STICKY_ROUTE_TTL_MS = 30 * 60_000;
const MAX_STICKY_ROUTES = 1_000;
const activeModelMapCache = new Map<string, { expiresAt: number; value: Record<string, string> }>();
const stickyRouteCache = new Map<string, { expiresAt: number; subject: string; selectedModel: string }>();

const inferLegacySubject = (name: string): RoutingSubject => {
  const value = name.toLowerCase();
  if (/english|tieng anh|language/.test(value)) return 'ENGLISH';
  if (/math|toán|toan/.test(value)) return 'MATH';
  if (/phys|physical|vật lý|vat ly/.test(value)) return 'PHYSICS';
  if (/chem|hóa|hoa hoc/.test(value)) return 'CHEMISTRY';
  if (/other|khac|khác|chat|faq/.test(value)) return 'OTHER';
  if (/general|chung|fallback/.test(value)) return 'GENERAL';
  return 'UNKNOWN';
};

export const getActiveSubjectModelMap = async (ownerId: string): Promise<Record<string, string>> => {
  const cached = activeModelMapCache.get(ownerId);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value };
  const registries = await ModelRegistry.find({ ownerId, routerEnabled: { $ne: false } }).lean();
  const versions = await ModelVersion.find({
    ownerId,
    modelRegistryId: { $in: registries.map(registry => registry._id) },
    status: ModelVersionStatus.USE,
    routerEnabled: { $ne: false },
  }).sort({ updatedAt: -1 }).lean();
  const versionByRegistry = new Map<string, typeof versions[number]>();
  for (const version of versions) {
    const key = String(version.modelRegistryId);
    if (!versionByRegistry.has(key)) versionByRegistry.set(key, version);
  }
  const map: Record<string, string> = {};
  for (const registry of registries) {
    const version = versionByRegistry.get(String(registry._id));
    if (!version?.hfRepoId) continue;
    const explicitSubject = (version.subject || registry.subject) as RoutingSubject | undefined;
    const subject = explicitSubject && explicitSubject !== 'UNKNOWN'
      ? explicitSubject
      : inferLegacySubject(registry.name);
    if (subject !== 'UNKNOWN' && !map[subject]) map[subject] = version.hfRepoId;
  }
  activeModelMapCache.set(ownerId, { expiresAt: Date.now() + ACTIVE_MODEL_MAP_TTL_MS, value: map });
  return { ...map };
};

const stickyRouteKey = (ownerId: string, sessionId?: string) => sessionId
  ? `${ownerId}:${sessionId}`
  : null;

const pruneStickyRoutes = () => {
  const now = Date.now();
  for (const [key, value] of stickyRouteCache) {
    if (value.expiresAt <= now) stickyRouteCache.delete(key);
  }
  while (stickyRouteCache.size > MAX_STICKY_ROUTES) {
    const oldestKey = stickyRouteCache.keys().next().value;
    if (!oldestKey) break;
    stickyRouteCache.delete(oldestKey);
  }
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
  const startedAt = Date.now();
  const mode = args.mode || 'hybrid';
  const modelMap = { ...(await getActiveSubjectModelMap(args.ownerId)), ...(args.modelMap || {}) };
  const context: RoutingContext = {
    question: args.question,
    history: args.history || [],
    previousSubject: args.previousSubject,
  };
  const routeKey = stickyRouteKey(args.ownerId, args.sessionId);
  const sticky = routeKey ? stickyRouteCache.get(routeKey) : undefined;
  const fastRule = ruleBasedRoute({ ...context, history: context.history.slice(-4) });
  const explicitSubjectSwitch = Boolean(
    sticky
    && fastRule.subject !== 'UNKNOWN'
    && fastRule.subject !== sticky.subject
    && fastRule.matchedTerms.length > 0,
  );
  let decision: HybridRoutingDecision;
  if (mode === 'hybrid' && sticky && sticky.expiresAt > Date.now() && !explicitSubjectSwitch) {
    decision = {
      ...fastRule,
      subject: sticky.subject,
      selectedModel: modelMap[sticky.subject] || sticky.selectedModel,
      strategy: 'sticky',
      fallbackUsed: ['OTHER', 'GENERAL'].includes(sticky.subject),
      needClarification: false,
      llmCalled: false,
      confidence: Math.max(0.9, fastRule.confidence),
      latencyMs: Date.now() - startedAt,
      reason: `Sticky route reused for session; ${fastRule.reason}`,
      ruleResult: fastRule,
    };
  } else {
    let provider;
    if (mode === 'llm' || mode === 'hybrid') {
      try { provider = await apiKeyService.createProvider(args.ownerId, 'openrouter', true, 'google/gemini-2.5-flash'); }
      catch { provider = undefined; }
    }
    decision = await hybridRoute({ context, mode, modelMap, llmProvider: provider, thresholds: args.thresholds });
  }

  if (routeKey && decision.selectedModel && !decision.needClarification && decision.subject !== 'UNKNOWN') {
    stickyRouteCache.delete(routeKey);
    stickyRouteCache.set(routeKey, {
      expiresAt: Date.now() + STICKY_ROUTE_TTL_MS,
      subject: decision.subject,
      selectedModel: decision.selectedModel,
    });
    pruneStickyRoutes();
  }

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
