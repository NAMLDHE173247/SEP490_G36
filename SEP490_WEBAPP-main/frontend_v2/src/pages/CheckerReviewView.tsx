import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  ChevronRight,
  FolderKanban,
  Eye,
  FileEdit,
  CheckSquare,
  Clock,
  X
} from 'lucide-react';
import { api, type AssignmentConflictItem } from '../services/api';
import { getAuthToken } from '../services/authSession';
import CheckerConflictDialog from '../components/CheckerConflictDialog';
import { toast } from 'react-hot-toast';
import '../styles/checkerreview.css';

type QueueItem = AssignmentConflictItem & {
  versionId: string; taskName: string; datasetName: string; task: any;
  resultId?: string; modelScores?: any; humanScore?: number | null; sampleData?: any;
  averageOverall?: number | null; severity?: number;
  reviewerRows?: ReviewRow[];
};
type ReviewRow = {
  assignmentId: string; sampleIndex: number; sampleId: string; versionId: string; projectId: string;
  assigneeId?: string; assigneeName: string; reviewStatus: string; preview: string; label: any; taskName: string; datasetName: string;
};
type ReviewGroup = {
  key: string; versionId: string; sampleId: string; sampleIndex: number; preview: string; taskName: string; datasetName: string; rows: ReviewRow[]; conflictItem?: QueueItem;
};
type Props = { onOpenTask: (task: any, batchId?: string | null) => void };

const PAGE_SIZE = 8;
const LOGS_PAGE_SIZE = 6;

