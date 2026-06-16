import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  MessageSquare,
  GitCompare,
  ChevronDown,
  TerminalSquare,
  Send,
  Upload,
  X,
  Sparkles,
  Terminal,
  RotateCcw,
  Square,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  Settings2,
  Pencil,
  Check
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { apiService } from '../services/api';
import '../styles/chat.css';

// Constants
const BASE_MODEL_OPTIONS = [
  "Qwen/Qwen3-0.6B",
  "meta-llama/Llama-3.1-8B-Instruct",
  "unsloth/gpt-oss-20b",
  "unsloth/gpt-oss-20b-unsloth-bnb-4bit",
  "zai-org/GLM-4.7-Flash",
  "unsloth/GLM-4.7-Flash-GGUF",
  "stepfun-ai/Step-3.5-Flash",
  "unsloth/Qwen3-Coder-Next-GGUF",
  "lightonai/LightOnOCR-2-1B",
  "unsloth/gpt-oss-20b-GGUF",
  "Qwen/Qwen3-Coder-Next",
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4",
  "zai-org/GLM-4.7",
  "MiniMaxAI/MiniMax-M2.1",
  "sshleifer/tiny-gpt2",
];

interface Message {
  role: "user" | "ai";
  content: string;
  responseTime?: number;
  model?: string;
  parameters?: any;
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

interface LogEntry {
  ts: number;
  instanceId?: number;
  message: string;
  type: "info" | "success" | "error" | "warning";
  data?: any;
}

interface InferenceParams {
  systemPrompt: string;
  maxNewTokens: number | "";
  temperature: number | "";
  topK: number | "";
  topP: number | "";
  repetitionPenalty: number | "";
}

const DEFAULT_PARAMS: InferenceParams = {
  systemPrompt: "",
  maxNewTokens: 512,
  temperature: 0.7,
  topK: 50,
  topP: 0.95,
  repetitionPenalty: 1.1,
};

interface SavedPrompt {
  _id: string;
  name: string;
  version: number;
  content: string;
  description?: string;
}

// Markdown Renderer
const MarkdownRenderer = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkMath, remarkGfm]}
    rehypePlugins={[rehypeKatex]}
    components={{
      strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--text-main)' }}>{children}</strong>,
      em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>{children}</em>,
      code: ({ inline, children, ...props }: any) =>
        inline ? (
          <code style={{ backgroundColor: '#f1f5f9', color: '#f43f5e', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}>
            {children}
          </code>
        ) : (
          <pre style={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: '8px', padding: '16px', overflowX: 'auto', margin: '12px 0', fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.6 }}>
            <code {...props}>{children}</code>
          </pre>
        ),
      h1: ({ children }) => <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', marginTop: '16px', marginBottom: '8px' }}>{children}</h1>,
      h2: ({ children }) => <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', marginTop: '12px', marginBottom: '6px' }}>{children}</h2>,
      h3: ({ children }) => <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginTop: '8px', marginBottom: '4px' }}>{children}</h3>,
      ul: ({ children }) => <ul style={{ listStyleType: 'disc', listStylePosition: 'inside', margin: '8px 0', paddingLeft: '4px' }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ listStyleType: 'decimal', listStylePosition: 'inside', margin: '8px 0', paddingLeft: '4px' }}>{children}</ol>,
      li: ({ children }) => <li style={{ lineHeight: 1.6, marginBottom: '4px' }}>{children}</li>,
      blockquote: ({ children }) => (
        <blockquote style={{ borderLeft: '4px solid #cbd5e1', paddingLeft: '16px', fontStyle: 'italic', color: '#64748b', margin: '12px 0' }}>{children}</blockquote>
      ),
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13.5px' }}>{children}</table>
        </div>
      ),
      th: ({ children }) => <th style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>{children}</th>,
      td: ({ children }) => <td style={{ border: '1px solid #e2e8f0', padding: '6px 10px', color: '#475569' }}>{children}</td>,
      p: ({ children }) => <p style={{ lineHeight: 1.6, marginBottom: '8px' }}>{children}</p>,
      hr: () => <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />,
    }}
  >
    {content}
  </ReactMarkdown>
);

// Params Summary Bar
function ParamsSummaryBar({ params }: { params: InferenceParams }) {
  const chips = [
    { label: "Tokens", value: params.maxNewTokens },
    { label: "Temp", value: params.temperature },
    { label: "Top-K", value: params.topK },
    { label: "Top-P", value: params.topP },
    { label: "Rep", value: params.repetitionPenalty },
  ];
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
      {chips.map(({ label, value }) => (
        <span key={label} className="param-tag">
          {label} {value === "" ? "â€“" : String(value)}
        </span>
      ))}
      {params.systemPrompt && (
        <span
          className="param-tag"
          style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={params.systemPrompt}
        >
          Sys: {params.systemPrompt}
        </span>
      )}
    </div>
  );
}

