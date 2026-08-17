// ============================================================
// AutoTrainView — Main Wizard-based training flow container
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap,
  History,
  AlertTriangle,
  CheckCircle,
  X,
} from 'lucide-react';
import { getAuthToken } from '../services/authSession';
import { apiService, api } from '../services/api';
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
  eventSources: {} as Record<string, any>,
  dismissedJobs: new Set<string>(),
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

const finiteNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const parseTrainingLogState = (logs: string[]) => {
  let step: number | undefined;
  let epoch: number | undefined;
  let totalSteps: number | undefined;
  let totalEpochs: number | undefined;
  let stepsPerEpoch: number | undefined;
  let trainLoss: number | undefined;
  let evalLoss: number | undefined;

  for (const rawLine of logs || []) {
    const line = String(rawLine || '');
    const stepMatch = line.match(/Step\s+(\d+)(?:\/(\d+))?\s*\|\s*Epoch\s+([\d.]+)/i);
    if (stepMatch) {
      step = Number(stepMatch[1]);
      if (stepMatch[2]) totalSteps = Number(stepMatch[2]);
      epoch = Number(stepMatch[3]);
    }
    const configMatch = line.match(/epochs=([\d.]+).*?steps\/epoch=(\d+).*?total_steps=(\d+)/i);
    if (configMatch) {
      totalEpochs = Number(configMatch[1]);
      stepsPerEpoch = Number(configMatch[2]);
      totalSteps = Number(configMatch[3]);
    }
    const lossMatch = line.match(/\bLoss:\s*([\d.]+)/i);
    if (lossMatch) trainLoss = Number(lossMatch[1]);
    const evalMatch = line.match(/Eval Loss(?: \(Overfit\))?:\s*([\d.]+)/i);
    if (evalMatch) evalLoss = Number(evalMatch[1]);
  }

  return { step, epoch, totalSteps, totalEpochs, stepsPerEpoch, trainLoss, evalLoss };
};

