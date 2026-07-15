import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CheckCircle2, Download, FileUp, Gauge, Loader2, Route, ShieldAlert, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';

type RouterMode = 'rule' | 'llm' | 'hybrid';
type RouterCase = {
  id: string;
  question: string;
  gold_subject: string;
  gold_intent?: string;
  gold_need_clarification?: boolean;
  turns?: string[];
  system_prompt?: string;
};

type RouterResult = {
  total: number;
  primary_subject_accuracy: number;
  intent_accuracy: number | null;
  need_clarification_accuracy: number | null;
  exact_match_accuracy: number | null;
  labeled_intent_cases?: number;
  labeled_clarification_cases?: number;
  avg_router_latency_ms: number;
  llm_call_rate: number;
  items: Array<any>;
};

const pct = (value?: number) => `${Math.round((value || 0) * 100)}%`;
const subjectMap = (value: unknown): RouterCase['gold_subject'] => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || 'GENERAL';
};

function extractCases(raw: any): RouterCase[] {
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.cases) ? raw.cases : [];
  return rows.map((row: any, index: number) => {
    const firstUser = Array.isArray(row.messages)
      ? row.messages.find((message: any) => message?.role === 'user')?.content
      : undefined;
    return {
      id: String(row.id || row.conversation_id || `case-${index + 1}`),
      question: String(row.question || row.text_input || firstUser || '').trim(),
      gold_subject: subjectMap(row.gold_subject || row.subject),
      ...(typeof row.gold_intent === 'string' || typeof row.intent === 'string'
        ? { gold_intent: String(row.gold_intent || row.intent).trim() }
        : {}),
      ...(typeof row.gold_need_clarification === 'boolean'
        ? { gold_need_clarification: row.gold_need_clarification }
        : {}),
      ...(Array.isArray(row.messages) ? {
        turns: row.messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content || '').trim()).filter(Boolean),
        system_prompt: typeof row.system_prompt === 'string' ? row.system_prompt : undefined,
      } : {}),
    };
  }).filter((item: RouterCase) => item.question.length > 0);
}

