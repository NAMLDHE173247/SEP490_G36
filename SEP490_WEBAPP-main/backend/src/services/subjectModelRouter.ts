export type SubjectModelMap = Record<string, string | undefined>;

export interface SubjectRouteDecision {
  subject: string;
  selectedModel: string;
  fallbackUsed: boolean;
  strategy: 'verified-subject-map';
}

const SUBJECT_ALIASES: Record<string, string> = {
  MATH: 'MATH',
  MATHEMATICS: 'MATH',
  TOAN: 'MATH',
  PHYSICS: 'PHYSICS',
  PHYSICAL: 'PHYSICS',
  PHYSIC: 'PHYSICS',
  LY: 'PHYSICS',
  'VAT LY': 'PHYSICS',
  GENERAL: 'GENERAL',
  OUT_OF_SCOPE: 'GENERAL',
  UNGROUPED: 'GENERAL',
};

export const normalizeSubjectForRouting = (subject: unknown): string => {
  const raw = String(subject || 'GENERAL')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D');
  return SUBJECT_ALIASES[raw] || raw;
};

/**
 * Deterministic oracle router used for the component-level RP4 experiment.
 * The subject must come from a verified dataset label. Semantic prediction is
 * evaluated separately and must not silently replace the gold subject here.
 */
export const routeVerifiedSubject = (
  subject: unknown,
  modelMap: SubjectModelMap,
): SubjectRouteDecision => {
  const normalizedSubject = normalizeSubjectForRouting(subject);
  const direct = modelMap[normalizedSubject];
  const fallback = modelMap.GENERAL || modelMap.DEFAULT;
  const selectedModel = direct || fallback;

  if (!selectedModel) {
    throw new Error(`No model configured for subject ${normalizedSubject} and no GENERAL fallback exists`);
  }

  return {
    subject: normalizedSubject,
    selectedModel,
    fallbackUsed: !direct,
    strategy: 'verified-subject-map',
  };
};
