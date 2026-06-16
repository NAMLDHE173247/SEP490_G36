import re

with open('frontend_v2/src/pages/ChatView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove ParamsDropdown completely from the file as it will be replaced by a Global settings bar
content = re.sub(r'function ParamsDropdown.*?return \(\n.*?</div>\n  \);\n}\n', '', content, flags=re.DOTALL)
content = re.sub(r'// Inference Params Popover', '', content)

# 1. Update imports
import_addition = "import { BatchTestingModal } from '../components/BatchTestingModal';\n"
if "import { BatchTestingModal" not in content:
    content = content.replace("import '../styles/chat.css';", "import '../styles/chat.css';\n" + import_addition)

# 2. Modify ChatView to include Global Settings and Batch Testing state
chatview_repl = """function ChatView() {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [compareCount, setCompareCount] = useState(2); // 2 or 3
  const [rightSidebar, setRightSidebar] = useState<'logs' | null>(null);
  
  const settingsRef = useRef<HTMLDivElement>(null);

  // Global Inference Params
  const [globalParams, setGlobalParams] = useState<InferenceParams>(DEFAULT_PARAMS);
  const [showBatchTesting, setShowBatchTesting] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
"""
content = re.sub(r"function ChatView\(\) \{\n.*?const settingsRef = useRef<HTMLDivElement>\(null\);", chatview_repl, content, flags=re.DOTALL)

# 3. Add Global Settings UI and Batch Testing UI at the top of ChatView render
global_settings_ui = """        <div className="chat-view-header">
          <div className="header-left">
            <h1 className="page-title">AI Chatbot <Sparkles size={16} color="var(--primary)" /></h1>
            <span className="badge-beta">Beta</span>
          </div>
          <div className="header-actions">
            <button className="secondary-btn" onClick={() => setShowGlobalSettings(!showGlobalSettings)}>
              <Settings2 size={16} /> Global Parameters
            </button>
            <button className="primary-btn" onClick={() => setShowBatchTesting(true)}>
              <FileText size={16} /> Batch Testing
            </button>
          </div>
        </div>

        {showGlobalSettings && (
          <div className="global-settings-panel" style={{ padding: '16px', backgroundColor: 'var(--bg-elevated)', borderRadius: '12px', marginBottom: '16px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>Cấu hình Global System Prompt & Parameters</h3>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>SYSTEM PROMPT</label>
                <textarea 
                  value={globalParams.systemPrompt}
                  onChange={e => setGlobalParams({...globalParams, systemPrompt: e.target.value})}
                  placeholder="Nhập Global System Prompt áp dụng cho tất cả models..."
                  style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>MAX TOKENS</label>
                  <input type="number" value={globalParams.maxNewTokens} onChange={e => setGlobalParams({...globalParams, maxNewTokens: Number(e.target.value) || ""})} style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>TEMPERATURE</label>
                  <input type="number" step="0.1" value={globalParams.temperature} onChange={e => setGlobalParams({...globalParams, temperature: Number(e.target.value) || ""})} style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {showBatchTesting && (
          <BatchTestingModal 
            onClose={() => setShowBatchTesting(false)}
            activeModelId=""
            provider="local"
            params={globalParams}
            instanceId={1}
          />
        )}
"""
content = re.sub(r'        <div className="chat-view-header">.*?<span className="badge-beta">Beta</span>\n          </div>\n        </div>', global_settings_ui, content, flags=re.DOTALL)

# 4. Modify ChatPanel to not use showInferencePopup and use globalParams properly
# Actually ChatPanel already accepts externalParams={params}.
# So we just need to pass globalParams from ChatView to ChatPanel
content = re.sub(r'externalParams=\{params\}', 'externalParams={globalParams}', content)

# 5. Remove the Inference params button inside ChatPanel to avoid confusion
content = re.sub(r'                <button\n                  onClick=\{\(\) => setShowInferencePopup\(\(p\) => !p\)\}.*?</button>\n\n                \{showInferencePopup && \(.*?\)\}', '', content, flags=re.DOTALL)

with open('frontend_v2/src/pages/ChatView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
