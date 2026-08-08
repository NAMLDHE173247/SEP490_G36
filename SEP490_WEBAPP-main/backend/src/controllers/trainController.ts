import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/User';
import { Request, Response } from 'express';
import { getAuthUserId } from '../utils/auth';
import { storage } from '../services/storage';
import { ChatSession } from '../models/ChatSession';
import { ModelEvaluation } from '../models/Evaluation';
import { ModelRegistry } from '../models/ModelRegistry';
import { configService } from '../services/configService';
import { TrainingHistory } from '../models/TrainingHistory';
import { DataPrepProject } from '../models/DataPrepProject';
import { DatasetSampleAssignment } from '../models/DatasetSampleAssignment';
import { buildTrainAuditUpdate, toMongoAuditUpdate } from '../utils/trainAudit';
import { DatasetAssignmentSubmission } from '../models/DatasetAssignmentSubmission';
import { nodeFetch as fetch, fetchWithForm, GPU_TUNNEL_HEADERS } from '../utils/gpuHttp';
import { isZipFile, extractForTraining, cleanupTempDir, DatasetMetadata } from '../services/zipService';
dotenv.config();

/**
 * Đồng bộ log/audit/effective_config/metrics từ GPU status vào Mongo
 * (fire-and-forget). Trả về raw update để caller sync bản sao local (SSE giữ
 * document trong RAM suốt stream).
 */
function persistTrainAudit(
  jobId: string,
  ownerId: string,
  data: Record<string, any>,
  history: {
    trainLogs?: string[];
    lastError?: string;
    progress?: number;
    lastMetricsAt?: Date;
  },
): Record<string, unknown> {
  const raw = buildTrainAuditUpdate(data, {
    logs: Array.isArray(history.trainLogs) ? history.trainLogs : [],
    lastError: history.lastError || '',
    progress: typeof history.progress === 'number' ? history.progress : undefined,
    metricsAt: history.lastMetricsAt || null,
  });
  const mongo = toMongoAuditUpdate(raw);
  if (!mongo.$set && !mongo.$push) return raw;
  TrainingHistory.updateOne({ jobId, ownerId }, mongo).catch((err) =>
    console.error('[Backend] Failed to persist train audit:', err),
  );
  return raw;
}

class WorkerManager {
  private workers: { url: string; activeJobs: number }[] = [];

  constructor() { }

  // Sync workers array with current config
  private syncWorkers() {
    const currentUrls = configService.getGpuUrls();
    // Keep active jobs for existing urls, add new ones, remove missing ones
    this.workers = currentUrls.map(url => {
      const existing = this.workers.find(w => w.url === url);
      return existing || { url, activeJobs: 0 };
    });
  }

  // Pick the worker with the fewest active jobs
  getNextWorker(): string {
    this.syncWorkers();
    if (this.workers.length === 0) return 'http://localhost:5000';

    // Sort by active jobs and pick the first one
    this.workers.sort((a, b) => a.activeJobs - b.activeJobs);
    return this.workers[0].url;
  }

  incrementJobs(url: string) {
    this.syncWorkers();
    const worker = this.workers.find(w => w.url === url);
    if (worker) worker.activeJobs++;
  }

  decrementJobs(url: string) {
    this.syncWorkers();
    const worker = this.workers.find(w => w.url === url);
    if (worker && worker.activeJobs > 0) worker.activeJobs--;
  }

  getUrls() {
    this.syncWorkers();
    if (this.workers.length === 0) return ['http://localhost:5000'];
    return this.workers.map(w => w.url);
  }
}

const workerManager = new WorkerManager();

const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const GOOGLE_DRIVE_CREDENTIALS = process.env.GOOGLE_DRIVE_CREDENTIALS || '';

// Parse Google Drive credentials once at startup
let parsedGoogleCredentials: any = null;
if (GOOGLE_DRIVE_CREDENTIALS) {
  try {
    parsedGoogleCredentials = JSON.parse(GOOGLE_DRIVE_CREDENTIALS);
  } catch (e) {
    console.error('[Backend] Lỗi: GOOGLE_DRIVE_CREDENTIALS không phải là JSON hợp lệ.');
  }
}

// ---------------------------------------------------------------------------
// Helper: forward a FormData to the GPU service with proper Content-Length.
// Shared implementation lives in utils/gpuHttp to avoid duplication.
// ---------------------------------------------------------------------------

