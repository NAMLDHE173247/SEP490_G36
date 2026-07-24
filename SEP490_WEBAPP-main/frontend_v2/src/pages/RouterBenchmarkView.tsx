import React, { useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { BarChart3, CheckCircle2, Download, FileUp, Gauge, Loader2, Route, ShieldAlert, Timer } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';

type RouterMode = 'rule' | 'llm' | 'hybrid';
type RouterBenchmarkVariant = RouterMode | 'hybrid_no_history' | 'hybrid_no_previous_subject' | 'hybrid_strict' | 'hybrid_lenient';
type EndToEndCondition = 'pooled' | 'oracle' | 'hybrid';
type RouterCase = {
  id: string;
  question: string;
  gold_subject: string;
  gold_intent?: string;
  gold_need_clarification?: boolean;
  previous_subject?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  turns?: string[];
  turn_gold_subjects?: string[];
  system_prompt?: string;
};

type RouterResult = {
  total: number;
  primary_subject_accuracy: number;
  intent_accuracy: number | null;
  need_clarification_accuracy: number | null;
  exact_match_accuracy: number | null;
  macro_f1: number;
  subject_metrics?: Record<string, { precision: number; recall: number; f1: number; support: number }>;
  confusion_matrix?: Record<string, Record<string, number>>;
  routing_error_breakdown?: Record<string, number>;
  labeled_intent_cases?: number;
  labeled_clarification_cases?: number;
  avg_router_latency_ms: number;
  llm_call_rate: number;
  routing_stability?: number;
  repetitions?: number;
  router_token_usage?: { totalTokens: number; measured_run_coverage: number; avg_total_tokens_per_run: number | null };
  items: Array<any>;
};

const pct = (value?: number) => `${Math.round((value || 0) * 100)}%`;
const subjectMap = (value: unknown): RouterCase['gold_subject'] => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || 'GENERAL';
};

function extractCases(raw: any): RouterCase[] {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.cases)
      ? raw.cases
      : Array.isArray(raw?.router?.test)
        ? raw.router.test
        : Array.isArray(raw?.router_test)
          ? raw.router_test
          : Array.isArray(raw?.model_eval?.test)
            ? raw.model_eval.test
            : [];
  return rows.map((row: any, index: number) => {
    const explicitTurns = Array.isArray(row.turns)
      ? row.turns.map((value: unknown) => String(value || '').trim()).filter(Boolean)
      : [];
    const firstUser = Array.isArray(row.messages)
      ? row.messages.find((message: any) => message?.role === 'user')?.content
      : undefined;
    const messageTurns = Array.isArray(row.messages)
      ? row.messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content || '').trim()).filter(Boolean)
      : [];
    const history = Array.isArray(row.history)
      ? row.history.filter((message: any) => ['user', 'assistant'].includes(message?.role) && String(message?.content || '').trim())
        .map((message: any) => ({ role: message.role as 'user' | 'assistant', content: String(message.content).trim() }))
      : [];
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
      ...(typeof row.previous_subject === 'string'
        ? { previous_subject: subjectMap(row.previous_subject) }
        : {}),
      ...(history.length ? { history } : {}),
      ...((explicitTurns.length || messageTurns.length) ? {
        turns: explicitTurns.length ? explicitTurns : messageTurns,
        system_prompt: typeof row.system_prompt === 'string' ? row.system_prompt : undefined,
      } : {}),
      ...(Array.isArray(row.turn_gold_subjects)
        ? { turn_gold_subjects: row.turn_gold_subjects.map(subjectMap) }
        : {}),
    };
  }).filter((item: RouterCase) => item.question.length > 0);
}

