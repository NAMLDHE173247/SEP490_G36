import React, { useState, useCallback } from 'react';
import {
  GitBranch,
  Eye,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Download,
  Calendar,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowUpDown,
  GitCompare,
  Tag,
  FileText,
  BarChart2,
  Plus,
  RefreshCw,
  ClipboardList,
  Play,
  Database,
  Layers,
  MessageSquare,
  User,
  Clock,
  X,
  AlertTriangle,
  Info,
  Cpu,
} from 'lucide-react';
import '../styles/versiondataprep.css';
import { api } from '../services/api';

/* ────────────────────────────────────────────────────────────────
   Types
──────────────────────────────────────────────────────────────── */
interface VersionItem {
  id: string;
  projectName: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  prepareResumeStep: number;
  stage: string;
  conversations: number;
  messages: number;
  author: string;
  tags: string[];
  accuracy: number | null;
  labeling: string;
  labelingTasks: number;
  labelingTasksDone: number;
}

interface ToastInfo { msg: string; type: 'success' | 'error' | 'loading' }

/* ────────────────────────────────────────────────────────────────
   STATUS config — normalise backend values → display
──────────────────────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  completed:   { label: 'Completed',   icon: <CheckCircle size={14} />,  className: 'status-completed'   },
  ready:       { label: 'Completed',   icon: <CheckCircle size={14} />,  className: 'status-completed'   },
  'in-progress':{ label: 'In Progress', icon: <AlertCircle size={14} />, className: 'status-in-progress' },
  in_progress: { label: 'In Progress', icon: <AlertCircle size={14} />,  className: 'status-in-progress' },
  active:      { label: 'In Progress', icon: <AlertCircle size={14} />,  className: 'status-in-progress' },
  archived:    { label: 'Archived',    icon: <XCircle size={14} />,      className: 'status-archived'    },
  failed:      { label: 'Failed',      icon: <XCircle size={14} />,      className: 'status-failed'      },
};

function normaliseStatus(s: string) {
  const key = String(s || '').toLowerCase();
  return STATUS_CONFIG[key] ?? STATUS_CONFIG['completed'];
}

/* pipeline step labels */
const STAGE_STEPS = [
  { step: 1, label: 'Upload' },
  { step: 2, label: 'Preprocess' },
  { step: 5, label: 'Cluster' },
  { step: 7, label: 'Label' },
  { step: 10, label: 'Classify' },
  { step: 11, label: 'Evaluate' },
  { step: 13, label: 'Finish' },
];