// Inference Params Popover
function ParamsDropdown({
  params,
  onChange,
  onClose,
}: {
  params: InferenceParams;
  onChange: (p: InferenceParams) => void;
  onClose: () => void;
}) {
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  const fetchSavedPrompts = async () => {
    if (savedPrompts.length > 0) { setShowPromptPicker(true); return; }
    setLoadingPrompts(true);
    try {
      const data = await apiService.getDatasetPrompts();
      setSavedPrompts(data.prompts || []);
      setShowPromptPicker(true);
    } catch {
      toast.error("KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch system prompt");
    } finally {
      setLoadingPrompts(false);
    }
  };

  const fields: {
    key: keyof InferenceParams;
    label: string;
    placeholder: string;
    step?: number;
  }[] = [
      { key: "maxNewTokens", label: "MAX TOKENS", placeholder: "512" },
      { key: "temperature", label: "TEMPERATURE", placeholder: "0.7", step: 0.1 },
      { key: "topK", label: "TOP K", placeholder: "50" },
      { key: "topP", label: "TOP P", placeholder: "0.95", step: 0.05 },
      { key: "repetitionPenalty", label: "REP. PENALTY", placeholder: "1.1", step: 0.1 },
    ];

  const set = (key: keyof InferenceParams, raw: string) => {
    const val = raw === "" ? "" : Number(raw);
    onChange({ ...params, [key]: val });
  };

  return (
    <div className="inference-popover">
      <div className="inference-popover-header">
        <span className="inference-popover-title">THAM Sá» INFERENCE</span>
        <button className="close-btn" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="inference-popover-grid">
        {fields.map(({ key, label, placeholder, step }) => (
          <div key={key} className="inference-field">
            <label>{label}</label>
            <input
              type="number"
              step={step}
              placeholder={placeholder}
              value={params[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="inference-field" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>SYSTEM PROMPT</label>
          <button
            onClick={fetchSavedPrompts}
            disabled={loadingPrompts}
            className="small-text-btn"
          >
            {loadingPrompts ? (
              <Loader2 size={11} className="animate-spin" style={{ marginRight: '4px' }} />
            ) : (
              <BookOpen size={11} style={{ marginRight: '4px' }} />
            )}
            Táº£i tá»« lÆ°u trá»¯
          </button>
        </div>

        {showPromptPicker && (
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>Chá»n Prompt</span>
              <button onClick={() => setShowPromptPicker(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={12} /></button>
            </div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {savedPrompts.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 10px' }}>ChÆ°a cÃ³ prompt lÆ°u trá»¯</div>
              ) : (
                savedPrompts.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => {
                      onChange({ ...params, systemPrompt: p.content });
                      setShowPromptPicker(false);
                    }}
                    style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '12px' }}
                    className="dropdown-item-hover"
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.name} <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>v{p.version}</span></div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <textarea
          placeholder="Nháº­p hÆ°á»›ng dáº«n cho AI hoáº·c táº£i tá»« lÆ°u trá»¯..."
          value={params.systemPrompt}
          onChange={(e) => onChange({ ...params, systemPrompt: e.target.value })}
          style={{ minHeight: '60px', fontSize: '13px' }}
        />
        {params.systemPrompt && (
          <button
            onClick={() => onChange({ ...params, systemPrompt: "" })}
            style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer' }}
          >
            XoÃ¡ system prompt
          </button>
        )}
      </div>
    </div>
  );
}

// Logs Side Panel
function LogsSidePanel({
  logs,
  onClear,
  collapsed,
  onToggleCollapse,
}: {
  logs: LogEntry[];
  onClear: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, collapsed]);

  const typeColorClass = (t: LogEntry["type"]) =>
    t === "error" ? "error" :
      t === "success" ? "success" :
        t === "warning" ? "warning" : "info";

  if (collapsed) {
    return (
      <div
        style={{ width: '32px', backgroundColor: '#0f172a', borderLeft: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', py: '12px', gap: '12px', flexShrink: 0, cursor: 'pointer', height: '100%' }}
        onClick={onToggleCollapse}
        title="Má»Ÿ Logs"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', marginTop: '12px' }}
        >
          <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
        </button>
        {logs.length > 0 && (
          <span style={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b', transform: 'rotate(90deg)', whiteSpace: 'nowrap', margin: '12px 0' }}>
            {logs.length}
          </span>
        )}
        {logs.length > 0 && (
          <div className={`log-item-dot ${typeColorClass(logs[logs.length - 1].type)}`} style={{ margin: '4px 0' }} />
        )}
      </div>
    );
  }

  return (
    <div className="right-sidebar" style={{ width: '280px', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%' }}>
      <div className="logs-header">
        <div className="logs-header-title">
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'pulse 2s infinite' }} />
          Inference Logs {logs.length > 0 && <span style={{ color: '#475569', fontSize: '10px' }}>({logs.length})</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {logs.length > 0 && (
            <button onClick={onClear} className="logs-clear-btn">XoÃ¡</button>
          )}
          <button onClick={onToggleCollapse} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="right-sidebar-content" style={{ backgroundColor: '#0f172a', padding: 0, overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div className="logs-empty">
            <Terminal size={40} color="#334155" strokeWidth={1} />
            <p style={{ fontSize: '12px', color: '#475569' }}>ChÆ°a cÃ³ log</p>
          </div>
        ) : (
          <div className="logs-list">
            {logs.map((L, i) => (
              <div key={i} className="log-item">
                <div className="log-item-meta">
                  <span className="log-item-time">
                    {new Date(L.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  {L.instanceId !== undefined && (
                    <span className="log-item-badge">
                      M{L.instanceId}
                    </span>
                  )}
                  <div className={`log-item-dot ${typeColorClass(L.type)}`} />
                </div>
                <p className={`log-item-message ${typeColorClass(L.type)}`}>
                  {L.message}
                </p>
                {L.data && (
                  <pre className="log-item-data">
                    {JSON.stringify(L.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}

// Chat Panel (single model panel)
interface ChatPanelProps {
  instanceId: number;
  showSidebar?: boolean;
  externalInput?: { text: string; ts: number } | null;
  isCompareMode?: boolean;
  onModelLoadedChange?: (loaded: boolean) => void;
  onIsInferringChange?: (inferring: boolean) => void;
  externalParams?: InferenceParams;
  onLog?: (log: Omit<LogEntry, "ts">) => void;
}

function ChatPanel({
  instanceId,
  showSidebar = false,
  externalInput,
  isCompareMode = false,
  onModelLoadedChange,
  onIsInferringChange,
  externalParams,
  onLog,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hfHubId, setHfHubId] = useState("");
  const [provider, setProvider] = useState<string>("local");
  const [registries, setRegistries] = useState<any[]>([]);
  const [selectedRegistryId, setSelectedRegistryId] = useState<string>("");
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [modelLoaded, setModelLoaded] = useState(false);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [localInput, setLocalInput] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const [showUnloadMenu, setShowUnloadMenu] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const unloadMenuRef = useRef<HTMLDivElement>(null);

  // Quick model picker dropdown
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const [localParams] = useState<InferenceParams>(DEFAULT_PARAMS);
  const params: InferenceParams = externalParams ?? localParams;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const buildRecentHistory = useCallback((sourceMessages: Message[]): HistoryMessage[] => {
    const normalized: HistoryMessage[] = sourceMessages
      .filter((m) => (m.role === "user" || m.role === "ai") && m.content.trim())
      .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

    const pairs: HistoryMessage[][] = [];
    for (let i = 0; i < normalized.length - 1; i++) {
      if (normalized[i].role === "user" && normalized[i + 1].role === "assistant") {
        pairs.push([normalized[i], normalized[i + 1]]);
        i++;
      }
    }
    return pairs.slice(-5).flat();
  }, []);

  useEffect(() => { onModelLoadedChange?.(modelLoaded); }, [modelLoaded, onModelLoadedChange]);
  useEffect(() => { onIsInferringChange?.(isInferring); }, [isInferring, onIsInferringChange]);

  const fetchChatSessions = async () => {
    try {
      const sessions = await apiService.getChatSessions();
      setChatSessions(sessions);
    } catch (error) {
      console.error("Failed to fetch chat sessions:", error);
    }
  };

  const fetchRegistries = async () => {
    try {
      const data = await apiService.listModelRegistries();
      setRegistries(data);
    } catch (error) {
      console.error("Failed to fetch registries:", error);
    }
  };

  useEffect(() => {
    if (showSidebar) fetchChatSessions();
    fetchRegistries();
  }, [showSidebar]);

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (showModelPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  // Close unload menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (unloadMenuRef.current && !unloadMenuRef.current.contains(e.target as Node)) {
        setShowUnloadMenu(false);
      }
    };
    if (showUnloadMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showUnloadMenu]);

  const handleRegistryChange = async (registryId: string) => {
    setSelectedRegistryId(registryId);
    if (!registryId) return;
    setLoading(true);
    try {
      const activeVersion = await apiService.getActiveRegistryModel(registryId);
      setHfHubId(activeVersion.hfRepoId);
      setLoadError(null);
      onLog?.({
        message: `ÄÃ£ tá»± Ä‘á»™ng chá»n báº£n Active: ${activeVersion.version} (${activeVersion.hfRepoId})`,
        type: "success",
        instanceId,
      });
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message;
      setLoadError(msg);
      onLog?.({ message: msg, type: "error", instanceId });
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  const handleLoadSession = async (sessionMeta: any) => {
    try {
      const fullSession = await apiService.getChatSessionById(sessionMeta._id);
      if (fullSession?.messages) {
        setMessages(
          fullSession.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
            model: m.model,
            responseTime: m.responseTime,
          }))
        );
        setCurrentSessionId(fullSession._id);
        const lastAi = fullSession.messages.slice().reverse().find((m: any) => m.role === "ai" && m.model);
        if (lastAi?.model && !hfHubId) setHfHubId(lastAi.model);
      }
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  };

  const handleNewChat = () => { setMessages([]); setCurrentSessionId(null); };

  const handleRenameSession = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast.error("TÃªn cuá»™c há»™i thoáº¡i khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
      return;
    }
    try {
      await apiService.updateChatSessionTitle(id, newTitle);
      toast.success("ÄÃ£ Ä‘á»•i tÃªn cuá»™c há»™i thoáº¡i");
      setEditingSessionId(null);
      fetchChatSessions();
    } catch (error: any) {
      console.error("Failed to rename session:", error);
      toast.error("KhÃ´ng thá»ƒ Ä‘á»•i tÃªn cuá»™c há»™i thoáº¡i");
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // NgÄƒn cháº·n viá»‡c load session vá»«a xÃ³a
    if (!window.confirm("Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a cuá»™c há»™i thoáº¡i nÃ y khÃ´ng?")) {
      return;
    }
    try {
      await apiService.deleteChatSession(id);
      toast.success("ÄÃ£ xÃ³a cuá»™c há»™i thoáº¡i");
      if (currentSessionId === id) {
        setMessages([]);
        setCurrentSessionId(null);
      }
      fetchChatSessions();
    } catch (error: any) {
      console.error("Failed to delete session:", error);
      toast.error("KhÃ´ng thá»ƒ xÃ³a cuá»™c há»™i thoáº¡i");
    }
  };

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const text = textOverride ?? "";
      const isLocal = provider === "local" || provider === "registry";
      if (!text.trim() || loading) return;
      if (isLocal && (!hfHubId.trim() || !modelLoaded)) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userMessage: Message = { role: "user", content: text };
      const history = buildRecentHistory(messages);
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setIsInferring(true);
      onLog?.({
        message: `Báº¯t Ä‘áº§u inference...`,
        type: "info",
        instanceId,
        data: {
          ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
          historyCount: history.length,
        },
      });

      const startTime = Date.now();
      let aiContent = "";
      setMessages((prev) => [...prev, { role: "ai", content: "", model: isLocal ? hfHubId : provider }]);

      try {
        const options = {
          instanceId,
          modelRegistryId: provider === "registry" ? selectedRegistryId : undefined,
          history,
          system_prompt: params.systemPrompt || undefined,
          max_new_tokens: params.maxNewTokens === "" ? undefined : params.maxNewTokens,
          temperature: params.temperature === "" ? undefined : params.temperature,
          top_k: params.topK === "" ? undefined : params.topK,
          top_p: params.topP === "" ? undefined : params.topP,
          repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
          provider: provider === "local" || provider === "registry" ? undefined : provider,
          signal: abortController.signal,
          onFinalInfo: (info: any) => {
            if (info.input_parameters) {
              setMessages((prev) => {
                const arr = [...prev];
                arr[arr.length - 1] = { ...arr[arr.length - 1], parameters: info.input_parameters };
                return arr;
              });
              onLog?.({ message: `Tham sá»‘ inference (Final Info)`, type: "info", instanceId, data: info.input_parameters });
            }
          },
        };

        await apiService.inferStream(text, hfHubId, options, (chunk: string) => {
          aiContent += chunk;
          setMessages((prev) => {
            const arr = [...prev];
            arr[arr.length - 1] = { ...arr[arr.length - 1], content: aiContent };
            return arr;
          });
        });

        const responseTime = (Date.now() - startTime) / 1000;
        setMessages((prev) => {
          const arr = [...prev];
          arr[arr.length - 1] = { ...arr[arr.length - 1], responseTime };
          return arr;
        });
        onLog?.({ message: `HoÃ n thÃ nh trong ${responseTime.toFixed(2)}s`, type: "success", instanceId });

        try {
          const gpuLogs = await apiService.getInferenceLogs(instanceId);
          if (Array.isArray(gpuLogs)) {
            const latest = gpuLogs.filter((l: any) => l.slot_id === instanceId).pop();
            if (latest?.input_parameters)
              onLog?.({ message: `Tham sá»‘ thá»±c táº¿ (GPU)`, type: "info", instanceId, data: latest.input_parameters });
          } else if (gpuLogs?.input_parameters) {
            onLog?.({ message: `Tham sá»‘ thá»±c táº¿ (GPU)`, type: "info", instanceId, data: gpuLogs.input_parameters });
          }
        } catch { /* ignore */ }

        try {
          const payload = { userMessage: text, aiMessage: aiContent, model: hfHubId, responseTime };
          if (currentSessionId) {
            await apiService.appendMessageToSession(currentSessionId, payload);
          } else {
            const newSession = await apiService.createChatSession(payload);
            setCurrentSessionId(newSession._id);
            fetchChatSessions();
          }
        } catch (err) { console.error("Failed to save session", err); }
      } catch (error: any) {
        if (!error.name?.includes("Abort") && !error.message?.includes("aborted")) {
          const errorMsg = error.response?.data?.error || error.message;
          setLoadError(errorMsg);
          toast.error(`Lá»—i model: ${errorMsg}`);
          setMessages((prev) => {
            const arr = [...prev];
            arr[arr.length - 1] = { ...arr[arr.length - 1], content: `[Lá»—i: ${errorMsg}]` };
            return arr;
          });
          onLog?.({ message: `Lá»—i inference: ${error.message}`, type: "error", instanceId });
        } else {
          onLog?.({ message: `Inference bá»‹ huá»·`, type: "warning", instanceId });
        }
      } finally {
        setLoading(false);
        setIsInferring(false);
        abortControllerRef.current = null;
      }
    },
    [loading, hfHubId, modelLoaded, instanceId, params, currentSessionId, provider, messages, selectedRegistryId]
  );

  const sendMessageRef = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  useEffect(() => {
    if (externalInput && externalInput.text.trim() !== "") {
      sendMessageRef.current(externalInput.text);
    }
  }, [externalInput?.ts]);

  const handleStopInference = async () => {
    try {
      abortControllerRef.current?.abort();
      await apiService.stopInference(instanceId);
      onLog?.({ message: `ÄÃ£ gá»­i tÃ­n hiá»‡u dá»«ng inference (slot ${instanceId})`, type: "warning", instanceId });
      toast("ÄÃ£ dá»«ng inference", { icon: "â¹" });
    } catch { /* ignore */ }
  };

  const handleUnloadModel = async (forceReload = false) => {
    setShowUnloadMenu(false);
    if (forceReload) {
      onLog?.({ message: `Force reload model: ${activeModelId}`, type: "info", instanceId });
      const modelToReload = activeModelId;
      setModelLoaded(false);
      setActiveModelId("");
      try {
        await apiService.unloadModel(instanceId);
        await apiService.loadModel(modelToReload, { instanceId, force_reload: true });
        setActiveModelId(modelToReload);
        setModelLoaded(true);
        toast.success("Reload model thÃ nh cÃ´ng!");
        onLog?.({ message: `Reload model thÃ nh cÃ´ng: ${modelToReload}`, type: "success", instanceId });
      } catch (error: any) {
        const msg = error.response?.data?.error || error.message;
        setLoadError(msg);
        onLog?.({ message: `Lá»—i reload model: ${msg}`, type: "error", instanceId });
        toast.error(`Reload tháº¥t báº¡i: ${msg}`);
      }
    } else {
      onLog?.({ message: `Äang unload model khá»i GPU slot ${instanceId}...`, type: "info", instanceId });
      try {
        await apiService.unloadModel(instanceId);
        setModelLoaded(false);
        setActiveModelId("");
        setLoadError(null);
        toast.success(`ÄÃ£ giáº£i phÃ³ng GPU slot ${instanceId}`);
        onLog?.({ message: `Unload thÃ nh cÃ´ng, slot ${instanceId} Ä‘Ã£ Ä‘Æ°á»£c giáº£i phÃ³ng`, type: "success", instanceId });
      } catch (error: any) {
        const msg = error.response?.data?.error || error.message;
        onLog?.({ message: `Lá»—i unload model: ${msg}`, type: "error", instanceId });
        toast.error(`Unload tháº¥t báº¡i: ${msg}`);
      }
    }
  };

  const handleConfirmModel = async () => {
    const isLocalOrRegistry = provider === "local" || provider === "registry";
    if (!isLocalOrRegistry) {
      setLoading(true);
      setLoadError(null);
      try {
        await apiService.validateModel(hfHubId, provider);
        setActiveModelId(hfHubId || "(Default Model)");
        setModelLoaded(true);
        toast.success(`ÄÃ£ káº¿t ná»‘i model: ${hfHubId || "Máº·c Ä‘á»‹nh"}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message;
        setLoadError(errorMsg);
        setModelLoaded(false);
        toast.error(`Model khÃ´ng há»£p lá»‡: ${errorMsg}`);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!hfHubId.trim()) {
      setLoadError(provider === "registry" ? "Vui lÃ²ng chá»n Model Registry" : "Vui lÃ²ng nháº­p Hugging Face Hub ID");
      return;
    }
    setLoading(true);
    setModelLoaded(false);
    setLoadError(null);
    onLog?.({ message: `Báº¯t Ä‘áº§u load model: ${hfHubId}`, type: "info", instanceId });
    try {
      await apiService.loadModel(hfHubId, {
        instanceId,
        system_prompt: params.systemPrompt || undefined,
        max_new_tokens: params.maxNewTokens === "" ? undefined : params.maxNewTokens,
        temperature: params.temperature === "" ? undefined : params.temperature,
        top_k: params.topK === "" ? undefined : params.topK,
        top_p: params.topP === "" ? undefined : params.topP,
        repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
        provider: "local",
      });
      setActiveModelId(hfHubId);
      setModelLoaded(true);
      toast.success("Model Ä‘Ã£ Ä‘Æ°á»£c táº£i thÃ nh cÃ´ng!");
      onLog?.({ message: `Load model thÃ nh cÃ´ng: ${hfHubId}`, type: "success", instanceId });
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      setLoadError(errorMsg);
      setModelLoaded(false);
      onLog?.({ message: `Lá»—i load model: ${errorMsg}`, type: "error", instanceId });
    } finally {
      setLoading(false);
    }
  };

  const getSessionMeta = (session: any) => {
    const msgs: any[] = session.messages || [];
    const lastAi = msgs.slice().reverse().find((m: any) => m.role === "ai");
    const lastUser = msgs.slice().reverse().find((m: any) => m.role === "user");
    return {
      model: lastAi?.model,
      preview: lastUser?.content?.trim().split("\n")[0]?.slice(0, 55) || "Tin nháº¯n trá»‘ng",
    };
  };

  return (
    <div className="chat-container">
      {/* Sessions Sidebar */}
      {showSidebar && (
        <div className="chat-sessions-sidebar">
          <div className="chat-sessions-sidebar-header">
            <button className="new-session-btn" onClick={handleNewChat}>
              <Plus size={18} /> New Session
            </button>
          </div>
          <div className="sessions-list">
            {chatSessions.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px', textAlign: 'center' }}>ChÆ°a cÃ³ lá»‹ch sá»­</div>
            ) : (
              chatSessions.map(session => {
                if (editingSessionId === session._id) {
                  return (
                    <div
                      key={session._id}
                      className="session-item active editing"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="session-rename-wrapper">
                        <input
                          type="text"
                          className="session-rename-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRenameSession(session._id, editTitle);
                            } else if (e.key === 'Escape') {
                              setEditingSessionId(null);
                            }
                          }}
                          autoFocus
                        />
                        <div className="session-rename-actions">
                          <button
                            className="session-rename-btn save"
                            onClick={() => handleRenameSession(session._id, editTitle)}
                            title="LÆ°u"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="session-rename-btn cancel"
                            onClick={() => setEditingSessionId(null)}
                            title="Há»§y"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="session-meta">{getSessionMeta(session).preview}</div>
                    </div>
                  );
                }

                return (
                  <div
                    key={session._id}
                    className={`session-item ${currentSessionId === session._id ? 'active' : ''}`}
                    onClick={() => handleLoadSession(session)}
                  >
                    <div className="session-title">{session.title || "Há»™i thoáº¡i"}</div>
                    <div className="session-meta">{getSessionMeta(session).preview}</div>
                    <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="session-action-btn edit"
                        onClick={() => {
                          setEditingSessionId(session._id);
                          setEditTitle(session.title || "Há»™i thoáº¡i");
                        }}
                        title="Äá»•i tÃªn"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="session-action-btn delete"
                        onClick={(e) => handleDeleteSession(session._id, e)}
                        title="XÃ³a"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="chat-main-area">
        {/* Model Loader Header */}
        <div className="column-header" style={{ padding: '12px 16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={provider}
            onChange={(e) => {
              const v = e.target.value;
              setProvider(v);
              setModelLoaded(v !== "local" && v !== "registry");
              setLoadError(null);
              if (v === "registry" && registries.length > 0) handleRegistryChange(registries[0]._id);
            }}
            style={{ width: '120px' }}
          >
            <option value="local">Manual ID</option>
            <option value="registry">Model Registry</option>
            <option value="openrouter">OpenRouter</option>
          </select>

          {provider === "registry" ? (
            <select
              value={selectedRegistryId}
              onChange={(e) => handleRegistryChange(e.target.value)}
              style={{ width: '220px' }}
              disabled={loading}
            >
              <option value="">Chá»n Model Registry...</option>
              {registries.map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          ) : (
            <div style={{ position: 'relative', width: '220px' }} ref={modelPickerRef}>
              <input
                type="text"
                style={{ width: '100%', paddingRight: '30px' }}
                placeholder={
                  provider === "local"
                    ? isCompareMode
                      ? `Model ${instanceId} ID`
                      : "Nháº­p Hugging Face Hub ID"
                    : "Model ID (tÃ¹y chá»n)"
                }
                value={hfHubId}
                onChange={(e) => {
                  setHfHubId(e.target.value);
                  if (provider === "local") setModelLoaded(false);
                  setLoadError(null);
                }}
                disabled={loading}
              />
              {provider === "local" && (
                <button
                  onClick={() => setShowModelPicker((p) => !p)}
                  style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                  tabIndex={-1}
                >
                  <ChevronDown size={14} />
                </button>
              )}
              {showModelPicker && provider === "local" && (
                <div className="custom-dropdown-list" style={{ width: '100%' }}>
                  {BASE_MODEL_OPTIONS.map((m) => (
                    <div
                      key={m}
                      className={`dropdown-item ${hfHubId === m ? 'selected' : ''}`}
                      onClick={() => {
                        setHfHubId(m);
                        setModelLoaded(false);
                        setLoadError(null);
                        setShowModelPicker(false);
                      }}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleConfirmModel}
            disabled={
              (provider === "local" && !hfHubId.trim()) ||
              (provider === "registry" && !hfHubId.trim()) ||
              loading ||
              ((provider === "local" || provider === "registry") && modelLoaded)
            }
            className="api-btn"
            style={{
              opacity: ((provider === "local" || provider === "registry") && modelLoaded) ? 0.85 : 1,
              background: modelLoaded && (provider === "local" || provider === "registry") ? 'var(--success)' : undefined
            }}
          >
            {loading && !modelLoaded
              ? "Táº£i..."
              : modelLoaded && (provider === "local" || provider === "registry")
                ? "âœ“ Sáºµn sÃ ng"
                : provider !== "local" && provider !== "registry"
                  ? "Sá»­ dá»¥ng API"
                  : "Load"}
          </button>

          {modelLoaded && (provider === "local" || provider === "registry") && (
            <div style={{ position: 'relative' }} ref={unloadMenuRef}>
              <button
                onClick={() => setShowUnloadMenu((v) => !v)}
                style={{ padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <ChevronDown size={14} />
              </button>
              {showUnloadMenu && (
                <div className="custom-dropdown-list" style={{ right: 0, width: '160px', top: '100%', position: 'absolute' }}>
                  <div className="dropdown-item" onClick={() => handleUnloadModel(true)}>Force Reload</div>
                  <div className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => handleUnloadModel(false)}>Unload khá»i GPU</div>
                </div>
              )}
            </div>
          )}

          {loading && !modelLoaded && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={12} className="animate-spin" /> Äang táº£i...
            </span>
          )}
          {loadError && (
            <span style={{ fontSize: '12.5px', color: 'var(--danger)', fontWeight: 500 }} title={loadError}>
              Lá»—i: {loadError.slice(0, 30)}...
            </span>
          )}
          {modelLoaded && (
            <span style={{ fontSize: '12.5px', color: 'var(--success)', fontWeight: 500 }}>
              Active: {activeModelId.split('/').pop()}
            </span>
          )}
        </div>

        {/* Message Panel Body */}
        <div className="chat-messages" style={{ overflowY: 'auto', flex: 1 }}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Sparkles size={24} color="#64748b" />
              </div>
              <p>{modelLoaded ? "Model Ä‘Ã£ sáºµn sÃ ng. HÃ£y báº¯t Ä‘áº§u chat!" : "Load model Ä‘á»ƒ báº¯t Ä‘áº§u há»™i thoáº¡i"}</p>
              {isCompareMode && !modelLoaded && (
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Nháº­p Model {instanceId} ID á»Ÿ trÃªn</p>
              )}
            </div>
          ) : (
            <div className={`messages-list-wrapper ${isCompareMode ? '' : 'single-mode'}`}>
              {messages.map((msg, index) => (
                <div key={index} className="message-row">
                  {msg.role === "user" ? (
                    <div className="message-user">{msg.content}</div>
                  ) : (
                    <div className="message-ai-container">
                      <div className="message-ai-avatar" style={{ backgroundColor: instanceId === 1 ? 'var(--primary)' : instanceId === 2 ? '#0ea5e9' : '#10b981' }}>
                        <Sparkles size={14} />
                      </div>
                      <div className="message-ai-content">
                        <MarkdownRenderer content={msg.content} />
                        {msg.responseTime && (
                          <div className="message-ai-meta">
                            <button className="meta-btn" title="Thá»­ láº¡i">
                              <RotateCcw size={12} />
                            </button>
                            <span className="meta-badge">
                              {msg.responseTime.toFixed(2)}s
                              {msg.model && !isCompareMode && ` â€¢ ${msg.model.split("/").pop()}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="message-ai-container">
                  <div className="message-ai-avatar" style={{ backgroundColor: instanceId === 1 ? 'var(--primary)' : instanceId === 2 ? '#0ea5e9' : '#10b981' }}>
                    <Loader2 size={12} className="animate-spin" />
                  </div>
                  <div className="typing-dots">
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                    <span className="typing-dot"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Local Input Bar for Compare Mode */}
        {isCompareMode && (
          <div className="column-footer" style={{ padding: '16px' }}>
            <div className="message-input-wrapper">
              <textarea
                value={localInput}
                onChange={(e) => {
                  setLocalInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (localInput.trim() && modelLoaded && !loading) {
                      sendMessage(localInput);
                      setLocalInput("");
                    }
                  }
                }}
                placeholder={modelLoaded ? `Chat riÃªng vá»›i Model ${instanceId}...` : "..."}
                style={{ minHeight: '44px', padding: '12px 48px 12px 16px', borderRadius: '12px', fontSize: '14px' }}
                disabled={!modelLoaded || loading}
              />
              {isInferring ? (
                <button
                  onClick={handleStopInference}
                  className="send-btn"
                  style={{ width: '32px', height: '32px', right: '8px', bottom: '8px', borderRadius: '8px', background: 'var(--danger)' }}
                  title="Dá»«ng inference"
                >
                  <Square size={14} />
                </button>
              ) : (
                <button
                  onClick={() => { if (localInput.trim() && modelLoaded && !loading) { sendMessage(localInput); setLocalInput(""); } }}
                  disabled={!localInput.trim() || !modelLoaded || loading}
                  className="send-btn"
                  style={{
                    width: '32px',
                    height: '32px',
                    right: '8px',
                    bottom: '8px',
                    borderRadius: '8px',
                    background: instanceId === 1 ? 'var(--primary-gradient)' : instanceId === 2 ? '#38bdf8' : '#34d399',
                    opacity: (!localInput.trim() || !modelLoaded || loading) ? 0.5 : 1
                  }}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Main ChatView Component
function ChatView() {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [compareCount, setCompareCount] = useState(2); // 2 or 3
  const [rightSidebar, setRightSidebar] = useState<'logs' | null>(null);

  const [input, setInput] = useState("");
  const [sendTrigger, setSendTrigger] = useState<{ text: string; ts: number } | null>(null);
  const [params, setParams] = useState<InferenceParams>(DEFAULT_PARAMS);
  const [showInferencePopup, setShowInferencePopup] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Model loading and inference states for compare mode validation
  const [model1Loaded, setModel1Loaded] = useState(false);
  const [model2Loaded, setModel2Loaded] = useState(false);
  const [model3Loaded, setModel3Loaded] = useState(false);
  const [model1Inferring, setModel1Inferring] = useState(false);
  const [model2Inferring, setModel2Inferring] = useState(false);
  const [model3Inferring, setModel3Inferring] = useState(false);

  // Inference Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const bothLoaded = compareCount === 2
    ? (model1Loaded && model2Loaded)
    : (model1Loaded && model2Loaded && model3Loaded);

  const eitherInferring = model1Inferring || model2Inferring || model3Inferring;

  const handleLog = useCallback((log: Omit<LogEntry, "ts">) => {
    setLogs((prev) => [...prev, { ...log, ts: Date.now() }]);
  }, []);

  const handleSend = () => {
    const canSend = mode === 'single' ? model1Loaded : bothLoaded;
    if (!input.trim() || !canSend) return;
    setSendTrigger({ text: input, ts: Date.now() });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStopBoth = async () => {
    try {
      await Promise.allSettled([
        apiService.stopInference(1),
        apiService.stopInference(2),
        apiService.stopInference(3),
      ]);
      toast("ÄÃ£ dá»«ng inference", { icon: "â¹" });
    } catch { /* ignore */ }
  };

  const toggleRightSidebar = (panel: 'logs') => {
    setRightSidebar((prev) => (prev === panel ? null : panel));
  };

  // Close inference settings popup when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowInferencePopup(false);
      }
    };
    if (showInferencePopup) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showInferencePopup]);

  return (
    <div className="chat-container" style={{ display: 'flex', height: '100%', width: '100%', position: 'relative' }}>
      <Toaster position="top-right" />

      {/* Main Chat Area */}
      <div className="chat-main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
        <div className="chat-columns-container" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {mode === 'single' ? (
            <div className="chat-column" style={{ flex: 1 }}>
              <ChatPanel
                instanceId={1}
                showSidebar={true}
                externalInput={sendTrigger}
                isCompareMode={false}
                onModelLoadedChange={setModel1Loaded}
                onIsInferringChange={setModel1Inferring}
                externalParams={params}
                onLog={handleLog}
              />
            </div>
          ) : (
            Array.from({ length: compareCount }).map((_, index) => (
              <div className="chat-column" key={index} style={{ flex: 1 }}>
                <ChatPanel
                  instanceId={index + 1}
                  showSidebar={false}
                  externalInput={sendTrigger}
                  isCompareMode={true}
                  onModelLoadedChange={(loaded) => {
                    if (index === 0) setModel1Loaded(loaded);
                    else if (index === 1) setModel2Loaded(loaded);
                    else if (index === 2) setModel3Loaded(loaded);
                  }}
                  onIsInferringChange={(inferring) => {
                    if (index === 0) setModel1Inferring(inferring);
                    else if (index === 1) setModel2Inferring(inferring);
                    else if (index === 2) setModel3Inferring(inferring);
                  }}
                  externalParams={params}
                  onLog={handleLog}
                />
              </div>
            ))
          )}
        </div>

        {/* Single Mode Bottom Input Bar */}
        {mode === 'single' && (
          <div className="column-footer" style={{ padding: '16px 20% 32px', position: 'relative', borderTop: '1px solid var(--border)' }}>
            {!model1Loaded && (
              <div className="global-hint" style={{ color: 'var(--danger)', marginBottom: '8px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> Vui lÃ²ng load model trÆ°á»›c khi chat.
              </div>
            )}

            <ParamsSummaryBar params={params} />

            <div className="message-input-wrapper" ref={settingsRef}>
              <button
                className={`options-toggle-btn ${showInferencePopup ? 'active' : ''}`}
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
              )}

              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={model1Loaded ? "Nháº­p cÃ¢u lá»‡nh..." : "Load model Ä‘á»ƒ báº¯t Ä‘áº§u..."}
                style={{ minHeight: '60px', padding: '16px 60px 16px 56px', fontSize: '15px', borderRadius: '12px' }}
                disabled={!model1Loaded || model1Inferring}
              />

              {model1Inferring ? (
                <button
                  className="send-btn"
                  onClick={() => apiService.stopInference(1)}
                  style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px', background: 'var(--danger)' }}
                >
                  <Square size={18} />
                </button>
              ) : (
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || !model1Loaded}
                  style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px', opacity: (!input.trim() || !model1Loaded) ? 0.5 : 1 }}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
            <div className="global-hint" style={{ marginTop: '12px' }}>Enter Ä‘á»ƒ gá»­i â€¢ Shift+Enter xuá»‘ng dÃ²ng</div>
          </div>
        )}

        {/* Compare Mode Unified Bottom Input Bar */}
        {mode === 'compare' && (
          <div className="global-bottom-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!bothLoaded && (
              <div className="global-hint" style={{ color: 'var(--danger)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} />
                {!model1Loaded && !model2Loaded
                  ? "Vui lÃ²ng load cÃ¡c model trÆ°á»›c khi so sÃ¡nh."
                  : !model1Loaded
                    ? "Äang chá» Model 1..."
                    : !model2Loaded
                      ? "Äang chá» Model 2..."
                      : "Äang chá» Model 3..."
                }
              </div>
            )}

            <div style={{ width: '65%' }}>
              <ParamsSummaryBar params={params} />
            </div>

            <div className="message-input-wrapper" style={{ width: '65%', position: 'relative' }} ref={settingsRef}>
              <button
                className={`options-toggle-btn ${showInferencePopup ? 'active' : ''}`}
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
              )}

              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={bothLoaded ? "Nháº­p cÃ¢u há»i â€” sáº½ gá»­i Ä‘áº¿n cÃ¡c model cÃ¹ng lÃºc..." : "Load Ä‘á»§ cÃ¡c model Ä‘á»ƒ báº¯t Ä‘áº§u..."}
                style={{ minHeight: '60px', padding: '16px 60px 16px 56px', fontSize: '15px', borderRadius: '12px' }}
                disabled={!bothLoaded || eitherInferring}
              />

              {eitherInferring ? (
                <button
                  className="send-btn"
                  onClick={handleStopBoth}
                  style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px', background: 'var(--danger)' }}
                >
                  <Square size={18} />
                </button>
              ) : (
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || !bothLoaded}
                  style={{ width: '40px', height: '40px', right: '12px', bottom: '10px', borderRadius: '8px', opacity: (!input.trim() || !bothLoaded) ? 0.5 : 1 }}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
            <div className="global-hint" style={{ marginTop: '12px' }}>
              So sÃ¡nh {compareCount} models â€¢ Enter Ä‘á»ƒ gá»­i Ä‘áº¿n táº¥t cáº£ â€¢ Shift+Enter Ä‘á»ƒ xuá»‘ng dÃ²ng
            </div>
          </div>
        )}
      </div>

      {/* Logs Right Sidebar Panel */}
      {rightSidebar === 'logs' && (
        <LogsSidePanel
          logs={logs}
          onClear={() => setLogs([])}
          collapsed={false}
          onToggleCollapse={() => setRightSidebar(null)}
        />
      )}
    </div>
  );
}

export default ChatView;
