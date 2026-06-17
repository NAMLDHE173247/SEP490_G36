import React, { useState } from 'react';
import {
  GitBranch,
  Eye,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
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
  Send,
  Play
} from 'lucide-react';
import '../styles/versiondataprep.css';
import { api } from '../services/api';


const STATUS_CONFIG = {
  'completed': { label: 'Completed', icon: <CheckCircle size={14} />, className: 'status-completed' },
  'in-progress': { label: 'In Progress', icon: <AlertCircle size={14} />, className: 'status-in-progress' },
  'archived': { label: 'Archived', icon: <XCircle size={14} />, className: 'status-archived' },
  'failed': { label: 'Failed', icon: <XCircle size={14} />, className: 'status-failed' },
};

function VersionDataPrepView() {
  const [VERSIONS, setVersions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const perPage = 5;

  const fetchVersions = async () => {
    try {
      const res = await api.get('/dataprep/versions');
      if (res.data.success) {
        setVersions(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch versions', error);
    }
  };

  React.useEffect(() => {
    fetchVersions();
  }, []);

  const handleDeleteVersion = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa Version này và toàn bộ dữ liệu liên quan?')) return;
    try {
      await api.delete(`/dataprep/versions/${id}`);
      setToastMessage('Xóa Version thành công!');
      fetchVersions();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Xóa Version thất bại');
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportOriginal = (id: string) => {
    window.open(`${api.defaults.baseURL}/dataprep/versions/${id}/export-original`, '_blank');
  };

  const handleExportLabeled = (id: string) => {
    window.open(`${api.defaults.baseURL}/dataprep/versions/${id}/export-labeled`, '_blank');
  };

  const handleExportJSONL = async (id: string) => {
    try {
      setToastMessage('Đang chốt nhãn và tạo snapshot...');
      // Step 1: Canonicalize
      const canon = await api.post(`/dataprep/export/${id}/canonicalize`);
      if (!canon.data.success) {
        setToastMessage(null);
        alert(canon.data.error || 'Lỗi khi chốt nhãn');
        return;
      }
      // Step 2: Snapshot
      await api.post(`/dataprep/export/${id}/snapshot`);
      // Step 3: Download JSONL
      setToastMessage('Đang tải file JSONL...');
      window.open(`${api.defaults.baseURL}/dataprep/export/${id}/jsonl`, '_blank');
      setToastMessage('✅ Xuất JSONL thành công!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error: any) {
      setToastMessage(null);
      alert(error.response?.data?.error || 'Lỗi khi xuất JSONL. Có thể còn submission chưa được duyệt.');
    }
  };

  /* Filter & Sort */
  let filtered = VERSIONS.filter(v => {
    const matchSearch = searchQuery.trim() === '' ||
      v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchSearch && matchStatus;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'date-desc': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'name': return a.projectName.localeCompare(b.projectName);
      case 'accuracy': return (b.accuracy || 0) - (a.accuracy || 0);
      default: return 0;
    }
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageVersions = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id) => {
    setSelectedVersions(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const statusCounts = {
    all: VERSIONS.length,
    completed: VERSIONS.filter(v => v.status === 'completed').length,
    'in-progress': VERSIONS.filter(v => v.status === 'in-progress').length,
    archived: VERSIONS.filter(v => v.status === 'archived').length,
  };

  return (
    <div className="version-dp-container">
      {toastMessage && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#10b981', color: 'white', padding: '10px 20px', borderRadius: 8, zIndex: 1000 }}>
          <CheckCircle size={16} style={{ display: 'inline', marginRight: 8 }} />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="version-dp-header">
        <div className="version-dp-header-left">
          <div className="version-dp-icon-wrapper">
            <GitBranch size={24} />
          </div>
          <div>
            <h2>Manager Version Data Prep</h2>
            <p className="version-dp-subtitle">Track, compare and manage all Data Prep pipeline versions</p>
          </div>
        </div>
        <div className="version-dp-header-actions">
          <button className="vdp-btn vdp-btn-outline" onClick={() => setShowCompareModal(true)} disabled={selectedVersions.length !== 2}>
            <GitCompare size={16} />
            Compare ({selectedVersions.length}/2)
          </button>
          <button className="vdp-btn vdp-btn-primary">
            <Plus size={16} />
            New Version
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="version-dp-stats">
        <div className="vdp-stat-card">
          <div className="vdp-stat-icon total"><FileText size={20} /></div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{VERSIONS.length}</span>
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
          <div className="vdp-stat-icon best">
            <BarChart2 size={20} />
          </div>
          <div className="vdp-stat-info">
            <span className="vdp-stat-value">{Math.max(...VERSIONS.filter(v => v.accuracy).map(v => v.accuracy))}%</span>
            <span className="vdp-stat-label">Best Accuracy</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="version-dp-toolbar">
        <div className="vdp-search-wrapper">
          <Search size={16} className="vdp-search-icon" />
          <input
            type="text"
            placeholder="Search versions, tags..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="vdp-search-input"
          />
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
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="vdp-sort-select">
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name">Name A–Z</option>
            <option value="accuracy">Best Accuracy</option>
          </select>
        </div>
      </div>

      {/* Version List */}
      <div className="version-dp-list">
        {pageVersions.length === 0 && (
          <div className="vdp-empty">
            <GitBranch size={48} />
            <p>No versions found matching your criteria.</p>
          </div>
        )}

        {pageVersions.map((version) => {
          const isExpanded = expandedVersion === version.id;
          const isSelected = selectedVersions.includes(version.id);
          const statusInfo = STATUS_CONFIG[version.status] || STATUS_CONFIG['completed'];

          return (
            <div key={version.id} className={`vdp-version-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`}>
              {/* Main row */}
              <div className="vdp-version-row" onClick={() => setExpandedVersion(isExpanded ? null : version.id)}>
                <div className="vdp-version-check">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(version.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="vdp-checkbox"
                  />
                </div>

                <div className="vdp-version-expand">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <div className="vdp-version-id">
                  <Tag size={14} />
                  <span className="vdp-id-text">{version.id}</span>
                </div>

                <div className="vdp-version-name">
                  <span className="vdp-project-name">{version.projectName}</span>
                  <span className="vdp-version-desc">{version.description}</span>
                </div>

                <div className={`vdp-version-status ${statusInfo.className}`}>
                  {statusInfo.icon}
                  <span>{statusInfo.label}</span>
                </div>

                <div className="vdp-version-meta">
                  <span className="vdp-meta-item">
                    <Calendar size={12} />
                    {version.createdAt}
                  </span>
                </div>

                <div className="vdp-version-accuracy">
                  {version.accuracy !== null ? (
                    <span className={`vdp-accuracy-badge ${version.accuracy >= 90 ? 'high' : version.accuracy >= 80 ? 'medium' : 'low'}`}>
                      {version.accuracy}%
                    </span>
                  ) : (
                    <span className="vdp-accuracy-badge pending">—</span>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="vdp-version-details">
                  <div className="vdp-details-grid">
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Stage</span>
                      <span className="vdp-detail-value">{version.stage}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Conversations</span>
                      <span className="vdp-detail-value">{version.conversations}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Messages</span>
                      <span className="vdp-detail-value">{version.messages}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Author</span>
                      <span className="vdp-detail-value">{version.author}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Last Updated</span>
                      <span className="vdp-detail-value">{version.updatedAt}</span>
                    </div>
                    <div className="vdp-detail-item">
                      <span className="vdp-detail-label">Tags</span>
                      <div className="vdp-tags">
                        {version.tags.map(tag => (
                          <span key={tag} className="vdp-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Labeling Status */}
                  {version.labeling && version.labeling !== 'not_started' && (
                    <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', background: version.labeling === 'completed' ? '#f0fdf4' : version.labeling === 'in_progress' ? '#eff6ff' : '#fffbeb', border: `1px solid ${version.labeling === 'completed' ? '#bbf7d0' : version.labeling === 'in_progress' ? '#bfdbfe' : '#fde68a'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <ClipboardList size={14} />
                        <strong style={{ fontSize: '13px' }}>Trạng thái gán nhãn:</strong>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: version.labeling === 'completed' ? '#16a34a' : version.labeling === 'in_progress' ? '#2563eb' : '#d97706' }}>
                          {version.labeling === 'completed' ? '✅ Hoàn tất' : version.labeling === 'in_progress' ? `🔄 Đang thực hiện (${version.labelingTasksDone}/${version.labelingTasks} task)` : '⏳ Chờ tạo task'}
                        </span>
                      </div>
                      {version.labelingTasks > 0 && (
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          {version.labelingTasksDone}/{version.labelingTasks} task hoàn thành
                        </div>
                      )}
                    </div>
                  )}

                  <div className="vdp-detail-actions">
                    <button className="vdp-action-btn view">
                      <Eye size={14} /> View Details
                    </button>
                    {version.labeling === 'waiting' && (
                      <button className="vdp-action-btn restore" style={{ background: '#6366f1', color: 'white', border: 'none' }}>
                        <Send size={14} /> Lưu & Giao gán nhãn
                      </button>
                    )}
                    {version.labeling === 'completed' && (
                      <button
                        className="vdp-action-btn restore"
                        style={{ background: '#10b981', color: 'white', border: 'none' }}
                        onClick={() => handleExportJSONL(version.id)}
                      >
                        <Play size={14} /> Tiếp tục Pipeline →
                      </button>
                    )}
                    {version.labeling === 'completed' && (
                      <button
                        className="vdp-action-btn export"
                        style={{ background: '#4f46e5', color: 'white', border: 'none' }}
                        onClick={() => handleExportJSONL(version.id)}
                      >
                        <Download size={14} /> 📦 Xuất JSONL
                      </button>
                    )}
                    <button className="vdp-action-btn export" onClick={() => handleExportOriginal(version.id)}>
                      <Download size={14} /> Dữ liệu gốc
                    </button>
                    <button className="vdp-action-btn export" onClick={() => handleExportLabeled(version.id)}>
                      <Download size={14} /> Đã gán nhãn
                    </button>
                    <button className="vdp-action-btn delete" onClick={() => handleDeleteVersion(version.id)}>
                      <Trash2 size={14} /> Xóa Version
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="vdp-pagination">
          <button className="vdp-page-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>
            Previous
          </button>
          <span className="vdp-page-info">Page {currentPage} / {totalPages}</span>
          <button className="vdp-page-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
            Next
          </button>
        </div>
      )}

      {/* Compare Modal */}
      {showCompareModal && selectedVersions.length === 2 && (
        <div className="vdp-modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="vdp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vdp-modal-header">
              <h3><GitCompare size={20} /> Compare Versions</h3>
              <button className="vdp-modal-close" onClick={() => setShowCompareModal(false)}>×</button>
            </div>
            <div className="vdp-modal-body">
              <div className="vdp-compare-grid">
                {selectedVersions.map(vId => {
                  const v = VERSIONS.find(ver => ver.id === vId);
                  return (
                    <div key={vId} className="vdp-compare-col">
                      <h4>{v.id}</h4>
                      <p className="vdp-compare-project">{v.projectName}</p>
                      <div className="vdp-compare-stats">
                        <div><strong>Conversations:</strong> {v.conversations}</div>
                        <div><strong>Messages:</strong> {v.messages}</div>
                        <div><strong>Accuracy:</strong> {v.accuracy ? `${v.accuracy}%` : 'N/A'}</div>
                        <div><strong>Stage:</strong> {v.stage}</div>
                        <div><strong>Created:</strong> {v.createdAt}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VersionDataPrepView;
