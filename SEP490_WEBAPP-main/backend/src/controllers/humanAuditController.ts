import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ModelEvaluation } from '../models/Evaluation';
import { TrainingHistory } from '../models/TrainingHistory';
import { User } from '../models/User';
import {
  HumanAuditAdjudication,
  HumanAuditAssignment,
  HumanAuditReview,
} from '../models/HumanAudit';
import { getAuthUserId } from '../utils/auth';
import {
  HUMAN_AUDIT_RUBRIC_VERSION,
  buildHumanAuditSummary,
  computeHumanOutcomes,
  deriveHumanAiConflict,
  quadraticWeightedKappa,
  validateHumanAuditScores,
} from '../services/humanAuditService';

const CRITERIA = ['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1'] as const;

function roleOf(req: Request) {
  return String((req as any).user?.role || '').toLowerCase();
}

function managerOwnerFilter(req: Request) {
  const userId = getAuthUserId(req);
  return roleOf(req) === 'admin' ? {} : { ownerId: userId };
}

async function findManagedEvaluation(req: Request, modelEvalId: string) {
  return ModelEvaluation.findOne({ modelEvalId, ...managerOwnerFilter(req) });
}

function reviewableEvaluationFilter(req: Request) {
  return roleOf(req) === 'supervisor' ? managerOwnerFilter(req) : {};
}

async function findReviewableEvaluation(req: Request, modelEvalId: string) {
  const evaluation = await ModelEvaluation.findOne({ modelEvalId, ...reviewableEvaluationFilter(req) });
  if (!evaluation) return null;
  if (roleOf(req) === 'checker') {
    const checkerId = getAuthUserId(req);
    const assigned = checkerId && await HumanAuditAssignment.exists({ modelEvalId, checkerId });
    if (!assigned) return null;
  }
  return evaluation;
}

export function computeInterRaterState(reviews: any[], adjudication?: any) {
  const scored = reviews.filter(review => review.verdict === 'reviewed' && review.humanScores);
  const criterionRanges: Record<string, { min: number; max: number; range: number }> = {};
  let maxDelta = 0;
  const conflictCriteria: string[] = [];
  for (const criterion of CRITERIA) {
    const values = scored.map(review => Number(review.humanScores?.[criterion])).filter(Number.isFinite);
    if (!values.length) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    criterionRanges[criterion] = { min, max, range };
    maxDelta = Math.max(maxDelta, range);
    if (range >= 2) conflictCriteria.push(criterion);
  }
  const a1Polarity = new Set(scored.map(review => Number(review.humanScores?.A1) <= 1)).size > 1;
  const factualPolarity = ['B1', 'D1'].some(criterion => {
    const values = scored.map(review => Number(review.humanScores?.[criterion])).filter(Number.isFinite);
    return values.some(value => value <= 2) && values.some(value => value >= 4);
  });
  const humanSeverity = a1Polarity || factualPolarity
    ? 'critical'
    : maxDelta >= 2
      ? 'major'
      : maxDelta >= 1
        ? 'minor'
        : 'none';
  const aiConflicts = scored.map(review => review.aiConflict).filter(conflict => conflict?.has_conflict);
  const severityRank: Record<string, number> = { none: 0, minor: 1, major: 2, critical: 3 };
  const aiSeverity = aiConflicts.reduce((highest, conflict) => (
    severityRank[String(conflict.severity || 'none')] > severityRank[highest]
      ? String(conflict.severity)
      : highest
  ), 'none');
  const severity = severityRank[aiSeverity] > severityRank[humanSeverity] ? aiSeverity : humanSeverity;
  const aiConflictCriteria = [...new Set(aiConflicts.flatMap(conflict => (
    Array.isArray(conflict.criteria) ? conflict.criteria.map(String) : []
  )))];
  const unifiedConflictCriteria = [...new Set([...conflictCriteria, ...aiConflictCriteria])];
  const aiMaxDelta = aiConflicts.reduce((max, conflict) => Math.max(max, Number(conflict.max_delta) || 0), 0);
  return {
    reviewer_count: scored.length,
    skipped_count: reviews.filter(review => review.verdict === 'skip').length,
    status: adjudication
      ? 'resolved'
      : scored.length === 0
        ? 'insufficient'
        : severity !== 'none'
          ? 'conflict'
          : scored.length < 2
            ? 'insufficient'
            : 'agreement',
    severity,
    max_delta: Math.max(maxDelta, aiMaxDelta),
    conflict_criteria: unifiedConflictCriteria,
    human_human_severity: humanSeverity,
    human_ai_severity: aiSeverity,
    human_ai_conflict_count: aiConflicts.length,
    human_ai_conflict_criteria: aiConflictCriteria,
    criterion_ranges: criterionRanges,
    a1_polarity_conflict: a1Polarity,
    factual_polarity_conflict: factualPolarity,
    adjudicated: Boolean(adjudication),
  };
}

