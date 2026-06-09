import React, { useState } from 'react';
import {
  Globe,
  User,
  ThumbsUp,
  Clock,
  Tag,
  ChevronRight,
  Search,
  ExternalLink,
  Bookmark,
  BookmarkCheck
} from 'lucide-react';
import DataLabelingView from './DataLabelingView';
import '../communityhub.css';

/* ── Demo data ── */
const PROJECTS = [
  {
    id: 'p1',
    name: 'Project_03/06_10:48',
    version: 'Version 1',
    owner: 'Duy Nghĩa',
    ownerAvatar: 'DN',
    updatedAt: '10:49:12 3/6/2026',
    status: 'assigned',
    topLabel: 'MOTIVATING',
    topLabelLikes: 1,
    totalConversations: 40,
    labeledByMe: 12,
    category: 'Physics',
    description: 'Conversations about mechanics and kinematics for Socratic tutoring',
  },
  {
    id: 'p2',
    name: 'Project_02/06_14:20',
    version: 'Version 3',
    owner: 'Admin User',
    ownerAvatar: 'AU',
    updatedAt: '16:00:00 2/6/2026',
    status: 'assigned',
    topLabel: 'SOCRATIC',
    topLabelLikes: 5,
    totalConversations: 35,
    labeledByMe: 35,
    category: 'Physics',
    description: 'Re-clustered dataset with K=14 — Newton laws and forces',
  },
  {
    id: 'p3',
    name: 'Project_01/06_16:14',
    version: 'Version 1',
    owner: 'Admin User',
    ownerAvatar: 'AU',
    updatedAt: '17:30:00 1/6/2026',
    status: 'public',
    topLabel: 'INSTRUCTIVE',
    topLabelLikes: 3,
    totalConversations: 120,
    labeledByMe: 0,
    category: 'Physics',
    description: 'Initial baseline dataset — mixed physics topics',
  },
  {
    id: 'p4',
    name: 'Project_03/06_08:30',
    version: 'Version 1',
    owner: 'Duy Nghĩa',
    ownerAvatar: 'DN',
    updatedAt: '09:00:00 3/6/2026',
    status: 'assigned',
    topLabel: 'EXPLAINING',
    topLabelLikes: 2,
    totalConversations: 45,
    labeledByMe: 0,
    category: 'Energy',
    description: 'Conversations about kinetic energy, potential energy, and work',
  },
  {
    id: 'p5',
    name: 'Project_28/05_10:00',
    version: 'Version 2',
    owner: 'Admin User',
    ownerAvatar: 'AU',
    updatedAt: '14:00:00 28/5/2026',
    status: 'public',
    topLabel: 'GUIDING',
    topLabelLikes: 7,
    totalConversations: 80,
    labeledByMe: 0,
    category: 'Waves',
    description: 'Sound waves, ultrasound and frequency — public dataset',
  },
  {
    id: 'p6',
    name: 'Project_02/06_09:00',
    version: 'Version 2',
    owner: 'Duy Nghĩa',
    ownerAvatar: 'DN',
    updatedAt: '11:45:00 2/6/2026',
    status: 'public',
    topLabel: 'CORRECTIVE',
    topLabelLikes: 4,
    totalConversations: 115,
    labeledByMe: 0,
    category: 'Physics',
    description: 'Cleaned dataset — removed error keywords & fixed think tags',
  },
];

const MY_ASSIGNMENTS = [
  {
    id: 'a1',
    projectName: 'Project_03/06_10:48',
    version: 'Version 1',
    owner: 'Duy Nghĩa',
    ownerAvatar: 'DN',
    assignedAt: '10:50:00 3/6/2026',
    dueDate: '18:00:00 5/6/2026',
    totalConversations: 40,
    labeledByMe: 12,
    status: 'in-progress',
    topLabel: 'MOTIVATING',
    category: 'Physics',
  },
  {
    id: 'a2',
    projectName: 'Project_03/06_08:30',
    version: 'Version 1',
    owner: 'Duy Nghĩa',
    ownerAvatar: 'DN',
    assignedAt: '09:15:00 3/6/2026',
    dueDate: '18:00:00 6/6/2026',
    totalConversations: 45,
    labeledByMe: 0,
    status: 'pending',
    topLabel: 'EXPLAINING',
    category: 'Energy',
  },
  {
    id: 'a3',
    projectName: 'Project_02/06_14:20',
    version: 'Version 3',
    owner: 'Admin User',
    ownerAvatar: 'AU',
    assignedAt: '14:30:00 2/6/2026',
    dueDate: '18:00:00 3/6/2026',
    totalConversations: 35,
    labeledByMe: 35,
    status: 'completed',
    topLabel: 'SOCRATIC',
    category: 'Physics',
  },
];

