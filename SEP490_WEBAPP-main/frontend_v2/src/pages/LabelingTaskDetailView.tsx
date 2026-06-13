import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle, Clock, AlertCircle, Users, Eye,
  BarChart2, AlertTriangle, ChevronRight, Shield, X, Send,
  FileText, MessageSquare, RefreshCw, Calendar, Tag, Database, Activity, Layers
} from 'lucide-react';
import { api } from '../services/api';
import '../styles/taskdetail.css';

export default function LabelingTaskDetailView({ onBack, task, initialBatchId }) {
  const [taskDetail, setTaskDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [activeTab, setActiveTab] = useState('progress');
  const [resolvedConflicts, setResolvedConflicts] = useState<string[]>([]);
  const [showConflictModal, setShowConflictModal] = useState<any>(null);
  const [showSampleDetailModal, setShowSampleDetailModal] = useState<any>(null);
  
  // Pagination & Filter state for samples
  const [currentPage, setCurrentPage] = useState(1);
  const [sampleFilter, setSampleFilter] = useState('all'); // 'all', 'completed', 'pending'
  const itemsPerPage = 10;
  
  useEffect(() => {
    if (!task) return;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/dataprep/assignments/manager/task/${task.id}`);
        if (res.data.success) {
          setTaskDetail(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch task detail', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [task]);

  if (!task) return null;
  
  if (loading || !taskDetail) {
    return (
      <div className="td-container new-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <RefreshCw size={24} className="animate-spin" style={{ color: '#4f46e5' }} />
        <span style={{ marginLeft: 8, color: '#4b5563' }}>Đang tải dữ liệu giám sát...</span>
      </div>
    );
  }

  const batches = taskDetail.batches || [];
  const staffList = taskDetail.staffList || [];
  const samples = taskDetail.samples || [];
  
  // Filter and Pagination logic
  const filteredSamples = samples.filter((s: any) => {
    if (sampleFilter === 'all') return true;
    const doneCount = staffList.filter((staff: any) => s.staffStatus?.[staff.id] === 'done').length;
    if (sampleFilter === 'completed') return doneCount === staffList.length;
    if (sampleFilter === 'pending') return doneCount < staffList.length;
    return true;
  });
  
  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
  const paginatedSamples = filteredSamples.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const conflicts = taskDetail.conflicts || [];

  const selectedBatch = selectedBatchId ? batches.find(b => b.id === selectedBatchId) : null;
  const pendingConflicts = conflicts.filter(c => !resolvedConflicts.includes(c.key)).length;

  const handleResolveConflict = (key) => {
    setResolvedConflicts(prev => [...prev, key]);
    setShowConflictModal(null);
  };

  return (
    <div className="td-container new-layout">
      <div className="td-layout-wrapper">
        
        {/* Left Sidebar: Navigation & Batches */}
        <div className="td-left-sidebar">
          <div className="td-back-header">
            <button className="td-back-btn" onClick={onBack}>
              <ArrowLeft size={16} /> Quay lại Quản lý
            </button>
          </div>

          <div className="td-sidebar-title">
            <Database size={16} />
            <div className="td-sidebar-title-text">
              <h3>{task.dataset}</h3>
              <span>{task.version}</span>
            </div>
          </div>

          <div className="td-sidebar-menu">
            <div 
              className={`td-menu-item ${!selectedBatchId ? 'active' : ''}`}
              onClick={() => setSelectedBatchId(null)}
            >
              <Activity size={16} /> Tổng quan Task
            </div>

            <div className="td-menu-section-title">
              DANH SÁCH LÔ ({batches.length})
            </div>

            {batches.map(b => (
              <div 
                key={b.id} 
                className={`td-menu-item batch-item ${selectedBatchId === b.id ? 'active' : ''}`}
                onClick={() => setSelectedBatchId(b.id)}
              >
                <Layers size={16} />
                <div className="td-batch-item-info">
                  <span className="td-batch-name">{b.name}</span>
                  <span className="td-batch-desc">Samples: {b.totalSamples}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Content: Dashboard */}
        <div className="td-main-content">
          <div className="td-content-header">
            <h2>{selectedBatch ? selectedBatch.name : 'Tổng quan: ' + taskDetail.name}</h2>
            {selectedBatch && (
              <span className="td-header-badge">{selectedBatch.status === 'completed' ? '✅ Completed' : '⏳ In Progress'}</span>
            )}
          </div>

          {/* KPI Cards */}
          <div className="td-kpi-grid">
            <div className="td-kpi-card">
              <div className="td-kpi-icon progress"><CheckCircle size={20} /></div>
              <div className="td-kpi-info">
                <span className="td-kpi-value">
                  {selectedBatch 
                    ? Math.round(((selectedBatch.labeledCount || 0) / (selectedBatch.totalSamples || 1)) * 100) 
                    : Math.round(((taskDetail.labeledCount || 0) / (taskDetail.totalSamples || 1)) * 100)}%
                </span>
                <span className="td-kpi-label">Tiến độ gán nhãn</span>
              </div>
            </div>
            <div className="td-kpi-card">
              <div className="td-kpi-icon conflict"><AlertTriangle size={20} /></div>
              <div className="td-kpi-info">
                <span className="td-kpi-value">{pendingConflicts}</span>
                <span className="td-kpi-label">Conflict cần xử lý</span>
              </div>
            </div>
            <div className="td-kpi-card">
              <div className="td-kpi-icon productivity"><Clock size={20} /></div>
              <div className="td-kpi-info">
                <span className="td-kpi-value">
                  {staffList.length > 0 ? Math.round(staffList.reduce((acc, s) => acc + (s.labelsPerHour || 0), 0) / staffList.length * 10) / 10 : 0}
                </span>
                <span className="td-kpi-label">Samples / hr (Avg)</span>
              </div>
            </div>
          </div>

          {/* Main Dashboard Tabs */}
          <div className="td-tabs">
            <button className={`td-tab ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>
              <BarChart2 size={16} /> Tiến độ Nhân viên
            </button>
            <button className={`td-tab ${activeTab === 'conflicts' ? 'active' : ''}`} onClick={() => setActiveTab('conflicts')}>
              <AlertTriangle size={16} /> Quản lý Conflict
              {pendingConflicts > 0 && <span className="td-badge">{pendingConflicts}</span>}
            </button>
            <button className={`td-tab ${activeTab === 'samples' ? 'active' : ''}`} onClick={() => setActiveTab('samples')}>
              <Database size={16} /> Dữ liệu Chi tiết
            </button>
          </div>

          <div className="td-tab-content">
            {activeTab === 'progress' && (
              <div className="td-panel">
                <h3>Thống kê Năng suất</h3>
                <div className="td-table-wrapper">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>Nhân viên</th>
                        <th>Trạng thái</th>
                        <th>Hoàn thành</th>
                        <th>Tốc độ (samples/hr)</th>
                        <th>Cập nhật cuối</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((p, i) => (
                        <tr key={i}>
                          <td>
                            <div className="td-staff-cell">
                              <div className="al-avatar sm">{p.name ? p.name.split(' ').pop()[0] : 'U'}</div>
                              {p.name}
                            </div>
                          </td>
                          <td>
                            <span className={`td-status-sm ${p.completion === 100 ? 'done' : 'working'}`}>
                              {p.completion === 100 ? 'Đã nộp' : 'Đang làm'}
                            </span>
                          </td>
                          <td>
                            <div className="td-progress-cell">
                              <div className="td-progress-bar-sm"><div className="td-progress-fill-sm" style={{ width: `${p.completion}%` }}></div></div>
                              <span>{Math.round(p.completion)}%</span>
                            </div>
                          </td>
                          <td>{p.labelsPerHour || 0}</td>
                          <td>{p.submittedAt ? new Date(p.submittedAt).toLocaleString() : 'Chưa cập nhật'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'conflicts' && (
              <div className="td-panel">
                <div className="td-panel-header">
                  <h3>Xung đột nhãn (Inter-Annotator Agreement)</h3>
                  <button className="al-btn al-btn-outline"><RefreshCw size={14} style={{ marginRight: '6px' }}/> Chạy lại hàm tính IAA</button>
                </div>
                <div className="td-conflict-list">
                  {conflicts.map((c, idx) => {
                    const isResolved = resolvedConflicts.includes(c.key);
                    return (
                      <div key={idx} className={`td-conflict-item ${isResolved ? 'resolved' : ''}`}>
                        <div className="td-conflict-header">
                          <span className="td-conflict-id">Sample #{c.sampleId} ({c.key})</span>
                          {isResolved ? (
                            <span className="td-status-badge resolved"><CheckCircle size={14} /> Đã phân xử</span>
                          ) : (
                            <span className="td-status-badge pending"><AlertCircle size={14} /> Cần phân xử</span>
                          )}
                        </div>
                        <div className="td-conflict-body">
                          <div className="td-conflict-label">
                            <span className="td-annotator"><div className="al-avatar xs">{c.labelA.subject ? c.labelA.subject.split(' ').pop()[0] : 'U'}</div> {c.labelA.subject}</span>
                            <div className="td-label-tags">
                              <span className="td-tag subject">{c.labelA.quality}</span>
                            </div>
                          </div>
                          <div className="td-conflict-vs">VS</div>
                          <div className="td-conflict-label">
                            <span className="td-annotator"><div className="al-avatar xs">{c.labelB.subject ? c.labelB.subject.split(' ').pop()[0] : 'U'}</div> {c.labelB.subject}</span>
                            <div className="td-label-tags">
                              <span className="td-tag subject">{c.labelB.quality}</span>
                            </div>
                          </div>
                        </div>
                        {!isResolved && (
                          <div className="td-conflict-actions">
                            <button className="al-btn al-btn-primary" onClick={() => setShowConflictModal(c)}>Phân xử ngay</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'samples' && (
              <div className="td-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3>Danh sách dữ liệu</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`al-btn ${sampleFilter === 'all' ? 'al-btn-primary' : 'al-btn-outline'}`} onClick={() => { setSampleFilter('all'); setCurrentPage(1); }}>Tất cả</button>
                    <button className={`al-btn ${sampleFilter === 'completed' ? 'al-btn-primary' : 'al-btn-outline'}`} onClick={() => { setSampleFilter('completed'); setCurrentPage(1); }}>Hoàn thành</button>
                    <button className={`al-btn ${sampleFilter === 'pending' ? 'al-btn-primary' : 'al-btn-outline'}`} onClick={() => { setSampleFilter('pending'); setCurrentPage(1); }}>Đang chờ</button>
                  </div>
                </div>
                <div className="td-table-wrapper">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Preview</th>
                        <th>Trạng thái (Annotators)</th>
                        <th>Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSamples.map((s: any) => {
                        const doneCount = staffList.filter((staff: any) => s.staffStatus?.[staff.id] === 'done').length;
                        return (
                        <tr key={s.id}>
                          <td>{s.id}</td>
                          <td className="td-preview-cell">{s.preview}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              {staffList.map((staff: any, idx: number) => {
                                 const status = s.staffStatus?.[staff.id] || 'pending';
                                 return (
                                   <div 
                                     key={idx} 
                                     className="al-avatar xs" 
                                     title={`${staff.name}: ${status === 'done' ? 'Đã gán nhãn' : 'Chưa gán nhãn'}`}
                                     style={{ 
                                       border: status === 'done' ? '2px solid #10b981' : '2px solid #e5e7eb',
                                       opacity: status === 'done' ? 1 : 0.4,
                                       marginLeft: idx > 0 ? '-8px' : '0',
                                       zIndex: staffList.length - idx,
                                       backgroundColor: status === 'done' ? '#ecfdf5' : '#f9fafb',
                                       color: status === 'done' ? '#059669' : '#9ca3af'
                                     }}
                                   >
                                     {staff.name ? staff.name.split(' ').pop()[0] : 'U'}
                                   </div>
                                 )
                              })}
                              <span style={{ marginLeft: '12px', fontSize: '12px', fontWeight: 500, color: doneCount === staffList.length ? '#10b981' : '#6b7280' }}>
                                {doneCount}/{staffList.length}
                              </span>
                            </div>
                          </td>
                          <td><button className="td-icon-btn" onClick={() => setShowSampleDetailModal(s)}><Eye size={16}/></button></td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '12px' }}>
                    <button 
                      className="al-btn al-btn-outline" 
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    >
                      Trước
                    </button>
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>
                      Trang {currentPage} / {totalPages}
                    </span>
                    <button 
                      className="al-btn al-btn-outline" 
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    >
                      Sau
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conflict Modal */}
      {showConflictModal && (
        <div className="td-modal-overlay">
          <div className="td-modal">
            <div className="td-modal-header">
              <h3>Phân xử Xung đột - Sample #{showConflictModal.sampleId}</h3>
              <button className="td-modal-close" onClick={() => setShowConflictModal(null)}><X size={20}/></button>
            </div>
            <div className="td-modal-body">
              <div className="td-text-preview">
                <p><strong>Nội dung đoạn hội thoại:</strong></p>
                <div className="td-chat-preview">
                  <div className="td-chat-msg user">Em không hiểu cách giải bài này, thầy làm mẫu được không?</div>
                  <div className="td-chat-msg bot">Chào em, đầu tiên ta xét điều kiện của phương trình...</div>
                </div>
              </div>
              <div className="td-decide-section">
                <p><strong>Chọn nhãn đúng:</strong></p>
                <div className="td-decide-options">
                  <button className="td-decide-btn" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    <div className="td-decide-title">Giữ nhãn của {staffList[0]?.name || 'Nguyễn Văn A'}</div>
                    <div className="td-tag subject">{showConflictModal.labelA.subject}</div>
                    <div className="td-tag quality">{showConflictModal.labelA.quality}</div>
                  </button>
                  <button className="td-decide-btn" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    <div className="td-decide-title">Giữ nhãn của {staffList[1]?.name || 'Trần Thị B'}</div>
                    <div className="td-tag subject">{showConflictModal.labelB.subject}</div>
                    <div className="td-tag quality">{showConflictModal.labelB.quality}</div>
                  </button>
                  <button className="td-decide-btn custom">
                    <div className="td-decide-title">Chỉnh sửa thành nhãn khác...</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sample Detail Modal */}
      {showSampleDetailModal && (
        <div className="td-modal-overlay">
          <div className="td-modal" style={{ maxWidth: '600px' }}>
            <div className="td-modal-header">
              <h3>Chi tiết Sample #{showSampleDetailModal.id}</h3>
              <button className="td-modal-close" onClick={() => setShowSampleDetailModal(null)}><X size={20}/></button>
            </div>
            <div className="td-modal-body">
              <div className="td-text-preview" style={{ marginBottom: '20px' }}>
                <p><strong>Nội dung:</strong></p>
                <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '6px', fontSize: '14px', lineHeight: '1.5' }}>
                  {showSampleDetailModal.preview}
                </div>
              </div>
              <div className="td-decide-section">
                <p><strong>Kết quả gán nhãn:</strong></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {staffList.map((staff: any) => {
                    const status = showSampleDetailModal.staffStatus?.[staff.id] || 'pending';
                    const label = showSampleDetailModal.staffLabels?.[staff.id];
                    return (
                      <div key={staff.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className={`al-avatar xs ${status}`}>{staff.name ? staff.name.split(' ').pop()[0] : 'U'}</div>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>{staff.name}</span>
                        </div>
                        <div>
                          {status === 'done' ? (
                            <span className="td-tag quality" style={{ margin: 0 }}>{label || 'Đã gán nhãn'}</span>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#9ca3af' }}>Đang chờ</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
