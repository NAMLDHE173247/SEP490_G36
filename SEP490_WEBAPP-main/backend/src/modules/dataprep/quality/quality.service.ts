import mongoose from 'mongoose';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { ConversationQualityReview } from '../../../models/ConversationQualityReview';
import { ConversationQualityAdjudication } from '../../../models/ConversationQualityAdjudication';
import { User } from '../../../models/User';
import { DatasetCanonicalLabel } from '../../../models/DatasetCanonicalLabel';
import { QUALITY_AUTO_REJECT_MARKER } from './quality.constants';
import { getEffectiveSampleLabelsForVersion, insertAssignments, removeLabelsByQuery, ensureLabelAssignmentsForSamples } from '../../../services/labelAssignmentService';
import { LabelAssignment } from '../../../models/LabelAssignment';
import { DatasetAssignmentAdjudication } from '../../../models/DatasetAssignmentAdjudication';
import { DatasetSampleAssignment } from '../../../models/DatasetSampleAssignment';

export const QUALITY_BUCKETS = ['Gold', 'Rewrite', 'Reject', 'Incomplete'] as const;
export type QualityBucket = (typeof QUALITY_BUCKETS)[number];

const INTENTS = [
  'ANSWER_ATTEMPT',
  'CORRECT',
  'INCORRECT',
  'REQUEST_HINT',
  'ASK_THEORY',
  'REQUEST_EXPLANATION',
  'REQUEST_SIMPLER',
  'SKIP_EXERCISE',
  'ENCOURAGE',
  'OFF_TOPIC',
  'NEXT_SECTION',
] as const;

const INTENT_INDEX = new Map(INTENTS.map((intent, index) => [intent, index]));
const CRITICAL_INTENTS = new Set(['INCORRECT', 'REQUEST_HINT'] as const);

export const VALID_ACTIONS: Record<string, ReadonlySet<string>> = {
  ANSWER_ATTEMPT: new Set(['CONFIRM_CORRECT_ANSWER', 'IDENTIFY_INCORRECT_ANSWER', 'CORRECT_MISTAKE', 'SCAFFOLDING']),
  CORRECT: new Set(['PRAISING', 'CONFIRM_CORRECT_ANSWER']),
  INCORRECT: new Set(['SCAFFOLDING']),
  REQUEST_HINT: new Set(['HINTING', 'SCAFFOLDING']),
  ASK_THEORY: new Set(['CONCEPT_CLARIFY', 'LOGIC_BREAKDOWN']),
  REQUEST_EXPLANATION: new Set(['LOGIC_BREAKDOWN', 'CONCEPT_CLARIFY']),
  REQUEST_SIMPLER: new Set(['SIMPLIFYING']),
  SKIP_EXERCISE: new Set(['NAVIGATING']),
  ENCOURAGE: new Set(['MOTIVATING']),
  OFF_TOPIC: new Set(['REDIRECTING', 'TRANSITIONING']),
  NEXT_SECTION: new Set(['TRANSITIONING', 'NAVIGATING']),
};
export const HARMFUL_ACTIONS: Record<string, ReadonlySet<string>> = {
  ANSWER_ATTEMPT: new Set(['DIRECT_ANSWER']),
  INCORRECT: new Set(['PRAISING']),
  REQUEST_HINT: new Set(['LOGIC_BREAKDOWN']),
};
const USER_INTENT_SET = new Set<string>(INTENTS);
const ASSISTANT_ACTION_SET = new Set<string>([
  ...Array.from(new Set(Object.values(VALID_ACTIONS).flatMap((actions) => Array.from(actions)))),
  'WAITING',
  'DIRECT_ANSWER',
]);

const ALL_VALID_INTENTS = new Set<string>([
  ...Array.from(USER_INTENT_SET),
  'CONFIRM_UNDERSTANDING',
  'CONFIRM',
  'UNDERSTOOD'
]);

const ALL_VALID_ACTIONS = new Set<string>([
  ...Array.from(ASSISTANT_ACTION_SET),
  'DIRECT_ANSWER',
  'PRAISING',
  'MOTIVATING',
  'REDIRECTING',
  'TRANSITIONING',
]);

const STAGE3_TO_BACKEND_MAP: Record<string, string> = {
  // Intents (User)
  'ANS': 'ANSWER_ATTEMPT',
  'HINT': 'REQUEST_HINT',
  'THEO': 'ASK_THEORY',
  'WHY': 'REQUEST_EXPLANATION',
  'EASY': 'REQUEST_SIMPLER',
  'SKIP': 'SKIP_EXERCISE',
  'DIS': 'ENCOURAGE',
  'OFF': 'OFF_TOPIC',
  'RDY': 'NEXT_SECTION',
  'CFM': 'NEXT_SECTION',
  'CONFIRM_UNDERSTANDING': 'NEXT_SECTION',

  // Actions (Assistant)
  'CONF': 'CONFIRM_CORRECT_ANSWER',
  'WRONG': 'IDENTIFY_INCORRECT_ANSWER',
  'FIX': 'CORRECT_MISTAKE',
  'SCAF': 'SCAFFOLDING',
  'CLR': 'CONCEPT_CLARIFY',
  'LOG': 'LOGIC_BREAKDOWN',
  'SIMP': 'SIMPLIFYING',
  'PR': 'PRAISING',
  'MOT': 'MOTIVATING',
  'REDIR': 'REDIRECTING',
  'TRAN': 'TRANSITIONING',
  'DIR': 'DIRECT_ANSWER',
  'WAIT': 'WAITING',
  'WAITING': 'WAITING',
  'DIRECT_ANSWER': 'DIRECT_ANSWER'
};

type SerializedMessage = {
  messageIndex: number;
  role: 'user' | 'assistant';
  content: string;
};

export type QualitySummaryGroup = {
  group: QualityBucket;
  count: number;
  percentage: number;
};

export type QualityWrongPair = {
  intent: string;
  action: string;
  count: number;
  criticalFailures: number;
};

