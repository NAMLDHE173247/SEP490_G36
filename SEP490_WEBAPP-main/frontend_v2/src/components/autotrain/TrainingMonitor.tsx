// ============================================================
// TrainingMonitor — AutoTrain Wizard: Training Job Monitor
// ============================================================

import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  Activity,
  Cpu,
  StopCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Loader2,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { TrainingJob, LossPoint, EvalDetail, TrainDetail, TrainSummary } from './types';

// ── Props ──
interface TrainingMonitorProps {
  activeJobs: Record<string, TrainingJob>;
  lossHistories: Record<string, LossPoint[]>;
  evalLossHistories: Record<string, LossPoint[]>;
  jobConfigs: Record<string, any>;
  onStopJob: (jobId: string) => void;
  onDismissJob: (jobId: string) => void;
  onChatTest: (jobId: string) => void;
  onGenerateSummary: (jobId: string, refresh?: boolean) => Promise<void>;
  completedJobId: string | null;
  onDismissSuccess: () => void;
}

// ── Friendly summary derivation ──
// Returns a short human-readable sentence + a trend hint, so a non-ML user
// can tell at a glance whether training is healthy without staring at loss numbers.
interface FriendlySummary {
  headline: string;
  trend: 'improving' | 'stalled' | 'diverging' | 'unknown';
  trendIcon: typeof TrendingDown;
  trendLabel: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

function deriveFriendlySummary(
  job: TrainingJob,
  trainHistory: LossPoint[],
  evalHistory: LossPoint[],
): FriendlySummary {
  // Terminal states first
  if (job.status === 'COMPLETED') {
    return { headline: 'Training finished — your AI tutor is ready to test.', trend: 'improving', trendIcon: TrendingDown, trendLabel: 'Done', tone: 'good' };
  }
  if (job.status === 'STOPPED') {
    return { headline: 'Training stopped by user. Progress was saved up to the last checkpoint.', trend: 'unknown', trendIcon: AlertTriangle, trendLabel: 'Stopped', tone: 'warn' };
  }
  if (job.status === 'ERROR' || job.status === 'FAILED') {
    return { headline: 'Training failed. Check the log below for details.', trend: 'unknown', trendIcon: AlertTriangle, trendLabel: 'Error', tone: 'bad' };
  }
  if (job.status === 'QUEUED') {
    return { headline: 'Waiting in queue — a GPU worker will pick this up shortly.', trend: 'unknown', trendIcon: Loader2, trendLabel: 'Queued', tone: 'info' };
  }

  // Active training — derive a trend from the last few loss points.
  if (trainHistory.length < 3) {
    return { headline: 'Training is warming up — first checkpoints will appear shortly.', trend: 'unknown', trendIcon: Loader2, trendLabel: 'Starting', tone: 'info' };
  }

  const recent = trainHistory.slice(-5);
  const first = recent[0].loss;
  const last = recent[recent.length - 1].loss;
  const trainDelta = last - first;
  const trainImproving = trainDelta < -0.001;
  const trainStalled = Math.abs(trainDelta) <= 0.001;

  // Check for divergence between train and eval (overfitting signal)
  let evalDiverging = false;
  if (evalHistory.length >= 2) {
    const recentEval = evalHistory.slice(-3);
    const evalDelta = recentEval[recentEval.length - 1].loss - recentEval[0].loss;
    if (evalDelta > 0.05 && trainImproving) {
      evalDiverging = true;
    }
  }

  const epochPart =
    job.current_epoch !== undefined && job.total_epochs !== undefined
      ? `Currently on epoch ${job.current_epoch} of ${job.total_epochs}.`
      : '';

  if (evalDiverging) {
    return {
      headline: `AI is starting to memorize the training data instead of generalizing. ${epochPart} Consider stopping early.`,
      trend: 'diverging',
      trendIcon: TrendingUp,
      trendLabel: 'Overfitting risk',
      tone: 'warn',
    };
  }
  if (trainStalled) {
    return {
      headline: `Loss has plateaued — the AI may have learned what it can from this dataset. ${epochPart}`,
      trend: 'stalled',
      trendIcon: TrendingDown,
      trendLabel: 'Plateau',
      tone: 'info',
    };
  }
  if (trainImproving) {
    return {
      headline: `AI is learning well — quality is improving. ${epochPart}`,
      trend: 'improving',
      trendIcon: TrendingDown,
      trendLabel: 'Improving',
      tone: 'good',
    };
  }
  return {
    headline: `Loss is unstable — try lowering the learning rate next time. ${epochPart}`,
    trend: 'diverging',
    trendIcon: TrendingUp,
    trendLabel: 'Unstable',
    tone: 'warn',
  };
}

const TONE_PALETTE = {
  good: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', accent: '#059669' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', accent: '#3B82F6' },
  warn: { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', accent: '#F59E0B' },
  bad:  { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', accent: '#EF4444' },
};

const displayNumber = (value: unknown, digits = 4): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
};

const displayInteger = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
};

const displayEpoch = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(2).replace(/\.00$/, '');
};

