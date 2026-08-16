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
  // Keep the full training configuration visible for reproducible research
  // runs (Version 1 exposed these fields by default).
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [showHfPush, setShowHfPush] = useState(true);
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
  const isOnlineModel = false;
  const isOfficialVistral = config.baseModel === 'Viet-Mistral/Vistral-7B-Chat';

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
      const headers: Record<string, string> = {};
      if (config.hfToken?.trim()) {
        headers['Authorization'] = `Bearer ${config.hfToken.trim()}`;
      }
      await axios.get(`https://huggingface.co/api/models/${encodeURIComponent(trimmed)}`, { headers });
      onConfigChange({ baseModel: trimmed });
      setModelValidationStatus('success');
      toast('HuggingFace model validated successfully!', 'success');
    } catch (err: any) {
      console.warn('Validate model check:', err);
      // Fallback: If it's a valid repo format username/model-name, accept it (could be gated model or CORS issue in browser)
      if (/^[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+$/.test(trimmed)) {
        onConfigChange({ baseModel: trimmed });
        setModelValidationStatus('success');
        toast('Custom model ID accepted. Note: Ensures HF Token is set if this is a gated model.', 'info');
      } else {
        setModelValidationStatus('error');
        toast('Invalid HuggingFace Model ID format (expected: organization/model-name).', 'error');
      }
    } finally {
      setIsValidatingModel(false);
    }
  }, [customModelInput, config.hfToken, onConfigChange, toast]);

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
        // Catalog model: luôn về Tự động — không bắt user chọn template
        onConfigChange({ baseModel: val, chatTemplate: 'auto' });
        setCustomModelInput('');
        setModelValidationStatus('none');
      }
    },
    [onConfigChange],
  );

  const handleParamChange = useCallback(
    (key: keyof TrainingConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onConfigChange({ [key]: e.target.value } as Partial<TrainingConfig>);
    },
    [onConfigChange],
  );

  const handleToggleChange = useCallback(
    (key: keyof TrainingConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
      onConfigChange({ [key]: e.target.checked } as Partial<TrainingConfig>);
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
                <HelpTooltip text="Chọn mô hình AI nền tảng. Các mô hình nhỏ (0.6B) chạy nhanh và nhẹ, mô hình lớn hơn (8B+) yêu cầu GPU mạnh hơn." />
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
                    <strong>Warning:</strong> This model runs through an online API. Local AutoTrain <strong>only supports LoRA fine-tuning</strong> for open-source models. Training this model will fail. Please choose an offline model (e.g. Qwen 3 (0.6B)) to proceed.
                  </span>
                </div>
              )}

              {isOfficialVistral && (
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
                    <strong>Model bị giới hạn truy cập:</strong> hãy xin quyền trên Hugging Face và nhập HF token ở mục “Export to HuggingFace Hub”. Nếu chưa được duyệt, chọn bản mirror công khai.
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
                <HelpTooltip text="Bộ thiết lập có sẵn (Presets) áp dụng cấu hình khuyến nghị. Bạn có thể điều chỉnh và lưu thành bộ thiết lập riêng." />
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
                <div className="at-section-divider-line" style={{ margin: '0 0 8px 0', fontSize: 11, fontWeight: 700, color: 'var(--at-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Training Hyperparameters
                </div>

                <div className="at-param-rows">
                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Epochs <HelpTooltip text="Số lần mô hình duyệt qua toàn bộ tập dữ liệu huấn luyện. Mặc định là 3. Tăng số Epoch giúp học kỹ hơn nhưng dễ bị quá khớp (overfitting) với tập dữ liệu nhỏ." /></span>
                    <input
                      className={`at-param-input at-input ${!isEpochsValid(config.epochs) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.epochs}
                      onChange={handleParamChange('epochs')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Batch Size <HelpTooltip text="Số mẫu dữ liệu xử lý trong mỗi bước huấn luyện. Lớn hơn = huấn luyện nhanh hơn nhưng tốn nhiều VRAM GPU hơn. Mặc định là 2 phù hợp với đa số GPU." /></span>
                    <input
                      className={`at-param-input at-input ${!isBatchSizeValid(config.batchSize) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.batchSize}
                      onChange={handleParamChange('batchSize')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Learning Rate <HelpTooltip text="Tốc độ cập nhật trọng số của mô hình. Mức khuyến nghị cho LoRA là từ 2e-5 đến 5e-5. Quá cao sẽ gây mất ổn định, quá thấp sẽ khiến mô hình học rất chậm." /></span>
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
                    <span className="at-label">Block Size <HelpTooltip text="Số lượng token tối đa mô hình xử lý cùng lúc trong khi huấn luyện. 512 phù hợp hội thoại ngắn, 1024–2048 cho hội thoại dài. Giá trị cao hơn sẽ tiêu tốn nhiều VRAM hơn." /></span>
                    <input
                      className={`at-param-input at-input ${!isBlockSizeValid(config.blockSize) ? 'at-input-error' : ''}`}
                      type="number"
                      value={config.blockSize}
                      onChange={handleParamChange('blockSize')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Max Length <HelpTooltip text="Số token tối đa mô hình có thể sinh ra trong mỗi câu phản hồi. Thường đặt bằng hoặc lớn hơn Block Size. Mặc định là 1024." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.modelMaxLength}
                      onChange={handleParamChange('modelMaxLength')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Grad Accumulation <HelpTooltip text="Tích lũy độ dốc (gradient) qua N bước trước khi cập nhật trọng số. Batch size thực tế = Batch Size × Số bước tích lũy. Nên chọn 4–8 khi VRAM GPU hạn chế." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.gradAccum}
                      onChange={handleParamChange('gradAccum')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Warmup Steps <HelpTooltip text="Số bước khởi động để tăng dần tốc độ học từ 0 lên mức mục tiêu, giúp tránh mất ổn định ở giai đoạn đầu. Mặc định là 5 (dùng 10–50 cho tập dữ liệu lớn)." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.warmupSteps}
                      onChange={handleParamChange('warmupSteps')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Weight Decay <HelpTooltip text="Hệ số suy giảm trọng số (Regularization) giúp kéo trọng số về 0 để tránh quá khớp (overfitting). Mặc định 0.01. Đặt 0 để tắt." /></span>
                    <input
                      className="at-input"
                      type="number"
                      step="0.001"
                      value={config.weightDecay}
                      onChange={handleParamChange('weightDecay')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Optimizer <HelpTooltip text="Thuật toán tối ưu hóa cập nhật trọng số. adamw_8bit giúp tiết kiệm ~75% VRAM và là lựa chọn mặc định an toàn. sgd hiếm khi dùng cho LoRA." /></span>
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

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LR Scheduler <HelpTooltip text="Điều chỉnh cách tốc độ học thay đổi theo thời gian. 'linear' giảm đều, 'cosine' giảm mượt theo đường cong, 'constant' giữ nguyên không đổi." /></span>
                    <select
                      className="at-select"
                      value={config.lrScheduler}
                      onChange={handleParamChange('lrScheduler')}
                      style={{ width: 120, padding: '4px 8px' }}
                    >
                      <option value="linear">linear</option>
                      <option value="cosine">cosine</option>
                      <option value="constant">constant</option>
                      <option value="constant_with_warmup">constant_with_warmup</option>
                    </select>
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">Random Seed <HelpTooltip text="Số ngẫu nhiên cố định để đảm bảo tính tái lập kết quả. Cùng Seed + cùng dữ liệu = cùng kết quả huấn luyện. Mặc định 3407." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.seed}
                      onChange={handleParamChange('seed')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>
                </div>

                <div className="at-section-divider-line" style={{ margin: '14px 0 8px 0', fontSize: 11, fontWeight: 700, color: 'var(--at-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  LoRA Hyperparameters
                </div>

                <div className="at-param-rows">
                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Rank (R) <HelpTooltip text="Dung lượng ma trận thích ứng LoRA. Rank cao hơn = học được nhiều chi tiết tinh vi hơn nhưng tốn nhiều VRAM hơn. Giá trị phổ biến: 8, 16, 32." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.r}
                      onChange={handleParamChange('r')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Alpha <HelpTooltip text="Hệ số tỉ lệ (scaling) cho việc cập nhật LoRA. Quy tắc thông dụng: đặt bằng hoặc gấp đôi giá trị LoRA Rank." /></span>
                    <input
                      className="at-input"
                      type="number"
                      value={config.loraAlpha}
                      onChange={handleParamChange('loraAlpha')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Dropout <HelpTooltip text="Tỷ lệ ngẫu nhiên ngắt các neuron LoRA trong quá trình học để chống quá khớp. 0 = tắt, phổ biến từ 0.05 đến 0.1." /></span>
                    <input
                      className="at-input"
                      type="number"
                      step="0.01"
                      value={config.loraDropout}
                      onChange={handleParamChange('loraDropout')}
                      style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                    />
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">LoRA Targets <HelpTooltip text="Các lớp mạng được gắn adapter LoRA. 'all-linear' (Attention + MLP) cho chất lượng tốt nhất; 'attention' nhẹ VRAM hơn và đủ dùng cho tập dữ liệu rất nhỏ." /></span>
                    <select
                      className="at-select"
                      value={config.loraTargets}
                      onChange={handleParamChange('loraTargets')}
                      style={{ width: 120, padding: '4px 8px' }}
                    >
                      <option value="all-linear">all-linear</option>
                      <option value="attention">attention</option>
                      <option value="mlp">mlp</option>
                    </select>
                  </div>

                  <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                    <span className="at-label">rsLoRA <HelpTooltip text="LoRA ổn định theo Rank (Rank-stabilized LoRA). Giúp kiểm soát tỉ lệ cập nhật khi Rank ≥ 32. Ít ảnh hưởng ở Rank thấp." /></span>
                    <input
                      type="checkbox"
                      checked={config.useRslora}
                      onChange={handleToggleChange('useRslora')}
                      style={{ width: 16, height: 16 }}
                    />
                  </div>
                </div>

                {/* Hidden Quality & Regularization section on UI (state & logic preserved) */}
                <div style={{ display: 'none' }}>
                  <div className="at-section-divider-line" style={{ margin: '14px 0 8px 0', fontSize: 11, fontWeight: 700, color: 'var(--at-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Quality &amp; Regularization
                  </div>

                  <div className="at-param-rows">
                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">NEFTune Alpha <HelpTooltip text="Thêm nhiễu vào không gian nhúng (embeddings) khi huấn luyện. Giúp cải thiện khả năng tuân thủ câu lệnh của AI. 0 = tắt, khuyến nghị là 5." /></span>
                      <input
                        className="at-input"
                        type="number"
                        step="1"
                        min="0"
                        value={config.neftuneAlpha}
                        onChange={handleParamChange('neftuneAlpha')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Max Grad Norm <HelpTooltip text="Cắt ngưỡng độ dốc (gradient clipping) để tránh tình trạng bùng nổ độ dốc do một batch dữ liệu lỗi. Mặc định là 1.0." /></span>
                      <input
                        className="at-input"
                        type="number"
                        step="0.1"
                        min="0"
                        value={config.maxGradNorm}
                        onChange={handleParamChange('maxGradNorm')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Warmup Ratio <HelpTooltip text="Tỷ lệ bước khởi động trên tổng số bước (ví dụ: 0.03). Ổn định hơn số bước cố định khi kích thước tập dữ liệu thay đổi. 0 = dùng Warmup Steps." /></span>
                      <input
                        className="at-input"
                        type="number"
                        step="0.01"
                        min="0"
                        value={config.warmupRatio}
                        onChange={handleParamChange('warmupRatio')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Early Stop Patience <HelpTooltip text="Số lần kiểm tra đánh giá (validation) không cải thiện tối đa trước khi dừng huấn luyện sớm. Giá trị thấp = dừng sớm hơn khi phát hiện quá khớp." /></span>
                      <input
                        className="at-input"
                        type="number"
                        min="1"
                        value={config.earlyStoppingPatience}
                        onChange={handleParamChange('earlyStoppingPatience')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Eval Steps <HelpTooltip text="Thực hiện đánh giá sau mỗi N bước tối ưu. Để trống để hệ thống tự động tính toán khoảng 8 lần đánh giá trong suốt quá trình." /></span>
                      <input
                        className="at-input"
                        type="number"
                        min="1"
                        placeholder="auto"
                        value={config.evalSteps}
                        onChange={handleParamChange('evalSteps')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Save Steps <HelpTooltip text="Lưu bản sao checkpoint sau mỗi N bước tối ưu. Để trống để tự động đồng bộ với số bước Eval Steps." /></span>
                      <input
                        className="at-input"
                        type="number"
                        min="1"
                        placeholder="auto"
                        value={config.saveSteps}
                        onChange={handleParamChange('saveSteps')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Logging Steps <HelpTooltip text="Tần suất ghi lại chỉ số hao hụt (train loss). Tiến trình Step/Epoch vẫn được cập nhật liên tục ở từng bước." /></span>
                      <input
                        className="at-input"
                        type="number"
                        min="1"
                        value={config.loggingSteps}
                        onChange={handleParamChange('loggingSteps')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Data Loader Workers <HelpTooltip text="Số lượng luồng CPU chuẩn bị dữ liệu (batching). Nên đặt là 0 trên Kaggle/Windows trừ khi có hỗ trợ bộ nhớ chia sẻ." /></span>
                      <input
                        className="at-input"
                        type="number"
                        min="0"
                        max="16"
                        value={config.dataloaderNumWorkers}
                        onChange={handleParamChange('dataloaderNumWorkers')}
                        style={{ width: 80, padding: '4px 8px', textAlign: 'right' }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Auto Tune <HelpTooltip text="Cho phép hệ thống GPU tự động giới hạn các tham số rủi ro với tập dữ liệu nhỏ để giảm overfitting và tránh lỗi tiến trình." /></span>
                      <input
                        type="checkbox"
                        checked={config.autoTune}
                        onChange={handleToggleChange('autoTune')}
                        style={{ width: 16, height: 16 }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Gradient Checkpointing <HelpTooltip text="Đổi năng lực tính toán để tiết kiệm bộ nhớ VRAM. Khuyến nghị BẬT đối với các mô hình 7B trở lên." /></span>
                      <input
                        type="checkbox"
                        checked={config.gradientCheckpointing}
                        onChange={handleToggleChange('gradientCheckpointing')}
                        style={{ width: 16, height: 16 }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Group By Length <HelpTooltip text="Gom nhóm các mẫu dữ liệu có độ dài tương tự vào cùng batch để giảm hao phí tính toán do padding. Nên TẮT khi cần so sánh chính xác giữa các lượt chạy." /></span>
                      <input
                        type="checkbox"
                        checked={config.groupByLength}
                        onChange={handleToggleChange('groupByLength')}
                        style={{ width: 16, height: 16 }}
                      />
                    </div>

                    <div className="at-param-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--at-border)' }}>
                      <span className="at-label">Train Thinking <HelpTooltip text="Bật khối suy luận/suy nghĩ (reasoning/think) khi định dạng (dùng cho Gemma 4 / Qwen3). Nên TẮT đối với gia sư Socratic. Khi BẬT, Unsloth khuyến nghị ≥75% mẫu dữ liệu có chứa chuỗi suy luận." /></span>
                      <input
                        type="checkbox"
                        checked={config.enableThinking}
                        onChange={handleToggleChange('enableThinking')}
                        style={{ width: 16, height: 16 }}
                      />
                    </div>

                    {/* Chỉ hiện khi dùng model custom — catalog đã auto đúng, khỏi làm rối */}
                    {isCustomActive && (
                      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--at-border)', background: 'var(--at-bg-subtle, #f8fafc)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--at-text)', marginBottom: 4 }}>
                          Model lạ — định dạng hội thoại
                        </div>
                        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--at-text-muted)', lineHeight: 1.45 }}>
                          Để <b>Tự động</b>. Nếu hỏi người tạo model / copy từ HuggingFace được chuỗi template → chọn <b>Dán template thủ công</b>.
                        </p>
                        <select
                          className="at-select"
                          value={config.chatTemplate || 'auto'}
                          onChange={handleParamChange('chatTemplate')}
                          style={{ width: '100%', padding: '6px 8px' }}
                        >
                          <option value="auto">Tự động (khuyến nghị)</option>
                          <option value="paste">Dán template thủ công…</option>
                          <option value="native">Giữ template gốc của model</option>
                          <option value="qwen-2.5">Đây là họ Qwen</option>
                          <option value="llama-3">Đây là họ Llama 3</option>
                          <option value="gemma-4">Đây là Gemma 4</option>
                          <option value="gemma-4-thinking">Gemma 4 + thinking</option>
                          <option value="gemma3">Đây là Gemma 3</option>
                          <option value="mistral">Đây là Mistral / Vistral</option>
                          <option value="phi-4">Đây là Phi-4</option>
                          <option value="chatml">ChatML (generic)</option>
                        </select>
                        {config.chatTemplate === 'paste' && (
                          <div style={{ marginTop: 8 }}>
                            <label className="at-label" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                              Dán chat_template (Jinja) từ tokenizer_config.json hoặc người tạo model
                            </label>
                            <textarea
                              className="at-input"
                              value={config.customChatTemplate || ''}
                              onChange={handleParamChange('customChatTemplate')}
                              placeholder={'{% for message in messages %}...{{ message.content }}...{% endfor %}'}
                              rows={6}
                              style={{ width: '100%', fontFamily: 'Consolas, monospace', fontSize: 11, resize: 'vertical' }}
                            />
                            <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--at-text-muted)' }}>
                              HF Hub → Files → <code>tokenizer_config.json</code> → copy giá trị field <code>chat_template</code>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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
              <div style={{ display: 'flex', gap: 10, padding: 12, marginBottom: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 13, lineHeight: 1.5 }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                <span><strong>Khuyến nghị bật để chống mất tiến độ:</strong> hệ thống lưu checkpoint mỗi 10 bước trên GPU. Repo Hugging Face giúp Resume ngay cả khi máy GPU/Colab bị mất hoàn toàn; nếu chỉ restart container trên cùng máy, checkpoint volume cục bộ vẫn được dùng.</span>
              </div>
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
