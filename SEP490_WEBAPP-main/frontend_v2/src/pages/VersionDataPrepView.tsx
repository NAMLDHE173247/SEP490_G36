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
import '../versiondataprep.css';

const VERSIONS = [
  {
    id: 'v1.0.0',
    projectName: 'Project_01/06_16:14',
    description: 'Initial dataset upload & conversion — baseline',
    status: 'completed',
    createdAt: '2026-06-01 16:14',
    updatedAt: '2026-06-01 17:30',
    stage: 'Finish (Stage 6)',
    conversations: 120,
    messages: 586,
    author: 'admin',
    tags: ['baseline', 'v1'],
    accuracy: 87.2,
    labeling: 'completed',
    labelingTasks: 2,
    labelingTasksDone: 2,
  },
  {
    id: 'v1.1.0',
    projectName: 'Project_02/06_09:00',
    description: 'Applied data cleaning pipeline — removed error keywords & fixed think tags',
    status: 'completed',
    createdAt: '2026-06-02 09:00',
    updatedAt: '2026-06-02 11:45',
    stage: 'Finish (Stage 6)',
    conversations: 115,
    messages: 564,
    author: 'admin',
    tags: ['cleaned', 'v1.1'],
    accuracy: 91.5,
    labeling: 'completed',
    labelingTasks: 1,
    labelingTasksDone: 1,
  },
  {
    id: 'v1.2.0',
    projectName: 'Project_02/06_14:20',
    description: 'Re-clustered with K=14, added Socratic method system prompt',
    status: 'completed',
    createdAt: '2026-06-02 14:20',
    updatedAt: '2026-06-02 16:00',
    stage: 'Labeling (Stage 4)',
    conversations: 115,
    messages: 564,
    author: 'admin',
    tags: ['socratic', 'clustered'],
    accuracy: null,
    labeling: 'in_progress',
    labelingTasks: 3,
    labelingTasksDone: 1,
  },
  {
    id: 'v2.0.0',
    projectName: 'Project_03/06_08:30',
    description: 'New dataset with 200 conversations — expanded physics topics',
    status: 'in-progress',
    createdAt: '2026-06-03 08:30',
    updatedAt: '2026-06-03 09:00',
    stage: 'Labeling (Stage 4)',
    conversations: 200,
    messages: 980,
    author: 'admin',
    tags: ['expanded', 'v2'],
    accuracy: null,
    labeling: 'waiting',
    labelingTasks: 0,
    labelingTasksDone: 0,
  },
  {
    id: 'v1.0.1-hotfix',
    projectName: 'Project_01/06_18:00',
    description: 'Hotfix: removed 5 duplicate conversations from v1.0.0',
    status: 'archived',
    createdAt: '2026-06-01 18:00',
    updatedAt: '2026-06-01 18:30',
    stage: 'Finish (Stage 6)',
    conversations: 115,
    messages: 572,
    author: 'admin',
    tags: ['hotfix'],
    accuracy: 87.5,
    labeling: 'not_started',
    labelingTasks: 0,
    labelingTasksDone: 0,
  },
];

const STATUS_CONFIG = {
  'completed': { label: 'Completed', icon: <CheckCircle size={14} />, className: 'status-completed' },
  'in-progress': { label: 'In Progress', icon: <AlertCircle size={14} />, className: 'status-in-progress' },
  'archived': { label: 'Archived', icon: <XCircle size={14} />, className: 'status-archived' },
  'failed': { label: 'Failed', icon: <XCircle size={14} />, className: 'status-failed' },
};

function VersionDataPrepView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 5;

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
                      <button className="vdp-action-btn restore" style={{ background: '#10b981', color: 'white', border: 'none' }}>
                        <Play size={14} /> Tiếp tục Pipeline →
                      </button>
                    )}
                    <button className="vdp-action-btn export">
                      <Download size={14} /> Export
                    </button>
                    <button className="vdp-action-btn delete">
                      <Trash2 size={14} /> Delete
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