export function computeMultiRaterAgreement(reviews: any[]) {
  const scored = reviews.filter(review => review.verdict === 'reviewed' && review.humanScores);
  const byConv = new Map<number, any[]>();
  scored.forEach(review => byConv.set(review.convIndex, [...(byConv.get(review.convIndex) || []), review]));
  const criteria: Record<string, any> = {};
  for (const criterion of CRITERIA) {
    const left: number[] = [];
    const right: number[] = [];
    for (const itemReviews of byConv.values()) {
      for (let i = 0; i < itemReviews.length; i += 1) {
        for (let j = i + 1; j < itemReviews.length; j += 1) {
          const a = Number(itemReviews[i].humanScores?.[criterion]);
          const b = Number(itemReviews[j].humanScores?.[criterion]);
          if (Number.isFinite(a) && Number.isFinite(b)) {
            left.push(a);
            right.push(b);
          }
        }
      }
    }
    const differences = left.map((value, index) => Math.abs(value - right[index]));
    criteria[criterion] = {
      pair_count: differences.length,
      exact_agreement_rate: differences.length ? differences.filter(value => value === 0).length / differences.length : null,
      within_one_agreement_rate: differences.length ? differences.filter(value => value <= 1).length / differences.length : null,
      mean_absolute_difference: differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null,
      quadratic_weighted_kappa: quadraticWeightedKappa(left, right),
    };
  }
  return {
    reviewer_count: new Set(scored.map(review => String(review.reviewerId))).size,
    reviewed_item_count: byConv.size,
    criteria,
  };
}

export const listHumanAuditStaff = async (_req: Request, res: Response) => {
  const staff = await User.find({ role: 'staff', status: 'active' }).select('_id name email').sort({ name: 1 }).lean();
  return res.json(staff.map(user => ({ id: String(user._id), name: user.name, email: user.email })));
};

export const listHumanAuditCheckers = async (_req: Request, res: Response) => {
  const checkers = await User.find({ role: 'checker', status: 'active' }).select('_id name email').sort({ name: 1 }).lean();
  return res.json(checkers.map(user => ({ id: String(user._id), name: user.name, email: user.email })));
};

