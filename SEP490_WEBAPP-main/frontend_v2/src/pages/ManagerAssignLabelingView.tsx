import React, { useState } from 'react';
import {
  ClipboardList, Search, Filter, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, XCircle, UserCheck, Users,
  Eye, Plus, Calendar, ArrowUpDown, BarChart2, Tag,
  MessageSquare, RefreshCw, Send, X, FileText, Sparkles, Trash2
} from 'lucide-react';
import '../styles/assignlabeling.css';

import { api } from '../services/api';
import TaskAssignmentModal from '../components/dataprep/TaskAssignmentModal';


const STATUS_CONFIG = {
  'completed':    { label: 'Completed',    icon: <CheckCircle size={14} />,  className: 'al-status-completed' },
  'submitted':    { label: 'Submitted',    icon: <Send size={14} />,         className: 'al-status-submitted' },
  'needs_review': { label: 'Needs Review', icon: <AlertCircle size={14} />,  className: 'al-status-review' },
  'in_progress':  { label: 'In Progress',  icon: <Clock size={14} />,        className: 'al-status-in-progress' },
  'pending':      { label: 'Pending',      icon: <AlertCircle size={14} />,  className: 'al-status-pending' },
  'draft':        { label: 'Draft',        icon: <FileText size={14} />,     className: 'al-status-draft' },
};

const PRIORITY_CONFIG = {
  'urgent': { label: 'Urgent', className: 'al-priority-urgent' },
  'high': { label: 'High', className: 'al-priority-high' },
  'medium': { label: 'Medium', className: 'al-priority-medium' },
  'low': { label: 'Low', className: 'al-priority-low' },
};

function ManagerAssignLabelingView({ onViewDetail }) {
  const [TASKS, setTasks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');

  const [showToast, setShowToast] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await api.get('/dataprep/assignments/manager/overview');
      if (res.data.success) {
        setTasks(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch tasks', e);
    }
  };

  React.useEffect(() => {
    fetchTasks();
  }, []);

  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Bạn có chắc chắn muốn hủy (xóa) tiến trình giao việc này? Dữ liệu gốc vẫn được giữ nguyên.')) return;
    try {
      await api.delete(`/dataprep/versions/${id}/assignments/all`);
      setShowToast('Hủy Task thành công!');
      fetchTasks();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Hủy Task thất bại');
    }
    setTimeout(() => setShowToast(null), 3000);
  };

  /* Filter & Sort */
  let filtered = TASKS.filter(t => {
    const matchSearch = searchQuery.trim() === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.dataset.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc': return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
      case 'date-desc': return new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime();
      case 'priority': {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] || 2) - (order[b.priority] || 2);
      }
      default: return 0;
    }
  });

  const statusCounts = {
    all: TASKS.length,
    completed: TASKS.filter(t => t.status === 'completed').length,
    submitted: TASKS.filter(t => t.status === 'submitted').length,
    needs_review: TASKS.filter(t => t.status === 'needs_review').length,
    in_progress: TASKS.filter(t => t.status === 'in_progress').length,
    pending: TASKS.filter(t => t.status === 'pending').length,
    draft: TASKS.filter(t => t.status === 'draft').length,
  };

  const totalLabeled = TASKS.reduce((s, t) => s + (t.labeledCount || 0), 0);
  const totalSamples = TASKS.reduce((s, t) => s + (t.totalSamples || 0), 0);



  return (
    <div className="al-container">
      {/* Toast */}
      {showToast && (
        <div className="al-toast"><CheckCircle size={16} /> {showToast}</div>
      )}

      {/* Header */}
      <div className="al-header">
        <div className="al-header-left">
          <div className="al-icon-wrapper"><ClipboardList size={24} /></div>
          <div>
            <h2>Quản lý Task (Theo file dữ liệu)</h2>
            <p className="al-subtitle">Theo dõi và giám sát tiến độ các Batch bên trong từng Task</p>
          </div>
        </div>
        <button className="al-btn-create" onClick={() => setShowAssignModal(true)}>
          <Plus size={16} /> Tạo Task Mới
        </button>
      </div>

      {/* Task Assignment Modal */}
      <TaskAssignmentModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onSuccess={() => { fetchTasks(); setShowToast('Giao việc thành công!'); setTimeout(() => setShowToast(null), 3000); }}
      />

      {/* Stats */}
      <div className="al-stats">
        <div className="al-stat-card">
          <div className="al-stat-icon total"><ClipboardList size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{TASKS.length}</span>
            <span className="al-stat-label">Tổng số Batch</span>
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
          <div className="al-empty"><ClipboardList size={48} /><p>Không tìm thấy batch dữ liệu nào.</p></div>
        )}

        {filtered.map((task) => {
          const statusInfo = STATUS_CONFIG[task.status];
          const priorityInfo = PRIORITY_CONFIG[task.priority];
          const progress = task.totalSamples > 0
            ? Math.round((task.labeledCount / task.totalSamples) * 100) : 0;

          return (
            <div key={task.id} className="al-task-card">
              <div className="al-task-row" onClick={() => onViewDetail(task, null)}>
                <div className="al-task-title-col">
                  <span className="al-task-title">{task.dataset} - {task.name}</span>
                  <span className="al-task-desc">Tổng cộng: {task.totalSamples} samples · {task.batches.length} Batch</span>
                </div>

                <div className={`al-task-priority ${priorityInfo.className}`}>{priorityInfo.label}</div>
                <div className="al-task-type" style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: task.taskType === 'cross-check' ? '#e0e7ff' : '#f3f4f6', color: task.taskType === 'cross-check' ? '#4f46e5' : '#4b5563', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {task.taskType === 'cross-check' ? '🔍 Cross-check' : '🏷 Labeling'}
                </div>
                <div className={`al-task-status ${statusInfo.className}`}>
                  {statusInfo.icon}<span>{statusInfo.label}</span>
                </div>
                <div className="al-task-progress-col">
                  <div className="al-progress-bar">
                    <div className="al-progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="al-progress-text">{progress}%</span>
                </div>
                <div className="al-task-actions">
                  <button className="al-action-btn delete" onClick={(e) => handleDeleteTask(e, task.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default ManagerAssignLabelingView;
