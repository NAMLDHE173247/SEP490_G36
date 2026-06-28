import React from 'react';
import { AlertTriangle, Bot, CheckCircle2, Loader2, Play, RefreshCw, Search, UserRound } from 'lucide-react';
import { apiService } from '../../services/api';
import { useStage4Data } from '../../hooks/useStage4Data';
import './Stage3AiReview.css';

type Props = { versionId: string | null; samples: any[]; dashboard: any; onRefresh?: () => void };

const resultKey = (result: any) => String(result?.sampleIdRef?._id || result?.sampleId || '');
const staffScoreOf = (result: any) => {
  const value = Number(result?.scores?.human ?? result?.scores?.Human);
  return Number.isFinite(value) ? value : null;
};
const aiScoreOf = (result: any) => {
  const value = Number(result?.averageOverall ?? result?.averageScore);
  return Number.isFinite(value) ? value : null;
};

export const Stage3AiReview: React.FC<Props> = ({ versionId, samples, dashboard, onRefresh }) => {
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [comparison, setComparison] = React.useState<any>(null);
  const [loadingComparison, setLoadingComparison] = React.useState(false);
  const [models, setModels] = React.useState<Record<string, boolean>>({ gemini: true, deepseek: true, openai: false });
  const [starting, setStarting] = React.useState(false);
  const [conflictThreshold, setConflictThreshold] = React.useState(2);
  const { results, latestJob, runMultiEval, refreshData, error } = useStage4Data(versionId);

  const rows = React.useMemo(() => samples.map(sample => {
    const id = String(sample.sampleId || '');
    const result = results.find(item => resultKey(item) === id || String(item.sampleIdRef?.sampleId || '') === String(sample.sampleKey || ''));
    const staff = staffScoreOf(result);
    const ai = aiScoreOf(result);
    const diff = staff != null && ai != null ? Math.abs(staff - ai) : null;
    return { ...sample, id, result, staff, ai, diff, conflict: Boolean(result?.hasConflict) || result?.recommendation === 'Conflict' || (diff != null && diff >= 2) };
  }), [samples, results]);

  const filtered = rows.filter(row => `${row.sampleKey} ${row.preview}`.toLowerCase().includes(query.toLowerCase()));
  const selected = rows.find(row => row.id === selectedId) || filtered[0] || null;
  const submittedStaff = Number(dashboard?.overview?.submittedAssignees || 0);
  const scored = rows.filter(row => row.ai != null).length;
  const compared = rows.filter(row => row.ai != null && row.staff != null).length;
  const conflicts = rows.filter(row => row.conflict).length;
  const running = starting || latestJob?.status === 'running' || latestJob?.status === 'pending';

  React.useEffect(() => {
    if (!selected?.id || !versionId) { setComparison(null); return; }
    let active = true;
    setLoadingComparison(true);
    apiService.getDatasetVersionAssignmentSampleComparison(versionId, selected.id)
      .then(data => { if (active) setComparison(data); })
      .catch(() => { if (active) setComparison(null); })
      .finally(() => { if (active) setLoadingComparison(false); });
    return () => { active = false; };
  }, [selected?.id, versionId]);

  const run = async () => {
    const enabled = Object.entries(models).filter(([, value]) => value).map(([name]) => name);
    if (!versionId || !enabled.length) return;
    setStarting(true);
    try { await runMultiEval(enabled, 'No Context', conflictThreshold); } finally { setStarting(false); }
  };

  const submissions = comparison?.submissions || comparison?.staffSubmissions || comparison?.comparisons || [];

  const total = latestJob?.progress?.total || samples.length || 0;
  const evaluated = latestJob?.progress?.evaluated || results.length || 0;
  const progressPercent = total > 0 ? Math.min(100, Math.round((evaluated / total) * 100)) : 0;

  return <div className="s3-scoring-compact">
    <div className="s3-scoring-head"><div><h3><Bot size={18}/> AI Scoring</h3><p>Chọn mô hình và ngưỡng conflict. Điểm chi tiết được xem tại Quality Review.</p></div><button className="s3-primary" onClick={run} disabled={running || !versionId || Object.values(models).every(v => !v)}>{running ? <><Loader2 className="spin" size={16}/> Đang chấm...</> : <><Play size={16}/> Chạy AI Scoring</>}</button></div>
    <div className="s3-scoring-settings"><div><label>Mô hình chấm điểm</label><div className="s3-models">{Object.keys(models).map(name => <label key={name}><input type="checkbox" checked={models[name]} onChange={() => setModels(old => ({...old, [name]: !old[name]}))}/><span>{name}</span></label>)}</div></div><div className="s3-threshold"><label>Ngưỡng xung đột: <strong>{conflictThreshold.toFixed(1)} điểm</strong></label><input type="range" min="0.5" max="5" step="0.5" value={conflictThreshold} onChange={e => setConflictThreshold(Number(e.target.value))}/><small>Chênh lệch AI–Staff từ mức này sẽ chuyển sang Quality Review.</small></div></div>
    <div className="s3-job-progress"><div><span>Tiến độ chấm</span><strong>{evaluated} / {total} ({progressPercent}%)</strong></div><div className="s3-progress-track"><span style={{width: `${progressPercent}%`}}/></div><small>{latestJob?.status === 'failed' ? latestJob.errorMessage || 'Job thất bại' : latestJob?.status === 'completed' ? `Hoàn tất · ${latestJob.progress?.conflictCount || 0} conflict` : running ? 'Đang xử lý...' : 'Sẵn sàng chạy'}</small></div>
    {error && <div className="s3-error">{error}</div>}
  </div>;

  /* eslint-disable no-unreachable */

  return <div className="s3-review">
    <section className="s3-review-hero">
      <div><span className="s3-eyebrow"><Bot size={15}/> AI CROSS-CHECK</span><h2>Kiểm duyệt nhãn Staff bằng AI</h2><p>AI chấm trên cùng hội thoại, sau đó hệ thống đối chiếu với kết quả Staff để ưu tiên các mẫu cần người quản lý xem lại.</p></div>
      <div className="s3-run-box">
        <div className="s3-models">{Object.keys(models).map(name => <label key={name}><input type="checkbox" checked={models[name]} onChange={() => setModels(old => ({...old, [name]: !old[name]}))}/><span>{name}</span></label>)}</div>
        <button className="s3-primary" onClick={run} disabled={running || !versionId || Object.values(models).every(v => !v)}>{running ? <><Loader2 className="spin" size={16}/> AI đang chấm</> : <><Play size={16}/> Chạy AI chấm điểm</>}</button>
      </div>
    </section>

    <div className="s3-metrics">
      <div><UserRound/><span>Staff đã nộp<strong>{submittedStaff}</strong></span></div>
      <div><Bot/><span>Đã có điểm AI<strong>{scored}/{rows.length}</strong></span></div>
      <div><CheckCircle2/><span>Đã so sánh chéo<strong>{compared}</strong></span></div>
      <div className={conflicts ? 'danger' : ''}><AlertTriangle/><span>Cần review<strong>{conflicts}</strong></span></div>
    </div>

    {error && <div className="s3-error">{error}</div>}
    {!versionId && <div className="s3-empty">Chưa tìm thấy Dataset Version của Project hiện tại.</div>}

    <div className="s3-review-grid">
      <aside className="s3-sample-list">
        <div className="s3-panel-head"><div><h3>Hội thoại</h3><small>{filtered.length} mẫu thật từ dataset</small></div><button title="Làm mới" onClick={() => { onRefresh?.(); refreshData(); }}><RefreshCw size={15}/></button></div>
        <div className="s3-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm ID hoặc nội dung..."/></div>
        <div className="s3-list-scroll">{filtered.map(row => <button key={row.id} className={`s3-sample ${selected?.id === row.id ? 'active' : ''}`} onClick={() => setSelectedId(row.id)}><span className="s3-sample-top"><strong>{row.sampleKey || `Sample ${row.sampleIndex}`}</strong>{row.conflict ? <em className="conflict">Cần review</em> : row.ai != null ? <em className="matched">Đã chấm</em> : <em>Chờ AI</em>}</span><p>{row.preview || 'Không có nội dung xem trước'}</p><small>{row.assignees?.map((u:any) => u.name || u.username).join(', ') || 'Chưa giao Staff'}</small></button>)}</div>
      </aside>

      <main className="s3-detail">
        {!selected ? <div className="s3-empty">Dataset chưa có hội thoại để review.</div> : <>
          <div className="s3-panel-head"><div><h3>{selected.sampleKey || `Sample ${selected.sampleIndex}`}</h3><small>So sánh độc lập giữa Staff và AI</small></div>{selected.conflict ? <span className="s3-verdict conflict"><AlertTriangle size={14}/> Cần Admin review</span> : selected.ai != null && selected.staff != null ? <span className="s3-verdict matched"><CheckCircle2 size={14}/> Kết quả tương đồng</span> : <span className="s3-verdict">Chưa đủ dữ liệu</span>}</div>
          <div className="s3-conversation"><p>{selected.preview || 'Không có nội dung xem trước.'}</p></div>
          <div className="s3-score-row">
            <div><span>Điểm Staff</span><strong>{selected.staff != null ? selected.staff.toFixed(1) : '—'}</strong><small>{selected.staff == null ? 'Staff chưa nộp hoặc chưa có điểm' : 'Điểm quy đổi từ nhãn Staff'}</small></div>
            <div><span>Điểm AI trung bình</span><strong>{selected.ai != null ? selected.ai.toFixed(1) : '—'}</strong><small>{selected.result ? Object.keys(selected.result.modelScores || selected.result.scores || {}).filter(k => k.toLowerCase() !== 'human').join(', ') : 'Chưa chạy AI scoring'}</small></div>
            <div><span>Độ chênh lệch</span><strong className={selected.conflict ? 'red' : ''}>{selected.diff != null ? selected.diff.toFixed(1) : '—'}</strong><small>Ngưỡng cảnh báo: 2.0 điểm</small></div>
          </div>
          <section className="s3-explain"><h4>AI nhận xét</h4><p>{selected.result ? (Object.values(selected.result.modelScores || {}).map((v:any) => v?.reason).filter(Boolean)[0] || 'AI đã chấm điểm nhưng chưa trả về phần giải thích chi tiết.') : 'Bấm “Chạy AI chấm điểm” để nhận điểm và nhận xét cho hội thoại này.'}</p></section>
          <section className="s3-staff-result"><h4>Kết quả Staff đã lưu</h4>{loadingComparison ? <Loader2 className="spin"/> : submissions.length ? submissions.map((item:any, index:number) => <div className="s3-submission" key={item._id || index}><strong>{item.assignee?.name || item.user?.name || item.staffName || `Staff ${index + 1}`}</strong><span>{item.status || 'Đã lưu'}</span><pre>{JSON.stringify(item.labels || item.result || item.decision || {}, null, 2)}</pre></div>) : <p>Chưa có submission chi tiết cho mẫu này.</p>}</section>
        </>}
      </main>
    </div>
  </div>;
};