const safeTrainingConfig = (config: TrainingConfig): Partial<TrainingConfig> => {
  const { localFile, apiKey, hfToken, ...safe } = config;
  void localFile;
  void apiKey;
  void hfToken;
  return safe;
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
  const [clearingQueue, setClearingQueue] = useState(false);
  const trainSummaryRequests = useRef(new Set<string>());

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

  // Auto-fetch system prompt from DataPrep Step 12 if available.
  // We want to keep it synced with the latest prompt from Data Prep.
  useEffect(() => {
    const fetchLatestPrompt = async () => {
      try {
        const data = await apiService.getDatasetPrompts();
        if (data?.prompts?.length > 0) {
          const latest = data.prompts[0]; // newest first
          // Sync if different from current
          if (config.systemPrompt !== latest.content) {
            handleConfigChange({ systemPrompt: latest.content });
            triggerToast(`System prompt đã được đồng bộ từ Data Prep: "${latest.name}"`, 'info');
          }
        }
      } catch (err) {
        console.warn('[AutoTrain] Could not auto-load system prompt from Data Prep:', err);
      }
    };
    fetchLatestPrompt();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        const res = await api.get('/system/resources');
        console.log('[AutoTrain] /api/system/resources response:', JSON.stringify(res.data));
        setSystemResources(res.data);
      } catch (e) {
        console.error('Error fetching system GPU resources:', e);
        // Fallback: use the same endpoint Navbar uses (apiService.checkGpuStatus)
        try {
          const { isOk, data: statsData } = await apiService.checkGpuStatus();
          if (isOk && statsData) {
            // Construct a compatible workers array from gpu-status response
            setSystemResources({
              workers: [{
                status: 'online',
                gpu_name: 'GPU Worker',
                vram_used_mb: statsData.vram_used_mb || 0,
                vram_total_mb: statsData.vram_total_mb || 0,
                vram_free: ((statsData.vram_total_mb - statsData.vram_used_mb) / 1024).toFixed(1),
                gpu_util: statsData.gpu_util || 0,
              }],
              vram_used_mb: statsData.vram_used_mb || 0,
              vram_total_mb: statsData.vram_total_mb || 0,
              gpu_util: statsData.gpu_util || 0,
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
    const checkResumeRequest = async () => {
      const resumeId = localStorage.getItem('autotrain_resume_job_id');
      if (resumeId) {
        localStorage.removeItem('autotrain_resume_job_id');
        globalTrainingState.dismissedJobs.delete(resumeId);

        // Fetch history info if jobConfig is missing
        if (!globalTrainingState.jobConfigs[resumeId]) {
          try {
            const historyRes = await api.get('/train/history');
            const histories = Array.isArray(historyRes.data) ? historyRes.data : [];
            const found = histories.find((h: any) => h.jobId === resumeId);
            if (found) {
              globalTrainingState.jobConfigs[resumeId] = {
                projectName: found.projectName,
                baseModel: found.baseModel,
                datasetSource: found.datasetSource,
                datasetName: found.datasetName,
                columnMapping: found.columnMapping,
                trainingConfig: found.parameters || {},
              };
            }
          } catch (err) {
            console.warn('Could not fetch history metadata for resumeId:', err);
          }
        }

        startTrackingJob(resumeId, globalTrainingState.jobConfigs[resumeId], true);
      }
    };
    checkResumeRequest();
  }, []);

  // Fetch currently active jobs from database on mount to restore monitoring panels
  useEffect(() => {
    const restoreActiveJobs = async () => {
      try {
        const res = await api.get('/train/active');
        const jobs = Array.isArray(res.data) ? res.data : [];
        jobs.forEach((job: any) => {
          const jobId = job.jobId || job.id;
          if (
            jobId &&
            (!eventSources[jobId] || !globalTrainingState.activeJobs[jobId]) &&
            !globalTrainingState.dismissedJobs.has(jobId)
          ) {
            startTrackingJob(jobId, {
              projectName: job.projectName,
              baseModel: job.baseModel,
              datasetSource: job.datasetSource,
              datasetName: job.datasetName,
              columnMapping: job.columnMapping,
              trainingConfig: job.parameters || {},
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

  const handleGenerateTrainSummary = useCallback(async (jobId: string, refresh = false) => {
    try {
      const response = await api.post(`/train/summary/${jobId}`, { refresh });
      const summary = response.data?.summary || response.data;
      if (summary && globalTrainingState.activeJobs[jobId]) {
        globalTrainingState.activeJobs = {
          ...globalTrainingState.activeJobs,
          [jobId]: {
            ...globalTrainingState.activeJobs[jobId],
            train_summary: summary,
          },
        };
        globalTrainingState.notify();
      }
    } catch (error: any) {
      console.error('[AutoTrain] Failed to generate train summary:', error);
      triggerToast(
        `Không tạo được AI summary: ${error.response?.data?.error || error.message}`,
        'error',
      );
    }
  }, [triggerToast]);

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
        // Preset cũ lưu trong localStorage không có các knob này — giữ giá trị đang dùng.
        loraTargets: preset.lora_target_modules || prev.loraTargets,
        useRslora: preset.use_rslora ?? prev.useRslora,
        neftuneAlpha: preset.neftune_noise_alpha !== undefined ? String(preset.neftune_noise_alpha) : prev.neftuneAlpha,
        maxGradNorm: preset.max_grad_norm !== undefined ? String(preset.max_grad_norm) : prev.maxGradNorm,
        warmupRatio: preset.warmup_ratio !== undefined ? String(preset.warmup_ratio) : prev.warmupRatio,
        groupByLength: preset.group_by_length ?? prev.groupByLength,
        enableThinking: preset.enable_thinking ?? prev.enableThinking,
        chatTemplate: preset.chat_template || prev.chatTemplate,
        earlyStoppingPatience: preset.early_stopping_patience !== undefined
          ? String(preset.early_stopping_patience)
          : prev.earlyStoppingPatience,
        evalSteps: preset.eval_steps !== undefined ? String(preset.eval_steps) : prev.evalSteps,
        saveSteps: preset.save_steps !== undefined ? String(preset.save_steps) : prev.saveSteps,
        loggingSteps: preset.logging_steps !== undefined ? String(preset.logging_steps) : prev.loggingSteps,
        dataloaderNumWorkers: preset.dataloader_num_workers !== undefined
          ? String(preset.dataloader_num_workers)
          : prev.dataloaderNumWorkers,
        autoTune: preset.auto_tune ?? prev.autoTune,
        gradientCheckpointing: preset.gradient_checkpointing ?? prev.gradientCheckpointing,
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
        lora_target_modules: config.loraTargets,
        use_rslora: config.useRslora,
        neftune_noise_alpha: parseFloat(config.neftuneAlpha) || 0,
        max_grad_norm: parseFloat(config.maxGradNorm) || 1,
        warmup_ratio: parseFloat(config.warmupRatio) || 0,
        group_by_length: config.groupByLength,
        enable_thinking: config.enableThinking,
        chat_template: config.chatTemplate,
        early_stopping_patience: parseInt(config.earlyStoppingPatience) || 3,
        eval_steps: config.evalSteps.trim() ? parseInt(config.evalSteps) : undefined,
        save_steps: config.saveSteps.trim() ? parseInt(config.saveSteps) : undefined,
        logging_steps: parseInt(config.loggingSteps) || 1,
        dataloader_num_workers: parseInt(config.dataloaderNumWorkers) || 0,
        auto_tune: config.autoTune,
        gradient_checkpointing: config.gradientCheckpointing,
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
  const startTrackingJob = (jobId: string, jobConfig?: any, force = false) => {
    if (!jobId) return;
    globalTrainingState.dismissedJobs.delete(jobId);

    // If already tracking and not force, don't restart interval
    if (eventSources[jobId] && !force && globalTrainingState.activeJobs[jobId]) return;

    // Clean up existing timer if force restart
    if (eventSources[jobId]) {
      try { eventSources[jobId].close?.(); } catch {}
      delete eventSources[jobId];
    }

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
        status: globalTrainingState.activeJobs[jobId]?.status || 'QUEUED',
        progress: globalTrainingState.activeJobs[jobId]?.progress || 0,
        requested_config: jobConfig?.trainingConfig || globalTrainingState.jobConfigs[jobId]?.trainingConfig,
        logs: globalTrainingState.activeJobs[jobId]?.logs || ['Establishing connection to background job...'],
      }
    };

    const pollJob = async () => {
      if (globalTrainingState.dismissedJobs.has(jobId)) {
        const es = globalTrainingState.eventSources[jobId];
        if (es) {
          try { es.close(); } catch {}
          delete globalTrainingState.eventSources[jobId];
        }
        return;
      }
      try {
        const res = await api.get(`/train/status/${jobId}`);
        const data = res.data;
        
        console.log(`[AutoTrain] poll msg for ${jobId}:`, data);
        const previousLogs = globalTrainingState.activeJobs[jobId]?.logs || [];
        const receivedLogs = Array.isArray(data.logs) ? data.logs : [];
        const logState = parseTrainingLogState(receivedLogs);
        const fallbackErrorLogs = receivedLogs.length === 0 && data.error
          ? [
              `[ERROR] ${data.error}`,
              ...(data.technical_error && data.technical_error !== data.error
                ? [data.technical_error]
                : []),
            ]
          : [];

        const previousJob = globalTrainingState.activeJobs[jobId];
        const incomingMetrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : {};
        const metrics = {
          ...(previousJob?.metrics || {}),
          ...incomingMetrics,
        };
        let currentStep = finiteNumber(incomingMetrics.current_step, incomingMetrics.step, data.current_step, data.step, logState.step, previousJob?.current_step);
        let currentEpoch = finiteNumber(incomingMetrics.current_epoch, incomingMetrics.epoch, data.current_epoch, data.epoch, logState.epoch, previousJob?.current_epoch);
        if (currentStep === undefined && currentEpoch !== undefined) currentStep = 0;
        if (currentEpoch === undefined && currentStep !== undefined) currentEpoch = 0;
        const totalSteps = finiteNumber(incomingMetrics.total_steps, data.total_steps, data.effective_config?.schedule?.total_steps, logState.totalSteps, previousJob?.total_steps);
        const totalEpochs = finiteNumber(incomingMetrics.total_epochs, data.total_epochs, data.effective_config?.epochs, logState.totalEpochs, previousJob?.total_epochs);
        const derivedProgress = currentStep !== undefined && totalSteps
          ? (currentStep / totalSteps) * 100
          : undefined;
        const explicitProgress = finiteNumber(data.progress);
        const progress = finiteNumber(
          explicitProgress !== undefined && explicitProgress > 0 ? explicitProgress : undefined,
          derivedProgress,
          explicitProgress,
          previousJob?.progress,
        ) ?? 0;
        if (incomingMetrics.step === undefined && currentStep !== undefined) metrics.step = currentStep;
        if (incomingMetrics.epoch === undefined && currentEpoch !== undefined) metrics.epoch = currentEpoch;
        if (incomingMetrics.total_steps === undefined && totalSteps !== undefined) metrics.total_steps = totalSteps;
        if (incomingMetrics.total_epochs === undefined && totalEpochs !== undefined) metrics.total_epochs = totalEpochs;
        if (incomingMetrics.steps_per_epoch === undefined && logState.stepsPerEpoch !== undefined) metrics.steps_per_epoch = logState.stepsPerEpoch;
        if (incomingMetrics.loss === undefined && logState.trainLoss !== undefined) metrics.loss = logState.trainLoss;
        if (incomingMetrics.eval_loss === undefined && logState.evalLoss !== undefined) metrics.eval_loss = logState.evalLoss;

        // Update Job metrics and status immutably. Keep the last value when a
        // worker heartbeat only contains GPU resource information.
        globalTrainingState.activeJobs = {
          ...globalTrainingState.activeJobs,
          [jobId]: {
            ...previousJob,
            id: jobId,
            status: data.status,
            progress,
            current_epoch: currentEpoch,
            total_epochs: totalEpochs,
            current_step: currentStep,
            total_steps: totalSteps,
            step: currentStep,
            loss: finiteNumber(metrics.loss, data.loss, previousJob?.loss),
            eval_loss: finiteNumber(metrics.eval_loss, data.eval_loss, logState.evalLoss, previousJob?.eval_loss),
            vram_used: metrics.vram ?? previousJob?.vram_used,
            gpu_util: typeof metrics.gpu_util === 'number'
              ? `${metrics.gpu_util}%`
              : (metrics.gpu_util ?? previousJob?.gpu_util),
            metrics,
            effective_config: data.effective_config || previousJob?.effective_config,
            requested_config: previousJob?.requested_config || jobConfig?.trainingConfig,
            eval_status: data.eval_status || (logState.evalLoss !== undefined ? 'COMPLETED' : previousJob?.eval_status),
            eval_current: data.eval_current ?? previousJob?.eval_current,
            eval_details: Array.isArray(data.eval_details) ? data.eval_details : previousJob?.eval_details,
            eval_progress: data.eval_progress || previousJob?.eval_progress,
            train_current: data.train_current ?? previousJob?.train_current,
            train_details: Array.isArray(data.train_details) ? data.train_details : previousJob?.train_details,
            train_summary: data.train_summary ?? previousJob?.train_summary,
            error: data.error,
            technical_error: data.technical_error,
            logs: receivedLogs.length > 0 ? receivedLogs : (fallbackErrorLogs.length > 0 ? fallbackErrorLogs : previousLogs),
          }
        };

        // Append Train Loss history
        const progressValue = progress;
        const stepValue = finiteNumber(metrics.step, metrics.current_step, data.step, currentStep);
        const epochValue = finiteNumber(metrics.epoch, metrics.current_epoch, data.epoch, currentEpoch);
        if (typeof metrics.loss === 'number' && Number.isFinite(metrics.loss)) {
          const history = globalTrainingState.lossHistories[jobId] || [];
          const existing = history.find(h => h.step === stepValue && stepValue !== undefined);
          if (!existing) {
            globalTrainingState.lossHistories[jobId] = [
              ...history,
              { progress: progressValue, loss: metrics.loss, step: stepValue, epoch: epochValue, timestamp: Date.now() },
            ];
          }
        }

        // Append Eval Loss history
        if (typeof metrics.eval_loss === 'number' && Number.isFinite(metrics.eval_loss)) {
          const evalHistory = globalTrainingState.evalLossHistories[jobId] || [];
          const existing = evalHistory.find(h => h.step === stepValue && stepValue !== undefined);
          if (!existing) {
            globalTrainingState.evalLossHistories[jobId] = [
              ...evalHistory,
              { progress: progressValue, loss: metrics.eval_loss, step: stepValue, epoch: epochValue, timestamp: Date.now() },
            ];
          }
        }

        // Handle terminal completion states
        if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(data.status)) {
          closeTracking(jobId, data.status);
          if (data.status === 'COMPLETED') {
            setCompletedJobId(jobId);
          }
          if (!trainSummaryRequests.current.has(jobId)) {
            trainSummaryRequests.current.add(jobId);
            // The status endpoint persists the final audit asynchronously;
            // give Mongo one poll interval before building the summary.
            window.setTimeout(() => void handleGenerateTrainSummary(jobId), 1200);
          }
        }

        globalTrainingState.notify();
      } catch (err: any) {
        console.error('Polling error:', err);
        // Only mark ERROR if it fails completely (API down), transient 502/504s should retry
        if (err.response && err.response.status === 404) {
           closeTracking(jobId, 'ERROR');
           globalTrainingState.notify();
        }
      }
    };

    pollJob(); // call immediately
    const intervalId = setInterval(pollJob, 2000);
    globalTrainingState.eventSources[jobId] = { close: () => clearInterval(intervalId) };

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

  const handleStopJob = useCallback(async (targetJobId: string) => {
    const jobId = targetJobId || '';
    if (!jobId) return;
    try {
      await api.post(`/train/stop/${jobId}`);
      closeTracking(jobId, 'STOPPED');
      triggerToast('Training job stopped.', 'info');
    } catch (err: any) {
      console.error('Error stopping job:', err);
      closeTracking(jobId, 'STOPPED');
      triggerToast('Đã dừng thẻ theo dõi (Lỗi từ server GPU: ' + (err.response?.data?.error || err.message) + ')', 'info');
    }
  }, [closeTracking, triggerToast]);

  const handleDismissJob = useCallback((targetJobId: string) => {
    const jobId = targetJobId || '';
    if (jobId) {
      globalTrainingState.dismissedJobs.add(jobId);
      const es = globalTrainingState.eventSources[jobId];
      if (es) {
        try {
          es.close();
        } catch (err) {
          console.warn('Error closing eventSource on dismiss:', err);
        }
        delete globalTrainingState.eventSources[jobId];
      }
    }
    globalTrainingState.activeJobs = { ...globalTrainingState.activeJobs };
    if (jobId) {
      delete globalTrainingState.activeJobs[jobId];
    }
    // Clean up any orphan job key matching targetJobId or empty/undefined id
    Object.keys(globalTrainingState.activeJobs).forEach(k => {
      const j = globalTrainingState.activeJobs[k];
      if (!k || k === jobId || j?.id === jobId || !j?.id) {
        delete globalTrainingState.activeJobs[k];
      }
    });
    if (completedJobId === jobId || !jobId) {
      setCompletedJobId(null);
    }
    globalTrainingState.notify();
  }, [completedJobId]);

  const handleClearGpuQueue = useCallback(async () => {
    if (!confirm('Bạn có chắc chắn muốn dọn sạch toàn bộ Queue và xóa tất cả thẻ theo dõi trên giao diện không?')) return;
    setClearingQueue(true);
    triggerToast('Đang tìm kiếm và hủy các job bị treo...', 'info');
    try {
      const jobIdsToStop = new Set<string>();

      // 1. Get active jobs from existing deployed API /train/active
      try {
        const activeRes = await api.get('/train/active');
        const activeJobsList = Array.isArray(activeRes.data) ? activeRes.data : [];
        activeJobsList.forEach((j: any) => {
          const id = j.jobId || j.id;
          if (id) jobIdsToStop.add(id);
        });
      } catch (err) {
        console.warn('Could not fetch active jobs:', err);
      }

      // 2. Collect job IDs from FE global state activeJobs
      Object.keys(globalTrainingState.activeJobs).forEach((id) => {
        jobIdsToStop.add(id);
      });

      // 3. Send stop signal for each job using existing POST /train/stop/:jobId
      for (const id of Array.from(jobIdsToStop)) {
        try {
          await api.post(`/train/stop/${id}`);
        } catch (err) {
          console.warn(`Stop call for job ${id} warning:`, err);
        }
      }

      // 4. FORCE CLEAR ALL FRONTEND STATE & TIMERS
      Object.keys(globalTrainingState.eventSources).forEach((id) => {
        try {
          globalTrainingState.eventSources[id]?.close?.();
        } catch (e) {
          console.warn('Error closing eventSource:', e);
        }
        delete globalTrainingState.eventSources[id];
      });

      globalTrainingState.dismissedJobs.clear();
      globalTrainingState.activeJobs = {};
      globalTrainingState.lossHistories = {};
      globalTrainingState.evalLossHistories = {};
      globalTrainingState.jobConfigs = {};
      localStorage.removeItem('autotrain_resume_job_id');
      globalTrainingState.notify();

      setCompletedJobId(null);
      triggerToast(`Đã dọn sạch toàn bộ thẻ theo dõi GPU trên giao diện FE thành công!`, 'success');
    } catch (err: any) {
      console.error('Lỗi dọn dẹp queue:', err);
      triggerToast('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setClearingQueue(false);
    }
  }, [triggerToast]);

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
      formData.append('r', config.r);
      formData.append('seed', config.seed);
      formData.append('optim', config.optim);
      formData.append('epochs', config.epochs);
      formData.append('random_state', config.seed);
      formData.append('batchSize', config.batchSize);
      formData.append('blockSize', config.blockSize);
      formData.append('model_name', config.baseModel);
      formData.append('lora_alpha', config.loraAlpha);
      formData.append('lora_dropout', config.loraDropout);
      formData.append('warmup_steps', config.warmupSteps);
      formData.append('weight_decay', config.weightDecay);
      formData.append('learningRate', config.learningRate);
      formData.append('modelMaxLength', config.modelMaxLength);
      formData.append('lr_scheduler_type', config.lrScheduler);
      formData.append('gradient_accumulation_steps', config.gradAccum);
      // Knob chất lượng: chỉ gửi khi khác mặc định để gpu-service tự quyết phần còn lại.
      formData.append('use_rslora', String(config.useRslora));
      formData.append('lora_target_modules', config.loraTargets);
      formData.append('group_by_length', String(config.groupByLength));
      formData.append('enable_thinking', String(config.enableThinking));
      if (config.chatTemplate === 'paste') {
        const jinja = (config.customChatTemplate || '').trim();
        if (!jinja) {
          triggerToast('Hãy dán chat_template (Jinja) hoặc chọn Tự động', 'error');
          setIsStarting(false);
          return;
        }
        formData.append('chat_template', 'paste');
        formData.append('chat_template_jinja', jinja);
      } else if (config.chatTemplate && config.chatTemplate !== 'auto') {
        formData.append('chat_template', config.chatTemplate);
      }
      formData.append('max_grad_norm', config.maxGradNorm);
      formData.append('early_stopping_patience', config.earlyStoppingPatience);
      formData.append('logging_steps', config.loggingSteps);
      formData.append('dataloader_num_workers', config.dataloaderNumWorkers);
      formData.append('auto_tune', String(config.autoTune));
      formData.append('gradient_checkpointing', String(config.gradientCheckpointing));
      if (parseFloat(config.neftuneAlpha) > 0) formData.append('neftune_noise_alpha', config.neftuneAlpha);
      if (parseFloat(config.warmupRatio) > 0) formData.append('warmup_ratio', config.warmupRatio);
      if (config.evalSteps.trim()) formData.append('eval_steps', config.evalSteps.trim());
      if (config.saveSteps.trim()) formData.append('save_steps', config.saveSteps.trim());
      formData.append('api_key', config.apiKey);
      formData.append('projectName', config.projectName);
      formData.append('systemPrompt', config.systemPrompt);
      formData.append('columnMapping', config.columnMapping);

      if (previewData.totalRecords) formData.append('totalRecords', String(previewData.totalRecords));
      if (previewData.totalTokens) formData.append('totalTokens', String(previewData.totalTokens));

      if (config.hfRepoId) {
        formData.append('push_to_hub', 'true');
        formData.append('hf_repo_id', config.hfRepoId);
      }
      if (config.hfToken) formData.append('hf_token', config.hfToken);

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

      const response = await api.post('/train/start', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = response.data;
      if (data && (data.job_id || data.jobId || data.id)) {
        const actualJobId = String(data.job_id || data.jobId || data.id);
        triggerToast(`Training initiated successfully! Job ID: ${actualJobId.slice(-8)}`, 'success');
        startTrackingJob(actualJobId, {
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
          trainingConfig: safeTrainingConfig(config),
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
        <div className="at-header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {Object.keys(activeJobs).length > 0 && (
            <div className="at-badge-active" aria-label={`${Object.keys(activeJobs).length} active training runs`}>
              <span className="at-pulse-dot" />
              {Object.keys(activeJobs).length} Active
            </div>
          )}
          <button
            className="at-btn-history"
            onClick={handleClearGpuQueue}
            disabled={clearingQueue}
            title="Dọn sạch hàng đợi GPU nếu gặp lỗi treo job"
            style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}
          >
            🧹 {clearingQueue ? 'Đang dọn...' : 'Dọn Queue GPU'}
          </button>
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
        jobConfigs={globalTrainingState.jobConfigs}
        onStopJob={handleStopJob}
        onDismissJob={handleDismissJob}
        onChatTest={handleChatTest}
        onGenerateSummary={handleGenerateTrainSummary}
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
          return workers.some((w: any) => w.status === 'online' || ('vram_total_mb' in w && !w.error));
        }, [systemResources])}
        onConfirm={handleStartTrainingConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
