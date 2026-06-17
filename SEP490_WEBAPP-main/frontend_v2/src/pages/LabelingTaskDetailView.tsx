import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle, Clock, AlertCircle, Users, Eye,
  BarChart2, AlertTriangle, ChevronRight, Shield, X, Send,
  FileText, MessageSquare, RefreshCw, Calendar, Tag, Database, Activity, Layers
} from 'lucide-react';
import { api } from '../services/api';
import SplitViewModal from '../components/dataprep/SplitViewModal';
import '../styles/taskdetail.css';

export default function LabelingTaskDetailView({ onBack, task, initialBatchId }) {
  const [taskDetail, setTaskDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId);
  const [activeTab, setActiveTab] = useState('progress');
  const [resolvedConflicts, setResolvedConflicts] = useState<string[]>([]);
  const [showConflictModal, setShowConflictModal] = useState<any>(null);
  
  // Pagination & Filter state for samples
  const [currentPage, setCurrentPage] = useState(1);
  const [sampleFilter, setSampleFilter] = useState('all');
  const itemsPerPage = 10;

  // Split-View state
  const [splitViewOpen, setSplitViewOpen] = useState(false);
  const [splitViewSampleId, setSplitViewSampleId] = useState('');
  const [splitViewStaffId, setSplitViewStaffId] = useState('');
  const [splitViewStaffName, setSplitViewStaffName] = useState('');

  // Staff Sample List modal state
  const [staffSamplesModal, setStaffSamplesModal] = useState<any>(null);
  const [staffSamplePage, setStaffSamplePage] = useState(1);
  const staffSamplePageSize = 20;

  // Approve/Reject loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  const refreshTaskDetail = async () => {
    try {
      const res = await api.get(`/dataprep/assignments/manager/task/${task.id}`);
      if (res.data.success) {
        setTaskDetail(res.data.data);
      }
    } catch (err) {
      console.error('Failed to refresh task detail', err);
    }
  };

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
  
  // Filter and Pagination logic for samples tab
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

  const overallProgress = taskDetail.totalSamples > 0
    ? Math.round(((taskDetail.labeledCount || 0) / taskDetail.totalSamples) * 100)
    : 0;

  const handleResolveConflict = (key) => {
    setResolvedConflicts(prev => [...prev, key]);
    setShowConflictModal(null);
  };

  // Open staff sample list modal
  const openStaffSamples = (staff: any) => {
    // Filter samples assigned to this staff
    const staffSamples = samples
      .filter((s: any) => s.staffStatus?.hasOwnProperty(staff.id))
      .map((s: any) => ({
        ...s,
        isLabeled: s.staffStatus?.[staff.id] === 'done',
        labelName: s.staffLabels?.[staff.id] || null,
      }))
      // Ưu tiên câu đã labeled lên trước
      .sort((a, b) => (b.isLabeled ? 1 : 0) - (a.isLabeled ? 1 : 0));

    setStaffSamplesModal({ staff, samples: staffSamples });
    setStaffSamplePage(1);
  };

  // Open split-view for a specific sample + staff
  const openSplitView = (sampleObjectId: string, staffId: string, staffName: string) => {
    setSplitViewSampleId(sampleObjectId);
    setSplitViewStaffId(staffId);
    setSplitViewStaffName(staffName);
    setSplitViewOpen(true);
  };

  // Status display helper
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'approved': return { label: 'Đã duyệt', className: 'done', icon: '✅' };
      case 'submitted': return { label: 'Đã nộp', className: 'submitted', icon: '📤' };
      case 'rejected': return { label: 'Bị từ chối', className: 'rejected', icon: '🔴' };
      case 'in_progress': return { label: 'Đang làm', className: 'working', icon: '🔄' };
      default: return { label: 'Chờ xử lý', className: 'pending-status', icon: '⏳' };
    }
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
              <h3>{task.dataset || 'Dataset'}</h3>
              <span>{task.version || ''}</span>
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
              DANH SÁCH BATCH ({batches.length})
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
            <h2>{selectedBatch ? selectedBatch.name : taskDetail.name}</h2>
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
                    : overallProgress}%
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
              <div className="td-kpi-icon productivity"><Users size={20} /></div>
              <div className="td-kpi-info">
                <span className="td-kpi-value">{staffList.length}</span>
                <span className="td-kpi-label">Nhân viên tham gia</span>
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
            {/* ===== TAB 1: TIẾN ĐỘ NHÂN VIÊN ===== */}
            {activeTab === 'progress' && (
              <div className="td-panel">
                <h3>Thống kê Tiến độ</h3>
                <div className="td-table-wrapper">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>Nhân viên</th>
                        <th>Trạng thái</th>
                        <th>Tiến độ</th>
                        <th>Số lượng</th>
                        <th>Cập nhật cuối</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((p, i) => {
                        const statusInfo = getStatusDisplay(p.status);
                        return (
                          <tr key={i}>
                            <td>
                              <div className="td-staff-cell">
                                <div className="al-avatar sm">{p.name ? p.name.split(' ').pop()[0] : 'U'}</div>
                                {p.name}
                              </div>
                            </td>
                            <td>
                              <span className={`td-status-sm ${statusInfo.className}`}>
                                {statusInfo.icon} {statusInfo.label}
                              </span>
                            </td>
                            <td>
                              <div className="td-progress-cell">
                                <div className="td-progress-bar-sm"><div className="td-progress-fill-sm" style={{ width: `${p.completion}%` }}></div></div>
                                <span>{Math.round(p.completion)}%</span>
                              </div>
                            </td>
                            <td style={{ fontSize: '13px', color: '#6b7280' }}>
                              {p.progress}/{p.total} samples
                            </td>
                            <td>{p.submittedAt ? new Date(p.submittedAt).toLocaleString() : 'Chưa cập nhật'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {/* Nút Xem chi tiết → mở danh sách samples của staff */}
                                <button
                                  className="td-action-btn"
                                  style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}
                                  onClick={() => openStaffSamples(p)}
                                  title="Xem danh sách samples của nhân viên"
                                >
                                  <Eye size={14} /> Xem
                                </button>
                                
                                {/* Approve/Reject buttons */}
                                {p.status === 'submitted' && (
                                  <>
                                    <button
                                      className="td-action-btn approve"
                                      disabled={actionLoading === p.submissionId}
                                      onClick={async () => {
                                        if (!window.confirm(`Duyệt submission của ${p.name}?`)) return;
                                        setActionLoading(p.submissionId);
                                        try {
                                          await api.post(`/dataprep/assignments/manager/submission/${p.submissionId}/approve`);
                                          await refreshTaskDetail();
                                        } catch (e: any) { alert(e.response?.data?.error || 'Lỗi'); }
                                        setActionLoading(null);
                                      }}
                                    >✅ Duyệt</button>
                                    <button
                                      className="td-action-btn reject"
                                      disabled={actionLoading === p.submissionId}
                                      onClick={async () => {
                                        const reason = window.prompt('Nhập lý do từ chối (bắt buộc):');
                                        if (!reason || reason.trim() === '') {
                                          if (reason !== null) alert('Vui lòng nhập lý do từ chối!');
                                          return;
                                        }
                                        setActionLoading(p.submissionId);
                                        try {
                                          await api.post(`/dataprep/assignments/manager/submission/${p.submissionId}/reject`, { reason: reason.trim() });
                                          await refreshTaskDetail();
                                        } catch (e: any) { alert(e.response?.data?.error || 'Lỗi'); }
                                        setActionLoading(null);
                                      }}
                                    >❌ Từ chối</button>
                                  </>
                                )}
                                {p.status === 'approved' && <span className="td-status-sm done">✅ Đã duyệt</span>}
                                {p.status === 'rejected' && <span className="td-status-sm" style={{color:'#dc2626'}}>🔴 Đã từ chối</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== TAB 2: QUẢN LÝ CONFLICT ===== */}
            {activeTab === 'conflicts' && (
              <div className="td-panel">
                <div className="td-panel-header">
                  <h3>Xung đột nhãn (Inter-Annotator Agreement)</h3>
                </div>
                {conflicts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                    <CheckCircle size={40} style={{ marginBottom: 12 }} />
                    <p>Chưa có xung đột nhãn nào.</p>
                  </div>
                ) : (
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
                )}
              </div>
            )}

            {/* ===== TAB 3: DỮ LIỆU CHI TIẾT ===== */}
            {activeTab === 'samples' && (
              <div className="td-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3>Danh sách dữ liệu ({filteredSamples.length} samples)</h3>
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
                        <th style={{ width: '60px' }}>#</th>
                        <th>Preview nội dung</th>
                        <th style={{ width: '160px' }}>Annotators</th>
                        <th style={{ width: '80px' }}>Xem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedSamples.map((s: any) => {
                        const doneCount = staffList.filter((staff: any) => s.staffStatus?.[staff.id] === 'done').length;
                        return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600, color: '#6366f1' }}>#{s.id}</td>
                          <td className="td-preview-cell" style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>{s.preview}</td>
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
                          <td>
                            <button
                              className="td-icon-btn"
                              title="Mở Split-View"
                              onClick={() => openSplitView(s.sampleObjectId, '', '')}
                            >
                              <Eye size={16}/>
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '12px' }}>
                    <button className="al-btn al-btn-outline" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}>Trước</button>
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>Trang {currentPage} / {totalPages}</span>
                    <button className="al-btn al-btn-outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}>Sau</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== MODAL: CONFLICT RESOLUTION ===== */}
      {showConflictModal && (
        <div className="td-modal-overlay">
          <div className="td-modal">
            <div className="td-modal-header">
              <h3>Phân xử Xung đột - Sample #{showConflictModal.sampleId}</h3>
              <button className="td-modal-close" onClick={() => setShowConflictModal(null)}><X size={20}/></button>
            </div>
            <div className="td-modal-body">
              <div className="td-decide-section">
                <p><strong>Chọn nhãn đúng:</strong></p>
                <div className="td-decide-options">
                  <button className="td-decide-btn" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    <div className="td-decide-title">Giữ nhãn của {showConflictModal.labelA.subject}</div>
                    <div className="td-tag subject">{showConflictModal.labelA.quality}</div>
                  </button>
                  <button className="td-decide-btn" onClick={() => handleResolveConflict(showConflictModal.key)}>
                    <div className="td-decide-title">Giữ nhãn của {showConflictModal.labelB.subject}</div>
                    <div className="td-tag subject">{showConflictModal.labelB.quality}</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: STAFF SAMPLE LIST (Option B) ===== */}
      {staffSamplesModal && (
        <div className="td-modal-overlay" onClick={() => setStaffSamplesModal(null)}>
          <div className="td-modal td-modal-large" onClick={e => e.stopPropagation()}>
            <div className="td-modal-header">
              <h3>
                <Eye size={18} style={{ marginRight: 8 }} />
                Danh sách samples — {staffSamplesModal.staff.name}
              </h3>
              <button className="td-modal-close" onClick={() => setStaffSamplesModal(null)}><X size={20}/></button>
            </div>
            <div className="td-modal-body" style={{ padding: 0 }}>
              {/* Summary grid */}
              <div className="td-modal-summary-grid">
                <div className="td-summary-card">
                  <div className="td-summary-card-icon total">
                    <Database size={16} />
                  </div>
                  <div className="td-summary-card-info">
                    <span className="td-summary-card-label">Tổng số mẫu</span>
                    <span className="td-summary-card-value">{staffSamplesModal.samples.length}</span>
                  </div>
                </div>
                <div className="td-summary-card">
                  <div className="td-summary-card-icon labeled">
                    <CheckCircle size={16} />
                  </div>
                  <div className="td-summary-card-info">
                    <span className="td-summary-card-label">Đã gán nhãn</span>
                    <span className="td-summary-card-value">
                      {staffSamplesModal.samples.filter((s: any) => s.isLabeled).length}
                    </span>
                  </div>
                </div>
                <div className="td-summary-card">
                  <div className="td-summary-card-icon pending">
                    <Clock size={16} />
                  </div>
                  <div className="td-summary-card-info">
                    <span className="td-summary-card-label">Chưa gán nhãn</span>
                    <span className="td-summary-card-value">
                      {staffSamplesModal.samples.filter((s: any) => !s.isLabeled).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sample list table */}
              <div className="td-modal-table-container">
                <table className="td-modal-table">
                  <thead>
                    <tr>
                      <th className="td-col-id">#</th>
                      <th className="td-col-status">Trạng thái</th>
                      <th className="td-col-label">Nhãn</th>
                      <th className="td-col-preview">Preview</th>
                      <th className="td-col-action">Xem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffSamplesModal.samples
                      .slice((staffSamplePage - 1) * staffSamplePageSize, staffSamplePage * staffSamplePageSize)
                      .map((s: any) => (
                        <tr 
                          key={s.id} 
                          className={s.sampleObjectId ? "row-clickable" : ""}
                          style={{ background: s.isLabeled ? 'rgba(12, 166, 120, 0.04)' : 'transparent' }}
                          onClick={() => {
                            if (s.sampleObjectId) {
                              openSplitView(s.sampleObjectId, staffSamplesModal.staff.id, staffSamplesModal.staff.name);
                            }
                          }}
                        >
                          <td style={{ fontWeight: 600, color: '#6366f1' }}>#{s.id}</td>
                          <td>
                            {s.isLabeled ? (
                              <span className="td-status-pill labeled">
                                <CheckCircle size={12} /> Đã gán
                              </span>
                            ) : (
                              <span className="td-status-pill pending">
                                <Clock size={12} /> Chưa làm
                              </span>
                            )}
                          </td>
                          <td>
                            {s.labelName ? (
                              <span className="td-label-badge" title={s.labelName}>
                                {s.labelName}
                              </span>
                            ) : (
                              <span className="td-label-empty">—</span>
                            )}
                          </td>
                          <td>
                            <div className="td-text-truncate" title={s.preview || `Sample #${s.id}`}>
                              {s.preview || `Sample #${s.id}`}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="td-btn-view-circle"
                              title="Mở Split-View"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (s.sampleObjectId) {
                                  openSplitView(s.sampleObjectId, staffSamplesModal.staff.id, staffSamplesModal.staff.name);
                                }
                              }}
                            >
                              <Eye size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {Math.ceil(staffSamplesModal.samples.length / staffSamplePageSize) > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button className="al-btn al-btn-outline" disabled={staffSamplePage === 1} onClick={() => setStaffSamplePage(p => p - 1)}>Trước</button>
                  <span style={{ fontSize: '13px', color: '#4b5563', fontWeight: 500 }}>
                    Trang {staffSamplePage} / {Math.ceil(staffSamplesModal.samples.length / staffSamplePageSize)}
                  </span>
                  <button className="al-btn al-btn-outline" disabled={staffSamplePage >= Math.ceil(staffSamplesModal.samples.length / staffSamplePageSize)} onClick={() => setStaffSamplePage(p => p + 1)}>Sau</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== SPLIT-VIEW MODAL ===== */}
      <SplitViewModal
        isOpen={splitViewOpen}
        onClose={() => setSplitViewOpen(false)}
        sampleId={splitViewSampleId}
        staffId={splitViewStaffId}
        staffName={splitViewStaffName}
      />
    </div>
  );
}
