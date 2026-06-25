import React, { useState } from 'react';
import {
  ClipboardList, Search, Filter, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, XCircle, UserCheck, Users,
  Eye, Plus, Calendar, ArrowUpDown, BarChart2, Tag,
  MessageSquare, RefreshCw, Send, X, FileText, Sparkles, Trash2,
  Layers, ChevronUp, Activity, Download, AlertTriangle
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
  const [projects, setProjects] = useState<any[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
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

  const handleSupervisorChange = async (e: any, task: any) => {
    // Add logic here to handle supervisor change
    setUpdatingSupervisor(task.id);
    try {
      // Dummy logic for now
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setUpdatingSupervisor(null);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await api.get('/dataprep/projects');
      setProjects(Array.isArray(res.data?.projects) ? res.data.projects : []);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  };

  const fetchTasks = async () => {
    setIsRefreshing(true);
    setFetchError(null);
    try {
      const [res] = await Promise.all([
        api.get('/dataprep/assignments/manager/overview'),
        fetchProjects(),
      ]);
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

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string, projectName: string) => {
    e.stopPropagation();
    if (!projectId) return;
    if (!window.confirm(`Bạn có chắc muốn XÓA Project "${projectName}"?\n\nProject này không còn task nào. Toàn bộ dataset/version trống thuộc Project sẽ bị xóa.`)) return;
    try {
      await api.delete(`/dataprep/projects/${projectId}`);
      setShowToast('Đã xóa Project!');
      fetchTasks();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Xóa Project thất bại');
    }
    setTimeout(() => setShowToast(null), 3000);
  };

  const [exportModal, setExportModal] = useState<null | { task: any; versionId: string }>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportTask = (e: React.MouseEvent, task: any) => {
    e.stopPropagation();
    const versionId = String(task.id || '').split('_')[0];
    if (task.status !== 'completed' && task.status !== 'submitted') {
      setExportModal({ task, versionId });
      return;
    }
    doExport(versionId, task.name);
  };

  const doExport = async (versionId: string, taskName: string) => {
    setIsExporting(true);
    try {
      const res = await api.get(`/dataprep/export/${versionId}/training-data`);
      const exportData = res.data?.data || res.data;
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${taskName.replace(/\s+/g, '_')}_${versionId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowToast('Xuất dữ liệu thành công!');
      setTimeout(() => setShowToast(null), 3000);
    } catch (err: any) {
      console.error('Export failed', err);
      alert(err.response?.data?.error || 'Xuất dữ liệu thất bại');
    }
    setIsExporting(false);
    setExportModal(null);
  };

  // ── Quản lý nhân sự (thay thế / thêm / gỡ) ──
  const [staffModal, setStaffModal] = useState<null | { mode: 'replace' | 'add'; versionId: string; fromAssigneeId?: string; fromName?: string }>(null);
  const [availStaff, setAvailStaff] = useState<any[]>([]);
  const [pickStaffId, setPickStaffId] = useState('');
  const [pickAi, setPickAi] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);

  const versionIdOf = (taskId: string) => String(taskId || '').split('_')[0];

  const openStaffModal = (e: React.MouseEvent, mode: 'replace' | 'add', versionId: string, fromAssigneeId?: string, fromName?: string) => {
    e.stopPropagation();
    setStaffModal({ mode, versionId, fromAssigneeId, fromName });
    setPickStaffId('');
    setPickAi(false);
    (async () => {
      try {
        const res = await api.get('/dataprep/assignments/available-staff');
        if (res.data.success) setAvailStaff(res.data.data || []);
      } catch { /* ignore */ }
    })();
  };

  const submitStaffModal = async () => {
    if (!staffModal || !pickStaffId) return;
    setStaffBusy(true);
    try {
      if (staffModal.mode === 'replace') {
        await api.post(`/dataprep/versions/${staffModal.versionId}/assignments/replace`, {
          fromAssigneeId: staffModal.fromAssigneeId,
          toAssigneeId: pickStaffId,
          aiAssistEnabled: pickAi,
        });
        setShowToast('Đã thay thế nhân sự!');
      } else {
        await api.post(`/dataprep/versions/${staffModal.versionId}/assignments/add-staff`, {
          assigneeIds: [pickStaffId],
          aiAssigneeIds: pickAi ? [pickStaffId] : [],
          fromAssigneeId: staffModal.fromAssigneeId,
        });
        setShowToast('Đã thêm nhân viên!');
      }
      setStaffModal(null);
      fetchTasks();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Thao tác thất bại');
    }
    setStaffBusy(false);
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleRevokeAssignee = async (e: React.MouseEvent, versionId: string, assigneeId: string, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Gỡ "${name}" khỏi task?\n\nLịch sử & nhãn đã làm vẫn được giữ để tính công, nhưng người này sẽ không sửa tiếp được.`)) return;
    try {
      await api.post(`/dataprep/versions/${versionId}/assignments/revoke`, { assigneeId });
      setShowToast('Đã gỡ nhân viên!');
      fetchTasks();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Gỡ nhân viên thất bại');
    }
    setTimeout(() => setShowToast(null), 3000);
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

  /* ── Group tasks by Project ── */
  const ORPHAN_KEY = '__no_project__';
  // total (unfiltered) task count per project — quyết định project có xóa được không
  const totalTaskCountByProject: Record<string, number> = {};
  TASKS.forEach(t => {
    const pid = t.projectId || ORPHAN_KEY;
    totalTaskCountByProject[pid] = (totalTaskCountByProject[pid] || 0) + 1;
  });

  const groupsMap: Record<string, { projectId: string; projectName: string; tasks: any[]; deletable: boolean }> = {};
  // Seed từ danh sách Project (kể cả project chưa có task nào)
  projects.forEach((p: any) => {
    const pid = String(p._id);
    groupsMap[pid] = {
      projectId: pid,
      projectName: p.name,
      tasks: [],
      deletable: (p.taskCount ?? totalTaskCountByProject[pid] ?? 0) === 0,
    };
  });
  // Gán task (đã filter) vào project tương ứng
  filtered.forEach(t => {
    const pid = t.projectId || ORPHAN_KEY;
    if (!groupsMap[pid]) {
      groupsMap[pid] = {
        projectId: pid === ORPHAN_KEY ? '' : pid,
        projectName: pid === ORPHAN_KEY ? 'Chưa thuộc Project' : (t.projectName || t.dataset || 'Project'),
        tasks: [],
        deletable: false, // nhóm orphan không xóa được
      };
    }
    groupsMap[pid].tasks.push(t);
  });

  const projectGroups = Object.values(groupsMap).sort((a, b) => {
    // Project có task lên trước, rồi theo tên
    if ((b.tasks.length > 0 ? 1 : 0) !== (a.tasks.length > 0 ? 1 : 0)) {
      return (b.tasks.length > 0 ? 1 : 0) - (a.tasks.length > 0 ? 1 : 0);
    }
    return a.projectName.localeCompare(b.projectName);
  });

  /* ── Render 1 task card ── */
  const renderTaskCard = (task: any) => {
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
            <button
              className="al-action-btn export"
              onClick={(e) => handleExportTask(e, task)}
              style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '4px' }}
              title="Export Data (JSON)"
            >
              <Download size={18} />
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
                        const isRevoked = a.active === false;
                        return (
                          <div key={aIdx} className="al-assignee-row" style={isRevoked ? { opacity: 0.6 } : undefined}>
                            <div className="al-assignee-avatar">
                              {(a.name || 'U').split(' ').pop()?.[0] || 'U'}
                            </div>
                            <span className="al-assignee-name">
                              {a.name}
                              {a.aiAssistEnabled && (
                                <span title="Được phép dùng AI key" style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 2, color: '#6d28d9', background: '#ede9fe', padding: '0 5px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>
                                  <Sparkles size={10} /> AI
                                </span>
                              )}
                              {isRevoked && (
                                <span title="Đã bị thu hồi/thay thế — giữ lịch sử để tính công" style={{ marginLeft: 6, color: '#92400e', background: '#fef3c7', padding: '0 5px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>
                                  🔒 Đã thu hồi
                                </span>
                              )}
                            </span>
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
                            {!isRevoked && (
                              <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
                                <button
                                  onClick={(e) => openStaffModal(e, 'replace', versionIdOf(task.id), a.id, a.name)}
                                  title="Thay thế nhân sự này"
                                  style={{ border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Thay thế
                                </button>
                                <button
                                  onClick={(e) => handleRevokeAssignee(e, versionIdOf(task.id), a.id, a.name)}
                                  title="Gỡ khỏi task (giữ lịch sử)"
                                  style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, padding: '2px 6px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Gỡ
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, textAlign: 'right' }}>
                      <button
                        onClick={(e) => openStaffModal(e, 'add', versionIdOf(task.id), batch.assignees?.[0]?.id, undefined)}
                        title="Thêm nhân viên vào lô này (overlap/cross-check)"
                        style={{ border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#475569', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Plus size={12} /> Thêm nhân viên
                      </button>
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
  };

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
        {projectGroups.length === 0 && !fetchError && !isRefreshing && (
          <div className="al-empty"><ClipboardList size={48} /><p>Chưa có Project nào. Hãy tạo Project ở bước Data Prep.</p></div>
        )}

        {projectGroups.map((group) => {
          const groupKey = group.projectId || group.projectName;
          const isOpen = expandedProjects[groupKey] ?? true;
          const groupSamples = group.tasks.reduce((s: number, t: any) => s + (t.totalSamples || 0), 0);
          const groupLabeled = group.tasks.reduce((s: number, t: any) => s + (t.labeledCount || 0), 0);
          const groupProgress = groupSamples > 0 ? Math.round((groupLabeled / groupSamples) * 100) : 0;
          return (
            <div key={groupKey} className="al-project-group" style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              <div onClick={() => toggleProject(groupKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f8fafc', cursor: 'pointer', borderBottom: isOpen ? '1px solid #e2e8f0' : 'none' }}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <Layers size={18} style={{ color: '#6366f1' }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{group.projectName}</span>
                <span style={{ fontSize: 12, color: '#475569', background: '#eef2ff', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{group.tasks.length} task</span>
                {group.tasks.length > 0 && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>{groupSamples} samples · {groupProgress}%</span>
                )}
                <div style={{ flex: 1 }} />
                <button
                  onClick={(e) => handleDeleteProject(e, group.projectId, group.projectName)}
                  disabled={!group.deletable}
                  title={group.deletable ? 'Xóa Project' : 'Chỉ xóa được khi Project không còn task'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', border: '1px solid', borderColor: group.deletable ? '#fecaca' : '#e2e8f0', background: group.deletable ? '#fef2f2' : '#f1f5f9', color: group.deletable ? '#dc2626' : '#94a3b8', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: group.deletable ? 'pointer' : 'not-allowed' }}
                >
                  <Trash2 size={14} /> Xóa Project
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: 12 }}>
                  {group.tasks.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px', fontSize: 13 }}>
                      Project này chưa có task nào.
                    </div>
                  )}
                  {group.tasks.map((task) => renderTaskCard(task))}
                </div>
              )}
            </div>
          );
        })}

        {false && filtered.map((task) => {
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

      {/* Modal: Thay thế / Thêm nhân sự */}
      {staffModal && (
        <div onClick={() => setStaffModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 440, maxWidth: '92vw', padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 17, color: '#1e293b' }}>
                {staffModal.mode === 'replace' ? '🔄 Thay thế nhân sự' : '➕ Thêm nhân viên'}
              </h3>
              <button onClick={() => setStaffModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            {staffModal.mode === 'replace' && (
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Rút phần của <strong>{staffModal.fromName}</strong> và giao cho người mới tiếp tục. Nhãn & lịch sử của người cũ vẫn được giữ để tính công.
              </p>
            )}
            {staffModal.mode === 'add' && (
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Thêm một nhân viên vào cùng lô dữ liệu đã giao (overlap/cross-check).
              </p>
            )}

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', margin: '12px 0 6px' }}>Chọn nhân viên</label>
            <select value={pickStaffId} onChange={(e) => setPickStaffId(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <option value="">— Chọn nhân viên —</option>
              {availStaff
                .filter((s: any) => s.id !== staffModal.fromAssigneeId)
                .map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email}) · {s.pendingTasks || 0} task</option>
                ))}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={pickAi} onChange={(e) => setPickAi(e.target.checked)} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Sparkles size={14} style={{ color: '#6d28d9' }} /> Cho phép dùng AI key của hệ thống</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setStaffModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
              <button onClick={submitStaffModal} disabled={!pickStaffId || staffBusy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: !pickStaffId || staffBusy ? '#cbd5e1' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff', fontWeight: 700, cursor: !pickStaffId || staffBusy ? 'not-allowed' : 'pointer' }}>
                {staffBusy ? 'Đang xử lý...' : (staffModal.mode === 'replace' ? 'Thay thế' : 'Thêm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Confirm Modal ── */}
      {exportModal && (() => {
        const progress = exportModal.task.totalSamples > 0
          ? Math.round((exportModal.task.labeledCount / exportModal.task.totalSamples) * 100) : 0;
        return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => !isExporting && setExportModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: '20px', padding: '32px', width: '400px', maxWidth: '90vw', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            {/* Close */}
            <button onClick={() => !isExporting && setExportModal(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}><X size={18} /></button>

            {/* Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={22} style={{ color: '#d97706' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>Task chưa hoàn thành</h3>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#94a3b8' }}>Dữ liệu export có thể chưa đầy đủ</p>
              </div>
            </div>

            {/* Info card */}
            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exportModal.task.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  {(STATUS_CONFIG as any)[exportModal.task.status]?.label || exportModal.task.status}
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, borderRadius: '3px', background: progress > 50 ? 'linear-gradient(90deg, #6366f1, #818cf8)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#94a3b8' }}>
                <span>{exportModal.task.labeledCount || 0}/{exportModal.task.totalSamples || 0} samples</span>
                <span style={{ fontWeight: 600, color: progress > 50 ? '#6366f1' : '#d97706' }}>{progress}%</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setExportModal(null)}
                disabled={isExporting}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
              >
                Hủy
              </button>
              <button
                onClick={() => doExport(exportModal.versionId, exportModal.task.name)}
                disabled={isExporting}
                style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: isExporting ? '#cbd5e1' : 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 700, cursor: isExporting ? 'not-allowed' : 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {isExporting ? (
                  <><RefreshCw size={14} className="animate-spin" /> Đang xuất...</>
                ) : (
                  <><Download size={14} /> Xuất dữ liệu</>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

    </div>
  );
}

export default ManagerAssignLabelingView;
