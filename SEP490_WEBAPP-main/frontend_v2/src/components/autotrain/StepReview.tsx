// ============================================================
// StepReview — AutoTrain Wizard Step 3: Review & Start
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  Zap,
  Cpu,
  Database,
  Sliders,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { TrainingConfig, PreviewData } from './types';

// ── Props ──
interface StepReviewProps {
  config: TrainingConfig;
  previewData: PreviewData;
  selectedPresetName: string;
  estimatedTime: string;
  systemResources: any;
  isStarting: boolean;
  onStartTraining: () => void;
  onBack: () => void;
}

// ── Helpers ──
function shortModelName(fullId: string): string {
  if (!fullId) return '';
  const parts = fullId.split('/');
  return parts[parts.length - 1] || fullId;
}

const StepReview: React.FC<StepReviewProps> = ({
  config,
  previewData,
  selectedPresetName,
  estimatedTime,
  systemResources,
  isStarting,
  onStartTraining,
  onBack,
}) => {
  const [showGpuGuide, setShowGpuGuide] = useState(false);

  // Check if GPU is online
  const isGpuOnline = useMemo(() => {
    if (!systemResources) return false;
    const workers = systemResources.workers || [];
    return workers.some((w: any) => w.status === 'online' || ('vram_total_mb' in w && !w.error));
  }, [systemResources]);

  const isOnlineModel = useMemo(() => {
    const onlineModelIds = ['qwen-3.7-plus', 'zai-org/GLM-4.7', 'stepfun-ai/Step-3.5-Flash'];
    return onlineModelIds.includes(config.baseModel);
  }, [config.baseModel]);

  const isStartDisabled = isStarting || !isGpuOnline || isOnlineModel;

  // Display label for dataset source
  const datasetDisplayLabel = useMemo(() => {
    if (config.datasetSource === 'local') {
      return config.localFile ? `Local file: ${config.localFile.name}` : 'No local file uploaded';
    }
    if (config.datasetSource === 'hub') {
      return config.selectedHfDataset ? `HuggingFace: ${config.selectedHfDataset}` : 'No HF dataset selected';
    }
    if (config.datasetSource === 'cloud') {
      return config.cloudLoadedDataset ? `Cloud: ${config.cloudLoadedDataset}` : 'No cloud dataset loaded';
    }
    return 'Unknown dataset source';
  }, [config.datasetSource, config.localFile, config.selectedHfDataset, config.cloudLoadedDataset]);

  // Truncate system prompt for preview
  const systemPromptPreview = useMemo(() => {
    const prompt = config.systemPrompt?.trim();
    if (!prompt) return 'Not set (Default chat behavior)';
    if (prompt.length <= 160) return prompt;
    return `${prompt.substring(0, 160)}...`;
  }, [config.systemPrompt]);

  return (
    <div className="at-wizard-layout-2col">
      {/* ── Left Column: Summary Card ── */}
      <div className="at-panel">
        <div className="at-panel-header">
          <div className="at-panel-header-left">
            <Sparkles size={16} style={{ color: 'var(--at-accent)' }} />
            <h3>Training Configuration Summary</h3>
          </div>
        </div>
        <div className="at-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Database size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Project Name</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{config.projectName}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Cpu size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Base Model</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{shortModelName(config.baseModel)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Database size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Dataset Source</span>
                <span style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{datasetDisplayLabel}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Clock size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Est. Time</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--at-green)' }}>{estimatedTime}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Sliders size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Parameter Preset</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedPresetName || 'Custom'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Database size={15} style={{ marginTop: 2, color: 'var(--at-text-secondary)' }} />
              <div>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Records & Tokens</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {previewData.totalRecords ? previewData.totalRecords.toLocaleString() : '0'} rows /{' '}
                  {previewData.totalTokens ? previewData.totalTokens.toLocaleString() : '0'} tokens
                </span>
              </div>
            </div>
          </div>

          {config.hfRepoId && (
            <div style={{ padding: 12, background: 'var(--at-accent-light)', border: '1px solid var(--at-border)', borderRadius: 'var(--at-radius)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--at-accent)' }}>HUGGINGFACE EXPORT CONFIG</span>
              <span style={{ fontSize: 12, color: 'var(--at-text-secondary)' }}>
                Model will push to: <strong>{config.hfRepoId}</strong>
              </span>
            </div>
          )}

          <div style={{ borderTop: '1px dashed var(--at-border)', paddingTop: 14 }}>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--at-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>System Persona Prompt</span>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--at-text-secondary)', fontStyle: config.systemPrompt ? 'normal' : 'italic', lineHeight: 1.5 }}>
              {systemPromptPreview}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right Column: GPU Status & Launch ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* GPU Status Card */}
        <div
          className="at-panel"
          style={{
            background: isGpuOnline ? '#ECFDF5' : '#FFF1F2',
            borderColor: isGpuOnline ? '#A7F3D0' : '#FECACA',
          }}
        >
          <div className="at-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 8, borderRadius: '50%', background: isGpuOnline ? '#D1FAE5' : '#FFE4E6', color: isGpuOnline ? 'var(--at-green)' : 'var(--at-red)' }}>
                {isGpuOnline ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: isGpuOnline ? '#065F46' : '#9F1239' }}>
                  {isGpuOnline ? 'GPU Server Online' : 'No GPU Server Connected'}
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: 12, color: isGpuOnline ? '#047857' : '#BE123C' }}>
                  {isGpuOnline
                    ? 'A background GPU worker is connected and ready to run.'
                    : 'A GPU worker connection is required to start local fine-tuning.'}
                </p>
              </div>
            </div>

            {isGpuOnline && systemResources?.workers && (
              <div style={{ borderTop: '1px solid #A7F3D0', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {systemResources.workers.map((worker: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#065F46' }}>
                    <span>💻 Worker: <strong>{worker.gpu_name || 'Worker GPU'}</strong></span>
                    <span>VRAM: <strong>{worker.vram_free || worker.vram_free_mb || '0'} GB free</strong></span>
                  </div>
                ))}
              </div>
            )}

            {!isGpuOnline && (
              <button
                type="button"
                className="at-btn-history"
                style={{ width: '100%', justifyContent: 'center', borderColor: '#FCA5A5', color: '#9F1239', background: 'transparent' }}
                onClick={() => setShowGpuGuide(g => !g)}
              >
                {showGpuGuide ? 'Hide instructions' : 'How to connect a GPU worker?'}
              </button>
            )}

            {showGpuGuide && !isGpuOnline && (
              <div style={{ animation: 'atSlideIn 0.2s ease-out', background: '#FFFFFF', border: '1px solid #FCA5A5', borderRadius: 'var(--at-radius)', padding: '12px 14px' }}>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9F1239', marginBottom: 6 }}>⚙️ GPU Worker Setup:</span>
                <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--at-text-secondary)', lineHeight: 1.6 }}>
                  <li>Start your GPU worker (e.g. app.py in Google Colab).</li>
                  <li>Copy the public GPU URL (e.g. https://xxxx.loca.lt).</li>
                  <li>Go to <strong>Settings &gt; System Config</strong> and paste it into "GPU Service URL".</li>
                  <li>Wait 5-10 seconds for the indicator to turn green.</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Start warning alert */}
        {!isGpuOnline && !isOnlineModel && (
          <div style={{ display: 'flex', gap: 8, padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--at-radius)', color: '#B45309', fontSize: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              If you start training now, the job will enter the QUEUED state and will not begin until a GPU worker connects.
            </span>
          </div>
        )}

        {/* Online Model Block Warning */}
        {isOnlineModel && (
          <div style={{ display: 'flex', gap: 8, padding: 12, background: '#FFF1F2', border: '1px solid #FECACA', borderRadius: 'var(--at-radius)', color: '#EF4444', fontSize: 12 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Configuration Error:</strong> Cannot train online model <strong>{config.baseModel}</strong> locally. Please go back to Step 2 and select a valid open-source model to proceed.
            </span>
          </div>
        )}

        {/* Action controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            gap: 16,
          }}
        >
          <button
            type="button"
            className="at-btn-history"
            style={{ padding: '12px 20px', gap: 6, display: 'inline-flex', alignItems: 'center' }}
            onClick={onBack}
            aria-label="Go back to step 2"
            disabled={isStarting}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <button
            type="button"
            className="at-btn-start"
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 'var(--at-radius)',
              background: isStartDisabled ? '#E5E7EB' : 'var(--at-accent)',
              color: isStartDisabled ? '#9CA3AF' : '#FFFFFF',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              cursor: isStartDisabled ? 'not-allowed' : 'pointer',
              opacity: isStarting ? 0.75 : 1,
            }}
            onClick={onStartTraining}
            disabled={isStartDisabled}
            aria-label="Start training run"
          >
            {isStarting ? (
              <>
                <span className="at-spinner" style={{ border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', width: 14, height: 14, animation: 'spin 0.6s linear infinite', marginRight: 4 }}></span>
                Starting...
              </>
            ) : (
              <>
                <Zap size={16} />
                Start Training
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepReview;
