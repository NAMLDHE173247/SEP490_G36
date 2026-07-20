import { RouterSignal, RoutingContext, RoutingIntent, RoutingSubject } from './routingTypes';

const SUBJECT_TERMS: Record<string, Array<[string, number]>> = {
  ENGLISH: [['english', 5], ['tieng anh', 5], ['grammar', 5], ['vocabulary', 5], ['reading', 4], ['writing', 4], ['phat am', 4], ['passive voice', 5], ['tenses', 4]],
  MATH: [['đạo hàm', 5], ['tích phân', 5], ['phương trình bậc hai', 5], ['xác suất', 5], ['ma trận', 5], ['logarit', 5], ['hàm số', 4], ['tam giác', 3], ['phân số', 3], ['nghiệm', 2], ['phương trình', 2], ['đồ thị hàm', 3]],
  PHYSICS: [['rơi tự do', 5], ['định luật newton', 5], ['gia tốc', 5], ['vận tốc', 5], ['lực ma sát', 5], ['động năng', 5], ['thế năng', 5], ['điện trở', 5], ['cường độ dòng điện', 5], ['nhiệt lượng', 4], ['chuyển động', 3], ['quãng đường', 2], ['khối lượng riêng', 4], ['dao động', 4], ['tần số', 3], ['áp suất', 4]],
  CHEMISTRY: [['phản ứng hóa học', 5], ['phương trình hóa học', 5], ['oxi hóa', 5], ['kết tủa', 5], ['bazơ', 5], ['axit', 5], ['số mol', 5], ['nồng độ mol', 5], ['ph', 4], ['nguyên tử', 3], ['phân tử', 3], ['hóa trị', 4]],
  HISTORY: [['lịch sử', 5], ['triều đại', 4], ['khởi nghĩa', 5], ['chiến dịch', 5], ['cách mạng', 5], ['văn lang', 5], ['âu lạc', 5], ['cổ loa', 5], ['bạch đằng', 5], ['thăng long', 5], ['điện biên phủ', 5], ['hiệp định', 4]],
};

const INTENT_TERMS: Array<[RoutingIntent, string[]]> = [
  ['diagnose_error', ['sai ở đâu', 'vì sao em sai', 'nhầm chỗ nào', 'kiểm tra lỗi']],
  ['check_answer', ['đúng không', 'kiểm tra đáp án', 'em làm đúng', 'xem giúp kết quả']],
  ['give_hint', ['gợi ý', 'hint', 'chỉ em bước tiếp', 'không cho đáp án']],
  ['explain_concept', ['giải thích', 'tại sao', 'vì sao', 'khái niệm']],
  ['solve_problem', ['giải bài', 'tính', 'tìm x', 'chứng minh', 'lập phương trình']],
  ['ask_follow_up', ['chỗ đó', 'phần trên', 'làm tiếp', 'vậy thì sao', 'bước tiếp theo']],
];

const normalize = (value: string) => value.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const containsTerm = (text: string, term: string) => text.includes(term);

export const ruleBasedRoute = (context: RoutingContext): RouterSignal => {
  const question = normalize(context.question);
  const historyText = context.history.slice(-4).map(item => normalize(item.content)).join(' ');
  const isFollowUp = question.split(/\s+/).length <= 8 && ['đó', 'này', 'trên', 'tiếp', 'vậy'].some(term => question.includes(term));
  const text = isFollowUp ? `${historyText} ${question}` : question;
  const scores = new Map<RoutingSubject, number>(Object.keys(SUBJECT_TERMS).map(subject => [subject, 0]));
  const matches = new Map<RoutingSubject, string[]>();

  for (const [subject, terms] of Object.entries(SUBJECT_TERMS)) {
    const found: string[] = [];
    for (const [term, weight] of terms) {
      if (containsTerm(text, term)) { scores.set(subject, (scores.get(subject) || 0) + weight); found.push(term); }
    }
    matches.set(subject, found);
  }
  if (isFollowUp && context.previousSubject && !['UNKNOWN', 'GENERAL'].includes(context.previousSubject)) {
    scores.set(context.previousSubject, (scores.get(context.previousSubject) || 0) + 4);
    matches.set(context.previousSubject, [...(matches.get(context.previousSubject) || []), 'conversation_state']);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topSubject, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] || 0;
  const margin = topScore > 0 ? clamp((topScore - secondScore) / Math.max(5, topScore)) : 0;
  const confidence = topScore > 0 ? clamp(0.45 + Math.min(topScore, 10) / 20 + margin * 0.2) : 0;
  const secondarySubjects = ranked.filter(([, score]) => score > 0 && score >= topScore * 0.6).slice(1).map(([subject]) => subject);
  const isInterdisciplinary = secondarySubjects.length > 0;
  let intent: RoutingIntent = 'unknown';
  for (const [candidate, terms] of INTENT_TERMS) if (terms.some(term => question.includes(term))) { intent = candidate; break; }
  if (intent === 'unknown' && isFollowUp) intent = 'ask_follow_up';
  const weakOrAbsent = topScore < 3;
  const needClarification = weakOrAbsent || (isInterdisciplinary && margin < 0.25);
  const subject: RoutingSubject = topScore > 0 ? topSubject : 'UNKNOWN';
  const matchedTerms = matches.get(subject) || [];
  return {
    subject, secondarySubjects, intent,
    confidence: Number(confidence.toFixed(3)), margin: Number(margin.toFixed(3)),
    needClarification, isInterdisciplinary, matchedTerms,
    reason: topScore > 0 ? `Rule scores: ${ranked.map(([s, v]) => `${s}=${v}`).join(', ')}` : 'Không tìm thấy tín hiệu môn học đủ mạnh.',
  };
};
