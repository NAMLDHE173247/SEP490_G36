import { ILlmProvider } from '../providers/ILlmProvider';
import { llmBasedRoute } from './llmRouter';
import { ruleBasedRoute } from './ruleBasedRouter';
import { DEFAULT_ROUTING_THRESHOLDS, HybridRoutingDecision, RoutingContext, RoutingMode, RoutingThresholds, RouterSignal } from './routingTypes';

type ModelMap = Partial<Record<string, string>>;

const attachModel = (signal: RouterSignal, map: ModelMap) => map[signal.subject] || map.GENERAL || map.DEFAULT;

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

  const finish = (signal: RouterSignal, strategy: HybridRoutingDecision['strategy'], llmCalled: boolean, llmResult?: RouterSignal): HybridRoutingDecision => ({
    ...signal,
    strategy,
    selectedModel: attachModel(signal, args.modelMap),
    fallbackUsed: signal.subject === 'GENERAL' || !args.modelMap[signal.subject],
    llmCalled,
    latencyMs: Date.now() - started,
    ruleResult: rule,
    ...(llmResult ? { llmResult } : {}),
  });

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

  const llm = await llmBasedRoute(args.context, args.llmProvider, args.llmModel);
  if (llm.confidence >= thresholds.llmConfidence && !llm.needClarification) {
    return finish(llm, 'llm', true, llm);
  }

  return finish({
    ...llm,
    subject: 'UNKNOWN',
    needClarification: true,
    reason: `Không đủ chắc chắn. Rule=${rule.confidence}, LLM=${llm.confidence}.`,
  }, 'clarification', true, llm);
};
