import React, { useState } from 'react';
import {
  ArrowLeft, CheckCircle, Clock, AlertCircle, Users, Eye,
  BarChart2, AlertTriangle, ChevronRight, Shield, X, Send,
  FileText, MessageSquare, RefreshCw, Calendar, Tag
} from 'lucide-react';
import '../taskdetail.css';

/* ── Demo data ── */
const TASK_DATA = {
  id: 'TASK-001',
  name: 'Gán nhãn Toán 11 — Batch 1',
  dataset: 'Toan_11',
  version: 'v3',
  batchStart: 1,
  batchCount: 40,
  reviewMode: 'double',
  priority: 'high',
  deadline: '2026-06-05',
  status: 'submitted',
  guideline: 'Gán nhãn cho các hội thoại về môn Toán lớp 11. Phân loại Intent (Ask Explanation, Solve Exercise...) và Action (Guide Step-by-step, Give Hint...). Đánh giá chất lượng hội thoại.',
  disableAi: false,
  createdAt: '2026-06-01',
};

const STAFF_LIST = [
  { id: 's1', name: 'Nguyễn Văn A', email: 'nguyenvana@fpt.edu.vn', progress: 40, total: 40, status: 'submitted', submittedAt: '2026-06-03 14:30' },
  { id: 's2', name: 'Trần Thị B', email: 'tranthib@fpt.edu.vn', progress: 35, total: 40, status: 'draft', submittedAt: null },
];

const SAMPLES = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  key: `conv_${String(i + 1).padStart(3, '0')}`,
  preview: i % 4 === 0 ? 'Em không hiểu chuyển động thẳng đều...' : i % 4 === 1 ? 'Công thức x = x0 + vt có nghĩa...' : i % 4 === 2 ? 'Cho em đáp án luôn đi...' : 'Thầy ơi gia tốc là gì...',
  assignees: ['Nguyễn Văn A', 'Trần Thị B'],
  statusA: i < 10 ? 'done' : 'pending',
  statusB: i < 8 ? 'done' : 'pending',
  conflict: i === 2 || i === 5 || i === 9,
}));

const CONFLICTS = [
  { sampleId: 3, key: 'conv_003', annotators: 2, iaa: 0.42, status: 'pending',
    labelA: { subject: 'Vật lý', quality: 'Good' }, labelB: { subject: 'Toán', quality: 'Medium' } },
  { sampleId: 6, key: 'conv_006', annotators: 2, iaa: 0.38, status: 'pending',
    labelA: { subject: 'Vật lý', quality: 'Medium' }, labelB: { subject: 'Vật lý', quality: 'Poor' } },
  { sampleId: 10, key: 'conv_010', annotators: 2, iaa: 0.55, status: 'resolved',
    labelA: { subject: 'Toán', quality: 'Good' }, labelB: { subject: 'Toán', quality: 'Medium' } },
];

const PRODUCTIVITY = [
  { name: 'Nguyễn Văn A', labelsPerHour: 8.5, completion: 100, lastActive: '14:30 03/06' },
  { name: 'Trần Thị B', labelsPerHour: 6.2, completion: 87.5, lastActive: '16:15 03/06' },
];

