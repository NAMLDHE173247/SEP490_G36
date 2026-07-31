import mongoose from 'mongoose';
import '../src/dotenv';
import { ModelRegistry } from '../src/models/ModelRegistry';
import { ModelVersion } from '../src/models/ModelVersion';
import { TrainingHistory } from '../src/models/TrainingHistory';
import { ModelEvaluation } from '../src/models/Evaluation';

const LEGACY_REGISTRY_FINGERPRINTS = [
  { name: 'llama-2-7b-chat-finetuned', baseModel: 'meta-llama/Llama-2-7b-chat-hf' },
  { name: 'gpt-neo-2.7b-custom', baseModel: 'EleutherAI/gpt-neo-2.7B' },
  { name: 'mistral-7b-instruct-v0.2', baseModel: 'mistralai/Mistral-7B-Instruct-v0.2' },
];

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sep_training';
  await mongoose.connect(uri, { retryWrites: false, serverSelectionTimeoutMS: 5000 } as any);

  const legacyRegistries = await ModelRegistry.find({
    $or: LEGACY_REGISTRY_FINGERPRINTS,
  }).select('_id').lean();
  const registryIds = legacyRegistries.map((registry) => registry._id);

  // A legacy demo version has no link to a real TrainingHistory document.
  const deletedVersions = registryIds.length
    ? await ModelVersion.deleteMany({
      modelRegistryId: { $in: registryIds },
      trainingHistoryId: { $exists: false },
    })
    : { deletedCount: 0 };
  const deletedRegistries = registryIds.length
    ? await ModelRegistry.deleteMany({ _id: { $in: registryIds } })
    : { deletedCount: 0 };
  const deletedHistories = await TrainingHistory.deleteMany({ jobId: /^job-mock-/i });
  const deletedEvaluations = await ModelEvaluation.deleteMany({ jobId: /^job-mock-/i });

  console.log(JSON.stringify({
    legacyRegistriesFound: registryIds.length,
    deletedRegistries: deletedRegistries.deletedCount,
    deletedVersions: deletedVersions.deletedCount,
    deletedMockHistories: deletedHistories.deletedCount,
    deletedMockEvaluations: deletedEvaluations.deletedCount,
  }, null, 2));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
