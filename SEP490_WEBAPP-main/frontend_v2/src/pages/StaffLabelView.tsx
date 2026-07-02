import React, { useState, useMemo } from 'react';
import {
  MessageSquare, Save, Send, Flag, Play, CheckCircle, Clock,
  ChevronLeft, ChevronRight, Check, AlertCircle, RefreshCw, Star, ArrowRight, Zap, Lightbulb,
  ArrowLeft, ChevronDown, FileText, X, Sparkles, Search, Eye, Edit3, Tag
} from 'lucide-react';
import '../styles/stafflabel.css';
import { api } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { useToast } from '../hooks/useToast';
import ToastContainer from '../components/ToastContainer';
import { getCliProxyModels } from '../services/configApi';

const SUBJECT_OPTIONS = ['Toan', 'Vat ly', 'Hoa hoc', 'Sinh hoc', 'Tieng Anh', 'Lich su', 'Dia ly', 'GDCD', 'Tin hoc', 'Lien mon', 'Chua ro'];
const SUBJECT_LABEL_MAP: Record<string, string> = {
  Math: 'Toan', Physics: 'Vat ly', Chemistry: 'Hoa hoc', Biology: 'Sinh hoc', English: 'Tieng Anh',
  History: 'Lich su', Geography: 'Dia ly', Civics: 'GDCD', IT: 'Tin hoc',
  'Multi-subject': 'Lien mon', Unclear: 'Chua ro',
  'Toán': 'Toan', 'Vật lý': 'Vat ly', 'Hóa học': 'Hoa hoc', 'Sinh học': 'Sinh hoc', 'Tiếng Anh': 'Tieng Anh',
  'Lịch sử': 'Lich su', 'Địa lý': 'Dia ly', 'Tin học': 'Tin hoc', 'Liên môn': 'Lien mon', 'Chưa rõ': 'Chua ro',
};

// Nhãn chuẩn Socratic, đồng bộ với autoLabelV2.service.ts
const INTENT_OPTIONS = [
  'ANSWER_ATTEMPT', 'REQUEST_HINT', 'ASK_THEORY',
  'REQUEST_EXPLANATION', 'REQUEST_SIMPLER', 'SKIP_EXERCISE',
  'DISCOURAGED', 'OFF_TOPIC', 'READY_NEXT', 'CONFIRM_UNDERSTANDING',
];
const ACTION_OPTIONS = [
  'CONFIRM_CORRECT_ANSWER', 'IDENTIFY_INCORRECT_ANSWER', 'CORRECT_MISTAKE',
  'PRAISING', 'SCAFFOLDING', 'HINTING', 'CONCEPT_CLARIFY',
  'LOGIC_BREAKDOWN', 'SIMPLIFYING', 'MOTIVATING', 'REDIRECTING',
  'TRANSITIONING', 'DIRECT_ANSWER', 'WAITING',
];
const COMPLETION_OPTIONS = ['Completed', 'Incomplete', 'Abandoned'];
const RESPONSE_QUALITY_OPTIONS = ['Gold', 'Bad'];
const ACTION_GROUPS = [
  { title: 'Đánh giá câu trả lời', values: ['CONFIRM_CORRECT_ANSWER', 'IDENTIFY_INCORRECT_ANSWER', 'CORRECT_MISTAKE'] },
  { title: 'Gợi ý và dẫn dắt', values: ['SCAFFOLDING', 'HINTING', 'WAITING'] },
  { title: 'Giải thích và làm rõ', values: ['CONCEPT_CLARIFY', 'LOGIC_BREAKDOWN', 'SIMPLIFYING'] },
  { title: 'Khen ngợi và động viên', values: ['PRAISING', 'MOTIVATING'] },
  { title: 'Điều hướng hội thoại', values: ['REDIRECTING', 'TRANSITIONING', 'DIRECT_ANSWER'] },
];
const QUALITY_OPTIONS = ['Gold', 'Rewrite', 'Bad'];
const FLAG_OPTIONS = ['Factual Error', 'Direct Answer', 'Language Issue'];
const LABEL_TEXT: Record<string, string> = {
  ANSWER_ATTEMPT: 'Học sinh trả lời/thử làm bài',
  REQUEST_HINT: 'Xin gợi ý',
  ASK_THEORY: 'Hỏi lý thuyết',
  REQUEST_EXPLANATION: 'Yêu cầu giải thích',
  REQUEST_SIMPLER: 'Muốn giải thích đơn giản hơn',
  SKIP_EXERCISE: 'Bỏ qua bài',
  DISCOURAGED: 'Chán nản',
  OFF_TOPIC: 'Ngoài phạm vi',
  READY_NEXT: 'Muốn học tiếp/chuyển câu',
  CONFIRM_UNDERSTANDING: 'Xác nhận đã hiểu',
  CONFIRM_CORRECT_ANSWER: 'Xác nhận câu trả lời đúng',
  IDENTIFY_INCORRECT_ANSWER: 'Chỉ ra câu trả lời sai',
  CORRECT_MISTAKE: 'Sửa lỗi sai',
  PRAISING: 'Khen ngợi',
  SCAFFOLDING: 'Dẫn dắt từng bước',
  HINTING: 'Đưa gợi ý',
  CONCEPT_CLARIFY: 'Làm rõ khái niệm',
  LOGIC_BREAKDOWN: 'Phân tích lập luận',
  SIMPLIFYING: 'Diễn giải đơn giản',
  MOTIVATING: 'Động viên',
  REDIRECTING: 'Kéo về đúng chủ đề',
  TRANSITIONING: 'Chuyển bước/chủ đề',
  DIRECT_ANSWER: 'Đưa đáp án trực tiếp',
  WAITING: 'Chờ học sinh phản hồi',
  Completed: 'Hoàn thành',
  Incomplete: 'Chưa hoàn thành',
  Abandoned: 'Bỏ dở',
  Gold: 'Gold', Rewrite: 'Rewrite', Bad: 'Bad', Good: 'Gold', Medium: 'Rewrite', Poor: 'Bad',
  'Needs Review': 'Cần xem lại',
  'Factual Error': 'Sai kiến thức',
  'Direct Answer': 'Lộ đáp án trực tiếp',
  'Language Issue': 'Lỗi ngôn ngữ',
  Math: 'Toán', Physics: 'Vật lý', Chemistry: 'Hóa học', Biology: 'Sinh học', English: 'Tiếng Anh', History: 'Lịch sử', Geography: 'Địa lý', Civics: 'GDCD', IT: 'Tin học', 'Multi-subject': 'Liên môn', Unclear: 'Chưa rõ',
  Toan: 'Toán', 'Vat ly': 'Vật lý', 'Hoa hoc': 'Hóa học', 'Sinh hoc': 'Sinh học', 'Tieng Anh': 'Tiếng Anh',
  'Lich su': 'Lịch sử', 'Dia ly': 'Địa lý', 'Tin hoc': 'Tin học', 'Lien mon': 'Liên môn', 'Chua ro': 'Chưa rõ',
};
const LABEL_HELP: Record<string, string> = {
  ANSWER_ATTEMPT: 'Dùng khi học sinh đang đưa ra lời giải, đáp án hoặc thử làm bài. Không đánh giá đúng/sai ở Intent.',
  REQUEST_HINT: 'Học sinh xin gợi ý hoặc nói bị bí, chưa cần lời giải đầy đủ.',
  ASK_THEORY: 'Học sinh hỏi khái niệm, công thức, định nghĩa hoặc quy tắc nền.',
  REQUEST_EXPLANATION: 'Học sinh muốn giải thích vì sao đúng/sai hoặc vì sao dùng cách đó.',
  REQUEST_SIMPLER: 'Học sinh muốn diễn giải dễ hiểu hơn, ngắn hơn hoặc có ví dụ.',
  SKIP_EXERCISE: 'Học sinh bỏ qua bài hiện tại hoặc muốn đổi sang bài khác.',
  DISCOURAGED: 'Học sinh thể hiện chán nản, bỏ cuộc, mất động lực.',
  OFF_TOPIC: 'Học sinh nói sang nội dung không liên quan bài học.',
  READY_NEXT: 'Học sinh đã xong ý hiện tại và muốn tiếp tục/chuyển câu. Không dùng cho câu hỏi đầu bài.',
  CONFIRM_UNDERSTANDING: 'Học sinh xác nhận đã hiểu sau khi được giải thích.',
  CONFIRM_CORRECT_ANSWER: 'AI xác nhận câu trả lời của học sinh là đúng.',
  IDENTIFY_INCORRECT_ANSWER: 'AI chỉ ra câu trả lời/lập luận của học sinh đang sai hoặc chưa chính xác.',
  CORRECT_MISTAKE: 'AI sửa lỗi sai hoặc chỉnh lại hiểu nhầm của học sinh.',
  SCAFFOLDING: 'AI dẫn dắt từng bước bằng câu hỏi hoặc gợi mở.',
  HINTING: 'AI đưa gợi ý ngắn, đúng trọng tâm, không giải hộ toàn bộ.',
  DIRECT_ANSWER: 'AI đưa đáp án trực tiếp. Thường cần có lỗi nếu làm lộ đáp án quá sớm.',
  Gold: 'Phản hồi đạt chuẩn, có thể giữ lại.',
  Rewrite: 'Phản hồi có thể dùng nhưng cần viết lại/chỉnh sửa.',
  Bad: 'Phản hồi sai, không phù hợp hoặc nên loại khỏi dữ liệu huấn luyện.',
};

