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
  X
} from 'lucide-react';
import { api, type AssignmentConflictItem } from '../services/api';
import SupervisorConflictDialog from '../components/SupervisorConflictDialog';
import { toast } from 'react-hot-toast';
import '../styles/supervisorreview.css';

const REWRITE_REASON_VI_MAP: Record<string, string> = {
  'None': 'Không có',
  'Direct answer too early': 'Lộ đáp án quá sớm',
  'Missing Socratic hint': 'Thiếu gợi ý Socratic',
  'Low training value': 'Giá trị huấn luyện thấp',
  'Factual error': 'Sai kiến thức',
  'Tone/language issue': 'Lỗi giọng điệu/ngôn ngữ',
  'Incomplete answer': 'Câu trả lời chưa hoàn thiện',
};

const LABEL_MAP: Record<string, string> = {
  'Completed': 'Hoàn thành',
  'Incomplete': 'Chưa hoàn thành',
  'Abandoned': 'Bỏ dở',
  'Gold': 'Tốt',
  'Rewrite': 'Cần viết lại',
  'Bad': 'Chưa đạt',
  'Chua ro': 'Chưa rõ'
};

const labelText = (value: any) => {
  const raw = String(value || '').trim();
  return LABEL_MAP[raw] || raw;
};

type QueueItem = AssignmentConflictItem & {
  versionId:string; taskName:string; datasetName:string; task:any;
  resultId?:string; modelScores?:any; humanScore?:number|null; sampleData?:any;
  averageOverall?:number|null; severity?:number;
  reviewerRows?:ReviewRow[];
};
type ReviewRow = {
  assignmentId:string; sampleIndex:number; sampleId:string; versionId:string; projectId:string;
  assigneeId?:string; assigneeName:string; reviewStatus:string; preview:string; label:any; taskName:string; datasetName:string;
  task?:any;
};
type ReviewGroup = {
  key:string; versionId:string; sampleId:string; sampleIndex:number; preview:string; taskName:string; datasetName:string; rows:ReviewRow[]; conflictItem?:QueueItem;
};
type Props = { onOpenTask:(task:any, batchId?:string|null)=>void };

const PAGE_SIZE = 8;