function StageProgress({ step }: { step: number }) {
  return (
    <div className="vdp-stage-progress">
      {STAGE_STEPS.map((s, idx) => {
        const done = step >= s.step;
        const active = idx < STAGE_STEPS.length - 1
          ? step >= s.step && step < STAGE_STEPS[idx + 1].step
          : step >= s.step;
        return (
          <React.Fragment key={s.step}>
            <div className={`vdp-stage-dot ${done ? 'done' : ''} ${active ? 'active' : ''}`} title={s.label}>
              <span className="vdp-stage-label">{s.label}</span>
            </div>
            {idx < STAGE_STEPS.length - 1 && (
              <div className={`vdp-stage-line ${done ? 'done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function shortId(id: string) {
  return String(id || '').slice(0, 8) + '…';
}

/* ────────────────────────────────────────────────────────────────
   Main component
──────────────────────────────────────────────────────────────── */
/* Helper: switch to a Dashboard tab via the event bus */
const navigateToTab = (tab: string) => {
  window.dispatchEvent(new CustomEvent('lh-navigate-tab', { detail: tab }));
};

function VersionDataPrepView() {
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [loadingIds, setLoadingIds] = useState<Record<string, boolean>>({});
  const [detailVersion, setDetailVersion] = useState<VersionItem | null>(null);
  const perPage = 8;

  /* ── Toast helper ── */
  const showToast = useCallback((msg: string, type: ToastInfo['type'] = 'success', ms = 3500) => {
    setToast({ msg, type });
    if (type !== 'loading') setTimeout(() => setToast(null), ms);
  }, []);

  /* ── Fetch ── */
  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/dataprep/versions');
      if (res.data.success) setVersions(res.data.data ?? []);
    } catch {
      showToast('Không thể tải danh sách version.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => { fetchVersions(); }, [fetchVersions]);

  /* ── Loading flag per id ── */
  const setIdLoading = (id: string, val: boolean) =>
    setLoadingIds(prev => ({ ...prev, [id]: val }));

  /* ── Blob download (with auth header) ── */
  const downloadBlob = async (url: string, fallbackName: string) => {
    const res = await api.get(url, { responseType: 'blob' });
    const disposition = res.headers['content-disposition'];
    let filename = fallbackName;
    if (disposition?.includes('filename=')) {
      const m = disposition.match(/filename=["']?([^"';]+)["']?/);
      if (m?.[1]) filename = m[1];
    }
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  /* ── Delete ── */
  const handleDelete = async (v: VersionItem) => {
    if (!window.confirm(`Xóa version "${v.description}" của project "${v.projectName}"?\nToàn bộ dữ liệu liên quan sẽ bị xóa vĩnh viễn.`)) return;
    setIdLoading(v.id, true);
    try {
      await api.delete(`/dataprep/versions/${v.id}`);
      showToast(`✅ Đã xóa version ${v.description}!`);
      setVersions(prev => prev.filter(x => x.id !== v.id));
      setSelectedIds(prev => prev.filter(id => id !== v.id));
      if (expandedId === v.id) setExpandedId(null);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa thất bại.', 'error');
    } finally {
      setIdLoading(v.id, false);
    }
  };

  /* ── Export original ── */
  const handleExportOriginal = async (v: VersionItem) => {
    setIdLoading(`${v.id}_orig`, true);
    showToast('Đang tải Dữ liệu gốc…', 'loading');
    try {
      await downloadBlob(`/dataprep/versions/${v.id}/export-original`, `${v.projectName}_original.json`);
      showToast('✅ Đã tải Dữ liệu gốc!');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tải file thất bại.', 'error');
    } finally {
      setIdLoading(`${v.id}_orig`, false);
    }
  };

  /* ── Export labeled ── */
  const handleExportLabeled = async (v: VersionItem) => {
    setIdLoading(`${v.id}_labeled`, true);
    showToast('Đang tải Dữ liệu đã gán nhãn…', 'loading');
    try {
      await downloadBlob(`/dataprep/versions/${v.id}/export-labeled`, `${v.projectName}_labeled.json`);
      showToast('✅ Đã tải dữ liệu gán nhãn!');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tải file thất bại.', 'error');
    } finally {
      setIdLoading(`${v.id}_labeled`, false);
    }
  };

  /* ── Export JSONL (canonicalize → snapshot → download) ── */
  const handleExportJSONL = async (v: VersionItem) => {
    setIdLoading(`${v.id}_jsonl`, true);
    showToast('🔄 Đang chốt nhãn và tạo snapshot…', 'loading');
    try {
      const canon = await api.post(`/dataprep/export/${v.id}/canonicalize`);
      if (!canon.data.success) {
        showToast(canon.data.error || 'Lỗi khi chốt nhãn.', 'error');
        return;
      }
      await api.post(`/dataprep/export/${v.id}/snapshot`);
      showToast('📦 Đang tải file JSONL…', 'loading');
      await downloadBlob(`/dataprep/export/${v.id}/jsonl`, `${v.projectName}_${v.description}_labeled.jsonl`);
      showToast('✅ Xuất JSONL thành công!');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xuất JSONL thất bại. Kiểm tra conflict chưa giải quyết.', 'error');
    } finally {
      setIdLoading(`${v.id}_jsonl`, false);
    }
  };

  /* ── Resume pipeline ── */
  const handleResumePipeline = (v: VersionItem) => {
    // Set 'current_version_id' — DataPrepContext reads this key on mount
    // and automatically calls openWorkflowVersion() to hydrate the workflow.
    localStorage.setItem('current_version_id', v.id);
    navigateToTab('Data Prep');
  };

  /* ── Select / compare ── */
  const toggleSelect = (id: string) =>
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );

  /* ── Filter & sort ── */
  const isCompleted = (s: string) => ['completed', 'ready'].includes(s.toLowerCase());
  const isInProgress = (s: string) => ['in-progress', 'in_progress', 'active'].includes(s.toLowerCase());

  const filtered = versions
    .filter(v => {
      const q = searchQuery.trim().toLowerCase();
      const matchQ = !q ||
        String(v.id).toLowerCase().includes(q) ||
        String(v.projectName || '').toLowerCase().includes(q) ||
        String(v.description || '').toLowerCase().includes(q) ||
        (Array.isArray(v.tags) && v.tags.some(t => t.toLowerCase().includes(q)));
      const st = String(v.status || '').toLowerCase();
      const matchS =
        statusFilter === 'all' ||
        (statusFilter === 'completed' && isCompleted(st)) ||
        (statusFilter === 'in-progress' && isInProgress(st)) ||
        (statusFilter === 'archived' && st === 'archived');
      return matchQ && matchS;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':   return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'date-desc':  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'name':       return String(a.projectName || '').localeCompare(String(b.projectName || ''));
        case 'stage':      return (b.prepareResumeStep || 0) - (a.prepareResumeStep || 0);
        case 'conv-desc':  return (b.conversations || 0) - (a.conversations || 0);
        default:           return 0;
      }
    });

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageVersions = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const statusCounts = {
    all: versions.length,
    completed: versions.filter(v => isCompleted(String(v.status || ''))).length,
    'in-progress': versions.filter(v => isInProgress(String(v.status || ''))).length,
    archived: versions.filter(v => String(v.status || '').toLowerCase() === 'archived').length,
  };

  const validAcc = versions.map(v => v.accuracy).filter((a): a is number => typeof a === 'number' && !isNaN(a));
  const bestAcc = validAcc.length > 0 ? Math.max(...validAcc) : null;
  const totalConvs = versions.reduce((s, v) => s + (v.conversations || 0), 0);

  /* ══════════════════════════════════════════════════════════════
     Render
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="version-dp-container">

      {/* ── Toast ── */}
      {toast && (
        <div className={`vdp-toast vdp-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={16} />}
          {toast.type === 'error' && <AlertTriangle size={16} />}
          {toast.type === 'loading' && <RefreshCw size={16} className="vdp-spin" />}
          {toast.msg}
          <button className="vdp-toast-close" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="version-dp-header">
        <div className="version-dp-header-left">
          <div className="version-dp-icon-wrapper">
            <GitBranch size={24} />
          </div>
          <div>
            <h2>Manager Version Data Prep</h2>
            <p className="version-dp-subtitle">
              Track, compare and manage all Data Prep pipeline versions
            </p>
          </div>
        </div>
        <div className="version-dp-header-actions">
          <button
            className="vdp-btn vdp-btn-ghost"
            onClick={fetchVersions}
            disabled={loading}
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={loading ? 'vdp-spin' : ''} />
            Refresh
          </button>
          <button
            className="vdp-btn vdp-btn-outline"
            onClick={() => setShowCompare(true)}
            disabled={selectedIds.length !== 2}
            title="Chọn đúng 2 version để so sánh"
          >
            <GitCompare size={16} />
            Compare ({selectedIds.length}/2)
          </button>
          <button
            className="vdp-btn vdp-btn-primary"
            onClick={() => navigateToTab('Data Prep')}
          >
            <Plus size={16} />
            New Version
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="version-dp-stats">
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon total"><FileText size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{versions.length}</span>
            <span className="vdp-stat-label">Total Versions</span>
          </div>
        </div>
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon completed"><CheckCircle size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{statusCounts.completed}</span>
            <span className="vdp-stat-label">Completed</span>
          </div>
        </div>
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon in-progress"><AlertCircle size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{statusCounts['in-progress']}</span>
            <span className="vdp-stat-label">In Progress</span>
          </div>
        </div>
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon convs"><MessageSquare size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{totalConvs.toLocaleString()}</span>
            <span className="vdp-stat-label">Total Conversations</span>
          </div>
        </div>
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon best"><BarChart2 size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{bestAcc !== null ? `${bestAcc}%` : 'N/A'}</span>
            <span className="vdp-stat-label">Best Accuracy</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="version-dp-toolbar">
        <div className="vdp-search-wrapper">
          <Search size={16} className="vdp-search-icon" />
          <input
            type="text"
            placeholder="Tìm theo tên project, ID, mô tả..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="vdp-search-input"
          />
          {searchQuery && (
            <button className="vdp-search-clear" onClick={() => { setSearchQuery(''); setCurrentPage(1); }}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="vdp-filter-group">
          <Filter size={14} />
          {Object.entries(statusCounts).map(([key, count]) => (
            <button
              key={key}
              className={`vdp-filter-btn ${statusFilter === key ? 'active' : ''}`}
              onClick={() => { setStatusFilter(key); setCurrentPage(1); }}
            >
              {key === 'all' ? 'All' : STATUS_CONFIG[key]?.label || key} ({count})
            </button>
          ))}
        </div>

        <div className="vdp-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="vdp-sort-select">
            <option value="date-desc">Mới nhất</option>
            <option value="date-asc">Cũ nhất</option>
            <option value="name">Tên A–Z</option>
            <option value="stage">Stage cao nhất</option>
            <option value="conv-desc">Nhiều hội thoại nhất</option>
          </select>
        </div>
      </div>

      {/* ── Version List ── */}
      <div className="version-dp-list">
        {loading && versions.length === 0 && (
          <div className="vdp-loading">
            <RefreshCw size={28} className="vdp-spin" />
            <p>Đang tải danh sách version…</p>
          </div>
        )}

        {!loading && pageVersions.length === 0 && (
          <div className="vdp-empty">
            <GitBranch size={48} />
            <p>Không tìm thấy version nào phù hợp.</p>
            {searchQuery && (
              <button className="vdp-btn vdp-btn-outline" onClick={() => setSearchQuery('')}>
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}

        {pageVersions.map(version => {
          const isExpanded = expandedId === version.id;
          const isSelected = selectedIds.includes(version.id);
          const statusInfo = normaliseStatus(version.status);
          const st = String(version.status || '').toLowerCase();

          return (
            <div
              key={version.id}
              className={`vdp-version-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}
            >
              {/* ── Main row ── */}
              <div className="vdp-version-row" onClick={() => setExpandedId(isExpanded ? null : version.id)}>
                <div className="vdp-version-check" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="vdp-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(version.id)}
                    title="Chọn để so sánh (tối đa 2)"
                  />
                </div>

                <div className="vdp-version-expand">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <div className="vdp-version-id">
                  <Tag size={13} />
                  <span className="vdp-id-text" title={version.id}>{shortId(version.id)}</span>
                </div>

                <div className="vdp-version-name">
                  <span className="vdp-project-name">{version.projectName || '—'}</span>
                  <span className="vdp-version-desc">{version.description || '—'}</span>
                </div>

                <div className="vdp-version-stage-badge" title={`Stage: ${version.stage}`}>
                  <Layers size={12} />
                  {version.stage || '—'}
                </div>

                <div className={`vdp-version-status ${statusInfo.className}`}>
                  {statusInfo.icon}
                  <span>{statusInfo.label}</span>
                </div>

                <div className="vdp-version-conv">
                  <Database size={12} />
                  <span>{(version.conversations || 0).toLocaleString()} conv</span>
                </div>

                <div className="vdp-version-meta">
                  <span className="vdp-meta-item">
                    <Calendar size={12} />
                    {formatDate(version.createdAt)}
                  </span>
                </div>

                <div className="vdp-version-accuracy">
                  {version.accuracy !== null && version.accuracy !== undefined ? (
                    <span className={`vdp-accuracy-badge ${version.accuracy >= 90 ? 'high' : version.accuracy >= 80 ? 'medium' : 'low'}`}>
                      {version.accuracy}%
                    </span>
                  ) : (
                    <span className="vdp-accuracy-badge pending">—</span>
                  )}
                </div>
              </div>

              {/* ── Expanded details ── */}
              {isExpanded && (
                <div className="vdp-version-details">
                  {/* Pipeline progress */}
                  <div className="vdp-section-title"><Cpu size={14} /> Pipeline Progress</div>
                  <StageProgress step={version.prepareResumeStep || 1} />

                  {/* Info grid */}
                  <div className="vdp-details-grid">
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Stage hiện tại</span>
                      <span className="vdp-detail-value">{version.stage || '—'}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Hội thoại</span>
                      <span className="vdp-detail-value">{(version.conversations || 0).toLocaleString()}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Messages</span>
                      <span className="vdp-detail-value">{(version.messages || 0).toLocaleString()}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Tác giả</span>
                      <span className="vdp-detail-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} /> {version.author || '—'}
                      </span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Cập nhật lần cuối</span>
                      <span className="vdp-detail-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> {formatDate(version.updatedAt)}
                      </span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Tags</span>
                      <div className="vdp-tags">
                        {Array.isArray(version.tags) && version.tags.length > 0
                          ? version.tags.map(t => <span key={t} className="vdp-tag">{t}</span>)
                          : <span className="vdp-no-tags">Không có tag</span>
                        }
                      </div>
                    </div>
                  </div>

                  {/* Labeling status block */}
                  {version.labeling && version.labeling !== 'not_started' && (
                    <div className={`vdp-labeling-block vdp-labeling-${version.labeling}`}>
                      <div className="vdp-labeling-row">
                        <ClipboardList size={14} />
                        <strong>Trạng thái gán nhãn:</strong>
                        <span className="vdp-labeling-status">
                          {version.labeling === 'completed' && '✅ Hoàn tất'}
                          {version.labeling === 'in_progress' && `🔄 Đang thực hiện (${version.labelingTasksDone}/${version.labelingTasks} task)`}
                          {version.labeling !== 'completed' && version.labeling !== 'in_progress' && '⏳ Chờ tạo task'}
                        </span>
                      </div>
                      {version.labelingTasks > 0 && (
                        <div className="vdp-labeling-bar-wrap">
                          <div
                            className="vdp-labeling-bar"
                            style={{ width: `${Math.round((version.labelingTasksDone / version.labelingTasks) * 100)}%` }}
                          />
                          <span className="vdp-labeling-pct">
                            {Math.round((version.labelingTasksDone / version.labelingTasks) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Version ID (full, copyable) */}
                  <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Info size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Version ID:</span>
                    <code
                      style={{
                        fontSize: '0.75rem', fontFamily: 'monospace', color: '#6366f1',
                        background: '#eef2ff', padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                        userSelect: 'all',
                      }}
                      title="Click để copy"
                      onClick={() => { navigator.clipboard.writeText(version.id); showToast('Đã copy Version ID!'); }}
                    >
                      {version.id}
                    </code>
                  </div>

                  {/* Action buttons */}
                  <div className="vdp-detail-actions">
                    {/* View detail */}
                    <button
                      className="vdp-action-btn view"
                      onClick={() => setDetailVersion(version)}
                    >
                      <Eye size={14} /> Xem chi tiết
                    </button>

                    {/* Resume pipeline */}
                    <button
                      className="vdp-action-btn resume"
                      onClick={() => handleResumePipeline(version)}
                      title="Tiếp tục xử lý DataPrep từ checkpoint"
                    >
                      <Play size={14} /> Tiếp tục Pipeline →
                    </button>

                    {/* Export JSONL */}
                    <button
                      className="vdp-action-btn jsonl"
                      onClick={() => handleExportJSONL(version)}
                      disabled={!!loadingIds[`${version.id}_jsonl`]}
                      title="Chốt nhãn và xuất file JSONL"
                    >
                      {loadingIds[`${version.id}_jsonl`]
                        ? <><RefreshCw size={14} className="vdp-spin" /> Đang xuất…</>
                        : <><FileText size={14} /> Xuất JSONL</>
                      }
                    </button>

                    {/* Export original */}
                    <button
                      className="vdp-action-btn export"
                      onClick={() => handleExportOriginal(version)}
                      disabled={!!loadingIds[`${version.id}_orig`]}
                    >
                      {loadingIds[`${version.id}_orig`]
                        ? <><RefreshCw size={14} className="vdp-spin" /> Tải…</>
                        : <><Download size={14} /> Dữ liệu gốc</>
                      }
                    </button>

                    {/* Export labeled */}
                    <button
                      className="vdp-action-btn export"
                      onClick={() => handleExportLabeled(version)}
                      disabled={!!loadingIds[`${version.id}_labeled`]}
                    >
                      {loadingIds[`${version.id}_labeled`]
                        ? <><RefreshCw size={14} className="vdp-spin" /> Tải…</>
                        : <><Download size={14} /> Đã gán nhãn</>
                      }
                    </button>

                    {/* Delete */}
                    <button
                      className="vdp-action-btn delete"
                      onClick={() => handleDelete(version)}
                      disabled={!!loadingIds[version.id]}
                    >
                      {loadingIds[version.id]
                        ? <><RefreshCw size={14} className="vdp-spin" /> Đang xóa…</>
                        : <><Trash2 size={14} /> Xóa Version</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="vdp-pagination">
          <button className="vdp-page-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>«</button>
          <button className="vdp-page-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              className={`vdp-page-btn ${p === currentPage ? 'active' : ''}`}
              onClick={() => setCurrentPage(p)}
            >
              {p}
            </button>
          ))}
          <button className="vdp-page-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
          <button className="vdp-page-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>»</button>
          <span className="vdp-page-info">Trang {currentPage} / {totalPages} — {filtered.length} versions</span>
        </div>
      )}

      {/* ══════════════ Compare Modal ══════════════ */}
      {showCompare && selectedIds.length === 2 && (
        <div className="vdp-modal-overlay" onClick={() => setShowCompare(false)}>
          <div className="vdp-modal vdp-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="vdp-modal-header">
              <h3><GitCompare size={20} /> So sánh 2 Versions</h3>
              <button className="vdp-modal-close" onClick={() => setShowCompare(false)}><X size={16} /></button>
            </div>
            <div className="vdp-modal-body">
              <div className="vdp-compare-grid">
                {selectedIds.map(vId => {
                  const v = versions.find(ver => ver.id === vId);
                  if (!v) return null;
                  const si = normaliseStatus(v.status);
                  return (
                    <div key={vId} className="vdp-compare-col">
                      <div className="vdp-compare-header">
                        <div>
                          <h4 title={v.id}>{shortId(v.id)}</h4>
                          <p className="vdp-compare-project">{v.projectName} · {v.description}</p>
                        </div>
                        <span className={`vdp-version-status ${si.className}`} style={{ fontSize: '0.72rem' }}>
                          {si.icon}<span>{si.label}</span>
                        </span>
                      </div>
                      <StageProgress step={v.prepareResumeStep || 1} />
                      <div className="vdp-compare-stats">
                        <div><Database size={13} /><strong>Hội thoại:</strong> {(v.conversations || 0).toLocaleString()}</div>
                        <div><MessageSquare size={13} /><strong>Messages:</strong> {(v.messages || 0).toLocaleString()}</div>
                        <div><BarChart2 size={13} /><strong>Accuracy:</strong> {v.accuracy != null ? `${v.accuracy}%` : 'N/A'}</div>
                        <div><Layers size={13} /><strong>Stage:</strong> {v.stage || '—'}</div>
                        <div><User size={13} /><strong>Author:</strong> {v.author || '—'}</div>
                        <div><Calendar size={13} /><strong>Created:</strong> {formatDate(v.createdAt)}</div>
                        <div><Clock size={13} /><strong>Updated:</strong> {formatDate(v.updatedAt)}</div>
                        <div>
                          <ClipboardList size={13} />
                          <strong>Labeling:</strong>&nbsp;
                          {v.labeling === 'completed' ? '✅ Hoàn tất'
                            : v.labeling === 'in_progress' ? `🔄 ${v.labelingTasksDone}/${v.labelingTasks} task`
                            : '⏳ Chờ'}
                        </div>
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                        <button className="vdp-action-btn resume" style={{ flex: 1 }} onClick={() => { setShowCompare(false); handleResumePipeline(v); }}>
                          <Play size={13} /> Resume
                        </button>
                        <button className="vdp-action-btn jsonl" style={{ flex: 1 }} onClick={() => { setShowCompare(false); handleExportJSONL(v); }}>
                          <FileText size={13} /> JSONL
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ Detail Modal ══════════════ */}
      {detailVersion && (
        <div className="vdp-modal-overlay" onClick={() => setDetailVersion(null)}>
          <div className="vdp-modal vdp-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="vdp-modal-header">
              <h3><Info size={18} /> Chi tiết Version</h3>
              <button className="vdp-modal-close" onClick={() => setDetailVersion(null)}><X size={16} /></button>
            </div>
            <div className="vdp-modal-body">
              <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>{detailVersion.projectName}</h2>
                <span className={`vdp-version-status ${normaliseStatus(detailVersion.status).className}`}>
                  {normaliseStatus(detailVersion.status).icon}
                  {normaliseStatus(detailVersion.status).label}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{detailVersion.description}</span>
              </div>
              <StageProgress step={detailVersion.prepareResumeStep || 1} />
              <div className="vdp-details-grid" style={{ marginTop: 20 }}>
                {[
                  { label: 'Version ID', value: detailVersion.id },
                  { label: 'Stage', value: detailVersion.stage },
                  { label: 'Step', value: String(detailVersion.prepareResumeStep || 1) },
                  { label: 'Hội thoại', value: (detailVersion.conversations || 0).toLocaleString() },
                  { label: 'Messages', value: (detailVersion.messages || 0).toLocaleString() },
                  { label: 'Accuracy', value: detailVersion.accuracy != null ? `${detailVersion.accuracy}%` : 'N/A' },
                  { label: 'Author', value: detailVersion.author || '—' },
                  { label: 'Labeling Tasks', value: `${detailVersion.labelingTasksDone}/${detailVersion.labelingTasks}` },
                  { label: 'Created', value: formatDate(detailVersion.createdAt) },
                  { label: 'Updated', value: formatDate(detailVersion.updatedAt) },
                ].map(item => (
                  <div className="vdp-detail-item" key={item.label}>
                    <span className="vdp-detail-label">{item.label}</span>
                    <span className="vdp-detail-value" style={{ wordBreak: 'break-all' }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="vdp-detail-actions" style={{ marginTop: 20 }}>
                <button className="vdp-action-btn resume" onClick={() => { setDetailVersion(null); handleResumePipeline(detailVersion); }}>
                  <Play size={14} /> Tiếp tục Pipeline
                </button>
                <button className="vdp-action-btn jsonl" onClick={() => { setDetailVersion(null); handleExportJSONL(detailVersion); }}>
                  <FileText size={14} /> Xuất JSONL
                </button>
                <button className="vdp-action-btn export" onClick={() => handleExportOriginal(detailVersion)}>
                  <Download size={14} /> Dữ liệu gốc
                </button>
                <button className="vdp-action-btn export" onClick={() => handleExportLabeled(detailVersion)}>
                  <Download size={14} /> Đã gán nhãn
                </button>
                <button className="vdp-action-btn delete" onClick={() => { setDetailVersion(null); handleDelete(detailVersion); }}>
                  <Trash2 size={14} /> Xóa Version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VersionDataPrepView;