export type QualityItem = {
  _id: string;
  sampleId: string;
  data: Record<string, unknown>;
  bucket: QualityBucket;
  hasMissingLabeling?: boolean;
  requiredTurns?: number;
  isApproved?: boolean;
  score: number;
  humanScore?: number | null;
  scoreScale: 'turn-average-raw';
  vector: number[];
  intentCounts: number[];
  iar: Array<number | null>;
  criticalFailures: number;
  scorableTurns: number;
  reviewStatus?: 'pending' | 'reviewed' | 'conflict';
  reviewCount?: number;
  conflict?: boolean;
  note?: string;
  adjudicatedBy?: string;
  adjudicatedAt?: string;
  errorMessageIndex?: number | null;
  conflictReason?: string;
  turnPairs: Array<{
    userMessageIndex: number;
    assistantMessageIndex: number;
    user: string;
    assistant: string;
    userLabels: string[];
    assistantLabels: string[];
    expectedActions: string[];
    matched: boolean;
    turnScore: number;
    intentScores: Array<{
      intent: string;
      value: number;
      matched: boolean;
      harmfulActions: string[];
    }>;
  }>;
  pendingAdjudication?: boolean;
};

export type QualityResult = {
  summary: {
    totalSamples: number;
    classifiedSamples: number;
    skippedSamples: number;
    groups: QualitySummaryGroup[];
    wrongPairs: QualityWrongPair[];
    rejectTaggedCount?: number;
  };
  totalSamples: number;
  classifiedSamples: number;
  skippedSamples: number;
  groups: QualitySummaryGroup[];
  wrongPairs: QualityWrongPair[];
  rejectTaggedCount?: number;
  items: QualityItem[];
};

export type LabelingStatusResult = {
  totalSamples: number;
  labeledSamples: number;
  unlabeledSamples: number;
  incompleteBucket: QualityBucket | null;
};

function isQualityBucket(value: string): value is QualityBucket {
  return (QUALITY_BUCKETS as readonly string[]).includes(value);
}

function serializeMessages(data: Record<string, any>): SerializedMessage[] {
  if (Array.isArray(data?.messages)) {
    return data.messages
      .map((message: any, index: number) => ({
        messageIndex: index,
        role: message.role,
        content: String(message?.content || ''),
      }))
      .filter((message: any) =>
        (message.role === 'user' || message.role === 'assistant') && message.content.trim().length > 0
      );
  }

  const instruction = String(data?.instruction || data?.userText || '').trim();
  const output = String(data?.output || data?.assistantText || '').trim();
  const messages: SerializedMessage[] = [];
  if (instruction) {
    messages.push({ messageIndex: 0, role: 'user', content: instruction });
  }
  if (output) {
    messages.push({ messageIndex: 1, role: 'assistant', content: output });
  }
  return messages;
}

function labelName(label: any): string {
  return String(label?.name || '').trim().toUpperCase();
}

function buildLabelMap(labels: any[]): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();
  labels.forEach((label) => {
    const role = label.messageRole === 'assistant' || label.messageRole === 'user'
      ? label.messageRole
      : null;
    const keys = role
      ? [`${String(label.sampleId)}:${Number(label.messageIndex)}:${role}`]
      : [
        `${String(label.sampleId)}:${Number(label.messageIndex)}:user`,
        `${String(label.sampleId)}:${Number(label.messageIndex)}:assistant`,
      ];
    keys.forEach((key) => {
      const list = grouped.get(key) || new Set<string>();
      const name = labelName(label);
      if (name) {
        list.add(name);
      }
      grouped.set(key, list);
    });
  });

  const result = new Map<string, string[]>();
  grouped.forEach((items, key) => {
    result.set(key, Array.from(items).sort());
  });
  return result;
}

function incrementWrongPair(map: Map<string, QualityWrongPair>, intent: string, actions: string[], isCritical: boolean) {
  const action = actions.length ? actions.join(' + ') : 'MISSING_VALID_ACTION';
  const key = `${intent}:${action}`;
  const current = map.get(key) || {
    intent,
    action,
    count: 0,
    criticalFailures: 0,
  };
  current.count += 1;
  if (isCritical) {
    current.criticalFailures += 1;
  }
  map.set(key, current);
}

// All bucketing now runs on the unified 0..10 scale.
// Gold >= 7, Rewrite >= 5, otherwise Reject.
function resolveBucketFromTen(tenPointScore: number): QualityBucket {
  if (tenPointScore >= 7) {
    return 'Gold';
  }
  if (tenPointScore >= 5) {
    return 'Rewrite';
  }
  return 'Reject';
}

function getBucketScore(bucket: QualityBucket): number {
  if (bucket === 'Gold') {
    return 1;
  }
  if (bucket === 'Rewrite') {
    return 0.5;
  }
  return 0;
}

function toTenPointScore(raw: number): number {
  return Number(Math.max(0, Math.min(10, ((raw + 1) / 2) * 10)).toFixed(1));
}

// Map human-readable draft labels to the standard codes used by the scoring rules.
const DRAFT_INTENT_MAP: Record<string, string> = {
  'Ask Explanation': 'REQUEST_EXPLANATION',
  'Solve Exercise': 'ANSWER_ATTEMPT',
  'Request Formula': 'ASK_THEORY',
  'Confirm Understanding': 'NEXT_SECTION',
  'Ask Example': 'REQUEST_SIMPLER',
  'Hint': 'REQUEST_HINT',
  'Ques': 'REQUEST_EXPLANATION',
  'Ques/Hint': 'REQUEST_HINT',
  'Other': 'WAIT_READY',
};
const DRAFT_ACTION_MAP: Record<string, string> = {
  'Guide Step-by-step': 'LOGIC_BREAKDOWN',
  'Give Hint': 'HINTING',
  'Ask Probing Question': 'SCAFFOLDING',
  'Provide Formula': 'CONCEPT_CLARIFY',
  'Encourage': 'MOTIVATING',
  'Correct Error': 'SCAFFOLDING',
  'Summarize': 'TRANSITIONING',
  'Hint': 'HINTING',
  'Ques': 'SCAFFOLDING',
  'Ques/Hint': 'SCAFFOLDING',
  'Other': 'WAITING',
};
function mapDraftIntent(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (DRAFT_INTENT_MAP[trimmed]) return DRAFT_INTENT_MAP[trimmed];
  const upper = trimmed.toUpperCase();
  return ALL_VALID_INTENTS.has(upper) ? upper : null;
}
function mapDraftAction(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (DRAFT_ACTION_MAP[trimmed]) return DRAFT_ACTION_MAP[trimmed];
  const upper = trimmed.toUpperCase();
  return ALL_VALID_ACTIONS.has(upper) ? upper : null;
}

