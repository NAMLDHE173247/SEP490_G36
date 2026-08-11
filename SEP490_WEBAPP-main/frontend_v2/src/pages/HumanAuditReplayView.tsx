import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Columns2,
  PanelRightOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  SkipForward,
  User,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  HUMAN_AUDIT_RUBRIC,
  SCORE_ANCHORS,
  cappedSocraticScore,
  emptyAuditScores,
} from '../constants/humanAuditRubric';
import '../styles/humanaudit.css';

type QueueFilter = 'all' | 'pending' | 'reviewed' | 'conflict';

const reviewStatus = (item: any) => {
  if (!item?.human_review) return 'pending';
  if (item.human_review.verdict === 'skip') return 'skipped';
  if (item.human_review.conflict?.has_conflict) return 'conflict';
  return 'reviewed';
};

const firstQuestion = (item: any) => item?.replay_turns?.[0]?.user || 'Không có câu hỏi được lưu';

export default function HumanAuditReplayView() {
  const { user } = useAuth();
  const [evaluationId, setEvaluationId] = useState(() => localStorage.getItem('human_audit_eval_id') || '');
  const [evaluation, setEvaluation] = useState<any>(null);
  const [recentEvaluations, setRecentEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedConvIndex, setSelectedConvIndex] = useState<number | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [scores, setScores] = useState<Record<string, number | null>>(emptyAuditScores);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [scorePanelOpen, setScorePanelOpen] = useState(false);
  const [scoringTarget, setScoringTarget] = useState<'ft' | 'base'>('ft');

  const loadEvaluation = useCallback(async (requestedId?: string) => {
    const id = String(requestedId || evaluationId).trim();
    if (!id) {
      toast.error('Nhập Evaluation ID cần thẩm định');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const detail = await apiService.getMyHumanAuditWork(id);
      if (!Array.isArray(detail?.results) || detail.results.length === 0) {
        throw new Error('Evaluation này không có replay để thẩm định');
      }
      setEvaluation(detail);
      setEvaluationId(id);
      localStorage.setItem('human_audit_eval_id', id);
      const storedConv = localStorage.getItem('human_audit_conv_index');
      const requestedConv = storedConv === null ? null : Number(storedConv);
      const initial = requestedConv !== null && Number.isInteger(requestedConv)
        ? detail.results.find((item: any) => item.conv_index === requestedConv)
        : null;
      setSelectedConvIndex((initial || detail.results[0]).conv_index);
      localStorage.removeItem('human_audit_conv_index');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Không tải được Evaluation ID';
      setLoadError(message);
      setEvaluation(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    apiService.getMyHumanAuditAssignments()
      .then((items) => setRecentEvaluations(Array.isArray(items) ? items : []))
      .catch(() => setRecentEvaluations([]));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('human_audit_eval_id');
    if (stored) void loadEvaluation(stored);
  }, []);

  const currentItem = useMemo(() => evaluation?.results?.find(
    (item: any) => item.conv_index === selectedConvIndex,
  ), [evaluation, selectedConvIndex]);

  const currentPosition = useMemo(() => evaluation?.results?.findIndex(
    (item: any) => item.conv_index === selectedConvIndex,
  ) ?? -1, [evaluation, selectedConvIndex]);

  const currentBaseItem = useMemo(() => {
    if (!evaluation || !currentItem) return null;
    return (evaluation.baseResults || []).find((item: any) => (
      (currentItem.item_id && item.item_id === currentItem.item_id)
      || item.conv_index === currentItem.conv_index
    )) || null;
  }, [evaluation, currentItem]);

  const getReviewForTarget = useCallback((convIndex: number, target: 'ft' | 'base') => {
    if (!evaluation) return null;
    const item = (evaluation.results || []).find((r: any) => r.conv_index === convIndex);
    const baseItem = (evaluation.baseResults || []).find((r: any) => (
      (item?.item_id && r.item_id === item.item_id) || r.conv_index === convIndex
    ));

    if (target === 'base') {
      if (baseItem?.human_review) return baseItem.human_review;
      const cached = localStorage.getItem(`ha_base_review_${evaluation.modelEvalId}_${convIndex}`);
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
      // Don't fallback to FT review — base should start with empty scores
      return null;
    }
    return item?.human_review || null;
  }, [evaluation]);

  useEffect(() => {
    if (selectedConvIndex === null || !currentItem || !evaluationId) return;
    const review = getReviewForTarget(selectedConvIndex, scoringTarget);
    const draftKey = `ha_draft_${evaluationId}_${selectedConvIndex}_${scoringTarget}`;
    
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
    } catch (e) {}

    if (draft) {
      setScores({ ...emptyAuditScores(), ...(draft.scores || {}) });
      setReasons(draft.reasons || {});
      setReviewNote(draft.note || '');
    } else {
      setScores({ ...emptyAuditScores(), ...(review?.human_scores || {}) });
      setReasons(review?.human_reasons || {});
      setReviewNote(review?.note || '');
    }
  }, [selectedConvIndex, currentItem, scoringTarget, getReviewForTarget, evaluationId]);

  useEffect(() => {
    if (selectedConvIndex === null || !evaluationId) return;
    const review = getReviewForTarget(selectedConvIndex, scoringTarget);
    const draftKey = `ha_draft_${evaluationId}_${selectedConvIndex}_${scoringTarget}`;
    
    const isDifferent = () => {
      if (!review) return true;
      if (reviewNote !== (review.note || '')) return true;
      for (const key of Object.keys(emptyAuditScores())) {
         if (scores[key] !== (review.human_scores?.[key] ?? null)) return true;
         if ((reasons[key] || '') !== (review.human_reasons?.[key] || '')) return true;
      }
      return false;
    };

    if (isDifferent()) {
      const hasContent = Object.values(scores).some(v => v !== null) || Object.values(reasons).some(v => String(v).trim() !== '') || reviewNote.trim() !== '';
      if (hasContent) {
        localStorage.setItem(draftKey, JSON.stringify({ scores, reasons, note: reviewNote }));
      } else {
        localStorage.removeItem(draftKey);
      }
    }
  }, [scores, reasons, reviewNote, selectedConvIndex, scoringTarget, evaluationId, getReviewForTarget]);

  useEffect(() => {
    if (!scorePanelOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScorePanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [scorePanelOpen]);

  const filteredQueue = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return (evaluation?.results || []).filter((item: any) => {
      const status = reviewStatus(item);
      const matchesFilter = queueFilter === 'all'
        || (queueFilter === 'pending' && status === 'pending')
        || (queueFilter === 'reviewed' && ['reviewed', 'skipped'].includes(status))
        || (queueFilter === 'conflict' && status === 'conflict');
      const matchesSearch = !normalized
        || String(item.item_id || '').toLowerCase().includes(normalized)
        || firstQuestion(item).toLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [evaluation, queueFilter, searchTerm]);

  const scoredItem = scoringTarget === 'base' ? (currentBaseItem || currentItem) : currentItem;
  const humanRawS = ['A1', 'A2', 'A3'].every((key) => scores[key] !== null)
    ? (Number(scores.A1) + Number(scores.A2) + Number(scores.A3)) / 3
    : null;
  const humanS = humanRawS === null ? null : Number(scores.A1) <= 1 ? Math.min(humanRawS, 1) : humanRawS;
  const humanK = scores.B1;
  const auditRevealed = Boolean(scoredItem?.human_review);
  const aiS = cappedSocraticScore(scoredItem?.criteria_scores);
  const baseReplayTurns = currentBaseItem?.replay_turns || [];
  const ftReplayTurns = currentItem?.replay_turns || [];
  const sharedSystemPrompt = String(evaluation?.systemPrompt || '').trim();
  const basePromptHash = String(currentBaseItem?.prompt_trace?.system_prompt_hash || '').trim();
  const ftPromptHash = String(currentItem?.prompt_trace?.system_prompt_hash || '').trim();
  const promptTraceComplete = Boolean(basePromptHash && ftPromptHash);
  const samePromptVerified = promptTraceComplete && basePromptHash === ftPromptHash;

  const selectItem = (item: any) => {
    setSelectedConvIndex(item.conv_index);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateItem = (offset: number) => {
    const next = evaluation?.results?.[currentPosition + offset];
    if (next) selectItem(next);
  };

  const saveReview = async (skip = false) => {
    if (!evaluation || !currentItem) return;
    if (!skip) {
      const missing = HUMAN_AUDIT_RUBRIC.filter(({ key }) => scores[key] === null || scores[key] === undefined);
      if (missing.length) {
        toast.error(`Cần chấm đủ: ${missing.map(({ key }) => key).join(', ')}`);
        return;
      }
      const missingReasons = HUMAN_AUDIT_RUBRIC.filter(({ key }) => {
        const score = Number(scores[key]);
        return [2, 3, 4].includes(score) && !String(reasons[key] || '').trim();
      });
      if (missingReasons.length) {
        toast.error(`Điểm 2–4 cần lý do cụ thể: ${missingReasons.map(({ key }) => key).join(', ')}`);
        return;
      }
    }

    setSaving(true);
    try {
      const previousVerdict = currentItem.human_review?.verdict || 'pending';
      const response = await apiService.saveMyHumanAuditReview(
        evaluation.modelEvalId,
        currentItem.conv_index,
        {
          target_model: scoringTarget,
          ...(skip ? { verdict: 'skip' as const } : {
            human_scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)])),
            human_reasons: reasons,
          }),
          note: reviewNote,
        },
      );

      if (scoringTarget === 'base' && response.review) {
        localStorage.setItem(
          `ha_base_review_${evaluation.modelEvalId}_${currentItem.conv_index}`,
          JSON.stringify(response.review)
        );
      }
      
      localStorage.removeItem(`ha_draft_${evaluation.modelEvalId}_${currentItem.conv_index}_${scoringTarget}`);

      setEvaluation((previous: any) => {
        const nextVerdict = response.review?.verdict === 'skip' ? 'skip' : 'reviewed';
        let reviewedItems = Number(previous.humanAudit?.reviewed_items || 0);
        let skippedItems = Number(previous.humanAudit?.skipped_items || 0);
        if (previousVerdict === 'pending') {
          if (nextVerdict === 'skip') skippedItems += 1;
          else reviewedItems += 1;
        } else if (previousVerdict === 'skip' && nextVerdict === 'reviewed') {
          skippedItems = Math.max(0, skippedItems - 1);
          reviewedItems += 1;
        } else if (previousVerdict !== 'skip' && nextVerdict === 'skip') {
          reviewedItems = Math.max(0, reviewedItems - 1);
          skippedItems += 1;
        }
        const completedItems = reviewedItems + skippedItems;
        const totalItems = Math.max(1, Number(previous.humanAudit?.total_items || previous.results.length));
        return {
          ...previous,
          results: previous.results.map((item: any) => item.conv_index === currentItem.conv_index
            ? {
                ...item,
                human_review: response.review,
                criteria_scores: response.criteria_scores,
                criteria_reasons: response.criteria_reasons,
                effective_judge_model: response.effective_judge_model,
              }
            : item),
          baseResults: (previous.baseResults || []).map((item: any) => item.conv_index === currentItem.conv_index
            ? {
                ...item,
                human_review: response.review,
              }
            : item),
          humanAudit: {
            ...previous.humanAudit,
            reviewed_items: reviewedItems,
            skipped_items: skippedItems,
            pending_items: Math.max(0, totalItems - completedItems),
            completion_rate: completedItems / totalItems,
          },
        };
      });
      toast.success(skip ? 'Đã bỏ qua replay này' : `Đã lưu Human Audit (${scoringTarget === 'base' ? 'Base Model' : 'Fine-tuned Model'})`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không thể lưu Human Audit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ha-page">
      <header className="ha-hero">
        <div className="ha-hero-copy">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.15)', padding: '4px 12px', borderRadius: '16px', color: '#4338ca', fontWeight: 700, fontSize: '0.82rem', marginBottom: '8px' }}>
            <User size={14} /> Staff đang thực hiện: {user?.name || 'Tài khoản Staff'} ({user?.email || 'Chưa đăng nhập'}) · {String(user?.role || 'staff').toUpperCase()}
          </div>
          <span className="ha-eyebrow"><ClipboardCheck size={15} /> STAFF · HUMAN AUDIT ĐỘC LẬP</span>
          <h1>Chấm Phát Lại Hội Thoại</h1>
          <p>Bạn chỉ nhìn thấy Evaluation đã được Supervisor giao. Mỗi điểm được lưu theo tài khoản {user?.name || 'Staff'} và không ghi đè bản chấm của Staff khác.</p>
        </div>
        {evaluation && (
          <div className="ha-hero-actions">
            <button type="button" className={scorePanelOpen ? 'active' : ''} onClick={() => setScorePanelOpen((open) => !open)} title="Mở bảng chấm Human">
              <PanelRightOpen size={18} /> Chấm replay
            </button>
            <div className="ha-progress-ring" style={{ '--progress': `${Math.round((evaluation.humanAudit?.completion_rate || 0) * 100)}%` } as React.CSSProperties}>
              <div><strong>{evaluation.humanAudit?.reviewed_items || 0}</strong><span>/ {evaluation.results.length}</span></div>
              <small>đã chấm</small>
            </div>
          </div>
        )}
      </header>

      <section className="ha-session-card">
        <div className="ha-session-input">
            <label>Evaluation ID đã được giao</label>
          <div>
            <input value={evaluationId} onChange={(event) => setEvaluationId(event.target.value)} placeholder="eval_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <button type="button" onClick={() => void loadEvaluation()} disabled={loading}>
              {loading ? <RefreshCw className="spin" size={16} /> : <Search size={16} />} Mở phiên
            </button>
          </div>
        </div>
        {recentEvaluations.length > 0 && (
          <div className="ha-recent-select">
            <label>Assignment Human Audit của tôi</label>
            <select value={evaluationId} onChange={(event) => { setEvaluationId(event.target.value); void loadEvaluation(event.target.value); }}>
              <option value="">Chọn Evaluation ID...</option>
              {recentEvaluations.map((item: any) => (
                <option key={item.modelEvalId} value={item.modelEvalId}>
                  {item.projectName || item.jobId} · {item.reviewedItems}/{item.assignedItems} đã chấm
                </option>
              ))}
            </select>
          </div>
        )}
        {loadError && <div className="ha-load-error"><AlertTriangle size={16} /> {loadError}</div>}
        {evaluation && (
          <>
            <div className="ha-session-facts">
              <div><span>Phiên Human Audit</span><strong>{evaluation.modelEvalId}</strong></div>
              <div><span>Base Model</span><strong>{evaluation.baseModelRepo || 'Không có Base trong run này'}</strong></div>
              <div><span>Fine-tuned Model</span><strong>{evaluation.ftModelRepo || evaluation.jobId}</strong></div>
              <div><span>AI Judge</span><strong>{evaluation.judgeModel}</strong></div>
              <div><span>Tiến độ</span><strong>{evaluation.humanAudit?.reviewed_items || 0}/{evaluation.results.length}</strong></div>
              <div><span>Staff đang chấm</span><strong>👤 {user?.name || 'Staff'} ({user?.email || 'staff'})</strong></div>
              <div><span>Checker phụ trách</span><strong>⚖️ {evaluation.checker_name || 'Chưa phân công'}</strong></div>
            </div>
            {(!Array.isArray(evaluation.baseResults) || evaluation.baseResults.length === 0) && (
              <div className="ha-load-error"><AlertTriangle size={16} /> Evaluation này là single run hoặc thiếu baseResults. Hãy chọn lần Model Eval paired để xem Base và Fine-tuned cạnh nhau.</div>
            )}
            {(evaluation.humanAudit?.reviewed_items || 0) > 0 && (
              <details className="ha-agreement">
                <summary>
                  <span>Độ khớp Human–AI</span>
                  <strong>
                    Đúng kiến thức {evaluation.humanAudit.human_mean_k?.toFixed?.(2) ?? '—'} · Gợi mở Socratic {evaluation.humanAudit.human_mean_s?.toFixed?.(2) ?? '—'} · Conflict {((evaluation.humanAudit.conflict_rate || 0) * 100).toFixed(1)}%
                  </strong>
                </summary>
                <div className="ha-agreement-table-wrap">
                  <table>
                    <thead><tr><th>Tiêu chí</th><th>N</th><th>Khớp tuyệt đối</th><th>Lệch không quá 1</th><th>MAE</th><th>Weighted κ</th></tr></thead>
                    <tbody>
                      {HUMAN_AUDIT_RUBRIC.map(({ key, title }) => {
                        const metric = evaluation.humanAudit.criteria_agreement?.[key] || {};
                        return (
                          <tr key={key}>
                            <td><b>{key}</b> · {title}</td>
                            <td>{metric.n || 0}</td>
                            <td>{metric.exact_agreement_rate == null ? '—' : `${(metric.exact_agreement_rate * 100).toFixed(1)}%`}</td>
                            <td>{metric.within_one_agreement_rate == null ? '—' : `${(metric.within_one_agreement_rate * 100).toFixed(1)}%`}</td>
                            <td>{metric.mean_absolute_difference?.toFixed?.(2) ?? '—'}</td>
                            <td>{metric.quadratic_weighted_kappa?.toFixed?.(3) ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p>κ đo mức đồng thuận có hiệu chỉnh cho trùng hợp ngẫu nhiên; MAE là độ lệch điểm trung bình. Replay bị bỏ qua không được tính.</p>
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {!evaluation ? (
        <section className="ha-empty-state">
          <ShieldCheck size={44} />
          <h2>Mở một Evaluation ID để bắt đầu</h2>
          <p>Model Eval sinh và lưu 50 phản hồi trước; tab này chỉ phát lại, chấm thủ công và so sánh với AI Judge.</p>
        </section>
      ) : (
        <main className="ha-workspace">
          <aside className="ha-queue-panel">
            <div className="ha-panel-title">
              <div><span>HÀNG ĐỢI</span><h2>{evaluation.results.length} replay</h2></div>
              <strong>{evaluation.humanAudit?.pending_items ?? evaluation.results.length} chờ</strong>
            </div>
            <div className="ha-search"><Search size={15} /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Tìm mã hoặc câu hỏi..." /></div>
            <div className="ha-filter-row">
              {(['all', 'pending', 'reviewed', 'conflict'] as QueueFilter[]).map((filter) => (
                <button type="button" key={filter} className={queueFilter === filter ? 'active' : ''} onClick={() => setQueueFilter(filter)}>
                  {filter === 'all' ? 'Tất cả' : filter === 'pending' ? 'Chưa chấm' : filter === 'reviewed' ? 'Đã chấm' : 'Conflict'}
                </button>
              ))}
            </div>
            <div className="ha-queue-list">
              {filteredQueue.map((item: any, index: number) => {
                const status = reviewStatus(item);
                return (
                  <button type="button" key={item.item_id || item.conv_index} className={`ha-queue-item ${selectedConvIndex === item.conv_index ? 'active' : ''}`} onClick={() => selectItem(item)}>
                    <span className="ha-queue-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ha-queue-copy"><strong>{item.item_id || `Conv ${item.conv_index}`}</strong><small>{firstQuestion(item)}</small></span>
                    <span className={`ha-status-dot ${status}`} title={status} />
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="ha-replay-panel">
            <div className="ha-panel-title sticky">
              <div><span><Columns2 size={12} /> PAIRED REPLAY · BASE VS FINE-TUNED</span><h2>{currentItem?.item_id || `Conversation ${selectedConvIndex}`}</h2></div>
              <div className="ha-replay-actions">
                <div className="ha-nav-buttons">
                  <button type="button" disabled={currentPosition <= 0} onClick={() => navigateItem(-1)}><ChevronLeft size={16} /> Trước</button>
                  <strong>{currentPosition + 1}/{evaluation.results.length}</strong>
                  <button type="button" disabled={currentPosition >= evaluation.results.length - 1} onClick={() => navigateItem(1)}>Sau <ChevronRight size={16} /></button>
                </div>
                <button type="button" className="ha-open-score" onClick={() => setScorePanelOpen(true)} title="Mở bảng chấm điểm">
                  <ClipboardCheck size={16} /><span>Chấm điểm</span>
                </button>
              </div>
            </div>

            <div className="ha-paired-transcript">
              <div className="ha-model-column-heads">
                <div className="base"><span>BASE MODEL</span><strong>{evaluation.baseModelRepo || 'Base model'}</strong></div>
                <div className="ft"><span>FINE-TUNED MODEL</span><strong>{evaluation.ftModelRepo || evaluation.jobId}</strong></div>
              </div>
              <details className={`ha-common-prompt ${samePromptVerified ? 'verified' : promptTraceComplete ? 'mismatch' : 'unknown'}`}>
                <summary>
                  <div><ShieldCheck size={16} /><span>{evaluation.systemPromptSource === 'training_history' ? 'PROMPT AUTOTRAIN DÙNG CHUNG CHO BASE VÀ FINE-TUNED' : 'PROMPT ĐÁNH GIÁ DÙNG CHUNG CHO BASE VÀ FINE-TUNED'}</span></div>
                  <strong>{samePromptVerified ? 'Đã xác minh cùng prompt' : promptTraceComplete ? 'Cảnh báo: prompt không trùng' : 'Chưa đủ hash để xác minh'}</strong>
                </summary>
                <div className="ha-prompt-meta">
                  <span>Version: {evaluation.systemPromptVersion || currentItem?.prompt_trace?.prompt_version || 'UNVERSIONED'}</span>
                  <span>Source: {evaluation.systemPromptSource || currentItem?.prompt_trace?.prompt_source || 'Không xác định'}</span>
                  <span title={basePromptHash}>Base hash: {basePromptHash ? basePromptHash.slice(0, 16) : 'Không có'}</span>
                  <span title={ftPromptHash || evaluation.systemPromptHash}>Fine-tuned hash: {(ftPromptHash || evaluation.systemPromptHash || '').slice(0, 16) || 'Không có'}</span>
                </div>
                <pre>{sharedSystemPrompt || 'Evaluation cũ chưa lưu nội dung system prompt. Chỉ có thể kiểm tra phiên bản/hash trong prompt trace.'}</pre>
              </details>

              <section className="ha-question-thread">
                <span>CÂU HỎI HỌC SINH</span>
                {(ftReplayTurns.length ? ftReplayTurns : baseReplayTurns).map((turn: any, index: number) => (
                  <div key={index}><small>Lượt {index + 1}</small><p>{turn.user || 'Không có nội dung câu hỏi.'}</p></div>
                ))}
                {!ftReplayTurns.length && !baseReplayTurns.length && <p>Không có câu hỏi được lưu.</p>}
              </section>

              <div className="ha-response-pair large">
                <article className="ha-model-response base">
                  <header><span>PHẢN HỒI BASE MODEL</span><small><Clock size={12} /> {(Number(currentBaseItem?.avg_latency_ms || 0) / 1000).toFixed(2)}s · {currentBaseItem?.total_tokens ?? 0} tokens</small></header>
                  <div className="ha-continuous-response">
                    {baseReplayTurns.map((turn: any, index: number) => <section key={index}><small>Lượt {index + 1}</small><p>{turn.model}</p></section>)}
                    {!baseReplayTurns.length && <p className="ha-missing-response">Không tìm thấy câu trả lời Base khớp item_id/conv_index.</p>}
                  </div>
                </article>
                <article className="ha-model-response ft">
                  <header><span>PHẢN HỒI FINE-TUNED MODEL</span><small><Clock size={12} /> {(Number(currentItem?.avg_latency_ms || 0) / 1000).toFixed(2)}s · {currentItem?.total_tokens ?? 0} tokens</small></header>
                  <div className="ha-continuous-response">
                    {ftReplayTurns.map((turn: any, index: number) => <section key={index}><small>Lượt {index + 1}</small><p>{turn.model}</p></section>)}
                    {!ftReplayTurns.length && <p className="ha-missing-response">Không có câu trả lời Fine-tuned được lưu.</p>}
                  </div>
                </article>
              </div>
            </div>

            <details className="ha-reference" open>
              <summary>Bằng chứng dành cho người thẩm định</summary>
              <p><strong>Đáp án tham chiếu:</strong> {currentItem?.reference_answer || 'Không có văn bản tham chiếu.'}</p>
              {currentItem?.gold_key_points?.length > 0 && <ul>{currentItem.gold_key_points.map((point: string, index: number) => <li key={index}>{point}</li>)}</ul>}
              <small>Model được kiểm tra không nhìn thấy phần này.</small>
            </details>

          </section>

          {scorePanelOpen && (
            <>
              <button type="button" className="ha-drawer-backdrop" aria-label="Đóng bảng chấm điểm" onClick={() => setScorePanelOpen(false)} />
              <aside className="ha-score-panel ha-score-drawer" role="dialog" aria-modal="true" aria-label="Bảng chấm Human">
                <div className="ha-panel-title sticky">
                  <div>
                    <span>HUMAN RUBRIC</span>
                    <h2>Chấm độc lập</h2>
                  </div>
                  <div className="ha-score-drawer-actions">
                    <div style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User size={13} /> {user?.name || user?.email || 'Staff'} ({user?.role?.toUpperCase() || 'STAFF'})
                    </div>
                    <div className="ha-live-outcomes"><b>Kiến thức {humanK ?? '—'}</b><b>Gợi mở {humanS === null ? '—' : humanS.toFixed(2)}</b></div>
                    <button type="button" className="ha-close-score" onClick={() => setScorePanelOpen(false)} title="Đóng bảng chấm"><X size={18} /></button>
                  </div>
                </div>
                <div className="ha-scoring-target-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', background: scoringTarget === 'base' ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)', borderBottom: '1px solid #e2e8f0' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>ĐANG CHẤM MODEL:</label>
                  <select
                    value={scoringTarget}
                    onChange={(e) => {
                      const newTarget = e.target.value as 'ft' | 'base';
                      setScoringTarget(newTarget);
                      // Use getReviewForTarget for consistent base/ft review lookup
                      if (selectedConvIndex !== null) {
                        const review = getReviewForTarget(selectedConvIndex, newTarget);
                        setScores({ ...emptyAuditScores(), ...(review?.human_scores || {}) });
                        setReasons(review?.human_reasons || {});
                        setReviewNote(review?.note || '');
                      }
                    }}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: `2px solid ${scoringTarget === 'base' ? '#f59e0b' : '#6366f1'}`, fontWeight: 600, fontSize: '0.85rem', background: '#fff', color: scoringTarget === 'base' ? '#b45309' : '#4f46e5', cursor: 'pointer' }}
                  >
                    <option value="ft">🎯 Fine-tuned Model — {evaluation?.ftModelRepo || evaluation?.jobId || 'FT Model'}</option>
                    <option value="base">🔲 Base Model — {evaluation?.baseModelRepo || 'Base Model'}</option>
                  </select>
                  {scoringTarget === 'base' && !currentBaseItem && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>⚠ Không có dữ liệu Base</span>
                  )}
                </div>
                <div className="ha-scoring-target"><span>Đang chấm câu trả lời {scoringTarget === 'base' ? 'Base Model' : 'Fine-tuned'}</span><strong>{currentItem?.item_id || `Conversation ${selectedConvIndex}`}</strong></div>
                <div className="ha-blind-notice">
                  <ShieldCheck size={16} />
                  <span><strong>Công thức Socratic: S = mean(A1, A2, A3).</strong> A2 chấm nhận biết học sinh hiểu/chưa hiểu, dẫn dắt và khơi gợi tư duy phản biện; A3 chấm cá nhân hóa/khả năng thích nghi. Nếu A1 ≤ 1 thì S tối đa 1.0.</span>
                </div>
                {Number(scores.A1) <= 1 && scores.A1 !== null && (
                  <div className="ha-a1-warning"><ShieldCheck size={17} /> A1 ≤ 1 nên điểm Gợi mở Socratic bị giới hạn tối đa 1.0.</div>
                )}
                <div className="ha-rubric-list">
                  {HUMAN_AUDIT_RUBRIC.map((criterion) => {
                    const selected = scores[criterion.key];
                    const intermediate = selected !== null && [2, 3, 4].includes(Number(selected));
                    const aiScore = Number(currentItem?.criteria_scores?.[criterion.key]);
                    const delta = selected === null ? null : Math.abs(Number(selected) - aiScore);
                    return (
                      <article className="ha-rubric-card" key={criterion.key}>
                        <header>
                          <div><span>{criterion.key}</span><strong>{criterion.title}</strong></div>
                          {auditRevealed && selected !== null && <small className={Number(delta) >= 2 ? 'major' : Number(delta) >= 1 ? 'minor' : ''}>AI {aiScore.toFixed(1)} · Δ {delta?.toFixed(1)}</small>}
                        </header>
                        <p>{criterion.description}</p>
                        <div className="ha-score-buttons">
                          {[0, 1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={selected === value ? 'active' : ''} onClick={() => setScores((previous) => ({ ...previous, [criterion.key]: value }))}>{value}</button>)}
                        </div>
                        {selected !== null && <em>{SCORE_ANCHORS[Number(selected)]}</em>}
                        <textarea
                          className={intermediate && !String(reasons[criterion.key] || '').trim() ? 'required' : ''}
                          value={reasons[criterion.key] || ''}
                          onChange={(event) => setReasons((previous) => ({ ...previous, [criterion.key]: event.target.value }))}
                          placeholder={intermediate ? `Bắt buộc giải thích vì sao ${criterion.key} = ${selected}` : 'Ghi bằng chứng hoặc lý do (khuyến nghị)'}
                        />
                        {intermediate && (
                          <small className={`ha-reason-status ${String(reasons[criterion.key] || '').trim() ? 'complete' : 'missing'}`}>
                            {String(reasons[criterion.key] || '').trim() ? <><CheckCircle2 size={12} /> Đã có lý do</> : <><AlertTriangle size={12} /> Điểm 2–4 bắt buộc nhập lý do</>}
                          </small>
                        )}
                      </article>
                    );
                  })}
                </div>
                {!auditRevealed ? (
                  <div className="ha-blind-notice"><ShieldCheck size={19} /> Điểm và lý giải của AI Judge đang ẩn để bạn chấm độc lập trước.</div>
                ) : scoredItem?.human_review?.verdict === 'skip' ? (
                  <div className="ha-blind-notice">Replay này đã bị bỏ qua và không được tính vào agreement.</div>
                ) : (
                  <section className="ha-ai-comparison">
                    <div className={`ha-conflict ${scoredItem?.human_review?.conflict?.severity || 'none'}`}>
                      {scoredItem?.human_review?.conflict?.has_conflict ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                      <div><strong>{scoredItem?.human_review?.conflict?.has_conflict ? 'Phát hiện conflict' : 'Human và AI Judge khớp'}</strong><p>{scoredItem?.human_review?.conflict?.summary}</p></div>
                    </div>
                    <div className="ha-ai-head"><span>AI Judge: Đúng kiến thức {Number(scoredItem?.criteria_scores?.B1).toFixed(2)} · Gợi mở Socratic {aiS?.toFixed(2) ?? '—'}</span><small>{scoredItem?.effective_judge_model || evaluation.judgeModel}</small></div>
                    <div className="ha-ai-grid">
                      {HUMAN_AUDIT_RUBRIC.map(({ key, title }) => (
                        <article key={key}>
                          <header><strong>{key} · {title}</strong><b>{Number(scoredItem?.criteria_scores?.[key]).toFixed(1)}</b></header>
                          <p>{scoredItem?.criteria_reasons?.[key] || 'Không có lý giải.'}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                <div className="ha-save-box">
                  <label>Nhận xét tổng quát<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Lỗi nổi bật hoặc đề xuất xử lý conflict..." /></label>
                  <div className="ha-blind-notice"><ShieldCheck size={16} /> Bản chấm được ký tự động bằng tài khoản Staff: <strong>{user?.name || user?.email}</strong></div>
                  <div><button type="button" className="skip" onClick={() => void saveReview(true)} disabled={saving}><SkipForward size={15} /> Bỏ qua</button><button type="button" className="save" onClick={() => void saveReview(false)} disabled={saving}>{saving ? <RefreshCw className="spin" size={15} /> : <ClipboardCheck size={15} />} Lưu Human Audit</button></div>
                </div>
              </aside>
            </>
          )}
        </main>
      )}
    </div>
  );
}
