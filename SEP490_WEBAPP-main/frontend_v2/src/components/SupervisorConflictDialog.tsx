import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, Loader2, MessageSquare, Send, User, X } from 'lucide-react';
import { api, apiService, type AssignmentConflictItem } from '../services/api';
import '../styles/supervisorconflict.css';
import '../styles/supervisorconflict-polish.css';

type Item=AssignmentConflictItem&{versionId:string;taskName:string;datasetName:string;sampleData?:any;reviewerRows?:any[]};
type Props={item:Item;onClose:()=>void;onCompleted:()=>void};

const LABEL_MAP: Record<string, string> = {
  // Quality & Status
  'Completed': 'Hoan thanh',
  'Incomplete': 'Chua hoan thanh',
  'Abandoned': 'Bo do',
  'Gold': 'Tot',
  'Rewrite': 'Can viet lai',
  'Bad': 'Chua dat',
  'Chua ro': 'Chua ro',
  'spam': 'Spam',
  'toxic': 'Độc hại',

  // Domains
  'Toan': 'Toan',
  'Vat ly': 'Vat ly',
  'Hoa hoc': 'Hoa hoc',
  'Sinh hoc': 'Sinh hoc',
  'Tieng Anh': 'Tieng Anh',
  'Lich su': 'Lich su',
  'Dia ly': 'Dia ly',
  'GDCD': 'GDCD',
  'Tin hoc': 'Tin hoc',
  'Lien mon': 'Lien mon',

  // DB Hard Labels (User)
  'ANSWER_ATTEMPT': 'Hoc sinh tra loi/thu lam bai',
  'REQUEST_HINT': 'Xin goi y',
  'ASK_THEORY': 'Hoi ly thuyet',
  'REQUEST_EXPLANATION': 'Yeu cau giai thich',
  'REQUEST_SIMPLER': 'Muon giai thich don gian hon',
  'SKIP_EXERCISE': 'Bo qua bai',
  'DISCOURAGED': 'Chan nan',
  'OFF_TOPIC': 'Ngoai pham vi',
  'READY_NEXT': 'Muon hoc tiep/chuyen cau',
  'CONFIRM_UNDERSTANDING': 'Xac nhan da hieu',

  // DB Hard Labels (Assistant)
  'CONFIRM_CORRECT_ANSWER': 'Xac nhan cau tra loi dung',
  'IDENTIFY_INCORRECT_ANSWER': 'Chi ra cau tra loi sai',
  'CORRECT_MISTAKE': 'Sua loi sai',
  'PRAISING': 'Khen ngoi',
  'SCAFFOLDING': 'Dan dat tung buoc',
  'HINTING': 'Dua goi y',
  'CONCEPT_CLARIFY': 'Lam ro khai niem',
  'LOGIC_BREAKDOWN': 'Phan tich lap luan',
  'SIMPLIFYING': 'Dien giai don gian',
  'MOTIVATING': 'Dong vien',
  'REDIRECTING': 'Keo ve dung chu de',
  'TRANSITIONING': 'Chuyen buoc/chu de',
  'DIRECT_ANSWER': 'Dua dap an truc tiep',
  'WAITING': 'Cho hoc sinh phan hoi',

  // Legacy/Fallback aliases (supporting alternative db values)
  'CORRECT': 'Xac nhan cau tra loi dung',
  'INCORRECT': 'Chi ra cau tra loi sai',
  'WAIT_READY': 'Cho hoc sinh phan hoi',
  'NEXT_SECTION': 'Muon hoc tiep/chuyen cau',
  'ENCOURAGE': 'Dong vien',
  'OFFTOPIC': 'Ngoai pham vi',
  'Guide Step-by-step': 'Dan dat tung buoc',
  'Give Hint': 'Dua goi y',
  'Ask Probing Question': 'Phan tich lap luan',
  'Provide Formula': 'Lam ro khai niem',
  'Correct Error': 'Sua loi sai',
  'Summarize': 'Chuyen buoc/chu de',
  'Ask Explanation': 'Yeu cau giai thich',
  'Solve Exercise': 'Chi ra cau tra loi sai',
  'Request Formula': 'Hoi ly thuyet',
  'Confirm Understanding': 'Xac nhan da hieu',
  'Ask Example': 'Muon giai thich don gian hon',
  'Hint': 'Dua goi y',
  'Ques': 'Cau hoi',
  'Ques/Hint': 'Hoi/Goi y',
  'QA': 'Hoi dap',
  'Other': 'Khac',
  'Factual Error': 'Sai kien thuc',
  'Direct Answer': 'Lo dap an truc tiep',
  'Language Issue': 'Loi ngon ngu',
};

