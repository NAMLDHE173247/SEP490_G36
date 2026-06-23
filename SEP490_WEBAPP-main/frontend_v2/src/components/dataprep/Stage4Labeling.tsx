import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, ChevronDown, ChevronRight, X, Play, RefreshCw, Eye, ExternalLink, Settings, Download, Trash2, Edit2, Check, ArrowRight, AlertTriangle, User, Bot, Info, FileText, Search, RotateCcw, Inbox, MousePointer2, MessageSquare, Award, BookOpen, Sparkles, BarChart2, Pencil, Ban, Upload, Clock } from 'lucide-react';
import { useDataPrep } from '../../pages/DataPrep/DataPrepContext';
import { useStage4Data } from '../../hooks/useStage4Data';
import { apiService } from '../../services/api';
import { stage4Api } from '../../services/stage4Api';

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
    // Step 8 is now an embedded AI cross-check action inside Step 7.
    // Migrate stale browser state so users cannot land on the old standalone screen.
    if (currentSubStep4 === 8) setCurrentSubStep4(7);
  }, [currentSubStep4, setCurrentSubStep4]);

  const reviewRewriteTask = async (task: any, action: 'approved' | 'redo' | 'rejected') => {
    if (!activeVersionId || !task?.id) return;
    const note = action === 'approved' ? 'Approved by Admin' : window.prompt(action === 'redo' ? 'Lý do yêu cầu Staff làm lại:' : 'Lý do từ chối rewrite:');
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
    if (!activeVersionId || ![10, 11].includes(currentSubStep4)) return;
    let cancelled = false;
    const loadRewriteProgress = () => stage4Api.listRewriteAssignments(activeVersionId)
      .then((response) => { if (!cancelled) setRewriteAssignments(response.tasks || []); })
      .catch((error) => console.error('Failed to load rewrite progress', error));
    loadRewriteProgress();
    const timer = window.setInterval(loadRewriteProgress, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeVersionId, currentSubStep4]);

  useEffect(() => {
    if (!(currentSubStep4 === 7 || currentSubStep4 === 10 || currentSubStep4 === 11 || currentSubStep4 === 12) || !activeVersionId) return;

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
    const intervalId = window.setInterval(refreshAssignmentDashboard, currentSubStep4 === 7 ? 5000 : 15000);
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
    if (currentSubStep4 === 11) {
      const rewriteItems = (qualityResult?.items || []).filter((i: any) => ['Rewrite', 'Reject', 'Bad'].includes(i.bucket));
      const activeItem = rewriteItems[rewriteConvIdx] || rewriteItems[0];
      if (activeItem?._id) sampleIds.add(String(activeItem._id));
    }
    if (currentSubStep4 === 9 && qualityResult?.items?.length) {
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
    { num: 7, label: 'Quality Review' },
    { num: 9, label: 'Quality Review' },
    { num: 10, label: 'Rewrite Assignment' },
    { num: 11, label: 'Assignment Review' },
    { num: 12, label: 'Dataset Distribution' },
  ];

  const handleStartScoring = async () => {
    const selectedModels = Object.keys(judgeModels).filter(k => judgeModels[k]);
    if (selectedModels.length === 0) {
      alert('Please select at least 1 AI Judge model.');
      return;
    }
    try {
      setSepRunningEval(true);
      await runMultiEval(selectedModels, 'No Context');
    } catch (err: any) {
      alert(err.message || 'Failed to start scoring');
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
      await handleAdjudicateQuality(item.sampleObjectId || item.id, finalClassification, `Admin set verdict to ${finalClassification} in Stage 4 review.`);
      setSepQualityLabels((prev: any) => ({ ...prev, [item.id]: finalClassification }));
      if (item.scores?.resultId) {
        const action = finalClassification === 'Gold' ? 'approve' : finalClassification === 'Rewrite' ? 'rewrite' : 'reject';
        await adjudicateMultiEvalResult(item.scores.resultId, action as any, `Admin set verdict to ${finalClassification} in Stage 4 review.`);
      }
      setReviewDetailModal((prev: any) => prev ? { ...prev, bucket: finalClassification } : prev);
    } catch (err: any) {
      alert(err.message || 'Failed to update verdict');
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
    CORRECT: ['PRAISING'],
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
    INCORRECT: ['PRAISING'],
    REQUEST_HINT: ['LOGIC_BREAKDOWN'],
  };
  const RULE_USER_INTENTS = new Set(Object.keys(RULE_VALID_ACTIONS));
  const RULE_ASSISTANT_ACTIONS = new Set(Object.values(RULE_VALID_ACTIONS).flat());

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

  const normalizeStaffLabelCode = (raw: string, role: string): string => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    if (role === 'user') {
      if (DRAFT_INTENT_MAP[trimmed]) return DRAFT_INTENT_MAP[trimmed];
      const upper = trimmed.toUpperCase();
      return RULE_USER_INTENTS.has(upper) ? upper : upper;
    }
    if (role === 'assistant') {
      if (DRAFT_ACTION_MAP[trimmed]) return DRAFT_ACTION_MAP[trimmed];
      const upper = trimmed.toUpperCase();
      return RULE_ASSISTANT_ACTIONS.has(upper) ? upper : upper;
    }
    return trimmed.toUpperCase();
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

  const getStaffSubjectFromComparison = (comparison: any, fallback?: string) => {
    if (!comparison?.targets) return fallback;
    const sampleTarget = comparison.targets.find((t: any) =>
      t.targetScope === 'sample' &&
      Array.isArray(t.annotators) &&
      t.annotators.some((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
    );
    if (!sampleTarget) return fallback;
    const excluded = new Set(['COMPLETED', 'INCOMPLETE', 'ABANDONED', 'GOOD', 'MEDIUM', 'POOR']);
    for (const annotator of sampleTarget.annotators) {
      const labels = Array.isArray(annotator.labels) ? annotator.labels : [];
      const displays = Array.isArray(annotator.displayLabels) ? annotator.displayLabels : labels;
      for (let i = 0; i < labels.length; i += 1) {
        const code = String(labels[i] || '').toUpperCase();
        const display = String(displays[i] || labels[i] || '');
        if (!display || excluded.has(code) || excluded.has(display.toUpperCase())) continue;
        return display;
      }
    }
    return fallback;
  };

  const getUiMessagesForSample = (sampleId?: string, sampleKey?: string) => {
    const candidates = [sampleId, sampleKey].filter(Boolean).map(String);
    const humanItem = qualityResult?.items?.find((i: any) =>
      candidates.includes(String(i.sampleId)) || candidates.includes(String(i._id))
    );
    return mapBackendMessagesToUiMessages(humanItem?.data?.messages || []);
  };

  // Build messageIndex -> { user:[labels], assistant:[labels] } from comparison targets
  const buildMessageLabelIndex = (comparison: any) => {
    const map = new Map<number, { user: string[]; assistant: string[] }>();
    if (!Array.isArray(comparison?.targets)) return map;
    comparison.targets.forEach((t: any) => {
      if (t.targetScope !== 'message') return;
      const idx = Number(t.messageIndex);
      const role = t.messageRole === 'assistant' ? 'assistant' : 'user';
      if (!Number.isInteger(idx) || !Array.isArray(t.annotators)) return;
      const labels = Array.from(new Set(
        t.annotators.flatMap((a: any) => {
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
      const gemini = resMatch.scores?.gemini || resMatch.scores?.Gemini || modelScores.gemini?.overall || null;
      const deepseek = resMatch.scores?.deepseek || resMatch.scores?.Deepseek || modelScores.deepseek?.overall || null;
      const openai = resMatch.scores?.openai || resMatch.scores?.OpenAI || modelScores.openai?.overall || null;
      const human = resolveHumanScore(
        toTenPointHumanScore(humanItem) ?? resMatch.scores?.human ?? resMatch.scores?.Human
      );
      const aiVals = [gemini, deepseek, openai].filter(v => v != null) as number[];
      const avgAI = resMatch.averageOverall ?? resMatch.averageScore ?? (aiVals.length ? aiVals.reduce((a, b) => a + b, 0) / aiVals.length : null);
      const diff = avgAI != null && human != null ? Math.abs(avgAI - human) : (resMatch.diff || 0);
      return {
        gemini,
        deepseek,
        openai,
        human,
        conflict: Boolean(resMatch.hasConflict) || resMatch.recommendation === 'Conflict' || (human != null && diff >= conflictThreshold),
        resultId: resMatch._id,
        finalRecommendation: resMatch.finalRecommendation,
        supervisorAction: resMatch.supervisorAction || resMatch.adjudicationAction,
        supervisorNote: resMatch.supervisorNote || resMatch.adjudicationNote,
      };
    }
    const human = resolveHumanScore(toTenPointHumanScore(humanItem));
    return {
      gemini: null,
      deepseek: null,
      openai: null,
      human,
      conflict: false
    };
  };

  const getAvgAI = (scores) => {
    const vals = [scores.gemini, scores.deepseek, scores.openai].filter(v => v != null);
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
    const turn = turnPairs.find((t: any) =>
      t.userMessageIndex === messageIndex || t.assistantMessageIndex === messageIndex
    );
    const turnLabels: string[] = role === 'user' ? (turn?.userLabels || []) : (turn?.assistantLabels || []);
    if (turnLabels.length > 0) {
      return turnLabels.map((label: string) => ({
        label: displayStaffLabel(label, role),
        kind: kindForRole(role),
        staff: 'Staff',
        isOwner: false,
      }));
    }

    return messageLevelTargets
      .filter((target: any) => Number(target.messageIndex) === messageIndex && target.messageRole === role)
      .flatMap((target: any) => target.annotators
        .filter((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
        .flatMap((a: any) => {
          const codes = Array.isArray(a.labels) ? a.labels : [];
          const displays = Array.isArray(a.displayLabels) ? a.displayLabels : codes;
          return codes.map((lbl: string, labelIndex: number) => ({
            label: displayStaffLabel(lbl, role, displays[labelIndex]),
            kind: kindForRole(role),
            staff: a.annotator?.name || a.annotator?.email || (a.isOwner ? 'Owner' : 'Staff'),
            isOwner: Boolean(a.isOwner),
          }));
        })
      );
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
      subject: getStaffSubjectFromComparison(getComparisonForSample(sampleId, String(item.sampleId)), getSeededSubject(item.sampleId)),
      ...item,
      bucket: combinedBucket,
      combinedScore,
      turnPairs,
      humanScore,
      score: item.score,
      issue: item.conflict ? 'Conflict' : 'None',
      issueKey: item.conflict ? 'conflict' : 'none',
      reason: item.note || 'No special issues flagged.',
      errorMessageIndex: 1,
      messages: mapBackendMessagesToUiMessages(item.data?.messages || []),
      rawItem: item,
    };
  }) : [];

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
    if (currentSubStep4 === 7 && stage4CanScore && targetStep === 10) return true;
    if (targetStep <= currentSubStep4) return true;
    if (targetStep !== currentSubStep4 + 1) return false;
    if (currentSubStep4 === 7) return stage4CanScore;
    if (currentSubStep4 === 8) return false;
    return currentSubStep4 >= 9;
  };

  const goToStage4Step = (targetStep: number) => {
    if (targetStep === 7) {
      setCurrentSubStep4(7);
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
        {SUB_STEPS_STAGE4.filter(step => step.num !== 8 && step.num !== 9).map((step, idx, visibleSteps) => (
          <React.Fragment key={step.num}>
            <div
              className={`sub-step ${(step.num === currentSubStep4 || (step.num === 7 && currentSubStep4 === 9)) ? 'active' : ''} ${step.num < currentSubStep4 && !(step.num === 7 && currentSubStep4 === 9) ? 'completed' : ''}`}
              onClick={() => goToStage4Step(step.num)}
            >
              <div className="sub-step-circle">
                {step.num < currentSubStep4 ? <Check size={14} /> : idx + 7}
              </div>
              <div className="sub-step-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{step.label}{step.num === 11 && rewriteAssignments.filter((task: any) => task.status === 'submitted').length > 0 && <span style={{ minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '999px', background: '#ea580c', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900' }}>{rewriteAssignments.filter((task: any) => task.status === 'submitted').length}</span>}</div>
            </div>
            {idx < visibleSteps.length - 1 && <div className="sub-step-connector" />}
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
          {currentSubStep4 === 7 && !stage4CanScore && (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Hero card - Light Theme */}
              <div style={{ background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', border: '1px solid #dbeafe', borderRadius: '12px', padding: '32px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(37,99,235,0.03)' }}>
                <div style={{ flex: '1', minWidth: '240px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>STEP 7 · LIVE REVIEW</div>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '900', color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>Quality Review</h2>
                  <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
                    Admin có thể theo dõi nhãn và chất lượng ngay khi Staff đang làm. AI scoring và xuất kết quả cuối chỉ mở sau khi dữ liệu đủ điều kiện.
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
                      <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>labeled</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>
                    {stage4CanScore ? 'Ready for scoring' : `${pendingStaffCount} staff pending`}
                  </span>
                </div>
              </div>

              {/* Staff Status Board */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Staff Status Board</h3>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    Auto-refreshing every 5s · {step7DisplayLabeled}/{step7DisplayTotal} samples labeled
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Staff</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Assigned Subject</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Labeled / Assigned</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase', minWidth: '150px' }}>Progress</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Action</th>
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
                                    Remind
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
                    setCurrentSubStep4(7);
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
              { key: 'gemini', label: 'Gemini Flash 1.5', desc: 'Default education judge, low cost', color: '#4f46e5', badge: 'Recommended' },
              { key: 'openai', label: 'Qwen 3.7 Plus', desc: 'Qwen model on Groq API (gpt-oss-120b)', color: '#059669', badge: '' },
              { key: 'deepseek', label: 'Deepseek R1/V3', desc: 'Advanced pedagogical logic, free', color: '#0891b2', badge: 'Free' },
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
                    <button onClick={() => setCurrentSubStep4(9)}
                      style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                      Next: Quality Management &rarr;
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ===== STEP 9: QUALITY REVIEW (read-only) ===== */}
          {(currentSubStep4 === 9 || currentSubStep4 === 7) && (() => {
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

            const ScoreCell = ({ val }) => val != null
              ? <span style={{ fontWeight: '700', color: val >= 7 ? '#16a34a' : val >= 5 ? '#d97706' : '#dc2626' }}>{val.toFixed(1)}</span>
              : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>-</span>;

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Header read-only */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Quality Review (read-only)</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Read AI judge scores and the Stage 3 Staff Rule Score. Human review decisions are created from the review/adjudication actions.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { bg: '#dcfce7', clr: '#15803d', lbl: 'Gold', cnt: goldItems.length },
                      { bg: '#fef3c7', clr: '#92400e', lbl: 'Rewrite', cnt: rewriteItems.length },
                      { bg: '#fee2e2', clr: '#dc2626', lbl: 'Bad', cnt: badItems.length },
                      { bg: '#fff1f2', clr: '#9333ea', lbl: 'Conflict', cnt: conflictItems.length },
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
                      Mỗi conversation được 3 mô hình (Gemini, Deepseek, Qwen) chấm độc lập dựa trên: tính đúng đắn về mặt sư phạm,
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
                      { key: 'all', label: 'All', count: allItems.length, color: '#475569' },
                      { key: 'gold', label: 'Gold', count: goldItems.length, color: '#15803d' },
                      { key: 'rewrite', label: 'Rewrite', count: rewriteItems.length, color: '#92400e' },
                      { key: 'bad', label: 'Bad', count: badItems.length, color: '#dc2626' },
                      { key: 'conflict', label: 'Conflict', count: conflictItems.length, color: '#9333ea' },
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
                    <button onClick={() => setCurrentSubStep4(10)}
                      style={{ padding: '12px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                      Go to Assign Rewrite &rarr;
                    </button>
                  </div>
                </div>

                {/* Main Table */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'auto' }}>
                  {displayItems.length === 0 ? (
                    <div className="empty-state-card">
                      <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                      <h3 className="empty-state-title">{allItems.length === 0 ? 'No quality results yet' : 'All clear!'}</h3>
                      <p className="empty-state-desc">{allItems.length === 0 ? 'Run AI scoring in Step 8 after Step 7 is ready. This screen no longer shows demo samples.' : 'No items found in this category. Everything looks great so far.'}</p>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Conv ID</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Subject</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', maxWidth: '200px' }}>Issue</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#4f46e5', fontSize: '11px', textTransform: 'uppercase', background: '#f0f4ff' }}>Gemini</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#0891b2', fontSize: '11px', textTransform: 'uppercase', background: '#ecfeff' }}>Deepseek</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#059669', fontSize: '11px', textTransform: 'uppercase', background: '#f0fdf4' }}>Qwen</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#7c3aed', fontSize: '11px', textTransform: 'uppercase', background: '#f5f3ff' }}>Avg AI</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#ea580c', fontSize: '11px', textTransform: 'uppercase', background: '#fff7ed', borderLeft: '2px solid #e2e8f0' }}>Staff Rule Score</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#dc2626', fontSize: '11px', textTransform: 'uppercase' }}>Conflict</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Verdict</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Details</th>
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
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f8faff' }}><ScoreCell val={scores.gemini} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0faff' }}><ScoreCell val={scores.deepseek} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0fff4' }}><ScoreCell val={scores.openai} /></td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f5f3ff' }}>
                                {avgAI != null ? <span style={{ fontWeight: '800', color: avgAI >= 7 ? '#7c3aed' : avgAI >= 5 ? '#d97706' : '#dc2626' }}>{avgAI.toFixed(1)}</span> : <span style={{ color: '#cbd5e1' }}>-</span>}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}><ScoreCell val={scores.human} /></td>
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
                                }}>{label}</span>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                <button onClick={e => { e.stopPropagation(); openReviewDetailModal(item); }}
                                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#4f46e5' }}>
                                  View
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
                      Showing <strong style={{ color: '#1e293b', fontWeight: '700' }}>{(safePage - 1) * itemsPerPage + 1}</strong>–<strong style={{ color: '#1e293b', fontWeight: '700' }}>{Math.min(safePage * itemsPerPage, displayItems.length)}</strong> of <strong style={{ color: '#1e293b', fontWeight: '700' }}>{displayItems.length}</strong>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: safePage <= 1 ? '#f8fafc' : '#fff', color: safePage <= 1 ? '#cbd5e1' : '#475569', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                      >
                        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Previous
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', fontSize: '13px', color: '#64748b' }}>
                        <span>Page</span>
                        <span style={{ minWidth: '26px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', borderRadius: '8px', background: '#1e293b', color: '#fff', fontWeight: '800' }}>{safePage}</span>
                        <span>of <strong style={{ color: '#1e293b', fontWeight: '700' }}>{totalPages}</strong></span>
                      </div>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: safePage >= totalPages ? '#f8fafc' : '#fff', color: safePage >= totalPages ? '#cbd5e1' : '#475569', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(10)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Next: Assign Rewrite &rarr;
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
                            <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: label === 'Gold' ? '#dcfce7' : label === 'Rewrite' ? '#fef3c7' : '#fee2e2', color: label === 'Gold' ? '#15803d' : label === 'Rewrite' ? '#92400e' : '#dc2626' }}>{label}</span>
                            {scores.conflict && <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> CONFLICT</span>}
                          </div>
                          <button onClick={() => setReviewDetailModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}>&#x2715;</button>
                        </div>
                        <div style={{ padding: '2px 24px 12px', background: '#1e293b' }}>
                          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Subject: {staffSubject} - Issue: {reviewDetailModal.reason}</p>
                        </div>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                          <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Evaluation Scores (read-only)</h4>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            {[{ label: 'Gemini', val: scores.gemini, color: '#4f46e5', bg: '#e0e7ff' }, { label: 'Deepseek', val: scores.deepseek, color: '#0891b2', bg: '#cffafe' }, { label: 'OpenAI', val: scores.openai, color: '#059669', bg: '#d1fae5' }].map(({ label: lbl, val, color, bg }) => (
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
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#ea580c', marginBottom: '4px' }}>Staff Rule Score</div>
                              <div style={{ fontSize: '22px', fontWeight: '900', color: scores.human == null ? '#cbd5e1' : scores.human >= 7 ? '#15803d' : scores.human >= 5 ? '#d97706' : '#dc2626' }}>{scores.human != null ? scores.human.toFixed(1) : '-'}</div>
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
                              <span><strong>Conflict AI vs Staff Rule Score:</strong> The average AI score ({avgAI?.toFixed(1)}) differs from the Stage 3 Staff Rule Score ({scores.human?.toFixed(1)}) by +/-{diff.toFixed(1)} exceeding the threshold of {conflictThreshold}. Requires expert human review.</span>
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                          <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conversation Content</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                            {reviewDetailModal.messages.map((msg, idx) => {
                              const messageLabels = getStaffMessageLabels(idx, msg.role);
                              return (
                                <div key={idx} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.6', background: msg.role === 'user' ? '#f8fafc' : idx === reviewDetailModal.errorMessageIndex ? '#fef3c7' : '#f0fdf4', border: idx === reviewDetailModal.errorMessageIndex ? '2px solid #fcd34d' : '1px solid transparent', alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                    {msg.role === 'user' ? 'Student' : idx === reviewDetailModal.errorMessageIndex ? 'AI Tutor (with error)' : 'AI Tutor'}
                                  </div>
                                  <div>{msg.text}</div>
                                  {messageLabels.length > 0 && (
                                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {messageLabels.map((item: any, labelIdx: number) => {
                                        const isIntent = item.kind === 'Intent';
                                        return (
                                          <span
                                            key={`${item.staff}-${item.label}-${labelIdx}`}
                                            title={`${item.kind} • assigned by ${item.staff}`}
                                            style={{
                                              padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '700',
                                              background: isIntent ? '#eef2ff' : '#ecfdf5',
                                              color: isIntent ? '#4338ca' : '#047857',
                                              border: `1px solid ${isIntent ? '#c7d2fe' : '#a7f3d0'}`,
                                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            }}
                                          >
                                            <span style={{ opacity: 0.7, fontWeight: '800' }}>{item.kind}:</span>
                                            {item.label}
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
                            <span style={{ fontSize: '13px', color: '#64748b', marginRight: 'auto' }}>Admin verdict</span>
                            {[
                              { value: 'Gold', label: 'Mark Gold', bg: '#dcfce7', color: '#15803d' },
                              { value: 'Rewrite', label: 'Mark Rewrite', bg: '#fef3c7', color: '#92400e' },
                              { value: 'Reject', label: 'Mark Bad', bg: '#fee2e2', color: '#dc2626' },
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

          {/* ===== STEP 10: ASSIGN REWRITE (BULK ASSIGN) ===== */}
          {currentSubStep4 === 10 && (() => {
            const rewriteItems = displayQualityItems.filter(i => ['Rewrite', 'Reject', 'Bad'].includes(getQualityLabel(i))) as any[];
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
            const staffList = shareUsers.length > 0
              ? shareUsers.map((u: any, idx: number) => {
                const name = u.name || u.username || u.email || 'Unknown Staff';
                return {
                  value: name,
                  initials: name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || 'ST',
                  color: staffColors[idx % staffColors.length],
                };
              })
              : [];
            const getStaffColor = (name) => staffList.find(s => s.value === name)?.color || '#64748b';
            const getStaffInitials = (name) => staffList.find(s => s.value === name)?.initials || '??';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '14px 18px', borderRadius: '12px', border: '1px solid #c7d2fe', background: '#eef2ff' }}>
                  <div>
                    <strong style={{ color: '#312e81' }}>AI cross-check nằm trong Step 7</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569' }}>
                      {results.length > 0 ? `Đã có ${results.length} kết quả AI để so sánh với Staff.` : 'Chạy AI để phát hiện conflict Staff–AI. Với task chỉ có 1 Staff, đây là nguồn conflict cần chuyển Supervisor.'}
                    </p>
                  </div>
                  <button onClick={handleStartScoring} disabled={sepRunningEval || results.length > 0}
                    style={{ padding: '10px 16px', border: 0, borderRadius: '8px', background: results.length > 0 ? '#dcfce7' : '#4f46e5', color: results.length > 0 ? '#15803d' : '#fff', fontWeight: 800, cursor: sepRunningEval ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                    {sepRunningEval ? 'Đang chấm...' : results.length > 0 ? 'AI cross-check hoàn tất' : 'Chạy AI cross-check'}
                  </button>
                </div>
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
                      <button disabled={isAutoAssigningRewrite || !rewriteItems.length || !shareUsers.length} onClick={async () => {
                        if (!activeVersionId) return alert('Missing dataset version.');
                        if (!window.confirm(`Tự động chia đều ${rewriteItems.length} mẫu cho ${shareUsers.length} Staff? Mỗi mẫu chỉ giao cho 1 người.`)) return;
                        setIsAutoAssigningRewrite(true);
                        const nextAssignments: Record<string, string> = {};
                        const assignments = rewriteItems.map((item: any, index: number) => {
                          const staff = shareUsers[index % shareUsers.length];
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
                            contextMode: 'n-2:n+2',
                          };
                        });
                        try {
                          const result = await stage4Api.bulkAssignRewrite(activeVersionId, assignments);
                          setReassignStaff(prev => ({ ...prev, ...nextAssignments }));
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
                      <button disabled={isAutoAssigningRewrite || rewriteAssignments.length === 0} onClick={async () => {
                        if (!activeVersionId) return;
                        const candidates = rewriteAssignments.filter((task: any) => ['assigned', 'redo', 'rejected'].includes(task.status));
                        if (!candidates.length) return alert('Không còn rewrite task nào phù hợp để Auto-Bypass.');
                        if (!window.confirm(`Auto-Bypass sẽ dùng Gemini viết và tự duyệt tối đa ${Math.min(20, candidates.length)} task. Staff sẽ được bỏ qua và kết quả được ghi thẳng vào bản export. Tiếp tục?`)) return;
                        setIsAutoAssigningRewrite(true);
                        try {
                          const result = await stage4Api.autoBypassRewrite(activeVersionId, 20);
                          const refreshed = await stage4Api.listRewriteAssignments(activeVersionId);
                          setRewriteAssignments(refreshed.tasks || []);
                          alert(`Auto-Bypass hoàn tất ${result.processedCount} task${result.failedCount ? `, lỗi ${result.failedCount} task` : ''}.`);
                        } catch (error: any) {
                          alert(error?.response?.data?.error || 'Auto-Bypass không thể hoàn tất.');
                        } finally {
                          setIsAutoAssigningRewrite(false);
                        }
                      }} style={{ padding: '12px 18px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: '1px solid #7c3aed', background: '#f5f3ff', color: '#6d28d9', cursor: isAutoAssigningRewrite ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                        <Sparkles size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> Auto-Bypass AI
                      </button>
                      <button onClick={() => setCurrentSubStep4(11)}
                        style={{ padding: '12px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.25)', whiteSpace: 'nowrap' }}>
                        Go to Review &rarr;
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

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px' }}>
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
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issue Detected</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '190px' }}>Rewrite Reason</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '220px' }}>Assign to</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '100px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rewriteItems.map((item, i) => {
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
                                <select value="" onChange={e => setReassignStaff(prev => ({ ...prev, [item.id]: e.target.value }))}
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
                    <button onClick={() => {
                      if (!bulkAssignStaff) return alert('Vui long chon nhan vien!');
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
                    }} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.4)' }}>
                      Assign All
                    </button>
                    <button onClick={() => setSelectedRewriteIds([])}
                      style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(11)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Next: Review Submissions &rarr;
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ===== STEP 11: STAFF SUBMISSION REVIEW (3b) ===== */}
          {currentSubStep4 === 11 && (() => {
            const rewriteItems = displayQualityItems.filter(i => ['Rewrite', 'Reject', 'Bad'].includes(getQualityLabel(i))) as any[];
            const activeItem = rewriteItems[rewriteConvIdx] || rewriteItems[0];
            const taskBySample = new Map(rewriteAssignments.map((task: any) => [String(task.sampleId), task]));
            const activeRewriteTask: any = activeItem ? taskBySample.get(String(activeItem.sampleObjectId || activeItem._id || activeItem.id)) : null;
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
            const getSubjectStyle = (s) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };

            return (
              <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a', borderRadius: '12px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                      <Search size={22} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#78350f' }}>Review Staff Submissions</h2>
                      <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#92400e' }}>Compare the original and staff-revised versions. Approve (Gold) or request a redo.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>Pending Review</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', lineHeight: 1.2 }}>{pendingCount}</div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>Approved</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', lineHeight: 1.2 }}>{approvedCount}</div>
                    </div>
                    <button onClick={() => setCurrentSubStep4(12)}
                      style={{ padding: '12px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.25)', whiteSpace: 'nowrap' }}>
                      Dataset Distribution &rarr;
                    </button>
                  </div>
                </div>

                {/* 2-col layout */}
                {rewriteItems.length === 0 ? (
                  <div className="empty-state-card">
                    <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                    <h3 className="empty-state-title">No submissions pending!</h3>
                    <p className="empty-state-desc">All staff submissions have been reviewed and approved.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', alignItems: 'flex-start' }}>
                    {/* Left sidebar */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Submission List</h4>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>{rewriteItems.length} items</span>
                      </div>
                      <div style={{ maxHeight: '540px', overflowY: 'auto' }}>
                        {rewriteItems.map((item, idx) => {
                          const isSelected = activeItem?.id === item.id;
                          const isDone = completedRewrites[item.id];
                          const staffName = reassignStaff[item.id];
                          const subjStyle = getSubjectStyle(item.subject);
                          return (
                            <div key={item.id} className="premium-table-row"
                              onClick={() => { setRewriteConvIdx(idx); setRewriteTextContent(''); }}
                              style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSelected ? '#f5f3ff' : '#fff', borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', fontFamily: 'monospace' }}>{item.convId}</span>
                                <span style={{ fontSize: '10px', fontWeight: '800', padding: '3px 8px', borderRadius: '999px', background: isDone ? '#dcfce7' : staffName ? '#fef9c3' : '#f1f5f9', color: isDone ? '#15803d' : staffName ? '#854d0e' : '#94a3b8', letterSpacing: '0.3px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  {isDone ? <><Check size={10} /> Approved</> : staffName ? <><RotateCcw size={10} /> Pending Review</> : 'Not Submitted'}
                                </span>
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: subjStyle.bg, color: subjStyle.color }}>{item.subject}</span>
                              {staffName && <div style={{ fontSize: '11px', color: '#4f46e5', marginTop: '5px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> {staffName}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right review panel */}
                    {activeItem ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Conv header */}
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: getSubjectStyle(activeItem.subject).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${getSubjectStyle(activeItem.subject).color}30` }}>
                              <span style={{ fontSize: '10px', fontWeight: '900', color: getSubjectStyle(activeItem.subject).color }}>{activeItem.subject.slice(0, 3)}</span>
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{activeItem.convId}</h3>
                              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                                Subject: <strong style={{ color: getSubjectStyle(activeItem.subject).color }}>{activeItem.subject}</strong>
                                {reassignStaff[activeItem.id] && <> &middot; Assigned to: <strong style={{ color: '#4f46e5' }}>{reassignStaff[activeItem.id]}</strong></>}
                                {rewriteReasons[activeItem.id] && rewriteReasons[activeItem.id] !== 'None' && <> &middot; Reason: <strong style={{ color: '#d97706' }}>{rewriteReasons[activeItem.id]}</strong></>}
                              </p>
                            </div>
                          </div>
                        </div>

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
                                  <p style={{ margin: '0 0 3px 0', fontSize: '11px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Error to Fix (Detected by AI Judges)</p>
                                  <p style={{ margin: 0, fontSize: '13px', color: '#78350f', lineHeight: '1.6', fontWeight: '500' }}>{activeItem.reason}</p>
                                </div>
                                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                  <p style={{ margin: '0 0 3px 0', fontSize: '11px', fontWeight: '800', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Staff Rule Score</p>
                                  <p style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: activeScores.human != null ? (activeScores.human >= 7 ? '#15803d' : activeScores.human >= 5 ? '#d97706' : '#dc2626') : '#94a3b8' }}>{activeScores.human != null ? activeScores.human.toFixed(1) : '-'}</p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Comparison: Original vs Rewrite */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div style={{ background: '#fff', border: '1.5px solid #fca5a5', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: '#fff1f2', borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                              <span style={{ fontSize: '12px', fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Original Response (Has Error)</span>
                              <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto' }}>Turn #{(activeItem.errorMessageIndex || 1) + 1}</span>
                            </div>
                            <div style={{ padding: '16px', fontSize: '14px', color: '#374151', lineHeight: '1.7', minHeight: '100px', maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {(() => {
                                const sampleComparison = sampleComparisons[activeItem.sampleObjectId || activeItem.id];
                                const step11TurnPairs = getTurnPairsForSample(activeItem.sampleObjectId || activeItem.id, activeItem.convId, activeItem);
                                const messageLevelTargets = Array.isArray(sampleComparison?.targets)
                                  ? sampleComparison.targets.filter((target: any) =>
                                    target.targetScope === 'message' &&
                                    Array.isArray(target.annotators) &&
                                    target.annotators.some((a: any) => Array.isArray(a.labels) && a.labels.length > 0)
                                  )
                                  : [];
                                const getStep11MessageLabels = (messageIndex: number, role: string) =>
                                  buildStaffMessageLabels(messageIndex, role, step11TurnPairs, messageLevelTargets);

                                return (activeItem.sampleData?.messages || activeItem.messages || []).map((msg: any, idx: number) => {
                                  const isTarget = String(idx) === String(activeItem.errorMessageIndex || 1);
                                  const messageLabels = getStep11MessageLabels(idx, msg.role);
                                  return (
                                    <div key={idx} style={{ padding: '12px 16px', borderRadius: '8px', background: isTarget ? '#fee2e2' : msg.role === 'user' ? '#f8fafc' : '#f0fdf4', border: isTarget ? '1px solid #fca5a5' : '1px solid #e2e8f0', alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '90%' }}>
                                      <div style={{ fontSize: '11px', fontWeight: '800', color: isTarget ? '#dc2626' : msg.role === 'user' ? '#64748b' : '#16a34a', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        {msg.role === 'user' ? 'Student' : isTarget ? 'AI Tutor (Target to Rewrite)' : 'AI Tutor'}
                                      </div>
                                      <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                                        {msg.text || msg.content}
                                      </div>
                                      {messageLabels.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                          {messageLabels.map((item: any, labelIdx: number) => {
                                            const isIntent = item.kind === 'Intent';
                                            return (
                                              <span
                                                key={labelIdx}
                                                title={`${item.kind} • assigned by ${item.staff}`}
                                                style={{
                                                  padding: '4px 10px', borderRadius: '16px', fontSize: '11px', fontWeight: '700',
                                                  background: isIntent ? '#eef2ff' : '#ecfdf5',
                                                  color: isIntent ? '#4338ca' : '#047857',
                                                  border: `1px solid ${isIntent ? '#c7d2fe' : '#a7f3d0'}`,
                                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                }}
                                              >
                                                <span style={{ opacity: 0.7, fontWeight: '800' }}>{item.kind}:</span>
                                                {item.label}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                          <div style={{ background: '#fff', border: `1.5px solid ${activeRewriteTask?.submittedText ? '#86efac' : '#e2e8f0'}`, borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: activeRewriteTask?.submittedText ? '#f0fdf4' : '#f8fafc', borderBottom: `1px solid ${activeRewriteTask?.submittedText ? '#86efac' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeRewriteTask?.submittedText ? '#16a34a' : '#94a3b8' }} />
                              <span style={{ fontSize: '12px', fontWeight: '800', color: activeRewriteTask?.submittedText ? '#15803d' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Staff Submission</span>
                              {reassignStaff[activeItem.id] && <span style={{ fontSize: '11px', color: '#4f46e5', marginLeft: 'auto', fontWeight: '600' }}>by {reassignStaff[activeItem.id]}</span>}
                            </div>
                            <div style={{ padding: '16px', fontSize: '14px', color: activeRewriteTask?.submittedText ? '#15803d' : '#94a3b8', lineHeight: '1.7', minHeight: '100px', fontStyle: activeRewriteTask?.submittedText ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>
                              {activeRewriteTask?.submittedText || 'Staff has not submitted a rewrite yet.'}
                            </div>
                          </div>
                        </div>

                        {/* Admin action bar */}
                        {activeRewriteTask?.submittedText ? (
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 22px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', flex: 1 }}>Admin Decision:</span>
                            <button onClick={() => reviewRewriteTask(activeRewriteTask, 'approved')} disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                              style={{ padding: '11px 24px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: activeRewriteTask.status === 'approved' ? '#e2e8f0' : 'linear-gradient(135deg, #16a34a, #15803d)', color: activeRewriteTask.status === 'approved' ? '#64748b' : '#fff', cursor: activeRewriteTask.status === 'approved' ? 'default' : 'pointer', boxShadow: activeRewriteTask.status === 'approved' ? 'none' : '0 4px 12px rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {activeRewriteTask.status === 'approved' ? <><Check size={14} /> Approved</> : <><Check size={14} /> Approve</>}
                            </button>
                            <button onClick={() => reviewRewriteTask(activeRewriteTask, 'redo')}
                              disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                              style={{ padding: '11px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <RotateCcw size={14} /> Request Redo
                            </button>
                            <button onClick={() => reviewRewriteTask(activeRewriteTask, 'rejected')} disabled={reviewingRewriteId === activeRewriteTask.id || activeRewriteTask.status === 'approved'}
                              style={{ padding: '11px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <X size={14} /> Reject
                            </button>
                          </div>
                        ) : (
                          <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', color: '#cbd5e1' }}><Inbox size={32} /></div>
                            <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Staff has not submitted a rewrite yet.</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>Waiting for the rewrite submission workflow to provide revised text.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: '60px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px', color: '#cbd5e1' }}><MousePointer2 size={40} /></div>
                        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Select a conversation on the left to review it.</p>
                      </div>
                    )}
                  </div>
                )}
                {/* Navigation button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setCurrentSubStep4(12)}
                    style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Next: Dataset Distribution &rarr;
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ===== STEP 12: FINAL DISTRIBUTION DASHBOARD ===== */}
          {currentSubStep4 === 12 && (() => {
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
              gemini: c.scores.gemini,
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
                    { label: 'Avg AI Score', value: avgAIScore, sub: 'Gemini + Deepseek', color: '#0891b2', bg: '#f0f9ff', Icon: Bot },
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
                          {['ID', 'Subject', 'Gemini', 'Deepseek', 'Staff Rule Score', 'Delta', 'Status'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {conflictData.map(({ id, subject, gemini, deepseek, human, diff, resolved }) => (
                          <tr key={id} style={{ borderBottom: '1px solid #f1f5f9', background: resolved ? '#f0fdf4' : '#fff7f7' }}>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e293b' }}>{id.slice(-6)}</td>
                            <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569' }}>{subject}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '700', color: '#dc2626', fontSize: '13px' }}>{gemini}</td>
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
        </>
      )}
    </div>
  );
  ;
};
