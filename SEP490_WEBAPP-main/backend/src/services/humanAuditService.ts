export const HUMAN_AUDIT_RUBRIC_VERSION = 'RP5-human-audit-v2';

export const HUMAN_AUDIT_CRITERIA = [
  'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1',
] as const;

export type HumanAuditCriterion = typeof HUMAN_AUDIT_CRITERIA[number];
export type HumanAuditScores = Record<HumanAuditCriterion, number>;
export type HumanAuditReasons = Partial<Record<HumanAuditCriterion, string>>;
export type ConflictSeverity = 'none' | 'minor' | 'major' | 'critical';

export type HumanAuditConflict = {
  has_conflict: boolean;
  severity: ConflictSeverity;
  criteria: HumanAuditCriterion[];
  max_delta: number;
  summary: string;
  deltas: Record<HumanAuditCriterion, number>;
};

const clampScore = (value: number) => Math.max(0, Math.min(5, value));

export function validateHumanAuditScores(
  rawScores: unknown,
  rawReasons: unknown,
): { scores: HumanAuditScores; reasons: HumanAuditReasons } {
  if (!rawScores || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
    throw new Error('human_scores phải chứa đủ điểm A1–D1');
  }
  const reasonSource = rawReasons && typeof rawReasons === 'object' && !Array.isArray(rawReasons)
    ? rawReasons as Record<string, unknown>
    : {};
  const scoreSource = rawScores as Record<string, unknown>;
  const scores = {} as HumanAuditScores;
  const reasons: HumanAuditReasons = {};

  for (const criterion of HUMAN_AUDIT_CRITERIA) {
    const value = Number(scoreSource[criterion]);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      throw new Error(`${criterion} phải là số nguyên từ 0 đến 5`);
    }
    const reason = String(reasonSource[criterion] || '').trim();
    if ([2, 3, 4].includes(value) && !reason) {
      throw new Error(`${criterion}=${value} là điểm trung gian; cần nhập lý do`);
    }
    scores[criterion] = value;
    if (reason) reasons[criterion] = reason;
  }
  return { scores, reasons };
}

export function computeHumanOutcomes(scores: HumanAuditScores) {
  const socraticRaw = (scores.A1 + scores.A2 + scores.A3) / 3;
  const a1CapApplied = scores.A1 <= 1;
  return {
    knowledge_k: scores.B1,
    socratic_s_raw: Number(socraticRaw.toFixed(3)),
    socratic_s: Number((a1CapApplied ? Math.min(socraticRaw, 1) : socraticRaw).toFixed(3)),
    a1_cap_applied: a1CapApplied,
  };
}

export function deriveHumanAiConflict(
  aiScoresRaw: Record<string, unknown> | null | undefined,
  humanScores: HumanAuditScores,
): HumanAuditConflict {
  const aiScores = aiScoresRaw || {};
  const deltas = {} as Record<HumanAuditCriterion, number>;
  const different: HumanAuditCriterion[] = [];

  for (const criterion of HUMAN_AUDIT_CRITERIA) {
    const ai = clampScore(Number(aiScores[criterion] ?? 0));
    const delta = Number(Math.abs(humanScores[criterion] - ai).toFixed(3));
    deltas[criterion] = delta;
    if (delta >= 1) different.push(criterion);
  }

  const maxDelta = Math.max(...Object.values(deltas));
  const aiA1Violation = Number(aiScores.A1 ?? 5) <= 1;
  const humanA1Violation = humanScores.A1 <= 1;
  const factualPolarityConflict = ['B1', 'D1'].some((criterion) => {
    const ai = Number(aiScores[criterion] ?? 0);
    const human = humanScores[criterion as HumanAuditCriterion];
    return (ai >= 4 && human <= 2) || (human >= 4 && ai <= 2);
  });

  let severity: ConflictSeverity = 'none';
  if (aiA1Violation !== humanA1Violation || factualPolarityConflict) severity = 'critical';
  else if (maxDelta >= 2) severity = 'major';
  else if (maxDelta >= 1) severity = 'minor';

  const summary = severity === 'none'
    ? 'Điểm Human và AI Judge không lệch quá 1 điểm ở bất kỳ tiêu chí nào.'
    : severity === 'critical'
      ? 'Xung đột nghiêm trọng ở guardrail A1 hoặc độ chính xác kiến thức/hallucination.'
      : severity === 'major'
        ? 'Có ít nhất một tiêu chí lệch từ 2 điểm trở lên.'
        : 'Có ít nhất một tiêu chí lệch 1 điểm.';

  return {
    has_conflict: severity !== 'none',
    severity,
    criteria: different,
    max_delta: Number(maxDelta.toFixed(3)),
    summary,
    deltas,
  };
}

