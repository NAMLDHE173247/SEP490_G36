import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  MessageSquare, 
  GitCompare, 
  ChevronDown, 
  Settings, 
  TerminalSquare, 
  Send, 
  Upload, 
  X, 
  Sparkles,
  Terminal
} from 'lucide-react';
import '../styles/chat.css';

function ChatView() {
  const [mode, setMode] = useState('single'); // 'single' or 'compare'
  const [compareCount, setCompareCount] = useState(2); // 2 or 3
  const [rightSidebar, setRightSidebar] = useState(null); // 'logs', or null
  
  const [selectedModels, setSelectedModels] = useState(['Llama 2 7B Chat (Fine-tuned)', 'GPT-4 Turbo', 'Gemini 1.5 Pro']);
  const [openDropdownIndex, setOpenDropdownIndex] = useState(null);
  
  const [showInferencePopup, setShowInferencePopup] = useState(false);
  const [inferenceParams, setInferenceParams] = useState<any>({
    maxTokens: 512,
    temperature: 0.7,
    topK: 50,
    topP: 0.95,
    repPenalty: 1.1
  });

  const modelGroups = [
    {
      label: "Base Models",
      options: ["Llama 2 7B", "Mistral 7B", "Phi-2"]
    },
    {
      label: "Trained Models",
      options: ["Llama 2 7B Chat (Fine-tuned)", "Mistral 7B Custom", "Model v2 8B"]
    },
    {
      label: "Third-party API",
      options: ["GPT-4 Turbo", "GPT-4", "GPT-3.5 Turbo", "Claude 3 Opus", "Claude 3 Sonnet", "Claude 3 Haiku", "Gemini Pro", "Gemini Ultra", "Gemini 1.5 Pro"]
    }
  ];

  const allOptions = modelGroups.flatMap(g => g.options);
  const [singleModel, setSingleModel] = useState(allOptions[0] || '');

  const sessions = [
    { id: 1, title: 'GPT-4 Code Review', messages: 12, time: '2h ago' },
    { id: 2, title: 'Data Analysis Discussion', messages: 8, time: '2h ago' },
    { id: 3, title: 'Model Architecture Planning', messages: 24, time: '2h ago', active: true }
  ];

  const toggleRightSidebar = (panel) => {
    if (rightSidebar === panel) {
      setRightSidebar(null);
    } else {
      setRightSidebar(panel);
    }
  };

  return (
    <div className="chat-container">
      {/* 1. Sessions Sidebar */}
      <div className="chat-sessions-sidebar">
        <div className="chat-sessions-sidebar-header">
          <button className="new-session-btn">
            <Plus size={18} /> New Session
          </button>
          <div className="search-input-container">
            <Search size={16} />
            <input type="text" className="search-input" placeholder="Search sessions..." />
          </div>
        </div>
        <div className="sessions-list">
          {sessions.map(session => (
            <div key={session.id} className={`session-item ${session.active ? 'active' : ''}`}>
              <div className="session-title">{session.title}</div>
              <div className="session-meta">{session.messages} messages • {session.time}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Main Chat Area */}
      <div className="chat-main-area">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="mode-toggle">
              <button 
                className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
                onClick={() => setMode('single')}
              >
                <MessageSquare size={16} /> Single Chat
              </button>
              <button 
                className={`mode-btn ${mode === 'compare' ? 'active' : ''}`}
                onClick={() => setMode('compare')}
              >
                <GitCompare size={16} /> Compare Models
              </button>
            </div>
            
            {mode === 'compare' && (
              <select 
                className="models-dropdown"
                value={compareCount}
                onChange={(e) => setCompareCount(Number(e.target.value))}
              >
                <option value={2}>2 Models</option>
                <option value={3}>3 Models</option>
              </select>
            )}
          </div>
          <div className="chat-header-right">
            {/* Removed Settings button from top header as it's now a popover */}
            <button 
              className={`icon-btn ${rightSidebar === 'logs' ? 'active' : ''}`}
              onClick={() => toggleRightSidebar('logs')}
              title="Inference Logs"
            >
              <TerminalSquare size={20} />
            </button>
          </div>
        </div>

        {/* Chat Columns */}
        <div className="chat-columns-container">
          {mode === 'single' ? (
            // SINGLE CHAT VIEW
            <div className="chat-column" style={{ flex: 1, padding: '0 10%', borderRight: 'none' }}>
              <div className="column-header" style={{ borderBottom: 'none', padding: '24px 0 0', display: 'flex', gap: '12px' }}>
                <select style={{ width: '150px' }}>
                  <option>Manual ID</option>
                </select>
                <select
                  className="model-select"
                  value={singleModel}
                  onChange={(e) => setSingleModel(e.target.value)}
                  style={{ width: '260px' }}
                >
                  <option value="">Model ID (tùy chọn, VD: openai/gpt 4o)</option>
                  {allOptions.map((opt, idx) => (
                    <option key={idx} value={opt}>{opt}</option>
                  ))}
                </select>
                <button className="api-btn">Sử dụng API</button>
              </div>
              
              <div className="chat-messages">
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Sparkles size={24} color="#64748b" />
                  </div>
                  <p>Sử dụng API để bắt đầu hội thoại</p>
                </div>
              </div>
              
              <div className="column-footer" style={{ borderTop: 'none', padding: '0 0 32px 0', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span className="param-tag">Tokens {inferenceParams.maxTokens}</span>
                  <span className="param-tag">Temp {inferenceParams.temperature}</span>
                  <span className="param-tag">Top-K {inferenceParams.topK}</span>
                  <span className="param-tag">Top-P {inferenceParams.topP}</span>
                  <span className="param-tag">Rep {inferenceParams.repPenalty}</span>
                </div>
                
                {showInferencePopup && (
                  <div className="inference-popover">
                    <div className="inference-popover-header">
                      <span className="inference-popover-title">THAM SỐ INFERENCE</span>
                      <button className="close-btn" onClick={() => setShowInferencePopup(false)}><X size={16} /></button>
                    </div>
                    <div className="inference-popover-grid">
                      <div className="inference-field">
                        <label>MAX TOKENS</label>
                        <input type="number" value={inferenceParams.maxTokens} onChange={e => setInferenceParams({...inferenceParams, maxTokens: e.target.value})} />
                      </div>
                      <div className="inference-field">
                        <label>TEMPERATURE</label>
                        <input type="number" step="0.1" value={inferenceParams.temperature} onChange={e => setInferenceParams({...inferenceParams, temperature: e.target.value})} />
                      </div>
                      <div className="inference-field">
                        <label>TOP K</label>
                        <input type="number" value={inferenceParams.topK} onChange={e => setInferenceParams({...inferenceParams, topK: e.target.value})} />
                      </div>
                      <div className="inference-field">
                        <label>TOP P</label>
                        <input type="number" step="0.05" value={inferenceParams.topP} onChange={e => setInferenceParams({...inferenceParams, topP: e.target.value})} />
                      </div>
                      <div className="inference-field">
                        <label>REP. PENALTY</label>
                        <input type="number" step="0.1" value={inferenceParams.repPenalty} onChange={e => setInferenceParams({...inferenceParams, repPenalty: e.target.value})} />
                      </div>
                    </div>
                    <div className="inference-field" style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label>SYSTEM PROMPT</label>
                        <button className="small-text-btn"><Upload size={12} style={{marginRight: '4px'}}/> Tải từ lưu trữ</button>
                      </div>
                      <textarea placeholder="Nhập hướng dẫn cho AI hoặc tải từ lưu trữ..." style={{ minHeight: '60px' }}></textarea>
                    </div>
                  </div>
                )}
                
                <div className="message-input-wrapper">
                  <button className="options-toggle-btn" onClick={() => setShowInferencePopup(!showInferencePopup)}>
                    <Plus size={20} />
                  </button>
                  <textarea placeholder="Sử dụng API để bắt đầu..." style={{ minHeight: '60px', padding: '16px 60px 16px 56px', fontSize: '15px', borderRadius: '12px' }}></textarea>
                  <button className="send-btn" style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px' }}>
                    <Send size={18} />
                  </button>
                </div>
                <div className="global-hint" style={{ marginTop: '12px' }}>Sử dụng API để bắt đầu hội thoại</div>
              </div>
            </div>
          ) : (
            // COMPARE MODELS VIEW
            Array.from({ length: compareCount }).map((_, index) => (
              <div className="chat-column" key={index}>
                <div className="column-header">
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: index === 0 ? 'var(--primary)' : index === 1 ? '#0ea5e9' : '#10b981', alignSelf: 'center' }}></div>
                  <div className="custom-dropdown-container">
                    <div 
                      className="custom-dropdown-trigger" 
                      style={{ 
                        borderColor: openDropdownIndex === index ? (index === 0 ? 'var(--primary)' : index === 1 ? '#0ea5e9' : '#10b981') : 'var(--border)',
                        borderBottomLeftRadius: openDropdownIndex === index ? 0 : '6px',
                        borderBottomRightRadius: openDropdownIndex === index ? 0 : '6px',
                      }}
                      onClick={() => setOpenDropdownIndex(openDropdownIndex === index ? null : index)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {selectedModels[index]}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: index === 0 ? 'var(--primary)' : index === 1 ? '#0ea5e9' : '#10b981' }}></div>
                        <ChevronDown size={14} color="var(--text-muted)" />
                      </div>
                    </div>
                    
                    {openDropdownIndex === index && (
                      <div 
                        className="custom-dropdown-list"
                        style={{
                          border: '1px solid',
                          borderTop: 'none',
                          borderColor: index === 0 ? 'var(--primary)' : index === 1 ? '#0ea5e9' : '#10b981'
                        }}
                      >
                        {modelGroups.map((group, gIdx) => (
                          <div key={gIdx}>
                            <div className="dropdown-group-label">{group.label}</div>
                            {group.options.map((option, oIdx) => (
                              <div 
                                key={oIdx} 
                                className={`dropdown-item ${selectedModels[index] === option ? 'selected' : ''}`}
                                onClick={() => {
                                  const newModels = [...selectedModels];
                                  newModels[index] = option;
                                  setSelectedModels(newModels);
                                  setOpenDropdownIndex(null);
                                }}
                              >
                                {option}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="chat-messages">
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <Sparkles size={24} color={index === 0 ? 'var(--primary)' : index === 1 ? '#0ea5e9' : '#10b981'} />
                    </div>
                    <p>Bắt đầu chat để so sánh models</p>
                  </div>
                </div>
                
                <div className="column-footer" style={{ padding: '16px' }}>
                  <div className="message-input-wrapper">
                    <textarea placeholder="Message..." style={{ minHeight: '44px', padding: '12px 48px 12px 16px', borderRadius: '12px', fontSize: '14px' }}></textarea>
                    <button className="send-btn" style={{ width: '32px', height: '32px', right: '8px', bottom: '8px', borderRadius: '8px', background: index === 0 ? 'var(--primary-gradient)' : index === 1 ? '#38bdf8' : '#34d399' }}>
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Global Bottom Bar for Compare Mode */}
        {mode === 'compare' && (
          <div className="global-bottom-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '65%', display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span className="param-tag">Tokens {inferenceParams.maxTokens}</span>
              <span className="param-tag">Temp {inferenceParams.temperature}</span>
              <span className="param-tag">Top-K {inferenceParams.topK}</span>
              <span className="param-tag">Top-P {inferenceParams.topP}</span>
              <span className="param-tag">Rep {inferenceParams.repPenalty}</span>
            </div>
            <div className="message-input-wrapper" style={{ width: '65%', position: 'relative' }}>
              {showInferencePopup && (
                <div className="inference-popover">
                  <div className="inference-popover-header">
                    <span className="inference-popover-title">THAM SỐ INFERENCE</span>
                    <button className="close-btn" onClick={() => setShowInferencePopup(false)}><X size={16} /></button>
                  </div>
                  <div className="inference-popover-grid">
                    <div className="inference-field">
                      <label>MAX TOKENS</label>
                      <input type="number" value={inferenceParams.maxTokens} onChange={e => setInferenceParams({...inferenceParams, maxTokens: e.target.value})} />
                    </div>
                    <div className="inference-field">
                      <label>TEMPERATURE</label>
                      <input type="number" step="0.1" value={inferenceParams.temperature} onChange={e => setInferenceParams({...inferenceParams, temperature: e.target.value})} />
                    </div>
                    <div className="inference-field">
                      <label>TOP K</label>
                      <input type="number" value={inferenceParams.topK} onChange={e => setInferenceParams({...inferenceParams, topK: e.target.value})} />
                    </div>
                    <div className="inference-field">
                      <label>TOP P</label>
                      <input type="number" step="0.05" value={inferenceParams.topP} onChange={e => setInferenceParams({...inferenceParams, topP: e.target.value})} />
                    </div>
                    <div className="inference-field">
                      <label>REP. PENALTY</label>
                      <input type="number" step="0.1" value={inferenceParams.repPenalty} onChange={e => setInferenceParams({...inferenceParams, repPenalty: e.target.value})} />
                    </div>
                  </div>
                  <div className="inference-field" style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>SYSTEM PROMPT</label>
                      <button className="small-text-btn"><Upload size={12} style={{marginRight: '4px'}}/> Tải từ lưu trữ</button>
                    </div>
                    <textarea placeholder="Nhập hướng dẫn cho AI hoặc tải từ lưu trữ..." style={{ minHeight: '60px' }}></textarea>
                  </div>
                </div>
              )}
              <button className="options-toggle-btn" onClick={() => setShowInferencePopup(!showInferencePopup)}>
                <Plus size={20} />
              </button>
              <textarea placeholder="Nhập tin nhắn để so sánh models..." style={{ minHeight: '60px', padding: '16px 60px 16px 56px', fontSize: '15px', borderRadius: '12px' }}></textarea>
              <button className="send-btn" style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px' }}>
                <Send size={18} />
              </button>
            </div>
            <div className="global-hint" style={{ marginTop: '12px' }}>
              So sánh {compareCount} models • Nhấn Enter để gửi, Shift+Enter để xuống dòng
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Sidebars */}

      {rightSidebar === 'logs' && (
        <div className="right-sidebar">
          <div className="right-sidebar-header">
            <span className="right-sidebar-title" style={{ textTransform: 'uppercase' }}>Inference Logs</span>
            <button className="close-btn" onClick={() => setRightSidebar(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="right-sidebar-content">
            <div className="logs-empty">
              <Terminal size={48} color="#cbd5e1" strokeWidth={1} />
              <p>Chưa có Log</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatView;