export const listManagedHumanAudits = async (req: Request, res: Response) => {
  const checkerEvalIds = roleOf(req) === 'checker'
    ? await HumanAuditAssignment.distinct('modelEvalId', { checkerId: getAuthUserId(req) })
    : null;
  const evaluations = await ModelEvaluation.find({
    ...reviewableEvaluationFilter(req),
    ...(checkerEvalIds ? { modelEvalId: { $in: checkerEvalIds } } : {}),
    status: 'COMPLETED',
    'results.0': { $exists: true },
  }).sort({ completedAt: -1 }).select('modelEvalId jobId ftModelRepo totalConversations completedAt').lean();
  const evalIds = evaluations.map(item => item.modelEvalId);
  const [assignments, reviews, adjudications, histories] = await Promise.all([
    HumanAuditAssignment.find({ modelEvalId: { $in: evalIds } }).populate('checkerId', 'name email').lean(),
    HumanAuditReview.find({ modelEvalId: { $in: evalIds } }).lean(),
    HumanAuditAdjudication.find({ modelEvalId: { $in: evalIds } }).lean(),
    TrainingHistory.find({ jobId: { $in: evaluations.map(item => item.jobId) } }).select('jobId projectName').lean(),
  ]);
  const projectByJob = new Map(histories.map(item => [item.jobId, item.projectName]));
  return res.json(evaluations.map(evaluation => {
    const evalAssignments = assignments.filter(item => item.modelEvalId === evaluation.modelEvalId);
    const evalReviews = reviews.filter(item => item.modelEvalId === evaluation.modelEvalId);
    const evalAdjudications = adjudications.filter(item => item.modelEvalId === evaluation.modelEvalId);
    const packageChecker: any = evalAssignments.find(item => item.checkerId)?.checkerId;
    const byConv = new Map<number, any[]>();
    evalReviews.forEach(review => byConv.set(review.convIndex, [...(byConv.get(review.convIndex) || []), review]));
    const states = [...byConv.entries()].map(([convIndex, rows]) => computeInterRaterState(
      rows,
      evalAdjudications.find(item => item.convIndex === convIndex),
    ));
    return {
      modelEvalId: evaluation.modelEvalId,
      jobId: evaluation.jobId,
      projectName: projectByJob.get(evaluation.jobId) || evaluation.jobId,
      packageLabel: `${projectByJob.get(evaluation.jobId) || evaluation.jobId} · ${evaluation.totalConversations} câu`,
      ftModelRepo: evaluation.ftModelRepo,
      totalConversations: evaluation.totalConversations,
      completedAt: evaluation.completedAt,
      assignedStaff: evalAssignments.length,
      checkerId: packageChecker?._id ? String(packageChecker._id) : '',
      checkerName: packageChecker?.name || packageChecker?.email || '',
      submittedReviews: evalReviews.filter(item => item.verdict === 'reviewed').length,
      conflictItems: states.filter(state => state.status === 'conflict').length,
      resolvedItems: states.filter(state => state.status === 'resolved').length,
    };
  }));
};

export const assignHumanAudit = async (req: Request, res: Response) => {
  const managerId = getAuthUserId(req);
  const { model_eval_id, staff_ids, checker_id, conv_indexes } = req.body || {};
  if (!managerId) return res.status(401).json({ error: 'Unauthorized' });
  const evaluation = await findManagedEvaluation(req, String(model_eval_id || ''));
  if (!evaluation) return res.status(404).json({ error: 'Evaluation không tồn tại hoặc không thuộc quyền quản lý' });
  const staffIds = [...new Set((Array.isArray(staff_ids) ? staff_ids : []).map(String))]
    .filter(id => mongoose.isValidObjectId(id));
  if (!staffIds.length) return res.status(400).json({ error: 'Cần chọn ít nhất một Staff' });
  const activeStaff = await User.find({ _id: { $in: staffIds }, role: 'staff', status: 'active' }).select('_id').lean();
  if (activeStaff.length !== staffIds.length) return res.status(400).json({ error: 'Có tài khoản không phải Staff active' });
  if (!mongoose.isValidObjectId(String(checker_id || ''))) {
    return res.status(400).json({ error: 'Phải chọn Checker phụ trách gói audit' });
  }
  const checker = await User.findOne({ _id: checker_id, role: 'checker', status: 'active' }).select('_id name email').lean();
  if (!checker) return res.status(400).json({ error: 'Checker không tồn tại hoặc không còn active' });
  const validIndexes = new Set(evaluation.results.map(result => Number(result.conv_index)));
  const requestedIndexes = Array.isArray(conv_indexes) && conv_indexes.length
    ? conv_indexes.map(Number).filter(index => validIndexes.has(index))
    : [...validIndexes];
  if (!requestedIndexes.length) return res.status(400).json({ error: 'Không có conversation hợp lệ để giao' });
  const history = await TrainingHistory.findOne({ jobId: evaluation.jobId }).select('projectName').lean();
  const projectName = history?.projectName || evaluation.jobId;
  await HumanAuditAssignment.bulkWrite(activeStaff.map(staff => ({
    updateOne: {
      filter: { modelEvalId: evaluation.modelEvalId, staffId: staff._id },
      update: {
        $set: {
          ownerId: evaluation.ownerId,
          jobId: evaluation.jobId,
          projectName,
          checkerId: checker._id,
          assignedConvIndexes: requestedIndexes,
          createdBy: new mongoose.Types.ObjectId(managerId),
          status: 'assigned',
        },
      },
      upsert: true,
    },
  })));
  // Checker belongs to the project package, not to an individual Staff row.
  // Keep all existing rows for this package synchronized when Staff are added later.
  await HumanAuditAssignment.updateMany(
    { modelEvalId: evaluation.modelEvalId },
    { $set: { checkerId: checker._id, jobId: evaluation.jobId, projectName } },
  );
  return res.json({
    message: 'Đã giao gói Human Audit theo project',
    projectName,
    assignedStaff: activeStaff.length,
    assignedItems: requestedIndexes.length,
    checker: { id: String(checker._id), name: checker.name || checker.email },
  });
};