async function hfRepoCheckpointProbe(
  repoId: string,
  token?: string,
): Promise<{ result: 'has' | 'no' | 'unknown' | 'not_found' }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(repoId)}`, { headers });
    if (response.status === 404) return { result: 'not_found' };
    if (response.status === 401 || response.status === 403) return { result: 'unknown' };
    if (!response.ok) return { result: 'unknown' };

    const data: any = await response.json();
    const siblings: any[] = Array.isArray(data?.siblings) ? data.siblings : [];
    const has = siblings.some((s) => {
      const name = typeof s?.rfilename === 'string' ? s.rfilename : '';
      return name.includes('checkpoint-') || name === 'last-checkpoint' || name.startsWith('last-checkpoint/');
    });
    return { result: has ? 'has' : 'no' };
  } catch {
    return { result: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// POST /api/train/start
// FE sends multipart/form-data (file + params)
// BE generates job_id, forwards EVERYTHING (including the dataset file)
// to the GPU service as multipart/form-data, then returns the response to FE.
// ---------------------------------------------------------------------------
export const startTraining = async (req: Request, res: Response) => {
  let zipTempDir: string | null = null;
  let validationDatasetPath: string | undefined;
  let validationDatasetName: string | undefined;
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Từ điển đầy đủ (kiểu, mặc định, ví dụ từng key):
    // docs/FINE_TUNING_MODELS_VA_CO.md — mục 3.0 "Request body POST /api/train/start".
    const {
      // ── Model & nguồn dữ liệu ──────────────────────────────────────────────
      model_name,          // HF id model nền, vd "unsloth/Qwen2.5-7B-Instruct-bnb-4bit"
      dataset,             // HF Hub dataset id — chỉ khi KHÔNG upload file
      cloudLoadedDataset,  // path file backend đã tải sẵn từ cloud storage

      // ── Tham số học (optimizer / schedule) ────────────────────────────────
      seed,
      epochs,
      batchSize,
      blockSize,
      learningRate,
      modelMaxLength,
      optim,
      warmup_steps,
      weight_decay,
      random_state,
      lr_scheduler_type,
      gradient_accumulation_steps,

      // ── LoRA ──────────────────────────────────────────────────────────────
      r,
      lora_alpha,
      use_rslora,
      lora_dropout,
      lora_target_modules,

      // ── Chất lượng / chống overfit (tuỳ chọn — gpu-service tự áp mặc định) ─
      early_stopping_loss,
      early_stopping_patience,
      early_stopping_min_delta,
      eval_steps,
      save_steps,
      warmup_ratio,
      max_grad_norm,
      group_by_length,
      neftune_noise_alpha,
      dataloader_num_workers,
      auto_tune,           // false = khóa AutoTune, giữ nguyên knob tay
      enable_thinking,     // train khối reasoning/think (Gemma 4 / Qwen3)
      chat_template_jinja, // chuỗi Jinja dán tay (đi kèm chat_template=paste)
      chat_template,       // override template: auto|native|paste|qwen-2.5|...

      // ── Hugging Face Hub ──────────────────────────────────────────────────
      hf_token,
      hf_repo_id,
      push_to_hub,

      // ── Metadata — chỉ lưu TrainingHistory, không đổi hành vi train ───────
      projectName,
      totalTokens,
      systemPrompt,
      totalRecords,
      columnMapping,
      systemPromptVersion,
      datasetSource,       // 'local' | 'hub' | 'cloud'
      column_mapping,      // chấp nhận cả camelCase lẫn snake_case

      // ── Chống double-submit (bấm Start 2 lần) ─────────────────────────────
      idempotencyKey,
      clientTrainingKey,
    } = req.body;

    console.log('[Backend] Received columnMapping:', columnMapping);
    console.log('[Backend] Received column_mapping:', column_mapping);

    // Older saved AutoTrain jobs defaulted to `text`.  Conversation datasets
    // use the ChatML-compatible `messages` field, so recover safely when that
    // stale default is sent with a messages-only file.
    let finalColumnMapping = columnMapping || column_mapping || 'text';
    console.log('[Backend] Using finalColumnMapping:', finalColumnMapping);

    const datasetFile = req.file; // populated by multer when a file is uploaded

    // ── ZIP Extraction ─────────────────────────────────────────────────────────
    // If the uploaded file is a ZIP, extract the train dataset + metadata.
    // The extracted JSON file replaces the original multer file for downstream processing.
    let zipMetadata: DatasetMetadata | null = null;
    if (datasetFile && isZipFile(datasetFile.originalname)) {
      try {
        const extracted = extractForTraining(datasetFile.path);
        zipMetadata = extracted.metadata;
        zipTempDir = extracted.tempDir;
        validationDatasetPath = extracted.validationFilePath;
        validationDatasetName = extracted.validationFileName;

        // Replace multer file properties with the extracted JSON file
        datasetFile.path = extracted.dataFilePath;
        datasetFile.originalname = extracted.dataFileName;
        datasetFile.size = fs.statSync(extracted.dataFilePath).size;
        datasetFile.mimetype = 'application/json';

        console.log('[Backend] ZIP extracted for training:', extracted.dataFileName);
        if (zipMetadata) {
          console.log('[Backend] ZIP metadata found:', JSON.stringify(zipMetadata));
        }
      } catch (zipErr: any) {
        // Clean up original multer file
        fs.unlink(datasetFile.path, () => { });
        return res.status(400).json({ error: zipErr.message || 'Failed to extract ZIP file.' });
      }
    }

    // ── Local File/Cloud File Column Validation ──────────────────────────────────────────
    const validationFilePath = datasetFile ? datasetFile.path : (cloudLoadedDataset && fs.existsSync(cloudLoadedDataset) ? cloudLoadedDataset : null);
    let detectedTotalRecords = 0;
    let detectedTotalTokens = 0;
    if (validationFilePath) {
      try {
        const fileContent = fs.readFileSync(validationFilePath, { encoding: 'utf-8', flag: 'r' });
        const nameToCheck = datasetFile ? datasetFile.originalname : path.basename(validationFilePath);
        detectedTotalTokens = Math.max(1, Math.round(fileContent.length / 4));

        let columns: string[] = [];
        if (nameToCheck.endsWith('.json') || nameToCheck.endsWith('.jsonl')) {
          try {
            const parsed = JSON.parse(fileContent);
            const item = Array.isArray(parsed) ? parsed[0] : parsed;
            detectedTotalRecords = Array.isArray(parsed) ? parsed.length : 1;
            if (item && typeof item === 'object') {
              columns = Object.keys(item);
            }
          } catch {
            // Try JSONL
            const jsonlLines = fileContent.split('\n').filter(line => line.trim());
            detectedTotalRecords = jsonlLines.length;
            const firstLine = jsonlLines[0];
            const parsed = JSON.parse(firstLine);
            if (parsed && typeof parsed === 'object') {
              columns = Object.keys(parsed);
            }
          }
        } else if (nameToCheck.endsWith('.csv')) {
          const csvLines = fileContent.split('\n').filter(line => line.trim());
          detectedTotalRecords = Math.max(0, csvLines.length - 1);
          const firstLine = csvLines[0];
          columns = firstLine.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        }

        if (
          columns.length > 0 &&
          !columns.includes(finalColumnMapping) &&
          finalColumnMapping === 'text' &&
          columns.includes('messages')
        ) {
          finalColumnMapping = 'messages';
          console.log('[Backend] Auto-corrected stale text mapping to messages.');
        }

        if (columns.length > 0 && !columns.includes(finalColumnMapping)) {
          return res.status(400).json({
            error: `Column Mapping Error: The column '${finalColumnMapping}' was not found in your dataset file. Detected columns: ${columns.join(', ')}`
          });
        }
      } catch (err) {
        console.warn('[Backend] Could not validate columns in file:', err);
      }
    }

    // ── Validation ────────────────------------------------------------------
    if (!model_name || typeof model_name !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid model_name' });
    }

    const epochsNum = parseInt(epochs as string);
    if (isNaN(epochsNum) || epochsNum < 1) {
      return res.status(400).json({ error: 'Missing or invalid epochs (must be >= 1)' });
    }

    if (!datasetFile && !dataset && !cloudLoadedDataset) {
      return res.status(400).json({
        error: "Provide either a 'dataset_file' upload, a 'cloudLoadedDataset' file path, or a 'dataset' HuggingFace Hub ID.",
      });
    }

    const trainingRequestKey = String(clientTrainingKey || idempotencyKey || '').trim();
    if (trainingRequestKey) {
      const existingJob = await TrainingHistory.findOne({
        ownerId,
        'config_snapshot.clientTrainingKey': trainingRequestKey,
        status: { $in: ['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'] },
      }).sort({ startedAt: -1 }).lean();

      if (existingJob) {
        return res.status(200).json({
          message: 'Training job already exists for this request.',
          job_id: existingJob.jobId,
          status: existingJob.status,
          duplicate: true,
        });
      }
    }

    // ── Generate job ID ─────────────────────────────────────────────────────
    const job_id = `job_${uuidv4()}`;
    const effectiveSystemPrompt = String(
      systemPrompt ||
      zipMetadata?.systemPrompt ||
      'Bạn là gia sư Socratic cho học sinh THCS/THPT Việt Nam. Đọc kỹ lượt mới nhất. Nếu học sinh sai, không xác nhận là đúng và không đưa ngay đáp án; chỉ hỏi một câu gợi mở ngắn. Nếu học sinh đúng, xác nhận ngắn rồi hỏi bước tiếp theo. Không lặp phản hồi, không bịa dữ kiện, luôn kiểm tra công thức và đơn vị.'
    ).trim();
    const effectiveSystemPromptVersion = String(
      systemPromptVersion ||
      zipMetadata?.systemPromptVersion ||
      ('autotrain-' + crypto.createHash('sha256').update(effectiveSystemPrompt, 'utf8').digest('hex').slice(0, 12))
    ).trim();
    console.log(`[Backend] Starting job ${job_id} → model=${model_name} epochs=${epochsNum}`);
    console.log(`[Backend] Train system_prompt chars=${effectiveSystemPrompt.length} preview="${effectiveSystemPrompt.slice(0, 90)}"`);

    if (hf_token) {
      console.log(`[Backend] HF Token detected: ${hf_token.substring(0, 4)}****`);
    } else {
      console.warn(`[Backend] No HF Token provided in request body`);
    }

    // ── Knob tuỳ chọn ────────────────────────────────────────────────────────
    // Chỉ gửi khi client đặt rõ. Ép giá trị mặc định ở đây (như `|| 0.5` cho
    // early_stopping_loss trước kia) khiến gpu-service không bao giờ dùng được
    // mặc định đã hiệu chỉnh của nó.
    const optionalKnobs: Record<string, unknown> = {};
    const putNumber = (key: string, raw: unknown) => {
      if (raw === undefined || raw === null || raw === '') return;
      const value = Number(raw);
      if (Number.isFinite(value)) optionalKnobs[key] = value;
    };
    const putBoolean = (key: string, raw: unknown) => {
      if (raw === undefined || raw === null || raw === '') return;
      optionalKnobs[key] = raw === true || raw === 'true';
    };

    putBoolean('auto_tune', auto_tune);
    putNumber('eval_steps', eval_steps);
    putNumber('save_steps', save_steps);
    putBoolean('use_rslora', use_rslora);
    putNumber('warmup_ratio', warmup_ratio);
    putNumber('max_grad_norm', max_grad_norm);
    putBoolean('group_by_length', group_by_length);
    putBoolean('enable_thinking', enable_thinking);
    putNumber('early_stopping_loss', early_stopping_loss);
    putNumber('neftune_noise_alpha', neftune_noise_alpha);
    putNumber('dataloader_num_workers', dataloader_num_workers);
    putNumber('early_stopping_patience', early_stopping_patience);
    putNumber('early_stopping_min_delta', early_stopping_min_delta);
    if (typeof chat_template === 'string' && chat_template.trim()) {
      optionalKnobs.chat_template = chat_template.trim();
    }
    if (typeof chat_template_jinja === 'string' && chat_template_jinja.trim()) {
      // Giới hạn kích thước — Jinja tokenizer_config thường < 100KB
      optionalKnobs.chat_template_jinja = chat_template_jinja.trim().slice(0, 200_000);
    }
    if (lora_target_modules) {
      // Chuẩn về chuỗi: vừa hợp schema TrainingHistory, vừa được gpu-service
      // hiểu (tên preset hoặc danh sách ngăn cách bởi dấu phẩy).
      optionalKnobs.lora_target_modules = Array.isArray(lora_target_modules)
        ? lora_target_modules.join(',')
        : String(lora_target_modules);
    }

    // ── Build JSON config for GPU Service ─────────────────────────────────────
    const config: any = {
      job_id,
      model_name,
      ...optionalKnobs,
      epochs: epochsNum,
      hf_token: hf_token || '',
      hf_repo_id: hf_repo_id || '',
      r: parseInt(r as string) || 16,
      text_column: finalColumnMapping,
      target_column: finalColumnMapping,
      column_mapping: finalColumnMapping,
      system_prompt: effectiveSystemPrompt,
      // Google Drive for checkpoint saving
      seed: parseInt(seed as string) || 3407,
      dataset_text_field: finalColumnMapping,
      drive_folder_id: GOOGLE_DRIVE_FOLDER_ID,
      optim: (optim as string) || 'adamw_8bit',
      service_account: parsedGoogleCredentials,
      batchSize: parseInt(batchSize as string) || 1,
      blockSize: parseInt(blockSize as string) || 512,
      lora_alpha: parseInt(lora_alpha as string) || 16,
      warmup_steps: parseInt(warmup_steps as string) || 5,
      system_prompt_version: effectiveSystemPromptVersion,
      lora_dropout: parseFloat(lora_dropout as string) || 0,
      random_state: parseInt(random_state as string) || 3407,
      learningRate: parseFloat(learningRate as string) || 2e-4,
      weight_decay: parseFloat(weight_decay as string) || 0.01,
      modelMaxLength: parseInt(modelMaxLength as string) || 2048,
      push_to_hub: push_to_hub === 'true' || push_to_hub === true,
      lr_scheduler_type: (lr_scheduler_type as string) || 'linear',
      // Pass column mapping to GPU service in multiple formats to be safe
      gradient_accumulation_steps: parseInt(gradient_accumulation_steps as string) || 4,
    };

    // If no file uploaded, embed HF Hub ID directly into config
    if (!datasetFile && !cloudLoadedDataset) {
      config.dataset_hf_id = dataset as string;
    }

    const form = new FormData();
    form.append('config', JSON.stringify(config));
    // Also append as top-level fields for some GPU service versions
    form.append('column_mapping', finalColumnMapping);
    form.append('dataset_text_field', finalColumnMapping);

    if (datasetFile) {
      form.append('file', fs.createReadStream(datasetFile.path), {
        filename: datasetFile.originalname,
        contentType: datasetFile.mimetype || 'application/octet-stream',
        knownLength: datasetFile.size,
      });
      if (validationDatasetPath) {
        const validationStats = fs.statSync(validationDatasetPath);
        form.append('validation_file', fs.createReadStream(validationDatasetPath), {
          filename: validationDatasetName || 'validation_dataset.json',
          contentType: 'application/json',
          knownLength: validationStats.size,
        });
        config.validation_dataset_provided = true;
      }
    } else if (cloudLoadedDataset && fs.existsSync(cloudLoadedDataset)) {
      const stats = fs.statSync(cloudLoadedDataset);
      form.append('file', fs.createReadStream(cloudLoadedDataset), {
        filename: path.basename(cloudLoadedDataset),
        contentType: 'application/json',
        knownLength: stats.size,
      });
    }

    // ── Forward to GPU Service (with explicit Content-Length) ───────────────
    const workerUrl = workerManager.getNextWorker();
    console.log(`[Backend] Forwarding to GPU service: ${workerUrl}/api/train/start`);
    workerManager.incrementJobs(workerUrl);

    const gpuResponse = await fetchWithForm(`${workerUrl}/api/train/start`, form);

    // Log raw response text first — helps debug if GPU service returns HTML/error pages
    const responseText = await gpuResponse.text();
    console.log(`[Backend] GPU response (${gpuResponse.status}): ${responseText.slice(0, 300)}`);

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: 'GPU service returned non-JSON response',
        raw: responseText.slice(0, 500),
      });
    }

    if (!gpuResponse.ok) {
      if (zipTempDir) cleanupTempDir(zipTempDir);
      return res.status(gpuResponse.status).json(data);
    }

    let savedDatasetPath: string | undefined;
    let datasetStorageKey: string | undefined;
    let datasetStorageUrl: string | undefined;

    // Persist the dataset so a job can be resumed later.
    if (datasetFile || (cloudLoadedDataset && fs.existsSync(cloudLoadedDataset))) {
      const srcPath = datasetFile ? datasetFile.path : cloudLoadedDataset!;
      // Sanitize: the original client filename is untrusted — collapse it to a
      // basename so it can never traverse outside the target location.
      const srcName = path.basename(datasetFile ? datasetFile.originalname : cloudLoadedDataset!);

      // Preferred path: durable object storage (MinIO/CDN). Survives container
      // restarts, unlike the local uploads volume, and keeps disk usage bounded.
      if (storage.isEnabled()) {
        try {
          const result = await storage.uploadFile(srcPath, `datasets/${job_id}/${srcName}`);
          datasetStorageKey = result.objectKey;
          datasetStorageUrl = result.url;
          console.log(`[Backend] Dataset uploaded to object storage: ${result.url}`);
          // Storage is now the source of truth; drop the local temp copy.
          fs.unlink(srcPath, () => { });
        } catch (err) {
          console.warn('[Backend] Storage upload failed; falling back to local persist:', err);
        }
      }

      // Fallback (storage disabled or upload failed): keep the legacy local copy.
      if (!datasetStorageKey) {
        const persistentDir = path.join(process.cwd(), 'uploads', 'persistent_datasets');
        if (!fs.existsSync(persistentDir)) {
          fs.mkdirSync(persistentDir, { recursive: true });
        }

        savedDatasetPath = path.join(persistentDir, `${job_id}_${srcName}`);

        // Move the file instead of deleting it
        fs.rename(srcPath, savedDatasetPath, (err) => {
          if (err) {
            if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
              fs.copyFile(srcPath, savedDatasetPath!, (copyErr) => {
                if (copyErr) {
                  console.warn(`[Backend] Could not copy dataset file: ${srcPath}`, copyErr);
                  savedDatasetPath = undefined;
                } else {
                  console.log(`[Backend] Dataset copied persistently for Resume: ${savedDatasetPath}`);
                }
                fs.unlink(srcPath, () => { });
              });
            } else {
              console.warn(`[Backend] Could not move dataset file: ${srcPath}`, err);
              savedDatasetPath = undefined;
              fs.unlink(srcPath, () => { }); // Fallback to delete
            }
          } else {
            console.log(`[Backend] Dataset saved persistently for Resume: ${savedDatasetPath}`);
          }
        });
      }
    }

    // --- CREATE INITIAL TRAINING HISTORY RECORD ---
    try {
      await TrainingHistory.create({
        ownerId,
        jobId: job_id,
        projectName: typeof projectName === 'string' ? projectName : 'AutoTrain Job',
        baseModel: model_name,
        // Dataset & Prompt traceability from ZIP metadata
        systemPrompt: effectiveSystemPrompt,
        systemPromptVersion: effectiveSystemPromptVersion,
        datasetVersionId: zipMetadata?.datasetVersionId || undefined,
        datasetSource: (datasetSource as string) || (datasetFile ? 'local' : cloudLoadedDataset ? 'cloud' : 'hub'),
        datasetName: datasetFile ? datasetFile.originalname : cloudLoadedDataset ? path.basename(cloudLoadedDataset) : dataset,
        columnMapping: (columnMapping as string) || 'text',
        parameters: {
          batchSize: parseInt(batchSize as string) || 1,
          epochs: epochsNum,
          learningRate: parseFloat(learningRate as string) || 2e-4,
          blockSize: parseInt(blockSize as string) || 512,
          modelMaxLength: parseInt(modelMaxLength as string) || 2048,
          r: parseInt(r as string) || 8,
          lora_alpha: parseInt(lora_alpha as string) || 8,
          lora_dropout: parseFloat(lora_dropout as string) || 0,
          random_state: parseInt(random_state as string) || 3407,
          gradient_accumulation_steps: parseInt(gradient_accumulation_steps as string) || 4,
          warmup_steps: parseInt(warmup_steps as string) || 5,
          weight_decay: parseFloat(weight_decay as string) || 0.01,
          seed: parseInt(seed as string) || 3407,
          ...optionalKnobs,
          optim: (optim as string) || 'adamw_8bit',
          lr_scheduler_type: (lr_scheduler_type as string) || 'linear',
        },
        pushToHub: String(push_to_hub === 'true' || push_to_hub === true) === 'true',
        hfRepoId: hf_repo_id || '',
        status: 'QUEUED',
        trainingDuration: 0,
        startedAt: new Date(),
        config_snapshot: {
          ...req.body,
          clientTrainingKey: trainingRequestKey || undefined,
          column_mapping: finalColumnMapping,
          dataset_text_field: finalColumnMapping,
        },
        datasetPath: savedDatasetPath,
        datasetStorageKey: datasetStorageKey,
        datasetUrl: datasetStorageUrl,
        datasetFileId: datasetFile?.filename,
        workerUrl: workerUrl,
        totalTokens: parseInt(totalTokens as string) || detectedTotalTokens,
        totalRecords: parseInt(totalRecords as string) || detectedTotalRecords,
      });
      console.log(`[Backend] Initial TrainingHistory created for job ${job_id}`);
    } catch (dbErr) {
      console.error('[Backend] Failed to create initial TrainingHistory:', dbErr);
    }

    // Clean up ZIP temp directory if used
    if (zipTempDir) cleanupTempDir(zipTempDir);

    return res.status(gpuResponse.status).json(data);
  } catch (err: any) {
    console.error('[Backend] startTraining error:', err);
    if (zipTempDir) cleanupTempDir(zipTempDir);
    const msg = err?.message || 'Failed to start training';
    if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
      return res.status(503).json({
        error: 'Không thể kết nối tới GPU Service (Colab/Kaggle). Vui lòng kiểm tra lại URL GPU Worker trong phần Cài đặt.'
      });
    }
    return res.status(500).json({ error: msg });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/active
// Returns all active training jobs from MongoDB
// ---------------------------------------------------------------------------
export const getActiveTrainingJobs = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Auto-expire stale jobs older than 15 minutes that were interrupted or crashed
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    await TrainingHistory.updateMany(
      {
        ownerId,
        status: { $in: ['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'] },
        startedAt: { $lt: fifteenMinsAgo }
      },
      {
        status: 'ERROR',
        completedAt: new Date()
      }
    ).catch(err => console.warn('[Backend] Cleanup stale jobs error:', err));

    const activeJobs = await TrainingHistory.find({
      ownerId,
      status: { $in: ['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'] }
    }).sort({ startedAt: -1 });

    return res.json(activeJobs);
  } catch (err: any) {
    console.error('[Backend] getActiveTrainingJobs error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get active jobs' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/monitor
// Giám sát job đang chạy: heartbeat, phát hiện treo, tình trạng worker.
// Đọc Mongo là chính — chỉ ping worker (timeout ngắn) để báo sống/chết.
// ---------------------------------------------------------------------------
const STALL_THRESHOLD_MS: Record<string, number> = {
  TRAINING: 5 * 60 * 1000,
  RUNNING: 5 * 60 * 1000,
  // Nạp model / xếp hàng vốn im lặng lâu — ngưỡng rộng hơn để khỏi báo nhầm
  LOADING_MODEL: 15 * 60 * 1000,
  QUEUED: 15 * 60 * 1000,
  PENDING: 15 * 60 * 1000,
};
const STALL_RENOTIFY_MS = 10 * 60 * 1000;

async function pingWorker(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${url}/api/train/status/__monitor_ping__`, {
      headers: GPU_TUNNEL_HEADERS,
      signal: controller.signal as any,
    });
    // Kể cả 404/NOT_FOUND vẫn tính là sống — worker đã trả lời.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const getTrainingMonitor = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const activeStatuses = Object.keys(STALL_THRESHOLD_MS);
    const jobs = await TrainingHistory.find({
      ownerId,
      status: { $in: activeStatuses },
    })
      .select('jobId projectName baseModel status progress lastLogLine lastError startedAt updatedAt workerUrl lastProgressAt stallNotifiedAt')
      .sort({ startedAt: -1 })
      .lean();

    const now = Date.now();
    const monitored = jobs.map((job: any) => {
      const heartbeat = job.lastProgressAt || job.updatedAt || job.startedAt;
      const silentMs = Math.max(0, now - new Date(heartbeat).getTime());
      const threshold = STALL_THRESHOLD_MS[job.status] ?? STALL_THRESHOLD_MS.TRAINING;
      const stalled = silentMs > threshold;
      return {
        jobId: job.jobId,
        projectName: job.projectName,
        baseModel: job.baseModel,
        status: job.status,
        progress: job.progress ?? null,
        lastLogLine: job.lastLogLine || '',
        lastError: job.lastError || '',
        startedAt: job.startedAt,
        lastProgressAt: heartbeat,
        silentMs,
        stalled,
        workerUrl: job.workerUrl || null,
      };
    });

    // Ghi audit event STALL (dedupe: chỉ nhắc lại sau STALL_RENOTIFY_MS)
    for (const job of monitored.filter((j) => j.stalled)) {
      const raw = jobs.find((j: any) => j.jobId === job.jobId) as any;
      const lastNotified = raw?.stallNotifiedAt ? new Date(raw.stallNotifiedAt).getTime() : 0;
      if (now - lastNotified < STALL_RENOTIFY_MS) continue;
      const minutes = Math.round(job.silentMs / 60000);
      TrainingHistory.updateOne(
        { jobId: job.jobId, ownerId },
        {
          $set: { stallNotifiedAt: new Date() },
          $push: {
            auditEvents: {
              $each: [{
                ts: new Date(),
                level: 'warn',
                source: 'monitor',
                code: 'STALL',
                message: `Không có tiến triển trong ~${minutes} phút (status ${job.status}). Kiểm tra GPU worker hoặc cân nhắc Stop/Resume.`,
              }],
              $slice: -500,
            },
          },
        },
      ).catch((err) => console.error('[Backend] Failed to record stall event:', err));
    }

    // Ping mỗi worker duy nhất (song song, timeout 3s)
    const workerUrls = [...new Set(
      monitored.map((j) => j.workerUrl).filter((u): u is string => !!u)
    )];
    const reachability = await Promise.all(workerUrls.map((url) => pingWorker(url)));
    const workers = workerUrls.map((url, i) => ({ url, reachable: reachability[i] }));

    return res.json({
      checkedAt: new Date(),
      jobs: monitored.map((j) => ({
        ...j,
        workerReachable: j.workerUrl
          ? workers.find((w) => w.url === j.workerUrl)?.reachable ?? null
          : null,
      })),
      workers,
    });
  } catch (err: any) {
    console.error('[Backend] getTrainingMonitor error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get training monitor' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/status/:jobId
// Proxy to GPU Service — no changes needed
// ---------------------------------------------------------------------------
export const getTrainingStatus = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;

    // Guard: never forward obviously invalid IDs
    if (!jobId || jobId === 'null' || jobId === 'undefined') {
      return res.status(400).json({ error: 'Invalid jobId' });
    }

    // Get worker URL from DB
    const history = await TrainingHistory.findOne({ jobId, ownerId });
    if (!history) {
      return res.status(404).json({ error: 'Training job not found' });
    }
    const workerUrl = history.workerUrl || workerManager.getUrls()[0];

    const response = await fetch(`${workerUrl}/api/train/status/${jobId}`, {
      headers: GPU_TUNNEL_HEADERS
    });
    const data: any = await response.json();

    if (data.status === 'NOT_FOUND') {
      const jobAgeMs = Date.now() - new Date(history.startedAt).getTime();
      if (jobAgeMs > 15000) {
        data.status = 'ERROR';
        data.logs = ['[System] Lỗi: Kết nối huấn luyện bị mất. Trạng thái công việc không tìm thấy trên GPU Worker.'];
      } else {
        data.status = 'QUEUED';
      }
    }

    // --- DB SYNC FOR POLLING ---
    if (data.status) {
      TrainingHistory.updateOne(
        { jobId, ownerId },
        { status: data.status }
      ).catch(err => console.error('[Backend] Failed to update status in DB during poll:', err));
    }

    persistTrainAudit(jobId, ownerId, data, history);

    if (data.latest_checkpoint || (data.metrics && (typeof data.metrics.loss === 'number' || typeof data.metrics.eval_loss === 'number'))) {
      const updateFields: any = {};
      if (data.latest_checkpoint) updateFields.latest_checkpoint_file_id = data.latest_checkpoint;

      const pushFields: any = {};
      if (data.metrics && typeof data.metrics.loss === 'number') {
        pushFields.lossHistory = { progress: data.progress || 0, loss: data.metrics.loss };
      }
      if (data.metrics && typeof data.metrics.eval_loss === 'number') {
        pushFields.evalLossHistory = { progress: data.progress || 0, loss: data.metrics.eval_loss };
      }

      TrainingHistory.updateOne(
        { jobId, ownerId },
        {
          ...updateFields,
          ...(Object.keys(pushFields).length > 0 ? { $push: pushFields } : {})
        }
      ).catch(err => console.error('[Backend] Failed to update history during poll:', err));
    }

    if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(data.status)) {
      const workerMetrics = data.metrics || {};
      let finalLoss = typeof data.loss === 'number' && data.loss > 0 ? data.loss : (typeof workerMetrics.loss === 'number' ? workerMetrics.loss : 0);

      if (finalLoss === 0 && history && history.lossHistory && history.lossHistory.length > 0) {
        const lastValid = history.lossHistory.filter(h => h.loss > 0).pop();
        if (lastValid) finalLoss = lastValid.loss;
      }

      TrainingHistory.updateOne(
        { jobId, ownerId },
        {
          status: data.status,
          completedAt: new Date(),
          trainingDuration: Math.max(0, Date.now() - new Date(history.startedAt).getTime()),
          finalMetrics: {
            loss: finalLoss,
            eval_loss: typeof workerMetrics.eval_loss === 'number' ? workerMetrics.eval_loss : 0,
            accuracy: typeof workerMetrics.accuracy === 'number' ? workerMetrics.accuracy : 0,
            vram: typeof workerMetrics.vram === 'number' ? workerMetrics.vram : 0,
            gpu_util: typeof workerMetrics.gpu_util === 'number' ? workerMetrics.gpu_util : 0,
          },
          ...(data.latest_checkpoint ? { latest_checkpoint_file_id: data.latest_checkpoint } : {})
        }
      ).catch(err => console.error('[Backend] Failed to update final status in DB:', err));
      workerManager.decrementJobs(workerUrl);
    }
    // --- END DB SYNC ---

    // Khi worker mất job nhưng Mongo còn audit → trả kèm để UI vẫn xem được log
    if ((!Array.isArray(data.logs) || data.logs.length === 0) && Array.isArray(history.trainLogs) && history.trainLogs.length > 0) {
      data.logs = history.trainLogs;
      data.from_mongo_audit = true;
    }
    if (!data.effective_config && history.effectiveConfig) {
      data.effective_config = history.effectiveConfig;
    }
    if (!data.error && history.lastError) data.error = history.lastError;
    if (!data.technical_error && history.technicalError) data.technical_error = history.technicalError;

    return res.status(response.status).json(data);
  } catch (err: any) {
    // Worker unreachable: vẫn cố trả audit đã lưu trên Mongo
    try {
      const ownerId = getAuthUserId(req);
      const { jobId } = req.params;
      if (ownerId && jobId) {
        const history = await TrainingHistory.findOne({ jobId, ownerId }).lean();
        if (history && Array.isArray((history as any).trainLogs) && (history as any).trainLogs.length > 0) {
          return res.status(200).json({
            status: (history as any).status || 'ERROR',
            logs: (history as any).trainLogs,
            effective_config: (history as any).effectiveConfig,
            error: (history as any).lastError || err.message,
            technical_error: (history as any).technicalError,
            from_mongo_audit: true,
          });
        }
      }
    } catch { /* ignore fallback errors */ }
    return res.status(500).json({ error: err.message || 'Failed to get training status' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/train/stream/:jobId
// SSE — polls GPU Service every 1 s and pushes data to the frontend
// ---------------------------------------------------------------------------
export const streamTrainingStatus = async (req: Request, res: Response) => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { jobId } = req.params;

  // Guard: stop immediately if jobId is invalid — prevents /status/null spam
  if (!jobId || jobId === 'null' || jobId === 'undefined') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Invalid jobId' })}\n\n`);
    res.end();
    return;
  }

  // Get worker URL from DB BEFORE sending headers
  const history = await TrainingHistory.findOne({ jobId, ownerId });
  if (!history) {
    res.status(404).json({ error: 'Training job not found' });
    return;
  }
  const workerUrl = history?.workerUrl || workerManager.getUrls()[0];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const intervalId = setInterval(async () => {
    try {
      let data: any;
      try {
        const response = await fetch(`${workerUrl}/api/train/status/${jobId}`, {
          headers: GPU_TUNNEL_HEADERS
        });

        if (!response.ok && response.status !== 404) {
          throw new Error(`Worker returned HTTP ${response.status}`);
        }
        data = await response.json();
      } catch (fetchErr: any) {
        console.warn(`[Backend] Failed to fetch status from worker: ${fetchErr.message}`);
        data = { status: 'NOT_FOUND', message: 'Worker is unreachable or returned invalid response' };
      }

      if (data.status === 'NOT_FOUND') {
        const jobAgeMs = Date.now() - new Date(history.startedAt).getTime();
        if (jobAgeMs > 15000) {
          data.status = 'ERROR';
          data.logs = ['[System] Lỗi: Kết nối huấn luyện bị mất. Trạng thái công việc không tìm thấy trên GPU Worker (có thể Worker đã bị khởi động lại hoặc ngắt kết nối).'];
        } else {
          data.status = 'QUEUED';
        }
      }

      // Update DB status in real-time to keep History and Dashboard in sync
      if (data.status) {
        TrainingHistory.updateOne(
          { jobId, ownerId },
          { status: data.status }
        ).catch(err => console.error('[Backend] Failed to update status in DB during stream:', err));
      }

      // Sync bản sao local để lần lặp sau chỉ diff phần mới (stream giữ doc trong RAM).
      const auditRaw = persistTrainAudit(jobId, ownerId, data, history);
      if (Array.isArray(auditRaw.trainLogs)) history.trainLogs = auditRaw.trainLogs as string[];
      if (typeof auditRaw.lastError === 'string') history.lastError = auditRaw.lastError;
      if (typeof auditRaw.progress === 'number') history.progress = auditRaw.progress;
      if (auditRaw.lastMetricsAt instanceof Date) history.lastMetricsAt = auditRaw.lastMetricsAt;

      // IF latest_checkpoint exists, update the DB so we can resume later
      if (data.latest_checkpoint || (data.metrics && (typeof data.metrics.loss === 'number' || typeof data.metrics.eval_loss === 'number'))) {
        const updateFields: any = {};
        if (data.latest_checkpoint) {
          updateFields.latest_checkpoint_file_id = data.latest_checkpoint;
        }

        const pushFields: any = {};
        if (data.metrics && typeof data.metrics.loss === 'number') {
          pushFields.lossHistory = { progress: data.progress || 0, loss: data.metrics.loss };
        }
        if (data.metrics && typeof data.metrics.eval_loss === 'number') {
          pushFields.evalLossHistory = { progress: data.progress || 0, loss: data.metrics.eval_loss };
        }

        TrainingHistory.updateOne(
          { jobId, ownerId },
          {
            ...updateFields,
            ...(Object.keys(pushFields).length > 0 ? { $push: pushFields } : {})
          }
        ).catch(err => console.error('[Backend] Failed to update history during stream:', err));
      }

      res.write(`data: ${JSON.stringify(data)}\n\n`);

      // Do not close the stream on UNKNOWN, as it might be a transient state
      // (e.g., job not yet registered by the GPU service). Only close on definitive end-states.
      if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(data.status)) {
        const workerMetrics = data.metrics || {};

        // Lấy loss từ data hoặc metrics, nhưng phải khác 0
        // Nếu bằng 0, ta sẽ cố gắng tìm trong history hoặc giữ nguyên giá trị cũ
        let finalLoss = typeof data.loss === 'number' && data.loss > 0 ? data.loss : (typeof workerMetrics.loss === 'number' ? workerMetrics.loss : 0);

        // Nếu vẫn bằng 0 (do Colab reset ở step cuối), thử lấy từ history đã lưu
        if (finalLoss === 0 && history && history.lossHistory && history.lossHistory.length > 0) {
          const lastValid = history.lossHistory.filter(h => h.loss > 0).pop();
          if (lastValid) finalLoss = lastValid.loss;
        }

        const finalMetrics = {
          loss: finalLoss,
          eval_loss: typeof workerMetrics.eval_loss === 'number' ? workerMetrics.eval_loss : 0,
          accuracy: typeof workerMetrics.accuracy === 'number' ? workerMetrics.accuracy : 0,
          vram: typeof workerMetrics.vram === 'number' ? workerMetrics.vram : 0,
          gpu_util: typeof workerMetrics.gpu_util === 'number' ? workerMetrics.gpu_util : 0,
        };

        // Auto-update MongoDB so History screen shows correct status
        TrainingHistory.updateOne(
          { jobId, ownerId },
          {
            status: data.status,
            completedAt: new Date(),
            trainingDuration: Math.max(0, Date.now() - new Date(history.startedAt).getTime()),
            finalMetrics: finalMetrics,
            ...(data.latest_checkpoint ? { latest_checkpoint_file_id: data.latest_checkpoint } : {})
          }
        ).catch(err => console.error('[Backend] Failed to update final status in DB:', err));

        workerManager.decrementJobs(workerUrl);
        clearInterval(intervalId);
        res.write(`event: end\ndata: ${JSON.stringify(data)}\n\n`);
        res.end();
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      workerManager.decrementJobs(workerUrl);
      clearInterval(intervalId);
      res.end();
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(intervalId);
  });
};

// ---------------------------------------------------------------------------
// POST /api/train/stop/:jobId
// ---------------------------------------------------------------------------
export const stopTraining = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;

    // Get worker URL from DB
    const history = await TrainingHistory.findOne({ jobId, ownerId });
    if (!history) {
      return res.status(404).json({ error: 'Training job not found' });
    }
    const workerUrl = history?.workerUrl || workerManager.getUrls()[0];

    const response = await fetch(`${workerUrl}/api/train/stop/${jobId}`, {
      method: 'POST',
      headers: GPU_TUNNEL_HEADERS
    });
    const data = await response.json();

    await TrainingHistory.updateOne(
      { jobId, ownerId },
      {
        status: 'STOPPED',
        completedAt: new Date(),
      }
    );

    workerManager.decrementJobs(workerUrl);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to stop training' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/system/resources
// ---------------------------------------------------------------------------
export const getSystemResources = async (_req: Request, res: Response) => {
  try {
    const urls = workerManager.getUrls();
    console.log('[getSystemResources] Worker URLs:', urls);
    const resourcePromises = urls.map(async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout (increased for slow localtunnel/ngrok)

      try {
        const response = await fetch(`${url}/api/system/resources`, {
          headers: GPU_TUNNEL_HEADERS,
          signal: controller.signal as any
        });
        const text = await response.text();
        console.log(`[getSystemResources] Raw response from ${url}: status=${response.status}, body=${text.slice(0, 300)}`);
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`[getSystemResources] Non-JSON response from ${url}:`, text.slice(0, 200));
          return { url, error: 'Worker returned non-JSON response' };
        }
        return { url, status: 'online', ...data };
      } catch (err: any) {
        console.error(`[getSystemResources] Fetch error from ${url}:`, err.message);
        return { url, error: 'Worker unreachable' };
      } finally {
        clearTimeout(timeoutId);
      }
    });

    const results: any[] = await Promise.all(resourcePromises);
    console.log('[getSystemResources] Final results:', JSON.stringify(results));

    // Aggregated resources for backward compatibility if needed, 
    // or just return the list of workers
    return res.json({
      workers: results,
      // Aggregated for old UI
      vram_used_mb: results.reduce((acc, curr) => acc + (curr.vram_used_mb || 0), 0),
      vram_total_mb: results.reduce((acc, curr) => acc + (curr.vram_total_mb || 0), 0),
      gpu_util: results.length > 0 ? results.reduce((acc, curr) => acc + (curr.gpu_util || 0), 0) / results.length : 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get system resources' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/train/resume/:jobId
// ---------------------------------------------------------------------------
export const resumeTraining = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.params;

    // 1. Fetch Job from MongoDB
    const history = await TrainingHistory.findOne({ jobId, ownerId });
    if (!history) {
      return res.status(404).json({ error: 'Job not found in database' });
    }

    const snapshotConfig = history.config_snapshot || {};
    const resumeHfToken =
      (typeof snapshotConfig.hf_token === 'string' ? snapshotConfig.hf_token : '') ||
      (typeof history.hfToken === 'string' ? history.hfToken : '');

    // Prefer the checkpoint on the worker's persistent volume. This survives a
    // container/GPU-process restart and avoids downloading a remote checkpoint.
    let hasWorkerCheckpoint = false;
    if (history.workerUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const probeResponse = await fetch(`${history.workerUrl}/api/train/checkpoint/${jobId}`, {
          headers: GPU_TUNNEL_HEADERS,
          signal: controller.signal as any,
        });
        clearTimeout(timeout);
        const probeData: any = await probeResponse.json();
        hasWorkerCheckpoint = probeResponse.ok && probeData.available === true;
      } catch (error) {
        console.warn(`[Backend] Worker checkpoint probe failed for ${jobId}:`, error);
      }
    }

    // Fallback order: Google Drive, then Hugging Face Hub.
    const checkpointId = hasWorkerCheckpoint ? jobId : history.latest_checkpoint_file_id || history.hfRepoId || null;
    const checkpointSource = hasWorkerCheckpoint
      ? 'worker'
      : history.latest_checkpoint_file_id
        ? 'drive'
        : history.hfRepoId && history.pushToHub
          ? 'hf'
          : null;

    if (!checkpointId) {
      return res.status(400).json({
        error: 'Cannot resume: No checkpoint found on the GPU worker, Hugging Face Hub, or Google Drive.'
      });
    }

    if (checkpointSource === 'hf') {
      const probe = await hfRepoCheckpointProbe(checkpointId, resumeHfToken);
      if (probe.result === 'not_found') {
        return res.status(400).json({
          error:
            'Cannot resume: Hugging Face repo not found (or not accessible). Check hf_repo_id and token permissions.',
        });
      }
      if (probe.result === 'no') {
        return res.status(400).json({
          error:
            'Cannot resume: No checkpoint found in Hugging Face repo yet (checkpoint-* or last-checkpoint). If you stopped before the first save, it will restart from step 1. Wait until a checkpoint is saved (e.g. after save_steps) then try Resume again.'
        });
      }
    }

    console.log(`[Backend] Resuming job ${jobId} from checkpoint [${checkpointSource}]: ${checkpointId}`);

    // 2. Reconstruct JSON config from stored snapshot
    const resumeConfig: any = {
      ...snapshotConfig,
      job_id: jobId,
      // Checkpoint reference: Drive file ID or HF repo ID
      checkpoint_file_id: checkpointSource === 'drive' ? checkpointId : undefined,
      checkpoint_hf_repo: checkpointSource === 'hf' ? checkpointId : undefined,
      checkpoint_source: checkpointSource,
      // Drive credentials (still included even if not used, for future saves)
      drive_folder_id: GOOGLE_DRIVE_FOLDER_ID,
      service_account: parsedGoogleCredentials,
    };

    // 3. Resolve dataset
    let datasetStream: ReturnType<typeof fs.createReadStream> | undefined;
    let datasetKnownLength = 0;
    let datasetFilename = '';

    if (history.datasetPath && fs.existsSync(history.datasetPath)) {
      const stats = fs.statSync(history.datasetPath);
      datasetStream = fs.createReadStream(history.datasetPath);
      datasetKnownLength = stats.size;
      datasetFilename = history.datasetName || path.basename(history.datasetPath);
      console.log(`[Backend] Re-attaching persistent dataset for resume: ${history.datasetPath}`);
    } else if (history.datasetStorageKey && storage.isEnabled()) {
      // Durable path: the local copy may be gone after a restart, but the
      // dataset still lives in object storage. Pull it back to a temp file.
      try {
        const tempPath = await storage.downloadToTemp(history.datasetStorageKey);
        const stats = fs.statSync(tempPath);
        datasetStream = fs.createReadStream(tempPath);
        datasetKnownLength = stats.size;
        datasetFilename = history.datasetName || path.basename(history.datasetStorageKey);
        datasetStream.on('close', () => fs.unlink(tempPath, () => { }));
        console.log(`[Backend] Re-attaching dataset from object storage for resume: ${history.datasetStorageKey}`);
      } catch (err) {
        console.warn(`[Backend] Failed to fetch dataset from storage for resume: ${history.datasetStorageKey}`, err);
      }
    } else if (history.datasetSource === 'hub') {
      resumeConfig.dataset_hf_id = history.datasetName || snapshotConfig.dataset;
    } else {
      console.warn(`[Backend] Local dataset file missing for resume: ${history.datasetPath}`);
    }

    // Build form AFTER config is fully populated
    const form = new FormData();
    form.append('config', JSON.stringify(resumeConfig));

    if (datasetStream) {
      form.append('file', datasetStream, {
        filename: datasetFilename,
        knownLength: datasetKnownLength,
      });
    }

    // 4. Forward to GPU Service
    const workerUrl = checkpointSource === 'worker' && history.workerUrl
      ? history.workerUrl
      : workerManager.getNextWorker();
    console.log(`[Backend] Forwarding to GPU service: ${workerUrl}/api/train/start`);
    workerManager.incrementJobs(workerUrl);

    const gpuResponse = await fetchWithForm(`${workerUrl}/api/train/start`, form);

    const responseText = await gpuResponse.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: 'GPU service returned non-JSON response on resume',
        raw: responseText.slice(0, 500),
      });
    }

    if (gpuResponse.ok) {
      await TrainingHistory.updateOne({ jobId, ownerId }, {
        status: 'RUNNING',
        workerUrl: workerUrl
      });
    }

    return res.status(gpuResponse.status).json(data);
  } catch (err: any) {
    console.error('[Backend] resumeTraining error:', err);
    return res.status(500).json({ error: err.message || 'Failed to resume training' });
  }
};

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = user.userId;
    const role = user.role;

    // Chat sessions count (user-specific)
    const chatSessionsCount = await ChatSession.countDocuments({ ownerId: userId });

    // Model registry count (total)
    const modelRegistryCount = await ModelRegistry.countDocuments({});

    // Model evaluation count (total COMPLETED)
    const modelEvaluationCount = await ModelEvaluation.countDocuments({ status: 'COMPLETED' });

    let extraStats: any = {};

    if (role === 'admin' || role === 'supervisor') {
      // 1. Total datasets (projects) count
      const datasetCount = await DataPrepProject.countDocuments({});
      // 2. Active training jobs count
      const activeJobsCount = await TrainingHistory.countDocuments({
        status: { $in: ['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'] }
      });
      // 3. Staff count
      const staffCount = await User.countDocuments({ role: 'staff' });
      // 4. Submissions status
      const needsReview = await DatasetAssignmentSubmission.countDocuments({ status: 'submitted' });
      const completed = await DatasetAssignmentSubmission.countDocuments({ status: 'approved' });

      extraStats = {
        datasetCount,
        activeJobsCount,
        staffCount,
        needsReview,
        completed
      };
    } else if (role === 'staff') {
      // For staff, count tasks they are assigned
      // Distinct dataset versions assigned to this staff member
      const assignedVersions = await DatasetSampleAssignment.distinct('datasetVersionId', { assigneeId: userId });
      const totalTasks = assignedVersions.length;

      // Submitted or approved tasks
      const submitted = await DatasetAssignmentSubmission.countDocuments({
        assigneeId: userId,
        status: { $in: ['submitted', 'approved'] }
      });

      // Tasks in progress (assigned versions that have not been submitted/approved)
      const inProgress = Math.max(0, totalTasks - submitted);

      extraStats = {
        totalTasks,
        inProgress,
        submitted
      };
    }

    return res.json({
      chatSessionsCount,
      modelRegistryCount,
      modelEvaluationCount,
      ...extraStats
    });
  } catch (err: any) {
    console.error('[Backend] getDashboardStats error:', err);
    return res.status(500).json({ error: err.message || 'Failed to get dashboard stats' });
  }
};

