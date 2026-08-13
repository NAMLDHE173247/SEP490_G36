import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, Loader2, MessageSquare, Send, User, X } from 'lucide-react';
import { api, type AssignmentConflictItem } from '../services/api';
import '../styles/checkerconflict.css';
import '../styles/checkerconflict-polish.css';

type Item=AssignmentConflictItem&{versionId:string;taskName:string;datasetName:string;sampleData?:any;reviewerRows?:any[]};
type Props={item:Item;onClose:()=>void;onCompleted:()=>void};

const removeAccents = (str: string) => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
};

const LABEL_MAP: Record<string, string> = {
  // Quality & Status
  'Completed': 'Hoàn thành',
  'Incomplete': 'Chưa hoàn thành',
  'Abandoned': 'Bỏ dở',
  'Gold': 'Tốt',
  'Rewrite': 'Cần viết lại',
  'Bad': 'Chưa đạt',
  'Chua ro': 'Chưa rõ',
  'spam': 'Spam',
  'toxic': 'Độc hại',

  // Domains
  'MATH': 'Toán',
  'Math': 'Toán',
  'Toan': 'Toán',
  'PHYSICAL': 'Vật lý',
  'Physical': 'Vật lý',
  'PHYSICS': 'Vật lý',
  'Physics': 'Vật lý',
  'Vat ly': 'Vật lý',
  'CHEMISTRY': 'Hóa học',
  'Chemistry': 'Hóa học',
  'Hoa hoc': 'Hóa học',
  'BIOLOGY': 'Sinh học',
  'Biology': 'Sinh học',
  'Sinh hoc': 'Sinh học',
  'LITERATURE': 'Ngữ văn',
  'Literature': 'Ngữ văn',
  'Van hoc': 'Ngữ văn',
  'ENGLISH': 'Tiếng Anh',
  'English': 'Tiếng Anh',
  'Tieng Anh': 'Tiếng Anh',
  'HISTORY': 'Lịch sử',
  'History': 'Lịch sử',
  'Lich su': 'Lịch sử',
  'GEOGRAPHY': 'Địa lý',
  'Geography': 'Địa lý',
  'Dia ly': 'Địa lý',
  'CODING': 'Tin học',
  'Coding': 'Tin học',
  'IT': 'Tin học',
  'Tin hoc': 'Tin học',
  'GDCD': 'GDCD',
  'Civics': 'GDCD',
  'Lien mon': 'Liên môn',
  'Multi-subject': 'Liên môn',
  'Unclear': 'Chưa rõ',
  'OTHER': 'Khác',
  'Other': 'Khác',

  // DB Hard Labels (User)
  'ANSWER_ATTEMPT': 'Học sinh trả lời/thử làm bài',
  'REQUEST_HINT': 'Xin gợi ý',
  'ASK_THEORY': 'Hỏi lý thuyết',
  'REQUEST_EXPLANATION': 'Yêu cầu giải thích',
  'REQUEST_SIMPLER': 'Muốn giải thích đơn giản hơn',
  'SKIP_EXERCISE': 'Bỏ qua bài',
  'DISCOURAGED': 'Chán nản',
  'OFF_TOPIC': 'Ngoài phạm vi',
  'READY_NEXT': 'Muốn học tiếp/chuyển câu',
  'CONFIRM_UNDERSTANDING': 'Xác nhận đã hiểu',

  // DB Hard Labels (Assistant)
  'CONFIRM_CORRECT_ANSWER': 'Xác nhận câu trả lời đúng',
  'IDENTIFY_INCORRECT_ANSWER': 'Chỉ ra câu trả lời sai',
  'CORRECT_MISTAKE': 'Sửa lỗi sai',
  'PRAISING': 'Khen ngợi',
  'SCAFFOLDING': 'Dẫn dắt từng bước',
  'HINTING': 'Đưa gợi ý',
  'CONCEPT_CLARIFY': 'Làm rõ khái niệm',
  'LOGIC_BREAKDOWN': 'Phân tích lập luận',
  'SIMPLIFYING': 'Diễn giải đơn giản',
  'MOTIVATING': 'Động viên',
  'REDIRECTING': 'Kéo về đúng chủ đề',
  'TRANSITIONING': 'Chuyển bước/chủ đề',
  'DIRECT_ANSWER': 'Đưa đáp án trực tiếp',
  'WAITING': 'Chờ học sinh phản hồi',

  // Legacy/Fallback aliases (supporting alternative db values)
  'CORRECT': 'Xác nhận câu trả lời đúng',
  'INCORRECT': 'Chỉ ra câu trả lời sai',
  'WAIT_READY': 'Chờ học sinh phản hồi',
  'NEXT_SECTION': 'Muốn học tiếp/chuyển câu',
  'ENCOURAGE': 'Động viên',
  'OFFTOPIC': 'Ngoài phạm vi',
  'Guide Step-by-step': 'Dẫn dắt từng bước',
  'Give Hint': 'Đưa gợi ý',
  'Ask Probing Question': 'Phân tích lập luận',
  'Provide Formula': 'Làm rõ khái niệm',
  'Correct Error': 'Sửa lỗi sai',
  'Summarize': 'Chuyển bước/chủ đề',
  'Ask Explanation': 'Yêu cầu giải thích',
  'Solve Exercise': 'Chỉ ra câu trả lời sai',
  'Request Formula': 'Hỏi lý thuyết',
  'Confirm Understanding': 'Xác nhận đã hiểu',
  'Ask Example': 'Muốn giải thích đơn giản hơn',
  'Hint': 'Đưa gợi ý',
  'Ques': 'Câu hỏi',
  'Ques/Hint': 'Hỏi/Gợi ý',
  'QA': 'Hỏi đáp',
  'Factual Error': 'Sai kiến thức',
  'Direct Answer': 'Lộ đáp án trực tiếp',
  'Language Issue': 'Lỗi ngôn ngữ',
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
  if (!target) return 'Nhãn';
  if (target.targetScope === 'sample') {
    if (Number(target.messageIndex) === 1) return 'Mức hoàn thiện';
    if (Number(target.messageIndex) === 2) return 'Chất lượng hội thoại';
    return 'Môn học';
  }
  return target.messageRole === 'assistant' ? 'Hành động của AI' : 'Ý định học sinh';
};