export const listMyHumanAuditAssignments = async (req: Request, res: Response) => {
  const staffId = getAuthUserId(req);
  if (!staffId) return res.status(401).json({ error: 'Unauthorized' });
  const assignments = await HumanAuditAssignment.find({ staffId }).sort({ updatedAt: -1 }).lean();
  const evalIds = assignments.map(item => item.modelEvalId);
  const [evaluations, reviews] = await Promise.all([
    ModelEvaluation.find({ modelEvalId: { $in: evalIds }, status: 'COMPLETED' }).select('modelEvalId jobId ftModelRepo').lean(),
    HumanAuditReview.find({ modelEvalId: { $in: evalIds }, reviewerId: staffId }).lean(),
  ]);
  const histories = await TrainingHistory.find({ jobId: { $in: evaluations.map(item => item.jobId) } }).select('jobId projectName').lean();
  const projectByJob = new Map(histories.map(item => [item.jobId, item.projectName]));
  const evalById = new Map(evaluations.map(item => [item.modelEvalId, item]));
  return res.json(assignments.flatMap(assignment => {
    const evaluation = evalById.get(assignment.modelEvalId);
    if (!evaluation) return [];
    const ownReviews = reviews.filter(item => item.modelEvalId === assignment.modelEvalId);
    return [{
      modelEvalId: assignment.modelEvalId,
      jobId: evaluation.jobId,
      projectName: projectByJob.get(evaluation.jobId) || evaluation.jobId,
      ftModelRepo: evaluation.ftModelRepo,
      assignedItems: assignment.assignedConvIndexes.length,
      reviewedItems: ownReviews.length,
      status: assignment.status,
      updatedAt: assignment.updatedAt,
    }];
  }));
};

export const getMyHumanAuditWork = async (req: Request, res: Response) => {
  const staffId = getAuthUserId(req);
  if (!staffId) return res.status(401).json({ error: 'Unauthorized' });
  const modelEvalId = String(req.params.evalId || '');
  const assignment = await HumanAuditAssignment.findOne({ modelEvalId, staffId }).lean();
  if (!assignment) return res.status(403).json({ error: 'Evaluation này chưa được giao cho tài khoản Staff hiện tại' });
  const [evaluation, reviews] = await Promise.all([
    ModelEvaluation.findOne({ modelEvalId, status: 'COMPLETED' }).lean(),
    HumanAuditReview.find({ modelEvalId, reviewerId: staffId }).lean(),
  ]);
  if (!evaluation) return res.status(404).json({ error: 'Evaluation not found' });
  const reviewByConv = new Map(reviews.map(review => [review.convIndex, review]));
  const allowed = new Set(assignment.assignedConvIndexes);
  const results = evaluation.results.filter(item => allowed.has(Number(item.conv_index))).map(item => {
    const review: any = reviewByConv.get(Number(item.conv_index));
    const raw: any = { ...item };
    if (!review) {
      delete raw.criteria_scores;
      delete raw.criteria_reasons;
    }
    return {
      ...raw,
      human_review: review ? {
        verdict: review.verdict === 'skip' ? 'skip' : review.aiConflict?.has_conflict ? 'disagree' : 'agree',
        target_model: review.targetModel || 'ft',
        note: review.note,
        reviewer: review.reviewerName,
        reviewed_at: review.updatedAt,
        rubric_version: review.rubricVersion,
        human_scores: review.humanScores,
        human_reasons: review.humanReasons,
        human_outcomes: review.humanOutcomes,
        conflict: review.aiConflict,
      } : null,
    };
  });
  return res.json({
    ...evaluation,
    results,
    humanAudit: buildHumanAuditSummary(results as any[]),
  });
};

