import React, { useState, useEffect } from 'react';
import { X, Eye, BookOpen, MessageSquare, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

interface SplitViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sampleId: string;
  staffId?: string;
  staffName?: string;
}

interface MsgLabel { name: string; type: string; role: string; pedagogy_note?: string; }
interface SplitViewData {
  original: { messages: Array<{ role: string; content: string }> };
  labeled: {
    sampleMeta?: { subject?: string; completion?: string; quality?: string; flags?: string[]; note?: string };
    sampleLabels: Array<{ name: string; type: string }>;
    messageLabels: Record<number, MsgLabel[]>;
    rewrites: Record<number, { originalText: string; proposedText: string; approvedText: string; editReason: string; editType: string }>;
  };
}

function parseLabel(name: string) {
  const warnFlag = name.includes('⚠️');
  const base = name.replace('⚠️', '').trim();
  const match = base.match(/^(.+?)\s*\((\d+)%\)\s*$/);
  if (match) return { label: match[1].trim(), conf: parseInt(match[2], 10), warn: warnFlag };
  return { label: base, conf: null as number | null, warn: warnFlag };
}

function ConfBadge({ conf, warn }: { conf: number | null; warn: boolean }) {
  if (conf === null && !warn) return null;
  const color = warn ? '#dc2626' : conf !== null && conf >= 70 ? '#059669' : conf !== null && conf >= 50 ? '#d97706' : '#6b7280';
  const bg = warn ? '#fee2e2' : conf !== null && conf >= 70 ? '#dcfce7' : conf !== null && conf >= 50 ? '#fef3c7' : '#f3f4f6';
  return (
    <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: bg, color, border: '1px solid ' + color + '33', marginLeft: 4 }}>
      {warn ? '⚠️' : conf + '%'}
    </span>
  );
}

function IntentBadge({ lbl }: { lbl: MsgLabel }) {
  const { label, conf, warn } = parseLabel(lbl.name);
  const isUser = lbl.role === 'user';
  const bg = warn ? '#fee2e2' : isUser ? '#eff6ff' : '#f0fdf4';
  const color = warn ? '#991b1b' : isUser ? '#1d4ed8' : '#166534';
  const border = warn ? '#fca5a5' : isUser ? '#bfdbfe' : '#bbf7d0';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', marginBottom: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: bg, color, border: '1px solid ' + border }}>
        <span style={{ fontSize: 9, opacity: 0.7 }}>{isUser ? 'INTENT' : 'ACTION'}</span>
        <span>{label}</span>
        <ConfBadge conf={conf} warn={warn} />
      </div>
      {lbl.pedagogy_note && (
        <div style={{ marginTop: 3, fontSize: 11, color: '#b91c1c', fontStyle: 'italic', paddingLeft: 4 }}>
          💡 {lbl.pedagogy_note}
        </div>
      )}
    </div>
  );
}