export default function RouterBenchmarkView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cases, setCases] = useState<RouterCase[]>([]);
  const [fileName, setFileName] = useState('');
  const [modes, setModes] = useState<RouterMode[]>(['rule', 'hybrid']);
  const [modelMap, setModelMap] = useState<Record<string, string>>({ GENERAL: '' });
  const [manualModelSubjects, setManualModelSubjects] = useState<Record<string, boolean>>({});
  const [registryModels, setRegistryModels] = useState<Array<{ subject: string; model: string }>>([]);
  const [results, setResults] = useState<Record<string, RouterResult> | null>(null);
  const [benchmarkEnvelope, setBenchmarkEnvelope] = useState<any>(null);
  const [routerRepetitions, setRouterRepetitions] = useState(1);
  const [includeAblations, setIncludeAblations] = useState(false);
  const [endToEndRepetitions, setEndToEndRepetitions] = useState(1);
  const [endToEndConditions, setEndToEndConditions] = useState<EndToEndCondition[]>(['pooled', 'oracle', 'hybrid']);
  const [running, setRunning] = useState(false);
  const [runningEndToEnd, setRunningEndToEnd] = useState(false);
  const [endToEndReport, setEndToEndReport] = useState<any>(null);

  const overview = useMemo(() => cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.gold_subject] = (acc[item.gold_subject] || 0) + 1;
    return acc;
  }, {}), [cases]);
  const subjects = useMemo(() => Object.keys(overview).sort(), [overview]);
  const scopedModelMap = useMemo(() => Object.fromEntries(
    Object.entries(modelMap).filter(([subject]) => subjects.includes(subject) || subject === 'GENERAL'),
  ), [modelMap, subjects]);

  const selectModel = (subject: string, value: string) => {
    const manual = value === '__manual';
    setManualModelSubjects(current => ({ ...current, [subject]: manual }));
    setModelMap(current => ({ ...current, [subject]: manual ? '' : value }));
  };

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

  // Data Prep can publish an Evaluation Pack to browser storage. Load its
  // router test partition automatically so the user does not need to create
  // and upload an intermediate JSON file by hand.
  useEffect(() => {
    try {
      const rawPack = localStorage.getItem('hybrid_evaluation_pack_v1');
      if (!rawPack) return;
      const pack = JSON.parse(rawPack);
      const next = extractCases(pack?.router?.test || pack?.router_test || pack?.cases);
      if (!next.length) return;
      setCases(next);
      setFileName(`Evaluation Pack · ${pack.dataset_version_id || 'Data Prep'}`);
      setResults(null);
      setBenchmarkEnvelope(null);
      setEndToEndReport(null);
      toast.success(`Đã tự nạp ${next.length} test cases từ Evaluation Pack`);
    } catch (error) {
      console.warn('[Router Benchmark] Could not load Data Prep Evaluation Pack:', error);
    }
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      let parsed: any;
      if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
        const zip = await JSZip.loadAsync(file);
        const candidates = ['router_test.json', 'model_eval_test.json', 'test_dataset.json'];
        const selectedName = candidates.find(name => zip.file(name))
          || Object.keys(zip.files).find(name => candidates.some(candidate => name.toLowerCase().endsWith(`/${candidate}`)));
        const selectedFile = selectedName ? zip.file(selectedName) : null;
        if (!selectedFile) throw new Error('ZIP không chứa router_test.json, model_eval_test.json hoặc test_dataset.json.');
        parsed = JSON.parse(await selectedFile.async('text'));
      } else {
        parsed = JSON.parse(await file.text());
      }
      const next = extractCases(parsed);
      if (!next.length) throw new Error('Không tìm thấy conversation hoặc cases hợp lệ.');
      setCases(next);
      setFileName(file.name);
      setResults(null);
      setBenchmarkEnvelope(null);
      setEndToEndReport(null);
      toast.success(`Đã nạp ${next.length} test cases`);
    } catch (error: any) {
      toast.error(error.message || 'Không thể đọc Evaluation Pack ZIP hoặc JSON test');
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
      const benchmarkModes: RouterBenchmarkVariant[] = [
        ...modes,
        ...(includeAblations
          ? ['hybrid_no_history', 'hybrid_no_previous_subject', 'hybrid_strict', 'hybrid_lenient'] as RouterBenchmarkVariant[]
          : []),
      ];
      const response = await api.post('/router/evaluate', {
        cases,
        modes: [...new Set(benchmarkModes)],
        repetitions: routerRepetitions,
        subject_model_map: scopedModelMap,
      });
      setResults(response.data.results || {});
      setBenchmarkEnvelope(response.data);
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
      model_map: scopedModelMap,
      test_distribution: overview,
      cases,
      results,
      evaluation_manifest: benchmarkEnvelope?.evaluation_manifest || null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    saveAs(blob, 'hybrid-router-benchmark.json');
  };

  const downloadEndToEndReplay = () => {
    if (!endToEndReport) return;
    const blob = new Blob([JSON.stringify(endToEndReport, null, 2)], { type: 'application/json' });
    saveAs(blob, 'hybrid-router-end-to-end-replay.json');
  };

  const runEndToEnd = async () => {
    if (!endToEndConditions.length) return toast.error('Select at least one end-to-end condition.');
    if (!cases.length) return toast.error('Hãy upload file test JSON trước.');
    setRunningEndToEnd(true);
    try {
      const response = await api.post('/router/end-to-end', {
        cases,
        conditions: endToEndConditions,
        repetitions: endToEndRepetitions,
        subject_model_map: scopedModelMap,
        pooled_model_id: scopedModelMap.GENERAL,
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

  const toggleEndToEndCondition = (condition: EndToEndCondition) => {
    setEndToEndConditions(current => current.includes(condition)
      ? current.filter(value => value !== condition)
      : [...current, condition]);
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
            <span>{fileName || 'Upload Evaluation Pack ZIP hoặc test JSON'}</span>
            <small>Nhận ZIP có router_test.json hoặc JSON có cases</small>
          </button>
          <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={event => onFile(event.target.files?.[0])} />
          {subjects.map(subject => <label key={subject} style={labelStyle}>{subject}<select value={manualModelSubjects[subject] ? '__manual' : modelMap[subject] || ''} onChange={event => selectModel(subject, event.target.value)} style={inputStyle}><option value="">Chọn model registry...</option>{registryModels.filter(item => item.subject === subject || subject === 'GENERAL').map(item => <option key={`${item.subject}-${item.model}`} value={item.model}>{item.model}</option>)}<option value="__manual">Nhập model thủ công...</option></select>{manualModelSubjects[subject] && <input value={modelMap[subject] || ''} placeholder="organization/model" onChange={event => setModelMap(prev => ({ ...prev, [subject]: event.target.value }))} style={inputStyle} />}</label>)}
        </div>
        {endToEndConditions.includes('pooled') && <label style={{ ...labelStyle, maxWidth: 320, marginTop: 14 }}>POOLED BASELINE (E2E)<select value={manualModelSubjects.GENERAL ? '__manual' : modelMap.GENERAL || ''} onChange={event => selectModel('GENERAL', event.target.value)} style={inputStyle}><option value="">Chọn model pooled...</option>{registryModels.map(item => <option key={`pooled-${item.subject}-${item.model}`} value={item.model}>{item.model}</option>)}<option value="__manual">Nhập model thủ công...</option></select>{manualModelSubjects.GENERAL && <input value={modelMap.GENERAL || ''} placeholder="organization/model" onChange={event => setModelMap(prev => ({ ...prev, GENERAL: event.target.value }))} style={inputStyle} />}</label>}
        {cases.length > 0 && <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <Pill label={`${cases.length} total`} />{Object.entries(overview).map(([subject, count]) => <Pill key={subject} label={`${count} ${subject}`} color={subject === 'MATH' ? '#2563eb' : subject === 'PHYSICS' ? '#7c3aed' : '#b45309'} />)}
        </div>}
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={headingStyle}>2. Chạy Router</h2>
        <p style={{ color: '#64748b', marginTop: -4 }}>Rule nhanh và rẻ; Hybrid chỉ gọi LLM khi rule không đủ tự tin. Chọn cả hai để có bảng ablation.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['rule', 'llm', 'hybrid'] as RouterMode[]).map(mode => <button key={mode} onClick={() => toggleMode(mode)} style={{ ...modeStyle, ...(modes.includes(mode) ? selectedModeStyle : {}) }}>{modes.includes(mode) && <CheckCircle2 size={15} />} {mode.toUpperCase()}</button>)}
          <label style={compactLabel}>Router repeats<select value={routerRepetitions} onChange={event => setRouterRepetitions(Number(event.target.value))} style={smallInput}><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></label>
          <label style={{ ...compactLabel, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={includeAblations} onChange={event => setIncludeAblations(event.target.checked)} /> Ablations</label>
          <button className="btn-primary" disabled={running} onClick={runBenchmark} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{running ? <Loader2 size={16} className="spin" /> : <BarChart3 size={16} />}{running ? 'Đang chạy...' : 'Run Benchmark'}</button>
          <span style={{ color: '#94a3b8' }}>|</span>
          {(['pooled', 'oracle', 'hybrid'] as EndToEndCondition[]).map(condition => <button key={condition} onClick={() => toggleEndToEndCondition(condition)} style={{ ...modeStyle, ...(endToEndConditions.includes(condition) ? endConditionStyle : {}) }}>{endToEndConditions.includes(condition) && <CheckCircle2 size={15} />} {condition.toUpperCase()}</button>)}
          <label style={compactLabel}>E2E repeats<select value={endToEndRepetitions} onChange={event => setEndToEndRepetitions(Number(event.target.value))} style={smallInput}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
          <button className="btn-primary" disabled={runningEndToEnd} onClick={runEndToEnd} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#047857' }}>{runningEndToEnd ? <Loader2 size={16} className="spin" /> : <Route size={16} />}{runningEndToEnd ? 'Đang sinh replay...' : 'Run End-to-End RP5'}</button>
        </div>
      </section>

      {results && <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={headingStyle}>3. Kết quả Router — báo cáo RP4</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
            <thead><tr>{['Mode', 'Subject accuracy', 'Macro-F1', 'Intent accuracy', 'Exact match', 'Wrong-route', 'Router latency', 'LLM call rate', 'Router LLM calls', 'Stability', 'Router tokens'].map(item => <th key={item} style={thStyle}>{item}</th>)}</tr></thead>
            <tbody>{Object.entries(results).map(([mode, result]) => <tr key={mode}>
              <td style={tdStyle}><strong>{mode.toUpperCase()}</strong></td>
              <td style={tdStyle}>{pct(result.primary_subject_accuracy)}</td>
              <td style={tdStyle}>{pct(result.macro_f1)}</td>
              <td style={tdStyle}>{result.intent_accuracy === null ? '— (chưa gán nhãn)' : pct(result.intent_accuracy)}</td>
              <td style={tdStyle}>{result.exact_match_accuracy === null ? '— (chưa gán nhãn)' : pct(result.exact_match_accuracy)}</td>
              <td style={tdStyle}>{pct(1 - result.primary_subject_accuracy)}</td>
              <td style={tdStyle}>{Math.round(result.avg_router_latency_ms)} ms</td>
              <td style={tdStyle}>{pct(result.llm_call_rate)}</td>
              <td style={tdStyle}>{result.llm_call_rate === 0 ? '0 LLM call' : `${Math.round(result.llm_call_rate * result.total)}/${result.total} LLM calls`}</td>
              <td style={tdStyle}>{result.routing_stability == null ? '—' : pct(result.routing_stability)}</td>
              <td style={tdStyle}>{result.router_token_usage?.avg_total_tokens_per_run == null ? '—' : `${Math.round(result.router_token_usage.avg_total_tokens_per_run)} / run`}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {Object.entries(results).map(([mode, result]) => <div key={`${mode}-details`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 13 }}>
            <strong>{mode.toUpperCase()} per-subject metrics</strong>
            {Object.entries(result.subject_metrics || {}).map(([subject, metric]) => <div key={subject} style={{ marginTop: 8, fontSize: 12, color: '#475569' }}><b>{subject}</b>: P {pct(metric.precision)} · R {pct(metric.recall)} · F1 {pct(metric.f1)} · n={metric.support}</div>)}
            {Object.keys(result.routing_error_breakdown || {}).length > 0 && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 12 }}>Errors: {Object.entries(result.routing_error_breakdown || {}).map(([key, count]) => `${key}=${count}`).join(', ')}</div>}
          </div>)}
        </div>
        <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#eff6ff', color: '#1e3a8a', fontSize: 13, lineHeight: 1.55 }}>
          <strong>Điểm sư phạm, factuality, Overall và latency sinh câu trả lời</strong> không được suy ra từ router. Hãy chạy cùng replay qua <strong>Model Eval</strong> với Gemini Judge; sau đó so sánh điểm A/B/C/D của baseline B, Oracle C và Hybrid D.
        </div>
      </section>}

      {endToEndReport && <section style={{ ...cardStyle, marginTop: 16, borderLeft: '4px solid #059669' }}>
        <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          {Object.entries(endToEndReport.conditions || {}).map(([condition, value]: [string, any]) => <div key={condition} style={{ border: '1px solid #d1fae5', borderRadius: 9, padding: 12, background: '#f0fdf4' }}>
            <strong>{condition.toUpperCase()}</strong>
            <div style={{ marginTop: 7, fontSize: 12, color: '#475569' }}>E2E: {Math.round(value.summary?.avg_end_to_end_latency_ms || 0)} ms · TTFT: {value.summary?.avg_ttft_ms == null ? '—' : `${Math.round(value.summary.avg_ttft_ms)} ms`}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>Router: {Math.round(value.summary?.avg_router_latency_ms || 0)} ms · Switch/load: {Math.round(value.summary?.avg_model_switch_latency_ms || 0)} ms · Generation: {Math.round(value.summary?.avg_generation_latency_ms || 0)} ms</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>Cache hit: {pct(value.summary?.model_cache?.cache_hit_rate)} · Evictions: {Math.round(value.summary?.model_cache?.evictions || 0)} · CV latency: {value.summary?.end_to_end_latency_cv == null ? '—' : value.summary.end_to_end_latency_cv.toFixed(3)}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>Response stability: {value.summary?.response_stability_jaccard == null ? '—' : pct(value.summary.response_stability_jaccard)} · Tokens: {Math.round(value.summary?.generation_token_usage?.total_tokens || 0)}</div>
          </div>)}
        </div>
        <h2 style={headingStyle}>4. Replay D đã sẵn sàng cho Gemini Judge</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <MetricGuide icon={<CheckCircle2 size={18} />} title="Conversations" text={`${endToEndReport.total_conversations} conversations đã chạy qua Hybrid Router.`} />
          <MetricGuide icon={<Timer size={18} />} title="End-to-End / TTFT" text={`${Math.round(endToEndReport.avg_end_to_end_latency_ms || 0)} ms E2E · ${endToEndReport.avg_ttft_ms == null ? 'TTFT chưa đo' : `${Math.round(endToEndReport.avg_ttft_ms)} ms TTFT`}`} />
          <MetricGuide icon={<Gauge size={18} />} title="Model switch/load" text={`${Math.round(endToEndReport.avg_model_switch_latency_ms || 0)} ms / generation call`} />
          <MetricGuide icon={<Route size={18} />} title="Router latency" text={`${Math.round(endToEndReport.avg_router_latency_ms)} ms / turn`} />
        </div>
        <p style={{ margin: '15px 0 0', color: '#475569', lineHeight: 1.5 }}>Tải <strong>replay D</strong> để lưu artefact thực nghiệm. Bước kế tiếp là Gemini Judge chấm các response này theo rubric A1–D2; không dùng điểm Router thay thế điểm sư phạm.</p>
      </section>}

      <section style={{ ...cardStyle, marginTop: 16, borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><ShieldAlert size={19} color="#b45309" /><h2 style={{ ...headingStyle, margin: 0 }}>Cách đọc đúng các tiêu chí</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 15 }}>
          <MetricGuide icon={<Route size={18} />} title="Tính chính xác route" text="Lấy từ Subject accuracy và Wrong-route rate ở màn này." />
          <MetricGuide icon={<Timer size={18} />} title="Tốc độ hệ thống" text="Dùng E2E latency và TTFT; tách riêng Router, model switch/load và generation/decode." />
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
const compactLabel: React.CSSProperties = { display: 'grid', gap: 4, color: '#64748b', fontSize: 11, fontWeight: 700 };
const smallInput: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: '#0f172a' };
const endConditionStyle: React.CSSProperties = { color: '#047857', borderColor: '#34d399', background: '#ecfdf5' };
const headingStyle: React.CSSProperties = { margin: '0 0 14px', fontSize: 17 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 6, color: '#475569', fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 11px', fontSize: 13, color: '#0f172a' };
const uploadStyle: React.CSSProperties = { minHeight: 76, border: '1px dashed #818cf8', borderRadius: 10, background: '#f5f7ff', display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 10, textAlign: 'left', padding: 12, color: '#312e81', cursor: 'pointer', fontWeight: 700 };
const modeStyle: React.CSSProperties = { border: '1px solid #cbd5e1', background: '#fff', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 750, color: '#475569' };
const selectedModeStyle: React.CSSProperties = { color: '#3730a3', borderColor: '#818cf8', background: '#eef2ff' };
const thStyle: React.CSSProperties = { padding: '11px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, background: '#f8fafc' };
const tdStyle: React.CSSProperties = { padding: '12px 10px', borderBottom: '1px solid #eef2f7', fontSize: 13 };
