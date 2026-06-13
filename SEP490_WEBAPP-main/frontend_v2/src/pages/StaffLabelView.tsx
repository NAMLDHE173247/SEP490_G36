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

function StaffLabelView({ task, onBack }) {
  const [expandedSample, setExpandedSample] = useState(0);
  const [labels, setLabels] = useState({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [showGuideline, setShowGuideline] = useState(false);

  const taskName = task?.name || 'Gán nhãn Toán 11 — Batch 1';
  
  const [samples, setSamples] = useState([]);
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
          const initialLabels = {};
          res.data.data.samples.forEach(s => {
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

  const getLabel = (sampleId, field) => labels[sampleId]?.[field] || '';
  const getMsgLabel = (sampleId, msgIdx, field) => labels[sampleId]?.messages?.[msgIdx]?.[field] || '';
  const getFlags = (sampleId) => labels[sampleId]?.flags || [];
  
  const setMsgLabel = (sampleId, msgIdx, field, value) => {
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

  const handleAIAssist = (sampleId) => {
    // Fake AI Assist filling out labels
    const sample = samples.find(s => s.id === sampleId);
    if (!sample) return;
    const aiLabels = {
      subject: 'Toán học',
      status: 'reviewing',
      messages: {}
    };
    sample.messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        aiLabels.messages[idx] = { intent: 'Ask Explanation' };
      } else {
        aiLabels.messages[idx] = { action: 'Ask Probing Question' };
      }
    });
    setLabels(prev => ({ ...prev, [sampleId]: { ...prev[sampleId], ...aiLabels } }));
    setSavedDraft(false);
  };

  const setLabel = (sampleId, field, value) => {
    setLabels(prev => ({
      ...prev,
      [sampleId]: { ...prev[sampleId], [field]: value }
    }));
    setSavedDraft(false);
  };

  const handleMessageLabelChange = (sampleId, msgIdx, field, value) => {
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

  const toggleFlag = (sampleId, flag) => {
    if (submitted) return;
    setLabels(prev => {
      const existing = prev[sampleId] || {};
      const flags = existing.flags || [];
      const newFlags = flags.includes(flag) ? flags.filter(f => f !== flag) : [...flags, flag];
      return { ...prev, [sampleId]: { ...existing, flags: newFlags } };
    });
    setSavedDraft(false);
  };

  const applyAiSuggestion = (sampleId, sample) => {
    if (task?.disableAi || submitted) return;
    const aiLabels = {
      subject: 'Vật lý',
      completion: 'Completed',
      quality: 'Good',
      note: 'AI: Hội thoại Socratic method tốt',
      flags: [],
      messages: {}
    };
    sample.messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        aiLabels.messages[idx] = { intent: 'Ask Explanation' };
      } else {
        aiLabels.messages[idx] = { action: 'Ask Probing Question' };
      }
    });
    setLabels(prev => ({ ...prev, [sampleId]: { ...prev[sampleId], ...aiLabels } }));
    setSavedDraft(false);
  };

  const labeledCount = samples.filter(s => labels[s.id]?.subject).length;
  const progress = Math.round((labeledCount / samples.length) * 100);

  const handleSaveDraft = async () => {
    // Optionally save labels to Backend
    if (task) {
      const currentSampleId = samples[expandedSample]?.id;
      if (currentSampleId) {
        const currentLabel = labels[currentSampleId];
        const isComplete = currentLabel?.subject && currentLabel?.completion && currentLabel?.quality;
        try {
          await api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, {
            sampleId: currentSampleId,
            label: currentLabel,
            isComplete: !!isComplete
          });
        } catch (e) {
          console.error('Failed to save label', e);
        }
      }
    }
    
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 3000);
  };

  const handleSubmit = async () => {
    
    // Update task status via Backend API
    if (task) {
      try {
        const res = await api.post(`/dataprep/versions/${task.datasetVersionId || 'default'}/assignments/submit`, {
          submissionId: task.id // Using task.id as submissionId because of the way we mapped it in StaffTasksView
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
          <button className="sl-btn-draft" onClick={handleSaveDraft} disabled={submitted}>
            <Save size={16} />
            {savedDraft ? 'Đã lưu ✓' : 'Save Draft'}
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

      {/* Sample list */}
      <div className="sl-samples-list">
        {samples.map((sample, sIdx) => {
          const isExpanded = expandedSample === sIdx;
          const hasLabel = !!labels[sample.id]?.subject;

          return (
            <div key={sample.id} className={`sl-sample-card ${isExpanded ? 'expanded' : ''} ${hasLabel ? 'labeled' : ''}`}>
              {/* Sample header */}
              <div className="sl-sample-header" onClick={() => setExpandedSample(isExpanded ? -1 : sIdx)}>
                <div className="sl-sample-header-left">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="sl-sample-num">#{sample.id}</span>
                  {hasLabel ? (
                    <span className="sl-labeled-badge"><CheckCircle size={12} /> Đã gán nhãn</span>
                  ) : (
                    <span className="sl-unlabeled-badge"><Clock size={12} /> Chưa gán nhãn</span>
                  )}
                </div>
                <div className="sl-sample-header-right">
                  <span className="sl-msg-count">{sample.messages.length} tin nhắn</span>
                  {hasLabel && <span className="sl-subject-tag">{labels[sample.id]?.subject}</span>}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="sl-sample-body">
                  {/* Chat messages */}
                  <div className="sl-chat-area">
                    <div className="sl-chat-title">
                      <MessageSquare size={14} />
                      <span>Hội thoại</span>
                    </div>
                    {sample.messages.map((msg, mIdx) => (
                      <div key={mIdx} className={`sl-msg ${msg.role}`}>
                        <div className="sl-msg-header">
                          <span className="sl-msg-icon">{msg.role === 'user' ? '🧑' : '🤖'}</span>
                          <span className="sl-msg-role">{msg.role === 'user' ? 'Học sinh' : 'Trợ lý'}</span>
                          <span className="sl-msg-turn">Turn {Math.floor(mIdx / 2) + 1}</span>
                        </div>
                        <div className={`sl-msg-bubble ${msg.role}`}>
                          <p>{msg.content}</p>
                        </div>
                        {/* Per-message label */}
                        <div className="sl-msg-label-row">
                          {msg.role === 'user' ? (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Intent:</span>
                              <select
                                value={getMsgLabel(sample.id, mIdx, 'intent')}
                                onChange={(e) => setMsgLabel(sample.id, mIdx, 'intent', e.target.value)}
                                className="sl-inline-select"
                              >
                                <option value="">— Chọn —</option>
                                {INTENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          ) : (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Action:</span>
                              <select
                                value={getMsgLabel(sample.id, mIdx, 'action')}
                                onChange={(e) => setMsgLabel(sample.id, mIdx, 'action', e.target.value)}
                                className="sl-inline-select"
                              >
                                <option value="">— Chọn —</option>
                                {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Labels panel */}
                  <div className="sl-labels-panel">
                    <div className="sl-label-group">
                      <label>📌 Nhãn môn học</label>
                      <select
                        value={getLabel(sample.id, 'subject')}
                        onChange={(e) => setLabel(sample.id, 'subject', e.target.value)}
                        className="sl-select"
                      >
                        <option value="">— Chọn môn học —</option>
                        {SUBJECT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
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
                        {FLAG_OPTIONS.map(flag => (
                          <label key={flag} className={`sl-flag-chip ${getFlags(sample.id).includes(flag) ? 'active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={getFlags(sample.id).includes(flag)}
                              onChange={() => toggleFlag(sample.id, flag)}
                            />
                            {flag}
                          </label>
                        ))}
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
                      <button className="sl-ai-btn" onClick={() => applyAiSuggestion(sample.id, sample)}>
                        <Sparkles size={14} />
                        🤖 Gợi ý AI
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