const ITEMS_PER_PAGE = 20;
const getLabelText = (value: string) => LABEL_TEXT[value] || value;
const getLabelHelp = (value: string) => LABEL_HELP[value] || '';
const normalizeOption = (value: unknown, allowed: string[], fallback = '') => {
  const normalized = String(value || '').trim();
  const aliasMap: Record<string, string> = {
    WAIT_READY: 'READY_NEXT',
    NEXT_SECTION: 'READY_NEXT',
    ENCOURAGE: 'DISCOURAGED',
  };
  const aliased = aliasMap[normalized] || normalized;
  if (normalized === 'Good') return allowed.includes('Gold') ? 'Gold' : fallback;
  if (normalized === 'Poor') return allowed.includes('Bad') ? 'Bad' : fallback;
  if (normalized === 'Medium') return allowed.includes('Rewrite') ? 'Rewrite' : fallback;
  return allowed.includes(aliased) ? aliased : fallback;
};
const normalizeSubject = (value: unknown) => SUBJECT_LABEL_MAP[String(value || '').trim()] || normalizeOption(value, SUBJECT_OPTIONS, 'Chua ro');
const normalizeOptionList = (value: unknown, allowed: string[]) => {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(raw.map((item) => normalizeOption(item, allowed)).filter(Boolean)));
};
const normalizeRole = (role: unknown) => {
  const value = String(role || '').trim().toLowerCase();
  if (['user', 'student', 'hoc_sinh', 'hoc sinh'].includes(value)) return 'user';
  if (['assistant', 'bot', 'ai', 'tutor', 'tro_ly', 'tro ly'].includes(value)) return 'assistant';
  return value;
};

