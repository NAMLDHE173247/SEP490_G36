import fs from 'fs';
import path from 'path';

type Condition = 'pooled' | 'oracle' | 'hybrid';
type ScoreMap = Record<Condition, Map<string, number[]>>;

const CONDITIONS: Condition[] = ['pooled', 'oracle', 'hybrid'];
const finiteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const sampleStd = (values: number[]): number => {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
};
const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const summarize = (values: number[]) => values.length ? {
  n: values.length,
  mean: mean(values),
  median: quantile(values, 0.5),
  standard_deviation: sampleStd(values),
  iqr: quantile(values, 0.75) - quantile(values, 0.25),
  min: Math.min(...values),
  max: Math.max(...values),
} : null;

const makeRng = (seed: number) => () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const bootstrapMeanCi = (values: number[], iterations = 10_000, seed = 49036) => {
  if (!values.length) return null;
  const random = makeRng(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let sample = 0; sample < values.length; sample += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    estimates.push(total / values.length);
  }
  return { lower: quantile(estimates, 0.025), upper: quantile(estimates, 0.975), iterations, seed };
};

// Abramowitz-Stegun approximation, sufficient for the Wilcoxon normal approximation.
const erf = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
};
const normalCdf = (value: number): number => 0.5 * (1 + erf(value / Math.sqrt(2)));

const wilcoxonSignedRank = (differences: number[]) => {
  const nonZero = differences.filter(value => Math.abs(value) > 1e-12);
  if (nonZero.length < 2) return null;
  const ordered = nonZero.map((value, index) => ({ value, absolute: Math.abs(value), index }))
    .sort((a, b) => a.absolute - b.absolute);
  const ranks = new Array<number>(ordered.length);
  const tieSizes: number[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && Math.abs(ordered[end].absolute - ordered[start].absolute) < 1e-12) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) ranks[index] = averageRank;
    if (end - start > 1) tieSizes.push(end - start);
    start = end;
  }
  let positiveRank = 0, negativeRank = 0;
  ordered.forEach((item, index) => {
    if (item.value > 0) positiveRank += ranks[index];
    else negativeRank += ranks[index];
  });
  const n = nonZero.length;
  const expected = n * (n + 1) / 4;
  const tieCorrection = tieSizes.reduce((sum, size) => sum + size * (size + 1) * (2 * size + 1), 0) / 48;
  const variance = n * (n + 1) * (2 * n + 1) / 24 - tieCorrection;
  const continuity = positiveRank > expected ? 0.5 : -0.5;
  const z = variance > 0 ? (positiveRank - expected - continuity) / Math.sqrt(variance) : 0;
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return { n, w_positive: positiveRank, w_negative: negativeRank, statistic: Math.min(positiveRank, negativeRank), z, p_value_two_sided: p, method: 'normal approximation with continuity and tie correction' };
};

const scoreFrom = (value: any): number | null => {
  const candidates = [
    value?.overall_score, value?.quality_score, value?.judge_score, value?.overall,
    value?.evaluation?.overall_score, value?.judge_result?.overall_score,
    value?.model_eval?.overall_score, value?.metrics?.overall_score,
  ];
  for (const candidate of candidates) {
    const score = finiteNumber(candidate);
    if (score !== null) return score;
  }
  return null;
};

const extractScores = (report: any): ScoreMap => {
  const scores: ScoreMap = { pooled: new Map(), oracle: new Map(), hybrid: new Map() };
  const add = (condition: unknown, conversationId: unknown, score: unknown) => {
    if (!CONDITIONS.includes(condition as Condition)) return;
    const value = finiteNumber(score);
    if (value === null) return;
    const key = String(conversationId || 'unknown');
    const conditionScores = scores[condition as Condition];
    conditionScores.set(key, [...(conditionScores.get(key) || []), value]);
  };

  for (const condition of CONDITIONS) {
    const conversations = report?.conditions?.[condition]?.conversations || [];
    for (const conversation of conversations) {
      let foundRunScore = false;
      for (const run of conversation.repetitions || []) {
        const score = scoreFrom(run);
        if (score !== null) {
          add(condition, conversation.conversation_id, score);
          foundRunScore = true;
        }
      }
      if (!foundRunScore) add(condition, conversation.conversation_id, scoreFrom(conversation));
    }
  }
  for (const item of report?.judge_results || report?.evaluation_results || []) {
    add(item.eval_condition, item.conversation_id, scoreFrom(item));
  }
  return scores;
};

const conditionMeans = (map: Map<string, number[]>): Map<string, number> => new Map(
  [...map.entries()].map(([key, values]) => [key, mean(values)]),
);

