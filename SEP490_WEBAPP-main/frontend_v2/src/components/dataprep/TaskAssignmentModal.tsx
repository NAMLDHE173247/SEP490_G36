import React, { useState, useEffect } from 'react';
import {
  X, Users, Database, Search, CheckCircle, ChevronRight,
  ChevronLeft, AlertCircle, ClipboardList, Calendar, Sparkles, Layers
} from 'lucide-react';
import { api } from '../../services/api';
import '../../styles/taskassignment.css';

interface StaffItem {
  id: string;
  name: string;
  email: string;
  pendingTasks: number;
  totalAssigned: number;
}

interface CheckerItem { id: string; name: string; email: string; }

interface VersionItem {
  _id: string;
  projectName: string;
  versionName: string;
  totalSamples: number;
}

interface TaskAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TaskAssignmentModal({ isOpen, onClose, onSuccess }: TaskAssignmentModalProps) {
  const [step, setStep] = useState(1);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [checkers, setCheckers] = useState<CheckerItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [aiStaff, setAiStaff] = useState<string[]>([]);
  const [aiSearch, setAiSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [overlapCount, setOverlapCount] = useState(1);
  const [conflictThreshold, setConflictThreshold] = useState(0.6);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedChecker, setSelectedChecker] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedVersion(null);
      setSelectedStaff([]);
      setAiStaff([]);
      setTaskName('');
      setPriority('medium');
      setDeadline('');
      setOverlapCount(1);
      setConflictThreshold(0.6);
      setError('');
      fetchVersions();
      fetchCheckers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 2) fetchStaff();
  }, [step]);

  // Auto-adjust overlapCount when staff selection changes
  useEffect(() => {
    if (overlapCount > selectedStaff.length) {
      setOverlapCount(Math.max(1, selectedStaff.length));
    }
  }, [selectedStaff.length]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dataprep/versions');
      if (res.data.success) setVersions(res.data.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dataprep/assignments/available-staff');
      if (res.data.success) setStaffList(res.data.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchCheckers = async () => {
    try {
      const res = await api.get('/auth/users');
      const list = (res.data.users || []).filter((u: any) => u.role === 'checker' && (!u.status || u.status === 'active'));
      setCheckers(list.map((u: any) => ({ id: u.id || u._id, name: u.name, email: u.email })));
    } catch { setCheckers([]); }
  };

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id];
      if (!next.includes(id)) setAiStaff(a => a.filter(x => x !== id)); // bỏ chọn thì gỡ luôn quyền AI
      return next;
    });
  };

  const toggleAi = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedStaff(prev => prev.includes(id) ? prev : [...prev, id]); // bật AI thì auto chọn nhân viên
    setAiStaff(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Valid overlap values: divisors of selectedStaff.length
  const getValidOverlapValues = () => {
    const M = selectedStaff.length;
    if (M <= 1) return [1];
    const values: number[] = [];
    for (let i = 1; i <= M; i++) {
      if (M % i === 0) values.push(i);
    }
    return values;
  };

  const getDistribution = () => {
    if (!selectedVersion || selectedStaff.length === 0) return [];
    const N = selectedVersion.totalSamples;
    const M = selectedStaff.length;
    const K = overlapCount;
    const numberOfGroups = M / K;
    const perGroup = Math.floor(N / numberOfGroups);
    const remainder = N % numberOfGroups;

    const result: Array<{ name: string; count: number; range: string; groupIndex: number }> = [];
    let sampleCursor = 1;

    for (let g = 0; g < numberOfGroups; g++) {
      const chunkSize = perGroup + (g < remainder ? 1 : 0);
      const groupStaffIds = selectedStaff.slice(g * K, (g + 1) * K);
      const range = `${sampleCursor}–${sampleCursor + chunkSize - 1}`;

      for (const staffId of groupStaffIds) {
        const staff = staffList.find(s => s.id === staffId);
        result.push({
          name: staff?.name || staffId,
          count: chunkSize,
          range,
          groupIndex: g + 1,
        });
      }
      sampleCursor += chunkSize;
    }
    return result;
  };

  const handleSubmit = async () => {
    if (!selectedVersion) return;
    // Bắt buộc đặt tên Task
    if (!taskName.trim()) {
      setError('Tên Task là bắt buộc');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/dataprep/versions/${selectedVersion._id}/assignments/auto-assign`, {
        assigneeIds: selectedStaff,
        aiAssigneeIds: aiStaff.filter(id => selectedStaff.includes(id)),
        taskName: taskName.trim(),
        priority,
        deadline: deadline || undefined,
        overlapCount,
        similarityThreshold: conflictThreshold,
        checkerId: overlapCount > 1 ? (selectedChecker || undefined) : undefined,
      });
      if (res.data.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.data.error || 'Có lỗi xảy ra');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
    setSubmitting(false);
  };

  const filteredStaff = staffList.filter(s =>
    searchQuery.trim() === '' ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canProceedStep2 = selectedStaff.length > 0 && selectedStaff.length % overlapCount === 0;

  if (!isOpen) return null;

  const distribution = getDistribution();
  const numberOfGroups = selectedStaff.length > 0 ? selectedStaff.length / overlapCount : 0;

  return (
    <div className="ta-modal-overlay" onClick={onClose}>
      <div className="ta-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ta-modal-header">
          <div className="ta-modal-title">
            <Sparkles size={20} />
            <h3>Tạo Task Gán Nhãn Mới</h3>
          </div>
          <button className="ta-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Progress Steps */}
        <div className="ta-steps">
          {[
            { num: 1, label: 'Chọn Dataset' },
            { num: 2, label: 'Chọn Staff' },
            { num: 3, label: 'Xác nhận' },
          ].map(s => (
            <div key={s.num} className={`ta-step ${step >= s.num ? 'active' : ''} ${step === s.num ? 'current' : ''}`}>
              <div className="ta-step-num">{step > s.num ? <CheckCircle size={16} /> : s.num}</div>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="ta-modal-body">
          {/* Step 1: Chọn DatasetVersion */}
          {step === 1 && (
            <div className="ta-step-content">
              <h4><Database size={16} /> Chọn bộ dữ liệu cần gán nhãn</h4>
              {loading ? (
                <div className="ta-loading">Đang tải...</div>
              ) : (
                <div className="ta-version-list">
                  {versions.map(v => (
                    <div
                      key={v._id}
                      className={`ta-version-card ${selectedVersion?._id === v._id ? 'selected' : ''}`}
                      onClick={() => setSelectedVersion(v)}
                    >
                      <div className="ta-version-info">
                        <span className="ta-version-name">{v.projectName}</span>
                        <span className="ta-version-tag">{v.versionName}</span>
                      </div>
                      <div className="ta-version-samples">
                        <Database size={14} />
                        <span>{v.totalSamples} samples</span>
                      </div>
                      {selectedVersion?._id === v._id && (
                        <CheckCircle size={18} className="ta-check-icon" />
                      )}
                    </div>
                  ))}
                  {versions.length === 0 && (
                    <div className="ta-empty">Không tìm thấy Dataset Version nào.</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Chọn Staff + Cấu hình Overlap */}
          {step === 2 && (
            <div className="ta-step-content">
              <h4><Users size={16} /> Chọn nhân viên thực hiện</h4>
              <div className="ta-search-bar">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="ta-staff-list">
                {filteredStaff.map(s => (
                  <div
                    key={s.id}
                    className={`ta-staff-card ${selectedStaff.includes(s.id) ? 'selected' : ''}`}
                    onClick={() => toggleStaff(s.id)}
                  >
                    <div className="ta-staff-check">
                      <input type="checkbox" checked={selectedStaff.includes(s.id)} readOnly />
                    </div>
                    <div className="ta-staff-avatar">{s.name.split(' ').pop()?.[0] || 'U'}</div>
                    <div className="ta-staff-info">
                      <span className="ta-staff-name">{s.name}</span>
                      <span className="ta-staff-email">{s.email}</span>
                    </div>
                    <div className="ta-staff-workload">
                      <span className={`ta-workload-badge ${s.pendingTasks > 3 ? 'busy' : s.pendingTasks > 0 ? 'active' : 'free'}`}>
                        {s.pendingTasks === 0 ? 'Rảnh' : `${s.pendingTasks} task`}
                      </span>
                    </div>
                    {aiStaff.includes(s.id) && (
                      <span title="Được phép dùng AI key (cấu hình ở bước Xác nhận)" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 8,
                        padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                        background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', color: '#6d28d9'
                      }}>
                        <Sparkles size={11} /> AI
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Overlap Config */}
              {selectedStaff.length >= 2 && (
                <div className="ta-overlap-config">
                  <div className="ta-overlap-header">
                    <Layers size={16} />
                    <span>Gán trùng lặp (Overlap)</span>
                  </div>
                  <div className="ta-overlap-body">
                    <div className="ta-overlap-select">
                      <label>Số người cùng gán 1 lô:</label>
                      <select
                        value={overlapCount}
                        onChange={e => setOverlapCount(Number(e.target.value))}
                        className="ta-select"
                      >
                        {getValidOverlapValues().map(v => (
                          <option key={v} value={v}>
                            {v === 1 ? '1 (Không trùng lặp)' : `${v} người/nhóm`}
                          </option>
                        ))}
                      </select>
                    </div>
                    {overlapCount > 1 && (
                      <div style={{ display: 'grid', gap: 10 }}>
                        <div className="ta-overlap-preview">
                          <span className="ta-overlap-badge">
                            📊 {numberOfGroups} nhóm × {overlapCount} người — mỗi nhóm cùng gán{' '}
                            {selectedVersion ? Math.floor(selectedVersion.totalSamples / numberOfGroups) : '?'} mẫu
                          </span>
                        </div>
                        <div style={{ padding: 10, border: '1px solid #ddd6fe', borderRadius: 8, background: '#faf5ff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                            <span>Ngưỡng đồng thuận Jaccard</span>
                            <span style={{ color: '#7c3aed' }}>{Math.round(conflictThreshold * 100)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.05" value={conflictThreshold} onChange={e => setConflictThreshold(Number(e.target.value))} style={{ width: '100%', accentColor: '#7c3aed' }} />
                          <small>Đạt từ {Math.round(conflictThreshold * 100)}%: tự chốt nhãn đa số. Thấp hơn: chuyển Checker.</small>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="ta-selected-count">
                Đã chọn: <strong>{selectedStaff.length}</strong> nhân viên
                {overlapCount > 1 && (
                  <span style={{ marginLeft: 8, color: '#8b5cf6' }}>
                    • Overlap: <strong>{overlapCount}</strong> người/nhóm
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Xác nhận */}
          {step === 3 && (
            <div className="ta-step-content">
              <h4><ClipboardList size={16} /> Xác nhận phân công</h4>

              <div className="ta-config-group">
                <label>Tên Task <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  placeholder={`VD: ${selectedVersion?.projectName || 'Dataset'} Labeling`}
                  className="ta-input"
                  required
                  style={!taskName.trim() ? { borderColor: '#ef4444' } : undefined}
                />
                {!taskName.trim() && (
                  <span style={{ color: '#ef4444', fontSize: 12, marginTop: 4, display: 'inline-block' }}>
                    Bắt buộc nhập tên Task để phân biệt Project/Dataset.
                  </span>
                )}
              </div>

              {/* AI permission panel */}
              {(() => {
                const selUsers = selectedStaff.map(id => staffList.find(s => s.id === id)).filter(Boolean) as StaffItem[];
                const q = aiSearch.trim().toLowerCase();
                const shown = selUsers.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
                const aiCount = selectedStaff.filter(id => aiStaff.includes(id)).length;
                const pillBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' };
                return (
                  <div style={{ marginTop: 14, border: '1px solid #e0e7ff', borderRadius: 14, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', background: 'linear-gradient(135deg, #f5f3ff, #eef2ff)', borderBottom: '1px solid #e0e7ff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#6d28d9' }}>
                        <Sparkles size={16} /> Quyền dùng AI key
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', background: '#fff', border: '1px solid #ddd6fe', borderRadius: 999, padding: '1px 8px' }}>{aiCount}/{selectedStaff.length}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => setAiStaff([...selectedStaff])} style={pillBtn}>Bật tất cả</button>
                        <button type="button" onClick={() => setAiStaff([])} style={pillBtn}>Tắt tất cả</button>
                      </div>
                    </div>
                    <div style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
                        Chỉ nhân viên được bật mới thấy nút <strong>“Gợi ý AI”</strong> khi gán nhãn.
                      </p>
                      {selectedStaff.length > 5 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', marginBottom: 10 }}>
                          <Search size={15} style={{ color: '#94a3b8' }} />
                          <input type="text" placeholder="Lọc nhân viên..." value={aiSearch} onChange={e => setAiSearch(e.target.value)}
                            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: '#334155' }} />
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                        {selectedStaff.length === 0 && (
                          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '14px 0' }}>
                            Chưa chọn nhân viên nào.
                          </div>
                        )}
                        {shown.map(u => {
                          const on = aiStaff.includes(u.id);
                          return (
                            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, border: `1px solid ${on ? '#ddd6fe' : '#eef2f7'}`, background: on ? '#faf5ff' : '#fff' }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                                {u.name.split(' ').pop()?.[0] || 'U'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                onClick={() => setAiStaff(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                                title={on ? 'Đang cho phép AI — bấm để tắt' : 'Bấm để cho phép dùng AI'}
                                style={{ position: 'relative', width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : '#cbd5e1' }}
                              >
                                <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="ta-config-row">
                <div className="ta-config-group">
                  <label>Độ ưu tiên</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="ta-select">
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                  </select>
                </div>
                <div className="ta-config-group">
                  <label><Calendar size={14} /> Deadline</label>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="ta-input" />
                </div>
              </div>

              {overlapCount > 1 ? (
                <div className="ta-config-group ta-checker-field">
                  <label><Users size={14} /> Checker xử lý ngoại lệ</label>
                  <select value={selectedChecker} onChange={e => setSelectedChecker(e.target.value)} className="ta-select">
                    <option value="">-- Admin/Supervisor tự xử lý --</option>
                    {checkers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
                  </select>
                  <small>Checker chỉ nhận mẫu có mức đồng thuận thấp hơn {Math.round(conflictThreshold * 100)}%.</small>
                </div>
              ) : (
                <div className="ta-config-group ta-checker-field" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <strong style={{ color: '#166534' }}>Luồng một Staff</strong>
                  <small>Staff nộp → Supervisor duyệt → tự tạo Canonical. Không qua Checker.</small>
                </div>
              )}

              <div className="ta-summary-card">
                <div className="ta-summary-title">
                  📊 Phân bổ {overlapCount > 1 ? `(Overlap ${overlapCount} người/nhóm)` : 'tự động'}
                </div>
                <div className="ta-summary-info">
                  <span>Dataset: <strong>{selectedVersion?.projectName}</strong></span>
                  <span>Tổng: <strong>{selectedVersion?.totalSamples} samples</strong></span>
                  <span>Nhân viên: <strong>{selectedStaff.length} người</strong></span>
                  {overlapCount > 1 && (
                    <span>Nhóm: <strong>{numberOfGroups} nhóm × {overlapCount} người</strong></span>
                  )}
                </div>
                <div className="ta-distribution">
                  {overlapCount > 1 && (
                    // Group view: show groups
                    <>
                      {Array.from({ length: numberOfGroups }).map((_, gIdx) => {
                        const groupItems = distribution.filter(d => d.groupIndex === gIdx + 1);
                        if (groupItems.length === 0) return null;
                        return (
                          <div key={gIdx} className="ta-dist-group">
                            <div className="ta-dist-group-header">
                              <Layers size={14} />
                              <span>Nhóm {gIdx + 1} — Câu #{groupItems[0].range} ({groupItems[0].count} samples)</span>
                            </div>
                            {groupItems.map((d, i) => (
                              <div key={i} className="ta-dist-row ta-dist-row-grouped">
                                <div className="ta-dist-avatar">{d.name.split(' ').pop()?.[0] || 'U'}</div>
                                <span className="ta-dist-name">{d.name}</span>
                                <span className="ta-dist-count">{d.count} samples</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                  {overlapCount === 1 && distribution.map((d, i) => (
                    <div key={i} className="ta-dist-row">
                      <div className="ta-dist-avatar">{d.name.split(' ').pop()?.[0] || 'U'}</div>
                      <span className="ta-dist-name">{d.name}</span>
                      <span className="ta-dist-count">{d.count} samples</span>
                      <span className="ta-dist-range">#{d.range}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="ta-error">
                  <AlertCircle size={16} /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ta-modal-footer">
          {step > 1 && (
            <button className="ta-btn ta-btn-outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} /> Quay lại
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 && (
            <button
              className="ta-btn ta-btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !selectedVersion) || (step === 2 && !canProceedStep2)}
            >
              Tiếp theo <ChevronRight size={16} />
            </button>
          )}
          {step === 3 && (
            <button className="ta-btn ta-btn-success" onClick={handleSubmit} disabled={submitting || !taskName.trim()}>
              {submitting ? 'Đang giao việc...' : '🚀 Giao việc'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
