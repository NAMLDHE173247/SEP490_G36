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

interface SupervisorItem { id: string; name: string; email: string; }

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
  const [supervisors, setSupervisors] = useState<SupervisorItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [overlapCount, setOverlapCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedVersion(null);
      setSelectedStaff([]);
      setSelectedSupervisor('');
      setTaskName('');
      setPriority('medium');
      setDeadline('');
      setOverlapCount(1);
      setError('');
      fetchVersions();
      fetchSupervisors();
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

  const fetchSupervisors = async () => {
    try {
      const res = await api.get('/auth/users');
      const list = (res.data.users || []).filter((u: any) => u.role === 'supervisor' && (!u.status || u.status === 'active'));
      setSupervisors(list.map((u: any) => ({ id: u.id || u._id, name: u.name, email: u.email })));
    } catch { setSupervisors([]); }
  };

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
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
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/dataprep/versions/${selectedVersion._id}/assignments/auto-assign`, {
        assigneeIds: selectedStaff,
        taskName: taskName || `${selectedVersion.projectName} Labeling`,
        priority,
        deadline: deadline || undefined,
        overlapCount,
        supervisorId: selectedSupervisor || undefined,
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
                      <div className="ta-overlap-preview">
                        <span className="ta-overlap-badge">
                          📊 {numberOfGroups} nhóm × {overlapCount} người — mỗi nhóm cùng gán{' '}
                          {selectedVersion ? Math.floor(selectedVersion.totalSamples / numberOfGroups) : '?'} câu giống nhau
                        </span>
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
                <label>Tên Task</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  placeholder={`${selectedVersion?.projectName || 'Dataset'} Labeling`}
                  className="ta-input"
                />
              </div>

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

              <div className="ta-config-group ta-supervisor-field">
                <label><Users size={14} /> Supervisor phụ trách</label>
                <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="ta-select">
                  <option value="">Admin tự phân giải (mặc định)</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                </select>
                <small>Conflict của task sẽ xuất hiện trong workspace của Supervisor được chọn.</small>
              </div>

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
            <button className="ta-btn ta-btn-success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Đang giao việc...' : '🚀 Giao việc'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
