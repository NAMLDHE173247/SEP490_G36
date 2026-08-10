import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Menu,
  Plus,
  Send,
  Check,
  Upload,
  Square,
  Trash2,
  Pencil,
  Loader2,
  Download,
  Sparkles,
  Terminal,
  BookOpen,
  FileText,
  RotateCcw,
  Settings2,
  GitCompare,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  TerminalSquare,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import { apiService } from '../services/api';
import '../styles/chat.css';
import { BatchModelTarget, BatchTestingModal } from '../components/BatchTestingModal';
import { TypingIndicator } from '../components/TypingIndicator';

// Constants
const BASE_MODEL_OPTIONS = [
  "zai-org/GLM-4.7",
  "unsloth/gpt-oss-20b",
  "sshleifer/tiny-gpt2",
  "zai-org/GLM-4.7-Flash",
  "Qwen/Qwen3-Coder-Next",
  "MiniMaxAI/MiniMax-M2.1",
  "unsloth/gpt-oss-20b-GGUF",
  "stepfun-ai/Step-3.5-Flash",
  "lightonai/LightOnOCR-2-1B",
  "Qwen/Qwen2.5-0.5B-Instruct",
  "unsloth/GLM-4.7-Flash-GGUF",
  "unsloth/Qwen3-Coder-Next-GGUF",
  "meta-llama/Llama-3.1-8B-Instruct",
  "unsloth/gpt-oss-20b-unsloth-bnb-4bit",
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4",
];

