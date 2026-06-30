import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, ChevronDown, ChevronRight, X, Play, RefreshCw, Eye, ExternalLink, Settings, Download, Trash2, Edit2, Check, ArrowRight, AlertTriangle, User, Bot, Info, FileText, Search, RotateCcw, Inbox, MousePointer2, MessageSquare, Award, BookOpen, Sparkles, BarChart2, Pencil, Ban, Upload, Clock } from 'lucide-react';
import { useDataPrep } from '../../pages/DataPrep/DataPrepContext';
import { useStage4Data } from '../../hooks/useStage4Data';
import { apiService } from '../../services/api';
import { stage4Api } from '../../services/stage4Api';

const TRANSLATED_LABEL_MAP: Record<string, string> = {
  // Quality & Status
  'Completed': 'Hoàn thành',
  'Incomplete': 'Chưa hoàn thành',
  'Abandoned': 'Bỏ dở',
  'Gold': 'Tốt',
  'Rewrite': 'Cần viết lại',
  'Bad': 'Chưa đạt',
  'Chua ro': 'Chưa rõ',
  'spam': 'Spam',
  'toxic': 'Độc hại',

  // Domains
  'MATH': 'Toán',
  'Math': 'Toán',
  'Toan': 'Toán',
  'PHYSICAL': 'Vật lý',
  'Physical': 'Vật lý',
  'PHYSICS': 'Vật lý',
  'Physics': 'Vật lý',
  'Vat ly': 'Vật lý',
  'CHEMISTRY': 'Hóa học',
  'Chemistry': 'Hóa học',
  'Hoa hoc': 'Hóa học',
  'BIOLOGY': 'Sinh học',
  'Biology': 'Sinh học',
  'Sinh hoc': 'Sinh học',
  'LITERATURE': 'Ngữ văn',
  'Literature': 'Ngữ văn',
  'Van hoc': 'Ngữ văn',
  'ENGLISH': 'Tiếng Anh',
  'English': 'Tiếng Anh',
  'Tieng Anh': 'Tiếng Anh',
  'HISTORY': 'Lịch sử',
  'History': 'Lịch sử',
  'Lich su': 'Lịch sử',
  'GEOGRAPHY': 'Địa lý',
  'Geography': 'Địa lý',
  'Dia ly': 'Địa lý',
  'CODING': 'Tin học',
  'Coding': 'Tin học',
  'IT': 'Tin học',
  'Tin hoc': 'Tin học',
  'GDCD': 'GDCD',
  'Civics': 'GDCD',
  'Lien mon': 'Liên môn',
  'Multi-subject': 'Liên môn',
  'Unclear': 'Chưa rõ',
  'OTHER': 'Khác',
  'Other': 'Khác',

  // DB Hard Labels (User)
  'ANSWER_ATTEMPT': 'Học sinh trả lời/thử làm bài',
  'REQUEST_HINT': 'Xin gợi ý',
  'ASK_THEORY': 'Hỏi lý thuyết',
  'REQUEST_EXPLANATION': 'Yêu cầu giải thích',
  'REQUEST_SIMPLER': 'Muốn giải thích đơn giản hơn',
  'SKIP_EXERCISE': 'Bỏ qua bài',
  'DISCOURAGED': 'Chán nản',
  'OFF_TOPIC': 'Ngoài phạm vi',
  'READY_NEXT': 'Muốn học tiếp/chuyển câu',
  'CONFIRM_UNDERSTANDING': 'Xác nhận đã hiểu',

  // DB Hard Labels (Assistant)
  'CONFIRM_CORRECT_ANSWER': 'Xác nhận câu trả lời đúng',
  'IDENTIFY_INCORRECT_ANSWER': 'Chỉ ra câu trả lời sai',
  'CORRECT_MISTAKE': 'Sửa lỗi sai',
  'PRAISING': 'Khen ngợi',
  'SCAFFOLDING': 'Dẫn dắt từng bước',
  'HINTING': 'Đưa gợi ý',
  'CONCEPT_CLARIFY': 'Làm rõ khái niệm',
  'LOGIC_BREAKDOWN': 'Phân tích lập luận',
  'SIMPLIFYING': 'Diễn giải đơn giản',
  'MOTIVATING': 'Động viên',
  'REDIRECTING': 'Kéo về đúng chủ đề',
  'TRANSITIONING': 'Chuyển bước/chủ đề',
  'DIRECT_ANSWER': 'Đưa đáp án trực tiếp',
  'WAITING': 'Chờ học sinh phản hồi',

  // Legacy/Fallback aliases (supporting alternative db values)
  'CORRECT': 'Xác nhận câu trả lời đúng',
  'INCORRECT': 'Chỉ ra câu trả lời sai',
  'WAIT_READY': 'Chờ học sinh phản hồi',
  'NEXT_SECTION': 'Muốn học tiếp/chuyển câu',
  'ENCOURAGE': 'Động viên',
  'OFFTOPIC': 'Ngoài phạm vi',
  'Guide Step-by-step': 'Dẫn dắt từng bước',
  'Give Hint': 'Đưa gợi ý',
  'Ask Probing Question': 'Phân tích lập luận',
  'Provide Formula': 'Làm rõ khái niệm',
  'Correct Error': 'Sửa lỗi sai',
  'Summarize': 'Chuyển bước/chủ đề',
  'Ask Explanation': 'Yêu cầu giải thích',
  'Solve Exercise': 'Chỉ ra câu trả lời sai',
  'Request Formula': 'Hỏi lý thuyết',
  'Confirm Understanding': 'Xác nhận đã hiểu',
  'Ask Example': 'Muốn giải thích đơn giản hơn',
  'Hint': 'Đưa gợi ý',
  'Ques': 'Câu hỏi',
  'Ques/Hint': 'Hỏi/Gợi ý',
  'QA': 'Hỏi đáp',
  'Factual Error': 'Sai kiến thức',
  'Direct Answer': 'Lộ đáp án trực tiếp',
  'Language Issue': 'Lỗi ngôn ngữ',
};