function StaffLabelView({ task, onBack }: { task: any; onBack: () => void }) {
  if (!task) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: '#f1f5f9', minHeight: '100vh' }}>
        <h2>Không tìm thấy dữ liệu dự án. Đang quay lại...</h2>
        <button onClick={onBack} style={{ marginTop: '20px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: 'white', cursor: 'pointer' }}>Quay lại</button>
      </div>
    );
  }

  const [tablePage, setTablePage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  const debouncedSearch = useDebounce(tableSearch, 300);
  const [tableFilter, setTableFilter] = useState<'all' | 'ready' | 'draft' | 'unlabeled'>('all');
  const [tableSort, setTableSort] = useState<'id_asc' | 'id_desc' | 'status'>('id_asc');
  const { toasts, toast } = useToast();
  const [drawerSampleId, setDrawerSampleId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [chatFontSize, setChatFontSize] = useState(13);
  const [labels, setLabels] = useState<Record<string, any>>({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [showGuideline, setShowGuideline] = useState(false);
  const [subjectOptions, setSubjectOptions] = useState(SUBJECT_OPTIONS);
  const [intentOptions, setIntentOptions] = useState(INTENT_OPTIONS);
  const [actionOptions, setActionOptions] = useState(ACTION_OPTIONS);
  const [flagOptions, setFlagOptions] = useState(FLAG_OPTIONS);
  const [recentlyEdited, setRecentlyEdited] = useState<string[]>([]); // ordered by most recent edit
  const taskName = task?.name || 'Gán nhãn Toán 11 — Batch 1';
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // aiAssistEnabled: ưu tiên giá trị fresh từ server (submission), fallback về task prop
  const [aiAssistEnabled, setAiAssistEnabled] = useState<boolean>(!!task?.aiAssistEnabled);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const reloadSamples = React.useCallback(async () => {
    if (!task) return;
    try {
      setLoading(true);
      const res = await api.get(`/dataprep/assignments/my-task/${task.id}/samples`);
      if (res.data.success) {
        setSamples(res.data.data.samples);
        // Đọc aiAssistEnabled fresh từ submission để phản ánh toggle của manager
        if (res.data.data.submission?.aiAssistEnabled !== undefined) {
          setAiAssistEnabled(!!res.data.data.submission.aiAssistEnabled);
        }
        const initialLabels: Record<string, any> = {};
        res.data.data.samples.forEach((s: any) => {
          if (s.savedLabel) initialLabels[s.id] = s.savedLabel;
        });
        setLabels(initialLabels);
      }
    } catch (e) { console.error('Failed to fetch samples', e); }
    finally { setLoading(false); }
  }, [task]);

  React.useEffect(() => { reloadSamples(); }, [reloadSamples]);

  // reviewStatus helpers
  const reviewOf = (sampleId: string): string => {
    const s = samples.find((x: any) => x.id === sampleId);
    return s?.reviewStatus || 'labeling';
  };
  const isSampleLocked = (sampleId: string) => ['submitted', 'approved'].includes(reviewOf(sampleId));
  const rejectedSamples = samples.filter((s: any) => s.reviewStatus === 'rejected');

  const handleSubmitSamples = async (indexes: any[]) => {
    if (!task || !indexes.length) return;
    setIsSubmitting(true);
    try {
      const payloadLabels: Record<string, any> = {};
      indexes.forEach((i: any) => { if (labels[i]) payloadLabels[i] = labels[i]; });
      const res = await api.post(`/dataprep/assignments/my-task/${task.id}/samples/submit`, { sampleIndexes: indexes, labels: payloadLabels });
      await reloadSamples();
      toast.success(res.data?.message || `Đã nộp ${indexes.length} câu thành công!`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Nộp câu thất bại.');
    }
    setIsSubmitting(false);
  };

  const getLabel = (sampleId: string, field: string) => labels[sampleId]?.[field] || '';
  const getMsgLabel = (sampleId: string, msgIdx: number, field: string) => labels[sampleId]?.messages?.[msgIdx]?.[field] || '';
  const getMsgLabels = (sampleId: string, msgIdx: number, field: string): string[] => {
    const value = labels[sampleId]?.messages?.[msgIdx]?.[field];
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    if (field === 'intent') return normalizeOptionList(raw, INTENT_OPTIONS);
    if (field === 'action') return normalizeOptionList(raw, ACTION_OPTIONS);
    return raw;
  };
  const getEffectiveMsgLabels = (sampleId: string, msgIdx: number, field: string, role?: unknown): string[] => {
    const current = getMsgLabels(sampleId, msgIdx, field);
    if (current.length) return current;
    const hasAiContext = labels[sampleId]?.status === 'reviewing';
    if (!hasAiContext) return current;
    const normalizedRole = normalizeRole(role);
    if (normalizedRole === 'user' && field === 'intent') return ['ANSWER_ATTEMPT'];
    if (normalizedRole === 'assistant' && field === 'action') return ['WAITING'];
    return current;
  };
  const getEditedMessageContent = (sampleId: string, msgIdx: number, fallback: string) => {
    const edited = labels[sampleId]?.editedMessages?.[msgIdx];
    return typeof edited === 'string' ? edited : fallback;
  };
  const setEditedMessageContent = (sampleId: string, msgIdx: number, value: string) => {
    if (submitted || isSampleLocked(sampleId)) return;
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const editedMessages = sampleLabels.editedMessages || {};
      return { ...prev, [sampleId]: { ...sampleLabels, editedMessages: { ...editedMessages, [msgIdx]: value } } };
    });
    setSavedDraft(false);
    setRecentlyEdited(prev => [sampleId, ...prev.filter(id => id !== sampleId)].slice(0, 20));
  };
  const getFlags = (sampleId: string) => labels[sampleId]?.flags || [];

  const setMsgLabel = (sampleId: string, msgIdx: number, field: string, value: string) => {
    setLabels(prev => {
      const current = prev[sampleId] || { subject: '', status: 'draft', messages: {} };
      return { ...prev, [sampleId]: { ...current, messages: { ...current.messages, [msgIdx]: { ...current.messages[msgIdx], [field]: value } } } };
    });
    setSavedDraft(false);
  };

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiBackup, setAiBackup] = useState<Record<string, any>>({});
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [aiModel, setAiModel] = useState('');
  const [gatewayModels, setGatewayModels] = useState<string[]>([]);
  React.useEffect(() => {
    if (aiProvider !== 'oauth_gateway' || gatewayModels.length) return;
    getCliProxyModels()
      .then((result) => { setGatewayModels(result.models || []); setAiModel(result.defaultModel || ''); })
      .catch(() => { setGatewayModels([]); setAiModel(''); });
  }, [aiProvider, gatewayModels.length]);
  // aiMeta[sampleId][msgIdx] = { confidence, is_correct_pedagogy, pedagogy_note }
  const [aiMeta, setAiMeta] = useState<Record<string, Record<number, any>>>({});
  // aiSummary[sampleId] = { subject, completion, quality, quality_reason }
  const [aiSummary, setAiSummary] = useState<Record<string, any>>({});
  const AI_PROVIDERS = [
    { value: 'oauth_gateway', label: 'OAuth Gateway (tự động fallback)' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'groq', label: 'OpenAI (GPT-4o-mini)' },
    { value: 'deepseek', label: 'Deepseek Chat' },
  ];

  const handleAIAssist = async (sampleId: string) => {
    const sample = samples.find((s: any) => s.id === sampleId);
    if (!sample || !task) return;
    if (!aiAssistEnabled) { toast.warning('Bạn không được cấp quyền dùng AI cho task này.'); return; }
    setIsAiLoading(true);
    try {
      setAiBackup(prev => ({ ...prev, [sampleId]: labels[sampleId] || {} }));
      const res = await api.post(`/dataprep/assignments/my-task/${task.id}/auto-label-v2`, { messages: sample.messages.map((message: any, index: number) => ({ ...message, content: getEditedMessageContent(sampleId, index, message.content || '') })), provider: aiProvider, model: aiProvider === 'oauth_gateway' ? aiModel || undefined : undefined });
      if (res.data.success && res.data.data) {
        const suggestion = res.data.data;

        // Lưu summary (subject/completion/quality/quality_reason) cho panel hiển thị
        setAiSummary(prev => ({
          ...prev,
          [sampleId]: {
            subject: normalizeSubject(suggestion.subject),
            completion: suggestion.completion || '',
            quality: suggestion.quality || '',
            quality_reason: suggestion.quality_reason || '',
          },
        }));

        const aiLabels: any = {
          subject: normalizeSubject(suggestion.subject),
          completion: normalizeOption(suggestion.completion, COMPLETION_OPTIONS, ''),
          quality: normalizeOption(suggestion.quality, QUALITY_OPTIONS, ''),
          quality_reason: suggestion.quality_reason || '',
          status: 'reviewing',
          messages: {},
        };

        // Thêm nhãn mới vào option list nếu AI đề xuất ngoài danh sách
        // Gán nhãn + lưu metadata (confidence, pedagogy)
        const metaByMsg: Record<number, any> = {};
        if (Array.isArray(suggestion.messages)) {
          suggestion.messages.forEach((msg: any, idx: number) => {
            const messageIndex = Number.isInteger(Number(msg.messageIndex)) ? Number(msg.messageIndex) : idx;
            aiLabels.messages[messageIndex] = {};
            const sourceRole = normalizeRole(sample.messages?.[messageIndex]?.role || sample.messages?.[idx]?.role || msg.role);
            const normalizedIntents = normalizeOptionList(msg.intent, INTENT_OPTIONS);
            const intents = sourceRole === 'user' ? (normalizedIntents.length ? normalizedIntents : ['ANSWER_ATTEMPT']) : [];
            const normalizedActions = normalizeOptionList(msg.action, ACTION_OPTIONS);
            const actions = sourceRole === 'assistant' ? (normalizedActions.length ? normalizedActions : ['WAITING']) : [];
            const responseQuality = normalizeOption(msg.response_quality, RESPONSE_QUALITY_OPTIONS, msg.is_correct_pedagogy === false ? 'Bad' : 'Gold');
            if (intents.length) aiLabels.messages[messageIndex].intent = intents;
            if (actions.length) aiLabels.messages[messageIndex].action = actions;
            if (sourceRole === 'assistant') aiLabels.messages[messageIndex].responseQuality = responseQuality;
            metaByMsg[messageIndex] = {
              confidence: typeof msg.confidence === 'number' ? msg.confidence : 0.5,
              response_quality: responseQuality,
              is_correct_pedagogy: msg.is_correct_pedagogy !== false,
              pedagogy_note: msg.pedagogy_note || '',
            };
          });
        }
        sample.messages?.forEach((message: any, index: number) => {
          if (!aiLabels.messages[index]) aiLabels.messages[index] = {};
          const role = normalizeRole(message.role);
          if (role === 'user' && !aiLabels.messages[index].intent) aiLabels.messages[index].intent = ['ANSWER_ATTEMPT'];
          if (role === 'assistant') {
            if (!aiLabels.messages[index].action) aiLabels.messages[index].action = ['WAITING'];
            if (!aiLabels.messages[index].responseQuality) aiLabels.messages[index].responseQuality = 'Gold';
          }
        });
        setAiMeta(prev => ({ ...prev, [sampleId]: metaByMsg }));

        setLabels(prev => {
          const existingFlags = prev[sampleId]?.flags || [];
          const existingNote = prev[sampleId]?.note || '';
          return { ...prev, [sampleId]: { ...prev[sampleId], ...aiLabels, flags: existingFlags, note: existingNote } };
        });
        setSavedDraft(false);
      }
    } catch (e) { console.error('Lỗi AI:', e); toast.error('Không thể nhận gợi ý từ AI. Vui lòng thử lại sau.'); }
    finally { setIsAiLoading(false); }
  };

  const handleRollbackAI = (sampleId: string) => {
    if (aiBackup[sampleId]) {
      setLabels(prev => ({ ...prev, [sampleId]: aiBackup[sampleId] }));
      setSavedDraft(false);
      const newBackup = { ...aiBackup }; delete newBackup[sampleId]; setAiBackup(newBackup);
    }
  };

  const setLabel = (sampleId: string, field: string, value: string) => {
    setLabels(prev => ({ ...prev, [sampleId]: { ...prev[sampleId], [field]: value } }));
    setSavedDraft(false);
    setRecentlyEdited(prev => [sampleId, ...prev.filter(id => id !== sampleId)].slice(0, 20));
  };

  const handleMessageLabelChange = (sampleId: string, msgIdx: number, field: string, value: string) => {
    if (submitted) return;
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const msgs = sampleLabels.messages || {};
      return { ...prev, [sampleId]: { ...sampleLabels, messages: { ...msgs, [msgIdx]: { ...msgs[msgIdx], [field]: value } } } };
    });
    setSavedDraft(false);
  };

  const toggleMessageLabel = (sampleId: string, msgIdx: number, field: 'intent' | 'action', value: string) => {
    if (submitted || isSampleLocked(sampleId)) return;
    if (field === 'action' && !getMsgLabel(sampleId, msgIdx, 'responseQuality')) {
      toast.warning('Cần phân loại phản hồi AI trước khi chọn Action.');
      return;
    }
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const msgs = sampleLabels.messages || {};
      const raw = msgs[msgIdx]?.[field];
      const current = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const next = current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value];
      return { ...prev, [sampleId]: { ...sampleLabels, messages: { ...msgs, [msgIdx]: { ...msgs[msgIdx], [field]: next } } } };
    });
    setSavedDraft(false);
    setRecentlyEdited(prev => [sampleId, ...prev.filter(id => id !== sampleId)].slice(0, 20));
  };

  const setResponseQuality = (sampleId: string, msgIdx: number, value: string) => {
    if (submitted || isSampleLocked(sampleId)) return;
    setLabels(prev => {
      const sampleLabels = prev[sampleId] || {};
      const msgs = sampleLabels.messages || {};
      const msgLabels = msgs[msgIdx] || {};
      const nextMsg = value === 'Bad'
        ? { ...msgLabels, responseQuality: value }
        : { ...msgLabels, responseQuality: value };
      return { ...prev, [sampleId]: { ...sampleLabels, messages: { ...msgs, [msgIdx]: nextMsg } } };
    });
    setSavedDraft(false);
    setRecentlyEdited(prev => [sampleId, ...prev.filter(id => id !== sampleId)].slice(0, 20));
  };

  const toggleFlag = (sampleId: string, flag: string) => {
    if (submitted) return;
    setLabels(prev => {
      const existing = prev[sampleId] || {};
      const flags = existing.flags || [];
      const newFlags = flags.includes(flag) ? flags.filter((f: string) => f !== flag) : [...flags, flag];
      return { ...prev, [sampleId]: { ...existing, flags: newFlags } };
    });
    setSavedDraft(false);
  };

  const isSampleComplete = (sampleId: string) => {
    const label = labels[sampleId];
    if (!label) return false;
    if (label.subject && label.completion && label.quality) return true;

    const sample = samples.find((s: any) => String(s.id) === String(sampleId));
    const messages = Array.isArray(sample?.messages) ? sample.messages : [];
    if (!messages.length) return false;

    return messages.every((message: any, msgIdx: number) => {
      const role = normalizeRole(message.role);
      if (role === 'user') return getMsgLabels(sampleId, msgIdx, 'intent').length > 0;
      if (role === 'assistant') return getMsgLabels(sampleId, msgIdx, 'action').length > 0;
      return true;
    });
  };
  const labeledCount = samples.filter((s: any) => isSampleComplete(s.id)).length;
  const progress = samples.length > 0 ? Math.round((labeledCount / samples.length) * 100) : 0;
  const [isSaving, setIsSaving] = useState(false);

  const isLocked = task?.active === false;

  const handleSaveSampleDraft = async (sampleId: string) => {
    if (!task || isLocked) return;
    const currentLabel = labels[sampleId];
    if (!currentLabel || Object.keys(currentLabel).length === 0) return;
    try {
      await api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, { sampleId, label: currentLabel, isComplete: !!isSampleComplete(sampleId) });
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 3000);
    } catch (e) { console.error('Failed to auto-save draft for sample', sampleId, e); }
  };

  const handleSaveDraft = async () => {
    if (!task) return;
    if (isLocked) { toast.warning('Task này đã bị thu hồi/thay thế. Bạn không thể chỉnh sửa tiếp.'); return; }
    setIsSaving(true);
    try {
      const promises = Object.keys(labels).map(sampleId => {
        const currentLabel = labels[sampleId];
        return api.post(`/dataprep/assignments/my-task/${task.id}/save-label`, { sampleId, label: currentLabel, isComplete: !!isSampleComplete(sampleId) });
      });
      await Promise.all(promises);
      setSavedDraft(true); setTimeout(() => setSavedDraft(false), 3000);
    } catch (e) { console.error('Failed to save draft', e); toast.error('Có lỗi khi lưu bản nháp.'); }
    finally { setIsSaving(false); }
  };

  const handleSubmit = async () => {
    if (!task) return;
    if (isLocked) { toast.warning('Task này đã bị thu hồi/thay thế. Bạn không thể nộp.'); return; }
    try {
      const res = await api.post(`/dataprep/versions/${task.datasetVersionId || 'default'}/assignments/submit`, { submissionId: task.id, labels });
      if (res.data.success) { setSubmitted(true); setShowSubmitModal(false); toast.success('Nộp bài thành công!'); }
      else { toast.error('Có lỗi xảy ra: ' + res.data.error); }
    } catch (e) { console.error('Failed to submit task', e); toast.error('Lỗi kết nối khi nộp bài.'); }
  };

  const unlabeledCount = samples.length - labeledCount;

  const handleOpenDrawer = (sampleId: string) => setDrawerSampleId(sampleId);
  const handleCloseDrawer = async () => {
    if (drawerSampleId) await handleSaveSampleDraft(drawerSampleId);
    setDrawerSampleId(null);
  };

  const handleBack = async () => {
    if (drawerSampleId) {
      await handleSaveSampleDraft(drawerSampleId);
    }
    onBack();
  };

  const handleEscapeKey = React.useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && drawerSampleId) handleCloseDrawer();
  }, [drawerSampleId]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [handleEscapeKey]);

  const handleNextUnlabeled = async () => {
    if (drawerSampleId) await handleSaveSampleDraft(drawerSampleId);
    const currentIdx = samples.findIndex(s => s.id === drawerSampleId);
    for (let i = currentIdx + 1; i < samples.length; i++) {
      if (!isSampleComplete(samples[i].id)) {
        setDrawerSampleId(samples[i].id);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    for (let i = 0; i < currentIdx; i++) {
      if (!isSampleComplete(samples[i].id)) {
        setDrawerSampleId(samples[i].id);
        setTablePage(Math.floor(i / ITEMS_PER_PAGE) + 1);
        return;
      }
    }
    alert('Tất cả mẫu đã được gán nhãn!');
  };

  const getSampleStatus = (sampleId: string): string => {
    const reviewStatus = reviewOf(sampleId);
    if (reviewStatus === 'submitted') return 'submitted';
    if (reviewStatus === 'approved') return 'approved';
    if (reviewStatus === 'rejected') return 'rejected';
    if (isSampleComplete(sampleId)) return 'ready';
    if (labels[sampleId] && Object.keys(labels[sampleId]).length > 0) return 'draft';
    return 'unlabeled';
  };

  const filteredSamples = useMemo(() => {
    let result = samples.map((sample, index) => ({ ...sample, originalIndex: index, _status: getSampleStatus(sample.id) }));
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(s => {
        if (String(s.id ?? '').toLowerCase().includes(q)) return true;
        return s.messages?.some((msg: any) => msg.content?.toLowerCase().includes(q));
      });
    }
    if (tableFilter !== 'all') result = result.filter(s => s._status === tableFilter);
    result.sort((a, b) => {
      if (tableSort === 'id_asc') return String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true });
      if (tableSort === 'id_desc') return String(b.id ?? '').localeCompare(String(a.id ?? ''), undefined, { numeric: true });
      if (tableSort === 'status') return ({ unlabeled: 1, draft: 2, rejected: 3, ready: 4, submitted: 5, approved: 6 }[a._status] || 0) - ({ unlabeled: 1, draft: 2, rejected: 3, ready: 4, submitted: 5, approved: 6 }[b._status] || 0);
      return 0;
    });
    return result;
  }, [samples, debouncedSearch, tableFilter, tableSort, labels]);

  const totalPages = Math.max(1, Math.ceil(filteredSamples.length / ITEMS_PER_PAGE));
  const pagedSamples = filteredSamples.slice((tablePage - 1) * ITEMS_PER_PAGE, tablePage * ITEMS_PER_PAGE);

  React.useEffect(() => { setTablePage(1); }, [debouncedSearch, tableFilter, tableSort]);

  const drawerSample = drawerSampleId ? samples.find(s => s.id === drawerSampleId) : null;

  const renderStatusBadge = (status: string) => {
    if (status === 'approved') return <span className="sl-status-badge sl-status-labeled"><CheckCircle size={12} /> Đã duyệt</span>;
    if (status === 'submitted') return <span className="sl-status-badge sl-status-draft"><Clock size={12} /> Đã nộp</span>;
    if (status === 'rejected') return <span className="sl-status-badge sl-status-unlabeled"><AlertCircle size={12} /> Bị từ chối</span>;
    if (status === 'ready') return <span className="sl-status-badge sl-status-labeled"><CheckCircle size={12} /> Sẵn sàng nộp</span>;
    if (status === 'draft') return <span className="sl-status-badge sl-status-draft"><Edit3 size={12} /> Đang lưu nháp</span>;
    return <span className="sl-status-badge sl-status-unlabeled"><Clock size={12} /> Chưa gán</span>;
  };

  // ============ RENDER ============
  return (
    <div className="sl-container">
      <ToastContainer toasts={toasts} />
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {isLocked && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 16px', borderRadius: 10, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              🔒 Task này đã bị thu hồi/thay thế. Bạn chỉ có thể xem; phần còn lại không thể chỉnh sửa. (Lịch sử đã làm vẫn được giữ để tính công.)
            </div>
          )}
          {/* Top bar */}
          <div className="sl-topbar">
            <div className="sl-topbar-left">
              <button className="sl-back-btn" onClick={handleBack}><ArrowLeft size={18} /><span>Quay lại</span></button>
              <div className="sl-topbar-info">
                <h2>
                  {taskName}
                  <span className="sl-topbar-dataset">
                    ({task?.dataset || 'Toan_11'} - {task?.version || 'v3'})
                  </span>
                </h2>
              </div>
            </div>
            <div className="sl-topbar-right">
              {task?.guideline && <button className="sl-guide-btn" onClick={() => setShowGuideline(!showGuideline)}><FileText size={14} /> Hướng dẫn</button>}
              {(() => {
                // Các câu đã hoàn chỉnh nhưng chưa nộp (status labeling/rejected)
                const submittable = samples.filter((s: any) => isSampleComplete(s.id) && ['labeling', 'rejected'].includes(s.reviewStatus || 'labeling'));
                if (submittable.length === 0) return null;
                return (
                  <button
                    className="sl-submit-btn sl-submit-active"
                    onClick={() => handleSubmitSamples(submittable.map((s: any) => s.id))}
                    disabled={isSubmitting || isLocked}
                    title="Nộp tất cả câu đã hoàn chỉnh (không cần xong cả lô)"
                  >
                    <Send size={16} /> {isSubmitting ? 'Đang nộp...' : `Nộp ${submittable.length} câu đã xong`}
                  </button>
                );
              })()}
            </div>
          </div>

          {rejectedSamples.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 14px', borderRadius: 10, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
              🔴 Có {rejectedSamples.length} câu bị từ chối, cần chỉnh sửa lại.
            </div>
          )}

          {showGuideline && task?.guideline && (
            <div className="sl-guideline-panel">
              <div className="sl-guideline-header"><h4><FileText size={16} /> Hướng dẫn gán nhãn</h4><button onClick={() => setShowGuideline(false)}><X size={16} /></button></div>
              <p>{task.guideline}</p>
            </div>
          )}

          {savedDraft && <div className="sl-toast"><CheckCircle size={16} />Đã lưu nháp thành công!</div>}

          {/* Stats Dashboard */}
          <div className="sl-stats-dashboard">
            <div className="sl-stat-card sl-stat-total">
              <div className="sl-stat-icon"><MessageSquare size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.length}</span>
                <span className="sl-stat-label">Tổng mẫu</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-done">
              <div className="sl-stat-icon"><CheckCircle size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{labeledCount}</span>
                <span className="sl-stat-label">Đã gán nhãn</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-wip">
              <div className="sl-stat-icon"><AlertCircle size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.filter(s => getSampleStatus(s.id) === 'draft').length}</span>
                <span className="sl-stat-label">Đang làm (Nháp)</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-pending">
              <div className="sl-stat-icon"><Clock size={20} /></div>
              <div className="sl-stat-info">
                <span className="sl-stat-value">{samples.filter(s => getSampleStatus(s.id) === 'unlabeled').length}</span>
                <span className="sl-stat-label">Chưa gán</span>
              </div>
            </div>
            <div className="sl-stat-card sl-stat-progress">
              <div className="sl-stat-progress-info">
                <span className="sl-stat-label">Tiến độ hoàn thành</span>
                <span className="sl-stat-percent">{progress}%</span>
              </div>
              <div className="sl-stat-progress-bar">
                <div className="sl-stat-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>


          {/* Search / Filter / Sort */}
          <div className="sl-table-controls">
            <div className="sl-table-search"><Search size={16} /><input type="text" placeholder="Tìm theo ID hoặc nội dung..." value={tableSearch} onChange={e => setTableSearch(e.target.value)} /></div>
            <select value={tableFilter} onChange={e => setTableFilter(e.target.value as any)} className="sl-table-select">
              <option value="all">Tất cả ({samples.length})</option>
              <option value="unlabeled">Chưa gán ({samples.filter(s => getSampleStatus(s.id) === 'unlabeled').length})</option>
              <option value="draft">Nháp ({samples.filter(s => getSampleStatus(s.id) === 'draft').length})</option>
              <option value="ready">Sẵn sàng nộp ({labeledCount})</option>
            </select>
            <select value={tableSort} onChange={e => setTableSort(e.target.value as any)} className="sl-table-select">
              <option value="id_asc">ID tăng dần</option>
              <option value="id_desc">ID giảm dần</option>
              <option value="status">Ưu tiên chưa làm</option>
            </select>
          </div>

          {/* DATA TABLE */}
          <div className="sl-data-table-wrapper">
            <table className="sl-data-table">
              <thead><tr>
                <th style={{ width: '60px' }}>STT</th>
                <th style={{ width: '120px' }}>ID</th>
                <th>Nội dung tóm tắt</th>
                <th style={{ width: '100px' }}>Tin nhắn</th>
                <th style={{ width: '140px' }}>Trạng thái</th>
                <th style={{ width: '120px' }}>Hành động</th>
              </tr></thead>
              <tbody>
                {pagedSamples.length === 0 ? (
                  <tr><td colSpan={6} className="sl-table-empty">Không tìm thấy mẫu nào phù hợp</td></tr>
                ) : pagedSamples.map((sample, idx) => {
                  const status = sample._status;
                  const globalIdx = (tablePage - 1) * ITEMS_PER_PAGE + idx + 1;
                  const snippet = sample.messages?.[0]?.content?.substring(0, 80) || '—';
                  return (
                    <tr key={sample.id} className={`sl-table-row ${drawerSampleId === sample.id ? 'sl-row-active' : ''}`}>
                      <td className="sl-table-cell sl-cell-stt">{globalIdx}</td>
                      <td className="sl-table-cell sl-cell-id">#{String(sample.id).substring(0, 8)}</td>
                      <td className="sl-table-cell sl-cell-snippet">{snippet}{snippet.length >= 80 ? '...' : ''}</td>
                      <td className="sl-table-cell sl-cell-msg-count"><MessageSquare size={14} /> {sample.messages?.length || 0}</td>
                      <td className="sl-table-cell">{renderStatusBadge(status)}</td>
                      <td className="sl-table-cell sl-cell-action">
                        <button className={`sl-action-btn ${status === 'unlabeled' ? 'sl-btn-primary' : status === 'draft' ? 'sl-btn-warning' : 'sl-btn-secondary'}`} onClick={() => handleOpenDrawer(sample.id)} disabled={submitted}>
                          {status === 'unlabeled' && <><Tag size={13} /> Gán nhãn</>}
                          {status === 'draft' && <><Edit3 size={13} /> Sửa</>}
                          {status === 'ready' && <><Eye size={13} /> Xem</>}
                          {status === 'submitted' && <><Eye size={13} /> Xem</>}
                          {status === 'approved' && <><Eye size={13} /> Xem</>}
                          {status === 'rejected' && <><Edit3 size={13} /> Sửa lại</>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredSamples.length > ITEMS_PER_PAGE && (
            <div className="sl-table-pagination">
              <button disabled={tablePage <= 1} onClick={() => setTablePage(p => p - 1)}><ChevronLeft size={16} /> Trang trước</button>
              <div className="sl-pagination-info">Trang {tablePage} / {totalPages} · Hiển thị {pagedSamples.length} / {filteredSamples.length} mẫu</div>
              <button disabled={tablePage >= totalPages} onClick={() => setTablePage(p => p + 1)}>Trang sau <ChevronRight size={16} /></button>
            </div>
          )}

          {/* ===== DRAWER ===== */}
          {drawerSampleId && drawerSample && (
            <div className="sl-drawer-overlay" onClick={handleCloseDrawer}>
              <div className="sl-drawer" onClick={e => e.stopPropagation()}>
                {/* Drawer Header */}
                <div className="sl-drawer-header">
                  <div className="sl-drawer-title">
                    <span className="sl-drawer-id">#{String(drawerSample.id).substring(0, 8)}</span>
                    {renderStatusBadge(getSampleStatus(drawerSample.id))}
                    {(() => {
                      const rs = reviewOf(drawerSample.id);
                      const map: any = {
                        submitted: { t: 'Đã nộp - chờ duyệt', c: '#92400e', b: '#fef3c7' },
                        approved: { t: 'Đã duyệt', c: '#166534', b: '#dcfce7' },
                        rejected: { t: 'Bị từ chối', c: '#b91c1c', b: '#fee2e2' },
                      };
                      return map[rs] ? (
                        <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: map[rs].c, background: map[rs].b }}>{map[rs].t}</span>
                      ) : null;
                    })()}
                    <span style={{ marginLeft: 12, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                      <MessageSquare size={13} />
                      Hội thoại · {drawerSample.messages?.length || 0} tin nhắn
                    </span>
                  </div>
                  <div className="sl-drawer-actions">
                    <div className="sl-zoom-controls">
                      <button onClick={() => setChatFontSize(f => Math.max(10, f - 1))}>A-</button>
                      <span>{chatFontSize}px</span>
                      <button onClick={() => setChatFontSize(f => Math.min(24, f + 1))}>A+</button>
                    </div>
                    {!isSampleLocked(drawerSample.id) && (
                      <button
                        className="sl-drawer-next-btn"
                        style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' }}
                        onClick={() => handleSubmitSamples([drawerSample.id])}
                        disabled={isSubmitting || !isSampleComplete(drawerSample.id)}
                        title={isSampleComplete(drawerSample.id) ? 'Nộp câu này để giám sát duyệt' : 'Cần gán đủ nhãn tổng hội thoại hoặc nhãn từng tin nhắn trước khi nộp'}
                      >
                        <Send size={14} /> Nộp câu #{drawerSample.id}
                      </button>
                    )}
                    {(() => {
                      const recentComplete = recentlyEdited.filter(id => isSampleComplete(id) && ['labeling','rejected'].includes(reviewOf(id)));
                      const isOnlyCurrentSample = recentComplete.length === 1 && String(recentComplete[0]) === String(drawerSample.id);
                      if (recentComplete.length < 2 || isOnlyCurrentSample) return null;
                      return (
                        <button
                          className="sl-drawer-next-btn"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff' }}
                          onClick={() => handleSubmitSamples(recentComplete)}
                          disabled={isSubmitting}
                          title={`Nộp ${recentComplete.length} câu vừa sửa gần nhất`}
                        >
                          <Send size={14} /> Nộp {recentComplete.length} câu vừa sửa
                        </button>
                      );
                    })()}
                    <button className="sl-drawer-next-btn" onClick={handleNextUnlabeled}>Lưu & Tới câu kế <ChevronRight size={16} /></button>
                    <button className="sl-drawer-close-btn" onClick={handleCloseDrawer}><X size={20} /></button>
                  </div>
                </div>
                {reviewOf(drawerSample.id) === 'rejected' && drawerSample.rejectReason && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 14px', margin: '0 16px 8px', borderRadius: 8, fontSize: 13 }}>
                    <strong>Lý do từ chối:</strong> {drawerSample.rejectReason}
                  </div>
                )}

                {/* Drawer Body: Label Panel (LEFT) | Chat (RIGHT) */}
                <div className="sl-drawer-body">
                  {/* LEFT: Label Panel */}
                  <div className="sl-label-panel">
                    <div className="sl-label-guide-collapsible">
                      <button className="sl-label-guide-toggle" onClick={() => setGuideOpen(o => !o)}>
                        <FileText size={13} />
                        Hướng dẫn nhãn
                        <ChevronDown size={13} style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: guideOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                      </button>
                      {guideOpen && (
                        <div className="sl-label-guide compact">
                          <ul>
                            <li><strong>Intent học sinh:</strong> mục đích của học sinh, không dùng đúng/sai tại đây.</li>
                            <li><strong>Action của AI:</strong> hành vi phản hồi của AI, chọn sau khi phân loại Gold/Bad.</li>
                            <li><strong>Chất lượng hội thoại:</strong> nhãn cấp mẫu, đồng bộ với luồng admin.</li>
                          </ul>
                          <div className="sl-label-guide-examples">
                            <strong>Giải thích nhanh:</strong>
                            <span><b>Học sinh trả lời/thử làm bài</b>: học sinh đưa đề, đáp án, phép tính, hoặc đang cố gắng làm.</span>
                            <span><b>Xin gợi ý</b>: học sinh bị bí và muốn gợi ý ngắn.</span>
                            <span><b>Hỏi lý thuyết</b>: hỏi công thức, định nghĩa, quy tắc.</span>
                            <span><b>Yêu cầu giải thích</b>: hỏi vì sao, muốn giải thích lại lời giải.</span>
                            <span><b>Muốn học tiếp/chuyển câu</b>: chỉ dùng khi học sinh đã xong ý hiện tại và muốn sang phần tiếp theo.</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="sl-label-group">
                      <label>📚 Môn học</label>
                      <select value={getLabel(drawerSample.id, 'subject')} onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__add_new__') { const n = window.prompt('Nhập tên môn học mới:'); if (n?.trim()) { if (!subjectOptions.includes(n.trim())) setSubjectOptions([...subjectOptions, n.trim()]); setLabel(drawerSample.id, 'subject', n.trim()); } }
                        else setLabel(drawerSample.id, 'subject', val);
                      }} className="sl-select">
                        <option value="">-- Chọn --</option>
                        {subjectOptions.map(o => <option key={o} value={o}>{getLabelText(o) || o}</option>)}
                        <option value="__add_new__" style={{ fontWeight: 'bold', color: '#2563eb' }}>+ Thêm môn học khác...</option>
                      </select>
                    </div>
                    <div className="sl-label-row-2">
                      <div className="sl-label-group">
                        <label>Trạng thái hoàn thành</label>
                        <select value={getLabel(drawerSample.id, 'completion')} onChange={(e) => setLabel(drawerSample.id, 'completion', e.target.value)} className="sl-select">
                          <option value="">-- Chọn --</option>
                          {COMPLETION_OPTIONS.map(o => <option key={o} value={o}>{getLabelText(o)}</option>)}
                        </select>
                      </div>
                      <div className="sl-label-group">
                        <label>Chất lượng hội thoại</label>
                        <select value={getLabel(drawerSample.id, 'quality')} onChange={(e) => setLabel(drawerSample.id, 'quality', e.target.value)} className="sl-select">
                          <option value="">-- Chọn --</option>
                          {QUALITY_OPTIONS.map(o => <option key={o} value={o}>{getLabelText(o)}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="sl-label-group">
                      <label>Cờ lỗi</label>
                      <div className="sl-flags-row">
                        {flagOptions.map(flag => (
                          <label key={flag} className={`sl-flag-chip ${getFlags(drawerSample.id).includes(flag) ? 'active' : ''}`}>
                            <input type="checkbox" checked={getFlags(drawerSample.id).includes(flag)} onChange={() => toggleFlag(drawerSample.id, flag)} />{getLabelText(flag)}
                          </label>
                        ))}
                        <button className="sl-flag-chip" style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'transparent', color: '#64748b' }} onClick={() => {
                          const n = window.prompt('Nhập tên cờ lỗi mới:');
                          if (n?.trim()) { if (!flagOptions.includes(n.trim())) setFlagOptions([...flagOptions, n.trim()]); if (!getFlags(drawerSample.id).includes(n.trim())) toggleFlag(drawerSample.id, n.trim()); }
                        }}>+ Thêm...</button>
                      </div>
                    </div>
                    <div className="sl-label-group">
                      <label>📝 Ghi chú</label>
                      <textarea className="sl-textarea" placeholder="Ghi chú của bạn..." value={getLabel(drawerSample.id, 'note')} onChange={(e) => setLabel(drawerSample.id, 'note', e.target.value)} rows={2} />
                    </div>
                    {aiAssistEnabled && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select value={aiProvider} onChange={(e) => { setAiProvider(e.target.value); setAiModel(''); }} className="sl-inline-select" style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', color: '#475569', cursor: 'pointer', minWidth: '170px' }} disabled={isAiLoading}>
                          {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        {aiProvider === 'oauth_gateway' && (
                          <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="sl-inline-select" style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', color: '#475569', minWidth: '210px' }} disabled={isAiLoading} title="Chỉ hiển thị model tài khoản OAuth đang có quyền sử dụng">
                            <option value="">Tự động chọn model</option>
                            {gatewayModels.map((model) => <option key={model} value={model}>{model}</option>)}
                          </select>
                        )}
                        <button className="sl-ai-btn" onClick={() => handleAIAssist(drawerSample.id)} disabled={isAiLoading}>
                          {isAiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          {isAiLoading ? 'Đang phân tích...' : 'Gợi ý AI'}
                        </button>
                        {aiBackup[drawerSample.id] && (
                          <button className="sl-ai-btn" onClick={() => handleRollbackAI(drawerSample.id)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>Hoàn tác AI</button>
                        )}
                      </div>
                    )}

                    {/* Tóm tắt AI Panel — hiện sau khi chạy AI */}
                    {aiSummary[drawerSample.id] && (() => {
                      const s = aiSummary[drawerSample.id];
                      const qualityColor: Record<string, string> = { Gold: '#059669', Rewrite: '#d97706', Bad: '#dc2626', Good: '#059669', Medium: '#d97706', Poor: '#dc2626' };
                      const qColor = qualityColor[s.quality] || '#64748b';
                      return (
                        <div className="sl-ai-summary-card">
                          <div className="sl-ai-summary-title"><Sparkles size={13} /> Phân tích AI</div>
                          <div className="sl-ai-summary-tags">
                            {s.subject && <span>{getLabelText(s.subject)}</span>}
                            {s.completion && <span>{getLabelText(s.completion)}</span>}
                            {s.quality && <span style={{ color: qColor }}>{getLabelText(s.quality)}</span>}
                          </div>
                          {s.quality_reason && <div className="sl-ai-summary-reason">{s.quality_reason}</div>}
                        </div>
                      );
                    })()}
                  </div>

                  {/* RIGHT: Chat Messages */}
                  <div className="sl-chat-area">
                    <div className="sl-message-table-head">
                      <span>Lượt</span>
                      <span>Nội dung hội thoại</span>
                      <span>Nhãn gán</span>
                    </div>
                    {drawerSample.messages?.map((msg: any, mIdx: number) => {
                      const meta = aiMeta[drawerSample.id]?.[mIdx];
                      const conf = meta?.confidence ?? null;
                      const badOk = meta?.is_correct_pedagogy !== false;
                      const msgRole = normalizeRole(msg.role);
                      const confColor = conf === null ? undefined
                        : conf >= 0.8 ? '#059669' : conf >= 0.6 ? '#d97706' : '#dc2626';
                      const confLabel = null;
                      const borderColor = undefined;
                      return (
                      <div key={mIdx} className={`sl-msg ${msgRole}`} style={!badOk ? { outline: '2px solid #fca5a5', borderRadius: 8 } : undefined}>
                        <div className="sl-msg-header">
                          <span className="sl-msg-icon">{msgRole === 'user' ? 'HS' : 'AI'}</span>
                          <span className="sl-msg-role">{msgRole === 'user' ? 'Học sinh' : 'Trợ lý'}</span>
                          <span className="sl-msg-turn">Turn {Math.floor(mIdx / 2) + 1}</span>
                          {!badOk && (
                            <span title={meta?.pedagogy_note || 'Có thể vi phạm Socratic'} style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'help' }}>
                              ⚠️ Socratic
                            </span>
                          )}
                        </div>
                        <div className={`sl-msg-bubble ${msgRole}`} style={{ fontSize: `${chatFontSize}px` }}><textarea key={`${drawerSample.id}-${mIdx}`} className="sl-message-editor" defaultValue={getEditedMessageContent(drawerSample.id, mIdx, msg.content || '')} onBlur={(e) => setEditedMessageContent(drawerSample.id, mIdx, e.currentTarget.value)} disabled={isSampleLocked(drawerSample.id)} /></div>
                        {!badOk && meta?.pedagogy_note && (
                          <div style={{ margin: '2px 8px 4px', padding: '4px 10px', borderRadius: 6, background: '#fef2f2', color: '#b91c1c', fontSize: 11, fontStyle: 'italic' }}>
                            {meta.pedagogy_note}
                          </div>
                        )}
                        <div className="sl-msg-label-row">
                          {msgRole === 'user' ? (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Ý định học sinh <small>Nhãn người gán</small></span>
                              <div className="sl-multi-labels">{intentOptions.map((opt: string) => { const active=getEffectiveMsgLabels(drawerSample.id,mIdx,'intent',msgRole).includes(opt); return <button type="button" key={opt} className={active?'active':''} title={getLabelHelp(opt) || opt} onClick={()=>toggleMessageLabel(drawerSample.id,mIdx,'intent',opt)} disabled={isSampleLocked(drawerSample.id)}><Check size={12}/>{getLabelText(opt)}</button>; })}</div>
                              <select multiple
                                value={getEffectiveMsgLabels(drawerSample.id, mIdx, 'intent', msgRole)}
                                onChange={e => toggleMessageLabel(drawerSample.id, mIdx, 'intent', e.target.value)}
                                className="sl-select sl-select-sm" hidden
                                style={borderColor ? { borderColor } : undefined}
                                disabled={isSampleLocked(drawerSample.id)}
                              >
                                <option value="">-- Chọn ý định --</option>
                                {intentOptions.map((opt: string) => <option key={opt} value={opt}>{getLabelText(opt)}</option>)}
                              </select>
                              {confLabel && (
                                <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: confColor + '22', color: confColor, fontSize: 11, fontWeight: 700 }}>
                                  AI đề xuất: {confLabel} {conf !== null ? Math.round(conf * 100) + '%' : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="sl-inline-label">
                              <span className="sl-label-tag">Hành động của AI <small>Chọn Gold/Bad trước rồi mới chọn Action</small></span>
                              <div className="sl-response-quality">
                                <div className="sl-action-group-title">Phân loại phản hồi AI</div>
                                <div className="sl-quality-toggle">
                                  {RESPONSE_QUALITY_OPTIONS.map((opt) => {
                                    const active = getMsgLabel(drawerSample.id, mIdx, 'responseQuality') === opt;
                                    return (
                                      <button
                                        type="button"
                                        key={opt}
                                        className={`${active ? 'active ' : ''}${opt === 'Bad' ? 'bad' : 'good'}`}
                                        title={getLabelHelp(opt) || opt}
                                        onClick={() => setResponseQuality(drawerSample.id, mIdx, opt)}
                                        disabled={isSampleLocked(drawerSample.id)}
                                      >
                                        <Check size={12}/>{getLabelText(opt)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="sl-action-groups">
                                {ACTION_GROUPS.map(group => {
                                  const values = group.values.filter((opt) => actionOptions.includes(opt));
                                  if (!values.length) return null;
                                  return (
                                    <div className="sl-action-group" key={group.title}>
                                      <div className="sl-action-group-title">{group.title}</div>
                                      <div className="sl-multi-labels">{values.map((opt: string) => { const active=getEffectiveMsgLabels(drawerSample.id,mIdx,'action',msgRole).includes(opt); const needQuality=!getMsgLabel(drawerSample.id,mIdx,'responseQuality'); return <button type="button" key={opt} className={active?'active':''} title={needQuality ? 'Cần phân loại Gold/Bad trước' : (getLabelHelp(opt) || opt)} onClick={()=>toggleMessageLabel(drawerSample.id,mIdx,'action',opt)} disabled={isSampleLocked(drawerSample.id) || needQuality}><Check size={12}/>{getLabelText(opt)}</button>; })}</div>
                                    </div>
                                  );
                                })}
                                {actionOptions.some((opt: string) => !ACTION_GROUPS.some(group => group.values.includes(opt))) && (
                                  <div className="sl-action-group">
                                    <div className="sl-action-group-title">Nhãn khác</div>
                                    <div className="sl-multi-labels">
                                      {actionOptions.filter((opt: string) => !ACTION_GROUPS.some(group => group.values.includes(opt))).map((opt: string) => { const active=getEffectiveMsgLabels(drawerSample.id,mIdx,'action',msgRole).includes(opt); const needQuality=!getMsgLabel(drawerSample.id,mIdx,'responseQuality'); return <button type="button" key={opt} className={active?'active':''} title={needQuality ? 'Cần phân loại Gold/Bad trước' : (getLabelHelp(opt) || opt)} onClick={()=>toggleMessageLabel(drawerSample.id,mIdx,'action',opt)} disabled={isSampleLocked(drawerSample.id) || needQuality}><Check size={12}/>{getLabelText(opt)}</button>; })}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <select multiple
                                value={getEffectiveMsgLabels(drawerSample.id, mIdx, 'action', msgRole)}
                                onChange={e => toggleMessageLabel(drawerSample.id, mIdx, 'action', e.target.value)}
                                className="sl-select sl-select-sm" hidden
                                style={borderColor ? { borderColor } : undefined}
                                disabled={isSampleLocked(drawerSample.id)}
                              >
                                <option value="">-- Chọn hành động --</option>
                                {actionOptions.map((opt: string) => <option key={opt} value={opt}>{getLabelText(opt)}</option>)}
                              </select>
                              {confLabel && (
                                <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 99, background: confColor + '22', color: confColor, fontSize: 11, fontWeight: 700 }}>
                                  AI đề xuất: {confLabel} {conf !== null ? Math.round(conf * 100) + '%' : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {/* Tóm tắt AI Panel */}
                    {aiSummary[drawerSample.id] && (
                      <div style={{ margin: '12px 0 0', padding: '10px 14px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>Tóm tắt AI</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {aiSummary[drawerSample.id].subject && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontSize: 12 }}>{aiSummary[drawerSample.id].subject}</span>}
                          {aiSummary[drawerSample.id].completion && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#15803d', fontSize: 12 }}>✅ {aiSummary[drawerSample.id].completion}</span>}
                          {aiSummary[drawerSample.id].quality && <span style={{ padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#b45309', fontSize: 12 }}>⭐ {aiSummary[drawerSample.id].quality}</span>}
                        </div>
                        {aiSummary[drawerSample.id].quality_reason && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#374151', fontStyle: 'italic' }}>{aiSummary[drawerSample.id].quality_reason}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Modal */}
          {showSubmitModal && (
            <div className="sl-modal-overlay" onClick={() => setShowSubmitModal(false)}>
              <div className="sl-modal" onClick={e => e.stopPropagation()}>
                <div className="sl-modal-header">
                  <h3><Send size={18} /> Xác nhận Submit</h3>
                  <button onClick={() => setShowSubmitModal(false)}><X size={18} /></button>
                </div>
                <div className="sl-modal-body">
                  {unlabeledCount > 0 ? (
                    <div className="sl-modal-warning"><AlertCircle size={20} /><div><strong>Còn {unlabeledCount} sample chưa gán nhãn!</strong><p>Bạn cần gán nhãn cho TẤT CẢ sample trước khi submit.</p></div></div>
                  ) : (
                    <>
                      <div className="sl-modal-success"><CheckCircle size={20} /><div><strong>Đã gán nhãn đầy đủ {samples.length}/{samples.length} samples!</strong><p>Sau khi submit, bạn sẽ không thể chỉnh sửa.</p></div></div>
                      <div className="sl-modal-actions">
                        <button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Hủy</button>
                        <button className="sl-btn-confirm" onClick={handleSubmit}><Send size={16} /> Submit kết quả</button>
                      </div>
                    </>
                  )}
                  <button className="sl-btn-cancel" onClick={() => setShowSubmitModal(false)}>Hủy</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StaffLabelView;