/**
 * Kaggle/Windows log copies can contain UTF-8 decoded as Latin-1/CP1252
 * (e.g. `ï½œUserï½œ`). Repair only strings with a strong mojibake signal;
 * proper Vietnamese and native model markers are left untouched.
 */
const mojibakeScore = (value: string): number => (
  value.match(/Ã.|Â.|Ä.|Å.|Æ.|â(?:€|™|œ|š|–|—|¦||…)|ðŸ.|ï½|�/g) || []
).length;

const repairMojibake = (value: unknown): string => {
  let current = String(value ?? '');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (mojibakeScore(current) === 0) break;
    const chars = Array.from(current);
    if (chars.some(char => char.charCodeAt(0) > 255)) break;
    try {
      const bytes = Uint8Array.from(chars, char => char.charCodeAt(0));
      const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (mojibakeScore(repaired) >= mojibakeScore(current)) break;
      current = repaired;
    } catch {
      break;
    }
  }
  return current;
};

const ConfigSummary: React.FC<{ job: TrainingJob; jobConfig?: any }> = ({ job, jobConfig }) => {
  const effective = job.effective_config || {};
  const requested = job.requested_config || jobConfig?.trainingConfig || {};
  const schedule = effective.schedule || {};
  const rows: Array<[string, string]> = [
    ['Model', String(effective.model_name || requested.baseModel || requested.model_name || jobConfig?.baseModel || '—')],
    ['Epochs', String(effective.epochs ?? requested.epochs ?? '—')],
    ['Batch / effective batch', `${effective.batch_size ?? requested.batchSize ?? requested.batch_size ?? '—'} / ${effective.effective_batch_size ?? '—'}`],
    ['Optimizer', String(effective.optimizer || effective.optim || requested.optim || '—')],
    ['Learning rate', String(effective.learning_rate ?? requested.learningRate ?? requested.learning_rate ?? '—')],
    ['Scheduler', String(effective.lr_scheduler_type || requested.lrScheduler || requested.lr_scheduler_type || '—')],
    ['Max length', String(effective.max_length ?? requested.modelMaxLength ?? requested.model_max_length ?? '—')],
    ['Grad accumulation', String(effective.gradient_accumulation_steps ?? requested.gradAccum ?? requested.gradient_accumulation_steps ?? '—')],
    ['Warmup', effective.warmup_ratio ? `${effective.warmup_ratio} ratio` : String(effective.warmup_steps ?? requested.warmupSteps ?? requested.warmup_steps ?? '—')],
    ['Weight decay', String(effective.weight_decay ?? requested.weightDecay ?? requested.weight_decay ?? '—')],
    ['LoRA r / alpha', `${effective.lora?.r ?? requested.r ?? '—'} / ${effective.lora?.alpha ?? requested.loraAlpha ?? requested.lora_alpha ?? '—'}`],
    ['LoRA dropout', String(effective.lora?.dropout ?? requested.loraDropout ?? requested.lora_dropout ?? '—')],
    ['Steps / epoch', String(schedule.steps_per_epoch ?? job.metrics?.steps_per_epoch ?? '—')],
    ['Total steps', String(schedule.total_steps ?? job.total_steps ?? '—')],
    ['Eval / save steps', `${schedule.eval_steps ?? requested.evalSteps ?? requested.eval_steps ?? 'auto'} / ${schedule.save_steps ?? requested.saveSteps ?? requested.save_steps ?? 'auto'}`],
    ['Logging steps', String(effective.logging_steps ?? requested.loggingSteps ?? requested.logging_steps ?? '—')],
    ['Auto tune', effective.auto_tune?.enabled !== undefined ? (effective.auto_tune.enabled ? 'On' : 'Off') : ((requested.autoTune ?? requested.auto_tune) ? 'On' : 'Off')],
    ['Chat template', String(effective.chat_template?.active_kind ?? requested.chatTemplate ?? requested.chat_template ?? 'auto')],
    ['Gradient checkpointing', effective.gradient_checkpointing !== undefined ? (effective.gradient_checkpointing ? 'On' : 'Off') : ((requested.gradientCheckpointing ?? requested.gradient_checkpointing) ? 'On' : 'Off')],
  ];

  return (
    <details style={{ marginTop: 18, border: '1px solid #E2E8F0', borderRadius: 8, background: '#F8FAFC' }}>
      <summary style={{ cursor: 'pointer', padding: '11px 13px', color: '#334155', fontSize: 12, fontWeight: 700 }}>
        <Cpu size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />
        Training parameters &amp; effective schedule
      </summary>
      <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ padding: '8px 9px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6 }}>
            <span style={{ display: 'block', fontSize: 10, color: '#64748B' }}>{label}</span>
            <strong style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#1E293B', wordBreak: 'break-word' }}>{value}</strong>
          </div>
        ))}
      </div>
    </details>
  );
};

