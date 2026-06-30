import React, { useState } from 'react';
import {
  ClipboardList, Clock, CheckCircle, AlertCircle, ChevronRight,
  Calendar, Filter, RefreshCw, Tag, Users, BarChart2, ArrowUpDown
} from 'lucide-react';
import '../styles/stafftasks.css';

import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { stage4Api } from '../services/stage4Api';
import * as XLSX from 'xlsx';

function useStaffTasks() {
  const { user } = useAuth();
  const staffId = user?.id || (user as any)?._id || '';
  const [tasks, setTasks] = useState<any[]>([]);
  const [rewriteTasks, setRewriteTasks] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  React.useEffect(() => {
    const fetchMyTasks = async () => {
      if (!staffId) return [];
      try {
        const res = await api.get('/dataprep/assignments/my-tasks', { params: { userId: staffId } });
        if (res.data.success) {
          const fetchedTasks = res.data.data.map((t: any) => ({
            id: t.id,
            name: t.name,
            datasetVersionId: t.datasetVersionId,
            dataset: t.dataset || 'Dataset',
            version: t.version || '',
            batchStart: t.batchStart,
            batchCount: t.batchCount,
            assignees: [t.assigneeId],
            status: t.status,
            priority: t.priority,
            taskType: t.taskType,
            createdAt: t.createdAt?.split('T')[0] || '',
            deadline: t.deadline?.split('T')[0] || '',
            totalSamples: t.totalSamples || t.batchCount,
            labeledCount: t.labeledCount || 0,
            reviewedCount: 0,
            aiAssistEnabled: !!t.aiAssistEnabled,
          }));
          setTasks(fetchedTasks);
          return fetchedTasks;
        }
        return [];
      } catch (e) {
        console.error('Failed to fetch staff tasks', e);
        return [];
      }
    };
    const loadStage4ForVersions = async (versionIds: string[]) => {
      const uniqueVersionIds = Array.from(new Set(versionIds.filter(Boolean)));
      try {
        const [globalRewriteRes, globalNotificationRes] = await Promise.all([
          stage4Api.listMyRewriteAssignments().catch(() => ({ tasks: [] })),
          stage4Api.listMyNotifications().catch(() => ({ notifications: [] })),
        ]);
        const results = await Promise.all(uniqueVersionIds.map(async (versionId) => {
          const [rewriteRes, notificationRes] = await Promise.all([
            stage4Api.listRewriteAssignments(versionId).catch(() => ({ tasks: [] })),
            stage4Api.listNotifications(versionId).catch(() => ({ notifications: [] })),
          ]);
          return {
            rewriteTasks: (rewriteRes.tasks || []).map((task: any) => ({ ...task, datasetVersionId: versionId })),
            notifications: (notificationRes.notifications || []).map((note: any) => ({ ...note, datasetVersionId: versionId })),
          };
        }));
        const mergedRewriteTasks = [
          ...(globalRewriteRes.tasks || []),
          ...results.flatMap((item) => item.rewriteTasks),
        ];
        const rewriteMap = new Map<string, any>();
        mergedRewriteTasks.forEach((task: any) => rewriteMap.set(String(task.id), task));
        setRewriteTasks(Array.from(rewriteMap.values()));
        const mergedNotifications = [
          ...(globalNotificationRes.notifications || []),
          ...results.flatMap((item) => item.notifications),
        ];
        const notificationMap = new Map<string, any>();
        mergedNotifications.forEach((note: any) => notificationMap.set(String(note._id || note.id || `${note.message}-${note.createdAt}`), note));
        setNotifications(Array.from(notificationMap.values()).sort((a: any, b: any) => {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }));
      } catch (error) {
        console.error('Failed to fetch Stage 4 staff data', error);
        setRewriteTasks([]);
      }
    };
    const refresh = async () => {
      const fetchedTasks = await fetchMyTasks();
      const currentVersionId = localStorage.getItem('current_version_id') || '';
      const versionIds = [
        currentVersionId,
        ...fetchedTasks.map((task: any) => String(task.datasetVersionId || '')),
      ];
      await loadStage4ForVersions(versionIds);
    };
    refresh();
    const intervalId = window.setInterval(refresh, 20000);
    return () => window.clearInterval(intervalId);
  }, [staffId, refreshTick]);

  return { tasks, rewriteTasks, setRewriteTasks, notifications, refreshNow: () => setRefreshTick((tick) => tick + 1) };
}

