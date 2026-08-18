import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HUMAN_AUDIT_RUBRIC, SCORE_ANCHORS, emptyAuditScores } from '../constants/humanAuditRubric';
import '../styles/humanauditmanager.css';
import '../styles/humanauditmanager-agreement.css';

type ManagerFilter = 'all' | 'conflict' | 'resolved' | 'pending';

const deduplicateReviews = (reviews: any[]) => {
  if (!reviews) return [];
  const map = new Map<string, any>();
  reviews.forEach(review => {
    const targetModel = review.targetModel || review.target_model || 'ft';
    const key = `${review.reviewerId || review.reviewerName}_${targetModel}`;
    const existing = map.get(key);
    if (existing) {
      const existingDate = existing.updatedAt || existing.createdAt;
      const currentDate = review.updatedAt || review.createdAt;
      if (existingDate && currentDate && new Date(currentDate) < new Date(existingDate)) {
        return; // Keep the existing one because it is newer
      }
    }
    map.set(key, review);
  });
  return Array.from(map.values());
};

export default function HumanAuditManagerView() {
  const { user } = useAuth();
  const isChecker = user?.role === 'checker';
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [checkers, setCheckers] = useState<any[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedCheckerId, setSelectedCheckerId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [filter, setFilter] = useState<ManagerFilter>('all');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [resolution, setResolution] = useState<'accept_ai' | 'accept_staff' | 'manual'>('accept_ai');
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [finalScores, setFinalScores] = useState<Record<string, number | null>>(emptyAuditScores);
  const [finalReasons, setFinalReasons] = useState<Record<string, string>>({});
  const [resolutionNote, setResolutionNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalTargetFilter, setModalTargetFilter] = useState<'all' | 'ft' | 'base'>('ft');
  const [activeStaffId, setActiveStaffId] = useState<string>('');
  const [filterReviewerId, setFilterReviewerId] = useState<string>('all');

  const computeModelConflictBreakdown = (reviews: any[], aiScores?: any, aiBaseScores?: any) => {
    const unique = deduplicateReviews(reviews);
    const ftReviews = unique.filter((r: any) => (r.targetModel || r.target_model || 'ft') === 'ft');
    const baseReviews = unique.filter((r: any) => (r.targetModel || r.target_model) === 'base');

    const calcStats = (revs: any[], targetAiScores?: any) => {
      if (!revs.length) return { count: 0, maxDelta: 0, conflicts: [] as string[], primaryReviewer: null };

      let bestRev = revs[0];
      let maxD = 0;
      let primaryConflicts: string[] = [];

      revs.forEach((r: any) => {
        if (!r.humanScores || !targetAiScores) return;
        let rMaxD = 0;
        const rConflicts: string[] = [];
        Object.entries(r.humanScores).forEach(([k, v]) => {
          const aiVal = targetAiScores[k];
          if (v !== null && v !== undefined && aiVal !== undefined && aiVal !== null) {
            const delta = Math.abs(Number(v) - Number(aiVal));
            if (delta > rMaxD) rMaxD = delta;
            if (delta >= 1.5) rConflicts.push(k);
          }
        });
        if (rMaxD >= maxD) {
          maxD = rMaxD;
          bestRev = r;
          primaryConflicts = rConflicts;
        }
      });

      return {
        count: revs.length,
        maxDelta: maxD,
        conflicts: primaryConflicts,
        primaryReviewer: bestRev?.reviewerName || null,
      };
    };

    return {
      ft: calcStats(ftReviews, aiScores),
      base: calcStats(baseReviews, aiBaseScores || aiScores),
    };
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [evaluationRows, staffRows, checkerRows] = await Promise.all([
        apiService.getManagedHumanAudits(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditStaff(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditCheckers(),
      ]);
      const validEvals = Array.isArray(evaluationRows) ? evaluationRows : [];
      setEvaluations(validEvals);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
      setCheckers(Array.isArray(checkerRows) ? checkerRows : []);
      if (!selectedEvalId && validEvals[0]?.modelEvalId) {
        setSelectedEvalId(validEvals[0].modelEvalId);
      }
    } catch (error: any) {
      toast.error('Lỗi khi tải danh sách Human Audit');
      setEvaluations([]);
      setStaff([]);
      setCheckers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedEvalId, isChecker]);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const detailCache = React.useRef<Map<string, any>>(new Map());

  const loadDetail = useCallback(async (evalId: string, forceRefresh = false) => {
    if (!evalId) return;
    const cached = detailCache.current.get(evalId);
    if (cached && !forceRefresh) {
      setDetail(cached);
      return;
    }
    setLoadingDetail(true);
    try {
      const data = await apiService.getManagedHumanAuditDetail(evalId);
      detailCache.current.set(evalId, data);
      setDetail(data);
    } catch (error: any) {
      toast.error('Lỗi khi tải chi tiết dự án Human Audit');
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, []);
  useEffect(() => { if (selectedEvalId) void loadDetail(selectedEvalId); }, [selectedEvalId, loadDetail]);

  // Reset reviewer filter when switching eval
  useEffect(() => { setFilterReviewerId('all'); }, [selectedEvalId]);

  // Helper to extract reviewer ID robustly whether it is string, ObjectId, or populated Object
  const extractReviewerId = useCallback((r: any) => {
    if (!r) return '';
    const raw = r.reviewerId ?? r.reviewer_id ?? r.reviewer;
    if (raw && typeof raw === 'object') return String(raw._id || raw.id || '');
    if (raw) return String(raw);
    return String(r.reviewerName || r.reviewer_name || '');
  }, []);

  // Collect unique reviewers from current detail (from both assignments and reviews)
  const reviewersInDetail = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();

    (detail?.assignments || []).forEach((a: any) => {
      const s = a.staffId || a.staff;
      const id = String(typeof s === 'object' ? (s?._id || s?.id || '') : (s || ''));
      const name = typeof s === 'object' ? (s?.name || s?.email || '') : '';
      if (id) {
        map.set(id, { id, name: name || 'Staff' });
      }
    });

    (detail?.items || []).forEach((item: any) => {
      (item.reviews || []).forEach((r: any) => {
        const id = extractReviewerId(r);
        const name = r.reviewerName || r.reviewer_name || (typeof r.reviewerId === 'object' ? r.reviewerId?.name : '') || id;
        if (id) {
          map.set(id, { id, name: name || map.get(id)?.name || 'Staff' });
        }
      });
    });

    return Array.from(map.values());
  }, [detail, extractReviewerId]);

  const selectedEvaluation = evaluations.find(item => item.modelEvalId === selectedEvalId);
  useEffect(() => {
    setSelectedCheckerId(selectedEvaluation?.checkerId || '');
  }, [selectedEvalId, selectedEvaluation?.checkerId]);
  const conflictSummary = useMemo(() => {
    if (!detail?.items) return { ftConflicts: 0, baseConflicts: 0, totalConflicts: 0 };
    let ftCount = 0;
    let baseCount = 0;
    let totalCount = 0;

    detail.items.forEach((item: any) => {
      const baseAi = item.baseItem?.criteria_scores || item.base_item?.criteria_scores || item.baseItem?.ai_scores || item.base_item?.ai_scores || item.ai_base_scores || item.base_ai_scores || item.ai_scores;
      const ftAi = item.criteria_scores || item.ai_scores || item.ai_ft_scores || item.ft_ai_scores;
      const rawReviews = item.adjudication?.finalScores
        ? [
            { humanScores: item.adjudication.finalScores, targetModel: 'ft' },
            { humanScores: item.adjudication.finalScores, targetModel: 'base' }
          ]
        : (item.reviews || []);
      const reviewsToUse = filterReviewerId === 'all'
        ? rawReviews
        : rawReviews.filter((r: any) => extractReviewerId(r) === filterReviewerId);
      const breakdown = computeModelConflictBreakdown(reviewsToUse, ftAi, baseAi);
      const hasFt = breakdown.ft.maxDelta >= 1.5;
      const hasBase = breakdown.base.maxDelta >= 1.5;
      if (hasFt) ftCount++;
      if (hasBase) baseCount++;
      if (hasFt || hasBase) totalCount++;
    });

    return { ftConflicts: ftCount, baseConflicts: baseCount, totalConflicts: totalCount };
  }, [detail, filterReviewerId]);

  const visibleItems = useMemo(() => (detail?.items || []).filter((item: any) => {
    const baseAi = item.baseItem?.criteria_scores || item.base_item?.criteria_scores || item.baseItem?.ai_scores || item.base_item?.ai_scores || item.ai_base_scores || item.base_ai_scores || item.ai_scores;
    const ftAi = item.criteria_scores || item.ai_scores || item.ai_ft_scores || item.ft_ai_scores;
    const rawReviews = item.adjudication?.finalScores
      ? [
          { humanScores: item.adjudication.finalScores, targetModel: 'ft' },
          { humanScores: item.adjudication.finalScores, targetModel: 'base' }
        ]
      : (item.reviews || []);
    const reviewsToUse = filterReviewerId === 'all'
      ? rawReviews
      : rawReviews.filter((r: any) => extractReviewerId(r) === filterReviewerId);
    const breakdown = computeModelConflictBreakdown(reviewsToUse, ftAi, baseAi);
    const isFtConflict = breakdown.ft.maxDelta >= 1.5;
    const isBaseConflict = breakdown.base.maxDelta >= 1.5;
    const isAnyConflict = isFtConflict || isBaseConflict;

    if (filter === 'all') return true;
    if (filter === 'conflict') return isAnyConflict && item.inter_rater?.status !== 'resolved';
    if (filter === 'resolved') return item.inter_rater?.status === 'resolved';
    return !isAnyConflict && !item.adjudication;
  }), [detail, filter, filterReviewerId]);

  const toggleStaff = (id: string) => setSelectedStaffIds(previous => (
    previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
  ));

  const assign = async () => {
    if (!selectedEvalId || !selectedStaffIds.length || !selectedCheckerId) {
      toast.error('Chọn gói project, ít nhất một Staff và một Checker');
      return;
    }
    setAssigning(true);
    try {
      const result = await apiService.assignHumanAudit({
        model_eval_id: selectedEvalId,
        staff_ids: selectedStaffIds,
        checker_id: selectedCheckerId,
      });
      toast.success(`Đã giao gói ${result.projectName}: ${result.assignedItems} câu, ${result.assignedStaff} Staff, Checker ${result.checker?.name}`);
      setSelectedStaffIds([]);
      await Promise.all([loadOverview(), loadDetail(selectedEvalId)]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không giao được Human Audit');
    } finally {
      setAssigning(false);
    }
  };

  const openResolution = (item: any) => {
    setSelectedItem(item);
    setModalTargetFilter('ft');
    setActiveStaffId('');
    const unique = deduplicateReviews(item.reviews || []);
    const firstFt = unique.find((review: any) => (review.targetModel || review.target_model || 'ft') === 'ft');
    setResolution('accept_ai');
    setSelectedReviewId(firstFt?._id || '');
    setFinalScores(emptyAuditScores());
    setFinalReasons({});
    setResolutionNote('');
  };

  const currentIndex = selectedItem ? visibleItems.findIndex(item => item.conv_index === selectedItem.conv_index) : -1;
  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < visibleItems.length - 1) {
      openResolution(visibleItems[currentIndex + 1]);
    }
  };
  const handlePrev = () => {
    if (currentIndex > 0) {
      openResolution(visibleItems[currentIndex - 1]);
    }
  };

  const adjudicate = async () => {
    if (!selectedItem || !resolutionNote.trim()) {
      toast.error('Supervisor phải ghi lý do chốt');
      return;
    }
    if (resolution === 'accept_staff' && !selectedReviewId) {
      toast.error('Chọn một bản chấm Staff');
      return;
    }
    if (resolution === 'manual') {
      const missing = HUMAN_AUDIT_RUBRIC.filter(({ key }) => finalScores[key] === null);
      if (missing.length) {
        toast.error(`Chưa chấm: ${missing.map(item => item.key).join(', ')}`);
        return;
      }
      const missingReasons = HUMAN_AUDIT_RUBRIC.filter(({ key }) => [2, 3, 4].includes(Number(finalScores[key])) && !String(finalReasons[key] || '').trim());
      if (missingReasons.length) {
        toast.error(`Điểm 2–4 cần lý do: ${missingReasons.map(item => item.key).join(', ')}`);
        return;
      }
    }
    setSaving(true);
    
    let nextItem: any = null;
    if (currentIndex >= 0 && currentIndex < visibleItems.length - 1) {
      nextItem = visibleItems[currentIndex + 1];
    }
    
    try {
      await apiService.adjudicateHumanAudit(selectedEvalId, selectedItem.conv_index, {
        resolution,
        target_model: modalTargetFilter === 'all' ? 'ft' : modalTargetFilter,
        selected_review_id: resolution === 'accept_staff' ? selectedReviewId : undefined,
        final_scores: resolution === 'manual'
          ? Object.fromEntries(Object.entries(finalScores).map(([key, value]) => [key, Number(value)]))
          : undefined,
        final_reasons: resolution === 'manual' ? finalReasons : undefined,
        note: resolutionNote.trim(),
      });
      toast.success(`Đã chốt xung đột (${modalTargetFilter === 'base' ? 'Base Model' : 'Fine-tuned Model'})`);
      
      if (nextItem) {
        openResolution(nextItem);
      } else {
        setSelectedItem(null);
      }
      
      void loadOverview();
      loadDetail(selectedEvalId).then((newDetail: any) => {
        if (nextItem && newDetail?.items) {
          const freshNextItem = newDetail.items.find((i: any) => i.conv_index === nextItem.conv_index);
          if (freshNextItem) setSelectedItem(freshNextItem);
        }
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không chốt được xung đột');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ham-page">
      <header className="ham-hero">
        <div><span><ShieldCheck size={15} /> {isChecker ? 'CHECKER ADJUDICATION' : 'SUPERVISOR CONTROL'}</span><h1>{isChecker ? 'Xử lý Human Audit Conflict' : 'Quản lý Human Audit'}</h1><p>AI Judge và tất cả bản chấm Staff được đối chiếu đồng thời trong một hồ sơ conflict có lưu vết.</p></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới</button>
        </div>
      </header>

      <section className="ham-assignment-card">
        <div className="ham-field"><label>Gói audit theo project</label><select value={selectedEvalId} onChange={event => setSelectedEvalId(event.target.value)}><option value="">Chọn project...</option>{evaluations.map(item => <option value={item.modelEvalId} key={item.modelEvalId}>{item.packageLabel || `${item.projectName} · ${item.totalConversations} câu`}</option>)}</select><small>Mỗi project/evaluation là một gói riêng; 2 project × 100 câu sẽ tạo 2 gói 100 câu, không trộn chung.</small></div>
        {!isChecker && (
          <>
            <div className="ham-staff-picker"><label>Giao độc lập cho Staff</label><div>{staff.map(person => <button type="button" key={person.id} className={selectedStaffIds.includes(person.id) ? 'selected' : ''} onClick={() => toggleStaff(person.id)}><Users size={14} /><span>{person.name}<small>{person.email}</small></span>{selectedStaffIds.includes(person.id) && <CheckCircle2 size={14} />}</button>)}</div></div>
            <div className="ham-field"><label>Checker phụ trách gói</label><select value={selectedCheckerId} onChange={event => setSelectedCheckerId(event.target.value)}><option value="">Chọn Checker...</option>{checkers.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select><small>Chỉ Checker được giao mới xem và chốt conflict của gói này.</small></div>
            <button className="ham-assign" type="button" onClick={assign} disabled={assigning || !selectedStaffIds.length || !selectedCheckerId}>{assigning ? <RefreshCw className="spin" size={16} /> : <ClipboardCheck size={16} />} Giao gói project</button>
          </>
        )}
      </section>

      {selectedEvaluation && (
        <section className="ham-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <article><span>Staff được giao</span><strong>{selectedEvaluation.assignedStaff}</strong><small>{selectedEvaluation.assignedStaff >= 2 ? 'Có thể đo đồng thuận' : '1 Staff vẫn audit được'}</small></article>
          <article><span>Bản chấm đã nộp</span><strong>{selectedEvaluation.submittedReviews}</strong></article>
          <article className="danger" style={{ borderLeft: '4px solid #6366f1', background: '#f5f3ff' }}>
            <span style={{ color: '#4338ca', fontWeight: 700 }}>🎯 Xung đột Fine-tuned</span>
            <strong style={{ color: '#4338ca' }}>{conflictSummary.ftConflicts}</strong>
            <small style={{ color: '#6366f1' }}>Replay có Δ ≥ 1.5 ở FT</small>
          </article>
          <article className="danger" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
            <span style={{ color: '#b45309', fontWeight: 700 }}>🔲 Xung đột Base Model</span>
            <strong style={{ color: '#b45309' }}>{conflictSummary.baseConflicts}</strong>
            <small style={{ color: '#d97706' }}>Replay có Δ ≥ 1.5 ở Base</small>
          </article>
          <article className="success"><span>Checker phụ trách</span><strong className="ham-checker-name">{selectedEvaluation.checkerName || 'Chưa giao'}</strong></article>
        </section>
      )}

      <section className="ham-review-card">
        <header><div><h2>Đối chiếu theo từng replay trong gói project</h2><p>Một Staff vẫn tạo được Human Audit. Từ 2 Staff trở lên mới có thêm chỉ số đồng thuận (IAA); đây không phải điều kiện khóa.</p></div><div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}><div className="ham-filters">{(['all', 'conflict', 'resolved', 'pending'] as ManagerFilter[]).map(value => <button type="button" className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'Tất cả' : value === 'conflict' ? 'Xung đột' : value === 'resolved' ? 'Đã chốt' : 'Chờ chấm'}</button>)}</div>{reviewersInDetail.length >= 1 && (<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={14} style={{ color: '#6366f1', flexShrink: 0 }} /><select value={filterReviewerId} onChange={e => setFilterReviewerId(e.target.value)} style={{ fontSize: '0.82rem', padding: '4px 10px', borderRadius: '8px', border: '1px solid #c7d2fe', background: filterReviewerId !== 'all' ? '#eef2ff' : '#ffffff', color: filterReviewerId !== 'all' ? '#4338ca' : '#475569', fontWeight: filterReviewerId !== 'all' ? 700 : 400, cursor: 'pointer' }}><option value="all">Tất cả Staff</option>{reviewersInDetail.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>{filterReviewerId !== 'all' && (<span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>Đang lọc 1 Staff</span>)}</div>)}</div></header>
        <div className="ham-table-wrap">
          <table>
            <thead>
              <tr><th>Replay</th><th>Số bản chấm</th><th>Chênh lệch lớn nhất</th><th>Tiêu chí xung đột</th><th>Trạng thái</th><th /></tr>
            </thead>
            <tbody>
              {loadingDetail ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px 0', color: '#6366f1', fontWeight: 600 }}>
                    <RefreshCw className="spin" size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Đang đối chiếu dữ liệu Human Audit...
                  </td>
                </tr>
              ) : (
                visibleItems.map((item: any) => {
                  const allUniqueReviews = deduplicateReviews(item.reviews || []);
                  const uniqueReviews = filterReviewerId === 'all'
                    ? allUniqueReviews
                    : allUniqueReviews.filter((r: any) => extractReviewerId(r) === filterReviewerId);
                  const baseAi = item.baseItem?.criteria_scores || item.base_item?.criteria_scores || item.baseItem?.ai_scores || item.base_item?.ai_scores || item.ai_base_scores || item.base_ai_scores || item.ai_scores;
                  const ftAi = item.criteria_scores || item.ai_scores || item.ai_ft_scores || item.ft_ai_scores;
                  const rawReviews = item.adjudication?.finalScores
                    ? [
                        { humanScores: item.adjudication.finalScores, targetModel: 'ft' },
                        { humanScores: item.adjudication.finalScores, targetModel: 'base' }
                      ]
                    : (item.reviews || []);
                  const reviewsToUse = filterReviewerId === 'all'
                    ? rawReviews
                    : rawReviews.filter((r: any) => extractReviewerId(r) === filterReviewerId);
                  const breakdown = computeModelConflictBreakdown(reviewsToUse, ftAi, baseAi);
                  const ftCount = breakdown.ft.count;
                  const baseCount = breakdown.base.count;

                  return (
                    <tr key={item.conv_index}>
                      <td><strong>{item.item_id || `Conv ${item.conv_index}`}</strong><small>{item.question}</small></td>
                      <td>
                        <strong>{uniqueReviews.length}</strong>
                        {Boolean(uniqueReviews.length) && (
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, marginTop: '2px' }}>
                            {ftCount > 0 && <span style={{ color: '#4f46e5', marginRight: '4px' }}>{ftCount} FT</span>}
                            {baseCount > 0 && <span style={{ color: '#b45309' }}>{baseCount} Base</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8rem' }}>
                          {ftCount > 0 && (
                            <span style={{ color: breakdown.ft.maxDelta >= 2 ? '#dc2626' : breakdown.ft.maxDelta >= 1 ? '#d97706' : '#059669', fontWeight: 600 }}>
                              🎯 FT: Δ {breakdown.ft.maxDelta.toFixed(1)}
                            </span>
                          )}
                          {baseCount > 0 && (
                            <span style={{ color: breakdown.base.maxDelta >= 2 ? '#dc2626' : breakdown.base.maxDelta >= 1 ? '#d97706' : '#059669', fontWeight: 600 }}>
                              🔲 Base: Δ {breakdown.base.maxDelta.toFixed(1)}
                            </span>
                          )}
                          {!ftCount && !baseCount && <span>{(item.inter_rater.max_delta || 0).toFixed(1)}</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem' }}>
                          {ftCount > 0 && (
                            <span>🎯 FT: <b>{breakdown.ft.conflicts.join(', ') || 'Không'}</b></span>
                          )}
                          {baseCount > 0 && (
                            <span>🔲 Base: <b>{breakdown.base.conflicts.join(', ') || 'Không'}</b></span>
                          )}
                          {!ftCount && !baseCount && <span>{item.inter_rater.conflict_criteria.join(', ') || '—'}</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {item.inter_rater.status === 'resolved' ? (
                            <span className="ham-status resolved">Đã chốt</span>
                          ) : (
                            <>
                              {ftCount > 0 && (
                                <span className={`ham-status ${breakdown.ft.maxDelta >= 2 ? 'conflict' : 'agreement'}`} style={{ fontSize: '0.7rem' }}>
                                  🎯 FT: {breakdown.ft.maxDelta >= 2 ? 'Critical Conflict' : breakdown.ft.maxDelta >= 1 ? 'Minor Conflict' : 'Đồng thuận'}
                                </span>
                              )}
                              {baseCount > 0 && (
                                <span className={`ham-status ${breakdown.base.maxDelta >= 2 ? 'conflict' : 'agreement'}`} style={{ fontSize: '0.7rem', background: breakdown.base.maxDelta >= 2 ? '#fff7ed' : undefined, color: breakdown.base.maxDelta >= 2 ? '#c2410c' : undefined }}>
                                  🔲 Base: {breakdown.base.maxDelta >= 2 ? 'Critical Conflict' : breakdown.base.maxDelta >= 1 ? 'Minor Conflict' : 'Đồng thuận'}
                                </span>
                              )}
                              {!ftCount && !baseCount && (
                                <span className={`ham-status ${item.inter_rater.status} ${item.inter_rater.severity}`}>
                                  {item.inter_rater.status === 'conflict' ? `${item.inter_rater.severity} conflict` : 'Chưa có bản chấm'}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td><button type="button" onClick={() => openResolution(item)}><Scale size={14} /> Xem & xử lý</button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {!loadingDetail && !visibleItems.length && <div className="ham-empty">Chưa có replay phù hợp bộ lọc.</div>}
        </div>
      </section>

      {detail?.inter_rater_summary?.reviewer_count >= 2 && (
        <details className="ham-agreement-card">
          <summary><div><Users size={16} /><span>Độ đồng thuận giữa Staff</span></div><strong>{detail.inter_rater_summary.reviewer_count} người chấm · {detail.inter_rater_summary.reviewed_item_count} replay có điểm</strong></summary>
          <div><table><thead><tr><th>Tiêu chí</th><th>Số cặp điểm</th><th>Khớp tuyệt đối</th><th>Lệch ≤ 1</th><th>MAE</th><th>Weighted κ</th></tr></thead><tbody>{HUMAN_AUDIT_RUBRIC.map(({ key, title }) => { const metric = detail.inter_rater_summary.criteria?.[key] || {}; return <tr key={key}><td><b>{key}</b> · {title}</td><td>{metric.pair_count || 0}</td><td>{metric.exact_agreement_rate == null ? '—' : `${(metric.exact_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.within_one_agreement_rate == null ? '—' : `${(metric.within_one_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.mean_absolute_difference == null ? '—' : metric.mean_absolute_difference.toFixed(2)}</td><td>{metric.quadratic_weighted_kappa == null ? '—' : metric.quadratic_weighted_kappa.toFixed(3)}</td></tr>; })}</tbody></table><p>κ có hiệu chỉnh trùng hợp ngẫu nhiên; MAE là độ lệch điểm trung bình. Replay “Bỏ qua” không được tính.</p></div>
        </details>
      )}

      {selectedItem && (() => {
        const allUniqueReviews = deduplicateReviews(selectedItem.reviews || []);
        const ftReviews = allUniqueReviews.filter((r: any) => (r.targetModel || r.target_model || 'ft') === 'ft');
        const baseReviews = allUniqueReviews.filter((r: any) => (r.targetModel || r.target_model) === 'base');

        return (
          <div className="ham-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
            <section className="ham-modal">
              <header>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>UNIFIED ADJUDICATION · {selectedItem.item_id}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0e7ff', color: '#4338ca', fontSize: '0.72rem', fontWeight: 600 }}>
                      🎯 Fine-tuned: {detail?.evaluation?.ftModelRepo || selectedEvaluation?.ftModelRepo || 'FT Model'}
                    </span>
                    {Boolean(detail?.evaluation?.baseModelRepo || selectedEvaluation?.baseModelRepo) && (
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontSize: '0.72rem', fontWeight: 600 }}>
                        🔲 Base: {detail?.evaluation?.baseModelRepo || selectedEvaluation?.baseModelRepo}
                      </span>
                    )}
                  </div>
                  <h2>Đối chiếu AI Judge và tất cả Staff</h2>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button type="button" onClick={handlePrev} disabled={currentIndex <= 0} title="Replay trước" style={{ padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={18} />
                  </button>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                    {currentIndex + 1} / {visibleItems.length}
                  </span>
                  <button type="button" onClick={handleNext} disabled={currentIndex >= visibleItems.length - 1} title="Replay tiếp" style={{ padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronRight size={18} />
                  </button>
                  <div style={{ width: '1px', height: '24px', background: '#e2e8f0', margin: '0 4px' }} />
                  <button type="button" onClick={() => setSelectedItem(null)} title="Đóng">
                    <X size={18} />
                  </button>
                </div>
              </header>
              <div className="ham-replay">
                <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}><b>Học sinh:</b> {selectedItem.question}</p>
                <div style={{ display: 'grid', gridTemplateColumns: selectedItem.baseAnswer ? '1fr 1fr' : '1fr', gap: '12px', marginTop: '8px' }}>
                  <div style={{ background: 'rgba(99,102,241,0.06)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', display: 'block', marginBottom: '4px' }}>🎯 FINE-TUNED MODEL</span>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>{selectedItem.answer}</p>
                  </div>
                  {selectedItem.baseAnswer && (
                    <div style={{ background: 'rgba(245,158,11,0.06)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', display: 'block', marginBottom: '4px' }}>🔲 BASE MODEL</span>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>{selectedItem.baseAnswer}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: CRITERIA COMPARISON MATRIX (Hiển thị các điểm bị lệch nhau theo Model được chọn) */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#312e81', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        📊 BẢNG ĐỐI CHIẾU TIÊU CHÍ (AI JUDGE VS STAFFS)
                      </span>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                        Chọn mô hình muốn xem đối chiếu độ lệch điểm (Δ ≥ 1.5).
                      </small>
                    </div>

                    {/* Model Switcher for Comparison Matrix Table (Strict FT vs Base Mode) */}
                    <div style={{ display: 'flex', gap: '6px', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setModalTargetFilter('ft');
                          setResolution('accept_ai');
                          if (ftReviews[0]) setSelectedReviewId(ftReviews[0]._id);
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          border: 0,
                          background: modalTargetFilter === 'ft' ? '#4f46e5' : 'transparent',
                          color: modalTargetFilter === 'ft' ? '#ffffff' : '#475569',
                          cursor: 'pointer',
                          boxShadow: modalTargetFilter === 'ft' ? '0 2px 6px rgba(79,70,229,0.3)' : 'none',
                        }}
                      >
                        🎯 Fine-tuned ({ftReviews.length} Staff + AI)
                      </button>
                      {(baseReviews.length > 0 || Boolean(selectedItem?.baseItem || selectedItem?.base_item || selectedItem?.baseAnswer || detail?.evaluation?.baseModelRepo)) && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalTargetFilter('base');
                            setResolution(baseReviews[0] ? 'accept_staff' : 'accept_ai');
                            if (baseReviews[0]) setSelectedReviewId(baseReviews[0]._id);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            border: 0,
                            background: modalTargetFilter === 'base' ? '#b45309' : 'transparent',
                            color: modalTargetFilter === 'base' ? '#ffffff' : '#475569',
                            cursor: 'pointer',
                            boxShadow: modalTargetFilter === 'base' ? '0 2px 6px rgba(180,83,9,0.3)' : 'none',
                          }}
                        >
                          🔲 Base Model ({baseReviews.length} Staff + AI)
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const fullReviews = modalTargetFilter === 'base' ? baseReviews : ftReviews;
                    const isBaseMode = modalTargetFilter === 'base';

                    const getReviewMaxDelta = (r: any) => {
                      if (!r?.humanScores) return 0;
                      let maxD = 0;
                      HUMAN_AUDIT_RUBRIC.forEach(({ key }) => {
                        const aiVal = isBaseMode
                          ? (selectedItem.baseItem?.criteria_scores?.[key] ?? selectedItem.base_item?.criteria_scores?.[key] ?? selectedItem.baseItem?.ai_scores?.[key] ?? selectedItem.base_item?.ai_scores?.[key] ?? selectedItem.ai_base_scores?.[key] ?? selectedItem.base_ai_scores?.[key] ?? null)
                          : (selectedItem.criteria_scores?.[key] ?? selectedItem.ai_scores?.[key] ?? selectedItem.ai_ft_scores?.[key] ?? selectedItem.ft_ai_scores?.[key] ?? null);
                        const val = r.humanScores[key];
                        if (val != null && aiVal != null) {
                          const d = Math.abs(Number(val) - Number(aiVal));
                          if (d > maxD) maxD = d;
                        }
                      });
                      return maxD;
                    };

                    const sortedReviews = [...fullReviews].sort((a: any, b: any) => {
                      const deltaA = getReviewMaxDelta(a);
                      const deltaB = getReviewMaxDelta(b);
                      if (deltaB !== deltaA) return deltaB - deltaA; // Highest conflict first!
                      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                      return dateB - dateA; // Then newest first
                    });

                    const selectedStaffReview = sortedReviews.find((r: any) => r._id === activeStaffId) || sortedReviews[0];
                    const displayReviews = selectedStaffReview ? [selectedStaffReview] : [];

                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: '4px' }}>👤 Chọn Staff đối chiếu:</span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {sortedReviews.map((r: any) => {
                              const d = getReviewMaxDelta(r);
                              const isSelected = selectedStaffReview?._id === r._id;
                              const isConflict = d >= 1.5;
                              return (
                                <button
                                  key={r._id}
                                  type="button"
                                  onClick={() => {
                                    setActiveStaffId(r._id);
                                    setResolution('accept_staff');
                                    setSelectedReviewId(r._id);
                                  }}
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    border: isSelected ? '1px solid #6366f1' : '1px solid #cbd5e1',
                                    background: isSelected ? '#eef2ff' : '#ffffff',
                                    color: isSelected ? '#4338ca' : '#475569',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: isSelected ? '0 1px 3px rgba(99,102,241,0.2)' : 'none',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  {r.reviewerName}
                                  <span style={{ 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    background: isConflict ? '#fee2e2' : '#dcfce3', 
                                    color: isConflict ? '#b91c1c' : '#15803d',
                                    fontSize: '0.72rem',
                                    fontWeight: 800
                                  }}>
                                    Δ {d.toFixed(1)}
                                  </span>
                                </button>
                              );
                            })}
                            {!sortedReviews.length && (
                              <span style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                                Chưa có bản chấm Staff cho {isBaseMode ? 'Base Model' : 'Fine-tuned Model'} (hiển thị sẵn điểm AI Judge)
                              </span>
                            )}
                          </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                              <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Tiêu chí</th>
                              <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: isBaseMode ? '#fffbeb' : '#e0e7ff', color: isBaseMode ? '#b45309' : '#3730a3' }}>
                                🤖 AI Judge<br /><small style={{ fontWeight: 600 }}>({isBaseMode ? 'Base Model' : 'Fine-tuned'})</small>
                              </th>
                              {displayReviews.map((rev: any) => {
                                const isBase = (rev.targetModel || rev.target_model) === 'base';
                                return (
                                  <th
                                    key={rev._id}
                                    style={{
                                      padding: '10px 12px',
                                      textAlign: 'center',
                                      borderBottom: '1px solid #e2e8f0',
                                      background: isBase ? '#fffbeb' : '#f0fdf4',
                                      color: isBase ? '#b45309' : '#047857',
                                    }}
                                  >
                                    👤 {rev.reviewerName}<br />
                                    <small style={{ fontWeight: 600 }}>({isBase ? 'Base' : 'Fine-tuned'})</small>
                                  </th>
                                );
                              })}
                              <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', background: '#fff1f2', color: '#9f1239' }}>
                                Chênh lệch max (Δ)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {HUMAN_AUDIT_RUBRIC.map(({ key, title }) => {
                              const aiVal = isBaseMode
                                ? (selectedItem.baseItem?.criteria_scores?.[key] ?? selectedItem.base_item?.criteria_scores?.[key] ?? selectedItem.baseItem?.ai_scores?.[key] ?? selectedItem.base_item?.ai_scores?.[key] ?? selectedItem.ai_base_scores?.[key] ?? selectedItem.base_ai_scores?.[key] ?? null)
                                : (selectedItem.criteria_scores?.[key] ?? selectedItem.ai_scores?.[key] ?? selectedItem.ai_ft_scores?.[key] ?? selectedItem.ft_ai_scores?.[key] ?? null);
                              const revVals = displayReviews.map((r: any) => r.humanScores?.[key] ?? null);
                              const validVals = [aiVal, ...revVals].filter((v): v is number => typeof v === 'number');
                              const minV = validVals.length ? Math.min(...validVals) : 0;
                              const maxV = validVals.length ? Math.max(...validVals) : 0;
                              const delta = maxV - minV;
                              const hasConflict = delta >= 1.5;

                              return (
                                <tr key={key} style={{ borderBottom: '1px solid #f1f5f9', background: hasConflict ? '#fff5f5' : 'transparent' }}>
                                  <td style={{ padding: '9px 12px', fontWeight: 600, color: '#334155' }}>
                                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', fontSize: '0.75rem', marginRight: '6px' }}>{key}</span>
                                    {title}
                                  </td>
                                  <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: isBaseMode ? '#b45309' : '#3730a3' }}>
                                    {aiVal ?? '—'}
                                  </td>
                                  {displayReviews.map((rev: any) => {
                                    const val = rev.humanScores?.[key] ?? null;
                                    const isDiff = aiVal !== null && val !== null && Math.abs(val - aiVal) >= 1.5;
                                    return (
                                      <td
                                        key={rev._id}
                                        style={{
                                          padding: '9px 12px',
                                          textAlign: 'center',
                                          fontWeight: 700,
                                          color: isDiff ? '#be123c' : '#334155',
                                          background: isDiff ? '#ffe4e6' : 'transparent',
                                        }}
                                      >
                                        {val ?? '—'}
                                      </td>
                                    );
                                  })}
                                  <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: hasConflict ? '#be123c' : '#059669' }}>
                                    {delta > 0 ? `Δ ${delta.toFixed(1)}` : '0 (Khớp)'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                {/* SECTION: CANDIDATE SELECTION */}
                <div style={{ border: '1px solid #c7d2fe', borderRadius: '12px', background: '#f8fafc', padding: '16px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#312e81', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      ⚖️ CHỌN BẢN CHẤM CHÍNH THỨC ĐỂ CHỐT XUNG ĐỘT ({modalTargetFilter === 'base' ? 'BASE MODEL' : 'FINE-TUNED MODEL'})
                    </span>
                    <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>
                      Chọn điểm chính thức giữa AI Judge ({modalTargetFilter === 'base' ? 'Base Model' : 'Fine-tuned'}) và bản chấm của Staff.
                    </small>
                  </div>

                  <div className="ham-review-grid" style={{ padding: 0 }}>
                    {/* Candidate Option: AI Judge */}
                    <label className={resolution === 'accept_ai' ? 'selected' : ''}>
                      <input type="radio" name="adjudication_candidate" checked={resolution === 'accept_ai'} onChange={() => setResolution('accept_ai')} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <strong>AI Judge</strong>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: modalTargetFilter === 'base' ? '#fef3c7' : '#e0e7ff', color: modalTargetFilter === 'base' ? '#b45309' : '#4338ca' }}>
                            {modalTargetFilter === 'base' ? '🔲 Base Model' : '🎯 Fine-tuned'}
                          </span>
                        </div>
                        <small>Đề xuất tự động từ AI Judge · cần đối chiếu bằng chứng</small>
                        <div className="ham-score-strip" style={{ marginTop: '8px' }}>
                          {HUMAN_AUDIT_RUBRIC.map(({ key }) => {
                            const val = modalTargetFilter === 'base'
                              ? (selectedItem.baseItem?.criteria_scores?.[key] ?? selectedItem.base_item?.criteria_scores?.[key] ?? selectedItem.ai_base_scores?.[key] ?? selectedItem.base_ai_scores?.[key] ?? selectedItem.baseItem?.ai_scores?.[key] ?? selectedItem.ai_scores?.[key])
                              : (selectedItem.ai_scores?.[key] ?? selectedItem.ai_ft_scores?.[key]);
                            return <span key={key}>{key}<b>{val ?? '—'}</b></span>;
                          })}
                        </div>
                      </div>
                    </label>

                    {/* Candidate Options: Staff Review (1 Staff - Mới nhất) */}
                    {(() => {
                      const fullReviews = modalTargetFilter === 'base' ? baseReviews : ftReviews;
                      const sortedReviews = [...fullReviews].sort((a: any, b: any) => {
                        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                        return dateB - dateA;
                      });
                      return sortedReviews.map((review: any) => {
                        const isBase = (review.targetModel || review.target_model) === 'base';
                        return (
                          <label key={review._id} className={selectedReviewId === review._id && resolution === 'accept_staff' ? 'selected' : ''}>
                            <input
                              type="radio"
                              name="adjudication_candidate"
                              checked={selectedReviewId === review._id && resolution === 'accept_staff'}
                              onChange={() => { setResolution('accept_staff'); setSelectedReviewId(review._id); }}
                            />
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <strong>{review.reviewerName}</strong>
                                <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: isBase ? '#fef3c7' : '#e0e7ff', color: isBase ? '#b45309' : '#4338ca' }}>
                                  {isBase ? '🔲 Base Model' : '🎯 Fine-tuned'}
                                </span>
                              </div>
                              <small>{review.verdict === 'skip' ? 'Đã bỏ qua' : `K ${review.humanScores?.B1 || review.humanScores?.K || '—'} · A1 ${review.humanScores?.A1 || '—'} · S ${review.humanOutcomes?.socratic_s || review.humanScores?.S || '—'}`}</small>
                              <p>{review.note || 'Không có nhận xét tổng quát.'}</p>
                              {review.humanScores && <div className="ham-score-strip">{HUMAN_AUDIT_RUBRIC.map(({ key }) => <span key={key}>{key}<b>{review.humanScores[key]}</b></span>)}</div>}
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              <div className="ham-resolution-tabs">
                <button type="button" className={resolution === 'accept_ai' ? 'active' : ''} onClick={() => setResolution('accept_ai')}>Chọn AI Judge</button>
                <button type="button" className={resolution === 'accept_staff' ? 'active' : ''} onClick={() => setResolution('accept_staff')}>Chọn bản Staff</button>
                <button type="button" className={resolution === 'manual' ? 'active' : ''} onClick={() => setResolution('manual')}>{isChecker ? 'Checker chấm lại' : 'Chấm lại thủ công'}</button>
              </div>

              {resolution === 'manual' && (
                <div className="ham-manual-grid">
                  {HUMAN_AUDIT_RUBRIC.map(criterion => {
                    const value = finalScores[criterion.key];
                    const intermediate = [2, 3, 4].includes(Number(value));
                    return (
                      <article key={criterion.key}>
                        <header><b>{criterion.key}</b><span>{criterion.title}</span></header>
                        <div>{[0,1,2,3,4,5].map(score => <button type="button" className={value === score ? 'active' : ''} key={score} onClick={() => setFinalScores(previous => ({ ...previous, [criterion.key]: score }))}>{score}</button>)}</div>
                        {value !== null && <small>{SCORE_ANCHORS[Number(value)]}</small>}
                        <input value={finalReasons[criterion.key] || ''} onChange={event => setFinalReasons(previous => ({ ...previous, [criterion.key]: event.target.value }))} placeholder={intermediate ? 'Bắt buộc nêu lý do điểm trung gian' : 'Bằng chứng/lý do'} />
                      </article>
                    );
                  })}
                </div>
              )}

              <label className="ham-note">
                Lý do chốt kết quả
                <textarea value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} placeholder="Nêu bằng chứng và lý do chọn AI, một bản Staff hoặc chấm lại..." />
              </label>
              <footer>
                <div><AlertTriangle size={15} /> Quyết định mới tạo canonical; không xóa bản chấm gốc.</div>
                <button type="button" onClick={adjudicate} disabled={saving}>{saving ? <RefreshCw className="spin" size={15} /> : <Scale size={15} />} Chốt kết quả</button>
              </footer>
            </section>
          </div>
        );
      })()}
    </div>
  );
}
