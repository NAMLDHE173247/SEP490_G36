// ============================================================
// StepConfig — AutoTrain Wizard Step 2: Parameter Configuration
// ============================================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { HelpCircle, Save, Trash2, ChevronDown, ChevronUp, ArrowLeft, ArrowRight, Key, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import {
  TrainingConfig,
  PreviewData,
  BASE_MODEL_GROUPS,
  SYSTEM_PROMPT_TEMPLATES,
  DEFAULT_PRESETS,
} from './types';

// ── Props ──
interface StepConfigProps {
  config: TrainingConfig;
  onConfigChange: (updates: Partial<TrainingConfig>) => void;
  previewData: PreviewData;
  selectedPresetName: string;
  onPresetChange: (name: string) => void;
  customPresets: Record<string, any>;
  onSavePreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onNext: () => void;
  onBack: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

// ── Tooltip helper ──
const HelpTooltip: React.FC<{ text: string }> = ({ text }) => (
  <span className="at-tooltip">
    <HelpCircle className="at-tooltip-icon" size={14} />
    <span className="at-tooltip-content">{text}</span>
  </span>
);

// ── Validation helpers ──
function isEpochsValid(v: string): boolean {
  const n = Number(v);
  return v !== '' && !isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 100;
}
function isBatchSizeValid(v: string): boolean {
  const n = Number(v);
  return v !== '' && !isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 64;
}
function isLearningRateValid(v: string): boolean {
  const n = Number(v);
  return v !== '' && !isNaN(n) && n > 0 && n < 1;
}
function isBlockSizeValid(v: string): boolean {
  const n = Number(v);
  return v !== '' && !isNaN(n) && Number.isInteger(n) && n >= 64 && n <= 8192;
}

const StepConfig: React.FC<StepConfigProps> = ({
  config,
  onConfigChange,
  previewData,
  selectedPresetName,
  onPresetChange,
  customPresets,
  onSavePreset,
  onDeletePreset,
  onNext,
  onBack,
  toast,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHfPush, setShowHfPush] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCustomPreset = useMemo(
    () => selectedPresetName !== '' && !(selectedPresetName in DEFAULT_PRESETS),
    [selectedPresetName],
  );

  const isPredefinedModel = useMemo(() => {
    return BASE_MODEL_GROUPS.some(group => 
      group.models.some(m => m.id === config.baseModel)
    );
  }, [config.baseModel]);

  const isCustomActive = config.baseModel === 'custom' || !isPredefinedModel;
  const isOnlineModel = useMemo(() => {
    const onlineModelIds = ['qwen-3.7-plus', 'zai-org/GLM-4.7', 'stepfun-ai/Step-3.5-Flash'];
    return onlineModelIds.includes(config.baseModel);
  }, [config.baseModel]);

  const [customModelInput, setCustomModelInput] = useState(isPredefinedModel ? '' : config.baseModel);
  const [isValidatingModel, setIsValidatingModel] = useState(false);
  const [modelValidationStatus, setModelValidationStatus] = useState<'none' | 'success' | 'error'>('none');

  useEffect(() => {
    if (isPredefinedModel) {
      setCustomModelInput('');
      setModelValidationStatus('none');
    } else if (config.baseModel !== 'custom') {
      setCustomModelInput(config.baseModel);
      setModelValidationStatus('success');
    }
  }, [config.baseModel, isPredefinedModel]);

  const validateCustomModel = useCallback(async () => {
    const trimmed = customModelInput.trim();
    if (!trimmed) {
      toast('Please enter a HuggingFace model path.', 'error');
      return;
    }

    setIsValidatingModel(true);
    setModelValidationStatus('none');
    try {
      const response = await axios.get(`https://huggingface.co/api/models/${encodeURIComponent(trimmed)}`);
      if (response.status === 200) {
        onConfigChange({ baseModel: trimmed });
        setModelValidationStatus('success');
        toast('HuggingFace model validated successfully!', 'success');
      }
    } catch (err) {
      console.error('Validate model error:', err);
      setModelValidationStatus('error');
      toast('Model not found on HuggingFace Hub. Ensure it is public and correct.', 'error');
    } finally {
      setIsValidatingModel(false);
    }
  }, [customModelInput, onConfigChange, toast]);

  const defaultPresetNames = useMemo(() => Object.keys(DEFAULT_PRESETS), []);
  const customPresetNames = useMemo(() => Object.keys(customPresets), [customPresets]);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === 'custom') {
        onConfigChange({ baseModel: 'custom' });
        setCustomModelInput('');
        setModelValidationStatus('none');
      } else {
        onConfigChange({ baseModel: val });
        setCustomModelInput('');
        setModelValidationStatus('none');
      }
    },
    [onConfigChange],
  );

  const handleParamChange = useCallback(
    (key: keyof TrainingConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onConfigChange({ [key]: e.target.value } as Partial<TrainingConfig>);
    },
    [onConfigChange],
  );

  const handlePresetSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onPresetChange(e.target.value);
    },
    [onPresetChange],
  );

  const handleSavePreset = useCallback(() => {
    const name = savePresetName.trim();
    if (!name) {
      toast('Please enter a preset name', 'error');
      return;
    }
    if (name in DEFAULT_PRESETS) {
      toast('Cannot overwrite a system preset', 'error');
      return;
    }
    onSavePreset(name);
    toast(`Preset "${name}" saved successfully`, 'success');
    setShowSaveInput(false);
    setSavePresetName('');
  }, [savePresetName, onSavePreset, toast]);

  const handleDeletePreset = useCallback(() => {
    onDeletePreset(selectedPresetName);
    toast(`Preset "${selectedPresetName}" deleted`, 'info');
    setConfirmDelete(false);
  }, [selectedPresetName, onDeletePreset, toast]);

  return (
    <div className="at-wizard-layout-2col">
      {/* ── Left Column: Base Model & Hyperparameters ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Model Selection Panel */}
        <div className="at-panel">
          <div className="at-panel-header">
            <div className="at-panel-header-left">
              <h3>Model Selection</h3>
            </div>
          </div>
          <div className="at-panel-body">
            <div className="at-form-group primary">
              <label className="at-label">
                Base AI Model
                <HelpTooltip text="Choose the base AI model. Smaller models (0.6B) are fast and light, larger ones (8B+) require powerful GPUs." />
              </label>
              <select
                className="at-select"
                value={isCustomActive ? 'custom' : config.baseModel}
                onChange={handleModelChange}
                aria-label="Base model selection"
              >
                {BASE_MODEL_GROUPS.map(group => (
                  <optgroup key={group.category} label={group.category}>
                    {group.models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Custom Models">
                  <option value="custom">🤗 Custom HuggingFace Model ID...</option>
                </optgroup>
              </select>

              {/* Custom Model Repo ID input */}
              {isCustomActive && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label className="at-label" style={{ fontSize: 12 }}>
                    HuggingFace Model Repo ID
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="at-input"
                      placeholder="e.g. Qwen/Qwen2.5-Coder-0.5B-Instruct"
                      value={customModelInput}
                      onChange={e => {
                        setCustomModelInput(e.target.value);
                        setModelValidationStatus('none');
                      }}
                      onKeyDown={e => e.key === 'Enter' && validateCustomModel()}
                      aria-label="Custom HuggingFace model ID"
                    />
                    <button
                      type="button"
                      className="at-btn-primary"
                      disabled={isValidatingModel}
                      onClick={validateCustomModel}
                      style={{ padding: '8px 16px', minWidth: 100 }}
                    >
                      {isValidatingModel ? 'Validating…' : 'Validate'}
                    </button>
                  </div>
                  {modelValidationStatus === 'success' && (
                    <span style={{ fontSize: 12, color: 'var(--at-green)', fontWeight: 600 }}>
                      ✓ Model validated and loaded successfully!
                    </span>
                  )}
                  {modelValidationStatus === 'error' && (
                    <span style={{ fontSize: 12, color: 'var(--at-red)', fontWeight: 600 }}>
                      ✗ Model not found on HuggingFace Hub.
                    </span>
                  )}
                </div>
              )}

              {/* Online Model Warning */}
              {isOnlineModel && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: 12,
                    background: 'var(--at-amber-bg)',
                    border: '1px solid var(--at-amber-border)',
                    borderRadius: 'var(--at-radius)',
                    color: '#B45309',
                    fontSize: 12,
                    marginTop: 10,
                    lineHeight: 1.5,
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>Cảnh báo:</strong> Mô hình này hoạt động qua API trực tuyến. Hệ thống AutoTrain cục bộ <strong>chỉ hỗ trợ huấn luyện LoRA</strong> cho các mô hình mã nguồn mở. Việc huấn luyện mô hình này sẽ thất bại. Vui lòng chọn mô hình offline (ví dụ: Qwen 3 (0.6B)) để tiến hành huấn luyện.
                  </span>
                </div>
              )}

              {config.baseModel === 'qwen-3.7-plus' && (
                <div className="at-form-group" style={{ marginTop: 14 }}>
                  <label className="at-label">
                    <Key size={13} style={{ marginRight: 4 }} />
                    API Key
                  </label>
                  <input
                    className="at-input"
                    type="password"
                    placeholder="Enter your API key"
                    value={config.apiKey}
                    onChange={handleParamChange('apiKey')}
                    aria-label="API key"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hyperparameters Config Panel */}
        <div className="at-panel">
          <div className="at-panel-header">
            <div className="at-panel-header-left">
              <h3>Parameters & Presets</h3>
            </div>
          </div>
          <div className="at-panel-body">
            <div className="at-form-group">
              <label className="at-label">
                Select Parameter Preset
                <HelpTooltip text="Presets apply recommended settings. You can modify them and save them as custom presets." />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  className="at-select"
                  value={selectedPresetName}
                  onChange={handlePresetSelect}
                  aria-label="Parameter preset"
                  style={{ flex: 1 }}
                >
                  <optgroup label="System Presets">
                    {defaultPresetNames.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                  {customPresetNames.length > 0 && (
                    <optgroup label="Custom Presets">
                      {customPresetNames.map(name => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <button
                  type="button"
                  className="at-btn-icon-sm"
                  title="Save current parameters as preset"
                  onClick={() => setShowSaveInput(s => !s)}
                  aria-label="Save preset"
                >
                  <Save size={14} />
                </button>

                {isCustomPreset && (
                  <button
                    type="button"
                    className="at-btn-icon-sm danger"
                    title="Delete this custom preset"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete preset"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Inline input to Save Preset */}
              {showSaveInput && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, animation: 'atSlideIn 0.15s ease-out' }}>
                  <input
                    className="at-input"
                    type="text"
                    placeholder="New preset name..."
                    value={savePresetName}
                    onChange={e => setSavePresetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                    autoFocus
                    aria-label="New preset name"
                  />
                  <button type="button" className="at-btn-primary" onClick={handleSavePreset} style={{ padding: '6px 12px', fontSize: 13 }}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="at-btn-icon-sm"
                    onClick={() => {
                      setShowSaveInput(false);
                      setSavePresetName('');
                    }}
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Inline delete confirmation */}
              {confirmDelete && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    padding: '10px 14px',
                    background: 'var(--at-red-bg)',
                    border: '1px solid #FECACA',
                    borderRadius: 'var(--at-radius)',
                    animation: 'atSlideIn 0.15s ease-out',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--at-red)', fontWeight: 600, flex: 1 }}>
                    Delete "{selectedPresetName}"?
                  </span>
                  <button
                    type="button"
                    className="at-btn-primary"
                    style={{ background: 'var(--at-red)', borderColor: 'var(--at-red)', fontSize: 12, padding: '4px 10px' }}
                    onClick={handleDeletePreset}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="at-btn-icon-sm"
                    onClick={() => setConfirmDelete(false)}
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Collapsible Advanced Parameters */}
            <button
              type="button"
              className="at-advanced-toggle"
              onClick={() => setShowAdvanced(v => !v)}
              aria-expanded={showAdvanced}
              style={{ marginTop: 16 }}
            >
              ⚙️ Expert Training Parameters
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 12, animation: 'atSlideIn 0.2s ease-out' }}>
                <div className="at-param-rows">
                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Epochs <HelpTooltip text="Number of complete training passes over the dataset (1-100)." /></span>
                    <input
                      className={`at-param-input at-input ${!isEpochsValid(config.epochs) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.epochs}
                      onChange={handleParamChange('epochs')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Batch Size <HelpTooltip text="Data samples processed per step (1-64)." /></span>
                    <input
                      className={`at-param-input at-input ${!isBatchSizeValid(config.batchSize) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.batchSize}
                      onChange={handleParamChange('batchSize')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Learning Rate <HelpTooltip text="Rate of weights adjustment (between 0 and 1)." /></span>
                    <input
                      className={`at-param-input at-input ${!isLearningRateValid(config.learningRate) ? 'at-input-error' : ''}`}
                      type="number"
                      step="0.00001"
                      value={config.learningRate}
                      onChange={handleParamChange('learningRate')}
                      style={{ width: 100, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Block Size <HelpTooltip text="Text segment context size (64-8192)." /></span>
                    <input
                      className={`at-param-input at-input ${!isBlockSizeValid(config.blockSize) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.blockSize}
                      onChange={handleParamChange('blockSize')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Max Length <HelpTooltip text="Maximum response tokens sequence length." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.modelMaxLength}
                      onChange={handleParamChange('modelMaxLength')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Optimizer <HelpTooltip text="Optimization algorithm. adamw_8bit saves 75% memory." /></span>
                    <select
                      className="at-select"
                      value={config.optim}
                      onChange={handleParamChange('optim')}
                      style={{ width: 120, padding: '4px 8px' }}
                    >
                      <option value="adamw_8bit">adamw_8bit</option>
                      <option value="adamw_hf">adamw_hf</option>
                      <option value="sgd">sgd</option>
                    </select>
                  </div>
                </div>

                <div className="at-section-divider-line" style={{ margin: '14px 0 8px 0', fontSize: 11, fontWeight: 700, color: 'var(--at-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  LoRA Hyperparameters
                </div>

                <div className="at-param-rows">
                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Rank (R) <HelpTooltip text="Maxtrix adaptation width. Common: 8, 16, 32." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.r}
                      onChange={handleParamChange('r')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Alpha <HelpTooltip text="Scaling coefficient. Set equal or double the rank." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.loraAlpha}
                      onChange={handleParamChange('loraAlpha')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Column: Prompt & Registry Push ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* System Prompt Panel */}
        <div className="at-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="at-panel-header">
            <div className="at-panel-header-left">
              <h3>System Persona Prompt</h3>
            </div>
          </div>
          <div className="at-panel-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="at-panel-subtitle" style={{ marginBottom: 0 }}>
              Define default persona rules and behavior guidelines for your trained AI tutor.
            </p>

            {/* Prompt Templates Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SYSTEM_PROMPT_TEMPLATES.map(tpl => (
                <button
                  key={tpl.label}
                  type="button"
                  className="at-btn-history"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => onConfigChange({ systemPrompt: tpl.text })}
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            <textarea
              className="at-textarea"
              placeholder="e.g. You are a Socratic tutor. Guide students using questions rather than direct answers..."
              value={config.systemPrompt}
              onChange={e => onConfigChange({ systemPrompt: e.target.value })}
              style={{ flex: 1, minHeight: 160 }}
              aria-label="System prompt input"
            />
          </div>
        </div>

        {/* HuggingFace Push Panel */}
        <div className="at-panel">
          <button
            type="button"
            className="at-panel-header"
            onClick={() => setShowHfPush(v => !v)}
            style={{ width: '100%', border: 'none', background: '#FAF9FB', cursor: 'pointer', textAlign: 'left' }}
          >
            <div className="at-panel-header-left">
              <h3>🤗 Export to HuggingFace Hub</h3>
            </div>
            {showHfPush ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showHfPush && (
            <div className="at-panel-body" style={{ animation: 'atSlideIn 0.2s ease-out' }}>
              <div className="at-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="at-form-group">
                  <label className="at-label">Repo ID</label>
                  <input
                    className="at-input"
                    type="text"
                    placeholder="username/my-tutor-model"
                    value={config.hfRepoId}
                    onChange={handleParamChange('hfRepoId')}
                  />
                </div>
                <div className="at-form-group">
                  <label className="at-label">Access Token</label>
                  <input
                    className="at-input"
                    type="password"
                    placeholder="hf_..."
                    value={config.hfToken}
                    onChange={handleParamChange('hfToken')}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="at-btn-history"
            style={{ padding: '10px 18px', gap: 6, display: 'inline-flex', alignItems: 'center' }}
            onClick={onBack}
            aria-label="Go back to step 1"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            type="button"
            className="at-btn-primary"
            onClick={onNext}
            aria-label="Continue to step 3"
          >
            Next <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepConfig;
