import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Inbox, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { stage4Api } from '../services/stage4Api';
import '../styles/checkerreview.css';

export default function CheckerRewriteView() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await stage4Api.listMyRewriteAssignments();
      setTasks(response.tasks || []);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không tải được queue rewrite.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const allPending = useMemo(() => tasks.filter(task => ['submitted', 'checker_approved'].includes(String(task.status))), [tasks]);
  const allResolved = useMemo(() => tasks.filter(task => ['approved', 'rejected'].includes(String(task.status))), [tasks]);
  const projects = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; dataset: string; version: string; tasks: any[] }>();
    tasks.forEach(task => {
      const id = String(task.datasetVersionId || 'unknown');
      if (!grouped.has(id)) grouped.set(id, {
        id,
        name: task.projectName || task.sourceTaskName || 'Dự án chưa đặt tên',
        dataset: task.sourceDataset || task.dataset || 'Dataset',
        version: task.sourceVersion || task.versionName || '',
        tasks: [],
      });
      grouped.get(id)!.tasks.push(task);
    });
    return Array.from(grouped.values()).sort((a, b) => {
      const pendingA = a.tasks.filter(task => ['submitted', 'checker_approved'].includes(String(task.status))).length;
      const pendingB = b.tasks.filter(task => ['submitted', 'checker_approved'].includes(String(task.status))).length;
      if ((pendingA > 0) !== (pendingB > 0)) return pendingA > 0 ? -1 : 1;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [tasks]);
  const pending = useMemo(() => allPending.filter(task => String(task.datasetVersionId) === selectedProjectId), [allPending, selectedProjectId]);
  const resolved = useMemo(() => allResolved.filter(task => String(task.datasetVersionId) === selectedProjectId), [allResolved, selectedProjectId]);
  const visible = useMemo(() => {
    const source = tab === 'pending' ? pending : resolved;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(task => `${task.convId} ${task.staffName} ${task.reason} ${task.submittedText}`.toLowerCase().includes(needle));
  }, [tab, pending, resolved, query]);

  const review = async (action: 'approved' | 'redo') => {
    if (!selected) return;
    if (action === 'redo' && !note.trim()) { toast.error('Cần nhập lý do giao lại.'); return; }
    setSubmitting(true);
    try {
      await stage4Api.reviewRewrite(selected.datasetVersionId, selected.id, action, note.trim() || 'Checker approved');
      toast.success(action === 'approved' ? 'Đã duyệt bản rewrite.' : 'Đã giao lại cho Staff.');
      setSelected(null); setNote(''); await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không lưu được quyết định.');
    } finally { setSubmitting(false); }
  };

  if (selected) {
    return (
      <main className="checker-rewrite-page">
        <header className="checker-rewrite-page-header">
          <button onClick={() => { setSelected(null); setNote(''); }}><ArrowLeft size={17}/> Quay lại queue</button>
          <div><span>CHECKER REWRITE</span><h1>Kiểm duyệt #{String(selected.convId || selected.id).slice(0, 12)}</h1></div>
          <span className={`rewrite-status ${selected.status === 'approved' ? 'approved' : 'pending'}`}>{selected.status}</span>
        </header>

        <div className="checker-rewrite-page-content">
          <section className="checker-rewrite-summary">
            <div><small>Task gốc</small><strong>{selected.sourceTaskName || selected.projectName || 'Rewrite task'}</strong></div>
            <div><small>Staff</small><strong>{selected.staffName || 'Staff'}</strong></div>
            <div><small>Lý do</small><strong>{selected.reason || 'Quality Review'}</strong><span>{selected.reasonSource || 'Quality Review'}</span></div>
          </section>

          <section className="checker-rewrite-context-card">
            <div className="section-heading"><h2>Ngữ cảnh hội thoại</h2><span>Câu viền cam là mục tiêu rewrite</span></div>
            <div className="checker-rewrite-messages">
              {(selected.conversationMessages || []).map((message: any, index: number) => (
                <article key={index} className={`${message.role} ${message.isTarget ? 'target' : ''}`}>
                  <small>{message.role === 'assistant' ? 'AI Tutor' : 'Học sinh'}{message.isTarget ? ' · MỤC TIÊU' : ''}</small>
                  <p>{message.content}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="checker-rewrite-comparison">
            <article className="before"><small>TRƯỚC · AI GỐC</small><p>{selected.originalText}</p></article>
            <article className="after"><small>SAU · STAFF REWRITE</small><p>{selected.submittedText}</p></article>
          </section>

          {tab === 'pending' && <section className="checker-rewrite-decision">
            <label>Nhận xét kiểm duyệt</label>
            <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Nêu rõ điểm đạt hoặc nội dung Staff cần sửa lại..." />
          </section>}
        </div>

        {tab === 'pending' && <footer className="checker-rewrite-actionbar">
          <button className="reject" disabled={submitting || !note.trim()} onClick={() => void review('redo')}><XCircle size={17}/> Giao lại</button>
          <button className="approve" disabled={submitting} onClick={() => void review('approved')}><CheckCircle2 size={17}/> Duyệt và công bố</button>
        </footer>}
      </main>
    );
  }

  if (!selectedProjectId) {
    return (
      <main className="sv-page checker-rewrite-project-page">
        <header className="sv-header compact">
          <div><h1><ShieldCheck size={24}/> Trung tâm kiểm duyệt Rewrite</h1><p>Chọn dự án để kiểm tra các bản Staff đã viết lại.</p></div>
          <button className="sv-button secondary" onClick={() => void load()}><RefreshCw size={16} className={loading ? 'sv-spin' : ''}/> Tải lại</button>
        </header>
        <section className="sv-kpis rewrite-overview-kpis">
          <article className="kpi-card"><span className="sv-kpi-icon accent"><Inbox size={20}/></span><div><strong>{projects.length}</strong><span>Dự án có rewrite</span></div></article>
          <article className="kpi-card"><span className="sv-kpi-icon danger"><RefreshCw size={20}/></span><div><strong>{allPending.length}</strong><span>Chờ kiểm duyệt</span></div></article>
          <article className="kpi-card"><span className="sv-kpi-icon success"><CheckCircle2 size={20}/></span><div><strong>{allResolved.length}</strong><span>Đã chốt</span></div></article>
        </section>
        {projects.length === 0 ? <div className="sv-state empty-state"><Inbox size={46}/><h3>Chưa có dự án rewrite</h3></div> :
          <section className="rewrite-project-grid">{projects.map(project => {
            const pendingCount = project.tasks.filter(task => ['submitted', 'checker_approved'].includes(String(task.status))).length;
            const resolvedCount = project.tasks.filter(task => ['approved', 'rejected'].includes(String(task.status))).length;
            return <article key={project.id} className="rewrite-project-card" onClick={() => { setSelectedProjectId(project.id); setTab(pendingCount ? 'pending' : 'resolved'); }}>
              <span className="project-tag">REWRITE PROJECT</span><h2>{project.name}</h2><p>{project.dataset}{project.version ? ` · ${project.version}` : ''}</p>
              <div><span><strong>{pendingCount}</strong> Chờ duyệt</span><span><strong>{resolvedCount}</strong> Đã chốt</span><span><strong>{project.tasks.length}</strong> Tổng</span></div>
              <button>Mở project →</button>
            </article>;
          })}</section>}
      </main>
    );
  }

  const currentProject = projects.find(project => project.id === selectedProjectId);
  return (
    <main className="sv-page checker-rewrite-queue-page">
      <header className="sv-header compact">
        <div><button className="back-btn" onClick={() => { setSelectedProjectId(null); setQuery(''); }}><ArrowLeft size={16}/> Danh sách project</button><h1><ShieldCheck size={24}/> {currentProject?.name || 'Kiểm duyệt Rewrite'}</h1><p>{currentProject?.dataset}{currentProject?.version ? ` · ${currentProject.version}` : ''}</p></div>
        <button className="sv-button secondary" onClick={() => void load()}><RefreshCw size={16} className={loading ? 'sv-spin' : ''}/> Tải lại</button>
      </header>
      <div className="sv-workspace-tabs rewrite-main-tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Chờ kiểm duyệt <span>{pending.length}</span></button>
        <button className={tab === 'resolved' ? 'active' : ''} onClick={() => setTab('resolved')}>Đã chốt <span>{resolved.length}</span></button>
      </div>
      <section className="sv-queue">
        <div className="rewrite-queue-header"><div><h3>{tab === 'pending' ? 'Rewrite chờ duyệt' : 'Lịch sử rewrite'}</h3></div><label className="sv-search rewrite-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm task, Staff, nội dung..."/></label></div>
        {!loading && visible.length === 0 ? <div className="sv-state empty-state"><Inbox size={42}/><h3>Không có task phù hợp</h3></div> :
          <div className="rewrite-table-wrap"><table className="rewrite-table"><thead><tr><th>Task / Sample</th><th>Staff</th><th>Lý do</th><th>Bản rewrite</th><th>Trạng thái</th><th></th></tr></thead><tbody>
            {visible.map(task => <tr key={task.id}><td><strong>{task.sourceTaskName || task.projectName || 'Rewrite task'}</strong><br/><small>#{String(task.convId || task.id).slice(0, 10)}</small></td><td>{task.staffName || 'Staff'}</td><td><span className="rewrite-reason">{task.reason || 'Quality Review'}</span></td><td><p className="rewrite-preview">{task.submittedText}</p></td><td><span className={`rewrite-status ${task.status === 'approved' ? 'approved' : task.status === 'rejected' ? 'redo' : 'pending'}`}>{task.status}</span></td><td><button className="sv-open-btn" onClick={() => { setSelected(task); setNote(''); }}>Mở chi tiết</button></td></tr>)}
          </tbody></table></div>}
      </section>
    </main>
  );
}
