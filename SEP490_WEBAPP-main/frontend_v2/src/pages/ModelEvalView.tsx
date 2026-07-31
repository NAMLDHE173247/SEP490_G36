import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Play, 
  Download, 
  Filter, 
  Eye, 
  Calendar, 
  X, 
  Pin, 
  RefreshCw, 
  Trash2, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  Clock, 
  BookOpen, 
  ChevronRight, 
  Star,
  Activity,
  Maximize2,
  LineChart as ChartIcon,
  ShieldCheck,
  FileSpreadsheet,
  Upload,
  BrainCircuit,
  MessageCircleQuestion,
  Sparkles,
  Search,
  Database,
  CheckCircle2,
  Gauge,
  BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, apiService } from '../services/api';
import { getAuthToken } from '../services/authSession';
import '../styles/modeleval.css';

interface LeaderboardItem {
  jobId: string;
  projectName: string;
  baseModel: string;
  completedAt: string;
  trainingDuration: number;
  modelEvalId: string | null;
  pinnedEvalId: string | null;
  status: string;
  error?: string | null;
  failureStage?: string | null;
  latestAttemptId?: string | null;
  latestAttemptStatus?: string | null;
  latestAttemptError?: string | null;
  judgeModel: string | null;
  totalConversations: number;
  flags: string[];
  scores: {
    knowledge: number | null;
    socratic: number | null;
    exploratory_overall: number | null;
    overall: number | null;
    group_a: number | null;
    group_b: number | null;
    group_c: number | null;
    group_d: number | null;
    criteria: Record<string, number> | null;
    avg_latency_ms: number | null;
    non_scoring: Record<string, number> | null;
  };
}

interface TrainingJobItem {
  _id: string;
  jobId: string;
  projectName: string;
  baseModel: string;
  status: string;
  hfRepoId?: string;
  datasetVersionId?: string | { _id?: string };
  datasetName?: string;
  systemPromptVersion?: string;
  createdAt: string;
}

interface DatasetVersionItem {
  _id: string;
  versionName: string;
  projectName: string;
  totalSamples: number;
}

interface LargeLlmReference {
  model: string;
  judgeModel: string;
  total: number;
  valid: number;
  knowledge: number | null;
  socratic: number | null;
  a1ViolationRate: number | null;
  e2eMedianMs: number | null;
  throughputMean: number | null;
  outputLimitRate: number | null;
  costPer100Usd: number | null;
  outputTokensMean: number | null;
  runValidity: string;
  protocolMatch: boolean;
  protocolNotes: string[];
}