export const Stage4Labeling: React.FC = () => {
  const [activeVersionId, setActiveVersionId] = useState<string | null>(() => localStorage.getItem('current_version_id'));
  const sampleComparisonsRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const syncVersionId = () => setActiveVersionId(localStorage.getItem('current_version_id'));
    syncVersionId();
    window.addEventListener('storage', syncVersionId);
    window.addEventListener('focus', syncVersionId);
    return () => {
      window.removeEventListener('storage', syncVersionId);
      window.removeEventListener('focus', syncVersionId);
    };
  }, []);
  const {
    labelingStatus,
    qualityResult,
    statistics,
    results,
    latestJob,
    isLoading: isStage4Loading,
    error: stage4Error,
    updateIncompleteBucket,
    runMultiEval,
    submitReview,
    adjudicateQuality,
    adjudicateMultiEvalResult,
    refreshData,
    setQualityResult,
  } = useStage4Data(activeVersionId);

  const dataPrep = useDataPrep();
  const {
    currentSubStep4, setCurrentSubStep4,
    classPage, setClassPage,
    qualityTab, setQualityTab,
    rewriteConvIdx, setRewriteConvIdx,
    rewriteTab, setRewriteTab,
    judgeModels, setJudgeModels,
    sepQualityModal, setSepQualityModal,
    sepDistributionTab, setSepDistributionTab,
    sepEvalRecommendation, setSepEvalRecommendation,
    sepEvalConflictOnly, setSepEvalConflictOnly,
    sepEvalMinScore, setSepEvalMinScore,
    sepRunningClass, setSepRunningClass,
    sepRunningQuality, setSepRunningQuality,
    sepRunningEval, setSepRunningEval,
    sepSubjectFilter, setSepSubjectFilter,
    sepSelectedDistSubject, setSepSelectedDistSubject,
    sepSelectedDistQuality, setSepSelectedDistQuality,
    sepSelectedError, setSepSelectedError,
    sepBalanceApplied, setSepBalanceApplied,
    sepRewriteGenerated, setSepRewriteGenerated,
    sepRewriteDecision, setSepRewriteDecision,
    sepQualityRatings, setSepQualityRatings,
    sepQualityLabels, setSepQualityLabels,
    projectName,
    bulkAssignStaff, setBulkAssignStaff,
    setCurrentStage,
    setCurrentSubStep6,
    conversationsList,
  } = dataPrep;

  const name = projectName;

  const [balancedQuality, setBalancedQuality] = useState(false);
  const [balancedSubject, setBalancedSubject] = useState(false);
  const [completedRewrites, setCompletedRewrites] = useState<any>({});
  const [reassignStaff, setReassignStaff] = useState<any>({});
  const [rewriteReasons, setRewriteReasons] = useState<Record<string, string>>({});
  const [bulkRewriteReason, setBulkRewriteReason] = useState('None');
  const [reviewDetailModal, setReviewDetailModal] = useState<any>(null);
  const [rewriteTextContent, setRewriteTextContent] = useState('');
  const [selectedRewriteIds, setSelectedRewriteIds] = useState<any[]>([]);
  const [selectedRewriteStaffIds, setSelectedRewriteStaffIds] = useState<string[]>([]);
  const [stage4StaffReady, setStage4StaffReady] = useState(false);
  const [assignmentDashboard, setAssignmentDashboard] = useState<any>(null);
  const [shareUsers, setShareUsers] = useState<any[]>([]);
  const [conflictThreshold, setConflictThreshold] = useState(2.0);
  const [isAutoAssigningRewrite, setIsAutoAssigningRewrite] = useState(false);
  const [rewriteAssignments, setRewriteAssignments] = useState<any[]>([]);
  const [remindingStaffId, setRemindingStaffId] = useState<string | null>(null);
  const [reviewingRewriteId, setReviewingRewriteId] = useState<string | null>(null);
  const [sampleComparisons, setSampleComparisons] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [rewriteAssignPage, setRewriteAssignPage] = useState(1);
  const [showRewriteStaffPicker, setShowRewriteStaffPicker] = useState(false);
  const [showRewriteProgress, setShowRewriteProgress] = useState(false);
  const [adminRewriteModal, setAdminRewriteModal] = useState<any>(null);
  const [reviewSubmissionModal, setReviewSubmissionModal] = useState<any>(null);
  const [adminRewriteDraft, setAdminRewriteDraft] = useState('');
  const [isSavingAdminRewrite, setIsSavingAdminRewrite] = useState(false);
  const [isSuggestingAI, setIsSuggestingAI] = useState(false);
  const rewriteReasonOptions = [
    'None',
    'Direct answer too early',
    'Missing Socratic hint',
    'Low training value',
    'Factual error',
    'Tone/language issue',
    'Incomplete answer',
  ];

  useEffect(() => {
    // Step 7 no longer exists; redirect to 8 (the new lobby gate).
    if (currentSubStep4 === 7) setCurrentSubStep4(8);
  }, [currentSubStep4, setCurrentSubStep4]);

  const reviewRewriteTask = async (task: any, action: 'approved' | 'redo' | 'rejected') => {
    if (!activeVersionId || !task?.id) return;
    const note = action === 'approved' ? 'Được duyệt bởi Supervisor' : window.prompt(action === 'redo' ? 'Lý do yêu cầu Staff làm lại:' : 'Lý do từ chối rewrite:');
    if (action !== 'approved' && !note?.trim()) return;
    setReviewingRewriteId(task.id);
    try {
      const response = await stage4Api.reviewRewrite(activeVersionId, task.id, action, note || '');
      setRewriteAssignments(prev => prev.map(item => item.id === task.id ? response.task : item));
      if (action === 'approved') setCompletedRewrites(prev => ({ ...prev, [String(task.sampleId)]: true }));
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Không thể lưu quyết định review.');
    } finally { setReviewingRewriteId(null); }
  };

  useEffect(() => {
    if (!activeVersionId || ![10, 11].includes(currentSubStep4)) return; // step 10=Rewrite Assignment, 11=Assignment Review
    let cancelled = false;
    const loadRewriteProgress = () => stage4Api.listRewriteAssignments(activeVersionId)
      .then((response) => { if (!cancelled) setRewriteAssignments(response.tasks || []); })
      .catch((error) => console.error('Failed to load rewrite progress', error));
    loadRewriteProgress();
    const timer = window.setInterval(loadRewriteProgress, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeVersionId, currentSubStep4]);

  useEffect(() => {
    if (!(currentSubStep4 === 8 || currentSubStep4 === 10 || currentSubStep4 === 11 || currentSubStep4 === 12) || !activeVersionId) return;

    let cancelled = false;
    const refreshAssignmentDashboard = () => {
      apiService.getDatasetVersionAssignmentDashboard(activeVersionId).then(dash => {
        if (cancelled) return;
        setAssignmentDashboard(dash);
        // Staff submissions change comparison inputs. Refresh every overlapping
        // sample now instead of waiting for a click or keeping stale cached data.
        // Dashboard does not expose a samples array. Refresh comparisons using
        // the actual quality-result sample ids currently rendered in the table.
        const comparisonRequests = (qualityResult?.items || [])
          .map(async (sample: any) => {
            const sampleId = String(sample._id || sample.sampleObjectId || '');
            if (!sampleId) return null;
            try {
              const comparison = await apiService.getDatasetVersionAssignmentSampleComparison(activeVersionId, sampleId);
              return [sampleId, comparison] as const;
            } catch (err) {
              console.error('Failed to refresh staff score:', sampleId, err);
              return null;
            }
          });
        void Promise.all(comparisonRequests).then((entries) => {
          if (cancelled) return;
          const next = { ...sampleComparisonsRef.current };
          entries.forEach((entry) => { if (entry) next[entry[0]] = entry[1]; });
          sampleComparisonsRef.current = next;
          setSampleComparisons(next);
        });
      }).catch(err => console.error('Failed to fetch assignment dashboard for Stage 4 Lobby:', err));
      apiService.listUsers().then(res => {
        if (cancelled) return;
        const activeStaff = (res as any).users?.filter((u: any) => u.role === 'staff' && u.status === 'active') || [];
        const staffArr = activeStaff.map((u: any) => ({ _id: u.id, name: u.name, email: u.email, username: u.username }));
        setShareUsers(staffArr);
      }).catch(err => console.error('Failed to fetch users:', err));
    };

    refreshAssignmentDashboard();
    const intervalId = window.setInterval(refreshAssignmentDashboard, currentSubStep4 === 8 ? 5000 : 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentSubStep4, activeVersionId, labelingStatus?.labeledSamples, labelingStatus?.unlabeledSamples, qualityResult?.items]);

  const loadSampleComparison = useCallback(async (sampleId: string) => {
    if (!activeVersionId || !sampleId) return null;
    if (sampleComparisonsRef.current[sampleId]) {
      setSampleComparisons((prev) => ({ ...prev, [sampleId]: sampleComparisonsRef.current[sampleId] }));
      return sampleComparisonsRef.current[sampleId];
    }
    try {
      const comparison = await apiService.getDatasetVersionAssignmentSampleComparison(activeVersionId, sampleId);
      sampleComparisonsRef.current[sampleId] = comparison;
      setSampleComparisons((prev) => ({ ...prev, [sampleId]: comparison }));
      return comparison;
    } catch (err) {
      console.error('Failed to fetch staff labels for sample:', sampleId, err);
      return null;
    }
  }, [activeVersionId]);

  useEffect(() => {
    if (!activeVersionId) return;
    const sampleIds = new Set<string>();
    if (reviewDetailModal) {
      sampleIds.add(String(reviewDetailModal.sampleObjectId || reviewDetailModal.id));
    }
    if (currentSubStep4 === 10) {
      const rewriteItems = (qualityResult?.items || []).filter((i: any) => ['Rewrite', 'Reject', 'Bad'].includes(i.bucket));
      const activeItem = rewriteItems[rewriteConvIdx] || rewriteItems[0];
      if (activeItem?._id) sampleIds.add(String(activeItem._id));
    }
    if (currentSubStep4 === 8 && qualityResult?.items?.length) {
      const start = (currentPage - 1) * itemsPerPage;
      qualityResult.items.slice(start, start + itemsPerPage).forEach((item: any) => {
        if (item?._id) sampleIds.add(String(item._id));
      });
    }
    Array.from(sampleIds).forEach((sampleId) => {
      if (sampleId && !sampleComparisonsRef.current[sampleId]) {
        void loadSampleComparison(sampleId);
      }
    });
  }, [
    activeVersionId,
    reviewDetailModal?.sampleObjectId,
    reviewDetailModal?.id,
    currentSubStep4,
    rewriteConvIdx,
    currentPage,
    itemsPerPage,
    qualityResult?.items,
    loadSampleComparison,
  ]);

  const SUB_STEPS_STAGE4 = [
    { num: 8, label: 'Xem xét Chất lượng' },
    { num: 9, label: 'Giao task Viết lại' },
    { num: 10, label: 'Duyệt bài Viết lại' },
    { num: 11, label: 'Phân phối Dataset' },
  ];

  const handleStartScoring = async () => {
    const selectedModels = Object.keys(judgeModels).filter(k => judgeModels[k]);
    if (selectedModels.length === 0) {
      alert('Vui lòng chọn ít nhất 1 mô hình AI Judge.');
      return;
    }
    try {
      setSepRunningEval(true);
      await runMultiEval(selectedModels, 'No Context');
    } catch (err: any) {
      alert(err.message || 'Không thể bắt đầu chấm điểm');
    } finally {
      setSepRunningEval(false);
    }
  };

  const handleAdjudicateQuality = async (sampleId: string, finalClassification: any, note?: string) => {
    try {
      await adjudicateQuality({ sampleId, finalClassification, note });
    } catch (err: any) {
      alert(err.message || 'Failed to adjudicate quality');
    }
  };

  const handleAdminSetVerdict = async (item: any, finalClassification: 'Gold' | 'Rewrite' | 'Reject') => {
    try {
      await handleAdjudicateQuality(item.sampleObjectId || item.id, finalClassification, `Supervisor đã đặt kết quả ${finalClassification} trong Stage 4.`);
      setSepQualityLabels((prev: any) => ({ ...prev, [item.id]: finalClassification }));
      if (item.scores?.resultId) {
        const action = finalClassification === 'Gold' ? 'approve' : finalClassification === 'Rewrite' ? 'rewrite' : 'reject';
        await adjudicateMultiEvalResult(item.scores.resultId, action as any, `Supervisor đã đặt kết quả ${finalClassification} trong Stage 4.`);
      }
      setReviewDetailModal((prev: any) => prev ? { ...prev, bucket: finalClassification } : prev);
    } catch (err: any) {
      alert(err.message || 'Không thể cập nhật kết luận');
    }
  };

  const handleAssignSingleRewrite = async (itemId: string, staffName: string) => {
    const staff = shareUsers.find(u => u.name === staffName || u.username === staffName || u.email === staffName);
    if (!staff || !activeVersionId) return;
    const staffId = String(staff._id || staff.id);

    const item = (qualityResult?.items || []).find((i: any) => String(i._id || i.id) === String(itemId) || String(i.sampleObjectId) === String(itemId));
    if (!item) return;

    const messages = item.data?.messages || item.messages || [];
    
    // Support multiple message indices selected
    const targetIndices = item.errorMessageIndices && item.errorMessageIndices.length > 0
      ? item.errorMessageIndices
      : (() => {
          let targetIdx = item.errorMessageIndex ?? -1;
          if (targetIdx < 0) {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]?.role === 'assistant') {
                targetIdx = i;
                break;
              }
            }
          }
          return targetIdx >= 0 ? [targetIdx] : [1];
        })();

    try {
      for (const targetIdx of targetIndices) {
        const originalText = targetIdx >= 0 ? String(messages[targetIdx]?.content || messages[targetIdx]?.text || '') : '';
        await stage4Api.assignRewrite(activeVersionId, {
          sampleId: String(item.sampleObjectId || item._id || item.id),
          assigneeId: staffId,
          convId: String(item.convId || item.sampleId || item.id),
          subject: item.subject || '',
          reason: rewriteReasons[item.id] || item.issue || 'Quality review requires rewrite',
          originalText,
          targetMessageIndex: targetIdx >= 0 ? targetIdx : undefined,
          contextMode: 'n-2:n+3'
        });
      }
      setReassignStaff((prev: any) => ({ ...prev, [item.id]: staffName }));
      const refreshed = await stage4Api.listRewriteAssignments(activeVersionId);
      setRewriteAssignments(refreshed.tasks || []);
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Không thể giao task rewrite.');
    }
  };

  const handleExportDataset = () => {
    const blocking = rewriteAssignments.filter((task: any) => task.status !== 'approved' && task.status !== 'rejected');
    if (blocking.length > 0) {
      alert(`Chưa thể export: còn ${blocking.length} rewrite task chưa được duyệt hoặc từ chối.`);
      return;
    }
    if (!activeVersionId) return alert('Missing dataset version.');
    window.open(`${import.meta.env.VITE_API_URL || '/api'}/dataprep/export/${activeVersionId}`, '_blank');
  };

  // --- HELPER FUNCTIONS FOR BACKEND INTEGRATION ---
  const getSeededSubject = (sampleId: string) => {
    const num = parseInt(sampleId.replace('conv_', '').replace('sample_', ''));
    if (isNaN(num)) return 'MATH';
    const subjects = ['MATH', 'PHYSICAL', 'CHEMISTRY', 'BIOLOGY', 'LITERATURE'];
    return subjects[(num - 1) % subjects.length];
  };

  const mapBackendMessagesToUiMessages = (messages: any[]): any[] => {
    if (!Array.isArray(messages)) return [];
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      text: msg.content || ''
    }));
  };

  // Derive a 0-10 rule score from the quality item's scored turnPairs (backend already
  // ran the intent/action matching, so this just averages turnScore -> 10-point scale).
  const ruleScoreFromTurnPairs = (item: any): number | null => {
    const pairs = Array.isArray(item?.turnPairs) ? item.turnPairs : [];
    const scorable = pairs.filter((p: any) => Number.isFinite(Number(p?.turnScore)));
    if (!scorable.length) return null;
    const raw = scorable.reduce((sum: number, p: any) => sum + Number(p.turnScore), 0) / scorable.length;
    return Number(Math.max(0, Math.min(10, ((raw + 1) / 2) * 10)).toFixed(1));
  };

  const toTenPointHumanScore = (item: any): number | null => {
    if (!item) return null;
    // 1. Prioritize the actual numeric human score when present AND > 0
    // (backend returns 0 when staff hasn't labeled any messages, which is not meaningful)
    if (item.humanScore !== undefined && item.humanScore !== null && Number(item.humanScore) > 0) {
      return Number(item.humanScore);
    }
    // 2. Compute directly from scored turn pairs (available right after staff submit)
    const fromTurns = ruleScoreFromTurnPairs(item);
    if (fromTurns !== null) return fromTurns;
    // 3. Fall back to bucket-based heuristics
    if (item.bucket === 'Incomplete') return null;
    if (item.bucket === 'Gold') return 9;
    if (item.bucket === 'Rewrite') return 5.5;
    // Treat 'Bad' exactly the same as 'Reject'
    if (item.bucket === 'Reject' || item.bucket === 'Bad') return 2;
    const raw = Number(item.score);
    if (!Number.isFinite(raw)) return null;
    if (raw >= -1 && raw <= 1) {
      return Math.round(((raw + 1) / 2) * 100) / 10;
    }
    return Math.max(0, Math.min(10, raw));
  };

  // Rule-based score (mirrors backend quality.service intent/action matching) so the
  // Staff Rule Score can be derived directly from the message-scope comparison targets.
  const RULE_VALID_ACTIONS: Record<string, string[]> = {
    ANSWER_ATTEMPT: ['CONFIRM_CORRECT_ANSWER', 'IDENTIFY_INCORRECT_ANSWER', 'CORRECT_MISTAKE', 'SCAFFOLDING'],
    CORRECT: ['PRAISING', 'CONFIRM_CORRECT_ANSWER'],
    INCORRECT: ['SCAFFOLDING'],
    REQUEST_HINT: ['HINTING', 'SCAFFOLDING'],
    ASK_THEORY: ['CONCEPT_CLARIFY', 'LOGIC_BREAKDOWN'],
    REQUEST_EXPLANATION: ['LOGIC_BREAKDOWN', 'CONCEPT_CLARIFY'],
    REQUEST_SIMPLER: ['SIMPLIFYING'],
    SKIP_EXERCISE: ['NAVIGATING'],
    ENCOURAGE: ['MOTIVATING'],
    OFF_TOPIC: ['REDIRECTING', 'TRANSITIONING'],
    NEXT_SECTION: ['TRANSITIONING', 'NAVIGATING'],
  };
  const RULE_HARMFUL_ACTIONS: Record<string, string[]> = {
    ANSWER_ATTEMPT: ['DIRECT_ANSWER'],
    INCORRECT: ['PRAISING'],
    REQUEST_HINT: ['LOGIC_BREAKDOWN'],
  };
  const RULE_USER_INTENTS = new Set(Object.keys(RULE_VALID_ACTIONS));
  const RULE_ASSISTANT_ACTIONS = new Set([
    ...Object.values(RULE_VALID_ACTIONS).flat(),
    'WAITING',
    'DIRECT_ANSWER',
  ]);

  const DRAFT_INTENT_MAP: Record<string, string> = {
    'Ask Explanation': 'REQUEST_EXPLANATION',
    'Solve Exercise': 'INCORRECT',
    'Request Formula': 'ASK_THEORY',
    'Confirm Understanding': 'NEXT_SECTION',
    'Ask Example': 'REQUEST_SIMPLER',
    Hint: 'REQUEST_HINT',
    Ques: 'REQUEST_EXPLANATION',
    'Ques/Hint': 'REQUEST_HINT',
    Other: 'WAIT_READY',
  };
  const DRAFT_ACTION_MAP: Record<string, string> = {
    'Guide Step-by-step': 'LOGIC_BREAKDOWN',
    'Give Hint': 'HINTING',
    'Ask Probing Question': 'SCAFFOLDING',
    'Provide Formula': 'CONCEPT_CLARIFY',
    Encourage: 'MOTIVATING',
    'Correct Error': 'SCAFFOLDING',
    Summarize: 'TRANSITIONING',
    Hint: 'HINTING',
    Ques: 'SCAFFOLDING',
    'Ques/Hint': 'SCAFFOLDING',
    Other: 'WAITING',
  };

  const FRONTEND_STAGE3_TO_BACKEND_MAP: Record<string, string> = {
    'ANS': 'ANSWER_ATTEMPT',
    'HINT': 'REQUEST_HINT',
    'THEO': 'ASK_THEORY',
    'WHY': 'REQUEST_EXPLANATION',
    'EASY': 'REQUEST_SIMPLER',
    'SKIP': 'SKIP_EXERCISE',
    'DIS': 'ENCOURAGE',
    'OFF': 'OFF_TOPIC',
    'RDY': 'NEXT_SECTION',
    'CFM': 'NEXT_SECTION',
    'CONFIRM_UNDERSTANDING': 'NEXT_SECTION',
    'CONFIRM': 'NEXT_SECTION',
    'UNDERSTOOD': 'NEXT_SECTION',

    'CONF': 'CONFIRM_CORRECT_ANSWER',
    'WRONG': 'IDENTIFY_INCORRECT_ANSWER',
    'FIX': 'CORRECT_MISTAKE',
    'SCAF': 'SCAFFOLDING',
    'CLR': 'CONCEPT_CLARIFY',
    'LOG': 'LOGIC_BREAKDOWN',
    'SIMP': 'SIMPLIFYING',
    'PR': 'PRAISING',
    'MOT': 'MOTIVATING',
    'REDIR': 'REDIRECTING',
    'TRAN': 'TRANSITIONING',
    'DIR': 'DIRECT_ANSWER',
    'WAIT': 'WAITING',
    'WAITING': 'WAITING',
    'DIRECT_ANSWER': 'DIRECT_ANSWER'
  };

  const normalizeStaffLabelCode = (raw: string, role: string): string => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const upper = trimmed.toUpperCase();
    if (FRONTEND_STAGE3_TO_BACKEND_MAP[upper]) {
      return FRONTEND_STAGE3_TO_BACKEND_MAP[upper];
    }
    if (role === 'user') {
      if (DRAFT_INTENT_MAP[trimmed]) return DRAFT_INTENT_MAP[trimmed];
      if (DRAFT_INTENT_MAP[upper]) return DRAFT_INTENT_MAP[upper];
      return upper;
    }
    if (role === 'assistant') {
      if (DRAFT_ACTION_MAP[trimmed]) return DRAFT_ACTION_MAP[trimmed];
      if (DRAFT_ACTION_MAP[upper]) return DRAFT_ACTION_MAP[upper];
      return upper;
    }
    return upper;
  };

  const displayStaffLabel = (raw: string, role: string, displayLabel?: string): string => {
    if (displayLabel) return displayLabel;
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    if (role === 'user') {
      const mapped = Object.entries(DRAFT_INTENT_MAP).find(([, code]) => code === trimmed);
      if (mapped) return mapped[0];
    }
    if (role === 'assistant') {
      const mapped = Object.entries(DRAFT_ACTION_MAP).find(([, code]) => code === trimmed);
      if (mapped) return mapped[0];
    }
    return trimmed;
  };

  const getComparisonForSample = (sampleId?: string, sampleKey?: string) => {
    const candidates = [sampleId, sampleKey].filter(Boolean).map(String);
    for (const id of candidates) {
      if (sampleComparisons[id]) return sampleComparisons[id];
    }
    return null;
  };

  const getStaffSubjectFromComparison = (comparison: any) => {
    if (!comparison?.targets) return 'Chưa chốt';
    const sampleTarget = comparison.targets.find((t: any) =>
      t.targetScope === 'sample' &&
      Number(t.messageIndex) === 0 &&
      Array.isArray(t.annotators) &&
      t.annotators.some((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
    );
    if (!sampleTarget) return 'Chưa chốt';

    // "Chưa rõ" là một nhãn nghiệp vụ Staff có thể chọn, không phải trạng thái
    // duyệt. Khi các reviewer còn xung đột, Supervisor chỉ được thấy "Chưa chốt".
    if (sampleTarget.hasConflict && sampleTarget.adjudication?.status !== 'published') {
      return 'Chưa chốt';
    }

    const canonical = sampleTarget.annotators.find((a: any) =>
      (a.isCanonical || a.annotator?.role === 'checker' || a.annotator?.role === 'supervisor' || a.annotator?.role === 'admin') &&
      Array.isArray(a.labels) && a.labels.length > 0
    );
    const relevantAnnotators = canonical ? [canonical] : sampleTarget.annotators;
    const excluded = new Set(['COMPLETED', 'INCOMPLETE', 'ABANDONED', 'GOOD', 'MEDIUM', 'POOR']);
    for (const annotator of relevantAnnotators) {
      const labels = Array.isArray(annotator.labels) ? annotator.labels : [];
      const displays = Array.isArray(annotator.displayLabels) ? annotator.displayLabels : labels;
      for (let i = 0; i < labels.length; i += 1) {
        const code = String(labels[i] || '').toUpperCase();
        const display = String(displays[i] || labels[i] || '');
        if (!display || excluded.has(code) || excluded.has(display.toUpperCase())) continue;
        return display;
      }
    }
    return 'Chưa chốt';
  };

  const getUiMessagesForSample = (sampleId?: string, sampleKey?: string) => {
    const candidates = [sampleId, sampleKey].filter(Boolean).map(String);
    const humanItem = qualityResult?.items?.find((i: any) =>
      candidates.includes(String(i.sampleId)) || candidates.includes(String(i._id))
    );
    return mapBackendMessagesToUiMessages(humanItem?.data?.messages || []);
  };

  const buildMessageLabelIndex = (comparison: any) => {
    const map = new Map<number, { user: string[]; assistant: string[] }>();
    if (!Array.isArray(comparison?.targets)) return map;

    comparison.targets.forEach((t: any) => {
      if (t.targetScope !== 'message') return;
      const idx = Number(t.messageIndex);
      const role = t.messageRole === 'assistant' ? 'assistant' : 'user';
      if (!Number.isInteger(idx) || !Array.isArray(t.annotators)) return;

      // Partition annotators for this specific target
      const checkerAnn = t.annotators.filter((a: any) =>
        a.isCanonical || a.annotator?.role === 'checker' ||
        a.annotator?.role === 'supervisor' || a.annotator?.role === 'admin' || a.isOwner
      );
      
      let relevantAnnotators: any[] = [];
      if (checkerAnn.some((a: any) => Array.isArray(a.labels) && a.labels.length > 0)) {
        relevantAnnotators = checkerAnn;
      } else {
        // No checker labels on this target. Check staff.
        const staffAnn = t.annotators.filter((a: any) => !checkerAnn.includes(a));
        const staffWithLabels = staffAnn.filter((a: any) => Array.isArray(a.labels) && a.labels.length > 0);
        
        if (staffWithLabels.length < 2) {
          relevantAnnotators = staffWithLabels;
        } else {
          // Check if all staff agree on their labels for this target
          const userLabelsMap = new Map<string, string[]>();
          staffWithLabels.forEach((a: any) => {
            const userId = String(a.annotator?.id || a.annotator?._id || '');
            const codes = (a.labels || []).map((l: string) => normalizeStaffLabelCode(l, role));
            if (userId && codes.length > 0) {
              userLabelsMap.set(userId, codes);
            }
          });
          
          let staffAgreed = false;
          if (userLabelsMap.size > 0) {
            const lists = Array.from(userLabelsMap.values());
            const firstList = lists[0].slice().sort();
            staffAgreed = lists.every(list => {
              if (list.length !== firstList.length) return false;
              const sorted = list.slice().sort();
              return sorted.every((val, index) => val === firstList[index]);
            });
          }
          
          if (staffAgreed) {
            relevantAnnotators = staffWithLabels;
          } else {
            // Disagree and no checker resolved yet → no labels
            relevantAnnotators = [];
          }
        }
      }

      const labels = Array.from(new Set(
        relevantAnnotators.flatMap((a: any) => {
          const codes = Array.isArray(a.labels) ? a.labels : [];
          return codes.map((l: string) => normalizeStaffLabelCode(l, role));
        })
      )) as string[];
      if (!labels.length) return;
      const entry = map.get(idx) || { user: [], assistant: [] };
      entry[role] = Array.from(new Set([...entry[role], ...labels]));
      map.set(idx, entry);
    });
    return map;
  };

  // Compute a 0-10 rule score from the comparison message labels (null if nothing scorable)
  const computeRuleScoreFromComparison = (comparison: any, uiMessages: any[]): number | null => {
    const idx = buildMessageLabelIndex(comparison);
    if (idx.size === 0) return null;
    let totalTurnScore = 0;
    let scorableTurns = 0;
    for (let i = 0; i < uiMessages.length; i += 1) {
      if (uiMessages[i]?.role !== 'user') continue;
      let assistantPos = -1;
      for (let j = i + 1; j < uiMessages.length; j += 1) {
        if (uiMessages[j]?.role === 'assistant') { assistantPos = j; break; }
      }
      if (assistantPos === -1) continue;
      const userLabels = (idx.get(i)?.user || []).filter((l) => RULE_USER_INTENTS.has(l));
      const assistantLabels = (idx.get(assistantPos)?.assistant || []).filter((l) => RULE_ASSISTANT_ACTIONS.has(l));
      if (!userLabels.length || !assistantLabels.length) continue;
      const intentValues: number[] = [];
      userLabels.forEach((intent) => {
        const valid = RULE_VALID_ACTIONS[intent];
        if (!valid) return;
        const matched = assistantLabels.some((a) => valid.includes(a));
        const harmful = assistantLabels.filter((a) => (RULE_HARMFUL_ACTIONS[intent] || []).includes(a)).length;
        intentValues.push(harmful > 0 ? -1 : matched ? 1 : -0.5);
      });
      if (!intentValues.length) continue;
      totalTurnScore += intentValues.includes(-1) ? -1 : Math.max(...intentValues);
      scorableTurns += 1;
    }
    if (scorableTurns === 0) return null;
    const raw = totalTurnScore / scorableTurns;
    return Number(Math.max(0, Math.min(10, ((raw + 1) / 2) * 10)).toFixed(1));
  };

  const getResultSampleId = (r: any) => String(r.sampleId?._id || r.sampleId || r.sampleIdRef?._id || r.sampleIdRef?.sampleId || '');

  const getQualityItemForSample = (sampleObjectId?: string, convId?: string) => {
    const candidates = [sampleObjectId, convId].filter(Boolean).map(String);
    return qualityResult?.items?.find((i: any) =>
      candidates.includes(String(i._id)) || candidates.includes(String(i.sampleId))
    );
  };

  const getEvalResultForSample = (sampleObjectId?: string, convId?: string) => {
    const candidates = [sampleObjectId, convId].filter(Boolean).map(String);
    return results.find((r: any) =>
      candidates.includes(getResultSampleId(r)) || candidates.includes(String(r.sampleIdRef?.sampleId || ''))
    );
  };

  const resolveStaffHumanScore = (sampleObjectId?: string, convId?: string) => {
    const qualityItem = getQualityItemForSample(sampleObjectId, convId);
    const evalMatch = getEvalResultForSample(sampleObjectId, convId);
    const fromQuality = toTenPointHumanScore(qualityItem);
    const fromEval = evalMatch?.scores?.human ?? evalMatch?.scores?.Human ?? evalMatch?.humanScore;
    const fromComparison = computeRuleScoreFromComparison(
      getComparisonForSample(sampleObjectId, convId),
      getUiMessagesForSample(sampleObjectId, convId)
    );
    if (fromQuality != null) return fromQuality;
    if (fromEval != null && Number.isFinite(Number(fromEval))) return Number(fromEval);
    if (fromComparison != null) return fromComparison;
    return null;
  };

  const getScoresForSample = (sampleId: string, sampleKey?: string) => {
    const candidates = [sampleId, sampleKey].filter(Boolean).map(String);
    const resMatch = results.find(r => candidates.includes(getResultSampleId(r)) || candidates.includes(String(r.sampleIdRef?.sampleId || '')));
    const humanItem = qualityResult?.items?.find(i => candidates.includes(String(i.sampleId)) || candidates.includes(String(i._id)));
    const comparison = getComparisonForSample(sampleId, sampleKey);
    const uiMessages = getUiMessagesForSample(sampleId, sampleKey);
    const ruleScoreFromComparison = computeRuleScoreFromComparison(comparison, uiMessages);

    const resolveHumanScore = (baseHuman: number | null | undefined) => {
      // Comparison is live submission data; quality/eval values can be a stale
      // snapshot from before the second Staff submitted.
      if (ruleScoreFromComparison != null) return ruleScoreFromComparison;
      if (baseHuman != null && Number.isFinite(Number(baseHuman))) return Number(baseHuman);
      return resolveStaffHumanScore(sampleId, sampleKey);
    };

    if (resMatch) {
      const modelScores = resMatch.modelScores || {};
      const openrouter = resMatch.scores?.openrouter || resMatch.scores?.OpenRouter || modelScores.openrouter?.overall || resMatch.scores?.gemini || resMatch.scores?.Gemini || modelScores.gemini?.overall || null;
      const deepseek = resMatch.scores?.deepseek || resMatch.scores?.Deepseek || modelScores.deepseek?.overall || null;
      const groq = resMatch.scores?.groq || resMatch.scores?.Groq || modelScores.groq?.overall || resMatch.scores?.openai || resMatch.scores?.OpenAI || modelScores.openai?.overall || null;
      const human = (resMatch.pendingAdjudication || humanItem?.pendingAdjudication)
        ? null
        : resolveHumanScore(
            toTenPointHumanScore(humanItem) ?? resMatch.scores?.human ?? resMatch.scores?.Human
          );
      const aiVals = [openrouter, deepseek, groq].filter(v => v != null) as number[];
      const avgAI = resMatch.averageOverall ?? resMatch.averageScore ?? (aiVals.length ? aiVals.reduce((a, b) => a + b, 0) / aiVals.length : null);
      const diff = avgAI != null && human != null ? Math.abs(avgAI - human) : (resMatch.diff || 0);
      return {
        openrouter,
        deepseek,
        groq,
        human,
        conflict: !resMatch.pendingAdjudication && !humanItem?.pendingAdjudication && (Boolean(resMatch.hasConflict) || resMatch.recommendation === 'Conflict' || (human != null && diff >= conflictThreshold)),
        resultId: resMatch._id,
        finalRecommendation: resMatch.finalRecommendation,
        supervisorAction: resMatch.supervisorAction || resMatch.adjudicationAction,
        supervisorNote: resMatch.supervisorNote || resMatch.adjudicationNote,
      };
    }
    const human = humanItem?.pendingAdjudication ? null : resolveHumanScore(toTenPointHumanScore(humanItem));
    return {
      openrouter: null,
      deepseek: null,
      groq: null,
      human,
      conflict: false
    };
  };

  const getAvgAI = (scores) => {
    const vals = [scores.openrouter, scores.deepseek, scores.groq].filter(v => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const getTurnPairsForSample = (sampleObjectId?: string, convId?: string, item?: any) => {
    if (Array.isArray(item?.turnPairs) && item.turnPairs.length > 0) return item.turnPairs;
    const qualityItem = getQualityItemForSample(sampleObjectId, convId);
    if (Array.isArray(qualityItem?.turnPairs) && qualityItem.turnPairs.length > 0) return qualityItem.turnPairs;
    const evalMatch = getEvalResultForSample(sampleObjectId, convId);
    if (Array.isArray(evalMatch?.turnPairs) && evalMatch.turnPairs.length > 0) return evalMatch.turnPairs;
    return [];
  };

  const buildStaffMessageLabels = (
    messageIndex: number,
    role: string,
    turnPairs: any[],
    messageLevelTargets: any[],
  ) => {
    const kindForRole = (r: string): 'Intent' | 'Action' => (r === 'user' ? 'Intent' : 'Action');

    const allLabels = messageLevelTargets
      .filter((target: any) => Number(target.messageIndex) === messageIndex && target.messageRole === role)
      .flatMap((target: any) => target.annotators
        .filter((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
        .flatMap((a: any) => {
          const codes = Array.isArray(a.labels) ? a.labels : [];
          const displays = Array.isArray(a.displayLabels) ? a.displayLabels : codes;
          
          let source: 'staff' | 'checker' | 'supervisor' | 'ai' = 'staff';
          if (a.isCanonical || a.annotator?.role === 'checker') {
            source = 'checker';
          } else if (a.isOwner || a.annotator?.role === 'supervisor' || a.annotator?.role === 'admin') {
            source = 'supervisor';
          }

          return codes.map((lbl: string, labelIndex: number) => ({
            label: displayStaffLabel(lbl, role, displays[labelIndex]),
            kind: kindForRole(role),
            staff: a.annotator?.name || a.annotator?.email || (a.isOwner ? 'Owner' : 'Staff'),
            isOwner: Boolean(a.isOwner),
            source,
          }));
        })
      );

    if (allLabels.length > 0) {
      // Filter to only show the final level of labeling for this message
      const supervisorLabels = allLabels.filter(l => l.source === 'supervisor');
      if (supervisorLabels.length > 0) return supervisorLabels;

      const checkerLabels = allLabels.filter(l => l.source === 'checker');
      if (checkerLabels.length > 0) return checkerLabels;

      return allLabels;
    }

    const turn = turnPairs.find((t: any) =>
      t.userMessageIndex === messageIndex || t.assistantMessageIndex === messageIndex
    );
    const turnLabels: string[] = role === 'user' ? (turn?.userLabels || []) : (turn?.assistantLabels || []);
    return turnLabels.map((label: string) => ({
      label: displayStaffLabel(label, role),
      kind: kindForRole(role),
      staff: 'Staff',
      isOwner: false,
      source: 'staff' as const,
    }));
  };

  const openReviewDetailModal = (item: any) => {
    const sampleId = String(item.sampleObjectId || item.id);
    const turnPairs = getTurnPairsForSample(sampleId, item.convId, item);
    const scores = getScoresForSample(sampleId, item.convId);
    const humanScore = scores.human ?? item.humanScore ?? resolveStaffHumanScore(sampleId, item.convId);
    setReviewDetailModal({
      ...item,
      turnPairs,
      humanScore,
      scores: { ...scores, human: humanScore },
    });
    void loadSampleComparison(sampleId);
  };

  const displayQualityItems = qualityResult?.items ? qualityResult.items.map(item => {
    const sampleId = String(item._id);
    const evalMatch = getEvalResultForSample(sampleId, String(item.sampleId));
    const turnPairs = (item.turnPairs?.length ? item.turnPairs : evalMatch?.turnPairs) || [];
    const liveComparisonScore = computeRuleScoreFromComparison(
      getComparisonForSample(sampleId, String(item.sampleId)),
      mapBackendMessagesToUiMessages(item.data?.messages || [])
    );
    const humanScore = liveComparisonScore ?? item.humanScore ?? evalMatch?.humanScore ?? evalMatch?.scores?.human ?? null;

    // Unified verdict: blend staff (60%) + AI (40%); fall back to whichever exists.
    const avgAIForItem = evalMatch?.averageOverall ?? evalMatch?.averageScore ?? null;
    const combinedScore = evalMatch?.combinedScore ?? (
      (humanScore != null && avgAIForItem != null)
        ? Math.round((0.6 * Number(humanScore) + 0.4 * Number(avgAIForItem)) * 10) / 10
        : (humanScore ?? avgAIForItem)
    );
    const combinedBucket = evalMatch?.finalBucket ?? (
      combinedScore == null
        ? item.bucket
        : combinedScore >= 7 ? 'Gold' : combinedScore >= 5 ? 'Rewrite' : 'Reject'
    );
    return {
      id: item._id,
      sampleObjectId: item._id,
      convId: item.sampleId,
      subject: getStaffSubjectFromComparison(getComparisonForSample(sampleId, String(item.sampleId))),
      ...item,
      bucket: combinedBucket,
      combinedScore,
      turnPairs,
      humanScore,
      score: item.score,
      issue: item.conflict ? 'Conflict' : 'None',
      issueKey: item.conflict ? 'conflict' : 'none',
      reason: item.note || 'Chưa có nhận xét',
      errorMessageIndices: item.errorMessageIndices ?? (item.errorMessageIndex != null ? [item.errorMessageIndex] : []),
      errorMessageIndex: item.errorMessageIndex ?? null,
      messages: mapBackendMessagesToUiMessages(item.data?.messages || []),
      rawItem: item,
      pendingAdjudication: Boolean(item.pendingAdjudication || evalMatch?.pendingAdjudication),
    };
  }) as any[] : [];

  const stage4TotalSamples = labelingStatus?.totalSamples || qualityResult?.totalSamples || 0;
  const stage4LabeledSamples = labelingStatus?.labeledSamples || 0;
  const stage4UnlabeledSamples = labelingStatus?.unlabeledSamples || Math.max(stage4TotalSamples - stage4LabeledSamples, 0);
  const stage4CompletionPct = stage4TotalSamples > 0 ? Math.round((stage4LabeledSamples / stage4TotalSamples) * 100) : 0;
  const assignmentRows = Array.isArray(assignmentDashboard?.users) ? assignmentDashboard.users : [];
  const draftTotalSamples = assignmentRows.reduce((sum: number, row: any) => sum + Number(row.assignedSamples || 0), 0);
  const draftLabeledSamples = assignmentRows.reduce((sum: number, row: any) => {
    const submitted = ['submitted', 'approved'].includes(String(row.submission?.status || ''));
    return sum + (submitted ? Number(row.assignedSamples || 0) : Number(row.submission?.labeledCount || 0));
  }, 0);
  const step7DisplayTotal = draftTotalSamples || stage4TotalSamples;
  const step7DisplayLabeled = Math.max(draftLabeledSamples, stage4LabeledSamples);
  const step7DisplayPct = step7DisplayTotal > 0 ? Math.round((step7DisplayLabeled / step7DisplayTotal) * 100) : stage4CompletionPct;
  const allAssignedStaffSubmitted = assignmentRows.length > 0 && assignmentRows.every((row: any) => {
    const total = Number(row.assignedSamples || 0);
    const status = String(row.submission?.status || '').toLowerCase();
    return total > 0 && ['submitted', 'approved'].includes(status);
  });
  const hardLabelsReady = stage4TotalSamples > 0 && (stage4UnlabeledSamples === 0 || Boolean(labelingStatus?.incompleteBucket));
  // With assigned Staff, one submission must not unlock the next stage or hide
  // the progress lobby. Wait until every assigned Staff has submitted.
  const stage4CanScore = assignmentDashboard === null
    ? false
    : assignmentRows.length > 0
      ? allAssignedStaffSubmitted
      : hardLabelsReady;
  const scoringComplete = latestJob?.status === 'completed' || results.length > 0;
  const getStaffLabeledSamples = (u: any) => {
    const total = Number(u.assignedSamples || 0);
    const submissionStatus = String(u.submission?.status || '').toLowerCase();
    if (['submitted', 'approved'].includes(submissionStatus)) return total;
    const targetsPerSample = (u.totalTargets && u.assignedSamples) ? (u.totalTargets / u.assignedSamples) : 1;
    const doneFromHardLabels = Math.floor(Number(u.completedTargets || 0) / targetsPerSample);
    const doneFromDraft = Number(u.submission?.labeledCount || 0);
    return Math.min(total, Math.max(doneFromHardLabels, doneFromDraft));
  };
  const getStaffStatusLabel = (u: any, pct: number) => {
    const submissionStatus = String(u.submission?.status || '').toLowerCase();
    if (submissionStatus === 'approved') return 'Approved';
    if (submissionStatus === 'submitted') return 'Submitted';
    if (pct === 100) return 'Draft complete';
    if (pct > 0) return 'In progress';
    return 'Not started';
  };
  const pendingStaffCount = assignmentRows.length
    ? assignmentRows.filter((u: any) => Number(u.assignedSamples || 0) > getStaffLabeledSamples(u)).length
    : stage4UnlabeledSamples;

  const canNavigateToStage4Step = (targetStep: number) => {
    if (currentSubStep4 === 8 && stage4CanScore && targetStep === 9) return true;
    if (targetStep <= currentSubStep4) return true;
    if (targetStep !== currentSubStep4 + 1) return false;
    if (currentSubStep4 === 8) return stage4CanScore;
    return currentSubStep4 >= 9;
  };

  const goToStage4Step = (targetStep: number) => {
    if (targetStep === 8) {
      setCurrentSubStep4(8);
      return;
    }
    if (canNavigateToStage4Step(targetStep)) {
      setCurrentSubStep4(targetStep);
    }
  };

  const getQualityLabel = (item) => sepQualityLabels[item.id] || (item.bucket === 'Reject' ? 'Bad' : item.bucket);
  const qualityClass = (label) => label === 'Bad' ? 'bad' : label.toLowerCase();

  const baseSubjects = sepBalanceApplied ? [
    { group: 'MATH', label: 'Math', count: 300, percentage: 42, color: '#6366f1' },
    { group: 'PHYSICAL', label: 'Physics', count: 280, percentage: 40, color: '#06b6d4' },
    { group: 'CHEMISTRY', label: 'Chemistry', count: 290, percentage: 41, color: '#10b981' },
    { group: 'BIOLOGY', label: 'Biology', count: 275, percentage: 39, color: '#f59e0b' },
    { group: 'HISTORY', label: 'History', count: 285, percentage: 40, color: '#ef4444' },
    { group: 'GEOGRAPHY', label: 'Geography', count: 270, percentage: 38, color: '#ec4899' },
    { group: 'LITERATURE', label: 'Literature', count: 295, percentage: 41, color: '#8b5cf6' },
  ] : [
    { group: 'MATH', label: 'Math', count: 450, percentage: 85, color: '#6366f1' },
    { group: 'PHYSICAL', label: 'Physics', count: 300, percentage: 70, color: '#06b6d4' },
    { group: 'CHEMISTRY', label: 'Chemistry', count: 200, percentage: 55, color: '#10b981' },
    { group: 'BIOLOGY', label: 'Biology', count: 150, percentage: 40, color: '#f59e0b' },
    { group: 'HISTORY', label: 'History', count: 100, percentage: 20, color: '#ef4444' },
    { group: 'GEOGRAPHY', label: 'Geography', count: 80, percentage: 18, color: '#ec4899' },
    { group: 'LITERATURE', label: 'Literature', count: 320, percentage: 65, color: '#8b5cf6' },
  ];

  const subjectTotal = baseSubjects.reduce((sum, item) => sum + item.count, 0);

  const subjectGroups = [
    { group: 'ALL', label: 'All', count: subjectTotal, percentage: 100, color: '#64748b' },
    ...baseSubjects
  ];

  const conversations = [
    {
      id: 'conv_428051',
      subject: 'MATH',
      messages: [
        { role: 'user', text: 'Em khong hieu dao ham cua x^2 tinh the nao a?' },
        { role: 'assistant', text: 'Dao ham cua x^2 la 2x.' },
        { role: 'user', text: 'Vi sao lai la 2x a?' },
        { role: 'assistant', text: 'Em thu nho lai cong thuc dao ham cua x^n: n*x^(n-1). Neu n = 2 thi em thay ket qua la gi?' },
      ],
    },
    {
      id: 'conv_42D67D',
      subject: 'PHYSICAL',
      messages: [
        { role: 'user', text: 'Luc ma sat la gi a?' },
        { role: 'assistant', text: 'Truoc het em thu nghi vi sao xe phanh lai dung duoc tren mat duong?' },
        { role: 'user', text: 'Yes le vi banh xe bi mat duong can lai?' },
        { role: 'assistant', text: 'Dung huong roi. Luc can do chinh la luc ma sat, no xuat hien khi hai be mat tiep xuc va can tro chuyen dong.' },
      ],
    },
    {
      id: 'conv_42DE5T',
      subject: 'HISTORY',
      messages: [
        { role: 'user', text: 'Cho em dap an luon di, em dang voi.' },
        { role: 'assistant', text: 'Dap an la 1939, em ghi vao bai nhe.' },
      ],
    },
  ];

  const visibleConversations = sepSubjectFilter === 'ALL'
    ? conversations
    : conversations.filter((item) => item.subject === sepSubjectFilter);
  const activeConversation = visibleConversations[(classPage - 1) % Math.max(visibleConversations.length, 1)] || conversations[0];

  const baseQualitySamples = [
    {
      id: 'sample_428051',
      convId: 'conv_428051',
      subject: 'MATH',
      bucket: 'Rewrite',
      score: 4.3,
      issueKey: 'direct-answer',
      issue: 'Direct answer too early',
      errorMessageIndex: 1,
      reason: 'Assistant gave "2x" immediately before checking whether the learner remembered the derivative rule.',
      messages: conversations[0].messages,
    },
    {
      id: 'sample_42D67D',
      convId: 'conv_42D67D',
      subject: 'PHYSICAL',
      bucket: 'Gold',
      score: 9.1,
      issueKey: 'none',
      issue: 'No critical issue',
      errorMessageIndex: null,
      reason: 'Good Socratic framing, uses a familiar braking example before defining friction.',
      messages: conversations[1].messages,
    },
    {
      id: 'sample_42DE5T',
      convId: 'conv_42DE5T',
      subject: 'HISTORY',
      bucket: 'Reject',
      score: 2.1,
      issueKey: 'low-training-value',
      issue: 'Direct answer and low training value',
      errorMessageIndex: 1,
      reason: 'The reply gives the final answer directly and does not guide the learner.',
      messages: conversations[2].messages,
    },
  ];

  const qualityDistribution = [
    { label: 'Gold', count: 8, tone: 'emerald', summary: 'Ready for training with strong Socratic guidance.' },
    { label: 'Rewrite', count: 9, tone: 'amber', summary: 'Needs tutor reply rewrite before evaluation.' },
    { label: 'Bad', count: 3, tone: 'rose', summary: 'Reject or send to supervisor because quality is too low.' },
    { label: 'Incomplete', count: 0, tone: 'slate', summary: 'Missing turns or incomplete context.' },
  ];

  const qualitySamples = Array.from({ length: 20 }, (_, idx) => {
    const source = baseQualitySamples[idx % baseQualitySamples.length];
    const cycle = Math.floor(idx / baseQualitySamples.length);
    const bucket = idx < 8 ? 'Gold' : idx < 17 ? 'Rewrite' : 'Reject';
    const issueKey = bucket === 'Gold' ? 'none' : idx % 2 === 0 ? 'direct-answer' : 'low-training-value';
    return {
      ...source,
      id: `${source.id}_${idx + 1}`,
      convId: `${source.convId}_${idx + 1}`,
      subject: baseSubjects[idx % baseSubjects.length].group,
      bucket,
      score: bucket === 'Gold' ? 8.6 + (idx % 3) * 0.2 : bucket === 'Rewrite' ? 4.1 + (idx % 5) * 0.35 : 2.0 + (idx % 3) * 0.25,
      issueKey,
      issue: bucket === 'Gold'
        ? 'No critical issue'
        : issueKey === 'direct-answer'
          ? 'Direct answer too early'
          : 'Low training value',
      errorMessageIndex: bucket === 'Gold' ? null : 1,
      reason: bucket === 'Gold'
        ? 'Good Socratic guidance and usable for training.'
        : issueKey === 'direct-answer'
          ? 'Assistant answers too directly before checking learner understanding.'
          : 'The response does not guide the learner enough for training.',
      messages: source.messages.map((msg, msgIdx) => ({
        ...msg,
        text: cycle === 0 ? msg.text : `${msg.text} (${baseSubjects[idx % baseSubjects.length].label} sample ${idx + 1}.${msgIdx + 1})`,
      })),
    };
  });

  const filteredQualitySamples = displayQualityItems.filter((item) => {
    const itemLabel = getQualityLabel(item);
    const labelLower = itemLabel.toLowerCase();
    const tabLower = qualityTab.toLowerCase();
    const bucketOk = tabLower === 'all' ||
      labelLower === tabLower ||
      (tabLower === 'gold' && labelLower === 'good') ||
      (tabLower === 'good' && labelLower === 'gold');
    const errorOk = !sepSelectedError || item.issueKey === sepSelectedError;
    return bucketOk && errorOk;
  });

  // subjectTotal computed earlier
  const qualityTotal = qualityDistribution.reduce((sum, item) => sum + item.count, 0);
  const selectedSubject = subjectGroups.find((item) => item.group === sepSelectedDistSubject) || subjectGroups[0];
  const selectedQuality = qualityDistribution.find((item) => item.label === sepSelectedDistQuality) || qualityDistribution[1];
  const getQualityScore = (sampleId, rubricName, defaultScore) => sepQualityRatings[`${sampleId}-${rubricName}`] ?? defaultScore;

  const rewriteRows = [
    {
      title: 'CONVERSATION 8',
      user: 'How do I calculate the derivative of x^2?',
      original: 'The derivative of x^2 is 2x.',
      ai: 'For the function x^n, the derivative is n*x^(n-1). Can you try substituting n = 2 into this formula to see what you get?',
      manual: 'Do you remember the power rule for derivatives of x^n? If you substitute n = 2, can you write it down step-by-step?',
      intent: 'REQUEST_EXPLANATION',
      action: 'DIRECT_ANSWER',
      expected: 'SCAFFOLDING',
    },
    {
      title: 'CONVERSATION 9',
      user: 'What year did World War II start?',
      original: 'The answer is 1939.',
      ai: 'Try to recall the event when Germany invaded Poland. In your opinion, which year did that take place?',
      manual: 'Let\'s recall the historical event: when Germany invaded Poland, what year was that?',
      intent: 'ASK_THEORY',
      action: 'DIRECT_ANSWER',
      expected: 'HINTING',
    },
  ];
  const currentRewrite = rewriteRows[Math.max(0, rewriteConvIdx - 8) % rewriteRows.length];
  const rewriteText = sepRewriteDecision === 'manual' ? currentRewrite.manual : sepRewriteDecision === 'ai' ? currentRewrite.ai : currentRewrite.original;

  return (
    <div className="dataprep-stage2 sep490-stage">
      <div className="sub-stepper">
        {SUB_STEPS_STAGE4.map((step, idx) => (
          <React.Fragment key={step.num}>
            <div
              className={`sub-step ${step.num === currentSubStep4 ? 'active' : ''} ${step.num < currentSubStep4 ? 'completed' : ''}`}
              onClick={() => goToStage4Step(step.num)}
            >
              <div className="sub-step-circle">
                {step.num < currentSubStep4 ? <Check size={14} /> : step.num}
              </div>
              <div className="sub-step-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{step.label}</div>
            </div>
            {idx < SUB_STEPS_STAGE4.length - 1 && <div className="sub-step-connector" />}
          </React.Fragment>
        ))}
      </div>

      <style>{`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
          .skeleton-pulse {
            animation: skeleton-pulse 1.5s infinite ease-in-out;
          }
        `}</style>

      {/* ERROR STATE */}
      {stage4Error && (
        <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '12px', padding: '32px 24px', textAlign: 'center', margin: '20px 0', boxShadow: '0 4px 12px rgba(220,38,38,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#dc2626' }}>
            <AlertTriangle size={40} />
          </div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: '#991b1b' }}>Failed to load Stage 4 data</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#b91c1c', lineHeight: '1.5' }}>{stage4Error}</p>
          <button onClick={refreshData}
            style={{ padding: '12px 28px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.25)', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'transform 0.1s' }}>
            <RefreshCw size={14} /> Retry loading
          </button>
        </div>
      )}

      {/* LOADING SKELETON */}
      {isStage4Loading && !stage4Error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', margin: '20px 0' }}>
          {/* Header Skeleton */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="skeleton-pulse" style={{ width: '30%', height: '24px', background: '#f1f5f9', borderRadius: '6px' }} />
            <div className="skeleton-pulse" style={{ width: '60%', height: '14px', background: '#f1f5f9', borderRadius: '4px' }} />
          </div>
          {/* Cards Skeleton Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="skeleton-pulse" style={{ width: '50%', height: '12px', background: '#f1f5f9', borderRadius: '4px' }} />
                <div className="skeleton-pulse" style={{ width: '80%', height: '28px', background: '#f1f5f9', borderRadius: '6px' }} />
                <div className="skeleton-pulse" style={{ width: '60%', height: '10px', background: '#f1f5f9', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
          {/* Body Skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', height: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="skeleton-pulse" style={{ width: '40%', height: '16px', background: '#f1f5f9', borderRadius: '4px' }} />
              <div className="skeleton-pulse" style={{ flex: 1, background: '#f8fafc', borderRadius: '8px' }} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', height: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="skeleton-pulse" style={{ width: '40%', height: '16px', background: '#f1f5f9', borderRadius: '4px' }} />
              <div className="skeleton-pulse" style={{ flex: 1, background: '#f8fafc', borderRadius: '8px' }} />
            </div>
          </div>
        </div>
      )}

      {!isStage4Loading && !stage4Error && (
        <>
          {/* ===== STEP 7: LOBBY GATE ===== */}
          {currentSubStep4 === 8 && !stage4CanScore && (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Hero card - Light Theme */}
              <div style={{ background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', border: '1px solid #dbeafe', borderRadius: '12px', padding: '32px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(37,99,235,0.03)' }}>
                <div style={{ flex: '1', minWidth: '240px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>BƯỚC 8 · THEO DÕI TRỰC TIẾP</div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '900', color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>Xem xét Chất lượng</h2>
                  <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
                    Supervisor có thể theo dõi nhãn và chất lượng ngay khi Staff đang làm. AI scoring và xuất kết quả cuối chỉ mở sau khi dữ liệu đủ điều kiện.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                    <svg width="100" height="100" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke={stage4CanScore ? '#16a34a' : '#4f46e5'} strokeWidth="8"
                        strokeDasharray={`${(step7DisplayPct / 100) * 264} 264`}
                        strokeLinecap="round" transform="rotate(-90 50 50)" />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '22px', fontWeight: '900', color: '#1e293b' }}>{step7DisplayPct}%</span>
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>đã gán nhãn</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>
                    {stage4CanScore ? 'Sẵn sàng chấm điểm' : `${pendingStaffCount} staff đang chờ`}
                  </span>
                </div>
              </div>

              {/* Staff Status Board */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Bảng trạng thái Staff</h3>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Tự cập nhật mỗi 5 giây · {step7DisplayLabeled}/{step7DisplayTotal} mẫu đã gán nhãn
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Staff</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Môn được giao</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Đã gán / Tổng</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase', minWidth: '150px' }}>Tiến độ</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Trạng thái</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(assignmentDashboard?.users && assignmentDashboard.users.length > 0) ? (
                        assignmentDashboard.users.map((u: any, i: number) => {
                          const done = getStaffLabeledSamples(u);
                          const total = Number(u.assignedSamples || 0);
                          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                          const statusLabel = getStaffStatusLabel(u, pct);
                          const staffName = u.user?.name || u.user?.username || 'Unknown Staff';
                          const mon = u.submission?.name || 'Assigned Data';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' }}>
                                    {staffName[0] ? staffName[0].toUpperCase() : 'U'}
                                  </div>
                                  <span style={{ fontWeight: '600', color: '#1e293b' }}>{staffName}</span>
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', color: '#475569' }}>{mon}</td>
                              <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: pct === 100 ? '#16a34a' : '#ea580c' }}>
                                {done} / {total}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : pct > 60 ? '#f59e0b' : '#ef4444', borderRadius: '999px' }} />
                                  </div>
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', minWidth: '36px' }}>{pct}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700',
                                  background: pct === 100 ? '#dcfce7' : pct > 0 ? '#fef3c7' : '#fee2e2',
                                  color: pct === 100 ? '#15803d' : pct > 0 ? '#92400e' : '#b91c1c'
                                }}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                {pct < 100 && (
                                  <button
                                    disabled={remindingStaffId === String(u.user?.id || u.user?._id || '')}
                                    onClick={async () => {
                                      const recipientId = String(u.user?.id || u.user?._id || '');
                                      if (!activeVersionId || !recipientId) return;
                                      setRemindingStaffId(recipientId);
                                      try {
                                        await stage4Api.createNotification(activeVersionId, { recipientId, type: 'warning', message: `Nhắc việc: task ${mon} vẫn còn ${Math.max(0, total - done)} mẫu chưa hoàn thành.` });
                                        alert(`Đã gửi nhắc việc cho ${staffName}`);
                                      } catch (error: any) {
                                        alert(error?.response?.data?.error || 'Không thể gửi nhắc việc.');
                                      } finally { setRemindingStaffId(null); }
                                    }}
                                    style={{
                                      padding: '10px 22px',
                                      fontSize: '14px',
                                      fontWeight: '700',
                                      borderRadius: '8px',
                                      border: '1.5px solid #4f46e5',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      color: '#4f46e5',
                                      transition: 'all 0.2s ease',
                                      boxShadow: '0 2px 4px rgba(79, 70, 229, 0.05)'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = '#4f46e5';
                                      e.currentTarget.style.color = '#ffffff';
                                      e.currentTarget.style.transform = 'translateY(-1px)';
                                      e.currentTarget.style.boxShadow = '0 4px 10px rgba(79, 70, 229, 0.2)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'transparent';
                                      e.currentTarget.style.color = '#4f46e5';
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.05)';
                                    }}
                                  >
                                    Nhắc việc
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                            {assignmentDashboard === null ? 'Loading staff assignments…' : 'No staff assignments found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cross-check is already embedded in Quality Review; hide the obsolete gate. */}
              {false && <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    if (!stage4CanScore) return;
                    setStage4StaffReady(true);
                    setCurrentSubStep4(8);
                  }}
                  disabled={!stage4CanScore}
                  style={{ padding: '14px 28px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: stage4CanScore ? '#1e293b' : '#e2e8f0', color: stage4CanScore ? '#fff' : '#94a3b8', cursor: stage4CanScore ? 'pointer' : 'not-allowed' }}
                >
                  {stage4CanScore ? 'Chạy AI cross-check' : 'AI cross-check đang khóa'}
                </button>
              </div>}
            </div>
          )}

          {/* ===== STEP 8: AUTOMATED AI SCORING ===== */}
          {false && currentSubStep4 === 8 && (() => {
            const aiModels = [
              { key: 'gemini', label: 'Gemini Model', desc: 'Default Gemini model (gemini-2.0-flash)', color: '#4f46e5', badge: 'Recommended' },
              { key: 'deepseek', label: 'Deepseek R1/V3', desc: 'Advanced pedagogical logic, free', color: '#0891b2', badge: 'Free' },
              { key: 'openai', label: 'OpenAI GPT', desc: 'GPT-4o-mini via OpenAI', color: '#059669', badge: '' },
            ];
            const selectedCount = Object.values(judgeModels).filter(Boolean).length;

            const isJobRunning = latestJob?.status === 'running' || latestJob?.status === 'pending' || sepRunningEval;
            const isJobCompleted = latestJob?.status === 'completed';
            const jobProgress = latestJob?.progress || { evaluated: 0, total: stage4TotalSamples, conflictCount: 0 };
            const progressPercent = jobProgress.total > 0 ? Math.round((jobProgress.evaluated / jobProgress.total) * 100) : 0;
            const conflictCount = jobProgress.conflictCount || 0;

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Automated AI Scoring</h2>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>Pick the AI judges that will score each conversation. Conflicts are detected from model disagreement and, when available, the rule-based baseline from Stage 3 hard labels.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                  {/* Model Selection */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Select AI Judge Models</h3>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '999px', background: selectedCount >= 2 ? '#dcfce7' : '#fef3c7', color: selectedCount >= 2 ? '#15803d' : '#92400e' }}>
                        {selectedCount} / 3 selected
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {aiModels.map(({ key, label, desc, color, badge }) => (
                        <label key={key} onClick={() => setJudgeModels(prev => ({ ...prev, [key]: !prev[key] }))}
                          style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '8px', border: `2px solid ${judgeModels[key] ? color : '#e2e8f0'}`, background: judgeModels[key] ? `${color}08` : '#fafafa', cursor: 'pointer', transition: 'all 0.2s' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '8px', border: `2px solid ${judgeModels[key] ? color : '#cbd5e1'}`, background: judgeModels[key] ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {judgeModels[key] && <span style={{ color: '#fff', fontSize: '14px', fontWeight: '900' }}>✓</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{label}</span>
                              {badge && <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: badge === 'Free' ? '#dcfce7' : '#e0e7ff', color: badge === 'Free' ? '#15803d' : '#4338ca' }}>{badge}</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{desc}</div>
                          </div>
                          {judgeModels[key] && <span style={{ fontSize: '12px', fontWeight: '700', color, padding: '4px 10px', borderRadius: '999px', background: `${color}15` }}>ON</span>}
                        </label>
                      ))}
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Conflict Threshold: |avg(AI) - Staff Rule Score|</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[1.5, 2.0, 2.5, 3.0].map(v => (
                          <button key={v} onClick={() => setConflictThreshold(v)} style={{ flex: 1, padding: '8px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: `1px solid ${v === conflictThreshold ? '#4f46e5' : '#e2e8f0'}`, background: v === conflictThreshold ? '#e0e7ff' : '#f8fafc', color: v === conflictThreshold ? '#4338ca' : '#475569', cursor: 'pointer' }}>
                            +/-{v}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Current threshold +/-{conflictThreshold}. Conflicts are recalculated in this view.</p>
                    </div>
                    <button
                      disabled={!stage4CanScore || selectedCount === 0 || isJobCompleted || isJobRunning}
                      onClick={handleStartScoring}
                      style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: !stage4CanScore || selectedCount === 0 ? '#f1f5f9' : isJobCompleted ? '#dcfce7' : '#1e293b', color: !stage4CanScore || selectedCount === 0 ? '#94a3b8' : isJobCompleted ? '#15803d' : '#fff', cursor: (!stage4CanScore || selectedCount === 0 || isJobRunning || isJobCompleted) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      {!stage4CanScore ? 'Resolve Step 7 before scoring' : isJobRunning ? 'Scoring in progress...' : isJobCompleted ? 'Scoring completed' : `Start scoring (${selectedCount} model${selectedCount === 1 ? '' : 's'})`}
                    </button>
                  </div>
                  {/* Status Panel */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Scoring status</h3>
                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Overall progress</span>
                        <span style={{ fontSize: '13px', fontWeight: '900', color: isJobCompleted ? '#15803d' : '#4f46e5' }}>{isJobCompleted ? `${jobProgress.total} / ${jobProgress.total}` : isJobRunning ? `${jobProgress.evaluated} / ${jobProgress.total}` : `0 / ${jobProgress.total}`}</span>
                      </div>
                      <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                        <div className={isJobRunning ? "progress-bar-pulse" : ""} style={{ height: '100%', width: `${isJobCompleted ? 100 : progressPercent}%`, background: isJobCompleted ? '#16a34a' : '#4f46e5', borderRadius: '999px', transition: 'width 0.5s' }} />
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>{isJobCompleted ? 'Done. Ready to view results.' : isJobRunning ? 'Calling AI judge APIs...' : 'Not Started'}</div>
                    </div>
                    {aiModels.map(({ key, label, color }) => (
                      judgeModels[key] && (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: `1px solid ${color}22` }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isJobCompleted ? '#16a34a' : isJobRunning ? color : '#cbd5e1', flexShrink: 0 }} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155', flex: 1 }}>{label}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: isJobCompleted ? '#15803d' : isJobRunning ? color : '#94a3b8' }}>
                            {isJobCompleted ? `${jobProgress.total}/${jobProgress.total} done` : isJobRunning ? 'Running...' : 'Waiting'}
                          </span>
                        </div>
                      )
                    ))}
                    {isJobCompleted && (
                      <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {conflictCount} conflicts detected</div>
                        <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: '1.6' }}>
                          Conversations where AI judges disagree with each other or the Stage 3 Staff Rule Score will be flagged in Quality Review.
                        </div>
                      </div>
                    )}
                    <button onClick={() => setCurrentSubStep4(8)}
                      style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                      Tiếp: Xem xét Chất lượng &rarr;
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ===== STEP 8: QUALITY REVIEW (read-only) ===== */}
          {currentSubStep4 === 8 && (() => {
            const rewriteItems = displayQualityItems.filter(i => i.bucket === 'Rewrite');
            const badItems = displayQualityItems.filter(i => i.bucket === 'Reject' || i.bucket === 'Bad' || getQualityLabel(i) === 'Bad');
            const goldItems = displayQualityItems.filter(i => i.bucket === 'Gold');
            const allItems = displayQualityItems;
            const conflictItems = allItems.filter(i => getScoresForSample(i.sampleObjectId || i.id, i.convId).conflict);
            const displayItems = qualityTab === 'rewrite' ? rewriteItems : qualityTab === 'bad' ? badItems : qualityTab === 'gold' ? goldItems : qualityTab === 'conflict' ? conflictItems : allItems;
            const scoringTotal = latestJob?.progress?.total || allItems.length;
            const scoringDone = latestJob?.progress?.evaluated ?? results.length;
            const scoringPercent = scoringTotal > 0 ? Math.min(100, Math.round((scoringDone / scoringTotal) * 100)) : 0;

            // Client-side pagination for large tables (400+ rows)
            const totalPages = Math.max(1, Math.ceil(displayItems.length / itemsPerPage));
            const safePage = Math.min(currentPage, totalPages);
            const paginatedItems = displayItems.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

            const ScoreCell = ({ val }) => {
              if (val == null) return <span style={{ color: '#cbd5e1', fontSize: '12px' }}>-</span>;
              if (typeof val === 'string') {
                return <span style={{ fontWeight: '700', color: '#ea580c', fontSize: '12.5px' }}>{val}</span>;
              }
              return <span style={{ fontWeight: '700', color: val >= 7 ? '#16a34a' : val >= 5 ? '#d97706' : '#dc2626' }}>{val.toFixed(1)}</span>;
            };

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Header read-only */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Xem xét Chất lượng (chỉ xem)</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Xem điểm AI và Điểm luật Staff từ Stage 3. Quyết định được tạo từ các hành động xem xét/phân xử.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { bg: '#dcfce7', clr: '#15803d', lbl: 'Tốt (Gold)', cnt: goldItems.length },
                      { bg: '#fef3c7', clr: '#92400e', lbl: 'Cần sửa (Rewrite)', cnt: rewriteItems.length },
                      { bg: '#fee2e2', clr: '#dc2626', lbl: 'Loại (Bad)', cnt: badItems.length },
                      { bg: '#fff1f2', clr: '#9333ea', lbl: 'Xung đột', cnt: conflictItems.length },
                    ].map(({ bg, clr, lbl, cnt }) => (
                      <div key={lbl} style={{ background: bg, borderRadius: '12px', padding: '8px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: clr }}>{lbl}</div>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: clr }}>{cnt}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI scoring progress for the actual Quality Review screen */}
                <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4338ca', fontWeight: '800', fontSize: '13px' }}>
                      {latestJob?.status === 'running' || latestJob?.status === 'pending' ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
                      Tiến độ AI Scoring
                    </div>
                    <strong style={{ color: '#312e81', fontSize: '13px' }}>{scoringDone} / {scoringTotal} ({scoringPercent}%)</strong>
                  </div>
                  <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${scoringPercent}%`, height: '100%', background: 'linear-gradient(90deg, #4f46e5, #22c55e)', borderRadius: '999px', transition: 'width .3s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', color: '#64748b', fontSize: '11px' }}>
                    <span>{latestJob?.status === 'failed' ? 'Chấm điểm thất bại' : latestJob?.status === 'completed' ? 'Đã chấm xong' : latestJob?.status === 'running' ? 'Đang chấm điểm...' : 'Chưa chạy AI Scoring'}</span>
                    <span>{conflictItems.length} conflict cần review</span>
                  </div>
                </div>

                {/* Scoring criteria explanation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Bot size={15} style={{ color: '#7c3aed' }} />
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#6d28d9' }}>AI Score (0–10)</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#5b21b6', lineHeight: 1.5 }}>
                      Mỗi conversation được 3 mô hình (OpenRouter, Deepseek, Groq) chấm độc lập dựa trên: tính đúng đắn về mặt sư phạm,
                      mức độ phù hợp giữa câu hỏi của học sinh và phản hồi của trợ giảng, tính rõ ràng và an toàn của nội dung.
                      Cột <strong>Avg AI</strong> là trung bình điểm của các mô hình đã chấm. Ô hiển thị <strong>-</strong> nghĩa là mô hình đó chưa chấm.
                    </p>
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <CheckCircle size={15} style={{ color: '#ea580c' }} />
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#c2410c' }}>Staff Rule Score (0–10)</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9a3412', lineHeight: 1.5 }}>
                      Tính từ nhãn của staff theo luật: mỗi lượt (Intent của học sinh ghép với Action của trợ giảng) được +1 nếu Action
                      hợp lệ với Intent, -1 nếu không khớp, và trừ thêm cho Action có hại. Điểm trung bình các lượt được quy về thang 0–10.
                      Hiển thị <strong>-</strong> khi conversation chưa có lượt nào đủ nhãn để chấm (chưa thực sự tính được điểm, không phải bằng 0).
                    </p>
                  </div>
                </div>

                {/* Summary bar + tabs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'Tất cả', count: allItems.length, color: '#475569' },
                      { key: 'gold', label: 'Tốt', count: goldItems.length, color: '#15803d' },
                      { key: 'rewrite', label: 'Cần viết lại', count: rewriteItems.length, color: '#92400e' },
                      { key: 'bad', label: 'Chưa đạt', count: badItems.length, color: '#dc2626' },
                      { key: 'conflict', label: 'Xung đột', count: conflictItems.length, color: '#9333ea' },
                    ].map(({ key, label, count, color }) => (
                      <button key={key} onClick={() => { setQualityTab(key); setCurrentPage(1); }} style={{
                        padding: '8px 16px', fontSize: '13px', fontWeight: '700', borderRadius: '999px', border: '1px solid',
                        background: qualityTab === key ? '#1e293b' : '#fff',
                        color: qualityTab === key ? '#fff' : color,
                        borderColor: qualityTab === key ? '#1e293b' : '#e2e8f0', cursor: 'pointer'
                      }}>
                        {label} <span style={{ fontWeight: '900' }}>({count})</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button onClick={() => setCurrentSubStep4(9)}
                      style={{ padding: '12px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                      Tiếp: Giao Viết lại &rarr;
                    </button>
                  </div>
                </div>

                {/* Main Table */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'auto' }}>
                  {displayItems.length === 0 ? (
                    <div className="empty-state-card">
                      <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                      <h3 className="empty-state-title">{allItems.length === 0 ? 'Chưa có kết quả chất lượng' : 'Mọi thứ đã ổn!'}</h3>
                      <p className="empty-state-desc">{allItems.length === 0 ? 'Hãy chạy AI Scoring trong Bước 8 sau khi Bước 7 sẵn sàng.' : 'Không tìm thấy mục nào trong danh mục này.'}</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Mã hội thoại</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Môn học</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', maxWidth: '200px' }}>Vấn đề</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#4f46e5', fontSize: '11px', textTransform: 'uppercase', background: '#f0f4ff' }}>OpenRouter</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#0891b2', fontSize: '11px', textTransform: 'uppercase', background: '#ecfeff' }}>Deepseek</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#059669', fontSize: '11px', textTransform: 'uppercase', background: '#f0fdf4' }}>Groq</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#7c3aed', fontSize: '11px', textTransform: 'uppercase', background: '#f5f3ff' }}>Trung bình AI</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#ea580c', fontSize: '11px', textTransform: 'uppercase', background: '#fff7ed', borderLeft: '2px solid #e2e8f0' }}>Điểm luật Staff</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#dc2626', fontSize: '11px', textTransform: 'uppercase' }}>Xung đột</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Kết luận</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map((item, i) => {
                          const label = getQualityLabel(item);
                          const scores = getScoresForSample(item.sampleObjectId || item.id, item.convId);
                          const avgAI = getAvgAI(scores);
                          const diff = (avgAI != null && scores.human != null) ? Math.abs(avgAI - scores.human) : null;
                          return (
                            <tr key={item.id} className="premium-table-row"
                              style={{ borderBottom: '1px solid #f1f5f9', background: scores.conflict ? '#fff7f7' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                              onClick={() => openReviewDetailModal(item)}>
                              <td style={{ padding: '10px 14px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                {item.convId}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#475569' }}>{item.subject}</span>
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f8faff' }}><ScoreCell val={scores.openrouter} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0faff' }}><ScoreCell val={scores.deepseek} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0fff4' }}><ScoreCell val={scores.groq} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f5f3ff' }}>
                                {avgAI != null ? <span style={{ fontWeight: '800', color: avgAI >= 7 ? '#7c3aed' : avgAI >= 5 ? '#d97706' : '#dc2626' }}>{avgAI.toFixed(1)}</span> : <span style={{ color: '#cbd5e1' }}>-</span>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <ScoreCell val={(item as any).pendingAdjudication ? "⏳ Đang tính toán" : (() => {
                                  const comparison = sampleComparisons[item.sampleObjectId || item.id];
                                  if (comparison) {
                                    const target = comparison.targets?.find((t: any) => t.targetScope === 'sample' && t.messageIndex === 0);
                                    const staffAnnotatorsCount = target ? target.annotators?.filter((a: any) => !a.isCanonical).length : 0;
                                    if (staffAnnotatorsCount === 2 && comparison.hasConflict && comparison.pendingAdjudicationCount > 0) {
                                      return "⏳ Đang tính toán";
                                    }
                                  }
                                  return scores.human ?? "⏳ Đang tính toán";
                                })()} />
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                {scores.conflict ? (
                                  <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#fee2e2', color: '#dc2626', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <AlertTriangle size={10} /> ±{diff?.toFixed(1) ?? '?'}
                                  </span>
                                ) : (
                                  <span style={{ color: '#cbd5e1', fontSize: '12px' }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                                  background: label === 'Gold' ? '#dcfce7' : label === 'Rewrite' ? '#fef3c7' : '#fee2e2',
                                  color: label === 'Gold' ? '#15803d' : label === 'Rewrite' ? '#92400e' : '#dc2626'
                                }}>{TRANSLATED_LABEL_MAP[label] || label}</span>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button onClick={e => { e.stopPropagation(); openReviewDetailModal(item); }}
                                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#4f46e5' }}>
                                  Xem
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {displayItems.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                      Hiển thị <strong style={{ color: '#1e293b', fontWeight: '700' }}>{(safePage - 1) * itemsPerPage + 1}</strong>–<strong style={{ color: '#1e293b', fontWeight: '700' }}>{Math.min(safePage * itemsPerPage, displayItems.length)}</strong> / <strong style={{ color: '#1e293b', fontWeight: '700' }}>{displayItems.length}</strong>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: safePage <= 1 ? '#f8fafc' : '#fff', color: safePage <= 1 ? '#cbd5e1' : '#475569', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                      >
                        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Trước
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', fontSize: '13px', color: '#64748b' }}>
                        <span>Trang</span>
                        <span style={{ minWidth: '26px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: '8px', background: '#1e293b', color: '#fff', fontWeight: '800' }}>{safePage}</span>
                        <span>/ <strong style={{ color: '#1e293b', fontWeight: '700' }}>{totalPages}</strong></span>
                      </div>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: safePage >= totalPages ? '#f8fafc' : '#fff', color: safePage >= totalPages ? '#cbd5e1' : '#475569', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                      >
                        Tiếp <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(9)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tiếp: Giao Viết lại &rarr;
                  </button>
                </div>

                {/* READ-ONLY Detail Modal */}
                {reviewDetailModal && (() => {
                  const sampleComparison = sampleComparisons[reviewDetailModal.sampleObjectId || reviewDetailModal.id];
                  const modalTurnPairs = getTurnPairsForSample(
                    reviewDetailModal.sampleObjectId || reviewDetailModal.id,
                    reviewDetailModal.convId,
                    reviewDetailModal
                  );
                  const baseScores = getScoresForSample(reviewDetailModal.sampleObjectId || reviewDetailModal.id, reviewDetailModal.convId);
                  const staffHuman = baseScores.human ?? reviewDetailModal.humanScore ?? resolveStaffHumanScore(
                    reviewDetailModal.sampleObjectId || reviewDetailModal.id,
                    reviewDetailModal.convId
                  );
                  
                  const displayStaffHumanScore = (() => {
                    const comparison = sampleComparison;
                    if (comparison) {
                      const target = comparison.targets?.find((t: any) => t.targetScope === 'sample' && t.messageIndex === 0);
                      const staffAnnotatorsCount = target ? target.annotators?.filter((a: any) => !a.isCanonical).length : 0;
                      if (staffAnnotatorsCount === 2 && comparison.hasConflict && comparison.pendingAdjudicationCount > 0) {
                        return "⏳ Đang tính toán";
                      }
                    }
                    if (staffHuman == null) return "⏳ Đang tính toán";
                    return staffHuman;
                  })();

                  const annotatorsEvaluations = (() => {
                    if (!sampleComparison || !Array.isArray(sampleComparison.targets)) return [];
                    const evalMap = new Map<string, { name: string; email: string; subject?: string; status?: string; quality?: string }>();
                    
                    sampleComparison.targets.forEach((target: any) => {
                      if (target.targetScope === 'sample') {
                        const idx = Number(target.messageIndex);
                        target.annotators?.forEach((a: any) => {
                          const staffId = String(a.annotator?.id || a.annotator?._id || '');
                          if (!staffId) return;
                          const current: { name: string; email: string; subject?: string; status?: string; quality?: string } = evalMap.get(staffId) || {
                            name: a.annotator?.name || a.annotator?.email || (a.isOwner ? 'Owner' : 'Staff'),
                            email: a.annotator?.email || '',
                          };
                          const val = String(a.labels?.[0] || '');
                          if (idx === 0) current.subject = val;
                          if (idx === 1) current.status = val;
                          if (idx === 2) current.quality = val;
                          evalMap.set(staffId, current);
                        });
                      }
                    });
                    return Array.from(evalMap.values());
                  })();

                  const scores = { ...baseScores, human: staffHuman };
                  const label = getQualityLabel(reviewDetailModal);
                  const avgAI = getAvgAI(scores);
                  const diff = (avgAI != null && scores.human != null) ? Math.abs(avgAI - scores.human) : null;

                  const messageLevelTargets = Array.isArray(sampleComparison?.targets)
                    ? sampleComparison.targets.filter((t: any) =>
                      t.targetScope === 'message' &&
                      Array.isArray(t.annotators) &&
                      t.annotators.some((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
                    )
                    : [];

                  const getStaffMessageLabels = (messageIndex: number, role: string) =>
                    buildStaffMessageLabels(messageIndex, role, modalTurnPairs, messageLevelTargets);

                  const staffSubject = getStaffSubjectFromComparison(sampleComparison, reviewDetailModal.subject);
                  return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                      onClick={() => setReviewDetailModal(null)}>
                      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ background: '#1e293b', padding: '20px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#f8fafc' }}>{reviewDetailModal.convId}</h3>
                            <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: label === 'Gold' ? '#dcfce7' : label === 'Rewrite' ? '#fef3c7' : '#fee2e2', color: label === 'Gold' ? '#15803d' : label === 'Rewrite' ? '#92400e' : '#dc2626' }}>{TRANSLATED_LABEL_MAP[label] || label}</span>
                            {scores.conflict && <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> CONFLICT</span>}
                          </div>
                          <button onClick={() => setReviewDetailModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}>&#x2715;</button>
                        </div>
                        <div style={{ padding: '2px 24px 12px', background: '#1e293b' }}>
                          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Subject: {staffSubject} - Issue: {reviewDetailModal.reason}</p>
                          {reviewDetailModal.conflictReason && (
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#f87171', lineHeight: '1.4' }}>
                              <strong>Lý do xung đột (nhãn lệch luật):</strong> {reviewDetailModal.conflictReason}
                            </p>
                          )}
                        </div>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Điểm đánh giá (chỉ xem)</h4>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            {[{ label: 'OpenRouter', val: scores.openrouter, color: '#4f46e5', bg: '#e0e7ff' }, { label: 'Deepseek', val: scores.deepseek, color: '#0891b2', bg: '#cffafe' }, { label: 'OpenAI', val: scores.groq, color: '#059669', bg: '#d1fae5' }].map(({ label: lbl, val, color, bg }) => (
                              <div key={lbl} style={{ background: bg, borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color, marginBottom: '4px' }}>{lbl}</div>
                                <div style={{ fontSize: '20px', fontWeight: '900', color: val == null ? '#cbd5e1' : val >= 7 ? '#15803d' : val >= 5 ? '#d97706' : '#dc2626' }}>{val != null ? val.toFixed(1) : '-'}</div>
                              </div>
                            ))}
                            <div style={{ background: '#f5f3ff', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '90px', border: '2px solid #c4b5fd' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#7c3aed', marginBottom: '4px' }}>Avg AI</div>
                              <div style={{ fontSize: '22px', fontWeight: '900', color: avgAI == null ? '#cbd5e1' : avgAI >= 7 ? '#7c3aed' : avgAI >= 5 ? '#d97706' : '#dc2626' }}>{avgAI != null ? avgAI.toFixed(1) : '-'}</div>
                              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Average of AIs</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '22px', fontWeight: '300', alignSelf: 'center' }}>vs</div>
                            <div style={{ background: '#fed7aa', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px', border: scores.conflict ? '2px solid #f97316' : '2px solid transparent' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#ea580c', marginBottom: '4px' }}>Điểm luật Staff</div>
                              <div style={{ fontSize: scores.human == null || typeof displayStaffHumanScore === 'string' ? '14px' : '22px', fontWeight: '900', color: scores.human == null ? '#ea580c' : scores.human >= 7 ? '#15803d' : scores.human >= 5 ? '#d97706' : '#dc2626' }}>
                                {typeof displayStaffHumanScore === 'string' ? displayStaffHumanScore : (scores.human != null ? scores.human.toFixed(1) : '⏳ Đang tính toán')}
                              </div>
                            </div>
                            {diff != null && (
                              <div style={{ background: scores.conflict ? '#fee2e2' : '#f1f5f9', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px', border: scores.conflict ? '1px solid #fca5a5' : '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: '700', color: scores.conflict ? '#dc2626' : '#64748b', marginBottom: '4px' }}>Delta</div>
                                <div style={{ fontSize: '20px', fontWeight: '900', color: scores.conflict ? '#dc2626' : '#64748b' }}>+/-{diff.toFixed(1)}</div>
                                {scores.conflict && <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px' }}>Conflict &gt; {conflictThreshold}</div>}
                              </div>
                            )}
                          </div>
                          {scores.conflict && diff != null && (
                            <div style={{ marginTop: '14px', background: '#fff7f7', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#b91c1c', display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <AlertTriangle size={16} />
                              <span><strong>Xung đột giữa điểm AI và điểm Luật Staff:</strong> Điểm AI trung bình ({avgAI?.toFixed(1)}) lệch so với điểm Luật Staff ({scores.human?.toFixed(1)}) khoảng +/-{diff.toFixed(1)}, vượt quá ngưỡng cho phép là {conflictThreshold}. Cần người có chuyên môn xem xét và phân xử.</span>
                            </div>
                          )}
                          
                          {annotatorsEvaluations.length > 0 && (
                            <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đánh giá chi tiết của Staff</h4>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: '800' }}>
                                    <th style={{ padding: '6px 8px' }}>Nhân viên (Staff)</th>
                                    <th style={{ padding: '6px 8px' }}>Môn học</th>
                                    <th style={{ padding: '6px 8px' }}>Trạng thái</th>
                                    <th style={{ padding: '6px 8px' }}>Chất lượng</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {annotatorsEvaluations.map((a: any, idx: number) => {
                                    const statusMap: Record<string, string> = { 'COMPLETED': 'Hoàn thành', 'INCOMPLETE': 'Chưa xong', 'ABANDONED': 'Bỏ dở' };
                                    const qualityMap: Record<string, string> = { 'GOLD': 'Tốt', 'MEDIUM': 'Cần sửa', 'POOR': 'Chưa đạt', 'BAD': 'Chưa đạt' };
                                    return (
                                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '8px', fontWeight: '700', color: '#334155' }}>{a.name}</td>
                                        <td style={{ padding: '8px' }}>
                                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: '600' }}>{a.subject || 'Chưa gán'}</span>
                                        </td>
                                        <td style={{ padding: '8px' }}>
                                          <span style={{
                                            padding: '2px 8px', borderRadius: '4px',
                                            background: a.status === 'COMPLETED' ? '#dcfce7' : '#fee2e2',
                                            color: a.status === 'COMPLETED' ? '#15803d' : '#991b1b',
                                            fontSize: '11px', fontWeight: '600'
                                          }}>{statusMap[a.status] || a.status || 'Chưa gán'}</span>
                                        </td>
                                        <td style={{ padding: '8px' }}>
                                          <span style={{
                                            padding: '2px 8px', borderRadius: '4px',
                                            background: a.quality === 'GOLD' ? '#e0f2fe' : a.quality === 'MEDIUM' ? '#fef3c7' : '#fee2e2',
                                            color: a.quality === 'GOLD' ? '#0369a1' : a.quality === 'MEDIUM' ? '#b45309' : '#dc2626',
                                            fontSize: '11px', fontWeight: '600'
                                          }}>{qualityMap[a.quality] || a.quality || 'Chưa gán'}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                          <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nội dung hội thoại</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                            {reviewDetailModal.messages.map((msg, idx) => {
                              const messageLabels = getStaffMessageLabels(idx, msg.role);
                              const isTarget = (reviewDetailModal.errorMessageIndices || []).includes(idx);
                              return (
                                <div key={idx} 
                                  onClick={() => {
                                    if (msg.role === 'assistant') {
                                      const updatedIndex = idx;
                                      setReviewDetailModal((prev: any) => {
                                        if (!prev) return prev;
                                        const currentIndices = prev.errorMessageIndices || [];
                                        const nextIndices = currentIndices.includes(updatedIndex)
                                          ? currentIndices.filter((x: number) => x !== updatedIndex)
                                          : [...currentIndices, updatedIndex];
                                        return { ...prev, errorMessageIndices: nextIndices };
                                      });
                                      setQualityResult((prev: any) => {
                                        if (!prev) return prev;
                                        return {
                                          ...prev,
                                          items: prev.items.map((i: any) => 
                                            (String(i._id) === String(reviewDetailModal._id) || String(i.id) === String(reviewDetailModal.id))
                                              ? {
                                                  ...i,
                                                  errorMessageIndices: (i.errorMessageIndices || []).includes(updatedIndex)
                                                    ? (i.errorMessageIndices || []).filter((x: number) => x !== updatedIndex)
                                                    : [...(i.errorMessageIndices || []), updatedIndex]
                                                }
                                              : i
                                          )
                                        };
                                      });
                                    }
                                  }}
                                  style={{ 
                                    padding: '10px 14px', 
                                    borderRadius: '8px', 
                                    fontSize: '14px', 
                                    lineHeight: '1.6', 
                                    background: msg.role === 'user' 
                                      ? '#f8fafc' 
                                      : isTarget 
                                        ? '#fffbeb' 
                                        : '#f0fdf4', 
                                    border: isTarget 
                                      ? '2px solid #f59e0b' 
                                      : msg.role === 'assistant' 
                                        ? '1px dashed #cbd5e1' 
                                        : '1px solid transparent', 
                                    alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end', 
                                    maxWidth: '85%',
                                    cursor: msg.role === 'assistant' ? 'pointer' : 'default',
                                    position: 'relative'
                                  }}
                                >
                                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                      {msg.role === 'user' ? 'Học sinh' : isTarget ? 'Trợ giảng AI (Mục tiêu viết lại)' : 'Trợ giảng AI'}
                                    </span>
                                    {msg.role === 'assistant' && (
                                      <span style={{ fontSize: '10px', color: isTarget ? '#d97706' : '#94a3b8', fontWeight: 'bold' }}>
                                        {isTarget ? '🎯 Đang chọn' : '✏️ Click để chọn'}
                                      </span>
                                    )}
                                  </div>
                                  <div>{msg.text}</div>
                                  {messageLabels.length > 0 && (
                                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {messageLabels.map((item: any, labelIdx: number) => {
                                        const isIntent = item.kind === 'Intent';
                                        let bg = isIntent ? '#eef2ff' : '#ecfdf5';
                                        let fg = isIntent ? '#4338ca' : '#047857';
                                        let border = `1px solid ${isIntent ? '#c7d2fe' : '#a7f3d0'}`;
                                        let prefix = '';

                                        if (item.source === 'checker') {
                                          bg = '#f0fdf4';
                                          fg = '#16a34a';
                                          border = '1px solid #bbf7d0';
                                          prefix = '✅ Checker: ';
                                        } else if (item.source === 'supervisor') {
                                          bg = '#faf5ff';
                                          fg = '#7c3aed';
                                          border = '1px solid #e9d5ff';
                                          prefix = '👑 Supervisor: ';
                                        } else if (item.source === 'ai') {
                                          bg = '#fff7ed';
                                          fg = '#ea580c';
                                          border = '1px solid #ffedd5';
                                          prefix = '🤖 AI: ';
                                        } else {
                                          prefix = `👤 ${item.staff}: `;
                                        }

                                        return (
                                          <span
                                            key={`${item.staff}-${item.label}-${labelIdx}`}
                                            title={`${item.kind} • assigned by ${item.staff}`}
                                            style={{
                                              padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '700',
                                              background: bg,
                                              color: fg,
                                              border,
                                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            }}
                                          >
                                            <span style={{ opacity: 0.8, fontWeight: '800' }}>{prefix}</span>
                                            {TRANSLATED_LABEL_MAP[item.label] || item.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <Info size={16} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: '13px', color: '#64748b', marginRight: 'auto' }}>Quyết định của Supervisor</span>
                            {[
                              { value: 'Gold', label: 'Đánh dấu Tốt', bg: '#dcfce7', color: '#15803d' },
                              { value: 'Rewrite', label: 'Đánh dấu Viết lại', bg: '#fef3c7', color: '#92400e' },
                              { value: 'Reject', label: 'Đánh dấu Chưa đạt', bg: '#fee2e2', color: '#dc2626' },
                            ].map(action => (
                              <button key={action.value} onClick={() => handleAdminSetVerdict(reviewDetailModal, action.value as any)}
                                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${action.color}55`, background: action.bg, color: action.color, fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ===== STEP 9: ASSIGN REWRITE (BULK ASSIGN) ===== */}
          {currentSubStep4 === 9 && (() => {
            const rewriteItems = displayQualityItems.filter(i => ['Rewrite', 'Reject', 'Bad'].includes(getQualityLabel(i))) as any[];
            const rewriteAssignTotalPages = Math.max(1, Math.ceil(rewriteItems.length / itemsPerPage));
            const rewriteAssignSafePage = Math.min(rewriteAssignPage, rewriteAssignTotalPages);
            const paginatedRewriteItems = rewriteItems.slice((rewriteAssignSafePage - 1) * itemsPerPage, rewriteAssignSafePage * itemsPerPage);
            const allSelected = rewriteItems.length > 0 && selectedRewriteIds.length === rewriteItems.length;
            const rewriteTaskBySample = new Map(rewriteAssignments.map((task: any) => [String(task.sampleId), task]));
            const assignedCount = rewriteItems.filter(i => rewriteTaskBySample.has(String(i.sampleObjectId || i._id || i.id))).length;
            const pendingCount = rewriteItems.length - assignedCount;
            const progress = rewriteItems.length > 0 ? Math.round((assignedCount / rewriteItems.length) * 100) : 0;
            const submittedCount = rewriteAssignments.filter((task: any) => task.status === 'submitted').length;
            const approvedTaskCount = rewriteAssignments.filter((task: any) => task.status === 'approved').length;
            const redoCount = rewriteAssignments.filter((task: any) => ['redo', 'rejected'].includes(task.status)).length;
            const completionProgress = rewriteAssignments.length ? Math.round(((submittedCount + approvedTaskCount) / rewriteAssignments.length) * 100) : 0;

            const subjectColors = {
              'Math': { bg: '#e0e7ff', color: '#4338ca' }, 'Physics': { bg: '#cffafe', color: '#0e7490' },
              'Chemistry': { bg: '#d1fae5', color: '#065f46' }, 'Biology': { bg: '#fef3c7', color: '#92400e' },
              'History': { bg: '#ede9fe', color: '#6d28d9' }, 'Geography': { bg: '#fee2e2', color: '#b91c1c' },
              'Literature': { bg: '#fce7f3', color: '#9d174d' }, 'English': { bg: '#fff7ed', color: '#9a3412' },
              'PHYSICAL': { bg: '#cffafe', color: '#0e7490' }, 'CHEMISTRY': { bg: '#d1fae5', color: '#065f46' },
              'BIOLOGY': { bg: '#fef3c7', color: '#92400e' }, 'HISTORY': { bg: '#ede9fe', color: '#6d28d9' },
              'GEOGRAPHY': { bg: '#fee2e2', color: '#b91c1c' }, 'LITERATURE': { bg: '#fce7f3', color: '#9d174d' },
              'MATH': { bg: '#e0e7ff', color: '#4338ca' },
            };
            const getSubjectStyle = (s) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };

            const staffColors = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626'];
            const selectedRewriteStaff = shareUsers.filter((u: any) => selectedRewriteStaffIds.includes(String(u._id || u.id || '')));
            const assignmentStaffPool = selectedRewriteStaff;
            const staffList = assignmentStaffPool.length > 0
              ? assignmentStaffPool.map((u: any, idx: number) => {
                const name = u.name || u.username || u.email || 'Unknown Staff';
                return {
                  value: name,
                  id: String(u._id || u.id || ''),
                  initials: name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST',
                  color: staffColors[idx % staffColors.length],
                };
              })
              : [];
            const getStaffColor = (name) => staffList.find(s => s.value === name)?.color || '#64748b';
            const getStaffInitials = (name) => staffList.find(s => s.value === name)?.initials || '??';
            const getRewriteProjectName = (item: any) => String(
              item.projectName ||
              item.dataset ||
              item.datasetName ||
              item.versionName ||
              name ||
              'Current Project'
            );
            const getRewriteItemKey = (item: any) => String(item.sampleObjectId || item._id || item.id);
            const buildRewriteAssignmentPayload = (item: any, staff: any, reason?: string) => {
              const messages = item.data?.messages || item.messages || [];
              let targetMessageIndex = item.errorMessageIndex ?? -1;
              if (targetMessageIndex < 0) {
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i]?.role === 'assistant') {
                    targetMessageIndex = i;
                    break;
                  }
                }
              }
              const originalText = targetMessageIndex >= 0
                ? String(messages[targetMessageIndex]?.content || messages[targetMessageIndex]?.text || '')
                : '';
              return {
                sampleId: getRewriteItemKey(item),
                assigneeId: String(staff._id || staff.id || ''),
                convId: String(item.convId || item.sampleId || item.id),
                subject: item.subject || '',
                reason: reason || rewriteReasons[item.id] || item.issue || 'Quality review requires rewrite',
                originalText,
                targetMessageIndex: targetMessageIndex >= 0 ? targetMessageIndex : undefined,
                contextMode: 'n-2:n+3',
                projectName: getRewriteProjectName(item),
              };
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header card */}
                <div style={{ background: 'linear-gradient(135deg, #fafbff 0%, #f0f4ff 100%)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px 28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileText size={18} style={{ color: '#fff' }} />
                        </div>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>Assign Rewrite Tasks to Staff</h2>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Assign conversations that need editing to team members. Select multiple for bulk assignment.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Assigned</div>
                        <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', lineHeight: 1.2 }}>{pendingCount}</div>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned</div>
                        <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', lineHeight: 1.2 }}>{assignedCount}</div>
                      </div>
                      <button onClick={() => setShowRewriteStaffPicker(true)}
                        style={{ padding: '12px 18px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Chọn Staff ({assignmentStaffPool.length})
                      </button>
                      <button disabled={isAutoAssigningRewrite || !rewriteItems.length || !assignmentStaffPool.length} onClick={async () => {
                        if (!activeVersionId) return alert('Missing dataset version.');
                        if (!assignmentStaffPool.length) return alert('Chọn Staff rảnh để chia task rewrite trước.');
                        const groupedItems = rewriteItems.reduce((groups: Record<string, any[]>, item: any) => {
                          const key = getRewriteProjectName(item);
                          if (!groups[key]) groups[key] = [];
                          groups[key].push(item);
                          return groups;
                        }, {});
                        setIsAutoAssigningRewrite(true);
                        const nextAssignments: Record<string, string> = {};
                        const assignments = Object.values(groupedItems).flatMap((items: any[]) => items.map((item: any, index: number) => {
                          const staff = assignmentStaffPool[index % assignmentStaffPool.length];
                          const staffId = String(staff._id || staff.id || '');
                          const staffName = staff.name || staff.username || staff.email || 'Staff';
                          const messages = item.data?.messages || item.messages || [];
                          let targetMessageIndex = -1;
                          for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'assistant') { targetMessageIndex = i; break; }
                          const originalText = targetMessageIndex >= 0 ? String(messages[targetMessageIndex]?.content || '') : '';
                          nextAssignments[item.id] = staffName;
                          return {
                            sampleId: String(item.sampleObjectId || item._id || item.id), assigneeId: staffId,
                            convId: String(item.convId || item.sampleId || item.id), subject: item.subject || '',
                            reason: rewriteReasons[item.id] || item.issue || 'Quality review requires rewrite',
                            originalText, targetMessageIndex: targetMessageIndex >= 0 ? targetMessageIndex : undefined,
                            contextMode: 'n-2:n+3',
                            projectName: getRewriteProjectName(item),
                          };
                        }));
                        try {
                          const result = await stage4Api.bulkAssignRewrite(activeVersionId, assignments);
                          setReassignStaff(prev => ({ ...prev, ...nextAssignments }));
                          const refreshed = await stage4Api.listRewriteAssignments(activeVersionId);
                          setRewriteAssignments(refreshed.tasks || []);
                          alert(`Đã giao thành công ${result.assignedCount}/${result.requestedCount} task rewrite.`);
                        } catch (error: any) {
                          alert(error?.response?.data?.error || 'Không thể giao task rewrite. Không có thay đổi nào được áp dụng.');
                        } finally {
                          setIsAutoAssigningRewrite(false);
                        }
                      }}
                        style={{ padding: '12px 18px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: '1px solid #0f766e', background: isAutoAssigningRewrite ? '#ccfbf1' : '#0f766e', color: isAutoAssigningRewrite ? '#115e59' : '#fff', cursor: isAutoAssigningRewrite ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                        {isAutoAssigningRewrite ? 'Đang chia task...' : 'Tự động chia đều'}
                      </button>
                      <button onClick={() => setShowRewriteProgress(true)}
                        style={{ padding: '12px 18px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Tiến độ
                      </button>
                      <button onClick={() => setCurrentSubStep4(10)}
                        style={{ padding: '12px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.25)', whiteSpace: 'nowrap' }}>
                        Đi tới Duyệt &rarr;
                      </button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Assignment progress</span>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5' }}>{assignedCount} / {rewriteItems.length} conversations</span>
                    </div>
                    <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #4f46e5, #7c3aed)', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'none', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Chọn Staff rảnh để chia Rewrite</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>Auto chia chỉ dùng danh sách được chọn, không lấy toàn bộ Staff trong hệ thống.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setSelectedRewriteStaffIds(shareUsers.map((u: any) => String(u._id || u.id || '')).filter(Boolean))}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', fontWeight: 800, cursor: 'pointer' }}>
                        Chọn tất cả
                      </button>
                      <button type="button" onClick={() => setSelectedRewriteStaffIds([])}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 800, cursor: 'pointer' }}>
                        Bỏ chọn
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: 220, overflowY: 'auto' }}>
                    {shareUsers.map((u: any, idx: number) => {
                      const id = String(u._id || u.id || '');
                      const checked = selectedRewriteStaffIds.includes(id);
                      const staffName = u.name || u.username || u.email || 'Staff';
                      return (
                        <label key={id || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${checked ? '#a7f3d0' : '#e2e8f0'}`, background: checked ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                          <input type="checkbox" checked={checked} onChange={() => setSelectedRewriteStaffIds(prev => checked ? prev.filter(x => x !== id) : [...prev, id])}
                            style={{ width: 16, height: 16, accentColor: '#059669' }} />
                          <span style={{ width: 28, height: 28, borderRadius: '50%', background: staffColors[idx % staffColors.length], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>
                            {staffName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST'}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staffName}</strong>
                            <small style={{ display: 'block', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email || u.username || 'Active Staff'}</small>
                          </span>
                        </label>
                      );
                    })}
                    {!shareUsers.length && <div style={{ color: '#94a3b8', fontSize: 13 }}>Không có Staff active.</div>}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: assignmentStaffPool.length ? '#047857' : '#b45309' }}>
                    Đã chọn {assignmentStaffPool.length}/{shareUsers.length} Staff cho rewrite assignment.
                  </div>
                </div>

                <div style={{ display: 'none', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div><div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>Tiến độ Rewrite của Staff</div><div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Tự cập nhật mỗi 10 giây, không cần theo dõi từng notification.</div></div>
                    <strong style={{ fontSize: '18px', color: '#0f766e' }}>{completionProgress}%</strong>
                  </div>
                  <div style={{ height: '9px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '14px' }}><div style={{ height: '100%', width: `${completionProgress}%`, background: '#0f766e', transition: 'width .3s ease' }}/></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: '8px' }}>
                    {[
                      { label: 'Đang thực hiện', value: Math.max(0, rewriteAssignments.length - submittedCount - approvedTaskCount - redoCount), color: '#2563eb', bg: '#eff6ff' },
                      { label: 'Chờ Admin duyệt', value: submittedCount, color: '#c2410c', bg: '#fff7ed' },
                      { label: 'Cần làm lại', value: redoCount, color: '#be123c', bg: '#fff1f2' },
                      { label: 'Đã duyệt', value: approvedTaskCount, color: '#15803d', bg: '#f0fdf4' },
                    ].map(status => <div key={status.label} style={{ background: status.bg, borderRadius: '8px', padding: '10px 12px' }}><div style={{ fontSize: '20px', fontWeight: '900', color: status.color }}>{status.value}</div><div style={{ fontSize: '11px', fontWeight: '700', color: status.color }}>{status.label}</div></div>)}
                  </div>
                </div>

                {showRewriteStaffPicker && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setShowRewriteStaffPicker(false)}>
                    <div style={{ width: 'min(860px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 24px 80px rgba(15,23,42,.35)', border: '1px solid #e2e8f0' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Chọn Staff rảnh để chia Rewrite</h3>
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Auto chia chỉ dùng danh sách được chọn.</p>
                        </div>
                        <button onClick={() => setShowRewriteStaffPicker(false)} style={{ border: 0, background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>Đóng</button>
                      </div>
                      <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ color: assignmentStaffPool.length ? '#047857' : '#b45309' }}>Đã chọn {assignmentStaffPool.length}/{shareUsers.length} Staff</strong>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setSelectedRewriteStaffIds(shareUsers.map((u: any) => String(u._id || u.id || '')).filter(Boolean))}
                              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', fontWeight: 800, cursor: 'pointer' }}>Chọn tất cả</button>
                            <button type="button" onClick={() => setSelectedRewriteStaffIds([])}
                              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 800, cursor: 'pointer' }}>Bỏ chọn</button>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                          {shareUsers.map((u: any, idx: number) => {
                            const id = String(u._id || u.id || '');
                            const checked = selectedRewriteStaffIds.includes(id);
                            const staffName = u.name || u.username || u.email || 'Staff';
                            return (
                              <label key={id || idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${checked ? '#a7f3d0' : '#e2e8f0'}`, background: checked ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                                <input type="checkbox" checked={checked} onChange={() => setSelectedRewriteStaffIds(prev => checked ? prev.filter(x => x !== id) : [...prev, id])} style={{ width: 16, height: 16, accentColor: '#059669' }} />
                                <span style={{ width: 28, height: 28, borderRadius: '50%', background: staffColors[idx % staffColors.length], color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>
                                  {staffName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST'}
                                </span>
                                <span style={{ minWidth: 0 }}>
                                  <strong style={{ display: 'block', fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staffName}</strong>
                                  <small style={{ display: 'block', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email || u.username || 'Active Staff'}</small>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {showRewriteProgress && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.42)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setShowRewriteProgress(false)}>
                    <div style={{ width: 'min(620px, 96vw)', background: '#fff', borderRadius: 12, boxShadow: '0 24px 80px rgba(15,23,42,.35)', border: '1px solid #e2e8f0' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Tiến độ Rewrite</h3>
                        <button onClick={() => setShowRewriteProgress(false)} style={{ border: 0, background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>Đóng</button>
                      </div>
                      <div style={{ padding: 20 }}>
                        <strong style={{ fontSize: 28, color: '#0f766e' }}>{completionProgress}%</strong>
                        <div style={{ height: 9, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', margin: '12px 0 16px' }}><div style={{ height: '100%', width: `${completionProgress}%`, background: '#0f766e' }} /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(100px, 1fr))', gap: 8 }}>
                          {[
                            { label: 'Đang làm', value: Math.max(0, rewriteAssignments.length - submittedCount - approvedTaskCount - redoCount), color: '#2563eb', bg: '#eff6ff' },
                            { label: 'Chờ duyệt', value: submittedCount, color: '#c2410c', bg: '#fff7ed' },
                            { label: 'Làm lại', value: redoCount, color: '#be123c', bg: '#fff1f2' },
                            { label: 'Đã duyệt', value: approvedTaskCount, color: '#15803d', bg: '#f0fdf4' },
                          ].map(status => <div key={status.label} style={{ background: status.bg, borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 20, fontWeight: 900, color: status.color }}>{status.value}</div><div style={{ fontSize: 11, fontWeight: 700, color: status.color }}>{status.label}</div></div>)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '14px 16px', width: '44px' }}>
                          <input type="checkbox" checked={allSelected} onChange={() => setSelectedRewriteIds(allSelected ? [] : rewriteItems.map(i => i.id))}
                            style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }} />
                        </th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conv ID</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Project</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issue Detected</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '190px' }}>Rewrite Reason</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '220px' }}>Assign to</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '100px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRewriteItems.map((item, i) => {
                        const checked = selectedRewriteIds.includes(item.id);
                        const persistedTask = rewriteTaskBySample.get(String(item.sampleObjectId || item._id || item.id));
                        const staff = persistedTask?.staffName || reassignStaff[item.id];
                        const subjStyle = getSubjectStyle(item.subject);
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: checked ? '#f5f3ff' : i % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 0.15s' }}>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <input type="checkbox" checked={checked} onChange={() => setSelectedRewriteIds(prev => checked ? prev.filter(x => x !== item.id) : [...prev, item.id])}
                                style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }} />
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ fontWeight: '700', color: '#1e293b', fontFamily: 'monospace', fontSize: '13px', background: '#f8fafc', padding: '3px 8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>{item.convId}</span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>{getRewriteProjectName(item)}</span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: subjStyle.bg, color: subjStyle.color }}>{item.subject}</span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0, display: 'inline-block' }} />
                                {item.issue}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <select value={rewriteReasons[item.id] || 'None'} onChange={e => setRewriteReasons(prev => ({ ...prev, [item.id]: e.target.value }))}
                                style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', outline: 'none', maxWidth: '180px' }}>
                                {rewriteReasonOptions.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              {staff ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: getStaffColor(staff), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#fff' }}>{getStaffInitials(staff)}</span>
                                  </div>
                                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{staff}</span>
                                  <button onClick={() => setReassignStaff(prev => { const n = { ...prev }; delete n[item.id]; return n; })}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>&times;</button>
                                </div>
                              ) : (
                                <select value="" onChange={e => handleAssignSingleRewrite(item.id, e.target.value)}
                                  style={{ padding: '7px 12px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', outline: 'none', minWidth: '160px' }}>
                                  <option value="">Select staff member...</option>
                                  {staffList.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                              <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: staff ? '#dcfce7' : '#f1f5f9', color: staff ? '#15803d' : '#94a3b8', letterSpacing: '0.3px' }}>
                                {staff ? '✓ Assigned' : 'Not Assigned'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px' }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                    Showing {rewriteItems.length ? (rewriteAssignSafePage - 1) * itemsPerPage + 1 : 0}-{Math.min(rewriteAssignSafePage * itemsPerPage, rewriteItems.length)} of {rewriteItems.length}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" disabled={rewriteAssignSafePage <= 1} onClick={() => setRewriteAssignPage((p) => Math.max(1, p - 1))}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: rewriteAssignSafePage <= 1 ? '#f8fafc' : '#fff', color: '#334155', cursor: rewriteAssignSafePage <= 1 ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                      Prev
                    </button>
                    <strong style={{ fontSize: 13, color: '#0f172a' }}>{rewriteAssignSafePage}/{rewriteAssignTotalPages}</strong>
                    <button type="button" disabled={rewriteAssignSafePage >= rewriteAssignTotalPages} onClick={() => setRewriteAssignPage((p) => Math.min(rewriteAssignTotalPages, p + 1))}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: rewriteAssignSafePage >= rewriteAssignTotalPages ? '#f8fafc' : '#fff', color: '#334155', cursor: rewriteAssignSafePage >= rewriteAssignTotalPages ? 'not-allowed' : 'pointer', fontWeight: 800 }}>
                      Next
                    </button>
                  </div>
                </div>

                {/* Floating bulk assign bar */}
                {selectedRewriteIds.length > 0 && (
                  <div style={{ position: 'sticky', bottom: '16px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '12px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '900' }}>{selectedRewriteIds.length}</span>
                      </div>
                      <span style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '14px' }}>conversations selected</span>
                    </div>
                    <div style={{ width: '1px', height: '32px', background: '#334155' }} />
                    <select value={bulkAssignStaff} onChange={e => setBulkAssignStaff(e.target.value)}
                      style={{ padding: '10px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#334155', color: '#f1f5f9', cursor: 'pointer', flex: 1, maxWidth: '240px', outline: 'none' }}>
                      <option value="">Select staff to assign...</option>
                      {staffList.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                    </select>
                    <select value={bulkRewriteReason} onChange={e => setBulkRewriteReason(e.target.value)}
                      style={{ padding: '10px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#334155', color: '#f1f5f9', cursor: 'pointer', flex: 1, maxWidth: '240px', outline: 'none' }}>
                      {rewriteReasonOptions.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                    <button onClick={async () => {
                      if (!bulkAssignStaff) return alert('Vui lòng chọn nhân viên!');
                      const staff = shareUsers.find(u => u.name === bulkAssignStaff || u.username === bulkAssignStaff || u.email === bulkAssignStaff);
                      if (!staff || !activeVersionId) return;
                      const staffId = String(staff._id || staff.id);

                      const assignments: any[] = [];
                      selectedRewriteIds.forEach(id => {
                        const item = rewriteItems.find(x => x.id === id);
                        if (!item) return;
                        const messages = item.data?.messages || item.messages || [];
                        const targetIndices = item.errorMessageIndices && item.errorMessageIndices.length > 0
                          ? item.errorMessageIndices
                          : (() => {
                              let targetIdx = item.errorMessageIndex ?? -1;
                              if (targetIdx < 0) {
                                for (let i = messages.length - 1; i >= 0; i--) {
                                  if (messages[i]?.role === 'assistant') {
                                    targetIdx = i;
                                    break;
                                  }
                                }
                              }
                              return targetIdx >= 0 ? [targetIdx] : [1];
                            })();

                        targetIndices.forEach((targetIdx: number) => {
                          const originalText = targetIdx >= 0 ? String(messages[targetIdx]?.content || messages[targetIdx]?.text || '') : '';
                          assignments.push({
                            sampleId: String(item.sampleObjectId || item._id || item.id),
                            assigneeId: staffId,
                            convId: String(item.convId || item.sampleId || item.id),
                            subject: item?.subject || '',
                            reason: bulkRewriteReason || rewriteReasons[id] || item?.issue || 'Quality review requires rewrite',
                            originalText,
                            targetMessageIndex: targetIdx >= 0 ? targetIdx : undefined,
                            contextMode: 'n-2:n+3'
                          });
                        });
                      });

                      try {
                        const result = await stage4Api.bulkAssignRewrite(activeVersionId, assignments);
                        const updates = {};
                        const reasonUpdates = {};
                        selectedRewriteIds.forEach(id => {
                          updates[id] = bulkAssignStaff;
                          reasonUpdates[id] = bulkRewriteReason;
                        });
                        setReassignStaff(prev => ({ ...prev, ...updates }));
                        setRewriteReasons(prev => ({ ...prev, ...reasonUpdates }));
                        setSelectedRewriteIds([]);
                        setBulkAssignStaff('');
                        setBulkRewriteReason('None');
                        const refreshed = await stage4Api.listRewriteAssignments(activeVersionId);
                        setRewriteAssignments(refreshed.tasks || []);
                        alert(`Đã giao thành công ${result.assignedCount}/${result.requestedCount} task rewrite.`);
                      } catch (error: any) {
                        alert(error?.response?.data?.error || 'Không thể giao task rewrite.');
                      }
                    }} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.4)' }}>
                      Giao tất cả
                    </button>
                    <button onClick={() => setSelectedRewriteIds([])}
                      style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
                      Hủy
                    </button>
                  </div>
                )}

                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(10)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tiếp: Duyệt bài Viết lại &rarr;
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ===== STEP 10: STAFF SUBMISSION REVIEW (3b) ===== */}
          {currentSubStep4 === 10 && (() => {
            const rewriteItems = displayQualityItems.filter(i => ['Rewrite', 'Reject', 'Bad'].includes(getQualityLabel(i))) as any[];
            const taskBySample = new Map(rewriteAssignments.map((task: any) => [String(task.sampleId), task]));
            const approvedCount = rewriteAssignments.filter((task: any) => task.status === 'approved').length;
            const pendingCount = rewriteAssignments.filter((task: any) => task.status === 'submitted').length;

            const subjectColors = {
              'Math': { bg: '#e0e7ff', color: '#4338ca' }, 'Physics': { bg: '#cffafe', color: '#0e7490' },
              'Chemistry': { bg: '#d1fae5', color: '#065f46' }, 'Biology': { bg: '#fef3c7', color: '#92400e' },
              'History': { bg: '#ede9fe', color: '#6d28d9' }, 'Geography': { bg: '#fee2e2', color: '#b91c1c' },
              'Literature': { bg: '#fce7f3', color: '#9d174d' }, 'English': { bg: '#fff7ed', color: '#9a3412' },
              'PHYSICAL': { bg: '#cffafe', color: '#0e7490' }, 'CHEMISTRY': { bg: '#d1fae5', color: '#065f46' },
              'BIOLOGY': { bg: '#fef3c7', color: '#92400e' }, 'HISTORY': { bg: '#ede9fe', color: '#6d28d9' },
              'GEOGRAPHY': { bg: '#fee2e2', color: '#b91c1c' }, 'LITERATURE': { bg: '#fce7f3', color: '#9d174d' },
              'MATH': { bg: '#e0e7ff', color: '#4338ca' },
            };
            const getSubjectStyle = (s: string) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a', borderRadius: '12px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                      <Search size={22} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#78350f' }}>Duyệt bài Viết lại của Staff</h2>
                      <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#92400e' }}>So sánh bản gốc và bản sửa của Staff. Duyệt (Tốt) hoặc yêu cầu làm lại.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>Chờ duyệt</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', lineHeight: 1.2 }}>{pendingCount}</div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>Đã duyệt</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', lineHeight: 1.2 }}>{approvedCount}</div>
                    </div>
                  </div>
                </div>

                {/* Table View */}
                {rewriteItems.length === 0 ? (
                  <div className="empty-state-card">
                    <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                    <h3 className="empty-state-title">Không có bài chờ duyệt!</h3>
                    <p className="empty-state-desc">Tất cả bài viết lại của staff đã được xem xét và duyệt.</p>
                  </div>
                ) : (
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
                    {/* Submission List Header with Integrated Progress Bar */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Danh sách bài nộp</h4>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>({rewriteItems.length} mục)</span>
                      </div>
                      
                      {/* Integrated Progress Bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '450px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#64748b', whiteSpace: 'nowrap' }}>
                          Tiến độ: {approvedCount}/{rewriteItems.length}
                        </span>
                        <div style={{ flex: 1, height: '8px', background: '#cbd5e1', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.round(rewriteItems.length > 0 ? (approvedCount / rewriteItems.length) * 100 : 0))}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)', borderRadius: '999px', transition: 'width 0.5s ease-out' }} />
                        </div>
                        <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#16a34a', minWidth: '40px', textAlign: 'right' }}>
                          {Math.round(rewriteItems.length > 0 ? (approvedCount / rewriteItems.length) * 100 : 0)}%
                        </span>
                      </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mã hội thoại</th>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Môn học</th>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staff được giao</th>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lỗi cần sửa</th>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trạng thái</th>
                          <th style={{ padding: '14px 18px', fontSize: '12px', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rewriteItems.map((item, idx) => {
                          const task = taskBySample.get(String(item.sampleObjectId || item._id || item.id));
                          const staffName = reassignStaff[item.id] || (task?.assigneeId ? shareUsers.find((u: any) => String(u.id || u._id) === String(task.assigneeId))?.name : '') || 'Chưa giao';
                          const subjStyle = getSubjectStyle(item.subject);
                          
                          let statusLabel = 'Not Assigned';
                          let statusColor = { bg: '#f1f5f9', text: '#64748b' };
                          if (task) {
                            if (task.status === 'approved') {
                              statusLabel = 'Đã duyệt (Tốt)';
                              statusColor = { bg: '#dcfce7', text: '#15803d' };
                            } else if (task.status === 'submitted') {
                              statusLabel = 'Chờ duyệt';
                              statusColor = { bg: '#fef9c3', text: '#854d0e' };
                            } else if (task.status === 'redo') {
                              statusLabel = 'Yêu cầu làm lại';
                              statusColor = { bg: '#fee2e2', text: '#991b1b' };
                            } else if (task.status === 'rejected') {
                              statusLabel = 'Từ chối';
                              statusColor = { bg: '#fee2e2', text: '#dc2626' };
                            } else if (task.status === 'assigned') {
                              statusLabel = 'Đã giao (Đang làm)';
                              statusColor = { bg: '#e0f2fe', text: '#0369a1' };
                            }
                          } else if (completedRewrites[item.id]) {
                            statusLabel = 'Approved (Gold)';
                            statusColor = { bg: '#dcfce7', text: '#15803d' };
                          }

                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50 transition-colors">
                              <td style={{ padding: '14px 18px', fontSize: '13px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>
                                {item.convId}
                              </td>
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '999px', background: subjStyle.bg, color: subjStyle.color }}>
                                  {item.subject}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', fontSize: '13px', color: '#475569', fontWeight: '600' }}>
                                {staffName !== 'Unassigned' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4f46e5' }}>
                                    <User size={13} />
                                    {staffName}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Chưa giao</span>
                                )}
                              </td>
                              <td style={{ padding: '14px 18px', fontSize: '13px', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.reason || item.issue || 'Quality review requires rewrite'}>
                                {item.reason || item.issue || 'Quality review requires rewrite'}
                              </td>
                              <td style={{ padding: '14px 18px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', background: statusColor.bg, color: statusColor.text, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                <button onClick={() => {
                                  setRewriteConvIdx(idx);
                                  setReviewSubmissionModal(item);
                                }}
                                style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: '800', borderRadius: '8px', border: '1px solid #4f46e5', background: '#f5f3ff', color: '#4f46e5', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 4px rgba(79,70,229,0.08)' }}>
                                  <Search size={13} /> Xem xét &amp; Xử lý
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(11)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tiếp: Phân phối Dataset &rarr;
                  </button>
                </div>
              </div>
            );
          })()}
          {/* ===== STEP 11: FINAL DISTRIBUTION DASHBOARD ===== */}
          {currentSubStep4 === 11 && (() => {
            const statSummary = statistics?.summary;
            const totalConv = statSummary?.totalSamples ?? displayQualityItems.length;

            // Count total messages from displayQualityItems
            const totalMsg = displayQualityItems.reduce((acc, item) => acc + (item.messages?.length || 0), 0);

            const goldCount = statSummary?.distribution?.Gold ?? displayQualityItems.filter(item => getQualityLabel(item) === 'Gold').length;
            const rewriteCount = statSummary?.distribution?.Rewrite ?? displayQualityItems.filter(item => getQualityLabel(item) === 'Rewrite').length;
            const rejectCount = statSummary?.distribution?.Reject ?? displayQualityItems.filter(item => getQualityLabel(item) === 'Reject').length;
            const badCount = displayQualityItems.filter(item => getQualityLabel(item) === 'Bad').length;
            const incompleteCount = statSummary?.distribution?.Incomplete ?? displayQualityItems.filter(item => getQualityLabel(item) === 'Incomplete').length;
            const goldRate = totalConv > 0 ? Math.round((goldCount / totalConv) * 100) : 0;
            const rewriteRate = totalConv > 0 ? Math.round((rewriteCount / totalConv) * 100) : 0;
            const rejectRate = totalConv > 0 ? Math.round((rejectCount / totalConv) * 100) : 0;
            const badRate = totalConv > 0 ? Math.round((badCount / totalConv) * 100) : 0;
            const incompleteRate = totalConv > 0 ? Math.round((incompleteCount / totalConv) * 100) : 0;
            const badRejectCount = Math.max(badCount, rejectCount);
            const badRejectRate = totalConv > 0 ? Math.round((badRejectCount / totalConv) * 100) : 0;

            const scorableResults = results.map((result: any) => Number(result.averageOverall ?? result.averageScore)).filter(Number.isFinite);
            const avgAIScore = scorableResults.length > 0
              ? parseFloat((scorableResults.reduce((acc, score) => acc + score, 0) / scorableResults.length).toFixed(1))
              : 0;

            const conflictCount = displayQualityItems.filter(item => getScoresForSample(item.sampleObjectId || item.id, item.convId).conflict).length;

            const subjectColors = {
              'Math': '#4f46e5', 'Physics': '#0891b2', 'Chemistry': '#059669', 'Biology': '#d97706',
              'History': '#7c3aed', 'Geography': '#dc2626', 'Literature': '#0d9488', 'English': '#ea580c',
              'PHYSICAL': '#0891b2', 'CHEMISTRY': '#059669', 'BIOLOGY': '#d97706', 'HISTORY': '#7c3aed',
              'GEOGRAPHY': '#dc2626', 'LITERATURE': '#0d9488', 'MATH': '#4f46e5'
            };
            const stage2GroupMap = new Map<string, { name: string; conv: number; color: string }>();
            (Array.isArray(conversationsList) ? conversationsList : []).forEach((conv: any) => {
              const groupName = conv.groupLabel || (conv.groupId !== undefined && conv.groupId !== null ? `Group ${conv.groupId}` : conv.subject || 'Ungrouped');
              const color = conv.groupColor || subjectColors[groupName] || '#64748b';
              const current = stage2GroupMap.get(groupName) || { name: groupName, conv: 0, color };
              current.conv += 1;
              stage2GroupMap.set(groupName, current);
            });
            const stage2GroupData = Array.from(stage2GroupMap.values()).map((item) => ({
              ...item,
              pct: totalConv > 0 ? Math.round((item.conv / totalConv) * 100) : 0,
            }));
            const itemSubjectMap = new Map<string, { name: string; conv: number; color: string }>();
            displayQualityItems.forEach((item: any) => {
              const name = String(item.subject || 'Ungrouped');
              const current = itemSubjectMap.get(name) || { name, conv: 0, color: subjectColors[name] || '#64748b' };
              current.conv += 1;
              itemSubjectMap.set(name, current);
            });
            const itemSubjectData = Array.from(itemSubjectMap.values()).map((item) => ({
              ...item,
              pct: totalConv > 0 ? Math.round((item.conv / totalConv) * 100) : 0,
            }));
            const subjectData = (statistics?.bySubject && statistics.bySubject.length > 0)
              ? statistics.bySubject.map((s: any) => ({
                name: s.subject,
                conv: s.total,
                pct: totalConv > 0 ? Math.round((s.total / totalConv) * 100) : 0,
                color: subjectColors[s.subject] || '#64748b'
              }))
              : stage2GroupData.length > 0 && stage2GroupData.some(g => g.name !== 'Ungrouped') ? stage2GroupData
                : itemSubjectData.length > 0 ? itemSubjectData : [];

            const derivedReasonMap = new Map<string, { reason: string; count: number; bucket: string }>();
            displayQualityItems
              .filter((item: any) => ['Rewrite', 'Reject', 'Bad'].includes(getQualityLabel(item)))
              .forEach((item: any) => {
                const assignedReason = rewriteReasons[item.id];
                const reason = String(assignedReason && assignedReason !== 'None' ? assignedReason : item.reason || item.issue || '').trim();
                if (!reason || reason === 'No special issues flagged.' || reason === 'None') return;
                const bucket = getQualityLabel(item) === 'Bad' ? 'Reject' : getQualityLabel(item);
                const current = derivedReasonMap.get(reason) || { reason, count: 0, bucket };
                current.count += 1;
                derivedReasonMap.set(reason, current);
              });
            const derivedReasonTotal = Array.from(derivedReasonMap.values()).reduce((sum, item) => sum + item.count, 0);
            const topReasons = statistics?.commonErrors ? statistics.commonErrors.map(e => ({
              reason: e.error,
              count: e.count,
              pct: rewriteCount + rejectCount > 0 ? Math.round((e.count / (rewriteCount + rejectCount)) * 100) : 0,
              bucket: e.error.toLowerCase().includes('reject') || e.error.toLowerCase().includes('fail') || e.error.toLowerCase().includes('sai') ? 'Reject' : 'Rewrite'
            })) : Array.from(derivedReasonMap.values())
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
              .map((item) => ({
                ...item,
                pct: derivedReasonTotal > 0 ? Math.round((item.count / derivedReasonTotal) * 100) : 0,
              }));

            const staffData = (assignmentDashboard?.users && assignmentDashboard.users.length > 0) ? assignmentDashboard.users.map((u: any) => {
              const done = getStaffLabeledSamples(u);
              const total = Number(u.assignedSamples || 0);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const status = getStaffStatusLabel(u, pct);
              return {
                name: u.user?.name || u.user?.username || 'Unknown Staff',
                subject: u.submission?.name || 'Assigned Data',
                assigned: total,
                approved: done,
                rate: pct,
                status: status
              };
            }) : [];

            const realConflicts = displayQualityItems
              .map((item: any) => ({ item, scores: getScoresForSample(item.sampleObjectId || item.id, item.convId) }))
              .filter(({ scores }) => scores.conflict);
            const conflictData = realConflicts.length > 0 ? realConflicts.map(c => ({
              id: c.item.convId,
              subject: c.item.subject,
              openrouter: c.scores.openrouter,
              deepseek: c.scores.deepseek,
              human: c.scores.human,
              diff: getAvgAI(c.scores) != null && c.scores.human != null ? Math.abs(getAvgAI(c.scores)! - c.scores.human) : 0,
              resolved: Boolean(c.scores.supervisorAction),
            })) : [];

            // Donut arc calculation
            const total = goldCount + rewriteCount + badRejectCount + incompleteCount;
            const r = 70, circ = 2 * Math.PI * r;
            const goldArc = total > 0 ? (goldCount / total) * circ : 0;
            const rewriteArc = total > 0 ? (rewriteCount / total) * circ : 0;
            const rejectArc = total > 0 ? ((badRejectCount + incompleteCount) / total) * circ : 0;

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* PROJECT METADATA HEADER */}
                <div style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', position: 'relative', overflow: 'hidden' }}>
                  {/* decorative bg circles */}
                  <div style={{ position: 'absolute', top: '-20px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, #4f46e520 0%, transparent 70%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: '-30px', right: '40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, #7c3aed15 0%, transparent 70%)', pointerEvents: 'none' }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>SEP490-G36</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>v2.4 - Batch 3</span>
                      <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', background: rewriteAssignments.some((task: any) => !['approved','rejected'].includes(task.status)) ? '#fff7ed' : '#dcfce7', color: rewriteAssignments.some((task: any) => !['approved','rejected'].includes(task.status)) ? '#c2410c' : '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{rewriteAssignments.some((task: any) => !['approved','rejected'].includes(task.status)) ? <><Clock size={12}/> REVIEW REQUIRED</> : <><Check size={12}/> READY TO EXPORT</>}</span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.3px' }}>Dataset Distribution Dashboard</h2>
                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                      Overview of dataset before export and training - Finished: 12/06/2026
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => window.print()}
                      style={{ padding: '10px 18px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <Download size={14} /> Export Report
                    </button>
                    <button onClick={handleExportDataset} disabled={rewriteAssignments.some((task: any) => !['approved','rejected'].includes(task.status))}
                      style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>
                      Export Dataset
                    </button>
                  </div>
                </div>

                {/* 5 KPI CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
                  {[
                    { label: 'Conversations', value: totalConv, sub: `${totalMsg} messages`, color: '#4f46e5', bg: '#eef2ff', Icon: MessageSquare },
                    { label: 'Gold Rate', value: `${goldRate}%`, sub: `${goldCount} / ${totalConv} conv`, color: '#15803d', bg: '#f0fdf4', Icon: Award },
                    { label: 'Avg AI Score', value: avgAIScore, sub: 'OpenRouter + Deepseek', color: '#0891b2', bg: '#f0f9ff', Icon: Bot },
                    { label: 'Subjects', value: subjectData.length, sub: subjectData.length ? 'from current dataset' : 'no subject data', color: '#7c3aed', bg: '#f5f3ff', Icon: BookOpen },
                    { label: 'Conflict', value: conflictCount, sub: `${conflictData.filter(c => c.resolved).length} resolved`, color: '#dc2626', bg: '#fff5f5', Icon: AlertTriangle },
                  ].map(({ label, value, sub, color, bg, Icon }) => (
                    <div key={label} style={{ background: bg, border: `1.5px solid ${color}22`, borderRadius: '12px', padding: '16px 18px', position: 'relative', overflow: 'hidden', boxShadow: `0 2px 8px ${color}10` }}>
                      <div style={{ position: 'absolute', top: '12px', right: '14px', opacity: 0.25, color }}><Icon size={22} /></div>
                      <div style={{ fontSize: '11px', fontWeight: '800', color, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: '11.5px', color: `${color}bb`, marginTop: '5px', fontWeight: '500' }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* SUBJECT DISTRIBUTION + QUALITY DONUT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                  {/* Subject Distribution */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> Subject Distribution</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>{subjectData.length} subjects / {totalConv} conversations</p>
                      </div>
                      <button
                        onClick={() => setBalancedSubject(!balancedSubject)}
                        style={{ padding: '7px 13px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: `1.5px solid ${balancedSubject ? '#15803d' : '#e2e8f0'}`, background: balancedSubject ? '#dcfce7' : '#f8fafc', color: balancedSubject ? '#15803d' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s' }}>
                        <Sparkles size={12} />
                        {balancedSubject ? 'Subject balanced' : 'Balance subjects'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {subjectData.map(({ name, conv, pct, color }, sIdx) => {
                        const displayPct = balancedSubject ? 12.5 : pct;
                        const displayConv = balancedSubject ? Math.round(totalConv / subjectData.length) : conv;
                        // When a bar has no mapped subject color (e.g. "Group 1..15"), fall
                        // back to a vibrant palette cycled by position so each bar is distinct.
                        const palette = [
                          '#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626',
                          '#7c3aed', '#db2777', '#0d9488', '#ea580c', '#2563eb',
                          '#65a30d', '#c026d3', '#0ea5e9', '#e11d48', '#16a34a',
                        ];
                        const barColor = (!color || color === '#64748b') ? palette[sIdx % palette.length] : color;
                        return (
                          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', minWidth: '76px' }}>{name}</span>
                            <div style={{ flex: 1, height: '14px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${displayPct * 4}%`, background: `linear-gradient(90deg, ${barColor}bb, ${barColor})`, borderRadius: '999px', transition: 'width 0.55s ease', boxShadow: `inset 0 1px 2px rgba(255,255,255,0.4)` }} />
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: barColor, minWidth: '78px', textAlign: 'right' }}>{displayConv} ({displayPct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                    {balancedSubject && (
                      <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px', fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle size={14} /> Rebalanced: every subject adjusted to ~2-3 conv (12.5% each).
                      </div>
                    )}
                  </div>

                  {/* Quality Donut */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}><BarChart2 size={14} /> Quality Classification</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>{total} conversations classified</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                      {/* Donut SVG - larger and with drop shadow */}
                      <div style={{ position: 'relative', width: '190px', height: '190px', flexShrink: 0 }}>
                        <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.10))' }}>
                          <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f5f9" strokeWidth="30" />
                          <circle cx="100" cy="100" r={r} fill="none" stroke="#16a34a" strokeWidth="30"
                            strokeDasharray={`${balancedQuality ? circ * 0.6 : goldArc} ${circ}`} strokeDashoffset="0" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                          <circle cx="100" cy="100" r={r} fill="none" stroke="#d97706" strokeWidth="30"
                            strokeDasharray={`${balancedQuality ? circ * 0.3 : rewriteArc} ${circ}`} strokeDashoffset={`${-(balancedQuality ? circ * 0.6 : goldArc)}`} style={{ transition: 'all 0.6s ease' }} />
                          <circle cx="100" cy="100" r={r} fill="none" stroke="#dc2626" strokeWidth="30"
                            strokeDasharray={`${balancedQuality ? circ * 0.1 : rejectArc} ${circ}`} strokeDashoffset={`${-(balancedQuality ? circ * 0.9 : goldArc + rewriteArc)}`} style={{ transition: 'all 0.6s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                          <div style={{ fontSize: '28px', fontWeight: '900', color: '#1e293b', lineHeight: 1 }}>{total}</div>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '3px' }}>TOTAL</div>
                        </div>
                      </div>
                      {/* Legend cards with mini progress bars */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[
                          { label: 'Gold (Excellent)', count: goldCount, pct: goldRate, color: '#16a34a', bg: '#f0fdf4', Icon: Award },
                          { label: 'Rewrite (Edit)', count: rewriteCount, pct: rewriteRate, color: '#d97706', bg: '#fffbeb', Icon: Pencil },
                          { label: 'Bad / Reject', count: badRejectCount, pct: badRejectRate, color: '#be123c', bg: '#fff1f2', Icon: AlertTriangle },
                          { label: 'Incomplete', count: incompleteCount, pct: incompleteRate, color: '#64748b', bg: '#f8fafc', Icon: Info },
                        ].map(({ label, count, pct, color, bg, Icon }) => (
                          <div key={label} style={{ padding: '10px 12px', borderRadius: '12px', background: bg, border: `1px solid ${color}25` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                              <Icon size={14} style={{ color }} />
                              <span style={{ fontSize: '12.5px', fontWeight: '700', color, flex: 1 }}>{label}</span>
                              <span style={{ fontSize: '17px', fontWeight: '900', color, lineHeight: 1 }}>{count}</span>
                              <span style={{ fontSize: '11px', color: `${color}99`, fontWeight: '600' }}>({pct}%)</span>
                            </div>
                            <div style={{ height: '5px', background: `${color}18`, borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── STAFF PERFORMANCE ── */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Staff Performance</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>{staffData.length} staff members contributed to this dataset</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ background: '#dcfce7', borderRadius: '12px', padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d' }}>Submitted</div>
                        <div style={{ fontSize: '18px', fontWeight: '900', color: '#15803d' }}>{staffData.filter(s => ['Submitted', 'Approved', 'Draft complete'].includes(s.status)).length}</div>
                      </div>
                      <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#92400e' }}>In Progress</div>
                        <div style={{ fontSize: '18px', fontWeight: '900', color: '#92400e' }}>{staffData.filter(s => !['Submitted', 'Approved', 'Draft complete'].includes(s.status)).length}</div>
                      </div>
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {['Staff', 'Subject', 'Labeled / Assigned', 'Approval rate', 'Progress', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staffData.map((s, i) => (
                        <tr key={s.name} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
                                {s.name[0]}
                              </div>
                              <span style={{ fontWeight: '700', color: '#1e293b' }}>{s.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#475569' }}>{s.subject}</span>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: '700', color: s.approved === s.assigned ? '#15803d' : '#d97706' }}>
                            {s.approved} / {s.assigned}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: '700', color: s.rate >= 100 ? '#15803d' : s.rate >= 70 ? '#d97706' : '#dc2626' }}>
                            {s.rate}%
                          </td>
                          <td style={{ padding: '12px 16px', minWidth: '120px' }}>
                            <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${s.rate}%`, background: s.rate >= 100 ? '#16a34a' : s.rate >= 70 ? '#d97706' : '#dc2626', borderRadius: '999px', transition: 'width 0.3s' }} />
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                              background: ['Submitted', 'Draft complete'].includes(s.status) ? '#dcfce7' : s.status === 'Approved' ? '#e0e7ff' : '#fef3c7',
                              color: ['Submitted', 'Draft complete'].includes(s.status) ? '#15803d' : s.status === 'Approved' ? '#4338ca' : '#92400e'
                            }}>{s.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── TOP REASONS + CONFLICT ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Top Reasons */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Top Reasons for Failure / Rewrite</h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Why samples were classified as Rewrite or Reject</p>
                    </div>
                    <div style={{ padding: '16px' }}>
                      {topReasons.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                          No failure reasons have been generated yet. Reasons will appear after quality review records include error categories.
                        </div>
                      ) : topReasons.map(({ reason, count, pct, bucket }, idx) => (
                        <div key={idx} style={{ marginBottom: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: bucket === 'Rewrite' ? '#fef3c7' : '#fee2e2', color: bucket === 'Rewrite' ? '#92400e' : '#dc2626' }}>{bucket}</span>
                              <span style={{ fontSize: '13px', color: '#334155', fontWeight: '600' }}>{reason}</span>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{count} samples</span>
                          </div>
                          <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: bucket === 'Rewrite' ? '#d97706' : '#dc2626', borderRadius: '999px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI vs Staff Rule Score Conflict */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7f7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#b91c1c' }}>AI vs Staff Rule Score Conflict</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#dc2626' }}>{conflictData.filter(c => !c.resolved).length} unresolved / {conflictData.length} total</p>
                        </div>
                        <AlertTriangle size={22} style={{ color: '#b91c1c' }} />
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                          {['ID', 'Subject', 'OpenRouter', 'Deepseek', 'Staff Rule Score', 'Delta', 'Status'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {conflictData.map(({ id, subject, openrouter, deepseek, human, diff, resolved }) => (
                          <tr key={id} style={{ borderBottom: '1px solid #f1f5f9', background: resolved ? '#f0fdf4' : '#fff7f7' }}>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e293b' }}>{id.slice(-6)}</td>
                            <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569' }}>{subject}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#dc2626', fontSize: '13px' }}>{openrouter}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#16a34a', fontSize: '13px' }}>{deepseek}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: human ? '#ea580c' : '#cbd5e1', fontSize: '13px' }}>{human ?? '-'}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '800', color: diff >= 3 ? '#dc2626' : '#d97706', fontSize: '13px' }}>±{diff}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: resolved ? '#dcfce7' : '#fee2e2', color: resolved ? '#15803d' : '#dc2626' }}>
                                {resolved ? 'Resolved' : 'Needs action'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 16px', background: '#fafafa', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#64748b' }}>
                      Conflict occurs when AI scores and the Stage 3 Staff Rule Score differ by more than {conflictThreshold}. Resolve before exporting the dataset.
                    </div>
                  </div>
                </div>

                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => { setCurrentSubStep6(12); setCurrentStage(5); }}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Next: Stage 5 &rarr;
                  </button>
                </div>

              </div>
            );
          })()}
          {adminRewriteModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.48)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => !isSavingAdminRewrite && setAdminRewriteModal(null)}>
              <div style={{ width: 'min(900px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 24px 80px rgba(15,23,42,.35)', border: '1px solid #e2e8f0' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Admin tự rewrite</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{adminRewriteModal.item?.convId || adminRewriteModal.item?.sampleId || 'Conversation'} - lưu xong sẽ được duyệt thẳng vào bản export.</p>
                  </div>
                  <button onClick={() => setAdminRewriteModal(null)} disabled={isSavingAdminRewrite} style={{ border: 0, background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>Đóng</button>
                </div>
                <div style={{ padding: 20, display: 'grid', gap: 14 }}>
                  {/* Table Comparison for admin rewrite */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ width: '50%', padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#b91c1c', background: '#fff1f2', borderRight: '1px solid #e2e8f0', textAlign: 'left' }}>
                            Câu AI gốc cần sửa (Original AI Message)
                          </th>
                          <th style={{ width: '50%', padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#0369a1', background: '#f0f9ff', textAlign: 'left' }}>
                            Bản sửa sẽ dùng trong export (Your Revision)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '16px', fontSize: '13.5px', lineHeight: '1.6', color: '#1e293b', verticalAlign: 'top', borderRight: '1px solid #e2e8f0', background: '#fff5f5', whiteSpace: 'pre-wrap' }}>
                            {adminRewriteModal.originalText || '(Không tìm thấy câu AI mục tiêu)'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13.5px', lineHeight: '1.6', color: '#1e293b', verticalAlign: 'top', background: '#fcfdff', boxSizing: 'border-box' }}>
                            <textarea 
                              value={adminRewriteDraft} 
                              onChange={(e) => setAdminRewriteDraft(e.target.value)}
                              disabled={isSavingAdminRewrite}
                              style={{ 
                                width: '100%', 
                                minHeight: '220px', 
                                resize: 'vertical', 
                                border: '1px solid #7dd3fc', 
                                borderRadius: '8px', 
                                padding: '12px', 
                                fontSize: '14px', 
                                lineHeight: '1.6', 
                                outline: 'none', 
                                boxSizing: 'border-box',
                                background: '#fff'
                              }}
                              placeholder="Nhập câu trả lời AI đã sửa ở đây..." 
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Ngữ cảnh</div>
                    {(adminRewriteModal.messages || []).map((message: any, idx: number) => (
                      <div key={idx} style={{ padding: '8px 10px', marginBottom: 8, borderRadius: 8, background: idx === adminRewriteModal.targetIndex ? '#fff1f2' : message.role === 'assistant' ? '#f0fdf4' : '#f8fafc', border: `1px solid ${idx === adminRewriteModal.targetIndex ? '#fecdd3' : '#e2e8f0'}` }}>
                        <strong style={{ display: 'block', fontSize: 11, color: idx === adminRewriteModal.targetIndex ? '#be123c' : '#475569', textTransform: 'uppercase' }}>{message.role === 'assistant' ? 'Trợ giảng AI' : 'Học sinh'}{idx === adminRewriteModal.targetIndex ? ' - mục tiêu' : ''}</strong>
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>{message.content || message.text}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" onClick={() => setAdminRewriteModal(null)} disabled={isSavingAdminRewrite}
                      style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 800, cursor: 'pointer' }}>Hủy</button>
                    
                    <button
                      type="button"
                      disabled={isSuggestingAI || isSavingAdminRewrite}
                      onClick={async () => {
                        if (!activeVersionId) return alert('Missing dataset version.');
                        setIsSuggestingAI(true);
                        try {
                          const res = await stage4Api.suggestRewriteGeneric(activeVersionId, {
                            originalText: adminRewriteModal.originalText,
                            targetMessageIndex: adminRewriteModal.targetIndex,
                            messages: adminRewriteModal.messages,
                            reason: adminRewriteModal.item?.reason || adminRewriteModal.item?.issue || '',
                          });
                          setAdminRewriteDraft(res.suggestedText);
                        } catch (err: any) {
                          alert('Không thể tạo gợi ý từ AI: ' + (err?.response?.data?.error || err.message));
                        } finally {
                          setIsSuggestingAI(false);
                        }
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: '1px solid #10b981',
                        background: '#ecfdf5',
                        color: '#047857',
                        fontWeight: 800,
                        cursor: isSuggestingAI ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Sparkles size={14} />
                      {isSuggestingAI ? 'AI đang sửa...' : 'Tự sửa bằng AI'}
                    </button>

                    <button type="button" disabled={isSavingAdminRewrite || !adminRewriteDraft.trim()} onClick={async () => {
                      if (!activeVersionId) return alert('Missing dataset version.');
                      const sampleId = String(adminRewriteModal.item?.sampleObjectId || adminRewriteModal.item?._id || adminRewriteModal.item?.id || '');
                      setIsSavingAdminRewrite(true);
                      try {
                        const response = await stage4Api.adminSubmitRewrite(activeVersionId, {
                          sampleId,
                          submittedText: adminRewriteDraft.trim(),
                          reason: adminRewriteModal.item?.issue || 'Admin self rewrite',
                          targetMessageIndex: adminRewriteModal.targetIndex,
                        });
                        setRewriteAssignments((prev) => {
                          const next = prev.filter((task: any) => task.id !== response.task.id && String(task.sampleId) !== String(response.task.sampleId));
                          return [...next, response.task];
                        });
                        setCompletedRewrites((prev: any) => ({ ...prev, [sampleId]: true, [String(adminRewriteModal.item?.id)]: true }));
                        setAdminRewriteModal(null);
                        setAdminRewriteDraft('');
                      } catch (error: any) {
                        alert(error?.response?.data?.error || 'Không thể lưu bản admin rewrite.');
                      } finally {
                        setIsSavingAdminRewrite(false);
                      }
                    }}
                      style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#0369a1', color: '#fff', fontWeight: 900, cursor: isSavingAdminRewrite ? 'wait' : 'pointer' }}>
                      {isSavingAdminRewrite ? 'Đang lưu...' : 'Lưu và duyệt thẳng'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {reviewSubmissionModal && (() => {
            const activeItem = reviewSubmissionModal;
            const taskBySample = new Map(rewriteAssignments.map((task: any) => [String(task.sampleId), task]));
            const activeRewriteTask: any = activeItem ? taskBySample.get(String(activeItem.sampleObjectId || activeItem._id || activeItem.id)) : null;
            
            const getAdminRewriteTarget = (item: any) => {
              const messages = item?.sampleData?.messages || item?.data?.messages || item?.messages || [];
              let targetIndex = Number(item?.errorMessageIndex);
              if (!Number.isInteger(targetIndex) || targetIndex < 0 || !messages[targetIndex]) {
                targetIndex = -1;
                for (let i = messages.length - 1; i >= 0; i -= 1) {
                  if (messages[i]?.role === 'assistant') {
                    targetIndex = i;
                    break;
                  }
                }
              }
              const targetMessage = targetIndex >= 0 ? messages[targetIndex] : null;
              return {
                targetIndex,
                originalText: String(targetMessage?.content || targetMessage?.text || ''),
                messages,
              };
            };

            const target = getAdminRewriteTarget(activeItem);
            const originalText = target.originalText;
            const submittedText = activeRewriteTask?.submittedText || '';

            const handleReviewInModal = async (task: any, action: 'approved' | 'rejected' | 'redo') => {
              if (!activeVersionId || !task?.id) return;
              const note = action === 'approved' ? 'Được duyệt bởi Supervisor' : window.prompt(action === 'redo' ? 'Lý do yêu cầu Staff làm lại:' : 'Lý do từ chối rewrite:');
              if (action !== 'approved' && !note?.trim()) return;
              setReviewingRewriteId(task.id);
              try {
                const response = await stage4Api.reviewRewrite(activeVersionId, task.id, action, note || '');
                setRewriteAssignments(prev => prev.map(item => item.id === task.id ? response.task : item));
                if (action === 'approved') setCompletedRewrites(prev => ({ ...prev, [String(task.sampleId)]: true }));
                setReviewSubmissionModal(null);
              } catch (error: any) {
                alert(error?.response?.data?.error || 'Không thể lưu quyết định review.');
              } finally { setReviewingRewriteId(null); }
            };

            const openAdminRewriteFromModal = (item: any) => {
              const target = getAdminRewriteTarget(item);
              setAdminRewriteModal({ item, ...target });
              setAdminRewriteDraft(activeRewriteTask?.submittedText || target.originalText || '');
            };

            const subjectColors = {
              'Math': { bg: '#e0e7ff', color: '#4338ca' }, 'Physics': { bg: '#cffafe', color: '#0e7490' },
              'Chemistry': { bg: '#d1fae5', color: '#065f46' }, 'Biology': { bg: '#fef3c7', color: '#92400e' },
              'History': { bg: '#ede9fe', color: '#6d28d9' }, 'Geography': { bg: '#fee2e2', color: '#b91c1c' },
              'Literature': { bg: '#fce7f3', color: '#9d174d' }, 'English': { bg: '#fff7ed', color: '#9a3412' },
              'PHYSICAL': { bg: '#cffafe', color: '#0e7490' }, 'CHEMISTRY': { bg: '#d1fae5', color: '#065f46' },
              'BIOLOGY': { bg: '#fef3c7', color: '#92400e' }, 'HISTORY': { bg: '#ede9fe', color: '#6d28d9' },
              'GEOGRAPHY': { bg: '#fee2e2', color: '#b91c1c' }, 'LITERATURE': { bg: '#fce7f3', color: '#9d174d' },
              'MATH': { bg: '#e0e7ff', color: '#4338ca' },
            };
            const getSubjectStyle = (s: string) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };
            const activeSubjStyle = getSubjectStyle(activeItem.subject);

            return (
              <div 
                style={{ 
                  position: 'fixed', 
                  inset: 0, 
                  background: 'rgba(15, 23, 42, 0.65)', 
                  backdropFilter: 'blur(4px)', 
                  WebkitBackdropFilter: 'blur(4px)', 
                  zIndex: 2000, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '24px'
                }} 
                onClick={() => setReviewSubmissionModal(null)}
              >
                <div 
                  style={{ 
                    width: 'min(1100px, 96vw)', 
                    maxHeight: '92vh', 
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#fff', 
                    borderRadius: '16px', 
                    boxShadow: '0 24px 80px rgba(15, 23, 42, 0.25)', 
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden'
                  }} 
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div 
                    style={{ 
                      padding: '20px 24px', 
                      background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      gap: '12px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Search size={20} style={{ color: '#fff' }} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#fff', letterSpacing: '0.3px' }}>Review Staff Submission</h3>
                        <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#e0e7ff' }}>
                          Conv ID: <span style={{ fontFamily: 'monospace', fontWeight: '700', background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px' }}>{activeItem.convId}</span>
                          {activeItem.subject && <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: activeSubjStyle.bg, color: activeSubjStyle.color }}>{activeItem.subject}</span>}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setReviewSubmissionModal(null)} 
                      style={{ 
                        border: 0, 
                        background: 'rgba(255,255,255,0.15)', 
                        color: '#fff',
                        borderRadius: '8px', 
                        padding: '8px 14px', 
                        cursor: 'pointer', 
                        fontWeight: '800',
                        fontSize: '13px'
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {/* Content Area */}
                  <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                    
                    {/* Error context banner */}
                    <div style={{ padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                        <AlertTriangle size={14} />
                      </div>
                      {(() => {
                        const activeScores = getScoresForSample(activeItem.sampleObjectId || activeItem.id, activeItem.convId);
                        return (
                          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <p style={{ margin: '0 0 3px 0', fontSize: '11px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lỗi cần sửa (Phát hiện bởi AI)</p>
                              <p style={{ margin: 0, fontSize: '13px', color: '#78350f', lineHeight: '1.6', fontWeight: '500' }}>{activeItem.reason || activeItem.issue || 'Yêu cầu viết lại từ xem xét chất lượng'}</p>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                              <p style={{ margin: '0 0 3px 0', fontSize: '11px', fontWeight: '800', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Điểm luật Staff</p>
                              <p style={{ margin: 0, fontSize: activeScores.human != null ? '16px' : '13px', fontWeight: '900', color: activeScores.human != null ? (activeScores.human >= 7 ? '#15803d' : activeScores.human >= 5 ? '#d97706' : '#dc2626') : '#ea580c' }}>
                                {activeScores.human != null ? activeScores.human.toFixed(1) : '⏳ Đang tính toán'}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Comparison Table */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ width: '50%', padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#b91c1c', background: '#fff1f2', borderRight: '1px solid #e2e8f0', textAlign: 'left' }}>
                              Original AI Message (Bản gốc lỗi)
                            </th>
                            <th style={{ width: '50%', padding: '12px 16px', fontSize: '13px', fontWeight: '800', color: '#15803d', background: '#f0fdf4', textAlign: 'left' }}>
                              Staff Revised Message (Bản Staff sửa)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '16px', fontSize: '13.5px', lineHeight: '1.6', color: '#1e293b', verticalAlign: 'top', borderRight: '1px solid #e2e8f0', background: '#fff5f5', whiteSpace: 'pre-wrap' }}>
                              {originalText || '(Không tìm thấy câu AI gốc)'}
                            </td>
                            <td style={{ padding: '16px', fontSize: '13.5px', lineHeight: '1.6', color: '#1e293b', verticalAlign: 'top', background: submittedText ? '#fafdff' : '#fafafa', whiteSpace: 'pre-wrap', fontStyle: submittedText ? 'normal' : 'italic' }}>
                              {submittedText || '(Staff chưa nộp bài sửa)'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Collapsible Conversation Context */}
                    <details style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '8px' }}>
                      <summary style={{ padding: '12px 16px', fontWeight: '800', color: '#475569', cursor: 'pointer', fontSize: '13px', userSelect: 'none' }}>
                        👀 Xem bối cảnh hội thoại (Conversation Context)
                      </summary>
                      <div style={{ padding: '0 16px 16px 16px', maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {target.messages.map((msg: any, idx: number) => {
                          const isTarget = idx === target.targetIndex;
                          return (
                            <div key={idx} style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              background: isTarget ? '#fee2e2' : msg.role === 'user' ? '#fff' : '#f0fdf4',
                              border: isTarget ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                              alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                              maxWidth: '85%',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                              <strong style={{ display: 'block', fontSize: '10px', color: isTarget ? '#dc2626' : msg.role === 'user' ? '#64748b' : '#16a34a', textTransform: 'uppercase', marginBottom: '4px' }}>
                                {msg.role === 'user' ? 'Học sinh' : isTarget ? 'Trợ giảng AI (Cần viết lại)' : 'Trợ giảng AI'}
                              </strong>
                              <div style={{ fontSize: '13px', lineHeight: '1.5', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                                {msg.text || msg.content}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>

                  {/* Action Bar / Footer */}
                  <div 
                    style={{ 
                      padding: '16px 24px', 
                      background: '#f8fafc', 
                      borderTop: '1px solid #e2e8f0', 
                      display: 'flex', 
                      justifyContent: 'flex-end', 
                      alignItems: 'center', 
                      gap: '12px' 
                    }}
                  >
                    <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748b' }}>Decision:</span>
                    </div>
                    
                    <button 
                      onClick={() => {
                        openAdminRewriteFromModal(activeItem);
                        setReviewSubmissionModal(null);
                      }}
                      disabled={isSavingAdminRewrite}
                      style={{ 
                        padding: '10px 18px', 
                        fontSize: '13.5px', 
                        fontWeight: '800', 
                        borderRadius: '8px', 
                        border: '1px solid #bae6fd', 
                        background: '#f0f9ff', 
                        color: '#0284c7', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px' 
                      }}
                    >
                      <Pencil size={14} /> Admin tự sửa
                    </button>

                    {activeRewriteTask?.submittedText ? (
                      <>
                        <button 
                          onClick={async () => {
                            await handleReviewInModal(activeRewriteTask, 'approved');
                          }} 
                          disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                          style={{ 
                            padding: '10px 20px', 
                            fontSize: '13.5px', 
                            fontWeight: '800', 
                            borderRadius: '8px', 
                            border: 'none', 
                            background: activeRewriteTask.status === 'approved' ? '#cbd5e1' : 'linear-gradient(135deg, #16a34a, #15803d)', 
                            color: activeRewriteTask.status === 'approved' ? '#64748b' : '#fff', 
                            cursor: activeRewriteTask.status === 'approved' ? 'default' : 'pointer', 
                            boxShadow: activeRewriteTask.status === 'approved' ? 'none' : '0 4px 12px rgba(22,163,74,0.25)', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px' 
                          }}
                        >
                          {activeRewriteTask.status === 'approved' ? <><Check size={14} /> Đã duyệt (Tốt)</> : <><Check size={14} /> Duyệt (Tốt)</>}
                        </button>
                        
                        <button 
                          onClick={async () => {
                            await handleReviewInModal(activeRewriteTask, 'redo');
                          }}
                          disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                          style={{ 
                            padding: '10px 18px', 
                            fontSize: '13.5px', 
                            fontWeight: '700', 
                            borderRadius: '8px', 
                            border: '1px solid #cbd5e1', 
                            background: '#fff', 
                            color: '#475569', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px' 
                          }}
                        >
                          <RotateCcw size={14} /> Yêu cầu làm lại
                        </button>

                        <button 
                          onClick={async () => {
                            await handleReviewInModal(activeRewriteTask, 'rejected');
                          }} 
                          disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                          style={{ 
                            padding: '10px 18px', 
                            fontSize: '13.5px', 
                            fontWeight: '700', 
                            borderRadius: '8px', 
                            border: '1px solid #fca5a5', 
                            background: '#fff1f2', 
                            color: '#dc2626', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px' 
                          }}
                        >
                          <X size={14} /> Từ chối
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', marginRight: '8px' }}>
                        (Waiting for staff submission)
                      </span>
                    )}
                    
                    <button 
                      onClick={() => setReviewSubmissionModal(null)} 
                      style={{ 
                        padding: '10px 16px', 
                        fontSize: '13.5px', 
                        fontWeight: '700', 
                        borderRadius: '8px', 
                        border: '1px solid #cbd5e1', 
                        background: '#fff', 
                        color: '#64748b', 
                        cursor: 'pointer' 
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
  ;
};
