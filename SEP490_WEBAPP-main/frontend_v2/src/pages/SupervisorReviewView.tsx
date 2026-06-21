import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Clock3, Filter, Inbox, Info, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { api, type AssignmentConflictItem } from '../services/api';
import { stage4Api } from '../services/stage4Api';
import SupervisorConflictDialog from '../components/SupervisorConflictDialog';
import SupervisorAiConflictDialog from '../components/SupervisorAiConflictDialog';
import '../styles/supervisorreview.css';

type QueueSource = 'staff-staff' | 'staff-ai';
type QueueItem = AssignmentConflictItem & {
  versionId:string; taskName:string; datasetName:string; task:any; source:QueueSource;
  resultId?:string; modelScores?:any; humanScore?:number|null; sampleData?:any;
  averageOverall?:number|null; severity?:number;
};
type Props = { onOpenTask:(task:any, batchId?:string|null)=>void };
const PAGE_SIZE = 8;

export default function SupervisorReviewView({ onOpenTask:_onOpenTask }:Props) {
  const [items,setItems]=useState<QueueItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<'all'|AssignmentConflictItem['status']>('pending');
  const [source,setSource]=useState<'all'|QueueSource>('all');
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
        const [staffConflictResponse,aiConflicts]=await Promise.all([
          api.get(`/dataprep/versions/${versionId}/assignments/conflicts`),
          stage4Api.getMultiEvalResults(versionId,{conflictOnly:true}).catch(()=>[]),
        ]);
        const common={versionId,taskName:task.name||task.taskName||'Task chưa đặt tên',datasetName:task.dataset||task.datasetName||task.projectName||'Dataset',task};
        const staffItems:QueueItem[]=(staffConflictResponse.data?.conflicts||[]).map((conflict:any)=>({...conflict,...common,source:'staff-staff'}));
        const aiItems:QueueItem[]=(aiConflicts||[]).map((result:any,index:number)=>({
          sampleId:String(result.sampleId||result._id), sampleKey:String(result.sampleId||result._id), sampleIndex:index,
          assigneeCount:1, agreementScore:null, pendingAdjudicationCount:result.supervisorAction?0:1,
          resolvedAdjudicationCount:result.supervisorAction?1:0, status:result.supervisorAction?'published':'pending',
          ...common, source:'staff-ai', resultId:String(result._id), modelScores:result.modelScores,
          humanScore:result.humanScore??result.scores?.human, averageOverall:result.averageOverall??null,
          severity:Math.abs(Number(result.humanScore??result.scores?.human??0)-Number(result.averageOverall??0)), sampleData:result.sampleData,
        }));
        return [...staffItems,...aiItems];
      }));
      const merged=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
      const unique=Array.from(new Map(merged.map(item=>[`${item.source}-${item.versionId}-${item.sampleId}`,item])).values());
      unique.sort((a,b)=>{
        if(a.status!==b.status)return a.status==='pending'?-1:b.status==='pending'?1:0;
        const severityA=a.source==='staff-staff'?1-Number(a.agreementScore??1):Number(a.severity||0)/10;
        const severityB=b.source==='staff-staff'?1-Number(b.agreementScore??1):Number(b.severity||0)/10;
        return severityB-severityA;
      });
      setItems(unique);
    } catch(err:any) {
      setError(err.response?.data?.error||err.message||'Không thể tải danh sách cần quyết định.');
    } finally { setLoading(false); }
  };

  useEffect(()=>{
    void loadQueue();
    const timer=window.setInterval(()=>{void loadQueue(true);},30000);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{setPage(1);},[query,status,source]);
  const filtered=useMemo(()=>items.filter(item=>(status==='all'||item.status===status)&&(source==='all'||item.source===source)&&`${item.taskName} ${item.datasetName} ${item.sampleKey} ${item.sampleIndex}`.toLowerCase().includes(query.trim().toLowerCase())),[items,query,status,source]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const safePage=Math.min(page,totalPages);
  const visible=filtered.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE);
  const pending=items.filter(i=>i.status==='pending').length;
  const resolved=items.length-pending;
  const aiCount=items.filter(i=>i.source==='staff-ai').length;

  return <main className="sv-page">
    <header className="sv-header compact"><div><h1><ShieldCheck size={23}/> Trung tâm quyết định chất lượng</h1><p>Kiểm tra những mẫu có kết quả không thống nhất và chọn kết quả cuối cùng.</p></div><button className="sv-button secondary" onClick={()=>{void loadQueue(false);}}><RefreshCw size={16} className={loading?'sv-spin':''}/> Tải lại</button></header>
    <section className="sv-guide"><Info size={20}/><div><strong>Khác nhãn không đồng nghĩa có người làm sai</strong><p><b>Staff–Staff</b>: hai kết quả cần được đối chiếu; nếu cả hai đều phù hợp, có thể giữ cả hai làm nhãn cuối. <b>Staff–AI</b>: kết quả Staff lệch AI quá ngưỡng và cần người chốt.</p></div></section>
    <section className="sv-kpis"><article><span className="sv-kpi-icon warning"><AlertTriangle size={20}/></span><div><strong>{pending}</strong><span>Cần quyết định</span></div></article><article><span className="sv-kpi-icon success"><CheckCircle2 size={20}/></span><div><strong>{resolved}</strong><span>Đã xử lý</span></div></article><article><span className="sv-kpi-icon neutral"><Users size={20}/></span><div><strong>{aiCount}</strong><span>So sánh Staff–AI</span></div></article></section>
    <section className="sv-queue">
      <div className="sv-queue-head"><div><h2>Danh sách cần kiểm tra</h2><p>{filtered.length} mẫu · trang {safePage}/{totalPages}</p></div><div className="sv-controls">{/* Tạm ẩn nút gộp nhãn theo yêu cầu: visible.some(i=>i.status==='pending'&&i.source==='staff-staff')&&<button className="sv-button" onClick={async()=>{if(!window.confirm('Bạn có chắc chắn muốn TỰ ĐỘNG GỘP NHÃN tất cả các mẫu Staff vs Staff đang hiển thị trong trang này không?'))return;const targets=visible.filter(i=>i.status==='pending'&&i.source==='staff-staff');for(const item of targets){try{await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/auto-publish`);}catch(e){console.error(e);}}loadQueue();}}><CheckCircle2 size={16}/> Gộp nhãn trang này</button> */}<label className="sv-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm task, dataset, sample..."/></label><label className="sv-select"><Filter size={16}/><select value={source} onChange={e=>setSource(e.target.value as any)}><option value="all">Mọi loại so sánh</option><option value="staff-staff">Staff–Staff</option><option value="staff-ai">Staff–AI</option></select></label><label className="sv-select"><select value={status} onChange={e=>setStatus(e.target.value as any)}><option value="all">Mọi trạng thái</option><option value="pending">Cần quyết định</option><option value="resolved_unpublished">Đã lưu nháp</option><option value="published">Đã chốt</option></select></label></div></div>
      {loading?<div className="sv-skeletons">{[1,2,3].map(i=><div key={i} className="sv-skeleton"/>)}</div>:error?<div className="sv-state error"><AlertTriangle size={28}/><h3>Không tải được danh sách</h3><p>{error}</p><button className="sv-button" onClick={loadQueue}>Thử lại</button></div>:visible.length===0?<div className="sv-state"><Inbox size={32}/><h3>Không có mẫu phù hợp</h3><p>Hãy đổi bộ lọc hoặc chờ Staff/AI hoàn tất đánh giá.</p></div>:<div className="sv-list">{visible.map(item=>{const severity=item.source==='staff-staff'?1-Number(item.agreementScore??1):Math.min(1,Number(item.severity||0)/5);return <article className="sv-card sleek-card" key={`${item.source}-${item.versionId}-${item.sampleId}`}><div className="sv-card-main"><div className="sv-card-header"><span className={`sv-status-dot ${item.status}`}></span><h3 className="sv-card-title">Mẫu #{item.sampleIndex+1}: {item.taskName}</h3>{severity>=0.7&&<span className="sv-priority-indicator" title="Cần chú ý">🔥</span>}</div><div className="sv-card-details"><span className="sv-dataset-name">{item.datasetName}</span><span className="sv-bullet">•</span>{item.source==='staff-staff'?<span className="sv-metric-text">Staff vs Staff ({item.assigneeCount} người) · Đồng thuận {item.agreementScore==null?'—':`${Math.round(item.agreementScore*100)}%`} · {item.pendingAdjudicationCount||0} mục cần chốt</span>:<span className="sv-metric-text">Staff vs AI · Lệch ±{Number(item.severity||0).toFixed(1)} (Staff: {item.humanScore==null?'—':Number(item.humanScore).toFixed(1)} / AI: {item.averageOverall==null?'—':Number(item.averageOverall).toFixed(1)})</span>}</div></div><button className="sv-open-btn" onClick={()=>setSelected(item)}>{item.status==='pending'?'Xử lý':'Xem'}</button></article>})}</div>}
      {!loading&&!error&&filtered.length>PAGE_SIZE&&<footer className="sv-pagination"><span>Hiển thị {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE,filtered.length)} / {filtered.length}</span><div><button disabled={safePage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft size={15}/> Trước</button>{Array.from({length:totalPages},(_,i)=>i+1).filter(n=>n===1||n===totalPages||Math.abs(n-safePage)<=1).map((n,i,arr)=><React.Fragment key={n}>{i>0&&n-arr[i-1]>1&&<span>…</span>}<button className={n===safePage?'active':''} onClick={()=>setPage(n)}>{n}</button></React.Fragment>)}<button disabled={safePage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Sau <ArrowRight size={15}/></button></div></footer>}
    </section>
    {selected&&(selected.source==='staff-ai'?<SupervisorAiConflictDialog item={selected} onClose={()=>setSelected(null)} onCompleted={loadQueue}/>:<SupervisorConflictDialog item={selected} onClose={()=>setSelected(null)} onCompleted={loadQueue}/>)}
  </main>;
}