const targetTitle = (target: any) => {
  if (!target) return 'Mục cần kiểm tra';
  if (target.targetScope === 'sample') return targetKindText(target);
  return `${target.messageRole === 'assistant' ? 'Trợ lý AI' : 'Người dùng'} - Tin nhắn ${Number(target.messageIndex) + 1}`;
};

const conversationReviewerGroups = (label: any) => {
  if (!label || typeof label !== 'object') return [];
  const groups: { title: string; values: string[] }[] = [];
  const meta = [
    label.subject && `Môn: ${labelText(label.subject)}`,
    label.completion && `Hoàn thiện: ${labelText(label.completion)}`,
    label.quality && `Chất lượng: ${labelText(label.quality)}`,
  ].filter(Boolean) as string[];
  if (meta.length) groups.push({ title: 'Nhãn hội thoại', values: meta });
  const reasons = [
    label.quality_reason && `Chất lượng: ${String(label.quality_reason)}`,
    label.reason && `Ghi chú: ${String(label.reason)}`,
    label.note && `Ghi chú: ${String(label.note)}`,
  ].filter(Boolean) as string[];
  if (reasons.length) groups.push({ title: 'Giải thích chi tiết', values: reasons });
  return groups;
};

const labelReasonForTarget = (label: any, target: any) => {
  if (!label || typeof label !== 'object') return '';
  const title = targetTitle(target).toLowerCase();
  const candidates = title.includes('chất lượng')
    ? [label.quality_reason, label.qualityReason, label.reason_quality]
    : title.includes('hoàn thiện')
      ? [label.completion_reason, label.completionReason, label.reason_completion]
      : title.includes('môn học')
        ? [label.subject_reason, label.subjectReason, label.reason_subject]
        : [];
  candidates.push(label.reason, label.note);
  return String(candidates.find((item) => String(item || '').trim()) || '').trim();
};

