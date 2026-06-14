import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { GeminiProvider } from '../../../services/providers/GeminiProvider';
import { AutoLabelV2Service } from './autoLabelV2.service';

export class AutoLabelV2Controller {
  async preview(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { messages } = req.body as {
        messages?: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
      };

      // Mặc định dùng GeminiProvider
      const service = new AutoLabelV2Service(new GeminiProvider());
      const suggestions = await service.preview(messages || []);

      res.json({ success: true, data: suggestions });
    } catch (error: any) {
      console.error('AutoLabel V2 preview error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'AutoLabel V2 preview failed',
      });
    }
  }
}
