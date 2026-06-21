import React, { useState } from 'react';
import {
  ClipboardList, Search, Filter, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, XCircle, UserCheck, Users,
  Eye, Plus, Calendar, ArrowUpDown, BarChart2, Tag,
  MessageSquare, RefreshCw, Send, X, FileText, Sparkles, Trash2,
  Layers, ChevronUp, Activity
} from 'lucide-react';
import '../styles/assignlabeling.css';

import { api } from '../services/api';
import TaskAssignmentModal from '../components/dataprep/TaskAssignmentModal';


const STATUS_CONFIG = {
  'completed':    { label: 'Hoàn thành',    icon: <CheckCircle size={14} />,  className: 'al-status-completed' },
  'submitted':    { label: 'Đã nộp',        icon: <Send size={14} />,         className: 'al-status-submitted' },
  'needs_review': { label: 'Cần review',    icon: <AlertCircle size={14} />,  className: 'al-status-review' },
  'in_progress':  { label: 'Đang làm',      icon: <Clock size={14} />,        className: 'al-status-in-progress' },
  'pending':      { label: 'Chờ xử lý',     icon: <AlertCircle size={14} />,  className: 'al-status-pending' },
  'draft':        { label: 'Nháp',          icon: <FileText size={14} />,     className: 'al-status-draft' },
};

const PRIORITY_CONFIG = {
  'high':   { label: 'Cao',      className: 'al-priority-high' },
  'medium': { label: 'Trung bình', className: 'al-priority-medium' },
  'low':    { label: 'Thấp',     className: 'al-priority-low' },
};

