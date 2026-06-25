import { User } from './models/User';
import { ModelRegistry } from './models/ModelRegistry';
import { ModelVersion, ModelVersionStatus } from './models/ModelVersion';

export async function seedModelRegistryData() {
  try {
    const managers = await User.find({ role: { $in: ['admin', 'supervisor'] } });
    if (managers.length === 0) {
      console.log('⚠️ No admin/supervisor users found, skipping model registry seeding');
      return;
    }

    for (const manager of managers) {
      // Check if this manager already has model registries
      const existing = await ModelRegistry.findOne({ ownerId: manager._id });
      if (existing) {
        // Already seeded for this user
        continue;
      }

      console.log(`🌱 Seeding model registry for user: ${manager.email}`);

      // Seed 3 registries
      const registryData = [
        {
          name: 'llama-2-7b-chat-finetuned',
          description: 'Fine-tuned Llama 2 7B model for conversational AI with custom domain adaptation',
          baseModel: 'meta-llama/Llama-2-7b-chat-hf',
          versions: [
            {
              version: 'v2.3.1',
              status: ModelVersionStatus.USE,
              metrics: { accuracy: 89.2, latency: '142ms', size: '13.5 GB', loss: 0.1245 },
              notes: 'Best performing conversational checkpoint. Stable, low hallucination.',
              hfRepoId: 'meta-llama/Llama-2-7b-chat-hf'
            },
            {
              version: 'v2.2.0',
              status: ModelVersionStatus.NOT_USE,
              metrics: { accuracy: 87.5, latency: '150ms', size: '13.5 GB', loss: 0.1432 },
              notes: 'Earlier iteration, higher loss.',
              hfRepoId: 'meta-llama/Llama-2-7b-chat-hf'
            }
          ]
        },
        {
          name: 'gpt-neo-2.7b-custom',
          description: 'GPT Neo 2.7B model optimized for code generation and technical documentation',
          baseModel: 'EleutherAI/gpt-neo-2.7B',
          versions: [
            {
              version: 'v1.5.0',
              status: ModelVersionStatus.USE,
              metrics: { accuracy: 84.7, latency: '98ms', size: '10.2 GB', loss: 0.2312 },
              notes: 'Fine-tuned on coding QA dataset. Good python/JS generation.',
              hfRepoId: 'EleutherAI/gpt-neo-2.7B'
            }
          ]
        },
        {
          name: 'mistral-7b-instruct-v0.2',
          description: 'Mistral 7B instruction-tuned model with enhanced reasoning capabilities',
          baseModel: 'mistralai/Mistral-7B-Instruct-v0.2',
          versions: [
            {
              version: 'v0.2.4',
              status: ModelVersionStatus.USE,
              metrics: { accuracy: 91.5, latency: '128ms', size: '14.1 GB', loss: 0.0982 },
              notes: 'Top tier performance on complex reasoning tasks.',
              hfRepoId: 'mistralai/Mistral-7B-Instruct-v0.2'
            }
          ]
        }
      ];

      for (const reg of registryData) {
        const registry = await ModelRegistry.create({
          ownerId: manager._id,
          name: reg.name,
          description: reg.description,
          baseModel: reg.baseModel
        });

        for (const ver of reg.versions) {
          await ModelVersion.create({
            ownerId: manager._id,
            modelRegistryId: registry._id,
            version: ver.version,
            status: ver.status,
            metrics: ver.metrics,
            notes: ver.notes,
            hfRepoId: ver.hfRepoId,
            createdBy: manager.name
          });
        }
      }
    }
    console.log('✅ Model registry seeding complete!');
  } catch (err: any) {
    console.error('❌ Model registry seeding failed:', err.message);
  }
}
