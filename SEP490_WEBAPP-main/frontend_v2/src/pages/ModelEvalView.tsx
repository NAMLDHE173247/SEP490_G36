import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Play, 
  Download, 
  Filter, 
  Eye, 
  Award, 
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
  MessageSquare, 
  HelpCircle, 
  ChevronRight, 
  User,
  Star,
  Activity,
  Maximize2,
  TrendingUp,
  LineChart as ChartIcon,
  ShieldCheck,
  FileSpreadsheet,
  Upload
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, apiService } from '../services/api';
import { getAuthToken } from '../services/authSession';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
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
  const [detailTab, setDetailTab] = useState<'breakdown' | 'paired' | 'samples'>('breakdown');
  const [selectedConvIndex, setSelectedConvIndex] = useState<number | null>(null);
  const [detailEvalHistory, setDetailEvalHistory] = useState<any[]>([]);

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
  const [isPaired, setIsPaired] = useState(false);
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
  const [activeEvalLogs, setActiveEvalLogs] = useState<string[]>([]);
  const [activeEvalSample, setActiveEvalSample] = useState<any>(null);
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
          if (versions.length > 0) setSelectedVersionId(versions[0]._id);
          return;
        }
        const linkedVersionId = getDatasetVersionId(firstJob);
        const initialVersion = versions.find((version: DatasetVersionItem) => version._id === linkedVersionId) || versions[0];
        setSelectedJobId(firstJob.jobId);
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
            '[ERROR] GPU khong tim thay Eval Job nay. Job co the da mat khi GPU service restart.',
          ]);
          return;
        }

        if (data.progress !== undefined) setActiveEvalProgress(data.progress);
        if (data.stage_label) setActiveEvalStage(data.stage_label);
        if (data.stage_detail) setActiveEvalDetail(data.stage_detail);
        if (data.current_sample) setActiveEvalSample(data.current_sample);
        
        if (data.logs && Array.isArray(data.logs)) {
          setActiveEvalLogs(data.logs);
        } else if (data.stage_detail) {
          setActiveEvalLogs(prev => [...prev, `[${data.stage_label || 'STAGE'}] ${data.stage_detail}`]);
        }

        if (data.status === 'COMPLETED') {
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

    source.addEventListener('end', () => {
      source.close();
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
        '[ERROR] Mat ket noi SSE. Kiem tra backend route /model-eval/stream hoac token dang nhap.',
      ]);
      toast.error('Khong ket noi duoc stream tien trinh Eval.');
    });
  };

  const reconnectActiveEvaluation = async () => {
    setActiveEvalId('checking');
    setActiveEvalProgress(0);
    setActiveEvalStage('Dang tim tien trinh');
    setActiveEvalDetail('Dang hoi backend xem Eval Job nao dang chay...');
    setActiveEvalLogs(['[INFO] Dang tim Eval Job dang chay cua tai khoan hien tai...']);
    setActiveEvalSample(null);
    try {
      const response = await api.get('/model-eval/active');
      if (response.data?.modelEvalId) {
        startProgressStream(response.data.modelEvalId);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setActiveEvalId(null);
        toast.error('GPU đang bận nhưng không tìm thấy Eval Job thuộc tài khoản này.');
      }
    } catch (error: any) {
      setActiveEvalId(null);
      toast.error(error.response?.data?.error || 'Không thể kết nối lại tiến trình Eval.');
    }
  };

  useEffect(() => {
    const restoreActiveEvaluation = async () => {
      const rememberedId = localStorage.getItem('active_model_eval_id');
      if (rememberedId) {
        startProgressStream(rememberedId);
        return;
      }
      try {
        const response = await api.get('/model-eval/active');
        if (response.data?.modelEvalId) startProgressStream(response.data.modelEvalId);
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

      toast.loading('Đang nạp file và gửi yêu cầu lên GPU...', { id: loadingToastId });

      const options = {
        judgeModel,
        baseModelHfRepo: isPaired ? baseModelHfRepo : undefined
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
      toast.error(err.response?.data?.error || err.message || 'Khởi chạy đánh giá thất bại', { id: loadingToastId });
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
      setDetailTab('breakdown');
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

  const handlePin = async (e: React.MouseEvent, evalId: string) => {
    e.stopPropagation();
    try {
      await apiService.pinEvaluation(evalId);
      toast.success('Đã ghim đánh giá làm kết quả chính thức!');
      if (evaluationDetail?.jobId) {
        try {
          const history = await apiService.getEvalHistory(evaluationDetail.jobId);
          setDetailEvalHistory(Array.isArray(history?.evals) ? history.evals : []);
          setEvaluationDetail((prev: any) => prev ? { ...prev, isPinned: prev.modelEvalId === evalId } : prev);
        } catch (historyErr) {
          console.error('Failed to refresh evaluation history:', historyErr);
        }
      }
      fetchLeaderboard();
    } catch (err) {
      console.error('Failed to pin evaluation:', err);
      toast.error('Không thể ghim kết quả');
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
    const headers = ['RANK', 'PROJECT', 'MODEL', 'BASE MODEL', 'SCORE', 'ACCURACY (A)', 'CONSISTENCY (B)', 'SOCRATIC (C)', 'LATENCY (D)', 'JUDGE MODEL', 'TOTAL SAMPLES', 'FLAGS'];
    const rows = leaderboard.map((row, index) => [
      index + 1,
      row.projectName,
      row.pinnedEvalId ? `${row.baseModel} (Fine-tuned)` : row.baseModel,
      row.scores?.group_b ? 'Paired Eval' : 'Single',
      row.scores.overall || '-',
      row.scores.group_a || '-',
      row.scores.group_b || '-',
      row.scores.group_c || '-',
      row.scores.group_d || '-',
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

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <div className="rank-badge gold"><Award size={16} /></div>;
    if (rank === 2) return <div className="rank-badge silver"><Award size={16} /></div>;
    if (rank === 3) return <div className="rank-badge bronze"><Award size={16} /></div>;
    return <div className="rank-badge standard">{rank}</div>;
  };

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return 'text-muted';
    if (score >= 4.0) return 'text-emerald font-bold';
    if (score >= 3.0) return 'text-primary font-bold';
    return 'text-danger font-bold';
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
      overall: evaluationDetail.summary?.overall || 0,
      latency: evaluationDetail.summary?.avg_latency_ms || 0,
      avgTotalTokens: evaluationDetail.summary?.avg_total_tokens || 0,
      totalTokens: evaluationDetail.summary?.total_tokens || 0,
      socratic: evaluationDetail.summary?.group_a || 0,
      factuality: evaluationDetail.summary?.criteria?.B1 ?? evaluationDetail.summary?.group_b ?? 0,
      totalReviewed: reviewed.length,
      agreementRate: reviewed.length > 0 ? Math.round((agreed / reviewed.length) * 100) : null
    };
  }, [evaluationDetail]);

  // Recharts Chart Data prep
  const criteriaChartData = React.useMemo(() => {
    if (!evaluationDetail || !evaluationDetail.summary?.criteria) return [];
    
    // List of criteria details
    const mapping: Record<string, string> = {
      A1: 'Không đưa đáp án trực tiếp (A1)',
      A2: 'Chất lượng gợi mở (A2)',
      A3: 'Phản hồi thích ứng (A3)',
      B1: 'Độ chính xác kiến thức (B1)',
      B2: 'Phù hợp trình độ (B2)',
      C1: 'Xử lý tình huống (C1)',
      C2: 'Mạch lạc hội thoại (C2)',
      C3: 'Tông giọng động viên (C3)',
      D1: 'Không bịa đặt (D1)',
      D2: 'Tốc độ phản hồi (D2)'
    };

    return Object.entries(evaluationDetail.summary.criteria).map(([key, val]) => ({
      name: key,
      label: mapping[key] || key,
      Score: val,
      Base: evaluationDetail.baseSummary?.criteria?.[key] || 0
    }));
  }, [evaluationDetail]);

  const evalOverview = React.useMemo(() => {
    if (!evaluationDetail?.summary) return null;
    const summary = evaluationDetail.summary;
    const results = evaluationDetail.results || [];
    const a1Violations = results.filter((item: any) => Number(item.criteria_scores?.A1) === 0).length;
    const judgeFailure = results.some((item: any) =>
      Object.values(item.criteria_reasons || {}).some((reason: any) => String(reason).includes('judge_error'))
    );
    return {
      a1Violations,
      judgeFailure,
      rings: [
        { key: 'A', label: 'A · Socratic', value: summary.group_a ?? 0, color: '#4f46e5' },
        { key: 'B', label: 'B · Accuracy', value: summary.group_b ?? 0, color: '#ea580c' },
        { key: 'C', label: 'C · Pedagogy', value: summary.group_c ?? 0, color: '#0f766e' },
        { key: 'D', label: 'D · Hallucination + Speed', value: summary.group_d ?? 0, color: '#0284c7' },
      ],
      radar: [
        { subject: 'Socratic', value: summary.group_a ?? 0 },
        { subject: 'Accuracy', value: summary.group_b ?? 0 },
        { subject: 'Pedagogy', value: summary.group_c ?? 0 },
        { subject: 'Hall + Speed', value: summary.group_d ?? 0 },
      ],
      nonScoring: summary.non_scoring || {},
      confidence: summary.avg_confidence,
      lowConfidenceCount: summary.low_confidence_count ?? 0,
    };
  }, [evaluationDetail]);

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
      activeEvalStage.toLowerCase().includes('khong tim')
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
              {activeEvalLooksStuck && (
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
                  <span className="log-timestamp">[{new Date().toLocaleTimeString('vi-VN')}]</span> {log}
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
                GPU Worker: {gpuStatus.can_create_eval ? 'Sẵn sàng' : 'Đang bận huấn luyện'}
              </span>
            </div>
            <div className="gpu-details-row">
              <span className="detail-tag">Active Slots: {gpuStatus.active_evals}/{gpuStatus.max_evals}</span>
              <span className="detail-tag">VRAM Trống: {Math.round(gpuStatus.vram_free_mb / 1024)}GB / {Math.round(gpuStatus.vram_total_mb / 1024)}GB</span>
              <span className="detail-tag">GPU Util: {gpuStatus.gpu_util}%</span>
              {!activeEvalId && gpuStatus.active_evals > 0 && (
                <button type="button" className="btn btn-sm btn-primary" onClick={reconnectActiveEvaluation}>
                  Xem tiến trình đang chạy
                </button>
              )}
            </div>
          </div>
          {!gpuStatus.can_create_eval && (
            <div className="gpu-warning-box text-xs mt-2 text-amber">
              <AlertCircle size={14} /> Hàng đợi GPU đang đầy hoặc VRAM trống dưới mức an toàn (5GB). Đánh giá mới sẽ được xếp hàng chờ đợi.
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
              <h1>Bảng xếp hạng chất lượng Model (Leaderboard)</h1>
              <p>Đối chiếu và xếp thứ hạng các đợt fine-tune bằng Rubric Socratic chuẩn hóa</p>
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
              <table className="eval-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">So sánh</th>
                    <th>Hạng</th>
                    <th>Dự án (Project)</th>
                    <th>Trạng thái eval</th>
                    <th>Mô hình gốc (Base)</th>
                    <th className="text-right">Điểm overall</th>
                    <th className="text-center">Kiến thức (A)</th>
                    <th className="text-center">Định hướng (C)</th>
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
                    const completedRank = filteredLeaderboard.slice(0, index + 1).filter(item => item.status === 'COMPLETED').length;
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
                          {isCompleted ? getRankBadge(completedRank) : <span className="text-muted">—</span>}
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
                           {!isCompleted && <div className="text-danger text-xs" title={failureMessage}>{failureMessage}</div>}
                         </td>
                        <td>
                          <span className={`flag-tag ${isCompleted ? '' : 'danger'}`} title={isCompleted ? 'Đã hoàn thành' : failureMessage}>
                            {row.status}
                          </span>
                        </td>
                        <td className="text-muted text-sm">{row.baseModel}</td>
                        <td className="col-score text-right">
                          <div className="score-main-group">
                            <span className={getScoreColorClass(row.scores.overall)}>{row.scores.overall?.toFixed(2) || '-'}</span>
                            <span className="score-max">/ 5.0</span>
                          </div>
                        </td>
                        <td className="text-center font-medium">{row.scores.group_a?.toFixed(2) || '-'}</td>
                        <td className="text-center font-medium">{row.scores.group_c?.toFixed(2) || '-'}</td>
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
                                    title={isPinned ? 'Đang ghim chính thức' : 'Ghim làm model chính thức của dự án'}
                                    onClick={(e) => handlePin(e, row.modelEvalId!)}
                                    disabled={isPinned}
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
                  <div className="score-label">Điểm Composite Socratic</div>
                  <div className="score-val-container">
                    <span className="score-big">{evaluationDetail.summary?.overall?.toFixed(3)}</span>
                    <span className="score-limit">/ 5.0</span>
                  </div>
                </div>
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
                              <span>{ev.summary?.overall?.toFixed?.(2) ?? '-'} / 5</span>
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
                            {!isPinned && (
                              <button
                                type="button"
                                className="mini-action"
                                onClick={(e) => handlePin(e, ev.modelEvalId)}
                                title="Pin làm official"
                              >
                                Pin
                              </button>
                            )}
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
                <section className="v1-eval-overview card" aria-label="Tổng quan điểm số">
                  <div className="v1-overview-heading">
                    <div>
                      <h3>Tổng quan điểm số</h3>
                      <p>Thang 0–5 · đánh giá {evaluationDetail.totalConversations || evaluationDetail.results?.length || 0} conversations</p>
                    </div>
                    <div className="v1-overall-score">
                      <span>Overall Score</span>
                      <strong>{evaluationDetail.summary?.overall?.toFixed(2)}</strong>
                      <small>Composite weighted score</small>
                    </div>
                  </div>

                  {evalOverview.judgeFailure ? (
                    <div className="v1-judge-error">
                      <AlertCircle size={17} /> Lần đánh giá này có lỗi AI Judge; điểm rubric không hợp lệ và không nên dùng để so sánh/pin.
                    </div>
                  ) : evalOverview.a1Violations > 0 ? (
                    <div className="v1-hard-constraint">
                      <AlertCircle size={17} /> {evalOverview.a1Violations} conversation vi phạm A1=0 (hard constraint) · nhóm Socratic bị giới hạn theo rubric.
                    </div>
                  ) : null}

                  <div className="v1-overview-body">
                    <div className="v1-score-rings">
                      {evalOverview.rings.map(ring => (
                        <div className="v1-score-ring" key={ring.key}>
                          <div className="v1-ring-value" style={{ '--ring-color': ring.color, '--ring-pct': `${Math.max(0, Math.min(100, ring.value * 20))}%` } as React.CSSProperties}>
                            <span>{ring.value.toFixed(2)}</span>
                          </div>
                          <span>{ring.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="v1-radar-wrap">
                      <h4>Radar — 4 nhóm tiêu chí</h4>
                      <ResponsiveContainer width="100%" height={210}>
                        <RadarChart data={evalOverview.radar} outerRadius="66%">
                          <PolarGrid stroke="#cbd5e1" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#475569' }} />
                          <PolarRadiusAxis domain={[0, 5]} tickCount={3} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Radar name="Fine-tuned Model" dataKey="value" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.26} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="v1-reference-metrics">
                    <div><span>Latency trung bình / turn</span><strong>{Math.round(evaluationDetail.summary?.avg_latency_ms || 0).toLocaleString()} <small>ms</small></strong></div>
                    <div><span>Judge confidence</span><strong>{typeof evalOverview.confidence === 'number' ? `${Math.round(evalOverview.confidence * 100)}%` : '—'}</strong><small>{evalOverview.lowConfidenceCount} conversation phân tán cao</small></div>
                    <div><span>Metric tham chiếu</span><strong>BLEU {Number(evalOverview.nonScoring.bleu || 0).toFixed(3)} · ROUGE-L {Number(evalOverview.nonScoring.rouge_l || 0).toFixed(3)}</strong><small>Question rate {Number(evalOverview.nonScoring.question_detection_rate || 0).toFixed(3)}</small></div>
                  </div>

                  <div className="score-formula-panel">
                    <div className="formula-block baseline">
                      <div className="formula-title"><ShieldCheck size={15} /> Version 1 — công thức baseline, giữ nguyên</div>
                      <p><strong>A</strong> = 0.5A1 + 0.3A2 + 0.2A3 (cap 1.0 khi A1 ≤ 1)</p>
                      <p><strong>B</strong> = 0.6B1 + 0.4B2 · <strong>C</strong> = 0.4C1 + 0.4C2 + 0.2C3 · <strong>D</strong> = 0.5D1 + 0.5D2</p>
                      <p><strong>Overall</strong> = 0.40A + 0.25B + 0.25C + 0.10D</p>
                    </div>
                    <div className={`formula-block improved ${evalOverview.judgeFailure ? 'invalid' : ''}`}>
                      <div className="formula-title"><AlertCircle size={15} /> Version 2 — cải tiến kiểm định kết quả</div>
                      <p><strong>Score V2</strong> = Score V1 khi tất cả rubric được Judge trả về hợp lệ.</p>
                      <p><strong>INVALID</strong> khi có <code>judge_error</code>, parse miss hoặc thiếu tiêu chí; run đó không được pin hay đưa vào so sánh.</p>
                      <p className="formula-status">Trạng thái lần này: <strong>{evalOverview.judgeFailure ? 'INVALID — cần chạy lại' : 'VALID — Gemini đã chấm đủ rubric'}</strong></p>
                    </div>
                  </div>
                </section>
              )}

              {/* Stats Cards grid */}
              {detailsStats && (
                <div className="eval-stats-grid mb-6">
                  <div className="eval-stat-card">
                    <div className="stat-card-header">
                      <Clock size={16} className="text-muted" />
                      <span className="text-muted text-sm">Thời trễ trung bình</span>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-value">{(detailsStats.latency / 1000).toFixed(2)}s</div>
                      <div className="stat-card-trend text-muted">Phản hồi của Assistant</div>
                    </div>
                  </div>
                  <div className="eval-stat-card">
                    <div className="stat-card-header">
                      <Activity size={16} className="text-primary" />
                      <span className="text-muted text-sm">Token trung bình</span>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-value">{detailsStats.avgTotalTokens.toFixed(0)}</div>
                      <div className="stat-card-trend text-muted">Tổng run: {detailsStats.totalTokens.toLocaleString()} tokens</div>
                    </div>
                  </div>
                  <div className="eval-stat-card">
                    <div className="stat-card-header">
                      <Star size={16} className="text-primary" />
                      <span className="text-muted text-sm">Chất lượng Socratic (Group A)</span>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-value text-primary-gradient">{detailsStats.socratic?.toFixed(2)} / 5</div>
                      <div className="stat-card-trend text-success">Độ định hướng sư phạm</div>
                    </div>
                  </div>
                  <div className="eval-stat-card">
                    <div className="stat-card-header">
                      <Check size={16} className="text-emerald" />
                      <span className="text-muted text-sm">Chính xác kiến thức (B1)</span>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-value text-emerald">{detailsStats.factuality?.toFixed(2)} / 5</div>
                      <div className="stat-card-trend text-success">Tính Factuality/Chính xác</div>
                    </div>
                  </div>
                  <div className="eval-stat-card">
                    <div className="stat-card-header">
                      <User size={16} className="text-blue" />
                      <span className="text-muted text-sm">Audit Thẩm định</span>
                    </div>
                    <div className="stat-card-body">
                      <div className="stat-card-value text-blue">
                        {detailsStats.totalReviewed > 0 ? `${detailsStats.agreementRate}%` : 'N/A'}
                      </div>
                      <div className="stat-card-trend text-muted">
                        Đã duyệt {detailsStats.totalReviewed}/{evaluationDetail.results?.length || 0} hội thoại
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Visual Criteria Score Chart and Breakdown Tabs */}
              <div className="detail-visual-section card">
                {/* Left: Recharts representation of Criteria Scores A1 to D2 */}
                <div className="detail-chart-box">
                  <h3>Đồ thị chi tiết Tiêu chí Rubric (Criteria Scores A1-D2)</h3>
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={criteriaChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Score" name="Fine-tuned Model" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={24} />
                        {evaluationDetail.evalMode === 'paired' && (
                          <Bar dataKey="Base" name="Base Model" fill="#cbd5e1" radius={[4, 4, 0, 0]} barSize={24} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Tabs selector */}
              <div className="detail-tabs-bar">
                <button 
                  className={`detail-tab-btn ${detailTab === 'breakdown' ? 'active' : ''}`}
                  onClick={() => setDetailTab('breakdown')}
                >
                  Bảng điểm Chi tiết (Rubric Breakdown)
                </button>
                {evaluationDetail.evalMode === 'paired' && (
                  <button 
                    className={`detail-tab-btn ${detailTab === 'paired' ? 'active' : ''}`}
                    onClick={() => setDetailTab('paired')}
                  >
                    So sánh chéo Base Model (Paired Delta)
                  </button>
                )}
                <button 
                  className={`detail-tab-btn ${detailTab === 'samples' ? 'active' : ''}`}
                  onClick={() => setDetailTab('samples')}
                >
                  Danh sách Mẫu hội thoại ({evaluationDetail.results?.length || 0})
                </button>
              </div>

              {/* Tab views contents */}
              
              {/* TAB 1: BREAKDOWN */}
              {detailTab === 'breakdown' && (
                <div className="tab-content-breakdown">
                  <div className="rubric-groups-grid">
                    {/* Group A */}
                    <div className="rubric-group-card card">
                      <div className="group-card-header bg-emerald">
                        <h4>NHÓM A: SOCRATIC COMPLIANCE</h4>
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
                        <h4>NHÓM B: ĐỘ CHÍNH XÁC</h4>
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
                        <h4>NHÓM C: CHẤT LƯỢNG SƯ PHẠM</h4>
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
                            <span className="crit-name">Mạch lạc hội thoại</span>
                            <span className="crit-desc">Nhớ và kế thừa ngữ cảnh giữa các lượt trao đổi.</span>
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
                        <h4>NHÓM D: HALLUCINATION & TỐC ĐỘ</h4>
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
                            <span className="crit-name">Tốc độ trễ phản hồi (Latency)</span>
                            <span className="crit-desc">Tính điểm dựa trên thời gian trễ trung bình (&lt;2s = 5đ).</span>
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
                    <p>Bảng so sánh đối chiếu chéo hiệu năng trực tiếp giữa <strong>Mô hình Fine-tuned (FT)</strong> và <strong>Mô hình gốc (Base Model)</strong></p>
                  </div>
                  <table className="comparison-score-table">
                    <thead>
                      <tr>
                        <th>Chỉ số nhóm & Tiêu chí</th>
                        <th className="text-center">Base Model</th>
                        <th className="text-center">Fine-tuned Model</th>
                        <th className="text-right">Biến động (Delta)</th>
                        <th className="text-center">Đánh giá chung</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-semibold text-main">ĐIỂM COMPOSITE OVERALL</td>
                        <td className="text-center font-semibold">{evaluationDetail.baseSummary?.overall?.toFixed(3)}</td>
                        <td className="text-center font-bold text-primary">{evaluationDetail.summary?.overall?.toFixed(3)}</td>
                        <td className={`text-right font-bold ${evaluationDetail.delta?.overall >= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.overall >= 0 ? `+${evaluationDetail.delta?.overall}` : evaluationDetail.delta?.overall}
                        </td>
                        <td className="text-center">
                          {evaluationDetail.delta?.overall > 0 ? (
                            <span className="badge-comparison win">FT tốt hơn</span>
                          ) : evaluationDetail.delta?.overall < 0 ? (
                            <span className="badge-comparison lose">Base tốt hơn</span>
                          ) : (
                            <span className="badge-comparison tie">Ngang bằng</span>
                          )}
                        </td>
                      </tr>
                      {/* Sub Category Group A */}
                      <tr>
                        <td className="font-semibold text-muted pl-4">Nhóm A: Socratic Compliance</td>
                        <td className="text-center text-muted">{evaluationDetail.baseSummary?.group_a?.toFixed(2)}</td>
                        <td className="text-center font-semibold text-main">{evaluationDetail.summary?.group_a?.toFixed(2)}</td>
                        <td className={`text-right font-semibold ${evaluationDetail.delta?.group_a >= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.group_a >= 0 ? `+${evaluationDetail.delta?.group_a}` : evaluationDetail.delta?.group_a}
                        </td>
                        <td className="text-center" />
                      </tr>
                      {/* Sub Category Group B */}
                      <tr>
                        <td className="font-semibold text-muted pl-4">Nhóm B: Độ chính xác</td>
                        <td className="text-center text-muted">{evaluationDetail.baseSummary?.group_b?.toFixed(2)}</td>
                        <td className="text-center font-semibold text-main">{evaluationDetail.summary?.group_b?.toFixed(2)}</td>
                        <td className={`text-right font-semibold ${evaluationDetail.delta?.group_b >= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.group_b >= 0 ? `+${evaluationDetail.delta?.group_b}` : evaluationDetail.delta?.group_b}
                        </td>
                        <td className="text-center" />
                      </tr>
                      {/* Sub Category Group C */}
                      <tr>
                        <td className="font-semibold text-muted pl-4">Nhóm C: Chất lượng sư phạm</td>
                        <td className="text-center text-muted">{evaluationDetail.baseSummary?.group_c?.toFixed(2)}</td>
                        <td className="text-center font-semibold text-main">{evaluationDetail.summary?.group_c?.toFixed(2)}</td>
                        <td className={`text-right font-semibold ${evaluationDetail.delta?.group_c >= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.group_c >= 0 ? `+${evaluationDetail.delta?.group_c}` : evaluationDetail.delta?.group_c}
                        </td>
                        <td className="text-center" />
                      </tr>
                      {/* Latency row */}
                      <tr>
                        <td className="font-semibold text-muted pl-4">Độ trễ trung bình phản hồi (ms)</td>
                        <td className="text-center text-muted">{evaluationDetail.baseSummary?.avg_latency_ms?.toFixed(0)} ms</td>
                        <td className="text-center font-semibold text-main">{evaluationDetail.summary?.avg_latency_ms?.toFixed(0)} ms</td>
                        <td className={`text-right font-semibold ${evaluationDetail.delta?.avg_latency_ms <= 0 ? 'text-success' : 'text-danger'}`}>
                          {evaluationDetail.delta?.avg_latency_ms > 0 ? `+${evaluationDetail.delta?.avg_latency_ms} ms` : `${evaluationDetail.delta?.avg_latency_ms} ms`}
                        </td>
                        <td className="text-center">
                          {evaluationDetail.delta?.avg_latency_ms < 0 ? (
                            <span className="badge-comparison win">FT nhanh hơn</span>
                          ) : (
                            <span className="badge-comparison lose">Base nhanh hơn</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: CONVERSATION SAMPLES */}
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
                          <th className="text-center">Điểm Sư phạm (C)</th>
                          <th className="text-center">Điểm overall</th>
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
                              <td className="font-mono text-xs font-semibold text-primary">Conv #{row.conv_index}</td>
                              <td className="sample-instruction-preview">
                                {row.replay_turns?.[0]?.user || 'Không có dữ liệu lượt thoại'}
                              </td>
                              <td className="text-center font-medium">{row.num_turns}</td>
                              <td className="text-center text-muted">{(row.avg_latency_ms / 1000).toFixed(1)}s</td>
                              <td className="text-center font-bold text-primary">{row.group_scores?.group_c?.toFixed(1) || '-'}</td>
                              <td className="text-center font-bold text-main">{row.group_scores?.overall?.toFixed(1) || '-'}</td>
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
                    {/* Overall */}
                    <tr className="overall-comp-row">
                      <td>Composite Overall Score</td>
                      <td className="text-center font-bold">{compareData.scoreSummary?.overall?.a?.toFixed(3)}</td>
                      <td className="text-center font-bold text-primary">{compareData.scoreSummary?.overall?.b?.toFixed(3)}</td>
                      <td className={`text-right font-bold ${compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a >= 0 ? 'text-success' : 'text-danger'}`}>
                        {(compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a) >= 0 ? '+' : ''}{(compareData.scoreSummary?.overall?.b - compareData.scoreSummary?.overall?.a)?.toFixed(3)}
                      </td>
                      <td className="text-center">
                        <span className={`badge-comparison ${compareData.scoreSummary?.overall?.winner === 'b' ? 'win' : compareData.scoreSummary?.overall?.winner === 'a' ? 'lose' : 'tie'}`}>
                          {compareData.scoreSummary?.overall?.winner === 'b' ? 'Run B thắng' : compareData.scoreSummary?.overall?.winner === 'a' ? 'Run A thắng' : 'Hòa'}
                        </span>
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
                        <th className="text-center">Điểm Run A</th>
                        <th className="text-center">Điểm Run B</th>
                        <th className="text-right">Biến động (B - A)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.matchedSamples?.map((sample: any) => (
                        <tr key={sample.conv_index} className="sample-compare-row">
                          <td className="font-mono text-xs font-semibold text-primary">Conv #{sample.conv_index}</td>
                          <td className="text-center">{sample.num_turns_a}</td>
                          <td className="text-center">{sample.num_turns_b}</td>
                          <td className="text-center font-semibold">{sample.overall_a?.toFixed(1)}</td>
                          <td className="text-center font-semibold text-primary">{sample.overall_b?.toFixed(1)}</td>
                          <td className={`text-right font-bold ${sample.delta_overall >= 0 ? 'text-success' : 'text-danger'}`}>
                            {sample.delta_overall >= 0 ? `+${sample.delta_overall.toFixed(1)}` : sample.delta_overall.toFixed(1)}
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
                    <div className="text-sm text-muted">Toàn bộ cuộc hội thoại · cùng protocol với Version 1</div>
                  </div>

                  {/* Paired comparison setting */}
                  <div className="form-group border-t pt-3">
                    <label className="custom-toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={isPaired} 
                        onChange={(e) => setIsPaired(e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                      <span className="switch-label font-semibold text-sm">Chạy paired evaluation so sánh chéo (với Base Model)</span>
                    </label>
                    {isPaired && (
                      <input 
                        type="text" 
                        className="form-input mt-2 font-mono text-sm animate-fade-in"
                        placeholder="Hugging Face repo ID của base model (ví dụ: Qwen/Qwen2.5-7B-Instruct)"
                        value={baseModelHfRepo}
                        onChange={(e) => setBaseModelHfRepo(e.target.value)}
                        required={isPaired}
                      />
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
                      <span>Điểm overall:</span>
                      <span className="font-bold text-lg text-primary ml-2">{resultItem.group_scores?.overall?.toFixed(2)} / 5</span>
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
