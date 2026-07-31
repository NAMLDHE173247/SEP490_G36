import { ILlmProvider } from '../providers/ILlmProvider';
import { RouterSignal, RoutingContext, RoutingIntent, RoutingSubject } from './routingTypes';

const DEFAULT_SUBJECTS = ['ENGLISH', 'MATH', 'PHYSICS', 'CHEMISTRY', 'HISTORY', 'GENERAL', 'UNKNOWN'];
const INTENTS = new Set<RoutingIntent>(['solve_problem', 'explain_concept', 'give_hint', 'check_answer', 'diagnose_error', 'ask_follow_up', 'unknown']);
const clamp = (value: unknown) => Math.max(0, Math.min(1, Number(value) || 0));

const parseJsonObject = (raw: string): any => {
  const clean = String(raw || '').replace(/```json|```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) {
    console.error("LLM Router Invalid Output:", raw);
    throw new Error(`LLM Router did not return a JSON object. Output: ${String(raw).substring(0, 100)}...`);
  }
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch (e: any) {
    console.error("LLM Router JSON Parse Error:", e, clean.slice(start, end + 1));
    throw new Error(`LLM Router returned invalid JSON. Error: ${e.message}`);
  }
};

export const llmBasedRoute = async (
  context: RoutingContext,
  provider: ILlmProvider,
  model = 'google/gemini-2.5-flash',
  allowedSubjects: string[] = DEFAULT_SUBJECTS,
): Promise<RouterSignal> => {
  const history = context.history.slice(-6).map(item => `${item.role}: ${item.content}`).join('\n');
  const prompt = `HISTORY:\n${history || '(empty)'}\n\nCURRENT QUESTION:\n${context.question}`;
  const configuredSubjects = allowedSubjects.map(value => String(value).toUpperCase());
  const casualSubject = configuredSubjects.includes('OTHER') ? 'OTHER' : 'GENERAL';
  const subjects = new Set([...configuredSubjects, casualSubject, 'UNKNOWN']);
  const system = `You are a deterministic router for a Vietnamese educational tutor. Return JSON only.
Schema: {"primary_subject":"${[...subjects].join('|')}","secondary_subjects":[],"intent":"solve_problem|explain_concept|give_hint|check_answer|diagnose_error|ask_follow_up|unknown","confidence":0.0,"need_clarification":false,"reason":"short Vietnamese reason"}.
Use conversation history for short follow-ups. Mathematics used only as a tool inside a physics problem remains PHYSICS; mathematics inside a chemistry calculation remains CHEMISTRY. Use ${casualSubject} for greetings, thanks, farewells, project/system questions, and casual conversation that does not belong to a school subject. Use UNKNOWN and need_clarification=true only when the educational subject itself is ambiguous or evidence is insufficient.`;
  const raw = await provider.generateContent(prompt, model, system);
  const parsed = parseJsonObject(raw);
  const tokenUsage = provider.getLastUsage?.() || null;
  const subject = subjects.has(String(parsed.primary_subject).toUpperCase()) ? String(parsed.primary_subject).toUpperCase() as RoutingSubject : 'UNKNOWN';
  const secondarySubjects = Array.isArray(parsed.secondary_subjects)
    ? parsed.secondary_subjects.map((item: unknown) => String(item).toUpperCase()).filter((item: string) => subjects.has(item)) as RoutingSubject[]
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
    tokenUsage,
  };
};
