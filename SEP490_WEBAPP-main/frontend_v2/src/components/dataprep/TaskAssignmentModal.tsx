import React, { useState, useEffect } from 'react';
import {
  X, Users, Database, Search, CheckCircle, ChevronRight,
  ChevronLeft, AlertCircle, ClipboardList, Calendar, Sparkles
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
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedVersion(null);
      setSelectedStaff([]);
      setTaskName('');
      setPriority('medium');
      setDeadline('');
      setError('');
      fetchVersions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 2) fetchStaff();
  }, [step]);

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

  const toggleStaff = (id: string) => {
    setSelectedStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const getDistribution = () => {
    if (!selectedVersion || selectedStaff.length === 0) return [];
    const N = selectedVersion.totalSamples;
    const M = selectedStaff.length;
    const perStaff = Math.floor(N / M);
    const remainder = N % M;
    let cursor = 1;
    return selectedStaff.map((staffId, i) => {
      const count = perStaff + (i < remainder ? 1 : 0);
      const staff = staffList.find(s => s.id === staffId);
      const result = { name: staff?.name || staffId, count, range: `${cursor}–${cursor + count - 1}` };
      cursor += count;
      return result;
    });
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

  if (!isOpen) return null;

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

          {/* Step 2: Chọn Staff */}
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
              <div className="ta-selected-count">
                Đã chọn: <strong>{selectedStaff.length}</strong> nhân viên
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
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="ta-config-group">
                  <label><Calendar size={14} /> Deadline</label>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="ta-input" />
                </div>
              </div>

              <div className="ta-summary-card">
                <div className="ta-summary-title">📊 Phân bổ tự động</div>
                <div className="ta-summary-info">
                  <span>Dataset: <strong>{selectedVersion?.projectName}</strong></span>
                  <span>Tổng: <strong>{selectedVersion?.totalSamples} samples</strong></span>
                  <span>Nhân viên: <strong>{selectedStaff.length} người</strong></span>
                </div>
                <div className="ta-distribution">
                  {getDistribution().map((d, i) => (
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
              disabled={(step === 1 && !selectedVersion) || (step === 2 && selectedStaff.length === 0)}
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