function LabelingTaskDetailView({ onBack }) {
  const [activeTab, setActiveTab] = useState('samples');
  const [showGuide, setShowGuide] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(null);
  const [resolvedConflicts, setResolvedConflicts] = useState(['conv_010']);
  const [taskCompleted, setTaskCompleted] = useState(false);

  const task = TASK_DATA;
  const totalProgress = STAFF_LIST.reduce((s, st) => s + st.progress, 0);
  const totalPossible = STAFF_LIST.reduce((s, st) => s + st.total, 0);
  const overallProgress = Math.round((totalProgress / totalPossible) * 100);
  const pendingConflicts = CONFLICTS.filter(c => !resolvedConflicts.includes(c.key)).length;
  const allSubmitted = STAFF_LIST.every(s => s.status === 'submitted');

  const handleResolveConflict = (key) => {
    setResolvedConflicts(prev => [...prev, key]);
    setShowConflictModal(null);
  };

  return (
    <div className="td-container">
      {/* Header */}
      <div className="td-header-bar">
        <button className="td-back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div className="td-header-info">
          <h2>{task.name}</h2>
          <span className="td-header-meta">{task.dataset} - {task.version} · {task.id}</span>
        </div>
        <div className="td-header-actions">
          {taskCompleted ? (
            <button className="td-btn-pipeline">
              <ChevronRight size={16} /> Tiếp tục Pipeline →
            </button>
          ) : (
            <button
              className={`td-btn-complete ${allSubmitted && pendingConflicts === 0 ? '' : 'disabled'}`}
              onClick={() => allSubmitted && pendingConflicts === 0 && setTaskCompleted(true)}
              disabled={!allSubmitted || pendingConflicts > 0}
            >
              <CheckCircle size={16} /> Đánh dấu hoàn thành
            </button>
          )}
        </div>
      </div>

      <div className="td-main-layout">
        {/* Sidebar */}
        <div className="td-sidebar">
          {/* Task Info */}
          <div className="td-sidebar-section">
            <h4>Thông tin Task</h4>
            <div className="td-info-grid">
              <div className="td-info-row">
                <span className="td-info-label">Dataset</span>
                <span className="td-info-value">{task.dataset} - {task.version}</span>
              </div>
              <div className="td-info-row">
                <span className="td-info-label">Batch</span>
                <span className="td-info-value">Samples {task.batchStart}–{task.batchStart + task.batchCount - 1}</span>
              </div>
              <div className="td-info-row">
                <span className="td-info-label">Deadline</span>
                <span className="td-info-value"><Calendar size={12} /> {task.deadline}</span>
              </div>
              <div className="td-info-row">
                <span className="td-info-label">Priority</span>
                <span className={`td-pri-badge td-pri-${task.priority}`}>{task.priority}</span>
              </div>
              <div className="td-info-row">
                <span className="td-info-label">Review Mode</span>
                <span className="td-review-badge">{task.reviewMode === 'double' ? '👥 Double Review' : '👤 Single'}</span>
              </div>
              <div className="td-info-row">
                <span className="td-info-label">Trạng thái</span>
                <span className={`td-status-badge ${taskCompleted ? 'completed' : 'submitted'}`}>
                  {taskCompleted ? '✅ Completed' : '📤 ' + task.status}
                </span>
              </div>
            </div>
          </div>

          {/* Guideline */}
          <div className="td-sidebar-section">
            <div className="td-section-header" onClick={() => setShowGuide(!showGuide)} style={{ cursor: 'pointer' }}>
              <h4><FileText size={14} /> Hướng dẫn</h4>
              {showGuide ? <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={14} />}
            </div>
            {showGuide && <p className="td-guideline-text">{task.guideline}</p>}
          </div>

          {/* Overall Progress */}
          <div className="td-sidebar-section">
            <h4>Tiến độ tổng</h4>
            <div className="td-progress-circle-wrapper">
              <div className="td-progress-circle">
                <svg viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                  <circle cx="50" cy="50" r="42" stroke="#6366f1" strokeWidth="8" fill="none"
                    strokeDasharray={`${overallProgress * 2.64} 264`}
                    strokeLinecap="round" transform="rotate(-90 50 50)" />
                </svg>
                <span className="td-progress-pct">{overallProgress}%</span>
              </div>
            </div>
          </div>

          {/* Staff List */}
          <div className="td-sidebar-section">
            <h4><Users size={14} /> Staff & Tiến độ</h4>
            {STAFF_LIST.map(staff => (
              <div key={staff.id} className="td-staff-card">
                <div className="td-staff-info">
                  <span className="td-staff-name">{staff.name}</span>
                  <span className="td-staff-email">{staff.email}</span>
                </div>
                <div className="td-staff-progress">
                  <div className="td-staff-bar">
                    <div className="td-staff-bar-fill" style={{ width: `${(staff.progress / staff.total) * 100}%` }}></div>
                  </div>
                  <span className="td-staff-num">{staff.progress}/{staff.total}</span>
                </div>
                <span className={`td-staff-status ${staff.status}`}>
                  {staff.status === 'submitted' ? '✅ Submitted' : '📝 Draft'}
                </span>
                {staff.submittedAt && <span className="td-staff-time">{staff.submittedAt}</span>}
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="td-sidebar-section">
            <h4>Thống kê nhanh</h4>
            <div className="td-quick-stats">
              <div className="td-qs-item"><span>Assigned</span><strong>{SAMPLES.length}</strong></div>
              <div className="td-qs-item"><span>Done</span><strong>{SAMPLES.filter(s => s.statusA === 'done').length}</strong></div>
              <div className="td-qs-item"><span>Submitted</span><strong>{STAFF_LIST.filter(s => s.status === 'submitted').length}</strong></div>
              <div className={`td-qs-item ${pendingConflicts > 0 ? 'conflict' : ''}`}>
                <span>Conflicts</span><strong>{pendingConflicts}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="td-content">
          {/* Tabs */}
          <div className="td-tabs">
            <button className={`td-tab ${activeTab === 'samples' ? 'active' : ''}`} onClick={() => setActiveTab('samples')}>
              📋 Samples ({SAMPLES.length})
            </button>
            <button className={`td-tab ${activeTab === 'conflicts' ? 'active' : ''}`} onClick={() => setActiveTab('conflicts')}>
              ⚠️ Conflicts ({pendingConflicts})
            </button>
            <button className={`td-tab ${activeTab === 'productivity' ? 'active' : ''}`} onClick={() => setActiveTab('productivity')}>
              📊 Productivity
            </button>
          </div>

          {/* Tab: Samples */}
          {activeTab === 'samples' && (
            <div className="td-table-wrapper">
              <table className="td-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Sample Key</th>
                    <th>Preview</th>
                    <th>Assignees</th>
                    <th>Staff A</th>
                    <th>Staff B</th>
                    <th>Conflict?</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLES.map(sample => (
                    <tr key={sample.id} className={sample.conflict && !resolvedConflicts.includes(sample.key) ? 'conflict-row' : ''}>
                      <td>{sample.id}</td>
                      <td><code>{sample.key}</code></td>
                      <td className="td-preview-cell">{sample.preview}</td>
                      <td>
                        <div className="td-assignees">
                          {sample.assignees.map((a, i) => <span key={i} className="td-assignee-chip">{a.split(' ').pop()}</span>)}
                        </div>
                      </td>
                      <td><span className={`td-sample-status ${sample.statusA}`}>{sample.statusA === 'done' ? '✅' : '⏳'}</span></td>
                      <td><span className={`td-sample-status ${sample.statusB}`}>{sample.statusB === 'done' ? '✅' : '⏳'}</span></td>
                      <td>
                        {sample.conflict && !resolvedConflicts.includes(sample.key) ? (
                          <span className="td-conflict-badge">⚠️ Conflict</span>
                        ) : sample.conflict ? (
                          <span className="td-resolved-badge">✅ Resolved</span>
                        ) : (
                          <span className="td-no-conflict">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Conflicts */}
          {activeTab === 'conflicts' && (
            <div className="td-conflicts-list">
              {CONFLICTS.map(conflict => {
                const isResolved = resolvedConflicts.includes(conflict.key);
                return (
                  <div key={conflict.key} className={`td-conflict-card ${isResolved ? 'resolved' : ''}`}>
                    <div className="td-conflict-info">
                      <span className="td-conflict-id"><code>{conflict.key}</code></span>
                      <span className="td-conflict-meta">{conflict.annotators} annotators · IAA: {conflict.iaa}</span>
                    </div>
                    <div className="td-conflict-labels">
                      <div className="td-conflict-label-a">
                        <strong>Staff A:</strong> {conflict.labelA.subject} / {conflict.labelA.quality}
                      </div>
                      <span className="td-vs">vs</span>
                      <div className="td-conflict-label-b">
                        <strong>Staff B:</strong> {conflict.labelB.subject} / {conflict.labelB.quality}
                      </div>
                    </div>
                    <div className="td-conflict-action">
                      {isResolved ? (
                        <span className="td-resolved-tag"><CheckCircle size={14} /> Đã giải quyết</span>
                      ) : (
                        <button className="td-resolve-btn" onClick={() => setShowConflictModal(conflict)}>
                          <Eye size={14} /> Review & Resolve
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab: Productivity */}
          {activeTab === 'productivity' && (
            <div className="td-table-wrapper">
              <table className="td-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Labels/giờ</th>
                    <th>% Hoàn thành</th>
                    <th>Hoạt động gần nhất</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTIVITY.map((p, i) => (
                    <tr key={i}>
                      <td><strong>{p.name}</strong></td>
                      <td><span className="td-speed-badge">{p.labelsPerHour}</span></td>
                      <td>
                        <div className="td-prod-bar-wrapper">
                          <div className="td-prod-bar">
                            <div className="td-prod-fill" style={{ width: `${p.completion}%` }}></div>
                          </div>
                          <span>{p.completion}%</span>
                        </div>
                      </td>
                      <td>{p.lastActive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Conflict Resolution Modal */}
      {showConflictModal && (
        <div className="td-modal-overlay" onClick={() => setShowConflictModal(null)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-header">
              <h3><AlertTriangle size={18} /> Giải quyết Conflict — {showConflictModal.key}</h3>
              <button onClick={() => setShowConflictModal(null)}><X size={18} /></button>
            </div>
            <div className="td-modal-body">
              <div className="td-compare-grid">
                <div className="td-compare-col">
                  <h4>👤 Staff A</h4>
                  <div className="td-compare-item"><span>Subject:</span><strong>{showConflictModal.labelA.subject}</strong></div>
                  <div className="td-compare-item"><span>Quality:</span><strong>{showConflictModal.labelA.quality}</strong></div>
                </div>
                <div className="td-compare-vs">VS</div>
                <div className="td-compare-col">
                  <h4>👤 Staff B</h4>
                  <div className="td-compare-item"><span>Subject:</span><strong>{showConflictModal.labelB.subject}</strong></div>
                  <div className="td-compare-item"><span>Quality:</span><strong>{showConflictModal.labelB.quality}</strong></div>
                </div>
              </div>
              <div className="td-resolve-section">
                <h4>✏️ Chọn nhãn đúng hoặc tự sửa:</h4>
                <div className="td-resolve-options">
                  <button className="td-resolve-option" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    Chọn Staff A
                  </button>
                  <button className="td-resolve-option" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    Chọn Staff B
                  </button>
                  <button className="td-resolve-option primary" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    Publish (chấp nhận)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LabelingTaskDetailView;
