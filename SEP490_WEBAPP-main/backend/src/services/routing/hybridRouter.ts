import { ILlmProvider } from '../providers/ILlmProvider';
import { llmBasedRoute } from './llmRouter';
import { ruleBasedRoute } from './ruleBasedRouter';
import { DEFAULT_ROUTING_THRESHOLDS, HybridRoutingDecision, RoutingContext, RoutingMode, RoutingThresholds, RouterSignal } from './routingTypes';

type ModelMap = Partial<Record<string, string>>;

const normalizeDeploymentSubject = (signal: RouterSignal, map: ModelMap): RouterSignal => {
  // GENERAL is the legacy label for greetings and casual conversation.
  // New datasets and model registries use OTHER.
  if (signal.subject === 'GENERAL' && map.OTHER && !map.GENERAL) {
    return { ...signal, subject: 'OTHER' };
  }
  return signal;
};

const attachModel = (signal: RouterSignal, map: ModelMap) =>
  map[signal.subject]
  || (signal.subject === 'GENERAL' ? map.OTHER : undefined)
  || map.GENERAL
  || map.OTHER
  || map.DEFAULT;

export const hybridRoute = async (args: {
  context: RoutingContext;
  mode?: RoutingMode;
  modelMap: ModelMap;
  llmProvider?: ILlmProvider;
  llmModel?: string;
  thresholds?: Partial<RoutingThresholds>;
}): Promise<HybridRoutingDecision> => {
  const started = Date.now();
  const mode = args.mode || 'hybrid';
  const thresholds = { ...DEFAULT_ROUTING_THRESHOLDS, ...(args.thresholds || {}) };
  const rule = ruleBasedRoute(args.context);

  const finish = (signal: RouterSignal, strategy: HybridRoutingDecision['strategy'], llmCalled: boolean, llmResult?: RouterSignal): HybridRoutingDecision => {
    const resolvedSignal = normalizeDeploymentSubject(signal, args.modelMap);
    return {
      ...resolvedSignal,
      strategy,
      selectedModel: attachModel(resolvedSignal, args.modelMap),
      fallbackUsed:
        resolvedSignal.subject === 'OTHER'
        || resolvedSignal.subject === 'GENERAL'
        || !args.modelMap[resolvedSignal.subject],
      llmCalled,
      latencyMs: Date.now() - started,
      ruleResult: rule,
      ...(llmResult ? { llmResult } : {}),
    };
  };

  if (mode === 'rule') return finish(rule, rule.needClarification ? 'clarification' : 'rule', false);
  if (mode === 'oracle') return finish(rule, 'oracle', false);

  const ruleAccepted = rule.confidence >= thresholds.ruleConfidence
    && rule.margin >= thresholds.ruleMargin
    && !rule.needClarification
    && !rule.isInterdisciplinary;
  if (mode === 'hybrid' && ruleAccepted) return finish(rule, 'rule', false);

  if (!args.llmProvider) {
    return finish({ ...rule, needClarification: true, reason: `${rule.reason} LLM Router chưa được cấu hình.` }, 'clarification', false);
  }

  const llm = await llmBasedRoute(args.context, args.llmProvider, args.llmModel, Object.keys(args.modelMap));
  const sameSubject = llm.subject === rule.subject;
  const llmIsStrong = llm.confidence >= thresholds.llmConfidence && !llm.needClarification;
  const ruleIsUsable = rule.subject !== 'UNKNOWN' && !rule.needClarification;
  // When both routers are confident but disagree, prefer the semantic router
  // only when it has a meaningful confidence advantage; otherwise ask for
  // clarification instead of silently hiding a routing conflict.
  const llmWinsConflict = llmIsStrong && (!ruleIsUsable || sameSubject || llm.confidence >= rule.confidence + 0.1);
  if (llmWinsConflict) {
    return finish(llm, 'llm', true, llm);
  }

  if (ruleIsUsable && sameSubject) return finish({ ...rule, reason: `${rule.reason}; LLM xác nhận cùng subject.` }, 'hybrid', true, llm);

  return finish({
    ...llm,
    subject: 'UNKNOWN',
    needClarification: true,
    reason: `Không đủ chắc chắn. Rule=${rule.confidence}, LLM=${llm.confidence}.`,
  }, 'clarification', true, llm);
};
