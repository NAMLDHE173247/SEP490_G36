import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingHistory extends Document {
  ownerId: string;
  jobId: string;
  projectName: string;
  baseModel: string;
  systemPrompt?: string;
  systemPromptVersion?: string;
  datasetVersionId?: mongoose.Types.ObjectId | string;
  datasetSource: string;       // 'local' | 'hub'
  datasetName: string;         // filename hoặc HuggingFace Hub ID
  columnMapping: string;
  parameters: {
    epochs: number;
    batchSize: number;
    blockSize: number;
    learningRate: number;
    modelMaxLength: number;
    seed: number;                       // Random seed
    optim: string;                      // Optimizer type
    warmup_steps: number;               // LR warmup steps
    random_state: number;               // Random state seed
    lr_scheduler_type: string;          // LR scheduler type
    early_stopping_loss: number;        // Stop if loss < this
    use_rslora?: boolean;               // Rank-stabilized LoRA
    max_grad_norm?: number;             // Ngưỡng clip gradient
    dataloader_num_workers?: number;    // Số worker nạp dữ liệu
    weight_decay: number;               // Weight decay for AdamW
    r: number;                          // LoRA attention dimension
    chat_template_jinja?: string;       // Jinja dán tay (khi paste)
    save_steps?: number;                // Bỏ trống = bằng eval_steps
    lora_dropout: number;               // Dropout probability for LoRA
    gradient_accumulation_steps: number; // Gradient accumulation steps
    // Knob chất lượng nâng cao — tuỳ chọn, chỉ ghi khi người dùng đặt rõ
    warmup_ratio?: number;              // Warmup theo tỉ lệ tổng số step
    early_stopping_patience: number;    // Steps to wait for loss decrease
    lora_alpha: number;                 // Alpha parameter for LoRA scaling
    enable_thinking?: boolean;          // Train với reasoning/think traces
    eval_steps?: number;                // Bỏ trống = tự suy theo cỡ dataset
    neftune_noise_alpha?: number;       // Nhiễu embedding lúc train (0 = tắt)
    lora_target_modules?: string;       // Preset hoặc danh sách module áp LoRA
    group_by_length?: boolean;          // Gom sample cùng độ dài để bớt padding
    early_stopping_min_delta?: number;  // Mức cải thiện tối thiểu để reset patience
    chat_template?: string;             // Override template (auto|native|paste|gemma-4|...)
  };
  hfToken: string;
  hfRepoId: string;
  pushToHub: boolean;
  status: string;              // 'COMPLETED' | 'STOPPED' | 'FAILED'
  finalMetrics?: {
    loss: number;
    vram: number;
    accuracy: number;
    gpu_util: number;
  };
  startedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  trainingDuration: number;    // thời gian thực tế (milliseconds)
  lossHistory?: { progress: number; loss: number; timestamp?: Date }[];
  evalLossHistory?: { progress: number; loss: number; timestamp?: Date }[];
  lastLogLine?: string;         // e.g. "Epoch 3/3 [Step 150/150] loss: 0.1693 - acc: 94.36%"

  // Model Evaluation
  pinnedEvalId?: string;       // modelEvalId của eval được chọn làm official (hiển thị trên leaderboard)

  // Added for Resume Checkpoint
  workerUrl?: string;
  datasetPath?: string;
  config_snapshot?: any;
  drive_folder_id?: string;
  latest_checkpoint_file_id?: string;
  datasetFileId?: string; // ID từ Multer hoặc File System
  datasetUrl?: string; // Public URL của dataset trên object storage
  datasetStorageKey?: string; // Object key trong MinIO/CDN (bền vững qua restart)

  // Actual stats processed
  totalTokens?: number;
  totalRecords?: number;

  // Audit — xem lại log/lỗi trên UI khi GPU worker đã tắt
  trainLogs?: string[];
  auditEvents?: {
    ts: Date;
    level: 'info' | 'warn' | 'error';
    source: string;
    code?: string;
    message: string;
  }[];
  effectiveConfig?: any;
  lastError?: string;
  technicalError?: string;

  // Monitor — phát hiện job treo + lịch sử tài nguyên
  progress?: number;            // % tiến độ gần nhất từ GPU
  lastProgressAt?: Date;        // lần cuối thấy log/progress mới (heartbeat)
  lastMetricsAt?: Date;         // throttle snapshot metricsHistory
  stallNotifiedAt?: Date;       // dedupe cảnh báo treo
  metricsHistory?: {
    ts: Date;
    loss?: number;
    eval_loss?: number;
    vram?: number;
    gpu_util?: number;
    progress?: number;
  }[];
}