const labelText = (value: any) => {
  const raw = String(value || '').trim();
  return LABEL_MAP[raw] || raw;
};

const labelKey = (value: any) => String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
const hasLabel = (labels: string[] = [], label: string) => labels.some(item => labelKey(item) === labelKey(label));
const withoutLabel = (labels: string[] = [], label: string) => labels.filter(item => labelKey(item) !== labelKey(label));

const annotatorLabelText = (annotator: any, label: string, index: number) => (
  labelText(annotator?.displayLabels?.[index] || label)
);

const targetKindText = (target: any) => {
  if (!target) return 'Nhan';
  if (target.targetScope === 'sample') {
    if (Number(target.messageIndex) === 1) return 'Muc hoan thien';
    if (Number(target.messageIndex) === 2) return 'Chat luong hoi thoai';
    return 'Mon hoc';
  }
  return target.messageRole === 'assistant' ? 'Hanh dong cua AI' : 'Y dinh hoc sinh';
};

const targetTitle = (target: any) => {
  if (!target) return 'Muc can kiem tra';
  if (target.targetScope === 'sample') return targetKindText(target);
  return `${target.messageRole === 'assistant' ? 'Tro ly AI' : 'Nguoi dung'} - Tin nhan ${Number(target.messageIndex) + 1}`;
};

const conversationReviewerGroups = (label: any) => {
  if (!label || typeof label !== 'object') return [];
  const groups: { title: string; values: string[] }[] = [];
  const meta = [
    label.subject && `Mon: ${labelText(label.subject)}`,
    label.completion && `Hoan thien: ${labelText(label.completion)}`,
    label.quality && `Chat luong: ${labelText(label.quality)}`,
  ].filter(Boolean) as string[];
  if (meta.length) groups.push({ title: 'Nhan hoi thoai', values: meta });
  const reasons = [
    label.quality_reason && `Chat luong: ${String(label.quality_reason)}`,
    label.reason && `Ghi chu: ${String(label.reason)}`,
    label.note && `Ghi chu: ${String(label.note)}`,
  ].filter(Boolean) as string[];
  if (reasons.length) groups.push({ title: 'Giai thich chi tiet', values: reasons });
  return groups;
};

const labelReasonForTarget = (label: any, target: any) => {
  if (!label || typeof label !== 'object') return '';
  const title = targetTitle(target).toLowerCase();
  const candidates = title.includes('chat luong')
    ? [label.quality_reason, label.qualityReason, label.reason_quality]
    : title.includes('hoan thien')
      ? [label.completion_reason, label.completionReason, label.reason_completion]
      : title.includes('mon hoc')
        ? [label.subject_reason, label.subjectReason, label.reason_subject]
        : [];
  candidates.push(label.reason, label.note);
  return String(candidates.find((item) => String(item || '').trim()) || '').trim();
};

const inferAdviceLabel = (title: string, text: string) => {
  const source = text.toLowerCase();
  const candidates = title.toLowerCase().includes('mon')
    ? ['Toan', 'Vat ly', 'Hoa hoc', 'Sinh hoc', 'Tieng Anh', 'Lich su', 'Dia ly', 'GDCD', 'Tin hoc', 'Lien mon', 'Chua ro']
    : title.toLowerCase().includes('hoan')
      ? ['Hoan thanh', 'Chua hoan thanh', 'Bo do', 'Chua ro']
      : ['Tot', 'Can viet lai', 'Chua dat', 'Chua ro'];
  return candidates.find(label => source.includes(label.toLowerCase()));
};

