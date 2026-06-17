import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { GeminiProvider } from '../../../services/providers/GeminiProvider';
import { OpenAIProvider } from '../../../services/providers/OpenAIProvider';
import { DeepseekProvider } from '../../../services/providers/DeepseekProvider';
import { OpenRouterProvider } from '../../../services/providers/OpenRouterProvider';
import { ILlmProvider } from '../../../services/providers/ILlmProvider';
import { AutoLabelV2Service } from './autoLabelV2.service';

function createProvider(providerName?: string): ILlmProvider {
  switch (providerName) {
    case 'openai':
      return new OpenAIProvider();
    case 'deepseek':
      return new DeepseekProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    case 'gemini':
    default:
      return new GeminiProvider();
  }
}

export class AutoLabelV2Controller {
  async preview(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = getAuthUserId(req);
      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { messages, provider: providerName } = req.body as {
        messages?: Array<{ messageIndex: number; role: 'user' | 'assistant'; content: string }>;
        provider?: string;
      };

      const normalizedMessages = (messages || [])
        .filter((message: any) => message?.role === 'user' || message?.role === 'assistant')
        .map((message: any, index: number) => ({
          messageIndex: Number.isInteger(Number(message.messageIndex)) ? Number(message.messageIndex) : index,
          role: message.role,
          content: String(message.content || (message as any).text || ''),
        }));

      const selectedProvider = createProvider(providerName);
      const service = new AutoLabelV2Service(selectedProvider);
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
        let intent = 'Ask Explanation';
        if (text.includes('bài tập') || text.includes('giải') || text.includes('tính') || text.includes('tìm') || text.includes('exercise') || text.includes('solve')) {
          intent = 'Solve Exercise';
        } else if (text.includes('ví dụ') || text.includes('example') || text.includes('cho em ví dụ') || text.includes('minh họa')) {
          intent = 'Ask Example';
        } else if (text.includes('công thức') || text.includes('formula') || text.includes('quy tắc') || text.includes('định lý')) {
          intent = 'Request Formula';
        } else if (text.includes('đúng không') || text.includes('phải không') || text.includes('em hiểu') || text.includes('confirm') || text.includes('vậy là')) {
          intent = 'Confirm Understanding';
        } else if (text.includes('giải thích') || text.includes('vì sao') || text.includes('tại sao') || text.includes('why') || text.includes('thế nào') || text.includes('là gì') || text.includes('nghĩa là') || text.includes('hiểu')) {
          intent = 'Ask Explanation';
        } else if (text.includes('giúp') || text.includes('hướng dẫn') || text.includes('cách') || text.includes('làm sao') || text.includes('how') || text.includes('help')) {
          intent = 'Ask Explanation';
        }
        return { messageIndex: message.messageIndex, intent };
      }

      let action = 'Guide Step-by-step';
      if (text.includes('?') && (text.includes('em thử') || text.includes('em nghĩ') || text.includes('theo em') || text.includes('sao lại'))) {
        action = 'Ask Probing Question';
      } else if (text.includes('gợi ý') || text.includes('hint') || text.includes('mẹo') || text.includes('lưu ý')) {
        action = 'Give Hint';
      } else if (text.includes('công thức') || text.includes('formula') || text.includes('áp dụng')) {
        action = 'Provide Formula';
      } else if (text.includes('sai') || text.includes('chưa đúng') || text.includes('nhầm') || text.includes('lỗi') || text.includes('error') || text.includes('incorrect')) {
        action = 'Correct Error';
      } else if (text.includes('giỏi') || text.includes('tốt lắm') || text.includes('đúng rồi') || text.includes('hay') || text.includes('great') || text.includes('cố lên')) {
        action = 'Encourage';
      } else if (text.includes('tóm lại') || text.includes('tổng kết') || text.includes('summary') || text.includes('vậy')) {
        action = 'Summarize';
      } else if (text.includes('bước') || text.includes('step') || text.includes('đầu tiên') || text.includes('tiếp theo') || text.includes('hãy')) {
        action = 'Guide Step-by-step';
      } else if (text.includes('?')) {
        action = 'Ask Probing Question';
      }
      return { messageIndex: message.messageIndex, action };
    }),
  };
}
