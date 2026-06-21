import { ILlmProvider } from '../../../services/providers/ILlmProvider';

export type AutoLabelV2InputMessage = { messageIndex: number; role: 'user' | 'assistant'; content: string; };
export type AutoLabelV2MessageLabel = { messageIndex: number; intent?: string; action?: string; confidence: number; is_correct_pedagogy?: boolean; pedagogy_note?: string; };
export type AutoLabelV2Response = { subject: string; completion: string; quality: string; quality_reason: string; messages: AutoLabelV2MessageLabel[]; };

export const STUDENT_INTENTS: Record<string, string> = {
  CORRECT: 'Student answered correctly',
  INCORRECT: 'Student answered incorrectly or partially',
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
  PRAISING: 'Praise correct answer',
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
      '  quality: one of Good/Medium/Poor' + nl +
      '  quality_reason: 1-2 sentences on Socratic adherence' + nl +
      '  messages: array where each entry has messageIndex plus:' + nl +
      '    - for user: intent (one of ' + iKeys + ') and confidence (0.0-1.0)' + nl +
      '    - for assistant: action (one of ' + aKeys + '), confidence, is_correct_pedagogy (bool), pedagogy_note (string)' + nl + nl +
      'RULES: user entries have intent only. assistant entries have action+is_correct_pedagogy+pedagogy_note.' + nl +
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
      if (Array.isArray(parsed.messages)) {
        parsed.messages = parsed.messages.map(m => ({ ...m, confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0.5)) }));
      }
      return parsed;
    } catch (e) {
      console.error('[AutoLabelV2] Failed to parse AI response:', rawText);
      throw Object.assign(new Error('AI response formatting error.'), { statusCode: 500 });
    }
  }
}
