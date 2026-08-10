import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [evaluationRows, staffRows, checkerRows] = await Promise.all([
        apiService.getManagedHumanAudits(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditStaff(),
        isChecker ? Promise.resolve([]) : apiService.getHumanAuditCheckers(),
      ]);
      setEvaluations(Array.isArray(evaluationRows) ? evaluationRows : []);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
      setCheckers(Array.isArray(checkerRows) ? checkerRows : []);
      if (!selectedEvalId && evaluationRows?.[0]?.modelEvalId) setSelectedEvalId(evaluationRows[0].modelEvalId);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không tải được Human Audit Manager');
    } finally {
      setLoading(false);
    }
  }, [selectedEvalId, isChecker]);

  const loadDetail = useCallback(async (evalId: string) => {
    if (!evalId) return;
    try {
      setDetail(await apiService.getManagedHumanAuditDetail(evalId));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không tải được chi tiết Human Audit');
    }
  }, []);

  useEffect(() => { void loadOverview(); }, []);
  useEffect(() => { if (selectedEvalId) void loadDetail(selectedEvalId); }, [selectedEvalId, loadDetail]);

  const selectedEvaluation = evaluations.find(item => item.modelEvalId === selectedEvalId);
  useEffect(() => {
    setSelectedCheckerId(selectedEvaluation?.checkerId || '');
  }, [selectedEvalId, selectedEvaluation?.checkerId]);
  const visibleItems = useMemo(() => (detail?.items || []).filter((item: any) => {
    if (filter === 'all') return true;
    if (filter === 'conflict') return item.inter_rater?.status === 'conflict';
    if (filter === 'resolved') return item.inter_rater?.status === 'resolved';
    return ['insufficient', 'agreement'].includes(item.inter_rater?.status) && !item.adjudication;
  }), [detail, filter]);

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
    const firstReview = item.reviews?.find((review: any) => review.verdict === 'reviewed');
    setResolution('accept_ai');
    setSelectedReviewId(firstReview?._id || '');
    setFinalScores(emptyAuditScores());
    setFinalReasons({});
    setResolutionNote('');
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
    try {
      await apiService.adjudicateHumanAudit(selectedEvalId, selectedItem.conv_index, {
        resolution,
        selected_review_id: resolution === 'accept_staff' ? selectedReviewId : undefined,
        final_scores: resolution === 'manual'
          ? Object.fromEntries(Object.entries(finalScores).map(([key, value]) => [key, Number(value)]))
          : undefined,
        final_reasons: resolution === 'manual' ? finalReasons : undefined,
        note: resolutionNote.trim(),
      });
      toast.success('Đã chốt xung đột; bản chấm Staff vẫn được giữ nguyên');
      setSelectedItem(null);
      await Promise.all([loadOverview(), loadDetail(selectedEvalId)]);
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
        <button type="button" onClick={() => void loadOverview()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới</button>
      </header>

      {!isChecker && <section className="ham-assignment-card">
        <div className="ham-field"><label>Gói audit theo project</label><select value={selectedEvalId} onChange={event => setSelectedEvalId(event.target.value)}><option value="">Chọn project...</option>{evaluations.map(item => <option value={item.modelEvalId} key={item.modelEvalId}>{item.packageLabel || `${item.projectName} · ${item.totalConversations} câu`}</option>)}</select><small>Mỗi project/evaluation là một gói riêng; 2 project × 100 câu sẽ tạo 2 gói 100 câu, không trộn chung.</small></div>
        <div className="ham-staff-picker"><label>Giao độc lập cho Staff</label><div>{staff.map(person => <button type="button" key={person.id} className={selectedStaffIds.includes(person.id) ? 'selected' : ''} onClick={() => toggleStaff(person.id)}><Users size={14} /><span>{person.name}<small>{person.email}</small></span>{selectedStaffIds.includes(person.id) && <CheckCircle2 size={14} />}</button>)}</div></div>
        <div className="ham-field"><label>Checker phụ trách gói</label><select value={selectedCheckerId} onChange={event => setSelectedCheckerId(event.target.value)}><option value="">Chọn Checker...</option>{checkers.map(person => <option key={person.id} value={person.id}>{person.name || person.email}</option>)}</select><small>Chỉ Checker được giao mới xem và chốt conflict của gói này.</small></div>
        <button className="ham-assign" type="button" onClick={assign} disabled={assigning || !selectedStaffIds.length || !selectedCheckerId}>{assigning ? <RefreshCw className="spin" size={16} /> : <ClipboardCheck size={16} />} Giao gói project</button>
      </section>}

      {selectedEvaluation && (
        <section className="ham-summary-grid">
          <article><span>Staff được giao</span><strong>{selectedEvaluation.assignedStaff}</strong><small>{selectedEvaluation.assignedStaff >= 2 ? 'Có thể đo đồng thuận' : '1 Staff vẫn audit được; chưa tính IAA'}</small></article>
          <article><span>Bản chấm đã nộp</span><strong>{selectedEvaluation.submittedReviews}</strong></article>
          <article className="danger"><span>Replay xung đột</span><strong>{selectedEvaluation.conflictItems}</strong></article>
          <article className="success"><span>Checker phụ trách</span><strong className="ham-checker-name">{selectedEvaluation.checkerName || 'Chưa giao'}</strong></article>
        </section>
      )}

      <section className="ham-review-card">
        <header><div><h2>Đối chiếu theo từng replay trong gói project</h2><p>Một Staff vẫn tạo được Human Audit. Từ 2 Staff trở lên mới có thêm chỉ số đồng thuận (IAA); đây không phải điều kiện khóa.</p></div><div className="ham-filters">{(['all', 'conflict', 'resolved', 'pending'] as ManagerFilter[]).map(value => <button type="button" className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'Tất cả' : value === 'conflict' ? 'Xung đột' : value === 'resolved' ? 'Đã chốt' : 'Chờ chấm'}</button>)}</div></header>
        <div className="ham-table-wrap"><table><thead><tr><th>Replay</th><th>Số bản chấm</th><th>Chênh lệch lớn nhất</th><th>Tiêu chí xung đột</th><th>Trạng thái</th><th /></tr></thead><tbody>{visibleItems.map((item: any) => {
          const ftCount = (item.reviews || []).filter((r: any) => (r.targetModel || r.target_model || 'ft') === 'ft').length;
          const baseCount = (item.reviews || []).filter((r: any) => (r.targetModel || r.target_model) === 'base').length;
          return (
            <tr key={item.conv_index}>
              <td><strong>{item.item_id || `Conv ${item.conv_index}`}</strong><small>{item.question}</small></td>
              <td>
                <strong>{item.inter_rater.reviewer_count}</strong>
                {Boolean(item.reviews?.length) && (
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, marginTop: '2px' }}>
                    {ftCount > 0 && <span style={{ color: '#4f46e5', marginRight: '4px' }}>{ftCount} FT</span>}
                    {baseCount > 0 && <span style={{ color: '#b45309' }}>{baseCount} Base</span>}
                  </div>
                )}
              </td>
              <td>{item.inter_rater.max_delta.toFixed(1)}</td>
              <td>{item.inter_rater.conflict_criteria.join(', ') || '—'}</td>
              <td><span className={`ham-status ${item.inter_rater.status} ${item.inter_rater.severity}`}>{item.inter_rater.status === 'resolved' ? 'Đã chốt' : item.inter_rater.status === 'conflict' ? `${item.inter_rater.severity} conflict` : item.inter_rater.status === 'agreement' ? 'Đồng thuận ≥2 Staff' : item.inter_rater.reviewer_count === 1 ? 'Đã có bản chấm · IAA không áp dụng' : 'Chưa có bản chấm'}</span></td>
              <td><button type="button" onClick={() => openResolution(item)} disabled={!item.reviews?.length}><Scale size={14} /> Xem & xử lý</button></td>
            </tr>
          );
        })}</tbody></table>{!visibleItems.length && <div className="ham-empty">Chưa có replay phù hợp bộ lọc.</div>}</div>
      </section>

      {detail?.inter_rater_summary?.reviewer_count >= 2 && (
        <details className="ham-agreement-card">
          <summary><div><Users size={16} /><span>Độ đồng thuận giữa Staff</span></div><strong>{detail.inter_rater_summary.reviewer_count} người chấm · {detail.inter_rater_summary.reviewed_item_count} replay có điểm</strong></summary>
          <div><table><thead><tr><th>Tiêu chí</th><th>Số cặp điểm</th><th>Khớp tuyệt đối</th><th>Lệch ≤ 1</th><th>MAE</th><th>Weighted κ</th></tr></thead><tbody>{HUMAN_AUDIT_RUBRIC.map(({ key, title }) => { const metric = detail.inter_rater_summary.criteria?.[key] || {}; return <tr key={key}><td><b>{key}</b> · {title}</td><td>{metric.pair_count || 0}</td><td>{metric.exact_agreement_rate == null ? '—' : `${(metric.exact_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.within_one_agreement_rate == null ? '—' : `${(metric.within_one_agreement_rate * 100).toFixed(1)}%`}</td><td>{metric.mean_absolute_difference == null ? '—' : metric.mean_absolute_difference.toFixed(2)}</td><td>{metric.quadratic_weighted_kappa == null ? '—' : metric.quadratic_weighted_kappa.toFixed(3)}</td></tr>; })}</tbody></table><p>κ có hiệu chỉnh trùng hợp ngẫu nhiên; MAE là độ lệch điểm trung bình. Replay “Bỏ qua” không được tính.</p></div>
        </details>
      )}

      {selectedItem && (
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
              <button type="button" onClick={() => setSelectedItem(null)}><X size={18} /></button>
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
            <div className="ham-review-grid">
              <label className={resolution === 'accept_ai' ? 'selected' : ''}><input type="radio" checked={resolution === 'accept_ai'} onChange={() => setResolution('accept_ai')} /><div><strong>AI Judge</strong><small>Đề xuất tự động · cần đối chiếu bằng chứng</small><div className="ham-score-strip">{HUMAN_AUDIT_RUBRIC.map(({ key }) => <span key={key}>{key}<b>{selectedItem.ai_scores?.[key] ?? '—'}</b></span>)}</div></div></label>
              {selectedItem.reviews.map((review: any) => {
                const targetLabel = (review.targetModel === 'base' || review.target_model === 'base') ? '🔲 Base Model' : '🎯 Fine-tuned';
                const isBase = review.targetModel === 'base' || review.target_model === 'base';
                return (
                  <label key={review._id} className={selectedReviewId === review._id && resolution === 'accept_staff' ? 'selected' : ''}>
                    <input type="radio" checked={selectedReviewId === review._id && resolution === 'accept_staff'} onChange={() => { setResolution('accept_staff'); setSelectedReviewId(review._id); }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong>{review.reviewerName}</strong>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: isBase ? '#fef3c7' : '#e0e7ff', color: isBase ? '#b45309' : '#4338ca' }}>{targetLabel}</span>
                      </div>
                      <small>{review.verdict === 'skip' ? 'Đã bỏ qua' : `K ${review.humanScores?.B1} · A1 ${review.humanScores?.A1} · S ${review.humanOutcomes?.socratic_s}`}</small>
                      <p>{review.note || 'Không có nhận xét tổng quát.'}</p>
                      {review.humanScores && <div className="ham-score-strip">{HUMAN_AUDIT_RUBRIC.map(({ key }) => <span key={key}>{key}<b>{review.humanScores[key]}</b></span>)}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="ham-resolution-tabs"><button type="button" className={resolution === 'accept_ai' ? 'active' : ''} onClick={() => setResolution('accept_ai')}>Chọn AI Judge</button><button type="button" className={resolution === 'accept_staff' ? 'active' : ''} onClick={() => setResolution('accept_staff')}>Chọn bản Staff</button><button type="button" className={resolution === 'manual' ? 'active' : ''} onClick={() => setResolution('manual')}>{isChecker ? 'Checker chấm lại' : 'Chấm lại thủ công'}</button></div>
            {resolution === 'manual' && <div className="ham-manual-grid">{HUMAN_AUDIT_RUBRIC.map(criterion => { const value = finalScores[criterion.key]; const intermediate = [2, 3, 4].includes(Number(value)); return <article key={criterion.key}><header><b>{criterion.key}</b><span>{criterion.title}</span></header><div>{[0,1,2,3,4,5].map(score => <button type="button" className={value === score ? 'active' : ''} key={score} onClick={() => setFinalScores(previous => ({ ...previous, [criterion.key]: score }))}>{score}</button>)}</div>{value !== null && <small>{SCORE_ANCHORS[Number(value)]}</small>}<input value={finalReasons[criterion.key] || ''} onChange={event => setFinalReasons(previous => ({ ...previous, [criterion.key]: event.target.value }))} placeholder={intermediate ? 'Bắt buộc nêu lý do điểm trung gian' : 'Bằng chứng/lý do'} /></article>; })}</div>}
            <label className="ham-note">Lý do chốt kết quả<textarea value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} placeholder="Nêu bằng chứng và lý do chọn AI, một bản Staff hoặc chấm lại..." /></label>
            <footer><div><AlertTriangle size={15} /> Quyết định mới tạo canonical; không xóa bản chấm gốc.</div><button type="button" onClick={adjudicate} disabled={saving}>{saving ? <RefreshCw className="spin" size={15} /> : <Scale size={15} />} Chốt kết quả</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
