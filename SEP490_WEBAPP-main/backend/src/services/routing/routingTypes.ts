export type RoutingSubject = 'MATH' | 'PHYSICS' | 'CHEMISTRY' | 'GENERAL' | 'UNKNOWN';
export type RoutingIntent = 'solve_problem' | 'explain_concept' | 'give_hint' | 'check_answer' | 'diagnose_error' | 'ask_follow_up' | 'unknown';
export type RoutingMode = 'oracle' | 'rule' | 'llm' | 'hybrid' | 'direct';

export interface RoutingContext {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousSubject?: RoutingSubject;
}

export interface RouterSignal {
  subject: RoutingSubject;
  secondarySubjects: RoutingSubject[];
  intent: RoutingIntent;
  confidence: number;
  margin: number;
  needClarification: boolean;
  isInterdisciplinary: boolean;
  matchedTerms: string[];
  reason: string;
}

export interface HybridRoutingDecision extends RouterSignal {
  strategy: RoutingMode | 'clarification';
  selectedModel?: string;
  fallbackUsed: boolean;
  llmCalled: boolean;
  latencyMs: number;
  ruleResult?: RouterSignal;
  llmResult?: RouterSignal;
}

export interface RoutingThresholds {
  ruleConfidence: number;
  ruleMargin: number;
  llmConfidence: number;
}

export const DEFAULT_ROUTING_THRESHOLDS: RoutingThresholds = {
  ruleConfidence: 0.8,
  ruleMargin: 0.25,
  llmConfidence: 0.7,
};
