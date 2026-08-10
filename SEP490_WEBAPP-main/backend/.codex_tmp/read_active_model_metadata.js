require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MongoDB URI is not configured');
  await mongoose.connect(uri);
  const versions = await mongoose.connection.db.collection('modelversions')
    .find({ status: 'Use' })
    .project({ hfRepoId: 1, subject: 1, metrics: 1, configSnapshot: 1, datasetInfo: 1, modelRegistryId: 1, version: 1, createdAt: 1 })
    .toArray();
  const registryIds = versions.map((item) => item.modelRegistryId).filter(Boolean);
  const registries = await mongoose.connection.db.collection('modelregistries')
    .find({ _id: { $in: registryIds } })
    .project({ name: 1, baseModel: 1, subject: 1 })
    .toArray();
  const registryMap = new Map(registries.map((item) => [String(item._id), item]));
  const output = versions.map((item) => ({
    name: registryMap.get(String(item.modelRegistryId))?.name,
    registry_subject: registryMap.get(String(item.modelRegistryId))?.subject,
    base_model: registryMap.get(String(item.modelRegistryId))?.baseModel,
    version: item.version,
    hf_repo_id: item.hfRepoId,
    subject: item.subject,
    metrics: item.metrics,
    config_snapshot: item.configSnapshot,
    dataset_info: item.datasetInfo,
    created_at: item.createdAt,
  }));
  process.stdout.write(JSON.stringify(output, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  process.stderr.write(`${error.message}\n`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