const HYBRID_SPEED_TEST_STEPS = [
  { subject: 'OTHER', question: 'Xin chào, hôm nay bạn có thể giúp tôi học bài không?' },
  { subject: 'MATH', question: 'Giải phương trình 2x + 5 = 15 và hướng dẫn từng bước.' },
  { subject: 'MATH', question: 'Kiểm tra lại bài trên bằng cách thay nghiệm vào phương trình.' },
  { subject: 'OTHER', question: 'Cảm ơn bạn. Hẹn gặp lại nhé.' },
  { subject: 'HISTORY', question: 'Những nguyên nhân chính của Cách mạng tháng Tám năm 1945 là gì?' },
  { subject: 'ENGLISH', question: "Explain why we use the present continuous in 'She is reading now'." },
];
const HYBRID_SPEED_TEST_MAX_NEW_TOKENS = 256;
const createRoutingSessionId = () => globalThis.crypto?.randomUUID?.()
  || `hybrid-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Message {
  role: "user" | "ai";
  content: string;
  responseTime?: number;
  model?: string;
  parameters?: any;
  manualHybridMetrics?: ManualHybridMetrics;
  manualHybridFailure?: ManualHybridFailure;
  errorInfo?: {
    raw: string;
    retryText?: string;
  };
}

interface ManualHybridFailure {
  measured_at: string;
  subject: string | null;
  failed_after_ms: number;
  error_message: string;
}

interface ManualHybridMetrics {
  measured_at: string;
  routing_mode: string;
  subject: string | null;
  route_strategy: string;
  router_latency_ms: number;
  model_switch_latency_ms: number;
  generation_latency_ms: number;
  ttft_ms: number | null;
  decode_latency_ms: number | null;
  end_to_end_latency_ms: number;
  previous_model: string | null;
  selected_model: string | null;
  gpu_slot_id: number;
  model_cache_hit: boolean;
  model_load_action: 'cache_hit' | 'cold_load' | 'switch_load';
  model_evicted: boolean;
  inference_id?: string | null;
  token_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    accounting?: string;
  } | null;
  history_messages_sent?: number;
  history_characters_sent?: number;
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  subject?: string;
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
const handleTextareaResize = (e: React.ChangeEvent<HTMLTextAreaElement>, maxHeight: number = 160) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, maxHeight) + "px";
};

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
};

const average = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;

const coefficientOfVariation = (values: number[]) => {
  const mean = average(values);
  if (mean === null || mean === 0 || values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
};

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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
          {label} {value === "" ? "–" : String(value)}
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
      toast.error("Không tải được danh sách system prompt");
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
        <span className="inference-popover-title">THAM SỐ INFERENCE</span>
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
            Tải từ lưu trữ
          </button>
        </div>

        {showPromptPicker && (
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>Chọn Prompt</span>
              <button onClick={() => setShowPromptPicker(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={12} /></button>
            </div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {savedPrompts.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 10px' }}>Chưa có prompt lưu trữ</div>
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
          placeholder="Nhập hướng dẫn cho AI hoặc tải từ lưu trữ..."
          value={params.systemPrompt}
          onChange={(e) => onChange({ ...params, systemPrompt: e.target.value })}
          style={{ minHeight: '60px', fontSize: '13px' }}
        />
        {params.systemPrompt && (
          <button
            onClick={() => onChange({ ...params, systemPrompt: "" })}
            style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '11px', cursor: 'pointer' }}
          >
            Xoá system prompt
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
        style={{ width: '36px', backgroundColor: 'rgba(255,255,255,0.88)', borderLeft: '1px solid #d8e5ec', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px', paddingBottom: '12px', gap: '12px', flexShrink: 0, cursor: 'pointer', height: '100%' }}
        onClick={onToggleCollapse}
        title="Mở Logs"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', marginTop: '12px' }}
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
          Inference Logs {logs.length > 0 && <span style={{ color: '#64748b', fontSize: '10px' }}>({logs.length})</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {logs.length > 0 && (
            <button onClick={onClear} className="logs-clear-btn">Xoá</button>
          )}
          <button onClick={onToggleCollapse} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="right-sidebar-content" style={{ backgroundColor: '#f8fbfd', padding: 0, overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div className="logs-empty">
            <Terminal size={40} color="#334155" strokeWidth={1} />
            <p style={{ fontSize: '12px', color: '#475569' }}>Chưa có log</p>
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
  onActiveModelChange?: (target: BatchModelTarget) => void;
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
  onActiveModelChange,
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
  const [showConnectedStatus, setShowConnectedStatus] = useState(false);
  const flashConnectedStatus = useCallback(() => {
    setShowConnectedStatus(true);
    window.setTimeout(() => setShowConnectedStatus(false), 3500);
  }, []);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const routingSessionIdRef = useRef(createRoutingSessionId());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSessionSidebarCollapsed, setIsSessionSidebarCollapsed] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const [showUnloadMenu, setShowUnloadMenu] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [hybridSpeedStep, setHybridSpeedStep] = useState(0);
  const unloadMenuRef = useRef<HTMLDivElement>(null);

  // Quick model picker dropdown
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const [localParams] = useState<InferenceParams>(DEFAULT_PARAMS);
  const params: InferenceParams = externalParams ?? localParams;
  const fallbackHybridModelId = registries
    .map((registry: any) => ({
      subject: String(registry.activeVersion?.subject || registry.subject || '').toUpperCase(),
      model: registry.activeVersion?.hfRepoId || registry.hfRepoId || '',
    }))
    .find((item: any) => ['OTHER', 'GENERAL'].includes(item.subject) && item.model)?.model || '';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const buildRecentHistory = useCallback((sourceMessages: Message[]): HistoryMessage[] => {
    const subjectByModel = new Map<string, string>();
    registries.forEach((registry: any) => {
      const model = registry.activeVersion?.hfRepoId || registry.hfRepoId;
      const subject = String(registry.activeVersion?.subject || registry.subject || '').toUpperCase();
      if (model && subject) subjectByModel.set(String(model), subject);
    });
    const normalized: HistoryMessage[] = sourceMessages
      .filter((m) => (m.role === "user" || m.role === "ai") && m.content.trim())
      .map((m) => ({
        role: m.role === "ai" ? "assistant" as const : "user" as const,
        content: m.content,
        ...(m.role === "ai" && (m.manualHybridMetrics?.subject || (m.model ? subjectByModel.get(m.model) : undefined))
          ? { subject: m.manualHybridMetrics?.subject || subjectByModel.get(String(m.model)) }
          : {}),
      }));

    const pairs: HistoryMessage[][] = [];
    for (let i = 0; i < normalized.length - 1; i++) {
      if (normalized[i].role === "user" && normalized[i + 1].role === "assistant") {
        const subject = normalized[i + 1].subject;
        pairs.push([
          { ...normalized[i], ...(subject ? { subject } : {}) },
          normalized[i + 1],
        ]);
        i++;
      }
    }
    return pairs.slice(-5).flat();
  }, [registries]);

  const buildManualHybridRows = useCallback(() => {
    const rows: Array<Record<string, any>> = [];
    let latestQuestion = '';
    messages.forEach((message, index) => {
      if (message.role === 'user') {
        latestQuestion = message.content;
        return;
      }
      if (!message.manualHybridMetrics && !message.manualHybridFailure) return;
      const common = {
        turn: rows.length + 1,
        message_index: index,
        question: latestQuestion,
        response: message.content,
        frontend_response_time_seconds: message.responseTime ?? null,
      };
      if (message.manualHybridMetrics) {
        const maxNewTokens = Number(message.parameters?.max_new_tokens);
        const outputTokens = Number(message.manualHybridMetrics.token_usage?.output_tokens);
        const generationSeconds = message.manualHybridMetrics.generation_latency_ms / 1000;
        rows.push({
          ...common,
          status: 'COMPLETED',
          error_message: null,
          max_new_tokens: Number.isFinite(maxNewTokens) ? maxNewTokens : null,
          output_tokens: Number.isFinite(outputTokens) ? outputTokens : null,
          tokens_per_second: Number.isFinite(outputTokens) && generationSeconds > 0
            ? outputTokens / generationSeconds
            : null,
          hit_output_cap: Number.isFinite(maxNewTokens)
            && Number.isFinite(outputTokens)
            && outputTokens >= maxNewTokens,
          ...message.manualHybridMetrics,
        });
      } else {
        rows.push({
          ...common,
          status: 'FAILED',
          ...message.manualHybridFailure,
          router_latency_ms: null,
          model_switch_latency_ms: null,
          generation_latency_ms: null,
          ttft_ms: null,
          decode_latency_ms: null,
          end_to_end_latency_ms: null,
          model_cache_hit: null,
          model_load_action: null,
          model_evicted: null,
        });
      }
    });
    return rows;
  }, [messages]);

  const exportManualHybridReport = useCallback((format: 'json' | 'csv') => {
    const rows = buildManualHybridRows();
    if (!rows.length) {
      toast.error('Chưa có lượt Chat Hybrid nào có telemetry để xuất.');
      return;
    }

    const metricValues = (key: string) => rows
      .map((row) => row[key])
      .filter((value) => typeof value === 'number' && Number.isFinite(value)) as number[];
    const completedRows = rows.filter((row) => row.status === 'COMPLETED');
    const e2e = metricValues('end_to_end_latency_ms');
    const router = metricValues('router_latency_ms');
    const switching = metricValues('model_switch_latency_ms');
    const generation = metricValues('generation_latency_ms');
    const ttft = metricValues('ttft_ms').filter((value) => value >= 0);
    const throughput = metricValues('tokens_per_second');
    const cacheHits = completedRows.filter((row) => row.model_cache_hit).length;
    const exportedAt = new Date().toISOString();
    const summary = {
      turns: rows.length,
      completed_turns: completedRows.length,
      failed_turns: rows.length - completedRows.length,
      avg_router_latency_ms: average(router),
      avg_model_switch_latency_ms: average(switching),
      avg_generation_latency_ms: average(generation),
      avg_ttft_ms: average(ttft),
      avg_tokens_per_second: average(throughput),
      avg_end_to_end_latency_ms: average(e2e),
      median_end_to_end_latency_ms: percentile(e2e, 0.5),
      p95_end_to_end_latency_ms: percentile(e2e, 0.95),
      end_to_end_latency_cv: coefficientOfVariation(e2e),
      cache_hits: cacheHits,
      cache_hit_rate: completedRows.length ? cacheHits / completedRows.length : null,
      cold_loads: completedRows.filter((row) => row.model_load_action === 'cold_load').length,
      switch_loads: completedRows.filter((row) => row.model_load_action === 'switch_load').length,
      evictions: completedRows.filter((row) => row.model_evicted).length,
      output_cap_hits: completedRows.filter((row) => row.hit_output_cap).length,
    };
    const stamp = exportedAt.replace(/[:.]/g, '-');

    if (format === 'json') {
      const report = {
        schema_version: 'manual-hybrid-speed-v1',
        experiment: 'Manual continuous model-switching test',
        exported_at: exportedAt,
        gpu_slot_id: instanceId,
        inference_parameters: params,
        metric_definitions: {
          router_latency_ms: 'Hybrid routing decision only',
          model_switch_latency_ms: 'GPU model acquisition/load before inference',
          ttft_ms: 'Inference request to first non-empty token',
          generation_latency_ms: 'GPU stream request to completion',
          end_to_end_latency_ms: 'Backend request start to completed response',
          tokens_per_second: 'Measured output tokens divided by generation latency',
          hit_output_cap: 'True when output tokens reached max_new_tokens and may be truncated',
        },
        summary,
        turns: rows,
      };
      downloadTextFile(`manual_hybrid_speed_${stamp}.json`, JSON.stringify(report, null, 2), 'application/json;charset=utf-8');
    } else {
      const columns = [
        'turn', 'status', 'measured_at', 'question', 'subject', 'route_strategy', 'previous_model', 'selected_model',
        'gpu_slot_id', 'model_load_action', 'model_cache_hit', 'model_evicted', 'router_latency_ms',
        'model_switch_latency_ms', 'ttft_ms', 'decode_latency_ms', 'generation_latency_ms',
        'end_to_end_latency_ms', 'max_new_tokens', 'output_tokens', 'tokens_per_second', 'hit_output_cap',
        'failed_after_ms', 'error_message', 'frontend_response_time_seconds', 'response',
      ];
      const csv = [
        columns.map(csvCell).join(','),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
      ].join('\n');
      downloadTextFile(`manual_hybrid_speed_${stamp}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    }
    toast.success(`Đã xuất báo cáo ${format.toUpperCase()} cho ${rows.length} lượt.`);
  }, [buildManualHybridRows, instanceId, params]);

  const manualHybridTurnCount = messages.filter(
    (message) => Boolean(message.manualHybridMetrics || message.manualHybridFailure)
  ).length;

  useEffect(() => { onModelLoadedChange?.(modelLoaded); }, [modelLoaded, onModelLoadedChange]);
  useEffect(() => {
    onActiveModelChange?.({
      modelId: modelLoaded ? activeModelId : "",
      provider,
      instanceId,
      label: `Model ${instanceId}`,
      registryId: provider === "registry" ? selectedRegistryId : undefined,
    });
  }, [activeModelId, modelLoaded, onActiveModelChange, provider, selectedRegistryId]);
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
        message: `Đã tự động chọn bản Active: ${activeVersion.version} (${activeVersion.hfRepoId})`,
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

  const getFriendlyError = (raw?: string | null) => {
    const message = raw || "";
    const lower = message.toLowerCase();

    if (lower.includes("slot") && (lower.includes("busy") || lower.includes("bận") || lower.includes("ban"))) {
      return {
        title: "Model dang xu ly yeu cau khac",
        description: "Doi vai giay roi thu lai. Neu cho qua lau, bam dung inference hoac unload model truoc khi gui tiep.",
      };
    }

    if (lower.includes("hugging face") || lower.includes("hub id") || lower.includes("registry")) {
      return {
        title: "Thieu thong tin model",
        description: "Chon model trong danh sach hoac nhap Hugging Face Hub ID roi bam Load.",
      };
    }

    if (lower.includes("gpu") || lower.includes("service") || lower.includes("connection") || lower.includes("connect")) {
      return {
        title: "Chua ket noi duoc dich vu GPU",
        description: "Kiem tra endpoint GPU o thanh tren, ket noi lai, sau do load model.",
      };
    }

    if (lower.includes("memory") || lower.includes("vram") || lower.includes("cuda")) {
      return {
        title: "GPU khong du tai nguyen",
        description: "Thu model nho hon, unload model dang chay, hoac giam cau hinh inference.",
      };
    }

    return {
      title: "Chua the hoan tat thao tac",
      description: message ? `Chi tiet: ${message}` : "Kiem tra lai ket noi AI roi thu lai.",
    };
  };

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
        routingSessionIdRef.current = fullSession._id;
        const lastAi = fullSession.messages.slice().reverse().find((m: any) => m.role === "ai" && m.model);
        if (lastAi?.model && !hfHubId) setHfHubId(lastAi.model);
      }
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    routingSessionIdRef.current = createRoutingSessionId();
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast.error("Tên cuộc hội thoại không được để trống");
      return;
    }
    try {
      await apiService.updateChatSessionTitle(id, newTitle);
      toast.success("Đã đổi tên cuộc hội thoại");
      setEditingSessionId(null);
      fetchChatSessions();
    } catch (error: any) {
      console.error("Failed to rename session:", error);
      toast.error("Không thể đổi tên cuộc hội thoại");
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteSessionId(id);
  };
  const confirmDeleteSession = async () => {
    if (!pendingDeleteSessionId) return;

    const id = pendingDeleteSessionId;
    try {
      await apiService.deleteChatSession(id);
      toast.success("Da xoa hoi thoai");
      if (currentSessionId === id) {
        setMessages([]);
        setCurrentSessionId(null);
      }
      fetchChatSessions();
    } catch (error: any) {
      console.error("Failed to delete session:", error);
      toast.error("Chua the xoa hoi thoai");
    } finally {
      setPendingDeleteSessionId(null);
    }
  };

  const sendMessage = useCallback(
    async (textOverride?: string, inferenceOverrides?: { maxNewTokens?: number }) => {
      const text = textOverride ?? "";
      const isHybrid = provider === "hybrid";
      const isLocal = provider === "local" || provider === "registry";
      if (!text.trim() || loading) return;
      if (isLocal && (!hfHubId.trim() || !modelLoaded)) return;
      setLoadError(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const userMessage: Message = { role: "user", content: text };
      const history = buildRecentHistory(messages);
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      setIsInferring(true);
      onLog?.({
        message: `Bắt đầu inference...`,
        type: "info",
        instanceId,
        data: {
          ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
          historyCount: history.length,
        },
      });

      const startTime = Date.now();
      let aiContent = "";
      let resolvedModelForHistory = isHybrid ? "Hybrid Router" : (hfHubId || provider);
      setMessages((prev) => [...prev, { role: "ai", content: "", model: isHybrid ? "Hybrid Router" : isLocal ? hfHubId : provider }]);

      try {
        const options = {
          instanceId,
          modelRegistryId: provider === "registry" ? selectedRegistryId : undefined,
          history,
          system_prompt: params.systemPrompt || undefined,
          max_new_tokens: inferenceOverrides?.maxNewTokens
            ?? (params.maxNewTokens === "" ? undefined : params.maxNewTokens),
          temperature: params.temperature === "" ? undefined : params.temperature,
          top_k: params.topK === "" ? undefined : params.topK,
          top_p: params.topP === "" ? undefined : params.topP,
          repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
          provider: provider === "local" || provider === "registry" || isHybrid ? undefined : provider,
          routing_mode: isHybrid ? "hybrid" : undefined,
          session_id: routingSessionIdRef.current,
          signal: abortController.signal,
          onProgressInfo: (info: any) => {
            if (!isHybrid || !info.selected_model) return;
            resolvedModelForHistory = String(info.selected_model);
            setMessages((prev) => {
              const arr = [...prev];
              arr[arr.length - 1] = {
                ...arr[arr.length - 1],
                model: String(info.selected_model),
              };
              return arr;
            });
            if (info.routing) {
              onLog?.({
                message: `Hybrid route: ${info.routing.subject} → ${info.selected_model}`,
                type: 'info',
                instanceId,
                data: info.routing,
              });
            }
          },
          onFinalInfo: (info: any) => {
            if (info.routing) {
              onLog?.({
                message: `Hybrid route: ${info.routing.subject} → ${info.routing.selectedModel || 'clarification'}`,
                type: "info",
                instanceId,
                data: info.routing,
              });
            }
            if (info.manual_hybrid_metrics) {
              const telemetry = info.manual_hybrid_metrics as ManualHybridMetrics;
              resolvedModelForHistory = telemetry.selected_model || resolvedModelForHistory;
              setMessages((prev) => {
                const arr = [...prev];
                arr[arr.length - 1] = {
                  ...arr[arr.length - 1],
                  model: telemetry.selected_model || arr[arr.length - 1].model,
                  manualHybridMetrics: telemetry,
                };
                return arr;
              });
              onLog?.({
                message: `Telemetry Hybrid: route ${Math.round(telemetry.router_latency_ms)} ms · switch ${Math.round(telemetry.model_switch_latency_ms)} ms · E2E ${Math.round(telemetry.end_to_end_latency_ms)} ms`,
                type: 'success',
                instanceId,
                data: telemetry,
              });
            }
            if (info.input_parameters) {
              setMessages((prev) => {
                const arr = [...prev];
                arr[arr.length - 1] = { ...arr[arr.length - 1], parameters: info.input_parameters };
                return arr;
              });
              onLog?.({ message: `Tham số inference (Final Info)`, type: "info", instanceId, data: info.input_parameters });
            }
          },
        };

        await apiService.inferStream({
          text_input: text,
          hf_hub_id: isHybrid ? undefined : (hfHubId || undefined),
          ...options,
        }, (chunk: string) => {
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
        onLog?.({ message: `Hoàn thành trong ${responseTime.toFixed(2)}s`, type: "success", instanceId });

        try {
          const gpuLogs = await apiService.getInferenceLogs(instanceId);
          if (Array.isArray(gpuLogs)) {
            const latest = gpuLogs.filter((l: any) => l.slot_id === instanceId).pop();
            if (latest?.input_parameters)
              onLog?.({ message: `Tham số thực tế (GPU)`, type: "info", instanceId, data: latest.input_parameters });
          } else if (gpuLogs?.input_parameters) {
            onLog?.({ message: `Tham số thực tế (GPU)`, type: "info", instanceId, data: gpuLogs.input_parameters });
          }
        } catch { /* ignore */ }

        try {
          const payload = {
            userMessage: text,
            aiMessage: aiContent,
            model: resolvedModelForHistory,
            responseTime,
          };
          if (currentSessionId) {
            await apiService.appendMessageToSession(currentSessionId, payload);
            await fetchChatSessions();
          } else {
            const newSession = await apiService.createChatSession(payload);
            setCurrentSessionId(newSession._id);
            await fetchChatSessions();
          }
        } catch (err: any) {
          console.error("Failed to save session", err);
          toast.error(`Không lưu được lịch sử chat: ${err.response?.data?.error || err.message}`);
        }
      } catch (error: any) {
        if (!error.name?.includes("Abort") && !error.message?.includes("aborted")) {
          const errorMsg = error.response?.data?.error || error.message;
          const friendlyError = getFriendlyError(errorMsg);
          setLoadError(errorMsg);
          toast.error(friendlyError.title);
          setMessages((prev) => {
            const arr = [...prev];
            arr[arr.length - 1] = {
              ...arr[arr.length - 1],
              content: `${friendlyError.title}\n\n${friendlyError.description}`,
              errorInfo: { raw: errorMsg, retryText: text },
              ...(isHybrid ? {
                manualHybridFailure: {
                  measured_at: new Date().toISOString(),
                  subject: HYBRID_SPEED_TEST_STEPS.find((step) => step.question === text)?.subject || null,
                  failed_after_ms: Date.now() - startTime,
                  error_message: String(errorMsg || 'Unknown Hybrid inference error'),
                },
              } : {}),
            };
            return arr;
          });
          if (isHybrid) {
            onLog?.({
              message: `Hybrid FAILED sau ${Date.now() - startTime} ms: ${errorMsg}`,
              type: 'error',
              instanceId,
              data: { question: text, error: errorMsg },
            });
          }
          onLog?.({ message: `Lỗi inference: ${error.message}`, type: "error", instanceId });
        } else {
          onLog?.({ message: `Inference bị huỷ`, type: "warning", instanceId });
        }
      } finally {
        setLoading(false);
        setIsInferring(false);
        abortControllerRef.current = null;
      }
    },
    [loading, hfHubId, modelLoaded, instanceId, params, currentSessionId, provider, messages, selectedRegistryId]
  );

  const runNextHybridSpeedStep = useCallback(() => {
    if (loading || hybridSpeedStep >= HYBRID_SPEED_TEST_STEPS.length) return;
    const step = HYBRID_SPEED_TEST_STEPS[hybridSpeedStep];
    sendMessage(step.question, { maxNewTokens: HYBRID_SPEED_TEST_MAX_NEW_TOKENS });
    setHybridSpeedStep((current) => Math.min(current + 1, HYBRID_SPEED_TEST_STEPS.length));
  }, [hybridSpeedStep, loading, sendMessage]);

  const resetHybridSpeedTest = useCallback(async () => {
    if (loading) return;
    try {
      const unloadResults = await Promise.all([1, 2].map(slotId => apiService.unloadModel(slotId)));
      const before = Number(unloadResults[0]?.vram_before_mb);
      const after = Number(unloadResults[unloadResults.length - 1]?.vram_after_mb);
      onLog?.({
        message: Number.isFinite(before) && Number.isFinite(after)
          ? `GPU slots 1-2: ${before} MB → ${after} MB sau unload`
          : 'GPU slots 1-2 đã nhận lệnh unload',
        type: 'success',
        instanceId,
        data: unloadResults,
      });
      if (fallbackHybridModelId) {
        await apiService.loadModel(fallbackHybridModelId, { instanceId: 1, pinned: true });
        onLog?.({
          message: `Đã preload và ghim ${fallbackHybridModelId} ở GPU slot 1`,
          type: 'success',
          instanceId: 1,
        });
      }
    } catch (error: any) {
      const message = error.response?.data?.error || error.message;
      onLog?.({ message: `Unload GPU thất bại: ${message}`, type: 'error', instanceId });
      toast.error(`Chưa giải phóng được GPU: ${message}`);
      return;
    }
    setMessages([]);
    setCurrentSessionId(null);
    routingSessionIdRef.current = createRoutingSessionId();
    setHybridSpeedStep(0);
    toast.success('Đã xóa lượt đo và giải phóng GPU slots 1-2 để bắt đầu cold-start mới.');
  }, [fallbackHybridModelId, instanceId, loading, onLog]);

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
      onLog?.({ message: `Đã gửi tín hiệu dừng inference (slot ${instanceId})`, type: "warning", instanceId });
      toast("Đã dừng inference", { icon: "⏹" });
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
        toast.success("Reload model thành công!");
        onLog?.({ message: `Reload model thành công: ${modelToReload}`, type: "success", instanceId });
      } catch (error: any) {
        const msg = error.response?.data?.error || error.message;
        setLoadError(msg);
        onLog?.({ message: `Lỗi reload model: ${msg}`, type: "error", instanceId });
        toast.error(`Reload thất bại: ${msg}`);
      }
    } else {
      onLog?.({ message: `Đang unload model khỏi GPU slot ${instanceId}...`, type: "info", instanceId });
      try {
        await apiService.unloadModel(instanceId);
        setModelLoaded(false);
        setActiveModelId("");
        setLoadError(null);
        toast.success(`Đã giải phóng GPU slot ${instanceId}`);
        onLog?.({ message: `Unload thành công, slot ${instanceId} đã được giải phóng`, type: "success", instanceId });
      } catch (error: any) {
        const msg = error.response?.data?.error || error.message;
        onLog?.({ message: `Lỗi unload model: ${msg}`, type: "error", instanceId });
        toast.error(`Unload thất bại: ${msg}`);
      }
    }
  };

  const handleConfirmModel = async (modelOverride?: string) => {
    if (provider === "hybrid") {
      setLoading(true);
      setLoadError(null);
      try {
        if (fallbackHybridModelId) {
          await apiService.loadModel(fallbackHybridModelId, { instanceId: 1, pinned: true });
        }
        setActiveModelId("Hybrid Router");
        setModelLoaded(true);
      toast.success("Hybrid Router đã sẵn sàng");
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message;
        setLoadError(errorMsg);
        setModelLoaded(false);
        toast.error(getFriendlyError(errorMsg).title);
      } finally {
        setLoading(false);
      }
      return;
    }
    const isLocalOrRegistry = provider === "local" || provider === "registry";
    const modelToLoad = modelOverride || hfHubId;

    if (!isLocalOrRegistry) {
      setLoading(true);
      setLoadError(null);
      try {
        await apiService.validateModel(modelToLoad, provider);
        setActiveModelId(modelToLoad || "Default Model");
        setModelLoaded(true);
        flashConnectedStatus();
        toast.success(`Da ket noi model: ${modelToLoad || "Mac dinh"}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || error.message;
        setLoadError(errorMsg);
        setModelLoaded(false);
        toast.error(getFriendlyError(errorMsg).title);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!modelToLoad.trim()) {
      setLoadError(provider === "registry" ? "Vui long chon Model Registry" : "Vui long chon model de bat dau chat");
      return;
    }

    if (modelOverride) setHfHubId(modelOverride);
    setLoading(true);
    setModelLoaded(false);
    setLoadError(null);
    onLog?.({ message: `Bat dau tai model: ${modelToLoad}`, type: "info", instanceId });

    try {
      await apiService.loadModel(modelToLoad, {
        instanceId,
        system_prompt: params.systemPrompt || undefined,
        max_new_tokens: params.maxNewTokens === "" ? undefined : params.maxNewTokens,
        temperature: params.temperature === "" ? undefined : params.temperature,
        top_k: params.topK === "" ? undefined : params.topK,
        top_p: params.topP === "" ? undefined : params.topP,
        repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
        provider: "local",
      });
      setActiveModelId(modelToLoad);
      setModelLoaded(true);
      flashConnectedStatus();
      toast.success("Model da san sang!");
      onLog?.({ message: `Tai model thanh cong: ${modelToLoad}`, type: "success", instanceId });
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      setLoadError(errorMsg);
      setModelLoaded(false);
      toast.error(getFriendlyError(errorMsg).title);
      onLog?.({ message: `Loi tai model: ${errorMsg}`, type: "error", instanceId });
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
      preview: lastUser?.content?.trim().split("\n")[0]?.slice(0, 55) || "Tin nhắn trống",
    };
  };

  const getSessionTitle = (session: any) => {
    const msgs: any[] = session.messages || [];
    const firstUser = msgs.find((m: any) => m.role === "user")?.content?.trim();
    const rawTitle = session.title?.trim();
    const titleLooksLikeMessage = firstUser && rawTitle && rawTitle === firstUser.slice(0, rawTitle.length);

    if (rawTitle && !titleLooksLikeMessage) return rawTitle;

    const date = session.updatedAt || session.createdAt;
    if (date) return `Hoi thoai ${new Date(date).toLocaleDateString("vi-VN")}`;
    return "Hoi thoai moi";
  };

  return (
    <div className="chat-container">
      {/* Sessions Sidebar */}
      {showSidebar && isSessionSidebarCollapsed && (
        <button
          className="chat-sidebar-restore-btn"
          onClick={() => setIsSessionSidebarCollapsed(false)}
          title="Mo danh sach hoi thoai"
        >
          <Menu size={18} />
        </button>
      )}

      {showSidebar && !isSessionSidebarCollapsed && (
        <div className="chat-sessions-sidebar">
          <div className="chat-sessions-sidebar-header">
            <div className="chat-sidebar-title-row">
              <div>
                <div className="chat-sidebar-kicker">QUAN LY</div>
                <div className="chat-sidebar-title">Hoi thoai</div>
              </div>
              <div className="chat-sidebar-actions">
                <button
                  className="chat-sidebar-icon-btn"
                  onClick={() => setIsSessionSidebarCollapsed(true)}
                  title="An danh sach hoi thoai"
                >
                  <Menu size={16} />
                </button>
                <button className="chat-sidebar-icon-btn primary" onClick={handleNewChat} title="Tao hoi thoai moi">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="sessions-list">
            <div className="session-group-label">GAN DAY</div>
            {chatSessions.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px', textAlign: 'center' }}>Chưa có lịch sử</div>
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
                            title="Lưu"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="session-rename-btn cancel"
                            onClick={() => setEditingSessionId(null)}
                            title="Hủy"
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
                    <div className="session-title generated">{getSessionTitle(session)}</div>
                    <div className="session-title">{session.title || "Hội thoại"}</div>
                    <div className="session-meta">{getSessionMeta(session).preview}</div>
                    <div className="session-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="session-action-btn edit"
                        onClick={() => {
                          setEditingSessionId(session._id);
                          setEditTitle(session.title || "Hội thoại");
                        }}
                        title="Đổi tên"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="session-action-btn delete"
                        onClick={(e) => handleDeleteSession(session._id, e)}
                        title="Xóa"
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
            <option value="hybrid">Tự động · Hybrid Router</option>
            <option value="openrouter">OpenRouter</option>
            <option value="deepseek">DeepSeek V3 · OpenRouter</option>
            <option value="gemini">Gemini 2.5 Flash · OpenRouter</option>
            <option value="openai">GPT-4o mini · OpenRouter</option>
            <option value="groq">Groq</option>
          </select>

          {provider === "hybrid" ? (
            <div style={{ width: '320px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Rule-first → Gemini fallback → Math/Physics SLM
            </div>
          ) : provider === "registry" ? (
            <select
              value={selectedRegistryId}
              onChange={(e) => handleRegistryChange(e.target.value)}
              style={{ width: '220px' }}
              disabled={loading}
            >
              <option value="">Chọn Model Registry...</option>
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
                      : "Nhập Hugging Face Hub ID"
                    : "Model ID (tùy chọn)"
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
            onClick={() => handleConfirmModel()}
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
              ? "Tải..."
              : modelLoaded && (provider === "local" || provider === "registry")
                ? "✓ Sẵn sàng"
                : provider !== "local" && provider !== "registry"
                  ? "Sử dụng API"
                  : "Tai model"}
          </button>

          {provider === 'hybrid' && manualHybridTurnCount > 0 && (
            <>
              <button
                type="button"
                className="api-btn"
                onClick={() => exportManualHybridReport('json')}
                title="Xuất đầy đủ dữ liệu từng lượt và thống kê dùng cho RP5"
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Download size={14} /> Báo cáo JSON ({manualHybridTurnCount})
              </button>
              <button
                type="button"
                className="api-btn"
                onClick={() => exportManualHybridReport('csv')}
                title="Xuất bảng từng lượt để mở bằng Excel"
              >
                CSV
              </button>
            </>
          )}

          {provider === 'hybrid' && modelLoaded && (
            <>
              <button
                type="button"
                className="api-btn"
                disabled={loading || hybridSpeedStep >= HYBRID_SPEED_TEST_STEPS.length}
                onClick={runNextHybridSpeedStep}
                title="Kịch bản hội thoại thực tế, tối đa 256 output token mỗi lượt"
                style={{ background: '#eef2ff', color: '#3730a3', borderColor: '#a5b4fc' }}
              >
                {hybridSpeedStep >= HYBRID_SPEED_TEST_STEPS.length
                  ? 'Đã đủ 6 lượt'
                  : `Test tiếp ${hybridSpeedStep + 1}/6 · ${HYBRID_SPEED_TEST_STEPS[hybridSpeedStep].subject}`}
              </button>
              <button
                type="button"
                className="api-btn"
                disabled={loading}
                onClick={resetHybridSpeedTest}
                title="Xóa telemetry và unload GPU slot để lần tiếp theo là cold-start"
              >
                Reset đo
              </button>
            </>
          )}

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
                  <div className="dropdown-item" onClick={() => handleUnloadModel(true)}>Khoi dong lai AI</div>
                  <div className="dropdown-item" style={{ color: 'var(--danger)' }} onClick={() => handleUnloadModel(false)}>Giai phong model</div>
                </div>
              )}
            </div>
          )}

          {loading && !modelLoaded && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Loader2 size={12} className="animate-spin" /> Đang tải...
            </span>
          )}
          {loadError && (
            <div className="chat-inline-alert" title={loadError}>
              <AlertCircle size={14} />
              <div>
                <strong>{getFriendlyError(loadError).title}</strong>
                <span>{getFriendlyError(loadError).description}</span>
                <div className="chat-inline-alert-actions">
                  <button type="button" onClick={() => handleConfirmModel(hfHubId.trim() || BASE_MODEL_OPTIONS[0])} disabled={loading}>
                    Thu lai
                  </button>
                  {(provider === "local" || provider === "registry") && (
                    <button type="button" onClick={() => handleUnloadModel(false)}>
                      Giai phong model
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {modelLoaded && showConnectedStatus && (
            <span style={{ fontSize: '12.5px', color: 'var(--success)', fontWeight: 600 }}>
              Đã kết nối: {activeModelId.split('/').pop()}
            </span>
          )}
        </div>

        {/* Message Panel Body */}
        <div className="chat-messages" style={{ overflowY: 'auto', flex: 1 }}>
          {messages.length === 0 ? (
            <div className={`empty-state ${modelLoaded ? 'ready' : 'needs-model'}`}>
              <div className="empty-state-icon">
                <Sparkles size={24} color="#64748b" />
              </div>
              <h3>{modelLoaded ? "AI đã sẵn sàng" : "Tải model để bắt đầu chat"}</h3>
              <p>
                {modelLoaded
                  ? "Nhập câu hỏi ở thanh bên dưới để bắt đầu cuộc trò chuyện."
                  : isCompareMode
                    ? `Chọn model cho khung ${instanceId}, tải model, rồi bắt đầu so sánh.`
                    : "Người dùng mới có thể bấm nút bên dưới, hệ thống sẽ dùng model mặc định."}
              </p>
              {!modelLoaded && (
                <>
                  <div className="chat-start-steps">
                    <span>1. Chọn model</span>
                    <span>2. Tải model</span>
                    <span>3. Đặt câu hỏi</span>
                  </div>
                  <button
                    className="chat-empty-cta"
                    onClick={() => handleConfirmModel(hfHubId.trim() || BASE_MODEL_OPTIONS[0])}
                    disabled={loading || (provider === "registry" && !hfHubId.trim())}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {loading ? "Đang tải model..." : "Tải model và bắt đầu"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className={`messages-list-wrapper ${isCompareMode ? '' : 'single-mode'}`}>
              {messages.map((msg, index) => {
                const isPendingAi = loading && msg.role === "ai" && index === messages.length - 1 && !msg.content.trim();

                return (
                  <div key={index} className="message-row">
                    {msg.role === "user" ? (
                      <div className="message-user">{msg.content}</div>
                    ) : (
                      <div className={`message-ai-container ${isPendingAi ? 'message-ai-loading' : ''}`}>
                        <div className="message-ai-avatar" style={{ backgroundColor: instanceId === 1 ? 'var(--primary)' : instanceId === 2 ? '#0ea5e9' : '#10b981' }}>
                          <Sparkles size={14} />
                        </div>
                        <div className="message-ai-content">
                          {isPendingAi ? <TypingIndicator /> : <MarkdownRenderer content={msg.content} />}
                          {msg.errorInfo && (
                            <div className="chat-error-actions">
                              <button
                                type="button"
                                onClick={() => msg.errorInfo?.retryText && sendMessage(msg.errorInfo.retryText)}
                                disabled={loading || !modelLoaded}
                              >
                                Thu lai
                              </button>
                              {isInferring && (
                                <button type="button" onClick={handleStopInference}>
                                  Dung
                                </button>
                              )}
                              {(provider === "local" || provider === "registry") && (
                                <button type="button" className="danger" onClick={() => handleUnloadModel(false)}>
                                  Giai phong model
                                </button>
                              )}
                            </div>
                          )}
                          {msg.responseTime && (
                            <div className="message-ai-meta">
                              <button className="meta-btn" title="Thu lai">
                                <RotateCcw size={12} />
                              </button>
                              <span className="meta-badge">
                                {msg.responseTime.toFixed(2)}s
                                {msg.model && !isCompareMode && ` - ${msg.model.split("/").pop()}`}
                              </span>
                            </div>
                          )}
                          {msg.manualHybridMetrics && (
                            <div style={{
                              marginTop: 6,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 5,
                              fontSize: 10.5,
                              color: '#475569',
                            }}>
                              <span className="param-tag">Route {Math.round(msg.manualHybridMetrics.router_latency_ms)} ms</span>
                              <span className="param-tag">Switch {Math.round(msg.manualHybridMetrics.model_switch_latency_ms)} ms</span>
                              <span className="param-tag">TTFT {msg.manualHybridMetrics.ttft_ms == null ? '—' : `${Math.round(msg.manualHybridMetrics.ttft_ms)} ms`}</span>
                              <span className="param-tag">Generate {Math.round(msg.manualHybridMetrics.generation_latency_ms)} ms</span>
                              <span className="param-tag">E2E {Math.round(msg.manualHybridMetrics.end_to_end_latency_ms)} ms</span>
                              {typeof msg.manualHybridMetrics.token_usage?.output_tokens === 'number' && (
                                <span className="param-tag">
                                  Output {msg.manualHybridMetrics.token_usage.output_tokens} tok /{' '}
                                  {(msg.manualHybridMetrics.token_usage.output_tokens / Math.max(0.001, msg.manualHybridMetrics.generation_latency_ms / 1000)).toFixed(1)} tok/s
                                </span>
                              )}
                              {typeof msg.manualHybridMetrics.token_usage?.output_tokens === 'number'
                                && typeof msg.parameters?.max_new_tokens === 'number'
                                && msg.manualHybridMetrics.token_usage.output_tokens >= msg.parameters.max_new_tokens && (
                                  <span
                                    className="param-tag"
                                    style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                                    title="The model reached max_new_tokens; the answer may be truncated."
                                  >
                                    OUTPUT LIMIT {msg.parameters.max_new_tokens}
                                  </span>
                                )}
                              <span
                                className="param-tag"
                                style={{
                                  background: msg.manualHybridMetrics.model_cache_hit ? '#ecfdf5' : '#fff7ed',
                                  color: msg.manualHybridMetrics.model_cache_hit ? '#047857' : '#c2410c',
                                  borderColor: msg.manualHybridMetrics.model_cache_hit ? '#a7f3d0' : '#fed7aa',
                                }}
                                title={`${msg.manualHybridMetrics.previous_model || 'empty'} → ${msg.manualHybridMetrics.selected_model || 'unknown'}`}
                              >
                                {msg.manualHybridMetrics.model_load_action}
                              </span>
                            </div>
                          )}
                          {msg.manualHybridFailure && (
                            <div style={{ marginTop: 6, fontSize: 10.5 }}>
                              <span
                                className="param-tag"
                                style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                                title={msg.manualHybridFailure.error_message}
                              >
                                FAILED sau {Math.round(msg.manualHybridFailure.failed_after_ms)} ms
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />            </div>
          )}
        </div>

        {/* Local Input Bar for Compare Mode */}
        {isCompareMode && (
          <div className="column-footer" style={{ padding: '16px' }}>
            <div className="message-input-wrapper">
              <div className="composer-leading-icon" aria-hidden="true">
                <MessageSquare size={16} />
              </div>
              <textarea
                value={localInput}
                onChange={(e) => {
                  setLocalInput(e.target.value);
                  handleTextareaResize(e, 120);
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
                placeholder={modelLoaded ? `Chat riêng với Model ${instanceId}...` : "..."}
                style={{ minHeight: '44px', padding: '12px 48px 12px 46px', borderRadius: '12px', fontSize: '14px' }}
                disabled={!modelLoaded || loading}
              />
              {isInferring ? (
                <button
                  onClick={handleStopInference}
                  className="send-btn"
                  style={{ width: '32px', height: '32px', right: '8px', bottom: '8px', borderRadius: '8px', background: 'var(--danger)' }}
                  title="Dừng inference"
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
        {pendingDeleteSessionId && (
          <div className="chat-confirm-overlay" onMouseDown={() => setPendingDeleteSessionId(null)}>
            <div className="chat-confirm-dialog" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
              <div className="chat-confirm-icon">
                <Trash2 size={18} />
              </div>
              <div className="chat-confirm-content">
                <h3 id="delete-session-title">Xoa hoi thoai nay?</h3>
                <p>Cuoc hoi thoai se bi xoa khoi lich su. Thao tac nay khong the hoan tac.</p>
              </div>
              <div className="chat-confirm-actions">
                <button type="button" className="chat-confirm-btn secondary" onClick={() => setPendingDeleteSessionId(null)}>
                  Huy
                </button>
                <button type="button" className="chat-confirm-btn danger" onClick={confirmDeleteSession}>
                  Xoa
                </button>
              </div>
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
  const [showBatchTesting, setShowBatchTesting] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showInferencePopup, setShowInferencePopup] = useState(false);
  const [batchTargets, setBatchTargets] = useState<BatchModelTarget[]>([]);
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

  const handleBatchTargetChange = useCallback((target: BatchModelTarget) => {
    setBatchTargets((previous) => {
      const withoutCurrent = previous.filter((item) => item.instanceId !== target.instanceId);
      return [...withoutCurrent, target];
    });
  }, []);

  const handleSend = () => {
    const canSend = mode === 'single' ? model1Loaded : bothLoaded;
    if (!input.trim() || !canSend) return;
    setSendTrigger({ text: input, ts: Date.now() });
    setInput("");
  };

  const applyChatPreset = (preset: 'precise' | 'balanced' | 'creative') => {
    const presetParams = {
      precise: { temperature: 0.2, topP: 0.8, maxNewTokens: 512 },
      balanced: { temperature: 0.7, topP: 0.95, maxNewTokens: 768 },
      creative: { temperature: 1, topP: 0.98, maxNewTokens: 1024 },
    }[preset];

    setParams((prev) => ({ ...prev, ...presetParams }));
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
      toast("Đã dừng inference", { icon: "⏹" });
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
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          style: {
            borderRadius: '12px',
            border: '1px solid #dbe5ec',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
            color: '#243447',
            padding: '12px 14px',
          },
          success: {
            iconTheme: { primary: '#0f766e', secondary: '#ffffff' },
          },
          error: {
            iconTheme: { primary: '#dc2626', secondary: '#ffffff' },
          },
        }}
      />

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
                <MessageSquare size={16} /> Chat
              </button>
              <button
                className={`mode-btn ${mode === 'compare' ? 'active' : ''}`}
                onClick={() => setMode('compare')}
              >
                <GitCompare size={16} /> So sanh AI
              </button>
            </div>

            {mode === 'compare' && (
              <select
                className="models-dropdown"
                value={compareCount}
                onChange={(e) => setCompareCount(Number(e.target.value))}
              >
                <option value={2}>2 model</option>
                <option value={3}>3 model</option>
              </select>
            )}
          </div>
          <div className="chat-header-right" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="primary-btn"
              style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', background: 'var(--primary)', border: 'none', color: 'white', cursor: 'pointer' }}
              onClick={() => setShowBatchTesting(true)}
            >
              <FileText size={16} /> Cong cu
            </button>
            <button
              className={`icon-btn ${showGlobalSettings ? 'active' : ''}`}
              style={{ backgroundColor: showGlobalSettings ? 'var(--primary-light)' : 'transparent', color: showGlobalSettings ? 'var(--primary)' : 'var(--text-muted)' }}
              onClick={() => setShowGlobalSettings(!showGlobalSettings)}
              title="Cai dat nang cao"
            >
              <Settings2 size={20} />
            </button>
            <button
              className={`icon-btn utility-btn ${rightSidebar === 'logs' ? 'active' : ''}`}
              onClick={() => toggleRightSidebar('logs')}
              title="Chi tiet ky thuat"
            >
              <TerminalSquare size={20} />
            </button>
          </div>
        </div>

        {showGlobalSettings && (
          <div className="global-settings-panel chat-advanced-panel">
            <div className="chat-preset-section">
              <div>
                <div className="chat-settings-title">Cai dat nang cao</div>
                <div className="chat-settings-subtitle">Chon cach AI tra loi ma khong can hieu thong so ky thuat.</div>
              </div>
              <div className="chat-preset-actions">
                <button type="button" onClick={() => applyChatPreset('precise')}>Chinh xac</button>
                <button type="button" onClick={() => applyChatPreset('balanced')}>Can bang</button>
                <button type="button" onClick={() => applyChatPreset('creative')}>Sang tao</button>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>HUONG DAN CHO AI</label>
              <textarea
                value={params.systemPrompt}
                onChange={e => setParams({ ...params, systemPrompt: e.target.value })}
                placeholder="Vi du: tra loi ngan gon, giai thich tung buoc, dung giong van than thien..."
                style={{ width: '100%', minHeight: '60px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', backgroundColor: 'var(--bg-elevated)', transition: 'all 0.2s' }}
              />
            </div>
            <div className="chat-technical-grid">
              <div className="inference-field">
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Do dai tra loi</label>
                <input type="number" value={params.maxNewTokens} onChange={e => setParams({ ...params, maxNewTokens: Number(e.target.value) || "" })} style={{ width: '92px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
              <div className="inference-field">
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Do sang tao</label>
                <input type="number" step="0.1" value={params.temperature} onChange={e => setParams({ ...params, temperature: Number(e.target.value) || "" })} style={{ width: '92px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
              </div>
            </div>
          </div>
        )}
        {showBatchTesting && (
          <BatchTestingModal
            onClose={() => setShowBatchTesting(false)}
            activeModelId={batchTargets.find((target) => target.instanceId === 1)?.modelId || ""}
            provider={batchTargets.find((target) => target.instanceId === 1)?.provider || "local"}
            params={params}
            instanceId={1}
            selectedRegistryId={batchTargets.find((target) => target.instanceId === 1)?.registryId}
            targets={mode === "compare" ? batchTargets : batchTargets.filter((target) => target.instanceId === 1)}
            requiredTargetCount={mode === "compare" ? compareCount : 1}
          />
        )}

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
                onActiveModelChange={handleBatchTargetChange}
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
                  onActiveModelChange={handleBatchTargetChange}
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
          <div className="column-footer chat-composer-footer" style={{ padding: '18px clamp(16px, 8vw, 120px) 24px', position: 'relative', borderTop: '1px solid var(--border)' }}>
            {!model1Loaded && (
              <div className="global-hint chat-input-notice">
                <AlertCircle size={14} /> Chon model va bam Load truoc khi gui tin nhan.
              </div>
            )}

            <div className="message-input-wrapper">
              <div className="composer-leading-icon" aria-hidden="true">
                <MessageSquare size={18} />
              </div>

              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder={model1Loaded ? "Nhập câu lệnh..." : "Load model để bắt đầu..."}
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
            <div className="global-hint" style={{ marginTop: '12px' }}>Enter để gửi • Shift+Enter xuống dòng</div>
          </div>
        )}

        {/* Compare Mode Unified Bottom Input Bar */}
        {mode === 'compare' && (
          <div className="global-bottom-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!bothLoaded && (
              <div className="global-hint chat-input-notice">
                <AlertCircle size={14} />
                {!model1Loaded && !model2Loaded
                  ? "Vui lòng load các model trước khi so sánh."
                  : !model1Loaded
                    ? "Đang chờ Model 1..."
                    : !model2Loaded
                      ? "Đang chờ Model 2..."
                      : "Đang chờ Model 3..."
                }
              </div>
            )}

            <div className="message-input-wrapper" style={{ width: 'min(100%, 860px)', position: 'relative' }}>
              <div className="composer-leading-icon" aria-hidden="true">
                <GitCompare size={18} />
              </div>

              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder={bothLoaded ? "Nhập câu hỏi — sẽ gửi đến các model cùng lúc..." : "Load đủ các model để bắt đầu..."}
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
              So sánh {compareCount} models • Enter để gửi đến tất cả • Shift+Enter để xuống dòng
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
