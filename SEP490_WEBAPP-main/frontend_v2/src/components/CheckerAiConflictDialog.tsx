import React, { useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, Loader2, RotateCcw, ShieldCheck, ThumbsDown, UserRound, WandSparkles, X } from 'lucide-react';
import { stage4Api } from '../services/stage4Api';
import '../styles/checkerconflict.css';
import '../styles/checkerconflict-polish.css';

const actionLabels = { approve: 'Duyệt', rewrite: 'Yêu cầu viết lại', reevaluate: 'Chấm lại', reject: 'Loại bỏ' } as const;
const actionIcons = { approve: CheckCircle2, rewrite: WandSparkles, reevaluate: RotateCcw, reject: ThumbsDown } as const;

export default function CheckerAiConflictDialog({ item, onClose, onCompleted }:{ item:any; onClose:()=>void; onCompleted:()=>void }) {
  const [action,setAction]=useState<keyof typeof actionLabels>('approve');
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const noteRequired=action==='rewrite'||action==='reject';
  const submit=async()=>{if(noteRequired&&!note.trim()){setError(action==='rewrite'?'Vui lòng nêu phần cần viết lại.':'Vui lòng nêu lý do loại bỏ.');return;}setSaving(true);setError('');try{await stage4Api.adjudicateMultiEvalResult(item.versionId,item.resultId,action,note.trim());onCompleted();onClose();}catch(e:any){setError(e.response?.data?.error||e.message||'Không thể lưu quyết định.');}finally{setSaving(false)}};
  const scores=Object.entries(item.modelScores||{});
  const messages=item.sampleData?.messages||[];
  const isUnavailable=(value:any)=>value?.status==='unavailable'||/lỗi api|quota|too many requests|googlegenerativeai error/i.test(`${value?.reason||''} ${value?.errorDetail||''}`);
  const shortReason=(reason:any)=>{
    const text=String(reason||'').trim();
    if(!text)return 'Không có nhận xét.';
    const first=text.match(/^(.{1,180}?[.!?])(?:\s|$)/)?.[1]||text.slice(0,180);
    return `${first}${first.length<text.length?'…':''}`;
  };
  return <div className="sv-dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sv-dialog sv-ai-dialog" role="dialog" aria-modal="true">
    <header className="sv-dialog-header"><div><span>Xung đột Staff–AI · {item.datasetName}</span><h2>{item.taskName}</h2></div><button onClick={onClose} aria-label="Đóng"><X size={20}/></button></header>
    <div className="sv-ai-content">
      <div className="sv-original"><h3 className="sv-ai-heading">Nội dung hội thoại</h3><div className="sv-chat-container">{messages.map((m:any,i:number)=>{const isUser=String(m.role).toLowerCase()==='user';return <div key={i} className={`sv-chat-msg ${isUser?'user':'assistant'}`}><div className="sv-chat-role">{isUser?'Người dùng':'AI Assistant'}</div><div className="sv-chat-bubble">{m.content||m.text||JSON.stringify(m)}</div></div>})}</div></div>
      <h3 className="sv-ai-heading">So sánh kết quả</h3>
      <div className="sv-ai-score-grid">
        <article className="sv-ai-card staff"><header><span className="sv-source-icon staff"><UserRound size={18}/></span><div><strong>Đánh giá của Staff</strong><small>Tính từ các nhãn đã hoàn thành</small></div><span className="sv-source-pill">Human</span></header>{item.humanScore==null||item.humanScore<=0?<div className="sv-no-score"><AlertTriangle size={17}/><span><b>Chưa có điểm</b><small>Staff chưa gán đủ nhãn bắt buộc</small></span></div>:<div className="sv-score-line"><b className="sv-score">{item.humanScore.toFixed(1)}</b><span>/ 10</span></div>}<div className="sv-card-foot"><ShieldCheck size={14}/> Dùng để đối chiếu với kết quả AI</div></article>
        {scores.map(([model,value]:any)=>{const unavailable=isUnavailable(value);return <article key={model} className={`sv-ai-card ${unavailable?'unavailable':''}`}><header><span className="sv-source-icon ai"><Bot size={18}/></span><div><strong>{model}</strong><small>{unavailable?'Không thể chấm mẫu này':'AI đánh giá độc lập'}</small></div><span className={`sv-result-pill ${unavailable?'warning':'success'}`}>{unavailable?'Lỗi API':value?.recommendation||'Đã chấm'}</span></header>{unavailable?<><div className="sv-api-warning"><AlertTriangle size={17}/><span>{value?.errorCode==='QUOTA_EXCEEDED'||/quota|429/i.test(`${value?.reason} ${value?.errorDetail}`)?'Đã hết hạn mức API. Kết quả này không được tính vào điểm hoặc conflict.':'Model tạm thời không phản hồi. Kết quả này không được tính.'}</span></div><details><summary><ChevronDown size={14}/> Chi tiết kỹ thuật</summary><pre>{value?.errorDetail||value?.reason}</pre></details></>:<><div className="sv-score-line"><b className="sv-score">{Number(value?.overall??value).toFixed(1)}</b><span>/ 10</span></div><div className="sv-ai-summary"><b>Kết luận nhanh</b><p>{shortReason(value?.reason)}</p></div>{String(value?.reason||'').length>180&&<details className="sv-reason-detail"><summary><ChevronDown size={14}/> Xem phân tích đầy đủ</summary><p>{value.reason}</p></details>}</>}</article>})}
      </div>
      <div className="sv-decision"><div className="sv-section-label"><CheckCircle2 size={15}/> Quyết định của Checker</div><p>Chọn kết quả cuối cùng cho mẫu hội thoại này.</p><div className="sv-choice-row">{(Object.keys(actionLabels) as Array<keyof typeof actionLabels>).map(v=>{const Icon=actionIcons[v];return <button key={v} className={action===v?'selected':''} onClick={()=>{setAction(v);setError('')}}><Icon size={16}/>{actionLabels[v]}</button>})}</div><label>Ghi chú {noteRequired?<span>* Bắt buộc</span>:<small>Không bắt buộc</small>}<textarea rows={noteRequired?3:2} value={note} onChange={e=>setNote(e.target.value)} placeholder={action==='rewrite'?'Nêu rõ nội dung cần viết lại...':action==='reject'?'Nêu lý do mẫu không thể sử dụng...':'Thêm ghi chú nếu cần...'}/></label>{error&&<div className="sv-inline-error"><AlertTriangle size={15}/>{error}</div>}</div>
    </div>
    <footer className="sv-dialog-footer"><button className="sv-button secondary" onClick={onClose}>Đóng</button><button className="sv-button publish" disabled={saving} onClick={submit}>{saving?<Loader2 size={16} className="sv-spin"/>:<CheckCircle2 size={16}/>} Chốt quyết định</button></footer>
  </section></div>;
}
