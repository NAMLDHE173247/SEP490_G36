import React, { useState } from 'react';
import {
  ClipboardList, Search, Filter, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, XCircle, UserCheck, Users,
  Eye, Plus, Calendar, ArrowUpDown, BarChart2, Tag,
  MessageSquare, RefreshCw, Send, X, FileText, Sparkles
} from 'lucide-react';
import '../assignlabeling.css';

/* ── Demo data ── */
const STAFF_MEMBERS = [
  { id: 'u1', name: 'Nguyễn Văn A', email: 'nguyenvana@fpt.edu.vn', avatar: 'NA' },
  { id: 'u2', name: 'Trần Thị B', email: 'tranthib@fpt.edu.vn', avatar: 'TB' },
  { id: 'u3', name: 'Lê Minh C', email: 'leminhc@fpt.edu.vn', avatar: 'LC' },
  { id: 'u4', name: 'Phạm Hoàng D', email: 'phamhoangd@fpt.edu.vn', avatar: 'PD' },
  { id: 'u5', name: 'Hoàng Thị E', email: 'hoangthie@fpt.edu.vn', avatar: 'HE' },
];

const DATASET_VERSIONS = [
  { id: 'dv1', label: 'Toan_11 - v3', project: 'Toan_11', version: 'v3', totalSamples: 240 },
  { id: 'dv2', label: 'Vatly_12 - v1', project: 'Vatly_12', version: 'v1', totalSamples: 180 },
  { id: 'dv3', label: 'Hoahoc_10 - v2', project: 'Hoahoc_10', version: 'v2', totalSamples: 150 },
  { id: 'dv4', label: 'Sinhhoc_11 - v1', project: 'Sinhhoc_11', version: 'v1', totalSamples: 120 },
];

const TASKS = [
  {
    id: 'TASK-001', name: 'Gán nhãn Toán 11 — Batch 1',
    dataset: 'Toan_11', version: 'v3', batchStart: 1, batchCount: 40,
    assignees: ['u1', 'u2'], reviewMode: 'double', status: 'completed',
    priority: 'high', deadline: '2026-06-03', guideline: 'Gán nhãn Intent + Quality',
    disableAi: false, createdAt: '2026-06-01',
    labeledCount: 40, totalSamples: 40, reviewedCount: 40,
  },
  {
    id: 'TASK-002', name: 'Gán nhãn Toán 11 — Batch 2',
    dataset: 'Toan_11', version: 'v3', batchStart: 41, batchCount: 40,
    assignees: ['u1'], reviewMode: 'single', status: 'submitted',
    priority: 'high', deadline: '2026-06-05', guideline: '',
    disableAi: false, createdAt: '2026-06-02',
    labeledCount: 40, totalSamples: 40, reviewedCount: 0,
  },
  {
    id: 'TASK-003', name: 'Gán nhãn Vật lý 12 — Batch 1',
    dataset: 'Vatly_12', version: 'v1', batchStart: 1, batchCount: 35,
    assignees: ['u2', 'u3'], reviewMode: 'double', status: 'needs_review',
    priority: 'medium', deadline: '2026-06-06', guideline: 'Chú ý factual errors',
    disableAi: true, createdAt: '2026-06-02',
    labeledCount: 35, totalSamples: 35, reviewedCount: 28,
  },
  {
    id: 'TASK-004', name: 'Gán nhãn Vật lý 12 — Batch 2',
    dataset: 'Vatly_12', version: 'v1', batchStart: 36, batchCount: 35,
    assignees: ['u4'], reviewMode: 'single', status: 'in_progress',
    priority: 'high', deadline: '2026-06-07', guideline: '',
    disableAi: false, createdAt: '2026-06-03',
    labeledCount: 15, totalSamples: 35, reviewedCount: 0,
  },
  {
    id: 'TASK-005', name: 'Gán nhãn Hóa học 10 — Batch 1',
    dataset: 'Hoahoc_10', version: 'v2', batchStart: 1, batchCount: 30,
    assignees: ['u5'], reviewMode: 'single', status: 'pending',
    priority: 'medium', deadline: '2026-06-10', guideline: '',
    disableAi: false, createdAt: '2026-06-03',
    labeledCount: 0, totalSamples: 30, reviewedCount: 0,
  },
  {
    id: 'TASK-006', name: 'Gán nhãn Sinh học 11 — Batch 1',
    dataset: 'Sinhhoc_11', version: 'v1', batchStart: 1, batchCount: 25,
    assignees: ['u1', 'u3'], reviewMode: 'double', status: 'pending',
    priority: 'low', deadline: '2026-06-12', guideline: '',
    disableAi: false, createdAt: '2026-06-03',
    labeledCount: 0, totalSamples: 25, reviewedCount: 0,
  },
];