export default function SplitViewModal({ isOpen, onClose, sampleId, staffId, staffName }: SplitViewModalProps) {
  const [data, setData] = useState<SplitViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && sampleId) fetchSplitView();
  }, [isOpen, sampleId, staffId]);

  const fetchSplitView = async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const params: any = {};
      if (staffId) params.staffId = staffId;
      const res = await api.get('/dataprep/assignments/manager/sample/' + sampleId + '/split-view', { params });
      if (res.data.success) setData(res.data.data);
      else setError(res.data.error || 'Không thể tải dữ liệu');
    } catch (e: any) { setError(e.response?.data?.error || e.message || 'Lỗi kết nối'); }
    setLoading(false);
  };

  if (!isOpen) return null;

  const messages = data?.original?.messages || [];
  const labeled = data?.labeled;
  const sampleMeta = labeled?.sampleMeta || {};
  const sampleLabels = labeled?.sampleLabels || [];
  const messageLabels = labeled?.messageLabels || {};
  const rewrites = labeled?.rewrites || {};

  const convMeta: Record<string, any> = { ...sampleMeta };
  sampleLabels.forEach(lbl => {
    lbl.name.split('·').map((p: string) => p.trim()).forEach((part: string) => {
      if (part.startsWith('Chất lượng:')) convMeta.quality = part.replace('Chất lượng:', '').trim();
      else if (part.startsWith('Hoàn thành:')) convMeta.completion = part.replace('Hoàn thành:', '').trim();
      else if (part && !convMeta.subject) convMeta.subject = part;
    });
  });

  const qualityColor: Record<string, any> = {
    Gold: { bg: '#dcfce7', color: '#166534', border: '#a7f3d0' },
    Rewrite: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    Bad: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
    Good: { bg: '#dcfce7', color: '#166534', border: '#a7f3d0' },
    Medium: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    Poor: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  };
  const completionColor: Record<string, any> = {
    Completed: { bg: '#dcfce7', color: '#166534', border: '#a7f3d0' },
    Incomplete: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
    Abandoned: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  };

  const hasConversationLabels = Boolean(convMeta.subject || convMeta.quality || convMeta.completion || (Array.isArray(convMeta.flags) && convMeta.flags.length) || convMeta.note);
  const hasAnyLabels = hasConversationLabels || sampleLabels.length > 0 || Object.keys(messageLabels).length > 0;
  const totalWarnings = Object.values(messageLabels).flat().filter((l: any) => l.name.includes('⚠️')).length;

  const spinStyle = `@keyframes sv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .sv-spinning { animation: sv-spin 1s linear infinite; }`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <style>{spinStyle}</style>
      <div style={{ background: '#fff', borderRadius: 16, width: '92vw', maxWidth: 1200, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,#6366f1 0%,#4f46e5 100%)', borderRadius: '16px 16px 0 0' }}>
          <Eye size={20} color="#fff" />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', flex: 1 }}>Split-View — So sánh & Kiểm duyệt nhãn</span>
          {staffName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: 99, fontSize: 13, color: '#fff', fontWeight: 600 }}>
              👤 {staffName}
            </span>
          )}
          <button onClick={fetchSplitView} disabled={loading} className={loading ? 'sv-spinning' : ''} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fff' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 48, color: '#6366f1' }}>
              <div className="sv-spinning" style={{ display: 'inline-block', marginBottom: 12 }}><RefreshCw size={28} /></div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Đang tải dữ liệu nhãn...</div>
            </div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {data && (
            <>
              {/* Conversation-level summary bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <BookOpen size={15} color="#6366f1" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', marginRight: 4 }}>Nhãn Conversation:</span>
                {!hasAnyLabels && <span style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Chưa có nhãn nào được gán</span>}
                {convMeta.subject && (
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}>📚 {convMeta.subject}</span>
                )}
                {convMeta.quality && (() => { const s = qualityColor[convMeta.quality] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }; return (
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, border: '1px solid ' + s.border }}>⭐ {convMeta.quality}</span>
                ); })()}
                {convMeta.completion && (() => { const s = completionColor[convMeta.completion] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }; return (
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, border: '1px solid ' + s.border }}>✅ {convMeta.completion}</span>
                ); })()}
                {Array.isArray(convMeta.flags) && convMeta.flags.map((flag: string) => (
                  <span key={flag} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>Flag: {flag}</span>
                ))}
                {convMeta.note && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>Note: {convMeta.note}</span>
                )}
                {totalWarnings > 0 && (
                  <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={11} /> {totalWarnings} vi phạm Socratic
                  </span>
                )}
                {hasAnyLabels && totalWarnings === 0 && (
                  <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: '#dcfce7', color: '#166534', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={11} /> Đạt chuẩn Socratic
                  </span>
                )}
              </div>

              {/* Messages table */}
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ width: 48, padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '2px solid #e2e8f0', textTransform: 'uppercase' }}>#</th>
                    <th style={{ width: 100, padding: '10px 8px', fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '2px solid #e2e8f0', textTransform: 'uppercase' }}>Vai trò</th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', textTransform: 'uppercase' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={12} /> Bản gốc (Original)</span>
                    </th>
                    <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#6366f1', borderBottom: '2px solid #6366f1', textTransform: 'uppercase', background: '#f5f3ff' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Eye size={12} /> Bản Preview + Nhãn đã gán</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg: any, i: number) => {
                    const msgLabels: MsgLabel[] = messageLabels[i] || [];
                    const rewrite = rewrites[i];
                    const hasLabel = msgLabels.length > 0;
                    const hasBadPedagogy = msgLabels.some((l: MsgLabel) => l.name.includes('⚠️'));
                    const isUser = msg.role === 'user';
                    const displayContent = rewrite?.approvedText || msg.content;
                    const isRewritten = !!rewrite?.approvedText && rewrite.approvedText !== msg.content;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: hasBadPedagogy ? '#fff8f8' : i % 2 === 0 ? '#fff' : '#fafbff' }}>
                        <td style={{ textAlign: 'center', padding: '14px 8px', fontWeight: 700, color: '#94a3b8', fontSize: 12, verticalAlign: 'top' }}>{i}</td>
                        <td style={{ padding: '14px 8px', verticalAlign: 'top' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: isUser ? '#dbeafe' : '#dcfce7', color: isUser ? '#1e40af' : '#166534', border: '1px solid ' + (isUser ? '#93c5fd' : '#86efac') }}>
                            {isUser ? '🧑' : '🤖'} {isUser ? 'Học sinh' : 'Trợ lý'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 12px', verticalAlign: 'top', maxWidth: 360, borderRight: '1px solid #f1f5f9' }}>
                          <p style={{ margin: 0, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                        </td>
                        <td style={{ padding: '14px 12px', verticalAlign: 'top', maxWidth: 360, background: '#fafbff' }}>
                          {isRewritten && (
                            <div style={{ marginBottom: 8, padding: '6px 10px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#a16207', marginBottom: 2 }}>✏️ ĐÃ SỬa</div>
                              <del style={{ color: '#9ca3af', fontSize: 12 }}>{rewrite.originalText?.substring(0, 100)}...</del>
                            </div>
                          )}
                          <p style={{ margin: 0, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: hasLabel ? 8 : 0 }}>{displayContent}</p>
                          {hasLabel ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: hasBadPedagogy ? '#fff5f5' : '#f0fdf4', borderRadius: 8, border: '1px solid ' + (hasBadPedagogy ? '#fecaca' : '#bbf7d0') }}>
                              {msgLabels.map((lbl: MsgLabel, li: number) => <IntentBadge key={li} lbl={lbl} />)}
                            </div>
                          ) : (
                            <div style={{ padding: '6px 10px', background: '#f8fafc', borderRadius: 8, border: '1px dashed #d1d5db' }}>
                              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chưa gán nhãn</span>
                            </div>
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
      </div>
    </div>
  );
}