export const saveMyHumanAuditReview = async (req: Request, res: Response) => {
  const staffId = getAuthUserId(req);
  if (!staffId) return res.status(401).json({ error: 'Unauthorized' });
  const modelEvalId = String(req.params.evalId || '');
  const convIndex = Number(req.params.convIndex);
  const assignment = await HumanAuditAssignment.findOne({ modelEvalId, staffId });
  if (!assignment || !assignment.assignedConvIndexes.includes(convIndex)) {
    return res.status(403).json({ error: 'Conversation này không thuộc assignment của bạn' });
  }
  const [evaluation, reviewer] = await Promise.all([
    ModelEvaluation.findOne({ modelEvalId, status: 'COMPLETED' }),
    User.findById(staffId).select('name').lean(),
  ]);
  if (!evaluation || !reviewer) return res.status(404).json({ error: 'Evaluation hoặc Staff không tồn tại' });
  const convResult: any = evaluation.results.find(item => Number(item.conv_index) === convIndex);
  if (!convResult) return res.status(404).json({ error: 'Conversation not found' });
  const skip = req.body?.verdict === 'skip';
  const targetModel = String(req.body?.target_model || req.body?.targetModel || 'ft').toLowerCase() === 'base' ? 'base' : 'ft';
  let reviewPayload: any = {
    ownerId: evaluation.ownerId,
    modelEvalId,
    convIndex,
    itemId: convResult.item_id || '',
    reviewerId: staffId,
    reviewerName: reviewer.name,
    targetModel,
    verdict: skip ? 'skip' : 'reviewed',
    note: String(req.body?.note || '').trim(),
    rubricVersion: HUMAN_AUDIT_RUBRIC_VERSION,
  };
  if (!skip) {
    try {
      const validated = validateHumanAuditScores(req.body?.human_scores, req.body?.human_reasons);
      reviewPayload = {
        ...reviewPayload,
        humanScores: validated.scores,
        humanReasons: validated.reasons,
        humanOutcomes: computeHumanOutcomes(validated.scores),
        aiScoresSnapshot: { ...(convResult.criteria_scores || {}) },
        aiConflict: deriveHumanAiConflict(convResult.criteria_scores || {}, validated.scores),
      };
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Điểm Human Audit không hợp lệ' });
    }
  }
  const updateOperation: any = { $set: reviewPayload };
  if (skip) {
    updateOperation.$unset = {
      humanScores: 1,
      humanReasons: 1,
      humanOutcomes: 1,
      aiScoresSnapshot: 1,
      aiConflict: 1,
    };
  }
  const review = await HumanAuditReview.findOneAndUpdate(
    { modelEvalId, convIndex, reviewerId: staffId },
    updateOperation,
    { new: true, upsert: true },
  ).lean();
  const totalReviews = await HumanAuditReview.countDocuments({ modelEvalId, reviewerId: staffId });
  assignment.status = totalReviews >= assignment.assignedConvIndexes.length ? 'completed' : 'in_progress';
  await assignment.save();
  return res.json({
    message: 'Review saved',
    review: {
      verdict: review?.verdict === 'skip' ? 'skip' : review?.aiConflict?.has_conflict ? 'disagree' : 'agree',
      target_model: review?.targetModel || targetModel,
      note: review?.note,
      reviewer: review?.reviewerName,
      reviewed_at: review?.updatedAt,
      rubric_version: review?.rubricVersion,
      human_scores: review?.humanScores,
      human_reasons: review?.humanReasons,
      human_outcomes: review?.humanOutcomes,
      conflict: review?.aiConflict,
    },
    criteria_scores: convResult.criteria_scores,
    criteria_reasons: convResult.criteria_reasons,
    effective_judge_model: convResult.effective_judge_model,
  });
};