const ReviewerTable = ({ target, item, selectedLabels, readOnly, onToggle }: any) => (
  <div className="sv-review-table-wrap">
    <table className="sv-review-table">
      <thead>
        <tr>
          <th>Reviewer</th>
          <th>Vai trò</th>
          <th>Nhãn đã chọn</th>
          <th>Lý do</th>
        </tr>
      </thead>
      <tbody>
        {(target?.annotators || []).map((annotator: any) => {
          const displayName = annotator.annotator?.name && annotator.annotator.name !== annotator.annotator.email
            ? `${annotator.annotator.name} (${annotator.annotator.email})`
            : annotator.annotator?.email || 'Reviewer';
          const reviewerRow = item.reviewerRows?.find((row: any) => String(row.assigneeId || '') === String(annotator.annotator?.id || ''));
          const reason = labelReasonForTarget(reviewerRow?.label, target);
          return (
            <tr key={annotator.annotator?.id || displayName}>
              <td><strong>{displayName}</strong></td>
              <td>{annotator.isOwner ? 'Admin' : annotator.annotator?.role === 'checker' ? 'Checker' : 'Staff'}</td>
              <td>
                <div className="sv-table-labels">
                  {(annotator.labels || []).map((label: string, index: number) => (
                    <button
                      type="button"
                      key={`${label}-${index}`}
                      className={hasLabel(selectedLabels, label) ? 'selected' : ''}
                      disabled={readOnly}
                      onClick={() => onToggle(label)}
                    >
                      {annotatorLabelText(annotator, label, index)}
                      {hasLabel(selectedLabels, label) && <Check size={13} />}
                    </button>
                  ))}
                  {!(annotator.labels || []).length && <span className="sv-empty-cell">Chưa gán nhãn</span>}
                </div>
              </td>
              <td>{reason || <span className="sv-empty-cell">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const inferAdviceLabel = (title: string, text: string) => {
  const source = removeAccents(text.toLowerCase());
  const candidates = title.toLowerCase().includes('môn') || title.toLowerCase().includes('mon')
    ? ['Toán', 'Vật lý', 'Hóa học', 'Sinh học', 'Tiếng Anh', 'Lịch sử', 'Địa lý', 'GDCD', 'Tin học', 'Liên môn', 'Chưa rõ']
    : title.toLowerCase().includes('hoàn') || title.toLowerCase().includes('hoan')
      ? ['Hoàn thành', 'Chưa hoàn thành', 'Bỏ dở', 'Chưa rõ']
      : ['Tốt', 'Cần viết lại', 'Chưa đạt', 'Chưa rõ'];
  return candidates.find(label => removeAccents(label.toLowerCase()) === source || source.includes(removeAccents(label.toLowerCase())));
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

export default function CheckerConflictDialog({item,onClose,onCompleted}:Props){
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[activeKey,setActiveKey]=useState('');
  const [drafts, setDrafts] = useState<Record<string, {labels: string[], note: string}>>({});
  const [aiAdvice, setAiAdvice] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [messageStatus, setMessageStatus] = useState<'conflict' | 'all' | 'agreed' | 'resolved'>('conflict');
  const [messageRole, setMessageRole] = useState<'all' | 'user' | 'assistant'>('all');
  const [messageQuery, setMessageQuery] = useState('');
  const loadSequence = useRef(0);

  const load=async()=>{
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try{
      const response=await api.get(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/comparison`, {
        timeout: 60000,
      });
      const result=response.data;
      if (sequence !== loadSequence.current) return;
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
      if (sequence !== loadSequence.current) return;
      setError(e.response?.data?.error||e.message||'Không thể tải dữ liệu so sánh.');
    }finally{
      if (sequence === loadSequence.current) setLoading(false);
    }
  };

  useEffect(()=>{
    void load();
    return () => { loadSequence.current += 1; };
  },[item.sampleId,item.versionId]);

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
  const allSampleTargets = (data?.targets || []).filter((t: any) => t.targetScope === 'sample');
  const hasPendingSampleConflict = allSampleTargets.some((t: any) => t.hasConflict && t.adjudication?.status !== 'published');
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

    const readyTargets = targetsToSubmit.filter(t => drafts[t.targetKey] && drafts[t.targetKey].labels.length > 0);
    const notReadyTargets = targetsToSubmit.filter(t => !drafts[t.targetKey] || !drafts[t.targetKey].labels.length);

    if (readyTargets.length === 0 && notReadyTargets.length > 0) {
      setError(`Vui lòng chọn nhãn cho mục "${notReadyTargets[0].targetScope === 'sample' ? 'Hội thoại tổng' : 'Tin nhắn ' + (Number(notReadyTargets[0].messageIndex) + 1)}" trước khi chốt.`);
      setActiveKey(notReadyTargets[0].targetKey);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const promises = readyTargets.map(async (t) => {
        const draft = drafts[t.targetKey];
        if (!draft) return;
        const payload:any = { targetScope: t.targetScope, finalLabels: draft.labels, note: draft.note?.trim() || '' };
        if (Number.isInteger(Number(t.messageIndex))) {
          payload.messageIndex = t.messageIndex;
        }
        if (t.targetScope === 'message') {
          payload.messageRole = t.messageRole;
        }
        if (publish) {
          await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications/publish`, payload);
        } else {
          await api.post(`/dataprep/versions/${item.versionId}/assignments/samples/${item.sampleId}/adjudications`, payload);
        }
      });
      await Promise.all(promises);
      
      if (notReadyTargets.length > 0) {
        await load();
        setActiveKey(notReadyTargets[0].targetKey);
        setError(`Đã lưu thành công. Vui lòng tiếp tục phân xử mục "${notReadyTargets[0].targetScope === 'sample' ? 'Hội thoại tổng' : 'Tin nhắn ' + (Number(notReadyTargets[0].messageIndex) + 1)}".`);
        return;
      }

      const bc = new BroadcastChannel('dataprep_sync');
      bc.postMessage('refresh_conflicts');
      bc.close();

      if (publish) {
        onClose();
        onCompleted();
      } else {
        await load();
        onCompleted();
      }
    } catch(e:any) {
      setError(e.response?.data?.error||e.message||'Không thể lưu quyết định.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="sv-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="sv-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-dialog-title">
    <style>{`.sv-decision > label > span { display: none; }`}</style>
    <header className="sv-dialog-header"><div><span>{item.datasetName} · Sample #{item.sampleIndex}</span><h2 id="sv-dialog-title">{item.taskName}</h2></div><button onClick={onClose}><X size={18} /></button></header>    {loading ? (
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
          <div className="sv-target-title">Các mục cần kiểm tra <span>{(allSampleTargets.length ? 1 : 0) + (data?.targets?.filter((t: any) => t.targetScope !== 'sample').length || 0)}</span></div>
          {allSampleTargets.length > 0 && (
            <button
              className={target?.targetScope === 'sample' ? 'active' : ''}
              onClick={() => {
                setActiveKey(allSampleTargets[0].targetKey);
                document.querySelector('.sv-col-chat')?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span className={`sv-target-dot ${!hasPendingSampleConflict ? 'agreed' : 'conflict'}`}>{!hasPendingSampleConflict ? <Check size={13} /> : 1}</span>
              <span>
                <strong>Hội thoại tổng</strong>
                <small>{!hasPendingSampleConflict ? 'Đã xử lý' : 'Có bất đồng'}</small>
              </span>
            </button>
          )}
          {data?.targets?.filter((t: any) => t.targetScope !== 'sample').map((t: any, index: number) => {
            const resolved = t.adjudication?.status === 'published';
            return (
              <button
                key={t.targetKey}
                className={activeKey === t.targetKey ? 'active' : ''}
                onClick={() => {
                  setActiveKey(t.targetKey);
                  if (t.targetScope === 'message') {
                    document.getElementById(`checker-msg-${t.messageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              >
                <span className={`sv-target-dot ${resolved ? 'agreed' : t.hasConflict ? 'conflict' : 'agreed'}`}>
                  {resolved ? <Check size={13} /> : index + 1 + (allSampleTargets.length ? 1 : 0)}
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
              <div className="sv-section-label"><MessageSquare size={15} /> Bảng đối chiếu từng tin nhắn</div>
              <div className="sv-message-toolbar">
                <div className="sv-filter-tabs">
                  {([
                    ['conflict', 'Bất đồng'], ['all', 'Tất cả'], ['agreed', 'Đồng thuận'], ['resolved', 'Đã chốt'],
                  ] as const).map(([value, label]) => (
                    <button key={value} className={messageStatus === value ? 'active' : ''} onClick={() => setMessageStatus(value)}>{label}</button>
                  ))}
                </div>
                <select value={messageRole} onChange={event => setMessageRole(event.target.value as typeof messageRole)}>
                  <option value="all">Mọi vai trò</option>
                  <option value="user">Người dùng</option>
                  <option value="assistant">Trợ lý AI</option>
                </select>
                <input value={messageQuery} onChange={event => setMessageQuery(event.target.value)} placeholder="Tìm nội dung..." />
              </div>
              <div className="sv-message-table-wrap">
                {(() => {
                  let msgs = data?.sample?.messages || data?.sample?.data?.messages || item.sampleData?.messages || item.sampleData?.data?.messages || [];
                  const text = (target && target.targetScope !== 'sample') ? (target.targetTextSnapshot || data?.sample?.preview || '') : (data?.sample?.preview || '');
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

                  const visibleMessages = msgs.map((message: any, index: number) => ({ message, index })).filter(({ message, index }: any) => {
                    const role = String(message.role).toLowerCase() === 'user' ? 'user' : 'assistant';
                    const rowTarget = data?.targets?.find((t: any) => t.targetScope === 'message' && Number(t.messageIndex) === index);
                    const resolved = rowTarget?.adjudication?.status === 'published';
                    const status = resolved ? 'resolved' : rowTarget?.hasConflict ? 'conflict' : 'agreed';
                    const content = String(message.content || message.text || '');
                    return (messageStatus === 'all' || messageStatus === status)
                      && (messageRole === 'all' || messageRole === role)
                      && (!messageQuery.trim() || content.toLowerCase().includes(messageQuery.trim().toLowerCase()));
                  });

                  if (!visibleMessages.length) return <div className="sv-table-empty">Không có tin nhắn phù hợp bộ lọc.</div>;

                  return <table className="sv-message-table">
                    <thead><tr><th>#</th><th>Vai trò</th><th>Nội dung</th><th>Staff 1</th><th>Staff 2</th><th>Trạng thái</th></tr></thead>
                    <tbody>{visibleMessages.map(({ message: m, index: i }: any) => {
                      const isUser = String(m.role).toLowerCase() === 'user';
                      const msgTarget = data?.targets?.find((t: any) => t.targetScope === 'message' && Number(t.messageIndex) === i);
                      const isActive = activeKey === (msgTarget ? msgTarget.targetKey : `message-${i}`);
                      const hasConflict = msgTarget?.hasConflict;
                      const resolved = msgTarget?.adjudication?.status === 'published';
                      return <tr
                        key={i}
                        id={`checker-msg-${i}`}
                        className={isActive ? 'active' : ''}
                        onClick={() => setActiveKey(msgTarget ? msgTarget.targetKey : `message-${i}`)}
                      >
                        <td>{i + 1}</td>
                        <td><span className={`sv-role-pill ${isUser ? 'user' : 'assistant'}`}>{isUser ? 'Người dùng' : 'Trợ lý AI'}</span></td>
                        <td className="sv-message-content">{m.content || m.text || JSON.stringify(m)}</td>
                        {[0, 1].map(reviewerIndex => {
                          const annotator = msgTarget?.annotators?.[reviewerIndex];
                          return <td key={reviewerIndex} className="sv-reviewer-cell">
                            {annotator ? <>
                              <small>{annotator.annotator?.name || annotator.annotator?.email || `Staff ${reviewerIndex + 1}`}</small>
                              <strong>{(annotator.labels || []).map((label: string, idx: number) => annotatorLabelText(annotator, label, idx)).join(', ') || 'Chưa gán'}</strong>
                            </> : <span className="sv-empty-cell">—</span>}
                          </td>;
                        })}
                        <td>{resolved
                          ? <span className="sv-row-status resolved">Đã chốt</span>
                          : hasConflict
                            ? <span className="sv-row-status conflict">Bất đồng</span>
                            : <span className="sv-row-status agreed">Đồng thuận</span>}</td>
                      </tr>;
                    })}</tbody>
                  </table>;
                })()}
              </div>
            </div>

            {/* RIGHT COLUMN: DETAILED LABELS & FINAL DECISION FORM */}
            <div className="sv-col-decision">
              {!target ? (
                <div className="sv-state empty-state" style={{ padding: '32px 24px', borderStyle: 'solid', background: '#F8FAFC', minHeight: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <MessageSquare size={36} style={{ color: '#94A3B8', marginBottom: '12px' }} />
                  <h3>Không cần phân xử</h3>
                  <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '300px', margin: '0 auto', lineHeight: 1.5, textAlign: 'center' }}>
                    Tin nhắn này đã đồng thuận hoặc không nằm trong phạm vi cần gán nhãn của dự án.
                  </p>
                </div>
              ) : (
                <>
                  {target?.targetScope === 'sample' && Array.isArray(item.reviewerRows) && item.reviewerRows.length > 0 && (
                    <div className="sv-full-label-panel">
                      <div className="sv-section-label"><User size={15} /> Nhãn reviewer đã nộp</div>
                      <div className="sv-full-label-grid">
                        {item.reviewerRows.map((row: any) => {
                          const conversationGroups = conversationReviewerGroups(row.label);
                          return (
                            <article key={row.assignmentId || row.assigneeName}>
                              <header>
                                <strong>{row.assigneeName || 'Reviewer'}</strong>
                                <small>{row.reviewStatus === 'approved' ? 'Đã duyệt' : 'Đã nộp'}</small>
                              </header>
                              {conversationGroups.length ? conversationGroups.map(group => (
                                <div className={`sv-full-label-group ${group.title === 'Giải thích chi tiết' ? 'reason' : ''}`} key={group.title}>
                                  <span>{group.title}</span>
                                  <div>{group.values.map(value => group.title === 'Giải thích chi tiết' ? <p key={value}>{value}</p> : <b key={value}>{value}</b>)}</div>
                                </div>
                              )) : <p>Chưa có nhãn hội thoại.</p>}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Detailed reviewer cards */}
                  <div className="sv-section-label"><User size={15} /> Kết quả chi tiết reviewer {readOnly && <span className="sv-readonly-pill">Chỉ xem</span>}</div>
                  {target?.targetScope === 'sample' ? (
                    <div className="sv-sample-reviewers">
                      {allSampleTargets.map((sampleTarget: any) => {
                        const targetDraft = drafts[sampleTarget.targetKey] || { labels: [], note: '' };
                        const targetResolved = sampleTarget.adjudication?.status === 'published';
                        return (
                          <section className="sv-sample-review-section" key={sampleTarget.targetKey}>
                            <h4>{targetTitle(sampleTarget)} {targetResolved && <span className="sv-final-chip">Đã chốt</span>}</h4>
                            <ReviewerTable
                              target={sampleTarget}
                              item={item}
                              selectedLabels={targetDraft.labels}
                              readOnly={readOnly}
                              onToggle={(label: string) => setTargetLabels(
                                sampleTarget.targetKey,
                                hasLabel(targetDraft.labels, label)
                                  ? withoutLabel(targetDraft.labels, label)
                                  : [...targetDraft.labels, label],
                              )}
                            />
                            {!readOnly && (() => {
                              const mIdx = Number(sampleTarget.messageIndex);
                              const overrideChoices = mIdx === 1
                                ? ['Completed', 'Incomplete', 'Abandoned']
                                : mIdx === 2
                                  ? ['Gold', 'Rewrite', 'Bad']
                                  : ['Toan', 'Vat ly', 'Hoa hoc', 'Sinh hoc', 'Tieng Anh', 'Lich su', 'Dia ly', 'GDCD', 'Tin hoc', 'Lien mon', 'Chua ro'];
                              
                              return (
                                <div className="sv-final-decision-override">
                                  <label>
                                    🎯 Quyết định {targetTitle(sampleTarget).toLowerCase()} cuối cùng:
                                  </label>
                                  <div className="sv-override-choices">
                                    {overrideChoices.map((choice) => (
                                      <button
                                        key={choice}
                                        type="button"
                                        className={hasLabel(targetDraft.labels, choice) ? 'selected' : ''}
                                        onClick={() => setTargetLabels(sampleTarget.targetKey, hasLabel(targetDraft.labels, choice) ? [] : [choice])}
                                      >
                                        {labelText(choice)}
                                        {hasLabel(targetDraft.labels, choice) && <Check size={13} style={{ marginLeft: '4px' }} />}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <ReviewerTable
                      target={target}
                      item={item}
                      selectedLabels={currentLabels}
                      readOnly={readOnly}
                      onToggle={toggle}
                    />
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
                    <p>Chọn nhãn cuối cùng từ danh sách gợi ý hoặc tự nhập nếu tất cả đều sai.</p>
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
                    {!readOnly && (
                      <div style={{ marginTop: '12px' }}>
                        <input
                          type="text"
                          placeholder="Nhập nhãn tùy chỉnh mới và ấn Enter..."
                          className="sv-search"
                          style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = e.currentTarget.value.trim();
                              if (val) {
                                toggle(val);
                                e.currentTarget.value = '';
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                    {error && <div className="sv-inline-error"><AlertTriangle size={15} />{error}</div>}
                  </div>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    {!loading && data && (
      <footer className="sv-dialog-footer">
        <button className="sv-button secondary" onClick={onClose}><ChevronLeft size={16} /> Quay lại danh sách</button>
        <div>
          {!readOnly && <>
            <button className="sv-button publish" disabled={saving} onClick={() => submitAll(true)}>
              {saving ? <Loader2 size={16} className="sv-spin" /> : <Send size={16} />} Chốt và công bố tất cả
            </button>
          </>}
        </div>
      </footer>
    )}
  </section></div>;
}
