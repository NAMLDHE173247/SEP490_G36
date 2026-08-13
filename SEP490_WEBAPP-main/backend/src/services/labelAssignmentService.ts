import mongoose from 'mongoose';
import { DatasetSampleAssignment } from '../models/DatasetSampleAssignment';
import { DatasetVersion } from '../models/DatasetVersion';
import { Label } from '../models/Label';
import { LabelAssignment } from '../models/LabelAssignment';
import { ProcessedDatasetItem } from '../models/ProcessedDatasetItem';
import { DatasetAssignmentActivity } from '../models/DatasetAssignmentActivity';
import { DatasetAssignmentAdjudication } from '../models/DatasetAssignmentAdjudication';
import { DatasetCanonicalLabel } from '../models/DatasetCanonicalLabel';
import { DatasetAssignmentSubmission } from '../models/DatasetAssignmentSubmission';
import { CheckerActivityLog } from '../models/CheckerActivityLog';
import { User } from '../models/User';
import { QUALITY_AUTO_REJECT_MARKER } from '../modules/dataprep/quality/quality.constants';

export const HARD_LABELS = [
  'REJECT',
  'MATH',
  'PHYSICAL',
  'CHEMISTRY',
  'LITERATURE',
  'BIOLOGY',
  'OUT_OF_SCOPE',
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
  'WAIT_READY',
  // V2 Socratic student intents (đồng bộ với bộ nhãn của Staff)
  'DISCOURAGED',
  'READY_NEXT',
  'CONFIRM_UNDERSTANDING',
  'CONFIRM_CORRECT_ANSWER',
  'IDENTIFY_INCORRECT_ANSWER',
  'CORRECT_MISTAKE',
  'PRAISING',
  'SCAFFOLDING',
  'HINTING',
  'CONCEPT_CLARIFY',
  'LOGIC_BREAKDOWN',
  'SIMPLIFYING',
  'NAVIGATING',
  'MOTIVATING',
  'REDIRECTING',
  'TRANSITIONING',
  'WAITING',
  'DIRECT_ANSWER',
  // V2 new names (từ đợt refactor)
  'CONFIRM',
  'CORRECTION_VIA_QUESTION',
  'ELABORATION',
  'HINT',
] as const;

export type LabelScope = 'sample' | 'message';
export type LabelQueryScope = 'sample' | 'message' | 'all';
export type LabelRole = 'user' | 'assistant';
export type LabelType = 'hard' | 'soft';
export type LabelSource = 'ai' | 'human' | 'default' | 'system';


export type LabelAssignmentAggregate = {
  _id: string;
  sampleId: string;
  name: string;
  type: LabelType;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
  targetTextSnapshot?: string;
  source?: LabelSource;
  createdAt: Date | null;
  updatedAt: Date | null;
  assignedUserCount: number;
  assignedByCurrentUser: boolean;
  assignedUsers?: Array<{ id: string; name: string; email: string }>;
};

type EffectiveLabelAggregate = {
  sampleId: mongoose.Types.ObjectId | string;
  name: string;
  type: LabelType;
  targetScope: LabelScope;
  messageIndex?: number | null;
  messageRole?: LabelRole | null;
  assignedUserCount: number;
};

type AggregateOptions = {
  scope?: LabelQueryScope;
  messageIndex?: number;
  createdBy?: string;
  contributedBy?: string;
  includeAssignedUsers?: boolean;
  visibilityMode?: 'default' | 'review';
};

type TargetDescriptor = {
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
};

type DecisionTarget = TargetDescriptor & {
  key: string;
  labels: string[];
  targetTextSnapshot?: string;
};

function sampleScopeMatch(): Record<string, any> {
  return {
    $or: [
      { targetScope: 'sample' },
      { targetScope: { $exists: false } },
      { targetScope: null },
    ],
  };
}

function buildTargetKey(targetScope: LabelScope, messageIndex?: number | null, messageRole?: LabelRole | null): string {
  return targetScope === 'message'
    ? `message:${Number(messageIndex)}:${String(messageRole || '')}`
    : `sample:${Number.isInteger(Number(messageIndex)) ? Number(messageIndex) : 0}`;
}

export function normalizeTargetScope(value: unknown): LabelScope {
  return value === 'message' ? 'message' : 'sample';
}

export function normalizeQueryScope(value: unknown): LabelQueryScope {
  return value === 'message' || value === 'all' ? value : 'sample';
}

export function normalizeLabelName(name: unknown, type: LabelType): string {
  const raw = String(name || '').trim();
  return type === 'hard' ? raw.toUpperCase() : raw.toLowerCase();
}

export function isSupportedHardLabel(name: string): boolean {
  return HARD_LABELS.includes(name as any);
}

async function ensureLabelAssignmentsForSampleObjectIds(sampleIds: mongoose.Types.ObjectId[]): Promise<void> {
  if (!sampleIds.length) {
    return;
  }

  const legacyLabels = await Label.find({ sampleId: { $in: sampleIds } }).lean();
  if (!legacyLabels.length) {
    return;
  }

  const docs: any[] = [];
  legacyLabels.forEach((label: any) => {
    const contributorIds = new Set<string>();
    if (label.createdBy) {
      contributorIds.add(String(label.createdBy));
    }
    if (Array.isArray(label.upvotes)) {
      label.upvotes.forEach((userId: any) => contributorIds.add(String(userId)));
    }

    contributorIds.forEach((userId) => {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return;
      }
      docs.push({
        sampleId: label.sampleId,
        name: String(label.name || ''),
        type: label.type === 'soft' ? 'soft' : 'hard',
        targetScope: label.targetScope === 'message' ? 'message' : 'sample',
        messageIndex: Number.isInteger(Number(label.messageIndex)) ? Number(label.messageIndex) : null,
        messageRole: label.messageRole === 'user' || label.messageRole === 'assistant' ? label.messageRole : null,
        targetTextSnapshot: label.targetTextSnapshot ? String(label.targetTextSnapshot) : undefined,
        source: 'human',
        createdBy: new mongoose.Types.ObjectId(userId),
        legacyLabelId: label._id,
      });
    });
  });

  if (!docs.length) {
    return;
  }

  try {
    await LabelAssignment.insertMany(docs, { ordered: false });
  } catch (error: any) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

export async function ensureLabelAssignmentsForSamples(sampleIds: Array<string | mongoose.Types.ObjectId>): Promise<void> {
  const validIds = sampleIds
    .map((sampleId) => String(sampleId))
    .filter((sampleId) => mongoose.Types.ObjectId.isValid(sampleId))
    .map((sampleId) => new mongoose.Types.ObjectId(sampleId));
  await ensureLabelAssignmentsForSampleObjectIds(validIds);
}

async function resolveSample(sampleId: string, datasetVersionId?: string) {
  if (mongoose.Types.ObjectId.isValid(sampleId)) {
    const sample = await ProcessedDatasetItem.findById(sampleId).select('_id datasetVersionId sampleId').lean();
    if (sample) return sample;
  }

  const query: any = {
    $or: [
      { sampleId: sampleId },
      { sampleId: `sample_${String(sampleId).padStart(3, '0')}` },
      { sampleId: `sample_${sampleId}` },
    ]
  };
  if (datasetVersionId && mongoose.Types.ObjectId.isValid(datasetVersionId)) {
    query.datasetVersionId = new mongoose.Types.ObjectId(datasetVersionId);
  }
  const sample = await ProcessedDatasetItem.findOne(query).select('_id datasetVersionId sampleId').lean();
  if (!sample) {
    const error = new Error(`Sample not found: ${sampleId}`);
    (error as any).statusCode = 404;
    throw error;
  }
  return sample;
}

async function recordActivityForAssignment(params: {
  sampleId: mongoose.Types.ObjectId;
  datasetVersionId: mongoose.Types.ObjectId;
  annotatorId: mongoose.Types.ObjectId;
  labelName: string;
  labelType: LabelType;
  targetScope: LabelScope;
  messageIndex?: number | null;
  messageRole?: LabelRole | null;
  activityType: 'assign' | 'unassign';
}) {
  if (params.labelType !== 'hard') {
    return;
  }

  const isAssigned = await DatasetSampleAssignment.exists({
    datasetVersionId: params.datasetVersionId,
    sampleId: params.sampleId,
    assigneeId: params.annotatorId,
  });
  if (!isAssigned) {
    return;
  }

  await DatasetAssignmentActivity.create({
    datasetVersionId: params.datasetVersionId,
    sampleId: params.sampleId,
    annotatorId: params.annotatorId,
    labelName: params.labelName,
    labelType: params.labelType,
    targetScope: params.targetScope,
    messageIndex: params.messageIndex ?? null,
    messageRole: params.messageRole ?? null,
    activityType: params.activityType,
  });
}

function buildAggregateKey(doc: any): string {
  return [
    String(doc.sampleId),
    String(doc.name || ''),
    String(doc.type || 'hard'),
    String(doc.targetScope === 'message' ? 'message' : 'sample'),
    Number.isInteger(Number(doc.messageIndex)) ? Number(doc.messageIndex) : '',
    doc.messageRole === 'user' || doc.messageRole === 'assistant' ? doc.messageRole : '',
  ].join('::');
}

function mergeAggregateDocs(
  docs: any[],
  viewerId: string,
  assignedUserMap: Map<string, { id: string; name: string; email: string }>,
  includeAssignedUsers: boolean
): LabelAssignmentAggregate[] {
  const grouped = new Map<string, LabelAssignmentAggregate & { userIds: Set<string> }>();

  docs.forEach((doc: any) => {
    const key = buildAggregateKey(doc);
    if (!grouped.has(key)) {
      grouped.set(key, {
        _id: key,
        sampleId: String(doc.sampleId),
        name: String(doc.name || ''),
        type: doc.type === 'soft' ? 'soft' : 'hard',
        targetScope: doc.targetScope === 'message' ? 'message' : 'sample',
        messageIndex: Number.isInteger(Number(doc.messageIndex)) ? Number(doc.messageIndex) : undefined,
        messageRole: doc.messageRole === 'user' || doc.messageRole === 'assistant' ? doc.messageRole : undefined,
        targetTextSnapshot: doc.targetTextSnapshot ? String(doc.targetTextSnapshot) : undefined,
        source: doc.source || 'human',
        createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
        assignedUserCount: 0,
        assignedByCurrentUser: false,
        assignedUsers: includeAssignedUsers ? [] : undefined,
        userIds: new Set<string>(),
      });
    }

    const entry = grouped.get(key)!;
    const contributorId = String(doc.createdBy?._id || doc.createdBy || '');
    if (!contributorId || entry.userIds.has(contributorId)) {
      return;
    }

    entry.userIds.add(contributorId);
    entry.assignedUserCount += 1;
    if (contributorId === String(viewerId)) {
      entry.assignedByCurrentUser = true;
    }

    if (includeAssignedUsers) {
      const user = assignedUserMap.get(contributorId);
      if (user && entry.assignedUsers) {
        entry.assignedUsers.push(user);
      }
    }
  });

  return Array.from(grouped.values()).map((item) => {
    const { userIds: _userIds, ...rest } = item;
    return rest;
  });
}

