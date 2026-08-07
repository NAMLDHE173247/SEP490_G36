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
    batchSize: number;
    epochs: number;
    learningRate: number;
    blockSize: number;
    modelMaxLength: number;
    r: number;                          // LoRA attention dimension
    lora_alpha: number;                 // Alpha parameter for LoRA scaling
    lora_dropout: number;               // Dropout probability for LoRA
    random_state: number;               // Random state seed
    gradient_accumulation_steps: number; // Gradient accumulation steps
    warmup_steps: number;               // LR warmup steps
    weight_decay: number;               // Weight decay for AdamW
    seed: number;                       // Random seed
    early_stopping_loss: number;        // Stop if loss < this
    early_stopping_patience: number;    // Steps to wait for loss decrease
    optim: string;                      // Optimizer type
    lr_scheduler_type: string;          // LR scheduler type
    // Knob chất lượng nâng cao — tuỳ chọn, chỉ ghi khi người dùng đặt rõ
    early_stopping_min_delta?: number;  // Mức cải thiện tối thiểu để reset patience
    lora_target_modules?: string;       // Preset hoặc danh sách module áp LoRA
    use_rslora?: boolean;               // Rank-stabilized LoRA
    neftune_noise_alpha?: number;       // Nhiễu embedding lúc train (0 = tắt)
    max_grad_norm?: number;             // Ngưỡng clip gradient
    warmup_ratio?: number;              // Warmup theo tỉ lệ tổng số step
    group_by_length?: boolean;          // Gom sample cùng độ dài để bớt padding
    eval_steps?: number;                // Bỏ trống = tự suy theo cỡ dataset
    save_steps?: number;                // Bỏ trống = bằng eval_steps
    dataloader_num_workers?: number;    // Số worker nạp dữ liệu
    enable_thinking?: boolean;          // Train với reasoning/think traces
    chat_template?: string;             // Override template (auto|native|gemma-4|...)
  };
  pushToHub: boolean;
  hfRepoId: string;
  hfToken: string;
  status: string;              // 'COMPLETED' | 'STOPPED' | 'FAILED'
  finalMetrics?: {
    loss: number;
    accuracy: number;
    vram: number;
    gpu_util: number;
  };
  lastLogLine?: string;         // e.g. "Epoch 3/3 [Step 150/150] loss: 0.1693 - acc: 94.36%"
  trainingDuration: number;    // thời gian thực tế (milliseconds)
  startedAt: Date;
  completedAt?: Date;
  lossHistory?: { progress: number; loss: number; timestamp?: Date }[];
  evalLossHistory?: { progress: number; loss: number; timestamp?: Date }[];
  createdAt: Date;
  updatedAt: Date;

  // Model Evaluation
  pinnedEvalId?: string;       // modelEvalId của eval được chọn làm official (hiển thị trên leaderboard)

  // Added for Resume Checkpoint
  latest_checkpoint_file_id?: string;
  drive_folder_id?: string;
  config_snapshot?: any;
  datasetPath?: string;
  datasetFileId?: string; // ID từ Multer hoặc File System
  datasetStorageKey?: string; // Object key trong MinIO/CDN (bền vững qua restart)
  datasetUrl?: string; // Public URL của dataset trên object storage
  workerUrl?: string;

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
}

const TrainingHistorySchema = new Schema<ITrainingHistory>(
  {
    ownerId: { type: String, ref: 'User', required: true, index: true },
    jobId: { type: String, required: true, unique: true, index: true },
    projectName: { type: String, required: true },
    baseModel: { type: String, required: true, index: true },
    systemPrompt: { type: String, default: '' },
    systemPromptVersion: { type: String, default: '' },
    datasetVersionId: { type: Schema.Types.ObjectId, ref: 'DatasetVersion' },
    datasetSource: { type: String, required: true },
    datasetName: { type: String, required: true },
    columnMapping: { type: String, default: 'text' },
    parameters: {
      batchSize: { type: Number, required: true },
      epochs: { type: Number, required: true },
      learningRate: { type: Number, required: true },
      blockSize: { type: Number, required: true },
      modelMaxLength: { type: Number, required: true },
      r: { type: Number, default: 8 },
      lora_alpha: { type: Number, default: 8 },
      lora_dropout: { type: Number, default: 0 },
      random_state: { type: Number, default: 3407 },
      gradient_accumulation_steps: { type: Number, default: 4 },
      warmup_steps: { type: Number, default: 5 },
      weight_decay: { type: Number, default: 0.01 },
      seed: { type: Number, default: 3407 },
      // Không đặt default cho early stopping: giá trị mặc định thật nằm ở
      // gpu-service, ghi sẵn 0.5/100 ở đây làm lịch sử job hiển thị sai.
      early_stopping_loss: { type: Number },
      early_stopping_patience: { type: Number },
      optim: { type: String, default: 'adamw_8bit' },
      lr_scheduler_type: { type: String, default: 'linear' },
      early_stopping_min_delta: { type: Number },
      lora_target_modules: { type: String },
      use_rslora: { type: Boolean },
      neftune_noise_alpha: { type: Number },
      max_grad_norm: { type: Number },
      warmup_ratio: { type: Number },
      group_by_length: { type: Boolean },
      eval_steps: { type: Number },
      save_steps: { type: Number },
      dataloader_num_workers: { type: Number },
      enable_thinking: { type: Boolean },
      chat_template: { type: String },
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
  },
  {
    timestamps: true, // tự tạo createdAt, updatedAt
  }
);

export const TrainingHistory = mongoose.model<ITrainingHistory>(
  'TrainingHistory',
  TrainingHistorySchema
);
