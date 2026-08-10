/**
 * Gom log/status từ GPU worker thành bản ghi audit lưu Mongo.
 * Mục tiêu: xem lại lỗi & cấu hình hiệu lực trên UI mà không cần SSH vào server.
 */

export type AuditLevel = 'info' | 'warn' | 'error';

export interface TrainAuditEvent {
  ts: Date;
  level: AuditLevel;
  source: string;
  code?: string;
  message: string;
}

export const MAX_TRAIN_LOGS = 2000;
export const MAX_AUDIT_EVENTS = 500;
export const MAX_METRICS_POINTS = 500;
/** Tối thiểu giữa 2 snapshot tài nguyên — stream poll mỗi 1s, không lưu hết. */
export const METRICS_SNAPSHOT_INTERVAL_MS = 30_000;

export interface TrainAuditPrevState {
  logs?: string[];
  lastError?: string;
  progress?: number;
  metricsAt?: Date | string | null;
}

export interface TrainMetricsSnapshot {
  ts: Date;
  loss?: number;
  eval_loss?: number;
  vram?: number;
  gpu_util?: number;
  progress?: number;
  step?: number;
  epoch?: number;
  total_steps?: number;
  total_epochs?: number;
}

function classifyLogLine(line: string): AuditLevel | null {
  const text = String(line || '');
  if (!text.trim()) return null;
  if (
    /\[ERROR\]/i.test(text) ||
    /\bTraceback\b/.test(text) ||
    /\bCUDA out of memory\b/i.test(text) ||
    /\bFAILED\b/.test(text) ||
    text.includes('❌')
  ) {
    return 'error';
  }
  if (
    text.includes('⚠️') ||
    /\[AutoTune\]/i.test(text) ||
    /\[DataQuality/i.test(text) ||
    /warn/i.test(text) ||
    /fallback/i.test(text)
  ) {
    return 'warn';
  }
  if (
    /\[ChatTemplate\]/i.test(text) ||
    /\[Thinking\]/i.test(text) ||
    /\[SFT Mask\]/i.test(text) ||
    /\[Length\]/i.test(text) ||
    /\[Config\]/i.test(text)
  ) {
    return 'info';
  }
  return null;
}

function eventCode(line: string): string | undefined {
  const match = line.match(/\[([A-Za-z][A-Za-z0-9_:-]*)\]/);
  return match ? match[1] : undefined;
}

/**
 * Build $set fields for TrainingHistory từ payload status GPU.
 * `prev` là trạng thái đã lưu — dùng để chỉ ghi phần mới (log, error, metrics).
 */
export function buildTrainAuditUpdate(
  data: Record<string, any>,
  prev: TrainAuditPrevState = {},
): Record<string, unknown> {
  const previousLogs = prev.logs || [];
  const previousLastError = prev.lastError || '';
  const update: Record<string, unknown> = {};
  const now = new Date();

  if (typeof data.status === 'string' && data.status) {
    update.status = data.status;
  }

  const incomingLogs = Array.isArray(data.logs)
    ? data.logs.map((line: unknown) => String(line)).filter(Boolean)
    : null;

  if (data.effective_config && typeof data.effective_config === 'object') {
    update.effectiveConfig = data.effective_config;
  }

  // Keep a small drill-down window so eval details remain available after the
  // GPU worker is restarted. The worker already caps this list; cap again at
  // the audit boundary to protect Mongo payloads from older workers.
  if (Array.isArray(data.eval_details)) {
    update.evalDetails = data.eval_details.slice(-25);
  }
  if (data.eval_current && typeof data.eval_current === 'object') {
    update.evalCurrent = data.eval_current;
  }
  if (data.eval_progress && typeof data.eval_progress === 'object') {
    update.evalProgress = data.eval_progress;
  }
  if (typeof data.eval_status === 'string' && data.eval_status) {
    update.evalStatus = data.eval_status;
  }
  if (Array.isArray(data.train_details)) {
    update.trainDetails = data.train_details.slice(-100);
  }
  if (data.train_current && typeof data.train_current === 'object') {
    update.trainCurrent = data.train_current;
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    update.lastError = data.error.trim();
  }
  if (typeof data.technical_error === 'string' && data.technical_error.trim()) {
    update.technicalError = data.technical_error.trim();
  }

  const prevLines = previousLogs.map(String);
  const incoming = incomingLogs || [];
  let newLines: string[] = [];
  if (incoming.length > 0) {
    // Ưu tiên suffix khi previous là prefix (tránh duplicate khi poll liên tiếp).
    let isPrefix = prevLines.length > 0 && incoming.length >= prevLines.length;
    if (isPrefix) {
      for (let i = 0; i < prevLines.length; i++) {
        if (prevLines[i] !== incoming[i]) {
          isPrefix = false;
          break;
        }
      }
    }
    if (isPrefix) {
      newLines = incoming.slice(prevLines.length);
    } else if (prevLines.length === 0) {
      newLines = incoming;
    } else {
      const prevSet = new Set(prevLines);
      newLines = incoming.filter((line) => !prevSet.has(line));
    }
  }

  if (incoming.length > 0) {
    // Không cho payload ngắn (vd '[System] Lỗi...' sau khi worker restart)
    // ghi đè toàn bộ log thật đã lưu — chỉ nối thêm dòng mới.
    const merged =
      incoming.length >= prevLines.length ? incoming : prevLines.concat(newLines);
    update.trainLogs = merged.slice(-MAX_TRAIN_LOGS);
    const last = merged[merged.length - 1];
    if (last) update.lastLogLine = last;
  }

  // ── Monitor: heartbeat tiến triển ─────────────────────────────────────────
  const incomingProgress =
    typeof data.progress === 'number' && Number.isFinite(data.progress)
      ? data.progress
      : undefined;
  if (incomingProgress !== undefined) {
    update.progress = incomingProgress;
  }
  const progressAdvanced =
    incomingProgress !== undefined &&
    (prev.progress === undefined || incomingProgress > prev.progress);
  if (newLines.length > 0 || progressAdvanced) {
    update.lastProgressAt = now;
  }

  // ── Monitor: snapshot tài nguyên (throttle) ───────────────────────────────
  const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : null;
  if (metrics) {
    const lastAt = prev.metricsAt ? new Date(prev.metricsAt).getTime() : 0;
    const hasSignal = ['loss', 'eval_loss', 'vram', 'gpu_util'].some(
      (k) => typeof metrics[k] === 'number' && metrics[k] > 0,
    );
    if (hasSignal && now.getTime() - lastAt >= METRICS_SNAPSHOT_INTERVAL_MS) {
      const snapshot: TrainMetricsSnapshot = { ts: now };
      for (const k of ['loss', 'eval_loss', 'vram', 'gpu_util', 'step', 'epoch', 'total_steps', 'total_epochs'] as const) {
        if (typeof metrics[k] === 'number' && Number.isFinite(metrics[k])) {
          snapshot[k] = metrics[k];
        }
      }
      if (incomingProgress !== undefined) snapshot.progress = incomingProgress;
      update._newMetricsSnapshot = snapshot;
      update.lastMetricsAt = now;
    }
  }

  const events: TrainAuditEvent[] = [];

  for (const line of newLines) {
    const level = classifyLogLine(line);
    if (!level) continue;
    events.push({
      ts: now,
      level,
      source: 'gpu-train',
      code: eventCode(line),
      message: line.slice(0, 2000),
    });
  }

  const errMsg =
    typeof data.error === 'string' && data.error.trim() ? data.error.trim() : '';
  if (errMsg && errMsg !== previousLastError) {
    events.push({
      ts: now,
      level: 'error',
      source: 'gpu-train',
      code: 'JOB_ERROR',
      message: errMsg.slice(0, 2000),
    });
  }

  if (
    ['ERROR', 'FAILED'].includes(String(data.status || '')) &&
    !errMsg &&
    !previousLastError &&
    !events.some((e) => e.level === 'error')
  ) {
    const message = `Job kết thúc với trạng thái ${data.status}`;
    events.push({
      ts: now,
      level: 'error',
      source: 'backend',
      code: String(data.status),
      message,
    });
    // Ghi lastError để lần poll sau không tạo lại event trùng.
    update.lastError = message;
  }

  if (events.length > 0) {
    update._newAuditEvents = events.slice(-MAX_AUDIT_EVENTS);
  }

  return update;
}

/** Tách các field nội bộ `_new*` thành update Mongo hợp lệ ($set + $push). */
export function toMongoAuditUpdate(raw: Record<string, unknown>): Record<string, unknown> {
  const events = raw._newAuditEvents as TrainAuditEvent[] | undefined;
  const snapshot = raw._newMetricsSnapshot as TrainMetricsSnapshot | undefined;
  const { _newAuditEvents, _newMetricsSnapshot, ...setFields } = raw;
  const mongo: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) {
    mongo.$set = setFields;
  }
  const push: Record<string, unknown> = {};
  if (events && events.length > 0) {
    push.auditEvents = {
      $each: events,
      $slice: -MAX_AUDIT_EVENTS,
    };
  }
  if (snapshot) {
    push.metricsHistory = {
      $each: [snapshot],
      $slice: -MAX_METRICS_POINTS,
    };
  }
  if (Object.keys(push).length > 0) {
    mongo.$push = push;
  }
  return mongo;
}