const compactAiAdvice = (value: string) => {
  const clean = String(value || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/-{3,}/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .trim();
  const lines = clean.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const result: string[] = [];
  let currentTitle = '';

  for (const line of lines) {
    if (/^(chao|chào|dua tren|dựa trên|loi khuyen|lời khuyên)/i.test(line)) continue;
    const titleMatch = line.match(/^(Mon hoc|Muc hoan thien|Chat luong hoi thoai|Môn học|Mức hoàn thiện|Chất lượng hội thoại)\s*:\s*(.+)?$/i);
    if (titleMatch) {
      currentTitle = titleMatch[1];
      const sameLineConclusion = titleMatch[2]?.match(/giu\s+nhan\s+(.+?)(?:\.|$)/i);
      if (sameLineConclusion) result.push(`${currentTitle}: Giữ nhãn ${sameLineConclusion[1].trim()}`);
      else {
        const inferred = inferAdviceLabel(currentTitle, titleMatch[2] || '');
        if (inferred) result.push(`${currentTitle}: Giữ nhãn ${inferred}`);
      }
      continue;
    }
    const conclusionMatch = line.match(/(?:Ket luan|Kết luận)\s*:\s*(?:Giu|Giữ)\s+nhan\s+(.+?)(?:\.|$)/i);
    if (conclusionMatch && currentTitle) {
      result.push(`${currentTitle}: Giữ nhãn ${conclusionMatch[1].trim()}`);
      continue;
    }
    if (/^.+:\s*giu\s+.+\s+-\s+.+/i.test(line)) result.push(line);
  }

  const requiredTitles = ['Mon hoc', 'Muc hoan thien', 'Chat luong hoi thoai'];
  const completeResult = [...result];
  requiredTitles.forEach(title => {
    if (clean.includes(title) && !completeResult.some(line => line.toLowerCase().startsWith(title.toLowerCase()))) {
      completeResult.push(`${title}: Chua co ket luan`);
    }
  });

  return (completeResult.length ? completeResult : lines.filter(line => !/^(chao|chào|sau khi|dua tren|dựa trên)/i.test(line)).slice(0, 4)).slice(0, 4).join('\n');
};

const ensureAdviceTargets = (advice: string, targets: any[]) => {
  const lines = advice.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const existing = lines.join('\n').toLowerCase();
  targets.forEach(target => {
    const title = targetTitle(target);
    if (!existing.includes(title.toLowerCase())) {
      lines.push(`${title}: Chua co ket luan`);
    }
  });
  return lines.slice(0, 4).join('\n');
};

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
  const readOnly = item.status === 'published' || Boolean(data?.targets?.length && data.targets.every((t: any) => !t.hasConflict || t.adjudication?.status === 'published'));
  const toggle = (label: string) => {
    if (readOnly) return;
    setDrafts(prev => ({
      ...prev,
      [activeKey]: {
        ...prev[activeKey],
        labels: hasLabel(prev[activeKey]?.labels, label)
          ? withoutLabel(prev[activeKey].labels, label)
          : [...(prev[activeKey]?.labels || []), label]
      }
    }));
  };

  const setLabels = (newLabels: string[]) => {
    if (readOnly) return;
    setDrafts(prev => ({...prev, [activeKey]: {...prev[activeKey], labels: newLabels}}));
  };

  const setTargetLabels = (targetKey: string, labels: string[]) => {
    if (readOnly) return;
    setDrafts(prev => ({ ...prev, [targetKey]: { ...(prev[targetKey] || { note: '' }), labels } }));
  };

  const sampleConflictTargets = (data?.targets || []).filter((t: any) => t.targetScope === 'sample' && t.hasConflict);
  const sampleTargetsResolved = sampleConflictTargets.length > 0 && sampleConflictTargets.every((t: any) => t.adjudication?.status === 'published');
  const activeAiKey = target?.targetScope === 'sample' ? 'sample-summary' : target?.targetKey;
  const aiSourceTargets = target?.targetScope === 'sample' ? sampleConflictTargets : (target ? [target] : []);
  const hasAiConflicts = aiSourceTargets.some((t: any) => t?.hasConflict);

  const analyzeWithAi = async () => {
    if (!target || !activeAiKey) return;
    setAiLoading(prev => ({ ...prev, [activeAiKey]: true }));
    setError('');
    try {
      const messageContent = target.targetScope === 'sample'
        ? [
            data?.sample?.preview || 'Không có nội dung',
            '',
            'Các mục nhãn tổng đang xung đột:',
            ...sampleConflictTargets.map((sampleTarget: any) => {
              const rows = (sampleTarget.annotators || []).map((a: any) => {
                const name = a.annotator?.name || a.annotator?.email || 'Reviewer';
                const labels = (a.labels || []).map((label: string, idx: number) => annotatorLabelText(a, label, idx)).join(', ');
                return `- ${name}: ${labels || 'Chua co nhan'}`;
              });
              return `${targetTitle(sampleTarget)}\n${rows.join('\n')}`;
            }),
          ].join('\n')
        : target.targetTextSnapshot || data?.sample?.preview || 'Không có nội dung';
      const conflictingLabels = aiSourceTargets.flatMap((sourceTarget: any) => (
        sourceTarget.annotators || []
      ).map((a: any) => ({
        target: targetTitle(sourceTarget),
        annotator: a.annotator?.name || a.annotator?.email || 'Reviewer',
        labels: (a.labels || []).map((label: string, idx: number) => annotatorLabelText(a, label, idx))
      })));
      const res = await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/ai-advice`, {
        messageContent,
        conflictingLabels
      });
      if (res.data?.advice) {
        const compactAdvice = ensureAdviceTargets(compactAiAdvice(res.data.advice), target.targetScope === 'sample' ? sampleConflictTargets : []);
        setAiAdvice(prev => ({ ...prev, [activeAiKey]: compactAdvice }));
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Lỗi khi gọi AI phân tích.');
    } finally {
      setAiLoading(prev => ({ ...prev, [activeAiKey]: false }));
    }
  };

  const submitAll = async(publish: boolean) => {
    if (readOnly) return;
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
        const payload:any = { targetScope: t.targetScope, finalLabels: draft.labels, note: draft.note?.trim() || '' };
        if (Number.isInteger(Number(t.messageIndex))) {
          payload.messageIndex = t.messageIndex;
        }
        if (t.targetScope === 'message') {
          payload.messageRole = t.messageRole;
        }
        await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications`, payload);
        if (publish) {
          await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/publish`, payload);
        }
      }
      await load();
      onCompleted();
      if (publish) {
        onClose();
      }
    } catch(e:any) {
      setError(e.response?.data?.error||e.message||'Không thể lưu quyết định.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="sv-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sv-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-dialog-title">
    <style>{`.sv-decision > label > span { display: none; }`}</style>
    <header className="sv-dialog-header"><div><span>{item.datasetName} · Sample #{item.sampleIndex+1}</span><h2 id="sv-dialog-title">{item.taskName}</h2></div><button onClick={onClose}><X size={18} /></button></header>    {loading ? (
      <div className="sv-dialog-state">
        <Loader2 className="sv-spin" />
        <p>Đang tải kết quả của các reviewer…</p>
      </div>
    ) : error && !data ? (
      <div className="sv-dialog-state error">
        <AlertTriangle />
        <h3>Không tải được dữ liệu</h3>
        <p>{error}</p>
        <button className="sv-button" onClick={load}>Thử lại</button>
      </div>
    ) : (
      <div className="sv-dialog-layout">
        <aside className="sv-targets">
          <div className="sv-target-title">Các mục cần kiểm tra <span>{(sampleConflictTargets.length ? 1 : 0) + (data?.targets?.filter((t: any) => t.targetScope !== 'sample').length || 0)}</span></div>
          {sampleConflictTargets.length > 0 && (
            <button
              className={target?.targetScope === 'sample' ? 'active' : ''}
              onClick={() => setActiveKey(sampleConflictTargets[0].targetKey)}
            >
              <span className={`sv-target-dot ${sampleTargetsResolved ? 'agreed' : 'conflict'}`}>{sampleTargetsResolved ? <Check size={13} /> : 1}</span>
              <span>
                <strong>Hoi thoai tong</strong>
                <small>{sampleTargetsResolved ? 'Da xu ly' : 'Co bat dong'}</small>
              </span>
            </button>
          )}
          {data?.targets?.filter((t: any) => t.targetScope !== 'sample').map((t: any, index: number) => {
            const resolved = t.adjudication?.status === 'published';
            return (
              <button
                key={t.targetKey}
                className={activeKey === t.targetKey ? 'active' : ''}
                onClick={() => setActiveKey(t.targetKey)}
              >
                <span className={`sv-target-dot ${resolved ? 'agreed' : t.hasConflict ? 'conflict' : 'agreed'}`}>
                  {resolved ? <Check size={13} /> : index + 1 + (sampleConflictTargets.length ? 1 : 0)}
                </span>
                <span>
                  <strong>{targetTitle(t)}</strong>
                  <small>{resolved ? 'Đã xử lý' : t.hasConflict ? 'Có bất đồng' : 'Đã đồng thuận'}</small>
                </span>
              </button>
            );
          })}
        </aside>

        <div className="sv-resolution">
          <div className="sv-resolution-split">
            {/* LEFT COLUMN: INTERACTIVE CHAT & INLINE LABELS */}
            <div className="sv-col-chat">
              <div className="sv-section-label"><MessageSquare size={15} /> Hội thoại (Click tin nhắn để chọn mục giải quyết)</div>
              <div className="sv-chat-container">
                {(() => {
                  let msgs = data?.sample?.messages || item.sampleData?.messages || [];
                  const text = target?.targetTextSnapshot || data?.sample?.preview || '';
                  if (!msgs.length && data?.sample?.content) {
                    try { msgs = JSON.parse(data.sample.content); } catch (e) {}
                  }
                  if (!msgs.length && text) {
                    try { msgs = JSON.parse(text); } catch (e) {}
                  }
                  if (!msgs.length && text) {
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                    msgs = lines.length > 1
                      ? lines.map((l, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: l }))
                      : [{ role: 'user', content: text }];
                  }
                  if (!msgs.length) return <p className="sv-no-content">Không có nội dung</p>;

                  return msgs.map((m: any, i: number) => {
                    const isUser = String(m.role).toLowerCase() === 'user';
                    const msgTarget = data?.targets?.find((t: any) => t.targetScope === 'message' && Number(t.messageIndex) === i);
                    const isActive = activeKey === msgTarget?.targetKey;
                    const hasConflict = msgTarget?.hasConflict;
                    const resolved = msgTarget?.adjudication?.status === 'published';

                    return (
                      <div
                        key={i}
                        className={`sv-chat-msg ${isUser ? 'user' : 'assistant'} ${isActive ? 'active' : ''} ${hasConflict ? 'has-conflict' : ''} ${resolved ? 'resolved' : ''} ${msgTarget ? 'clickable' : ''}`}
                        onClick={() => {
                          if (msgTarget) {
                            setActiveKey(msgTarget.targetKey);
                          }
                        }}
                      >
                        <div className="sv-chat-role-bar">
                          <span className="role-name">
                            {isUser ? `Nguoi dung (Luot ${Math.floor(i / 2) + 1})` : `Tro ly AI (Luot ${Math.floor(i / 2) + 1})`}
                          </span>
                          {hasConflict && <span className="conflict-badge-inline">Bat dong</span>}
                          {resolved && <span className="resolved-badge-inline">Da chot</span>}
                        </div>
                        <div className="sv-chat-bubble">{m.content || m.text || JSON.stringify(m)}</div>

                        {/* Inline Reviewer Labels comparison */}
                        {msgTarget?.annotators && msgTarget.annotators.length > 0 && (
                          <div className="sv-bubble-annotator-labels">
                            {msgTarget.annotators.map((a: any) => {
                              const displayName = a.annotator.name && a.annotator.name !== a.annotator.email ? `${a.annotator.name} (${a.annotator.email})` : a.annotator.email || 'Reviewer';
                              return (
                                <div key={a.annotator.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', width: '100%', marginTop: '6px', padding: '6px 10px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                  <strong style={{ fontSize: '12px', color: '#334155' }}>{displayName}:</strong>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {(a.labels || []).map((l: string, idx: number) => {
                                      const mapped = annotatorLabelText(a, l, idx);
                                      return (
                                        <span key={`${l}-${idx}`} style={{ display: 'inline-flex', padding: '3px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', color: '#0f172a', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                          {mapped}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* RIGHT COLUMN: DETAILED LABELS & FINAL DECISION FORM */}
            <div className="sv-col-decision">
              {target?.targetScope === 'sample' && Array.isArray(item.reviewerRows) && item.reviewerRows.length > 0 && (
                <div className="sv-full-label-panel">
                  <div className="sv-section-label"><User size={15} /> Nhan reviewer da nop</div>
                  <div className="sv-full-label-grid">
                    {item.reviewerRows.map((row: any) => {
                      const conversationGroups = conversationReviewerGroups(row.label);
                      return (
                        <article key={row.assignmentId || row.assigneeName}>
                          <header>
                            <strong>{row.assigneeName || 'Reviewer'}</strong>
                            <small>{row.reviewStatus === 'approved' ? 'Da duyet' : 'Da nop'}</small>
                          </header>
                          {conversationGroups.length ? conversationGroups.map(group => (
                            <div className={`sv-full-label-group ${group.title === 'Giai thich chi tiet' ? 'reason' : ''}`} key={group.title}>
                              <span>{group.title}</span>
                              <div>{group.values.map(value => group.title === 'Giai thich chi tiet' ? <p key={value}>{value}</p> : <b key={value}>{value}</b>)}</div>
                            </div>
                          )) : <p>Chua co nhan hoi thoai.</p>}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detailed reviewer cards */}
              <div className="sv-section-label"><User size={15} /> Ket qua chi tiet reviewer {readOnly && <span className="sv-readonly-pill">Chi xem</span>}</div>
              {target?.targetScope === 'sample' ? (
                <div className="sv-sample-reviewers">
                  {sampleConflictTargets.map((sampleTarget: any) => {
                    const targetDraft = drafts[sampleTarget.targetKey] || { labels: [], note: '' };
                    const targetResolved = sampleTarget.adjudication?.status === 'published';
                    return (
                      <section className="sv-sample-review-section" key={sampleTarget.targetKey}>
                        <h4>{targetTitle(sampleTarget)} {targetResolved && <span className="sv-final-chip">Da chot</span>}</h4>
                        <div className="sv-reviewers">
                          {sampleTarget.annotators?.map((a: any) => {
                            const displayName = a.annotator.name && a.annotator.name !== a.annotator.email ? `${a.annotator.name} (${a.annotator.email})` : a.annotator.email || 'Reviewer';
                            const reviewerRow = item.reviewerRows?.find((row: any) => String(row.assigneeId || '') === String(a.annotator.id || ''));
                            const reviewerReason = labelReasonForTarget(reviewerRow?.label, sampleTarget);
                            return (
                              <article key={a.annotator.id}>
                                <header>
                                  <span className="sv-avatar">{(a.annotator.name || a.annotator.email || '?').slice(0, 1).toUpperCase()}</span>
                                  <div>
                                    <strong>{displayName}</strong>
                                    <small>{a.isOwner ? 'Admin' : 'Staff'} - {targetTitle(sampleTarget)}</small>
                                  </div>
                                </header>
                                <div className="sv-review-labels">
                                  {(a.labels || []).map((label: string, idx: number) => (
                                    <button
                                      key={`${label}-${idx}`}
                                      className={hasLabel(targetDraft.labels, label) ? 'selected' : ''}
                                      disabled={readOnly}
                                      onClick={() => setTargetLabels(sampleTarget.targetKey, hasLabel(targetDraft.labels, label) ? withoutLabel(targetDraft.labels, label) : [...targetDraft.labels, label])}
                                    >
                                      <span>{annotatorLabelText(a, label, idx)}</span>
                                      {hasLabel(targetDraft.labels, label) && <Check size={14} />}
                                    </button>
                                  ))}
                                  {reviewerReason && <p className="sv-review-reason">Ly do: {reviewerReason}</p>}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="sv-reviewers">
                {target?.annotators?.map((a: any) => {
                  const displayName = a.annotator.name && a.annotator.name !== a.annotator.email ? `${a.annotator.name} (${a.annotator.email})` : a.annotator.email || 'Reviewer';
                  const reviewerRow = item.reviewerRows?.find((row: any) => String(row.assigneeId || '') === String(a.annotator.id || ''));
                  const reviewerReason = labelReasonForTarget(reviewerRow?.label, target);
                  return (
                    <article key={a.annotator.id}>
                      <header>
                        <span className="sv-avatar">{(a.annotator.name || a.annotator.email || '?').slice(0, 1).toUpperCase()}</span>
                        <div>
                          <strong>{displayName}</strong>
                          <small>{a.isOwner ? 'Admin' : 'Staff'} - {targetKindText(target)}</small>
                        </div>
                      </header>
                      <div className="sv-review-labels">
                        {(a.labels || []).map((label: string, idx: number) => {
                          const translatedLabel = annotatorLabelText(a, label, idx);
                          return (
                            <button
                              key={label}
                              className={hasLabel(currentLabels, label) ? 'selected' : ''}
                              disabled={readOnly}
                              onClick={() => toggle(label)}
                            >
                              <span>{translatedLabel}</span>
                              {hasLabel(currentLabels, label) && <Check size={14} />}
                            </button>
                          );
                        })}
                        {reviewerReason && <p className="sv-review-reason">Ly do: {reviewerReason}</p>}
                      </div>
                    </article>
                  );
                })}
                </div>
              )}

              {/* AI helper box */}
              {hasAiConflicts && activeAiKey && (
                <div className="sv-ai-analysis">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiAdvice[activeAiKey] ? 10 : 0 }}>
                    <div className="sv-section-label" style={{ margin: 0 }}><span style={{ marginRight: 6 }}>🪄</span> Phân tích bằng AI (Gợi ý)</div>
                    <button className="sv-button secondary" onClick={analyzeWithAi} disabled={aiLoading[activeAiKey]}>
                      {aiLoading[activeAiKey] ? <Loader2 size={14} className="sv-spin" style={{ marginRight: 6 }} /> : <MessageSquare size={14} style={{ marginRight: 6 }} />}
                      {aiAdvice[activeAiKey] ? 'Phân tích lại' : 'Nhờ AI làm trọng tài'}
                    </button>
                  </div>
                  {aiAdvice[activeAiKey] && <div className="sv-ai-advice-text">{aiAdvice[activeAiKey]}</div>}
                </div>
              )}

              {/* Final adjudication decision */}
              {target?.targetScope !== 'sample' && <div className="sv-decision">
                <div className="sv-section-label"><Check size={15} /> Quyết định cuối cùng</div>
                <p>Chọn nhãn cuối cùng từ danh sách gợi ý của reviewer.</p>
                <div className="sv-choice-row">
                  {choices.map(label => (
                    <button
                      key={label}
                      className={hasLabel(currentLabels, label) ? 'selected' : ''}
                      disabled={readOnly}
                      onClick={() => toggle(label)}
                    >
                      {labelText(label)}
                      {hasLabel(currentLabels, label) && <Check size={13} />}
                    </button>
                  ))}
                  {choices.length > 1 && (
                    <button
                      className={choices.every(label => hasLabel(currentLabels, label)) ? 'selected' : ''}
                      disabled={readOnly}
                      onClick={() => setLabels(choices.every(label => hasLabel(currentLabels, label)) ? [] : choices)}
                    >
                      <Check size={13} /> Giữ tất cả nhãn hợp lý
                    </button>
                  )}
                </div>
                {error && <div className="sv-inline-error"><AlertTriangle size={15} />{error}</div>}
              </div>}
            </div>
          </div>
        </div>
      </div>
    )}
    {!loading && data && (
      <footer className="sv-dialog-footer">
        <button className="sv-button secondary" onClick={onClose}><ChevronLeft size={16} /> Quay lại queue</button>
        <div>
          {!readOnly && <>
            <button className="sv-button secondary" disabled={saving} onClick={() => submitAll(false)}>Lưu nháp tất cả</button>
            <button className="sv-button publish" disabled={saving} onClick={() => submitAll(true)}>
              {saving ? <Loader2 size={16} className="sv-spin" /> : <Send size={16} />} Chốt và công bố tất cả
            </button>
          </>}
        </div>
      </footer>
    )}
  </section></div>;
}