function mapCanonicalRowsToAggregateDocs(rows: any[]): any[] {
  return rows.flatMap((row: any) =>
    (Array.isArray(row.labels) ? row.labels : [])
      .map((name: any) => String(name || '').trim().toUpperCase())
      .filter(Boolean)
      .map((name: string) => ({
        sampleId: row.sampleId,
        name,
        type: 'hard',
        targetScope: row.targetScope === 'message' ? 'message' : 'sample',
        messageIndex: Number.isInteger(Number(row.messageIndex)) ? Number(row.messageIndex) : null,
        messageRole: row.messageRole === 'user' || row.messageRole === 'assistant' ? row.messageRole : null,
        targetTextSnapshot: row.targetTextSnapshot ? String(row.targetTextSnapshot) : undefined,
        source: 'system',
        createdBy: row.publishedBy,
        createdAt: row.publishedAt || row.updatedAt || row.createdAt || null,
        updatedAt: row.updatedAt || row.publishedAt || row.createdAt || null,
      }))
  );
}

async function getCanonicalLabelsForSample(
  sample: any,
  scope: LabelQueryScope,
  messageIndex?: number
): Promise<any[]> {
  const query: Record<string, any> = {
    datasetVersionId: sample.datasetVersionId,
    sampleId: sample._id,
  };

  if (scope === 'sample') {
    query.targetScope = 'sample';
  } else if (scope === 'message') {
    query.targetScope = 'message';
    if (messageIndex !== undefined) {
      query.messageIndex = messageIndex;
    }
  }

  return DatasetCanonicalLabel.find(query)
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();
}

