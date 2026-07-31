import assert from 'node:assert/strict';
import {
  buildHumanAuditSummary,
  computeHumanOutcomes,
  deriveHumanAiConflict,
  validateHumanAuditScores,
} from '../services/humanAuditService';

const allFive = {
  A1: 5, A2: 5, A3: 5, B1: 5, B2: 5, C1: 5, C2: 5, C3: 5, D1: 5,
};

assert.throws(
  () => validateHumanAuditScores({ ...allFive, A2: 3 }, {}),
  /điểm trung gian/,
  'Intermediate scores must carry an auditable reason',
);

assert.throws(
  () => validateHumanAuditScores({ ...allFive, A2: 3 }, { A2: '   ' }),
  /cần nhập lý do/,
  'Whitespace-only reasons must not satisfy the audit requirement',
);

const shortReason = validateHumanAuditScores(
  { ...allFive, A2: 3 },
  { A2: 's' },
);
assert.equal(shortReason.reasons.A2, 's', 'Any non-empty reason is accepted; length is not an ad-hoc validity rule');

const validated = validateHumanAuditScores(
  { ...allFive, A2: 3 },
  { A2: 'Câu hỏi còn chung chung và chưa chỉ rõ bước tiếp theo.' },
);
assert.equal(validated.scores.A2, 3);

const capped = computeHumanOutcomes({ ...allFive, A1: 1, A2: 5, A3: 5 });
assert.equal(capped.socratic_s_raw, 3.667);
assert.equal(capped.socratic_s, 1);
assert.equal(capped.a1_cap_applied, true);

const critical = deriveHumanAiConflict(allFive, { ...allFive, A1: 1 });
assert.equal(critical.severity, 'critical');
assert.equal(critical.has_conflict, true);

const matchingReview = {
  verdict: 'agree',
  human_scores: allFive,
  human_outcomes: computeHumanOutcomes(allFive),
  conflict: deriveHumanAiConflict(allFive, allFive),
};
const summary = buildHumanAuditSummary([
  { criteria_scores: allFive, human_review: matchingReview },
  { criteria_scores: allFive, human_review: matchingReview },
]);
assert.equal(summary.reviewed_items, 2);
assert.equal(summary.conflict_items, 0);
assert.equal(summary.criteria_agreement.A1.quadratic_weighted_kappa, 1);

console.log('Human Audit service self-test passed.');
