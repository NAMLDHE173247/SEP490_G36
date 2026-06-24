import { ILlmProvider } from '../../../services/providers/ILlmProvider';

export type AutoLabelV2InputMessage = { messageIndex: number; role: 'user' | 'assistant'; content: string; };
export type AutoLabelV2MessageLabel = { messageIndex: number; intent?: string; action?: string; confidence: number; response_quality?: 'Gold' | 'Bad' | 'Rewrite'; is_correct_pedagogy?: boolean; pedagogy_note?: string; };
export type AutoLabelV2Response = { subject: string; completion: string; quality: string; quality_reason: string; messages: AutoLabelV2MessageLabel[]; };

export const STUDENT_INTENTS: Record<string, string> = {
  ANSWER_ATTEMPT: 'Student attempts to answer the exercise; correctness is not an intent',
  REQUEST_HINT: 'Student asks for a hint',
  ASK_THEORY: 'Student asks about theory or concepts',
  REQUEST_EXPLANATION: 'Student asks for re-explanation',
  REQUEST_SIMPLER: 'Student asks for simpler explanation',
  SKIP_EXERCISE: 'Student wants to skip or switch exercise',
  DISCOURAGED: 'Student shows discouragement or frustration',
  OFF_TOPIC: 'Student goes off topic',
  READY_NEXT: 'Student signals readiness for next content',
  CONFIRM_UNDERSTANDING: 'Student confirms their understanding',
};

export const ASSISTANT_ACTIONS: Record<string, string> = {
  CONFIRM_CORRECT_ANSWER: 'Tutor confirms that the student answer is correct',
  IDENTIFY_INCORRECT_ANSWER: 'Tutor points out that the student answer is incorrect',
  CORRECT_MISTAKE: 'Tutor corrects a mistake or misconception',
  PRAISING: 'Praise effort or progress',
  SCAFFOLDING: 'Socratic questioning -- guide without revealing answer',
  HINTING: 'Give partial hint, let student infer the rest',
  CONCEPT_CLARIFY: 'Explain theory, definition, or formula',
  LOGIC_BREAKDOWN: 'Walk through logic step by step',
  SIMPLIFYING: 'Simplify with concrete examples or analogies',
  MOTIVATING: 'Encourage a discouraged student',
  REDIRECTING: 'Bring student back on topic',
  TRANSITIONING: 'Summarize and move to next section',
  DIRECT_ANSWER: 'Give direct answer -- evaluate if pedagogically appropriate',
  WAITING: 'Ask open question and await student response',
};