const TrainingHistorySchema = new Schema<ITrainingHistory>(
  {
    systemPrompt: { type: String, default: '' },
    projectName: { type: String, required: true },
    datasetName: { type: String, required: true },
    datasetSource: { type: String, required: true },
    columnMapping: { type: String, default: 'text' },
    systemPromptVersion: { type: String, default: '' },
    baseModel: { type: String, required: true, index: true },
    jobId: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, ref: 'User', required: true, index: true },
    datasetVersionId: { type: Schema.Types.ObjectId, ref: 'DatasetVersion' },
    parameters: {
      r: { type: Number, default: 8 },
      seed: { type: Number, default: 3407 },
      epochs: { type: Number, required: true },
      lora_alpha: { type: Number, default: 8 },
      lora_dropout: { type: Number, default: 0 },
      warmup_steps: { type: Number, default: 5 },
      batchSize: { type: Number, required: true },
      blockSize: { type: Number, required: true },
      random_state: { type: Number, default: 3407 },
      weight_decay: { type: Number, default: 0.01 },
      learningRate: { type: Number, required: true },
      modelMaxLength: { type: Number, required: true },
      gradient_accumulation_steps: { type: Number, default: 4 },
      // Không đặt default cho early stopping: giá trị mặc định thật nằm ở
      // gpu-service, ghi sẵn 0.5/100 ở đây làm lịch sử job hiển thị sai.
      eval_steps: { type: Number },
      save_steps: { type: Number },
      use_rslora: { type: Boolean },
      warmup_ratio: { type: Number },
      max_grad_norm: { type: Number },
      chat_template: { type: String },
      group_by_length: { type: Boolean },
      enable_thinking: { type: Boolean },
      early_stopping_loss: { type: Number },
      lora_target_modules: { type: String },
      neftune_noise_alpha: { type: Number },
      chat_template_jinja: { type: String },
      dataloader_num_workers: { type: Number },
      early_stopping_patience: { type: Number },
      early_stopping_min_delta: { type: Number },
      optim: { type: String, default: 'adamw_8bit' },
      lr_scheduler_type: { type: String, default: 'linear' },
    },
    pushToHub: { type: Boolean, default: false },
    hfRepoId: { type: String, default: '' },
    hfToken: { type: String, default: '' },
    status: { type: String, required: true },
    finalMetrics: {
      loss: { type: Number },
      eval_loss: { type: Number },
      accuracy: { type: Number },
      vram: { type: Number },
      gpu_util: { type: Number },
    },
    lastLogLine: { type: String, default: '' },
    trainingDuration: { type: Number, default: 0 },  // ms
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    lossHistory: [
      {
        progress: { type: Number },
        loss: { type: Number },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    evalLossHistory: [
      {
        progress: { type: Number },
        loss: { type: Number },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Model Evaluation
    pinnedEvalId: { type: String, default: null },

    // Added for Resume Checkpoint
    workerUrl: { type: String },
    datasetUrl: { type: String },
    datasetPath: { type: String },
    datasetFileId: { type: String },
    drive_folder_id: { type: String },
    datasetStorageKey: { type: String },
    latest_checkpoint_file_id: { type: String },
    config_snapshot: { type: Schema.Types.Mixed }, // Store arbitrary JSON config

    // Actual stats processed
    totalTokens: { type: Number, default: 0 },
    totalRecords: { type: Number, default: 0 },

    // Audit trail (đồng bộ từ GPU status/stream — đọc lại không cần SSH)
    trainLogs: { type: [String], default: [] },
    auditEvents: [
      {
        ts: { type: Date, default: Date.now },
        level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
        source: { type: String, default: 'gpu-train' },
        code: { type: String },
        message: { type: String, required: true },
      },
    ],
    effectiveConfig: { type: Schema.Types.Mixed },
    lastError: { type: String, default: '' },
    technicalError: { type: String, default: '' },

    // Monitor
    progress: { type: Number },
    lastProgressAt: { type: Date },
    lastMetricsAt: { type: Date },
    stallNotifiedAt: { type: Date },
    metricsHistory: [
      {
        ts: { type: Date, default: Date.now },
        loss: { type: Number },
        eval_loss: { type: Number },
        vram: { type: Number },
        gpu_util: { type: Number },
        progress: { type: Number },
      },
    ],
  },
  {
    timestamps: true, // tự tạo createdAt, updatedAt
  }
);

export const TrainingHistory = mongoose.model<ITrainingHistory>(
  'TrainingHistory',
  TrainingHistorySchema
);
