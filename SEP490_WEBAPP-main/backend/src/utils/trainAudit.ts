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
 * `previousLogs` dùng để chỉ tạo audit event cho dòng log mới.
 */
export function buildTrainAuditUpdate(
  data: Record<string, any>,
  previousLogs: string[] = [],
  previousLastError: string = '',
): Record<string, unknown> {
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

  if (typeof data.error === 'string' && data.error.trim()) {
    update.lastError = data.error.trim();
  }
  if (typeof data.technical_error === 'string' && data.technical_error.trim()) {
    update.technicalError = data.technical_error.trim();
  }

  const prev = previousLogs.map(String);
  const incoming = incomingLogs || [];
  let newLines: string[] = [];
  if (incoming.length > 0) {
    // Ưu tiên suffix khi previous là prefix (tránh duplicate khi poll liên tiếp).
    let isPrefix = prev.length > 0 && incoming.length >= prev.length;
    if (isPrefix) {
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== incoming[i]) {
          isPrefix = false;
          break;
        }
      }
    }
    if (isPrefix) {
      newLines = incoming.slice(prev.length);
    } else if (prev.length === 0) {
      newLines = incoming;
    } else {
      const prevSet = new Set(prev);
      newLines = incoming.filter((line) => !prevSet.has(line));
    }
  }

  if (incoming.length > 0) {
    // Không cho payload ngắn (vd '[System] Lỗi...' sau khi worker restart)
    // ghi đè toàn bộ log thật đã lưu — chỉ nối thêm dòng mới.
    const merged =
      incoming.length >= prev.length ? incoming : prev.concat(newLines);
    update.trainLogs = merged.slice(-MAX_TRAIN_LOGS);
    const last = merged[merged.length - 1];
    if (last) update.lastLogLine = last;
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

/** Tách field nội bộ `_newAuditEvents` thành update Mongo hợp lệ ($set + $push). */
export function toMongoAuditUpdate(raw: Record<string, unknown>): Record<string, unknown> {
  const events = raw._newAuditEvents as TrainAuditEvent[] | undefined;
  const { _newAuditEvents, ...setFields } = raw;
  const mongo: Record<string, unknown> = {};
  if (Object.keys(setFields).length > 0) {
    mongo.$set = setFields;
  }
  if (events && events.length > 0) {
    mongo.$push = {
      auditEvents: {
        $each: events,
        $slice: -MAX_AUDIT_EVENTS,
      },
    };
  }
  return mongo;
}
