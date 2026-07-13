// ============================================================
// AutoTrain Wizard — Shared Types & Constants
// ============================================================

// ── Training Configuration ──
export interface TrainingConfig {
  projectName: string;
  baseModel: string;
  datasetSource: 'local' | 'hub' | 'cloud';
  localFile: File | null;
  selectedHfDataset: string;
  cloudLoadedDataset: string;
  columnMapping: string;
  systemPrompt: string;
  apiKey: string;

  // Training parameters
  epochs: string;
  batchSize: string;
  learningRate: string;
  blockSize: string;
  modelMaxLength: string;
  r: string;
  loraAlpha: string;
  loraDropout: string;
  gradAccum: string;
  warmupSteps: string;
  weightDecay: string;
  seed: string;
  optim: string;
  lrScheduler: string;

  // HF Hub push
  hfRepoId: string;
  hfToken: string;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  projectName: 'my-first-lm-project',
  baseModel: 'Qwen/Qwen2.5-0.5B-Instruct',
  datasetSource: 'local',
  localFile: null,
  selectedHfDataset: '',
  cloudLoadedDataset: '',
  columnMapping: 'text',
  systemPrompt: '',
  apiKey: '',

  epochs: '3',
  batchSize: '1',
  learningRate: '0.0002',
  blockSize: '1024',
  modelMaxLength: '1024',
  r: '16',
  loraAlpha: '32',
  loraDropout: '0',
  gradAccum: '4',
  warmupSteps: '5',
  weightDecay: '0.01',
  seed: '3407',
  optim: 'adamw_8bit',
  lrScheduler: 'linear',

  hfRepoId: '',
  hfToken: '',
};

// ── Dataset Preview ──
export interface PreviewData {
  rows: PreviewRow[];
  totalRecords: number | null;
  totalTokens: number | null;
  headers: string[];
  qualityChecks?: QualityCheck[];
}

export interface QualityCheck {
  level: 'ok' | 'warn' | 'error';
  message: string;
}

export interface PreviewRow {
  instruction: string;
  input: string;
  output: string;
}

export const EMPTY_PREVIEW: PreviewData = {
  rows: [],
  totalRecords: null,
  totalTokens: null,
  headers: [],
  qualityChecks: undefined,
};

// ── Base Models ──
export interface ModelOption {
  id: string;
  name: string;
}

export interface ModelGroup {
  category: string;
  models: ModelOption[];
}

