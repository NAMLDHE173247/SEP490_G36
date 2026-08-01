import mongoose, { Schema, Document } from 'mongoose';

// Per-conversation result (1 entry = 1 conversation được replay + chấm)
export interface IEvalResult {
  item_id?: string;
  conv_index: number;
  num_turns: number;
  avg_latency_ms: number;
  subject?: string;
  selected_model?: string;
  route_strategy?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  generation_status?: string;
  failure_type?: string | null;
  first_attempt_failed?: boolean;
  output_limit_reached?: boolean;
  telemetry?: Record<string, any>;
  prompt_trace?: Record<string, any>;
  reference_trace?: Record<string, any>;
  reference_answer?: string;
  gold_key_points?: string[];
  judge_status?: string;
  judge_response_id?: string;
  effective_judge_model?: string;
  judge_error?: string;
  judge_router_metadata?: Record<string, any>;
  judge_blinded?: boolean;
  judge_randomization_seed?: number;
  replay_turns?: {               // ← thêm
    user: string;
    model: string;
    latency_ms: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  }[];
  criteria_scores: {
    A1: number; A2: number; A3: number;
    B1: number; B2: number;
    C1: number; C2: number; C3: number;
    D1: number; D2: number;
  };
  criteria_reasons: Record<string, string>;
  group_scores: {
    knowledge?: number;
    socratic?: number;
    answer_withholding_violation?: boolean;
    secondary?: {
      grade_level: number;
      robustness: number;
      coherence: number;
      tone: number;
      hallucination: number;
    };
    operational?: { latency_score_exploratory: number };
    exploratory_overall?: number;
    // Deprecated A-B-C-D composite fields retained for legacy records/UI.
    group_a: number;
    group_b: number;
    group_c: number;
    group_d: number;
    overall: number;
    a1_hard_constraint_triggered: boolean;
  };
  non_scoring: {
    bleu: number;
    rouge_l: number;
    question_detection_rate: number;
  };
  confidence?: {
    overall: number;
    by_group: Record<string, number>;
    is_low: boolean;
  };
  human_review?: {
    verdict: 'agree' | 'disagree' | 'skip';
    note?: string;
    reviewer?: string;
    reviewed_at: Date;
    rubric_version?: string;
    human_scores?: Record<string, number>;
    human_reasons?: Record<string, string>;
    human_outcomes?: {
      knowledge_k: number;
      socratic_s_raw: number;
      socratic_s: number;
      a1_cap_applied: boolean;
    };
    ai_scores_snapshot?: Record<string, number>;
    conflict?: {
      has_conflict: boolean;
      severity: 'none' | 'minor' | 'major' | 'critical';
      criteria: string[];
      max_delta: number;
      summary: string;
      deltas: Record<string, number>;
    };
  };
}

export interface IEvaluation extends Document {
  ownerId: mongoose.Types.ObjectId;
  modelEvalId: string;
  jobId: string;
  status: string;
  evalMode: 'single' | 'paired';
  ftModelRepo?: string;
  baseModelRepo?: string;
  totalConversations: number;
  validConversations: number;
  results: IEvalResult[];           // FT results
  baseResults?: IEvalResult[];      // Base results (paired only)
  summary: Record<string, any>;     // FT summary
  baseSummary?: Record<string, any>;// Base summary (paired only)
  delta?: Record<string, any>;      // FT - Base delta (paired only)
  gpuResult?: Record<string, any>;
  judgeModel?: string;
  error?: string;
  failureStage?: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  flags?: string[];
  // Dataset & Prompt traceability
  systemPrompt?: string;
  systemPromptVersion?: string;
  systemPromptSource?: string;
  systemPromptHash?: string;
  datasetVersionId?: string;
  datasetVersionName?: string;
  datasetMetadata?: Record<string, any>;
  datasetFileHash?: string;
  datasetValidation?: Record<string, any>;
  protocolManifest?: Record<string, any>;
  environmentManifest?: Record<string, any>;
  loadMetrics?: Record<string, any>;
  researchStatistics?: Record<string, any>;
  adaptiveDiagnostic?: Record<string, any>;
  hypothesisDecisions?: Record<string, any>;
  pairIntegrity?: Record<string, any>;
  confirmatoryEligible?: boolean;
}