export default function RouterBenchmarkView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cases, setCases] = useState<RouterCase[]>([]);
  const [fileName, setFileName] = useState('');
  const [modes, setModes] = useState<RouterMode[]>(['rule', 'hybrid']);
  const [modelMap, setModelMap] = useState<Record<string, string>>({ GENERAL: '' });
  const [registryModels, setRegistryModels] = useState<Array<{ subject: string; model: string }>>([]);
  const [results, setResults] = useState<Record<string, RouterResult> | null>(null);
  const [running, setRunning] = useState(false);
  const [runningEndToEnd, setRunningEndToEnd] = useState(false);
  const [endToEndReport, setEndToEndReport] = useState<any>(null);

  const overview = useMemo(() => cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.gold_subject] = (acc[item.gold_subject] || 0) + 1;
    return acc;
  }, {}), [cases]);
  const subjects = useMemo(() => [...new Set([...Object.keys(overview), 'GENERAL'])].sort(), [overview]);

  useEffect(() => {
    api.get('/model-registry').then(response => {
      const items = Array.isArray(response.data) ? response.data : [];
      const next = items.flatMap((registry: any) => {
        const active = registry.activeVersion;
        const model = active?.hfRepoId || registry.hfRepoId || '';
        return model && registry.routerEnabled !== false
          ? [{ subject: String(active?.subject || registry.subject || 'GENERAL').toUpperCase(), model }]
          : [];
      });
      setRegistryModels(next);
      setModelMap(current => {
        const updated = { ...current };
        next.forEach(item => { if (!updated[item.subject]) updated[item.subject] = item.model; });
        return updated;
      });
    }).catch(() => undefined);
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const next = extractCases(parsed);
      if (!next.length) throw new Error('Không tìm thấy conversation hoặc cases hợp lệ.');
      setCases(next);
      setFileName(file.name);
      setResults(null);
      setEndToEndReport(null);
      toast.success(`Đã nạp ${next.length} test cases`);
    } catch (error: any) {
      toast.error(error.message || 'Không thể đọc JSON test');
    }
  };

  const toggleMode = (mode: RouterMode) => {
    setModes(current => current.includes(mode)
      ? current.filter(item => item !== mode)
      : [...current, mode]);
  };

  const runBenchmark = async () => {
    if (!cases.length) return toast.error('Hãy upload file test JSON trước.');
    if (!modes.length) return toast.error('Chọn ít nhất một chế độ router.');
    setRunning(true);
    try {
      const response = await api.post('/router/evaluate', {
        cases,
        modes,
        subject_model_map: modelMap,
      });
      setResults(response.data.results || {});
      toast.success('Đã hoàn tất Router Benchmark');
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Router Benchmark thất bại');
    } finally {
      setRunning(false);
    }
  };

  const downloadReport = () => {
    if (!results) return;
    const payload = {
      generated_at: new Date().toISOString(),
      test_file: fileName,
      model_map: modelMap,
      test_distribution: overview,
      cases,
      results,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hybrid-router-benchmark.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadEndToEndReplay = () => {
    if (!endToEndReport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(endToEndReport, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hybrid-router-end-to-end-replay.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runEndToEnd = async () => {
    if (!cases.length) return toast.error('Hãy upload file test JSON trước.');
    setRunningEndToEnd(true);
    try {
      const response = await api.post('/router/end-to-end', {
        cases,
        subject_model_map: modelMap,
        max_new_tokens: 192,
        temperature: 0.2,
      }, { timeout: 900000 });
      setEndToEndReport(response.data);
      toast.success(`Đã sinh replay cho ${response.data.total_conversations} conversations`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'End-to-end Hybrid Eval thất bại');
    } finally {
      setRunningEndToEnd(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 1380, margin: '0 auto', width: '100%', color: '#0f172a' }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><Route color="#4f46e5" /><h1 style={{ margin: 0, fontSize: 25 }}>Hybrid Router Benchmark</h1></div>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Đo router riêng biệt trước khi chuyển replay sang Model Eval để chấm chất lượng sư phạm.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {results && <button className="btn-primary" onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Download size={16} /> Xuất Router Report</button>}
          {endToEndReport && <button className="btn-primary" onClick={downloadEndToEndReplay} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#047857' }}><Download size={16} /> Tải replay D</button>}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={headingStyle}>1. Test set và model map</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) repeat(3, minmax(150px, 1fr))', gap: 14 }}>
          <button onClick={() => fileRef.current?.click()} style={uploadStyle}>
            <FileUp size={22} color="#4f46e5" />
            <span>{fileName || 'Upload test JSON'}</span>
            <small>Nhận file Model Eval: messages + subject</small>
          </button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={event => onFile(event.target.files?.[0])} />
          {subjects.map(subject => <label key={subject} style={labelStyle}>{subject}<select value={modelMap[subject] || ''} onChange={event => setModelMap(prev => ({ ...prev, [subject]: event.target.value }))} style={inputStyle}><option value="">Chọn model registry...</option>{registryModels.filter(item => item.subject === subject || subject === 'GENERAL').map(item => <option key={`${item.subject}-${item.model}`} value={item.model}>{item.model}</option>)}<option value="__manual">Nhập model thủ công...</option></select>{modelMap[subject] === '__manual' && <input placeholder="organization/model" onChange={event => setModelMap(prev => ({ ...prev, [subject]: event.target.value }))} style={inputStyle} />}</label>)}
        </div>
        {cases.length > 0 && <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <Pill label={`${cases.length} total`} />{Object.entries(overview).map(([subject, count]) => <Pill key={subject} label={`${count} ${subject}`} color={subject === 'MATH' ? '#2563eb' : subject === 'PHYSICS' ? '#7c3aed' : '#b45309'} />)}
        </div>}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={headingStyle}>2. Chạy Router</h2>
        <p style={{ color: '#64748b', marginTop: -4 }}>Rule nhanh và rẻ; Hybrid chỉ gọi LLM khi rule không đủ tự tin. Chọn cả hai để có bảng ablation.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['rule', 'llm', 'hybrid'] as RouterMode[]).map(mode => <button key={mode} onClick={() => toggleMode(mode)} style={{ ...modeStyle, ...(modes.includes(mode) ? selectedModeStyle : {}) }}>{modes.includes(mode) && <CheckCircle2 size={15} />} {mode.toUpperCase()}</button>)}
          <button className="btn-primary" disabled={running} onClick={runBenchmark} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{running ? <Loader2 size={16} className="spin" /> : <BarChart3 size={16} />}{running ? 'Đang chạy...' : 'Run Benchmark'}</button>
          <button className="btn-primary" disabled={runningEndToEnd} onClick={runEndToEnd} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#047857' }}>{runningEndToEnd ? <Loader2 size={16} className="spin" /> : <Route size={16} />}{runningEndToEnd ? 'Đang sinh replay...' : 'Run End-to-End Hybrid Eval'}</button>
        </div>
      </section>

      {results && <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={headingStyle}>3. Kết quả Router — báo cáo RP4</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
            <thead><tr>{['Mode', 'Subject accuracy', 'Intent accuracy', 'Exact match', 'Wrong-route', 'Router latency', 'LLM calls', 'Chi phí router'].map(item => <th key={item} style={thStyle}>{item}</th>)}</tr></thead>
            <tbody>{Object.entries(results).map(([mode, result]) => <tr key={mode}>
              <td style={tdStyle}><strong>{mode.toUpperCase()}</strong></td>
              <td style={tdStyle}>{pct(result.primary_subject_accuracy)}</td>
              <td style={tdStyle}>{result.intent_accuracy === null ? '— (chưa gán nhãn)' : pct(result.intent_accuracy)}</td>
              <td style={tdStyle}>{result.exact_match_accuracy === null ? '— (chưa gán nhãn)' : pct(result.exact_match_accuracy)}</td>
              <td style={tdStyle}>{pct(1 - result.primary_subject_accuracy)}</td>
              <td style={tdStyle}>{Math.round(result.avg_router_latency_ms)} ms</td>
              <td style={tdStyle}>{pct(result.llm_call_rate)}</td>
              <td style={tdStyle}>{result.llm_call_rate === 0 ? '0 LLM call' : `${Math.round(result.llm_call_rate * result.total)}/${result.total} LLM calls`}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#eff6ff', color: '#1e3a8a', fontSize: 13, lineHeight: 1.55 }}>
          <strong>Điểm sư phạm, factuality, Overall và latency sinh câu trả lời</strong> không được suy ra từ router. Hãy chạy cùng replay qua <strong>Model Eval</strong> với Gemini Judge; sau đó so sánh điểm A/B/C/D của baseline B, Oracle C và Hybrid D.
        </div>
      </section>}

      {endToEndReport && <section style={{ ...cardStyle, marginTop: 16, borderLeft: '4px solid #059669' }}>
        <h2 style={headingStyle}>4. Replay D đã sẵn sàng cho Gemini Judge</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricGuide icon={<CheckCircle2 size={18} />} title="Conversations" text={`${endToEndReport.total_conversations} conversations đã chạy qua Hybrid Router.`} />
          <MetricGuide icon={<Timer size={18} />} title="Generation latency" text={`${Math.round(endToEndReport.avg_generation_latency_ms)} ms / turn`} />
          <MetricGuide icon={<Route size={18} />} title="Router latency" text={`${Math.round(endToEndReport.avg_router_latency_ms)} ms / turn`} />
        </div>
        <p style={{ margin: '15px 0 0', color: '#475569', lineHeight: 1.5 }}>Tải <strong>replay D</strong> để lưu artefact thực nghiệm. Bước kế tiếp là Gemini Judge chấm các response này theo rubric A1–D2; không dùng điểm Router thay thế điểm sư phạm.</p>
      </section>}

      <section style={{ ...cardStyle, marginTop: 16, borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><ShieldAlert size={19} color="#b45309" /><h2 style={{ ...headingStyle, margin: 0 }}>Cách đọc đúng các tiêu chí</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 15 }}>
          <MetricGuide icon={<Route size={18} />} title="Tính chính xác route" text="Lấy từ Subject accuracy và Wrong-route rate ở màn này." />
          <MetricGuide icon={<Timer size={18} />} title="Tốc độ hệ thống" text="Router latency ở đây + generation latency trong Model Eval." />
          <MetricGuide icon={<Gauge size={18} />} title="Chi phí" text="Số LLM calls là proxy chi phí router. Chi phí suy luận model/tokens lấy từ Model Eval." />
          <MetricGuide icon={<BarChart3 size={18} />} title="Chính xác sư phạm" text="Chỉ dùng rubric Gemini A/B/C/D và Overall của Model Eval." />
        </div>
      </section>
    </main>
  );
}

function Pill({ label, color = '#475569' }: { label: string; color?: string }) { return <span style={{ border: `1px solid ${color}33`, color, background: `${color}0d`, borderRadius: 999, padding: '5px 9px', fontWeight: 700, fontSize: 12 }}>{label}</span>; }
function MetricGuide({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div style={{ border: '1px solid #e2e8f0', padding: 13, borderRadius: 10 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 750 }}>{icon}{title}</div><p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>{text}</p></div>; }
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, boxShadow: '0 3px 14px rgba(15,23,42,.04)' };
const headingStyle: React.CSSProperties = { margin: '0 0 14px', fontSize: 17 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, color: '#475569', fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 11px', fontSize: 13, color: '#0f172a' };
const uploadStyle: React.CSSProperties = { minHeight: 76, border: '1px dashed #818cf8', borderRadius: 10, background: '#f5f7ff', display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 10, textAlign: 'left', padding: 12, color: '#312e81', cursor: 'pointer', fontWeight: 700 };
const modeStyle: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 750, color: '#475569' };
const selectedModeStyle: React.CSSProperties = { color: '#3730a3', borderColor: '#818cf8', background: '#eef2ff' };
const thStyle: React.CSSProperties = { padding: '11px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, background: '#f8fafc' };
const tdStyle: React.CSSProperties = { padding: '12px 10px', borderBottom: '1px solid #eef2f7', fontSize: 13 };
