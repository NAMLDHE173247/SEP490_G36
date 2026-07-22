import React, { useState } from 'react';
import {
  MessageSquare,
  Tag,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  X,
  Plus,
  ArrowLeft,
  Send,
  Clock,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import '../styles/datalabeling.css';

/* ── Demo conversation data ── */
const CONVERSATIONS = [
  {
    id: 1,
    messages: [
      { role: 'user', content: 'Em không hiểu chuyển động thẳng đều là gì.', action: 'OK', actionColor: 'green' },
      { role: 'assistant', content: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?', action: 'LOG', actionColor: 'purple' },
      { role: 'user', content: 'Là vật đang đi chuyển a.', action: 'NEXT', actionColor: 'blue' },
      { role: 'assistant', content: 'Đúng rồi. Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ ta gọi đó là loại chuyển động gì?', action: 'WAIT', actionColor: 'gray' },
      { role: 'user', content: 'Chuyển động đều a?', action: 'SKIP', actionColor: 'orange' },
      { role: 'assistant', content: "Rất gần rồi! Đây đủ hơn là 'chuyển động thẳng đều'. Em thử đoán xem 'thẳng' ở đây có nghĩa là gì trong chuyển động?", action: 'MOT', actionColor: 'red' },
    ]
  },
  {
    id: 2,
    messages: [
      { role: 'user', content: 'Công thức x = x0 + vt có nghĩa là gì a?', action: null, actionColor: null },
      { role: 'assistant', content: 'Câu hỏi hay. Trước khi giải thích công thức, em cho thầy biết: trong công thức đó, em đoán x và x0 biểu diễn điều gì?', action: null, actionColor: null },
      { role: 'user', content: 'x là vị trí còn x0 là vị trí ban đầu a?', action: null, actionColor: null },
      { role: 'assistant', content: 'Đúng rồi! Vậy vt là gì? Nếu v là vận tốc và t là thời gian, tích v nhân t sẽ cho ta biết điều gì?', action: null, actionColor: null },
    ]
  },
  {
    id: 3,
    messages: [
      { role: 'user', content: 'Cho em đáp án luôn đi, em không có thời gian.', action: null, actionColor: null },
      { role: 'assistant', content: 'Thầy hiểu em đang bận, nhưng nếu đưa đáp án ngay thì em sẽ khó nhớ lâu. Mình chỉ cần một câu thôi: em nghĩ chuyển động thẳng đều khác chuyển động cong ở điểm gì?', action: null, actionColor: null },
      { role: 'user', content: 'Thẳng thì đi thẳng còn cong thì đi cong.', action: null, actionColor: null },
      { role: 'assistant', content: 'Đúng vậy! Thêm nữa, chuyển động thẳng đều còn có đặc điểm gì về vận tốc?', action: null, actionColor: null },
    ]
  },
];

const HARD_LABELS = [
  { key: 'REJ', label: 'REJ', color: '#ef4444', bg: '#fef2f2', icon: '✕' },
  { key: 'MATH', label: 'MATH', color: '#6366f1', bg: '#eef2ff', icon: '📐' },
  { key: 'PHYS', label: 'PHYS', color: '#0ea5e9', bg: '#e0f2fe', icon: '⚡' },
  { key: 'CHEM', label: 'CHEM', color: '#f59e0b', bg: '#fef3c7', icon: '🧪' },
  { key: 'LIT', label: 'LIT', color: '#8b5cf6', bg: '#f3e8ff', icon: '📖' },
  { key: 'BIO', label: 'BIO', color: '#ec4899', bg: '#fce7f3', icon: '♥' },
  { key: 'OOS', label: 'OOS', color: '#64748b', bg: '#f1f5f9', icon: '☁' },
];

const ACTION_COLORS = {
  green: { bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  purple: { bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
  blue: { bg: '#dbeafe', color: '#2563eb', border: '#93c5fd' },
  gray: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  orange: { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' },
  red: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
};

function DataLabelingView({ onBack }) {
  const [currentConv, setCurrentConv] = useState(0);
  const [chatTab, setChatTab] = useState('assignment');
  const [labelTab, setLabelTab] = useState('conversation');
  /* Per-conversation labels: { convId: { hard: ['PHYS', ...], soft: ['...'] } } */
  const [convLabels, setConvLabels] = useState({});
  const [softInput, setSoftInput] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  /* Per-message action overrides: { 'convId-msgIdx': 'OK' } */
  const [msgActions, setMsgActions] = useState({});
  const [submitStatus, setSubmitStatus] = useState('draft');
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);

  // New states for the requirements
  const [subject, setSubject] = useState('');
  const [completion, setCompletion] = useState('');
  const [quality, setQuality] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const SUBJECT_LABELS = ['MATH', 'PHYSICAL', 'CHEMISTRY', 'LITERATURE', 'BIOLOGY', 'ENGLISH', 'HISTORY', 'GEOGRAPHY', 'CODING', 'OUT_OF_SCOPE'];
  const COMPLETION_LABELS = ['COMPLETE', 'INCOMPLETE'];
  const QUALITY_LABELS = ['GOOD', 'BAD', 'AVERAGE'];
  const COMBINED_MESSAGE_HARD_LABELS = [
    'CORRECT', 'INCORRECT', 'REQUEST_HINT', 'ASK_THEORY', 'REQUEST_EXPLANATION',
    'REQUEST_SIMPLER', 'SKIP_EXERCISE', 'ENCOURAGE', 'OFF_TOPIC', 'NEXT_SECTION'
  ];

  const isSubmitDisabled = !subject || !completion || !quality;


  const ACTION_OPTIONS = ['OK', 'LOG', 'NEXT', 'WAIT', 'SKIP', 'MOT'];
  const ACTION_COLOR_MAP = { OK: 'green', LOG: 'purple', NEXT: 'blue', WAIT: 'gray', SKIP: 'orange', MOT: 'red' };

  const totalSamples = 120;
  const showingSamples = 20;

  const conv = CONVERSATIONS[currentConv];
  const totalConvs = CONVERSATIONS.length > showingSamples ? showingSamples : CONVERSATIONS.length;
  const convId = conv.id;

  /* Current conversation's labels */
  const currentHard = convLabels[convId]?.hard || [];
  const currentSoft = convLabels[convId]?.soft || [];

  /* Count labeled conversations */
  const labeledConvCount = Object.keys(convLabels).filter(k => {
    const l = convLabels[k];
    return (l.hard && l.hard.length > 0) || (l.soft && l.soft.length > 0);
  }).length;
  const totalMessages = CONVERSATIONS.reduce((s, c) => s + c.messages.length, 0);
  const labeledMessages = Object.keys(convLabels).reduce((s, k) => {
    const c = CONVERSATIONS.find(cv => cv.id === parseInt(k));
    return s + (c ? c.messages.length : 0);
  }, 0);
  const progress = totalMessages > 0 ? Math.round((labeledMessages / totalMessages) * 100) : 0;

  const toggleHardLabel = (key) => {
    setConvLabels(prev => {
      const existing = prev[convId] || { hard: [], soft: [] };
      const hard = existing.hard.includes(key)
        ? existing.hard.filter(h => h !== key)
        : [...existing.hard, key];
      return { ...prev, [convId]: { ...existing, hard } };
    });
  };

  const addSoftLabel = () => {
    if (softInput.trim()) {
      setConvLabels(prev => {
        const existing = prev[convId] || { hard: [], soft: [] };
        return { ...prev, [convId]: { ...existing, soft: [...existing.soft, softInput.trim()] } };
      });
      setSoftInput('');
    }
  };

  const removeSoftLabel = (idx) => {
    setConvLabels(prev => {
      const existing = prev[convId] || { hard: [], soft: [] };
      return { ...prev, [convId]: { ...existing, soft: existing.soft.filter((_, i) => i !== idx) } };
    });
  };

  const cycleMessageAction = (msgIdx) => {
    const key = `${convId}-${msgIdx}`;
    const current = msgActions[key] || conv.messages[msgIdx].action;
    const currentIdx = ACTION_OPTIONS.indexOf(current);
    const nextAction = ACTION_OPTIONS[(currentIdx + 1) % ACTION_OPTIONS.length];
    setMsgActions(prev => ({ ...prev, [key]: nextAction }));
  };

  const getMessageAction = (msgIdx) => {
    const key = `${convId}-${msgIdx}`;
    return msgActions[key] || conv.messages[msgIdx].action;
  };

  const handleRejectSubmit = () => {
    if (!rejectReason.trim()) return;
    setIsRejectModalOpen(false);
    setRejectReason('');
    // Optionally move to next sample
    if (currentConv < CONVERSATIONS.length - 1) {
      setCurrentConv(currentConv + 1);
    }
  };


  return (
    <div className="dl-container">
      {/* Header */}
      <div className="dl-header-bar">
        <div className="dl-header-left">
          {onBack && (
            <button className="dl-back-btn" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h2>Data Labeling</h2>
            <p>Review assigned conversations and submit your labels.</p>
          </div>
        </div>
      </div>

      {/* Samples count */}
      <div className="dl-samples-bar">
        Showing {showingSamples} / {totalSamples} samples
      </div>

      {/* Main layout */}
      <div className="dl-main-layout">
        {/* Left: Chat History */}
        <div className="dl-chat-panel">
          <div className="dl-chat-header">
            <div className="dl-chat-title">
              <MessageSquare size={16} />
              <span>Chat History</span>
            </div>
            <div className="dl-chat-nav-info">
              <span className="dl-conv-label">Conversation {conv.id}</span>
              <span className="dl-conv-count">{currentConv + 1} / {totalConvs}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="dl-chat-tabs">
            <button
              className={`dl-chat-tab ${chatTab === 'assignment' ? 'active' : ''}`}
              onClick={() => setChatTab('assignment')}
            >
              Assignment
            </button>
            <button
              className={`dl-chat-tab ${chatTab === 'unassigned' ? 'active' : ''}`}
              onClick={() => setChatTab('unassigned')}
            >
              Unassigned
            </button>
          </div>

          {/* Messages */}
          <div className="dl-messages-area">
            {conv.messages.map((msg, idx) => {
              const action = getMessageAction(idx);
              const actionColor = ACTION_COLOR_MAP[action] || msg.actionColor;
              return (
              <div key={idx} className={`dl-message ${msg.role}`}>
                <div className="dl-msg-role-badge">
                  <span className="dl-msg-role-icon">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </span>
                  <span className="dl-msg-role-label">
                    {msg.role === 'user' ? 'USER' : 'ASSISTANT'}
                  </span>
                  <span className="dl-msg-turn-badge">{Math.floor(idx / 2) + 1}</span>
                </div>
                <div 
                  className={`dl-msg-bubble ${msg.role} ${selectedMessageIndex === idx ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => {
                    setSelectedMessageIndex(idx);
                    setLabelTab('message');
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <p>{msg.content}</p>
                </div>
                {action && (
                  <div
                    className="dl-msg-action-tag clickable"
                    onClick={() => cycleMessageAction(idx)}
                    title="Click to change action"
                    style={{
                      background: ACTION_COLORS[actionColor]?.bg,
                      color: ACTION_COLORS[actionColor]?.color,
                      borderColor: ACTION_COLORS[actionColor]?.border,
                    }}
                  >
                    {actionColor === 'green' && '✓ '}
                    {actionColor === 'purple' && '📋 '}
                    {actionColor === 'blue' && '→ '}
                    {actionColor === 'gray' && '⏱ '}
                    {actionColor === 'orange' && '⏭ '}
                    {actionColor === 'red' && '◇ '}
                    {action}
                  </div>
                )}
                {!action && (
                  <button
                    className="dl-msg-add-action"
                    onClick={() => cycleMessageAction(idx)}
                    title="Click to add action"
                  >
                    + Add Action
                  </button>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {/* Right: Labels Panel */}
        <div className="dl-labels-panel">
          <div className="dl-labels-header">
            <Tag size={16} />
            <span>Current Labels</span>
          </div>

          {/* Label scope selector */}
          <div className="dl-label-scope">
            <select
              value={labelTab}
              onChange={(e) => setLabelTab(e.target.value)}
              className="dl-scope-select"
            >
              <option value="conversation">Conversation</option>
              <option value="message">Message</option>
            </select>
          </div>

          {/* Show assigned labels */}
          {(currentHard.length > 0 || currentSoft.length > 0) ? (
            <div className="dl-current-labels-list">
              {currentHard.map(key => {
                const info = HARD_LABELS.find(l => l.key === key);
                return (
                  <span key={key} className="dl-assigned-label" style={{ background: info?.bg, color: info?.color, borderColor: info?.color }}>
                    {info?.icon} {info?.label}
                    <button onClick={() => toggleHardLabel(key)}>×</button>
                  </span>
                );
              })}
              {currentSoft.map((label, idx) => (
                <span key={`s-${idx}`} className="dl-assigned-label soft">
                  {label}
                  <button onClick={() => removeSoftLabel(idx)}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <div className="dl-no-labels">
              No labels for this conversation yet.
            </div>
          )}

          {/* Add Label section */}
          <div className="dl-add-label-section">
            <div className="dl-add-label-header">
              <button className="dl-add-label-btn">
                <Tag size={14} />
                Add Label
              </button>
              <button className="dl-user-guide-btn" onClick={() => setShowGuide(!showGuide)}>
                <BookOpen size={14} />
                User Guide
              </button>
            </div>

            {labelTab === 'conversation' ? (
              <div className="dl-hard-labels-section flex flex-col gap-3">
                <span className="dl-label-section-title">CONVERSATION ATTRIBUTES</span>
                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Nhãn môn học <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">-- Chọn môn học --</option>
                    {SUBJECT_LABELS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                {/* Completion */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Completion <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={completion}
                    onChange={(e) => setCompletion(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">-- Chọn trạng thái --</option>
                    {COMPLETION_LABELS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                {/* Quality */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Quality <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">-- Chọn chất lượng --</option>
                    {QUALITY_LABELS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="dl-hard-labels-section">
                <span className="dl-label-section-title">MESSAGE INTENT</span>
                <select 
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:ring-2 focus:ring-blue-200 mt-2"
                >
                  <option value="">-- Chọn Intent --</option>
                  {COMBINED_MESSAGE_HARD_LABELS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <div className="mt-2 text-right">
                  <button className="text-[10px] font-medium text-blue-600 hover:underline">+ Thêm option mới</button>
                </div>
              </div>
            )}

            {/* Soft Labels */}
            <div className="dl-soft-labels-section">
              <span className="dl-label-section-title">SOFT LABEL</span>
              <div className="dl-soft-input-row">
                <input
                  type="text"
                  className="dl-soft-input"
                  placeholder="e.g. grammar error"
                  value={softInput}
                  onChange={(e) => setSoftInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSoftLabel()}
                />
                <button className="dl-soft-add-btn" onClick={addSoftLabel}>
                  <Plus size={14} />
                  Add
                </button>
              </div>
              {currentSoft.length > 0 && (
                <div className="dl-soft-tags">
                  {currentSoft.map((label, idx) => (
                    <span key={idx} className="dl-soft-tag">
                      {label}
                      <button onClick={() => removeSoftLabel(idx)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sample Navigation */}
          <div className="dl-sample-nav">
            <span className="dl-sample-nav-title">Sample Navigation</span>
            <div className="dl-sample-nav-info">{currentConv + 1} / {totalConvs}</div>
            <div className="dl-sample-nav-btns">
              <button
                className="dl-nav-btn"
                disabled={currentConv <= 0}
                onClick={() => setCurrentConv(currentConv - 1)}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                className="dl-nav-btn primary"
                disabled={currentConv >= CONVERSATIONS.length - 1}
                onClick={() => setCurrentConv(currentConv + 1)}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Submit bar */}
      <div className="dl-submit-bar flex gap-2 justify-end bg-white p-4 border-t border-gray-200">
        <button
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
          disabled={isSubmitDisabled}
          onClick={() => {
            setSubmitStatus('submitted');
            if (currentConv < CONVERSATIONS.length - 1) setCurrentConv(currentConv + 1);
          }}
        >
          <CheckCircle size={16} />
          Hoàn thành (Submit)
        </button>
        <button
          className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 flex items-center justify-center gap-2"
          onClick={() => setIsRejectModalOpen(true)}
        >
          <X size={16} />
          Loại bỏ (Reject)
        </button>
      </div>

      {/* Footer */}
      <div className="dl-footer">
        Substep — Labeling
      </div>

      {/* User Guide Modal */}
      {showGuide && (
        <div className="dl-guide-overlay" onClick={() => setShowGuide(false)}>
          <div className="dl-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dl-guide-header">
              <h3><BookOpen size={18} /> User Guide — Labeling</h3>
              <button className="dl-guide-close" onClick={() => setShowGuide(false)}>×</button>
            </div>
            <div className="dl-guide-body">
              <div className="dl-guide-section">
                <h4>Hard Labels</h4>
                <p>Click on a label chip to assign it to the current conversation. Click again to remove.</p>
                <ul>
                  <li><strong>REJ</strong> — Rejected / low quality conversation</li>
                  <li><strong>MATH</strong> — Mathematics related content</li>
                  <li><strong>PHYS</strong> — Physics related content</li>
                  <li><strong>CHEM</strong> — Chemistry related content</li>
                  <li><strong>LIT</strong> — Literature related content</li>
                  <li><strong>BIO</strong> — Biology related content</li>
                  <li><strong>OOS</strong> — Out of scope content</li>
                </ul>
              </div>
              <div className="dl-guide-section">
                <h4>Soft Labels</h4>
                <p>Type a custom label and press Enter or click "+ Add" to add it.</p>
              </div>
              <div className="dl-guide-section">
                <h4>Message Actions</h4>
                <p>Each message can have an action tag indicating its role in the conversation flow:</p>
                <ul>
                  <li><strong>OK</strong> — Message is correct and appropriate</li>
                  <li><strong>LOG</strong> — Logged for review</li>
                  <li><strong>NEXT</strong> — Proceed to next topic</li>
                  <li><strong>WAIT</strong> — Waiting for student response</li>
                  <li><strong>SKIP</strong> — Skip this message</li>
                  <li><strong>MOT</strong> — Motivational response</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Loại bỏ Hội thoại</h3>
            <p className="text-sm text-slate-600 mb-4">Vui lòng nhập lý do loại bỏ (dữ liệu mã hóa lỗi, không liên quan, v.v.):</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-red-200 min-h-[100px]"
              placeholder="Nhập lý do..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={handleRejectSubmit}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Xác nhận Loại bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataLabelingView;