// ---------------------------------------------------------------------------
// POST /api/train/download-cloud
// Downloads a dataset from Google Drive or custom URL, saving it locally
// and returning a statistics and preview analysis.
// ---------------------------------------------------------------------------
export const downloadCloudDataset = async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid URL' });
    }

    console.log(`[Backend] Downloading dataset from Cloud URL: ${url}`);

    // 1. Convert Google Drive link if applicable
    let downloadUrl = url;
    let fileIdMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);

    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      downloadUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
      console.log(`[Backend] Detected Google Drive URL. Converted to: ${downloadUrl}`);
    }

    // 2. Fetch the file
    const downloadRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!downloadRes.ok) {
      return res.status(400).json({
        error: `Failed to download file: Status ${downloadRes.status} ${downloadRes.statusText}`
      });
    }

    // Determine filename
    let filename = 'cloud_dataset.json';
    const contentDisposition = downloadRes.headers.get('content-disposition');
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch) filename = filenameMatch[1];
    } else {
      // Parse from URL
      try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastSegment && lastSegment.includes('.')) {
          filename = lastSegment;
        }
      } catch { }
    }

    // Ensure uploads/cloud_datasets directory exists
    const persistentDir = path.join(process.cwd(), 'uploads', 'cloud_datasets');
    if (!fs.existsSync(persistentDir)) {
      fs.mkdirSync(persistentDir, { recursive: true });
    }

    const fileUuid = uuidv4();
    const ext = filename.split('.').pop()?.toLowerCase() || 'json';
    const savedPath = path.join(persistentDir, `${fileUuid}.${ext}`);

    // Buffer the file content
    const buffer = await downloadRes.buffer();
    fs.writeFileSync(savedPath, buffer);
    const size = buffer.length;

    console.log(`[Backend] Cloud dataset saved to: ${savedPath} (${size} bytes)`);

    // 3. Parse content
    const text = buffer.toString('utf-8');
    let records: any[] = [];
    if (ext === 'json') {
      try {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } catch (jsonErr: any) {
        // Fallback to JSONL
        try {
          records = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
        } catch {
          throw new Error('Failed to parse JSON: ' + jsonErr.message);
        }
      }
    } else if (ext === 'jsonl') {
      records = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
    } else if (ext === 'csv') {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        records = lines.slice(1).map(line => {
          const values: string[] = [];
          let insideQuote = false;
          let currentVal = '';
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
              values.push(currentVal.trim().replace(/^"|"$/g, ''));
              currentVal = '';
            } else {
              currentVal += char;
            }
          }
          values.push(currentVal.trim().replace(/^"|"$/g, ''));

          const obj: any = {};
          headers.forEach((h, idx) => {
            obj[h] = values[idx] || '';
          });
          return obj;
        });
      }
    } else {
      throw new Error(`Unsupported file extension: .${ext}. Only .json, .jsonl, and .csv are supported.`);
    }

    if (records.length === 0) {
      throw new Error('Parsed dataset contains 0 records.');
    }

    // Extract headers
    const headers = (records.length > 0 && typeof records[0] === 'object' && !Array.isArray(records[0]))
      ? Object.keys(records[0])
      : [];

    const detectColumn = (headers: string[]): string | null => {
      const matchKeywords = ['message', 'messages', 'text', 'conversations', 'instruction', 'prompt'];
      for (const kw of matchKeywords) {
        const found = headers.find(h => h.toLowerCase() === kw);
        if (found) return found;
      }
      return headers[0] || null;
    };

    const detected = detectColumn(headers);
    const formatRowPreview = (r: any) => {
      if (r && typeof r === 'object') {
        if (Array.isArray(r.messages)) {
          const systemMsg = r.messages.find((m: any) => m.role === 'system')?.content || '';
          const userMsg = r.messages.find((m: any) => m.role === 'user')?.content || '';
          const assistantMsg = r.messages.find((m: any) => m.role === 'assistant')?.content || '';
          return { instruction: systemMsg || userMsg, input: systemMsg ? userMsg : '', output: assistantMsg };
        }
        return {
          instruction: r.instruction || r.prompt || r.text || r.message || JSON.stringify(r),
          input: r.input || '',
          output: r.output || r.response || r.target || ''
        };
      }
      return { instruction: String(r), input: '', output: '' };
    };

    const previewRows = records.slice(0, 5).map(r => {
      if (detected && r[detected]) {
        const val = r[detected];
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            return formatRowPreview(parsed);
          } catch {
            return formatRowPreview(r);
          }
        }
        if (Array.isArray(val)) {
          return formatRowPreview(val);
        }
      }
      return formatRowPreview(r);
    });

    const totalRecords = records.length;
    const totalTokens = Math.round(text.length / 4);

    return res.json({
      tempFilePath: savedPath,
      filename,
      size,
      totalRecords,
      totalTokens,
      headers,
      previewRows,
      columnMapping: detected || 'text'
    });
  } catch (err: any) {
    console.error('[Backend] downloadCloudDataset error:', err);
    return res.status(500).json({ error: err.message || 'Failed to download cloud file' });
  }
};
