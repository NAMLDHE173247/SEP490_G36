import { User } from './models/User';
import { TrainingHistory } from './models/TrainingHistory';
import { ModelEvaluation } from './models/Evaluation';

export async function seedTrainingHistoryData() {
  try {
    const managers = await User.find({ role: { $in: ['admin', 'supervisor'] } });
    if (managers.length === 0) {
      console.log('⚠️ No admin/supervisor users found, skipping training history seeding');
      return;
    }

    for (const manager of managers) {
      // Clear old seeded data first to ensure clean state and avoid duplicate index errors
      await TrainingHistory.deleteMany({ ownerId: manager._id, jobId: { $regex: /job-mock/ } });
      await ModelEvaluation.deleteMany({ ownerId: manager._id, jobId: { $regex: /job-mock/ } });

      console.log(`🌱 Seeding training history and evaluations for user: ${manager.email}`);

      // We append manager._id as a suffix to jobId to avoid global duplicate key violations
      const managerSuffix = manager._id.toString();

      const mockHistories = [
        {
          jobId: `job-mock-math-socratic-001-${managerSuffix}`,
          projectName: 'socratic-math-tutor-v1',
          baseModel: 'Qwen/Qwen3-0.6B',
          datasetSource: 'local',
          datasetName: 'math_socratic_dataset.json',
          columnMapping: 'instruction',
          systemPrompt: 'Bạn là một gia sư dạy toán theo phương pháp Socratic. Thay vì đưa ra câu trả lời trực tiếp, hãy đặt câu hỏi gợi ý để học sinh tự tìm ra đáp án.',
          systemPromptVersion: 'Math-Socratic-V1',
          parameters: {
            batchSize: 2,
            epochs: 3,
            learningRate: 0.00003,
            blockSize: 512,
            modelMaxLength: 1024,
            r: 8,
            lora_alpha: 8,
            lora_dropout: 0.05,
            random_state: 3407,
            gradient_accumulation_steps: 4,
            warmup_steps: 5,
            weight_decay: 0.01,
            seed: 3407,
            early_stopping_loss: 0.05,
            early_stopping_patience: 3,
            optim: 'adamw_8bit',
            gradient_accumulation_steps_override: 4,
            lr_scheduler_type: 'linear'
          },
          pushToHub: true,
          hfRepoId: 'socratic-ai/qwen-0.6b-math-tutor',
          status: 'COMPLETED',
          finalMetrics: {
            loss: 0.1245,
            accuracy: 96.8,
            vram: 4120,
            gpu_util: 92
          },
          lastLogLine: '[Epoch 3/3] Training completed. Saving checkpoint to HF Hub and local storage...',
          trainingDuration: 1450000,
          startedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
          completedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 1450000),
          lossHistory: [
            { progress: 10, loss: 1.4502 },
            { progress: 20, loss: 1.1205 },
            { progress: 30, loss: 0.8951 },
            { progress: 40, loss: 0.6512 },
            { progress: 50, loss: 0.4503 },
            { progress: 60, loss: 0.3204 },
            { progress: 70, loss: 0.2401 },
            { progress: 80, loss: 0.1852 },
            { progress: 90, loss: 0.1451 },
            { progress: 100, loss: 0.1245 }
          ],
          evalLossHistory: [
            { progress: 20, loss: 1.2504 },
            { progress: 40, loss: 0.7892 },
            { progress: 60, loss: 0.4201 },
            { progress: 80, loss: 0.2302 },
            { progress: 100, loss: 0.1582 }
          ],
          totalRecords: 1200,
          totalTokens: 350000
        },
        {
          jobId: `job-mock-code-socratic-002-${managerSuffix}`,
          projectName: 'socratic-code-assistant-v2',
          baseModel: 'meta-llama/Llama-3.1-8B-Instruct',
          datasetSource: 'hub',
          datasetName: 'openai/code-instructions-socratic',
          columnMapping: 'prompt',
          systemPrompt: 'Bạn là một trợ lý lập trình Socratic. Hãy dẫn dắt học sinh tự sửa lỗi cú pháp và tư duy thuật toán thông qua câu hỏi gợi mở.',
          systemPromptVersion: 'Code-Socratic-V2',
          parameters: {
            batchSize: 1,
            epochs: 3,
            learningRate: 0.00005,
            blockSize: 512,
            modelMaxLength: 1024,
            r: 16,
            lora_alpha: 32,
            lora_dropout: 0.1,
            random_state: 42,
            gradient_accumulation_steps: 4,
            warmup_steps: 5,
            weight_decay: 0.01,
            seed: 42,
            early_stopping_loss: 0.1,
            early_stopping_patience: 3,
            optim: 'adamw_8bit',
            gradient_accumulation_steps_override: 4,
            lr_scheduler_type: 'cosine'
          },
          pushToHub: true,
          hfRepoId: 'socratic-ai/llama-8b-code-assistant',
          status: 'COMPLETED',
          finalMetrics: {
            loss: 0.3541,
            accuracy: 91.2,
            vram: 14200,
            gpu_util: 98
          },
          lastLogLine: '[Epoch 3/3] Epoch finished. Validation loss: 0.3912. Model successfully saved.',
          trainingDuration: 3600000,
          startedAt: new Date(Date.now() - 24 * 3600 * 1000),
          completedAt: new Date(Date.now() - 24 * 3600 * 1000 + 3600000),
          lossHistory: [
            { progress: 10, loss: 2.1052 },
            { progress: 20, loss: 1.8504 },
            { progress: 30, loss: 1.4502 },
            { progress: 40, loss: 1.1205 },
            { progress: 50, loss: 0.8951 },
            { progress: 60, loss: 0.7104 },
            { progress: 70, loss: 0.5801 },
            { progress: 80, loss: 0.4752 },
            { progress: 90, loss: 0.3981 },
            { progress: 100, loss: 0.3541 }
          ],
          evalLossHistory: [
            { progress: 20, loss: 1.9502 },
            { progress: 40, loss: 1.2504 },
            { progress: 60, loss: 0.8102 },
            { progress: 80, loss: 0.5302 },
            { progress: 100, loss: 0.3912 }
          ],
          totalRecords: 2500,
          totalTokens: 1250000
        },
        {
          jobId: `job-mock-glm-prompt-003-${managerSuffix}`,
          projectName: 'glm-prompt-opt-v1',
          baseModel: 'zai-org/GLM-4.7-Flash',
          datasetSource: 'cloud',
          datasetName: 'gcs://socratic-bucket/prompt-data.jsonl',
          columnMapping: 'text',
          systemPrompt: 'Hãy biến đổi câu hỏi của người dùng thành các prompt mang tính gợi mở, học hỏi sâu sắc theo triết lý Socratic.',
          systemPromptVersion: 'Prompt-Opt-V1',
          parameters: {
            batchSize: 2,
            epochs: 5,
            learningRate: 0.00002,
            blockSize: 512,
            modelMaxLength: 1024,
            r: 8,
            lora_alpha: 8,
            lora_dropout: 0.05,
            random_state: 1234,
            gradient_accumulation_steps: 8,
            warmup_steps: 2,
            weight_decay: 0.0,
            seed: 1234,
            early_stopping_loss: 0.1,
            early_stopping_patience: 2,
            optim: 'adamw_8bit',
            gradient_accumulation_steps_override: 8,
            lr_scheduler_type: 'linear'
          },
          pushToHub: true,
          hfRepoId: 'socratic-ai/glm-4-prompt-opt',
          status: 'COMPLETED',
          finalMetrics: {
            loss: 0.8123,
            accuracy: 78.5,
            vram: 6200,
            gpu_util: 85
          },
          lastLogLine: '[Epoch 5/5] Epoch finished. Loss: 0.8123. Model uploaded to HF Hub.',
          trainingDuration: 600000,
          startedAt: new Date(Date.now() - 12 * 3600 * 1000),
          completedAt: new Date(Date.now() - 12 * 3600 * 1000 + 600000),
          lossHistory: [
            { progress: 10, loss: 1.9502 },
            { progress: 20, loss: 1.6205 },
            { progress: 30, loss: 1.3401 },
            { progress: 40, loss: 1.1002 },
            { progress: 50, loss: 0.8123 }
          ],
          totalRecords: 800,
          totalTokens: 180000
        },
        {
          jobId: `job-mock-physics-004-${managerSuffix}`,
          projectName: 'physics-socratic-v3',
          baseModel: 'Qwen/Qwen3-0.6B',
          datasetSource: 'local',
          datasetName: 'physics_qa_dataset.json',
          columnMapping: 'instruction',
          systemPrompt: 'Dẫn dắt các khái niệm vật lý (lực, động năng, điện trường) bằng câu hỏi logic Socratic.',
          systemPromptVersion: 'Physics-V3',
          parameters: {
            batchSize: 2,
            epochs: 3,
            learningRate: 0.00003,
            blockSize: 512,
            modelMaxLength: 1024,
            r: 8,
            lora_alpha: 8,
            lora_dropout: 0.05,
            random_state: 3407,
            gradient_accumulation_steps: 4,
            warmup_steps: 5,
            weight_decay: 0.01,
            seed: 3407,
            early_stopping_loss: 0.05,
            early_stopping_patience: 3,
            optim: 'adamw_hf',
            gradient_accumulation_steps_override: 4,
            lr_scheduler_type: 'linear'
          },
          pushToHub: false,
          hfRepoId: '',
          status: 'FAILED',
          finalMetrics: {
            loss: 1.5421,
            accuracy: 42.1,
            vram: 4120,
            gpu_util: 40
          },
          lastLogLine: 'CUDA Out of Memory Error: Tried to allocate 2.40 GiB (GPU 0; 8.00 GiB total capacity; 5.12 GiB already allocated).',
          trainingDuration: 120000,
          startedAt: new Date(Date.now() - 6 * 3600 * 1000),
          completedAt: new Date(Date.now() - 6 * 3600 * 1000 + 120000),
          lossHistory: [
            { progress: 5, loss: 2.0504 },
            { progress: 10, loss: 1.8502 },
            { progress: 15, loss: 1.5421 }
          ],
          totalRecords: 1500,
          totalTokens: 450000
        }
      ];

      for (const hist of mockHistories) {
        await TrainingHistory.create({
          ownerId: manager._id,
          ...hist
        });
      }

      // Seed matching Evaluations with unique modelEvalIds and jobIds
      await ModelEvaluation.create({
        ownerId: manager._id,
        modelEvalId: `eval_math_socratic_001-${managerSuffix}`,
        jobId: `job-mock-math-socratic-001-${managerSuffix}`,
        status: 'COMPLETED',
        evalMode: 'single',
        ftModelRepo: 'socratic-ai/qwen-0.6b-math-tutor',
        totalConversations: 50,
        validConversations: 50,
        summary: {
          overall: 4.82,
          max_possible: 5,
          accuracy: 0.96
        },
        judgeModel: 'gemini-1.5-pro',
        startedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
        completedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 300000)
      });

      await ModelEvaluation.create({
        ownerId: manager._id,
        modelEvalId: `eval_code_socratic_002-${managerSuffix}`,
        jobId: `job-mock-code-socratic-002-${managerSuffix}`,
        status: 'COMPLETED',
        evalMode: 'single',
        ftModelRepo: 'socratic-ai/llama-8b-code-assistant',
        totalConversations: 80,
        validConversations: 80,
        summary: {
          overall: 4.56,
          max_possible: 5,
          accuracy: 0.91
        },
        judgeModel: 'gemini-1.5-pro',
        startedAt: new Date(Date.now() - 24 * 3600 * 1000),
        completedAt: new Date(Date.now() - 24 * 3600 * 1000 + 450000)
      });

      await ModelEvaluation.create({
        ownerId: manager._id,
        modelEvalId: `eval_glm_prompt_003-${managerSuffix}`,
        jobId: `job-mock-glm-prompt-003-${managerSuffix}`,
        status: 'COMPLETED',
        evalMode: 'single',
        ftModelRepo: 'socratic-ai/glm-4-prompt-opt',
        totalConversations: 60,
        validConversations: 60,
        summary: {
          overall: 4.24,
          max_possible: 5,
          accuracy: 0.85
        },
        judgeModel: 'gemini-1.5-pro',
        startedAt: new Date(Date.now() - 12 * 3600 * 1000),
        completedAt: new Date(Date.now() - 12 * 3600 * 1000 + 240000)
      });
    }
    console.log('✅ Training history and evaluations seeding complete!');
  } catch (err: any) {
    console.error('❌ Training history seeding failed:', err.message);
  }
}
