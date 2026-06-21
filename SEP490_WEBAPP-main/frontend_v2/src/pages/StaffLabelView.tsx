import React, { useState } from 'react';
import {
  MessageSquare, Save, Send, Flag, Play, CheckCircle, Clock,
  ChevronLeft, ChevronRight, Check, AlertCircle, RefreshCw, Star, ArrowRight, Zap, Lightbulb,
  ArrowLeft, ChevronDown, FileText, X, Sparkles
} from 'lucide-react';
import '../styles/stafflabel.css';
import { api } from '../services/api';

// Removed DEMO_SAMPLES
const SUBJECT_OPTIONS = ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Tin học', 'Multi-subject', 'Unclear'];
const INTENT_OPTIONS = ['Ask Explanation', 'Solve Exercise', 'Request Formula', 'Confirm Understanding', 'Ask Example', 'Other'];
const ACTION_OPTIONS = ['Guide Step-by-step', 'Give Hint', 'Ask Probing Question', 'Provide Formula', 'Encourage', 'Correct Error', 'Summarize', 'Other'];
const COMPLETION_OPTIONS = ['Completed', 'Incomplete', 'Abandoned'];
const QUALITY_OPTIONS = ['Good', 'Medium', 'Poor'];
const FLAG_OPTIONS = ['Factual Error', 'Direct Answer', 'Language Issue'];

