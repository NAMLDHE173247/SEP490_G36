import { Request, Response } from 'express';
import { AutoLabelingService } from './autoLabel.service';
import { getAuthUserId } from '../../../utils/auth';
import { apiKeyService } from '../../../services/apiKeyService';

async function getService(userId: string | null | undefined, provider?: string) {
  const normalized = String(provider || 'gemini').toLowerCase();
  const llmProvider = await apiKeyService.createProvider(userId, normalized, true);
  return new AutoLabelingService(llmProvider);
}

export class AutoLabelingController {
  async preview(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { provider } = req.body as { provider?: 'gemini' | 'openai' | 'deepseek' };
      const service = await getService(ownerId, provider);
      const suggestions = await service.preview(versionId, ownerId);

      res.json({ suggestions });
    } catch (error: any) {
      console.error('Auto label preview error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Auto label preview failed',
      });
    }
  }

  async save(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { versionId } = req.params;
      const { labels } = req.body as { labels?: Array<{ clusterId: number; label: string }> };
      const service = await getService(ownerId, 'gemini');
      const result = await service.save(versionId, ownerId, labels || []);

      res.json({
        message: 'Auto labels saved successfully.',
        insertedCount: result.insertedCount,
      });
    } catch (error: any) {
      console.error('Auto label save error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Auto label save failed',
      });
    }
  }
}
