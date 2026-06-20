import React, { useState, useMemo } from 'react';
import {
  MessageSquare, Save, Send, Flag, Play, CheckCircle, Clock,
  ChevronLeft, ChevronRight, Check, AlertCircle, RefreshCw, Star, ArrowRight, Zap, Lightbulb,
  ArrowLeft, ChevronDown, FileText, X, Sparkles, Search, Eye, Edit3, Tag
} from 'lucide-react';
import '../styles/stafflabel.css';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';

const SUBJECT_OPTIONS = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Tin học', 'Multi-subject', 'Unclear'];
const INTENT_OPTIONS = ['Ask Explanation', 'Solve Exercise', 'Request Formula', 'Confirm Understanding', 'Ask Example', 'Other'];
const ACTION_OPTIONS = ['Guide Step-by-step', 'Give Hint', 'Ask Probing Question', 'Provide Formula', 'Encourage', 'Correct Error', 'Summarize', 'Other'];
const COMPLETION_OPTIONS = ['Completed', 'Incomplete', 'Abandoned'];
const QUALITY_OPTIONS = ['Good', 'Medium', 'Poor'];
const FLAG_OPTIONS = ['Factual Error', 'Direct Answer', 'Language Issue'];

const ITEMS_PER_PAGE = 20;

function StaffLabelView({ task, onBack }: { task: any; onBack: () => void }) {
  const [tablePage, setTablePage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const debouncedSearch = useDebounce(tableSearch, 300);
  const [tableFilter, setTableFilter] = useState<'all' | 'labeled' | 'draft' | 'unlabeled'>('all');
  const [tableSort, setTableSort] = useState<'id_asc' | 'id_desc' | 'status'>('id_asc');
  const [drawerSampleId, setDrawerSampleId] = useState<string | null>(null);
  const [chatFontSize, setChatFontSize] = useState(13);
  const [labels, setLabels] = useState<Record<string, any>>({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [showGuideline, setShowGuideline] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState(SUBJECT_OPTIONS);
  const [intentOptions, setIntentOptions] = useState(INTENT_OPTIONS);
  const [actionOptions, setActionOptions] = useState(ACTION_OPTIONS);
  const [flagOptions, setFlagOptions] = useState(FLAG_OPTIONS);
  const taskName = task?.name || 'Gán nhãn Toán 11 — Batch 1';
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!task) return;
    const fetchSamples = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/dataprep/assignments/my-task/${task.id}/samples`);
        if (res.data.success) {
          setSamples(res.data.data.samples);
          const initialLabels: Record<string, any> = {};
          res.data.data.samples.forEach((s: any) => {
            if (s.savedLabel) initialLabels[s.id] = s.savedLabel;
          });
          setLabels(initialLabels);
        }
      } catch (e) { console.error('Failed to fetch samples', e); }
      finally { setLoading(false); }
    };
    fetchSamples();
  }, [task]);

  const getLabel = (sampleId: string, field: string) => labels[sampleId]?.[field] || '';
  const getMsgLabel = (sampleId: string, msgIdx: number, field: string) => labels[sampleId]?.messages?.[msgIdx]?.[field] || '';
  const getFlags = (sampleId: string) => labels[sampleId]?.flags || [];

  const setMsgLabel = (sampleId: string, msgIdx: number, field: string, value: string) => {
    setLabels(prev => {
      const current = prev[sampleId] || { subject: '', status: 'draft', messages: {} };
      return { ...prev, [sampleId]: { ...current, messages: { ...current.messages, [msgIdx]: { ...current.messages[msgIdx], [field]: value } } } };
    });
    setSavedDraft(false);
  };

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiBackup, setAiBackup] = useState<Record<string, any>>({});
  const [aiProvider, setAiProvider] = useState('gemini');
  const AI_PROVIDERS = [
    { value: 'gemini', label: '🟢 Gemini 2.0 Flash' },
    { value: 'openai', label: '🔵 OpenAI (GPT-4o-mini)' },
    { value: 'deepseek', label: '🟣 Deepseek Chat' },
    { value: 'openrouter', label: '🟠 OpenRouter' },
  ];

  const handleAIAssist = async (sampleId: string) => {
    const sample = samples.find((s: any) => s.id === sampleId);
    if (!sample || !task) return;
    setIsAiLoading(true);
    try {
      setAiBackup(prev => ({ ...prev, [sampleId]: labels[sampleId] || {} }));
      const res = await api.post(`/dataprep/assignments/my-task/${task.id}/auto-label-v2`, { messages: sample.messages, provider: aiProvider });
      if (res.data.success && res.data.data) {
        const suggestion = res.data.data;
        const aiLabels: any = { subject: suggestion.subject || '', completion: suggestion.completion || '', quality: suggestion.quality || '', status: 'reviewing', messages: {} };
        const newSubjects: string[] = [], newIntents: string[] = [], newActions: string[] = [];
        if (suggestion.subject && !subjectOptions.includes(suggestion.subject)) newSubjects.push(suggestion.subject);
        if (Array.isArray(suggestion.messages)) {
          suggestion.messages.forEach((msg: any) => {
            if (msg.intent && !intentOptions.includes(msg.intent) && !newIntents.includes(msg.intent)) newIntents.push(msg.intent);
            if (msg.action && !actionOptions.includes(msg.action) && !newActions.includes(msg.action)) newActions.push(msg.action);
          });
        }
        const totalNew = newSubjects.length + newIntents.length + newActions.length;
        if (totalNew > 0) {
          let msg = 'AI đề xuất một số nhãn mới chưa có trong danh sách gốc:\n';
          if (newSubjects.length) msg += `- Môn học: ${newSubjects.join(', ')}\n`;
          if (newIntents.length) msg += `- Intent: ${newIntents.join(', ')}\n`;
          if (newActions.length) msg += `- Action: ${newActions.join(', ')}\n`;
          msg += '\nBạn có muốn tự động thêm chúng vào các Menu Tùy chọn không?';
          window.confirm(msg);
        }
        if (newSubjects.length) setSubjectOptions(prev => [...prev, ...newSubjects]);
        if (newIntents.length) setIntentOptions(prev => [...prev, ...newIntents]);
        if (newActions.length) setActionOptions(prev => [...prev, ...newActions]);
        if (Array.isArray(suggestion.messages)) {
          suggestion.messages.forEach((msg: any, idx: number) => {
            const messageIndex = Number.isInteger(Number(msg.messageIndex)) ? Number(msg.messageIndex) : idx;
            aiLabels.messages[messageIndex] = {};
            if (msg.intent) aiLabels.messages[messageIndex].intent = msg.intent;
            if (msg.action) aiLabels.messages[messageIndex].action = msg.action;
          });
        }
        setLabels(prev => {
          const existingFlags = prev[sampleId]?.flags || [];
          const existingNote = prev[sampleId]?.note || '';
          return { ...prev, [sampleId]: { ...prev[sampleId], ...aiLabels, flags: existingFlags, note: existingNote } };
        });
        setSavedDraft(false);
      }
    } catch (e) { console.error('Lỗi AI:', e); alert('Không thể nhận gợi ý từ AI. Vui lòng thử lại sau.'); }
    finally { setIsAiLoading(false); }
  };

  const handleRollbackAI = (sampleId: string) => {
    if (aiBackup[sampleId]) {
      setLabels(prev => ({ ...prev, [sampleId]: aiBackup[sampleId] }));
      setSavedDraft(false);
      const newBackup = { ...aiBackup }; delete newBackup[sampleId]; setAiBackup(newBackup);
    }
  };

  const setLabel = (sampleId: string, field: string, value: string) => {
    setLabels(prev => ({ ...prev, [sampleId]: { ...prev[sampleId], [field]: value } }));
    setSavedDraft(false);
  };

  const handleMessageLabelChange = (sampleId: string, msgIdx: number, field: string, value: string) => {
    if (submitted) return;
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const msgs = sampleLabels.messages || {};
      return { ...prev, [sampleId]: { ...sampleLabels, messages: { ...msgs, [msgIdx]: { ...msgs[msgIdx], [field]: value } } } };
    });
    setSavedDraft(false);
  };

  const toggleFlag = (sampleId: string, flag: string) => {
    if (submitted) return;
    setLabels(prev => {
      const existing = prev[sampleId] || {};
      const flags = existing.flags || [];
      const newFlags = flags.includes(flag) ? flags.filter((f: string) => f !== flag) : [...flags, flag];
      return { ...prev, [sampleId]: { ...existing, flags: newFlags } };
    });
    setSavedDraft(false);
  };

  const isSampleComplete = (sampleId: string) => Boolean(labels[sampleId]?.subject && labels[sampleId]?.completion && labels[sampleId]?.quality);
  const labeledCount = samples.filter((s: any) => isSampleComplete(s.id)).length;
  const progress = samples.length > 0 ? Math.round((labeledCount / samples.length) * 100) : 0;
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSampleDraft = async (sampleId: string) => {
    if (!task) return;
    const currentLabel = labels[sampleId];
    if (!currentLabel || Object.keys(currentLabel).length === 0) return;
    try {
      await api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, { sampleId, label: currentLabel, isComplete: !!isSampleComplete(sampleId) });
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 3000);
    } catch (e) { console.error('Failed to auto-save draft for sample', sampleId, e); }
  };

  const handleSaveDraft = async () => {
    if (!task) return;
    setIsSaving(true);
    try {
      const promises = Object.keys(labels).map(sampleId => {
        const currentLabel = labels[sampleId];
        return api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, { sampleId, label: currentLabel, isComplete: !!isSampleComplete(sampleId) });
      });
      await Promise.all(promises);
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 3000);
    } catch (e) { console.error('Failed to save draft', e); alert('Có lỗi khi lưu bản nháp.'); }
    finally { setIsSaving(false); }
  };

  const handleSubmit = async () => {
    if (!task) return;
    try {
      const res = await api.post(`/dataprep/versions/${task.datasetVersionId || 'default'}/assignments/submit`, { submissionId: task.id, labels });
      if (res.data.success) { setSubmitted(true); setShowSubmitModal(false); alert('Nộp bài thành công!'); }
      else { alert('Có lỗi xảy ra: ' + res.data.error); }
    } catch (e) { console.error('Failed to submit task', e); alert('Lỗi kết nối khi nộp bài.'); }
  };

  const unlabeledCount = samples.length - labeledCount;

  const handleOpenDrawer = (sampleId: string) => setDrawerSampleId(sampleId);
  const handleCloseDrawer = async () => {
    if (drawerSampleId) await handleSaveSampleDraft(drawerSampleId);
    setDrawerSampleId(null);
  };

  const handleEscapeKey = React.useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && drawerSampleId) handleCloseDrawer();
  }, [drawerSampleId]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [handleEscapeKey]);

  const handleNextUnlabeled = async () => {
    if (drawerSampleId) await handleSaveSampleDraft(drawerSampleId);
    const currentIdx = samples.findIndex(s => s.id === drawerSampleId);
    for (let i = currentIdx + 1; i < samples.length; i++) {
      if (!isSampleComplete(samples[i].id)) {
        setDrawerSampleId(samples[i].id);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    for (let i = 0; i < currentIdx; i++) {
      if (!isSampleComplete(samples[i].id)) {
        setDrawerSampleId(samples[i].id);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    alert('Tất cả mẫu đã được gán nhãn!');
  };

  const getSampleStatus = (sampleId: string): string => {
    if (isSampleComplete(sampleId)) return 'labeled';
    if (labels[sampleId] && Object.keys(labels[sampleId]).length > 0) return 'draft';
    return 'unlabeled';
  };

  const filteredSamples = useMemo(() => {
    let result = samples.map((sample, index) => ({ ...sample, originalIndex: index, _status: getSampleStatus(sample.id) }));
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(s => {
        if (String(s.id ?? '').toLowerCase().includes(q)) return true;
        return s.messages?.some((msg: any) => msg.content?.toLowerCase().includes(q));
      });
    }
    if (tableFilter !== 'all') result = result.filter(s => s._status === tableFilter);
    result.sort((a, b) => {
      if (tableSort === 'id_asc') return String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true });
      if (tableSort === 'id_desc') return String(b.id ?? '').localeCompare(String(a.id ?? ''), undefined, { numeric: true });
      if (tableSort === 'status') return ({ unlabeled: 1, draft: 2, labeled: 3 }[a._status] || 0) - ({ unlabeled: 1, draft: 2, labeled: 3 }[b._status] || 0);
      return 0;
    });
    return result;
  }, [samples, debouncedSearch, tableFilter, tableSort, labels]);

  const totalPages = Math.max(1, Math.ceil(filteredSamples.length / ITEMS_PER_PAGE));
  const pagedSamples = filteredSamples.slice((tablePage - 1) * ITEMS_PER_PAGE, tablePage * ITEMS_PER_PAGE);

  React.useEffect(() => { setTablePage(1); }, [debouncedSearch, tableFilter, tableSort]);

  const drawerSample = drawerSampleId ? samples.find(s => s.id === drawerSampleId) : null;

  const renderStatusBadge = (status: string) => {
    if (status === 'labeled') return <span className="sl-status-badge sl-status-labeled"><CheckCircle size={12} /> Đã gán</span>;
    if (status === 'draft') return <span className="sl-status-badge sl-status-draft"><AlertCircle size={12} /> Nháp</span>;
    return <span className="sl-status-badge sl-status-unlabeled"><Clock size={12} /> Chưa gán</span>;
  };

  // ============ RENDER ============
  return (
    <div className="sl-container">
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="sl-topbar">
            <div className="sl-topbar-left">
              <button className="sl-back-btn" onClick={onBack}><ArrowLeft size={18} /><span>Quay lại</span></button>
              <div className="sl-topbar-info">
                <h2>📋 {taskName}</h2>
                <span className="sl-topbar-dataset">{task?.dataset || 'Toan_11'} - {task?.version || 'v3'}</span>
              </div>
            </div>
            <div className="sl-topbar-right">
              {task?.guideline && <button className="sl-guide-btn" onClick={() => setShowGuideline(!showGuideline)}><FileText size={14} /> Hướng dẫn</button>}
              <button className="sl-save-btn" onClick={handleSaveDraft} disabled={isSaving || submitted}><Save size={16} />{isSaving ? 'Đang lưu...' : 'Lưu nháp'}</button>
              <button className="sl-submit-btn" onClick={() => !submitted && setShowSubmitModal(true)} disabled={submitted}><Send size={16} />{submitted ? 'Đã Submit ✓' : 'Submit'}</button>
            </div>
          </div>

          {showGuideline && task?.guideline && (
            <div className="sl-guideline-panel">
              <div className="sl-guideline-header"><h4><FileText size={16} /> Hướng dẫn gán nhãn</h4><button onClick={() => setShowGuideline(false)}><X size={16} /></button></div>
              <p>{task.guideline}</p>
            </div>
          )}

          {savedDraft && <div className="sl-toast"><CheckCircle size={16} />Đã lưu nháp thành công!</div>}

          {/* Stats Dashboard */}
          <div className="sl-stats-dashboard">
            <div className="sl-stat-card sl-stat-total">
              <div className="sl-stat-icon"><MessageSquare size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.length}</span>
                <span className="sl-stat-label">Tổng mẫu</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-done">
              <div className="sl-stat-icon"><CheckCircle size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{labeledCount}</span>
                <span className="sl-stat-label">Đã gán nhãn</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-wip">
              <div className="sl-stat-icon"><AlertCircle size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.filter(s => getSampleStatus(s.id) === 'draft').length}</span>
                <span className="sl-stat-label">Đang làm (Nháp)</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-pending">
              <div className="sl-stat-icon"><Clock size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.filter(s => getSampleStatus(s.id) === 'unlabeled').length}</span>
                <span className="sl-stat-label">Chưa gán</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-progress">
              <div className="sl-stat-progress-info">
                <span className="sl-stat-label">Tiến độ hoàn thành</span>
                <span className="sl-stat-percent">{progress}%</span>
              </div>
              <div className="sl-stat-progress-bar">
                <div className="sl-stat-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>


          {/* Search / Filter / Sort */}
          <div className="sl-table-controls">
            <div className="sl-table-search"><Search size={16} /><input type="text" placeholder="Tìm theo ID hoặc nội dung..." value={tableSearch} onChange={e => setTableSearch(e.target.value)} /></div>
            <select value={tableFilter} onChange={e => setTableFilter(e.target.value as any)} className="sl-table-select">
              <option value="all">Tất cả ({samples.length})</option>
              <option value="unlabeled">Chưa gán ({samples.filter(s => getSampleStatus(s.id) === 'unlabeled').length})</option>
              <option value="draft">Nháp ({samples.filter(s => getSampleStatus(s.id) === 'draft').length})</option>
              <option value="labeled">Đã gán ({labeledCount})</option>
            </select>
            <select value={tableSort} onChange={e => setTableSort(e.target.value as any)} className="sl-table-select">
              <option value="id_asc">ID tăng dần</option>
              <option value="id_desc">ID giảm dần</option>
              <option value="status">Ưu tiên chưa làm</option>
            </select>
          </div>

          {/* DATA TABLE */}
          <div className="sl-data-table-wrapper">
            <table className="sl-data-table">
              <thead><tr>
                <th style={{ width: '60px' }}>STT</th>
                <th style={{ width: '120px' }}>ID</th>
                <th>Nội dung tóm tắt</th>
                <th style={{ width: '100px' }}>Tin nhắn</th>
                <th style={{ width: '140px' }}>Trạng thái</th>
                <th style={{ width: '120px' }}>Hành động</th>
              </tr></thead>
              <tbody>
                {pagedSamples.length === 0 ? (
                  <tr><td colSpan={6} className="sl-table-empty">Không tìm thấy mẫu nào phù hợp</td></tr>
                ) : pagedSamples.map((sample, idx) => {
                  const status = sample._status;
                  const globalIdx = (tablePage - 1) * ITEMS_PER_PAGE + idx + 1;
                  const snippet = sample.messages?.[0]?.content?.substring(0, 80) || '—';
                  return (
                    <tr key={sample.id} className={`sl-table-row ${drawerSampleId === sample.id ? 'sl-row-active' : ''}`}>
                      <td className="sl-table-cell sl-cell-stt">{globalIdx}</td>
                      <td className="sl-table-cell sl-cell-id">#{String(sample.id).substring(0, 8)}</td>
                      <td className="sl-table-cell sl-cell-snippet">{snippet}{snippet.length >= 80 ? '...' : ''}</td>
                      <td className="sl-table-cell sl-cell-msg-count"><MessageSquare size={14} /> {sample.messages?.length || 0}</td>
                      <td className="sl-table-cell">{renderStatusBadge(status)}</td>
                      <td className="sl-table-cell sl-cell-action">
                        <button className={`sl-action-btn ${status === 'unlabeled' ? 'sl-btn-primary' : status === 'draft' ? 'sl-btn-warning' : 'sl-btn-secondary'}`} onClick={() => handleOpenDrawer(sample.id)} disabled={submitted}>
                          {status === 'unlabeled' && <><Tag size={13} /> Gán nhãn</>}
                          {status === 'draft' && <><Edit3 size={13} /> Sửa</>}
                          {status === 'labeled' && <><Eye size={13} /> Xem</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredSamples.length > ITEMS_PER_PAGE && (
            <div className="sl-table-pagination">
              <button disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}><ChevronLeft size={16} /> Trang trước</button>
              <div className="sl-pagination-info">Trang {tablePage} / {totalPages} · Hiển thị {pagedSamples.length} / {filteredSamples.length} mẫu</div>
              <button disabled={tablePage >= totalPages} onClick={() => setTablePage(p => p + 1)}>Trang sau <ChevronRight size={16} /></button>
            </div>
          )}

          {/* ===== DRAWER ===== */}
          {drawerSampleId && drawerSample && (
            <div className="sl-drawer-overlay" onClick={handleCloseDrawer}>
              <div className="sl-drawer" onClick={e => e.stopPropagation()}>
                {/* Drawer Header */}
                <div className="sl-drawer-header">
                  <div className="sl-drawer-title">
                    <span className="sl-drawer-id">#{String(drawerSample.id).substring(0, 8)}</span>
                    {renderStatusBadge(getSampleStatus(drawerSample.id))}
                  </div>
                  <div className="sl-drawer-actions">
                    <button className="sl-drawer-next-btn" onClick={handleNextUnlabeled}>Lưu & Tới câu kế <ChevronRight size={16} /></button>
                    <button className="sl-drawer-close-btn" onClick={handleCloseDrawer}><X size={20} /></button>
                  </div>
                </div>

                {/* Drawer Body: Label Panel (LEFT) | Chat (RIGHT) */}
                <div className="sl-drawer-body">
                  {/* LEFT: Label Panel */}
                  <div className="sl-label-panel">
                    <div className="sl-label-group">
                      <label>📚 Môn học</label>
                      <select value={getLabel(drawerSample.id, 'subject')} onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__add_new__') { const n = window.prompt('Nhập tên môn học mới:'); if (n?.trim()) { if (!subjectOptions.includes(n.trim())) setSubjectOptions([...subjectOptions, n.trim()]); setLabel(drawerSample.id, 'subject', n.trim()); } }
                        else setLabel(drawerSample.id, 'subject', val);
                      }} className="sl-select">
                        <option value="">— Chọn môn học —</option>
                        {subjectOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        <option value="__add_new__" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Thêm môn học khác...</option>
                      </select>
                    </div>
                    <div className="sl-label-row-2">
                      <div className="sl-label-group">
                        <label>📊 Completion</label>
                        <select value={getLabel(drawerSample.id, 'completion')} onChange={(e) => setLabel(drawerSample.id, 'completion', e.target.value)} className="sl-select">
                          <option value="">— Chọn —</option>
                          {COMPLETION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="sl-label-group">
                        <label>⭐ Quality</label>
                        <select value={getLabel(drawerSample.id, 'quality')} onChange={(e) => setLabel(drawerSample.id, 'quality', e.target.value)} className="sl-select">
                          <option value="">— Chọn —</option>
                          {QUALITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="sl-label-group">
                      <label>🚩 Cờ lỗi</label>
                      <div className="sl-flags-row">
                        {flagOptions.map(flag => (
                          <label key={flag} className={`sl-flag-chip ${getFlags(drawerSample.id).includes(flag) ? 'active' : ''}`}>
                            <input type="checkbox" checked={getFlags(drawerSample.id).includes(flag)} onChange={() => toggleFlag(drawerSample.id, flag)} />{flag}
                          </label>
                        ))}
                        <button className="sl-flag-chip" style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'transparent', color: '#64748b' }} onClick={() => {
                          const n = window.prompt('Nhập tên cờ lỗi mới:');
                          if (n?.trim()) { if (!flagOptions.includes(n.trim())) setFlagOptions([...flagOptions, n.trim()]); if (!getFlags(drawerSample.id).includes(n.trim())) toggleFlag(drawerSample.id, n.trim()); }
                        }}>+ Thêm...</button>
                      </div>
                    </div>
                    <div className="sl-label-group">
                      <label>📝 Ghi chú</label>
                      <textarea className="sl-textarea" placeholder="Ghi chú của bạn..." value={getLabel(drawerSample.id, 'note')} onChange={(e) => setLabel(drawerSample.id, 'note', e.target.value)} rows={2} />
                    </div>
                    {!task?.disableAi && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="sl-inline-select" style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', color: '#475569', cursor: 'pointer', minWidth: '170px' }} disabled={isAiLoading}>
                          {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <button className="sl-ai-btn" onClick={() => handleAIAssist(drawerSample.id)} disabled={isAiLoading}>
                          {isAiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          {isAiLoading ? '🤖 Đang phân tích...' : '🤖 Gợi ý AI'}
                        </button>
                        {aiBackup[drawerSample.id] && (
                          <button className="sl-ai-btn" onClick={() => handleRollbackAI(drawerSample.id)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>Hoàn tác AI</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT: Chat Messages */}
                  <div className="sl-chat-area">
                    <div className="sl-chat-header-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MessageSquare size={14} /><span>Hội thoại · {drawerSample.messages?.length || 0} tin nhắn</span></div>
                      <div className="sl-zoom-controls">
                        <button onClick={() => setChatFontSize(f => Math.max(10, f - 1))}>A-</button>
                        <span>{chatFontSize}px</span>
                        <button onClick={() => setChatFontSize(f => Math.min(24, f + 1))}>A+</button>
                      </div>
                    </div>
                    {drawerSample.messages?.map((msg: any, mIdx: number) => (
                      <div key={mIdx} className={`sl-msg ${msg.role}`}>
                        <div className="sl-msg-header">
                          <span className="sl-msg-icon">{msg.role === 'user' ? '🧑' : '🤖'}</span>
                          <span className="sl-msg-role">{msg.role === 'user' ? 'Học sinh' : 'Trợ lý'}</span>
                          <span className="sl-msg-turn">Turn {Math.floor(mIdx / 2) + 1}</span>
                        </div>
                        <div className={`sl-msg-bubble ${msg.role}`} style={{ fontSize: `${chatFontSize}px` }}><p>{msg.content}</p></div>
                        <div className="sl-msg-label-row">
                          {msg.role === 'user' ? (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Intent:</span>
                              <select value={getMsgLabel(drawerSample.id, mIdx, 'intent')} onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__add_new__') { const n = window.prompt('Nhập Intent mới:'); if (n?.trim()) { if (!intentOptions.includes(n.trim())) setIntentOptions([...intentOptions, n.trim()]); setMsgLabel(drawerSample.id, mIdx, 'intent', n.trim()); } }
                                else setMsgLabel(drawerSample.id, mIdx, 'intent', val);
                              }} className="sl-inline-select">
                                <option value="">— Chọn —</option>
                                {intentOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                <option value="__add_new__" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Thêm Intent mới...</option>
                              </select>
                            </div>
                          ) : (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Action:</span>
                              <select value={getMsgLabel(drawerSample.id, mIdx, 'action')} onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__add_new__') { const n = window.prompt('Nhập Action mới:'); if (n?.trim()) { if (!actionOptions.includes(n.trim())) setActionOptions([...actionOptions, n.trim()]); setMsgLabel(drawerSample.id, mIdx, 'action', n.trim()); } }
                                else setMsgLabel(drawerSample.id, mIdx, 'action', val);
                              }} className="sl-inline-select">
                                <option value="">— Chọn —</option>
                                {actionOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                <option value="__add_new__" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Thêm Action mới...</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Modal */}
          {showSubmitModal && (
            <div className="sl-modal-overlay" onClick={() => setShowSubmitModal(false)}>
              <div className="sl-modal" onClick={e => e.stopPropagation()}>
                <div className="sl-modal-header">
                  <h3><Send size={18} /> Xác nhận Submit</h3>
                  <button onClick={() => setShowSubmitModal(false)}><X size={18} /></button>
                </div>
                <div className="sl-modal-body">
                  {unlabeledCount > 0 ? (
                    <div className="sl-modal-warning"><AlertCircle size={20} /><div><strong>Còn {unlabeledCount} sample chưa gán nhãn!</strong><p>Bạn cần gán nhãn cho TẤT CẢ sample trước khi submit.</p></div></div>
                  ) : (
                    <>
                      <div className="sl-modal-success"><CheckCircle size={20} /><div><strong>Đã gán nhãn đầy đủ {samples.length}/{samples.length} samples!</strong><p>Sau khi submit, bạn sẽ không thể chỉnh sửa.</p></div></div>
                      <div className="sl-modal-actions">
                        <button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Hủy</button>
                        <button className="sl-btn-confirm" onClick={handleSubmit}><Send size={16} /> Submit kết quả</button>
                      </div>
                    </>
                  )}
                  {unlabeledCount > 0 && <div className="sl-modal-actions"><button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Đóng</button></div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StaffLabelView;