/**
 * Reads SOFT (draft) sample-scope labels and expands them into synthetic message-level
 * label rows, so the Staff Rule Score appears even before submission promotes them to hard.
 */
async function getDraftMessageLabels(
  sampleIds: mongoose.Types.ObjectId[],
  itemsById: Map<string, any>
): Promise<Array<{ sampleId: any; name: string; messageIndex: number; messageRole: 'user' | 'assistant' }>> {
  if (!sampleIds.length) return [];
  const softDocs = await LabelAssignment.find({
    sampleId: { $in: sampleIds },
    type: 'soft',
    targetScope: 'sample',
  }).select('sampleId targetTextSnapshot').lean();

  const out: Array<{ sampleId: any; name: string; messageIndex: number; messageRole: 'user' | 'assistant' }> = [];
  for (const doc of softDocs as any[]) {
    if (!doc.targetTextSnapshot) continue;
    let parsed: any;
    try { parsed = JSON.parse(String(doc.targetTextSnapshot)); } catch { continue; }
    if (!parsed?.messages || typeof parsed.messages !== 'object') continue;
    const item = itemsById.get(String(doc.sampleId));
    const messages = item ? serializeMessages(item.data || {}) : [];
    for (const [idxStr, value] of Object.entries(parsed.messages as Record<string, any>)) {
      const messageIndex = Number(idxStr);
      if (!Number.isInteger(messageIndex) || !value) continue;
      const role = messages[messageIndex]?.role === 'assistant' ? 'assistant' : 'user';
      const mapped = role === 'assistant' ? mapDraftAction((value as any).action) : mapDraftIntent((value as any).intent);
      if (!mapped) continue;
      out.push({ sampleId: doc.sampleId, name: mapped, messageIndex, messageRole: role });
    }
  }
  return out;
}

export class QualityService {
  async classify(
    versionId: string,
    ownerId: string,
    group?: string,
    options: { tagRejects?: boolean; incompleteBucket?: QualityBucket | null } = {}
  ): Promise<QualityResult> {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Invalid dataset version id.'), { statusCode: 400 });
    }

    const version = await DatasetVersion.findOne({ _id: versionId }).lean();
    if (!version) {
      throw Object.assign(new Error('Dataset version not found.'), { statusCode: 404 });
    }

    const items = await ProcessedDatasetItem.find({ datasetVersionId: version._id }).sort({ createdAt: 1 }).lean();
    if (!items.length) {
      return {
        summary: { totalSamples: 0, classifiedSamples: 0, skippedSamples: 0, groups: [], wrongPairs: [], rejectTaggedCount: 0 },
        totalSamples: 0,
        classifiedSamples: 0,
        skippedSamples: 0,
        groups: [],
        wrongPairs: [],
        rejectTaggedCount: 0,
        items: [],
      };
    }

    const itemIds = items.map((item: any) => item._id);
    const sourceSampleIds = items.map((item: any) => item.sourceSampleId).filter(Boolean);
    const querySampleIds = [...itemIds, ...sourceSampleIds];

    await ensureLabelAssignmentsForSamples(querySampleIds);
    const itemsById = new Map<string, any>(items.map((item: any) => [String(item._id), item]));
    const allLabels = await getEffectiveSampleLabelsForVersion(version._id, querySampleIds);

    const sourceToNewMap = new Map<string, string>();
    items.forEach((item: any) => {
      if (item.sourceSampleId) {
        sourceToNewMap.set(String(item.sourceSampleId), String(item._id));
      }
    });

    allLabels.forEach((label: any) => {
      const srcSid = String(label.sampleId);
      if (sourceToNewMap.has(srcSid)) {
        label.sampleId = new mongoose.Types.ObjectId(sourceToNewMap.get(srcSid));
      }
    });

    const labels = allLabels.filter(
      (label: any) => label.targetScope === 'message' && label.type === 'hard'
    );

    // Fallback: only include draft message labels if there is no hard label on that specific message key
    const hardKeys = new Set(labels.map(l => `${String(l.sampleId)}:${Number(l.messageIndex)}:${l.messageRole}`));
    const draftMessageLabels = await getDraftMessageLabels(itemIds, itemsById);
    const draftFallbackLabels = draftMessageLabels.filter(
      (l) => !hardKeys.has(`${String(l.sampleId)}:${Number(l.messageIndex)}:${l.messageRole}`)
    );
    const labelMap = buildLabelMap([...labels, ...draftFallbackLabels]);

    // Fetch pending assignment adjudications (unresolved staff conflicts)
    const pendingAdjudications = await DatasetAssignmentAdjudication.find({
      datasetVersionId: version._id,
      status: { $ne: 'published' }
    }).select('sampleId').lean();
    const pendingAdjudicationSet = new Set(pendingAdjudications.map(a => String(a.sampleId)));

    // Fetch active assignments count per sample
    const assignments = await DatasetSampleAssignment.find({
      datasetVersionId: version._id,
      active: true
    }).select('sampleId assigneeId').lean();

    const sampleAssigneeCount = new Map<string, number>();
    assignments.forEach((asg: any) => {
      const sid = String(asg.sampleId);
      sampleAssigneeCount.set(sid, (sampleAssigneeCount.get(sid) || 0) + 1);
    });

    const SUBJECT_LABELS = new Set([
      'MATH',
      'PHYSICAL',
      'PHYSICS',
      'CHEMISTRY',
      'LITERATURE',
      'BIOLOGY',
      'HISTORY',
      'CODING',
      'GEOGRAPHY',
      'ENGLISH',
      'OTHER',
    ]);

    const sampleSubjectLabelsMap = new Map<string, Array<{ name: string; type: string; assignedUserCount: number }>>();
    for (const label of allLabels) {
      const sid = String((label as any).sampleId);
      const entry = {
        name: String((label as any).name || '').toUpperCase(),
        type: String((label as any).type || ''),
        assignedUserCount: Number((label as any).assignedUserCount || 0),
      };
      const list = sampleSubjectLabelsMap.get(sid) || [];
      list.push(entry);
      sampleSubjectLabelsMap.set(sid, list);
    }