function CommunityHubView() {
  const [activeTab, setActiveTab] = useState('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarked, setBookmarked] = useState([]);
  const [openProject, setOpenProject] = useState(null);

  /* If a project is opened, show the labeling view */
  if (openProject) {
    return <DataLabelingView onBack={() => setOpenProject(null)} />;
  }

  const publicAssigned = PROJECTS.filter(p => {
    const matchSearch = searchQuery.trim() === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.topLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  const assignedCount = PROJECTS.filter(p => p.status === 'assigned').length;

  const myAssignments = MY_ASSIGNMENTS.filter(a => {
    const matchSearch = searchQuery.trim() === '' ||
      a.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.owner.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  const toggleBookmark = (id) => {
    setBookmarked(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  return (
    <div className="ch-container">
      {/* Header */}
      <div className="ch-header">
        <div className="ch-header-left">
          <div className="ch-icon-wrapper">
            <Globe size={24} />
          </div>
          <div>
            <h2>Community Hub</h2>
            <p className="ch-subtitle">Browse public projects and view your labeling assignments</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ch-tabs">
        <button
          className={`ch-tab ${activeTab === 'public' ? 'active' : ''}`}
          onClick={() => setActiveTab('public')}
        >
          Public / Assigned
          <span className="ch-tab-badge">{assignedCount}</span>
        </button>
        <button
          className={`ch-tab ${activeTab === 'my' ? 'active' : ''}`}
          onClick={() => setActiveTab('my')}
        >
          My Assignments
          <span className="ch-tab-badge secondary">{MY_ASSIGNMENTS.length}</span>
        </button>
      </div>

      {/* Search */}
      <div className="ch-search-bar">
        <Search size={16} className="ch-search-icon" />
        <input
          type="text"
          placeholder="Search projects, owners, labels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ch-search-input"
        />
      </div>

      {/* Content */}
      {activeTab === 'public' && (
        <div className="ch-card-grid">
          {publicAssigned.length === 0 && (
            <div className="ch-empty">
              <Globe size={48} />
              <p>No projects found.</p>
            </div>
          )}
          {publicAssigned.map(project => {
            const progress = project.totalConversations > 0
              ? Math.round((project.labeledByMe / project.totalConversations) * 100)
              : 0;
            const isBookmarked = bookmarked.includes(project.id);

            return (
              <div key={project.id} className="ch-project-card">
                <div className="ch-card-top">
                  <div className="ch-card-category">{project.category}</div>
                  <div className="ch-card-top-right">
                    {project.status === 'assigned' && (
                      <span className="ch-assigned-badge">Assigned</span>
                    )}
                    <button
                      className={`ch-bookmark-btn ${isBookmarked ? 'active' : ''}`}
                      onClick={() => toggleBookmark(project.id)}
                      title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                    >
                      {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                    </button>
                  </div>
                </div>

                <h3 className="ch-card-title">{project.name}</h3>

                <div className="ch-card-meta">
                  <span className="ch-card-version">
                    <Tag size={12} />
                    {project.version}
                  </span>
                  <span className="ch-card-owner">
                    <div className="ch-mini-avatar">{project.ownerAvatar}</div>
                    Owner: <strong>{project.owner}</strong>
                  </span>
                </div>

                <p className="ch-card-desc">{project.description}</p>

                <div className="ch-card-updated">
                  <Clock size={12} />
                  Updated: {project.updatedAt}
                </div>

                <div className="ch-card-label-box">
                  <span className="ch-label-title">TOP LABEL</span>
                  <div className="ch-label-row">
                    <span className="ch-label-name">{project.topLabel}</span>
                    <span className="ch-label-likes">
                      <ThumbsUp size={13} />
                      {project.topLabelLikes}
                    </span>
                  </div>
                </div>

                {project.status === 'assigned' && project.labeledByMe > 0 && (
                  <div className="ch-card-progress">
                    <div className="ch-card-progress-bar">
                      <div className="ch-card-progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="ch-card-progress-text">{project.labeledByMe}/{project.totalConversations} labeled</span>
                  </div>
                )}

                <button className="ch-open-btn" onClick={() => setOpenProject(project.id)}>
                  <ExternalLink size={16} />
                  Open
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'my' && (
        <div className="ch-assignments-list">
          {myAssignments.length === 0 && (
            <div className="ch-empty">
              <User size={48} />
              <p>No assignments found.</p>
            </div>
          )}
          {myAssignments.map(assignment => {
            const progress = assignment.totalConversations > 0
              ? Math.round((assignment.labeledByMe / assignment.totalConversations) * 100)
              : 0;

            const statusClass = assignment.status === 'completed' ? 'completed'
              : assignment.status === 'in-progress' ? 'in-progress'
              : 'pending';

            const statusLabel = assignment.status === 'completed' ? 'Completed'
              : assignment.status === 'in-progress' ? 'In Progress'
              : 'Pending';

            return (
              <div key={assignment.id} className={`ch-assignment-card ${statusClass}`}>
                <div className="ch-assign-header">
                  <div className="ch-assign-info">
                    <h3>{assignment.projectName}</h3>
                    <div className="ch-assign-meta">
                      <span><Tag size={12} /> {assignment.version}</span>
                      <span>
                        <div className="ch-mini-avatar">{assignment.ownerAvatar}</div>
                        {assignment.owner}
                      </span>
                      <span className="ch-assign-category">{assignment.category}</span>
                    </div>
                  </div>
                  <span className={`ch-assign-status ${statusClass}`}>{statusLabel}</span>
                </div>

                <div className="ch-assign-dates">
                  <div className="ch-assign-date-item">
                    <span className="ch-assign-date-label">Assigned</span>
                    <span className="ch-assign-date-value">{assignment.assignedAt}</span>
                  </div>
                  <div className="ch-assign-date-item">
                    <span className="ch-assign-date-label">Due Date</span>
                    <span className="ch-assign-date-value">{assignment.dueDate}</span>
                  </div>
                  <div className="ch-assign-date-item">
                    <span className="ch-assign-date-label">Top Label</span>
                    <span className="ch-assign-date-value label">{assignment.topLabel}</span>
                  </div>
                </div>

                <div className="ch-assign-progress">
                  <div className="ch-assign-progress-header">
                    <span>Progress</span>
                    <span className="ch-assign-progress-num">{assignment.labeledByMe} / {assignment.totalConversations}</span>
                  </div>
                  <div className="ch-assign-progress-bar">
                    <div className={`ch-assign-progress-fill ${statusClass}`} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <button className="ch-open-btn" onClick={() => setOpenProject(assignment.id)}>
                  <ExternalLink size={16} />
                  Open & Label
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CommunityHubView;
