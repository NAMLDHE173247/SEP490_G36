import { Request, Response } from 'express';
import { RoutingDecisionLog } from '../models/RoutingDecisionLog';
import { decideHybridRoute } from '../services/routing/routingOrchestrator';
import { RoutingMode } from '../services/routing/routingTypes';
import { getAuthUserId } from '../utils/auth';

export const decideRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const question = String(req.body.question || req.body.text_input || '').trim();
    if (!question) return void res.status(400).json({ error: 'question is required' });
    const decision = await decideHybridRoute({
      ownerId,
      question,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      mode: (req.body.mode || 'hybrid') as RoutingMode,
      sessionId: req.body.session_id,
      modelMap: req.body.subject_model_map,
    });
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const evaluateRouter = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = getAuthUserId(req);
    if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
    const cases = Array.isArray(req.body.cases) ? req.body.cases : [];
    if (!cases.length || cases.length > 1000) return void res.status(400).json({ error: 'cases must contain 1..1000 items' });
    const modes: RoutingMode[] = Array.isArray(req.body.modes) ? req.body.modes : ['rule', 'llm', 'hybrid'];
    const results: any = {};
    for (const mode of modes) {
      let subjectCorrect = 0, intentCorrect = 0, clarificationCorrect = 0, exact = 0, llmCalls = 0, latency = 0;
      const items = [];
      for (const testCase of cases) {
        const decision = await decideHybridRoute({
          ownerId,
          question: String(testCase.question || ''),
          history: testCase.history || [],
          mode,
          modelMap: req.body.subject_model_map || {},
          persistLog: false,
        });
        const s = decision.subject === testCase.gold_subject;
        const i = decision.intent === testCase.gold_intent;
        const c = decision.needClarification === Boolean(testCase.gold_need_clarification);
        subjectCorrect += Number(s); intentCorrect += Number(i); clarificationCorrect += Number(c);
        exact += Number(s && i && c); llmCalls += Number(decision.llmCalled); latency += decision.latencyMs;
        items.push({ id: testCase.id, gold_subject: testCase.gold_subject, decision, correct: { subject: s, intent: i, clarification: c } });
      }
      const n = cases.length;
      results[mode] = {
        total: n,
        primary_subject_accuracy: subjectCorrect / n,
        intent_accuracy: intentCorrect / n,
        need_clarification_accuracy: clarificationCorrect / n,
        exact_match_accuracy: exact / n,
        avg_router_latency_ms: latency / n,
        llm_call_rate: llmCalls / n,
        items,
      };
    }
    res.json({ generatedAt: new Date().toISOString(), results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getRouterMetrics = async (req: Request, res: Response): Promise<void> => {
  const ownerId = getAuthUserId(req);
  if (!ownerId) return void res.status(401).json({ error: 'Unauthorized' });
  const logs = await RoutingDecisionLog.find({ ownerId }).sort({ createdAt: -1 }).limit(500).lean();
  const n = Math.max(1, logs.length);
  res.json({
    total: logs.length,
    llm_call_rate: logs.filter(item => item.llmCalled).length / n,
    clarification_rate: logs.filter(item => item.needClarification).length / n,
    avg_latency_ms: logs.reduce((sum, item) => sum + item.latencyMs, 0) / n,
    strategy_counts: logs.reduce((acc: Record<string, number>, item) => (acc[item.strategy] = (acc[item.strategy] || 0) + 1, acc), {}),
    recent: logs.slice(0, 50),
  });
};
