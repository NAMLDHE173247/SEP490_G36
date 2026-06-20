/**
 * Migration: backfill projectId xuyên suốt Project -> DatasetVersion -> Task.
 *
 * Mục tiêu:
 *  1. Đảm bảo mỗi DatasetVersion thiếu projectId được gắn vào 1 Project
 *     (gom theo ownerId + projectName; tạo Project nếu chưa có).
 *  2. Backfill projectId cho DatasetAssignmentSubmission & DatasetSampleAssignment
 *     bằng cách join qua datasetVersionId -> version.projectId.
 *
 * Chạy:  npx ts-node src/scripts/backfill-project-links.ts
 * (Chạy migration NÀY trước khi bật required:true ở schema trên DB production.)
 */
import '../dotenv';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { DatasetVersion } from '../models/DatasetVersion';
import { DatasetAssignmentSubmission } from '../models/DatasetAssignmentSubmission';
import { DatasetSampleAssignment } from '../models/DatasetSampleAssignment';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sep_training';

async function ensureProjectForVersion(version: any): Promise<mongoose.Types.ObjectId | null> {
  const ownerId = version.ownerId;
  const name = String(version.projectName || '').trim() || 'Legacy Project';
  if (!ownerId) return null;

  let project = await Project.findOne({ ownerId, name, isArchived: { $ne: true } })
    .sort({ createdAt: -1 })
    .lean();
  if (!project) {
    project = (await Project.create({
      ownerId,
      name,
      sourceType: (version.sourceType === 'lesson' ? 'lesson' : 'chat'),
    })).toObject();
    console.log(`  + Tạo Project "${name}" cho owner ${ownerId}`);
  }
  return project._id as mongoose.Types.ObjectId;
}

async function run() {
  await mongoose.connect(MONGO_URI, { retryWrites: false } as any);
  console.log('✅ Connected:', MONGO_URI);

  const report = { versionsFixed: 0, submissionsFixed: 0, samplesFixed: 0, orphanVersions: 0 };

  // 1. DatasetVersion thiếu projectId
  const versionsMissing = await DatasetVersion.find({
    $or: [{ projectId: { $exists: false } }, { projectId: null }],
  }).lean();
  console.log(`\n[1] DatasetVersion thiếu projectId: ${versionsMissing.length}`);
  for (const v of versionsMissing) {
    const projectId = await ensureProjectForVersion(v);
    if (!projectId) {
      report.orphanVersions++;
      console.warn(`  ! Version ${v._id} không có ownerId — bỏ qua (cần xử lý tay).`);
      continue;
    }
    await DatasetVersion.updateOne({ _id: v._id }, { $set: { projectId } });
    report.versionsFixed++;
  }

  // 2. Build map versionId -> projectId (toàn bộ version đã có projectId)
  const allVersions = await DatasetVersion.find({ projectId: { $ne: null } })
    .select('_id projectId')
    .lean();
  const versionToProject = new Map<string, any>();
  for (const v of allVersions) versionToProject.set(String(v._id), v.projectId);

  // 3. Backfill DatasetAssignmentSubmission
  const subsMissing = await DatasetAssignmentSubmission.find({
    $or: [{ projectId: { $exists: false } }, { projectId: null }],
  }).select('_id datasetVersionId').lean();
  console.log(`\n[2] Submission thiếu projectId: ${subsMissing.length}`);
  for (const s of subsMissing) {
    const projectId = versionToProject.get(String(s.datasetVersionId));
    if (!projectId) {
      console.warn(`  ! Submission ${s._id} -> version ${s.datasetVersionId} không map được project.`);
      continue;
    }
    await DatasetAssignmentSubmission.updateOne({ _id: s._id }, { $set: { projectId } });
    report.submissionsFixed++;
  }

  // 4. Backfill DatasetSampleAssignment
  const samplesMissing = await DatasetSampleAssignment.find({
    $or: [{ projectId: { $exists: false } }, { projectId: null }],
  }).select('_id datasetVersionId').lean();
  console.log(`\n[3] SampleAssignment thiếu projectId: ${samplesMissing.length}`);
  for (const a of samplesMissing) {
    const projectId = versionToProject.get(String(a.datasetVersionId));
    if (!projectId) {
      console.warn(`  ! SampleAssignment ${a._id} -> version ${a.datasetVersionId} không map được project.`);
      continue;
    }
    await DatasetSampleAssignment.updateOne({ _id: a._id }, { $set: { projectId } });
    report.samplesFixed++;
  }

  console.log('\n=== KẾT QUẢ ===');
  console.log(report);
  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('❌ Migration error:', err);
  await mongoose.disconnect();
  process.exit(1);
});