    const resolveSubjectGroup = (sampleLabelsList: any[]): string => {
      const subjectLabels = sampleLabelsList
        .filter((l) => SUBJECT_LABELS.has(l.name))
        .sort((a, b) => b.assignedUserCount - a.assignedUserCount);

      if (subjectLabels.length > 0) {
        return subjectLabels[0].name;
      }
      return 'OUT_OF_SCOPE';
    };
    const configuredIncompleteBucket = isQualityBucket(String((version as any)?.operationParams?.qualityIncompleteBucket || ''))
      ? String((version as any).operationParams.qualityIncompleteBucket) as QualityBucket
      : null;
    const incompleteBucket = options.incompleteBucket ?? configuredIncompleteBucket;

    const reviews = await ConversationQualityReview.find({ datasetVersionId: version._id }).lean();
    const adjudications = await ConversationQualityAdjudication.find({ datasetVersionId: version._id }).lean();
    const canonicalDocs = await DatasetCanonicalLabel.find({ datasetVersionId: version._id }).select('sampleId targetScope labels messageIndex messageRole').lean();
    const approvedSampleIds = new Set(canonicalDocs.map(c => String(c.sampleId)));


    const canonicalSampleBucketMap = new Map<string, QualityBucket>();
    const canonicalLabelMap = new Map<string, string[]>();
    canonicalDocs.forEach(c => {
      if (c.targetScope === 'sample' && Array.isArray(c.labels)) {
        const bucketLabel = c.labels[0];
        if (bucketLabel) {
          const bucket = bucketLabel === 'Bad' ? 'Reject' : bucketLabel as QualityBucket;
          canonicalSampleBucketMap.set(String(c.sampleId), bucket);
        }
      } else if (c.targetScope === 'message' && Array.isArray(c.labels) && c.labels.length > 0) {
        const role = c.messageRole === 'assistant' ? 'assistant' : 'user';
        const key = `${String(c.sampleId)}:${c.messageIndex}:${role}`;
        canonicalLabelMap.set(key, c.labels);
      }
    });

    const reviewsBySample = new Map<string, any[]>();
    for (const r of reviews) {
      const sid = String(r.sampleId);
      const list = reviewsBySample.get(sid) || [];
      list.push(r);
      reviewsBySample.set(sid, list);
    }

    const adjudicationBySample = new Map<string, any>();
    for (const adj of adjudications) {
      adjudicationBySample.set(String(adj.sampleId), adj);
    }

    const qualityItems: QualityItem[] = [];
    const wrongPairMap = new Map<string, QualityWrongPair>();

    for (const item of items as any[]) {
      const itemSid = String(item._id);
      const adj = adjudicationBySample.get(itemSid);
      const isApproved = approvedSampleIds.has(itemSid) || (adj && ['resolved_unpublished', 'published'].includes(adj.status));
      const sampleSubjectLabels = sampleSubjectLabelsMap.get(itemSid) || [];
      const resolvedSubject = resolveSubjectGroup(sampleSubjectLabels);
      const messages = serializeMessages(item.data || {});
      const vector = new Array(INTENTS.length).fill(0);
      const intentCounts = new Array(INTENTS.length).fill(0);
      let totalTurnScore = 0;
      let scorableTurns = 0;
      let criticalFailures = 0;
      let requiredTurns = 0;
      let hasMissingLabeling = false;
      const turnPairs: QualityItem['turnPairs'] = [];

      for (let index = 0; index < messages.length; index += 1) {
        const userMessage = messages[index];
        if (userMessage.role !== 'user') continue;

        const assistantMessage = messages.slice(index + 1).find((message) => message.role === 'assistant');
        if (!assistantMessage) continue;
        requiredTurns += 1;

        const userKey = `${String(item._id)}:${userMessage.messageIndex}:user`;
        const assistantKey = `${String(item._id)}:${assistantMessage.messageIndex}:assistant`;

        const rawUserLabels = (canonicalLabelMap.get(userKey) || labelMap.get(userKey)) || [];
        const rawAssistantLabels = (canonicalLabelMap.get(assistantKey) || labelMap.get(assistantKey)) || [];

        const rawUserLabelsMapped = rawUserLabels
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase());
        const rawAssistantLabelsMapped = rawAssistantLabels
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase());

        const hasUserLabel = rawUserLabelsMapped.some(l => ALL_VALID_INTENTS.has(l));
        const hasAssistantLabel = rawAssistantLabelsMapped.some(l => ALL_VALID_ACTIONS.has(l));

        if (!hasUserLabel || !hasAssistantLabel) {
          hasMissingLabeling = true;
          totalTurnScore -= 0.5;
          continue;
        }