const pairedComparison = (leftName: Condition, rightName: Condition, scores: ScoreMap) => {
  const left = conditionMeans(scores[leftName]);
  const right = conditionMeans(scores[rightName]);
  const ids = [...left.keys()].filter(id => right.has(id)).sort();
  const differences = ids.map(id => (left.get(id) as number) - (right.get(id) as number));
  if (!differences.length) return {
    comparison: `${leftName}_minus_${rightName}`,
    n_pairs: 0,
    status: 'not_available',
    reason: 'No paired conversation-level judge scores were found.',
  };
  const standardDeviation = sampleStd(differences);
  return {
    comparison: `${leftName}_minus_${rightName}`,
    n_pairs: differences.length,
    mean_difference: mean(differences),
    median_difference: quantile(differences, 0.5),
    bootstrap_95_ci_mean_difference: bootstrapMeanCi(differences),
    paired_effect_size_cohens_dz: standardDeviation ? mean(differences) / standardDeviation : null,
    wilcoxon_signed_rank: wilcoxonSignedRank(differences),
    paired_conversation_ids: ids,
  };
};

const analyze = (report: any) => {
  const scores = extractScores(report);
  const descriptive: Record<string, any> = {};
  for (const condition of CONDITIONS) {
    const repetitionScores = [...scores[condition].values()].flat();
    const perConversation = [...conditionMeans(scores[condition]).values()];
    descriptive[condition] = {
      repetition_level: summarize(repetitionScores),
      conversation_level: summarize(perConversation),
      bootstrap_95_ci_conversation_mean: bootstrapMeanCi(perConversation),
    };
  }
  const comparisons: any[] = [
    pairedComparison('hybrid', 'pooled', scores),
    pairedComparison('oracle', 'pooled', scores),
    pairedComparison('hybrid', 'oracle', scores),
  ];
  const available = comparisons
    .map((comparison, index) => ({ comparison, index, p: comparison.wilcoxon_signed_rank?.p_value_two_sided }))
    .filter(item => typeof item.p === 'number')
    .sort((a, b) => a.p - b.p);
  let previousAdjusted = 0;
  available.forEach((item, rank) => {
    const adjusted = Math.min(1, Math.max(previousAdjusted, item.p * (available.length - rank)));
    item.comparison.wilcoxon_signed_rank.p_value_holm_adjusted = adjusted;
    previousAdjusted = adjusted;
  });

  return {
    generated_at: new Date().toISOString(),
    source_manifest: report.evaluation_manifest || null,
    quality_score_field_policy: 'overall_score, quality_score, judge_score, overall, or nested judge/evaluation overall_score',
    descriptive_quality_scores: descriptive,
    paired_quality_comparisons: comparisons,
    performance_telemetry: Object.fromEntries(CONDITIONS.map(condition => [condition, report?.conditions?.[condition]?.summary || null])),
    interpretation_guardrails: [
      'Conversation-level repeated scores are averaged before paired tests to avoid pseudo-replication.',
      'Wilcoxon p-values use a normal approximation; report this limitation for small samples.',
      'Holm correction is applied across the available pairwise Wilcoxon tests.',
      'A missing quality score is reported as unavailable and is never replaced with a synthetic value.',
    ],
  };
};

const selfTest = () => {
  const synthetic: any = { conditions: {} };
  for (const [condition, offset] of [['pooled', 0], ['oracle', 1.5], ['hybrid', 1]] as Array<[Condition, number]>) {
    synthetic.conditions[condition] = {
      summary: { avg_generation_latency_ms: 100 + offset },
      conversations: Array.from({ length: 12 }, (_, index) => ({
        conversation_id: `case-${index + 1}`,
        repetitions: [{ overall_score: 3 + offset + index * 0.01 }],
      })),
    };
  }
  const result: any = analyze(synthetic);
  const hybridVsPooled = result.paired_quality_comparisons[0];
  if (hybridVsPooled.n_pairs !== 12 || Math.abs(hybridVsPooled.mean_difference - 1) > 1e-9) {
    throw new Error('RP5 statistics self-test failed');
  }
  return { status: 'PASS', tested_pairs: hybridVsPooled.n_pairs, mean_difference: hybridVsPooled.mean_difference };
};

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  process.stdout.write(`${JSON.stringify(selfTest(), null, 2)}\n`);
  process.exit(0);
}

const source = args.find(value => !value.startsWith('--'));
if (!source) {
  process.stderr.write('Usage: npm run analyze:rp5 -- <rp5-report.json> [--out <analysis.json>]\n');
  process.exit(1);
}
const sourcePath = path.resolve(source);
const report = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const output = analyze(report);
const serialized = `${JSON.stringify(output, null, 2)}\n`;
const outIndex = args.indexOf('--out');
if (outIndex >= 0 && args[outIndex + 1]) {
  const outputPath = path.resolve(args[outIndex + 1]);
  fs.writeFileSync(outputPath, serialized, 'utf8');
  process.stderr.write(`RP5 analysis written to ${outputPath}\n`);
}
process.stdout.write(serialized);
