import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Filter, Inbox, Info, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { api, type AssignmentConflictItem } from '../services/api';
import { stage4Api } from '../services/stage4Api';
import SupervisorConflictDialog from '../components/SupervisorConflictDialog';
import SupervisorAiConflictDialog from '../components/SupervisorAiConflictDialog';
import '../styles/supervisorreview.css';

type QueueItem = AssignmentConflictItem & {
  versionId:string; taskName:string; datasetName:string; task:any;
  resultId?:string; modelScores?:any; humanScore?:number|null; sampleData?:any;
  averageOverall?:number|null; severity?:number;
};
type ReviewRow = {
  assignmentId:string; sampleIndex:number; sampleId:string; versionId:string; projectId:string;
  assigneeName:string; reviewStatus:string; preview:string; label:any; taskName:string; datasetName:string;
};
type Props = { onOpenTask:(task:any, batchId?:string|null)=>void };
const PAGE_SIZE = 8;

export default function SupervisorReviewView({ onOpenTask:_onOpenTask }:Props) {
  const [items,setItems]=useState<QueueItem[]>([]);
  const [reviewRows,setReviewRows]=useState<ReviewRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<'all'|AssignmentConflictItem['status']>('pending');
  const [sortBy,setSortBy]=useState<'severity'|'deadline'>('severity');
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<QueueItem|null>(null);

  const loadQueue=async(silent=false)=>{
    if(!silent)setLoading(true); setError(null);
    try {
      const overview=await api.get('/dataprep/assignments/manager/overview');
      const tasks=overview.data?.success ? overview.data.data??[] : [];
      // Do not block the Supervisor screen on large tasks that are still being
      // labeled. They cannot have a final Staff conflict yet.
      // Ask the conflict endpoint for every version. The overview batch status is
      // only a summary and must not hide overlaps submitted by another assignee.
      const reviewableTasks=Array.from(new Map(tasks.map((task:any)=>[
        String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0],task
      ])).values()) as any[];
      const results=await Promise.allSettled(reviewableTasks.map(async(task:any)=>{
        const versionId=String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0];
        if(!versionId)return [];
        const staffConflictResponse=await api.get(`/dataprep/versions/${versionId}/assignments/conflicts`);
        const common={versionId,taskName:task.name||task.taskName||'Task chưa đặt tên',datasetName:task.dataset||task.datasetName||task.projectName||'Dataset',task};
        const staffItems:QueueItem[]=(staffConflictResponse.data?.conflicts||[]).map((conflict:any)=>({...conflict,...common}));
        return staffItems;
      }));
      const reviewResults=await Promise.allSettled(reviewableTasks.map(async(task:any)=>{
        const versionId=String(task.datasetVersionId||task.versionId||task.version||task._id||task.id||'').split('_')[0];
        if(!versionId)return [];
        const res=await api.get('/dataprep/assignments/review-queue',{params:{versionId,status:'submitted',limit:100}});
        const rows=(res.data?.data||[]) as any[];
        return rows.map(row=>({
          ...row,
          taskName:task.name||task.taskName||'Task chua dat ten',
          datasetName:task.dataset||task.datasetName||task.projectName||'Dataset',
        })) as ReviewRow[];
      }));
      const merged=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
      const unique=Array.from(new Map(merged.map(item=>[`${item.versionId}-${item.sampleId}`,item])).values());
      const submittedRows=reviewResults.flatMap(result=>result.status==='fulfilled'?result.value:[]);
      const uniqueRows=Array.from(new Map(submittedRows.map(row=>[row.assignmentId,row])).values());
      unique.sort((a,b)=>{
        if(a.status!==b.status)return a.status==='pending'?-1:b.status==='pending'?1:0;
        if(sortBy==='deadline') {
          const dA=new Date(a.task?.dueDate||'2099-01-01').getTime();
          const dB=new Date(b.task?.dueDate||'2099-01-01').getTime();
          if(dA!==dB) return dA-dB;
        }
        const severityA=1-Number(a.agreementScore??1);
        const severityB=1-Number(b.agreementScore??1);
        return severityB-severityA;
      });
      setItems(unique);
      setReviewRows(uniqueRows);
    } catch(err:any) {
      setError(err.response?.data?.error||err.message||'Không thể tải danh sách cần quyết định.');
    } finally { setLoading(false); }
  };

  useEffect(()=>{
    void loadQueue();
    const timer=window.setInterval(()=>{void loadQueue(true);},30000);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{setPage(1);},[query,status,sortBy]);
  const filtered=useMemo(()=>{
    const filteredItems=items.filter(item=>(status==='all'||item.status===status)&&`${item.taskName} ${item.datasetName} ${item.sampleKey} ${item.sampleIndex}`.toLowerCase().includes(query.trim().toLowerCase()));
    return filteredItems;
  },[items,query,status,sortBy]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages);
  const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const pending=items.filter(i=>i.status==='pending').length;
  const resolved=items.length-pending;
  const reviewSubmitted=reviewRows.length;

  const reviewSample=async(row:ReviewRow,action:'approve'|'reject')=>{
    let reason='';
    if(action==='reject'){
      reason=window.prompt('Ly do tu choi hien cho staff:', '') || '';
      if(!reason.trim())return;
    }
    try{
      await api.post('/dataprep/assignments/samples/review',{assignmentIds:[row.assignmentId],action,reason});
      await loadQueue(true);
    }catch(err:any){
      setError(err.response?.data?.error||err.message||'Khong the cap nhat trang thai cau da nop.');
    }
  };

  return <main className="sv-page">
    <header className="sv-header compact"><div><h1><ShieldCheck size={23}/> Trung tâm quyết định chất lượng</h1><p>Kiểm tra những mẫu có kết quả không thống nhất và chọn kết quả cuối cùng.</p></div><button className="sv-button secondary" onClick={()=>{void loadQueue(false);}}><RefreshCw size={16} className={loading?'sv-spin':''}/> Tải lại</button></header>
    <section className="sv-guide"><Info size={20}/><div><strong>Giải quyết xung đột Staff vs Staff</strong><p>Hai kết quả cần được đối chiếu; nếu cả hai đều phù hợp, có thể giữ cả hai làm nhãn cuối. Hoặc có thể chọn kết quả phù hợp hơn.</p></div></section>
    <section className="sv-kpis"><article><span className="sv-kpi-icon warning"><AlertTriangle size={20}/></span><div><strong>{pending}</strong><span>Can quyet dinh</span></div></article><article><span className="sv-kpi-icon warning"><Clock3 size={20}/></span><div><strong>{reviewSubmitted}</strong><span>Cau staff da nop</span></div></article><article><span className="sv-kpi-icon success"><CheckCircle2 size={20}/></span><div><strong>{resolved}</strong><span>Da xu ly</span></div></article></section>
    {reviewRows.length>0&&<section className="sv-queue">
      <div className="sv-queue-head"><div><h2>Cau staff da nop cho duyet</h2><p>{reviewRows.length} cau nop le khong can xung dot Staff-vs-Staff</p></div></div>
      <div className="sv-list">{reviewRows.slice(0,12).map(row=><article className="sv-card sleek-card" key={row.assignmentId}>
        <div className="sv-card-main"><div className="sv-card-header"><span className="sv-status-dot pending"></span><h3 className="sv-card-title">Cau #{row.sampleIndex}: {row.taskName}</h3></div><div className="sv-card-details"><span className="sv-dataset-name">{row.datasetName}</span><span className="sv-bullet">?</span><span className="sv-metric-text">{row.assigneeName}</span><span className="sv-bullet">?</span><span className="sv-metric-text">{row.preview}</span></div></div>
        <div style={{display:'flex',gap:8}}><button className="sv-open-btn" onClick={()=>reviewSample(row,'approve')}>Duyet</button><button className="sv-button secondary" onClick={()=>reviewSample(row,'reject')}>Tu choi</button></div>
      </article>)}</div>
    </section>}
    <section className="sv-queue">

      <div className="sv-queue-head"><div><h2>Danh sách cần kiểm tra</h2><p>{filtered.length} mẫu · trang {safePage}/{totalPages}</p></div><div className="sv-controls"><label className="sv-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm task, dataset, sample..."/></label><label className="sv-select"><Filter size={16}/><select value={sortBy} onChange={e=>{setSortBy(e.target.value as any);loadQueue(true);}}><option value="severity">Ưu tiên mức độ lệch</option><option value="deadline">Ưu tiên deadline</option></select></label><label className="sv-select"><select value={status} onChange={e=>setStatus(e.target.value as any)}><option value="all">Mọi trạng thái</option><option value="pending">Cần quyết định</option><option value="resolved_unpublished">Đã lưu nháp</option><option value="published">Đã chốt</option></select></label></div></div>
      {loading?<div className="sv-skeletons">{[1,2,3].map(i=><div key={i} className="sv-skeleton"/>)}</div>:error?<div className="sv-state error"><AlertTriangle size={28}/><h3>Không tải được danh sách</h3><p>{error}</p><button className="sv-button" onClick={()=>void loadQueue()}>Thử lại</button></div>:visible.length===0?<div className="sv-state"><Inbox size={32}/><h3>Không có mẫu phù hợp</h3><p>Hãy đổi bộ lọc hoặc chờ Staff hoàn tất đánh giá.</p></div>:<div className="sv-list">{visible.map(item=>{const severity=1-Number(item.agreementScore??1);const deadlineStr=item.task?.dueDate ? new Date(item.task.dueDate).toLocaleDateString('vi-VN') : '';return <article className="sv-card sleek-card" key={`${item.versionId}-${item.sampleId}`}><div className="sv-card-main"><div className="sv-card-header"><span className={`sv-status-dot ${item.status}`}></span><h3 className="sv-card-title">Mẫu #{item.sampleIndex+1}: {item.taskName}</h3>{severity>=0.7&&<span className="sv-priority-indicator" title="Cần chú ý">🔥</span>}</div><div className="sv-card-details"><span className="sv-dataset-name">{item.datasetName}</span><span className="sv-bullet">•</span>{deadlineStr&&<><span className="sv-metric-text" style={{color: '#f97316'}}><Clock3 size={12} style={{display:'inline',marginRight:4,marginBottom:-2}}/>{deadlineStr}</span><span className="sv-bullet">·</span></>}<span className="sv-metric-text">Staff vs Staff ({item.assigneeCount} người) · Có {item.pendingAdjudicationCount||0} mục xung đột cần xử lý</span></div></div><button className="sv-open-btn" onClick={()=>setSelected(item)}>{item.status==='pending'?'Xử lý':'Xem'}</button></article>})}</div>}
      {!loading&&!error&&filtered.length>PAGE_SIZE&&<footer className="sv-pagination"><span>Hiển thị {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE,filtered.length)} / {filtered.length}</span><div><button disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft size={15}/> Trước</button>{Array.from({length:totalPages},(_,i)=>i+1).filter(n=>n===1||n===totalPages||Math.abs(n-safePage)<=1).map((n,i,arr)=><React.Fragment key={n}>{i>0&&n-arr[i-1]>1&&<span>…</span>}<button className={n===safePage?'active':''} onClick={()=>setPage(n)}>{n}</button></React.Fragment>)}<button disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Sau <ArrowRight size={15}/></button></div></footer>}
    </section>
    {selected&&<SupervisorConflictDialog item={selected} onClose={()=>setSelected(null)} onCompleted={loadQueue}/>}
  </main>;
}