export default function ModelEvalView() {
  // Navigation & Screen management
  const [viewMode, setViewMode] = useState<'leaderboard' | 'detail' | 'compare'>('leaderboard');
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  
  // Data lists
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  
  // Detail views state
  const [evaluationDetail, setEvaluationDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'breakdown' | 'paired' | 'large-llm' | 'samples'>('paired');
  const [selectedConvIndex, setSelectedConvIndex] = useState<number | null>(null);
  const [detailEvalHistory, setDetailEvalHistory] = useState<any[]>([]);
  const [largeLlmReferences, setLargeLlmReferences] = useState<LargeLlmReference[]>([]);
  const [largeLlmCatalog, setLargeLlmCatalog] = useState<any[]>([]);
  const [largeLlmSearch, setLargeLlmSearch] = useState('');
  const [selectedLargeLlmModels, setSelectedLargeLlmModels] = useState<string[]>([]);
  const [largeLlmTestFile, setLargeLlmTestFile] = useState<File | null>(null);
  const [largeLlmRuns, setLargeLlmRuns] = useState<Record<string, any>>({});
  const [startingLargeLlmRun, setStartingLargeLlmRun] = useState(false);

  // Human review form state
  const [reviewVerdict, setReviewVerdict] = useState<'agree' | 'disagree' | 'skip'>('agree');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewerName, setReviewerName] = useState(() => {
    return localStorage.getItem('user_name') || 'Supervisor';
  });
  const [submittingReview, setSubmittingReview] = useState(false);

  // Comparison view state
  const [compareData, setCompareData] = useState<any>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Run Eval Modal & creation state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [completedJobs, setCompletedJobs] = useState<TrainingJobItem[]>([]);
  const [datasetVersions, setDatasetVersions] = useState<DatasetVersionItem[]>([]);
  const [loadingModalData, setLoadingModalData] = useState(false);

  // Run form fields
  const [selectedJobId, setSelectedJobId] = useState('');
  const [judgeModel, setJudgeModel] = useState('google/gemini-2.5-flash');
  const [baseModelHfRepo, setBaseModelHfRepo] = useState('');
  const [datasetSource, setDatasetSource] = useState<'version' | 'file'>('version');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [submittingEval, setSubmittingEval] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const selectedTrainingJob = useMemo(
    () => completedJobs.find(job => job.jobId === selectedJobId),
    [completedJobs, selectedJobId],
  );
  const evaluableJobs = useMemo(
    () => completedJobs.filter(job => Boolean(job.hfRepoId)),
    [completedJobs],
  );

  const getDatasetVersionId = (job?: TrainingJobItem) => {
    if (!job?.datasetVersionId) return '';
    return typeof job.datasetVersionId === 'string'
      ? job.datasetVersionId
      : job.datasetVersionId._id || '';
  };

  const linkedDatasetVersion = datasetVersions.find(
    version => version._id === getDatasetVersionId(selectedTrainingJob),
  );

  const selectTrainingJob = (jobId: string, jobs = completedJobs, versions = datasetVersions) => {
    setSelectedJobId(jobId);
    const job = jobs.find(item => item.jobId === jobId);
    setBaseModelHfRepo(job?.baseModel || '');
    const linkedVersionId = getDatasetVersionId(job);
    const linkedVersion = versions.find(version => version._id === linkedVersionId);
    if (linkedVersion) {
      setDatasetSource('version');
      setSelectedVersionId(linkedVersion._id);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Active progress tracker (SSE)
  const [activeEvalId, setActiveEvalId] = useState<string | null>(null);
  const [activeEvalProgress, setActiveEvalProgress] = useState(0);
  const [activeEvalStage, setActiveEvalStage] = useState('');
  const [activeEvalDetail, setActiveEvalDetail] = useState('');
  type EvalLogEntry = { timestamp: string; text: string };
  const createEvalLogEntry = (text: unknown): EvalLogEntry => ({
    timestamp: new Date().toLocaleTimeString('vi-VN'),
    text: String(text ?? ''),
  });
  const [activeEvalLogs, setActiveEvalLogs] = useState<EvalLogEntry[]>([]);
  const [activeEvalSample, setActiveEvalSample] = useState<any>(null);
  const [activeEvalResumable, setActiveEvalResumable] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  // GPU Status Widget
  const [gpuStatus, setGpuStatus] = useState<any>(null);
  const [loadingGpuStatus, setLoadingGpuStatus] = useState(false);

  // Filters
  const [filterProject, setFilterProject] = useState('');
  const [filterJudge, setFilterJudge] = useState('');

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  
  const fetchLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const data = await apiService.getEvaluatedModels();
      setLeaderboard(data || []);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
      toast.error('Không thể tải danh sách Leaderboard');
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  const fetchGpuStatus = useCallback(async () => {
    setLoadingGpuStatus(true);
    try {
      const res = await apiService.checkGpuStatus();
      if (res.isOk) {
        setGpuStatus(res.data);
      } else {
        setGpuStatus(null);
      }
    } catch {
      setGpuStatus(null);
    } finally {
      setLoadingGpuStatus(false);
    }
  }, []);

  // Poll GPU status every 10s
  useEffect(() => {
    fetchLeaderboard();
    fetchGpuStatus();
    const interval = setInterval(fetchGpuStatus, 10000);
    return () => {
      clearInterval(interval);
      if (sseRef.current) sseRef.current.close();
    };
  }, [fetchLeaderboard, fetchGpuStatus]);

  // Load completed jobs & dataset versions when modal opens
  const openRunModal = async () => {
    setIsModalOpen(true);
    setLoadingModalData(true);
    try {
      // 1. Fetch completed jobs
      const jobsRes = await api.get('/train/history');
      const jobs = Array.isArray(jobsRes.data) ? jobsRes.data : [];
      const completed = jobs.filter((j: any) =>
        ['COMPLETED', 'EVALUATING'].includes(j.status) &&
        !String(j.jobId || '').startsWith('job-mock-')
      );
      const versionsRes = await apiService.listDatasetVersions();
      const versions = Array.isArray(versionsRes.data) ? versionsRes.data : [];
      setCompletedJobs(completed);
      setDatasetVersions(versions);
      if (completed.length > 0) {
        const firstJob = completed.find((job: TrainingJobItem) => Boolean(job.hfRepoId));
        if (!firstJob) {
          setSelectedJobId('');
          setBaseModelHfRepo('');
          if (versions.length > 0) setSelectedVersionId(versions[0]._id);
          return;
        }
        const linkedVersionId = getDatasetVersionId(firstJob);
        const initialVersion = versions.find((version: DatasetVersionItem) => version._id === linkedVersionId) || versions[0];
        setSelectedJobId(firstJob.jobId);
        setBaseModelHfRepo(firstJob.baseModel || '');
        if (initialVersion) setSelectedVersionId(initialVersion._id);
      } else if (versions.length > 0) {
        setSelectedVersionId(versions[0]._id);
      }

    } catch (err) {
      console.error('Failed to load evaluation setup options:', err);
      toast.error('Lỗi tải cấu hình tạo evaluation');
    } finally {
      setLoadingModalData(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Active SSE Progress Streaming
  // ---------------------------------------------------------------------------
  const startProgressStream = (evalJobId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    setActiveEvalId(evalJobId);
    localStorage.setItem('active_model_eval_id', evalJobId);
    setActiveEvalProgress(0);
    setActiveEvalStage('Bắt đầu');
    setActiveEvalDetail('Đang khởi tạo kết nối...');
    setActiveEvalLogs([]);
    setActiveEvalSample(null);
    setActiveEvalResumable(false);

    const token = getAuthToken() || localStorage.getItem('token') || '';
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    const sseUrl = `${apiBase}/model-eval/stream/${evalJobId}?token=${encodeURIComponent(token)}`;
    
    console.log('[SSE] Connecting to:', sseUrl);
    const source = new EventSource(sseUrl);
    sseRef.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.status === 'NOT_FOUND') {
          setActiveEvalStage('Khong tim thay job tren GPU');
          setActiveEvalDetail('Backend co Eval Job nhung GPU worker khong con giu tien trinh nay. Neu GPU vua restart, hay chay lai evaluation.');
          setActiveEvalLogs(prev => [
            ...prev,
            createEvalLogEntry('[ERROR] GPU khong tim thay Eval Job nay. Job co the da mat khi GPU service restart.'),
          ]);
          return;
        }

        if (data.progress !== undefined) setActiveEvalProgress(data.progress);
        if (data.stage_label) setActiveEvalStage(data.stage_label);
        if (data.stage_detail) setActiveEvalDetail(data.stage_detail);
        if (data.current_sample) setActiveEvalSample(data.current_sample);
        
        if (data.logs && Array.isArray(data.logs)) {
          setActiveEvalLogs(prev => data.logs.map((log: unknown, index: number) => {
            const text = String(log ?? '');
            return prev[index]?.text === text ? prev[index] : createEvalLogEntry(text);
          }));
        } else if (data.stage_detail) {
          setActiveEvalLogs(prev => [...prev, createEvalLogEntry(`[${data.stage_label || 'STAGE'}] ${data.stage_detail}`)]);
        }

        if (data.status === 'INTERRUPTED' && data.resumable === true) {
          source.close();
          setActiveEvalResumable(true);
          setActiveEvalStage('Đã gián đoạn — có checkpoint');
          setActiveEvalDetail(data.error || data.stage_detail || 'Bấm Resume để tiếp tục phần còn lại.');
          setActiveEvalLogs(prev => [...prev, createEvalLogEntry('[CHECKPOINT] Tiến độ đã lưu. Có thể Resume mà không chạy lại các batch hoàn tất.')]);
          toast.error('Eval bị gián đoạn; checkpoint vẫn còn và có thể Resume.');
        } else if (data.status === 'LOST') {
          source.close();
          setActiveEvalResumable(false);
          setActiveEvalStage('GPU đã mất Eval Job');
          setActiveEvalDetail(data.stage_detail || 'Không có job và cũng không có checkpoint để Resume.');
          setActiveEvalLogs(prev => [...prev, createEvalLogEntry('[FAILED] GPU xác nhận job và checkpoint đều không còn.')]);
          toast.error('Eval cũ không có checkpoint và không thể Resume. Bạn có thể chạy một Eval mới.');
          setActiveEvalId(null);
          localStorage.removeItem('active_model_eval_id');
          fetchLeaderboard();
        } else if (data.status === 'DISCONNECTED') {
          source.close();
          setActiveEvalResumable(false);
          setActiveEvalStage('Mất kết nối GPU');
          setActiveEvalDetail(data.stage_detail || 'Chưa xác nhận được job hoặc checkpoint.');
          setActiveEvalLogs(prev => [...prev, createEvalLogEntry('[WARNING] Chưa xác nhận checkpoint; hệ thống sẽ không tự chạy lại Eval.')]);
          toast.error('Mất kết nối GPU; chưa xác nhận có checkpoint.');
        } else if (data.status === 'COMPLETED') {
          source.close();
          toast.success('Hệ thống hoàn thành đánh giá!');
          setActiveEvalId(null);
          localStorage.removeItem('active_model_eval_id');
          fetchLeaderboard();
          handleViewDetails(evalJobId);
        } else if (data.status === 'FAILED') {
          source.close();
          toast.error('Đánh giá thất bại: ' + (data.error || 'Lỗi GPU runtime'));
          setActiveEvalId(null);
          localStorage.removeItem('active_model_eval_id');
          fetchLeaderboard();
        }
      } catch (err) {
        console.error('[SSE] JSON parse error:', err);
      }
    };

    source.addEventListener('end', (event: MessageEvent) => {
      source.close();
      try {
        const payload = JSON.parse(event.data || '{}');
        if (payload.resumable === true) {
          setActiveEvalResumable(true);
          return;
        }
        if (payload.status === 'DISCONNECTED') {
          setActiveEvalResumable(false);
          return;
        }
      } catch {
        // Normal completion events may not carry JSON on older workers.
      }
      setActiveEvalId(null);
      localStorage.removeItem('active_model_eval_id');
      fetchLeaderboard();
    });

    source.addEventListener('error', (err) => {
      source.close();
      setActiveEvalStage('Mat ket noi tien trinh');
      setActiveEvalDetail('Khong doc duoc stream tu backend. Tien trinh tren GPU co the van dang chay, bam lai "Xem tien trinh" de ket noi lai.');
      setActiveEvalLogs(prev => [
        ...prev,
        createEvalLogEntry('[ERROR] Mat ket noi SSE. Kiem tra backend route /model-eval/stream hoac token dang nhap.'),
      ]);
      toast.error('Khong ket noi duoc stream tien trinh Eval.');
    });
  };

  const reconnectActiveEvaluation = async () => {
    setActiveEvalId('checking');
    setActiveEvalProgress(0);
    setActiveEvalStage('Dang tim tien trinh');
    setActiveEvalDetail('Dang hoi backend xem Eval Job nao dang chay...');
    setActiveEvalLogs([createEvalLogEntry('[INFO] Dang tim Eval Job dang chay cua tai khoan hien tai...')]);
    setActiveEvalSample(null);
    try {
      const response = await api.get('/model-eval/active');
      if (response.data?.modelEvalId) {
        startProgressStream(response.data.modelEvalId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setActiveEvalId(null);
        const message = response.data?.message || 'Không có Eval Job đang chạy của tài khoản hiện tại.';
        toast(message, {
          icon: response.data?.reason === 'another_account' ? '🔒' : 'ℹ️',
        });
      }
    } catch (error: any) {
      setActiveEvalId(null);
      toast.error(error.response?.data?.error || 'Không thể kết nối lại tiến trình Eval.');
    }
  };

  useEffect(() => {
    const restoreActiveEvaluation = async () => {
      const rememberedId = localStorage.getItem('active_model_eval_id');
      try {
        const response = await api.get('/model-eval/active');
        const confirmedId = response.data?.modelEvalId;
        if (confirmedId) {
          startProgressStream(confirmedId);
        } else if (rememberedId) {
          localStorage.removeItem('active_model_eval_id');
        }
      } catch (error) {
        console.error('Failed to restore active evaluation:', error);
      }
    };
    restoreActiveEvaluation();
  }, []);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  
  const handleStartEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId) {
      toast.error('Vui lòng chọn một Training Job để đánh giá');
      return;
    }
    if (!baseModelHfRepo.trim()) {
      toast.error('Training Job không lưu Base Model nên chưa thể chạy Base–Fine-tuned evaluation.');
      return;
    }

    // A score shown in the detail panel belongs to the previously selected
    // evaluation. Clear it before dispatching a new job so users never mistake
    // an old 3.19 score for the new PENDING/FAILED attempt.
    setViewMode('leaderboard');
    setSelectedEvalId(null);
    setEvaluationDetail(null);
    setDetailEvalHistory([]);
    setDetailLoadError(null);
    setSelectedConvIndex(null);

    let fileToUpload: File | null = uploadedFile;

    setSubmittingEval(true);
    const loadingToastId = toast.loading('Đang khởi tạo job đánh giá...');

    try {
      // If dataset version selected, download it first and convert to JSON blob
      if (datasetSource === 'version') {
        if (!selectedVersionId) {
          toast.error('Vui lòng chọn Dataset Version');
          toast.dismiss(loadingToastId);
          setSubmittingEval(false);
          return;
        }
        toast.loading('Đang tải dữ liệu của Dataset Version...', { id: loadingToastId });
        const exportRes = await apiService.getTrainingExportData(selectedVersionId);
        if (!exportRes.data || exportRes.data.length === 0) {
          throw new Error('Dataset version không có mẫu dữ liệu nào để đánh giá.');
        }
        
        const blob = new Blob([JSON.stringify(exportRes.data, null, 2)], { type: 'application/json' });
        fileToUpload = new File([blob], `version_${selectedVersionId}.json`, { type: 'application/json' });
      }

      if (!fileToUpload) {
        toast.error('Thiếu tệp dữ liệu kiểm thử');
        toast.dismiss(loadingToastId);
        setSubmittingEval(false);
        return;
      }

      // Reuse the same locked test automatically in the Large-LLM tab during
      // this browser session. Older evaluations may still require selecting it once.
      setLargeLlmTestFile(fileToUpload);

      toast.loading('Đang nạp file và gửi yêu cầu lên GPU...', { id: loadingToastId });

      const options = {
        judgeModel,
        baseModelHfRepo
      };

      const res = await apiService.runEvaluation(selectedJobId, fileToUpload, options);
      
      toast.success('Khởi chạy đánh giá thành công!', { id: loadingToastId });
      setIsModalOpen(false);
      
      // Start streaming progress
      if (res.eval_job_id) {
        startProgressStream(res.eval_job_id);
      }
    } catch (err: any) {
      console.error('Failed to run evaluation:', err);
      const existingPayload = err.response?.data || {};
      const existingEvalId = existingPayload.eval_job_id;
      const existingIsActive = ['PENDING', 'RUNNING', 'EVALUATING'].includes(existingPayload.status);
      if (existingEvalId && (existingPayload.resumable === true || existingIsActive)) {
        setIsModalOpen(false);
        startProgressStream(existingEvalId);
      }
      toast.error(err.response?.data?.message || err.response?.data?.error || err.message || 'Khởi chạy đánh giá thất bại', { id: loadingToastId });
    } finally {
      setSubmittingEval(false);
    }
  };

  const handleViewDetails = async (evalId: string) => {
    setLoadingDetail(true);
    setViewMode('detail');
    setSelectedEvalId(evalId);
    setSelectedConvIndex(null);
    setEvaluationDetail(null);
    setDetailEvalHistory([]);
    setDetailLoadError(null);
    try {
      const data = await apiService.getEvaluationDetail(evalId);
      setEvaluationDetail(data);
      setDetailTab(data?.evalMode === 'paired' ? 'paired' : 'breakdown');
      if (data?.jobId) {
        try {
          const history = await apiService.getEvalHistory(data.jobId);
          setDetailEvalHistory(Array.isArray(history?.evals) ? history.evals : []);
        } catch (historyErr) {
          console.error('Failed to fetch evaluation history:', historyErr);
        }
      }
    } catch (err) {
      console.error('Failed to fetch evaluation details:', err);
      setDetailLoadError('Không tải được chi tiết lần đánh giá này. Hãy thử lại; nếu vẫn lỗi, kết quả có thể đã bị xóa hoặc phiên đăng nhập đã hết hạn.');
      toast.error('Không thể tải chi tiết kết quả đánh giá');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleExportArtifact = async () => {
    if (!selectedEvalId) return;
    try {
      const blob = await apiService.exportEvaluationArtifact(selectedEvalId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedEvalId}_rp5_artifact.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Đã tải artifact đầy đủ cho RP5.');
    } catch (err) {
      console.error('Failed to export evaluation artifact:', err);
      toast.error('Không thể tải artifact RP5.');
    }
  };

  const handlePin = async (e: React.MouseEvent, evalId: string, isPinned = false) => {
    e.stopPropagation();
    const confirmed = confirm(isPinned
      ? 'Bỏ chọn đánh giá này làm kết quả chính thức? Hệ thống sẽ không tự chọn bản thay thế.'
      : 'Chọn đánh giá này làm kết quả chính thức của dự án?');
    if (!confirmed) return;
    try {
      if (isPinned) await apiService.unpinEvaluation(evalId);
      else await apiService.pinEvaluation(evalId);
      toast.success(isPinned ? 'Đã bỏ ghim kết quả chính thức.' : 'Đã ghim đánh giá làm kết quả chính thức!');
      if (evaluationDetail?.jobId) {
        try {
          const history = await apiService.getEvalHistory(evaluationDetail.jobId);
          setDetailEvalHistory(Array.isArray(history?.evals) ? history.evals : []);
          setEvaluationDetail((prev: any) => prev
            ? { ...prev, isPinned: isPinned ? false : prev.modelEvalId === evalId }
            : prev);
        } catch (historyErr) {
          console.error('Failed to refresh evaluation history:', historyErr);
        }
      }
      fetchLeaderboard();
    } catch (err) {
      console.error('Failed to change pinned evaluation:', err);
      toast.error(isPinned ? 'Không thể bỏ ghim kết quả' : 'Không thể ghim kết quả');
    }
  };

  const handleDelete = async (e: React.MouseEvent, evalId: string) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xóa bản đánh giá này?')) return;
    try {
      await apiService.deleteEvaluation(evalId);
      toast.success('Đã xóa đánh giá thành công');
      fetchLeaderboard();
    } catch (err) {
      console.error('Failed to delete evaluation:', err);
      toast.error('Không thể xóa kết quả');
    }
  };

  const handleClearActiveEval = async () => {
    if (!activeEvalId || activeEvalId === 'checking') return;
    if (!confirm('Eval job nay khong con chay tren GPU. Xoa job ket khoi danh sach active?')) return;
    try {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      try {
        await apiService.deleteEvaluation(activeEvalId);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status !== 404) throw err;
        // Tracker can outlive the Mongo record after a failed start/restart.
        // In that case clearing local active state is the correct recovery.
        console.warn('Active eval record already missing, clearing local tracker:', activeEvalId);
      }
      localStorage.removeItem('active_model_eval_id');
      setActiveEvalId(null);
      setActiveEvalProgress(0);
      setActiveEvalStage('');
      setActiveEvalDetail('');
      setActiveEvalLogs([]);
      setActiveEvalSample(null);
      toast.success('Da xoa eval job ket');
      fetchLeaderboard();
    } catch (err: any) {
      console.error('Failed to clear active evaluation:', err);
      toast.error(err?.response?.data?.error || 'Khong xoa duoc eval job ket');
    }
  };

  const handleResumeActiveEval = async () => {
    if (!activeEvalId || activeEvalId === 'checking') return;
    try {
      setActiveEvalDetail('Đang yêu cầu GPU đọc checkpoint...');
      await apiService.resumeEvaluation(activeEvalId);
      setActiveEvalResumable(false);
      startProgressStream(activeEvalId);
      toast.success('Đã Resume Eval từ checkpoint.');
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.response?.data?.error || 'Không thể Resume Eval.';
      setActiveEvalResumable(true);
      toast.error(message);
    }
  };

  // Compare Checkbox selection
  const handleSelectCompare = (e: React.MouseEvent, evalId: string) => {
    e.stopPropagation();
    setSelectedCompareIds(prev => {
      if (prev.includes(evalId)) {
        return prev.filter(id => id !== evalId);
      } else {
        if (prev.length >= 2) {
          toast.error('Chỉ có thể chọn tối đa 2 model để đối chiếu');
          return prev;
        }
        return [...prev, evalId];
      }
    });
  };

  const handleStartComparison = async () => {
    if (selectedCompareIds.length !== 2) {
      toast.error('Vui lòng chọn chính xác 2 model để đối chiếu');
      return;
    }
    setLoadingCompare(true);
    setViewMode('compare');
    setCompareData(null);
    try {
      const data = await apiService.compareEvaluations(selectedCompareIds[0], selectedCompareIds[1]);
      setCompareData(data);
    } catch (err) {
      console.error('Failed to compare evaluations:', err);
      toast.error('Lỗi đối chiếu hai bản đánh giá');
      setViewMode('leaderboard');
    } finally {
      setLoadingCompare(false);
    }
  };

  // Open Conversation Audit Panel
  const handleOpenAudit = (index: number) => {
    const resultItem = evaluationDetail?.results?.find((r: any) => r.conv_index === index);
    if (!resultItem) return;
    setSelectedConvIndex(index);
    setReviewVerdict(resultItem.human_review?.verdict || 'agree');
    setReviewNote(resultItem.human_review?.note || '');
  };

  // Submit human audit review
  const handleSaveAuditReview = async () => {
    if (selectedConvIndex === null || !selectedEvalId) return;
    setSubmittingReview(true);
    try {
      const reviewPayload = {
        verdict: reviewVerdict,
        note: reviewNote,
        reviewer: reviewerName
      };
      await apiService.reviewConversation(selectedEvalId, selectedConvIndex, reviewPayload);
      
      toast.success('Đã lưu thẩm định thủ công!');
      
      // Update local state details to avoid full refetch
      setEvaluationDetail((prev: any) => {
        if (!prev) return null;
        const updatedResults = prev.results.map((r: any) => {
          if (r.conv_index === selectedConvIndex) {
            return {
              ...r,
              human_review: {
                verdict: reviewVerdict,
                note: reviewNote,
                reviewer: reviewerName,
                reviewed_at: new Date()
              }
            };
          }
          return r;
        });
        return {
          ...prev,
          results: updatedResults
        };
      });
      
      setSelectedConvIndex(null);
    } catch (err: any) {
      console.error('Failed to save audit review:', err);
      toast.error(err.response?.data?.error || 'Không thể lưu thẩm định');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Export Leaderboard CSV
  const handleExportCSV = () => {
    if (leaderboard.length === 0) return;
    const headers = ['RANK', 'PROJECT', 'MODEL', 'BASE MODEL', 'KNOWLEDGE K', 'SOCRATIC S', 'LEGACY OVERALL (EXPLORATORY)', 'PEDAGOGY C (DIAGNOSTIC)', 'AVG LATENCY', 'JUDGE MODEL', 'TOTAL SAMPLES', 'FLAGS'];
    const rows = leaderboard.map((row, index) => [
      index + 1,
      row.projectName,
      row.pinnedEvalId ? `${row.baseModel} (Fine-tuned)` : row.baseModel,
      row.scores?.group_b ? 'Paired Eval' : 'Single',
      row.scores.knowledge ?? '-',
      row.scores.socratic ?? '-',
      row.scores.exploratory_overall ?? row.scores.overall ?? '-',
      row.scores.group_c || '-',
      row.scores.avg_latency_ms || '-',
      row.judgeModel || '-',
      row.totalConversations || '-',
      row.flags.join('; ')
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `model_eval_leaderboard_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getAuditVerdictBadge = (verdict?: string) => {
    if (!verdict) return <span className="audit-badge none">Chưa duyệt</span>;
    if (verdict === 'agree') return <span className="audit-badge agree">Đồng ý</span>;
    if (verdict === 'disagree') return <span className="audit-badge disagree">Lệch ý</span>;
    return <span className="audit-badge skip">Bỏ qua</span>;
  };

  // Filtered leaderboard list
  const filteredLeaderboard = leaderboard.filter(item => {
    const matchesProject = !filterProject || item.projectName.toLowerCase().includes(filterProject.toLowerCase());
    const matchesJudge = !filterJudge || (item.judgeModel && item.judgeModel.toLowerCase().includes(filterJudge.toLowerCase()));
    return matchesProject && matchesJudge;
  });

  // Calculate overall metrics if details are loaded
  const detailsStats = React.useMemo(() => {
    if (!evaluationDetail) return null;
    const reviewed = evaluationDetail.results.filter((r: any) => r.human_review);
    const agreed = reviewed.filter((r: any) => r.human_review.verdict === 'agree').length;
    return {
      knowledge: evaluationDetail.summary?.knowledge ?? evaluationDetail.summary?.criteria?.B1 ?? 0,
      socratic: evaluationDetail.summary?.socratic ?? evaluationDetail.summary?.group_a ?? 0,
      exploratoryOverall: evaluationDetail.summary?.exploratory_overall ?? evaluationDetail.summary?.overall ?? 0,
      latency: evaluationDetail.summary?.avg_latency_ms || 0,
      avgTotalTokens: evaluationDetail.summary?.avg_total_tokens || 0,
      totalTokens: evaluationDetail.summary?.total_tokens || 0,
      factuality: evaluationDetail.summary?.knowledge ?? evaluationDetail.summary?.criteria?.B1 ?? evaluationDetail.summary?.group_b ?? 0,
      totalReviewed: reviewed.length,
      agreementRate: reviewed.length > 0 ? Math.round((agreed / reviewed.length) * 100) : null
    };
  }, [evaluationDetail]);

  const operationalComparisonRows = React.useMemo(() => {
    if (!evaluationDetail?.summary?.operational || !evaluationDetail?.baseSummary?.operational) return [];
    const ft = evaluationDetail.summary.operational;
    const base = evaluationDetail.baseSummary.operational;
    const metric = (key: string, statistic: string) => ({
      base: base.metrics?.[key]?.[statistic],
      ft: ft.metrics?.[key]?.[statistic],
    });
    return [
      { label: 'TTFT median (ms)', ...metric('ttft_ms', 'median') },
      { label: 'E2E median (ms)', ...metric('e2e_ms', 'median') },
      { label: 'TPOT median (ms/token)', ...metric('tpot_ms', 'median') },
      { label: 'Throughput mean (token/s)', ...metric('tokens_per_second', 'mean') },
      { label: 'Failure rate', base: base.failure_rate, ft: ft.failure_rate, percent: true },
      { label: 'Output-limit rate', base: base.output_limit_rate, ft: ft.output_limit_rate, percent: true },
    ];
  }, [evaluationDetail]);

  const primaryResearchRows = React.useMemo(() => {
    if (!evaluationDetail) return [];
    const perSubject = evaluationDetail.researchStatistics?.per_subject || {};
    const subject = Object.keys(perSubject)[0];
    const subjectStats = subject ? perSubject[subject] : {};
    const makeRow = (metric: 'K' | 'S', label: string) => {
      const stats = subjectStats?.[metric] || {};
      const ci = Array.isArray(stats.ci95) ? stats.ci95 : [];
      const p = Number(stats.bootstrap_p_two_sided);
      const significant = ci.length === 2 && Number(ci[0]) > 0;
      return {
        metric,
        label,
        base: metric === 'K' ? evaluationDetail.baseSummary?.knowledge : evaluationDetail.baseSummary?.socratic,
        ft: metric === 'K' ? evaluationDetail.summary?.knowledge : evaluationDetail.summary?.socratic,
        delta: metric === 'K' ? evaluationDetail.delta?.knowledge : evaluationDetail.delta?.socratic,
        ci,
        p: Number.isFinite(p) ? p : null,
        significant,
        status: stats.status || 'not_testable',
      };
    };
    return [
      makeRow('K', 'Độ chính xác kiến thức (K = B1)'),
      makeRow('S', 'Khả năng gợi mở Socratic (S = trung bình A1–A3)'),
    ];
  }, [evaluationDetail]);

  const primaryChartData = React.useMemo(() => {
    if (!evaluationDetail?.summary || !evaluationDetail?.baseSummary) return [];
    return [
      {
        metric: 'Kiến thức (K)',
        Base: Number(evaluationDetail.baseSummary.knowledge ?? 0),
        'Fine-tuned': Number(evaluationDetail.summary.knowledge ?? 0),
      },
      {
        metric: 'Gợi mở (S)',
        Base: Number(evaluationDetail.baseSummary.socratic ?? 0),
        'Fine-tuned': Number(evaluationDetail.summary.socratic ?? 0),
      },
    ];
  }, [evaluationDetail]);

  const plainLanguageVerdict = React.useMemo(() => {
    const knowledge = primaryResearchRows.find(row => row.metric === 'K');
    const socratic = primaryResearchRows.find(row => row.metric === 'S');
    if (!knowledge || !socratic) return 'Chưa đủ dữ liệu để kết luận.';
    if (knowledge.significant && socratic.significant) return 'Fine-tuning cải thiện rõ cả độ chính xác kiến thức và khả năng gợi mở.';
    if (socratic.significant) return 'Fine-tuning cải thiện rõ khả năng gợi mở; độ chính xác kiến thức chưa khác biệt đủ rõ.';
    if (knowledge.significant) return 'Fine-tuning cải thiện rõ độ chính xác kiến thức; khả năng gợi mở chưa khác biệt đủ rõ.';
    return 'Chưa có đủ bằng chứng thống kê rằng Fine-tuning cải thiện hai kết quả chính.';
  }, [primaryResearchRows]);

  const criteriaChartData = React.useMemo(() => {
    if (!evaluationDetail?.summary?.criteria || !evaluationDetail?.baseSummary?.criteria) return [];
    const labels: Record<string, string> = {
      A1: 'A1 · Không đưa đáp án',
      A2: 'A2 · Gợi mở',
      A3: 'A3 · Thích ứng',
      B1: 'B1 · Kiến thức',
      B2: 'B2 · Đúng trình độ',
      C1: 'C1 · Xử lý tình huống',
      C2: 'C2 · Mạch lạc',
      C3: 'C3 · Tông giọng',
      D1: 'D1 · Không bịa đặt',
    };
    return Object.entries(labels).map(([key, label]) => ({
      metric: label,
      Base: Number(evaluationDetail.baseSummary.criteria?.[key] ?? 0),
      'Fine-tuned': Number(evaluationDetail.summary.criteria?.[key] ?? 0),
    }));
  }, [evaluationDetail]);

  useEffect(() => {
    if (!selectedEvalId) {
      setLargeLlmReferences([]);
      return;
    }
    try {
      const saved = localStorage.getItem(`large_llm_references_${selectedEvalId}`);
      setLargeLlmReferences(saved ? JSON.parse(saved) : []);
    } catch {
      setLargeLlmReferences([]);
    }
  }, [selectedEvalId]);

  const handleImportLargeLlmArtifacts = async (files: FileList | null) => {
    if (!files?.length || !evaluationDetail || !selectedEvalId) return;
    const percentile50 = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const average = (values: number[]) => values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
    const currentHash = evaluationDetail.datasetValidation?.dataset_hash
      ?? evaluationDetail.protocolManifest?.dataset_hash
      ?? evaluationDetail.protocolManifest?.locked_dataset_hash;
    const currentPromptVersion = evaluationDetail.protocolManifest?.prompt_version;
    const imported: LargeLlmReference[] = [];

    for (const file of Array.from(files).slice(0, 2)) {
      try {
        const artifact = JSON.parse(await file.text());
        if (artifact?.comparisonRole !== 'contextual_large_llm_reference') {
          throw new Error('Không phải artifact contextual_large_llm_reference');
        }
        const results = Array.isArray(artifact.results) ? artifact.results : [];
        const e2eValues = results.map((row: any) => Number(row.telemetry?.e2e_ms)).filter(Number.isFinite);
        const throughputValues = results.map((row: any) => Number(row.telemetry?.tokens_per_second)).filter(Number.isFinite);
        const outputTokenValues = results.map((row: any) => Number(row.telemetry?.output_tokens)).filter(Number.isFinite);
        const scored = results.filter((row: any) => row.criteria_scores?.A1 !== undefined);
        const artifactHash = artifact.datasetValidation?.dataset_hash ?? artifact.protocolManifest?.dataset_hash;
        const artifactPromptVersion = artifact.protocolManifest?.prompt_version;
        const notes: string[] = [];
        if (currentHash && artifactHash !== currentHash) notes.push('Khác locked-test hash');
        if (currentPromptVersion && artifactPromptVersion !== currentPromptVersion) notes.push('Khác prompt version');
        if (Number(artifact.protocolManifest?.max_new_tokens) !== 512) notes.push('max_new_tokens không phải 512');
        if (artifact.runValidity !== 'valid') notes.push('Run không hợp lệ hoàn toàn');

        imported.push({
          model: String(artifact.requestedModel || file.name),
          judgeModel: String(artifact.judgeModel || '—'),
          total: Number(artifact.totalConversations || results.length),
          valid: Number(artifact.validConversations || 0),
          knowledge: Number.isFinite(Number(artifact.summary?.knowledge_k?.mean)) ? Number(artifact.summary.knowledge_k.mean) : null,
          socratic: Number.isFinite(Number(artifact.summary?.socratic_s?.mean)) ? Number(artifact.summary.socratic_s.mean) : null,
          a1ViolationRate: scored.length ? scored.filter((row: any) => Number(row.criteria_scores.A1) <= 1).length / scored.length : null,
          e2eMedianMs: percentile50(e2eValues),
          throughputMean: average(throughputValues),
          outputLimitRate: Number.isFinite(Number(artifact.summary?.output_limit_rate)) ? Number(artifact.summary.output_limit_rate) : null,
          costPer100Usd: Number.isFinite(Number(artifact.summary?.generation_cost_per_100_items_usd)) ? Number(artifact.summary.generation_cost_per_100_items_usd) : null,
          outputTokensMean: average(outputTokenValues),
          runValidity: String(artifact.runValidity || 'unknown'),
          protocolMatch: notes.length === 0,
          protocolNotes: notes,
        });
      } catch (error: any) {
        toast.error(`${file.name}: ${error.message || 'Artifact không hợp lệ'}`);
      }
    }

    if (imported.length) {
      setLargeLlmReferences(imported);
      localStorage.setItem(`large_llm_references_${selectedEvalId}`, JSON.stringify(imported));
      toast.success(`Đã nhập ${imported.length} kết quả LLM lớn`);
    }
  };

  const normalizeServerLargeLlmResult = (artifact: any): LargeLlmReference => {
    const results = Array.isArray(artifact?.results) ? artifact.results : [];
    const median = (values: number[]) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const e2e = results.map((row: any) => Number(row.telemetry?.e2e_ms)).filter(Number.isFinite);
    const throughput = results.map((row: any) => Number(row.telemetry?.tokens_per_second)).filter(Number.isFinite);
    const outputTokens = results.map((row: any) => Number(row.telemetry?.output_tokens)).filter(Number.isFinite);
    const scored = results.filter((row: any) => row.criteria_scores?.A1 !== undefined);
    const notes: string[] = [];
    if (Number(artifact?.protocolManifest?.max_new_tokens) !== 512) notes.push('Giới hạn đầu ra khác 512 token');
    if (artifact?.runValidity !== 'valid') notes.push('Run chưa hợp lệ hoàn toàn');
    return {
      model: String(artifact?.requestedModel || 'Large LLM'),
      judgeModel: String(artifact?.judgeModel || '—'),
      total: Number(artifact?.totalConversations || results.length),
      valid: Number(artifact?.validConversations || 0),
      knowledge: Number.isFinite(Number(artifact?.summary?.knowledge_k?.mean)) ? Number(artifact.summary.knowledge_k.mean) : null,
      socratic: Number.isFinite(Number(artifact?.summary?.socratic_s?.mean)) ? Number(artifact.summary.socratic_s.mean) : null,
      a1ViolationRate: scored.length ? scored.filter((row: any) => Number(row.criteria_scores.A1) <= 1).length / scored.length : null,
      e2eMedianMs: median(e2e),
      throughputMean: mean(throughput),
      outputLimitRate: Number.isFinite(Number(artifact?.summary?.output_limit_rate)) ? Number(artifact.summary.output_limit_rate) : null,
      costPer100Usd: Number.isFinite(Number(artifact?.summary?.generation_cost_per_100_items_usd)) ? Number(artifact.summary.generation_cost_per_100_items_usd) : null,
      outputTokensMean: mean(outputTokens),
      runValidity: String(artifact?.runValidity || 'unknown'),
      protocolMatch: notes.length === 0,
      protocolNotes: notes,
    };
  };

  const saveLargeLlmReference = (reference: LargeLlmReference) => {
    if (!selectedEvalId) return;
    setLargeLlmReferences(previous => {
      const next = [...previous.filter(item => item.model !== reference.model), reference].slice(-2);
      localStorage.setItem(`large_llm_references_${selectedEvalId}`, JSON.stringify(next));
      return next;
    });
  };

  const pollLargeLlmReference = async (referenceJobId: string, model: string) => {
    try {
      const status = await apiService.getLargeLlmReferenceStatus(referenceJobId);
      setLargeLlmRuns(previous => ({ ...previous, [model]: status }));
      if (status.status === 'COMPLETED' && status.result) {
        saveLargeLlmReference(normalizeServerLargeLlmResult(status.result));
        toast.success(`Đã so sánh xong ${model}`);
        return;
      }
      if (status.status === 'FAILED') {
        toast.error(`${model}: ${status.error || 'Chạy thất bại'}`);
        return;
      }
      window.setTimeout(() => pollLargeLlmReference(referenceJobId, model), 2500);
    } catch (error: any) {
      toast.error(`${model}: không đọc được tiến trình`);
    }
  };

  useEffect(() => {
    if (detailTab !== 'large-llm' || largeLlmCatalog.length) return;
    apiService.getLargeLlmReferenceModels()
      .then((payload: any) => setLargeLlmCatalog(Array.isArray(payload?.models) ? payload.models : []))
      .catch(() => toast.error('Không tải được danh sách model từ OpenRouter'));
  }, [detailTab, largeLlmCatalog.length]);

  const handleRunLargeLlmFromUi = async () => {
    const models = [...new Set(selectedLargeLlmModels.filter(Boolean))].slice(0, 2);
    if (!selectedEvalId || !largeLlmTestFile) {
      toast.error('Hãy chọn lại file locked-test ZIP/JSON đã dùng cho Base–FT.');
      return;
    }
    if (!models.length) {
      toast.error('Hãy chọn ít nhất một LLM lớn.');
      return;
    }
    const catalogIds = new Set(largeLlmCatalog.map(item => item.id));
    if (models.some(model => !catalogIds.has(model))) {
      toast.error('Model đã chọn không còn hợp lệ. Hãy bỏ lựa chọn cũ và nhấn vào một thẻ model trong danh sách.');
      return;
    }
    setStartingLargeLlmRun(true);
    try {
      for (const model of models) {
        const started = await apiService.runLargeLlmReference(selectedEvalId, model, largeLlmTestFile);
        setLargeLlmRuns(previous => ({
          ...previous,
          [model]: { status: started.status || 'PENDING', progress: 0, detail: 'Đã đưa vào hàng đợi' },
        }));
        void pollLargeLlmReference(started.referenceJobId, model);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Không thể bắt đầu so sánh LLM lớn');
    } finally {
      setStartingLargeLlmRun(false);
    }
  };

  const visibleLargeLlmModels = React.useMemo(() => {
    const query = largeLlmSearch.trim().toLowerCase();
    const candidates = query
      ? largeLlmCatalog.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(query))
      : largeLlmCatalog;
    return candidates.slice(0, 18);
  }, [largeLlmCatalog, largeLlmSearch]);

  const evalOverview = React.useMemo(() => {
    if (!evaluationDetail?.summary) return null;
    const summary = evaluationDetail.summary;
    const results = evaluationDetail.results || [];
    const baseResults = evaluationDetail.baseResults || [];
    const a1ZeroCount = results.filter((item: any) => Number(item.criteria_scores?.A1) === 0).length;
    const a1HardViolationCount = results.filter((item: any) => Number(item.criteria_scores?.A1) <= 1).length;
    const baseA1HardViolationCount = baseResults.filter((item: any) => Number(item.criteria_scores?.A1) <= 1).length;
    const judgeFailure = results.some((item: any) =>
      Object.values(item.criteria_reasons || {}).some((reason: any) => String(reason).includes('judge_error'))
    );
    return {
      a1ZeroCount,
      a1HardViolationCount,
      baseA1HardViolationCount,
      judgeFailure,
      outputLimitRate: summary.operational?.output_limit_rate,
      baseOutputLimitRate: evaluationDetail.baseSummary?.operational?.output_limit_rate,
    };
  }, [evaluationDetail]);

  const largeLlmComparisonRows = React.useMemo(() => {
    const LOCAL_GPU_USD_PER_HOUR = 0.35;
    // Local models have no token invoice. This shows a transparent runtime
    // equivalent: mean sequential E2E time on a T4-priced GPU.
    const localCostPer100 = (summary: any) => {
      const e2eMeanMs = Number(
        summary?.operational?.metrics?.e2e_ms?.mean ?? summary?.avg_latency_ms
      );
      if (!Number.isFinite(e2eMeanMs) || e2eMeanMs <= 0) return '—';
      return `$${((e2eMeanMs * 100 / 3_600_000) * LOCAL_GPU_USD_PER_HOUR).toFixed(4)}`;
    };
    const percent = (value: unknown) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : '—';
    const number = (value: unknown, digits = 2) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
    return [
      {
        label: 'Độ chính xác kiến thức K (0–5)',
        help: 'Độ chính xác kiến thức; cao hơn tốt hơn.',
        base: number(evaluationDetail?.baseSummary?.knowledge, 3),
        ft: number(evaluationDetail?.summary?.knowledge, 3),
        ref: (item: LargeLlmReference) => number(item.knowledge, 3),
      },
      {
        label: 'Khả năng gợi mở Socratic S (0–5)',
        help: 'Trung bình A1–A3; cao hơn tốt hơn.',
        base: number(evaluationDetail?.baseSummary?.socratic, 3),
        ft: number(evaluationDetail?.summary?.socratic, 3),
        ref: (item: LargeLlmReference) => number(item.socratic, 3),
      },
      {
        label: 'A1 violation rate',
        help: 'Tỷ lệ A1≤1; thấp hơn tốt hơn.',
        base: evaluationDetail?.baseResults?.length ? percent((evalOverview?.baseA1HardViolationCount || 0) / evaluationDetail.baseResults.length) : '—',
        ft: evaluationDetail?.results?.length ? percent((evalOverview?.a1HardViolationCount || 0) / evaluationDetail.results.length) : '—',
        ref: (item: LargeLlmReference) => percent(item.a1ViolationRate),
      },
      {
        label: 'E2E median (ms)',
        help: 'Thời gian hoàn tất phản hồi; thấp hơn tốt hơn.',
        base: number(evaluationDetail?.baseSummary?.operational?.metrics?.e2e_ms?.median),
        ft: number(evaluationDetail?.summary?.operational?.metrics?.e2e_ms?.median),
        ref: (item: LargeLlmReference) => number(item.e2eMedianMs),
      },
      {
        label: 'Throughput mean (token/s)',
        help: 'Tốc độ sinh token; cao hơn tốt hơn.',
        base: number(evaluationDetail?.baseSummary?.operational?.metrics?.tokens_per_second?.mean),
        ft: number(evaluationDetail?.summary?.operational?.metrics?.tokens_per_second?.mean),
        ref: (item: LargeLlmReference) => number(item.throughputMean),
      },
      {
        label: 'Tốc độ sinh output (tokens/phút)',
        help: 'Cùng dữ liệu throughput nhưng đổi sang đơn vị dễ đọc: token/s × 60; cao hơn tốt hơn.',
        base: number(Number(evaluationDetail?.baseSummary?.operational?.metrics?.tokens_per_second?.mean) * 60, 0),
        ft: number(Number(evaluationDetail?.summary?.operational?.metrics?.tokens_per_second?.mean) * 60, 0),
        ref: (item: LargeLlmReference) => number(Number(item.throughputMean) * 60, 0),
      },
      {
        label: 'Output-limit rate',
        help: 'Tỷ lệ bị cắt vì chạm 512 token; thấp hơn tốt hơn.',
        base: percent(evalOverview?.baseOutputLimitRate),
        ft: percent(evalOverview?.outputLimitRate),
        ref: (item: LargeLlmReference) => percent(item.outputLimitRate),
      },
      {
        label: 'Output dự kiến / câu (tokens)',
        help: 'Số token phản hồi trung bình đo trực tiếp trên tập test; dùng để dự báo dung lượng sinh cho 100 hoặc 1.000 lượt.',
        base: number(evaluationDetail?.baseSummary?.avg_output_tokens, 1),
        ft: number(evaluationDetail?.summary?.avg_output_tokens, 1),
        ref: (item: LargeLlmReference) => number(item.outputTokensMean, 1),
      },
      {
        label: 'Chi phí / 100 câu (USD)',
        help: 'Local: quy đổi E2E trung bình theo T4 $0.35/GPU-giờ, chạy tuần tự. API: usage token × giá provider. Đây là chi phí suy ra, không phải bill Colab.',
        base: localCostPer100(evaluationDetail?.baseSummary),
        ft: localCostPer100(evaluationDetail?.summary),
        ref: (item: LargeLlmReference) => item.costPer100Usd === null ? '—' : `$${item.costPer100Usd.toFixed(4)}`,
      },
    ];
  }, [evaluationDetail, evalOverview]);

  const activeStageKey = (() => {
    const raw = `${activeEvalStage} ${activeEvalDetail}`.toLowerCase();
    if (raw.includes('final') || raw.includes('tong hop') || raw.includes('tổng hợp')) return 'finalize';
    if (raw.includes('judge') || raw.includes('rubric') || raw.includes('cham') || raw.includes('chấm')) return 'judge';
    if (raw.includes('replay')) return 'replay';
    if (raw.includes('warm') || raw.includes('load') || raw.includes('init') || raw.includes('khoi') || raw.includes('khởi')) return 'warmup';
    return activeEvalProgress >= 90 ? 'finalize' : activeEvalProgress >= 45 ? 'judge' : activeEvalProgress > 5 ? 'replay' : 'warmup';
  })();
  const activeStageSteps = [
    { key: 'warmup', label: 'Warmup' },
    { key: 'replay', label: 'Replay' },
    { key: 'judge', label: 'Judging' },
    { key: 'finalize', label: 'Finalize' },
  ];
  const activeStageIndex = Math.max(0, activeStageSteps.findIndex(step => step.key === activeStageKey));
  const activeEvalLooksStuck =
    !!activeEvalId &&
    activeEvalId !== 'checking' &&
    (
      gpuStatus?.active_evals === 0 ||
      activeEvalStage.toLowerCase().includes('mat ket noi') ||
      activeEvalStage.toLowerCase().includes('not found') ||
      activeEvalStage.toLowerCase().includes('khong tim') ||
      activeEvalStage.toLowerCase().includes('gián đoạn')
    );

  return (
    <div className="eval-view">
      {/* Top Banner / SSE Progress Tracker */}
      {activeEvalId && (
        <div className="active-eval-tracker card">
          <div className="tracker-header">
            <div className="tracker-title-group">
              <Activity className="text-primary animate-pulse" size={20} />
              <div>
                <h3>Đang thực thi Job Đánh giá: <span className="font-mono text-xs">{activeEvalId}</span></h3>
                <p>Tiến trình đánh giá tự động đa mô hình (Multi-model AI Judge)</p>
              </div>
            </div>
            <div className="tracker-actions">
              <span className="tracker-pct">{activeEvalProgress}%</span>
              {activeEvalResumable ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleResumeActiveEval}
                  title="Tiếp tục từ câu hoặc Judge batch gần nhất đã lưu"
                >
                  <RefreshCw size={14} />
                  Resume từ checkpoint
                </button>
              ) : activeEvalLooksStuck && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleClearActiveEval}
                  title="GPU khong con chay job nay, xoa khoi active tracker"
                >
                  <Trash2 size={14} />
                  Xoa job ket
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="tracker-progress-bg">
            <div className="tracker-progress-fill animate-shimmer" style={{ width: `${activeEvalProgress}%` }} />
          </div>

          <div className="tracker-stage-steps">
            {activeStageSteps.map((step, index) => {
              const done = index < activeStageIndex;
              const current = index === activeStageIndex;
              return (
                <div key={step.key} className={`tracker-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                  <span className="tracker-step-line" />
                  <span className="tracker-step-label">{step.label}</span>
                </div>
              );
            })}
          </div>

          <div className="tracker-stage-info">
            <span className="stage-badge">{activeEvalStage}</span>
            <span className="stage-detail">{activeEvalDetail}</span>
          </div>

          {/* Current sample replay detail snippet */}
          {activeEvalSample && (
            <div className="tracker-current-sample">
              <div className="sample-label">Đang replay câu hỏi {activeEvalSample.index + 1}:</div>
              <div className="sample-text italic">"{activeEvalSample.instruction?.slice(0, 150)}..."</div>
              {activeEvalSample.ft_answer && (
                <div className="sample-model-res">
                  <span className="text-primary font-semibold">FT Answer: </span>
                  "{activeEvalSample.ft_answer?.slice(0, 150)}..."
                </div>
              )}
            </div>
          )}

          {/* Console Log Console */}
          <div className="tracker-console-card">
            <div className="console-header">
              <div className="console-left">
                <span className="console-dot-green"></span>
                <span className="console-title">Nhật ký tiến trình thời gian thực (GPU Runner Logs)</span>
              </div>
              <span className="console-lines-count">{activeEvalLogs.length} dòng log</span>
            </div>
            <div className="logs-console" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
              {activeEvalLogs.map((log, index) => (
                <div key={index} className="log-line">
                  <span className="log-timestamp">[{log.timestamp}]</span> {log.text}
                </div>
              ))}
              {activeEvalLogs.length === 0 && (
                <div className="log-line text-muted">Đang chờ nhận luồng log chi tiết từ server GPU...</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GPU Resource Monitor Dashboard */}
      {gpuStatus && (
        <div className={`gpu-monitor-widget card ${gpuStatus.can_create_eval ? 'idle' : 'busy'}`}>
          <div className="gpu-monitor-summary">
            <div className="status-dot-wrapper">
              <span className={`status-dot ${gpuStatus.can_create_eval ? 'green' : 'amber'}`} />
              <span className="font-semibold text-sm">
                GPU Worker: {gpuStatus.can_create_eval
                  ? 'Sẵn sàng'
                  : gpuStatus.active_training
                    ? 'Đang chạy AutoTrain'
                    : gpuStatus.active_evals > 0
                      ? 'Đang chạy Evaluation'
                      : 'VRAM dưới ngưỡng an toàn'}
              </span>
            </div>
            <div className="gpu-details-row">
              <span className="detail-tag">Active Slots: {gpuStatus.active_evals}/{gpuStatus.max_evals}</span>
              <span className="detail-tag">VRAM Trống: {Math.round(gpuStatus.vram_free_mb / 1024)}GB / {Math.round(gpuStatus.vram_total_mb / 1024)}GB</span>
              <span className="detail-tag">GPU Util: {gpuStatus.gpu_util}%</span>
              {!activeEvalId && gpuStatus.active_evals > 0 && (
                <button type="button" className="btn btn-sm btn-primary" onClick={reconnectActiveEvaluation}>
                  Kiểm tra job đang chiếm GPU
                </button>
              )}
            </div>
          </div>
          {!gpuStatus.can_create_eval && (
            <div className="gpu-warning-box text-xs mt-2 text-amber">
              <AlertCircle size={14} /> {gpuStatus.active_training
                ? 'AutoTrain đang dùng GPU; không thể chạy Evaluation đồng thời vì có nguy cơ OOM.'
                : gpuStatus.active_evals > 0
                  ? 'GPU đang chạy Evaluation khác hoặc đã hết slot.'
                  : 'VRAM trống dưới mức an toàn 5GB; cần giải phóng model/cache trước khi chạy Evaluation.'}
            </div>
          )}
        </div>
      )}

      {/* RENDER VIEW MODES */}

      {/* 1. LEADERBOARD SCREEN */}
      {viewMode === 'leaderboard' && (
        <>
          <div className="eval-header">
            <div className="eval-title-group">
              <h1>Kết quả đánh giá mô hình</h1>
              <p>So sánh model gốc, model sau Fine-tuning và các LLM tham khảo trên cùng tập test</p>
            </div>
            <button className="btn-run-eval" onClick={openRunModal} disabled={gpuStatus && !gpuStatus.can_create_eval}>
              <Play size={16} /> Khởi chạy Đánh giá mới
            </button>
          </div>

          {/* Leaderboard Table Controls & Actions */}
          <div className="eval-filters-bar card">
            <div className="filters-left">
              <div className="filter-label">
                <Filter size={16} /> Lọc kết quả:
              </div>
              <input 
                type="text" 
                placeholder="Tên dự án..." 
                className="filter-text-input" 
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
              />
              <select 
                className="filter-select"
                value={filterJudge}
                onChange={(e) => setFilterJudge(e.target.value)}
              >
                <option value="">Tất cả Judge Models</option>
                <option value="claude">Claude Judge</option>
                <option value="gpt">GPT Judge</option>
                <option value="gemini">Gemini Judge</option>
              </select>
              <button 
                className="btn-outline-eval" 
                onClick={fetchLeaderboard}
                title="Tải lại bảng xếp hạng"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {selectedCompareIds.length > 0 && (
                <button
                  className="btn-compare-action"
                  onClick={handleStartComparison}
                  disabled={selectedCompareIds.length !== 2}
                >
                  <Maximize2 size={16} /> So sánh chéo ({selectedCompareIds.length}/2)
                </button>
              )}
              <button className="btn-outline-eval" onClick={handleExportCSV}>
                <Download size={16} /> Xuất file CSV
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="eval-table-container card">
            {loadingLeaderboard ? (
              <div className="table-placeholder">
                <RefreshCw className="animate-spin text-primary" size={24} />
                <span>Đang tải bảng xếp hạng...</span>
              </div>
            ) : filteredLeaderboard.length === 0 ? (
              <div className="eval-empty-card py-12 text-center">
                <div className="empty-icon-wrapper mb-4">
                  <ChartIcon size={48} className="text-muted" />
                </div>
                <h3>Chưa có dữ liệu đánh giá mô hình</h3>
                <p className="text-muted text-sm max-w-md mx-auto mb-6">
                  Bạn cần chạy đánh giá trên các đợt huấn luyện đã hoàn thành bằng cách nhấp vào nút "Khởi chạy Đánh giá mới" ở góc trên bên phải.
                </p>
                <button className="btn-run-eval mx-auto" onClick={openRunModal} disabled={gpuStatus && !gpuStatus.can_create_eval}>
                  <Play size={16} /> Khởi chạy Đánh giá ngay
                </button>
              </div>
            ) : (
              <>
              <div className="leaderboard-score-guide">
                <strong>Đọc điểm:</strong>
                <span><b>K</b> = chính xác kiến thức</span>
                <span><b>S</b> = hành vi Socratic (A1–A3)</span>
                <span><b>C</b> = chỉ số phụ về xử lý, mạch lạc, tông giọng</span>
                <span>Không xếp hạng bằng Legacy Overall</span>
              </div>
              <table className="eval-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">So sánh</th>
                    <th title="Chỉ là số thứ tự; điểm kiến thức và khả năng gợi mở không được gộp thành một hạng duy nhất">STT</th>
                    <th>Dự án (Project)</th>
                    <th>Trạng thái eval</th>
                    <th>Mô hình gốc (Base)</th>
                    <th className="text-center" title="B1: độ chính xác kiến thức, thang 0–5">Đúng kiến thức (K)</th>
                    <th className="text-center" title="Trung bình A1, A2, A3; thang 0–5">Gợi mở Socratic (S)</th>
                    <th className="text-center" title="Chỉ số phụ C1, C2, C3; không phải khả năng gợi mở Socratic">Sư phạm phụ (C*)</th>
                    <th className="text-center">Trễ trung bình</th>
                    <th>Judge Model</th>
                    <th>Thời điểm</th>
                    <th className="text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((row, index) => {
                    const isPinned = row.modelEvalId === row.pinnedEvalId;
                    const isCompleted = row.status === 'COMPLETED';
                    const isFailed = row.status === 'FAILED';
                    const isRunning = ['PENDING', 'RUNNING', 'EVALUATING'].includes(row.status);
                    const isChecked = selectedCompareIds.includes(row.modelEvalId || '');
                    const failureMessage = row.error || row.latestAttemptError || 'GPU worker báo evaluation thất bại nhưng lần chạy cũ chưa lưu chi tiết lỗi.';
                    const newestAttemptFailed = row.latestAttemptStatus === 'FAILED' && row.latestAttemptId !== row.modelEvalId;
                    return (
                      <tr
                        key={row.modelEvalId || index}
                        className={`${isPinned ? 'pinned-row' : ''} ${isCompleted && row.modelEvalId ? 'detail-openable-row' : ''}`}
                        onClick={() => isCompleted && row.modelEvalId && handleViewDetails(row.modelEvalId)}
                      >
                        <td className="checkbox-cell" onClick={(e) => isCompleted && row.modelEvalId && handleSelectCompare(e, row.modelEvalId)}>
                          <div className={`styled-checkbox ${isChecked ? 'checked' : ''} ${!isCompleted || !row.modelEvalId ? 'disabled' : ''}`}>
                            {isChecked && <Check size={10} strokeWidth={3} />}
                          </div>
                        </td>
                        <td className="col-rank">
                          <span className="rank-number">{index + 1}</span>
                        </td>
                        <td className="col-model">
                          <div className="model-name-wrapper">
                            <span className="model-name">{row.projectName}</span>
                            {isPinned && <span className="pinned-badge" title="Mô hình chính thức"><Star size={10} fill="currentColor" /> Official</span>}
                          </div>
                          <div className="model-meta">
                            <span className="version-tag">{row.modelEvalId?.slice(0, 12)}</span>
                             {row.flags.map(f => (
                               <span key={f} className="flag-tag danger" title="Cờ cảnh báo chất lượng">{f}</span>
                             ))}
                            {newestAttemptFailed && (
                              <span className="flag-tag danger" title={row.latestAttemptError || 'Lần eval mới nhất thất bại'}>Lần mới nhất FAILED</span>
                            )}
                           </div>
                           {isFailed && <div className="text-danger text-xs" title={failureMessage}>{failureMessage}</div>}
                           {isRunning && <div className="text-primary text-xs">Evaluation đang chạy — mở bảng tiến trình để theo dõi.</div>}
                         </td>
                        <td>
                          <span
                            className={`flag-tag ${isFailed ? 'danger' : ''}`}
                            title={isCompleted ? 'Đã hoàn thành' : isRunning ? 'Evaluation đang chạy' : failureMessage}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="text-muted text-sm">{row.baseModel}</td>
                        <td className="text-center font-bold text-primary">{row.scores.knowledge?.toFixed(2) ?? '—'}</td>
                        <td className="text-center font-bold text-main">{row.scores.socratic?.toFixed(2) ?? '—'}</td>
                        <td className="text-center font-medium" title="Diagnostic only: 0.4×C1 + 0.4×C2 + 0.2×C3">{row.scores.group_c?.toFixed(2) ?? '—'}</td>
                        <td className="text-center font-medium text-muted">
                          {row.scores.avg_latency_ms ? `${(row.scores.avg_latency_ms / 1000).toFixed(1)}s` : '-'}
                        </td>
                        <td className="text-sm font-mono">{row.judgeModel || 'claude-3-5'}</td>
                        <td className="text-muted text-sm flex-center gap-1">
                          <Calendar size={14}/> {row.completedAt ? new Date(row.completedAt).toLocaleDateString('vi-VN') : '-'}
                        </td>
                        <td className="col-actions text-right">
                          {row.modelEvalId && (
                            <>
                              {isCompleted && (
                                <>
                                  <button
                                    className="btn-icon"
                                    title="Xem chi tiết kết quả"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleViewDetails(row.modelEvalId!);
                                    }}
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button
                                    className={`btn-icon ${isPinned ? 'active' : ''}`}
                                    title={isPinned ? 'Bỏ ghim kết quả chính thức' : 'Ghim làm kết quả chính thức của dự án'}
                                    onClick={(e) => handlePin(e, row.modelEvalId!, isPinned)}
                                  >
                                    <Pin size={16} />
                                  </button>
                                </>
                              )}
                              <button 
                                className="btn-icon text-danger" 
                                title="Xóa bản đánh giá"
                                onClick={(e) => handleDelete(e, row.modelEvalId!)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </div>
        </>
      )}

      {/* 2. EVALUATION DETAIL SCREEN */}
      {viewMode === 'detail' && selectedEvalId && (
        <div className="eval-detail-view card">
          {/* Back Header */}
          <div className="detail-back-header">
            <button className="btn-back" onClick={() => setViewMode('leaderboard')}>
              <ArrowLeft size={16} /> Quay lại Leaderboard
            </button>
            <div className="detail-header-actions">
              <button className="btn-outline-eval" onClick={handleExportArtifact} disabled={!evaluationDetail}>
                <Download size={14} /> Táº£i artifact RP5 (JSON)
              </button>
              <button className="btn-outline-eval" onClick={fetchLeaderboard}>
                <RefreshCw size={14} /> Tải lại dữ liệu
              </button>
            </div>
          </div>

          {loadingDetail ? (
            <div className="detail-loading-box">
              <RefreshCw className="animate-spin text-primary mr-2" size={20} />
              Đang tải chi tiết kết quả đánh giá...
            </div>
          ) : detailLoadError ? (
            <div className="detail-load-error">
              <AlertCircle size={22} />
              <div><strong>Không mở được chi tiết</strong><p>{detailLoadError}</p></div>
              <button className="btn-outline-eval" onClick={() => selectedEvalId && handleViewDetails(selectedEvalId)}><RefreshCw size={14} /> Thử lại</button>
            </div>
          ) : !evaluationDetail ? (
            <div className="detail-load-error">
              <AlertCircle size={22} />
              <div><strong>Không có dữ liệu chi tiết</strong><p>Hãy quay lại leaderboard và chọn một lần đánh giá khác.</p></div>
            </div>
          ) : (
            <>
              {/* Header card info */}
              <div className="detail-meta-card">
                <div className="meta-left">
                  <div className="meta-project-title">
                    <h2>Chi tiết Đánh giá: {evaluationDetail.projectName}</h2>
                    <span className="eval-id-badge font-mono">{evaluationDetail.modelEvalId}</span>
                  </div>
                  <div className="meta-attributes">
                    <span className="attr-item"><BookOpen size={14} /> Model: <span className="font-semibold text-main">{evaluationDetail.ftModelRepo}</span></span>
                    <span className="attr-item"><ShieldCheck size={14} /> Judge: <span className="font-semibold text-main">{evaluationDetail.judgeModel}</span></span>
                    <span className="attr-item"><Clock size={14} /> Đánh giá lúc: {new Date(evaluationDetail.completedAt).toLocaleString('vi-VN')}</span>
                  </div>
                </div>

                <div className="meta-score-box">
                  <div className="score-label">Hai kết quả chính · thang 0–5</div>
                  <div className="score-val-container">
                    <span className="score-big" title="Độ chính xác kiến thức">Kiến thức: {detailsStats?.knowledge?.toFixed(2)}</span>
                    <span className="score-limit" title="Khả năng giữ đáp án, gợi mở và thích ứng">Gợi mở: {detailsStats?.socratic?.toFixed(2)} / 5</span>
                  </div>
                  <small>Legacy Overall (exploratory): {detailsStats?.exploratoryOverall?.toFixed(2)}</small>
                </div>
              </div>

              <div className={evaluationDetail.confirmatoryEligible ? 'v1-hard-constraint' : 'v1-judge-error'}>
                {evaluationDetail.confirmatoryEligible ? <Check size={17} /> : <AlertCircle size={17} />}
                <span>
                  <strong>{evaluationDetail.confirmatoryEligible ? 'ĐỦ ĐIỀU KIỆN PHÂN TÍCH' : 'KHÔNG ĐỦ ĐIỀU KIỆN KẾT LUẬN'}</strong>
                  {' · '}paired items {evaluationDetail.pairIntegrity?.matched_pairs ?? 0}
                  {' · '}judge {evaluationDetail.pairIntegrity?.effective_judge_models?.join(', ') || evaluationDetail.judgeModel}
                  {' · '}protocol {evaluationDetail.protocolManifest?.protocol_version || 'legacy/unknown'}
                </span>
              </div>

              {detailEvalHistory.length > 0 && (
                <div className="detail-eval-history-strip">
                  <div className="history-strip-header">
                    <div>
                      <h3>Lịch sử eval của job này</h3>
                      <p>Chọn đúng lần eval để xem, pin official hoặc so sánh sau khi chạy modal.</p>
                    </div>
                    <span className="history-count">{detailEvalHistory.length} lần eval</span>
                  </div>
                  <div className="history-strip-list">
                    {detailEvalHistory.map((ev: any) => {
                      const isCurrent = ev.modelEvalId === selectedEvalId;
                      const isPinned = Boolean(ev.isPinned);
                      const isSelected = selectedCompareIds.includes(ev.modelEvalId);
                      return (
                        <div key={ev.modelEvalId} className={`history-eval-chip ${isCurrent ? 'current' : ''} ${isPinned ? 'pinned' : ''}`}>
                          <div className="history-chip-main" onClick={() => !isCurrent && handleViewDetails(ev.modelEvalId)}>
                            <div className="history-chip-title">
                              <span className="font-mono">{ev.modelEvalId.slice(-8)}</span>
                              {isPinned && <span className="pinned-badge"><Star size={10} fill="currentColor" /> Official</span>}
                              {isCurrent && <span className="current-badge">Đang xem</span>}
                            </div>
                            <div className="history-chip-meta">
                              <span>Kiến thức {ev.summary?.knowledge?.toFixed?.(2) ?? '-'} · Gợi mở {ev.summary?.socratic?.toFixed?.(2) ?? '-'} · Legacy {ev.summary?.exploratory_overall?.toFixed?.(2) ?? ev.summary?.overall?.toFixed?.(2) ?? '-'} / 5</span>
                              <span>{ev.totalConversations ?? 0} convs</span>
                              <span>{ev.datasetVersionName || 'dataset file'}</span>
                              <span>{ev.completedAt ? new Date(ev.completedAt).toLocaleDateString('vi-VN') : '-'}</span>
                            </div>
                          </div>
                          <div className="history-chip-actions">
                            <button
                              type="button"
                              className={`mini-action ${isSelected ? 'active' : ''}`}
                              onClick={(e) => handleSelectCompare(e, ev.modelEvalId)}
                              title="Chọn để so sánh"
                            >
                              {isSelected ? 'Bỏ chọn' : 'Compare'}
                            </button>
                            <button
                              type="button"
                              className={`mini-action ${isPinned ? 'active' : ''}`}
                              onClick={(e) => handlePin(e, ev.modelEvalId, isPinned)}
                              title={isPinned ? 'Bỏ pin official' : 'Pin làm official'}
                            >
                              {isPinned ? 'Unpin' : 'Pin'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedCompareIds.length === 2 && (
                    <div className="history-compare-bar">
                      <span>Đã chọn 2 eval để so sánh.</span>
                      <button type="button" className="btn-compare-action" onClick={handleStartComparison}>
                        <Maximize2 size={14} /> So sánh ngay
                      </button>
                    </div>
                  )}
                </div>
              )}

              {evalOverview && (
                <section className="research-primary-card card" aria-label="Kết quả nghiên cứu chính">
                  <div className="research-primary-heading">
                    <div>
                      <span className="research-eyebrow">KẾT QUẢ CHÍNH · PAIRED BASE–FT</span>
                      <h3>Fine-tuning đã thay đổi điều gì?</h3>
                      <p>Hai kết quả dùng để kết luận là độ chính xác kiến thức và khả năng gợi mở Socratic. Các nhóm A–D cũ nằm ở phần tham khảo.</p>
                    </div>
                    <span className={`research-validity-badge ${evaluationDetail.confirmatoryEligible ? 'valid' : 'invalid'}`}>
                      {evaluationDetail.confirmatoryEligible ? 'Đủ điều kiện phân tích' : 'Không đủ điều kiện'}
                    </span>
                  </div>

                  {evalOverview.judgeFailure && (
                    <div className="v1-judge-error"><AlertCircle size={17} /> AI Judge có lỗi; không sử dụng lần chạy này để kết luận.</div>
                  )}

                  <div className="plain-verdict-banner">
                    <div className="verdict-icon"><Sparkles size={20} /></div>
                    <div><span>Kết luận ngắn gọn</span><strong>{plainLanguageVerdict}</strong></div>
                  </div>

                  <div className="outcome-result-grid">
                    {primaryResearchRows.map(row => (
                      <article key={row.metric} className={`outcome-result-card ${row.metric === 'K' ? 'knowledge' : 'socratic'}`}>
                        <header>
                          <div className="outcome-title-wrap">
                            <div className="outcome-icon">{row.metric === 'K' ? <BrainCircuit size={19} /> : <MessageCircleQuestion size={19} />}</div>
                            <div><span>{row.metric === 'K' ? 'KIẾN THỨC' : 'CÁCH DẠY'}</span><h4>{row.label}</h4></div>
                          </div>
                          {row.status !== 'ok'
                            ? <b className="outcome-status neutral">Chưa kiểm định</b>
                            : row.significant
                              ? <b className="outcome-status positive">Cải thiện rõ</b>
                              : <b className="outcome-status neutral">Chưa khác biệt rõ</b>}
                        </header>
                        <div className="score-journey">
                          <div><small>Model gốc</small><strong>{Number(row.base).toFixed(2)}</strong><span>/5</span></div>
                          <ChevronRight size={22} />
                          <div className="fine-tuned"><small>Sau Fine-tuning</small><strong>{Number(row.ft).toFixed(2)}</strong><span>/5</span></div>
                          <div className={`score-delta ${Number(row.delta) >= 0 ? 'up' : 'down'}`}>{Number(row.delta) >= 0 ? '+' : ''}{Number(row.delta).toFixed(2)}</div>
                        </div>
                        <p>{row.metric === 'K'
                          ? 'Điểm này cho biết câu trả lời đúng kiến thức và lập luận đến mức nào.'
                          : 'Điểm này cho biết model có giữ lại đáp án, đặt câu hỏi gợi mở và thích ứng với học sinh hay không.'}</p>
                        <details>
                          <summary>Xem căn cứ thống kê</summary>
                          <div>Khoảng tin cậy 95%: {row.ci.length === 2 ? `[${Number(row.ci[0]).toFixed(3)}, ${Number(row.ci[1]).toFixed(3)}]` : 'chưa tính được'} · {row.p !== null ? `p ${row.p < 0.001 ? '< 0.001' : `= ${row.p.toFixed(3)}`}` : 'chưa có p-value'}</div>
                        </details>
                      </article>
                    ))}
                  </div>

                  <div className="score-definition-grid" aria-label="Chú giải các loại điểm">
                    <div><b>Độ chính xác kiến thức (K)</b><span>Bằng tiêu chí B1: câu trả lời đúng kiến thức đến đâu.</span></div>
                    <div><b>Khả năng gợi mở Socratic (S)</b><span>Trung bình A1–A3: có giữ đáp án, gợi mở và thích ứng hay không.</span></div>
                    <div><b>Pedagogy C*</b><span>Chỉ số phụ về xử lý tình huống, mạch lạc và tông giọng. C=5 không có nghĩa S=5.</span></div>
                    <div><b>Legacy Overall</b><span>Công thức dashboard cũ. Không phải outcome chính và không dùng kết luận model thắng.</span></div>
                  </div>

                  <div className="research-chart-grid">
                    <div className="research-chart-card">
                      <div className="research-chart-heading">
                        <div className="chart-title-with-icon"><BarChart3 size={17} /><div><strong>Kết quả chính: Base và Fine-tuned</strong><small>Cùng thang 0–5 · cao hơn tốt hơn</small></div></div>
                      </div>
                      <div className="research-chart-canvas">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={primaryChartData} margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#475569' }} />
                            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="Base" fill="#94a3b8" radius={[5, 5, 0, 0]} />
                            <Bar dataKey="Fine-tuned" fill="#4f46e5" radius={[5, 5, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="research-chart-card wide">
                      <div className="research-chart-heading">
                        <div className="chart-title-with-icon"><Gauge size={17} /><div><strong>Chi tiết rubric A1–D1</strong><small>Chẩn đoán nguyên nhân; không cộng các cột này thành một “điểm sư phạm” mới</small></div></div>
                      </div>
                      <div className="research-chart-canvas wide">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={criteriaChartData} margin={{ top: 12, right: 16, left: -12, bottom: 55 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="metric" interval={0} angle={-35} textAnchor="end" height={75} tick={{ fontSize: 9.5, fill: '#475569' }} />
                            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="Base" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Fine-tuned" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="research-diagnostic-grid">
                    <div className="research-diagnostic-card danger">
                      <span>A1 hard-constraint violation</span>
                      <strong>Base {evalOverview.baseA1HardViolationCount}/{evaluationDetail.baseResults?.length || 0} · FT {evalOverview.a1HardViolationCount}/{evaluationDetail.results?.length || 0}</strong>
                      <small>FT có {evalOverview.a1ZeroCount} phản hồi A1=0. Hard constraint thực tế dùng A1≤1.</small>
                    </div>
                    <div className="research-diagnostic-card warning">
                      <span>Output chạm giới hạn 512 tokens</span>
                      <strong>Base {Number(evalOverview.baseOutputLimitRate || 0) * 100}% · FT {Number(evalOverview.outputLimitRate || 0) * 100}%</strong>
                      <small>Tỷ lệ cao; cần thận trọng khi diễn giải quality và latency.</small>
                    </div>
                    <div className="research-diagnostic-card info">
                      <span>Human audit</span>
                      <strong>{detailsStats?.totalReviewed || 0}/{evaluationDetail.results?.length || 0} phản hồi đã duyệt</strong>
                      <small>{detailsStats?.agreementRate !== null ? `Agreement ${detailsStats?.agreementRate}%` : 'Chưa có kết quả người chấm.'}</small>
                    </div>
                  </div>

                  <div className="research-reading-note">
                    <ShieldCheck size={18} />
                    <div><strong>Cách đọc:</strong> Kiến thức chỉ được coi là tăng khi khoảng tin cậy không chứa 0. Khả năng gợi mở là trung bình A1–A3. Legacy Overall không quyết định mô hình thắng.</div>
                  </div>
                </section>
              )}

              {/* Tabs selector */}
              <div className="detail-tabs-bar">
                {evaluationDetail.evalMode === 'paired' && (
                  <button 
                    className={`detail-tab-btn ${detailTab === 'paired' ? 'active' : ''}`}
                    onClick={() => setDetailTab('paired')}
                  >
                    Tổng quan
                  </button>
                )}
                <button
                  className={`detail-tab-btn ${detailTab === 'breakdown' ? 'active' : ''}`}
                  onClick={() => setDetailTab('breakdown')}
                >
                  Giải thích từng tiêu chí
                </button>
                <button
                  className={`detail-tab-btn ${detailTab === 'large-llm' ? 'active' : ''}`}
                  onClick={() => setDetailTab('large-llm')}
                >
                  So sánh với LLM lớn
                </button>
                <button 
                  className={`detail-tab-btn ${detailTab === 'samples' ? 'active' : ''}`}
                  onClick={() => setDetailTab('samples')}
                >
                  Xem {evaluationDetail.results?.length || 0} câu trả lời
                </button>
              </div>

              {/* Tab views contents */}
              
              {/* TAB 1: BREAKDOWN */}
              {detailTab === 'breakdown' && (
                <div className="tab-content-breakdown">
                  <div className="legacy-metrics-note">
                    <AlertCircle size={18} />
                    <div><strong>Chỉ số tham khảo, không dùng chọn mô hình thắng.</strong> Group A–D và Legacy Overall thuộc công thức dashboard cũ; “Độ chính xác kiến thức” và “Khả năng gợi mở Socratic” ở bảng trên mới là kết quả nghiên cứu chính.</div>
                  </div>
                  <div className="rubric-groups-grid">
                    {/* Group A */}
                    <div className="rubric-group-card card">
                      <div className="group-card-header bg-emerald">
                        <h4>LEGACY A: SOCRATIC WEIGHTED & CAPPED</h4>
                        <span className="group-score-badge">{evaluationDetail.summary?.group_a?.toFixed(2)} / 5</span>
                      </div>
                      <div className="group-card-body">
                        <div className="criteria-item-row">
                          <span className="crit-code text-emerald bg-emerald-light">A1</span>
                          <div className="crit-detail">
                            <span className="crit-name">Không đưa đáp án trực tiếp</span>
                            <span className="crit-desc">Dẫn dắt học sinh tự suy luận thay vì tiết lộ đáp án ngay.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.A1?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-emerald bg-emerald-light">A2</span>
                          <div className="crit-detail">
                            <span className="crit-name">Chất lượng gợi mở</span>
                            <span className="crit-desc">Câu hỏi dẫn dắt cụ thể, bám sát nội dung và từng bước.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.A2?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-emerald bg-emerald-light">A3</span>
                          <div className="crit-detail">
                            <span className="crit-name">Phản hồi thích ứng</span>
                            <span className="crit-desc">Phản hồi phù hợp với câu trả lời và ngữ cảnh của học sinh.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.A3?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Group B */}
                    <div className="rubric-group-card card">
                      <div className="group-card-header bg-blue">
                        <h4>LEGACY B: ĐỘ CHÍNH XÁC CÓ TRỌNG SỐ</h4>
                        <span className="group-score-badge">{evaluationDetail.summary?.group_b?.toFixed(2)} / 5</span>
                      </div>
                      <div className="group-card-body">
                        <div className="criteria-item-row">
                          <span className="crit-code text-blue bg-blue-light">B1</span>
                          <div className="crit-detail">
                            <span className="crit-name">Độ chính xác kiến thức</span>
                            <span className="crit-desc">Phát biểu khoa học và lập luận không gây hiểu sai cho học sinh.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.B1?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-blue bg-blue-light">B2</span>
                          <div className="crit-detail">
                            <span className="crit-name">Phù hợp trình độ</span>
                            <span className="crit-desc">Ngôn ngữ, ví dụ và độ khó phù hợp với học sinh mục tiêu.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.B2?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Group C */}
                    <div className="rubric-group-card card">
                      <div className="group-card-header bg-purple">
                        <h4>LEGACY C: CHẤT LƯỢNG SƯ PHẠM</h4>
                        <span className="group-score-badge">{evaluationDetail.summary?.group_c?.toFixed(2)} / 5</span>
                      </div>
                      <div className="group-card-body">
                        <div className="criteria-item-row">
                          <span className="crit-code text-purple bg-purple-light">C1</span>
                          <div className="crit-detail">
                            <span className="crit-name">Xử lý tình huống</span>
                            <span className="crit-desc">Xử lý input mơ hồ hoặc lạc đề và đưa cuộc hội thoại về đúng hướng.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.C1?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-purple bg-purple-light">C2</span>
                          <div className="crit-detail">
                            <span className="crit-name">Mạch lạc phản hồi (single-turn)</span>
                            <span className="crit-desc">Chỉ phản ánh độ mạch lạc của một phản hồi; không dùng để kết luận khả năng nhớ hội thoại nhiều lượt.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.C2?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-purple bg-purple-light">C3</span>
                          <div className="crit-detail">
                            <span className="crit-name">Tông giọng và động viên</span>
                            <span className="crit-desc">Tạo môi trường học tập tích cực, thân thiện và không phán xét.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.C3?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Group D */}
                    <div className="rubric-group-card card">
                      <div className="group-card-header bg-amber">
                        <h4>LEGACY D: FACTUALITY + LATENCY</h4>
                        <span className="group-score-badge">{evaluationDetail.summary?.group_d?.toFixed(2)} / 5</span>
                      </div>
                      <div className="group-card-body">
                        <div className="criteria-item-row">
                          <span className="crit-code text-amber bg-amber-light">D1</span>
                          <div className="crit-detail">
                            <span className="crit-name">Không bịa đặt (Hallucination)</span>
                            <span className="crit-desc">Không bịa context, thông tin khoa học hoặc câu trả lời của học sinh.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.D1?.toFixed(2)}</span>
                        </div>
                        <div className="criteria-item-row">
                          <span className="crit-code text-amber bg-amber-light">D2</span>
                          <div className="crit-detail">
                            <span className="crit-name">Latency proxy (không phải quality)</span>
                            <span className="crit-desc">Điểm quy đổi vận hành của dashboard cũ. Báo cáo nghiên cứu phải dùng trực tiếp TTFT, E2E, TPOT và throughput.</span>
                          </div>
                          <span className="crit-score">{evaluationDetail.summary?.criteria?.D2?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PAIRED DELTA */}
              {detailTab === 'paired' && evaluationDetail.evalMode === 'paired' && (
                <div className="tab-content-paired">
                  <div className="comparison-overall-intro">
                    <p><strong>Bảng vận hành trên đúng 50 câu paired.</strong> Kết luận chất lượng nằm ở bảng “Độ chính xác kiến thức” và “Khả năng gợi mở” phía trên; bảng này trả lời mô hình nào nhanh hơn, ổn định hơn và có thường bị cắt đầu ra hay không.</p>
                  </div>
                  <table className="comparison-score-table">
                    <thead>
                      <tr>
                        <th>Chỉ số vận hành</th>
                        <th className="text-center">Base Model</th>
                        <th className="text-center">Fine-tuned Model</th>
                        <th className="text-right">Biến động (Delta)</th>
                        <th className="text-center">Cách đọc</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-semibold text-muted">E2E mean (ms)</td>
                        <td className="text-center text-muted">{evaluationDetail.baseSummary?.avg_latency_ms?.toFixed(0)} ms</td>
                        <td className="text-center font-semibold text-main">{evaluationDetail.summary?.avg_latency_ms?.toFixed(0)} ms</td>
                        <td className={`text-right font-semibold ${evaluationDetail.delta?.avg_latency_ms <= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.avg_latency_ms > 0 ? `+${evaluationDetail.delta?.avg_latency_ms} ms` : `${evaluationDetail.delta?.avg_latency_ms} ms`}
                        </td>
                        <td className="text-center">
                          {evaluationDetail.delta?.avg_latency_ms < 0 ? (
                            <span className="badge-comparison win">FT có E2E mean thấp hơn</span>
                          ) : (
                            <span className="badge-comparison lose">Base có E2E mean thấp hơn</span>
                          )}
                        </td>
                      </tr>
                      {operationalComparisonRows.map((row) => {
                        const baseValue = Number(row.base);
                        const ftValue = Number(row.ft);
                        const format = (value: number) => Number.isFinite(value)
                          ? row.percent ? `${(value * 100).toFixed(2)}%` : value.toFixed(2)
                          : '—';
                        return (
                          <tr key={row.label}>
                            <td className="font-semibold text-muted pl-4">{row.label}</td>
                            <td className="text-center text-muted">{format(baseValue)}</td>
                            <td className="text-center font-semibold text-main">{format(ftValue)}</td>
                            <td className="text-right font-semibold">
                              {Number.isFinite(baseValue) && Number.isFinite(ftValue)
                                ? format(ftValue - baseValue)
                                : '—'}
                            </td>
                            <td className="text-center text-muted text-xs">
                              {row.label.includes('Throughput') ? 'Cao hơn là tốt hơn'
                                : row.label.includes('Failure') || row.label.includes('Output-limit') || row.label.includes('TTFT') || row.label.includes('E2E') || row.label.includes('TPOT')
                                  ? 'Thấp hơn là tốt hơn'
                                  : 'Báo cáo mô tả'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: LARGE LLM CONTEXTUAL REFERENCE */}
              {detailTab === 'large-llm' && (
                <div className="large-llm-reference">
                  <div className="contextual-reference-banner">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>So sánh bối cảnh — không phải đối chứng nhân quả</strong>
                      <p>LLM lớn giúp đặt kết quả của mô hình local vào mặt bằng chung. Không dùng chênh lệch này để kết luận fine-tuning có hiệu quả; kết luận đó chỉ đến từ cặp Base–FT phía trên.</p>
                    </div>
                  </div>

                  <div className="large-llm-run-card card">
                    <div className="large-llm-run-heading">
                      <div>
                        <strong>So sánh với LLM lớn</strong>
                        <p>Chọn model và tập test đã dùng cho Base–Fine-tuned. Hệ thống tự chạy, chấm và điền kết quả vào bảng.</p>
                      </div>
                      <span>Không cần dùng dòng lệnh</span>
                    </div>

                    <div className="large-llm-picker">
                      <div className="large-llm-picker-title">
                        <div className="step-title-icon"><Search size={17} /><div><b>1. Chọn tối đa hai mô hình</b><small>Nhấn trực tiếp vào thẻ. Không cần biết model ID.</small></div></div>
                        <span>{selectedLargeLlmModels.filter(Boolean).length}/2 đã chọn</span>
                      </div>
                      <input className="large-llm-search" value={largeLlmSearch} onChange={(event) => setLargeLlmSearch(event.target.value)} placeholder="Tìm theo tên, ví dụ: GPT, Gemini, Claude..." />
                      <div className="large-llm-model-grid">
                        {visibleLargeLlmModels.map(model => {
                          const selected = selectedLargeLlmModels.includes(model.id);
                          return (
                            <button
                              type="button"
                              key={model.id}
                              className={`large-llm-model-card ${selected ? 'selected' : ''}`}
                              onClick={() => setSelectedLargeLlmModels(previous => selected
                                ? previous.filter(id => id !== model.id)
                                : previous.filter(Boolean).length < 2 ? [...previous.filter(Boolean), model.id] : previous)}
                            >
                              <span className="model-provider">{String(model.id).split('/')[0]}</span>
                              <strong>{model.name}</strong>
                              <small>{Number(model.contextLength || 0).toLocaleString()} token context</small>
                              <i>{selected ? <><CheckCircle2 size={12} /> Đã chọn</> : 'Chọn model'}</i>
                            </button>
                          );
                        })}
                        {!largeLlmCatalog.length && <div className="large-llm-catalog-empty"><RefreshCw size={17} className="animate-spin" /> Đang tải danh sách model...</div>}
                        {largeLlmCatalog.length > 0 && !visibleLargeLlmModels.length && <div className="large-llm-catalog-empty">Không tìm thấy model phù hợp.</div>}
                      </div>
                    </div>

                    <div className="large-llm-dataset-step">
                      <div className="step-title-icon"><Database size={17} /><div><b>2. Xác nhận tập test</b><small>Phải là đúng file đã dùng khi so sánh Base và Fine-tuned.</small></div></div>
                      <label className="large-llm-test-picker">
                        <div><Upload size={15} /> {largeLlmTestFile?.name || 'Chọn file locked-test ZIP/JSON'}</div>
                        <input type="file" accept=".zip,.json,.jsonl,application/zip,application/json" onChange={(event) => setLargeLlmTestFile(event.target.files?.[0] || null)} />
                      </label>
                    </div>

                    <button className="btn-run-large-llm" type="button" onClick={handleRunLargeLlmFromUi} disabled={startingLargeLlmRun || !largeLlmTestFile || !selectedLargeLlmModels.some(Boolean)}>
                      {startingLargeLlmRun ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                      {startingLargeLlmRun ? 'Đang khởi tạo...' : '3. Bắt đầu chạy và chấm điểm'}
                    </button>

                    {Object.entries(largeLlmRuns).length > 0 && (
                      <div className="large-llm-progress-list">
                        {Object.entries(largeLlmRuns).map(([model, run]: any) => (
                          <div key={model} className={`large-llm-progress ${String(run.status).toLowerCase()}`}>
                            <div><strong>{model}</strong><span>{run.status} · {run.detail}</span></div>
                            <div className="large-llm-progress-track"><span style={{ width: `${Number(run.progress || 0)}%` }} /></div>
                            <b>{Number(run.progress || 0)}%</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {largeLlmReferences.length > 0 && (
                    <div className="large-llm-validity-grid">
                      {largeLlmReferences.map((item) => (
                        <div key={item.model} className={`large-llm-validity ${item.protocolMatch ? 'valid' : 'warning'}`}>
                          <div><strong>{item.model}</strong><small>Judge: {item.judgeModel} · {item.valid}/{item.total} mẫu hợp lệ</small></div>
                          <span>{item.protocolMatch ? 'Cùng protocol' : item.protocolNotes.join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="large-llm-table-wrap card">
                    <table className="large-llm-table">
                      <thead>
                        <tr>
                          <th>Chỉ số cùng protocol</th>
                          <th>Base local</th>
                          <th>Fine-tuned local</th>
                          {[0, 1].map((index) => <th key={index}>{largeLlmReferences[index]?.model || `Large LLM ${index + 1}`}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {largeLlmComparisonRows.map((row) => (
                          <tr key={row.label}>
                            <td><strong>{row.label}</strong><small className="metric-help">{row.help}</small></td>
                            <td>{row.base}</td>
                            <td><strong>{row.ft}</strong></td>
                            {[0, 1].map((index) => {
                              const reference = largeLlmReferences[index];
                              return reference
                                ? <td key={index}>{row.ref(reference)}</td>
                                : <td key={index} className="empty-reference-cell">Chưa chạy</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details className="large-llm-advanced-import">
                    <summary>Đã có artifact JSON từ trước?</summary>
                    <label className="large-llm-upload-btn">
                      <Upload size={16} /> Nhập artifact có sẵn
                      <input type="file" accept="application/json,.json" multiple onChange={(event) => handleImportLargeLlmArtifacts(event.target.files)} />
                    </label>
                  </details>
                </div>
              )}

              {/* TAB 4: CONVERSATION SAMPLES */}
              {detailTab === 'samples' && (
                <div className="tab-content-samples">
                  <div className="samples-list-header mb-4">
                    <p className="text-sm text-muted">Click chuột vào bất kỳ lượt hội thoại nào bên dưới để mở giao diện thẩm định (Audit Panel) đối chiếu replay và điểm AI Judge.</p>
                  </div>
                  <div className="samples-table-wrapper card">
                    <table className="samples-table">
                      <thead>
                        <tr>
                          <th>Mã chỉ số</th>
                          <th>Câu hỏi học sinh (Lượt đầu)</th>
                          <th className="text-center">Số lượt chat</th>
                          <th className="text-center">Trễ TB</th>
                          <th className="text-center" title="B1: câu trả lời đúng kiến thức đến đâu">Đúng kiến thức (K)</th>
                          <th className="text-center" title="Trung bình A1–A3: khả năng giữ đáp án và gợi mở học sinh">Gợi mở Socratic (S)</th>
                          <th className="text-center">Thẩm định thủ công</th>
                          <th className="text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evaluationDetail.results?.map((row: any, idx: number) => {
                          const isReviewed = !!row.human_review;
                          return (
                            <tr 
                              key={row.conv_index || idx} 
                              className={`sample-row-item ${isReviewed ? 'reviewed' : ''}`}
                              onClick={() => handleOpenAudit(row.conv_index)}
                            >
                              <td className="font-mono text-xs font-semibold text-primary">{row.item_id || `Conv #${row.conv_index}`}</td>
                              <td className="sample-instruction-preview">
                                {row.replay_turns?.[0]?.user || 'Không có dữ liệu lượt thoại'}
                              </td>
                              <td className="text-center font-medium">{row.num_turns}</td>
                              <td className="text-center text-muted">{(row.avg_latency_ms / 1000).toFixed(1)}s</td>
                              <td className="text-center font-bold text-primary">{row.group_scores?.knowledge?.toFixed(1) ?? row.criteria_scores?.B1?.toFixed?.(1) ?? '-'}</td>
                              <td className="text-center font-bold text-main">{row.group_scores?.socratic?.toFixed(1) ?? '-'}</td>
                              <td className="text-center">{getAuditVerdictBadge(row.human_review?.verdict)}</td>
                              <td className="text-right text-primary font-semibold text-xs">
                                Thẩm định &rarr;
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 3. EVALUATION COMPARISON SCREEN */}
      {viewMode === 'compare' && (
        <div className="eval-compare-view card">
          <div className="detail-back-header">
            <button className="btn-back" onClick={() => setViewMode('leaderboard')}>
              <ArrowLeft size={16} /> Quay lại Leaderboard
            </button>
          </div>

          {loadingCompare || !compareData ? (
            <div className="detail-loading-box">
              <RefreshCw className="animate-spin text-primary mr-2" size={20} />
              Đang tính toán dữ liệu đối chiếu chéo...
            </div>
          ) : (
            <>
              {/* Models meta header */}
              <div className="compare-models-header">
                <div className="compare-model-box run-a">
                  <span className="model-label">RUN A</span>
                  <h3>{compareData.runA?.projectName}</h3>
                  <span className="font-mono text-xs text-muted">{compareData.runA?.modelEvalId}</span>
                  <div className="text-xs mt-2 text-muted"><ShieldCheck size={12} className="inline mr-1" /> Judge: {compareData.runA?.judgeModel}</div>
                </div>
                <div className="compare-vs-badge">VS</div>
                <div className="compare-model-box run-b">
                  <span className="model-label text-primary">RUN B</span>
                  <h3>{compareData.runB?.projectName}</h3>
                  <span className="font-mono text-xs text-primary">{compareData.runB?.modelEvalId}</span>
                  <div className="text-xs mt-2 text-muted"><ShieldCheck size={12} className="inline mr-1" /> Judge: {compareData.runB?.judgeModel}</div>
                </div>
              </div>

              {/* Highlight Note if different test datasets used */}
              {compareData.differentTestSetsNote && (
                <div className="different-sets-alert card">
                  <AlertCircle size={18} />
                  <span><strong>Cảnh báo:</strong> Hai đợt đánh giá sử dụng tập dữ liệu có kích thước khác nhau ({compareData.runA?.totalConversations} vs {compareData.runB?.totalConversations} samples). Chỉ đối chiếu các hội thoại có chung chỉ số.</span>
                </div>
              )}

              {/* Scores Grid Comparison */}
              <div className="compare-scores-grid">
                <h3>Bảng đối chiếu điểm số chi tiết các Nhóm (Run A vs Run B)</h3>
                <table className="comparison-score-table">
                  <thead>
                    <tr>
                      <th>Hạng mục tiêu chí</th>
                      <th className="text-center">Run A</th>
                      <th className="text-center">Run B</th>
                      <th className="text-right">Chênh lệch (B - A)</th>
                      <th className="text-center">Mô hình Thắng</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="primary-outcome-row">
                      <td>Độ chính xác kiến thức (K = B1)</td>
                      <td className="text-center font-bold">{compareData.scoreSummary?.knowledge?.a?.toFixed(3)}</td>
                      <td className="text-center font-bold text-primary">{compareData.scoreSummary?.knowledge?.b?.toFixed(3)}</td>
                      <td className={`text-right font-bold ${compareData.scoreSummary?.knowledge?.b - compareData.scoreSummary?.knowledge?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.knowledge?.b - compareData.scoreSummary?.knowledge?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.knowledge?.b - compareData.scoreSummary?.knowledge?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">{compareData.scoreSummary?.knowledge?.winner || '—'}</td>
                    </tr>
                    <tr className="primary-outcome-row">
                      <td>Khả năng gợi mở Socratic (S = trung bình A1–A3)</td>
                      <td className="text-center font-bold">{compareData.scoreSummary?.socratic?.a?.toFixed(3)}</td>
                      <td className="text-center font-bold text-primary">{compareData.scoreSummary?.socratic?.b?.toFixed(3)}</td>
                      <td className={`text-right font-bold ${compareData.scoreSummary?.socratic?.b - compareData.scoreSummary?.socratic?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.socratic?.b - compareData.scoreSummary?.socratic?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.socratic?.b - compareData.scoreSummary?.socratic?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">{compareData.scoreSummary?.socratic?.winner || '—'}</td>
                    </tr>
                    {/* Historical composite: display only, never select a winner. */}
                    <tr className="overall-comp-row">
                      <td>Legacy Overall <small>(tham khảo; không phải điểm tổng kết)</small></td>
                      <td className="text-center font-bold">{compareData.scoreSummary?.overall?.a?.toFixed(3) ?? '—'}</td>
                      <td className="text-center font-bold text-primary">{compareData.scoreSummary?.overall?.b?.toFixed(3) ?? '—'}</td>
                      <td className={`text-right font-bold ${compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">
                        <span className="result-chip neutral">Không dùng chọn model</span>
                      </td>
                    </tr>
                    {/* Group A */}
                    <tr>
                      <td className="pl-4">Nhóm A: Socratic Compliance</td>
                      <td className="text-center">{compareData.scoreSummary?.group_a?.a?.toFixed(2)}</td>
                      <td className="text-center font-semibold">{compareData.scoreSummary?.group_a?.b?.toFixed(2)}</td>
                      <td className={`text-right ${compareData.scoreSummary?.group_a?.b - compareData.scoreSummary?.group_a?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.group_a?.b - compareData.scoreSummary?.group_a?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.group_a?.b - compareData.scoreSummary?.group_a?.a)?.toFixed(2)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.group_a?.winner === 'b' ? 'win' : compareData.scoreSummary?.group_a?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.group_a?.winner === 'b' ? 'Run B' : compareData.scoreSummary?.group_a?.winner === 'a' ? 'Run A' : 'Hòa'}
                        </span>
                      </td>
                    </tr>
                    {/* Group B */}
                    <tr>
                      <td className="pl-4">Nhóm B: Độ chính xác</td>
                      <td className="text-center">{compareData.scoreSummary?.group_b?.a?.toFixed(2)}</td>
                      <td className="text-center font-semibold">{compareData.scoreSummary?.group_b?.b?.toFixed(2)}</td>
                      <td className={`text-right ${compareData.scoreSummary?.group_b?.b - compareData.scoreSummary?.group_b?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.group_b?.b - compareData.scoreSummary?.group_b?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.group_b?.b - compareData.scoreSummary?.group_b?.a)?.toFixed(2)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.group_b?.winner === 'b' ? 'win' : compareData.scoreSummary?.group_b?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.group_b?.winner === 'b' ? 'Run B' : compareData.scoreSummary?.group_b?.winner === 'a' ? 'Run A' : 'Hòa'}
                        </span>
                      </td>
                    </tr>
                    {/* Group C */}
                    <tr>
                      <td className="pl-4">Nhóm C: Chất lượng sư phạm</td>
                      <td className="text-center">{compareData.scoreSummary?.group_c?.a?.toFixed(2)}</td>
                      <td className="text-center font-semibold">{compareData.scoreSummary?.group_c?.b?.toFixed(2)}</td>
                      <td className={`text-right ${compareData.scoreSummary?.group_c?.b - compareData.scoreSummary?.group_c?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.group_c?.b - compareData.scoreSummary?.group_c?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.group_c?.b - compareData.scoreSummary?.group_c?.a)?.toFixed(2)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.group_c?.winner === 'b' ? 'win' : compareData.scoreSummary?.group_c?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.group_c?.winner === 'b' ? 'Run B' : compareData.scoreSummary?.group_c?.winner === 'a' ? 'Run A' : 'Hòa'}
                        </span>
                      </td>
                    </tr>
                    {/* BLEU */}
                    <tr>
                      <td className="pl-4">Chỉ số BLEU (N-gram)</td>
                      <td className="text-center">{compareData.scoreSummary?.bleu?.a?.toFixed(3)}</td>
                      <td className="text-center font-semibold">{compareData.scoreSummary?.bleu?.b?.toFixed(3)}</td>
                      <td className={`text-right ${compareData.scoreSummary?.bleu?.b - compareData.scoreSummary?.bleu?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.bleu?.b - compareData.scoreSummary?.bleu?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.bleu?.b - compareData.scoreSummary?.bleu?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.bleu?.winner === 'b' ? 'win' : compareData.scoreSummary?.bleu?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.bleu?.winner === 'b' ? 'Run B' : compareData.scoreSummary?.bleu?.winner === 'a' ? 'Run A' : 'Hòa'}
                        </span>
                      </td>
                    </tr>
                    {/* ROUGE-L */}
                    <tr>
                      <td className="pl-4">Chỉ số ROUGE-L (LCS)</td>
                      <td className="text-center">{compareData.scoreSummary?.rouge_l?.a?.toFixed(3)}</td>
                      <td className="text-center font-semibold">{compareData.scoreSummary?.rouge_l?.b?.toFixed(3)}</td>
                      <td className={`text-right ${compareData.scoreSummary?.rouge_l?.b - compareData.scoreSummary?.rouge_l?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.rouge_l?.b - compareData.scoreSummary?.rouge_l?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.rouge_l?.b - compareData.scoreSummary?.rouge_l?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.rouge_l?.winner === 'b' ? 'win' : compareData.scoreSummary?.rouge_l?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.rouge_l?.winner === 'b' ? 'Run B' : compareData.scoreSummary?.rouge_l?.winner === 'a' ? 'Run A' : 'Hòa'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Matched Conversations List for side-by-side inspect */}
              <div className="matched-samples-section mt-6">
                <h3>Các hội thoại kiểm thử chung (Matched Conversations)</h3>
                <p className="text-sm text-muted mb-3">Tìm thấy {compareData.matchedCount} hội thoại chung. Xem chênh lệch điểm để phân tích kỹ lý do logic.</p>
                <div className="samples-table-wrapper card">
                  <table className="samples-table">
                    <thead>
                      <tr>
                        <th>Chỉ số</th>
                        <th className="text-center">Số lượt chat A</th>
                        <th className="text-center">Số lượt chat B</th>
                        <th className="text-center">K · Run A → B</th>
                        <th className="text-center">S · Run A → B</th>
                        <th className="text-right">Delta S</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.matchedSamples?.map((sample: any) => (
                        <tr key={sample.conv_index} className="sample-compare-row">
                          <td className="font-mono text-xs font-semibold text-primary">Conv #{sample.conv_index}</td>
                          <td className="text-center">{sample.num_turns_a}</td>
                          <td className="text-center">{sample.num_turns_b}</td>
                          <td className="text-center font-semibold">{sample.knowledge_a?.toFixed(1)} → <b>{sample.knowledge_b?.toFixed(1)}</b></td>
                          <td className="text-center font-semibold text-primary">{sample.socratic_a?.toFixed(1)} → <b>{sample.socratic_b?.toFixed(1)}</b></td>
                          <td className={`text-right font-bold ${sample.delta_socratic >= 0 ? 'text-success' : 'text-danger'}`}>
                            {sample.delta_socratic >= 0 ? `+${sample.delta_socratic.toFixed(1)}` : sample.delta_socratic.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 4. DIALOG: RUN EVALUATION MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <form className="modal-container" onSubmit={handleStartEvaluation}>
            <div className="modal-header">
              <div>
                <h2>Khởi tạo Đánh giá Mô hình</h2>
                <p>Thiết lập và chạy job chấm điểm Socratic bằng AI Judge</p>
              </div>
            </div>
            
            <div className="modal-body">
              {loadingModalData ? (
                <div className="text-center py-8 text-muted">
                  <RefreshCw className="animate-spin text-primary mx-auto mb-2" size={24} />
                  Đang tải danh sách jobs & datasets...
                </div>
              ) : (
                <>
                  {/* Select fine-tuned model (completed jobs) */}
                  <div className="form-group">
                    <label>Chọn đợt huấn luyện cần đánh giá (FT Model)</label>
                    <select 
                      className="form-input font-mono text-sm"
                      value={selectedJobId}
                      onChange={(e) => selectTrainingJob(e.target.value)}
                      required
                    >
                      {completedJobs.map(job => (
                        <option key={job.jobId} value={job.jobId} disabled={!job.hfRepoId}>
                          {job.projectName}{job.hfRepoId ? '' : ' — chưa push lên Hugging Face'}
                        </option>
                      ))}
                      {completedJobs.length === 0 && (
                        <option value="">Không tìm thấy đợt train COMPLETED và đã push lên HF</option>
                      )}
                    </select>
                    {completedJobs.length > 0 && evaluableJobs.length === 0 && (
                      <span className="text-xs text-danger mt-1">
                        Các đợt train đã hoàn tất nhưng chưa có Hugging Face repo, nên chưa thể tải model để đánh giá.
                      </span>
                    )}
                    {completedJobs.length === 0 && (
                      <span className="text-xs text-danger mt-1">
                        * Cần có đợt training hoàn tất và đã được push repository lên Hugging Face Hub.
                      </span>
                    )}
                  </div>

                  {/* Select AI Judge Model */}
                  <div className="form-group">
                    <label>Hệ thống mô hình AI chấm điểm (AI Judge)</label>
                    <select 
                      className="form-input"
                      value={judgeModel}
                      onChange={(e) => setJudgeModel(e.target.value)}
                    >
                      <option value="google/gemini-2.5-flash">Gemini 2.5 Flash · OpenRouter (Fixed Judge)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Phạm vi đánh giá</label>
                    <div className="text-sm text-muted">
                      Locked single-turn · 50 held-out items/môn · upload test ZIP đã export từ Data Prep. Run ít hơn 50 chỉ là smoke test và không thể pin official.
                    </div>
                  </div>

                  {/* Locked paired comparison: Base is inherited from AutoTrain. */}
                  <div className="form-group border-t pt-3">
                    <label>Đối chứng Base–Fine-tuned</label>
                    <div className="text-sm text-muted">
                      Base Model được lấy tự động từ Training Job, không nhập lại thủ công.
                    </div>
                    <div className="form-input mt-2 font-mono text-sm" aria-readonly="true">
                      {baseModelHfRepo || 'Training Job chưa lưu Base Model'}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>System prompt</label>
                    <div className="text-sm text-muted">
                      Dùng prompt đã lưu trong AutoTrain làm chuẩn. Prompt nhúng trong file test chỉ được lưu để truy vết và không ghi đè điều kiện đánh giá.
                      Không nhập prompt tại Model Eval.
                    </div>
                    {selectedTrainingJob?.systemPromptVersion && (
                      <div className="text-xs text-success mt-1">
                        Prompt đã lưu khi train: <strong>{selectedTrainingJob.systemPromptVersion}</strong>
                      </div>
                    )}
                  </div>

                  {/* Dataset Selector */}
                  <div className="form-group border-t pt-3">
                    <label>Bộ dữ liệu kiểm định (Test dataset)</label>
                    {linkedDatasetVersion && (
                      <div className="text-xs text-success mt-1 mb-2">
                        Đã tự chọn đúng version dùng khi train: <strong>{linkedDatasetVersion.versionName}</strong>
                      </div>
                    )}
                    <div className="dataset-source-toggle mt-1 mb-2">
                      <button 
                        type="button" 
                        className={`source-btn ${datasetSource === 'version' ? 'active' : ''}`}
                        onClick={() => setDatasetSource('version')}
                      >
                        Dataset Registry
                      </button>
                      <button 
                        type="button" 
                        className={`source-btn ${datasetSource === 'file' ? 'active' : ''}`}
                        onClick={() => setDatasetSource('file')}
                      >
                        Tải tệp tin (.json, .jsonl)
                      </button>
                    </div>

                    {datasetSource === 'version' ? (
                      <select
                        className="form-input"
                        value={selectedVersionId}
                        onChange={(e) => setSelectedVersionId(e.target.value)}
                        required={datasetSource === 'version'}
                      >
                        {datasetVersions.map(ver => (
                          <option key={ver._id} value={ver._id}>
                            {ver._id === linkedDatasetVersion?._id ? '✓ Version đã dùng để train — ' : ''}
                            {ver.projectName} — {ver.versionName} ({ver.totalSamples} mẫu)
                          </option>
                        ))}
                        {datasetVersions.length === 0 && (
                          <option value="">Không có dataset version nào</option>
                        )}
                      </select>
                    ) : (
                      <div 
                        className={`eval-dropzone ${dragActive ? 'active' : ''} ${uploadedFile ? 'has-file' : ''}`}
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('file-upload-input')?.click()}
                      >
                        <input 
                          id="file-upload-input"
                          type="file" 
                          accept=".json,.jsonl,.zip"
                          style={{ display: 'none' }}
                          onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                        />
                        {uploadedFile ? (
                          <div className="dropzone-file-info">
                            <FileSpreadsheet className="text-success dropzone-file-icon" size={28} />
                            <div className="file-detail-text">
                              <div className="file-name">{uploadedFile.name}</div>
                              <div className="file-size">{(uploadedFile.size / 1024).toFixed(1)} KB</div>
                            </div>
                            <button 
                              type="button" 
                              className="btn-clear-file" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedFile(null);
                              }}
                              title="Xóa file"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="dropzone-placeholder">
                            <Upload className="dropzone-icon" size={24} />
                            <span className="dropzone-title">Kéo thả file .json hoặc .jsonl vào đây</span>
                            <span className="dropzone-subtitle">hoặc click để duyệt file</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-outline-modal" onClick={() => setIsModalOpen(false)}>Hủy</button>
              <button 
                type="submit" 
                className="btn-primary-modal" 
                disabled={submittingEval || evaluableJobs.length === 0 || !selectedJobId || (datasetSource === 'version' && datasetVersions.length === 0)}
              >
                <Play size={16} /> {submittingEval ? 'Đang khởi chạy...' : 'Bắt đầu Đánh giá'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. SLIDE-OUT PANEL: CONVERSATION HUMAN AUDIT REVIEW */}
      {selectedConvIndex !== null && evaluationDetail && (
        (() => {
          const resultItem = evaluationDetail.results?.find((r: any) => r.conv_index === selectedConvIndex);
          if (!resultItem) return null;
          return (
            <div className="audit-slide-overlay" onClick={() => setSelectedConvIndex(null)}>
              <div className="audit-slide-panel card" onClick={(e) => e.stopPropagation()}>
                <div className="audit-panel-header">
                  <div>
                    <h3>Thẩm định Hội thoại: Conv #{selectedConvIndex}</h3>
                    <p className="text-xs text-muted">Kiểm duyệt kết quả đánh giá tự động của AI Judge</p>
                  </div>
                  <button className="btn-close-audit" onClick={() => setSelectedConvIndex(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="audit-panel-body">
                  {/* Visual chat bubble transcript replay */}
                  <div className="chat-replay-container">
                    <h4>Nội dung Replay hội thoại</h4>
                    <div className="chat-bubbles-list">
                      {resultItem.replay_turns?.map((turn: any, tIdx: number) => (
                        <div key={tIdx} className="chat-turn-group">
                          <div className="bubble student shadow-sm">
                            <span className="bubble-role">Học sinh</span>
                            <p>{turn.user}</p>
                          </div>
                          <div className="bubble assistant font-normal shadow-sm">
                            <span className="bubble-role text-primary">Gia sư (Fine-tuned)</span>
                            <p>{turn.model}</p>
                            <span className="bubble-latency">
                              <Clock size={10} /> {(turn.latency_ms / 1000).toFixed(2)}s
                              {' · '}{turn.total_tokens ?? 0} tokens
                            </span>
                          </div>
                        </div>
                      ))}
                      {(!resultItem.replay_turns || resultItem.replay_turns.length === 0) && (
                        <div className="text-center text-muted italic py-6">Không có lượt thoại replay được lưu.</div>
                      )}
                    </div>
                  </div>

                  {/* AI Judge criteria reason details and scoring */}
                  <div className="judge-scoring-details mt-6">
                    <h4>Điểm số chi tiết từ AI Judge</h4>
                    <div className="group-overall-metric mb-3">
                      <span>Primary K / S:</span>
                      <span className="font-bold text-lg text-primary ml-2">Kiến thức {resultItem.group_scores?.knowledge?.toFixed(2) ?? resultItem.criteria_scores?.B1?.toFixed?.(2)} · Gợi mở {resultItem.group_scores?.socratic?.toFixed(2)} / 5</span>
                    </div>

                    <div className="criteria-reasons-list">
                      {Object.entries(resultItem.criteria_scores || {}).map(([key, scoreVal]: any) => {
                        const reasonText = resultItem.criteria_reasons?.[key] || 'Không có lý giải.';
                        return (
                          <div key={key} className="criteria-reason-item card">
                            <div className="crit-reason-header">
                              <span className="crit-badge">{key}</span>
                              <span className="crit-score-val">{scoreVal?.toFixed(1)} / 5.0</span>
                            </div>
                            <div className="crit-reason-text">{reasonText}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Human validation audit review form */}
                  <div className="human-audit-form border-t pt-4 mt-6">
                    <h4>Đánh giá thẩm định của Supervisor</h4>
                    <div className="form-group mb-4">
                      <label>Kết luận của bạn (Verdict)</label>
                      <div className="verdict-options mt-2">
                        <button 
                          type="button" 
                          className={`verdict-btn agree ${reviewVerdict === 'agree' ? 'active' : ''}`}
                          onClick={() => setReviewVerdict('agree')}
                        >
                          <Check size={14} /> Đồng ý với AI Judge
                        </button>
                        <button 
                          type="button" 
                          className={`verdict-btn disagree ${reviewVerdict === 'disagree' ? 'active' : ''}`}
                          onClick={() => setReviewVerdict('disagree')}
                        >
                          <X size={14} /> Điểm số AI không đúng
                        </button>
                        <button 
                          type="button" 
                          className={`verdict-btn skip ${reviewVerdict === 'skip' ? 'active' : ''}`}
                          onClick={() => setReviewVerdict('skip')}
                        >
                          Bỏ qua lượt này
                        </button>
                      </div>
                    </div>

                    <div className="form-group mb-4">
                      <label>Ý kiến giải trình của Supervisor</label>
                      <textarea 
                        className="form-input text-sm"
                        rows={3}
                        placeholder="Nêu rõ lý do nếu bạn không đồng ý với kết quả chấm điểm của AI..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                    </div>

                    <div className="form-group mb-4">
                      <label>Tên người thẩm định (Reviewer)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={reviewerName}
                        onChange={(e) => setReviewerName(e.target.value)}
                        required
                      />
                    </div>

                    <button 
                      className="btn-primary w-full py-2.5 mt-2" 
                      onClick={handleSaveAuditReview}
                      disabled={submittingReview}
                    >
                      {submittingReview ? 'Đang lưu thẩm định...' : 'Lưu kết quả thẩm định'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