const EvalDetailModal: React.FC<{ job: TrainingJob; onClose: () => void }> = ({ job, onClose }) => {
  const progress = job.eval_progress || {};
  const current = job.eval_current || (job.eval_details || []).slice(-1)[0];
  const details = [...(job.eval_details || [])].reverse();
  const status = progress.status || job.eval_status || current?.status || 'WAITING';

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-detail-title"
        onClick={event => event.stopPropagation()}
        style={{ width: 'min(780px, 100%)', maxHeight: 'min(760px, 92vh)', overflowY: 'auto', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h3 id="eval-detail-title" style={{ margin: 0, fontSize: 16, color: '#0F172A' }}>Eval-loss detail</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#64748B' }}>Mẫu hiện tại và các mẫu gần nhất mà GPU đang chấm.</p>
          </div>
          <button type="button" className="at-btn-icon-sm" onClick={onClose} aria-label="Close eval details"><X size={15} /></button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              ['Status', status],
              ['Eval loss', displayNumber(job.eval_loss)],
              ['Sample', progress.total_samples ? `${(progress.seen_samples ?? 0)}/${progress.total_samples}` : displayInteger(progress.seen_samples)],
              ['Step / epoch', `${displayInteger(progress.step ?? job.current_step)} / ${displayEpoch(progress.epoch ?? job.current_epoch)}`],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 11px' }}>
                <span style={{ display: 'block', fontSize: 10, color: '#64748B' }}>{label}</span>
                <strong style={{ display: 'block', marginTop: 3, fontSize: 13, color: '#1E293B' }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #FECACA', background: '#FFF7F7', borderRadius: 9, padding: 13, marginBottom: 18 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', marginBottom: 6 }}>Current sample</span>
            {current ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#1F2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {repairMojibake(current.question || current.text_preview || 'Decoded sample is empty.')}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>
                  Batch {displayInteger(current.batch_index)} · sample #{displayInteger((current.sample_index ?? 0) + 1)} · {current.status || status}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#64748B' }}>Chưa có prediction batch nào được phát ra. Khi eval bắt đầu, câu đang chấm sẽ xuất hiện ở đây.</div>
            )}
          </div>

          <div>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Recent eval samples</span>
            {details.length > 0 ? details.map((detail: EvalDetail, index) => (
              <div key={`${detail.round ?? 0}-${detail.sample_index ?? index}-${index}`} style={{ padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                  <span>#{(detail.sample_index ?? 0) + 1} · step {displayInteger(detail.step)} · epoch {displayEpoch(detail.epoch)}</span>
                  <span>{detail.status || 'evaluating'}{detail.eval_loss != null ? ` · loss ${displayNumber(detail.eval_loss)}` : ''}</span>
                </div>
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {repairMojibake(detail.question || detail.text_preview || 'Empty sample preview')}
                </div>
              </div>
            )) : (
              <div style={{ padding: 12, border: '1px dashed #CBD5E1', borderRadius: 7, color: '#64748B', fontSize: 12 }}>
                Chưa có detail từng câu từ GPU worker.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Console Console Logger (Auto-Scroll) ──
const TrainDetailModal: React.FC<{
  job: TrainingJob;
  history: LossPoint[];
  onClose: () => void;
}> = ({ job, history, onClose }) => {
  const historyDetails: TrainDetail[] = history.map(point => ({
    step: point.step,
    epoch: point.epoch,
    progress: point.progress,
    loss: point.loss,
    status: 'training',
  }));
  const details = job.train_details?.length ? job.train_details : historyDetails;
  const current = job.train_current || details[details.length - 1] || null;
  const recent = [...details].reverse().slice(0, 30);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="train-detail-title"
        onClick={event => event.stopPropagation()}
        style={{ width: 'min(780px, 100%)', maxHeight: 'min(760px, 92vh)', overflowY: 'auto', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <h3 id="train-detail-title" style={{ margin: 0, fontSize: 16, color: '#0F172A' }}>Train-loss detail</h3>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: '#64748B' }}>
              Batch vừa chạy, loss theo optimizer step, epoch và thông số runtime.
            </p>
          </div>
          <button type="button" className="at-btn-icon-sm" onClick={onClose} aria-label="Close train details"><X size={15} /></button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              ['Status', current?.status || 'WAITING'],
              ['Train loss', displayNumber(current?.loss)],
              ['Progress', typeof current?.progress === 'number' ? `${Math.round(current.progress)}%` : '—'],
              ['Step / epoch', `${displayInteger(current?.step)} / ${displayEpoch(current?.epoch)}`],
              ['Learning rate', displayNumber(current?.learning_rate, 7)],
              ['Grad norm', displayNumber(current?.grad_norm)],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 11px' }}>
                <span style={{ display: 'block', fontSize: 10, color: '#64748B' }}>{label}</span>
                <strong style={{ display: 'block', marginTop: 3, fontSize: 13, color: '#1E293B' }}>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #C7D2FE', background: '#EEF2FF', borderRadius: 9, padding: 13, marginBottom: 18, color: '#3730A3', fontSize: 12, lineHeight: 1.5 }}>
            Train loss là loss của batch thực tế ngay trước optimizer step. Dataset vẫn có thể shuffle nên đây là preview batch, không phải một `sample_index` cố định.
          </div>

          <div style={{ border: '1px solid #DDD6FE', background: '#FAF5FF', borderRadius: 9, padding: 13, marginBottom: 18 }}>
            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase', marginBottom: 6 }}>Current training batch</span>
            {current?.question || current?.text_preview ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: '#1F2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {repairMojibake(current.question || current.text_preview)}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>
                  Batch size {displayInteger(current.batch_size)} · {current.status || 'training'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#64748B' }}>GPU worker chưa gửi preview batch cho điểm loss này.</div>
            )}
          </div>

          <div>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Recent train-loss points</span>
            {recent.length > 0 ? recent.map((detail, index) => (
              <div key={`${detail.step ?? index}-${detail.epoch ?? index}-${index}`} style={{ padding: '10px 0', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                  <span>step {displayInteger(detail.step)} · epoch {displayEpoch(detail.epoch)} · {typeof detail.progress === 'number' ? `${Math.round(detail.progress)}%` : '—'}</span>
                  <span>{detail.status || 'training'} · loss {displayNumber(detail.loss)}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#334155' }}>
                  <span>lr {displayNumber(detail.learning_rate, 7)}</span>
                  <span>grad norm {displayNumber(detail.grad_norm)}</span>
                </div>
                {detail.question && (
                  <div style={{ marginTop: 5, fontSize: 12, color: '#64748B', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {repairMojibake(detail.question)}
                  </div>
                )}
              </div>
            )) : (
              <div style={{ padding: 12, border: '1px dashed #CBD5E1', borderRadius: 7, color: '#64748B', fontSize: 12 }}>
                Chưa có train-loss detail từ GPU worker.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TechnicalLogLine: React.FC<{ log: string; index: number }> = ({ log, index }) => {
  const normalized = repairMojibake(log);
  const templateMatch = normalized.match(
    /^\[ChatTemplate\]\s+(active_jinja|rendered_probe|rendered_train_sample|rendered_eval_sample)=(?:\n)?([\s\S]*)$/,
  );

  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <span style={{ color: '#64748B', marginRight: 8, userSelect: 'none' }}>[{index + 1}]</span>
      {templateMatch ? (
        <details style={{ display: 'inline-block', verticalAlign: 'top', maxWidth: 'calc(100% - 42px)' }}>
          <summary style={{ cursor: 'pointer', color: '#A5B4FC', fontWeight: 700 }}>
            Chat template · {templateMatch[1].replace(/_/g, ' ')}
          </summary>
          <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#E2E8F0', fontFamily: 'inherit' }}>
            {templateMatch[2] || '(empty)'}
          </pre>
        </details>
      ) : normalized}
    </div>
  );
};

const ConsoleTerminal: React.FC<{ logs: string[]; height?: number | string }> = ({ logs, height = 280 }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={containerRef}
      className="at-console"
      style={{
        background: '#0F172A',
        color: '#38BDF8',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        padding: '16px',
        borderRadius: '8px',
        height: typeof height === 'number' ? `${height}px` : height,
        boxSizing: 'border-box',
        overflowY: 'auto',
        fontSize: '12px',
        lineHeight: '1.6',
        border: '1px solid #1E293B',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)',
      }}
    >
      {/* OS style console header window dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, borderBottom: '1px solid #1E293B', paddingBottom: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}></span>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }}></span>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span>
        </div>
        <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Terminal size={10} /> TERMINAL LOGS
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {logs && logs.length > 0 ? (
          logs.map((log, idx) => <TechnicalLogLine key={idx} log={log} index={idx} />)
        ) : (
          <div style={{ color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 80 }}>
            Waiting for training stream output logs...
          </div>
        )}
      </div>
    </div>
  );
};

// ── Fullscreen Log Modal ──
const LogFullscreenModal: React.FC<{ logs: string[]; onClose: () => void }> = ({ logs, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(2,6,23,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full log view"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 1100, height: 'min(850px, calc(100vh - 48px))', display: 'flex', flexDirection: 'column', background: '#0F172A', borderRadius: 14, border: '1px solid #1E293B', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1E293B', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Terminal size={13} /> TERMINAL LOGS — FULL VIEW
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close full log"
            style={{ width: 28, height: 28, border: '1px solid #334155', borderRadius: 6, background: '#1E293B', color: '#94A3B8', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: 12, display: 'flex', flexDirection: 'column' }}>
          <ConsoleTerminal logs={logs} height="100%" />
        </div>
      </div>
    </div>
  );
};

// ── Fullscreen Chart Modal ──
const ChartFullscreenModal: React.FC<{ chartData: any[]; onClose: () => void }> = ({ chartData, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Full chart view"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 1100, height: 'min(700px, 90vh)', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 30px 80px rgba(15,23,42,0.35)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Activity size={14} /> REAL-TIME LOSS CURVE
          </span>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#4F46E5' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4F46E5', display: 'inline-block' }} /> Train Loss
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#DC2626' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} /> Eval Loss
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chart"
              style={{ width: 30, height: 30, border: '1px solid #E2E8F0', borderRadius: 7, background: '#F8FAFC', color: '#64748B', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, padding: '16px 20px 20px', minHeight: 0 }}>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
                <XAxis dataKey="progress" tickFormatter={(v) => `${Math.round(v)}%`} stroke="#9CA3AF" fontSize={11} />
                <YAxis stroke="#9CA3AF" fontSize={11} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '12px', color: '#1F2937' }}
                  labelFormatter={(v) => `Progress: ${Math.round(Number(v))}%`}
                />
                <Line type="monotone" dataKey="loss" name="Train Loss" stroke="#4F46E5" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="evalLoss" name="Eval Loss" stroke="#DC2626" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>
              Waiting for loss metrics points...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Collapsible wrapper around ConsoleTerminal ──
// Hides the dev-style log behind a toggle so non-technical users aren't
// confronted with a Hacker-News-style terminal by default.
const CollapsibleConsole: React.FC<{ logs: string[] }> = ({ logs }) => {
  const [open, setOpen] = useState(false);
  const [logHeight, setLogHeight] = useState(280);
  const [logFullscreen, setLogFullscreen] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: logHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      const next = Math.min(800, Math.max(200, dragRef.current.startH + delta));
      setLogHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: open ? 8 : 0 }}>
        <button
          type="button"
          className="at-btn-icon-sm"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            color: '#475569',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            flex: 1,
            width: 'auto',
          }}
        >
          <Terminal size={12} />
          {open ? 'Hide technical log' : `Show technical log${logs.length ? ` (${logs.length} lines)` : ''}`}
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setLogFullscreen(true)}
            title="Phóng to log"
            aria-label="Phóng to log"
            style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', color: '#475569', cursor: 'pointer', flexShrink: 0 }}
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      {open && (
        <div style={{ position: 'relative' }}>
          <ConsoleTerminal logs={logs} height={logHeight} />
          {/* Drag resize handle */}
          <div
            onMouseDown={onDragStart}
            title="Kéo để thay đổi chiều cao log"
            style={{
              height: 8,
              background: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
              borderRadius: '0 0 8px 8px',
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            <div style={{ width: 36, height: 3, borderRadius: 99, background: 'rgba(148,163,184,0.4)' }} />
          </div>
        </div>
      )}
      {logFullscreen && <LogFullscreenModal logs={logs} onClose={() => setLogFullscreen(false)} />}
    </div>
  );
};

const summaryTone = (verdict?: string) => {
  if (verdict === 'good') return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', label: 'TỐT' };
  if (verdict === 'acceptable') return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'CHẤP NHẬN ĐƯỢC' };
  return { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', label: 'CẦN KIỂM TRA' };
};

const TrainSummaryCard: React.FC<{
  job: TrainingJob;
  onGenerateSummary: (jobId: string, refresh?: boolean) => Promise<void>;
}> = ({ job, onGenerateSummary }) => {
  const [busy, setBusy] = useState(false);
  const summary: TrainSummary | null = job.train_summary || null;
  const tone = summaryTone(summary?.verdict);
  const ai = summary?.ai_analysis;
  const modelRecommendation = ai?.model_recommendation;
  const suggestedModel = modelRecommendation?.model
    || modelRecommendation?.name
    || modelRecommendation?.recommended_model;
  const modelReason = modelRecommendation?.reason
    || modelRecommendation?.rationale
    || modelRecommendation?.why;
  const modelCost = modelRecommendation?.estimated_cost
    || modelRecommendation?.cost_estimate
    || modelRecommendation?.estimated_cost_usd;

  const generate = async () => {
    setBusy(true);
    try {
      await onGenerateSummary(job.id, Boolean(summary));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 18, border: `1px solid ${summary ? tone.border : '#DDD6FE'}`, borderRadius: 10, background: summary ? tone.bg : '#FAF5FF', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={summary ? tone.text : '#7C3AED'} />
          <strong style={{ color: summary ? tone.text : '#6D28D9', fontSize: 13 }}>AI TRAIN REVIEW</strong>
          {summary?.source && <span style={{ fontSize: 10, color: '#64748B' }}>({summary.source})</span>}
        </div>
        <button
          type="button"
          className="at-btn-icon-sm"
          onClick={() => void generate()}
          disabled={busy}
          style={{ width: 'auto', padding: '7px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6D28D9', border: '1px solid #C4B5FD', background: '#FFFFFF' }}
        >
          <Sparkles size={13} /> {busy ? 'Đang phân tích…' : summary ? 'Phân tích lại' : 'Phân tích kết quả'}
        </button>
      </div>

      {!summary ? (
        <p style={{ margin: '10px 0 0', color: '#6B7280', fontSize: 12, lineHeight: 1.5 }}>
          Khi job kết thúc, AI sẽ đọc loss, eval loss, log lỗi và chất lượng dữ liệu để đưa ra nhận xét.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 9px', borderRadius: 999, background: '#FFFFFF', color: tone.text, fontSize: 11, fontWeight: 800 }}>{tone.label}</span>
            <span style={{ color: tone.text, fontSize: 13 }}>{ai?.headline || summary.headline || 'Đã có kết quả phân tích.'}</span>
          </div>

          {(ai?.analysis || (!ai && summary.source === 'rules')) && (
            <p style={{ margin: '9px 0 0', color: '#334155', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {ai?.analysis || 'Chưa có OpenRouter key; đang hiển thị kết luận từ bằng chứng runtime, chưa phải phân tích AI.'}
            </p>
          )}

          {suggestedModel && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#FFFFFF', border: '1px solid #DDD6FE' }}>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Model do AI đề xuất</div>
              <div style={{ marginTop: 4, color: '#312E81', fontSize: 13, fontWeight: 800 }}>{String(suggestedModel)}</div>
              {modelReason && <div style={{ marginTop: 3, color: '#475569', fontSize: 12, lineHeight: 1.45 }}>{String(modelReason)}</div>}
              {modelCost !== undefined && modelCost !== null && (
                <div style={{ marginTop: 4, color: '#64748B', fontSize: 11 }}>
                  Ước tính chi phí: {typeof modelCost === 'object' ? JSON.stringify(modelCost) : String(modelCost)}
                </div>
              )}
            </div>
          )}

          {((summary.warnings?.length || 0) > 0 || (summary.recommendations?.length || 0) > 0 || (ai?.data_findings?.length || 0) > 0 || (ai?.recommendations?.length || 0) > 0) && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', color: '#475569', fontSize: 11, fontWeight: 700 }}>Chi tiết cảnh báo và khuyến nghị</summary>
              <div style={{ marginTop: 7, display: 'grid', gap: 4, color: '#475569', fontSize: 11, lineHeight: 1.45 }}>
                {[...(summary.warnings || []), ...(summary.recommendations || []), ...(ai?.data_findings || []), ...(ai?.training_findings || []), ...(ai?.recommendations || [])].map((item, index) => (
                  <div key={`${item}-${index}`}>• {item}</div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
};

// ── Component ──
const TrainingMonitor: React.FC<TrainingMonitorProps> = ({
  activeJobs,
  lossHistories,
  evalLossHistories,
  jobConfigs,
  onStopJob,
  onDismissJob,
  onChatTest,
  onGenerateSummary,
  completedJobId,
  onDismissSuccess,
}) => {
  const jobsList = useMemo(() => Object.values(activeJobs), [activeJobs]);
  const [selectedEvalJobId, setSelectedEvalJobId] = useState<string | null>(null);
  const [selectedTrainJobId, setSelectedTrainJobId] = useState<string | null>(null);
  const [chartFullscreenJobId, setChartFullscreenJobId] = useState<string | null>(null);
  const selectedEvalJob = selectedEvalJobId ? activeJobs[selectedEvalJobId] : null;
  const selectedTrainJob = selectedTrainJobId ? activeJobs[selectedTrainJobId] : null;

  // Combine train + eval loss data helper
  const getChartData = (id: string) => {
    const train = lossHistories[id] || [];
    const eval_ = evalLossHistories[id] || [];
    const combined: Record<string, any> = {};
    train.forEach((p) => {
      const key = p.step !== undefined ? `step-${p.step}` : `progress-${p.progress}`;
      combined[key] = { progress: p.progress, step: p.step, epoch: p.epoch, loss: p.loss };
    });
    eval_.forEach((p) => {
      const key = p.step !== undefined ? `step-${p.step}` : `progress-${p.progress}`;
      combined[key] = {
        ...combined[key],
        progress: p.progress,
        step: p.step,
        epoch: p.epoch,
        evalLoss: p.loss,
      };
    });
    return Object.values(combined).sort((a, b) => a.progress - b.progress);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'TRAINING':
        return 'at-badge-success pulsing';
      case 'COMPLETED':
        return 'at-badge-success';
      case 'QUEUED':
        return 'at-badge-warning';
      case 'STOPPED':
      case 'ERROR':
        return 'at-badge-danger';
      default:
        return 'at-badge-secondary';
    }
  };

  if (jobsList.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ──────── Success Popup Alert Banner ──────── */}
      {completedJobId && activeJobs[completedJobId] && (
        <div
          className="at-success-banner"
          style={{
            animation: 'atFadeIn 0.3s ease-out',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 'var(--at-radius-lg)',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ padding: 12, borderRadius: '50%', background: '#D1FAE5', color: '#059669' }}>
              <CheckCircle2 size={26} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#047857' }}>
                Training Completed Successfully! 🎉
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#065F46' }}>
                Your custom AI tutor <strong>{String(activeJobs[completedJobId]?.id || completedJobId || '').slice(-12)}</strong> is fully fine-tuned and ready.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="at-btn-primary"
              style={{ background: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 20px', borderRadius: 10, fontSize: 14 }}
              onClick={() => onChatTest(completedJobId)}
            >
              <MessageSquare size={16} /> Chat & Test Tutor
            </button>
            <button
              type="button"
              className="at-btn-icon-sm"
              style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46' }}
              onClick={onDismissSuccess}
              aria-label="Dismiss success notification"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ──────── Active Jobs Monitor Cards ──────── */}
      {jobsList.map((job) => {
        const jobIdStr = String(job.id || (job as any).job_id || '');
        const chartData = getChartData(job.id || (job as any).job_id);
        const hasLogs = job.logs && job.logs.length > 0;

        return (
          <div
            key={job.id || jobIdStr}
            className="at-panel"
            style={{
              animation: 'atFadeIn 0.3s ease-out',
              border: '1px solid var(--at-border)',
              borderRadius: 'var(--at-radius-lg)',
            }}
          >
            {/* Header section */}
            <div className="at-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={18} className="text-indigo-600" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                  Training Job: <span style={{ fontFamily: 'monospace', color: 'var(--at-accent)' }}>{jobIdStr.slice(-12)}</span>
                </h3>
                <span className={`at-badge ${getStatusBadgeClass(job.status)}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                  {job.status}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {['TRAINING', 'RUNNING', 'QUEUED', 'PENDING', 'LOADING_MODEL'].includes(job.status) && (
                  <button
                    type="button"
                    className="at-btn-icon-sm danger"
                    title="Dừng tiến trình này"
                    onClick={() => onStopJob(job.id)}
                    style={{ padding: '8px 12px', gap: 6, display: 'inline-flex', alignItems: 'center', width: 'auto', fontSize: '13px' }}
                  >
                    <StopCircle size={14} /> Dừng (Stop)
                  </button>
                )}
                <button
                  type="button"
                  className="at-btn-icon-sm"
                  title="Xóa thẻ khỏi màn hình"
                  onClick={() => onDismissJob(job.id)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="at-panel-body" style={{ padding: '20px' }}>

              {/* Friendly status summary — designed for non-ML teachers */}
              {(() => {
                const summary = deriveFriendlySummary(job, lossHistories[job.id] || [], evalLossHistories[job.id] || []);
                const palette = TONE_PALETTE[summary.tone];
                const TrendIcon = summary.trendIcon;
                return (
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '12px 14px',
                      marginBottom: 16,
                      background: palette.bg,
                      border: `1px solid ${palette.border}`,
                      borderRadius: 8,
                    }}
                  >
                    <TrendIcon size={18} style={{ color: palette.accent, flexShrink: 0, marginTop: 1, animation: summary.trendLabel === 'Queued' || summary.trendLabel === 'Starting' ? 'spin 2s linear infinite' : undefined }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <strong style={{ fontSize: 12, fontWeight: 700, color: palette.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {summary.trendLabel}
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: palette.text, lineHeight: 1.5 }}>
                        {summary.headline}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Progress bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--at-text-secondary)' }}>Overall Progress</span>
                  <span style={{ color: 'var(--at-accent)' }}>{Math.round(job.progress)}%</span>
                </div>
                <div style={{ height: 10, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${job.progress}%`,
                      background: 'linear-gradient(90deg, #4F46E5 0%, #7C3AED 100%)',
                      borderRadius: 99,
                      transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </div>
              </div>

              {/* Training metrics grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '12px',
                  marginBottom: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedTrainJobId(job.id)}
                  aria-label="Open train loss details"
                  style={{ background: '#F5F3FF', border: '1px solid #C4B5FD', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', color: 'inherit' }}
                >
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>TRAIN LOSS</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#4F46E5' }}>
                    {typeof job.loss === 'number' ? job.loss.toFixed(4) : '—'}
                  </span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: '#5B21B6' }}>Click for step detail</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEvalJobId(job.id)}
                  aria-label="Open eval loss details"
                  style={{ background: '#FFF7F7', border: '1px solid #FECACA', padding: '12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', color: 'inherit' }}
                >
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>EVAL LOSS</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626' }}>
                    {typeof job.eval_loss === 'number' ? job.eval_loss.toFixed(4) : '—'}
                  </span>
                  <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: '#B91C1C' }}>Click for sample detail</span>
                </button>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>GPU VRAM</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>
                    {job.vram_used ?? '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>GPU UTILIZATION</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>
                    {job.gpu_util ?? '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>EPOCH / STEP</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569', display: 'block', marginTop: 2 }}>
                    {job.current_epoch !== undefined && job.total_epochs !== undefined ? `${displayEpoch(job.current_epoch)}/${displayEpoch(job.total_epochs)}` : '—'} /{' '}
                    {job.current_step !== undefined && job.total_steps !== undefined ? `${displayInteger(job.current_step)}/${displayInteger(job.total_steps)}` : '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>LEARNING RATE</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                    {displayNumber(job.metrics?.learning_rate, 7)}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>GRAD NORM</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                    {displayNumber(job.metrics?.grad_norm, 4)}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>STEPS / EPOCH</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                    {displayInteger(job.metrics?.steps_per_epoch ?? job.effective_config?.schedule?.steps_per_epoch)}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>EVAL STATUS</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                    {job.eval_progress?.status || job.eval_status || '—'}
                  </span>
                </div>
              </div>

              <ConfigSummary job={job} jobConfig={jobConfigs[job.id]} />
              <TrainSummaryCard job={job} onGenerateSummary={onGenerateSummary} />

              {/* Chart & Terminal container */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: '20px',
                }}
              >
                {/* Loss curve chart */}
                <div
                  style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '16px',
                    background: '#FFFFFF',
                    height: '320px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Activity size={12} /> REAL-TIME LOSS CURVE
                    </span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '11px', fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4F46E5' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5', display: 'inline-block' }}></span>
                        Train Loss
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DC2626' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }}></span>
                        Eval Loss
                      </span>
                      {/* Expand chart button */}
                      <button
                        type="button"
                        onClick={() => setChartFullscreenJobId(job.id)}
                        title="Phóng to biểu đồ"
                        aria-label="Phóng to biểu đồ"
                        style={{ width: 26, height: 26, marginLeft: 4, display: 'grid', placeItems: 'center', border: '1px solid #E2E8F0', borderRadius: 6, background: '#F8FAFC', color: '#475569', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <Maximize2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0 }}>
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
                          <XAxis
                            dataKey="progress"
                            tickFormatter={(v) => `${Math.round(v)}%`}
                            stroke="#9CA3AF"
                            fontSize={10}
                          />
                          <YAxis stroke="#9CA3AF" fontSize={10} domain={['auto', 'auto']} />
                          <Tooltip
                            contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '11px', color: '#1F2937' }}
                            labelFormatter={(v) => `Progress: ${Math.round(Number(v))}%`}
                          />
                          <Line
                            type="monotone"
                            dataKey="loss"
                            name="Train Loss"
                            stroke="#4F46E5"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="evalLoss"
                            name="Eval Loss"
                            stroke="#DC2626"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '12px', fontStyle: 'italic' }}>
                        Waiting for loss metrics points...
                      </div>
                    )}
                  </div>
                </div>

                {/* Console Log window */}
                <div>
                  <CollapsibleConsole logs={job.logs || []} />
                </div>
              </div>
              {/* Chart fullscreen modal for this job */}
              {chartFullscreenJobId === job.id && (
                <ChartFullscreenModal chartData={chartData} onClose={() => setChartFullscreenJobId(null)} />
              )}

            </div>
          </div>
        );
      })}
      {selectedEvalJob && (
        <EvalDetailModal job={selectedEvalJob} onClose={() => setSelectedEvalJobId(null)} />
      )}
      {selectedTrainJob && (
        <TrainDetailModal
          job={selectedTrainJob}
          history={lossHistories[selectedTrainJob.id] || []}
          onClose={() => setSelectedTrainJobId(null)}
        />
      )}
    </div>
  );
};

export default TrainingMonitor;