const STATUS_CONFIG = {
  pending: { label: 'Chờ thực hiện', icon: <Clock size={14} />, className: 'st-status-pending' },
  in_progress: { label: 'Đang thực hiện', icon: <AlertCircle size={14} />, className: 'st-status-progress' },
  submitted: { label: 'Đã nộp', icon: <CheckCircle size={14} />, className: 'st-status-submitted' },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Khẩn cấp', className: 'st-pri-urgent' },
  high: { label: 'Cao', className: 'st-pri-high' },
  medium: { label: 'Trung bình', className: 'st-pri-medium' },
  low: { label: 'Thấp', className: 'st-pri-low' },
};

function StaffTasksView({ onOpenTask }) {
  const { tasks: MY_TASKS, rewriteTasks, setRewriteTasks, notifications, refreshNow } = useStaffTasks();
  const [taskType, setTaskType] = useState('labeling');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const rewriteTaskCards = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    rewriteTasks.forEach((t: any) => {
      const versionId = t.datasetVersionId || 'default';
      if (!groups[versionId]) groups[versionId] = [];
      groups[versionId].push(t);
    });

    return Object.keys(groups).map((versionId) => {
      const groupTasks = groups[versionId];
      const sampleTask = groupTasks[0];
      const completed = groupTasks.filter((t: any) => ['submitted', 'approved'].includes(t.status)).length;
      const total = groupTasks.length;
      
      let groupStatus = 'pending';
      if (completed === total) {
        groupStatus = 'submitted';
      } else if (completed > 0 || groupTasks.some((t: any) => t.submittedText)) {
        groupStatus = 'in_progress';
      }

      const priorities = groupTasks.map((t: any) => t.priority || 'medium');
      let highestPriority = 'medium';
      if (priorities.includes('urgent')) highestPriority = 'urgent';
      else if (priorities.includes('high')) highestPriority = 'high';
      else if (priorities.includes('medium')) highestPriority = 'medium';
      else if (priorities.includes('low')) highestPriority = 'low';

      const prjName = sampleTask.projectName || 'Stage 4 Rewrite';

      return {
        id: versionId,
        name: `Viết lại câu trả lời AI - ${prjName}`,
        dataset: sampleTask.dataset || prjName,
        version: sampleTask.versionName || sampleTask.version || 'v1',
        batchStart: 1,
        batchCount: total,
        status: groupStatus,
        priority: highestPriority,
        taskType: 'rewrite',
        datasetVersionId: versionId,
        createdAt: sampleTask.updatedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        totalSamples: total,
        labeledCount: completed,
        supervisor: 'Admin',
        rewriteTasks: groupTasks,
      };
    });
  }, [rewriteTasks]);

  const tasksByType = taskType === 'labeling' ? MY_TASKS : taskType === 'rewrite' ? rewriteTaskCards : [];
  const stats = {
    total: tasksByType.length,
    inProgress: tasksByType.filter(t => t.status === 'in_progress').length,
    submitted: tasksByType.filter(t => t.status === 'submitted').length,
  };
  let filtered = tasksByType.filter(t => statusFilter === 'all' || t.status === statusFilter);
  const getDateTime = (value?: string) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  };

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'deadline': return getDateTime(a.deadline) - getDateTime(b.deadline);
      case 'priority': {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      }
      case 'newest': return getDateTime(b.createdAt) - getDateTime(a.createdAt);
      default: return 0;
    }
  });

  const isOverdue = (deadline: string) => {
    const time = getDateTime(deadline);
    return Number.isFinite(time) && time < Date.now();
  };
  const isNearDeadline = (deadline: string) => {
    const time = getDateTime(deadline);
    if (!Number.isFinite(time)) return false;
    const diff = time - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  const getTargetAiResponse = (task: any) => {
    const messages = Array.isArray(task?.rewriteTask?.conversationMessages) ? task.rewriteTask.conversationMessages : [];
    const target = messages.find((message: any) => message?.isTarget);
    return target?.content || task?.rewriteTask?.originalText || '';
  };

  const getStudentRequestForRewrite = (task: any) => {
    const messages = Array.isArray(task?.rewriteTask?.conversationMessages) ? task.rewriteTask.conversationMessages : [];
    const targetIdx = messages.findIndex((message: any) => message?.isTarget);
    if (targetIdx >= 0) {
      for (let i = targetIdx - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === 'user' && String(messages[i]?.content || '').trim()) {
          return messages[i].content;
        }
      }
    }
    const firstUser = messages.find((message: any) => message?.role === 'user' && String(message?.content || '').trim());
    return firstUser?.content || 'Không tìm thấy yêu cầu của học sinh trong ngữ cảnh.';
  };

  const getVisibleRewriteMessages = (task: any) => {
    const rewriteContextMode = task?.rewriteTask?.contextMode || 'n-2:n+3';
    const messages = Array.isArray(task?.rewriteTask?.conversationMessages) && task.rewriteTask.conversationMessages.length > 0
      ? task.rewriteTask.conversationMessages
      : [{ role: 'assistant', content: task?.rewriteTask?.originalText || '', isTarget: true }];
    if (rewriteContextMode === 'full') return messages;
    const targetIdx = messages.findIndex((message: any) => message?.isTarget);
    if (targetIdx < 0) return messages;
    let start = targetIdx;
    let end = targetIdx;
    if (rewriteContextMode === 'n-1:n') {
      start = Math.max(0, targetIdx - 1);
    } else if (rewriteContextMode === 'n-1:n+1') {
      start = Math.max(0, targetIdx - 1);
      end = Math.min(messages.length - 1, targetIdx + 1);
    } else if (rewriteContextMode === 'n-2:n+3') {
      start = Math.max(0, targetIdx - 2);
      end = Math.min(messages.length - 1, targetIdx + 3);
    } else if (rewriteContextMode === 'n-2:n+2') {
      start = Math.max(0, targetIdx - 2);
      end = Math.min(messages.length - 1, targetIdx + 2);
    }
    return messages.slice(start, end + 1);
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
        <button className="st-btn-refresh" onClick={refreshNow}>
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
          Task gán nhãn
        </button>
        <button
          className={`st-tab-btn ${taskType === 'rewrite' ? 'active crosscheck' : ''}`}
          onClick={() => setTaskType('rewrite')}
        >
          Task viết lại
        </button>
      </div>

      {/* Stats */}
      <div className="st-stats">
        <div className="st-stat-card">
          <div className="st-stat-icon total"><ClipboardList size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.total}</span>
            <span className="st-stat-label">Tổng số task</span>
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
            <span className="st-stat-label">Đã nộp</span>
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
            <option value="deadline">Hạn chót gần nhất</option>
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

              <h3 className="st-card-title">{task.name}</h3>

              <div className="st-card-meta">
                <div className="st-meta-row">
                  <Tag size={13} />
                  <span>Dataset: <strong>{task.dataset} - {task.version}</strong></span>
                </div>
                {task.taskType === 'rewrite' && task.rewriteTask?.reason && task.rewriteTask.reason !== 'None' && (
                  <div className="st-meta-row st-issue-row">
                    <AlertCircle size={13} />
                    <span>Có lỗi: <strong>{task.rewriteTask.reason}</strong></span>
                  </div>
                )}
                {task.taskType === 'rewrite' && (
                  <div className="st-meta-row">
                    <BarChart2 size={13} />
                    <span>
                      Context: <strong>{task.rewriteTask?.contextMode || 'n-2:n+3'}</strong>
                      {task.rewriteTask?.targetMessageIndex != null && <> · Turn <strong>#{Number(task.rewriteTask.targetMessageIndex) + 1}</strong></>}
                    </span>
                  </div>
                )}
                <div className="st-meta-row">
                  <BarChart2 size={13} />
                  <span>Batch: Samples {task.batchStart}-{task.batchStart + task.batchCount - 1}</span>
                </div>
                <div className={`st-meta-row ${overdue ? 'deadline-overdue' : nearDl ? 'deadline-near' : ''}`}>
                  <Calendar size={13} />
                  <span>Hạn chót: <strong>{task.deadline || 'Không có hạn chót'}</strong></span>
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
                <div className="st-ai-disabled-badge">Đề xuất AI bị vô hiệu hóa</div>
              )}

              {task.taskType === 'rewrite' ? (
                <button
                  className="st-open-btn"
                  id={`st-btn-open-${task.id}`}
                  onClick={() => onOpenTask && onOpenTask(task)}
                >
                  <ChevronRight size={16} />
                  {task.status === 'submitted' ? 'Xem lại' : 'Tiếp tục viết lại'}
                </button>
              ) : (
                <button
                  className={`st-open-btn ${task.status === 'submitted' ? 'disabled' : ''}`}
                  onClick={() => task.status !== 'submitted' && onOpenTask && onOpenTask(task)}
                  disabled={task.status === 'submitted'}
                  id={`st-btn-open-${task.id}`}
                >
                  <ChevronRight size={16} />
                  {task.status === 'submitted' ? 'Đã nộp' : task.status === 'pending' ? 'Bắt đầu task' : 'Tiếp tục gán nhãn'}
                </button>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default StaffTasksView;
