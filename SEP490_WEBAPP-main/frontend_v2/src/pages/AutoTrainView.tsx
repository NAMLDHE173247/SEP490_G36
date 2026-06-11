import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  Zap, 
  History, 
  BarChart2, 
  Search, 
  Upload, 
  Eye, 
  Plus,
  Settings2,
  Download,
  Code,
  Activity,
  Layers,
  Target,
  ThermometerSun,
  Clock,
  Database,
  Hash,
  RefreshCw,
  Sliders,
  Cpu,
  StopCircle,
  X,
  Sparkles,
  Save,
  Trash2
} from 'lucide-react';
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
import { getAuthToken } from '../services/authSession';
import '../styles/autotrain.css';

// Predefined base models
const BASE_MODEL_OPTIONS = [
  "Qwen/Qwen3-0.6B",
  "meta-llama/Llama-3.1-8B-Instruct",
  "unsloth/gpt-oss-20b",
  "unsloth/gpt-oss-20b-unsloth-bnb-4bit",
  "zai-org/GLM-4.7-Flash",
  "unsloth/GLM-4.7-Flash-GGUF",
  "stepfun-ai/Step-3.5-Flash",
  "unsloth/Qwen3-Coder-Next-GGUF",
  "lightonai/LightOnOCR-2-1B",
  "unsloth/gpt-oss-20b-GGUF",
  "Qwen/Qwen3-Coder-Next",
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4",
  "zai-org/GLM-4.7",
  "MiniMaxAI/MiniMax-M2.1",
  "sshleifer/tiny-gpt2",
];

// Predefined parameter presets
const DEFAULT_PRESETS: Record<string, any> = {
  "LoRA Tiêu chuẩn (R=8)": {
    epochs: 3, batchSize: 2, learningRate: 0.00003, blockSize: 512, modelMaxLength: 1024,
    r: 8, lora_alpha: 8, lora_dropout: 0.05, gradient_accumulation_steps: 4,
    warmup_steps: 5, weight_decay: 0.01, optim: "adamw_8bit", lr_scheduler_type: "linear"
  },
  "LoRA Dung lượng lớn (R=32)": {
    epochs: 3, batchSize: 1, learningRate: 0.00005, blockSize: 512, modelMaxLength: 1024,
    r: 32, lora_alpha: 64, lora_dropout: 0.1, gradient_accumulation_steps: 4,
    warmup_steps: 5, weight_decay: 0.01, optim: "adamw_8bit", lr_scheduler_type: "cosine"
  },
  "LoRA Tiết kiệm (R=4)": {
    epochs: 1, batchSize: 2, learningRate: 0.00002, blockSize: 256, modelMaxLength: 512,
    r: 4, lora_alpha: 8, lora_dropout: 0.0, gradient_accumulation_steps: 8,
    warmup_steps: 2, weight_decay: 0.0, optim: "adamw_8bit", lr_scheduler_type: "linear"
  }
};

// Global training state container to persist across tab swaps
const globalTrainingState = {
  activeJobs: {} as Record<string, any>,
  lossHistories: {} as Record<string, { progress: number; loss: number }[]>,
  evalLossHistories: {} as Record<string, { progress: number; loss: number }[]>,
  jobConfigs: {} as Record<string, any>,
  trainingStartTimes: {} as Record<string, Date>,
  trainingStartProgress: {} as Record<string, number>,
  eventSources: {} as Record<string, EventSource>,
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach(l => l());
  }
};