export const getManagedHumanAuditDetail = async (req: Request, res: Response) => {
  const evaluation = await findReviewableEvaluation(req, String(req.params.evalId || ''));
  if (!evaluation) return res.status(404).json({ error: 'Evaluation không tồn tại hoặc không thuộc quyền quản lý' });
  const [assignments, reviews, adjudications] = await Promise.all([
    HumanAuditAssignment.find({ modelEvalId: evaluation.modelEvalId })
      .populate('staffId', 'name email')
      .populate('checkerId', 'name email')
      .lean(),
    HumanAuditReview.find({ modelEvalId: evaluation.modelEvalId }).sort({ updatedAt: 1 }).lean(),
    HumanAuditAdjudication.find({ modelEvalId: evaluation.modelEvalId }).lean(),
  ]);
  const items = evaluation.results.map((result: any) => {
    const itemReviews = reviews.filter(review => review.convIndex === result.conv_index);
    const adjudication = adjudications.find(item => item.convIndex === result.conv_index);
    return {
      conv_index: result.conv_index,
      item_id: result.item_id,
      question: result.replay_turns?.[0]?.user || '',
      answer: result.replay_turns?.[0]?.model || '',
      ai_scores: result.criteria_scores,
      ai_reasons: result.criteria_reasons,
      reviews: itemReviews,
      adjudication,
      inter_rater: computeInterRaterState(itemReviews, adjudication),
    };
  });
  return res.json({
    evaluation: {
      modelEvalId: evaluation.modelEvalId,
      jobId: evaluation.jobId,
      projectName: assignments[0]?.projectName || evaluation.jobId,
      ftModelRepo: evaluation.ftModelRepo,
      totalConversations: evaluation.totalConversations,
      checker: assignments[0]?.checkerId || null,
    },
    assignments,
    items,
    inter_rater_summary: computeMultiRaterAgreement(reviews),
  });
};

export const adjudicateHumanAudit = async (req: Request, res: Response) => {
  const adjudicatorId = getAuthUserId(req);
  if (!adjudicatorId) return res.status(401).json({ error: 'Unauthorized' });
  const modelEvalId = String(req.params.evalId || '');
  const convIndex = Number(req.params.convIndex);
  const evaluation = await findReviewableEvaluation(req, modelEvalId);
  if (!evaluation) return res.status(404).json({ error: 'Evaluation không thuộc quyền quản lý' });
  const resolution = String(req.body?.resolution || '');
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ error: 'Supervisor phải ghi lý do chốt kết quả' });
  let validated: ReturnType<typeof validateHumanAuditScores>;
  let selectedReviewId: any = null;
  if (resolution === 'accept_ai') {
    const result: any = evaluation.results.find(item => Number(item.conv_index) === convIndex);
    if (!result?.criteria_scores) return res.status(400).json({ error: 'AI Judge scores are unavailable' });
    try {
      validated = validateHumanAuditScores(result.criteria_scores, result.criteria_reasons || {});
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'AI Judge scores are invalid' });
    }
  } else if (resolution === 'accept_staff') {
    const review = await HumanAuditReview.findOne({
      _id: req.body?.selected_review_id,
      modelEvalId,
      convIndex,
      verdict: 'reviewed',
    }).lean();
    if (!review?.humanScores) return res.status(400).json({ error: 'Bản chấm Staff không hợp lệ' });
    validated = validateHumanAuditScores(review.humanScores, review.humanReasons || {});
    selectedReviewId = review._id;
  } else if (resolution === 'manual') {
    try {
      validated = validateHumanAuditScores(req.body?.final_scores, req.body?.final_reasons);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Điểm chốt không hợp lệ' });
    }
  } else {
    return res.status(400).json({ error: 'resolution phải là accept_ai, accept_staff hoặc manual' });
  }
  const adjudication = await HumanAuditAdjudication.findOneAndUpdate(
    { modelEvalId, convIndex },
    {
      $set: {
        ownerId: evaluation.ownerId,
        adjudicatorId,
        adjudicatorRole: roleOf(req),
        resolution,
        selectedReviewId,
        finalScores: validated.scores,
        finalReasons: validated.reasons,
        note,
      },
    },
    { new: true, upsert: true },
  ).lean();
  return res.json({ message: 'Đã chốt xung đột Human Audit', adjudication });
};
