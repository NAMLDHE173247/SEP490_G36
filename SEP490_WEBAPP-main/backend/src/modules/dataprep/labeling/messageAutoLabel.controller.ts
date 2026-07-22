import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { apiKeyService } from '../../../services/apiKeyService';
import { MessageAutoLabelingService } from './messageAutoLabel.service';

async function getService(userId: string | null | undefined, provider?: string) {
  const normalized = String(provider || 'gemini').toLowerCase();
  const llmProvider = await apiKeyService.createProvider(userId, normalized, true);
  return new MessageAutoLabelingService(llmProvider);
}

export class MessageAutoLabelingController {
  async preview(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { sampleId } = req.params;
      const { messages, provider } = req.body as {
        messages?: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
        provider?: 'gemini' | 'openai' | 'deepseek';
      };

      const service = await getService(ownerId, provider);
      const suggestions = await service.preview(sampleId, ownerId, messages || []);

      res.json({ suggestions });
    } catch (error: any) {
      console.error('Message auto-label preview error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Message auto-label preview failed',
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

      const { sampleId } = req.params;
      const { suggestions, messages } = req.body as {
        suggestions?: Array<{
          messageIndex: number;
          role: 'user' | 'assistant';
          label: string | string[];
          confidence?: number;
          is_correct_logic?: boolean;
        }>;
        messages?: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
      };

      const service = await getService(ownerId, 'gemini');
      const result = await service.save(sampleId, ownerId, suggestions || [], messages || []);

      res.json({
        message: 'Message auto-labels saved successfully.',
        insertedCount: result.insertedCount,
      });
    } catch (error: any) {
      console.error('Message auto-label save error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Message auto-label save failed',
      });
    }
  }

  async batch(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { provider, samples, concurrency } = req.body as {
        provider?: 'gemini' | 'openai' | 'deepseek';
        samples?: Array<{
          sampleId: string;
          messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
        }>;
        concurrency?: number;
      };

      const service = await getService(ownerId, provider);
      const result = await service.previewAndSaveBatch(ownerId, samples || [], concurrency);
      res.json(result);
    } catch (error: any) {
      console.error('Message auto-label batch error:', error);
      res.status(error.statusCode || 500).json({
        error: error.message || 'Message auto-label batch failed',
      });
    }
  }
}