function StaffLabelView({ task, onBack }: { task: any; onBack: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
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

          // Populate existing labels if any
          const initialLabels: Record<string, any> = {};
          res.data.data.samples.forEach((s: any) => {
            if (s.savedLabel) {
              initialLabels[s.id] = s.savedLabel;
            }
          });
          setLabels(initialLabels);
        }
      } catch (e) {
        console.error('Failed to fetch samples', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSamples();
  }, [task]);

  const getLabel = (sampleId: string, field: string) => labels[sampleId]?.[field] || '';
  const getMsgLabels = (sampleId: string, msgIdx: number, field: string): string[] => {
    const value = labels[sampleId]?.messages?.[msgIdx]?.[field];
    return Array.isArray(value) ? value.filter(Boolean) : value ? [String(value)] : [];
  };
  const getFlags = (sampleId: string) => labels[sampleId]?.flags || [];

  const setMsgLabel = (sampleId: string, msgIdx: number, field: string, value: string | string[]) => {
    setLabels(prev => {
      const current = prev[sampleId] || { subject: '', status: 'draft', messages: {} };
      return {
        ...prev,
        [sampleId]: {
          ...current,
          messages: {
            ...current.messages,
            [msgIdx]: {
              ...current.messages[msgIdx],
              [field]: value
            }
          }
        }
      };
    });
    setSavedDraft(false);
  };

  const toggleMsgLabel = (sampleId: string, msgIdx: number, field: string, value: string) => {
    const current = getMsgLabels(sampleId, msgIdx, field);
    setMsgLabel(sampleId, msgIdx, field, current.includes(value) ? current.filter(label => label !== value) : [...current, value]);
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
      // Save current label state for rollback
      setAiBackup(prev => ({ ...prev, [sampleId]: labels[sampleId] || {} }));

      const res = await api.post(`/dataprep/assignments/my-task/${task.id}/auto-label-v2`, {
        messages: sample.messages,
        provider: aiProvider
      });

      if (res.data.success && res.data.data) {
        if (res.data.providerStatus === 'fallback') {
          alert('Gemini không phản hồi. Hệ thống đang hiển thị gợi ý dự phòng theo quy tắc, không phải kết quả trực tiếp từ Gemini.');
        }
        const suggestion = res.data.data;
        const aiLabels: any = {
          subject: suggestion.subject || '',
          completion: suggestion.completion || '',
          quality: suggestion.quality || '',
          status: 'reviewing',
          messages: {}
        };
        // Kiểm tra xem có nhãn mới không
        const newSubjects: string[] = [];
        const newIntents: string[] = [];
        const newActions: string[] = [];

        if (suggestion.subject && !subjectOptions.includes(suggestion.subject)) {
          newSubjects.push(suggestion.subject);
        }

        if (Array.isArray(suggestion.messages)) {
          suggestion.messages.forEach((msg: any) => {
            const suggestedIntents = Array.isArray(msg.intent) ? msg.intent : msg.intent ? [msg.intent] : [];
            suggestedIntents.forEach((intent: string) => {
              if (!intentOptions.includes(intent) && !newIntents.includes(intent)) newIntents.push(intent);
            });
            const suggestedActions = Array.isArray(msg.action) ? msg.action : msg.action ? [msg.action] : [];
            suggestedActions.forEach((action: string) => {
              if (!actionOptions.includes(action) && !newActions.includes(action)) newActions.push(action);
            });
          });
        }

        let allowAdd = true;
        const totalNew = newSubjects.length + newIntents.length + newActions.length;
        if (totalNew > 0) {
          let msg = 'AI đề xuất một số nhãn mới chưa có trong danh sách gốc:\n';
          if (newSubjects.length) msg += `- Môn học: ${newSubjects.join(', ')}\n`;
          if (newIntents.length) msg += `- Intent: ${newIntents.join(', ')}\n`;
          if (newActions.length) msg += `- Action: ${newActions.join(', ')}\n`;
          msg += '\nBạn có muốn tự động thêm chúng vào các Menu Tùy chọn không?';
          allowAdd = window.confirm(msg);
        }

        // Luôn thêm nhãn mới vào danh sách tùy chọn
        if (newSubjects.length) setSubjectOptions(prev => [...prev, ...newSubjects]);
        if (newIntents.length) setIntentOptions(prev => [...prev, ...newIntents]);
        if (newActions.length) setActionOptions(prev => [...prev, ...newActions]);

        if (Array.isArray(suggestion.messages)) {
          suggestion.messages.forEach((msg: any, idx: number) => {
            const messageIndex = Number.isInteger(Number(msg.messageIndex)) ? Number(msg.messageIndex) : idx;
            aiLabels.messages[messageIndex] = {};
            if (msg.intent) {
              aiLabels.messages[messageIndex].intent = Array.isArray(msg.intent) ? msg.intent : [msg.intent];
            }
            if (msg.action) {
              aiLabels.messages[messageIndex].action = Array.isArray(msg.action) ? msg.action : [msg.action];
            }
          });
        }

        // Giữ lại flags đã chọn trước đó khi merge AI labels
        setLabels(prev => {
          const existingFlags = prev[sampleId]?.flags || [];
          const existingNote = prev[sampleId]?.note || '';
          const mergedMessages = { ...(prev[sampleId]?.messages || {}) };
          Object.entries(aiLabels.messages || {}).forEach(([messageIndex, messageLabels]: [string, any]) => {
            mergedMessages[messageIndex] = { ...(mergedMessages[messageIndex] || {}), ...messageLabels };
          });
          return {
            ...prev,
            [sampleId]: { ...prev[sampleId], ...aiLabels, messages: mergedMessages, flags: existingFlags, note: existingNote }
          };
        });
        setSavedDraft(false);
      }
    } catch (e) {
      console.error('Lỗi AI:', e);
      alert('Không thể nhận gợi ý từ AI. Vui lòng thử lại sau.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleRollbackAI = (sampleId: string) => {
    if (aiBackup[sampleId]) {
      setLabels(prev => ({ ...prev, [sampleId]: aiBackup[sampleId] }));
      setSavedDraft(false);
      const newBackup = { ...aiBackup };
      delete newBackup[sampleId];
      setAiBackup(newBackup);
    }
  };

  const setLabel = (sampleId: string, field: string, value: string) => {
    setLabels(prev => ({
      ...prev,
      [sampleId]: { ...prev[sampleId], [field]: value }
    }));
    setSavedDraft(false);
  };

  const handleMessageLabelChange = (sampleId: string, msgIdx: number, field: string, value: string) => {
    if (submitted) return;
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const msgs = sampleLabels.messages || {};
      return {
        ...prev,
        [sampleId]: {
          ...sampleLabels,
          messages: {
            ...msgs,
            [msgIdx]: {
              ...msgs[msgIdx],
              [field]: value
            }
          }
        }
      };
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

  const handleSaveDraft = async () => {
    if (!task) return;

    setIsSaving(true);
    try {
      const promises = Object.keys(labels).map(sampleId => {
        const currentLabel = labels[sampleId];
        const isComplete = isSampleComplete(sampleId);
        return api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, {
          sampleId,
          label: currentLabel,
          isComplete: !!isComplete
        });
      });
      await Promise.all(promises);
      setSavedDraft(true);
      setTimeout(() => setSavedDraft(false), 3000);
    } catch (e) {
      console.error('Failed to save draft', e);
      alert('Có lỗi khi lưu bản nháp.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!task) return;
    const batchLabels = samples.reduce((payload: Record<string, any>, sample: any) => {
      const label = labels[String(sample.id)] ?? labels[sample.id];
      if (label) payload[String(sample.id)] = label;
      return payload;
    }, {});
    if (Object.keys(batchLabels).length !== samples.length) {
      alert('Chưa thể submit: dữ liệu nhãn của một số sample chưa có trong bản nháp hiện tại.');
      return;
    }
    try {
      const res = await api.post(`/dataprep/versions/${task.datasetVersionId || 'default'}/assignments/submit`, {
        submissionId: task.id,
        labels: batchLabels,
      });
      if (res.data.success) {
        setSubmitted(true);
        setShowSubmitModal(false);
        alert('Nộp bài thành công!');
      } else {
        alert('Có lỗi xảy ra: ' + res.data.error);
      }
    } catch (e) {
      console.error('Failed to submit task', e);
      alert('Lỗi kết nối khi nộp bài.');
    }
  };

  const unlabeledCount = samples.length - labeledCount;

  return (
    <div className="sl-container">
      {loading ? (
        <div className="flex items-center justify-center h-full w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="sl-topbar">
            <div className="sl-topbar-left">
              <button className="sl-back-btn" onClick={onBack}>
                <ArrowLeft size={18} />
                <span>Quay lại</span>
              </button>
              <div className="sl-topbar-info">
                <h2>📋 {taskName}</h2>
                <span className="sl-topbar-dataset">
                  {task?.dataset || 'Toan_11'} - {task?.version || 'v3'} · Samples {task?.batchStart || 1}–{(task?.batchStart || 1) + (task?.batchCount || 40) - 1}
                </span>
              </div>
            </div>
            <div className="sl-topbar-right">
              <div className="sl-progress-pill">
                <div className="sl-progress-bar-mini">
                  <div className="sl-progress-fill-mini" style={{ width: `${progress}%` }}></div>
                </div>
                <span>{labeledCount}/{samples.length}</span>
              </div>
              {task?.disableAi && (
                <span className="sl-ai-disabled">🚫 AI suggestions disabled</span>
              )}
              <button className="sl-btn-guideline" onClick={() => setShowGuideline(!showGuideline)}>
                <FileText size={16} />
                Hướng dẫn
              </button>
              <button className="sl-btn-draft" onClick={handleSaveDraft} disabled={submitted || isSaving}>
                {isSaving ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {isSaving ? 'Đang lưu...' : savedDraft ? 'Đã lưu ✓' : 'Save Draft'}
              </button>
              <button
                className={`sl-btn-submit ${submitted ? 'submitted' : ''}`}
                onClick={() => !submitted && setShowSubmitModal(true)}
                disabled={submitted}
              >
                <Send size={16} />
                {submitted ? 'Đã Submit ✓' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Guideline panel */}
          {showGuideline && task?.guideline && (
            <div className="sl-guideline-panel">
              <div className="sl-guideline-header">
                <h4><FileText size={16} /> Hướng dẫn gán nhãn</h4>
                <button onClick={() => setShowGuideline(false)}><X size={16} /></button>
              </div>
              <p>{task.guideline}</p>
            </div>
          )}

          {/* Toast */}
          {savedDraft && (
            <div className="sl-toast">
              <CheckCircle size={16} />
              Đã lưu nháp thành công!
            </div>
          )}

          {/* Single Sample View */}
          <div className="sl-single-sample-view">
            {samples.length > 0 && (() => {
              const sample = samples[currentIndex];
              const hasLabel = !!labels[sample.id]?.subject;

              return (
                <div key={sample.id} className={`sl-sample-card expanded ${hasLabel ? 'labeled' : ''}`}>
                  {/* Sample header */}
                  <div className="sl-sample-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="sl-sample-header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="sl-sample-num">#{sample.id}</span>
                        {hasLabel ? (
                          <span className="sl-labeled-badge"><CheckCircle size={12} /> Đã gán nhãn</span>
                        ) : (
                          <span className="sl-unlabeled-badge"><Clock size={12} /> Chưa gán nhãn</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '13px', fontWeight: 600, borderLeft: '1px solid #e2e8f0', paddingLeft: '16px' }}>
                        <MessageSquare size={14} />
                        <span>Hội thoại</span>
                      </div>
                    </div>

                    <div className="sl-sample-header-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="sl-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={() => setChatFontSize(f => Math.max(10, f - 1))}
                          style={{ padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#475569' }}
                        >A-</button>
                        <span style={{ fontSize: '12px', color: '#64748b', minWidth: '34px', textAlign: 'center', fontWeight: 'bold' }}>{chatFontSize}px</span>
                        <button
                          onClick={() => setChatFontSize(f => Math.min(24, f + 1))}
                          style={{ padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#475569' }}
                        >A+</button>
                      </div>

                      <span className="sl-msg-count">{sample.messages.length} tin nhắn</span>
                      {hasLabel && <span className="sl-subject-tag">{labels[sample.id]?.subject}</span>}
                    </div>
                  </div>

                  {/* Expanded content */}
                  <div className="sl-sample-body">
                    {/* Chat messages */}
                    <div className="sl-chat-area">
                      {sample.messages.map((msg: any, mIdx: number) => (
                        <div key={mIdx} className={`sl-msg ${msg.role}`}>
                          <div className="sl-msg-header">
                            <span className="sl-msg-icon">{msg.role === 'user' ? '🧑' : '🤖'}</span>
                            <span className="sl-msg-role">{msg.role === 'user' ? 'Học sinh' : 'Trợ lý'}</span>
                            <span className="sl-msg-turn">Turn {Math.floor(mIdx / 2) + 1}</span>
                          </div>
                          <div className={`sl-msg-bubble ${msg.role}`} style={{ fontSize: `${chatFontSize}px` }}>
                            <p>{msg.content}</p>
                          </div>
                          {/* Per-message label */}
                          <div className="sl-msg-label-row">
                            {msg.role === 'user' ? (
                              <div className="sl-inline-label">
                                <span className="sl-label-tag">Intent:</span>
                                <div className="sl-multi-labels">
                                  {intentOptions.map(o => <button type="button" key={o} className={getMsgLabels(sample.id,mIdx,'intent').includes(o)?'active':''} onClick={()=>toggleMsgLabel(sample.id,mIdx,'intent',o)}><Check size={12}/>{o}</button>)}
                                  <button type="button" className="add" onClick={()=>{const value=window.prompt('Nhập Intent mới:')?.trim();if(value){if(!intentOptions.includes(value))setIntentOptions([...intentOptions,value]);toggleMsgLabel(sample.id,mIdx,'intent',value)}}}>+ Thêm Intent</button>
                                </div>
                              </div>
                            ) : (
                              <div className="sl-inline-label">
                                <span className="sl-label-tag">Action:</span>
                                <div className="sl-multi-labels">
                                  {actionOptions.map(o => <button type="button" key={o} className={getMsgLabels(sample.id,mIdx,'action').includes(o)?'active':''} onClick={()=>toggleMsgLabel(sample.id,mIdx,'action',o)}><Check size={12}/>{o}</button>)}
                                  <button type="button" className="add" onClick={()=>{const value=window.prompt('Nhập Action mới:')?.trim();if(value){if(!actionOptions.includes(value))setActionOptions([...actionOptions,value]);toggleMsgLabel(sample.id,mIdx,'action',value)}}}>+ Thêm Action</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Label panel */}
                    <div className="sl-label-panel">
                      <div className="sl-label-group">
                        <label>📚 Môn học</label>
                        <select
                          value={getLabel(sample.id, 'subject')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__add_new__') {
                              const newSubject = window.prompt('Nhập tên môn học mới:');
                              if (newSubject && newSubject.trim() !== '') {
                                const trimmed = newSubject.trim();
                                if (!subjectOptions.includes(trimmed)) setSubjectOptions([...subjectOptions, trimmed]);
                                setLabel(sample.id, 'subject', trimmed);
                              }
                            } else {
                              setLabel(sample.id, 'subject', val);
                            }
                          }}
                          className="sl-select"
                        >
                          <option value="">— Chọn môn học —</option>
                          {subjectOptions.map(o => <option key={o} value={o}>{o}</option>)}
                          <option value="__add_new__" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Thêm môn học khác...</option>
                        </select>
                      </div>

                      <div className="sl-label-row-2">
                        <div className="sl-label-group">
                          <label>📊 Completion</label>
                          <select
                            value={getLabel(sample.id, 'completion')}
                            onChange={(e) => setLabel(sample.id, 'completion', e.target.value)}
                            className="sl-select"
                          >
                            <option value="">— Chọn —</option>
                            {COMPLETION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div className="sl-label-group">
                          <label>⭐ Quality</label>
                          <select
                            value={getLabel(sample.id, 'quality')}
                            onChange={(e) => setLabel(sample.id, 'quality', e.target.value)}
                            className="sl-select"
                          >
                            <option value="">— Chọn —</option>
                            {QUALITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="sl-label-group">
                        <label>🚩 Cờ lỗi</label>
                        <div className="sl-flags-row">
                          {flagOptions.map(flag => (
                            <label key={flag} className={`sl-flag-chip ${getFlags(sample.id).includes(flag) ? 'active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={getFlags(sample.id).includes(flag)}
                                onChange={() => toggleFlag(sample.id, flag)}
                              />
                              {flag}
                            </label>
                          ))}
                          <button
                            className="sl-flag-chip"
                            style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'transparent', color: '#64748b' }}
                            onClick={() => {
                              const newFlag = window.prompt('Nhập tên cờ lỗi mới:');
                              if (newFlag && newFlag.trim() !== '') {
                                const trimmed = newFlag.trim();
                                if (!flagOptions.includes(trimmed)) setFlagOptions([...flagOptions, trimmed]);
                                if (!getFlags(sample.id).includes(trimmed)) toggleFlag(sample.id, trimmed);
                              }
                            }}
                          >
                            + Thêm...
                          </button>
                        </div>
                      </div>

                      <div className="sl-label-group">
                        <label>📝 Ghi chú</label>
                        <textarea
                          className="sl-textarea"
                          placeholder="Ghi chú của bạn..."
                          value={getLabel(sample.id, 'note')}
                          onChange={(e) => setLabel(sample.id, 'note', e.target.value)}
                          rows={2}
                        />
                      </div>

                      {!task?.disableAi && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={aiProvider}
                            onChange={(e) => setAiProvider(e.target.value)}
                            className="sl-inline-select"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              fontSize: '12px',
                              color: '#475569',
                              cursor: 'pointer',
                              minWidth: '170px'
                            }}
                            disabled={isAiLoading}
                          >
                            {AI_PROVIDERS.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                          <button className="sl-ai-btn" onClick={() => handleAIAssist(sample.id)} disabled={isAiLoading}>
                            {isAiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {isAiLoading ? '🤖 Đang phân tích...' : '🤖 Gợi ý AI'}
                          </button>
                          {aiBackup[sample.id] && (
                            <button
                              className="sl-ai-btn"
                              onClick={() => handleRollbackAI(sample.id)}
                              style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
                            >
                              Hoàn tác AI
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Pagination Footer */}
          {samples.length > 0 && (
            <div className="sl-pagination-footer">
              <button
                className="sl-page-btn"
                onClick={() => setCurrentIndex(c => Math.max(0, c - 1))}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={16} /> Quay lại
              </button>

              <div className="sl-page-info">
                <span>Sample {currentIndex + 1} / {samples.length}</span>
                <div className="sl-jump-group">
                  <button
                    onClick={() => setCurrentIndex(c => Math.max(0, c - 1))}
                    disabled={currentIndex === 0}
                  >-</button>
                  <input
                    type="number"
                    value={currentIndex + 1}
                    min={1}
                    max={samples.length}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= samples.length) {
                        setCurrentIndex(val - 1);
                      }
                    }}
                  />
                  <button
                    onClick={() => setCurrentIndex(c => Math.min(samples.length - 1, c + 1))}
                    disabled={currentIndex === samples.length - 1}
                  >+</button>
                </div>
              </div>

              <button
                className="sl-page-btn"
                onClick={() => setCurrentIndex(c => Math.min(samples.length - 1, c + 1))}
                disabled={currentIndex === samples.length - 1}
              >
                Tiếp theo <ChevronRight size={16} />
              </button>
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
                    <div className="sl-modal-warning">
                      <AlertCircle size={20} />
                      <div>
                        <strong>Còn {unlabeledCount} sample chưa gán nhãn!</strong>
                        <p>Bạn cần gán nhãn cho TẤT CẢ sample trước khi submit.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="sl-modal-success">
                        <CheckCircle size={20} />
                        <div>
                          <strong>Đã gán nhãn đầy đủ {samples.length}/{samples.length} samples!</strong>
                          <p>Sau khi submit, bạn sẽ không thể chỉnh sửa.</p>
                        </div>
                      </div>
                      <div className="sl-modal-actions">
                        <button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Hủy</button>
                        <button className="sl-btn-confirm" onClick={handleSubmit}>
                          <Send size={16} /> Submit kết quả
                        </button>
                      </div>
                    </>
                  )}
                  {unlabeledCount > 0 && (
                    <div className="sl-modal-actions">
                      <button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Đóng</button>
                    </div>
                  )}
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
