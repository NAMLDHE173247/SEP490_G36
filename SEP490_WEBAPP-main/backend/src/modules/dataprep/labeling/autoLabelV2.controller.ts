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
      const normalizedMessages = (messages || [])
        .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
        .map((message: any, index: number) => ({
          messageIndex: Number.isInteger(Number(message.messageIndex)) ? Number(message.messageIndex) : index,
          role: message.role,
          content: String(message.content || (message as any).text || ''),
        }));

      const service = new AutoLabelV2Service(new GeminiProvider());
      let suggestions;
      try {
        suggestions = await service.preview(normalizedMessages);
      } catch (error: any) {
        console.error('AutoLabel V2 provider failed, using fallback:', error?.message || error);
        suggestions = buildFallbackSuggestion(normalizedMessages);
      }

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

function buildFallbackSuggestion(messages: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>) {
  return {
    subject: 'Unclear',
    completion: 'Completed',
    quality: 'Medium',
    messages: messages.map((message) => {
      const text = message.content.toLowerCase();
      if (message.role === 'user') {
        const intent = text.includes('ví dụ') || text.includes('example')
          ? 'Ask Example'
          : text.includes('công thức') || text.includes('formula')
            ? 'Request Formula'
            : text.includes('hiểu') || text.includes('vì sao') || text.includes('why')
              ? 'Ask Explanation'
              : 'Other';
        return { messageIndex: message.messageIndex, intent };
      }

      const action = text.includes('?')
        ? 'Ask Probing Question'
        : text.includes('gợi ý') || text.includes('hint')
          ? 'Give Hint'
          : text.includes('bước') || text.includes('step')
            ? 'Guide Step-by-step'
            : 'Summarize';
      return { messageIndex: message.messageIndex, action };
    }),
  };
}
