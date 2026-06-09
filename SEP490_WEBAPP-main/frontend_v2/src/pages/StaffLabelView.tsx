import React, { useState } from 'react';
import {
  ArrowLeft, Save, Send, ChevronDown, ChevronRight, CheckCircle,
  AlertCircle, MessageSquare, Sparkles, FileText, X, Clock
} from 'lucide-react';
import '../stafflabel.css';

/* ── Demo sample data ── */
const DEMO_SAMPLES = [
  {
    id: 1,
    messages: [
      { role: 'user', content: 'Em không hiểu chuyển động thẳng đều là gì ạ.' },
      { role: 'assistant', content: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?' },
      { role: 'user', content: 'Là vật đang di chuyển ạ.' },
      { role: 'assistant', content: 'Đúng rồi! Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ ta gọi đó là loại chuyển động gì?' },
    ]
  },
  {
    id: 2,
    messages: [
      { role: 'user', content: 'Công thức x = x0 + vt có nghĩa là gì ạ?' },
      { role: 'assistant', content: 'Câu hỏi hay! Trước khi giải thích, em cho thầy biết: trong công thức đó, em đoán x và x0 biểu diễn điều gì?' },
      { role: 'user', content: 'x là vị trí còn x0 là vị trí ban đầu ạ?' },
      { role: 'assistant', content: 'Đúng rồi! Vậy vt là gì? Nếu v là vận tốc và t là thời gian, tích v nhân t sẽ cho ta biết điều gì?' },
      { role: 'user', content: 'Quãng đường đi được ạ?' },
      { role: 'assistant', content: 'Chính xác! Vậy công thức x = x0 + vt có nghĩa là: vị trí hiện tại = vị trí ban đầu + quãng đường đã đi. Rất logic phải không?' },
    ]
  },
  {
    id: 3,
    messages: [
      { role: 'user', content: 'Cho em đáp án luôn đi, em không có thời gian.' },
      { role: 'assistant', content: 'Thầy hiểu em đang bận, nhưng nếu đưa đáp án ngay thì em sẽ khó nhớ lâu. Mình chỉ cần một câu thôi: em nghĩ chuyển động thẳng đều khác chuyển động cong ở điểm gì?' },
      { role: 'user', content: 'Thẳng thì đi thẳng còn cong thì đi cong.' },
      { role: 'assistant', content: 'Đúng vậy! Thêm nữa, chuyển động thẳng đều còn có đặc điểm gì về vận tốc?' },
    ]
  },
  {
    id: 4,
    messages: [
      { role: 'user', content: 'Thầy ơi, gia tốc là gì ạ? Em đọc sách không hiểu.' },
      { role: 'assistant', content: 'Em hãy tưởng tượng: khi em đạp xe, ban đầu xe chậm, sau đó nhanh dần. Sự thay đổi vận tốc đó chính là có gia tốc. Em nghĩ gia tốc liên quan đến gì?' },
      { role: 'user', content: 'Liên quan đến tốc độ thay đổi ạ?' },
      { role: 'assistant', content: 'Chính xác! Gia tốc = (vận tốc cuối - vận tốc đầu) / thời gian. Nó cho biết vận tốc thay đổi nhanh hay chậm.' },
    ]
  },
  {
    id: 5,
    messages: [
      { role: 'user', content: 'Em muốn biết về lực ma sát ạ.' },
      { role: 'assistant', content: 'Được! Em thử trượt tay trên mặt bàn xem. Em cảm thấy gì?' },
      { role: 'user', content: 'Em thấy có gì đó cản lại tay em.' },
      { role: 'assistant', content: 'Đúng rồi! Cái "cản lại" đó chính là lực ma sát. Nó luôn ngược chiều chuyển động. Em thử nghĩ xem: nếu không có ma sát thì sao?' },
    ]
  },
];

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
  const samples = DEMO_SAMPLES;

  const getLabel = (sampleId, field) => labels[sampleId]?.[field] || '';
  const getMsgLabel = (sampleId, msgIdx, field) => labels[sampleId]?.messages?.[msgIdx]?.[field] || '';
  const getFlags = (sampleId) => labels[sampleId]?.flags || [];

  const setLabel = (sampleId, field, value) => {
    setLabels(prev => ({
      ...prev,
      [sampleId]: { ...prev[sampleId], [field]: value }
    }));
    setSavedDraft(false);
  };

  const setMsgLabel = (sampleId, msgIdx, field, value) => {
    setLabels(prev => {
      const existing = prev[sampleId] || {};
      const msgs = existing.messages || {};
      return {
        ...prev,
        [sampleId]: {
          ...existing,
          messages: { ...msgs, [msgIdx]: { ...msgs[msgIdx], [field]: value } }
        }
      };
    });
    setSavedDraft(false);
  };

  const toggleFlag = (sampleId, flag) => {
    setLabels(prev => {
      const existing = prev[sampleId] || {};
      const flags = existing.flags || [];
      const newFlags = flags.includes(flag) ? flags.filter(f => f !== flag) : [...flags, flag];
      return { ...prev, [sampleId]: { ...existing, flags: newFlags } };
    });
    setSavedDraft(false);
  };

  const applyAiSuggestion = (sampleId, sample) => {
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

  const handleSaveDraft = () => {
    setSavedDraft(true);
    setTimeout(() => setSavedDraft(false), 3000);
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setShowSubmitModal(false);
  };

  const unlabeledCount = samples.length - labeledCount;

  return (
    <div className="sl-container">
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
    </div>
  );
}

export default StaffLabelView;
