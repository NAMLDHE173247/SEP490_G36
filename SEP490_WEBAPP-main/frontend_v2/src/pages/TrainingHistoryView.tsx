import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api, apiService } from '../services/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  BarChart2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  ClipboardList,
  History,
  FileText
} from 'lucide-react';
import '../styles/history.css';

interface TrainingHistoryItem {
  _id: string;
  jobId: string;
  projectName: string;
  baseModel: string;
  datasetSource: string;
  datasetName: string;
  columnMapping: string;
  systemPrompt?: string;
  systemPromptVersion?: string;
  datasetVersionId?: string;
  parameters: {
    batchSize: number;
    epochs: number;
    learningRate: number;
    blockSize: number;
    modelMaxLength: number;
    r: number;
    lora_alpha: number;
    lora_dropout: number;
    random_state: number;
    gradient_accumulation_steps: number;
    warmup_steps: number;
    weight_decay: number;
    seed: number;
    early_stopping_loss: number;
    early_stopping_patience: number;
    optim: string;
    lr_scheduler_type: string;
  };
  pushToHub: boolean;
  hfRepoId: string;
  status: string;
  finalMetrics?: {
    loss: number;
    eval_loss?: number;
    accuracy: number;
    vram: number;
    gpu_util: number;
  };
  lastLogLine?: string;
  lastError?: string;
  progress?: number;
  lastProgressAt?: string;
  updatedAt?: string;
  trainingDuration: number;
  startedAt: string;
  completedAt?: string;
  lossHistory?: { progress: number; loss: number }[];
  evalLossHistory?: { progress: number; loss: number }[];
  createdAt: string;
  latest_checkpoint_file_id?: string;
  workerUrl?: string;
  totalTokens?: number;
  totalRecords?: number;
}

interface TrainAuditPayload {
  jobId: string;
  status: string;
  lastLogLine?: string;
  lastError?: string;
  technicalError?: string;
  trainLogs: string[];
  auditEvents: {
    ts: string;
    level: 'info' | 'warn' | 'error';
    source: string;
    code?: string;
    message: string;
  }[];
  effectiveConfig?: Record<string, unknown> | null;
  metricsHistory?: {
    ts: string;
    loss?: number;
    eval_loss?: number;
    vram?: number;
    gpu_util?: number;
    progress?: number;
  }[];
  progress?: number | null;
  lastProgressAt?: string | null;
  source?: string;
}

const ACTIVE_STATUSES = ['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'];
const STALL_UI_MS = 5 * 60 * 1000;

/** Job đang chạy mà không có heartbeat mới trong 5 phút → nghi treo. */
function isLikelyStalled(item: TrainingHistoryItem): boolean {
  if (!ACTIVE_STATUSES.includes(item.status)) return false;
  const heartbeat = item.lastProgressAt || item.updatedAt || item.startedAt;
  if (!heartbeat) return false;
  return Date.now() - new Date(heartbeat).getTime() > STALL_UI_MS;
}

interface TrainingHistoryViewProps {
  setActiveTab: (tab: string) => void;
}

const LINE_COLORS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