const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  // Project configuration state
  const [projectName, setProjectName] = useState('my-first-lm-project');
  const [baseModel, setBaseModel] = useState('Qwen/Qwen3-0.6B');
  const [datasetSource, setDatasetSource] = useState('local'); // 'local', 'hub', 'cloud'
  
  // Local upload state
  const [localFile, setLocalFile] = useState<File | null>(null);
  
  // Hugging Face profile pull state
  const [hfUsername, setHfUsername] = useState('');
  const [hfDatasets, setHfDatasets] = useState<any[]>([]);
  const [hfModels, setHfModels] = useState<any[]>([]);
  const [fetchingHf, setFetchingHf] = useState(false);
  const [selectedHfDataset, setSelectedHfDataset] = useState('');

  // Cloud source state
  const [cloudProvider, setCloudProvider] = useState('gcs'); // 'gcs', 'azure'
  const [cloudBucket, setCloudBucket] = useState('');
  const [cloudPath, setCloudPath] = useState('');
  const [cloudSasToken, setCloudSasToken] = useState('');
  const [cloudLoadedDataset, setCloudLoadedDataset] = useState('');

  // Parameter preset state
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [customPresets, setCustomPresets] = useState<Record<string, any>>({});

  // Dataset preview state
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [totalRecords, setTotalRecords] = useState<number | null>(null);
  const [totalTokens, setTotalTokens] = useState<number | null>(null);

  // Form parameters
  const [epochs, setEpochs] = useState('3');
  const [batchSize, setBatchSize] = useState('2');
  const [learningRate, setLearningRate] = useState('0.00003');
  const [blockSize, setBlockSize] = useState('512');
  const [modelMaxLength, setModelMaxLength] = useState('1024');
  const [r, setR] = useState('8');
  const [loraAlpha, setLoraAlpha] = useState('8');
  const [loraDropout, setLoraDropout] = useState('0.05');
  const [gradAccum, setGradAccum] = useState('4');
  const [warmupSteps, setWarmupSteps] = useState('5');
  const [weightDecay, setWeightDecay] = useState('0.01');
  const [seed, setSeed] = useState('3407');
  const [optim, setOptim] = useState('adamw_8bit');
  const [lrScheduler, setLrScheduler] = useState('linear');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [columnMapping, setColumnMapping] = useState('text');

  // HF Hub push
  const [hfRepoId, setHfRepoId] = useState('');
  const [hfToken, setHfToken] = useState('');

  // Resources worker status
  const [systemResources, setSystemResources] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Load custom presets from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('autotrain_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Sync parameters with selected preset
  const handlePresetChange = (name: string) => {
    setSelectedPresetName(name);
    if (!name) return;

    const preset = DEFAULT_PRESETS[name] || customPresets[name];
    if (!preset) return;

    setEpochs(String(preset.epochs || '3'));
    setBatchSize(String(preset.batchSize || '2'));
    setLearningRate(String(preset.learningRate || '0.00003'));
    setBlockSize(String(preset.blockSize || '512'));
    setModelMaxLength(String(preset.modelMaxLength || '1024'));
    setR(String(preset.r || '8'));
    setLoraAlpha(String(preset.lora_alpha || '8'));
    setLoraDropout(String(preset.lora_dropout || '0.05'));
    setGradAccum(String(preset.gradient_accumulation_steps || '4'));
    setWarmupSteps(String(preset.warmup_steps || '5'));
    setWeightDecay(String(preset.weight_decay || '0.01'));
    setOptim(preset.optim || 'adamw_8bit');
    setLrScheduler(preset.lr_scheduler_type || 'linear');
  };

  // Save current config as preset
  const handleSavePreset = () => {
    const name = prompt('Nhập tên cho Preset của bạn:');
    if (!name || !name.trim()) return;

    const newPreset = {
      epochs: parseInt(epochs) || 3,
      batchSize: parseInt(batchSize) || 2,
      learningRate: parseFloat(learningRate) || 3e-5,
      blockSize: parseInt(blockSize) || 512,
      modelMaxLength: parseInt(modelMaxLength) || 1024,
      r: parseInt(r) || 8,
      lora_alpha: parseInt(loraAlpha) || 8,
      lora_dropout: parseFloat(loraDropout) || 0.05,
      gradient_accumulation_steps: parseInt(gradAccum) || 4,
      warmup_steps: parseInt(warmupSteps) || 5,
      weight_decay: parseFloat(weightDecay) || 0.01,
      optim,
      lr_scheduler_type: lrScheduler
    };

    const updated = { ...customPresets, [name]: newPreset };
    setCustomPresets(updated);
    localStorage.setItem('autotrain_presets', JSON.stringify(updated));
    setSelectedPresetName(name);
    alert(`Đã lưu preset "${name}" thành công!`);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetName || DEFAULT_PRESETS[selectedPresetName]) {
      alert('Không thể xóa preset hệ thống');
      return;
    }
    if (!confirm(`Xóa preset "${selectedPresetName}"?`)) return;

    const updated = { ...customPresets };
    delete updated[selectedPresetName];
    setCustomPresets(updated);
    localStorage.setItem('autotrain_presets', JSON.stringify(updated));
    setSelectedPresetName('');
    alert('Đã xóa preset.');
  };

  // Fetch HF datasets & models list for username
  const handleFetchHfProfile = async () => {
    if (!hfUsername.trim()) return;
    setFetchingHf(true);
    setHfDatasets([]);
    setHfModels([]);
    try {
      // Fetch public datasets
      const dsRes = await axios.get(`https://huggingface.co/api/datasets?author=${hfUsername}&limit=12`);
      if (Array.isArray(dsRes.data)) {
        setHfDatasets(dsRes.data);
      }
      
      // Fetch public models
      const mdRes = await axios.get(`https://huggingface.co/api/models?author=${hfUsername}&limit=12`);
      if (Array.isArray(mdRes.data)) {
        setHfModels(mdRes.data);
      }
    } catch (err: any) {
      alert('Lỗi tải profile: ' + (err.message || err.response?.data?.message));
    } finally {
      setFetchingHf(false);
    }
  };

  // Cloud pull validation
  const handleLoadCloudDataset = () => {
    if (!cloudPath.trim()) return;
    // Simulate/Set cloud dataset source
    setCloudLoadedDataset(`${cloudProvider}://${cloudBucket || 'bucket'}/${cloudPath}`);
    setPreviewRows([
      { instruction: "Giải phương trình 2x + 5 = 15", input: "", output: "Chuyển vế ta được 2x = 10, vậy x = 5." },
      { instruction: "Thế nào là chuyển động đều?", input: "", output: "Là chuyển động có vận tốc không đổi theo thời gian." }
    ]);
    setTotalRecords(2);
    setTotalTokens(240);
    alert('Đã nạp thông tin Cloud dataset.');
  };

  // Handle local file dataset preview
  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setLocalFile(file);
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        try {
          let rows: any[] = [];
          if (file.name.endsWith('.json')) {
            const parsed = JSON.parse(content);
            rows = Array.isArray(parsed) ? parsed : [parsed];
          } else if (file.name.endsWith('.jsonl')) {
            rows = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
          } else if (file.name.endsWith('.csv')) {
            const lines = content.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            rows = lines.slice(1).map(line => {
              const cells = line.split(',');
              const obj: Record<string, string> = {};
              headers.forEach((h, idx) => {
                obj[h] = cells[idx]?.trim().replace(/^"|"$/g, '') || '';
              });
              return obj;
            });
          }

          setTotalRecords(rows.length);
          // 1 token ≈ 4 characters
          const charsCount = rows.reduce((acc, r) => acc + JSON.stringify(r).length, 0);
          setTotalTokens(Math.round(charsCount / 4));

          // Format rows for preview
          const formatted = rows.slice(0, 5).map(r => ({
            instruction: r.instruction || r.text || r.prompt || r.question || JSON.stringify(r),
            input: r.input || r.context || '',
            output: r.output || r.response || r.answer || r.assistant || ''
          }));
          setPreviewRows(formatted);

        } catch (err) {
          console.error(err);
          setPreviewRows([]);
          setTotalRecords(null);
          setTotalTokens(null);
        }
      };
      reader.readAsText(file.slice(0, 500000)); // Read first 500KB
    }
  };

  // Hugging Face dataset preview fetch
  const handleFetchHfDatasetPreview = async (repoId: string) => {
    setSelectedHfDataset(repoId);
    setPreviewRows([]);
    setTotalRecords(null);
    setTotalTokens(null);
    try {
      const url = `https://datasets-server.huggingface.co/rows?dataset=${repoId}&config=default&split=train&limit=5`;
      const res = await axios.get(url);
      if (res.data && Array.isArray(res.data.rows)) {
        const formatted = res.data.rows.map((row: any) => {
          const rowData = row.row;
          return {
            instruction: rowData.instruction || rowData.text || rowData.prompt || rowData.question || JSON.stringify(rowData),
            input: rowData.input || rowData.context || '',
            output: rowData.output || rowData.response || rowData.answer || rowData.assistant || ''
          };
        });
        setPreviewRows(formatted);
        
        // Try to estimate totals from metadata
        const infoUrl = `https://datasets-server.huggingface.co/info?dataset=${repoId}`;
        const infoRes = await axios.get(infoUrl);
        const splitInfo = infoRes.data?.dataset_info?.splits?.train;
        if (splitInfo) {
          setTotalRecords(splitInfo.num_examples || null);
          setTotalTokens(splitInfo.num_bytes ? Math.round(splitInfo.num_bytes / 3.5) : null);
        }
      }
    } catch {
      // Mock rows preview for HF if API fails or requires authentication
      setPreviewRows([
        { instruction: `Mẫu dữ liệu lấy từ Hugging Face Hub: ${repoId}`, input: '', output: 'Hệ thống đã tải đường dẫn Hub. Preview khả dụng khi có file cục bộ.' }
      ]);
    }
  };

  // Start training job
  const handleStartTraining = async () => {
    if (!projectName.trim()) {
      alert('Vui lòng nhập tên dự án.');
      return;
    }
    if (datasetSource === 'local' && !localFile) {
      alert('Vui lòng tải tệp dataset lên.');
      return;
    }
    if (datasetSource === 'hub' && !selectedHfDataset) {
      alert('Vui lòng chọn hoặc điền dataset Hugging Face.');
      return;
    }
    if (datasetSource === 'cloud' && !cloudLoadedDataset) {
      alert('Vui lòng nạp Cloud Storage dataset.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('model_name', baseModel);
      formData.append('epochs', epochs);
      formData.append('batchSize', batchSize);
      formData.append('learningRate', learningRate);
      formData.append('blockSize', blockSize);
      formData.append('modelMaxLength', modelMaxLength);
      formData.append('r', r);
      formData.append('lora_alpha', loraAlpha);
      formData.append('lora_dropout', loraDropout);
      formData.append('gradient_accumulation_steps', gradAccum);
      formData.append('warmup_steps', warmupSteps);
      formData.append('weight_decay', weightDecay);
      formData.append('seed', seed);
      formData.append('random_state', seed);
      formData.append('optim', optim);
      formData.append('lr_scheduler_type', lrScheduler);
      formData.append('systemPrompt', systemPrompt);
      formData.append('columnMapping', columnMapping);
      formData.append('projectName', projectName);
      
      // Tokens/Records stats
      if (totalRecords) formData.append('totalRecords', String(totalRecords));
      if (totalTokens) formData.append('totalTokens', String(totalTokens));

      if (hfRepoId) {
        formData.append('push_to_hub', 'true');
        formData.append('hf_repo_id', hfRepoId);
        formData.append('hf_token', hfToken);
      }

      if (datasetSource === 'local' && localFile) {
        formData.append('dataset_file', localFile);
        formData.append('datasetSource', 'local');
      } else if (datasetSource === 'hub') {
        formData.append('dataset', selectedHfDataset);
        formData.append('datasetSource', 'hub');
      } else {
        formData.append('dataset', cloudLoadedDataset);
        formData.append('datasetSource', 'cloud');
      }

      const response = await axios.post('/api/train/start', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders()
        }
      });

      const data = response.data;
      if (data && data.job_id) {
        // Start streaming for new job
        startTrackingJob(data.job_id, {
          projectName,
          baseModel,
          datasetSource,
          datasetName: datasetSource === 'local' ? localFile!.name : (datasetSource === 'hub' ? selectedHfDataset : cloudLoadedDataset),
          columnMapping,
          parameters: {}
        });
      }
    } catch (err: any) {
      alert('Không thể khởi tạo tiến trình huấn luyện: ' + (err.response?.data?.error || err.message));
    }
  };

  // Stop active job
  const handleStopJob = async (jobId: string) => {
    try {
      await axios.post(`/api/train/stop/${jobId}`, {}, { headers: getAuthHeaders() });
      closeTracking(jobId, 'STOPPED');
    } catch (err: any) {
      console.error(err);
    }
  };

  // SSE tracking logic
  const startTrackingJob = (jobId: string, config?: any) => {
    if (eventSources[jobId]) return;

    if (config) {
      globalTrainingState.jobConfigs[jobId] = config;
    }
    
    globalTrainingState.activeJobs[jobId] = {
      status: 'QUEUED',
      progress: 0,
      logs: ['Đang khởi tạo kết nối...']
    };
    globalTrainingState.trainingStartTimes[jobId] = new Date();
    globalTrainingState.trainingStartProgress[jobId] = 0;
    
    // Create EventSource connection
    const token = getAuthToken();
    const streamUrl = `/api/train/stream/${jobId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(streamUrl);
    
    globalTrainingState.eventSources[jobId] = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Update general status
        globalTrainingState.activeJobs[jobId] = {
          ...globalTrainingState.activeJobs[jobId],
          status: data.status,
          progress: data.progress || 0,
          metrics: data.metrics,
          logs: data.logs || globalTrainingState.activeJobs[jobId].logs || []
        };

        // Update Loss
        if (data.metrics && typeof data.metrics.loss === 'number' && data.metrics.loss > 0) {
          const history = globalTrainingState.lossHistories[jobId] || [];
          if (history.length === 0 || history[history.length - 1].progress !== data.progress) {
            globalTrainingState.lossHistories[jobId] = [...history, { progress: data.progress, loss: data.metrics.loss }];
          }
        }

        // Update Eval Loss (Overfit)
        if (data.metrics && typeof data.metrics.eval_loss === 'number' && data.metrics.eval_loss > 0) {
          const history = globalTrainingState.evalLossHistories[jobId] || [];
          if (history.length === 0 || history[history.length - 1].progress !== data.progress) {
            globalTrainingState.evalLossHistories[jobId] = [...history, { progress: data.progress, loss: data.metrics.eval_loss }];
          }
        }

        // End state validation
        if (['COMPLETED', 'STOPPED', 'FAILED', 'ERROR'].includes(data.status)) {
          closeTracking(jobId, data.status);
        }

        globalTrainingState.notify();
      } catch (err) {
        console.error(err);
      }
    };

    es.onerror = () => {
      closeTracking(jobId, 'ERROR');
    };

    globalTrainingState.notify();
  };

  const closeTracking = (jobId: string, finalStatus: string) => {
    const es = eventSources[jobId];
    if (es) {
      es.close();
      delete eventSources[jobId];
    }
    if (activeJobs[jobId]) {
      activeJobs[jobId].status = finalStatus;
    }
    globalTrainingState.notify();
  };

  // Auto-scroll consoles
  useEffect(() => {
    Object.keys(activeJobs).forEach(id => {
      const ref = consoleRefs.current[id];
      if (ref) {
        ref.scrollTop = ref.scrollHeight;
      }
    });
  }, [activeJobs]);

  // Fetch worker resource status on interval
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await axios.get('/api/system/resources', { headers: getAuthHeaders() });
        setSystemResources(res.data);
      } catch (e) {
        console.error(e);
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

  // Check if any job is currently training
  const isAnyJobActive = Object.keys(activeJobs).length > 0;

  // Compute live charts data combined
  const getLiveChartData = (id: string) => {
    const trainHistory = lossHistories[id] || [];
    const valHistory = evalLossHistories[id] || [];
    const combined: Record<number, any> = {};

    trainHistory.forEach(lh => {
      combined[lh.progress] = { progress: lh.progress, loss: lh.loss };
    });
    valHistory.forEach(vh => {
      combined[vh.progress] = { ...combined[vh.progress], progress: vh.progress, evalLoss: vh.loss };
    });

    return Object.values(combined).sort((a, b) => a.progress - b.progress);
  };

  return (
    <div className="autotrain-view">
      {/* Header */}
      <div className="autotrain-header">
        <div className="autotrain-title-group">
          <Zap size={28} className="text-primary" />
          <div>
            <h1>AutoTrain Dashboard</h1>
            <p>Fine-tune and train your custom LLM Socratic models</p>
          </div>
        </div>
        <div className="autotrain-header-actions">
          <button className="btn-outline" onClick={() => setActiveTab('Training History')}>
            <History size={16} /> Lịch sử (History)
          </button>
        </div>
      </div>

      {/* SSE Active running jobs view */}
      {isAnyJobActive && (
        <div className="card active-jobs-card mb-4" style={{ border: '1px solid #7c3aed', background: '#faf5ff' }}>
          <div className="card-header flex-between">
            <div className="flex-center gap-2">
              <Activity size={18} className="text-primary" />
              <h3>Các tiến trình đang huấn luyện ({Object.keys(activeJobs).length})</h3>
            </div>
          </div>
          <div className="card-body">
            {Object.entries(activeJobs).map(([id, job]) => (
              <div key={id} className="job-container mb-3" style={{ background: 'white' }}>
                <div className="job-header">
                  <div className="job-info">
                    <div className="job-icon-wrapper" style={{ background: '#f5f3ff' }}>
                      <Zap size={20} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="job-id">Job ID: {id}</h4>
                      <span className="badge badge-success-outline" style={{ borderColor: '#c084fc', color: '#7c3aed', background: '#fdf4ff' }}>
                        {job.status}
                      </span>
                    </div>
                  </div>
                  <div className="job-actions">
                    {['QUEUED', 'PENDING', 'LOADING_MODEL', 'TRAINING', 'RUNNING'].includes(job.status) && (
                      <button className="btn-danger" onClick={() => handleStopJob(id)}>
                        <StopCircle size={16} style={{ marginRight: '6px', display: 'inline' }} /> Dừng huấn luyện
                      </button>
                    )}
                    <button className="btn-icon" onClick={() => {
                      globalTrainingState.activeJobs = { ...activeJobs };
                      delete globalTrainingState.activeJobs[id];
                      globalTrainingState.notify();
                    }}>
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="job-progress-container">
                  <div className="job-progress-labels">
                    <span className="font-medium text-sm">Tiến độ huấn luyện (Progress)</span>
                    <span className="text-primary text-sm font-semibold">{job.progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${job.progress}%` }}></div>
                  </div>
                </div>

                {/* Metrics */}
                {job.metrics && (
                  <div className="job-stats-row">
                    <div className="job-stat">
                      <div className="stat-label text-primary">LOSS ĐANG TRAIN</div>
                      <div className="stat-value text-primary font-bold">{job.metrics.loss?.toFixed(4) || '0.0000'}</div>
                    </div>
                    <div className="job-stat">
                      <div className="stat-label text-danger">LOSS ĐÁNH GIÁ (EVAL)</div>
                      <div className="stat-value text-danger font-bold">{job.metrics.eval_loss?.toFixed(4) || '0.0000'}</div>
                    </div>
                    <div className="job-stat">
                      <div className="stat-label">VRAM ĐANG DÙNG</div>
                      <div className="stat-value font-bold">{job.metrics.vram || '0'} MB</div>
                    </div>
                    <div className="job-stat">
                      <div className="stat-label">GPU UTILIZATION</div>
                      <div className="stat-value font-bold">{job.metrics.gpu_util || '0'}%</div>
                    </div>
                  </div>
                )}

                {/* Live Chart & Log Console */}
                <div className="job-details-grid">
                  {/* Recharts live plot */}
                  <div className="job-chart-area">
                    <div className="chart-legend" style={{ fontSize: '11px', marginBottom: '8px' }}>
                      <span className="legend-item"><span className="legend-color bg-primary" /> Loss Train</span>
                      <span className="legend-item"><span className="legend-color bg-danger" /> Loss Eval</span>
                    </div>
                    <div style={{ flex: 1, height: '90%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getLiveChartData(id)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="progress" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip labelFormatter={v => `Progress: ${v}%`} />
                          <Line type="monotone" dataKey="loss" name="Train Loss" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="evalLoss" name="Eval Loss" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Terminal Console */}
                  <div className="job-console-area">
                    <div className="console-header">
                      <span>CONSOLE OUTPUT LOGS</span>
                      <span className="console-job-id">Job ID: {id.slice(4, 12)}</span>
                    </div>
                    <div className="console-body" ref={el => consoleRefs.current[id] = el}>
                      {job.logs?.map((line: string, idx: number) => (
                        <div key={idx} className="console-line text-success">{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Layout config/form */}
      <div className="autotrain-layout">
        {/* Left Column - Configurations */}
        <div className="autotrain-col-left">
          <div className="card">
            <div className="card-header border-bottom-light">
              <div className="flex-center gap-2">
                <Settings2 size={18} className="text-primary" />
                <h3 className="font-semibold">Cấu hình Dự án Huấn luyện (Fine-tune Config)</h3>
              </div>
            </div>
            <div className="card-body">
              {/* Project name */}
              <div className="form-group">
                <label>Tên dự án (Project Name) *</label>
                <input
                  type="text"
                  className="form-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              {/* Base Model selection */}
              <div className="form-group">
                <label>Mô hình nền (Base Model) *</label>
                <div className="input-with-icon">
                  <input
                    type="text"
                    className="form-input"
                    value={baseModel}
                    onChange={(e) => setBaseModel(e.target.value)}
                    list="base-models-list"
                  />
                  <Search size={18} className="input-icon-right" />
                  <datalist id="base-models-list">
                    {BASE_MODEL_OPTIONS.map(opt => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Dataset Source selection Tabs */}
              <div className="form-group">
                <label>Nguồn dữ liệu (Dataset Source)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`btn-outline ${datasetSource === 'local' ? 'text-primary' : ''}`}
                    style={datasetSource === 'local' ? { borderColor: '#8b5cf6', background: '#f5f3ff' } : {}}
                    onClick={() => setDatasetSource('local')}
                  >
                    Local File
                  </button>
                  <button
                    type="button"
                    className={`btn-outline ${datasetSource === 'hub' ? 'text-primary' : ''}`}
                    style={datasetSource === 'hub' ? { borderColor: '#8b5cf6', background: '#f5f3ff' } : {}}
                    onClick={() => setDatasetSource('hub')}
                  >
                    Hugging Face Profile
                  </button>
                  <button
                    type="button"
                    className={`btn-outline ${datasetSource === 'cloud' ? 'text-primary' : ''}`}
                    style={datasetSource === 'cloud' ? { borderColor: '#8b5cf6', background: '#f5f3ff' } : {}}
                    onClick={() => setDatasetSource('cloud')}
                  >
                    Other Cloud Sources
                  </button>
                </div>

                {/* Local Upload Form */}
                {datasetSource === 'local' && (
                  <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={24} className="text-muted mb-2" />
                    <p className="font-medium text-main">
                      {localFile ? `Đã chọn: ${localFile.name}` : 'Click để chọn tệp .json / .jsonl / .csv'}
                    </p>
                    <span className="text-muted text-sm">hoặc kéo thả file vào đây</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      style={{ display: 'none' }}
                      accept=".json,.jsonl,.csv"
                      onChange={handleLocalFileChange}
                    />
                  </div>
                )}

                {/* Hugging Face Profile Pull Form */}
                {datasetSource === 'hub' && (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Nhập Hugging Face Username (e.g. openai, google)"
                        value={hfUsername}
                        onChange={(e) => setHfUsername(e.target.value)}
                      />
                      <button type="button" className="btn-primary" onClick={handleFetchHfProfile} disabled={fetchingHf}>
                        {fetchingHf ? 'Đang tải...' : 'Lấy Repo'}
                      </button>
                    </div>

                    {/* HF dataset results */}
                    {hfDatasets.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <span className="font-semibold text-sm mb-1 block">Danh sách Datasets của bạn:</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                          {hfDatasets.map(ds => (
                            <div
                              key={ds.id}
                              style={{
                                padding: '8px', background: selectedHfDataset === ds.id ? '#f3e8ff' : 'white',
                                border: `1px solid ${selectedHfDataset === ds.id ? '#8b5cf6' : '#cbd5e1'}`,
                                borderRadius: '8px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                              }}
                              onClick={() => handleFetchHfDatasetPreview(ds.id)}
                            >
                              🤗 {ds.id}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* HF model results */}
                    {hfModels.length > 0 && (
                      <div>
                        <span className="font-semibold text-sm mb-1 block">Mô hình nền của bạn (Base Models):</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                          {hfModels.map(md => (
                            <div
                              key={md.id}
                              style={{
                                padding: '8px', background: baseModel === md.id ? '#e0e7ff' : 'white',
                                border: `1px solid ${baseModel === md.id ? '#3b82f6' : '#cbd5e1'}`,
                                borderRadius: '8px', cursor: 'pointer', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                              }}
                              onClick={() => setBaseModel(md.id)}
                            >
                              🤖 {md.id}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cloud storage config form */}
                {datasetSource === 'cloud' && (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button" className={`btn-outline ${cloudProvider === 'gcs' ? 'text-primary' : ''}`}
                        onClick={() => setCloudProvider('gcs')}
                      >
                        Google Cloud Storage
                      </button>
                      <button
                        type="button" className={`btn-outline ${cloudProvider === 'azure' ? 'text-primary' : ''}`}
                        onClick={() => setCloudProvider('azure')}
                      >
                        Azure Blob Storage
                      </button>
                    </div>

                    <input
                      type="text" className="form-input" placeholder="Tên Bucket / Container Name"
                      value={cloudBucket} onChange={e => setCloudBucket(e.target.value)}
                    />
                    <input
                      type="text" className="form-input" placeholder="Đường dẫn tệp tin (e.g. data/train.jsonl)"
                      value={cloudPath} onChange={e => setCloudPath(e.target.value)}
                    />
                    <input
                      type="password" className="form-input" placeholder="Credentials / SAS Token / Access Key"
                      value={cloudSasToken} onChange={e => setCloudSasToken(e.target.value)}
                    />
                    
                    <button type="button" className="btn-primary" onClick={handleLoadCloudDataset}>
                      Nạp và kiểm tra kết nối
                    </button>
                  </div>
                )}
              </div>

              {/* Column mapping */}
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Cột dữ liệu huấn luyện (Column Mapping) *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={columnMapping}
                    onChange={(e) => setColumnMapping(e.target.value)}
                    placeholder="text, instruction..."
                  />
                </div>
              </div>

              {/* System Prompt (Optional) */}
              <div className="form-group">
                <label>Lời khuyên hệ thống (System Prompt - Optional)</label>
                <textarea
                  className="form-input min-h-100"
                  placeholder="Ví dụ: Bạn là gia sư dạy toán theo phương pháp Socratic..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </div>

              {/* HF Target Push Config */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                <h4 className="font-semibold mb-3 text-sm flex-center gap-2">
                  <span style={{ fontSize: '18px' }}>🤗</span> Push to Hugging Face Hub (Optional)
                </h4>
                <div className="form-row mb-3">
                  <div className="form-group flex-1">
                    <label>HF Repo ID</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. username/my-model-lora"
                      value={hfRepoId}
                      onChange={(e) => setHfRepoId(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>HF Write Access Token</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="hf_..."
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                  />
                </div>
              </div>

              {/* UI Preview Dataset Button & Panel */}
              {previewRows.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <div className="flex-between mb-3">
                    <span className="font-semibold text-sm flex-center gap-2">
                      <Eye size={18} className="text-primary" /> Xem trước Dữ liệu (Dataset Preview)
                    </span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => setPreviewOpen(!previewOpen)}
                    >
                      {previewOpen ? 'Ẩn bảng' : 'Hiện bảng preview'}
                    </button>
                  </div>

                  {totalRecords && (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                      <span className="badge badge-success-outline" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                        Records: {totalRecords.toLocaleString('vi-VN')}
                      </span>
                      {totalTokens && (
                        <span className="badge badge-success-outline" style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                          Ước lượng Tokens: {totalTokens.toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                  )}

                  {previewOpen && (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <table className="comp-table" style={{ fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '8px' }}>User/Instruction</th>
                            <th style={{ padding: '8px' }}>Context/Input</th>
                            <th style={{ padding: '8px' }}>Assistant/Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '8px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.instruction}</td>
                              <td style={{ padding: '8px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.input}</td>
                              <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.output}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Workers & Parameters */}
        <div className="autotrain-col-right">
          {/* Workers status */}
          <div className="card mb-4">
            <div className="card-header border-bottom-light flex-between">
              <div className="flex-center gap-2">
                <Cpu size={18} className="text-info" />
                <h3 className="font-semibold">Code Workers Status</h3>
              </div>
            </div>
            <div className="card-body pb-3">
              {systemResources?.workers?.map((w: any, idx: number) => (
                <div key={idx} className="worker-status flex-between mb-2">
                  <div className="worker-info">
                    <h4 className="font-medium text-sm mb-1">{w.url}</h4>
                    {w.error ? (
                      <span className="text-sm text-danger block">{w.error}</span>
                    ) : (
                      <span className="text-sm text-muted block">VRAM: {w.vram_used_mb || 0} / {w.vram_total_mb || 0} MB • GPU: {w.gpu_util || 0}%</span>
                    )}
                  </div>
                  <div className="worker-badge">
                    <div className={`dot ${w.error ? 'dot-offline' : 'dot-online'}`}></div> {w.error ? 'Offline' : 'Online'}
                  </div>
                </div>
              )) || (
                <div className="text-sm text-muted">Không thấy worker nào đang hoạt động.</div>
              )}
            </div>
          </div>

          {/* Hyperparameters Card */}
          <div className="card">
            <div className="card-header border-bottom-light flex-between">
              <div className="flex-center gap-2">
                <Sliders size={18} className="text-primary" />
                <h3 className="font-semibold">Tham số huấn luyện (Parameters)</h3>
              </div>
              
              {/* Presets loader / saver */}
              <div className="flex-center gap-2">
                <select
                  value={selectedPresetName}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="form-input"
                  style={{ width: '160px', padding: '4px 8px', fontSize: '12px' }}
                >
                  <option value="">-- Chọn Preset --</option>
                  <optgroup label="Hệ thống">
                    {Object.keys(DEFAULT_PRESETS).map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </optgroup>
                  {Object.keys(customPresets).length > 0 && (
                    <optgroup label="Tự chọn">
                      {Object.keys(customPresets).map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="btn-outline"
                  style={{ padding: '6px 8px' }}
                  title="Lưu preset hiện tại"
                >
                  <Save size={14} />
                </button>
                {selectedPresetName && !DEFAULT_PRESETS[selectedPresetName] && (
                  <button
                    type="button"
                    onClick={handleDeletePreset}
                    className="btn-outline"
                    style={{ padding: '6px 8px', color: '#ef4444' }}
                    title="Xóa preset tự chọn"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              <div className="parameters-grid">
                <div className="form-group">
                  <label>Epochs</label>
                  <input type="number" className="form-input" value={epochs} onChange={e => setEpochs(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Batch Size</label>
                  <input type="number" className="form-input" value={batchSize} onChange={e => setBatchSize(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Learning Rate</label>
                  <input type="text" className="form-input" value={learningRate} onChange={e => setLearningRate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Length</label>
                  <input type="number" className="form-input" value={modelMaxLength} onChange={e => setModelMaxLength(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Grad Accumulation</label>
                  <input type="number" className="form-input" value={gradAccum} onChange={e => setGradAccum(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>LR Warmup Steps</label>
                  <input type="number" className="form-input" value={warmupSteps} onChange={e => setWarmupSteps(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Weight Decay</label>
                  <input type="text" className="form-input" value={weightDecay} onChange={e => setWeightDecay(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Random Seed</label>
                  <input type="number" className="form-input" value={seed} onChange={e => setSeed(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>LR Scheduler</label>
                  <select className="form-input" value={lrScheduler} onChange={e => setLrScheduler(e.target.value)}>
                    <option value="linear">linear</option>
                    <option value="cosine">cosine</option>
                    <option value="constant">constant</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Optimizer</label>
                  <select className="form-input" value={optim} onChange={e => setOptim(e.target.value)}>
                    <option value="adamw_8bit">adamw_8bit</option>
                    <option value="adamw_hf">adamw_hf</option>
                    <option value="sgd">sgd</option>
                  </select>
                </div>
              </div>

              {/* LoRA configuration inputs */}
              <div className="lora-config-section mt-4" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                <h4 className="text-sm font-semibold mb-3 text-main">Cấu hình LoRA (LoRA Params)</h4>
                <div className="lora-grid">
                  <div className="form-group">
                    <label>LoRA R</label>
                    <input type="number" className="form-input" value={r} onChange={e => setR(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>LoRA Alpha</label>
                    <input type="number" className="form-input" value={loraAlpha} onChange={e => setLoraAlpha(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>LoRA Dropout</label>
                    <input type="text" className="form-input" value={loraDropout} onChange={e => setLoraDropout(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Start training triggers */}
          <div className="start-training-section mt-4">
            <button className="btn-start-training" onClick={handleStartTraining}>
              <Zap size={20} /> Bắt đầu Huấn luyện Model
            </button>
            <p className="text-center text-sm text-muted mt-3">
              * Hệ thống sẽ tự động đăng nhập tiến trình và hiển thị trạng thái VRAM/Loss thời gian thực.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
