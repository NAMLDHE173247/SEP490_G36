// ============================================================
// AutoTrainView — Main Wizard-based training flow container
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import {
  Zap,
  History,
  AlertTriangle,
  CheckCircle,
  X,
} from 'lucide-react';
import { getAuthToken } from '../services/authSession';
import '../styles/autotrain.css';

// ── Component Imports ──
import WizardStepper from '../components/autotrain/WizardStepper';
import WelcomeCard from '../components/autotrain/WelcomeCard';
import ConfirmModal from '../components/autotrain/ConfirmModal';
import StepDataset from '../components/autotrain/StepDataset';
import StepConfig from '../components/autotrain/StepConfig';
import StepReview from '../components/autotrain/StepReview';
import TrainingMonitor from '../components/autotrain/TrainingMonitor';

// ── Shared Types & Constants ──
import {
  TrainingConfig,
  PreviewData,
  DEFAULT_TRAINING_CONFIG,
  EMPTY_PREVIEW,
  DEFAULT_PRESETS,
  estimateTrainingTime,
  formatRowPreview,
  TrainingJob,
  LossPoint,
} from '../components/autotrain/types';

// ── Persistent Global State (Preserves tracking when switching tabs) ──
const globalTrainingState = {
  activeJobs: {} as Record<string, TrainingJob>,
  lossHistories: {} as Record<string, LossPoint[]>,
  evalLossHistories: {} as Record<string, LossPoint[]>,
  jobConfigs: {} as Record<string, any>,
  eventSources: {} as Record<string, EventSource>,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach((l) => l());
  },
};

const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AUTOTRAIN_CONFIG_STORAGE_KEY = 'autotrain_last_config_v1';
const AUTOTRAIN_PRESET_STORAGE_KEY = 'autotrain_selected_preset_v1';