const MOCK_HISTORIES: TrainingHistoryItem[] = [
  {
    _id: "mock_run_1",
    jobId: "job-mock-math-socratic-001",
    projectName: "socratic-math-tutor-v1",
    baseModel: "Qwen/Qwen3-0.6B",
    datasetSource: "local",
    datasetName: "math_socratic_dataset.json",
    columnMapping: "instruction",
    systemPrompt: "Bạn là một gia sư dạy toán theo phương pháp Socratic. Thay vì đưa ra câu trả lời trực tiếp, hãy đặt câu hỏi gợi ý để học sinh tự tìm ra đáp án.",
    systemPromptVersion: "Math-Socratic-V1",
    parameters: {
      batchSize: 2,
      epochs: 3,
      learningRate: 0.00003,
      blockSize: 512,
      modelMaxLength: 1024,
      r: 8,
      lora_alpha: 8,
      lora_dropout: 0.05,
      random_state: 3407,
      gradient_accumulation_steps: 4,
      warmup_steps: 5,
      weight_decay: 0.01,
      seed: 3407,
      early_stopping_loss: 0.05,
      early_stopping_patience: 3,
      optim: "adamw_8bit",
      lr_scheduler_type: "linear"
    },
    pushToHub: true,
    hfRepoId: "socratic-ai/qwen-0.6b-math-tutor",
    status: "COMPLETED",
    finalMetrics: {
      loss: 0.1245,
      eval_loss: 0.1582,
      accuracy: 96.8,
      vram: 4120,
      gpu_util: 92
    },
    lastLogLine: "[Epoch 3/3] Training completed. Saving checkpoint to HF Hub and local storage...",
    trainingDuration: 1450000,
    startedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 1450000).toISOString(),
    lossHistory: [
      { progress: 10, loss: 1.4502 },
      { progress: 20, loss: 1.1205 },
      { progress: 30, loss: 0.8951 },
      { progress: 40, loss: 0.6512 },
      { progress: 50, loss: 0.4503 },
      { progress: 60, loss: 0.3204 },
      { progress: 70, loss: 0.2401 },
      { progress: 80, loss: 0.1852 },
      { progress: 90, loss: 0.1451 },
      { progress: 100, loss: 0.1245 }
    ],
    evalLossHistory: [
      { progress: 20, loss: 1.2504 },
      { progress: 40, loss: 0.7892 },
      { progress: 60, loss: 0.4201 },
      { progress: 80, loss: 0.2302 },
      { progress: 100, loss: 0.1582 }
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    totalRecords: 1200,
    totalTokens: 350000
  },
  {
    _id: "mock_run_2",
    jobId: "job-mock-code-socratic-002",
    projectName: "socratic-code-assistant-v2",
    baseModel: "meta-llama/Llama-3.1-8B-Instruct",
    datasetSource: "hub",
    datasetName: "openai/code-instructions-socratic",
    columnMapping: "prompt",
    systemPrompt: "Bạn là một trợ lý lập trình Socratic. Hãy dẫn dắt học sinh tự sửa lỗi cú pháp và tư duy thuật toán thông qua câu hỏi gợi mở.",
    systemPromptVersion: "Code-Socratic-V2",
    parameters: {
      batchSize: 1,
      epochs: 3,
      learningRate: 0.00005,
      blockSize: 512,
      modelMaxLength: 1024,
      r: 16,
      lora_alpha: 32,
      lora_dropout: 0.1,
      random_state: 42,
      gradient_accumulation_steps: 4,
      warmup_steps: 5,
      weight_decay: 0.01,
      seed: 42,
      early_stopping_loss: 0.1,
      early_stopping_patience: 3,
      optim: "adamw_8bit",
      lr_scheduler_type: "cosine"
    },
    pushToHub: true,
    hfRepoId: "socratic-ai/llama-8b-code-assistant",
    status: "COMPLETED",
    finalMetrics: {
      loss: 0.3541,
      eval_loss: 0.3912,
      accuracy: 91.2,
      vram: 14200,
      gpu_util: 98
    },
    lastLogLine: "[Epoch 3/3] Epoch finished. Validation loss: 0.3912. Model successfully saved.",
    trainingDuration: 3600000,
    startedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 24 * 3600 * 1000 + 3600000).toISOString(),
    lossHistory: [
      { progress: 10, loss: 2.1052 },
      { progress: 20, loss: 1.8504 },
      { progress: 30, loss: 1.4502 },
      { progress: 40, loss: 1.1205 },
      { progress: 50, loss: 0.8951 },
      { progress: 60, loss: 0.7104 },
      { progress: 70, loss: 0.5801 },
      { progress: 80, loss: 0.4752 },
      { progress: 90, loss: 0.3981 },
      { progress: 100, loss: 0.3541 }
    ],
    evalLossHistory: [
      { progress: 20, loss: 1.9502 },
      { progress: 40, loss: 1.2504 },
      { progress: 60, loss: 0.8102 },
      { progress: 80, loss: 0.5302 },
      { progress: 100, loss: 0.3912 }
    ],
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    totalRecords: 2500,
    totalTokens: 1250000
  },
  {
    _id: "mock_run_3",
    jobId: "job-mock-glm-prompt-003",
    projectName: "glm-prompt-opt-v1",
    baseModel: "zai-org/GLM-4.7-Flash",
    datasetSource: "cloud",
    datasetName: "gcs://socratic-bucket/prompt-data.jsonl",
    columnMapping: "text",
    systemPrompt: "Hãy biến đổi câu hỏi của người dùng thành các prompt mang tính gợi mở, học hỏi sâu sắc theo triết lý Socratic.",
    systemPromptVersion: "Prompt-Opt-V1",
    parameters: {
      batchSize: 2,
      epochs: 5,
      learningRate: 0.00002,
      blockSize: 512,
      modelMaxLength: 1024,
      r: 8,
      lora_alpha: 8,
      lora_dropout: 0.05,
      random_state: 1234,
      gradient_accumulation_steps: 8,
      warmup_steps: 2,
      weight_decay: 0.0,
      seed: 1234,
      early_stopping_loss: 0.1,
      early_stopping_patience: 2,
      optim: "adamw_8bit",
      lr_scheduler_type: "linear"
    },
    pushToHub: false,
    hfRepoId: "",
    status: "STOPPED",
    finalMetrics: {
      loss: 0.8123,
      eval_loss: 0.8912,
      accuracy: 78.5,
      vram: 6200,
      gpu_util: 85
    },
    lastLogLine: "[Epoch 2/5] Training process interrupted by user command.",
    trainingDuration: 600000,
    startedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 12 * 3600 * 1000 + 600000).toISOString(),
    lossHistory: [
      { progress: 10, loss: 1.9502 },
      { progress: 20, loss: 1.6205 },
      { progress: 30, loss: 1.3401 },
      { progress: 40, loss: 1.1002 },
      { progress: 50, loss: 0.8123 }
    ],
    evalLossHistory: [
      { progress: 20, loss: 1.7204 },
      { progress: 40, loss: 1.2105 }
    ],
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    totalRecords: 800,
    totalTokens: 180000
  },
  {
    _id: "mock_run_4",
    jobId: "job-mock-physics-004",
    projectName: "physics-socratic-v3",
    baseModel: "Qwen/Qwen3-0.6B",
    datasetSource: "local",
    datasetName: "physics_qa_dataset.json",
    columnMapping: "instruction",
    systemPrompt: "Dẫn dắt các khái niệm vật lý (lực, động năng, điện trường) bằng câu hỏi logic Socratic.",
    systemPromptVersion: "Physics-V3",
    parameters: {
      batchSize: 2,
      epochs: 3,
      learningRate: 0.00003,
      blockSize: 512,
      modelMaxLength: 1024,
      r: 8,
      lora_alpha: 8,
      lora_dropout: 0.05,
      random_state: 3407,
      gradient_accumulation_steps: 4,
      warmup_steps: 5,
      weight_decay: 0.01,
      seed: 3407,
      early_stopping_loss: 0.05,
      early_stopping_patience: 3,
      optim: "adamw_hf",
      lr_scheduler_type: "linear"
    },
    pushToHub: false,
    hfRepoId: "",
    status: "FAILED",
    finalMetrics: {
      loss: 1.5421,
      accuracy: 42.1,
      vram: 4120,
      gpu_util: 40
    },
    lastLogLine: "CUDA Out of Memory Error: Tried to allocate 2.40 GiB (GPU 0; 8.00 GiB total capacity; 5.12 GiB already allocated).",
    trainingDuration: 120000,
    startedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 6 * 3600 * 1000 + 120000).toISOString(),
    lossHistory: [
      { progress: 5, loss: 2.0504 },
      { progress: 10, loss: 1.8502 },
      { progress: 15, loss: 1.5421 }
    ],
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    totalRecords: 1500,
    totalTokens: 450000
  }
];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function TrainingHistoryView({ setActiveTab }: TrainingHistoryViewProps) {
  const [histories, setHistories] = useState<TrainingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState<string | null>(null);

  // Filter state
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Multi-run Checked items
  const [checkedJobIds, setCheckedJobIds] = useState<string[]>([]);

  // Registry state for Register Modal
  const [registries, setRegistries] = useState<any[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState<string | null>(null); // jobId
  const [selectedRegistryId, setSelectedRegistryId] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('v1.0.0');
  const [promptVersion, setPromptVersion] = useState<string>('Default');
  const [jobEvaluations, setJobEvaluations] = useState<any[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string>('');
  const [registering, setRegistering] = useState(false);

  // Audit log (Mongo) — xem lỗi/log khi GPU worker đã tắt
  const [auditByJob, setAuditByJob] = useState<Record<string, TrainAuditPayload>>({});
  const [auditLoading, setAuditLoading] = useState<string | null>(null);
  const [auditTab, setAuditTab] = useState<'events' | 'logs' | 'config' | 'resources'>('events');
  const [clearingQueue, setClearingQueue] = useState(false);

  // Fetch base models
  const fetchBaseModels = useCallback(async () => {
    try {
      const res = await api.get('/train/history/models');
      const dbModels = Array.isArray(res.data) ? res.data : [];
      setBaseModels(dbModels);
    } catch (err) {
      console.error('Failed to fetch base models:', err);
      setBaseModels([]);
    }
  }, []);

  // Fetch model registries
  const fetchRegistries = useCallback(async () => {
    try {
      const data = await apiService.listModelRegistries();
      setRegistries(data);
      if (data.length > 0) setSelectedRegistryId(data[0]._id);
    } catch (err) {
      console.error('Failed to fetch registries:', err);
    }
  }, []);

  // Fetch training history list
  const fetchHistories = useCallback(async (modelFilter?: string) => {
    setLoading(true);
    try {
      const url = modelFilter
        ? `/train/history?baseModel=${encodeURIComponent(modelFilter)}`
        : '/train/history';
      const res = await api.get(url);
      const data = Array.isArray(res.data) ? res.data : [];
      setHistories(data);
    } catch (err) {
      console.error('Failed to fetch training history:', err);
      setHistories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBaseModels();
    fetchHistories();
    fetchRegistries();
  }, [fetchBaseModels, fetchHistories, fetchRegistries]);

  useEffect(() => {
    if (!expandedId) return;
    let cancelled = false;
    setAuditTab('events');
    setAuditLoading(expandedId);
    (async () => {
      try {
        const res = await api.get(`/train/history/${expandedId}/audit`);
        if (!cancelled && res.data) {
          setAuditByJob((prev) => ({ ...prev, [expandedId]: res.data as TrainAuditPayload }));
        }
      } catch (err) {
        console.error('Failed to fetch train audit:', err);
      } finally {
        if (!cancelled) setAuditLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedId]);

  // Model filter handler
  const handleModelFilterChange = (model: string) => {
    setSelectedModel(model);
    setExpandedId(null);
    setCheckedJobIds([]); // Clear selection on filter
    fetchHistories(model || undefined);
  };

  // Toggle multi-run run checkbox
  const handleCheckboxToggle = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation(); // Prevent expanding details when clicking checkbox
    setCheckedJobIds(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  };

  // Delete run
  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa bản ghi training này không?')) return;
    setDeleteLoading(jobId);
    try {
      await api.delete(`/train/history/${jobId}`);
      setHistories(prev => prev.filter(h => h.jobId !== jobId));
      setCheckedJobIds(prev => prev.filter(id => id !== jobId));
      if (expandedId === jobId) setExpandedId(null);
      fetchBaseModels();
    } catch (err) {
      console.error('Failed to delete history record:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Clear GPU Queue helper (100% FE-side using existing deployed endpoints)
  const handleClearGpuQueue = async () => {
    if (!confirm('Bạn có chắc chắn muốn phát tín hiệu dọn dẹp các job đang kẹt trong Queue không?')) return;
    setClearingQueue(true);
    const toastId = toast.loading('Đang tìm kiếm và hủy các job bị treo...');
    try {
      const jobIdsToStop = new Set<string>();

      // 1. Fetch active jobs from existing deployed API /train/active
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

      // 2. Filter stuck jobs from training histories list
      histories.forEach((h) => {
        if (['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'].includes(h.status)) {
          if (h.jobId) jobIdsToStop.add(h.jobId);
        }
      });

      if (jobIdsToStop.size === 0) {
        toast.success('Hiện tại không phát hiện job nào bị kẹt trên hệ thống!', { id: toastId });
        return;
      }

      // 3. Send stop signal for each job using existing POST /train/stop/:jobId
      for (const id of Array.from(jobIdsToStop)) {
        try {
          await api.post(`/train/stop/${id}`);
        } catch (err) {
          // Bỏ qua lỗi 404/500 cho từng job lẻ để không gián đoạn luồng
          console.warn(`Stop call for job ${id} warning:`, err);
        }
      }

      toast.success(`Đã phát tín hiệu dọn dẹp Queue cho ${jobIdsToStop.size} job(s)!`, { id: toastId });
      fetchHistories(selectedModel || undefined);
    } catch (err: any) {
      console.error('Lỗi dọn dẹp queue:', err);
      toast.error('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message), { id: toastId });
    } finally {
      setClearingQueue(false);
    }
  };

  // Resume training
  const handleResume = async (e: React.MouseEvent, item: TrainingHistoryItem) => {
    e.stopPropagation();
    setResumeLoading(item.jobId);
    try {
      const res = await api.post(`/train/resume/${item.jobId}`);
      if (res.data && res.data.job_id) {
        // Save the jobId to trigger tracking inside AutoTrainView
        localStorage.setItem('autotrain_resume_job_id', res.data.job_id);
        setActiveTab('AutoTrain');
      } else {
        throw new Error('Không nhận được Job ID mới từ backend');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Khôi phục Job thất bại');
    } finally {
      setResumeLoading(null);
    }
  };

  // Register model version modal
  const openRegisterModal = async (e: React.MouseEvent, item: TrainingHistoryItem) => {
    e.stopPropagation();
    setShowRegisterModal(item.jobId);
    setVersionName('v1.0.0');
    setPromptVersion(item.systemPromptVersion || 'Default');
    setSelectedEvalId('');
    setJobEvaluations([]);

    try {
      const evals = await apiService.getEvaluationsByJob(item.jobId);
      setJobEvaluations(evals);
      if (evals.length > 0) {
        setSelectedEvalId(evals[0]._id);
      }
    } catch (error) {
      console.error('Error fetching job evaluations:', error);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!selectedRegistryId) {
      toast.error('Vui lòng tạo hoặc chọn Model Registry trước.');
      return;
    }
    const item = histories.find(h => h.jobId === showRegisterModal);
    if (!item) return;

    setRegistering(true);
    const toastId = toast.loading('Đang đăng ký phiên bản Model...');
    try {
      await apiService.registerModelVersion({
        modelRegistryId: selectedRegistryId,
        version: versionName,
        trainingHistoryId: item._id,
        evaluationId: selectedEvalId || undefined,
        hfRepoId: item.hfRepoId,
        promptVersion: promptVersion,
        notes: `Đăng ký từ Training Job: ${item.jobId}`,
      });
      toast.success('Đăng ký phiên bản Model thành công!', { id: toastId });
      setShowRegisterModal(null);
    } catch (err: any) {
      toast.error('Lỗi đăng ký model: ' + (err.response?.data?.message || err.message), { id: toastId });
    } finally {
      setRegistering(false);
    }
  };

  // Compute Loss curves data for Checked Items comparison
  const checkedRuns = histories.filter(h => checkedJobIds.includes(h.jobId));
  
  const multiChartData = React.useMemo(() => {
    if (checkedRuns.length === 0) return [];
    
    // Group values by rounded progress percentage 0 to 100
    const progressMap = new Map<number, Record<string, any>>();
    for (let p = 0; p <= 100; p++) {
      progressMap.set(p, { progress: p });
    }

    checkedRuns.forEach((run) => {
      const keySuffix = run.jobId;
      if (run.lossHistory) {
        run.lossHistory.forEach(lh => {
          const p = Math.round(lh.progress);
          if (p >= 0 && p <= 100) {
            const pt = progressMap.get(p) || { progress: p };
            pt[`loss_${keySuffix}`] = lh.loss;
            progressMap.set(p, pt);
          }
        });
      }
    });

    return Array.from(progressMap.values())
      .filter(pt => Object.keys(pt).length > 1) // Keep only points that have some run data
      .sort((a, b) => a.progress - b.progress);
  }, [checkedRuns]);

  // Compute Single-run loss chart data
  const getSingleChartData = (item: TrainingHistoryItem) => {
    if (!item.lossHistory) return [];
    const combined = [...item.lossHistory.map(h => ({
      progress: Math.round(h.progress),
      loss: h.loss,
      evalLoss: undefined as number | undefined
    }))];

    if (item.evalLossHistory) {
      item.evalLossHistory.forEach(eh => {
        const rounded = Math.round(eh.progress);
        const existing = combined.find(c => c.progress === rounded);
        if (existing) {
          existing.evalLoss = eh.loss;
        } else {
          combined.push({
            progress: rounded,
            loss: undefined as any,
            evalLoss: eh.loss
          });
        }
      });
    }
    return combined.sort((a, b) => a.progress - b.progress);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'status-completed';
      case 'STOPPED': return 'status-stopped';
      case 'FAILED': return 'status-failed';
      case 'ERROR': return 'status-stopped';
      case 'TRAINING':
      case 'RUNNING': return 'status-running';
      default: return '';
    }
  };

  return (
    <div className="history-view">
      {/* Header */}
      <div className="history-header">
        <div className="history-title-group">
          <History size={28} className="text-primary" />
          <div>
            <h1>Lịch sử Huấn luyện (Training History)</h1>
            <p>Quản lý các đợt fine-tune model, so sánh các run và tải checkpoint</p>
          </div>
        </div>
        <div className="history-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-outline"
            onClick={handleClearGpuQueue}
            disabled={clearingQueue}
            title="Giải phóng hàng đợi GPU từ xa nếu gặp lỗi treo job"
            style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fef2f2' }}
          >
            <Trash2 size={16} /> {clearingQueue ? 'Đang dọn...' : '🧹 Dọn Queue GPU'}
          </button>
          <button className="btn-outline" onClick={() => fetchHistories(selectedModel || undefined)}>
            <RefreshCw size={16} /> Tải lại danh sách
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-card">
        <div className="filter-row">
          <div className="filter-label">
            <FileText size={18} className="text-muted" />
            <span>Lọc theo Base Model:</span>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => handleModelFilterChange(e.target.value)}
            className="filter-select"
          >
            <option value="">Tất cả Models</option>
            {baseModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedModel && (
            <button className="btn-outline" onClick={() => handleModelFilterChange('')}>
              Xóa lọc
            </button>
          )}
          <span className="text-muted text-sm" style={{ marginLeft: 'auto' }}>
            Tìm thấy {histories.length} bản ghi
          </span>
        </div>
      </div>

      {/* Multi-run Comparison Section (Visible when 2+ runs selected) */}
      {checkedRuns.length >= 2 && (
        <div className="comparison-container">
          <div className="comparison-header">
            <h3>📈 So sánh Đa-Run (Multi-run Comparison)</h3>
            <button className="btn-outline" onClick={() => setCheckedJobIds([])} style={{ padding: '4px 10px', fontSize: '12px' }}>
              Xóa so sánh ({checkedRuns.length} đã chọn)
            </button>
          </div>

          <div className="comparison-grid">
            {/* Multi-run Loss Chart */}
            <div className="comparison-chart-card">
              <h4 className="text-sm font-semibold mb-3 text-muted">Biểu đồ đối chiếu Loss giữa các Run</h4>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={multiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="progress" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip labelFormatter={v => `Progress: ${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {checkedRuns.map((run, idx) => (
                    <Line
                      key={run.jobId}
                      type="monotone"
                      dataKey={`loss_${run.jobId}`}
                      name={run.projectName || run.jobId.slice(4, 12)}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison Metrics Grid */}
            <div className="comparison-table-card">
              <table className="comp-table">
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Base Model</th>
                    <th>Epochs</th>
                    <th>Batch</th>
                    <th>Loss cuối</th>
                    <th>VRAM</th>
                    <th>Records nhồi vào</th>
                    <th>Tokens thực tế</th>
                  </tr>
                </thead>
                <tbody>
                  {checkedRuns.map(run => (
                    <tr key={run.jobId}>
                      <td className="font-semibold">{run.projectName}</td>
                      <td className="text-muted">{run.baseModel}</td>
                      <td>{run.parameters.epochs}</td>
                      <td>{run.parameters.batchSize}</td>
                      <td className="text-primary font-bold">{run.finalMetrics?.loss?.toFixed(4) || '-'}</td>
                      <td>{run.finalMetrics?.vram || '-'} MB</td>
                      <td className="font-semibold text-success">{run.totalRecords || '-'}</td>
                      <td className="font-semibold text-info">{(run.totalTokens && run.totalTokens.toLocaleString('vi-VN')) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Table List */}
      <div className="runs-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            Đang tải dữ liệu lịch sử...
          </div>
        ) : histories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            Không tìm thấy bản ghi huấn luyện nào.
          </div>
        ) : (
          <table className="runs-table">
            <thead>
              <tr>
                <th className="checkbox-cell">
                  {/* Select Header */}
                </th>
                <th>Trạng thái</th>
                <th>Tên dự án (Project)</th>
                <th>Base Model</th>
                <th>Loss</th>
                <th title="SFT ngôn ngữ không tính classification accuracy">Accuracy</th>
                <th>Thời gian chạy</th>
                <th>Số records</th>
                <th>Số tokens</th>
                <th>Thời điểm</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {histories.map((item) => {
                const isExpanded = expandedId === item.jobId;
                const isChecked = checkedJobIds.includes(item.jobId);
                return (
                  <React.Fragment key={item.jobId}>
                    {/* Row Summary */}
                    <tr
                      className={`summary-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.jobId)}
                    >
                      <td className="checkbox-cell" onClick={(e) => handleCheckboxToggle(e, item.jobId)}>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Controlled click via cell
                          disabled={item.status !== 'COMPLETED' && item.status !== 'STOPPED'}
                        />
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(item.status)}`}>
                          <span className="status-dot" />
                          {item.status}
                        </span>
                        {isLikelyStalled(item) && (
                          <span
                            className="stall-badge"
                            title="Không thấy tiến triển mới trong hơn 5 phút — kiểm tra GPU worker"
                          >
                            ⚠ treo?
                          </span>
                        )}
                      </td>
                      <td className="font-bold">{item.projectName}</td>
                      <td className="text-muted text-sm">{item.baseModel}</td>
                      <td className="font-bold text-primary">{item.finalMetrics?.loss?.toFixed(4) || '-'}</td>
                      <td>{item.finalMetrics?.accuracy ? `${item.finalMetrics.accuracy}%` : 'Không đo'}</td>
                      <td>{formatDuration(item.trainingDuration)}</td>
                      <td className="font-bold text-success text-center">{item.totalRecords || '-'}</td>
                      <td className="font-bold text-info">{item.totalTokens ? item.totalTokens.toLocaleString('vi-VN') : '-'}</td>
                      <td className="text-muted text-sm">{formatDate(item.completedAt || item.startedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {isExpanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                        </div>
                      </td>
                    </tr>

                    {/* Expanding Details Panel */}
                    {isExpanded && (
                      <tr className="details-row">
                        <td colSpan={11}>
                          <div className="details-container">
                            <div className="details-grid">
                              {/* Left: Hyperparameters JSON */}
                              <div>
                                <div className="detail-section-title">Thông số huấn luyện (Hyperparameters)</div>
                                <pre className="params-code-box">
                                  {JSON.stringify(item.parameters, null, 2)}
                                </pre>
                              </div>

                              {/* Right: Curve & Metrics */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="detail-stats-card">
                                  <div className="detail-stats-row">
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">Loss Cuối</div>
                                      <div className="detail-stat-value text-primary">{item.finalMetrics?.loss?.toFixed(4) || '-'}</div>
                                    </div>
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">VRAM Đỉnh</div>
                                      <div className="detail-stat-value">{item.finalMetrics?.vram || '-'} MB</div>
                                    </div>
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">GPU Average</div>
                                      <div className="detail-stat-value">{item.finalMetrics?.gpu_util || '-'}%</div>
                                    </div>
                                  </div>

                                  <div className="detail-info-list">
                                    <div className="detail-info-item">
                                      <span className="info-label">Dataset:</span>
                                      <span className="info-value">{item.datasetName} ({item.datasetSource})</span>
                                    </div>
                                    <div className="detail-info-item">
                                      <span className="info-label">Cột Mapping:</span>
                                      <span className="info-value">`{item.columnMapping}`</span>
                                    </div>
                                    {item.hfRepoId && (
                                      <div className="detail-info-item">
                                        <span className="info-label">Hugging Face Repo:</span>
                                        <span className="info-value" style={{ fontFamily: 'monospace' }}>{item.hfRepoId}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Loss LineChart */}
                                {item.lossHistory && item.lossHistory.length > 0 && (
                                  <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', height: '180px' }}>
                                    <div className="detail-section-title" style={{ marginBottom: '8px' }}>Đường cong suy giảm Loss (Loss Curve)</div>
                                    <ResponsiveContainer width="100%" height="80%">
                                      <LineChart data={getSingleChartData(item)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="progress" tick={{ fontSize: 8, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                                        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                        <Tooltip labelFormatter={v => `Progress: ${v}%`} contentStyle={{ fontSize: 10 }} />
                                        <Line type="monotone" dataKey="loss" name="Train Loss" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                                        <Line type="monotone" dataKey="evalLoss" name="Eval Loss" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* System Prompt preview */}
                            {item.systemPrompt && (
                              <div style={{ marginBottom: '16px' }}>
                                <div className="detail-section-title">System Prompt đã áp dụng</div>
                                <div className="detail-prompt-box">
                                  {item.systemPrompt}
                                </div>
                              </div>
                            )}

                            {/* Last console log line */}
                            {item.lastLogLine && (
                              <div className="log-box">
                                <div className="log-header">
                                  <span className="log-dot red" />
                                  <span className="log-dot yellow" />
                                  <span className="log-dot green" />
                                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', fontWeight: 'bold' }}>Dòng Log Cuối</span>
                                </div>
                                <pre className="log-content">{item.lastLogLine}</pre>
                              </div>
                            )}

                            {/* Audit trail — Mongo, không cần SSH / GPU worker */}
                            <div className="audit-panel" onClick={(e) => e.stopPropagation()}>
                              <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ClipboardList size={16} />
                                Audit &amp; Logs
                                <span className="text-muted text-sm" style={{ fontWeight: 400 }}>
                                  (lưu Mongo — xem lại khi worker đã tắt)
                                </span>
                              </div>
                              {(item.lastError || auditByJob[item.jobId]?.lastError) && (
                                <div className="audit-error-banner">
                                  {item.lastError || auditByJob[item.jobId]?.lastError}
                                </div>
                              )}
                              <div className="audit-tabs">
                                {(['events', 'logs', 'config', 'resources'] as const).map((tab) => (
                                  <button
                                    key={tab}
                                    type="button"
                                    className={`audit-tab ${auditTab === tab ? 'active' : ''}`}
                                    onClick={() => setAuditTab(tab)}
                                  >
                                    {tab === 'events' ? 'Sự kiện' : tab === 'logs' ? 'Full logs' : tab === 'config' ? 'Effective config' : 'Tài nguyên'}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  className="audit-tab"
                                  style={{ marginLeft: 'auto' }}
                                  onClick={async () => {
                                    setAuditLoading(item.jobId);
                                    try {
                                      const res = await api.get(`/train/history/${item.jobId}/audit`);
                                      setAuditByJob((prev) => ({ ...prev, [item.jobId]: res.data }));
                                    } catch {
                                      toast.error('Không tải được audit');
                                    } finally {
                                      setAuditLoading(null);
                                    }
                                  }}
                                >
                                  <RefreshCw size={12} /> Tải lại
                                </button>
                              </div>
                              {auditLoading === item.jobId && !auditByJob[item.jobId] ? (
                                <div className="text-muted text-sm" style={{ padding: 12 }}>Đang tải audit…</div>
                              ) : (
                                <>
                                  {auditTab === 'events' && (
                                    <div className="audit-events">
                                      {(auditByJob[item.jobId]?.auditEvents || []).length === 0 ? (
                                        <div className="text-muted text-sm" style={{ padding: 12 }}>
                                          Chưa có sự kiện cảnh báo/lỗi. Mở job đang train hoặc đợi sync từ GPU.
                                        </div>
                                      ) : (
                                        (auditByJob[item.jobId]?.auditEvents || []).slice().reverse().map((ev, idx) => (
                                          <div key={`${ev.ts}-${idx}`} className={`audit-event audit-${ev.level}`}>
                                            <span className="audit-level">{ev.level}</span>
                                            {ev.code && <span className="audit-code">{ev.code}</span>}
                                            <span className="audit-msg">{ev.message}</span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                  {auditTab === 'logs' && (
                                    <div className="log-box" style={{ marginTop: 8 }}>
                                      <pre className="log-content audit-log-scroll">
                                        {(auditByJob[item.jobId]?.trainLogs || []).length
                                          ? (auditByJob[item.jobId]?.trainLogs || []).join('\n')
                                          : '(chưa có log được đồng bộ)'}
                                      </pre>
                                    </div>
                                  )}
                                  {auditTab === 'config' && (
                                    <pre className="params-code-box" style={{ marginTop: 8, maxHeight: 280, overflow: 'auto' }}>
                                      {auditByJob[item.jobId]?.effectiveConfig
                                        ? JSON.stringify(auditByJob[item.jobId]?.effectiveConfig, null, 2)
                                        : '(chưa có effective_config — thường xuất hiện sau khi job bắt đầu train)'}
                                    </pre>
                                  )}
                                  {auditTab === 'resources' && (
                                    (auditByJob[item.jobId]?.metricsHistory || []).length > 0 ? (
                                      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', height: '220px', marginTop: 8 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                          <LineChart
                                            data={(auditByJob[item.jobId]?.metricsHistory || []).map((m) => ({
                                              time: new Date(m.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                                              vram: m.vram ?? null,
                                              gpu: m.gpu_util ?? null,
                                            }))}
                                          >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                            <YAxis yAxisId="vram" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                            <YAxis yAxisId="gpu" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Line yAxisId="vram" type="monotone" dataKey="vram" name="VRAM (MB)" stroke="#8b5cf6" strokeWidth={1.5} dot={false} connectNulls />
                                            <Line yAxisId="gpu" type="monotone" dataKey="gpu" name="GPU (%)" stroke="#10b981" strokeWidth={1.5} dot={false} connectNulls />
                                          </LineChart>
                                        </ResponsiveContainer>
                                      </div>
                                    ) : (
                                      <div className="text-muted text-sm" style={{ padding: 12 }}>
                                        Chưa có snapshot tài nguyên. Snapshot được lưu mỗi ~30 giây khi job đang được theo dõi.
                                      </div>
                                    )
                                  )}
                                </>
                              )}
                            </div>

                            {/* Actions bar */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                              {item.status === 'COMPLETED' && (
                                <button className="btn-emerald-outline" onClick={(e) => openRegisterModal(e, item)}>
                                  Đăng ký Model vào Registry
                                </button>
                              )}
                              {(item.status === 'STOPPED' || item.status === 'FAILED' || item.status === 'ERROR') && (
                                <button
                                  className="btn-blue-outline"
                                  onClick={(e) => handleResume(e, item)}
                                  disabled={!(item.workerUrl || item.latest_checkpoint_file_id || (item.pushToHub && item.hfRepoId)) || resumeLoading === item.jobId}
                                >
                                  {resumeLoading === item.jobId ? 'Đang khôi phục...' : 'Resume (Tiếp tục)'}
                                </button>
                              )}
                              {(item.status === 'QUEUED' || item.status === 'TRAINING' || item.status === 'RUNNING' || item.status === 'LOADING_MODEL' || item.status === 'PENDING') && (
                                <button
                                  className="btn-indigo"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    localStorage.setItem('autotrain_resume_job_id', item.jobId);
                                    setActiveTab('AutoTrain');
                                  }}
                                  style={{
                                    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                                  }}
                                >
                                  Theo dõi tiến trình
                                </button>
                              )}
                              <button
                                className="btn-danger-outline"
                                onClick={(e) => handleDelete(e, item.jobId)}
                                disabled={deleteLoading === item.jobId}
                              >
                                {deleteLoading === item.jobId ? 'Đang xóa...' : 'Xóa Run'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Model registration modal popup */}
      {showRegisterModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Đăng ký Phiên bản Model</h2>
              <button className="modal-close-btn" onClick={() => setShowRegisterModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Chọn Model Registry</label>
                {registries.length > 0 ? (
                  <select
                    value={selectedRegistryId}
                    onChange={(e) => setSelectedRegistryId(e.target.value)}
                    className="form-input"
                  >
                    {registries.map((r) => (
                      <option key={r._id} value={r._id}>{r.name} ({r.baseModel})</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-danger" style={{ padding: '8px', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px' }}>
                    Không tìm thấy registry nào. Hãy tạo Registry trong Model Registry trước.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Tên Phiên bản (Version)</label>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  className="form-input"
                  placeholder="Ví dụ: v1.0.0"
                />
              </div>

              <div className="form-group">
                <label>Phiên bản System Prompt</label>
                <input
                  type="text"
                  value={promptVersion}
                  onChange={(e) => setPromptVersion(e.target.value)}
                  className="form-input"
                  placeholder="Ví dụ: Default / V1.2"
                />
              </div>

              {jobEvaluations.length > 0 && (
                <div className="form-group">
                  <label>Liên kết kết quả đánh giá (Evaluation)</label>
                  <select
                    value={selectedEvalId}
                    onChange={(e) => setSelectedEvalId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Không liên kết</option>
                    {jobEvaluations.map((ev) => (
                      <option key={ev._id} value={ev._id}>
                        {ev.modelEvalId} - Điểm: {ev.summary?.overall?.ft_avg?.toFixed(2) || '-'} / {ev.summary?.max_possible || 5}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowRegisterModal(null)}>Hủy</button>
              <button
                className="btn-primary"
                onClick={handleRegisterSubmit}
                disabled={registering || registries.length === 0}
              >
                {registering ? 'Đang đăng ký...' : 'Đăng ký'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
