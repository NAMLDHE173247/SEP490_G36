import re

with open('frontend_v2/src/pages/ChatView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
import_addition = "import { BatchTestingModal } from '../components/BatchTestingModal';\n"
if "BatchTestingModal" not in content:
    content = content.replace("import '../styles/chat.css';", "import '../styles/chat.css';\n" + import_addition)

# 2. Add showBatchTesting and showGlobalSettings to ChatView
state_find = "  const [params, setParams] = useState<InferenceParams>(DEFAULT_PARAMS);"
state_repl = "  const [params, setParams] = useState<InferenceParams>(DEFAULT_PARAMS);\n  const [showBatchTesting, setShowBatchTesting] = useState(false);\n  const [showGlobalSettings, setShowGlobalSettings] = useState(false);"
if "showBatchTesting" not in content:
    content = content.replace(state_find, state_repl)

# 3. Modify ChatView header to add the new buttons and panels
header_find = """          <div className="chat-header-right">
            <button
              className={icon-btn }
              onClick={() => toggleRightSidebar('logs')}
              title="Inference Logs"
            >
              <TerminalSquare size={20} />
            </button>
          </div>
        </div>"""

header_repl = """          <div className="chat-header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="primary-btn"
              style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', background: 'var(--primary)' }}
              onClick={() => setShowBatchTesting(true)}
            >
              <FileText size={16} /> Batch Testing
            </button>
            <button
              className={icon-btn }
              style={{ backgroundColor: showGlobalSettings ? 'var(--primary-light)' : 'transparent', color: showGlobalSettings ? 'var(--primary)' : 'var(--text-muted)' }}
              onClick={() => setShowGlobalSettings(!showGlobalSettings)}
              title="Global Parameters"
            >
              <Settings2 size={20} />
            </button>
            <button
              className={icon-btn }
              onClick={() => toggleRightSidebar('logs')}
              title="Inference Logs"
            >
              <TerminalSquare size={20} />
            </button>
          </div>
        </div>

        {showGlobalSettings && (
          <div className="global-settings-panel" style={{ padding: '16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '24px', alignItems: 'flex-start', transition: 'all 0.3s ease' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>GLOBAL SYSTEM PROMPT</label>
              <textarea 
                value={params.systemPrompt}
                onChange={e => setParams({...params, systemPrompt: e.target.value})}
                placeholder="Nhập Global System Prompt áp dụng cho tất cả models..."
                style={{ width: '100%', minHeight: '60px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: 'var(--bg-elevated)', transition: 'all 0.2s' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="inference-field">
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>MAX TOKENS</label>
                <input type="number" value={params.maxNewTokens} onChange={e => setParams({...params, maxNewTokens: Number(e.target.value) || ""})} style={{ width: '80px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
              <div className="inference-field">
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>TEMPERATURE</label>
                <input type="number" step="0.1" value={params.temperature} onChange={e => setParams({...params, temperature: Number(e.target.value) || ""})} style={{ width: '80px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
            </div>
          </div>
        )}

        {showBatchTesting && (
          <BatchTestingModal 
            onClose={() => setShowBatchTesting(false)}
            activeModelId=""
            provider="local"
            params={params}
            instanceId={1}
          />
        )}"""

content = content.replace(header_find, header_repl)

# 4. Remove ParamsSummaryBar and ParamsDropdown from ChatPanel
# In ChatPanel, we have two instances to remove. 
p1_find = """            <ParamsSummaryBar params={params} />

            <div className="message-input-wrapper" ref={settingsRef}>
              <button
                className={options-toggle-btn }
                onClick={() => setShowInferencePopup(!showInferencePopup)}
                style={{ zIndex: 10 }}
              >
                <Settings2 size={20} />
              </button>

              {showInferencePopup && (
                <ParamsDropdown
                  params={params}
                  onChange={setParams}
                  onClose={() => setShowInferencePopup(false)}
                />
              )}"""

p1_repl = """            <div className="message-input-wrapper">"""

p2_find = """            <div style={{ width: '65%' }}>
              <ParamsSummaryBar params={params} />
            </div>

            <div className="message-input-wrapper" style={{ width: '65%', position: 'relative' }} ref={settingsRef}>
              <button
                className={options-toggle-btn }
                onClick={() => setShowInferencePopup(!showInferencePopup)}
                style={{ zIndex: 10 }}
              >
                <Settings2 size={20} />
              </button>

              {showInferencePopup && (
                <ParamsDropdown
                  params={params}
                  onChange={setParams}
                  onClose={() => setShowInferencePopup(false)}
                />
              )}"""

p2_repl = """            <div className="message-input-wrapper" style={{ width: '65%', position: 'relative' }}>"""

content = content.replace(p1_find, p1_repl)
content = content.replace(p2_find, p2_repl)

with open('frontend_v2/src/pages/ChatView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