function ManagerAssignLabelingView({ onViewDetail }) {
  const [TASKS, setTasks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const [showToast, setShowToast] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [updatingSupervisor, setUpdatingSupervisor] = useState<string | null>(null);

  const fetchTasks = async () => {
    setIsRefreshing(true);
    setFetchError(null);
    try {
      const [res, usersRes] = await Promise.all([
        api.get('/dataprep/assignments/manager/overview'),
        api.get('/auth/users').catch(() => ({ data: { users: [] } })),
      ]);
      setSupervisors((usersRes.data.users || []).filter((u: any) => u.role === 'supervisor' && u.status === 'active'));
      if (res.data.success) {
        setTasks(res.data.data);
      } else {
        setFetchError(res.data.error || 'API returned success=false');
      }
    } catch (e: any) {
      console.error('Failed to fetch tasks', e);
      const msg = e.response?.data?.error || e.message || 'Unknown error';
      setFetchError(`Lỗi tải dữ liệu: ${msg}`);
    }
    setIsRefreshing(false);
  };

  React.useEffect(() => {
    fetchTasks();
  }, []);

  const handleSupervisorChange = async (e: React.ChangeEvent<HTMLSelectElement>, task: any) => {
    e.stopPropagation();
    setUpdatingSupervisor(task.id);
    try {
      await api.patch('/dataprep/assignments/manager/task-supervisor', {
        versionId: task.datasetVersionId,
        taskName: task.name,
        supervisorId: e.target.value || null,
      });
      setShowToast(e.target.value ? 'Đã cập nhật Supervisor phụ trách.' : 'Đã chuyển task về Admin xử lý.');
      await fetchTasks();
    } catch (error: any) {
      setFetchError(error.response?.data?.error || 'Không thể cập nhật Supervisor.');
    } finally {
      setUpdatingSupervisor(null);
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('⚠️ Bạn có chắc chắn muốn XÓA TOÀN BỘ tiến trình giao việc này?\n\nSẽ xóa: Task, Batch, Nhãn gán, Hoạt động, Adjudication, Canonical Labels.\n\nHành động này KHÔNG THỂ hoàn tác!')) return;
    try {
      await api.delete(`/dataprep/versions/${id}/assignments/all`);
      setShowToast('Hủy Task thành công!');
      fetchTasks();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Hủy Task thất bại');
    }
    setTimeout(() => setShowToast(null), 3000);
  };

  const toggleExpand = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setExpandedTask(prev => prev === taskId ? null : taskId);
  };

  /* Filter & Sort */
  let filtered = TASKS.filter(t => {
    const matchSearch = searchQuery.trim() === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.dataset.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc': return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
      case 'date-desc': return new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime();
      case 'priority': {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] || 2) - (order[b.priority] || 2);
      }
      case 'progress': {
        const pA = a.totalSamples > 0 ? a.labeledCount / a.totalSamples : 0;
        const pB = b.totalSamples > 0 ? b.labeledCount / b.totalSamples : 0;
        return pB - pA;
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
  const overallProgress = totalSamples > 0 ? Math.round((totalLabeled / totalSamples) * 100) : 0;

  // Count unique assignees across all tasks
  const allAssignees = new Set<string>();
  TASKS.forEach(t => t.batches?.forEach((b: any) => b.assignees?.forEach((a: any) => allAssignees.add(a.id))));

  // Detect overlap tasks (batches with >1 assignee)
  const overlapTaskCount = TASKS.filter(t =>
    t.batches?.some((b: any) => b.assignees?.length > 1)
  ).length;

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
            <h2>Giám sát & Quản lý Task</h2>
            <p className="al-subtitle">Theo dõi tiến độ, phát hiện xung đột, và quản lý phân công gán nhãn</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="al-btn-create"
            style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
            onClick={fetchTasks}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} /> Làm mới
          </button>
          <button className="al-btn-create" onClick={() => setShowAssignModal(true)}>
            <Plus size={16} /> Tạo Task Mới
          </button>
        </div>
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
            <span className="al-stat-label">Tổng Task</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon labeled"><Users size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{allAssignees.size}</span>
            <span className="al-stat-label">Nhân viên</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon reviewed"><Activity size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{overallProgress}%</span>
            <span className="al-stat-label">Tiến độ chung</span>
          </div>
        </div>
        <div className="al-stat-card">
          <div className="al-stat-icon team"><Layers size={20} /></div>
          <div className="al-stat-info">
            <span className="al-stat-value">{overlapTaskCount}</span>
            <span className="al-stat-label">Overlap Task</span>
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
          {Object.entries(statusCounts).filter(([_, count]) => count > 0 || _ === 'all').map(([key, count]) => (
            <button key={key}
              className={`al-filter-btn ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}>
              {key === 'all' ? 'Tất cả' : STATUS_CONFIG[key]?.label || key} ({count})
            </button>
          ))}
        </div>
        <div className="al-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="al-sort-select">
            <option value="date-desc">Mới nhất</option>
            <option value="date-asc">Cũ nhất</option>
            <option value="priority">Ưu tiên</option>
            <option value="progress">Tiến độ</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="al-task-list">
        {fetchError && (
          <div style={{
            padding: '16px 20px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: '10px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: '14px' }}>Lỗi tải danh sách Task</div>
              <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>{fetchError}</div>
            </div>
            <button onClick={fetchTasks} style={{
              padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none',
              borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px'
            }}>Thử lại</button>
          </div>
        )}
        {isRefreshing && TASKS.length === 0 && (
          <div className="al-empty" style={{ flexDirection: 'column' }}>
            <RefreshCw size={40} className="animate-spin" style={{ color: '#6366f1', marginBottom: '12px' }} />
            <p style={{ color: '#6366f1', fontWeight: 600 }}>Đang tải dữ liệu từ server...</p>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Kết nối MongoDB Atlas có thể mất vài giây</p>
          </div>
        )}
        {filtered.length === 0 && !fetchError && !isRefreshing && (
          <div className="al-empty"><ClipboardList size={48} /><p>Không tìm thấy task nào.</p></div>
        )}

        {filtered.map((task) => {
          const statusInfo = STATUS_CONFIG[task.status] || STATUS_CONFIG['pending'];
          const priorityInfo = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG['medium'];
          const progress = task.totalSamples > 0
            ? Math.round((task.labeledCount / task.totalSamples) * 100) : 0;
          const isExpanded = expandedTask === task.id;
          const hasOverlap = task.batches?.some((b: any) => b.assignees?.length > 1);
          const totalBatches = task.batches?.length || 0;
          const uniqueAssignees = new Set<string>();
          task.batches?.forEach((b: any) => b.assignees?.forEach((a: any) => uniqueAssignees.add(a.name)));

          return (
            <div key={task.id} className={`al-task-card ${isExpanded ? 'expanded' : ''}`}>
              {/* Main Row */}
              <div className="al-task-row" onClick={() => onViewDetail(task, null)}>
                <div className="al-task-title-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="al-task-title">{task.dataset} — {task.name}</span>
                    {hasOverlap && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'linear-gradient(135deg, #ede9fe, #e0e7ff)', color: '#6d28d9',
                        padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600
                      }}>
                        <Layers size={12} /> Overlap
                      </span>
                    )}
                  </div>
                  <span className="al-task-desc">
                    {task.totalSamples} samples · {totalBatches} Batch · {uniqueAssignees.size} người
                  </span>
                  <label onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 7, color: '#64748b', fontSize: 12 }}>
                    <UserCheck size={14} />
                    <select
                      value={task.supervisorId || ''}
                      onChange={(e) => handleSupervisorChange(e, task)}
                      disabled={updatingSupervisor === task.id}
                      aria-label={`Supervisor của ${task.name}`}
                      style={{ border: '1px solid #cbd5e1', borderRadius: 7, padding: '4px 7px', background: '#fff', color: '#334155', maxWidth: 220 }}
                    >
                      <option value="">Admin xử lý conflict</option>
                      {supervisors.map((supervisor: any) => (
                        <option key={supervisor.id || supervisor._id} value={supervisor.id || supervisor._id}>
                          {supervisor.name} ({supervisor.email})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={`al-task-priority ${priorityInfo.className}`}>{priorityInfo.label}</div>
                <div className="al-task-type" style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                  backgroundColor: task.taskType === 'cross-check' ? '#e0e7ff' : '#f3f4f6',
                  color: task.taskType === 'cross-check' ? '#4f46e5' : '#4b5563',
                  fontWeight: 500, whiteSpace: 'nowrap'
                }}>
                  {task.taskType === 'cross-check' ? '🔍 Cross-check' : '🏷 Labeling'}
                </div>
                <div className={`al-task-status ${statusInfo.className}`}>
                  {statusInfo.icon}<span>{statusInfo.label}</span>
                </div>
                <div className="al-task-progress-col">
                  <div className="al-progress-bar">
                    <div className="al-progress-fill" style={{
                      width: `${progress}%`,
                      background: progress === 100
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : progress > 50
                          ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                          : 'linear-gradient(135deg, #f59e0b, #d97706)'
                    }}></div>
                  </div>
                  <span className="al-progress-text" style={{
                    color: progress === 100 ? '#059669' : progress > 50 ? '#4f46e5' : '#d97706'
                  }}>{progress}%</span>
                </div>
                <div className="al-task-actions" style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="al-action-btn"
                    onClick={(e) => toggleExpand(e, task.id)}
                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px' }}
                    title="Xem chi tiết batch"
                  >
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  <button
                    className="al-action-btn delete"
                    onClick={(e) => handleDeleteTask(e, task.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                    title="Xóa task"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Expanded: Batch & Staff Detail */}
              {isExpanded && (
                <div className="al-task-expanded" onClick={e => e.stopPropagation()}>
                  <div className="al-batch-grid">
                    {task.batches?.map((batch: any, bIdx: number) => {
                      const batchHasOverlap = batch.assignees?.length > 1;
                      return (
                        <div key={bIdx} className="al-batch-card">
                          <div className="al-batch-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileText size={14} />
                              <span className="al-batch-name">{batch.name}</span>
                              {batchHasOverlap && (
                                <span style={{
                                  background: '#ede9fe', color: '#7c3aed', padding: '1px 6px',
                                  borderRadius: '4px', fontSize: '10px', fontWeight: 600
                                }}>
                                  {batch.assignees.length} người
                                </span>
                              )}
                            </div>
                            <span className="al-batch-count">{batch.totalSamples} samples</span>
                          </div>
                          <div className="al-batch-assignees">
                            {batch.assignees?.map((a: any, aIdx: number) => {
                              const aProgress = Math.round(a.progress || 0);
                              const aStatusInfo = STATUS_CONFIG[a.status] || STATUS_CONFIG['pending'];
                              return (
                                <div key={aIdx} className="al-assignee-row">
                                  <div className="al-assignee-avatar">
                                    {(a.name || 'U').split(' ').pop()?.[0] || 'U'}
                                  </div>
                                  <span className="al-assignee-name">{a.name}</span>
                                  <div className="al-assignee-progress">
                                    <div className="al-mini-progress-bar">
                                      <div className="al-mini-progress-fill" style={{
                                        width: `${aProgress}%`,
                                        background: aProgress === 100 ? '#10b981' : '#6366f1'
                                      }}></div>
                                    </div>
                                    <span style={{
                                      fontSize: '11px', fontWeight: 600, minWidth: '32px', textAlign: 'right',
                                      color: aProgress === 100 ? '#059669' : '#6366f1'
                                    }}>{aProgress}%</span>
                                  </div>
                                  <span className={`al-assignee-status ${aStatusInfo.className}`} style={{
                                    fontSize: '11px', padding: '2px 6px', borderRadius: '4px'
                                  }}>
                                    {aStatusInfo.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="al-batch-footer">
                    <button
                      className="al-btn-view-detail"
                      onClick={() => onViewDetail(task, null)}
                    >
                      <Eye size={14} /> Xem chi tiết đầy đủ <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default ManagerAssignLabelingView;
