import assert from 'node:assert/strict';
import { computeInterRaterState, computeMultiRaterAgreement } from '../controllers/humanAuditController';

const review = (scores: Record<string, number>) => ({ verdict: 'reviewed', humanScores: scores });
const reviewWithAiConflict = (scores: Record<string, number>, severity: string, criteria: string[], maxDelta: number) => ({
  ...review(scores),
  aiConflict: { has_conflict: true, severity, criteria, max_delta: maxDelta },
});
const base = { A1: 4, A2: 3, A3: 3, B1: 5, B2: 5, C1: 4, C2: 4, C3: 4, D1: 5 };

const agreement = computeInterRaterState([
  review(base),
  review({ ...base, A2: 4 }),
]);
assert.equal(agreement.status, 'conflict');
assert.equal(agreement.severity, 'minor');

const exact = computeInterRaterState([review(base), review(base)]);
assert.equal(exact.status, 'agreement');
assert.equal(exact.severity, 'none');

// AI and Staff are evaluated in the same conflict state, even when Staff agree.
const unifiedAiConflict = computeInterRaterState([
  reviewWithAiConflict(base, 'major', ['A2'], 2),
  reviewWithAiConflict(base, 'major', ['A2'], 2),
]);
assert.equal(unifiedAiConflict.status, 'conflict');
assert.equal(unifiedAiConflict.human_human_severity, 'none');
assert.equal(unifiedAiConflict.human_ai_severity, 'major');
assert.ok(unifiedAiConflict.conflict_criteria.includes('A2'));

const singleStaffVsAi = computeInterRaterState([
  reviewWithAiConflict(base, 'critical', ['B1'], 4),
]);
assert.equal(singleStaffVsAi.status, 'conflict');
assert.equal(singleStaffVsAi.severity, 'critical');

const major = computeInterRaterState([
  review(base),
  review({ ...base, A2: 1 }),
]);
assert.equal(major.status, 'conflict');
assert.equal(major.severity, 'major');
assert.ok(major.conflict_criteria.includes('A2'));

const criticalA1 = computeInterRaterState([
  review(base),
  review({ ...base, A1: 1 }),
]);
assert.equal(criticalA1.severity, 'critical');
assert.equal(criticalA1.a1_polarity_conflict, true);

const criticalFact = computeInterRaterState([
  review(base),
  review({ ...base, B1: 2 }),
]);
assert.equal(criticalFact.severity, 'critical');
assert.equal(criticalFact.factual_polarity_conflict, true);

const resolved = computeInterRaterState([review(base), review({ ...base, A1: 1 })], { finalScores: base });
assert.equal(resolved.status, 'resolved');
assert.equal(resolved.adjudicated, true);

const multiAgreement = computeMultiRaterAgreement([
  { ...review(base), convIndex: 1, reviewerId: 'staff-a' },
  { ...review({ ...base, A2: 4 }), convIndex: 1, reviewerId: 'staff-b' },
  { ...review(base), convIndex: 2, reviewerId: 'staff-a' },
  { ...review(base), convIndex: 2, reviewerId: 'staff-b' },
]);
assert.equal(multiAgreement.reviewer_count, 2);
assert.equal(multiAgreement.criteria.A1.pair_count, 2);
assert.equal(multiAgreement.criteria.A1.exact_agreement_rate, 1);
assert.equal(multiAgreement.criteria.A2.within_one_agreement_rate, 1);

console.log('Human Audit multi-rater workflow self-test passed.');
