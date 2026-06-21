import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, Loader2, MessageSquare, Send, User, X } from 'lucide-react';
import { api, apiService, type AssignmentConflictItem } from '../services/api';
import '../styles/supervisorconflict.css';
import '../styles/supervisorconflict-polish.css';

type Item=AssignmentConflictItem&{versionId:string;taskName:string;datasetName:string};
type Props={item:Item;onClose:()=>void;onCompleted:()=>void};

export default function SupervisorConflictDialog({item,onClose,onCompleted}:Props){
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[activeKey,setActiveKey]=useState('');
  const [drafts, setDrafts] = useState<Record<string, {labels: string[], note: string}>>({});
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  const load=async()=>{
    setLoading(true);
    setError('');
    try{
      const result=await apiService.getDatasetVersionAssignmentSampleComparison(item.versionId,item.sampleId);
      setData(result);
      
      const newDrafts: any = {};
      result.targets?.forEach((t:any) => {
        newDrafts[t.targetKey] = {
          labels: Array.isArray(t.adjudication?.finalLabels) && t.adjudication.finalLabels.length > 0 
            ? t.adjudication.finalLabels 
            : Array.isArray(t.majorityLabels) && t.majorityLabels.length > 0 
              ? t.majorityLabels 
              : [],
          note: t.adjudication?.note || ''
        };
      });
      setDrafts(newDrafts);

      const first=result.targets?.find((t:any)=>t.hasConflict && t.adjudication?.status !== 'published')||result.targets?.[0];
      setActiveKey(first?.targetKey||'');
    }catch(e:any){
      setError(e.response?.data?.error||e.message||'Không thể tải dữ liệu so sánh.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{load()},[item.sampleId,item.versionId]);
  
  const target=useMemo(()=>data?.targets?.find((t:any)=>t.targetKey===activeKey),[data,activeKey]);
  
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler)},[onClose]);
  
  const choices=useMemo(()=>Array.from(new Set((target?.annotators||[]).flatMap((a:any)=>a.labels||[]))) as string[],[target]);
  
  const currentLabels = drafts[activeKey]?.labels || [];
  const currentNote = drafts[activeKey]?.note || '';
  
  const toggle = (label: string) => {
    setDrafts(prev => ({
      ...prev,
      [activeKey]: {
        ...prev[activeKey],
        labels: prev[activeKey]?.labels.includes(label)
          ? prev[activeKey].labels.filter(x => x !== label)
          : [...(prev[activeKey]?.labels || []), label]
      }
    }));
  };

  const setLabels = (newLabels: string[]) => {
    setDrafts(prev => ({...prev, [activeKey]: {...prev[activeKey], labels: newLabels}}));
  };

  const setNote = (newNote: string) => {
    setDrafts(prev => ({...prev, [activeKey]: {...prev[activeKey], note: newNote}}));
  };

  const analyzeWithAi = async () => {
    if (!target) return;
    setAiLoading(prev => ({ ...prev, [target.targetKey]: true }));
    setError('');
    try {
      const messageContent = target.targetTextSnapshot || data?.sample?.preview || 'Không có nội dung';
      const conflictingLabels = (target.annotators || []).map((a: any) => ({
        annotator: a.annotator?.name || a.annotator?.email || 'Reviewer',
        labels: a.labels || []
      }));
      const res = await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/ai-advice`, {
        messageContent,
        conflictingLabels
      });
      if (res.data?.advice) {
        setAiAdvice(prev => ({ ...prev, [target.targetKey]: res.data.advice }));
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Lỗi khi gọi AI phân tích.');
    } finally {
      setAiLoading(prev => ({ ...prev, [target.targetKey]: false }));
    }
  };

  const submitAll = async(publish: boolean) => {
    if (!data?.targets) return;
    
    // Tìm các target có conflict mà chưa được publish
    const pendingTargets = data.targets.filter((t:any) => t.hasConflict && t.adjudication?.status !== 'published');
    
    // Nếu không còn mục nào cần quyết định (ví dụ user sửa target đã publish)
    const targetsToSubmit = pendingTargets.length > 0 ? pendingTargets : (target ? [target] : []);

    for (const t of targetsToSubmit) {
      const draft = drafts[t.targetKey];
      if (!draft || !draft.labels.length) {
        setError(`Mục "${t.targetScope === 'sample' ? 'Nhãn toàn hội thoại' : 'Tin nhắn ' + (Number(t.messageIndex) + 1)}" chưa có nhãn cuối cùng. Hãy kiểm tra lại.`);
        setActiveKey(t.targetKey);
        return;
      }
    }

    setSaving(true);
    setError('');
    
    try {
      for (const t of targetsToSubmit) {
        const draft = drafts[t.targetKey];
        const payload:any = { targetScope: t.targetScope, finalLabels: draft.labels, note: draft.note.trim() };
        if (t.targetScope === 'message') {
          payload.messageIndex = t.messageIndex;
          payload.messageRole = t.messageRole;
        }
        await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications`, payload);
        if (publish) {
          await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/publish`, payload);
        }
      }
      await load();
      onCompleted();
    } catch(e:any) {
      setError(e.response?.data?.error||e.message||'Không thể lưu quyết định.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="sv-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sv-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-dialog-title">
    <style>{`.sv-decision > label > span { display: none; }`}</style>
    <header className="sv-dialog-header"><div><span>{item.datasetName} · Sample #{item.sampleIndex+1}</span><h2 id="sv-dialog-title">{item.taskName}</h2></div><button onClick={onClose} aria-label="Đóng"><X size={20}/></button></header>
    {loading?<div className="sv-dialog-state"><Loader2 className="sv-spin"/><p>Đang tải kết quả của các reviewer…</p></div>:error&&!data?<div className="sv-dialog-state error"><AlertTriangle/><h3>Không tải được dữ liệu</h3><p>{error}</p><button className="sv-button" onClick={load}>Thử lại</button></div>:<div className="sv-dialog-layout">
      <aside className="sv-targets"><div className="sv-target-title">Các mục cần kiểm tra <span>{data?.targets?.length||0}</span></div>{data?.targets?.map((t:any,index:number)=>{const resolved=t.adjudication?.status==='published';return <button key={t.targetKey} className={activeKey===t.targetKey?'active':''} onClick={()=>setActiveKey(t.targetKey)}><span className={`sv-target-dot ${resolved?'agreed':t.hasConflict?'conflict':'agreed'}`}>{resolved?<Check size={13}/>:index+1}</span><span><strong>{t.targetScope==='sample'?'Nhãn toàn hội thoại':`${t.messageRole==='assistant'?'Assistant':'User'} · Tin nhắn ${Number(t.messageIndex)+1}`}</strong><small>{resolved?'Đã xử lý':t.hasConflict?'Có bất đồng':'Đã đồng thuận'}</small></span></button>})}</aside>
      <div className="sv-resolution">
        <div className="sv-original"><div className="sv-section-label"><MessageSquare size={15}/> Nội dung hội thoại</div><div className="sv-chat-container">{(() => {let msgs = data?.sample?.messages || item.sampleData?.messages || []; const text = target?.targetTextSnapshot || data?.sample?.preview || ''; if (!msgs.length && data?.sample?.content) { try { msgs = JSON.parse(data.sample.content); } catch(e){} } if (!msgs.length && text) { try { msgs = JSON.parse(text); } catch(e){} } if (!msgs.length && text) { const lines = text.split('\n').map(l => l.trim()).filter(Boolean); msgs = lines.length > 1 ? lines.map((l, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: l })) : [{ role: 'user', content: text }]; } if (!msgs.length) return <p className="sv-no-content">Không có nội dung</p>; return msgs.map((m: any, i: number) => { const isUser = String(m.role).toLowerCase() === 'user'; return <div key={i} className={`sv-chat-msg ${isUser?'user':'assistant'}`}><div className="sv-chat-role">{isUser?'Người dùng':'AI Assistant'}</div><div className="sv-chat-bubble">{m.content||m.text||JSON.stringify(m)}</div></div>; });})()}</div></div>
        <div className="sv-section-label"><User size={15}/> Kết quả reviewer</div><div className="sv-reviewers">{target?.annotators?.map((a:any)=><article key={a.annotator.id}><header><span className="sv-avatar">{(a.annotator.name||a.annotator.email||'?').slice(0,1).toUpperCase()}</span><div><strong>{a.annotator.name||'Reviewer'}</strong><small>{a.isOwner?'Admin':'Staff'} · {a.annotator.email}</small></div></header><div className="sv-review-labels">{a.labels.map((label:string,i:number)=><button key={label} className={currentLabels.includes(label)?'selected':''} onClick={()=>toggle(label)}><span>{a.displayLabels?.[i]||label}</span><small>{label}</small>{currentLabels.includes(label)&&<Check size={14}/>}</button>)}</div></article>)}</div>
        {target?.hasConflict && (
          <div className="sv-ai-analysis" style={{ marginTop: 15, padding: 15, background: 'var(--color-bg-secondary)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiAdvice[target.targetKey] ? 10 : 0 }}>
              <div className="sv-section-label" style={{ margin: 0 }}><span style={{ marginRight: 6 }}>🪄</span> Phân tích bằng AI (Gợi ý)</div>
              <button className="sv-button secondary" onClick={analyzeWithAi} disabled={aiLoading[target.targetKey]}>
                {aiLoading[target.targetKey] ? <Loader2 size={14} className="sv-spin" style={{ marginRight: 6 }}/> : <MessageSquare size={14} style={{ marginRight: 6 }}/>}
                {aiAdvice[target.targetKey] ? 'Phân tích lại' : 'Nhờ AI làm trọng tài'}
              </button>
            </div>
            {aiAdvice[target.targetKey] && <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--color-text-primary)' }}>{aiAdvice[target.targetKey]}</div>}
          </div>
        )}
        <div className="sv-decision"><div className="sv-section-label"><Check size={15}/> Quyết định cuối cùng</div><p>Có thể chọn một nhãn hoặc giữ nhiều nhãn nếu các kết quả đều hợp lý.</p><div className="sv-choice-row">{choices.map(label=><button key={label} className={currentLabels.includes(label)?'selected':''} onClick={()=>toggle(label)}>{label}{currentLabels.includes(label)&&<Check size={13}/>}</button>)}{choices.length>1&&<button className={choices.every(label=>currentLabels.includes(label))?'selected':''} onClick={()=>setLabels(choices)}><Check size={13}/> Giữ tất cả nhãn hợp lý</button>}</div><label>Nhãn cuối cùng<input value={currentLabels.join(', ')} onChange={e=>setLabels(e.target.value.split(',').map(x=>x.trim()).filter(Boolean))} placeholder="Có thể chọn nhiều nhãn, phân cách bằng dấu phẩy"/></label><label>Lý do phân giải <span>*</span><textarea value={currentNote} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Ví dụ: Cả hai intent đều xuất hiện trong hội thoại nên giữ cả hai."/></label>{error&&<div className="sv-inline-error"><AlertTriangle size={15}/>{error}</div>}</div>
      </div>
    </div>}
    {!loading&&data&&<footer className="sv-dialog-footer"><button className="sv-button secondary" onClick={onClose}><ChevronLeft size={16}/> Quay lại queue</button><div><button className="sv-button secondary" disabled={saving} onClick={()=>submitAll(false)}>Lưu nháp tất cả</button><button className="sv-button publish" disabled={saving} onClick={()=>submitAll(true)}>{saving?<Loader2 size={16} className="sv-spin"/>:<Send size={16}/>} Chốt và công bố tất cả</button></div></footer>}
  </section></div>
}
