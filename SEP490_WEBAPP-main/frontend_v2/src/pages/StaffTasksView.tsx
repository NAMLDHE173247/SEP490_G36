import React, { useState } from 'react';
import {
  ClipboardList, Clock, CheckCircle, AlertCircle, ChevronRight,
  Calendar, Filter, RefreshCw, Tag, Users, BarChart2, ArrowUpDown
} from 'lucide-react';
import '../stafftasks.css';

const MY_TASKS = [
  {
    id: 'TASK-001',
    name: 'Gán nhãn Toán 11 — Batch 1',
    dataset: 'Toan_11',
    version: 'v3',
    batchStart: 1,
    batchCount: 40,
    priority: 'high',
    deadline: '2026-06-05',
    status: 'in_progress',
    labeledCount: 25,
    totalSamples: 40,
    supervisor: 'Supervisor User',
    createdAt: '2026-06-01',
    guideline: 'Gán nhãn cho các hội thoại về môn Toán lớp 11. Chú ý phân biệt rõ Intent của học sinh.',
    disableAi: false,
  },
  {
    id: 'TASK-002',
    name: 'Gán nhãn Vật lý — Batch 2',
    dataset: 'Vatly_12',
    version: 'v1',
    batchStart: 41,
    batchCount: 35,
    priority: 'urgent',
    deadline: '2026-06-04',
    status: 'in_progress',
    labeledCount: 10,
    totalSamples: 35,
    supervisor: 'Supervisor User',
    createdAt: '2026-06-02',
    guideline: 'Gán nhãn cho hội thoại Vật lý lớp 12. Lưu ý kiểm tra lỗi factual.',
    disableAi: true,
  },
  {
    id: 'TASK-003',
    name: 'Gán nhãn Hóa học — Batch 1',
    dataset: 'Hoahoc_10',
    version: 'v2',
    batchStart: 1,
    batchCount: 30,
    priority: 'medium',
    deadline: '2026-06-08',
    status: 'pending',
    labeledCount: 0,
    totalSamples: 30,
    supervisor: 'Supervisor User',
    createdAt: '2026-06-03',
    guideline: '',
    disableAi: false,
  },
  {
    id: 'TASK-004',
    name: 'Gán nhãn Toán 11 — Batch 2',
    dataset: 'Toan_11',
    version: 'v3',
    batchStart: 41,
    batchCount: 40,
    priority: 'low',
    deadline: '2026-06-10',
    status: 'submitted',
    labeledCount: 40,
    totalSamples: 40,
    supervisor: 'Supervisor User',
    createdAt: '2026-05-28',
    guideline: '',
    disableAi: false,
  },
  {
    id: 'TASK-005',
    name: 'Gán nhãn Sinh học — Batch 1',
    dataset: 'Sinhhoc_11',
    version: 'v1',
    batchStart: 1,
    batchCount: 25,
    priority: 'medium',
    deadline: '2026-06-12',
    status: 'pending',
    labeledCount: 0,
    totalSamples: 25,
    supervisor: 'Supervisor User',
    createdAt: '2026-06-03',
    guideline: '',
    disableAi: false,
  },
];

const STATUS_CONFIG = {
  pending: { label: 'Chờ thực hiện', icon: <Clock size={14} />, className: 'st-status-pending' },
  in_progress: { label: 'Đang thực hiện', icon: <AlertCircle size={14} />, className: 'st-status-progress' },
  submitted: { label: 'Đã Submit', icon: <CheckCircle size={14} />, className: 'st-status-submitted' },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', className: 'st-pri-urgent' },
  high: { label: 'High', className: 'st-pri-high' },
  medium: { label: 'Medium', className: 'st-pri-medium' },
  low: { label: 'Low', className: 'st-pri-low' },
};