export default function CheckerReviewView({ onOpenTask: _onOpenTask }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [projectCatalog, setProjectCatalog] = useState<any[]>([]);
  const [rewriteCountsByVersion, setRewriteCountsByVersion] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [projectStatus, setProjectStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'severity' | 'deadline'>('severity');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QueueItem | null>(null);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'conflicts' | 'history' | 'logs' | 'rewrites' | 'rewrite_history'>('conflicts');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSortOrder, setLogsSortOrder] = useState<'desc' | 'asc'>('desc');
  const [logsActionFilter, setLogsActionFilter] = useState('all');
  const [logsQuery, setLogsQuery] = useState('');

  const [rewriteTasks, setRewriteTasks] = useState<any[]>([]);
  const [rewriteQuery, setRewriteQuery] = useState('');
  const [loadingRewrites, setLoadingRewrites] = useState(false);
  const [reviewingRewrite, setReviewingRewrite] = useState<any | null>(null);
  const [rewriteReviewNote, setRewriteReviewNote] = useState('');
  const [isSubmittingRewriteReview, setIsSubmittingRewriteReview] = useState(false);

  const fetchRewriteAssignments = async () => {
    setLoadingRewrites(true);
    try {
      const res = await api.get('/dataprep/stage4/rewrite-assignments');
      const rows = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
      setRewriteTasks(selectedVersionId ? rows.filter((task: any) => String(task.datasetVersionId) === String(selectedVersionId)) : rows);
    } catch (e) {
      console.error('Failed to fetch rewrite tasks', e);
    } finally {
      setLoadingRewrites(false);
    }
  };

  const fetchLogs = async (vId = selectedVersionId, silent = false) => {
    if (!vId) return;
    if (!silent) setLoadingLogs(true);
    try {
      const res = await api.get(`/dataprep/versions/${vId}/assignments/checker-logs`);
      if (res.data?.success) {
        setActivityLogs(res.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching checker logs:', err);
    } finally {
      if (!silent) setLoadingLogs(false);
    }
  };

  const loadQueue = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const overview = await api.get('/dataprep/assignments/manager/overview');
      const tasks = overview.data?.success ? overview.data.data ?? [] : [];

      const reviewableTasks = Array.from(new Map(tasks.map((task: any) => [
        String(task.datasetVersionId || task.versionId || task.version || task._id || task.id || '').split('_')[0], task
      ])).values()) as any[];
      setProjectCatalog(reviewableTasks);

      const results = await Promise.allSettled(reviewableTasks.map(async (task: any) => {
        const versionId = String(task.datasetVersionId || task.versionId || task.version || task._id || task.id || '').split('_')[0];
        if (!versionId) return [];
        const staffConflictResponse = await api.get(`/dataprep/versions/${versionId}/assignments/conflicts`);
        const common = { versionId, taskName: task.name || task.taskName || 'Task chưa đặt tên', datasetName: task.dataset || task.datasetName || task.projectName || 'Dataset', task };
        const staffItems: QueueItem[] = (staffConflictResponse.data?.conflicts || []).map((conflict: any) => ({ ...conflict, ...common }));
        return staffItems;
      }));

      const reviewResults = await Promise.allSettled(reviewableTasks.map(async (task: any) => {
        const versionId = String(task.datasetVersionId || task.versionId || task.version || task._id || task.id || '').split('_')[0];
        if (!versionId) return [];
        const res = await api.get('/dataprep/assignments/review-queue', { params: { versionId, status: 'all', limit: 100 } });
        const rows = (res.data?.data || []) as any[];
        return rows
          .filter(row => ['submitted', 'approved'].includes(String(row.reviewStatus || '')))
          .map(row => ({
            ...row,
            taskName: task.name || task.taskName || 'Task chưa đặt tên',
            datasetName: task.dataset || task.datasetName || task.projectName || 'Dataset',
          })) as ReviewRow[];
      }));

      const rewriteResults = await Promise.allSettled(reviewableTasks.map(async (task: any) => {
        const versionId = String(task.datasetVersionId || task.versionId || task.version || task._id || task.id || '').split('_')[0];
        if (!versionId) return { versionId, pending: 0 };
        const res = await api.get(`/dataprep/versions/${versionId}/quality/rewrite-assignments`);
        const rows = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
        return { versionId, pending: rows.filter((row: any) => ['submitted', 'checker_approved'].includes(String(row.status))).length };
      }));

      const merged = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const unique = Array.from(new Map(merged.map(item => [`${item.versionId}-${item.sampleId}`, item])).values());
      const submittedRows = reviewResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const uniqueRows = Array.from(new Map(submittedRows.map(row => [row.assignmentId, row])).values());
      const rewriteCountMap: Record<string, number> = {};
      rewriteResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.versionId) rewriteCountMap[result.value.versionId] = result.value.pending;
      });

      unique.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0;
        if (sortBy === 'deadline') {
          const dA = new Date(a.task?.dueDate || '2099-01-01').getTime();
          const dB = new Date(b.task?.dueDate || '2099-01-01').getTime();
          if (dA !== dB) return dA - dB;
        }
        const severityA = 1 - Number(a.agreementScore ?? 1);
        const severityB = 1 - Number(b.agreementScore ?? 1);
        return severityB - severityA;
      });
      setItems(unique);
      setReviewRows(uniqueRows);
      setRewriteCountsByVersion(rewriteCountMap);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Không thể tải danh sách cần quyết định.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadQueue(true);
    }, 30000);

    // Bật SSE realtime để nhận thông báo nhân viên nộp bài
    const token = getAuthToken();
    const sseUrl = `${api.defaults.baseURL}/dataprep/assignments/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const eventSource = new EventSource(sseUrl);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'assignment_updated' && data.action === 'submit') {
          toast('Một nhân viên vừa nộp bài, danh sách Conflict đang được cập nhật!', { icon: '🔄' });
          void loadQueue(true);
        }
      } catch (err) {
        // ignore JSON parse error
      }
    };

    return () => {
      window.clearInterval(timer);
      eventSource.close();
    };
  }, [sortBy]);

  useEffect(() => {
    setPage(1);
    setLogsPage(1);
  }, [query, sortBy, selectedVersionId, activeTab]);

  useEffect(() => {
    if (selectedVersionId) {
      void fetchLogs(selectedVersionId);
      void fetchRewriteAssignments();
    }
  }, [selectedVersionId]);

  const projects = useMemo(() => {
    const map = new Map<string, {
      versionId: string;
      projectName: string;
      datasetName: string;
      task: any;
      conflicts: QueueItem[];
      reviewRows: ReviewRow[];
      quickReviews: ReviewGroup[];
      overlapReviews: ReviewGroup[];
      resolvedConflictsCount: number;
      pendingConflictsCount: number;
      rewritePendingCount: number;
    }>();

    projectCatalog.forEach(task => {
      const vid = String(task.datasetVersionId || task.versionId || task.version || task._id || task.id || '').split('_')[0];
      if (!vid || map.has(vid)) return;
      map.set(vid, {
        versionId: vid,
        projectName: task.name || task.taskName || 'Dự án chưa đặt tên',
        datasetName: task.dataset || task.datasetName || task.projectName || 'Dataset',
        task,
        conflicts: [], reviewRows: [], quickReviews: [], overlapReviews: [],
        resolvedConflictsCount: 0, pendingConflictsCount: 0,
        rewritePendingCount: rewriteCountsByVersion[vid] || 0,
      });
    });

    items.forEach(item => {
      const vid = item.versionId;
      if (!map.has(vid)) {
        map.set(vid, {
          versionId: vid,
          projectName: item.taskName,
          datasetName: item.datasetName,
          task: item.task,
          conflicts: [],
          reviewRows: [],
          quickReviews: [],
          overlapReviews: [],
          resolvedConflictsCount: 0,
          pendingConflictsCount: 0,
          rewritePendingCount: rewriteCountsByVersion[vid] || 0
        });
      }
      const p = map.get(vid)!;
      p.conflicts.push(item);
      if (item.status === 'pending') {
        p.pendingConflictsCount++;
      } else if (item.status === 'published') {
        p.resolvedConflictsCount++;
      }
    });

    reviewRows.forEach(row => {
      const vid = row.versionId;
      if (!map.has(vid)) {
        map.set(vid, {
          versionId: vid,
          projectName: row.taskName,
          datasetName: row.datasetName,
          task: null,
          conflicts: [],
          reviewRows: [],
          quickReviews: [],
          overlapReviews: [],
          resolvedConflictsCount: 0,
          pendingConflictsCount: 0,
          rewritePendingCount: rewriteCountsByVersion[vid] || 0
        });
      }
      map.get(vid)!.reviewRows.push(row);
    });

    map.forEach((p) => {
      const activeConflicts = p.conflicts.filter(c => c.status !== 'published');
      const conflictBySample = new Map(activeConflicts.map(c => [`${c.versionId}-${c.sampleId}`, c]));
      const sampleMap = new Map<string, ReviewGroup>();

      // Chỉ đưa conflict chưa publish vào khu vực phân xử. Conflict đã chốt nằm ở tab lịch sử.
      activeConflicts.forEach(c => {
        const key = `${c.versionId}-${c.sampleId}`;
        if (!sampleMap.has(key)) {
          sampleMap.set(key, {
            key,
            versionId: c.versionId,
            sampleId: c.sampleId,
            sampleIndex: c.sampleIndex || 0,
            preview: c.sampleData?.preview || '',
            taskName: c.taskName,
            datasetName: c.datasetName,
            rows: [],
            conflictItem: c
          });
        }
      });

      p.reviewRows.forEach(row => {
        const key = `${row.versionId}-${row.sampleId}`;
        if (!sampleMap.has(key)) {
          sampleMap.set(key, {
            key,
            versionId: row.versionId,
            sampleId: row.sampleId,
            sampleIndex: row.sampleIndex,
            preview: row.preview,
            taskName: row.taskName,
            datasetName: row.datasetName,
            rows: [],
            conflictItem: conflictBySample.get(key)
          });
        }
        sampleMap.get(key)!.rows.push(row);
      });

      const pGroups = Array.from(sampleMap.values()).sort((a, b) => a.sampleIndex - b.sampleIndex);

      p.quickReviews = pGroups.filter(g => g.rows.length === 1 && !g.conflictItem && g.rows[0]?.reviewStatus === 'submitted');
      p.overlapReviews = pGroups.filter(g => !!g.conflictItem && g.rows.length >= 2);
    });

    return Array.from(map.values())
      .filter(project => project.overlapReviews.length + project.quickReviews.length + project.resolvedConflictsCount > 0)
      .sort((a, b) => {
        const pendingA = a.overlapReviews.length + a.quickReviews.length;
        const pendingB = b.overlapReviews.length + b.quickReviews.length;
        if ((pendingA > 0) !== (pendingB > 0)) return pendingA > 0 ? -1 : 1;
        return a.projectName.localeCompare(b.projectName, 'vi');
      });
  }, [items, reviewRows, projectCatalog, rewriteCountsByVersion]);

  const selectedProject = useMemo(() => {
    if (!selectedVersionId) return null;
    return projects.find(p => p.versionId === selectedVersionId) || null;
  }, [projects, selectedVersionId]);

  const filteredProjects = useMemo(() => projects.filter(project => {
    const pending = project.overlapReviews.length + project.quickReviews.length + project.rewritePendingCount;
    if (projectStatus === 'pending') return pending > 0;
    if (projectStatus === 'completed') return pending === 0;
    return true;
  }), [projects, projectStatus]);

  const overallKPIs = useMemo(() => {
    let totalPendingConflicts = 0;
    let totalResolved = 0;
    projects.forEach(p => {
      totalPendingConflicts += p.overlapReviews.length;
      totalResolved += p.resolvedConflictsCount;
    });
    return {
      totalProjects: projects.length,
      totalPendingConflicts,
      totalResolved
    };
  }, [projects]);

  const sortedLogs = useMemo(() => {
    const normalizedQuery = logsQuery.trim().toLowerCase();
    const logsCopy = activityLogs.filter(log => {
      const matchesAction = logsActionFilter === 'all' || log.action === logsActionFilter;
      const haystack = `${log.userName || ''} ${log.userEmail || ''} ${log.sampleKey || ''} ${log.details || ''}`.toLowerCase();
      return matchesAction && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
    logsCopy.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return logsSortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
    return logsCopy;
  }, [activityLogs, logsSortOrder, logsActionFilter, logsQuery]);

  const logsTotalPages = Math.ceil(sortedLogs.length / LOGS_PAGE_SIZE) || 1;
  const visibleLogs = useMemo(() => {
    const start = (logsPage - 1) * LOGS_PAGE_SIZE;
    return sortedLogs.slice(start, start + LOGS_PAGE_SIZE);
  }, [sortedLogs, logsPage]);

  const pendingRewriteTasks = useMemo(() => {
    const normalizedQuery = rewriteQuery.trim().toLowerCase();
    return rewriteTasks.filter(task => {
      if (!['submitted', 'checker_approved'].includes(String(task.status))) return false;
      const haystack = `${task.convId || ''} ${task.assigneeName || task.assigneeId?.name || ''} ${task.reason || ''} ${task.submittedText || ''}`.toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    });
  }, [rewriteTasks, rewriteQuery]);
  const resolvedRewriteTasks = useMemo(() => rewriteTasks.filter(task =>
    ['approved', 'rejected'].includes(String(task.status))
  ), [rewriteTasks]);

  const selectProject = (pId: string) => {
    const proj = projects.find(p => p.versionId === pId);
    setSelectedVersionId(pId);
    if (proj) {
      if (proj.overlapReviews.length > 0) {
        setActiveTab('conflicts');
      } else if (proj.rewritePendingCount > 0) {
        setActiveTab('rewrites');
      } else {
        setActiveTab('history');
      }
    }
  };

  const overlapTotal = selectedProject?.overlapReviews.length || 0;
  const overlapTotalPages = Math.max(1, Math.ceil(overlapTotal / PAGE_SIZE));
  const overlapPage = Math.min(page, overlapTotalPages);
  const visibleOverlapReviews = selectedProject?.overlapReviews.slice((overlapPage - 1) * PAGE_SIZE, overlapPage * PAGE_SIZE) || [];
  const historyItems = selectedProject?.conflicts.filter(item => item.status === 'published') || [];
  const filteredHistoryItems = historyItems.filter(item => {
    const matchQuery = `${item.taskName} ${item.datasetName} ${item.sampleKey} ${item.sampleIndex}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchQuery;
  });
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryItems.length / PAGE_SIZE));
  const historyPage = Math.min(page, historyTotalPages);
  const visibleHistoryItems = filteredHistoryItems.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

  return (
    <main className="sv-page">
      <header className="sv-header compact">
        <div>
          <h1><ShieldCheck size={24} className="sv-header-icon" /> Trung tâm duyệt nhãn (Checker)</h1>
          <p>
            {selectedProject
              ? `Workspace của dự án: ${selectedProject.projectName}`
              : "Bảng điều khiển chung cho checker - Quản lý duyệt và phân xử nhãn hội thoại"}
          </p>
        </div>
        <button className="sv-button secondary" onClick={() => { void loadQueue(false); }}>
          <RefreshCw size={16} className={loading ? 'sv-spin' : ''} /> Tải lại dữ liệu
        </button>
      </header>

      {error && (
        <section className="sv-state error-banner">
          <AlertTriangle size={20} />
          <div>
            <strong>Lỗi tải dữ liệu:</strong> {error}
          </div>
        </section>
      )}

      {!selectedVersionId ? (
        <div className="sv-dashboard-layout">
          <section className="sv-kpis">
            <article className="kpi-card">
              <span className="sv-kpi-icon accent"><FolderKanban size={20} /></span>
              <div>
                <strong>{overallKPIs.totalProjects}</strong>
                <span>Dự án đang quản lý</span>
              </div>
            </article>
            <article className="kpi-card">
              <span className="sv-kpi-icon danger"><AlertTriangle size={20} /></span>
              <div>
                <strong>{overallKPIs.totalPendingConflicts}</strong>
                <span>Mẫu trùng/xung đột cần đối chiếu</span>
              </div>
            </article>
            <article className="kpi-card">
              <span className="sv-kpi-icon success"><CheckCircle2 size={20} /></span>
              <div>
                <strong>{overallKPIs.totalResolved}</strong>
                <span>Mẫu xung đột đã chốt</span>
              </div>
            </article>
          </section>

          <section className="sv-project-directory">
            <div className="directory-header">
              <h2>Danh sách dự án hoạt động</h2>
              <p>Chọn một dự án để xem danh sách chi tiết và giải quyết xung đột nhãn.</p>
              <div className="checker-project-filters">
                <label htmlFor="checker-project-status">Trạng thái dự án</label>
                <select id="checker-project-status" value={projectStatus} onChange={event => setProjectStatus(event.target.value as typeof projectStatus)}>
                  <option value="all">Tất cả</option>
                  <option value="pending">Cần xử lý</option>
                  <option value="completed">Đã hoàn thành</option>
                </select>
              </div>
            </div>

            {loading && items.length === 0 ? (
              <div className="sv-skeletons">
                {[1, 2, 3].map(i => <div key={i} className="sv-skeleton" />)}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="sv-state empty-state">
                <Inbox size={48} />
                <h3>Không tìm thấy dữ liệu dự án</h3>
                <p>Hiện tại không có tác vụ gán nhãn nào cần xử lý hoặc các tác vụ đang trống.</p>
              </div>
            ) : (
              <div className="project-grid">
                {filteredProjects.map(p => {
                  const totalConflicts = p.overlapReviews.length + p.resolvedConflictsCount;
                  const resolved = p.resolvedConflictsCount;
                  const pct = totalConflicts > 0 ? Math.round((resolved / totalConflicts) * 100) : 100;
                  const pendingTotal = p.overlapReviews.length + p.quickReviews.length;

                  return (
                    <article key={p.versionId} className="project-card" onClick={() => selectProject(p.versionId)}>
                      <div className="project-card-body">
                        <span className="project-tag">Dataset Version</span>
                        <h3 className="project-title">{p.projectName}</h3>
                        <p className="project-dataset-name">{p.datasetName}</p>

                        <div className="project-progress-container">
                          <div className="progress-labels">
                            <span>Tiến độ duyệt nhãn</span>
                            <span>{resolved}/{totalConflicts} ({pct}%)</span>
                          </div>
                          <div className="sv-task-progress"><span style={{ width: `${pct}%` }} /></div>
                        </div>

                        <div className="project-mini-kpis">
                          <div className="mini-kpi purple">
                            <strong>{p.overlapReviews.length}</strong>
                            <span>Phân xử</span>
                          </div>
                          <div className="mini-kpi green">
                            <strong>{resolved}</strong>
                            <span>Đã chốt</span>
                          </div>
                        </div>
                      </div>
                      <div className="project-card-footer">
                        <span>{pendingTotal > 0 ? `Có ${pendingTotal} mục cần xử lý` : "Hoàn thành tác vụ"}</span>
                        <button className="sv-open-btn primary-btn">
                          Bắt đầu thẩm định <ChevronRight size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="sv-workspace-layout">
          <div className="workspace-header">
            <button className="back-btn" onClick={() => setSelectedVersionId(null)}>
              <ArrowLeft size={16} /> Quay lại danh sách dự án
            </button>
            <div className="workspace-meta">
              <span className="version-id-badge">ID: {selectedProject?.versionId}</span>
              <h2>Dự án: {selectedProject?.projectName}</h2>
              <p>Dataset: {selectedProject?.datasetName}</p>
            </div>

            <div className="workspace-kpis">
              <div className="wkpi purple">
                <strong>{selectedProject?.overlapReviews.length}</strong>
                <span>Phân xử</span>
              </div>
              <div className="wkpi green">
                <strong>{selectedProject?.resolvedConflictsCount}</strong>
                <span>Đã chốt</span>
              </div>
            </div>
          </div>

          <div className="sv-workspace-tabs">
            <button
              className={activeTab === 'conflicts' ? 'active' : ''}
              onClick={() => setActiveTab('conflicts')}
            >
              Phân xử nhãn <span>{selectedProject?.overlapReviews.length}</span>
            </button>
            <button
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => setActiveTab('history')}
            >
              Nhãn đã chốt <span>{selectedProject?.resolvedConflictsCount}</span>
            </button>
            <button
              className={activeTab === 'logs' ? 'active' : ''}
              onClick={() => {
                setActiveTab('logs');
                if (selectedVersionId) {
                  void fetchLogs(selectedVersionId);
                }
              }}
            >
              Nhật ký hoạt động <span>{activityLogs.length}</span>
            </button>
          </div>

          <div className="workspace-tab-content">
            {activeTab === 'conflicts' && (
              <section className="sv-queue">
                {selectedProject?.overlapReviews.length === 0 ? (
                  <div className="sv-state empty-state">
                    <CheckCircle2 size={40} className="success-icon" />
                    <h3>Tuyệt vời!</h3>
                    <p>Không có mẫu trùng lặp hoặc xung đột nào cần phân xử trong dự án này.</p>
                  </div>
                ) : (
                  <div className="sv-list">
                    {visibleOverlapReviews.map(group => {
                      const conflictItem: QueueItem = group.conflictItem || {
                        sampleId: group.sampleId,
                        sampleKey: group.key,
                        sampleIndex: group.sampleIndex,
                        assigneeCount: group.rows.length,
                        agreementScore: null,
                        pendingAdjudicationCount: group.rows.length,
                        resolvedAdjudicationCount: 0,
                        status: 'pending',
                        versionId: group.versionId,
                        taskName: group.taskName,
                        datasetName: group.datasetName,
                        task: null,
                        sampleData: null
                      };
                      conflictItem.reviewerRows = group.rows;

                      return (
                        <article className="sv-overlap-card modern-overlap" key={group.key}>
                          <div className="sv-overlap-top">
                            <div>
                              <span className="sample-number">Mẫu #{group.sampleIndex}</span>
                              <h3>{group.taskName}</h3>
                              {group.preview && <p className="sample-preview">"{group.preview}"</p>}
                            </div>
                            <button
                              className="sv-open-btn action-btn adjudication-btn"
                              onClick={() => setSelected({ ...conflictItem, reviewerRows: group.rows })}
                            >
                              Phân xử nhãn
                            </button>
                          </div>

                          {group.rows.length > 0 && (
                            <div className="sv-reviewer-strip">
                              {group.rows.map(row => <span key={row.assignmentId}>{row.assigneeName}</span>)}
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {overlapTotalPages > 1 && (
                      <div className="sv-pagination compact-pagination">
                        <span>Hien {visibleOverlapReviews.length}/{overlapTotal} mau can phan xu</span>
                        <div>
                          <button disabled={overlapPage === 1} onClick={() => setPage(overlapPage - 1)}>
                            <ArrowLeft size={14} /> Truoc
                          </button>
                          <span className="page-indicator">{overlapPage}/{overlapTotalPages}</span>
                          <button disabled={overlapPage === overlapTotalPages} onClick={() => setPage(overlapPage + 1)}>
                            Sau <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'history' && (
              <section className="sv-queue">
                <div className="workspace-filters-bar">
                  <div className="filters-title">
                    <h3>Danh sách đã chốt</h3>
                    <p>{filteredHistoryItems.length} mẫu đã chốt · Trang {historyPage}/{historyTotalPages}</p>
                  </div>
                  <div className="sv-controls sv-history-controls">
                    <label className="sv-search">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Tìm task, dataset, sample..."
                      />
                    </label>
                  </div>
                </div>

                {loading && items.length === 0 ? (
                  <div className="sv-skeletons">
                    {[1, 2, 3].map(i => <div key={i} className="sv-skeleton" />)}
                  </div>
                ) : filteredHistoryItems.length === 0 ? (
                  <div className="sv-state empty-state">
                    <Inbox size={36} />
                    <h3>Không có mẫu phù hợp bộ lọc</h3>
                    <p>Hãy đổi bộ lọc hoặc chờ nhân viên hoàn tất đánh giá nhãn.</p>
                  </div>
                ) : (
                  <div className="sv-list">
                    {visibleHistoryItems.map(item => {
                      const deadlineStr = item.task?.dueDate ? new Date(item.task.dueDate).toLocaleDateString('vi-VN') : '';
                      const rows = selectedProject?.reviewRows.filter(row => row.sampleId === item.sampleId) || [];
                      return (
                        <article className="sv-history-row" key={`${item.versionId}-${item.sampleId}`}>
                          <div className="sv-history-main">
                            <span className="sv-history-badge"><CheckCircle2 size={13} /> Đã chốt</span>
                            <span className="sample-number">Mẫu #{item.sampleIndex}</span>
                            <h3>{item.taskName}</h3>
                            <p>{item.datasetName}{deadlineStr ? ` · Hạn ${deadlineStr}` : ''}</p>
                            <div className="sv-history-meta">
                              <span>{item.assigneeCount} nhân sự đánh giá</span>
                              <span>{item.resolvedAdjudicationCount || 0} mục đã xử lý</span>
                              {rows.slice(0, 2).map(row => <span key={row.assignmentId}>{row.assigneeName}</span>)}
                            </div>
                          </div>
                          <button
                            className="sv-open-btn"
                            style={{ flexShrink: 0 }}
                            onClick={() => setSelected({
                              ...item,
                              reviewerRows: rows
                            })}
                          >
                            Xem lại
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}

                {!loading && filteredHistoryItems.length > 0 && (
                  <footer className="sv-pagination sv-history-pagination">
                    <span>Hiển thị {(historyPage - 1) * PAGE_SIZE + 1}–{Math.min(historyPage * PAGE_SIZE, filteredHistoryItems.length)} / {filteredHistoryItems.length}</span>
                    <div>
                      <button disabled={historyPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                        <ArrowLeft size={14} /> Trước
                      </button>
                      {Array.from({ length: historyTotalPages }, (_, i) => i + 1)
                        .filter(n => n === 1 || n === historyTotalPages || Math.abs(n - historyPage) <= 1)
                        .map((n, i, arr) => (
                          <React.Fragment key={n}>
                            {i > 0 && n - arr[i - 1] > 1 && <span>…</span>}
                            <button className={n === historyPage ? 'active' : ''} onClick={() => setPage(n)}>
                              {n}
                            </button>
                          </React.Fragment>
                        ))}
                      <button disabled={historyPage === historyTotalPages} onClick={() => setPage(p => Math.min(historyTotalPages, p + 1))}>
                        Sau <ArrowRight size={14} />
                      </button>
                    </div>
                  </footer>
                )}
              </section>
            )}

            {activeTab === 'logs' && (
              <section className="sv-queue">
                <div className="workspace-filters-bar">
                  <div className="filters-title">
                    <h3>Nhật ký hoạt động</h3>
                    <p>Lịch sử các thao tác kiểm tra, lưu nháp và công bố nhãn của checker · Trang {logsPage}/{logsTotalPages}</p>
                  </div>
                  <div className="sv-controls">
                    <div className="sv-select">
                      <select value={logsActionFilter} onChange={(e) => { setLogsActionFilter(e.target.value); setLogsPage(1); }}>
                        <option value="all">Mọi thao tác</option>
                        <option value="publish">Chốt nhãn</option>
                        <option value="rewrite_approved">Duyệt rewrite</option>
                        <option value="rewrite_redo">Yêu cầu làm lại</option>
                        <option value="rewrite_rejected">Từ chối rewrite</option>
                      </select>
                    </div>
                    <div className="sv-search"><Search size={14} /><input value={logsQuery} onChange={(e) => { setLogsQuery(e.target.value); setLogsPage(1); }} placeholder="Tìm người, sample, nội dung..." /></div>
                    <div className="sv-select">
                      <select
                        value={logsSortOrder}
                        onChange={(e) => {
                          setLogsSortOrder(e.target.value as 'desc' | 'asc');
                          setLogsPage(1);
                        }}
                      >
                        <option value="desc">Mới nhất trước</option>
                        <option value="asc">Cũ nhất trước</option>
                      </select>
                    </div>
                    <button
                      className="sv-button secondary"
                      onClick={() => { if (selectedVersionId) void fetchLogs(selectedVersionId); }}
                      disabled={loadingLogs}
                    >
                      <RefreshCw size={14} className={loadingLogs ? 'sv-spin' : ''} /> Tải lại nhật ký
                    </button>
                  </div>
                </div>

                {loadingLogs && sortedLogs.length === 0 ? (
                  <div className="sv-skeletons">
                    {[1, 2, 3].map(i => <div key={i} className="sv-skeleton" />)}
                  </div>
                ) : sortedLogs.length === 0 ? (
                  <div className="sv-state empty-state">
                    <Inbox size={36} />
                    <h3>Chưa có hoạt động nào</h3>
                    <p>Mọi thao tác kiểm tra, sửa đổi của bạn sẽ được lưu vết tại đây.</p>
                  </div>
                ) : (
                  <div className="sv-logs-timeline">
                    {visibleLogs.map((log) => {
                      let actionText = '';
                      let actionClass = '';
                      let markerClass = '';
                      let MarkerIcon = Clock;
                      if (log.action === 'view') {
                        actionText = 'Xem mẫu';
                        actionClass = 'action-view';
                        markerClass = 'marker-view';
                        MarkerIcon = Eye;
                      } else if (log.action === 'save_draft') {
                        actionText = 'Lưu nháp';
                        actionClass = 'action-save';
                        markerClass = 'marker-save';
                        MarkerIcon = FileEdit;
                      } else if (log.action === 'publish') {
                        actionText = 'Đã chốt';
                        actionClass = 'action-publish';
                        markerClass = 'marker-publish';
                        MarkerIcon = CheckSquare;
                      } else if (log.action === 'rewrite_approved') {
                        actionText = 'Duyệt rewrite';
                        actionClass = 'action-publish';
                        markerClass = 'marker-publish';
                        MarkerIcon = CheckCircle2;
                      } else if (log.action === 'rewrite_redo') {
                        actionText = 'Yêu cầu làm lại';
                        actionClass = 'action-save';
                        markerClass = 'marker-save';
                        MarkerIcon = RefreshCw;
                      } else if (log.action === 'rewrite_rejected') {
                        actionText = 'Từ chối rewrite';
                        actionClass = 'action-save';
                        markerClass = 'marker-save';
                        MarkerIcon = X;
                      }

                      const dateStr = new Date(log.createdAt).toLocaleString('vi-VN');

                      return (
                        <div className="sv-log-timeline-item" key={log.id}>
                          <div className={`sv-log-timeline-marker ${markerClass}`}>
                            <MarkerIcon size={14} />
                          </div>
                          <div className="sv-log-card">
                            <div className="sv-log-header">
                              <span className={`log-badge ${actionClass}`}>
                                {actionText}
                              </span>
                              <span className="log-time">{dateStr}</span>
                            </div>

                            <div className="sv-log-body">
                              <div className="log-meta">
                                <strong>{log.userName}</strong>
                                <span className="log-email">({log.userEmail})</span>
                              </div>

                              <p className="log-details-text">
                                {log.details}
                              </p>

                              {(log.before || log.after) && (
                                <div className="log-state-transition" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                  <span style={{ padding: '4px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700 }}>
                                    {log.before?.status || '—'}
                                  </span>
                                  <ArrowRight size={13} color="#94a3b8" />
                                  <span style={{ padding: '4px 8px', borderRadius: '6px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700 }}>
                                    {log.after?.status || '—'}
                                  </span>
                                  {log.reason && <span style={{ color: '#64748b', fontSize: '12px' }}>Lý do: {log.reason}</span>}
                                </div>
                              )}

                              {log.sampleKey && (
                                <div className="log-target-ref" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', width: '100%' }}>
                                  <div>
                                    <span>Mẫu ID: <strong>{log.sampleKey}</strong></span>
                                    {log.targetScope === 'message' && log.messageIndex !== null && log.messageIndex !== undefined && (
                                      <span className="log-message-index">
                                        {' '}· Tin nhắn #{log.messageIndex + 1} ({log.messageRole === 'user' ? 'Người dùng' : 'Trợ lý'})
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    className="sv-open-btn compact-btn"
                                    onClick={async () => {
                                      try {
                                        const compRes = await api.get(`/dataprep/versions/${selectedVersionId}/assignments/samples/${log.sampleId}/comparison`);
                                        const comparison = compRes.data;

                                        const rqRes = await api.get('/dataprep/assignments/review-queue', {
                                          params: { versionId: selectedVersionId, limit: 200 }
                                        });
                                        const allRows = rqRes.data?.data || [];
                                        const matchedRows = allRows
                                          .filter((r: any) => String(r.sampleId) === String(log.sampleId))
                                          .map((r: any) => ({
                                            ...r,
                                            taskName: selectedProject?.projectName || 'Dự án',
                                            datasetName: selectedProject?.datasetName || 'Dataset',
                                          }));

                                        setSelected({
                                          sampleId: log.sampleId,
                                          sampleKey: log.sampleKey || comparison.sample?.sampleKey || '',
                                          sampleIndex: comparison.sample?.sampleIndex ?? 0,
                                          assigneeCount: matchedRows.length,
                                          agreementScore: comparison.agreementScore ?? null,
                                          pendingAdjudicationCount: comparison.pendingAdjudicationCount ?? 0,
                                          resolvedAdjudicationCount: 0,
                                          status: comparison.pendingAdjudicationCount === 0 ? 'published' : 'pending',
                                          versionId: selectedVersionId!,
                                          taskName: selectedProject?.projectName || 'Dự án',
                                          datasetName: selectedProject?.datasetName || 'Dataset',
                                          task: null,
                                          sampleData: comparison.sample,
                                          reviewerRows: matchedRows
                                        });
                                      } catch (err) {
                                        console.error("Error opening log detail:", err);
                                        alert("Không thể tải chi tiết mẫu cho log này.");
                                      }
                                    }}
                                  >
                                    Xem chi tiết
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!loadingLogs && sortedLogs.length > 0 && (
                  <footer className="sv-pagination">
                    <span>Hiển thị {(logsPage - 1) * LOGS_PAGE_SIZE + 1}–{Math.min(logsPage * LOGS_PAGE_SIZE, sortedLogs.length)} / {sortedLogs.length}</span>
                    <div>
                      <button disabled={logsPage === 1} onClick={() => setLogsPage(p => Math.max(1, p - 1))}>
                        <ArrowLeft size={14} /> Trước
                      </button>
                      {Array.from({ length: logsTotalPages }, (_, i) => i + 1)
                        .filter(n => n === 1 || n === logsTotalPages || Math.abs(n - logsPage) <= 1)
                        .map((n, i, arr) => (
                          <React.Fragment key={n}>
                            {i > 0 && n - arr[i - 1] > 1 && <span>…</span>}
                            <button className={n === logsPage ? 'active' : ''} onClick={() => setLogsPage(n)}>
                              {n}
                            </button>
                          </React.Fragment>
                        ))}
                      <button disabled={logsPage === logsTotalPages} onClick={() => setLogsPage(p => Math.min(logsTotalPages, p + 1))}>
                        Sau <ArrowRight size={14} />
                      </button>
                    </div>
                  </footer>
                )}
              </section>
            )}

            {activeTab === 'rewrite_history' && (
              <section className="sv-queue">
                <div className="rewrite-queue-header">
                  <div>
                    <h3>Rewrite đã chốt</h3>
                    <p>Lịch sử các bản viết lại đã được duyệt hoặc từ chối.</p>
                  </div>
                </div>
                {resolvedRewriteTasks.length === 0 ? (
                  <div className="sv-state empty-state"><Inbox size={38}/><h3>Chưa có rewrite đã chốt</h3></div>
                ) : (
                  <div className="rewrite-table-wrap">
                    <table className="rewrite-table">
                      <thead><tr><th>Sample</th><th>Staff</th><th>Lý do</th><th>Bản đã sửa</th><th>Kết quả</th></tr></thead>
                      <tbody>{resolvedRewriteTasks.map(task => (
                        <tr key={task.id}>
                          <td><strong>#{String(task.convId || task.id).substring(0, 10)}</strong></td>
                          <td>{task.staffName || task.assigneeName || 'Staff'}</td>
                          <td><span className="rewrite-reason">{task.reason || 'Yêu cầu viết lại'}</span></td>
                          <td><p className="rewrite-preview">{task.submittedText || 'Không có nội dung'}</p></td>
                          <td><span className={`rewrite-status ${task.status === 'approved' ? 'approved' : 'redo'}`}>{task.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}</span></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'rewrites' && (
              <section className="sv-queue">
                <div className="rewrite-queue-header">
                  <div>
                    <h3>Rewrite chờ kiểm duyệt</h3>
                    <p>So sánh bản gốc và bản Staff viết lại trước khi công bố.</p>
                  </div>
                  <div className="sv-search rewrite-search">
                    <Search size={15} />
                    <input value={rewriteQuery} onChange={event => setRewriteQuery(event.target.value)} placeholder="Tìm sample, Staff, lý do..." />
                  </div>
                </div>
                {loadingRewrites ? (
                  <div className="sv-skeletons">
                    {[1, 2].map(i => <div key={i} className="sv-skeleton" />)}
                  </div>
                ) : pendingRewriteTasks.length === 0 ? (
                  <div className="sv-state empty-state">
                    <CheckCircle2 size={40} className="success-icon" />
                    <h3>Tuyệt vời!</h3>
                    <p>Không có task rewrite nào đang chờ bạn kiểm duyệt trong dự án này.</p>
                  </div>
                ) : (
                  <div className="rewrite-table-wrap">
                    <table className="rewrite-table">
                      <thead><tr><th>Sample</th><th>Staff</th><th>Lý do rewrite</th><th>Bản Staff đã sửa</th><th>Trạng thái</th><th></th></tr></thead>
                      <tbody>{pendingRewriteTasks.map(task => (
                        <tr key={task.id}>
                          <td><strong>#{String(task.convId).substring(0, 10)}</strong></td>
                          <td>{task.assigneeName || task.assigneeId?.name || 'Staff'}</td>
                          <td><span className="rewrite-reason">{task.reason || 'Yêu cầu viết lại'}</span></td>
                          <td><p className="rewrite-preview">{task.submittedText || 'Chưa có nội dung'}</p></td>
                          <td><span className="rewrite-status pending">Chờ kiểm duyệt</span></td>
                          <td><button className="sv-open-btn action-btn adjudication-btn" onClick={() => { setReviewingRewrite(task); setRewriteReviewNote(''); }}>Kiểm duyệt</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {selected && (
        <CheckerConflictDialog
          item={selected}
          onClose={() => setSelected(null)}
          onCompleted={() => {
            void loadQueue();
            if (selectedVersionId) {
              void fetchLogs(selectedVersionId);
            }
          }}
        />
      )}

      {reviewingRewrite && (
        <div className="sv-modal-overlay checker-rewrite-detail-page" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#f8fafc',
          display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', zIndex: 1000,
          padding: 0
        }}>
          <div className="sv-modal checker-rewrite-detail-shell" style={{
            backgroundColor: '#fff', borderRadius: 0, width: '100%', maxWidth: 'none',
            height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: 'none',
            overflow: 'hidden'
          }}>
            <div className="sv-modal-header checker-rewrite-detail-header" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Kiểm duyệt bản viết lại #{String(reviewingRewrite.convId).substring(0, 8)}
              </h3>
              <button onClick={() => setReviewingRewrite(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b'
              }}><ArrowLeft size={18} /> Quay lại danh sách</button>
            </div>
            
            <div className="sv-modal-body checker-rewrite-detail-body" style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '12px 16px', background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                <strong style={{ color: '#991b1b', fontSize: '13px' }}>Yêu cầu / Lỗi cần viết lại:</strong>
                <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#7f1d1d' }}>{reviewingRewrite.reason}</p>
              </div>

              <section className="checker-rewrite-context" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, background: '#fff' }}>
                <h4 style={{ margin: '0 0 12px', color: '#334155' }}>Ngữ cảnh hội thoại</h4>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(reviewingRewrite.conversationMessages || []).map((message: any, index: number) => (
                    <div key={index} style={{ padding: '10px 12px', borderRadius: 8, background: message.isTarget ? '#fff7ed' : message.role === 'assistant' ? '#eef2ff' : '#f8fafc', border: message.isTarget ? '1px solid #fb923c' : '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: 11, color: '#64748b' }}>{message.role === 'assistant' ? 'AI Tutor' : 'Học sinh'}{message.isTarget ? ' · CÂU CẦN REWRITE' : ''}</strong>
                      <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', color: '#1e293b' }}>{message.content}</div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="checker-rewrite-compare" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bản gốc của AI (Original)</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#334155', whiteSpace: 'pre-wrap' }}>{reviewingRewrite.originalText}</p>
                </div>
                <div style={{ padding: '16px', background: '#eef2ff', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bản viết lại của Staff</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1e1b4b', whiteSpace: 'pre-wrap', fontWeight: 500 }}>{reviewingRewrite.submittedText}</p>
                </div>
              </div>

              <div className="ct-form-group">
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px', display: 'block' }}>Nhận xét / Ý kiến phản hồi (Bắt buộc nếu Từ chối)</label>
                <textarea
                  className="ct-input"
                  placeholder="Nhập nhận xét kiểm duyệt..."
                  value={rewriteReviewNote}
                  onChange={e => setRewriteReviewNote(e.target.value)}
                  style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                />
              </div>
            </div>

            <div className="sv-modal-footer checker-rewrite-detail-footer" style={{
              display: 'flex', justifyContent: 'flex-end', gap: '12px',
              padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <button
                className="sv-button secondary"
                onClick={() => setReviewingRewrite(null)}
                disabled={isSubmittingRewriteReview}
              >
                Hủy
              </button>
              <button
                className="sv-button danger-btn"
                style={{
                  backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px',
                  borderRadius: '8px', fontWeight: 600, cursor: 'pointer'
                }}
                disabled={isSubmittingRewriteReview || !rewriteReviewNote.trim()}
                onClick={async () => {
                  if (!rewriteReviewNote.trim()) return;
                  setIsSubmittingRewriteReview(true);
                  try {
                    await api.post(`/dataprep/versions/${selectedVersionId}/quality/rewrite-assignments/${reviewingRewrite.id}/review`, {
                      action: 'redo',
                      note: rewriteReviewNote.trim()
                    });
                    toast.success('Đã từ chối bản viết lại và yêu cầu Staff làm lại.');
                    setReviewingRewrite(null);
                    void fetchRewriteAssignments();
                    void fetchLogs(selectedVersionId);
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Có lỗi xảy ra');
                  } finally {
                    setIsSubmittingRewriteReview(false);
                  }
                }}
              >
                Từ chối & Giao lại
              </button>
              <button
                className="sv-button primary-btn"
                style={{
                  backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 16px',
                  borderRadius: '8px', fontWeight: 600, cursor: 'pointer'
                }}
                disabled={isSubmittingRewriteReview}
                onClick={async () => {
                  setIsSubmittingRewriteReview(true);
                  try {
                    await api.post(`/dataprep/versions/${selectedVersionId}/quality/rewrite-assignments/${reviewingRewrite.id}/review`, {
                      action: 'approved',
                      note: rewriteReviewNote.trim() || 'Checker approved'
                    });
                    toast.success('Đã duyệt và công bố bản viết lại thành công.');
                    setReviewingRewrite(null);
                    void fetchRewriteAssignments();
                    void fetchLogs(selectedVersionId);
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Có lỗi xảy ra');
                  } finally {
                    setIsSubmittingRewriteReview(false);
                  }
                }}
              >
                Duyệt & Chuyển lên Supervisor
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