export default function SupervisorReviewView({ onOpenTask: _onOpenTask }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'severity'|'deadline'>('severity');
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all'|'todo'|'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all'|'high'|'medium'|'low'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QueueItem|null>(null);

  const [selectedVersionId, setSelectedVersionId] = useState<string|null>(null);
  const [activeTab, setActiveTab] = useState<'quick_reviews' | 'rewrites' | 'history'>('quick_reviews');

  const [rewriteTasks, setRewriteTasks] = useState<any[]>([]);
  const [rewriteStatusFilter, setRewriteStatusFilter] = useState<'all' | 'pending' | 'approved' | 'redo'>('all');
  const [rewriteQuery, setRewriteQuery] = useState('');
  const [loadingRewrites, setLoadingRewrites] = useState(false);
  const [reviewingRewrite, setReviewingRewrite] = useState<any | null>(null);
  const [rewriteReviewNote, setRewriteReviewNote] = useState('');
  const [isSubmittingRewriteReview, setIsSubmittingRewriteReview] = useState(false);

  const fetchRewriteAssignments = async () => {
    if (!selectedVersionId) return;
    setLoadingRewrites(true);
    try {
      const res = await api.get(`/dataprep/versions/${selectedVersionId}/quality/rewrite-assignments`);
      setRewriteTasks(res.data.tasks || []);
    } catch (e) {
      console.error('Failed to fetch rewrite tasks', e);
    } finally {
      setLoadingRewrites(false);
    }
  };

  const visibleRewriteTasks = useMemo(() => {
    const normalizedQuery = rewriteQuery.trim().toLowerCase();
    return rewriteTasks.filter(task => {
      const status = String(task.status || '');
      const statusGroup = status === 'approved' ? 'approved' : ['redo', 'rejected'].includes(status) ? 'redo' : 'pending';
      const matchesStatus = rewriteStatusFilter === 'all' || rewriteStatusFilter === statusGroup;
      const haystack = `${task.convId || ''} ${task.staffName || task.assigneeName || task.assigneeId?.name || ''} ${task.checkerName || ''} ${task.reason || ''}`.toLowerCase();
      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [rewriteTasks, rewriteStatusFilter, rewriteQuery]);

  const loadQueue = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const overview = await api.get('/dataprep/assignments/manager/overview');
      const tasks = overview.data?.success ? overview.data.data??[] : [];

      const reviewableTasks = Array.from(new Map(tasks.map((task: any) => [
        String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0], task
      ])).values()) as any[];

      const results = await Promise.allSettled(reviewableTasks.map(async (task: any) => {
        const versionId = String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0];
        if (!versionId) return [];
        const staffConflictResponse = await api.get(`/dataprep/versions/${versionId}/assignments/conflicts`);
        const common = { versionId, taskName: task.name||task.taskName||'Task chưa đặt tên', datasetName: task.dataset||task.datasetName||task.projectName||'Dataset', task };
        const staffItems: QueueItem[] = (staffConflictResponse.data?.conflicts||[]).map((conflict: any) => ({ ...conflict, ...common }));
        return staffItems;
      }));

      const reviewResults = await Promise.allSettled(reviewableTasks.map(async (task: any) => {
        const versionId = String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0];
        if (!versionId) return [];
        const res = await api.get('/dataprep/assignments/review-queue', { params: { versionId, status: 'all', limit: 100 } });
        const rows = (res.data?.data||[]) as any[];
        return rows
          .filter(row => ['submitted', 'approved'].includes(String(row.reviewStatus || '')))
          .map(row => ({
            ...row,
            taskName: task.name||task.taskName||'Task chưa đặt tên',
            datasetName: task.dataset||task.datasetName||task.projectName||'Dataset',
            task,
          })) as ReviewRow[];
      }));

      const merged = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const unique = Array.from(new Map(merged.map(item => [`${item.versionId}-${item.sampleId}`, item])).values());
      const submittedRows = reviewResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const uniqueRows = Array.from(new Map(submittedRows.map(row => [row.assignmentId, row])).values());

      unique.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0;
        if (sortBy === 'deadline') {
          const dA = new Date(a.task?.dueDate||'2099-01-01').getTime();
          const dB = new Date(b.task?.dueDate||'2099-01-01').getTime();
          if (dA !== dB) return dA - dB;
        }
        const severityA = 1 - Number(a.agreementScore?? 1);
        const severityB = 1 - Number(b.agreementScore?? 1);
        return severityB - severityA;
      });
      setItems(unique);
      setReviewRows(uniqueRows);
    } catch (err: any) {
      setError(err.response?.data?.error||err.message||'Không thể tải danh sách cần quyết định.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => {
      void loadQueue(true);
      if (selectedVersionId && activeTab === 'rewrites') {
        void fetchRewriteAssignments();
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedVersionId, activeTab]);

  useEffect(() => {
    if (selectedVersionId && activeTab === 'rewrites') {
      void fetchRewriteAssignments();
    }
  }, [selectedVersionId, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, selectedVersionId, activeTab]);

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
    }>();

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
          pendingConflictsCount: 0
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
          task: row.task || null,
          conflicts: [],
          reviewRows: [],
          quickReviews: [],
          overlapReviews: [],
          resolvedConflictsCount: 0,
          pendingConflictsCount: 0
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
      p.overlapReviews = [];
    });

    return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, 'vi'));
  }, [items, reviewRows]);

  const selectedProject = useMemo(() => {
    if (!selectedVersionId) return null;
    return projects.find(p => p.versionId === selectedVersionId) || null;
  }, [projects, selectedVersionId]);

  const filteredProjects = useMemo(() => {
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const normalizedQuery = query.trim().toLowerCase();
    return projects
      .filter(project => {
        const pendingCount = project.quickReviews.length;
        const statusMatches = projectStatusFilter === 'all'
          || (projectStatusFilter === 'todo' && pendingCount > 0)
          || (projectStatusFilter === 'completed' && pendingCount === 0);
        const priority = String(project.task?.priority || 'medium').toLowerCase();
        const priorityMatches = priorityFilter === 'all' || priority === priorityFilter;
        const queryMatches = !normalizedQuery
          || `${project.projectName} ${project.datasetName}`.toLowerCase().includes(normalizedQuery);
        return statusMatches && priorityMatches && queryMatches;
      })
      .sort((a, b) => {
        const aPriority = String(a.task?.priority || 'medium').toLowerCase();
        const bPriority = String(b.task?.priority || 'medium').toLowerCase();
        return (priorityRank[aPriority] ?? 1) - (priorityRank[bPriority] ?? 1)
          || a.projectName.localeCompare(b.projectName, 'vi');
      });
  }, [projects, projectStatusFilter, priorityFilter, query]);

  const overallKPIs = useMemo(() => {
    let totalPendingConflicts = 0;
    let totalResolved = 0;
    projects.forEach(p => {
      totalPendingConflicts += p.quickReviews.length;
      totalResolved += p.resolvedConflictsCount;
    });
    return {
      totalProjects: projects.length,
      totalPendingConflicts,
      totalResolved
    };
  }, [projects]);

  const selectProject = (pId: string) => {
    const proj = projects.find(p => p.versionId === pId);
    setSelectedVersionId(pId);
    if (proj) {
      if (proj.quickReviews.length > 0) {
        setActiveTab('quick_reviews');
      } else {
        setActiveTab('history');
      }
    }
  };

  const quickReviewsTotal = selectedProject?.quickReviews.length || 0;
  const quickReviewsTotalPages = Math.max(1, Math.ceil(quickReviewsTotal / PAGE_SIZE));
  const quickReviewsPage = Math.min(page, quickReviewsTotalPages);
  const visibleQuickReviews = selectedProject?.quickReviews.slice((quickReviewsPage - 1) * PAGE_SIZE, quickReviewsPage * PAGE_SIZE) || [];
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
          <h1><ShieldCheck size={24} className="sv-header-icon" /> Trung tâm duyệt nhãn</h1>
          <p>
            {selectedProject
              ? `Workspace của dự án: ${selectedProject.projectName}`
              : "Bảng điều khiển chung cho giám sát viên - Quản lý duyệt và phân xử nhãn hội thoại"}
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
              <p>Ưu tiên các dự án còn submission một Staff cần Supervisor duyệt.</p>
            </div>

            <div className="workspace-filters-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px' }}>
                <Search size={16} />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên dự án hoặc dataset..." />
              </label>
              <select value={projectStatusFilter} onChange={event => setProjectStatusFilter(event.target.value as any)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="todo">Cần làm</option>
                <option value="completed">Đã hoàn thành</option>
              </select>
              <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as any)}>
                <option value="all">Tất cả ưu tiên</option>
                <option value="high">Ưu tiên cao</option>
                <option value="medium">Ưu tiên trung bình</option>
                <option value="low">Ưu tiên thấp</option>
              </select>
              <span style={{ color: '#64748b', fontSize: 13 }}>{filteredProjects.length}/{projects.length} dự án</span>
            </div>

            {loading && items.length === 0 ? (
              <div className="sv-skeletons">
                {[1, 2, 3].map(i => <div key={i} className="sv-skeleton" />)}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="sv-state empty-state">
                <Inbox size={48} />
                <h3>Không có dự án phù hợp bộ lọc</h3>
                <p>Thử đổi trạng thái, mức ưu tiên hoặc từ khóa tìm kiếm.</p>
              </div>
            ) : (
              <div className="project-grid">
                {filteredProjects.map(p => {
                  const totalReviews = new Set(p.reviewRows.map(row => row.sampleId)).size;
                  const resolved = new Set(p.reviewRows.filter(row => row.reviewStatus === 'approved').map(row => row.sampleId)).size;
                  const pct = totalReviews > 0 ? Math.round((resolved / totalReviews) * 100) : 100;
                  const pendingTotal = p.quickReviews.length;
                  const priority = String(p.task?.priority || 'medium').toLowerCase();
                  const priorityLabel = priority === 'high' ? 'Cao' : priority === 'low' ? 'Thấp' : 'Trung bình';

                  return (
                    <article key={p.versionId} className="project-card" onClick={() => selectProject(p.versionId)}>
                      <div className="project-card-body">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="project-tag">Dataset Version</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: priority === 'high' ? '#fee2e2' : priority === 'low' ? '#e0f2fe' : '#fef3c7', color: priority === 'high' ? '#b91c1c' : priority === 'low' ? '#0369a1' : '#92400e' }}>
                            Ưu tiên {priorityLabel}
                          </span>
                        </div>
                        <h3 className="project-title">{p.projectName}</h3>
                        <p className="project-dataset-name">{p.datasetName}</p>

                        <div className="project-progress-container">
                          <div className="progress-labels">
                            <span>Tiến độ Supervisor duyệt</span>
                            <span>{resolved}/{totalReviews} ({pct}%)</span>
                          </div>
                          <div className="sv-task-progress">
                            <span style={{ width: `${pct}%` }}></span>
                          </div>
                        </div>

                        <div className="project-mini-kpis">
                          <div className="mini-kpi purple">
                            <strong>{p.quickReviews.length}</strong>
                            <span>Cần duyệt</span>
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
                          {pendingTotal > 0 ? 'Bắt đầu duyệt' : 'Xem lịch sử'} <ChevronRight size={14} />
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
                <strong>{selectedProject?.quickReviews.length}</strong>
                <span>Cần duyệt</span>
              </div>
              <div className="wkpi blue" style={{ borderLeft: '3px solid #3b82f6' }}>
                <strong>{rewriteTasks.filter(t => t.status === 'submitted').length}</strong>
                <span>Chờ Checker</span>
              </div>
              <div className="wkpi green">
                <strong>{selectedProject?.resolvedConflictsCount}</strong>
                <span>Đã chốt</span>
              </div>
            </div>
          </div>

          <div className="sv-workspace-tabs">
            <button
              className={activeTab === 'quick_reviews' ? 'active' : ''}
              onClick={() => setActiveTab('quick_reviews')}
            >
              Duyệt bài của Staff <span>{selectedProject?.quickReviews.length}</span>
            </button>
            <button
              className={activeTab === 'rewrites' ? 'active' : ''}
              onClick={() => {
                setActiveTab('rewrites');
                void fetchRewriteAssignments();
              }}
            >
              Theo dõi viết lại <span>{rewriteTasks.length}</span>
            </button>
            <button
              className={activeTab === 'history' ? 'active' : ''}
              onClick={() => setActiveTab('history')}
            >
              Đã chốt <span>{selectedProject?.resolvedConflictsCount}</span>
            </button>
          </div>

          <div className="workspace-tab-content">
            {activeTab === 'quick_reviews' && (
              <section className="sv-queue">
                {selectedProject?.quickReviews.length === 0 ? (
                  <div className="sv-state empty-state">
                    <CheckCircle2 size={40} className="success-icon" />
                    <h3>Tuyệt vời!</h3>
                    <p>Không có bài gán nhãn nào của Staff cần duyệt trong dự án này.</p>
                  </div>
                ) : (
                  <div className="sv-list">
                    {visibleQuickReviews.map(group => {
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
                            </div>
                            <button
                              className="sv-open-btn action-btn adjudication-btn"
                              onClick={() => setSelected({ ...conflictItem, reviewerRows: group.rows })}
                            >
                              Duyệt nhãn
                            </button>
                          </div>

                          {group.rows.length > 0 && (
                            <div className="sv-overlap-reviewers">
                              <strong>Staff thực hiện:</strong>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                {group.rows.map(row => (
                                  <span key={row.assignmentId} className="sv-reviewer-tag">
                                    👤 {row.assigneeName} ({labelText(row.label?.quality || 'Chưa gán')})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    {quickReviewsTotalPages > 1 && (
                      <div className="sv-pagination compact-pagination">
                        <span>Hiển thị {visibleQuickReviews.length}/{quickReviewsTotal} mẫu cần duyệt</span>
                        <div>
                          <button disabled={quickReviewsPage === 1} onClick={() => setPage(quickReviewsPage - 1)}>
                            <ArrowLeft size={14} /> Trước
                          </button>
                          <span className="page-indicator">{quickReviewsPage}/{quickReviewsTotalPages}</span>
                          <button disabled={quickReviewsPage === quickReviewsTotalPages} onClick={() => setPage(quickReviewsPage + 1)}>
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
                    <h3>Danh sach da chot</h3>
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
                            <span className="sample-number">Mẫu #{item.sampleIndex + 1}</span>
                            <h3>{item.taskName}</h3>
                            <p>{item.datasetName}{deadlineStr ? ` · Hạn ${deadlineStr}` : ''}</p>
                            <div className="sv-history-meta">
                              <span>{item.assigneeCount} nhân sự đánh giá</span>
                              <span>{item.resolvedAdjudicationCount || 0} mục đã xử lý</span>
                              {rows.slice(0, 2).map(row => <span key={row.assignmentId}>{row.assigneeName}</span>)}
                            </div>
                          </div>
                          <button
                            className="sv-open-btn action-btn"
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

            {activeTab === 'rewrites' && (
              <section className="sv-queue">
                <div className="rewrite-monitor-toolbar">
                  <div className="rewrite-filter-tabs">
                    {([['all','Tất cả'],['pending','Đang chờ'],['approved','Đã duyệt'],['redo','Làm lại']] as const).map(([value,label]) => (
                      <button key={value} className={rewriteStatusFilter === value ? 'active' : ''} onClick={() => setRewriteStatusFilter(value)}>{label}</button>
                    ))}
                  </div>
                  <div className="sv-search rewrite-search"><Search size={15}/><input value={rewriteQuery} onChange={event => setRewriteQuery(event.target.value)} placeholder="Tìm sample, Staff, Checker..." /></div>
                </div>
                {loadingRewrites ? (
                  <div className="sv-skeletons">
                    {[1, 2].map(i => <div key={i} className="sv-skeleton" />)}
                  </div>
                ) : visibleRewriteTasks.length === 0 ? (
                  <div className="sv-state empty-state">
                    <CheckCircle2 size={40} className="success-icon" />
                    <h3>Tuyệt vời!</h3>
                    <p>Chưa có task rewrite trong dự án này.</p>
                  </div>
                ) : (
                  <div className="rewrite-table-wrap">
                    <table className="rewrite-table">
                      <thead><tr><th>Sample</th><th>Staff</th><th>Lý do</th><th>Bản viết lại</th><th>Checker</th><th>Trạng thái</th></tr></thead>
                      <tbody>{visibleRewriteTasks.map(task => (
                        <tr key={task.id}>
                          <td><strong>#{String(task.convId).substring(0, 10)}</strong></td>
                          <td>{task.staffName || task.assigneeName || task.assigneeId?.name || 'Staff'}</td>
                          <td><span className="rewrite-reason">{REWRITE_REASON_VI_MAP[task.reason] || task.reason || 'Yêu cầu viết lại'}</span></td>
                          <td><p className="rewrite-preview">{task.submittedText || 'Chưa nộp bản sửa'}</p></td>
                          <td>{task.checkerName || 'Đã phân công'}{task.checkerReviewNote && <small style={{ display:'block', color:'#64748b', marginTop:4 }}>{task.checkerReviewNote}</small>}</td>
                          <td><span className={`rewrite-status ${task.status === 'approved' ? 'approved' : ['redo','rejected'].includes(task.status) ? 'redo' : 'pending'}`}>{task.status === 'approved' ? 'Đã duyệt' : task.status === 'submitted' ? 'Chờ Checker' : task.status}</span></td>
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
        <SupervisorConflictDialog
          item={selected}
          onClose={() => setSelected(null)}
          onCompleted={loadQueue}
        />
      )}

      {reviewingRewrite && (
        <div className="sv-modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '20px'
        }} onClick={() => setReviewingRewrite(null)}>
          <div className="sv-modal" style={{
            backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '800px',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div className="sv-modal-header" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Phê duyệt cuối cùng bản viết lại #{String(reviewingRewrite.convId).substring(0, 8)}
              </h3>
              <button onClick={() => setReviewingRewrite(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#64748b'
              }}><X size={20} /></button>
            </div>
            
            <div className="sv-modal-body" style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '12px 16px', background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '4px' }}>
                <strong style={{ color: '#991b1b', fontSize: '13px' }}>Yêu cầu / Lỗi cần viết lại:</strong>
                <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#7f1d1d' }}>{REWRITE_REASON_VI_MAP[reviewingRewrite.reason] || reviewingRewrite.reason}</p>
              </div>

              {reviewingRewrite.checkerReviewNote && (
                <div style={{ padding: '12px 16px', background: '#ecfdf5', borderLeft: '4px solid #10b981', borderRadius: '4px' }}>
                  <strong style={{ color: '#065f46', fontSize: '13px' }}>Nhận xét của Checker:</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#064e3b' }}>{reviewingRewrite.checkerReviewNote}</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px', display: 'block' }}>Nhận xét / Ghi chú (Bắt buộc nếu Từ chối)</label>
                <textarea
                  className="ct-input"
                  placeholder="Nhập nhận xét phê duyệt của Supervisor..."
                  value={rewriteReviewNote}
                  onChange={e => setRewriteReviewNote(e.target.value)}
                  style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                />
              </div>
            </div>

            <div className="sv-modal-footer" style={{
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
                    toast.success('Đã từ chối bản viết lại và yêu cầu làm lại.');
                    setReviewingRewrite(null);
                    void fetchRewriteAssignments();
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
                      note: rewriteReviewNote.trim() || 'Supervisor approved'
                    });
                    toast.success('Đã phê duyệt cuối cùng và lưu vào lịch sử dữ liệu!');
                    setReviewingRewrite(null);
                    void fetchRewriteAssignments();
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Có lỗi xảy ra');
                  } finally {
                    setIsSubmittingRewriteReview(false);
                  }
                }}
              >
                Phê duyệt & Lưu lịch sử
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