const STATUS_CONFIG = {
  'completed':    { label: 'Completed',    icon: <CheckCircle size={14} />,  className: 'al-status-completed' },
  'submitted':    { label: 'Submitted',    icon: <Send size={14} />,         className: 'al-status-submitted' },
  'needs_review': { label: 'Needs Review', icon: <AlertCircle size={14} />,  className: 'al-status-review' },
  'in_progress':  { label: 'In Progress',  icon: <Clock size={14} />,        className: 'al-status-in-progress' },
  'pending':      { label: 'Pending',      icon: <AlertCircle size={14} />,  className: 'al-status-pending' },
};

const PRIORITY_CONFIG = {
  'urgent': { label: 'Urgent', className: 'al-priority-urgent' },
  'high': { label: 'High', className: 'al-priority-high' },
  'medium': { label: 'Medium', className: 'al-priority-medium' },
  'low': { label: 'Low', className: 'al-priority-low' },
};

function ManagerAssignLabelingView({ onViewDetail }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedTask, setExpandedTask] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Create task form state
  const [newTask, setNewTask] = useState({
    name: '', datasetVersion: '', batchStart: 1, batchCount: 40,
    assignees: [], reviewMode: 'single', deadline: '',
    priority: 'medium', guideline: '', disableAi: false,
  });

  /* Filter & Sort */
  let filtered = TASKS.filter(t => {
    const matchSearch = searchQuery.trim() === '' ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.dataset.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'priority': {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      }
      case 'progress': return (b.labeledCount / b.totalSamples) - (a.labeledCount / a.totalSamples);
      default: return 0;
    }
  });

  const getStaff = (id) => STAFF_MEMBERS.find(s => s.id === id);

  const statusCounts = {
    all: TASKS.length,
    completed: TASKS.filter(t => t.status === 'completed').length,
    submitted: TASKS.filter(t => t.status === 'submitted').length,
    needs_review: TASKS.filter(t => t.status === 'needs_review').length,
    in_progress: TASKS.filter(t => t.status === 'in_progress').length,
    pending: TASKS.filter(t => t.status === 'pending').length,
  };

  const totalLabeled = TASKS.reduce((s, t) => s + t.labeledCount, 0);
  const totalSamples = TASKS.reduce((s, t) => s + t.totalSamples, 0);

  const toggleAssignee = (staffId) => {
    setNewTask(prev => ({
      ...prev,
      assignees: prev.assignees.includes(staffId)
        ? prev.assignees.filter(id => id !== staffId)
        : [...prev.assignees, staffId]
    }));
  };

  const handleCreateTask = () => {
    setShowCreateModal(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
    setNewTask({
      name: '', datasetVersion: '', batchStart: 1, batchCount: 40,
      assignees: [], reviewMode: 'single', deadline: '',
      priority: 'medium', guideline: '', disableAi: false,
    });
  };

  return (
    <div className="al-container">
      {/* Toast */}
      {showToast && (
        <div className="al-toast"><CheckCircle size={16} /> Task đã tạo thành công!</div>
      )}

      {/* Header */}
      <div className="al-header">
        <div className="al-header-left">
          <div className="al-icon-wrapper"><ClipboardList size={24} /></div>
          <div>
            <h2>Quản lý Task gán nhãn</h2>
            <p className="al-subtitle">Tạo, giao việc và theo dõi tiến độ task gán nhãn</p>
          </div>
        </div>
        <div className="al-header-actions">
          <button className="al-btn al-btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Tạo Task mới
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="al-stats">
        <div className="al-stat-card">
          <div className="al-stat-icon total"><ClipboardList size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{TASKS.length}</span>
            <span className="al-stat-label">Tổng Task</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon labeled"><Clock size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{statusCounts.pending}</span>
            <span className="al-stat-label">Đang chờ</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon reviewed"><AlertCircle size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{statusCounts.in_progress}</span>
            <span className="al-stat-label">Đang thực hiện</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon team"><CheckCircle size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{statusCounts.completed}</span>
            <span className="al-stat-label">Hoàn thành</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="al-toolbar">
        <div className="al-search-wrapper">
          <Search size={16} className="al-search-icon" />
          <input type="text" placeholder="Tìm task, dataset..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="al-search-input" />
        </div>
        <div className="al-filter-group">
          <Filter size={14} />
          {Object.entries(statusCounts).map(([key, count]) => (
            <button key={key}
              className={`al-filter-btn ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}>
              {key === 'all' ? 'All' : STATUS_CONFIG[key]?.label || key} ({count})
            </button>
          ))}
        </div>
        <div className="al-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="al-sort-select">
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="priority">Priority</option>
            <option value="progress">Progress</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="al-task-list">
        {filtered.length === 0 && (
          <div className="al-empty"><ClipboardList size={48} /><p>Không tìm thấy task nào.</p></div>
        )}

        {filtered.map((task) => {
          const isExpanded = expandedTask === task.id;
          const statusInfo = STATUS_CONFIG[task.status];
          const priorityInfo = PRIORITY_CONFIG[task.priority];
          const progress = task.totalSamples > 0
            ? Math.round((task.labeledCount / task.totalSamples) * 100) : 0;

          return (
            <div key={task.id} className={`al-task-card ${isExpanded ? 'expanded' : ''}`}>
              <div className="al-task-row" onClick={() => setExpandedTask(isExpanded ? null : task.id)}>
                <div className="al-task-expand">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                <div className="al-task-id"><span>{task.id}</span></div>
                <div className="al-task-title-col">
                  <span className="al-task-title">{task.name}</span>
                  <span className="al-task-desc">{task.dataset} - {task.version} · Samples {task.batchStart}–{task.batchStart + task.batchCount - 1}</span>
                </div>
                <div className="al-task-assignee">
                  {task.assignees.map(id => {
                    const s = getStaff(id);
                    return s ? <div key={id} className="al-avatar" title={s.name}>{s.avatar}</div> : null;
                  })}
                </div>
                <div className={`al-task-priority ${priorityInfo.className}`}>{priorityInfo.label}</div>
                <div className={`al-task-status ${statusInfo.className}`}>
                  {statusInfo.icon}<span>{statusInfo.label}</span>
                </div>
                <div className="al-task-progress-col">
                  <div className="al-progress-bar">
                    <div className="al-progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="al-progress-text">{progress}%</span>
                </div>
              </div>

              {isExpanded && (
                <div className="al-task-details">
                  <div className="al-details-grid">
                    <div className="al-detail-item">
                      <span className="al-detail-label">Staff thực hiện</span>
                      <div className="al-detail-staff-list">
                        {task.assignees.map(id => {
                          const s = getStaff(id);
                          return s ? (
                            <div key={id} className="al-detail-person">
                              <div className="al-avatar sm">{s.avatar}</div>
                              <div>
                                <span className="al-detail-value">{s.name}</span>
                                <span className="al-detail-role">{s.email}</span>
                              </div>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <div className="al-detail-item">
                      <span className="al-detail-label">Review Mode</span>
                      <span className="al-detail-value">{task.reviewMode === 'double' ? '👥 Double Review' : '👤 Single'}</span>
                    </div>
                    <div className="al-detail-item">
                      <span className="al-detail-label">Deadline</span>
                      <span className="al-detail-value">{task.deadline}</span>
                    </div>
                    <div className="al-detail-item">
                      <span className="al-detail-label">Labeled</span>
                      <span className="al-detail-value">{task.labeledCount} / {task.totalSamples}</span>
                    </div>
                    <div className="al-detail-item">
                      <span className="al-detail-label">Created</span>
                      <span className="al-detail-value">{task.createdAt}</span>
                    </div>
                    {task.guideline && (
                      <div className="al-detail-item">
                        <span className="al-detail-label">Guideline</span>
                        <span className="al-detail-value">{task.guideline}</span>
                      </div>
                    )}
                    {task.disableAi && (
                      <div className="al-detail-item">
                        <span className="al-detail-label">AI Suggestions</span>
                        <span className="al-detail-value" style={{ color: '#ef4444' }}>🚫 Disabled</span>
                      </div>
                    )}
                  </div>
                  <div className="al-detail-actions">
                    <button className="al-action-btn view" onClick={() => onViewDetail && onViewDetail(task)}>
                      <Eye size={14} /> Xem chi tiết
                    </button>
                    {task.status === 'completed' && (
                      <button className="al-action-btn reassign" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                        <ChevronRight size={14} /> Tiếp tục Pipeline →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="al-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="al-modal al-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="al-modal-header">
              <h3><Plus size={20} /> Tạo Task gán nhãn mới</h3>
              <button className="al-modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="al-modal-body">
              <div className="al-form-group">
                <label>Tên Task *</label>
                <input type="text" className="al-form-input"
                  placeholder="VD: Gán nhãn Toán 11 - Batch 3"
                  value={newTask.name}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} />
              </div>

              <div className="al-form-group">
                <label>Dataset / Version *</label>
                <select className="al-form-select" value={newTask.datasetVersion}
                  onChange={(e) => setNewTask({ ...newTask, datasetVersion: e.target.value })}>
                  <option value="">— Chọn dataset version —</option>
                  {DATASET_VERSIONS.map(dv => (
                    <option key={dv.id} value={dv.id}>{dv.label} ({dv.totalSamples} samples)</option>
                  ))}
                </select>
              </div>

              <div className="al-form-row">
                <div className="al-form-group">
                  <label>Start Index *</label>
                  <input type="number" className="al-form-input" min={1}
                    value={newTask.batchStart}
                    onChange={(e) => setNewTask({ ...newTask, batchStart: Number(e.target.value) })} />
                </div>
                <div className="al-form-group">
                  <label>Số lượng sample *</label>
                  <input type="number" className="al-form-input" min={1}
                    value={newTask.batchCount}
                    onChange={(e) => setNewTask({ ...newTask, batchCount: Number(e.target.value) })} />
                </div>
              </div>

              <div className="al-form-group">
                <label>Staff thực hiện * (chọn nhiều)</label>
                <div className="al-staff-select-grid">
                  {STAFF_MEMBERS.map(staff => (
                    <label key={staff.id}
                      className={`al-staff-option ${newTask.assignees.includes(staff.id) ? 'selected' : ''}`}>
                      <input type="checkbox"
                        checked={newTask.assignees.includes(staff.id)}
                        onChange={() => toggleAssignee(staff.id)} />
                      <div className="al-avatar sm">{staff.avatar}</div>
                      <div className="al-staff-option-info">
                        <span>{staff.name}</span>
                        <span className="al-staff-option-email">{staff.email}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="al-form-row">
                <div className="al-form-group">
                  <label>Chế độ Review *</label>
                  <div className="al-radio-group">
                    <label className={`al-radio-option ${newTask.reviewMode === 'single' ? 'active' : ''}`}>
                      <input type="radio" name="reviewMode" value="single"
                        checked={newTask.reviewMode === 'single'}
                        onChange={() => setNewTask({ ...newTask, reviewMode: 'single' })} />
                      👤 Single Review
                    </label>
                    <label className={`al-radio-option ${newTask.reviewMode === 'double' ? 'active' : ''}`}>
                      <input type="radio" name="reviewMode" value="double"
                        checked={newTask.reviewMode === 'double'}
                        onChange={() => setNewTask({ ...newTask, reviewMode: 'double' })} />
                      👥 Double Review
                    </label>
                  </div>
                </div>
                <div className="al-form-group">
                  <label>Mức độ ưu tiên</label>
                  <select className="al-form-select" value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="al-form-row">
                <div className="al-form-group">
                  <label>Deadline</label>
                  <input type="date" className="al-form-input"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} />
                </div>
                <div className="al-form-group">
                  <label>Tắt gợi ý AI</label>
                  <label className="al-toggle-wrapper">
                    <input type="checkbox" checked={newTask.disableAi}
                      onChange={(e) => setNewTask({ ...newTask, disableAi: e.target.checked })} />
                    <span className="al-toggle-slider"></span>
                    <span className="al-toggle-label">{newTask.disableAi ? '🚫 Đã tắt' : '✅ Đang bật'}</span>
                  </label>
                </div>
              </div>

              <div className="al-form-group">
                <label>Hướng dẫn gán nhãn</label>
                <textarea className="al-form-textarea" rows={3}
                  placeholder="Guideline cho Staff (hỗ trợ Markdown)..."
                  value={newTask.guideline}
                  onChange={(e) => setNewTask({ ...newTask, guideline: e.target.value })} />
              </div>

              <div className="al-modal-footer">
                <button className="al-btn al-btn-outline" onClick={() => setShowCreateModal(false)}>Hủy</button>
                <button className="al-btn al-btn-primary" onClick={handleCreateTask}>
                  <Plus size={16} /> Tạo Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerAssignLabelingView;