type ReviewBearingResult = {
  criteria_scores?: Record<string, unknown>;
  human_review?: {
    verdict?: string;
    human_scores?: Partial<HumanAuditScores>;
    conflict?: HumanAuditConflict;
    human_outcomes?: ReturnType<typeof computeHumanOutcomes>;
  } | null;
};

export function quadraticWeightedKappa(aiValues: number[], humanValues: number[]): number | null {
  if (aiValues.length !== humanValues.length || aiValues.length < 2) return null;
  const categories = 6;
  const observed = Array.from({ length: categories }, () => Array(categories).fill(0));
  const aiHist = Array(categories).fill(0);
  const humanHist = Array(categories).fill(0);

  aiValues.forEach((value, index) => {
    const ai = Math.round(clampScore(value));
    const human = Math.round(clampScore(humanValues[index]));
    observed[ai][human] += 1;
    aiHist[ai] += 1;
    humanHist[human] += 1;
  });

  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  const denominator = (categories - 1) ** 2;
  for (let ai = 0; ai < categories; ai += 1) {
    for (let human = 0; human < categories; human += 1) {
      const weight = ((ai - human) ** 2) / denominator;
      observedDisagreement += weight * observed[ai][human];
      expectedDisagreement += weight * ((aiHist[ai] * humanHist[human]) / aiValues.length);
    }
  }
  if (expectedDisagreement === 0) return observedDisagreement === 0 ? 1 : null;
  return Number((1 - observedDisagreement / expectedDisagreement).toFixed(4));
}

export function buildHumanAuditSummary(results: ReviewBearingResult[]) {
  const reviewed = results.filter((result) => (
    result.human_review?.verdict !== 'skip'
    && result.human_review?.human_scores
  ));
  const skipped = results.filter((result) => result.human_review?.verdict === 'skip').length;
  const conflicts = reviewed.filter((result) => result.human_review?.conflict?.has_conflict);
  const byCriterion: Record<string, Record<string, number | null>> = {};

  for (const criterion of HUMAN_AUDIT_CRITERIA) {
    const pairs = reviewed.flatMap((result) => {
      const ai = Number(result.criteria_scores?.[criterion]);
      const human = Number(result.human_review?.human_scores?.[criterion]);
      return Number.isFinite(ai) && Number.isFinite(human) ? [{ ai, human }] : [];
    });
    const exact = pairs.filter((pair) => Math.abs(pair.ai - pair.human) < 0.5).length;
    const withinOne = pairs.filter((pair) => Math.abs(pair.ai - pair.human) <= 1).length;
    const mae = pairs.length
      ? pairs.reduce((sum, pair) => sum + Math.abs(pair.ai - pair.human), 0) / pairs.length
      : null;
    byCriterion[criterion] = {
      n: pairs.length,
      exact_agreement_rate: pairs.length ? Number((exact / pairs.length).toFixed(4)) : null,
      within_one_agreement_rate: pairs.length ? Number((withinOne / pairs.length).toFixed(4)) : null,
      mean_absolute_difference: mae === null ? null : Number(mae.toFixed(4)),
      quadratic_weighted_kappa: quadraticWeightedKappa(
        pairs.map((pair) => pair.ai),
        pairs.map((pair) => pair.human),
      ),
    };
  }

  const average = (values: number[]) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
    : null;

  return {
    rubric_version: HUMAN_AUDIT_RUBRIC_VERSION,
    total_items: results.length,
    reviewed_items: reviewed.length,
    skipped_items: skipped,
    pending_items: Math.max(0, results.length - reviewed.length - skipped),
    completion_rate: results.length ? Number(((reviewed.length + skipped) / results.length).toFixed(4)) : 0,
    conflict_items: conflicts.length,
    conflict_rate: reviewed.length ? Number((conflicts.length / reviewed.length).toFixed(4)) : 0,
    critical_conflicts: conflicts.filter((result) => result.human_review?.conflict?.severity === 'critical').length,
    major_conflicts: conflicts.filter((result) => result.human_review?.conflict?.severity === 'major').length,
    human_mean_k: average(reviewed.map((result) => Number(result.human_review?.human_outcomes?.knowledge_k))),
    human_mean_s: average(reviewed.map((result) => Number(result.human_review?.human_outcomes?.socratic_s))),
    criteria_agreement: byCriterion,
  };
}