export async function getAggregatedLabelsForSample(
  sampleId: string,
  viewerId: string,
  options: AggregateOptions = {}
): Promise<LabelAssignmentAggregate[]> {
  await ensureLabelAssignmentsForSamples([sampleId]);
  const sample = await resolveSample(sampleId);
  const visibilityMode = options.visibilityMode === 'review' ? 'review' : 'default';
  const filterUserId = options.createdBy || options.contributedBy;
  const datasetVersion = await DatasetVersion.findById(sample.datasetVersionId).select('ownerId').lean();
  const ownerId = String((datasetVersion as any)?.ownerId || '');

  const query: Record<string, any> = {
    sampleId: sample._id,
  };

  const scope = normalizeQueryScope(options.scope);
  if (scope === 'sample') {
    Object.assign(query, sampleScopeMatch());
  } else if (scope === 'message') {
    query.targetScope = 'message';
    if (options.messageIndex !== undefined) {
      query.messageIndex = options.messageIndex;
    }
  }

  if (filterUserId) {
    query.createdBy = new mongoose.Types.ObjectId(filterUserId);
  }

  if (
    visibilityMode === 'review'
    && filterUserId
    && ownerId
    && String(viewerId) === ownerId
  ) {
    const submittedSubmission = await DatasetAssignmentSubmission.findOne({
      datasetVersionId: new mongoose.Types.ObjectId(sample.datasetVersionId),
      assigneeId: new mongoose.Types.ObjectId(filterUserId),
      status: { $in: ['submitted', 'approved'] },
    }).select('_id').lean();
    if (!submittedSubmission) {
      throw Object.assign(new Error('Assignee labels can only be reviewed after submission.'), { statusCode: 409 });
    }
  }

  const docs = await LabelAssignment.find(query)
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  const viewerUser = await User.findById(viewerId).select('role').lean();
  const viewerRole = String(viewerUser?.role || '').toLowerCase();
  const isPrivilegedViewer = ['admin', 'supervisor', 'checker'].includes(viewerRole) || String(viewerId) === ownerId;

  let visibleDocs = docs;
  if (visibilityMode === 'default' && docs.length) {
    if (isPrivilegedViewer) {
      const privilegedUsers = await User.find({ role: { $in: ['admin', 'supervisor', 'checker'] } }).select('_id').lean();
      const privilegedIds = new Set<string>(privilegedUsers.map((u: any) => String(u._id)));
      if (ownerId) privilegedIds.add(String(ownerId));

      visibleDocs = docs.filter((doc: any) => {
        const contributorId = String(doc.createdBy?._id || doc.createdBy || '');
        return contributorId ? privilegedIds.has(contributorId) : false;
      });
    } else {
      visibleDocs = docs.filter((doc: any) => {
        const contributorId = String(doc.createdBy?._id || doc.createdBy || '');
        return contributorId === String(viewerId);
      });
    }
  }

  const canonicalRows = isPrivilegedViewer
    ? await getCanonicalLabelsForSample(sample, scope, options.messageIndex)
    : [];
  if (canonicalRows.length) {
    visibleDocs = [...mapCanonicalRowsToAggregateDocs(canonicalRows), ...visibleDocs];
  }

  const contributorIds = Array.from(
    new Set(
      visibleDocs
        .map((doc: any) => String(doc.createdBy?._id || doc.createdBy || ''))
        .filter(Boolean)
    )
  );
  const users = contributorIds.length
    ? await User.find({ _id: { $in: contributorIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('_id name email role')
        .lean()
    : [];
  const userMap = new Map(
    users.map((user: any) => [
      String(user._id),
      { id: String(user._id), name: String(user.name || ''), email: String(user.email || ''), role: String(user.role || 'staff') },
    ])
  );

  return mergeAggregateDocs(visibleDocs, viewerId, userMap, Boolean(options.includeAssignedUsers));
}

export async function assignLabelToSample(params: {
  sampleId: string;
  userId: string;
  name: string;
  type: LabelType;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
  targetTextSnapshot?: string;
  source?: LabelSource;
}) {
  const sample = await resolveSample(params.sampleId);
  await ensureLabelAssignmentsForSamples([params.sampleId]);

  const normalizedName = normalizeLabelName(params.name, params.type);
  const doc = await LabelAssignment.findOneAndUpdate(
    {
      sampleId: sample._id,
      createdBy: new mongoose.Types.ObjectId(params.userId),
      type: params.type,
      name: normalizedName,
      targetScope: params.targetScope,
      messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
      messageRole: params.targetScope === 'message' ? params.messageRole : null,
    },
    {
      $setOnInsert: {
        targetTextSnapshot: params.targetTextSnapshot,
        source: params.source || 'human',
      },
    },
    { upsert: true, returnDocument: 'after' }
  ).lean();

  await recordActivityForAssignment({
    sampleId: sample._id as any,
    datasetVersionId: sample.datasetVersionId as any,
    annotatorId: new mongoose.Types.ObjectId(params.userId),
    labelName: normalizedName,
    labelType: params.type,
    targetScope: params.targetScope,
    messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
    messageRole: params.targetScope === 'message' ? params.messageRole : null,
    activityType: 'assign',
  });

  return doc;
}

export async function unassignLabelFromSample(params: {
  sampleId: string;
  userId: string;
  name: string;
  type: LabelType;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
}) {
  const sample = await resolveSample(params.sampleId);
  await ensureLabelAssignmentsForSamples([params.sampleId]);

  const normalizedName = normalizeLabelName(params.name, params.type);
  const result = await LabelAssignment.findOneAndDelete({
    sampleId: sample._id,
    createdBy: new mongoose.Types.ObjectId(params.userId),
    type: params.type,
    name: normalizedName,
    targetScope: params.targetScope,
    messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
    messageRole: params.targetScope === 'message' ? params.messageRole : null,
  }).lean();

  if (result) {
    await recordActivityForAssignment({
      sampleId: sample._id as any,
      datasetVersionId: sample.datasetVersionId as any,
      annotatorId: new mongoose.Types.ObjectId(params.userId),
      labelName: normalizedName,
      labelType: params.type,
      targetScope: params.targetScope,
      messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
      messageRole: params.targetScope === 'message' ? params.messageRole : null,
      activityType: 'unassign',
    });
  }

  return result;
}

export async function replaceHardLabelsForUserOnTarget(params: {
  sampleId: string;
  userId: string;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
  labels: string[];
  targetTextSnapshot?: string;
  source?: LabelSource;
}) {
  const sample = await resolveSample(params.sampleId);
  await ensureLabelAssignmentsForSamples([params.sampleId]);

  const normalizedLabels = Array.from(
    new Set(
      (params.labels || [])
        .map((label) => normalizeLabelName(label, 'hard'))
        .filter(Boolean)
    )
  );

  const filter = {
    sampleId: sample._id,
    createdBy: new mongoose.Types.ObjectId(params.userId),
    type: 'hard',
    targetScope: params.targetScope,
    messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
    messageRole: params.targetScope === 'message' ? params.messageRole : null,
  } as Record<string, any>;

  const existing = await LabelAssignment.find(filter).lean();
  const existingNames = new Set(existing.map((doc: any) => String(doc.name || '').toUpperCase()));
  const nextNames = new Set(normalizedLabels);

  const toDelete = existing.filter((doc: any) => !nextNames.has(String(doc.name || '').toUpperCase()));
  const toCreate = normalizedLabels.filter((name) => !existingNames.has(name));

  if (toDelete.length) {
    await LabelAssignment.deleteMany({ _id: { $in: toDelete.map((doc: any) => doc._id) } });
    await Promise.all(
      toDelete.map((doc: any) =>
        recordActivityForAssignment({
          sampleId: sample._id as any,
          datasetVersionId: sample.datasetVersionId as any,
          annotatorId: new mongoose.Types.ObjectId(params.userId),
          labelName: String(doc.name || ''),
          labelType: 'hard',
          targetScope: params.targetScope,
          messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
          messageRole: params.targetScope === 'message' ? params.messageRole : null,
          activityType: 'unassign',
        })
      )
    );
  }

  if (toCreate.length) {
    const docs = toCreate.map((name) => ({
      sampleId: sample._id,
      createdBy: new mongoose.Types.ObjectId(params.userId),
      type: 'hard',
      name,
      targetScope: params.targetScope,
      messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
      messageRole: params.targetScope === 'message' ? params.messageRole : null,
      targetTextSnapshot: params.targetTextSnapshot,
      source: params.source || 'human',
    }));
    await LabelAssignment.insertMany(docs, { ordered: false });
    await Promise.all(
      toCreate.map((name) =>
        recordActivityForAssignment({
          sampleId: sample._id as any,
          datasetVersionId: sample.datasetVersionId as any,
          annotatorId: new mongoose.Types.ObjectId(params.userId),
          labelName: name,
          labelType: 'hard',
          targetScope: params.targetScope,
          messageIndex: params.targetScope === 'message' ? Number(params.messageIndex) : null,
          messageRole: params.targetScope === 'message' ? params.messageRole : null,
          activityType: 'assign',
        })
      )
    );
  }
}

export async function removeLabelsByQuery(query: Record<string, any>) {
  await LabelAssignment.deleteMany(query);
}

export async function insertAssignments(docs: any[]) {
  if (!docs.length) {
    return;
  }
  const docsWithSource = docs.map((doc) => ({ source: 'human', ...doc }));
  try {
    await LabelAssignment.insertMany(docsWithSource, { ordered: false });
  } catch (error: any) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

export async function getHardRejectedSampleIds(scopedSampleIds?: mongoose.Types.ObjectId[]): Promise<Set<string>> {
  await ensureLabelAssignmentsForSamples((scopedSampleIds || []).map((id) => String(id)));

  const match: Record<string, any> = {
    name: 'REJECT',
    type: 'hard',
    targetTextSnapshot: { $ne: QUALITY_AUTO_REJECT_MARKER },
    $or: [
      { targetScope: 'sample' },
      { targetScope: { $exists: false } },
      { targetScope: null },
    ],
  };
  if (scopedSampleIds && scopedSampleIds.length) {
    match.sampleId = { $in: scopedSampleIds };
  }

  const rows = await LabelAssignment.aggregate([
    { $match: match },
    { $group: { _id: '$sampleId', contributorCount: { $addToSet: '$createdBy' } } },
    { $project: { contributorCount: { $size: '$contributorCount' } } },
    { $match: { contributorCount: { $gt: 0 } } },
  ]);

  return new Set(rows.map((row: any) => String(row._id)));
}

export async function getTopLabelForSampleIds(sampleIds: mongoose.Types.ObjectId[]) {
  await ensureLabelAssignmentsForSamples(sampleIds.map((id) => String(id)));
  const rows = await LabelAssignment.aggregate([
    { $match: { sampleId: { $in: sampleIds } } },
    {
      $group: {
        _id: { name: '$name', type: '$type' },
        contributors: { $addToSet: '$createdBy' },
        latestCreatedAt: { $max: '$createdAt' },
      },
    },
    {
      $project: {
        name: '$_id.name',
        type: '$_id.type',
        assignedUserCount: { $size: '$contributors' },
        latestCreatedAt: 1,
      },
    },
    { $sort: { assignedUserCount: -1, latestCreatedAt: -1 } },
    { $limit: 1 },
  ]);

  return rows[0] || null;
}

export async function getAggregatedSampleLabels(sampleIds: mongoose.Types.ObjectId[]) {
  await ensureLabelAssignmentsForSamples(sampleIds.map((id) => String(id)));
  return LabelAssignment.aggregate([
    { $match: { sampleId: { $in: sampleIds } } },
    {
      $group: {
        _id: {
          sampleId: '$sampleId',
          name: '$name',
          type: '$type',
          targetScope: '$targetScope',
          messageIndex: '$messageIndex',
          messageRole: '$messageRole',
        },
        contributors: { $addToSet: '$createdBy' },
      },
    },
    {
      $project: {
        sampleId: '$_id.sampleId',
        name: '$_id.name',
        type: '$_id.type',
        targetScope: '$_id.targetScope',
        messageIndex: '$_id.messageIndex',
        messageRole: '$_id.messageRole',
        assignedUserCount: { $size: '$contributors' },
      },
    },
  ]);
}


export async function getCanonicalSampleLabelsForVersion(
  datasetVersionId: string | mongoose.Types.ObjectId,
  sampleIds: mongoose.Types.ObjectId[]
): Promise<EffectiveLabelAggregate[]> {
  if (!sampleIds.length) {
    return [];
  }

  const versionOid = typeof datasetVersionId === 'string'
    ? new mongoose.Types.ObjectId(datasetVersionId)
    : datasetVersionId;

  const rows = await DatasetCanonicalLabel.find({
    datasetVersionId: versionOid,
    sampleId: { $in: sampleIds },
  }).lean();

  return rows.flatMap((row: any) =>
    (Array.isArray(row.labels) ? row.labels : [])
      .map((name: any) => String(name || '').trim().toUpperCase())
      .filter(Boolean)
      .map((name: string) => ({
        sampleId: row.sampleId,
        name,
        type: 'hard' as const,
        targetScope: row.targetScope === 'message' ? 'message' : 'sample',
        messageIndex: Number.isInteger(Number(row.messageIndex)) ? Number(row.messageIndex) : null,
        messageRole: row.messageRole === 'user' || row.messageRole === 'assistant' ? row.messageRole : null,
        assignedUserCount: 1,
      }))
  );
}

export async function getEffectiveSampleLabelsForVersion(
  datasetVersionId: string | mongoose.Types.ObjectId,
  sampleIds: mongoose.Types.ObjectId[]
): Promise<EffectiveLabelAggregate[]> {
  const versionOid = typeof datasetVersionId === 'string'
    ? new mongoose.Types.ObjectId(datasetVersionId)
    : datasetVersionId;

  // 1. Get all canonical/published labels
  const canonical = await getCanonicalSampleLabelsForVersion(versionOid, sampleIds);

  // 2. Load all raw hard label assignments
  await ensureLabelAssignmentsForSamples(sampleIds.map(id => String(id)));
  const hardAssignments = await LabelAssignment.find({
    sampleId: { $in: sampleIds },
    type: 'hard'
  }).lean();

  // 3. Find unique creators and get their roles
  const creatorIds = Array.from(new Set(hardAssignments.map(a => String(a.createdBy))));
  const creators = creatorIds.length
    ? await User.find({ _id: { $in: creatorIds } }).select('_id role').lean()
    : [];
  const creatorRoleMap = new Map<string, string>(creators.map((c: any) => [String(c._id), c.role || 'staff']));

  // 4. Load assignee count per sample to know if it's overlap/multi-staff
  const assignments = await DatasetSampleAssignment.find({
    datasetVersionId: versionOid,
    sampleId: { $in: sampleIds },
    active: true
  }).select('sampleId assigneeId').lean();

  const sampleAssigneeCount = new Map<string, number>();
  assignments.forEach((asg: any) => {
    const sid = String(asg.sampleId);
    sampleAssigneeCount.set(sid, (sampleAssigneeCount.get(sid) || 0) + 1);
  });

  // 5. Group hard assignments by sample + target key
  // Target key: targetScope:messageIndex:messageRole
  const groupedHard = new Map<string, any[]>();
  hardAssignments.forEach((a: any) => {
    const targetKey = `${String(a.sampleId)}:${a.targetScope}:${a.messageIndex ?? ''}:${a.messageRole ?? ''}`;
    const list = groupedHard.get(targetKey) || [];
    list.push(a);
    groupedHard.set(targetKey, list);
  });

  // 6. For each group, determine the effective labels
  const canonicalKeys = new Set(canonical.map(c => 
    `${c.sampleId}:${c.targetScope}:${c.messageIndex ?? ''}:${c.messageRole ?? ''}`
  ));

  const effectiveHard: EffectiveLabelAggregate[] = [];
  
  groupedHard.forEach((docs, targetKey) => {
    // If it's already in canonical, discard hard assignments
    if (canonicalKeys.has(targetKey)) {
      return;
    }

    // Partition docs by role
    const checkerDocs = docs.filter(d => {
      const role = creatorRoleMap.get(String(d.createdBy));
      return role === 'checker' || role === 'supervisor' || role === 'admin';
    });

    const sid = String(docs[0].sampleId);
    const assigneeCount = sampleAssigneeCount.get(sid) || 0;

    if (checkerDocs.length > 0) {
      // If checker/supervisor/admin has labeled, use their labels ONLY!
      const counts = new Map<string, Set<string>>();
      checkerDocs.forEach((d) => {
        const name = String(d.name || '').trim().toUpperCase();
        if (name) {
          const list = counts.get(name) || new Set<string>();
          list.add(String(d.createdBy));
          counts.set(name, list);
        }
      });
      counts.forEach((contributors, name) => {
        effectiveHard.push({
          sampleId: docs[0].sampleId,
          name,
          type: 'hard',
          targetScope: docs[0].targetScope,
          messageIndex: docs[0].messageIndex,
          messageRole: docs[0].messageRole,
          assignedUserCount: contributors.size
        });
      });
    } else {
      // No checker label yet. Check if staff annotators agreed, or if assigneeCount < 2
      const staffDocs = docs.filter(d => !checkerDocs.includes(d));
      const userLabelsMap = new Map<string, string[]>();
      staffDocs.forEach((d) => {
        const userId = String(d.createdBy);
        const name = String(d.name || '').trim().toUpperCase();
        if (name) {
          const list = userLabelsMap.get(userId) || [];
          if (!list.includes(name)) list.push(name);
          userLabelsMap.set(userId, list);
        }
      });

      const uniqueStaffCount = userLabelsMap.size;
      let staffAgreed = false;
      if (uniqueStaffCount > 0) {
        const lists = Array.from(userLabelsMap.values());
        const firstList = lists[0].slice().sort();
        staffAgreed = lists.every(list => {
          if (list.length !== firstList.length) return false;
          const sorted = list.slice().sort();
          return sorted.every((val, index) => val === firstList[index]);
        });
      }

      if (staffAgreed || assigneeCount < 2) {
        const counts = new Map<string, Set<string>>();
        staffDocs.forEach((d) => {
          const name = String(d.name || '').trim().toUpperCase();
          if (name) {
            const list = counts.get(name) || new Set<string>();
            list.add(String(d.createdBy));
            counts.set(name, list);
          }
        });
        counts.forEach((contributors, name) => {
          effectiveHard.push({
            sampleId: docs[0].sampleId,
            name,
            type: 'hard',
            targetScope: docs[0].targetScope,
            messageIndex: docs[0].messageIndex,
            messageRole: docs[0].messageRole,
            assignedUserCount: contributors.size
          });
        });
      }
    }
  });

  return [...canonical, ...effectiveHard];
}

export async function getEffectiveHardRejectedSampleIdsForVersion(
  datasetVersionId: string | mongoose.Types.ObjectId,
  sampleIds: mongoose.Types.ObjectId[]
): Promise<Set<string>> {
  const effectiveLabels = await getEffectiveSampleLabelsForVersion(datasetVersionId, sampleIds);
  return new Set(
    effectiveLabels
      .filter((label) =>
        label.type === 'hard'
        && label.name === 'REJECT'
        && (label.targetScope === 'sample' || !label.targetScope)
      )
      .map((label) => String(label.sampleId))
  );
}

export async function getContributorCountsForSample(sampleIds: mongoose.Types.ObjectId[]) {
  await ensureLabelAssignmentsForSamples(sampleIds.map((id) => String(id)));
  const rows = await LabelAssignment.aggregate([
    { $match: { sampleId: { $in: sampleIds } } },
    {
      $group: {
        _id: {
          sampleId: '$sampleId',
          name: '$name',
          type: '$type',
        },
        contributors: { $addToSet: '$createdBy' },
      },
    },
    {
      $project: {
        sampleId: '$_id.sampleId',
        name: '$_id.name',
        type: '$_id.type',
        assignedUserCount: { $size: '$contributors' },
      },
    },
  ]);
  return rows;
}

function getLogicalMessagesForSample(sample: any): Array<{ messageIndex: number; role: LabelRole; content: string }> {
  if (Array.isArray(sample?.data?.messages)) {
    return sample.data.messages
      .map((message: any, index: number) => ({
        messageIndex: index,
        role: message?.role === 'assistant' ? 'assistant' : 'user',
        content: String(message?.content || ''),
      }))
      .filter((message: any) => message.content.trim().length > 0);
  }

  return [
    {
      messageIndex: 0,
      role: 'user' as const,
      content: [sample?.data?.instruction, sample?.data?.input]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      messageIndex: 1,
      role: 'assistant' as const,
      content: String(sample?.data?.output || ''),
    },
  ].filter((message) => message.content.trim().length > 0);
}

const DRAFT_INTENT_MAP: Record<string, string> = {
  'Ask Explanation': 'REQUEST_EXPLANATION',
  'Solve Exercise': 'ANSWER_ATTEMPT',
  'Request Formula': 'ASK_THEORY',
  'Confirm Understanding': 'NEXT_SECTION',
  'Ask Example': 'REQUEST_SIMPLER',
  Hint: 'REQUEST_HINT',
  Ques: 'REQUEST_EXPLANATION',
  'Ques/Hint': 'REQUEST_HINT',
  Other: 'WAIT_READY',
};

const DRAFT_ACTION_MAP: Record<string, string> = {
  'Guide Step-by-step': 'LOGIC_BREAKDOWN',
  'Give Hint': 'HINTING',
  'Ask Probing Question': 'SCAFFOLDING',
  'Provide Formula': 'CONCEPT_CLARIFY',
  Encourage: 'MOTIVATING',
  'Correct Error': 'SCAFFOLDING',
  Summarize: 'TRANSITIONING',
  Hint: 'HINTING',
  Ques: 'SCAFFOLDING',
  'Ques/Hint': 'SCAFFOLDING',
  Other: 'WAITING',
};

const USER_INTENT_SET = new Set([
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
  'WAIT_READY',
]);

const ASSISTANT_ACTION_SET = new Set([
  'CONFIRM_CORRECT_ANSWER',
  'IDENTIFY_INCORRECT_ANSWER',
  'CORRECT_MISTAKE',
  'PRAISING',
  'SCAFFOLDING',
  'HINTING',
  'CONCEPT_CLARIFY',
  'LOGIC_BREAKDOWN',
  'SIMPLIFYING',
  'NAVIGATING',
  'MOTIVATING',
  'REDIRECTING',
  'TRANSITIONING',
  'WAITING',
  'DIRECT_ANSWER',
]);

const SUBJECT_CODE_SET = new Set([
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

export const SUBJECT_CANONICAL_MAP: Record<string, { code: string; display: string }> = {
  'MATH': { code: 'MATH', display: 'Toán' },
  'TOAN': { code: 'MATH', display: 'Toán' },
  'TOÁN': { code: 'MATH', display: 'Toán' },
  'PHYSICS': { code: 'PHYSICS', display: 'Vật lý' },
  'PHYSICAL': { code: 'PHYSICS', display: 'Vật lý' },
  'VAT LY': { code: 'PHYSICS', display: 'Vật lý' },
  'VẬT LÝ': { code: 'PHYSICS', display: 'Vật lý' },
  'CHEMISTRY': { code: 'CHEMISTRY', display: 'Hóa học' },
  'HOA HOC': { code: 'CHEMISTRY', display: 'Hóa học' },
  'HÓA HỌC': { code: 'CHEMISTRY', display: 'Hóa học' },
  'BIOLOGY': { code: 'BIOLOGY', display: 'Sinh học' },
  'SINH HOC': { code: 'BIOLOGY', display: 'Sinh học' },
  'SINH HỌC': { code: 'BIOLOGY', display: 'Sinh học' },
  'LITERATURE': { code: 'LITERATURE', display: 'Ngữ văn' },
  'VAN HOC': { code: 'LITERATURE', display: 'Ngữ văn' },
  'VĂN HỌC': { code: 'LITERATURE', display: 'Ngữ văn' },
  'NGU VAN': { code: 'LITERATURE', display: 'Ngữ văn' },
  'NGỮ VĂN': { code: 'LITERATURE', display: 'Ngữ văn' },
  'ENGLISH': { code: 'ENGLISH', display: 'Tiếng Anh' },
  'TIENG ANH': { code: 'ENGLISH', display: 'Tiếng Anh' },
  'TIẾNG ANH': { code: 'ENGLISH', display: 'Tiếng Anh' },
  'HISTORY': { code: 'HISTORY', display: 'Lịch sử' },
  'LICH SU': { code: 'HISTORY', display: 'Lịch sử' },
  'LỊCH SỬ': { code: 'HISTORY', display: 'Lịch sử' },
  'GEOGRAPHY': { code: 'GEOGRAPHY', display: 'Địa lý' },
  'DIA LY': { code: 'GEOGRAPHY', display: 'Địa lý' },
  'ĐỊA LÝ': { code: 'GEOGRAPHY', display: 'Địa lý' },
  'CODING': { code: 'CODING', display: 'Tin học' },
  'IT': { code: 'CODING', display: 'Tin học' },
  'TIN HOC': { code: 'CODING', display: 'Tin học' },
  'TIN HỌC': { code: 'CODING', display: 'Tin học' },
  'CIVICS': { code: 'CIVICS', display: 'GDCD' },
  'GDCD': { code: 'CIVICS', display: 'GDCD' },
  'MULTI': { code: 'MULTI', display: 'Liên môn' },
  'MULTI-SUBJECT': { code: 'MULTI', display: 'Liên môn' },
  'LIEN MON': { code: 'MULTI', display: 'Liên môn' },
  'LIÊN MÔN': { code: 'MULTI', display: 'Liên môn' },
  'OTHER': { code: 'OTHER', display: 'Chưa rõ' },
  'UNCLEAR': { code: 'OTHER', display: 'Chưa rõ' },
  'CHUA RO': { code: 'OTHER', display: 'Chưa rõ' },
  'CHƯA RÕ': { code: 'OTHER', display: 'Chưa rõ' },
};

export const COMPLETION_CANONICAL_MAP: Record<string, { code: string; display: string }> = {
  'COMPLETED': { code: 'COMPLETED', display: 'Hoàn thành' },
  'HOÀN THÀNH': { code: 'COMPLETED', display: 'Hoàn thành' },
  'HOAN THANH': { code: 'COMPLETED', display: 'Hoàn thành' },
  'INCOMPLETE': { code: 'INCOMPLETE', display: 'Chưa hoàn thành' },
  'CHƯA HOÀN THÀNH': { code: 'INCOMPLETE', display: 'Chưa hoàn thành' },
  'CHUA HOAN THANH': { code: 'INCOMPLETE', display: 'Chưa hoàn thành' },
  'ABANDONED': { code: 'ABANDONED', display: 'Bỏ dở' },
  'BỎ DỞ': { code: 'ABANDONED', display: 'Bỏ dở' },
  'BO DO': { code: 'ABANDONED', display: 'Bỏ dở' },
};

export const QUALITY_CANONICAL_MAP: Record<string, { code: string; display: string }> = {
  'GOLD': { code: 'GOLD', display: 'Gold' },
  'GOOD': { code: 'GOLD', display: 'Gold' },
  'TỐT': { code: 'GOLD', display: 'Gold' },
  'TOT': { code: 'GOLD', display: 'Gold' },
  'REWRITE': { code: 'REWRITE', display: 'Rewrite' },
  'MEDIUM': { code: 'REWRITE', display: 'Rewrite' },
  'CẦN VIẾT LẠI': { code: 'REWRITE', display: 'Rewrite' },
  'CAN VIET LAI': { code: 'REWRITE', display: 'Rewrite' },
  'BAD': { code: 'BAD', display: 'Bad' },
  'POOR': { code: 'BAD', display: 'Bad' },
  'CHƯA ĐẠT': { code: 'BAD', display: 'Bad' },
  'CHUA DAT': { code: 'BAD', display: 'Bad' },
};

const VIETNAMESE_INTENT_MAP: Record<string, string> = {
  'HỌC SINH TRẢ LỜI/THỬ LÀM BÀI': 'ANSWER_ATTEMPT',
  'HỌC SINH TRẢ LỜI': 'ANSWER_ATTEMPT',
  'THỬ LÀM BÀI': 'ANSWER_ATTEMPT',
  'XIN GỢI Ý': 'REQUEST_HINT',
  'GỢI Ý': 'REQUEST_HINT',
  'HỎI LÝ THUYẾT': 'ASK_THEORY',
  'LÝ THUYẾT': 'ASK_THEORY',
  'YÊU CẦU GIẢI THÍCH': 'REQUEST_EXPLANATION',
  'GIẢI THÍCH': 'REQUEST_EXPLANATION',
  'MUỐN GIẢI THÍCH ĐƠN GIẢN HƠN': 'REQUEST_SIMPLER',
  'ĐƠN GIẢN HƠN': 'REQUEST_SIMPLER',
  'BỎ QUA BÀI': 'SKIP_EXERCISE',
  'BỎ QUA': 'SKIP_EXERCISE',
  'CHÁN NẢN': 'DISCOURAGED',
  'NGOÀI PHẠM VI': 'OFF_TOPIC',
  'MUỐN HỌC TIẾP/CHUYỂN CÂU': 'READY_NEXT',
  'CHUYỂN CÂU': 'READY_NEXT',
  'HỌC TIẾP': 'READY_NEXT',
  'XÁC NHẬN ĐÃ HIỂU': 'CONFIRM_UNDERSTANDING',
  'ĐÃ HIỂU': 'CONFIRM_UNDERSTANDING',
};

const VIETNAMESE_ACTION_MAP: Record<string, string> = {
  'XÁC NHẬN CÂU TRẢ LỜI ĐÚNG': 'CONFIRM_CORRECT_ANSWER',
  'XÁC NHẬN ĐÚNG': 'CONFIRM_CORRECT_ANSWER',
  'CHỈ RA CÂU TRẢ LỜI SAI': 'IDENTIFY_INCORRECT_ANSWER',
  'CHỈ RA SAI': 'IDENTIFY_INCORRECT_ANSWER',
  'SỬA LỖI SAI': 'CORRECT_MISTAKE',
  'SỬA LỖI': 'CORRECT_MISTAKE',
  'KHEN NGỢI': 'PRAISING',
  'DẪN DẮT TỪNG BƯỚC': 'SCAFFOLDING',
  'DẪN DẮT': 'SCAFFOLDING',
  'ĐƯA GỢI Ý': 'HINTING',
  'LÀM RÕ KHÁI NIỆM': 'CONCEPT_CLARIFY',
  'PHÂN TÍCH LẬP LUẬN': 'LOGIC_BREAKDOWN',
  'DIỄN GIẢI ĐƠN GIẢN': 'SIMPLIFYING',
  'ĐỘNG VIÊN': 'MOTIVATING',
  'KÉO VỀ ĐÚNG CHỦ ĐỀ': 'REDIRECTING',
  'CHUYỂN BƯỚC/CHỦ ĐỀ': 'TRANSITIONING',
  'ĐƯA ĐÁP ÁN TRỰC TIẾP': 'DIRECT_ANSWER',
  'CHỜ HỌC SINH PHẢN HỒI': 'WAITING',
};

function resolveStaffLabelName(
  raw: string,
  role: LabelRole | null,
  targetScope: LabelScope
): { code: string; display: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { code: '', display: '' };

  if (targetScope === 'sample') {
    const upper = trimmed.toUpperCase();
    if (SUBJECT_CANONICAL_MAP[upper]) return SUBJECT_CANONICAL_MAP[upper];
    if (COMPLETION_CANONICAL_MAP[upper]) return COMPLETION_CANONICAL_MAP[upper];
    if (QUALITY_CANONICAL_MAP[upper]) return QUALITY_CANONICAL_MAP[upper];
    if (SUBJECT_CODE_SET.has(upper)) {
      return { code: upper, display: trimmed };
    }
    return { code: upper, display: trimmed };
  }

  if (role === 'user') {
    if (DRAFT_INTENT_MAP[trimmed]) {
      return { code: DRAFT_INTENT_MAP[trimmed], display: trimmed };
    }
    const upper = trimmed.toUpperCase();
    if (VIETNAMESE_INTENT_MAP[upper]) {
      return { code: VIETNAMESE_INTENT_MAP[upper], display: trimmed };
    }
    if (USER_INTENT_SET.has(upper)) {
      return { code: upper, display: trimmed };
    }
    return { code: upper, display: trimmed };
  }

  if (role === 'assistant') {
    if (DRAFT_ACTION_MAP[trimmed]) {
      return { code: DRAFT_ACTION_MAP[trimmed], display: trimmed };
    }
    const upper = trimmed.toUpperCase();
    if (VIETNAMESE_ACTION_MAP[upper]) {
      return { code: VIETNAMESE_ACTION_MAP[upper], display: trimmed };
    }
    if (ASSISTANT_ACTION_SET.has(upper)) {
      return { code: upper, display: trimmed };
    }
    return { code: upper, display: trimmed };
  }

  return { code: trimmed.toUpperCase(), display: trimmed };
}

function buildRequiredTargets(sample: any): DecisionTarget[] {
  const conversationContent = Array.isArray(sample?.data?.messages)
    ? sample.data.messages.map((message: any) => String(message?.content || '')).join('\n')
    : [sample?.data?.instruction, sample?.data?.input, sample?.data?.output].map((part) => String(part || '')).join('\n');

  return [
    {
      key: buildTargetKey('sample', 0),
      targetScope: 'sample',
      messageIndex: 0,
      labels: [],
      targetTextSnapshot: `Mon hoc\n${conversationContent}`.slice(0, 2000),
    },
    {
      key: buildTargetKey('sample', 1),
      targetScope: 'sample',
      messageIndex: 1,
      labels: [],
      targetTextSnapshot: `Muc do hoan thien\n${conversationContent}`.slice(0, 2000),
    },
    {
      key: buildTargetKey('sample', 2),
      targetScope: 'sample',
      messageIndex: 2,
      labels: [],
      targetTextSnapshot: `Chat luong hoi thoai\n${conversationContent}`.slice(0, 2000),
    },
    ...getLogicalMessagesForSample(sample).map((message) => ({
      key: buildTargetKey('message', message.messageIndex, message.role),
      targetScope: 'message' as const,
      messageIndex: message.messageIndex,
      messageRole: message.role,
      labels: [],
      targetTextSnapshot: message.content.slice(0, 2000),
    })),
  ];
}

export async function calculateAssignmentProgressFromAssignments(datasetVersionId: mongoose.Types.ObjectId, assigneeId: string) {
  const assigneeObjectId = new mongoose.Types.ObjectId(assigneeId);
  const assignments = await DatasetSampleAssignment.find({
    datasetVersionId: { $in: [datasetVersionId, String(datasetVersionId)] },
    assigneeId: { $in: [assigneeObjectId, String(assigneeObjectId)] },
  })
    .sort({ sampleIndex: 1 })
    .lean();

  const sampleIds = assignments.map((assignment: any) => assignment.sampleId);
  await ensureLabelAssignmentsForSamples(sampleIds.map((id: any) => String(id)));

  const samples = sampleIds.length
    ? await ProcessedDatasetItem.find({ _id: { $in: sampleIds } }).lean()
    : [];
  const sampleMap = new Map(samples.map((sample: any) => [String(sample._id), sample]));

  const decisions = sampleIds.length
    ? await LabelAssignment.find({
        sampleId: { $in: sampleIds },
        createdBy: assigneeObjectId,
        type: 'hard',
      })
        .select('sampleId targetScope messageIndex messageRole name')
        .lean()
    : [];

  const completed = new Map<string, Set<string>>();
  decisions.forEach((decision: any) => {
    const sampleKey = String(decision.sampleId);
    const targetKey = buildTargetKey(
      decision.targetScope === 'message' ? 'message' : 'sample',
      Number.isInteger(Number(decision.messageIndex)) ? Number(decision.messageIndex) : null,
      decision.messageRole === 'user' || decision.messageRole === 'assistant' ? decision.messageRole : null
    );
    if (!completed.has(sampleKey)) {
      completed.set(sampleKey, new Set<string>());
    }
    completed.get(sampleKey)!.add(targetKey);
  });

  let requiredTargets = 0;
  let completedTargets = 0;
  const missing: Array<{ sampleId: string; sampleIndex: number; sampleKey: string; targetScope: LabelScope; messageIndex?: number; role?: string }> = [];

  assignments.forEach((assignment: any) => {
    const sample = sampleMap.get(String(assignment.sampleId));
    if (!sample) {
      return;
    }

    const required = buildRequiredTargets(sample);
    const completedTargetsForSample = completed.get(String(sample._id)) || new Set<string>();
    required.forEach((target) => {
      requiredTargets += 1;
      if (completedTargetsForSample.has(target.key)) {
        completedTargets += 1;
        return;
      }
      missing.push({
        sampleId: String(sample._id),
        sampleIndex: Number(assignment.sampleIndex),
        sampleKey: String(sample.sampleId || ''),
        targetScope: target.targetScope,
        ...(target.targetScope === 'message'
          ? { messageIndex: target.messageIndex, role: target.messageRole }
          : {}),
      });
    });
  });

  return {
    assignedSamples: assignments.length,
    requiredMessages: requiredTargets,
    completedMessages: completedTargets,
    missingMessages: missing,
    percent: requiredTargets > 0 ? Math.round((completedTargets / requiredTargets) * 100) : 0,
    isComplete: requiredTargets > 0 && completedTargets === requiredTargets,
  };
}

function computeJaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set<string>([...a, ...b]);
  if (!union.size) {
    return 1;
  }
  let intersectionCount = 0;
  union.forEach((value) => {
    if (a.has(value) && b.has(value)) {
      intersectionCount += 1;
    }
  });
  return intersectionCount / union.size;
}

function computeMajorityLabels(annotatorSets: Array<{ annotatorId: string; labels: string[] }>) {
  const counts = new Map<string, number>();
  annotatorSets.forEach((annotatorSet) => {
    Array.from(new Set(annotatorSet.labels)).forEach((label) => {
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  const totalAnnotators = annotatorSets.length;
  const labelCounts = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const majorityLabels = labelCounts.filter((item) => item.count > totalAnnotators / 2).map((item) => item.name);
  return { labelCounts, majorityLabels };
}

function computeAgreement(annotatorSets: Array<{ annotatorId: string; labels: string[] }>): number | null {
  if (annotatorSets.length < 2) {
    return null;
  }
  const scores: number[] = [];
  for (let i = 0; i < annotatorSets.length; i += 1) {
    for (let j = i + 1; j < annotatorSets.length; j += 1) {
      scores.push(computeJaccard(new Set(annotatorSets[i].labels), new Set(annotatorSets[j].labels)));
    }
  }
  if (!scores.length) {
    return null;
  }
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4));
}

export async function syncAdjudicationForTarget(params: {
  datasetVersionId: mongoose.Types.ObjectId;
  sampleId: mongoose.Types.ObjectId;
  targetScope: LabelScope;
  messageIndex?: number | null;
  messageRole?: LabelRole | null;
  annotatorSets: Array<{ annotatorId: string; labels: string[] }>;
  agreementScore: number | null;
  majorityLabels: string[];
  labelCounts: Array<{ name: string; count: number }>;
  threshold?: number;
}) {
  const threshold = params.threshold ?? 0.6;
  if (params.agreementScore === null || params.agreementScore >= threshold) {
    await DatasetAssignmentAdjudication.deleteOne({
      datasetVersionId: params.datasetVersionId,
      sampleId: params.sampleId,
      targetScope: params.targetScope,
      messageIndex: params.messageIndex ?? null,
      messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
      status: { $ne: 'published' },
    });
    return;
  }

  const existing = await DatasetAssignmentAdjudication.findOne({
    datasetVersionId: params.datasetVersionId,
    sampleId: params.sampleId,
    targetScope: params.targetScope,
    messageIndex: params.messageIndex ?? null,
    messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
  })
    .select('status')
    .lean();

  await DatasetAssignmentAdjudication.findOneAndUpdate(
    {
      datasetVersionId: params.datasetVersionId,
      sampleId: params.sampleId,
      targetScope: params.targetScope,
      messageIndex: params.messageIndex ?? null,
      messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
    },
    {
      $set: {
        status:
          existing?.status === 'published'
            ? 'published'
            : existing?.status === 'resolved_unpublished'
              ? 'resolved_unpublished'
              : 'pending',
        threshold,
        agreementScore: params.agreementScore,
        majorityLabels: params.majorityLabels,
        labelCounts: params.labelCounts,
        annotatorSets: params.annotatorSets,
      },
      $setOnInsert: {
        finalLabels: [],
        note: '',
      },
      ...(existing?.status === 'published' || existing?.status === 'resolved_unpublished'
        ? {}
        : {
            $unset: {
              resolvedBy: 1,
              resolvedAt: 1,
              publishedBy: 1,
              publishedAt: 1,
            },
          }),
    },
    { upsert: true }
  );
}

export async function buildAssignmentSampleComparison(datasetVersionId: string, sampleId: string) {
  if (!mongoose.Types.ObjectId.isValid(datasetVersionId) || !mongoose.Types.ObjectId.isValid(sampleId)) {
    throw Object.assign(new Error('Invalid datasetVersionId or sampleId.'), { statusCode: 400 });
  }

  const sample = await ProcessedDatasetItem.findById(sampleId).lean();
  if (!sample) {
    throw Object.assign(new Error('Sample not found.'), { statusCode: 404 });
  }

  const sampleOid = new mongoose.Types.ObjectId(sampleId);
  const versionOid = new mongoose.Types.ObjectId(datasetVersionId);
  await ensureLabelAssignmentsForSamples([sampleId]);
  const version = await DatasetVersion.findById(versionOid).select('ownerId similarityThreshold').lean();
  const ownerId = String((version as any)?.ownerId || '');
  const similarityThreshold = Number.isFinite(Number((version as any)?.similarityThreshold)) ? Number((version as any).similarityThreshold) : 0.6;

  const assignments = await DatasetSampleAssignment.find({
    datasetVersionId: { $in: [versionOid, String(versionOid)] },
    sampleId: sampleOid,
  }).lean();

  const submissions = await DatasetAssignmentSubmission.find({
    datasetVersionId: { $in: [versionOid, String(versionOid)] },
  }).select('assigneeId status').lean();

  const submittedAssigneeIds = new Set(
    submissions
      .filter((s: any) => s.status === 'submitted' || s.status === 'approved')
      .map((s: any) => String(s.assigneeId))
  );

  const allSampleAssignments = await LabelAssignment.find({
    sampleId: sampleOid,
    type: { $in: ['hard', 'soft'] },
  }).lean();

  const labelCreatorIds = new Set(
    allSampleAssignments
      .map((item: any) => String(item.createdBy))
      .filter(id => mongoose.Types.ObjectId.isValid(id))
  );

  const assigneeIds = assignments
    .map((sa: any) => String(sa.assigneeId))
    .filter((id) =>
      mongoose.Types.ObjectId.isValid(id) &&
      (
        submittedAssigneeIds.has(id) ||
        labelCreatorIds.has(id) ||
        assignments.some((sa: any) => String(sa.assigneeId) === id && (sa.reviewStatus === 'submitted' || sa.reviewStatus === 'approved'))
      )
    );

  const comparisonAnnotatorIds = Array.from(new Set([
    ...assigneeIds,
    ...Array.from(labelCreatorIds)
  ])).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const hardAssignments = allSampleAssignments.filter((item: any) => item.type === 'hard' && comparisonAnnotatorIds.includes(String(item.createdBy)));
  const softAssignments = allSampleAssignments.filter((item: any) => item.type === 'soft' && item.targetScope === 'sample' && comparisonAnnotatorIds.includes(String(item.createdBy)));
  const sampleMessages = Array.isArray((sample as any).data?.messages) ? (sample as any).data.messages : [];
  const softDerivedAssignments: any[] = [];
  softAssignments.forEach((doc: any) => {
    if (!doc.targetTextSnapshot) return;
    let saved: any = null;
    try {
      saved = JSON.parse(String(doc.targetTextSnapshot));
    } catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') return;
    const sampleFields = [
      ['subject', 0],
      ['completion', 1],
      ['quality', 2],
    ] as const;
    sampleFields.forEach(([field, fieldIndex]) => {
      if (saved[field]) {
        softDerivedAssignments.push({
          ...doc,
          targetScope: 'sample',
          messageIndex: fieldIndex,
          messageRole: null,
          name: String(saved[field]),
        });
      }
    });
    if (saved.messages && typeof saved.messages === 'object') {
      Object.entries(saved.messages).forEach(([idx, value]: [string, any]) => {
        const messageIndex = Number(idx);
        if (!Number.isInteger(messageIndex) || !value) return;
        const role = sampleMessages[messageIndex]?.role === 'assistant' ? 'assistant' : 'user';
        const labelValue = role === 'assistant' ? value.action : value.intent;
        const labelNames = Array.isArray(labelValue) ? labelValue : labelValue ? [labelValue] : [];
        labelNames.filter(Boolean).forEach((labelName: any) => softDerivedAssignments.push({
          ...doc, targetScope: 'message', messageIndex, messageRole: role, name: String(labelName),
        }));
      });
    }
  });
  const canonicalLabels = await DatasetCanonicalLabel.find({
    datasetVersionId: versionOid,
    sampleId: sampleOid,
  }).lean();

  const checkerUserIds = canonicalLabels.map(c => String(c.publishedBy)).filter(Boolean);
  const allUserIdsToLoad = Array.from(new Set([
    ...comparisonAnnotatorIds,
    ...checkerUserIds
  ])).filter((id) => mongoose.Types.ObjectId.isValid(id));

  const userRows = allUserIdsToLoad.length
    ? await User.find({ _id: { $in: allUserIdsToLoad.map((id) => new mongoose.Types.ObjectId(id)) } }).select('_id name email role').lean()
    : [];
  const userMap = new Map(
    userRows.map((user: any) => [
      String(user._id),
      { id: String(user._id), name: String(user.name || ''), email: String(user.email || ''), role: String(user.role || 'staff') },
    ])
  );

  const decisionsByTarget = new Map<string, Map<string, Map<string, string>>>();
  [...hardAssignments, ...softDerivedAssignments].forEach((doc: any) => {
    const targetScope: LabelScope = doc.targetScope === 'message' ? 'message' : 'sample';
    const messageRole: LabelRole | null = doc.messageRole === 'user' || doc.messageRole === 'assistant'
      ? doc.messageRole
      : null;
    const targetKey = buildTargetKey(
      targetScope,
      Number.isInteger(Number(doc.messageIndex)) ? Number(doc.messageIndex) : null,
      messageRole
    );
    const annotatorId = String(doc.createdBy);
    const { code, display } = resolveStaffLabelName(String(doc.name || ''), messageRole, targetScope);
    if (!code) return;
    if (!decisionsByTarget.has(targetKey)) {
      decisionsByTarget.set(targetKey, new Map<string, Map<string, string>>());
    }
    if (!decisionsByTarget.get(targetKey)!.has(annotatorId)) {
      decisionsByTarget.get(targetKey)!.set(annotatorId, new Map<string, string>());
    }
    decisionsByTarget.get(targetKey)!.get(annotatorId)!.set(code, display);
  });

  const requiredTargets = buildRequiredTargets(sample);
  const existingAdjs = await DatasetAssignmentAdjudication.find({
    datasetVersionId: versionOid,
    sampleId: sampleOid,
  }).select('status targetScope messageIndex messageRole').lean();

  const bulkOps: any[] = [];
  const targetSummaries = requiredTargets.map((target) => {
    const targetKey = target.key;
    const perUserMap = decisionsByTarget.get(targetKey) || new Map<string, Map<string, string>>();
    const annotatorSets = comparisonAnnotatorIds
      .map((annotatorId) => {
        const labelMap = perUserMap.get(annotatorId) || new Map<string, string>();
        const labels = Array.from(labelMap.keys()).sort();
        const displayLabels = labels.map((code) => labelMap.get(code) || code);
        return { annotatorId, labels, displayLabels };
      })
      .filter((item) => item.labels.length > 0);

    const { labelCounts, majorityLabels } = computeMajorityLabels(annotatorSets);
    const agreementScore = computeAgreement(annotatorSets);
    
    // Compute bulk operations
    const threshold = similarityThreshold;
    const msgIdx = target.messageIndex ?? null;
    const msgRole = target.messageRole ?? null;
    const existing = existingAdjs.find((a: any) => 
      a.targetScope === target.targetScope && 
      (a.messageIndex ?? null) === msgIdx && 
      (a.messageRole ?? null) === msgRole
    );
    
    const canonical = canonicalLabels.find((c: any) => 
      c.targetScope === target.targetScope && 
      (c.messageIndex ?? null) === msgIdx && 
      (c.messageRole ?? null) === msgRole
    );

    const isAlreadyPublished = Boolean(canonical) || existing?.status === 'published';
    const isAlreadyResolvedUnpublished = !isAlreadyPublished && existing?.status === 'resolved_unpublished';
    const resolvedStatus = isAlreadyPublished ? 'published' : isAlreadyResolvedUnpublished ? 'resolved_unpublished' : 'pending';

    const hasUrgentPriority = assignments.some((a) => a.priority === 'urgent');
    const isUrgentPending = hasUrgentPriority && !isAlreadyPublished;

    if (agreementScore === null || (agreementScore >= threshold && !isUrgentPending)) {
      if (existing && !isAlreadyPublished && !isAlreadyResolvedUnpublished) {
        bulkOps.push({
          deleteOne: {
            filter: { _id: existing._id }
          }
        });
      }
    } else {
      if (isAlreadyPublished || isAlreadyResolvedUnpublished) {
        bulkOps.push({
          updateOne: {
            filter: {
              datasetVersionId: versionOid,
              sampleId: sampleOid,
              targetScope: target.targetScope,
              messageIndex: msgIdx,
              messageRole: msgRole,
            },
            update: {
              $set: {
                status: resolvedStatus,
                threshold,
                agreementScore: agreementScore !== null ? agreementScore : 1.0,
                majorityLabels,
                labelCounts,
                annotatorSets,
              }
            }
          }
        });
      } else {
        bulkOps.push({
          updateOne: {
            filter: {
              datasetVersionId: versionOid,
              sampleId: sampleOid,
              targetScope: target.targetScope,
              messageIndex: msgIdx,
              messageRole: msgRole,
            },
            update: {
              $set: {
                status: 'pending',
                threshold,
                agreementScore: agreementScore !== null ? agreementScore : 1.0,
                majorityLabels,
                labelCounts,
                annotatorSets,
              },
              $setOnInsert: {
                finalLabels: [],
                note: '',
              },
              $unset: { resolvedBy: 1, resolvedAt: 1, publishedBy: 1, publishedAt: 1 }
            },
            upsert: true
          }
        });
      }
    }

    const targetAnnotators = annotatorSets.map((item) => ({
      annotator: userMap.get(item.annotatorId) || { id: item.annotatorId, name: '', email: '' },
      labels: item.labels,
      displayLabels: item.displayLabels,
      isOwner: item.annotatorId === ownerId,
      isCanonical: false,
    }));

    if (canonical) {
      const checkerId = String(canonical.publishedBy);
      const checkerUser = userMap.get(checkerId) || { id: checkerId, name: 'Checker', email: 'checker@system.com' };
      targetAnnotators.push({
        annotator: { ...checkerUser, role: 'checker' } as any,
        labels: canonical.labels,
        displayLabels: canonical.labels.map(l => {
          const { display } = resolveStaffLabelName(l, msgRole, target.targetScope);
          return display || l;
        }),
        isOwner: false,
        isCanonical: true,
      });
    }

    return {
      targetKey,
      targetScope: target.targetScope,
      messageIndex: target.messageIndex,
      messageRole: target.messageRole,
      targetTextSnapshot: target.targetTextSnapshot,
      agreementScore,
      hasConflict: (agreementScore !== null && agreementScore < similarityThreshold) || isUrgentPending,
      labelCounts,
      majorityLabels,
      annotators: targetAnnotators,
    };
  });

  if (bulkOps.length > 0) {
    await DatasetAssignmentAdjudication.bulkWrite(bulkOps);
  }


  const adjudications = await DatasetAssignmentAdjudication.find({
    datasetVersionId: versionOid,
    sampleId: sampleOid,
  }).lean();
  const adjudicationMap = new Map(
    adjudications.map((item: any) => [
      buildTargetKey(
        item.targetScope === 'message' ? 'message' : 'sample',
        Number.isInteger(Number(item.messageIndex)) ? Number(item.messageIndex) : null,
        item.messageRole === 'user' || item.messageRole === 'assistant' ? item.messageRole : null
      ),
      item,
    ])
  );

  const targetComparisons = targetSummaries.map((target) => {
    const adjudication = adjudicationMap.get(target.targetKey);
    const isPublished = adjudication?.status === 'published';
    return {
      ...target,
      hasConflict: target.hasConflict && !isPublished,
      adjudication: adjudication
        ? {
            status: adjudication.status,
            finalLabels: Array.isArray(adjudication.finalLabels) ? adjudication.finalLabels : [],
            note: String(adjudication.note || ''),
            resolvedAt: adjudication.resolvedAt || null,
            resolvedBy: adjudication.resolvedBy ? String(adjudication.resolvedBy) : null,
            publishedAt: adjudication.publishedAt || null,
            publishedBy: adjudication.publishedBy ? String(adjudication.publishedBy) : null,
          }
        : null,
    };
  });

  const targetScores = targetComparisons
    .map((item) => item.agreementScore)
    .filter((value): value is number => typeof value === 'number');

  return {
    sample: {
      id: String(sample._id),
      sampleKey: String(sample.sampleId || ''),
      preview: requiredTargets.map((target) => target.targetTextSnapshot || '').join(' ').trim().slice(0, 180),
      sampleIndex: typeof assignments[0]?.sampleIndex === 'number' ? assignments[0].sampleIndex : 0,
      data: (sample as any).data,
    },
    agreementScore: targetScores.length
      ? Number((targetScores.reduce((sum, value) => sum + value, 0) / targetScores.length).toFixed(4))
      : null,
    hasConflict: targetComparisons.some((item) => item.hasConflict),
    pendingAdjudicationCount: targetComparisons.filter((item) => item.hasConflict && item.adjudication?.status !== 'published').length,
    targets: targetComparisons,
  };
}

export async function autoPublishAssignmentAdjudicationsForSample(params: {
  datasetVersionId: string;
  sampleId: string;
  ownerId: string;
}) {
  const comparison = await buildAssignmentSampleComparison(params.datasetVersionId, params.sampleId);
  const eligibleTargets = comparison.targets.filter((target) => {
    if (!target.hasConflict) {
      return false;
    }
    if (target.adjudication?.status === 'published') {
      return false;
    }
    return typeof target.agreementScore === 'number' && target.agreementScore > 0;
  });

  let publishedTargets = 0;
  let skippedEmptyMajorityTargets = 0;

  for (const target of eligibleTargets) {
    if (!Array.isArray(target.majorityLabels) || target.majorityLabels.length === 0) {
      skippedEmptyMajorityTargets += 1;
      continue;
    }

    await resolveAssignmentAdjudication({
      datasetVersionId: params.datasetVersionId,
      sampleId: params.sampleId,
      targetScope: target.targetScope,
      messageIndex: target.messageIndex,
      messageRole: target.messageRole,
      finalLabels: target.majorityLabels,
      note: target.adjudication?.note || 'Auto published from majority labels.',
      resolvedBy: params.ownerId,
    });

    await publishAssignmentAdjudication({
      datasetVersionId: params.datasetVersionId,
      sampleId: params.sampleId,
      targetScope: target.targetScope,
      messageIndex: target.messageIndex,
      messageRole: target.messageRole,
      publishedBy: params.ownerId,
    });
    publishedTargets += 1;
  }

  return {
    processedTargets: eligibleTargets.length,
    publishedTargets,
    skippedZeroIaaTargets: comparison.targets.filter((target) => {
      if (!target.hasConflict || target.adjudication?.status === 'published') {
        return false;
      }
      return target.agreementScore === 0;
    }).length,
    skippedEmptyMajorityTargets,
  };
}

export async function resolveAssignmentAdjudication(params: {
  datasetVersionId: string;
  sampleId: string;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
  finalLabels: string[];
  note?: string;
  resolvedBy: string;
}) {
  const comparison = await buildAssignmentSampleComparison(params.datasetVersionId, params.sampleId);
  const targetKey = buildTargetKey(params.targetScope, params.messageIndex ?? null, params.messageRole ?? null);
  const target = comparison.targets.find((item) => item.targetKey === targetKey);
  if (!target) {
    throw Object.assign(new Error('Target not found.'), { statusCode: 404 });
  }

  return DatasetAssignmentAdjudication.findOneAndUpdate(
    {
      datasetVersionId: new mongoose.Types.ObjectId(params.datasetVersionId),
      sampleId: new mongoose.Types.ObjectId(params.sampleId),
      targetScope: params.targetScope,
      messageIndex: params.messageIndex ?? null,
      messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
    },
    {
      $set: {
        status: 'resolved_unpublished',
        threshold: 0.6,
        agreementScore: target.agreementScore,
        majorityLabels: target.majorityLabels,
        labelCounts: target.labelCounts,
        annotatorSets: target.annotators.map((item) => ({
          annotatorId: item.annotator.id,
          labels: item.labels,
        })),
        finalLabels: Array.from(new Set((params.finalLabels || []).map((label) => String(label || '').trim().toUpperCase()).filter(Boolean))),
        note: String(params.note || ''),
        resolvedBy: new mongoose.Types.ObjectId(params.resolvedBy),
        resolvedAt: new Date(),
      },
      $unset: {
        publishedBy: 1,
        publishedAt: 1,
      },
    },
    { upsert: true, returnDocument: 'after' }
  ).lean();
}

export async function publishAssignmentAdjudication(params: {
  datasetVersionId: string;
  sampleId: string;
  targetScope: LabelScope;
  messageIndex?: number;
  messageRole?: LabelRole;
  publishedBy: string;
}) {
  const query = {
    datasetVersionId: new mongoose.Types.ObjectId(params.datasetVersionId),
    sampleId: new mongoose.Types.ObjectId(params.sampleId),
    targetScope: params.targetScope,
    messageIndex: params.messageIndex ?? null,
    messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
  };

  const adjudication = await DatasetAssignmentAdjudication.findOne(query).lean();
  if (!adjudication || adjudication.status !== 'resolved_unpublished') {
    throw Object.assign(new Error('Final decision must be saved before publishing.'), { statusCode: 409 });
  }
  if (!Array.isArray(adjudication.finalLabels) || adjudication.finalLabels.length === 0) {
    throw Object.assign(new Error('Cannot publish without final labels.'), { statusCode: 409 });
  }

  const sample = await resolveSample(params.sampleId);
  await DatasetCanonicalLabel.findOneAndUpdate(
    query,
    {
      $set: {
        datasetVersionId: new mongoose.Types.ObjectId(params.datasetVersionId),
        sampleId: sample._id,
        targetScope: params.targetScope,
        messageIndex: params.messageIndex ?? null,
        messageRole: params.targetScope === 'message' ? params.messageRole ?? null : null,
        labels: adjudication.finalLabels,
        targetTextSnapshot: String((adjudication as any).targetTextSnapshot || ''),
        sourceType: 'checker_adjudication',
        resolutionRef: adjudication._id,
        sourceAnnotatorIds: Array.isArray(adjudication.annotatorSets)
          ? adjudication.annotatorSets.map((item: any) => String(item.annotatorId || '')).filter(Boolean)
          : [],
        publishedBy: new mongoose.Types.ObjectId(params.publishedBy),
        publishedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  ).lean();

  return DatasetAssignmentAdjudication.findOneAndUpdate(
    { _id: adjudication._id },
    {
      $set: {
        status: 'published',
        publishedBy: new mongoose.Types.ObjectId(params.publishedBy),
        publishedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  ).lean();
}

export async function buildAssignmentConflictList(datasetVersionId: string, filters?: {
  status?: 'pending' | 'resolved_unpublished' | 'published';
  assigneeId?: string;
  sampleIndex?: number;
  minAgreement?: number;
}) {
  const versionOid = new mongoose.Types.ObjectId(datasetVersionId);
  const assignmentRows = await DatasetSampleAssignment.find({ datasetVersionId: { $in: [versionOid, String(versionOid)] } })
    .sort({ sampleIndex: 1 })
    .lean();

  const sampleIds = Array.from(new Set(assignmentRows.map((row: any) => String(row.sampleId))));
  const samples = await ProcessedDatasetItem.find({ _id: { $in: sampleIds } }).select('_id sampleId data').lean();
  const sampleMap = new Map(samples.map((sample: any) => [String(sample._id), sample]));

  const results: any[] = [];
  for (const sampleId of sampleIds) {
    const assignmentsForSample = assignmentRows.filter((row: any) => String(row.sampleId) === sampleId);
    if (filters?.assigneeId && !assignmentsForSample.some((row: any) => String(row.assigneeId) === String(filters.assigneeId))) {
      continue;
    }
    const sampleIndex = Number(assignmentsForSample[0]?.sampleIndex || 0);
    if (filters?.sampleIndex && sampleIndex !== filters.sampleIndex) {
      continue;
    }

    const submittedCount = assignmentsForSample.filter((row: any) => row.reviewStatus === 'submitted' || row.reviewStatus === 'approved').length;

    if (submittedCount < 2) {
      continue;
    }
    const comparison = await buildAssignmentSampleComparison(datasetVersionId, sampleId);
    if (!comparison.hasConflict) {
      continue;
    }
    if (filters?.minAgreement !== undefined && typeof comparison.agreementScore === 'number' && comparison.agreementScore < filters.minAgreement) {
      continue;
    }
    const publishedCount = comparison.targets.filter((target) => target.adjudication?.status === 'published').length;
    const savedCount = comparison.targets.filter((target) => target.adjudication?.status === 'resolved_unpublished').length;
    const pendingCount = comparison.targets.filter((target) => {
      if (!target.hasConflict) {
        return false;
      }
      return !target.adjudication || target.adjudication.status === 'pending';
    }).length;
    const status = pendingCount > 0
      ? 'pending'
      : savedCount > 0
        ? 'resolved_unpublished'
        : 'published';
    if (filters?.status && status !== filters.status) {
      continue;
    }

    results.push({
      sampleId,
      sampleKey: String(sampleMap.get(sampleId)?.sampleId || ''),
      sampleIndex,
      assigneeCount: comparison.targets.reduce((maxCount, target) => Math.max(maxCount, target.annotators.length), 0),
      agreementScore: comparison.agreementScore,
      pendingAdjudicationCount: pendingCount,
      resolvedAdjudicationCount: savedCount + publishedCount,
      status,
    });
  }

  return results.sort((a, b) => a.sampleIndex - b.sampleIndex);
}

export async function buildAssignmentDashboard(datasetVersionId: string) {
  const versionOid = new mongoose.Types.ObjectId(datasetVersionId);
  const versionScope = [versionOid, String(versionOid)];
  const idVariants = (id: string) => {
    const variants: any[] = [id];
    if (mongoose.Types.ObjectId.isValid(id)) {
      variants.push(new mongoose.Types.ObjectId(id));
    }
    return variants;
  };
  const assignments = await DatasetSampleAssignment.find({ datasetVersionId: { $in: versionScope } })
    .sort({ sampleIndex: 1 })
    .lean();
  const sampleIds = Array.from(new Set(assignments.map((row: any) => String(row.sampleId))));
  await ensureLabelAssignmentsForSamples(sampleIds);

  const assigneeIds = Array.from(new Set(assignments.map((row: any) => String(row.assigneeId)).filter(Boolean)));
  const validObjectAssigneeIds = assigneeIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const users = assigneeIds.length
    ? await User.find({ _id: { $in: validObjectAssigneeIds.map((id) => new mongoose.Types.ObjectId(id)) } }).select('_id name email').lean()
    : [];
  const userMap = new Map(users.map((user: any) => [String(user._id), user]));
  const submissions = assigneeIds.length
    ? await DatasetAssignmentSubmission.find({
        datasetVersionId: { $in: versionScope },
        assigneeId: { $in: assigneeIds.flatMap(idVariants) },
      }).lean()
    : [];
  const submissionMap = new Map<string, any>();
  submissions.forEach((item: any) => {
    const key = String(item.assigneeId);
    const current = submissionMap.get(key) || {
      assigneeId: item.assigneeId,
      status: 'draft',
      submittedAt: null,
      name: '',
      labeledCount: 0,
      totalSamples: 0,
      humanScoreTotal: 0,
      humanScoreCount: 0,
      submissions: [],
    };
    current.submissions.push(item);
    current.labeledCount += Number(item.labeledCount || 0);
    current.totalSamples += Number(item.totalSamples || 0);
    if (Number.isFinite(Number(item.humanScore))) {
      current.humanScoreTotal += Number(item.humanScore);
      current.humanScoreCount += 1;
    }
    current.name = current.name ? `${current.name}, ${item.name || 'Batch'}` : (item.name || 'Batch');
    if (item.submittedAt && (!current.submittedAt || new Date(item.submittedAt).getTime() > new Date(current.submittedAt).getTime())) {
      current.submittedAt = item.submittedAt;
    }
    submissionMap.set(key, current);
  });
  submissionMap.forEach((value, key) => {
    const rows = value.submissions || [];
    const allSubmitted = rows.length > 0 && rows.every((row: any) => ['submitted', 'approved'].includes(String(row.status || '')));
    const anyStarted = rows.some((row: any) => ['in_progress', 'submitted', 'approved'].includes(String(row.status || '')));
    submissionMap.set(key, {
      ...value,
      status: allSubmitted ? 'submitted' : anyStarted ? 'draft' : 'draft',
    });
  });

  const now = Date.now();
  const hourAgo = new Date(now - (60 * 60 * 1000));
  const activityRows = await DatasetAssignmentActivity.find({
    datasetVersionId: versionOid,
    createdAt: { $gte: hourAgo },
  }).lean();
  const latestActivityRows = await DatasetAssignmentActivity.aggregate([
    { $match: { datasetVersionId: versionOid } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$annotatorId',
        latestActivityAt: { $first: '$createdAt' },
      },
    },
  ]);
  const latestActivityMap = new Map(latestActivityRows.map((row: any) => [String(row._id), row.latestActivityAt]));

  const allLabels = await LabelAssignment.find({
    sampleId: { $in: sampleIds },
    type: 'hard'
  }).select('sampleId createdBy targetScope messageIndex messageRole name').lean();

  const samplesForDashboard = await ProcessedDatasetItem.find({ _id: { $in: sampleIds } }).lean();
  const sampleMapForDashboard = new Map(samplesForDashboard.map((sample: any) => [String(sample._id), sample]));

  const completedMapByUser = new Map<string, Map<string, Set<string>>>();
  allLabels.forEach((decision: any) => {
    const userId = String(decision.createdBy);
    const sampleKey = String(decision.sampleId);
    const targetKey = buildTargetKey(
      decision.targetScope === 'message' ? 'message' : 'sample',
      Number.isInteger(Number(decision.messageIndex)) ? Number(decision.messageIndex) : null,
      decision.messageRole === 'user' || decision.messageRole === 'assistant' ? decision.messageRole : null
    );
    if (!completedMapByUser.has(userId)) completedMapByUser.set(userId, new Map());
    const userMap = completedMapByUser.get(userId)!;
    if (!userMap.has(sampleKey)) userMap.set(sampleKey, new Set());
    userMap.get(sampleKey)!.add(targetKey);
  });

  const userRows = assigneeIds.map((assigneeId) => {
    const userAssignments = assignments.filter((row: any) => String(row.assigneeId) === assigneeId);
    const userCompletedMap = completedMapByUser.get(assigneeId) || new Map();
    
    let requiredTargets = 0;
    let completedTargets = 0;

    userAssignments.forEach((assignment: any) => {
      const sample = sampleMapForDashboard.get(String(assignment.sampleId));
      if (!sample) return;

      const required = buildRequiredTargets(sample);
      const completedTargetsForSample = userCompletedMap.get(String(sample._id)) || new Set<string>();
      required.forEach((target) => {
        requiredTargets += 1;
        if (completedTargetsForSample.has(target.key)) {
          completedTargets += 1;
        }
      });
    });

    const progress = {
      assignedSamples: userAssignments.length,
      requiredMessages: requiredTargets,
      completedMessages: completedTargets,
    };

    const submission = submissionMap.get(assigneeId) as any;
    const assignedSamples = userAssignments.length;
    const draftLabeledSamples = Number(submission?.labeledCount || 0);
    const targetsPerSample = progress.assignedSamples > 0 && progress.requiredMessages > 0
      ? progress.requiredMessages / progress.assignedSamples
      : 1;
    const draftCompletedTargets = Math.min(progress.requiredMessages, Math.round(draftLabeledSamples * targetsPerSample));
    const finalCompletedTargets = Math.max(progress.completedMessages, draftCompletedTargets);
    const completionPercent = progress.requiredMessages > 0
      ? Math.round((finalCompletedTargets / progress.requiredMessages) * 100)
      : (assignedSamples > 0 ? Math.round((draftLabeledSamples / assignedSamples) * 100) : 0);
    const hourCount = activityRows.filter((row: any) => String(row.annotatorId) === assigneeId && row.activityType === 'assign').length;
    
    return {
      user: {
        id: assigneeId,
        name: String((userMap.get(assigneeId) as any)?.name || ''),
        email: String((userMap.get(assigneeId) as any)?.email || ''),
      },
      assignedSamples,
      completedTargets: finalCompletedTargets,
      totalTargets: progress.requiredMessages,
      completionPercent,
      labelsPerHour: hourCount,
      latestActivityAt: latestActivityMap.get(assigneeId) || null,
      reviewAvailable: String(submission?.status || '') === 'submitted'
        || String(submission?.status || '') === 'approved',
      submission: submission
        ? {
            status: ['submitted', 'approved'].includes(String(submission.status || 'draft')) ? 'submitted' : 'draft',
            submittedAt: submission.submittedAt || null,
            name: submission.name || null,
            labeledCount: draftLabeledSamples,
            humanScore: submission.humanScoreCount > 0
              ? Number((submission.humanScoreTotal / submission.humanScoreCount).toFixed(1))
              : null,
          }
        : null,
    };
  });

  const conflicts = await buildAssignmentConflictList(datasetVersionId);
  const adjudications = await DatasetAssignmentAdjudication.find({ datasetVersionId: versionOid }).select('status').lean();
  const submittedCount = userRows.filter((row) => row.submission?.status === 'submitted').length;
  const inProgressCount = userRows.filter((row) => row.completionPercent > 0 && row.completionPercent < 100).length;
  const savedDecisionCount = adjudications.filter((row: any) => row.status === 'resolved_unpublished').length;
  const publishedDecisionCount = adjudications.filter((row: any) => row.status === 'published').length;

  return {
    overview: {
      totalAssignedSamples: sampleIds.length,
      totalAssignees: assigneeIds.length,
      inProgressAssignees: inProgressCount,
      submittedAssignees: submittedCount,
      savedDecisionCount,
      publishedDecisionCount,
      pendingConflicts: conflicts.filter((item) => item.status === 'pending').length,
    },
    users: userRows,
    conflicts: conflicts.filter((item) => item.status !== 'published'),
    refreshedAt: new Date().toISOString(),
  };
}

export async function autoResolveSampleIfConsensus(datasetVersionId: string | mongoose.Types.ObjectId, sampleId: string | mongoose.Types.ObjectId) {
  const versionOid = new mongoose.Types.ObjectId(String(datasetVersionId));
  const sampleOid = new mongoose.Types.ObjectId(String(sampleId));

  const version = await DatasetVersion.findById(versionOid).lean();
  if (!version) return;

  const assignments = await DatasetSampleAssignment.find({
    datasetVersionId: { $in: [versionOid, String(versionOid)] },
    sampleId: sampleOid,
    active: { $ne: false },
  }).lean();

  if (assignments.length === 0) return;

  const totalAssigned = assignments.length;
  const submittedAssignments = assignments.filter(
    (a) => a.reviewStatus === 'submitted' || a.reviewStatus === 'approved'
  );
  const totalSubmitted = submittedAssignments.length;

  // Only run consensus matching when all assigned staff have submitted their results.
  if (totalSubmitted < totalAssigned) {
    return;
  }

  // Do not auto-resolve if the task/sample has an urgent priority
  const hasUrgentPriority = assignments.some((a) => a.priority === 'urgent');
  if (hasUrgentPriority) {
    return;
  }

  // Get the comparison of all annotator sets
  const comparison = await buildAssignmentSampleComparison(String(datasetVersionId), String(sampleId));

  for (const target of comparison.targets) {
    // Filter to only count active staff annotators. A target is only eligible
    // for auto-finalization after every assigned staff member has labeled it.
    // `hasConflict` denotes low agreement and must not exclude consensus.
    const staffAnnotators = target.annotators.filter((a) => !a.isCanonical && !a.isOwner);
    if (staffAnnotators.length !== totalAssigned) continue;

    // Count occurrences of each unique label set
    const labelSetCounts = new Map<string, { count: number; labels: string[] }>();
    staffAnnotators.forEach((ann) => {
      const key = [...ann.labels].sort().join(',');
      if (!labelSetCounts.has(key)) {
        labelSetCounts.set(key, { count: 0, labels: ann.labels });
      }
      labelSetCounts.get(key)!.count += 1;
    });

    let maxCount = 0;
    let consensusLabels: string[] = [];
    for (const { count, labels } of labelSetCounts.values()) {
      if (count > maxCount) {
        maxCount = count;
        consensusLabels = labels;
      }
    }

    // Check if consensus meets the 2/3 threshold: maxCount / totalAssigned >= 2 / 3
    if (maxCount * 3 >= totalAssigned * 2) {
      // Auto-resolve and publish
      await resolveAssignmentAdjudication({
        datasetVersionId: String(datasetVersionId),
        sampleId: String(sampleId),
        targetScope: target.targetScope,
        messageIndex: target.messageIndex,
        messageRole: target.messageRole,
        finalLabels: consensusLabels,
        note: 'Auto-resolved: 2/3 or more Staff gave identical results.',
        resolvedBy: String(version.ownerId),
      });

      await publishAssignmentAdjudication({
        datasetVersionId: String(datasetVersionId),
        sampleId: String(sampleId),
        targetScope: target.targetScope,
        messageIndex: target.messageIndex,
        messageRole: target.messageRole,
        publishedBy: String(version.ownerId),
      });

      // Log the auto-resolution activity
      const sampleIndexStr = comparison.sample?.sampleIndex !== undefined ? `#${comparison.sample.sampleIndex}` : '';
      const scopeText = target.targetScope === 'message' && target.messageIndex !== undefined
        ? ` (tin nhắn #${target.messageIndex + 1} - ${target.messageRole === 'user' ? 'Người dùng' : 'Trợ lý'})`
        : '';
      
      const user = await User.findById(version.ownerId).select('name email').lean();
      await CheckerActivityLog.create({
        datasetVersionId: versionOid,
        sampleId: sampleOid,
        userId: version.ownerId,
        userName: user?.name || 'System',
        userEmail: user?.email || 'system@resolve.com',
        action: 'publish',
        targetScope: target.targetScope || null,
        messageIndex: target.messageIndex || null,
        messageRole: target.messageRole || null,
        details: `Tự động chốt nhãn (Auto-Resolve 2/3): [${consensusLabels.join(', ')}] cho mẫu ${sampleIndexStr}${scopeText}`,
      });
    }
  }
}
