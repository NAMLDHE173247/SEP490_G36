import React, { useState } from 'react';
import {
  ClipboardList, Clock, CheckCircle, AlertCircle, ChevronRight,
  Calendar, Filter, RefreshCw, Tag, Users, BarChart2, ArrowUpDown
} from 'lucide-react';
import '../styles/stafftasks.css';

import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

function useStaffTasks() {
  const { user } = useAuth();
  const staffId = user?.id || 'fake-staff-1';
  const [tasks, setTasks] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchMyTasks = async () => {
      try {
        const res = await api.get('/dataprep/assignments/my-tasks', { params: { userId: staffId } });
        if (res.data.success) {
          const fetchedTasks = res.data.data.map((t: any) => ({
            id: t.id,
            name: t.name,
            dataset: 'Toan_11',
            version: 'v3',
            batchStart: t.batchStart,
            batchCount: t.batchCount,
            assignees: [t.assigneeId],
            status: t.status,
            priority: t.priority,
            taskType: t.taskType,
            createdAt: t.createdAt.split('T')[0],
            totalSamples: t.totalSamples || t.batchCount,
            labeledCount: t.labeledCount || 0,
            reviewedCount: 0
          }));
          setTasks(fetchedTasks);
        }
      } catch (e) {
        console.error('Failed to fetch staff tasks', e);
      }
    };
    fetchMyTasks();
  }, [staffId]);

  return tasks;
}

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
  const MY_TASKS = useStaffTasks();
  const [taskType, setTaskType] = useState('labeling');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');

  const stats = {
    total: MY_TASKS.length,
    inProgress: MY_TASKS.filter(t => t.status === 'in_progress').length,
    submitted: MY_TASKS.filter(t => t.status === 'submitted').length,
  };

  // Mock filtering by taskType (in a real app, tasks would have a type field)
  const tasksByType = taskType === 'labeling' ? MY_TASKS : [];
  let filtered = tasksByType.filter(t => statusFilter === 'all' || t.status === statusFilter);

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
            <h2>Task của tôi</h2>
            <p className="st-subtitle">Xem và thực hiện các task được giao</p>
          </div>
        </div>
        <button className="st-btn-refresh" onClick={() => { }}>
          <RefreshCw size={16} />
          Làm mới
        </button>
      </div>

      {/* Task Type Tabs */}
      <div className="st-tabs-container">
        <button
          className={`st-tab-btn ${taskType === 'labeling' ? 'active labeling' : ''}`}
          onClick={() => setTaskType('labeling')}
        >
          Task Gán nhãn
        </button>
        <button
          className={`st-tab-btn ${taskType === 'cross-check' ? 'active crosscheck' : ''}`}
          onClick={() => setTaskType('cross-check')}
        >
          Task Kiểm tra chéo
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
            <p>{taskType === 'cross-check' ? 'Không có task kiểm tra chéo nào.' : 'Không có task nào.'}</p>
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
