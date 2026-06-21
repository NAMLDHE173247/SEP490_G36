import React, { useState } from 'react';
import {
  ClipboardList, Clock, CheckCircle, AlertCircle, ChevronRight,
  Calendar, Filter, RefreshCw, Tag, Users, BarChart2, ArrowUpDown,
  Download, Upload, FileJson
} from 'lucide-react';
import '../styles/stafftasks.css';

import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { stage4Api } from '../services/stage4Api';

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
            reviewedCount: 0
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
  pending: { label: 'Cho thuc hien', icon: <Clock size={14} />, className: 'st-status-pending' },
  in_progress: { label: 'Dang thuc hien', icon: <AlertCircle size={14} />, className: 'st-status-progress' },
  submitted: { label: 'Da Submit', icon: <CheckCircle size={14} />, className: 'st-status-submitted' },
};

const PRIORITY_CONFIG = {
  high: { label: 'High', className: 'st-pri-high' },
  medium: { label: 'Medium', className: 'st-pri-medium' },
  low: { label: 'Low', className: 'st-pri-low' },
};

function StaffTasksView({ onOpenTask }) {
  const { tasks: MY_TASKS, rewriteTasks, setRewriteTasks, notifications, refreshNow } = useStaffTasks();
  const [taskType, setTaskType] = useState('labeling');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [rewriteDraftTask, setRewriteDraftTask] = useState<any>(null);
  const [rewriteDraftText, setRewriteDraftText] = useState('');
  const [rewriteContextMode, setRewriteContextMode] = useState('n-2:n+2');
  const [isSubmittingRewrite, setIsSubmittingRewrite] = useState(false);
  const [isSuggestingRewrite, setIsSuggestingRewrite] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState('');
  const [isImportingRewrite, setIsImportingRewrite] = useState(false);
  const rewriteFileRef = React.useRef<HTMLInputElement>(null);
  const rewriteContextOptions = [
    { value: 'n-2:n+2', label: 'n-2 to n+2' },
    { value: 'n-1:n+1', label: 'n-1 to n+1' },
    { value: 'n-1:n', label: 'n-1 to n' },
    { value: 'target-only', label: 'Target only' },
    { value: 'full', label: 'Full conversation' },
  ];

  const rewriteTaskCards = rewriteTasks.map((task: any) => ({
    id: task.id,
    name: `Rewrite AI response ${task.convId}`,
    dataset: 'Stage 4 Rewrite',
    version: task.subject || '',
    batchStart: 1,
    batchCount: 1,
    status: ['submitted', 'approved', 'rejected'].includes(task.status) ? 'submitted' : 'in_progress',
    priority: 'high',
    taskType: 'rewrite',
    datasetVersionId: task.datasetVersionId,
    createdAt: task.updatedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
    totalSamples: 1,
    labeledCount: ['submitted', 'approved', 'rejected'].includes(task.status) ? 1 : 0,
    supervisor: 'Admin',
    rewriteTask: task,
  }));

  const downloadRewriteBatch = () => {
    const editable = rewriteTasks.filter((task: any) => !['approved', 'rejected'].includes(task.status));
    const payload = { schema: 'sep490-rewrite-offline/v1', exportedAt: new Date().toISOString(), instructions: 'Only edit rewrittenText. Keep IDs and revision unchanged.', tasks: editable.map((task: any) => ({ taskId: String(task.id), datasetVersionId: String(task.datasetVersionId), revision: task.updatedAt, conversationId: task.convId, targetMessageIndex: task.targetMessageIndex, reason: task.reason || '', originalText: task.originalText || '', context: task.conversationMessages || [], rewrittenText: task.submittedText || '' })) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `rewrite-tasks-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    setOfflineMessage(`Đã tải ${editable.length} task rewrite.`);
  };

  const importRewriteBatch = async (file: File) => {
    setOfflineMessage(''); setIsImportingRewrite(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.schema !== 'sep490-rewrite-offline/v1' || !Array.isArray(parsed.tasks)) throw new Error('File không đúng mẫu Rewrite Offline v1.');
      const ownTasks = new Map(rewriteTasks.map((task: any) => [String(task.id), task]));
      const valid = parsed.tasks.filter((row: any) => ownTasks.has(String(row.taskId)) && String(row.rewrittenText || '').trim());
      const invalidCount = parsed.tasks.length - valid.length;
      if (!valid.length) throw new Error('Không có dòng hợp lệ có rewrittenText để nộp.');
      if (!window.confirm(`Tìm thấy ${valid.length} bản hợp lệ${invalidCount ? `, bỏ qua ${invalidCount} dòng lỗi/trống` : ''}. Nộp ngay?`)) return;
      const results = await Promise.allSettled(valid.map((row: any) => { const task: any = ownTasks.get(String(row.taskId)); const versionId = String(task.datasetVersionId || row.datasetVersionId || ''); return versionId ? stage4Api.submitRewrite(versionId, String(row.taskId), String(row.rewrittenText).trim(), row.revision) : Promise.reject(new Error('Missing version')); }));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      setOfflineMessage(`Đã nộp ${succeeded}/${valid.length} bản rewrite${invalidCount ? `; bỏ qua ${invalidCount} dòng lỗi` : ''}.`); refreshNow();
    } catch (error: any) { setOfflineMessage(`Không thể import: ${error.message || 'File không hợp lệ'}`); }
    finally { setIsImportingRewrite(false); if (rewriteFileRef.current) rewriteFileRef.current.value = ''; }
  };
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
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? order.medium) - (order[b.priority] ?? order.medium);
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
    return firstUser?.content || 'No student request found in context.';
  };

  const getVisibleRewriteMessages = (task: any) => {
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
            <h2>Task cua toi</h2>
            <p className="st-subtitle">Xem va thuc hien cac task duoc giao</p>
          </div>
        </div>
        <button className="st-btn-refresh" onClick={refreshNow}>
          <RefreshCw size={16} />
          Lam moi
        </button>
      </div>

      {/* Task Type Tabs */}
      <div className="st-tabs-container">
        <button
          className={`st-tab-btn ${taskType === 'labeling' ? 'active labeling' : ''}`}
          onClick={() => setTaskType('labeling')}
        >
          Task Gan nhan
        </button>
        <button
          className={`st-tab-btn ${taskType === 'rewrite' ? 'active crosscheck' : ''}`}
          onClick={() => setTaskType('rewrite')}
        >
          Task Rewrite
        </button>
      </div>

      {/* Stats */}
      <div className="st-stats">
        <div className="st-stat-card">
          <div className="st-stat-icon total"><ClipboardList size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.total}</span>
            <span className="st-stat-label">Tong Task</span>
          </div>
        </div>
        <div className="st-stat-card">
          <div className="st-stat-icon progress"><AlertCircle size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.inProgress}</span>
            <span className="st-stat-label">Dang thuc hien</span>
          </div>
        </div>
        <div className="st-stat-card">
          <div className="st-stat-icon submitted"><CheckCircle size={20} /></div>
          <div className="st-stat-info">
            <span className="st-stat-value">{stats.submitted}</span>
            <span className="st-stat-label">Da Submit</span>
          </div>
        </div>
      </div>

      {taskType === 'rewrite' && (
        <section className="st-offline-rewrite">
          <div className="st-offline-copy"><span className="st-offline-icon"><FileJson size={20}/></span><div><strong>Làm Rewrite offline</strong><p>Tải batch về, chỉ sửa trường <code>rewrittenText</code>, rồi upload để nộp hàng loạt.</p></div></div>
          <div className="st-offline-actions">
            <button type="button" onClick={downloadRewriteBatch} disabled={!rewriteTasks.length}><Download size={16}/> Tải file JSON</button>
            <button type="button" className="primary" onClick={()=>rewriteFileRef.current?.click()} disabled={isImportingRewrite}><Upload size={16}/> {isImportingRewrite?'Đang kiểm tra…':'Upload & Nộp'}</button>
            <input ref={rewriteFileRef} type="file" accept="application/json,.json" hidden onChange={e=>e.target.files?.[0]&&importRewriteBatch(e.target.files[0])}/>
          </div>
          {offlineMessage&&<div className="st-offline-message" role="status">{offlineMessage}</div>}
        </section>
      )}

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
              {key === 'all' ? 'Tat ca' : STATUS_CONFIG[key]?.label}
            </button>
          ))}
        </div>
        <div className="st-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="st-sort-select">
            <option value="deadline">Deadline gan nhat</option>
            <option value="priority">Uu tien cao nhat</option>
            <option value="newest">Moi nhat</option>
          </select>
        </div>
      </div>

      {/* Task Cards */}
      <div className="st-task-grid">
        {filtered.length === 0 && (
          <div className="st-empty">
            <ClipboardList size={48} />
            <p>Khong co task nao.</p>
          </div>
        )}

        {filtered.map(task => {
          const totalSamples = Number(task.totalSamples) || 0;
          const labeledCount = Number(task.labeledCount) || 0;
          const progress = totalSamples > 0 ? Math.min(100, Math.round((labeledCount / totalSamples) * 100)) : 0;
          const statusInfo = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending;
          const priInfo = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
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
                    <span>Co loi: <strong>{task.rewriteTask.reason}</strong></span>
                  </div>
                )}
                {task.taskType === 'rewrite' && (
                  <div className="st-meta-row">
                    <BarChart2 size={13} />
                    <span>
                      Context: <strong>{task.rewriteTask?.contextMode || 'n-2:n+2'}</strong>
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
                  <span>Deadline: <strong>{task.deadline || 'No deadline'}</strong></span>
                  {overdue && <span className="st-overdue-tag">Qua han!</span>}
                  {nearDl && <span className="st-near-tag">Sap het han</span>}
                </div>
                <div className="st-meta-row">
                  <Users size={13} />
                  <span>Supervisor: {task.supervisor}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="st-card-progress">
                <div className="st-progress-header">
                  <span>Tien do</span>
                  <span className="st-progress-num">{task.labeledCount}/{task.totalSamples} ({progress}%)</span>
                </div>
                <div className="st-progress-bar">
                  <div className="st-progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
              </div>

              {task.disableAi && (
                <div className="st-ai-disabled-badge">AI suggestions disabled</div>
              )}

              {task.taskType === 'rewrite' ? (
                <button
                  className={`st-open-btn ${task.status === 'submitted' ? 'disabled' : ''}`}
                  disabled={task.status === 'submitted'}
                  onClick={() => {
                    setRewriteDraftTask(task);
                    setRewriteDraftText(task.rewriteTask?.submittedText || getTargetAiResponse(task));
                    setRewriteContextMode('n-2:n+2');
                  }}
                >
                  <ChevronRight size={16} />
                  {task.status === 'submitted' ? 'Da Submit' : 'Rewrite AI response'}
                </button>
              ) : (
                <button
                  className={`st-open-btn ${task.status === 'submitted' ? 'disabled' : ''}`}
                  onClick={() => task.status !== 'submitted' && onOpenTask && onOpenTask(task)}
                  disabled={task.status === 'submitted'}
                >
                  <ChevronRight size={16} />
                  {task.status === 'submitted' ? 'Da Submit' : task.status === 'pending' ? 'Bat dau Task' : 'Tiep tuc gan nhan'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {rewriteDraftTask && (
        <div className="st-modal-backdrop" onClick={() => !isSubmittingRewrite && setRewriteDraftTask(null)}>
          <div className="st-rewrite-modal" onClick={(e) => e.stopPropagation()}>
            <div className="st-rewrite-modal-header">
              <div>
                <h3>Rewrite target AI response</h3>
                <p>
                  {rewriteDraftTask.name}
                  {rewriteDraftTask.rewriteTask?.targetMessageIndex != null ? ` · turn #${Number(rewriteDraftTask.rewriteTask.targetMessageIndex) + 1}` : ''}
                  {rewriteDraftTask.rewriteTask?.contextMode ? ` · ${rewriteDraftTask.rewriteTask.contextMode}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setRewriteDraftTask(null)} disabled={isSubmittingRewrite}>×</button>
            </div>
            {rewriteDraftTask.rewriteTask?.reason && rewriteDraftTask.rewriteTask.reason !== 'None' && (
              <div className="st-rewrite-issue">
                <AlertCircle size={15} />
                <span>Co loi: {rewriteDraftTask.rewriteTask.reason}</span>
              </div>
            )}
            <div className="st-rewrite-helper">
              Rewrite only the AI tutor response below. Use the student request and optional context to keep the answer aligned.
            </div>
            <div className="st-rewrite-workbench">
              <section className="st-rewrite-panel student">
                <div className="st-rewrite-panel-title">1. Student request</div>
                <div className="st-rewrite-panel-body">{getStudentRequestForRewrite(rewriteDraftTask)}</div>
              </section>
              <section className="st-rewrite-panel original">
                <div className="st-rewrite-panel-title">2. AI response needing rewrite</div>
                <div className="st-rewrite-panel-body">{getTargetAiResponse(rewriteDraftTask) || '(no target AI response found)'}</div>
              </section>
              <section className="st-rewrite-panel revised">
                <div className="st-rewrite-panel-title">3. Revised response</div>
                <div className="st-rewrite-ai-row">
                  <span>Write manually or use AI as a draft, then edit before submitting.</span>
                  <button
                    type="button"
                    disabled={isSuggestingRewrite || isSubmittingRewrite}
                    onClick={() => {
                      const versionId = rewriteDraftTask.datasetVersionId || localStorage.getItem('current_version_id');
                      if (!versionId) {
                        alert('Missing dataset version, cannot generate AI suggestion.');
                        return;
                      }
                      setIsSuggestingRewrite(true);
                      stage4Api.suggestRewrite(versionId, rewriteDraftTask.id)
                        .then((res) => setRewriteDraftText(res.suggestedText || rewriteDraftText))
                        .catch((err) => alert(err?.response?.data?.error || 'Failed to generate AI rewrite suggestion.'))
                        .finally(() => setIsSuggestingRewrite(false));
                    }}
                  >
                    {isSuggestingRewrite ? 'Generating...' : 'AI suggest'}
                  </button>
                </div>
                <textarea
                  value={rewriteDraftText}
                  onChange={(e) => setRewriteDraftText(e.target.value)}
                  placeholder="Write only the corrected AI tutor response here..."
                  className="st-rewrite-textarea"
                  disabled={isSubmittingRewrite}
                />
              </section>
            </div>
            <div className="st-rewrite-context-toolbar">
              <div className="st-rewrite-section-title">Optional conversation context</div>
              <select value={rewriteContextMode} onChange={(e) => setRewriteContextMode(e.target.value)}>
                {rewriteContextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="st-rewrite-conversation">
              {getVisibleRewriteMessages(rewriteDraftTask).map((message: any, index: number) => (
                <div key={`${message.role}-${index}`} className={`st-rewrite-message ${message.role === 'assistant' ? 'assistant' : 'user'} ${message.isTarget ? 'target' : ''}`}>
                  <div className="st-rewrite-message-role">
                    {message.role === 'assistant' ? 'AI Tutor' : 'Student'}
                    {message.isTarget && <span>Co loi</span>}
                  </div>
                  <div className="st-rewrite-message-content">{message.content}</div>
                </div>
              ))}
            </div>
            <div className="st-rewrite-modal-actions">
              <button type="button" className="st-modal-secondary" onClick={() => setRewriteDraftTask(null)} disabled={isSubmittingRewrite}>Cancel</button>
              <button
                type="button"
                className="st-modal-primary"
                disabled={isSubmittingRewrite || !rewriteDraftText.trim()}
                onClick={() => {
                  const versionId = rewriteDraftTask.datasetVersionId || localStorage.getItem('current_version_id');
                  if (!versionId) {
                    alert('Missing dataset version, cannot submit rewrite.');
                    return;
                  }
                  setIsSubmittingRewrite(true);
                  stage4Api.submitRewrite(versionId, rewriteDraftTask.id, rewriteDraftText.trim())
                    .then((res) => {
                      const next = rewriteTasks.map((rewriteTask: any) => rewriteTask.id === rewriteDraftTask.id ? res.task : rewriteTask);
                      setRewriteTasks(next);
                      setRewriteDraftTask(null);
                      setRewriteDraftText('');
                    })
                    .catch((err) => alert(err?.response?.data?.error || 'Failed to submit rewrite.'))
                    .finally(() => setIsSubmittingRewrite(false));
                }}
              >
                {isSubmittingRewrite ? 'Submitting...' : 'Submit replacement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffTasksView;
