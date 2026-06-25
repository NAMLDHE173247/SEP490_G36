import mongoose from 'mongoose';
import { ProcessedDatasetItem } from './src/models/ProcessedDatasetItem';
import { DatasetSampleAssignment } from './src/models/DatasetSampleAssignment';
import { LabelAssignment } from './src/models/LabelAssignment';
import { DatasetAssignmentSubmission } from './src/models/DatasetAssignmentSubmission';
import { buildAssignmentSampleComparison } from './src/services/labelAssignmentService';

async function run() {
  const MONGO_URI = 'mongodb://127.0.0.1:27017/sep_training';
  console.log('Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected!');

  const assignments = await DatasetSampleAssignment.find({}).lean();
  console.log(`Total DatasetSampleAssignment: ${assignments.length}`);

  const labelAssignments = await LabelAssignment.find({}).lean();
  console.log(`Total LabelAssignment: ${labelAssignments.length}`);
  if (labelAssignments.length > 0) {
    console.log('Sample LabelAssignment:', JSON.stringify(labelAssignments[0], null, 2));
  }

  const submissions = await DatasetAssignmentSubmission.find({}).lean();
  console.log(`Total submissions: ${submissions.length}`);
  submissions.forEach(s => {
    console.log(`- Sub: ${s.name}, Assignee: ${s.assigneeId}, Status: ${s.status}, Start: ${s.batchStart}, Count: ${s.batchCount}`);
  });

  // Find a sample that has multiple assignments or some labels
  const sampleIdsWithLabels = [...new Set(labelAssignments.map(l => String(l.sampleId)))];
  console.log(`Samples with labels: ${sampleIdsWithLabels.length}`);

  for (const sampleId of sampleIdsWithLabels.slice(0, 3)) {
    // Find versionId from assignments
    const assign = assignments.find(a => String(a.sampleId) === sampleId);
    if (!assign) continue;
    const versionId = String(assign.datasetVersionId);
    console.log(`\n--- Comparison for Version: ${versionId}, Sample: ${sampleId} ---`);
    try {
      const comp = await buildAssignmentSampleComparison(versionId, sampleId);
      console.log('Comparison keys:', Object.keys(comp));
      console.log('Agreement score:', comp.agreementScore);
      console.log('Has conflict:', comp.hasConflict);
      console.log('Targets count:', comp.targets?.length);
      if (comp.targets && comp.targets.length > 0) {
        console.log('First target keys:', Object.keys(comp.targets[0]));
        console.log('First target annotators:', JSON.stringify(comp.targets[0].annotators, null, 2));
        console.log('First target labels:', comp.targets[0].labels);
      }
    } catch (err: any) {
      console.error('Error getting comparison:', err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(console.error);
