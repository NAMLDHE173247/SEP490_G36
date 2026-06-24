import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import ToastContainer from '../components/ToastContainer';
import {
  ArrowLeft, CheckCircle, Clock, AlertCircle, Users, Eye,
  BarChart2, AlertTriangle, ChevronRight, Shield, X, Send,
  FileText, MessageSquare, RefreshCw, Calendar, Tag, Database, Activity, Layers, GitCompare,
  UserPlus, UserMinus, Sparkles
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

  // Compare tab state
  const [comparePage, setComparePage] = useState(1);
  const comparePageSize = 15;

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

  // AI Assist toggle loading
  const [aiToggleLoading, setAiToggleLoading] = useState<string | null>(null);

  // ── Quản lý nhân sự (thay thế / thêm / gỡ) ──
  const versionId = String(task?.id || '').split('_')[0];
  const { toasts, toast } = useToast();
  const [staffModal, setStaffModal] = useState<null | { mode: 'replace' | 'add'; fromId?: string; fromName?: string }>(null);
  const [availStaff, setAvailStaff] = useState<any[]>([]);
  const [pickStaffId, setPickStaffId] = useState('');
  const [pickAi, setPickAi] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);

  const openStaffModal = (mode: 'replace' | 'add', fromId?: string, fromName?: string) => {
    setStaffModal({ mode, fromId, fromName });
    setPickStaffId(''); setPickAi(false);
    (async () => {
      try { const res = await api.get('/dataprep/assignments/available-staff'); if (res.data.success) setAvailStaff(res.data.data || []); } catch { /* ignore */ }
    })();
  };

  const submitStaffModal = async () => {
    if (!staffModal || !pickStaffId) return;
    setStaffBusy(true);
    try {
      if (staffModal.mode === 'replace') {
        await api.post(`/dataprep/versions/${versionId}/assignments/replace`, { fromAssigneeId: staffModal.fromId, toAssigneeId: pickStaffId, aiAssistEnabled: pickAi });
      } else {
        await api.post(`/dataprep/versions/${versionId}/assignments/add-staff`, { assigneeIds: [pickStaffId], aiAssigneeIds: pickAi ? [pickStaffId] : [], fromAssigneeId: staffModal.fromId });
      }
      setStaffModal(null);
      await refreshTaskDetail();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Thao tác thất bại'); }
    setStaffBusy(false);
  };

  const handleStaffModalConfirm = submitStaffModal;

  const handleRevokeStaff = async (assigneeId: string, name: string) => {
    if (!window.confirm(`Gỡ "${name}" khỏi task?\n\nLịch sử & nhãn đã làm vẫn được giữ để tính công. Người này sẽ không gán tiếp được; dùng "Thêm nhân viên" để giao phần còn lại cho người khác.`)) return;
    try {
      await api.post(`/dataprep/versions/${versionId}/assignments/revoke`, { assigneeId });
      await refreshTaskDetail();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Gỡ thất bại'); }
  };

  const handleToggleAi = async (staffId: string, currentEnabled: boolean) => {
    setAiToggleLoading(staffId);
    try {
      await api.patch(`/dataprep/versions/${versionId}/assignments/toggle-ai`, {
        assigneeId: staffId,
        enabled: !currentEnabled,
      });
      await refreshTaskDetail(true);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Toggle AI thất bại');
    }
    setAiToggleLoading(null);
  };

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshTaskDetail = async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const res = await api.get(`/dataprep/assignments/manager/task/${task.id}`);
      if (res.data.success) {
        setTaskDetail(res.data.data);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('Failed to refresh task detail', err);
    } finally {
      if (!silent) setIsRefreshing(false);
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
          setLastRefresh(new Date());
        }
      } catch (err) {
        console.error('Failed to fetch task detail', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();

    // Auto-refresh mỗi 10 giây để manager thấy tiến độ real-time
    const interval = setInterval(() => refreshTaskDetail(true), 10000);
    return () => clearInterval(interval);
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
  const allStaffList = taskDetail.staffList || [];
  // When a batch is selected, only show staff belonging to that batch
  const staffList = selectedBatchId
    ? (() => {
        const sel = batches.find((b: any) => b.id === selectedBatchId);
        if (!sel?.staffIds?.length) return allStaffList;
        return allStaffList.filter((s: any) => sel.staffIds.includes(s.id));
      })()
    : allStaffList;
  const samples = taskDetail.samples || [];
  
  const selectedBatch = selectedBatchId ? batches.find((b: any) => b.id === selectedBatchId) : null;

  // Filter and Pagination logic for samples tab — scope to selected batch range
  const batchSamples = selectedBatch?.batchStart != null
    ? samples.filter((s: any) => s.id >= selectedBatch.batchStart && s.id <= (selectedBatch.batchEnd ?? Infinity))
    : samples;
  const filteredSamples = batchSamples.filter((s: any) => {
    if (sampleFilter === 'all') return true;
    const doneCount = staffList.filter((staff: any) => s.staffStatus?.[staff.id] === 'done').length;
    if (sampleFilter === 'completed') return doneCount === staffList.length;
    if (sampleFilter === 'pending') return doneCount < staffList.length;
    return true;
  });

  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
  const paginatedSamples = filteredSamples.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const conflicts = taskDetail.conflicts || [];
  const pendingConflicts = conflicts.filter(c => !resolvedConflicts.includes(c.key)).length;

  const overallProgress = taskDetail.totalSamples > 0
    ? Math.round(((taskDetail.labeledCount || 0) / taskDetail.totalSamples) * 100)
    : 0;

  const handleResolveConflict = (key) => {
    setResolvedConflicts(prev => [...prev, key]);
    setShowConflictModal(null);
  };

  const renderSubjectSourceBadge = (value: string | null | undefined, source: 'ai' | 'human' | 'default') => {
    if (!value) return <span className="td-label-empty">—</span>;
    const config = {
      ai: { label: 'AI', bg: '#eef2ff', color: '#3730a3', border: '#c7d2fe' },
      human: { label: 'Human', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
      default: { label: 'Default', bg: '#f8fafc', color: '#475569', border: '#cbd5e1' },
    }[source];
    return (
      <span
        title={`${config.label}: ${value}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: '100%',
          padding: '4px 9px',
          borderRadius: 999,
          background: config.bg,
          color: config.color,
          border: `1px solid ${config.border}`,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.75 }}>{config.label}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </span>
    );
  };

  // Open staff sample list modal
  const openStaffSamples = (staff: any) => {
    // Filter samples assigned to this staff
    const staffSamples = samples
      .filter((s: any) => s.staffStatus?.hasOwnProperty(staff.id))
      .map((s: any) => {
        const labelObj = s.staffLabels?.[staff.id];
        const labelName = typeof labelObj === 'object' ? labelObj?.raw : labelObj;
        const isDraft = typeof labelObj === 'object' ? labelObj?.isDraft : false;
        return {
          ...s,
          isLabeled: s.staffStatus?.[staff.id] === 'done',
          isDraft,
          labelName: labelName || null,
          labelDetail: typeof labelObj === 'object' ? labelObj : null,
        };
      })
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
    <>
      <ToastContainer toasts={toasts} />
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
                  <span className="td-batch-desc">
                    {b.batchStart != null
                      ? `#${b.batchStart + 1} – #${(b.batchEnd != null ? b.batchEnd : b.batchStart + b.totalSamples - 1) + 1}`
                      : `${b.totalSamples} samples`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Content: Dashboard */}
        <div className="td-main-content">
          <div className="td-content-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>{selectedBatch ? selectedBatch.name : taskDetail.name}</h2>
              {selectedBatch && (
                <span className="td-header-badge">{selectedBatch.status === 'completed' ? '✅ Completed' : '⏳ In Progress'}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Live indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }}></span>
                <span style={{ color: '#22c55e', fontWeight: 600 }}>LIVE</span>
                {lastRefresh && (
                  <span>· cập nhật {lastRefresh.toLocaleTimeString('vi-VN')}</span>
                )}
              </div>
              {/* Manual refresh button */}
              <button 
                onClick={() => refreshTaskDetail(false)}
                disabled={isRefreshing}
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  background: isRefreshing ? '#f1f5f9' : 'white', cursor: isRefreshing ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', fontWeight: 500
                }}
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>
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
            {staffList.length > 1 && (
              <button className={`td-tab ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => { setActiveTab('compare'); setComparePage(1); }}>
                <GitCompare size={16} /> So sánh Overlap
                {conflicts.length > 0 && <span className="td-badge" style={{ background: '#ef4444' }}>{conflicts.length}</span>}
              </button>
            )}
          </div>

          <div className="td-tab-content">
            {/* ===== TAB 1: TIẾN ĐỘ NHÂN VIÊN ===== */}
            {activeTab === 'progress' && (
              <div className="td-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Thống kê Tiến độ</h3>
                  <button
                    onClick={() => openStaffModal('add', staffList[0]?.id, staffList[0]?.name)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                    title="Thêm nhân viên vào xử lý tập dữ liệu này"
                  >
                    <UserPlus size={15} /> Thêm nhân viên
                  </button>
                </div>
                <div className="td-table-wrapper">
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>Nhân viên</th>
                        <th>Trạng thái</th>
                        <th>Tiến độ</th>
                        <th>Số lượng</th>
                        <th>Cập nhật cuối</th>
                        <th>AI Assist</th>
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
                              <button
                                onClick={() => handleToggleAi(p.id, !!p.aiAssistEnabled)}
                                disabled={aiToggleLoading === p.id}
                                title={p.aiAssistEnabled ? 'Nhấn để TẮT AI cho nhân viên này' : 'Nhấn để BẬT AI cho nhân viên này'}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                  border: 'none', cursor: aiToggleLoading === p.id ? 'wait' : 'pointer',
                                  background: p.aiAssistEnabled ? '#ede9fe' : '#f1f5f9',
                                  color: p.aiAssistEnabled ? '#6d28d9' : '#94a3b8',
                                  transition: 'all 0.2s',
                                  opacity: aiToggleLoading === p.id ? 0.6 : 1,
                                }}
                              >
                                <Sparkles size={13} />
                                {aiToggleLoading === p.id ? '...' : p.aiAssistEnabled ? 'Bật' : 'Tắt'}
                              </button>
                            </td>
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
                                        } catch (e: any) { toast.error(e.response?.data?.error || 'Có lỗi xảy ra'); }
                                        setActionLoading(null);
                                      }}
                                    >✅ Duyệt</button>
                                    <button
                                      className="td-action-btn reject"
                                      disabled={actionLoading === p.submissionId}
                                      onClick={async () => {
                                        const reason = window.prompt('Nhập lý do từ chối (bắt buộc):');
                                        if (!reason || reason.trim() === '') {
                                          if (reason !== null) { toast.warning('Vui lòng nhập lý do từ chối!'); return; }
                                          return;
                                        }
                                        setActionLoading(p.submissionId);
                                        try {
                                          await api.post(`/dataprep/assignments/manager/submission/${p.submissionId}/reject`, { reason: reason.trim() });
                                          await refreshTaskDetail();
                                        } catch (e: any) { toast.error(e.response?.data?.error || 'Có lỗi xảy ra'); }
                                        setActionLoading(null);
                                      }}
                                    >❌ Từ chối</button>
                                  </>
                                )}
                                {p.status === 'approved' && <span className="td-status-sm done">✅ Đã duyệt</span>}
                                {p.status === 'rejected' && <span className="td-status-sm" style={{color:'#dc2626'}}>🔴 Đã từ chối</span>}

                                {/* Quản lý nhân sự */}
                                <button
                                  className="td-action-btn"
                                  style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}
                                  onClick={() => openStaffModal('replace', p.id, p.name)}
                                  title="Thay thế nhân sự này (giữ lịch sử người cũ)"
                                ><RefreshCw size={13} /> Thay thế</button>
                                <button
                                  className="td-action-btn"
                                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                                  onClick={() => handleRevokeStaff(p.id, p.name)}
                                  title="Gỡ khỏi task (giữ lịch sử để tính công)"
                                ><UserMinus size={13} /> Gỡ</button>
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
                        <th style={{ width: '180px' }}>Subject label with AI</th>
                        <th style={{ width: '200px' }}>Subject label with human</th>
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
                            {renderSubjectSourceBadge(s.subjectLabelWithAI || s.subjectLabelDefault, s.subjectLabelWithAI ? 'ai' : 'default')}
                          </td>
                          <td>
                            {renderSubjectSourceBadge(s.subjectLabelWithHuman, 'human')}
                          </td>
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

            {/* ===== TAB 4: SO SÁNH OVERLAP ===== */}
            {activeTab === 'compare' && (() => {
              // Thống kê tổng quan để hiển thị chip
              let agreed = 0, conflict = 0, waiting = 0;
              samples.forEach((s: any) => {
                const done = staffList
                  .map((st: any) => { const lo = s.staffLabels?.[st.id]; return typeof lo === 'object' ? lo?.raw : lo; })
                  .filter(Boolean);
                const uniq = new Set(done);
                if (done.length > 1 && uniq.size === 1) agreed++;
                else if (done.length > 1 && uniq.size > 1) conflict++;
                else waiting++;
              });
              const chip = (bg: string, color: string, label: string, val: number) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12, background: bg }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color }}>{val}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</span>
                </div>
              );
              return (
              <div className="td-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: '18px', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>So sánh nhãn đa người gán</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                      <strong>{staffList.length}</strong> người cùng gán trên <strong>{samples.length}</strong> câu
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {chip('#ecfdf5', '#059669', 'Đồng ý', agreed)}
                    {chip('#fef2f2', '#dc2626', 'Xung đột', conflict)}
                    {chip('#f8fafc', '#64748b', 'Chờ', waiting)}
                  </div>
                </div>

                {/* Compare Table */}
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <table className="td-table" style={{ minWidth: `${420 + staffList.length * 220}px`, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ width: '54px', padding: '12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>#</th>
                        <th style={{ width: '240px', padding: '12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', left: '54px', background: '#f8fafc', zIndex: 2, boxShadow: '6px 0 8px -6px rgba(0,0,0,0.12)' }}>Preview</th>
                        <th style={{ width: '110px', padding: '12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Trạng thái</th>
                        {staffList.map((staff: any) => (
                          <th key={staff.id} style={{ minWidth: '210px', padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                                {staff.name ? staff.name.split(' ').pop()[0] : 'U'}
                              </div>
                              <div style={{ textAlign: 'left', minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.name}</div>
                                <div style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staff.email || ''}</div>
                              </div>
                            </div>
                          </th>
                        ))}
                        <th style={{ width: '60px', padding: '12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Xem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples
                        .slice((comparePage - 1) * comparePageSize, comparePage * comparePageSize)
                        .map((s: any) => {
                          const hasConflict = s.conflict;
                          const allLabels = staffList.map((staff: any) => {
                            const labelObj = s.staffLabels?.[staff.id];
                            const labelRaw = typeof labelObj === 'object' ? labelObj?.raw : labelObj;
                            const isDraft = typeof labelObj === 'object' ? labelObj?.isDraft : false;
                            return {
                              staffId: staff.id,
                              staffName: staff.name,
                              status: s.staffStatus?.[staff.id] || 'not_assigned',
                              label: labelRaw || null,
                              isDraft,
                              detail: typeof labelObj === 'object' ? labelObj : null,
                            };
                          });
                          // Check if all done labels agree
                          const doneLabels = allLabels.filter(l => l.label);
                          const uniqueLabels = new Set(doneLabels.map(l => l.label));
                          const isAgreed = doneLabels.length > 1 && uniqueLabels.size === 1;
                          const isConflict = doneLabels.length > 1 && uniqueLabels.size > 1;

                          return (
                            <tr key={s.id} style={{
                              background: isConflict ? 'rgba(239, 68, 68, 0.04)' : isAgreed ? 'rgba(16, 185, 129, 0.04)' : 'transparent'
                            }}>
                              <td style={{ fontWeight: 600, color: '#6366f1', position: 'sticky', left: 0, background: isConflict ? '#fef2f2' : isAgreed ? '#ecfdf5' : '#fff', zIndex: 1 }}>
                                #{s.id}
                              </td>
                              <td style={{ position: 'sticky', left: '50px', background: isConflict ? '#fef2f2' : isAgreed ? '#ecfdf5' : '#fff', zIndex: 1 }}>
                                <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: '#475569' }}>
                                  {s.preview || `Sample #${s.id}`}
                                </div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {isConflict && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    background: '#fef2f2', color: '#dc2626', padding: '2px 8px',
                                    borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #fecaca'
                                  }}>
                                    ⚠️ Conflict
                                  </span>
                                )}
                                {isAgreed && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    background: '#ecfdf5', color: '#059669', padding: '2px 8px',
                                    borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #a7f3d0'
                                  }}>
                                    ✅ Đồng ý
                                  </span>
                                )}
                                {!isConflict && !isAgreed && doneLabels.length <= 1 && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    background: '#f8fafc', color: '#94a3b8', padding: '2px 8px',
                                    borderRadius: '6px', fontSize: '11px', fontWeight: 500
                                  }}>
                                    ⏳ Chờ
                                  </span>
                                )}
                              </td>
                              {allLabels.map((l, idx) => (
                                <td key={idx} style={{ textAlign: 'center', padding: '8px 6px' }}>
                                  {l.status === 'not_assigned' ? (
                                    <span style={{ color: '#d1d5db', fontSize: '12px' }}>—</span>
                                  ) : l.label ? (
                                    <div
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => openSplitView(s.sampleObjectId, l.staffId, l.staffName)}
                                      title={`Xem chi tiết nhãn của ${l.staffName}`}
                                    >
                                      <div style={{
                                        padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                        lineHeight: '1.4', maxWidth: '180px', margin: '0 auto', wordBreak: 'break-word',
                                        background: l.isDraft ? '#fffbeb' : isConflict ? '#fef2f2' : '#ecfdf5',
                                        color: l.isDraft ? '#92400e' : isConflict ? '#b91c1c' : '#047857',
                                        border: `1px solid ${l.isDraft ? '#fcd34d' : isConflict ? '#fecaca' : '#a7f3d0'}`,
                                        transition: 'all 0.15s ease'
                                      }}>
                                        {l.isDraft && (
                                          <span style={{
                                            display: 'inline-block', background: '#f59e0b', color: '#fff',
                                            padding: '1px 5px', borderRadius: '4px', fontSize: '9px',
                                            fontWeight: 700, marginBottom: '3px', letterSpacing: '0.5px'
                                          }}>DRAFT</span>
                                        )}
                                        <div>{l.label.length > 50 ? l.label.substring(0, 50) + '...' : l.label}</div>
                                        {l.detail && (
                                          <div style={{ fontSize: '10px', marginTop: '3px', opacity: 0.75, fontWeight: 500 }}>
                                            {l.detail.quality && <span>Chất lượng: {l.detail.quality}</span>}
                                            {l.detail.completion && <span>{l.detail.quality ? ' · ' : ''}Hoàn thành: {l.detail.completion}</span>}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : l.status === 'done' ? (
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#ecfdf5',
                                      color: '#059669', borderRadius: '999px', fontSize: '11px', fontWeight: 600
                                    }}>✅ Đã làm</span>
                                  ) : (
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f1f5f9',
                                      color: '#94a3b8', borderRadius: '999px', fontSize: '11px', fontWeight: 600
                                    }}>Chưa làm</span>
                                  )}
                                </td>
                              ))}
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  className="td-icon-btn"
                                  title="Mở Split-View"
                                  onClick={() => openSplitView(s.sampleObjectId, '', '')}
                                >
                                  <Eye size={16}/>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {Math.ceil(samples.length / comparePageSize) > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '20px', gap: '12px' }}>
                    <button className="al-btn al-btn-outline" disabled={comparePage === 1} onClick={() => setComparePage(p => p - 1)}>Trước</button>
                    <span style={{ fontSize: '14px', color: '#4b5563' }}>Trang {comparePage} / {Math.ceil(samples.length / comparePageSize)}</span>
                    <button className="al-btn al-btn-outline" disabled={comparePage >= Math.ceil(samples.length / comparePageSize)} onClick={() => setComparePage(p => p + 1)}>Sau</button>
                  </div>
                )}

                {/* Legend */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                  {[
                    { e: '✅', t: 'Đồng ý = mọi nhãn giống nhau', c: '#059669', b: '#ecfdf5' },
                    { e: '⚠️', t: 'Xung đột = nhãn khác nhau, cần phân xử', c: '#dc2626', b: '#fef2f2' },
                    { e: '⏳', t: 'Chờ = chưa đủ nhãn để so sánh', c: '#64748b', b: '#f1f5f9' },
                    { e: '💡', t: 'Bấm vào nhãn để mở Split-View', c: '#6d28d9', b: '#f5f3ff' },
                  ].map((x, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: x.b, color: x.c, fontSize: 12, fontWeight: 600 }}>
                      {x.e} {x.t}
                    </span>
                  ))}
                </div>
              </div>
              );
            })()}
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
                    <span className="td-summary-card-label">Hoàn thành</span>
                    <span className="td-summary-card-value">
                      {staffSamplesModal.samples.filter((s: any) => s.isLabeled).length}
                    </span>
                  </div>
                </div>
                <div className="td-summary-card">
                  <div className="td-summary-card-icon" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', color: '#b45309' }}>
                    <FileText size={16} />
                  </div>
                  <div className="td-summary-card-info">
                    <span className="td-summary-card-label">Draft</span>
                    <span className="td-summary-card-value" style={{ color: '#b45309' }}>
                      {staffSamplesModal.samples.filter((s: any) => s.isDraft).length}
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
                          style={{ background: s.isLabeled ? 'rgba(12, 166, 120, 0.04)' : s.isDraft ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}
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
                                <CheckCircle size={12} /> Hoàn thành
                              </span>
                            ) : s.isDraft ? (
                              <span className="td-status-pill" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}>
                                <FileText size={12} /> Draft
                              </span>
                            ) : (
                              <span className="td-status-pill pending">
                                <Clock size={12} /> Chưa làm
                              </span>
                            )}
                          </td>
                          <td>
                            {s.labelName ? (
                              <div>
                                <span className="td-label-badge" title={s.labelName} style={{
                                  background: s.isDraft ? '#fffbeb' : undefined,
                                  color: s.isDraft ? '#92400e' : undefined,
                                  borderColor: s.isDraft ? '#fcd34d' : undefined,
                                }}>
                                  {s.isDraft && (
                                    <span style={{
                                      background: '#f59e0b', color: '#fff', padding: '1px 4px',
                                      borderRadius: '3px', fontSize: '9px', fontWeight: 700, marginRight: '4px'
                                    }}>DRAFT</span>
                                  )}
                                  {s.labelName}
                                </span>
                                {s.labelDetail && (s.labelDetail.quality || s.labelDetail.completion) && (
                                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                    {s.labelDetail.quality && <span>Chất lượng: {s.labelDetail.quality}</span>}
                                    {s.labelDetail.completion && <span>{s.labelDetail.quality ? ' · ' : ''}Hoàn thành: {s.labelDetail.completion}</span>}
                                  </div>
                                )}
                              </div>
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

      {/* ===== MODAL QUẢN LÝ NHÂN SỰ ===== */}
      {staffModal && (
        <div onClick={() => setStaffModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 440, maxWidth: '92vw', padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>{staffModal.mode === 'replace' ? '🔄 Thay thế nhân sự' : '➕ Thêm nhân viên'}</h3>
              <button onClick={() => setStaffModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
              {staffModal.mode === 'replace'
                ? <>Rút phần của <strong>{staffModal.fromName}</strong> và giao người mới làm tiếp. Nhãn & lịch sử người cũ vẫn giữ để tính công.</>
                : <>Thêm một nhân viên vào cùng lô dữ liệu đã giao (overlap/cross-check).</>              }
            </p>
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Chọn nhân viên:</label>
              <select value={pickStaffId} onChange={e => setPickStaffId(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
                <option value="">-- Chọn nhân viên --</option>
                {availStaff.map((s: any) => <option key={s._id} value={s._id}>{s.name || s.email}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={pickAi} onChange={e => setPickAi(e.target.checked)} />
                Bật AI Assist cho nhân viên này
              </label>
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStaffModal(null)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Hủy</button>
              <button onClick={handleStaffModalConfirm} disabled={!pickStaffId} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: pickStaffId ? '#4f46e5' : '#c7d2fe', color: '#fff', cursor: pickStaffId ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>
                {staffModal.mode === 'replace' ? 'Thay thế' : 'Thêm nhân viên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