function StaffTasksView({ onOpenTask }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('deadline');

  const stats = {
    total: MY_TASKS.length,
    inProgress: MY_TASKS.filter(t => t.status === 'in_progress').length,
    submitted: MY_TASKS.filter(t => t.status === 'submitted').length,
  };

  let filtered = MY_TASKS.filter(t => statusFilter === 'all' || t.status === statusFilter);

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'deadline': return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      case 'priority': {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      }
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default: return 0;
    }
  });

  const isOverdue = (deadline: string) => new Date(deadline).getTime() < new Date('2026-06-03').getTime();
  const isNearDeadline = (deadline: string) => {
    const diff = new Date(deadline).getTime() - new Date('2026-06-03').getTime();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="st-container">
      {/* Header */}
      <div className="st-header">
        <div className="st-header-left">
          <div className="st-icon-wrapper">
            <ClipboardList size={24} />
          </div>
          <div>
            <h2>Task gán nhãn của tôi</h2>
            <p className="st-subtitle">Xem và thực hiện các task được giao</p>
          </div>
        </div>
        <button className="st-btn-refresh" onClick={() => { }}>
          <RefreshCw size={16} />
          Làm mới
        </button>
      </div>

      {/* Stats */}
      <div className="st-stats">
        <div className="st-stat-card">
          <div className="st-stat-icon total"><ClipboardList size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.total}</span>
            <span className="st-stat-label">Tổng Task</span>
          </div>
        </div>
        <div className="st-stat-card">
          <div className="st-stat-icon progress"><AlertCircle size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.inProgress}</span>
            <span className="st-stat-label">Đang thực hiện</span>
          </div>
        </div>
        <div className="st-stat-card">
          <div className="st-stat-icon submitted"><CheckCircle size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.submitted}</span>
            <span className="st-stat-label">Đã Submit</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="st-toolbar">
        <div className="st-filter-group">
          <Filter size={14} />
          {['all', 'pending', 'in_progress', 'submitted'].map(key => (
            <button
              key={key}
              className={`st-filter-btn ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {key === 'all' ? 'Tất cả' : STATUS_CONFIG[key]?.label}
            </button>
          ))}
        </div>
        <div className="st-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="st-sort-select">
            <option value="deadline">Deadline gần nhất</option>
            <option value="priority">Ưu tiên cao nhất</option>
            <option value="newest">Mới nhất</option>
          </select>
        </div>
      </div>

      {/* Task Cards */}
      <div className="st-task-grid">
        {filtered.length === 0 && (
          <div className="st-empty">
            <ClipboardList size={48} />
            <p>Không có task nào.</p>
          </div>
        )}

        {filtered.map(task => {
          const progress = Math.round((task.labeledCount / task.totalSamples) * 100);
          const statusInfo = STATUS_CONFIG[task.status];
          const priInfo = PRIORITY_CONFIG[task.priority];
          const overdue = isOverdue(task.deadline) && task.status !== 'submitted';
          const nearDl = isNearDeadline(task.deadline) && task.status !== 'submitted';

          return (
            <div key={task.id} className={`st-task-card ${overdue ? 'overdue' : ''}`}>
              <div className="st-card-top">
                <span className={`st-priority-badge ${priInfo.className}`}>{priInfo.label}</span>
                <span className={`st-status-badge ${statusInfo.className}`}>
                  {statusInfo.icon}
                  {statusInfo.label}
                </span>
              </div>

              <h3 className="st-card-title">📋 {task.name}</h3>

              <div className="st-card-meta">
                <div className="st-meta-row">
                  <Tag size={13} />
                  <span>Dataset: <strong>{task.dataset} - {task.version}</strong></span>
                </div>
                <div className="st-meta-row">
                  <BarChart2 size={13} />
                  <span>Batch: Samples {task.batchStart}–{task.batchStart + task.batchCount - 1}</span>
                </div>
                <div className={`st-meta-row ${overdue ? 'deadline-overdue' : nearDl ? 'deadline-near' : ''}`}>
                  <Calendar size={13} />
                  <span>Deadline: <strong>{task.deadline}</strong></span>
                  {overdue && <span className="st-overdue-tag">Quá hạn!</span>}
                  {nearDl && <span className="st-near-tag">Sắp hết hạn</span>}
                </div>
                <div className="st-meta-row">
                  <Users size={13} />
                  <span>Supervisor: {task.supervisor}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="st-card-progress">
                <div className="st-progress-header">
                  <span>Tiến độ</span>
                  <span className="st-progress-num">{task.labeledCount}/{task.totalSamples} ({progress}%)</span>
                </div>
                <div className="st-progress-bar">
                  <div className="st-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              {task.disableAi && (
                <div className="st-ai-disabled-badge">🚫 AI suggestions disabled</div>
              )}

              <button
                className={`st-open-btn ${task.status === 'submitted' ? 'disabled' : ''}`}
                onClick={() => task.status !== 'submitted' && onOpenTask && onOpenTask(task)}
                disabled={task.status === 'submitted'}
              >
                <ChevronRight size={16} />
                {task.status === 'submitted' ? 'Đã Submit ✓' : task.status === 'pending' ? 'Bắt đầu Task' : 'Tiếp tục gán nhãn'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StaffTasksView;
