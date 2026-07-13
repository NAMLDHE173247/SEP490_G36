import { ILlmProvider } from '../providers/ILlmProvider';
import { RouterSignal, RoutingContext, RoutingIntent, RoutingSubject } from './routingTypes';

const SUBJECTS = new Set<RoutingSubject>(['MATH', 'PHYSICS', 'CHEMISTRY', 'GENERAL', 'UNKNOWN']);
const INTENTS = new Set<RoutingIntent>(['solve_problem', 'explain_concept', 'give_hint', 'check_answer', 'diagnose_error', 'ask_follow_up', 'unknown']);
const clamp = (value: unknown) => Math.max(0, Math.min(1, Number(value) || 0));

const parseJsonObject = (raw: string): any => {
  const clean = raw.replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM Router did not return a JSON object');
  return JSON.parse(clean.slice(start, end + 1));
};

export const llmBasedRoute = async (
  context: RoutingContext,
  provider: ILlmProvider,
  model = 'google/gemini-2.5-flash',
): Promise<RouterSignal> => {
  const history = context.history.slice(-6).map(item => `${item.role}: ${item.content}`).join('\n');
  const prompt = `HISTORY:\n${history || '(empty)'}\n\nCURRENT QUESTION:\n${context.question}`;
  const system = `You are a deterministic router for a Vietnamese STEM tutor. Return JSON only.
Schema: {"primary_subject":"MATH|PHYSICS|CHEMISTRY|GENERAL|UNKNOWN","secondary_subjects":[],"intent":"solve_problem|explain_concept|give_hint|check_answer|diagnose_error|ask_follow_up|unknown","confidence":0.0,"need_clarification":false,"reason":"short Vietnamese reason"}.
Use conversation history for short follow-ups. Mathematics used only as a tool inside a physics problem remains PHYSICS; mathematics inside a chemistry calculation remains CHEMISTRY. Use UNKNOWN and need_clarification=true when evidence is insufficient.`;
  const parsed = parseJsonObject(await provider.generateContent(prompt, model, system));
  const subject = SUBJECTS.has(parsed.primary_subject) ? parsed.primary_subject as RoutingSubject : 'UNKNOWN';
  const secondarySubjects = Array.isArray(parsed.secondary_subjects)
    ? parsed.secondary_subjects.filter((item: unknown) => SUBJECTS.has(item as RoutingSubject)) as RoutingSubject[]
    : [];
  const intent = INTENTS.has(parsed.intent) ? parsed.intent as RoutingIntent : 'unknown';
  const confidence = clamp(parsed.confidence);

  return {
    subject,
    secondarySubjects,
    intent,
    confidence,
    margin: 0,
    needClarification: Boolean(parsed.need_clarification) || subject === 'UNKNOWN' || confidence < 0.5,
    isInterdisciplinary: secondarySubjects.length > 0,
    matchedTerms: [],
    reason: String(parsed.reason || 'LLM semantic decision').slice(0, 500),
  };
};