const loadPersistedTrainingConfig = (): TrainingConfig => {
  if (typeof window === 'undefined') return DEFAULT_TRAINING_CONFIG;
  try {
    const saved = JSON.parse(localStorage.getItem(AUTOTRAIN_CONFIG_STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_TRAINING_CONFIG,
      ...saved,
      // Browser File objects and secrets must never be persisted.
      localFile: null,
      apiKey: '',
      hfToken: '',
    };
  } catch {
    return DEFAULT_TRAINING_CONFIG;
  }
};

const persistTrainingConfig = (config: TrainingConfig): void => {
  if (typeof window === 'undefined') return;
  const { localFile, apiKey, hfToken, ...safeConfig } = config;
  void localFile;
  void apiKey;
  void hfToken;
  localStorage.setItem(AUTOTRAIN_CONFIG_STORAGE_KEY, JSON.stringify(safeConfig));
};

interface AutoTrainViewProps {
  setActiveTab: (tab: string) => void;
}

export default function AutoTrainView({ setActiveTab }: AutoTrainViewProps) {
  // Subscribe to persistent global training state
  const [, forceUpdate] = useState({});
  useEffect(() => {
    return globalTrainingState.subscribe(() => forceUpdate({}));
  }, []);

  const { activeJobs, lossHistories, evalLossHistories, eventSources } = globalTrainingState;

  // ── UI Control States ──
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // ── Config & Preset States ──
  const [config, setConfig] = useState<TrainingConfig>(loadPersistedTrainingConfig);
  const [previewData, setPreviewData] = useState<PreviewData>(EMPTY_PREVIEW);
  const [selectedPresetName, setSelectedPresetName] = useState(() => {
    if (typeof window === 'undefined') return 'Standard (Recommended ~15 min)';
    return localStorage.getItem(AUTOTRAIN_PRESET_STORAGE_KEY) || 'Standard (Recommended ~15 min)';
  });
  const [customPresets, setCustomPresets] = useState<Record<string, any>>({});

  // ── Worker Resources ──
  const [systemResources, setSystemResources] = useState<any>(null);

  // ── Messages, Errors, Notifications ──
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showStartError, setShowStartError] = useState(false);
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load welcome card display preference
  useEffect(() => {
    const dismissed = localStorage.getItem('at-welcome-dismissed');
    if (dismissed !== 'true') {
      setShowWelcome(true);
    }
  }, []);

  // Load custom presets from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('autotrain_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading custom presets:', e);
      }
    }
  }, []);

  // If Data Prep created an Evaluation Pack, prepare its SFT train/validation
  // ZIP in memory. The AutoTrain wizard opens with the dataset already loaded;
  // the user does not need to download and re-upload an intermediate file.
  useEffect(() => {
    if (config.localFile) return;
    const rawPack = localStorage.getItem('hybrid_evaluation_pack_v1');
    if (!rawPack) return;

    try {
      const pack = JSON.parse(rawPack);
      const trainRows = Array.isArray(pack?.sft?.train) ? pack.sft.train : [];
      const validationRows = Array.isArray(pack?.sft?.validation) ? pack.sft.validation : [];
      if (!trainRows.length) return;

      void (async () => {
        const zip = new JSZip();
        zip.file('train_dataset.json', JSON.stringify(trainRows, null, 2));
        zip.file('validation_dataset.json', JSON.stringify(validationRows, null, 2));
        zip.file('_metadata.json', JSON.stringify({
          datasetVersionId: pack.dataset_version_id,
          totalTrain: trainRows.length,
          totalValidation: validationRows.length,
          evaluationPackSchema: pack.schema_version,
        }, null, 2));
        const blob = await zip.generateAsync({ type: 'blob' });
        const file = new File([blob], `evaluation_pack_train_${pack.dataset_version_id || 'latest'}.zip`, { type: 'application/zip' });
        setConfig(current => ({
          ...current,
          datasetSource: 'local',
          localFile: file,
          columnMapping: 'messages',
          projectName: current.projectName === 'my-first-lm-project'
            ? `Evaluation Pack ${pack.dataset_version_id || 'latest'}`
            : current.projectName,
        }));
        setPreviewData({
          rows: trainRows.slice(0, 5).map((row: any) => formatRowPreview(row)),
          totalRecords: trainRows.length,
          totalTokens: Math.round(JSON.stringify(trainRows).length / 4),
          headers: ['messages'],
          qualityChecks: [{ level: 'ok', message: `Evaluation Pack đã nạp ${trainRows.length} mẫu train và ${validationRows.length} mẫu validation.` }],
        });
      })().catch(error => console.warn('[AutoTrain] Could not prepare Evaluation Pack:', error));
    } catch (error) {
      console.warn('[AutoTrain] Invalid Evaluation Pack:', error);
    }
  }, [config.localFile]);

  // Persist the selected training configuration for reproducible experiments.
  // The actual submitted configuration is also stored in TrainingHistory by the backend.
  useEffect(() => {
    persistTrainingConfig(config);
  }, [config]);

  useEffect(() => {
    localStorage.setItem(AUTOTRAIN_PRESET_STORAGE_KEY, selectedPresetName);
  }, [selectedPresetName]);

  // Fetch worker resource status on interval
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await axios.get('/api/system/resources', { headers: getAuthHeaders() });
        setSystemResources(res.data);
      } catch (e) {
        console.error('Error fetching system GPU resources:', e);
        // Fallback: try the same endpoint Navbar uses (which doesn't require requireManager)
        try {
          const fallbackRes = await axios.get('/api/model-eval/gpu-status', {
            headers: getAuthHeaders(),
            timeout: 6000,
          });
          if (fallbackRes.status === 200 && fallbackRes.data) {
            // Construct a compatible workers array from gpu-status response
            setSystemResources({
              workers: [{
                status: 'online',
                gpu_name: 'GPU Worker',
                vram_used_mb: fallbackRes.data.vram_used_mb || 0,
                vram_total_mb: fallbackRes.data.vram_total_mb || 0,
                vram_free: ((fallbackRes.data.vram_total_mb - fallbackRes.data.vram_used_mb) / 1024).toFixed(1),
                gpu_util: fallbackRes.data.gpu_util || 0,
              }],
              vram_used_mb: fallbackRes.data.vram_used_mb || 0,
              vram_total_mb: fallbackRes.data.vram_total_mb || 0,
              gpu_util: fallbackRes.data.gpu_util || 0,
            });
          }
        } catch (fallbackErr) {
          // Both endpoints failed — GPU truly offline
          console.error('Fallback GPU status also failed:', fallbackErr);
        }
      }
    };
    fetchResources();
    const timer = setInterval(fetchResources, 5000);
    return () => clearInterval(timer);
  }, []);

  // Hydrate resume request from TrainingHistoryView (if available)
  useEffect(() => {
    const resumeId = localStorage.getItem('autotrain_resume_job_id');
    if (resumeId) {
      localStorage.removeItem('autotrain_resume_job_id');
      startTrackingJob(resumeId);
    }
  }, []);

  // Fetch currently active jobs from database on mount to restore monitoring panels
  useEffect(() => {
    const restoreActiveJobs = async () => {
      try {
        const res = await axios.get('/api/train/active', { headers: getAuthHeaders() });
        const jobs = Array.isArray(res.data) ? res.data : [];
        jobs.forEach((job: any) => {
          const jobId = job.jobId || job.id;
          if (jobId && !eventSources[jobId]) {
            startTrackingJob(jobId, {
              projectName: job.projectName,
              baseModel: job.baseModel,
              datasetSource: job.datasetSource,
              datasetName: job.datasetName,
              columnMapping: job.columnMapping,
            });
          }
        });
      } catch (err) {
        console.error('Failed to restore active training jobs on mount:', err);
      }
    };
    restoreActiveJobs();
  }, []);

  // Compute estimated time dynamically
  const estimatedTime = useMemo(() => {
    return estimateTrainingTime(previewData.totalRecords, selectedPresetName);
  }, [previewData.totalRecords, selectedPresetName]);

  // ── Handlers ──

  const triggerToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  }, []);

  const handleConfigChange = useCallback((updates: Partial<TrainingConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setValidationErrors((prev) => {
      const copy = { ...prev };
      Object.keys(updates).forEach((k) => delete copy[k]);
      return copy;
    });
  }, []);

  const handlePresetChange = useCallback(
    (name: string) => {
      setSelectedPresetName(name);
      if (!name) return;

      const preset = DEFAULT_PRESETS[name] || customPresets[name];
      if (!preset) return;

      setConfig((prev) => ({
        ...prev,
        epochs: String(preset.epochs || '3'),
        batchSize: String(preset.batchSize || '1'),
        learningRate: String(preset.learningRate || '0.00005'),
        blockSize: String(preset.blockSize || '1024'),
        modelMaxLength: String(preset.modelMaxLength || '1024'),
        r: String(preset.r || '16'),
        loraAlpha: String(preset.lora_alpha || preset.loraAlpha || '32'),
        loraDropout: String(preset.lora_dropout ?? preset.loraDropout ?? '0.05'),
        gradAccum: String(preset.gradient_accumulation_steps || preset.gradAccum || '4'),
        warmupSteps: String(preset.warmup_steps || preset.warmupSteps || '5'),
        weightDecay: String(preset.weight_decay || preset.weightDecay || '0.01'),
        optim: preset.optim || 'adamw_8bit',
        lrScheduler: preset.lr_scheduler_type || preset.lrScheduler || 'linear',
      }));
    },
    [customPresets],
  );

  const handleSavePreset = useCallback(
    (name: string) => {
      const newPreset = {
        epochs: parseInt(config.epochs) || 3,
        batchSize: parseInt(config.batchSize) || 1,
        learningRate: parseFloat(config.learningRate) || 2e-4,
        blockSize: parseInt(config.blockSize) || 1024,
        modelMaxLength: parseInt(config.modelMaxLength) || 1024,
        r: parseInt(config.r) || 16,
        lora_alpha: parseInt(config.loraAlpha) || 32,
        lora_dropout: Number.isFinite(parseFloat(config.loraDropout)) ? parseFloat(config.loraDropout) : 0,
        gradient_accumulation_steps: parseInt(config.gradAccum) || 4,
        warmup_steps: parseInt(config.warmupSteps) || 5,
        weight_decay: parseFloat(config.weightDecay) || 0.01,
        optim: config.optim,
        lr_scheduler_type: config.lrScheduler,
      };

      const updated = { ...customPresets, [name]: newPreset };
      setCustomPresets(updated);
      localStorage.setItem('autotrain_presets', JSON.stringify(updated));
      setSelectedPresetName(name);
    },
    [config, customPresets],
  );

  const handleDeletePreset = useCallback(
    (name: string) => {
      const updated = { ...customPresets };
      delete updated[name];
      setCustomPresets(updated);
      localStorage.setItem('autotrain_presets', JSON.stringify(updated));
      setSelectedPresetName('');
    },
    [customPresets],
  );

  // Validate step 1 dataset properties
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!config.projectName.trim()) {
      errors.projectName = 'Project name is required';
    }
    if (config.datasetSource === 'local' && !config.localFile) {
      errors.dataset = 'Please select a local dataset file';
    }
    if (config.datasetSource === 'hub' && !config.selectedHfDataset) {
      errors.dataset = 'Please select a Hugging Face dataset';
    }
    if (config.datasetSource === 'cloud' && !config.cloudLoadedDataset) {
      errors.dataset = 'Please load a cloud dataset';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setShowStartError(true);
      return false;
    }

    setValidationErrors({});
    setShowStartError(false);
    return true;
  };

  const handleNextFromStep1 = useCallback(() => {
    if (validateStep1()) {
      setCurrentStep(2);
      setCompletedSteps((prev) => (prev.includes(1) ? prev : [...prev, 1]));
    }
  }, [config, validateStep1]);

  const handleNextFromStep2 = useCallback(() => {
    setCurrentStep(3);
    setCompletedSteps((prev) => (prev.includes(2) ? prev : [...prev, 2]));
  }, []);

  const handleStepClick = useCallback((step: 1 | 2 | 3) => {
    setCurrentStep(step);
  }, []);

  const handleBackToStep1 = useCallback(() => {
    setCurrentStep(1);
  }, []);

  const handleBackToStep2 = useCallback(() => {
    setCurrentStep(2);
  }, []);

  // SSE stream connecting & tracking
  const startTrackingJob = (jobId: string, jobConfig?: any) => {
    if (eventSources[jobId]) return;

    if (jobConfig) {
      globalTrainingState.jobConfigs = {
        ...globalTrainingState.jobConfigs,
        [jobId]: jobConfig
      };
    }

    globalTrainingState.activeJobs = {
      ...globalTrainingState.activeJobs,
      [jobId]: {
        id: jobId,
        status: 'QUEUED',
        progress: 0,
        logs: ['Establishing connection to SSE stream...'],
      }
    };

    const token = getAuthToken();
    const streamUrl = `/api/train/stream/${jobId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(streamUrl);

    globalTrainingState.eventSources[jobId] = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const previousLogs = globalTrainingState.activeJobs[jobId]?.logs || [];
        const receivedLogs = Array.isArray(data.logs) ? data.logs : [];
        const fallbackErrorLogs = receivedLogs.length === 0 && data.error
          ? [
              `[ERROR] ${data.error}`,
              ...(data.technical_error && data.technical_error !== data.error
                ? [data.technical_error]
                : []),
            ]
          : [];

        // Update Job metrics and status immutably
        globalTrainingState.activeJobs = {
          ...globalTrainingState.activeJobs,
          [jobId]: {
            ...globalTrainingState.activeJobs[jobId],
            status: data.status,
            progress: data.progress || 0,
            current_epoch: data.metrics?.epoch,
            total_epochs: data.metrics?.total_epochs,
            current_step: data.metrics?.step,
            total_steps: data.metrics?.total_steps,
            loss: data.metrics?.loss,
            eval_loss: data.metrics?.eval_loss,
            vram_used: data.metrics?.vram,
            gpu_util: data.metrics?.gpu_util ? `${data.metrics.gpu_util}%` : undefined,
            error: data.error,
            technical_error: data.technical_error,
            logs: receivedLogs.length > 0 ? receivedLogs : (fallbackErrorLogs.length > 0 ? fallbackErrorLogs : previousLogs),
          }
        };

        // Append Train Loss history
        if (data.metrics && typeof data.metrics.loss === 'number' && data.metrics.loss > 0) {
          const history = globalTrainingState.lossHistories[jobId] || [];
          if (history.length === 0 || history[history.length - 1].progress !== data.progress) {
            globalTrainingState.lossHistories[jobId] = [
              ...history,
              { progress: data.progress, loss: data.metrics.loss },
            ];
          }
        }

        // Append Eval Loss history
        if (data.metrics && typeof data.metrics.eval_loss === 'number' && data.metrics.eval_loss > 0) {
          const history = globalTrainingState.evalLossHistories[jobId] || [];
          if (history.length === 0 || history[history.length - 1].progress !== data.progress) {
            globalTrainingState.evalLossHistories[jobId] = [
              ...history,
              { progress: data.progress, loss: data.metrics.eval_loss },
            ];
          }
        }

        // Handle terminal completion states
        if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(data.status)) {
          closeTracking(jobId, data.status);
          if (data.status === 'COMPLETED') {
            setCompletedJobId(jobId);
          }
        }

        globalTrainingState.notify();
      } catch (err) {
        console.error('SSE message parse error:', err);
      }
    };

    es.onerror = () => {
      // Instead of instantly failing on transient SSE disconnects (e.g. LocalTunnel hiccups),
      // verify actual job status from backend API before declaring job ERROR.
      axios.get(`/api/train/status/${jobId}`, { headers: getAuthHeaders() })
        .then((res) => {
          const status = res.data?.status;
          if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(status)) {
            closeTracking(jobId, status);
          } else {
            console.warn(`[SSE Stream] Transient stream disconnect on job ${jobId}. Browser will auto-reconnect.`);
          }
        })
        .catch(() => {
          closeTracking(jobId, 'ERROR');
        });
    };

    globalTrainingState.notify();
  };

  const closeTracking = (jobId: string, finalStatus: string) => {
    const es = eventSources[jobId];
    if (es) {
      es.close();
      delete eventSources[jobId];
    }
    if (globalTrainingState.activeJobs[jobId]) {
      globalTrainingState.activeJobs = {
        ...globalTrainingState.activeJobs,
        [jobId]: {
          ...globalTrainingState.activeJobs[jobId],
          status: finalStatus as any
        }
      };
    }
    globalTrainingState.notify();
  };

  const handleStopJob = useCallback(async (jobId: string) => {
    try {
      await axios.post(`/api/train/stop/${jobId}`, {}, { headers: getAuthHeaders() });
      closeTracking(jobId, 'STOPPED');
      triggerToast('Training job stopped.', 'info');
    } catch (err: any) {
      console.error('Error stopping job:', err);
      triggerToast('Failed to stop training: ' + (err.response?.data?.error || err.message), 'error');
    }
  }, [triggerToast]);

  const handleDismissJob = useCallback((jobId: string) => {
    globalTrainingState.activeJobs = { ...globalTrainingState.activeJobs };
    delete globalTrainingState.activeJobs[jobId];
    if (completedJobId === jobId) {
      setCompletedJobId(null);
    }
    globalTrainingState.notify();
  }, [completedJobId]);

  const handleChatTest = useCallback((jobId: string) => {
    const jobConfig = globalTrainingState.jobConfigs[jobId];
    const modelName = jobConfig ? jobConfig.projectName : 'My Custom AI Model';
    localStorage.setItem('autotrain_completed_project_name', modelName);
    setActiveTab('Chat');
  }, [setActiveTab]);

  // Start training Confirm
  const handleStartTrainingConfirm = async () => {
    setIsConfirmOpen(false);
    setIsStarting(true);
    try {
      const formData = new FormData();
      formData.append('model_name', config.baseModel);
      formData.append('epochs', config.epochs);
      formData.append('batchSize', config.batchSize);
      formData.append('learningRate', config.learningRate);
      formData.append('blockSize', config.blockSize);
      formData.append('modelMaxLength', config.modelMaxLength);
      formData.append('r', config.r);
      formData.append('lora_alpha', config.loraAlpha);
      formData.append('lora_dropout', config.loraDropout);
      formData.append('gradient_accumulation_steps', config.gradAccum);
      formData.append('warmup_steps', config.warmupSteps);
      formData.append('weight_decay', config.weightDecay);
      formData.append('seed', config.seed);
      formData.append('random_state', config.seed);
      formData.append('optim', config.optim);
      formData.append('lr_scheduler_type', config.lrScheduler);
      formData.append('systemPrompt', config.systemPrompt);
      formData.append('columnMapping', config.columnMapping);
      formData.append('projectName', config.projectName);
      formData.append('api_key', config.apiKey);

      if (previewData.totalRecords) formData.append('totalRecords', String(previewData.totalRecords));
      if (previewData.totalTokens) formData.append('totalTokens', String(previewData.totalTokens));

      if (config.hfRepoId) {
        formData.append('push_to_hub', 'true');
        formData.append('hf_repo_id', config.hfRepoId);
        formData.append('hf_token', config.hfToken);
      }

      if (config.datasetSource === 'local' && config.localFile) {
        formData.append('dataset_file', config.localFile);
        formData.append('datasetSource', 'local');
      } else if (config.datasetSource === 'hub') {
        formData.append('dataset', config.selectedHfDataset);
        formData.append('datasetSource', 'hub');
      } else {
        formData.append('dataset', config.cloudLoadedDataset);
        formData.append('datasetSource', 'cloud');
      }

      const response = await axios.post('/api/train/start', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders(),
        },
      });

      const data = response.data;
      if (data && data.job_id) {
        triggerToast(`Training initiated successfully! Job ID: ${data.job_id.slice(-8)}`, 'success');
        startTrackingJob(data.job_id, {
          projectName: config.projectName,
          baseModel: config.baseModel,
          datasetSource: config.datasetSource,
          datasetName:
            config.datasetSource === 'local'
              ? config.localFile!.name
              : config.datasetSource === 'hub'
              ? config.selectedHfDataset
              : config.cloudLoadedDataset,
          columnMapping: config.columnMapping,
        });

        // Reset step state back to step 1 for next creation
        setCurrentStep(1);
        setCompletedSteps([]);
      }
    } catch (err: any) {
      triggerToast('Failed to start training: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="at-container">
      {/* ── Header ── */}
      <header className="at-header">
        <div className="at-header-left">
          <div className="at-header-icon" aria-hidden="true">
            <Zap size={20} />
          </div>
          <div className="at-header-text">
            <h1>AutoTrain Dashboard</h1>
            <p>Fine-tune and deploy your own custom AI tutors from conversation logs in 3 simple steps.</p>
          </div>
        </div>
        <div className="at-header-right">
          {Object.keys(activeJobs).length > 0 && (
            <div className="at-badge-active" aria-label={`${Object.keys(activeJobs).length} active training runs`}>
              <span className="at-pulse-dot" />
              {Object.keys(activeJobs).length} Active
            </div>
          )}
          <button className="at-btn-history" onClick={() => setActiveTab('Training History')}>
            <History size={14} /> History
          </button>
        </div>
      </header>

      {/* ── Toasts & Alerts ── */}
      {toast && (
        <div
          className={`at-toast ${
            toast.type === 'error' ? 'at-toast-error' : toast.type === 'success' ? 'at-toast-success' : 'at-toast-info'
          }`}
          role="alert"
        >
          <div className="at-toast-icon">
            <CheckCircle size={14} />
          </div>
          <span className="at-toast-msg">{toast.message}</span>
          <button className="at-toast-close" onClick={() => setToast(null)} aria-label="Close toast">
            <X size={12} />
          </button>
        </div>
      )}

      {showStartError && Object.keys(validationErrors).length > 0 && (
        <div className="at-error-banner" role="alert">
          <div className="at-error-banner-icon">
            <AlertTriangle size={14} />
          </div>
          <div className="at-error-banner-content">
            <strong>Cannot proceed — please resolve errors</strong>
            <ul className="at-error-list">
              {Object.entries(validationErrors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
          <button className="at-error-banner-close" onClick={() => setShowStartError(false)} aria-label="Close errors">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Active Jobs Progress Monitor (Stays visible across wizard actions) ── */}
      <TrainingMonitor
        activeJobs={activeJobs}
        lossHistories={lossHistories}
        evalLossHistories={evalLossHistories}
        onStopJob={handleStopJob}
        onDismissJob={handleDismissJob}
        onChatTest={handleChatTest}
        completedJobId={completedJobId}
        onDismissSuccess={() => setCompletedJobId(null)}
      />

      {/* ── Main Layout ── */}
      {showWelcome ? (
        <WelcomeCard onDismiss={() => setShowWelcome(false)} onDownloadSample={() => {}} />
      ) : (
        <div className="at-layout" style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 10 }}>
          {/* Stepper Wizard Indicator */}
          <WizardStepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />

          <main className="at-wizard-step-container">
            {currentStep === 1 && (
              <StepDataset
                config={config}
                onConfigChange={handleConfigChange}
                previewData={previewData}
                onPreviewDataChange={setPreviewData}
                onNext={handleNextFromStep1}
                toast={triggerToast}
              />
            )}

            {currentStep === 2 && (
              <StepConfig
                config={config}
                onConfigChange={handleConfigChange}
                previewData={previewData}
                selectedPresetName={selectedPresetName}
                onPresetChange={handlePresetChange}
                customPresets={customPresets}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
                onNext={handleNextFromStep2}
                onBack={handleBackToStep1}
                toast={triggerToast}
              />
            )}

            {currentStep === 3 && (
              <StepReview
                config={config}
                previewData={previewData}
                selectedPresetName={selectedPresetName}
                estimatedTime={estimatedTime}
                systemResources={systemResources}
                isStarting={isStarting}
                onStartTraining={() => setIsConfirmOpen(true)}
                onBack={handleBackToStep2}
              />
            )}
          </main>
        </div>
      )}

      {/* ── Confirmation Overlay Modal ── */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        config={config}
        previewData={previewData}
        presetName={selectedPresetName}
        estimatedTime={estimatedTime}
        gpuOnline={useMemo(() => {
          if (!systemResources) return false;
          const workers = systemResources.workers || [];
          return workers.some((w: any) => w.status === 'online' || !w.error);
        }, [systemResources])}
        onConfirm={handleStartTrainingConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
