import { Request, Response } from 'express';
import { getAuthUserId } from '../utils/auth';
import { RoutingDecisionLog } from '../models/RoutingDecisionLog';
import { decideHybridRoute } from '../services/routing/routingOrchestrator';
import { RoutingMode } from '../services/routing/routingTypes';

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