const SUBJECTS = new Set(['Math', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Civics', 'IT', 'Multi-subject', 'Unclear']);
const COMPLETIONS = new Set(['Completed', 'Incomplete', 'Abandoned']);
const QUALITIES = new Set(['Gold', 'Rewrite', 'Bad', 'Good', 'Medium', 'Poor']);
const RESPONSE_QUALITIES = new Set(['Gold', 'Bad', 'Rewrite', 'Good', 'Medium', 'Poor']);
const STUDENT_INTENT_SET = new Set(Object.keys(STUDENT_INTENTS));
const ASSISTANT_ACTION_SET = new Set(Object.keys(ASSISTANT_ACTIONS));

function normalizeEnum(value: unknown, allowed: Set<string>, fallback: string): string {
  const normalized = String(value || '').trim();
  if (normalized === 'Good') return allowed.has('Gold') ? 'Gold' : fallback;
  if (normalized === 'Medium') return allowed.has('Rewrite') ? 'Rewrite' : fallback;
  if (normalized === 'Poor') return allowed.has('Bad') ? 'Bad' : fallback;
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeMessageLabel(raw: any, fallbackIndex: number): AutoLabelV2MessageLabel {
  const messageIndex = Number.isInteger(Number(raw?.messageIndex)) ? Number(raw.messageIndex) : fallbackIndex;
  const confidence = Math.min(1, Math.max(0, Number(raw?.confidence) || 0.35));
  const result: AutoLabelV2MessageLabel = { messageIndex, confidence };

  if (raw?.intent) {
    result.intent = normalizeEnum(raw.intent, STUDENT_INTENT_SET, 'ANSWER_ATTEMPT');
  }

  if (raw?.action) {
    result.action = normalizeEnum(raw.action, ASSISTANT_ACTION_SET, 'WAITING');
    result.response_quality = normalizeEnum(raw.response_quality, RESPONSE_QUALITIES, raw?.is_correct_pedagogy === false ? 'Bad' : 'Gold') as 'Gold' | 'Bad' | 'Rewrite';
    result.is_correct_pedagogy = result.response_quality === 'Gold' && raw?.is_correct_pedagogy !== false;
    result.pedagogy_note = result.response_quality !== 'Gold'
      ? String(raw?.pedagogy_note || 'Can xem lai chat luong phan hoi cua AI.')
      : String(raw?.pedagogy_note || '');
  }

  return result;
}

export class AutoLabelV2Service {
  constructor(private readonly provider: ILlmProvider) {}

  private buildPrompt(messages: AutoLabelV2InputMessage[]): string {
    const iKeys = Object.keys(STUDENT_INTENTS).join(' | ');
    const aKeys = Object.keys(ASSISTANT_ACTIONS).join(' | ');
    const iDefs = Object.entries(STUDENT_INTENTS).map(([k, v]) => k + ': ' + v).join('\n  ');
    const aDefs = Object.entries(ASSISTANT_ACTIONS).map(([k, v]) => k + ': ' + v).join('\n  ');
    const conv = messages.map(m => '[' + m.messageIndex + '] ' + (m.role === 'user' ? 'STUDENT' : 'TUTOR') + ': ' + m.content).join('\n');
    const nl = '\n';
    return (
      'You are an expert in Socratic AI tutoring quality analysis.' + nl + nl +
      'SOCRATIC METHOD: Good tutor does NOT give direct answers before student tries.' + nl +
      'Uses probing questions (SCAFFOLDING) for self-discovery.' + nl +
      'VIOLATION = giving full answer without guiding first.' + nl + nl +
      'STUDENT INTENTS:' + nl + '  ' + iDefs + nl + nl +
      'TUTOR ACTIONS:' + nl + '  ' + aDefs + nl + nl +
      'CONVERSATION:' + nl + conv + nl + nl +
      'OUTPUT: Return ONLY a valid JSON object. No markdown. No text outside JSON.' + nl +
      'Schema fields:' + nl +
      '  subject: one of Math/Physics/Chemistry/Biology/English/History/Geography/Civics/IT/Multi-subject/Unclear' + nl +
      '  completion: one of Completed/Incomplete/Abandoned' + nl +
      '  quality: one of Gold/Rewrite/Bad' + nl +
      '  quality_reason: 1-2 sentences on Socratic adherence' + nl +
      '  messages: array where each entry has messageIndex plus:' + nl +
      '    - for user: intent (one of ' + iKeys + ') and confidence (0.0-1.0)' + nl +
      '    - for assistant: response_quality (Gold, Bad, or Rewrite), action (one of ' + aKeys + '), confidence, is_correct_pedagogy (bool), pedagogy_note (string)' + nl + nl +
      'RULES: user entries have intent only. Do NOT use CORRECT/INCORRECT as student intents; use ANSWER_ATTEMPT for student answers. ' +
      'assistant entries must first evaluate response_quality, then choose action. If the tutor judges an answer as right/wrong, use CONFIRM_CORRECT_ANSWER, IDENTIFY_INCORRECT_ANSWER, or CORRECT_MISTAKE as assistant action.' + nl +
      'Never invent new labels. Use only the listed enum values.' + nl +
      'pedagogy_note required when is_correct_pedagogy is false, empty string when true.'
    );
  }

  async preview(messages: AutoLabelV2InputMessage[]): Promise<AutoLabelV2Response> {
    if (!messages || !messages.length) {
      throw Object.assign(new Error('messages is required.'), { statusCode: 400 });
    }
    const rawText = await this.provider.generateContent(this.buildPrompt(messages));
    try {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? rawText.slice(firstBrace, lastBrace + 1) : rawText;
      const parsed = JSON.parse(jsonText) as AutoLabelV2Response;
      parsed.subject = normalizeEnum(parsed.subject, SUBJECTS, 'Unclear');
      parsed.completion = normalizeEnum(parsed.completion, COMPLETIONS, 'Incomplete');
      parsed.quality = normalizeEnum(parsed.quality, QUALITIES, 'Rewrite');
      parsed.quality_reason = String(parsed.quality_reason || '');
      const normalizedByIndex = new Map<number, AutoLabelV2MessageLabel>();
      if (Array.isArray(parsed.messages)) {
        parsed.messages.map(normalizeMessageLabel).forEach((message) => {
          normalizedByIndex.set(message.messageIndex, message);
        });
      }
      parsed.messages = messages.map((source, index) => {
        const label = normalizedByIndex.get(source.messageIndex) || normalizedByIndex.get(index) || { messageIndex: source.messageIndex, confidence: 0.35 };
        if (source.role === 'user') {
          return {
            ...label,
            messageIndex: source.messageIndex,
            intent: normalizeEnum((label as any).intent, STUDENT_INTENT_SET, 'ANSWER_ATTEMPT'),
            action: undefined,
            response_quality: undefined,
            is_correct_pedagogy: undefined,
          };
        }
        const responseQuality = normalizeEnum((label as any).response_quality, RESPONSE_QUALITIES, (label as any).is_correct_pedagogy === false ? 'Bad' : 'Rewrite') as 'Gold' | 'Bad' | 'Rewrite';
        return {
          ...label,
          messageIndex: source.messageIndex,
          intent: undefined,
          action: normalizeEnum((label as any).action, ASSISTANT_ACTION_SET, 'WAITING'),
          response_quality: responseQuality,
          is_correct_pedagogy: responseQuality === 'Gold',
          pedagogy_note: responseQuality === 'Gold' ? String((label as any).pedagogy_note || '') : String((label as any).pedagogy_note || 'Cần xem lại phản hồi AI.'),
        };
      });
      return parsed;
    } catch (e) {
      console.error('[AutoLabelV2] Failed to parse AI response:', rawText);
      throw Object.assign(new Error('AI response formatting error.'), { statusCode: 500 });
    }
  }
}
