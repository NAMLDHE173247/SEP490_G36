// ============================================================
// TrainingMonitor — AutoTrain Wizard: Training Job Monitor
// ============================================================

import React, { useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react';
import { TrainingJob, LossPoint } from './types';

// ── Props ──
interface TrainingMonitorProps {
  activeJobs: Record<string, TrainingJob>;
  lossHistories: Record<string, LossPoint[]>;
  evalLossHistories: Record<string, LossPoint[]>;
  onStopJob: (jobId: string) => void;
  onDismissJob: (jobId: string) => void;
  onChatTest: (jobId: string) => void;
  completedJobId: string | null;
  onDismissSuccess: () => void;
}

// ── Console Console Logger (Auto-Scroll) ──
const ConsoleTerminal: React.FC<{ logs: string[] }> = ({ logs }) => {
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
        height: '280px',
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
          logs.map((log, idx) => (
            <div key={idx} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span style={{ color: '#64748B', marginRight: 8, userSelect: 'none' }}>[{idx + 1}]</span>
              {log}
            </div>
          ))
        ) : (
          <div style={{ color: '#64748B', fontStyle: 'italic', textAlign: 'center', marginTop: 80 }}>
            Waiting for training stream output logs...
          </div>
        )}
      </div>
    </div>
  );
};

// ── Component ──
const TrainingMonitor: React.FC<TrainingMonitorProps> = ({
  activeJobs,
  lossHistories,
  evalLossHistories,
  onStopJob,
  onDismissJob,
  onChatTest,
  completedJobId,
  onDismissSuccess,
}) => {
  const jobsList = useMemo(() => Object.values(activeJobs), [activeJobs]);

  // Combine train + eval loss data helper
  const getChartData = (id: string) => {
    const train = lossHistories[id] || [];
    const eval_ = evalLossHistories[id] || [];
    const combined: Record<number, any> = {};
    train.forEach((p) => {
      combined[p.progress] = { progress: p.progress, loss: p.loss };
    });
    eval_.forEach((p) => {
      combined[p.progress] = {
        ...combined[p.progress],
        progress: p.progress,
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
                Your custom AI tutor <strong>{activeJobs[completedJobId].id.slice(-12)}</strong> is fully fine-tuned and ready.
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
        const chartData = getChartData(job.id);
        const hasLogs = job.logs && job.logs.length > 0;

        return (
          <div
            key={job.id}
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
                  Training Job: <span style={{ fontFamily: 'monospace', color: 'var(--at-accent)' }}>{job.id.slice(-12)}</span>
                </h3>
                <span className={`at-badge ${getStatusBadgeClass(job.status)}`} style={{ fontSize: '11px', fontWeight: 700 }}>
                  {job.status}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {job.status === 'TRAINING' && (
                  <button
                    type="button"
                    className="at-btn-icon-sm danger"
                    title="Stop Training"
                    onClick={() => onStopJob(job.id)}
                    style={{ padding: '8px 12px', gap: 6, display: 'inline-flex', alignItems: 'center', width: 'auto', fontSize: '13px' }}
                  >
                    <StopCircle size={14} /> Stop
                  </button>
                )}
                {(job.status === 'COMPLETED' || job.status === 'STOPPED' || job.status === 'ERROR') && (
                  <button
                    type="button"
                    className="at-btn-icon-sm"
                    title="Dismiss Job"
                    onClick={() => onDismissJob(job.id)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="at-panel-body" style={{ padding: '20px' }}>
              
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
                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>TRAIN LOSS</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#4F46E5' }}>
                    {job.loss ? job.loss.toFixed(4) : '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>EVAL LOSS</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626' }}>
                    {job.eval_loss ? job.eval_loss.toFixed(4) : '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>GPU VRAM</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>
                    {job.vram_used || '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>GPU UTILIZATION</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>
                    {job.gpu_util || '—'}
                  </span>
                </div>

                <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '12px', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>EPOCH / STEP</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569', display: 'block', marginTop: 2 }}>
                    {job.current_epoch && job.total_epochs ? `${job.current_epoch}/${job.total_epochs}` : '—'} /{' '}
                    {job.current_step && job.total_steps ? `${job.current_step}/${job.total_steps}` : '—'}
                  </span>
                </div>
              </div>

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
                    <div style={{ display: 'flex', gap: 12, fontSize: '11px', fontWeight: 600 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4F46E5' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5', display: 'inline-block' }}></span>
                        Train Loss
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#DC2626' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', display: 'inline-block' }}></span>
                        Eval Loss
                      </span>
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
                  <ConsoleTerminal logs={job.logs || []} />
                </div>
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TrainingMonitor;