export const BASE_MODEL_GROUPS: ModelGroup[] = [
  {
    category: "Lightweight (Quick experiments)",
    models: [
      { id: "Qwen/Qwen2.5-0.5B-Instruct", name: "Qwen 2.5 (0.5B) — Runs on any machine" },
      { id: "sshleifer/tiny-gpt2", name: "Tiny GPT-2 — Ultra fast" },
      { id: "lightonai/LightOnOCR-2-1B", name: "LightOn OCR (1B)" }
    ]
  },
  {
    category: "Standard (Recommended)",
    models: [
      { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 (8B) — Great reasoning" },
      { id: "Qwen/Qwen2.5-Coder-7B-Instruct", name: "Qwen 2.5 Coder — Programming specialist" },
      { id: "unsloth/gpt-oss-20b-unsloth-bnb-4bit", name: "GPT OSS 20B (4-bit) — VRAM optimized" },
      { id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4", name: "Nemotron 3 Nano (30B)" },
      { id: "MiniMaxAI/MiniMax-M2.1", name: "MiniMax M2.1" }
    ]
  }
];

// ── System Prompt Templates ──
export interface PromptTemplate {
  label: string;
  text: string;
}

export const SYSTEM_PROMPT_TEMPLATES: PromptTemplate[] = [
  { label: "Friendly Math Tutor", text: "You are a friendly Math tutor who always explains step by step clearly for elementary students." },
  { label: "Strict Literature Teacher", text: "You are a strict Literature teacher grading assignments. Point out grammar and writing style errors in detail." },
  { label: "Socratic Method", text: "You are a Socratic method teacher. Never give answers directly — ask guiding questions so students discover answers themselves." }
];

// ── Parameter Presets ──
export interface ParamPreset {
  epochs: number;
  batchSize: number;
  learningRate: number;
  blockSize: number;
  modelMaxLength: number;
  r: number;
  lora_alpha: number;
  lora_dropout: number;
  gradient_accumulation_steps: number;
  warmup_steps: number;
  weight_decay: number;
  optim: string;
  lr_scheduler_type: string;
}

export const DEFAULT_PRESETS: Record<string, ParamPreset> = {
  "Quick Training (~5 min)": {
    epochs: 1, batchSize: 2, learningRate: 0.0002, blockSize: 512, modelMaxLength: 512,
    r: 4, lora_alpha: 8, lora_dropout: 0.0, gradient_accumulation_steps: 8,
    warmup_steps: 2, weight_decay: 0.0, optim: "adamw_8bit", lr_scheduler_type: "linear"
  },
  "Standard (Recommended ~15 min)": {
    epochs: 3, batchSize: 1, learningRate: 0.0002, blockSize: 1024, modelMaxLength: 1024,
    r: 16, lora_alpha: 32, lora_dropout: 0.0, gradient_accumulation_steps: 4,
    warmup_steps: 5, weight_decay: 0.01, optim: "adamw_8bit", lr_scheduler_type: "linear"
  },
  "High Quality (~45 min)": {
    epochs: 5, batchSize: 1, learningRate: 0.0001, blockSize: 1024, modelMaxLength: 1024,
    r: 32, lora_alpha: 64, lora_dropout: 0.0, gradient_accumulation_steps: 4,
    warmup_steps: 5, weight_decay: 0.01, optim: "adamw_8bit", lr_scheduler_type: "cosine"
  }
};

// ── Wizard Step ──
export type WizardStep = 1 | 2 | 3;

// ── Toast ──
export interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ── Training Job (from SSE) ──
export interface TrainingJob {
  id: string;
  status: string;
  progress: number;
  current_epoch?: number;
  total_epochs?: number;
  current_step?: number;
  total_steps?: number;
  loss?: number;
  eval_loss?: number;
  vram_used?: string | number;
  gpu_util?: string | number;
  error?: string;
  technical_error?: string;
  metrics?: {
    loss?: number;
    eval_loss?: number;
    vram?: number | string;
    gpu_util?: number | string;
  };
  logs?: string[];
}


export interface LossPoint {
  progress: number;
  loss: number;
}

// ── Helpers ──

/** Normalize a dataset row into {instruction, input, output} for preview */
export function formatRowPreview(r: any): PreviewRow {
  if (!r) return { instruction: '', input: '', output: '' };

  let messages: any[] | null = null;
  if (Array.isArray(r)) {
    messages = r;
  } else if (r && typeof r === 'object') {
    if (Array.isArray(r.messages)) messages = r.messages;
    else if (Array.isArray(r.conversations)) messages = r.conversations;
    else if (Array.isArray(r.turns)) messages = r.turns;
  }

  if (messages && messages.length > 0) {
    const assistantTurns = messages.filter(m => {
      const role = String(m.role || m.from || '').toLowerCase();
      return role === 'assistant' || role === 'tutor' || role === 'gpt' || role === 'bot';
    });
    const userTurns = messages.filter(m => {
      const role = String(m.role || m.from || '').toLowerCase();
      return role === 'user' || role === 'human' || role === 'student';
    });
    const systemTurns = messages.filter(m => {
      const role = String(m.role || m.from || '').toLowerCase();
      return role === 'system';
    });

    const lastAssistant = assistantTurns[assistantTurns.length - 1];
    const lastUser = userTurns[userTurns.length - 1];

    const instruction = lastUser ? (lastUser.content || lastUser.value || '') : '';
    const output = lastAssistant ? (lastAssistant.content || lastAssistant.value || '') : '';

    const contextParts: string[] = [];
    systemTurns.forEach(s => {
      const content = s.content || s.value || '';
      if (content) contextParts.push(`[System] ${content}`);
    });
    messages.forEach(m => {
      if (m === lastUser || m === lastAssistant) return;
      const role = String(m.role || m.from || '').toLowerCase();
      if (role === 'system') return;
      const content = m.content || m.value || '';
      if (content) {
        const displayRole = role === 'user' || role === 'human' ? 'Student' : 'Tutor';
        contextParts.push(`[${displayRole}] ${content}`);
      }
    });

    return {
      instruction: instruction || 'ChatML Conversation',
      input: contextParts.join('\n'),
      output: output || ''
    };
  }

  const instruction = r.instruction || r.text || r.prompt || r.question || '';
  const input = r.input || r.context || '';
  const output = r.output || r.response || r.answer || r.assistant || '';

  if (instruction || input || output) {
    return { instruction, input, output };
  }

  return {
    instruction: typeof r === 'object' ? JSON.stringify(r) : String(r),
    input: '',
    output: ''
  };
}

/** Trigger a download of a sample training CSV (Alpaca-style with 5 rows). */
export function downloadSampleCSV(): void {
  const BOM = '\uFEFF';
  const csv = `${BOM}instruction,input,output
"What is 2+2?","","4. Two plus two equals four."
"Explain photosynthesis.","","Photosynthesis is the process by which green plants convert sunlight, water, and carbon dioxide into glucose and oxygen."
"Translate to French: Hello","Hello","Bonjour"
"What is the capital of Japan?","","The capital of Japan is Tokyo."
"Summarize: The quick brown fox jumps over the lazy dog.","The quick brown fox jumps over the lazy dog.","A fox jumps over a dog."`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_training_data.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Estimate training time based on dataset size and preset */
export function estimateTrainingTime(
  totalRecords: number | null,
  presetName: string
): string {
  if (!totalRecords) return 'Unknown';
  const records = totalRecords;
  
  if (presetName.includes('Quick')) {
    if (records < 100) return '~2 min';
    if (records < 500) return '~5 min';
    return '~10 min';
  }
  if (presetName.includes('High')) {
    if (records < 100) return '~15 min';
    if (records < 500) return '~30 min';
    return '~45+ min';
  }
  // Standard
  if (records < 100) return '~5 min';
  if (records < 500) return '~15 min';
  return '~25 min';
}

/**
 * Run dataset quality checks against parsed records and detected column.
 * Returns a list of pass/warn/error messages suitable for direct display.
 *
 * The checks intentionally err on the side of being lenient — we want to
 * surface real problems (no records, all outputs empty, too few samples)
 * without nagging on noisy single-row issues.
 */
export function runQualityChecks(
  records: any[],
  detectedColumn: string | null,
  headers: string[],
  previewRows: PreviewRow[],
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const total = records.length;

  // 1. Record count
  if (total === 0) {
    checks.push({ level: 'error', message: 'No records found in file.' });
    return checks;
  }
  if (total < 20) {
    checks.push({ level: 'warn', message: `Only ${total} records — training quality will be poor. Aim for at least 50.` });
  } else if (total < 50) {
    checks.push({ level: 'warn', message: `${total.toLocaleString()} records — usable but limited. 100+ recommended.` });
  } else {
    checks.push({ level: 'ok', message: `${total.toLocaleString()} records detected (good size).` });
  }

  // 2. Column detection
  if (detectedColumn) {
    checks.push({ level: 'ok', message: `Auto-detected training column: "${detectedColumn}".` });
  } else if (headers.length === 0) {
    checks.push({ level: 'warn', message: 'Could not extract column headers — records may not be objects.' });
  } else {
    checks.push({
      level: 'warn',
      message: `No standard training column found among: ${headers.join(', ')}. Pick one manually below.`,
    });
  }

  // 3. Empty-output detection (only meaningful when preview rows are populated)
  if (previewRows.length > 0) {
    const emptyOutputs = previewRows.filter(r => !r.output || !r.output.trim()).length;
    if (emptyOutputs === previewRows.length) {
      checks.push({
        level: 'error',
        message: 'All preview rows have empty outputs. The model has nothing to learn — check your column mapping.',
      });
    } else if (emptyOutputs > 0) {
      const pct = Math.round((emptyOutputs / previewRows.length) * 100);
      checks.push({
        level: 'warn',
        message: `${emptyOutputs}/${previewRows.length} preview rows have empty outputs (~${pct}%). These will be skipped.`,
      });
    }
  }

  return checks;
}
