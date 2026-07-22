import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, AlertCircle, Clock, CheckCircle, FileText, Send, Search,
  Sparkles, RefreshCw, X, ChevronRight, ChevronLeft, Download, Upload, Eye, Edit3, Save
} from 'lucide-react';
import '../styles/staffrewrite.css';
import { stage4Api } from '../services/stage4Api';
import { getCliProxyModels } from '../services/configApi';
import * as XLSX from 'xlsx';

const REWRITE_REASON_VI_MAP: Record<string, string> = {
  'None': 'Không có',
  'Direct answer too early': 'Lộ đáp án quá sớm',
  'Missing Socratic hint': 'Thiếu gợi ý Socratic',
  'Low training value': 'Giá trị huấn luyện thấp',
  'Factual error': 'Sai kiến thức',
  'Tone/language issue': 'Lỗi giọng điệu/ngôn ngữ',
  'Incomplete answer': 'Câu trả lời chưa hoàn thiện',
};

interface StaffRewriteViewProps {
  task: any; // Grouped rewrite task project
  onBack: () => void;
}

export default function StaffRewriteView({ task, onBack }: StaffRewriteViewProps) {
  if (!task) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: '#f1f5f9', minHeight: '100vh' }}>
        <h2>Không tìm thấy dữ liệu dự án. Đang quay lại...</h2>
        <button onClick={onBack} style={{ marginTop: '20px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: 'white', cursor: 'pointer' }}>Quay lại</button>
      </div>
    );
  }

  const [rewriteTasks, setRewriteTasks] = useState<any[]>(task.rewriteTasks || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [tablePage, setTablePage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Drawer / Workbench state
  const [drawerTask, setDrawerTask] = useState<any | null>(null);
  const [rewriteDraftText, setRewriteDraftText] = useState('');
  const [rewriteContextMode, setRewriteContextMode] = useState('n-2:n+3');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiProvider, setAiProvider] = useState<'oauth_gateway' | 'openrouter' | 'groq' | 'deepseek' | 'gemini' | 'openai'>('oauth_gateway');
  const [aiModel, setAiModel] = useState('');
  const [gatewayModels, setGatewayModels] = useState<string[]>([]);
  const [offlineMessage, setOfflineMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Download format modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const rewriteContextOptions = [
    { value: 'n-2:n+3', label: 'n-2 đến n+3' },
    { value: 'n-2:n+2', label: 'n-2 đến n+2 (legacy)' },
    { value: 'n-1:n+1', label: 'n-1 đến n+1' },
    { value: 'n-1:n', label: 'n-1 đến n' },
    { value: 'target-only', label: 'Chỉ mục tiêu' },
    { value: 'full', label: 'Toàn bộ cuộc hội thoại' },
  ];

  // Helper selectors
  const getTargetAiResponse = (t: any) => {
    const messages = Array.isArray(t?.conversationMessages) ? t.conversationMessages : [];
    const target = messages.find((m: any) => m?.isTarget);
    return target?.content || t?.originalText || '';
  };

  const getStudentRequestForRewrite = (t: any) => {
    const messages = Array.isArray(t?.conversationMessages) ? t.conversationMessages : [];
    const targetIdx = messages.findIndex((m: any) => m?.isTarget);
    if (targetIdx >= 0) {
      for (let i = targetIdx - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === 'user' && String(messages[i]?.content || '').trim()) {
          return messages[i].content;
        }
      }
    }
    const firstUser = messages.find((m: any) => m?.role === 'user' && String(m?.content || '').trim());
    return firstUser?.content || 'Không tìm thấy yêu cầu của học sinh trong ngữ cảnh.';
  };

  const getVisibleRewriteMessages = (t: any) => {
    const messages = Array.isArray(t?.conversationMessages) && t.conversationMessages.length > 0
      ? t.conversationMessages
      : [{ role: 'assistant', content: t?.originalText || '', isTarget: true }];
    if (rewriteContextMode === 'full') return messages;
    const targetIdx = messages.findIndex((m: any) => m?.isTarget);
    if (targetIdx < 0) return messages;
    let start = targetIdx;
    let end = targetIdx;
    if (rewriteContextMode === 'n-1:n') {
      start = Math.max(0, targetIdx - 1);
    } else if (rewriteContextMode === 'n-1:n+1') {
      start = Math.max(0, targetIdx - 1);
      end = Math.min(messages.length - 1, targetIdx + 1);
    } else if (rewriteContextMode === 'n-2:n+3') {
      start = Math.max(0, targetIdx - 2);
      end = Math.min(messages.length - 1, targetIdx + 3);
    } else if (rewriteContextMode === 'n-2:n+2') {
      start = Math.max(0, targetIdx - 2);
      end = Math.min(messages.length - 1, targetIdx + 2);
    }
    return messages.slice(start, end + 1);
  };

  React.useEffect(() => {
    if (aiProvider !== 'oauth_gateway' || gatewayModels.length) return;
    getCliProxyModels().then((result) => {
      setGatewayModels(result.models || []);
      setAiModel(result.defaultModel || '');
    }).catch(() => { setGatewayModels([]); setAiModel(''); });
  }, [aiProvider, gatewayModels.length]);

  // Navigation never writes data. Saving is always explicit.
  const handleBackWithSave = () => onBack();

  // Filter & Search logic
  const filteredTasks = useMemo(() => {
    let result = rewriteTasks.map((t, idx) => ({ ...t, originalIndex: idx }));

    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        result = result.filter(t => !['submitted', 'approved', 'checker_approved', 'rejected', 'redo'].includes(t.status) && !t.submittedText);
      } else if (statusFilter === 'draft') {
        result = result.filter(t => !['submitted', 'approved', 'checker_approved', 'rejected', 'redo'].includes(t.status) && t.submittedText);
      } else {
        result = result.filter(t => t.status === statusFilter);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        String(t.id).toLowerCase().includes(q) || 
        String(t.convId || '').toLowerCase().includes(q) ||
        getTargetAiResponse(t).toLowerCase().includes(q) || 
        getStudentRequestForRewrite(t).toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const timeA = new Date(a.updatedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || 0).getTime();
      if (sortBy === 'newest') return timeB - timeA;
      if (sortBy === 'oldest') return timeA - timeB;
      return 0;
    });

    return result;
  }, [rewriteTasks, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / ITEMS_PER_PAGE));
  const pagedTasks = filteredTasks.slice((tablePage - 1) * ITEMS_PER_PAGE, tablePage * ITEMS_PER_PAGE);

  React.useEffect(() => { setTablePage(1); }, [searchQuery, statusFilter, sortBy]);

  // Handlers for Drawer
  const handleOpenDrawer = (item: any) => {
    setDrawerTask(item);
    setRewriteDraftText(item.submittedText || getTargetAiResponse(item));
    setRewriteContextMode('n-2:n+3');
  };

  const handleCloseDrawer = async () => {
    setDrawerTask(null);
    setRewriteDraftText('');
    return;
    if (drawerTask && rewriteDraftText.trim() && drawerTask.status !== 'submitted' && drawerTask.status !== 'approved') {
      const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
      try {
        const res = await stage4Api.submitRewrite(versionId, drawerTask.id, rewriteDraftText.trim(), undefined, 'assigned');
        setRewriteTasks(prev => prev.map(t => t.id === drawerTask.id ? res.task : t));
        setOfflineMessage('Đã tự động lưu bản nháp.');
        setTimeout(() => setOfflineMessage(''), 3000);
      } catch (e) {
        console.error('Failed to auto-save draft', e);
      }
    }
    setDrawerTask(null);
  };

  const handleSaveDraftManual = () => {
    if (!drawerTask || !rewriteDraftText.trim()) return;
    const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
    setIsSavingDraft(true);
    stage4Api.submitRewrite(versionId, drawerTask.id, rewriteDraftText.trim(), undefined, 'assigned')
      .then((res) => {
        setRewriteTasks(prev => prev.map(t => t.id === drawerTask.id ? res.task : t));
        setOfflineMessage('Đã lưu bản nháp thành công!');
        setTimeout(() => setOfflineMessage(''), 3000);
      })
      .catch((err) => alert(err?.response?.data?.error || 'Lưu bản nháp thất bại.'))
      .finally(() => setIsSavingDraft(false));
  };

  const handleNextUncompleted = async () => {
    // Save current as draft
    if (drawerTask && rewriteDraftText.trim() && drawerTask.status !== 'submitted' && drawerTask.status !== 'approved') {
      const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
      try {
        const res = await stage4Api.submitRewrite(versionId, drawerTask.id, rewriteDraftText.trim(), undefined, 'assigned');
        setRewriteTasks(prev => prev.map(t => t.id === drawerTask.id ? res.task : t));
      } catch (e) {
        console.error('Failed to save current draft before next', e);
      }
    }

    const currentIdx = rewriteTasks.findIndex(t => t.id === drawerTask?.id);
    for (let i = currentIdx + 1; i < rewriteTasks.length; i++) {
      if (!['submitted', 'approved', 'checker_approved'].includes(rewriteTasks[i].status)) {
        handleOpenDrawer(rewriteTasks[i]);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    for (let i = 0; i < currentIdx; i++) {
      if (!['submitted', 'approved', 'checker_approved'].includes(rewriteTasks[i].status)) {
        handleOpenDrawer(rewriteTasks[i]);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    alert('Tất cả câu trong dự án này đã hoàn thành viết lại!');
  };

  const handleDrawerSubmit = () => {
    if (!drawerTask || !rewriteDraftText.trim()) return;
    const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
    setIsSubmitting(true);
    stage4Api.submitRewrite(versionId, drawerTask.id, rewriteDraftText.trim(), undefined, 'submitted')
      .then((res) => {
        setRewriteTasks(prev => prev.map(t => t.id === drawerTask.id ? res.task : t));
        setDrawerTask(null);
        setRewriteDraftText('');
      })
      .catch((err) => alert(err?.response?.data?.error || 'Nộp bản viết lại thất bại.'))
      .finally(() => setIsSubmitting(false));
  };

  // Export handlers
  const exportAsExcel = () => {
    const editable = rewriteTasks.filter((t: any) => !['approved', 'rejected'].includes(t.status));
    const data = editable.map((t: any) => {
      const ctxStr = t.conversationMessages?.map((m: any) => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n') || '';
      return {
        'Mã câu hỏi (Task ID)': String(t.id),
        'Mã phiên bản (Dataset Version ID)': String(task.datasetVersionId),
        'Thời gian cập nhật (Revision)': t.updatedAt,
        'Môn học': t.subject || '',
        'Yêu cầu của học sinh': getStudentRequestForRewrite(t),
        'Phản hồi AI gốc (Cần sửa)': getTargetAiResponse(t),
        'Lý do viết lại': t.reason || '',
        'Ngữ cảnh cuộc thoại': ctxStr,
        'Nội dung viết lại mới (Điền vào đây)': t.submittedText || ''
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rewrite Tasks');
    XLSX.writeFile(wb, `viet_lai-${task.dataset}-${task.version}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowDownloadModal(false);
    setOfflineMessage(`Đã tải xuống ${editable.length} câu viết lại (Excel).`);
    setTimeout(() => setOfflineMessage(''), 4000);
  };

  const exportAsJson = () => {
    const editable = rewriteTasks.filter((t: any) => !['approved', 'rejected'].includes(t.status));
    const data = editable.map((t: any) => {
      const ctxStr = t.conversationMessages?.map((m: any) => `[${m.role.toUpperCase()}] ${m.content}`).join('\n\n') || '';
      return {
        'Mã câu hỏi (Task ID)': String(t.id),
        'Mã phiên bản (Dataset Version ID)': String(task.datasetVersionId),
        'Thời gian cập nhật (Revision)': t.updatedAt,
        'Môn học': t.subject || '',
        'Yêu cầu của học sinh': getStudentRequestForRewrite(t),
        'Phản hồi AI gốc (Cần sửa)': getTargetAiResponse(t),
        'Lý do viết lại': t.reason || '',
        'Ngữ cảnh cuộc thoại': ctxStr,
        'Nội dung viết lại mới (Điền vào đây)': t.submittedText || ''
      };
    });

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify({ datasetVersionId: task.datasetVersionId, projectName: task.dataset, tasks: data }, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `viet_lai-${task.dataset}-${task.version}-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setShowDownloadModal(false);
    setOfflineMessage(`Đã tải xuống ${editable.length} câu viết lại (JSON).`);
    setTimeout(() => setOfflineMessage(''), 4000);
  };

  const importRewriteBatch = async (file: File) => {
    setOfflineMessage(''); setIsImporting(true);
    const fileName = file.name.toLowerCase();
    
    try {
      let rows: any[] = [];
      
      if (fileName.endsWith('.json')) {
        const fileText = await file.text();
        const jsonData = JSON.parse(fileText);
        rows = Array.isArray(jsonData) ? jsonData : jsonData.tasks || [];
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws);
      } else {
        throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp .json hoặc .xlsx');
      }
      
      const ownTasks = new Map(rewriteTasks.map((t: any) => [String(t.id), t]));
      
      const validRows = rows.filter(r => {
        const tid = String(r['Mã câu hỏi (Task ID)'] || r['Task ID'] || '');
        const txt = String(r['Nội dung viết lại mới (Điền vào đây)'] || r['Rewritten Text'] || '').trim();
        return ownTasks.has(tid) && txt;
      });
      
      if (validRows.length === 0) {
        throw new Error('Không tìm thấy dòng nào hợp lệ hoặc khớp với danh sách câu của dự án này.');
      }
      
      if (!window.confirm(`Tìm thấy ${validRows.length} câu viết lại hợp lệ để cập nhật. Bạn có chắc chắn muốn nạp?`)) {
        return;
      }

      const promises = validRows.map(row => {
        const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
        const taskId = String(row['Mã câu hỏi (Task ID)'] || row['Task ID']);
        const submittedText = String(row['Nội dung viết lại mới (Điền vào đây)'] || row['Rewritten Text']).trim();
        const revision = row['Thời gian cập nhật (Revision)'] || row['Revision'];
        // Import defaults as draft (assigned) to let user edit on UI later
        return stage4Api.submitRewrite(versionId, taskId, submittedText, revision, 'assigned');
      });
      
      const results = await Promise.allSettled(promises);
      const succeeded: any[] = [];
      results.forEach((r: any) => {
        if (r.status === 'fulfilled' && r.value?.task) {
          succeeded.push(r.value.task);
        }
      });

      const updatedMap = new Map(succeeded.map(t => [String(t.id), t]));
      setRewriteTasks(prev => prev.map(t => updatedMap.has(String(t.id)) ? updatedMap.get(String(t.id)) : t));
      
      setOfflineMessage(`Nạp tệp thành công: Đã lưu nháp ${succeeded.length} câu viết lại!`);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Lỗi khi đọc và nạp tệp dữ liệu.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setOfflineMessage(''), 4000);
    }
  };

  // Rendering helpers
  const renderStatusBadge = (status: string, submittedText?: string) => {
    if (status === 'approved') return <span className="sr-status-badge sr-status-approved"><CheckCircle size={12} /> Đã duyệt</span>;
    if (status === 'submitted') return <span className="sr-status-badge sr-status-submitted"><CheckCircle size={12} /> Đã nộp</span>;
    if (status === 'checker_approved') return <span className="sr-status-badge sr-status-submitted" style={{ background: '#dbeafe', color: '#1e40af' }}><CheckCircle size={12} /> Checker đã duyệt</span>;
    if (status === 'rejected') return <span className="sr-status-badge sr-status-rejected"><AlertCircle size={12} /> Bị từ chối</span>;
    if (status === 'redo') return <span className="sr-status-badge sr-status-rejected" style={{ background: '#ffedd5', color: '#c2410c' }}><AlertCircle size={12} /> Cần làm lại</span>;
    if (submittedText) return <span className="sr-status-badge sr-status-draft"><Edit3 size={12} /> Bản nháp</span>;
    return <span className="sr-status-badge sr-status-pending"><Clock size={12} /> Chưa sửa</span>;
  };

  const labeledCount = rewriteTasks.filter(t => ['submitted', 'approved'].includes(t.status)).length;
  const progress = rewriteTasks.length > 0 ? Math.round((labeledCount / rewriteTasks.length) * 100) : 0;

  return (
    <div className="sr-container">
      {/* Top Bar */}
      <div className="sr-topbar">
        <div className="sr-topbar-left">
          <button className="sr-back-btn" onClick={handleBackWithSave}><ArrowLeft size={18} /><span>Quay lại</span></button>
          <div className="sr-topbar-info">
            <h2>
              {task.name}
              <span className="sr-topbar-dataset">
                ({task.dataset} - {task.version})
              </span>
            </h2>
          </div>
        </div>
        <div className="sr-topbar-right">
          <button className="sr-guide-btn" onClick={() => setShowDownloadModal(true)}><Download size={14} /> Tải tệp</button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls, .json" onChange={(e) => {
            if (e.target.files && e.target.files[0]) void importRewriteBatch(e.target.files[0]);
          }} />
          <button className="sr-guide-btn" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <Upload size={14} /> {isImporting ? 'Nạp...' : 'Nạp tệp offline'}
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="sr-stats-dashboard">
        <div className="sr-stat-card sr-stat-total">
          <div className="sr-stat-icon"><FileText size={20} /></div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{rewriteTasks.length}</span>
            <span className="sr-stat-label">Tổng câu cần viết lại</span>
          </div>
        </div>
        <div className="sr-stat-card sr-stat-done">
          <div className="sr-stat-icon"><CheckCircle size={20} /></div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{labeledCount}</span>
            <span className="sr-stat-label">Đã hoàn thành</span>
          </div>
        </div>
        <div className="sr-stat-card sr-stat-wip">
          <div className="sr-stat-icon"><Edit3 size={20} /></div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{rewriteTasks.filter(t => !['submitted', 'approved'].includes(t.status) && t.submittedText).length}</span>
            <span className="sr-stat-label">Bản nháp</span>
          </div>
        </div>
        <div className="sr-stat-card sr-stat-pending">
          <div className="sr-stat-icon"><Clock size={20} /></div>
          <div className="sr-stat-info">
            <span className="sr-stat-value">{rewriteTasks.filter(t => !['submitted', 'approved'].includes(t.status) && !t.submittedText).length}</span>
            <span className="sr-stat-label">Chưa sửa</span>
          </div>
        </div>
        <div className="sr-stat-card sr-stat-progress">
          <div className="sr-stat-progress-info">
            <span className="sr-stat-label">Tiến độ dự án</span>
            <span className="sr-stat-percent">{progress}%</span>
          </div>
          <div className="sr-stat-progress-bar">
            <div className="sr-stat-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>

      {/* Table Controls */}
      <div className="sr-table-controls">
        <div className="sr-table-search">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Tìm theo ID, yêu cầu học sinh, phản hồi..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="sr-table-select">
          <option value="all">Tất cả ({rewriteTasks.length})</option>
          <option value="pending">Chưa sửa ({rewriteTasks.filter(t => !['submitted', 'approved'].includes(t.status) && !t.submittedText).length})</option>
          <option value="draft">Bản nháp ({rewriteTasks.filter(t => !['submitted', 'approved'].includes(t.status) && t.submittedText).length})</option>
          <option value="submitted">Đã nộp ({rewriteTasks.filter(t => t.status === 'submitted').length})</option>
          <option value="approved">Đã duyệt ({rewriteTasks.filter(t => t.status === 'approved').length})</option>
          <option value="rejected">Bị từ chối ({rewriteTasks.filter(t => t.status === 'rejected').length})</option>
          <option value="redo">Yêu cầu làm lại ({rewriteTasks.filter(t => t.status === 'redo').length})</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="sr-table-select">
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </select>
        {offlineMessage && <span className="sr-offline-toast">{offlineMessage}</span>}
      </div>

      {/* Data Table */}
      <div className="sr-data-table-wrapper">
        <table className="sr-data-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>STT</th>
              <th style={{ width: '120px' }}>Conversation ID</th>
              <th>Yêu cầu của học sinh</th>
              <th>Phản hồi AI gốc</th>
              <th style={{ width: '150px' }}>Lỗi phát hiện</th>
              <th style={{ width: '130px' }}>Trạng thái</th>
              <th style={{ width: '120px' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {pagedTasks.length === 0 ? (
              <tr><td colSpan={7} className="sr-table-empty">Không tìm thấy câu nào phù hợp</td></tr>
            ) : pagedTasks.map((item, idx) => {
              const globalIdx = (tablePage - 1) * ITEMS_PER_PAGE + idx + 1;
              const studentSnippet = getStudentRequestForRewrite(item).substring(0, 70);
              const aiSnippet = getTargetAiResponse(item).substring(0, 70);
              const status = item.status;
              const canEdit = !['submitted', 'approved', 'checker_approved'].includes(status);
              
              return (
                <tr key={item.id} className={`sr-table-row ${drawerTask?.id === item.id ? 'sr-row-active' : ''}`}>
                  <td className="sr-table-cell sr-cell-stt">{globalIdx}</td>
                  <td className="sr-table-cell sr-cell-id">#{String(item.convId || item.id).substring(0, 8)}</td>
                  <td className="sr-table-cell sr-cell-snippet">{studentSnippet}{studentSnippet.length >= 70 ? '...' : ''}</td>
                  <td className="sr-table-cell sr-cell-snippet">{aiSnippet}{aiSnippet.length >= 70 ? '...' : ''}</td>
                  <td className="sr-table-cell sr-cell-reason">
                    {item.reason && item.reason !== 'None' ? (
                      <span className="sr-reason-chip" title={`Nguồn: ${item.reasonSource || 'Quality Review (system aggregate)'}`}>{REWRITE_REASON_VI_MAP[item.reason] || item.reason}</span>
                    ) : '—'}
                  </td>
                  <td className="sr-table-cell">{renderStatusBadge(status, item.submittedText)}</td>
                  <td className="sr-table-cell sr-cell-action">
                    <button 
                      className={`sr-action-btn ${canEdit ? 'sr-btn-primary' : 'sr-btn-secondary'}`}
                      onClick={() => handleOpenDrawer(item)}
                    >
                      {canEdit ? (
                        <>
                          <Edit3 size={13} />
                          {item.submittedText ? 'Sửa nháp' : 'Viết lại'}
                        </>
                      ) : (
                        <>
                          <Eye size={13} />
                          Xem lại
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredTasks.length > ITEMS_PER_PAGE && (
        <div className="sr-table-pagination">
          <button disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}><ChevronLeft size={16} /> Trang trước</button>
          <div className="sr-pagination-info">Trang {tablePage} / {totalPages} · Hiển thị {pagedTasks.length} / {filteredTasks.length} câu</div>
          <button disabled={tablePage >= totalPages} onClick={() => setTablePage(p => p + 1)}>Trang sau <ChevronRight size={16} /></button>
        </div>
      )}

      {/* ===== DRAWER WORKBENCH ===== */}
      {drawerTask && (
        <div className="sr-drawer-overlay" onClick={handleCloseDrawer}>
          <div className="sr-drawer" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sr-drawer-header">
              <div className="sr-drawer-title">
                <span className="sr-drawer-id">#{String(drawerTask.convId || drawerTask.id).substring(0, 8)}</span>
                {renderStatusBadge(drawerTask.status, drawerTask.submittedText)}
                {drawerTask.reason && drawerTask.reason !== 'None' && (
                  <span className="sr-reason-alert-chip"><AlertCircle size={12} /> Lỗi: {REWRITE_REASON_VI_MAP[drawerTask.reason] || drawerTask.reason}</span>
                )}
                <span style={{ fontSize: 11, color: '#64748b' }}>Nguồn đánh giá: {drawerTask.reasonSource || 'Quality Review (system aggregate)'}</span>
              </div>
              <div className="sr-drawer-actions">
                {['submitted', 'approved', 'checker_approved'].includes(drawerTask.status) ? (
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>🔒 Chỉ xem</span>
                ) : (
                  <>
                    <button 
                      className="sr-drawer-draft-btn" 
                      onClick={handleSaveDraftManual}
                      disabled={isSavingDraft || isSubmitting || !rewriteDraftText.trim()}
                    >
                      <Save size={14} /> {isSavingDraft ? 'Đang lưu...' : 'Lưu nháp'}
                    </button>
                    <button 
                      className="sr-drawer-save-btn" 
                      onClick={handleDrawerSubmit}
                      disabled={isSubmitting || isSavingDraft || !rewriteDraftText.trim()}
                    >
                      <Send size={14} /> Nộp thay thế
                    </button>
                    <button className="sr-drawer-next-btn" onClick={handleNextUncompleted}>
                      Lưu nháp & Kế tiếp <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <button className="sr-drawer-close-btn" onClick={handleCloseDrawer}><X size={20} /></button>
              </div>
            </div>

            {/* Review Feedback Alert */}
            {(drawerTask.checkerReviewNote || drawerTask.reviewNote) && (drawerTask.status === 'redo' || drawerTask.status === 'rejected') && (
              <div style={{
                margin: '16px 24px 0',
                padding: '12px 16px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                color: '#991b1b',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '13px'
              }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} /> Nhận xét kiểm duyệt:
                </div>
                {drawerTask.checkerReviewNote && (
                  <div><strong>Checker:</strong> {drawerTask.checkerReviewNote}</div>
                )}
                {drawerTask.reviewNote && (
                  <div><strong>Supervisor:</strong> {drawerTask.reviewNote}</div>
                )}
              </div>
            )}

            {/* Body */}
            <div className="sr-drawer-body">
              {/* LEFT: Context panel */}
              <div className="sr-context-panel">
                <div className="sr-context-header">
                  <label htmlFor="sr-context-mode">Ngữ cảnh cuộc hội thoại</label>
                  <select 
                    id="sr-context-mode" 
                    value={rewriteContextMode} 
                    onChange={(e) => setRewriteContextMode(e.target.value)}
                    className="sr-context-select"
                  >
                    {rewriteContextOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div className="sr-conversation-history">
                  {getVisibleRewriteMessages(drawerTask).map((msg: any, idx: number) => (
                    <div 
                      key={`${msg.role}-${idx}`} 
                      className={`sr-message-bubble ${msg.role === 'assistant' ? 'assistant' : 'user'} ${msg.isTarget ? 'target' : ''}`}
                    >
                      <div className="sr-message-role">
                        {msg.role === 'assistant' ? 'AI Tutor' : 'Học sinh'}
                        {msg.isTarget && <span className="sr-target-tag">Mục tiêu</span>}
                      </div>
                      <div className="sr-message-content">{msg.content}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT: Editor Panel */}
              <div className="sr-editor-panel">
                <div className="sr-panel-section sr-student">
                  <div className="sr-panel-title">1. Yêu cầu của học sinh</div>
                  <div className="sr-panel-body">{getStudentRequestForRewrite(drawerTask)}</div>
                </div>

                <div className="sr-panel-section sr-original">
                  <div className="sr-panel-title">2. Phản hồi AI gốc cần sửa</div>
                  <div className="sr-panel-body">{getTargetAiResponse(drawerTask)}</div>
                </div>

                <div className="sr-panel-section sr-revised">
                  <div className="sr-panel-title">3. Nội dung viết lại đã sửa đổi</div>
                  
                  {!['submitted', 'approved', 'checker_approved'].includes(drawerTask.status) && (
                    <div className="sr-ai-suggest-bar">
                      <select value={aiProvider} onChange={(e) => { setAiProvider(e.target.value as any); setAiModel(''); }} className="sr-context-select">
                        <option value="oauth_gateway">OAuth Gateway</option>
                        <option value="gemini">Gemini</option>
                        <option value="openai">ChatGPT / OpenAI</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="groq">Groq</option>
                        <option value="openrouter">OpenRouter</option>
                      </select>
                      {aiProvider === 'oauth_gateway' && <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="sr-context-select">
                        <option value="">Tự động chọn model</option>
                        {gatewayModels.map((model) => <option key={model} value={model}>{model}</option>)}
                      </select>}
                      <span>Sử dụng AI gợi ý làm bản nháp hoặc tự viết lại.</span>
                      <button 
                        className="sr-ai-suggest-btn"
                        disabled={isSuggesting || isSubmitting}
                        onClick={() => {
                          const versionId = task.datasetVersionId || localStorage.getItem('current_version_id') || 'default';
                          setIsSuggesting(true);
                          stage4Api.suggestRewrite(versionId, drawerTask.id, aiProvider, aiProvider === 'oauth_gateway' ? aiModel || undefined : undefined)
                            .then(res => setRewriteDraftText(res.suggestedText || rewriteDraftText))
                            .catch(err => alert(err?.response?.data?.error || 'Không thể lấy gợi ý AI.'))
                            .finally(() => setIsSuggesting(false));
                        }}
                      >
                        {isSuggesting ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {isSuggesting ? 'Đang tạo...' : 'AI gợi ý'}
                      </button>
                    </div>
                  )}

                  <textarea 
                    className="sr-editor-textarea"
                    placeholder="Viết lại câu trả lời AI theo định hướng Socratic..."
                    value={rewriteDraftText}
                    onChange={e => setRewriteDraftText(e.target.value)}
                    disabled={isSubmitting || ['submitted', 'approved', 'checker_approved'].includes(drawerTask.status)}
                    rows={8}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DOWNLOAD FORMAT SELECTION MODAL ===== */}
      {showDownloadModal && (
        <div className="sr-download-modal-overlay" onClick={() => setShowDownloadModal(false)}>
          <div className="sr-download-modal" onClick={e => e.stopPropagation()}>
            <div className="sr-download-modal-header">
              <h3>Chọn định dạng tải xuống</h3>
              <button onClick={() => setShowDownloadModal(false)}><X size={18} /></button>
            </div>
            <div className="sr-download-modal-body">
              <p>Hệ thống hỗ trợ tải tệp dữ liệu viết lại với đầy đủ cột thông tin tiếng Việt. Hãy chọn định dạng phù hợp với công cụ làm việc của bạn:</p>
              <div className="sr-download-options">
                <button className="sr-download-opt-btn excel" onClick={exportAsExcel}>
                  <div className="opt-icon">📊</div>
                  <div className="opt-info">
                    <strong>Tải tệp Excel (.xlsx)</strong>
                    <span>Dễ xem, chỉnh sửa qua MS Excel hoặc Google Sheets</span>
                  </div>
                </button>
                <button className="sr-download-opt-btn json" onClick={exportAsJson}>
                  <div className="opt-icon">📄</div>
                  <div className="opt-info">
                    <strong>Tải tệp JSON (.json)</strong>
                    <span>Định dạng chuẩn, tối ưu cho lập trình viên/tool phân tích</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
