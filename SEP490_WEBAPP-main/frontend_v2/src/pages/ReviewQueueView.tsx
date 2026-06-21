import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Search, RefreshCw, ClipboardCheck, Eye, Award, Filter } from 'lucide-react';
import { api } from '../services/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: '⏳ Chờ duyệt', color: '#92400e', bg: '#fef3c7' },
  approved: { label: '✅ Đã duyệt', color: '#166534', bg: '#dcfce7' },
  rejected: { label: '🔴 Bị từ chối', color: '#b91c1c', bg: '#fee2e2' },
};

function labelSummary(label: any): string {
  if (!label || typeof label !== 'object') return '—';
  const parts: string[] = [];
  if (label.subject) parts.push(`Môn: ${label.subject}`);
  if (label.completion) parts.push(`Hoàn thành: ${label.completion}`);
  if (label.quality) parts.push(`Chất lượng: ${label.quality}`);
  if (Array.isArray(label.flags) && label.flags.length) parts.push(`Cờ: ${label.flags.join(', ')}`);
  return parts.length ? parts.join(' · ') : '—';
}

export default function ReviewQueueView() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('submitted');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/dataprep/projects');
        const list = res.data?.projects || [];
        setProjects(list);
        if (list.length && !projectId) setProjectId(String(list[0]._id));
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!projectId) { setRows([]); return; }
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await api.get('/dataprep/assignments/review-queue', { params: { projectId, status, q } });
      if (res.data.success) setRows(res.data.data || []);
    } catch (e) { console.error('review-queue error', e); }
    setLoading(false);
  }, [projectId, status, q]);

  useEffect(() => { fetchQueue(); }, [projectId, status]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const toggleOne = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.assignmentId)));
  };

  const doReview = async (assignmentIds: string[], action: 'approve' | 'reject') => {
    if (!assignmentIds.length) return;
    let reason = '';
    if (action === 'reject') {
      reason = window.prompt('Lý do từ chối (sẽ hiển thị cho nhân viên):', '') || '';
      if (!reason.trim()) return;
    }
    try {
      const res = await api.post('/dataprep/assignments/samples/review', { assignmentIds, action, reason });
      flash(res.data?.message || 'Đã cập nhật.');
      fetchQueue();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Thao tác thất bại.');
    }
  };

  const setCanonical = async (row: any) => {
    try {
      const labels = row.label?.subject ? [row.label.subject] : [];
      await api.post('/dataprep/assignments/samples/canonical', {
        versionId: row.versionId,
        sampleId: row.sampleId,
        labels,
        targetTextSnapshot: JSON.stringify(row.label || {}),
        sourceAnnotatorIds: [row.assigneeId],
      });
      flash('Đã chốt nhãn chuẩn cho câu #' + row.sampleIndex);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Chốt nhãn chuẩn thất bại.');
    }
  };

  // Gom theo sampleIndex để nhận biết câu overlap (nhiều người cùng gán)
  const overlapCount: Record<number, number> = {};
  rows.forEach(r => { overlapCount[r.sampleIndex] = (overlapCount[r.sampleIndex] || 0) + 1; });

  const selectedIds = Array.from(selected);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <ClipboardCheck size={22} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a' }}>Hàng đợi duyệt</h2>
          <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 14 }}>Xem, so sánh và phê duyệt nhãn nhân viên nộp lên (lẻ hoặc hàng loạt).</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={15} style={{ color: '#94a3b8' }} />
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={selStyle}>
            <option value="">— Chọn Project —</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selStyle}>
          <option value="submitted">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Bị từ chối</option>
          <option value="all">Tất cả</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
          <Search size={15} style={{ color: '#94a3b8' }} />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchQueue()} placeholder="Tìm nội dung / nhân viên... (Enter)" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14 }} />
        </div>
        <button onClick={fetchQueue} style={btnGhost}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Làm mới</button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, marginBottom: 12 }}>
          <strong style={{ color: '#4338ca' }}>Đã chọn {selectedIds.length} câu</strong>
          <div style={{ flex: 1 }} />
          <button onClick={() => doReview(selectedIds, 'approve')} style={btnApprove}><CheckCircle size={16} /> Duyệt hàng loạt</button>
          <button onClick={() => doReview(selectedIds, 'reject')} style={btnReject}><XCircle size={16} /> Từ chối hàng loạt</button>
        </div>
      )}

      {/* Table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
              <th style={th}><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
              <th style={th}>#</th>
              <th style={th}>Nội dung</th>
              <th style={th}>Nhân viên</th>
              <th style={th}>Nhãn</th>
              <th style={th}>Trạng thái</th>
              <th style={{ ...th, textAlign: 'right' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!projectId && (
              <tr><td colSpan={7} style={empty}>Hãy chọn một Project để xem hàng đợi.</td></tr>
            )}
            {projectId && !loading && rows.length === 0 && (
              <tr><td colSpan={7} style={empty}>Không có câu nào ở trạng thái này.</td></tr>
            )}
            {loading && (
              <tr><td colSpan={7} style={empty}><RefreshCw size={18} className="animate-spin" style={{ display: 'inline' }} /> Đang tải...</td></tr>
            )}
            {rows.map(r => {
              const meta = STATUS_META[r.reviewStatus] || STATUS_META.submitted;
              const isOverlap = overlapCount[r.sampleIndex] > 1;
              return (
                <tr key={r.assignmentId} style={{ borderTop: '1px solid #eef2f7' }}>
                  <td style={td}><input type="checkbox" checked={selected.has(r.assignmentId)} onChange={() => toggleOne(r.assignmentId)} /></td>
                  <td style={{ ...td, fontWeight: 600, color: '#6366f1' }}>
                    #{r.sampleIndex}
                    {isOverlap && <span title="Câu overlap — nhiều người cùng gán" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '1px 5px', borderRadius: 5 }}>overlap</span>}
                  </td>
                  <td style={{ ...td, maxWidth: 360, color: '#334155' }}><div style={ellipsis}>{r.preview}</div></td>
                  <td style={{ ...td, color: '#475569' }}>{r.assigneeName}</td>
                  <td style={{ ...td, color: '#475569', maxWidth: 280 }}><div style={ellipsis}>{labelSummary(r.label)}</div>{r.reviewStatus === 'rejected' && r.rejectReason && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>↳ {r.rejectReason}</div>}</td>
                  <td style={td}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg }}>{meta.label}</span></td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.reviewStatus !== 'approved' && (
                      <button onClick={() => doReview([r.assignmentId], 'approve')} style={iconBtn('#16a34a')} title="Duyệt"><CheckCircle size={16} /></button>
                    )}
                    {r.reviewStatus !== 'rejected' && (
                      <button onClick={() => doReview([r.assignmentId], 'reject')} style={iconBtn('#dc2626')} title="Từ chối"><XCircle size={16} /></button>
                    )}
                    <button onClick={() => setCanonical(r)} style={iconBtn('#7c3aed')} title="Chốt nhãn chuẩn (Canonical)"><Award size={16} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' };
const btnApprove: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const btnReject: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #fecaca', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer' };
const th: React.CSSProperties = { padding: '12px 14px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top' };
const empty: React.CSSProperties = { padding: '40px', textAlign: 'center', color: '#94a3b8' };
const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any };
const iconBtn = (color: string): React.CSSProperties => ({ background: 'none', border: 'none', cursor: 'pointer', color, padding: 5, marginLeft: 2 });