const EvaluationResultSchema = new Schema<IEvalResult>(
  {
    item_id: { type: String },
    conv_index: { type: Number },
    num_turns: { type: Number },
    avg_latency_ms: { type: Number },
    subject: { type: String },
    selected_model: { type: String },
    route_strategy: { type: String },
    input_tokens: { type: Number, default: 0 },
    output_tokens: { type: Number, default: 0 },
    total_tokens: { type: Number, default: 0 },
    generation_status: { type: String },
    failure_type: { type: String, default: null },
    first_attempt_failed: { type: Boolean, default: false },
    output_limit_reached: { type: Boolean, default: false },
    telemetry: { type: Schema.Types.Mixed, default: {} },
    prompt_trace: { type: Schema.Types.Mixed, default: {} },
    reference_trace: { type: Schema.Types.Mixed, default: {} },
    reference_answer: { type: String, default: '' },
    gold_key_points: { type: [String], default: [] },
    judge_status: { type: String },
    judge_response_id: { type: String },
    effective_judge_model: { type: String },
    judge_error: { type: String },
    judge_router_metadata: { type: Schema.Types.Mixed, default: null },
    judge_blinded: { type: Boolean, default: false },
    judge_randomization_seed: { type: Number },
    replay_turns: { type: Schema.Types.Mixed, default: [] },
    criteria_scores: { type: Schema.Types.Mixed, default: {} },
    criteria_reasons: { type: Schema.Types.Mixed, default: {} },
    group_scores: { type: Schema.Types.Mixed, default: {} },
    non_scoring: { type: Schema.Types.Mixed, default: {} },
    confidence: { type: Schema.Types.Mixed, default: null },
    human_review: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const EvaluationSchema = new Schema<IEvaluation>(
  {
    ownerId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    modelEvalId:       { type: String, required: true, unique: true, index: true },
    jobId:             { type: String, required: true, index: true },
    status:            { type: String, required: true },
    evalMode:          { type: String, enum: ['single', 'paired'], default: 'single' },
    ftModelRepo:       { type: String },
    baseModelRepo:     { type: String },
    totalConversations:{ type: Number, default: 0 },
    validConversations:{ type: Number, default: 0 },
    results:           { type: [EvaluationResultSchema], default: [] },
    baseResults:       { type: [EvaluationResultSchema], default: [] },
    summary:           { type: Schema.Types.Mixed, default: {} },
    baseSummary:       { type: Schema.Types.Mixed, default: null },
    delta:             { type: Schema.Types.Mixed, default: null },
    gpuResult:         { type: Schema.Types.Mixed, default: {} },
    startedAt:         { type: Date, required: true },
    completedAt:       { type: Date },
    judgeModel:        { type: String, default: 'google/gemini-2.5-flash' },
    error:             { type: String, default: '' },
    failureStage:      { type: String, default: '' },
    flags:             { type: [String], default: [] },
    // Dataset & Prompt traceability
    systemPrompt:       { type: String, default: '' },
    systemPromptVersion:{ type: String, default: '' },
    systemPromptSource: { type: String, default: '' },
    systemPromptHash:   { type: String, default: '' },
    datasetVersionId:   { type: String, default: '' },
    datasetVersionName: { type: String, default: '' },
    datasetMetadata:    { type: Schema.Types.Mixed, default: null },
    datasetFileHash:    { type: String, default: '' },
    datasetValidation:  { type: Schema.Types.Mixed, default: null },
    protocolManifest:   { type: Schema.Types.Mixed, default: null },
    environmentManifest:{ type: Schema.Types.Mixed, default: null },
    loadMetrics:        { type: Schema.Types.Mixed, default: null },
    researchStatistics:{ type: Schema.Types.Mixed, default: null },
    adaptiveDiagnostic:{ type: Schema.Types.Mixed, default: null },
    hypothesisDecisions:{ type: Schema.Types.Mixed, default: null },
    pairIntegrity:      { type: Schema.Types.Mixed, default: null },
    confirmatoryEligible:{ type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ModelEvaluation = mongoose.model<IEvaluation>('ModelEvaluation', EvaluationSchema);