        const userLabels = rawUserLabels
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase())
          .filter((label) => USER_INTENT_SET.has(label));
        const assistantLabels = rawAssistantLabels
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase())
          .filter((label) => ASSISTANT_ACTION_SET.has(label));


        // If labeled but not with Socratic intents/actions, skip turn without flagging hasMissingLabeling
        if (!userLabels.length || !assistantLabels.length) {
          continue;
        }

        const intentScores: QualityItem['turnPairs'][number]['intentScores'] = [];
        const expectedActions = new Set<string>();

        for (const userLabel of userLabels) {
          const intentIndex = INTENT_INDEX.get(userLabel as any);
          const validActions = VALID_ACTIONS[userLabel];
          if (intentIndex === undefined || !validActions) continue;

          Array.from(validActions).forEach((action) => expectedActions.add(action));
          const matchedActions = assistantLabels.filter((action) => validActions.has(action));
          const harmfulActions = assistantLabels.filter((action) => HARMFUL_ACTIONS[userLabel]?.has(action));
          const isCorrect = matchedActions.length > 0;
          const isCriticalFailure = !isCorrect && CRITICAL_INTENTS.has(userLabel as any);
          // A missing rule match is neutral, not automatically a total failure.
          // Only an explicitly harmful pairing receives the low endpoint.
          const value = harmfulActions.length > 0 ? -1 : isCorrect ? 1 : -0.5;

          if (!isCorrect) {
            incrementWrongPair(wrongPairMap, userLabel, assistantLabels, isCriticalFailure);
          }
          if (harmfulActions.length) {
            incrementWrongPair(wrongPairMap, userLabel, harmfulActions.map((action) => `HARMFUL:${action}`), isCriticalFailure);
          }

          vector[intentIndex] += value;
          intentCounts[intentIndex] += 1;
          if (isCriticalFailure) {
            criticalFailures += 1;
          }

          intentScores.push({
            intent: userLabel,
            value,
            matched: isCorrect,
            harmfulActions: [...harmfulActions],
          });
        }

        if (!intentScores.length) {
          continue;
        }

        // Treat multiple selected intents as alternatives for one turn. Preserve
        // the best valid pairing instead of penalising every extra label.
        const turnScore = intentScores.some((current) => current.harmfulActions.length > 0)
          ? -1
          : Math.max(...intentScores.map((current) => current.value));
        totalTurnScore += turnScore;
        scorableTurns += 1;

        turnPairs.push({
          userMessageIndex: userMessage.messageIndex,
          assistantMessageIndex: assistantMessage.messageIndex,
          user: String(userMessage.content || ''),
          assistant: String(assistantMessage.content || ''),
          userLabels: [...userLabels],
          assistantLabels: [...assistantLabels],
          expectedActions: Array.from(expectedActions),
          matched: intentScores.some((entry) => entry.matched),
          turnScore,
          intentScores,
        });
      }

      let errorMessageIndex: number | null = null;
      const mismatchReasons: string[] = [];

      for (const turn of turnPairs) {
        if (!turn.matched) {
          mismatchReasons.push(`Turn #${turn.assistantMessageIndex + 1}: Student intent '${turn.userLabels.join(',')}' and Assistant action '${turn.assistantLabels.join(',')}' are mismatched.`);
          if (errorMessageIndex === null) {
            errorMessageIndex = turn.assistantMessageIndex;
          }
        } else if (turn.turnScore < 0) {
          mismatchReasons.push(`Turn #${turn.assistantMessageIndex + 1}: Harmful action detected.`);
          if (errorMessageIndex === null) {
            errorMessageIndex = turn.assistantMessageIndex;
          }
        }
      }

      if (errorMessageIndex === null) {
        // Fallback to the last assistant message
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            errorMessageIndex = messages[i].messageIndex;
            break;
          }
        }
      }

      const conflictReason = mismatchReasons.length > 0 ? mismatchReasons.join('; ') : undefined;

      const sid = String(item._id);
      const sReviews = reviewsBySample.get(sid) || [];
      const displaySubject = resolvedSubject !== 'OUT_OF_SCOPE'
        ? resolvedSubject
        : String((item.data as any)?.groupLabel || (item.data as any)?.group_label || (item.data as any)?.subject || (item.data as any)?.meta?.subject || 'OUT_OF_SCOPE');

      let resolvedBucket: QualityBucket = 'Incomplete';
      let reviewStatus: 'pending' | 'reviewed' | 'conflict' = 'pending';
      let hasConflict = false;
      let note = '';
      let adjudicatedBy = '';
      let adjudicatedAt = '';
      let isClassified = false;

      const isApprovedSample = isApproved;

      if (isApprovedSample) {
        isClassified = true;
        resolvedBucket = canonicalSampleBucketMap.get(sid) || (adj ? (adj.finalClassification === 'Bad' ? 'Reject' : adj.finalClassification) : 'Gold');
        reviewStatus = 'reviewed';
        if (adj) {
          hasConflict = adj.hasConflict;
          note = adj.note || '';
          adjudicatedBy = adj.adjudicatedBy ? String(adj.adjudicatedBy) : '';
          adjudicatedAt = adj.updatedAt ? adj.updatedAt.toISOString() : '';
        }
      } else if (adj) {
        resolvedBucket = adj.finalClassification === 'Bad' ? 'Reject' : adj.finalClassification;
        hasConflict = adj.hasConflict;
        reviewStatus = adj.hasConflict ? 'conflict' : 'reviewed';
        note = adj.note || '';
        adjudicatedBy = adj.adjudicatedBy ? String(adj.adjudicatedBy) : '';
        adjudicatedAt = adj.updatedAt ? adj.updatedAt.toISOString() : '';
        isClassified = true;
      } else if (sReviews.length > 0) {
        const classifications = new Set(sReviews.map((r) => r.qualityClassification));
        if (classifications.size > 1) {
          hasConflict = true;
          reviewStatus = 'conflict';
        } else {
          reviewStatus = 'reviewed';
        }
        resolvedBucket = sReviews[0].qualityClassification === 'Bad' ? 'Reject' : sReviews[0].qualityClassification;
        note = sReviews[0].note || '';
        isClassified = true;
      }

      const assigneeCount = sampleAssigneeCount.get(sid) || 0;
      const isOverlapped = assigneeCount >= 2;
      const pendingAdjudication = isOverlapped ? !approvedSampleIds.has(sid) : pendingAdjudicationSet.has(sid);
      const iar = vector.map((value, index) => (
        intentCounts[index] > 0 ? value / intentCounts[index] : null
      ));
      const score = requiredTurns > 0 ? totalTurnScore / requiredTurns : -1;
      const humanScore = pendingAdjudication ? null : ((requiredTurns > 0 && !hasMissingLabeling) ? toTenPointScore(score) : null);


      if (isClassified) {
        qualityItems.push({
          _id: sid,
          sampleId: String(item.sampleId),
          data: { ...(item.data || {}), subject: displaySubject },
          bucket: resolvedBucket,
          hasMissingLabeling,
          requiredTurns,
          isApproved,
          score: getBucketScore(resolvedBucket === 'Reject' ? 'Reject' : resolvedBucket),
          humanScore,
          scoreScale: 'turn-average-raw',
          vector,
          intentCounts,
          iar,
          criticalFailures,
          scorableTurns,
          reviewStatus,
          reviewCount: sReviews.length,
          conflict: hasConflict,
          note,
          adjudicatedBy,
          adjudicatedAt,
          errorMessageIndex,
          conflictReason,
          turnPairs,
          pendingAdjudication,
        });
        continue;
      }

      // Check severe error flags from Stage 3 (Factual Error, Direct Answer, Language Issue)
      const SEVERE_ERROR_LABELS = new Set([
        'FACT_ERR', 'FACTUAL ERROR',
        'DIR_ANS', 'DIRECT ANSWER',
        'LANG_ISSUE', 'LANGUAGE ISSUE'
      ]);
      const activeErrors = sampleSubjectLabels
        .filter((l: any) => SEVERE_ERROR_LABELS.has(String(l.name || '').toUpperCase()))
        .map((l: any) => l.name);

      if (activeErrors.length > 0) {
        qualityItems.push({
          _id: sid,
          sampleId: String(item.sampleId),
          data: { ...(item.data || {}), subject: displaySubject },
          bucket: 'Reject',
          hasMissingLabeling,
          requiredTurns,
          isApproved,
          score: 0,
          humanScore: 0,
          scoreScale: 'turn-average-raw',
          vector,
          intentCounts,
          iar,
          criticalFailures,
          scorableTurns,
          reviewStatus: 'pending',
          reviewCount: 0,
          conflict: false,
          errorMessageIndex,
          conflictReason: `Bị gắn cờ lỗi nghiêm trọng từ Stage 3: ${activeErrors.join(', ')}`,
          turnPairs,
          pendingAdjudication,
        });
        continue;
      }

      const isIncomplete = requiredTurns === 0 || hasMissingLabeling;
      if (isIncomplete && incompleteBucket) {
        qualityItems.push({
          _id: sid,
          sampleId: String(item.sampleId),
          data: { ...(item.data || {}), subject: displaySubject },
          bucket: incompleteBucket,
          hasMissingLabeling,
          requiredTurns,
          isApproved,
          score: getBucketScore(incompleteBucket),
          humanScore,
          scoreScale: 'turn-average-raw',
          vector,
          intentCounts,
          iar,
          criticalFailures,
          scorableTurns,
          reviewStatus: 'pending',
          reviewCount: 0,
          conflict: false,
          errorMessageIndex,
          conflictReason,
          turnPairs,
          pendingAdjudication,
        });
        continue;
      }

      if (scorableTurns === 0) {
        qualityItems.push({
          _id: sid,
          sampleId: String(item.sampleId),
          data: { ...(item.data || {}), subject: displaySubject },
          bucket: 'Incomplete',
          hasMissingLabeling,
          requiredTurns,
          isApproved,
          score: 0,
          humanScore,
          scoreScale: 'turn-average-raw',
          vector,
          intentCounts,
          iar,
          criticalFailures,
          scorableTurns,
          reviewStatus: 'pending',
          reviewCount: 0,
          conflict: false,
          errorMessageIndex,
          conflictReason,
          turnPairs,
          pendingAdjudication,
        });
        continue;
      }

      const bucket = resolveBucketFromTen(humanScore ?? 0);
      qualityItems.push({
        _id: sid,
        sampleId: String(item.sampleId),
        data: { ...(item.data || {}), subject: displaySubject },
        bucket,
        hasMissingLabeling,
        requiredTurns,
        isApproved,
        score,
        humanScore,
        scoreScale: 'turn-average-raw',
        vector,
        intentCounts,
        iar,
        criticalFailures,
        scorableTurns,
        reviewStatus: 'pending',
        reviewCount: 0,
        conflict: false,
        errorMessageIndex,
        conflictReason,
        turnPairs,
        pendingAdjudication,
      });
    }

    const filteredItems = group && isQualityBucket(group)
      ? qualityItems.filter((item) => item.bucket === group)
      : qualityItems;

    const groups: QualitySummaryGroup[] = QUALITY_BUCKETS.map((bucket) => {
      const count = qualityItems.filter((item) => item.bucket === bucket).length;
      return {
        group: bucket,
        count,
        percentage: qualityItems.length
          ? Math.round((count / qualityItems.length) * 10000) / 100
          : 0,
      };
    });
    const wrongPairs = Array.from(wrongPairMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.criticalFailures !== a.criticalFailures) return b.criticalFailures - a.criticalFailures;
      return `${a.intent}:${a.action}`.localeCompare(`${b.intent}:${b.action}`);
    });
    const rejectTaggedCount = options.tagRejects
      ? await this.syncRejectLabels(itemIds, qualityItems, ownerId)
      : 0;

    const result = {
      totalSamples: items.length,
      classifiedSamples: qualityItems.length,
      skippedSamples: items.length - qualityItems.length,
      groups,
      wrongPairs,
      rejectTaggedCount,
      items: filteredItems,
    };
    return {
      summary: {
        totalSamples: result.totalSamples,
        classifiedSamples: result.classifiedSamples,
        skippedSamples: result.skippedSamples,
        groups: result.groups,
        wrongPairs: result.wrongPairs,
        rejectTaggedCount: result.rejectTaggedCount,
      },
      ...result,
    };
  }

  async getLabelingStatus(versionId: string, _ownerId: string): Promise<LabelingStatusResult> {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Invalid dataset version id.'), { statusCode: 400 });
    }

    const version = await DatasetVersion.findOne({ _id: versionId }).lean();
    if (!version) {
      throw Object.assign(new Error('Dataset version not found.'), { statusCode: 404 });
    }

    const items = await ProcessedDatasetItem.find({ datasetVersionId: version._id }).sort({ createdAt: 1 }).lean();
    if (!items.length) {
      return {
        totalSamples: 0,
        labeledSamples: 0,
        unlabeledSamples: 0,
        incompleteBucket: null,
      };
    }

    const itemIds = items.map((item: any) => item._id);
    const labels = (await getEffectiveSampleLabelsForVersion(version._id, itemIds)).filter(
      (label: any) => label.targetScope === 'message' && label.type === 'hard'
    );
    const labelMap = buildLabelMap(labels);
    const incompleteBucket = isQualityBucket(String((version as any)?.operationParams?.qualityIncompleteBucket || ''))
      ? String((version as any).operationParams.qualityIncompleteBucket) as QualityBucket
      : null;

    let labeledSamples = 0;
    let unlabeledSamples = 0;

    for (const item of items as any[]) {
      const messages = serializeMessages(item.data || {});
      let requiredTurns = 0;
      let missingTurns = 0;

      for (let index = 0; index < messages.length; index += 1) {
        const userMessage = messages[index];
        if (userMessage.role !== 'user') continue;

        const assistantMessage = messages.slice(index + 1).find((message) => message.role === 'assistant');
        if (!assistantMessage) continue;
        requiredTurns += 1;

        const userLabels = (labelMap.get(`${String(item._id)}:${userMessage.messageIndex}:user`) || [])
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase())
          .filter((label) => USER_INTENT_SET.has(label));
        const assistantLabels = (labelMap.get(`${String(item._id)}:${assistantMessage.messageIndex}:assistant`) || [])
          .map((label) => STAGE3_TO_BACKEND_MAP[label.toUpperCase()] || label.toUpperCase())
          .filter((label) => ASSISTANT_ACTION_SET.has(label));

        if (!userLabels.length || !assistantLabels.length) {
          missingTurns += 1;
        }
      }

      if (requiredTurns > 0 && missingTurns === 0) {
        labeledSamples += 1;
      } else {
        unlabeledSamples += 1;
      }
    }

    return {
      totalSamples: items.length,
      labeledSamples,
      unlabeledSamples,
      incompleteBucket,
    };
  }

  async updateIncompleteBucket(
    versionId: string,
    ownerId: string,
    bucket: QualityBucket | null
  ): Promise<LabelingStatusResult> {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Invalid dataset version id.'), { statusCode: 400 });
    }

    const version = await DatasetVersion.findOne({ _id: versionId });
    if (!version) {
      throw Object.assign(new Error('Dataset version not found.'), { statusCode: 404 });
    }

    const currentParams = version.operationParams && typeof version.operationParams === 'object'
      ? { ...(version.operationParams as Record<string, unknown>) }
      : {};

    if (bucket) {
      currentParams.qualityIncompleteBucket = bucket;
    } else {
      delete currentParams.qualityIncompleteBucket;
    }

    version.operationParams = currentParams;
    await version.save();

    const status = await this.getLabelingStatus(versionId, ownerId);
    return {
      ...status,
      incompleteBucket: bucket,
    };
  }

  private async syncRejectLabels(itemIds: any[], qualityItems: QualityItem[], ownerId: string): Promise<number> {
    const ownerOid = new mongoose.Types.ObjectId(ownerId);
    const rejectSampleIds = qualityItems
      .filter((item) => item.bucket === 'Reject')
      .map((item) => new mongoose.Types.ObjectId(item._id));

    await removeLabelsByQuery({
      sampleId: { $in: itemIds },
      name: 'REJECT',
      type: 'hard',
      targetScope: 'sample',
      targetTextSnapshot: QUALITY_AUTO_REJECT_MARKER,
      createdBy: ownerOid,
    });

    if (!rejectSampleIds.length) {
      return 0;
    }

    const docs = rejectSampleIds.map((sampleId) => ({
      sampleId,
      name: 'REJECT',
      type: 'hard' as const,
      targetScope: 'sample' as const,
      source: 'system' as const,
      targetTextSnapshot: QUALITY_AUTO_REJECT_MARKER,
      createdBy: ownerOid,
    }));

    await insertAssignments(docs);
    return docs.length;
  }

  async submitReview(
    versionId: string,
    reviewerId: string,
    sampleId: string,
    reviewData: {
      qualityClassification: 'Gold' | 'Rewrite' | 'Bad' | 'Incomplete';
      ratings: {
        knowledgeAccuracy: number;
        socraticPedagogical: number;
        encouragement: number;
        vietnameseLanguage: number;
        completeness: number;
        trainingReadiness: number;
      };
      errors?: {
        factualError: boolean;
        directAnswerIssue: boolean;
        languageIssue: boolean;
        needSupervisorReview: boolean;
      };
      note?: string;
    }
  ) {
    if (!mongoose.Types.ObjectId.isValid(versionId) || !mongoose.Types.ObjectId.isValid(sampleId)) {
      throw Object.assign(new Error('Invalid ID parameter'), { statusCode: 400 });
    }

    const { errors, ...rest } = reviewData;
    const review = await ConversationQualityReview.findOneAndUpdate(
      {
        datasetVersionId: new mongoose.Types.ObjectId(versionId),
        sampleId: new mongoose.Types.ObjectId(sampleId),
        reviewerId: new mongoose.Types.ObjectId(reviewerId),
      },
      {
        ...rest,
        errorFlags: errors,
        datasetVersionId: new mongoose.Types.ObjectId(versionId),
        sampleId: new mongoose.Types.ObjectId(sampleId),
        reviewerId: new mongoose.Types.ObjectId(reviewerId),
      },
      { upsert: true, new: true }
    );

    await this.updateConflictStatus(versionId, sampleId);
    return review;
  }

  async updateConflictStatus(versionId: string, sampleId: string) {
    const reviews = await ConversationQualityReview.find({
      datasetVersionId: new mongoose.Types.ObjectId(versionId),
      sampleId: new mongoose.Types.ObjectId(sampleId),
    }).lean();

    if (reviews.length <= 1) {
      await ConversationQualityAdjudication.deleteOne({
        datasetVersionId: new mongoose.Types.ObjectId(versionId),
        sampleId: new mongoose.Types.ObjectId(sampleId),
      });
      return;
    }

    const classifications = new Set(reviews.map((r) => r.qualityClassification));
    const hasConflict = classifications.size > 1;

    if (hasConflict) {
      await ConversationQualityAdjudication.findOneAndUpdate(
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(sampleId),
        },
        {
          hasConflict: true,
        },
        { upsert: true }
      );
    } else {
      await ConversationQualityAdjudication.findOneAndUpdate(
        {
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: new mongoose.Types.ObjectId(sampleId),
        },
        {
          finalClassification: reviews[0].qualityClassification,
          hasConflict: false,
        },
        { upsert: true }
      );
    }
  }

  async adjudicate(
    versionId: string,
    supervisorId: string,
    sampleId: string,
    finalClassification: 'Gold' | 'Rewrite' | 'Bad' | 'Incomplete',
    note?: string
  ) {
    if (!mongoose.Types.ObjectId.isValid(versionId) || !mongoose.Types.ObjectId.isValid(sampleId)) {
      throw Object.assign(new Error('Invalid ID parameter'), { statusCode: 400 });
    }

    const adjudication = await ConversationQualityAdjudication.findOneAndUpdate(
      {
        datasetVersionId: new mongoose.Types.ObjectId(versionId),
        sampleId: new mongoose.Types.ObjectId(sampleId),
      },
      {
        finalClassification,
        adjudicatedBy: new mongoose.Types.ObjectId(supervisorId),
        note: note || '',
        hasConflict: false,
      },
      { upsert: true, new: true }
    );

    return adjudication;
  }

  async getSampleReviews(versionId: string, sampleId: string) {
    const reviews = await ConversationQualityReview.find({
      datasetVersionId: new mongoose.Types.ObjectId(versionId),
      sampleId: new mongoose.Types.ObjectId(sampleId),
    }).populate('reviewerId', 'name email').lean();

    const adjudication = await ConversationQualityAdjudication.findOne({
      datasetVersionId: new mongoose.Types.ObjectId(versionId),
      sampleId: new mongoose.Types.ObjectId(sampleId),
    }).populate('adjudicatedBy', 'name email').lean();

    return {
      reviews,
      adjudication,
    };
  }

  async getStatistics(versionId: string) {
    const versionObjectId = new mongoose.Types.ObjectId(versionId);
    const version = await DatasetVersion.findById(versionId).lean();
    if (!version) {
      throw Object.assign(new Error('Dataset version not found.'), { statusCode: 404 });
    }

    const items = await ProcessedDatasetItem.find({ datasetVersionId: versionObjectId }).lean();
    const reviews = await ConversationQualityReview.find({ datasetVersionId: versionObjectId }).lean();
    const adjudications = await ConversationQualityAdjudication.find({ datasetVersionId: versionObjectId }).lean();

    const reviewsBySample = new Map<string, any[]>();
    for (const r of reviews) {
      const sid = String(r.sampleId);
      const list = reviewsBySample.get(sid) || [];
      list.push(r);
      reviewsBySample.set(sid, list);
    }

    const adjudicationBySample = new Map<string, any>();
    for (const adj of adjudications) {
      adjudicationBySample.set(String(adj.sampleId), adj);
    }

    const counts = { Gold: 0, Rewrite: 0, Bad: 0, Incomplete: 0 };
    const messageCounts = { Gold: 0, Rewrite: 0, Bad: 0, Incomplete: 0 };
    let conflictCount = 0;

    const subjectStats: Record<string, { subject: string; total: number; gold: number; rewrite: number; reject: number; incomplete: number }> = {};

    const ruleClassification = await this.classify(versionId, String(version.ownerId));
    const ruleClassificationMap = new Map<string, string>();
    for (const ri of ruleClassification.items) {
      ruleClassificationMap.set(ri._id, ri.bucket);
    }

    for (const item of items) {
      const sid = String(item._id);
      const adj = adjudicationBySample.get(sid);
      const sReviews = reviewsBySample.get(sid) || [];

      let finalClass: 'Gold' | 'Rewrite' | 'Bad' | 'Incomplete';

      if (adj && !adj.hasConflict) {
        finalClass = adj.finalClassification;
      } else if (adj && adj.hasConflict) {
        conflictCount += 1;
        finalClass = sReviews[0]?.qualityClassification || 'Incomplete';
      } else if (sReviews.length === 1) {
        finalClass = sReviews[0].qualityClassification;
      } else {
        const ruleBucket = ruleClassificationMap.get(sid);
        finalClass = ruleBucket === 'Reject' ? 'Bad' : (ruleBucket as any) || 'Incomplete';
      }

      if (counts[finalClass] !== undefined) {
        counts[finalClass] += 1;
        const msgCount = Array.isArray(item.data?.messages) ? item.data.messages.length : 2;
        messageCounts[finalClass] += msgCount;
      }

      const itemData = (item.data || {}) as any;
      const subClass = (itemData.subject_classification || {}) as any;
      const subject = subClass.subject_final ||
                      itemData.subject ||
                      itemData.subjectLabel ||
                      itemData.subject_label ||
                      itemData.groupLabel ||
                      itemData.group_label ||
                      (itemData.meta?.subject) ||
                      'Ungrouped';

      if (!subjectStats[subject]) {
        subjectStats[subject] = {
          subject,
          total: 0,
          gold: 0,
          rewrite: 0,
          reject: 0,
          incomplete: 0
        };
      }
      subjectStats[subject].total += 1;
      if (finalClass === 'Gold') {
        subjectStats[subject].gold += 1;
      } else if (finalClass === 'Rewrite') {
        subjectStats[subject].rewrite += 1;
      } else if (finalClass === 'Bad') {
        subjectStats[subject].reject += 1;
      } else {
        subjectStats[subject].incomplete += 1;
      }
    }

    const reviewerCountsMap = new Map<string, { name: string; count: number }>();
    const reviewers = await User.find({}).select('name email').lean();
    const reviewerNames = new Map(reviewers.map((u) => [String(u._id), u.name]));

    for (const r of reviews) {
      const rid = String(r.reviewerId);
      const name = reviewerNames.get(rid) || 'Unknown Reviewer';
      const stats = reviewerCountsMap.get(rid) || { name, count: 0 };
      stats.count += 1;
      reviewerCountsMap.set(rid, stats);
    }

    const totalMessages = Object.values(messageCounts).reduce((sum, c) => sum + c, 0);

    return {
      totalSamples: items.length,
      reviewedSamples: reviewsBySample.size,
      conflictCount,
      totalMessages,
      qualityDistribution: [
        { group: 'Gold', count: counts.Gold, messageCount: messageCounts.Gold, percentage: items.length ? Math.round((counts.Gold / items.length) * 100) : 0 },
        { group: 'Rewrite', count: counts.Rewrite, messageCount: messageCounts.Rewrite, percentage: items.length ? Math.round((counts.Rewrite / items.length) * 100) : 0 },
        { group: 'Bad', count: counts.Bad, messageCount: messageCounts.Bad, percentage: items.length ? Math.round((counts.Bad / items.length) * 100) : 0 },
        { group: 'Incomplete', count: counts.Incomplete, messageCount: messageCounts.Incomplete, percentage: items.length ? Math.round((counts.Incomplete / items.length) * 100) : 0 },
      ],
      reviewerStats: Array.from(reviewerCountsMap.values()),
      bySubject: Object.values(subjectStats),
    };
  }
}
