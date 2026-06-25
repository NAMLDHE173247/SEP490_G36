import { Request, Response } from 'express';
import { getAuthUserId } from '../../../utils/auth';
import { OpenRouterProvider } from '../../../services/providers/OpenRouterProvider';
import { OpenAIProvider } from '../../../services/providers/OpenAIProvider';
import { DeepseekProvider } from '../../../services/providers/DeepseekProvider';

import { ILlmProvider } from '../../../services/providers/ILlmProvider';
import { AutoLabelV2Service } from './autoLabelV2.service';
import { DatasetAssignmentSubmission } from '../../../models/DatasetAssignmentSubmission';

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
      return new OpenRouterProvider();
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

      // Chỉ cho dùng AI key của hệ thống nếu task này được cấp quyền AI
      const submissionId = (req.params as any).submissionId;
      if (submissionId) {
        const submission = await DatasetAssignmentSubmission.findById(submissionId).select('aiAssistEnabled active').lean();
        if (!submission) {
          res.status(404).json({ success: false, error: 'Không tìm thấy task.' });
          return;
        }
        if ((submission as any).active === false) {
          res.status(403).json({ success: false, error: 'Task đã bị thu hồi/thay thế.' });
          return;
        }
        if (!(submission as any).aiAssistEnabled) {
          res.status(403).json({ success: false, error: 'Bạn không được cấp quyền dùng AI cho task này.' });
          return;
        }
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
      let usedFallback = false;
      try {
        suggestions = await service.preview(normalizedMessages);
      } catch (error: any) {
        console.error('AutoLabel V2 provider failed, using fallback:', error?.message || error);
        suggestions = buildFallbackSuggestion(normalizedMessages);
        usedFallback = true;
      }

      res.json({ success: true, data: suggestions, providerStatus: usedFallback ? 'fallback' : 'live', provider: providerName || 'gemini' });
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
    quality: 'Rewrite',
    quality_reason: 'Không thể kết nối AI — nhãn được gợi ý tự động bằng quy tắc từ khóa, độ tin cậy thấp.',
    messages: messages.map((message) => {
      const text = message.content.toLowerCase();

      if (message.role === 'user') {
        let intent = 'REQUEST_EXPLANATION';
        let confidence = 0.45;

        if (/bài tập|giải|tính|tìm|solve|exercise/.test(text)) {
          intent = 'ANSWER_ATTEMPT'; confidence = 0.5;
        } else if (/đúng không|phải không|em hiểu|vậy là|confirm/.test(text)) {
          intent = 'CONFIRM_UNDERSTANDING'; confidence = 0.55;
        } else if (/công thức|formula|quy tắc|định lý|định nghĩa/.test(text)) {
          intent = 'ASK_THEORY'; confidence = 0.6;
        } else if (/ví dụ|example|minh họa/.test(text)) {
          intent = 'REQUEST_SIMPLER'; confidence = 0.55;
        } else if (/xin gợi ý|hint|mẹo|gợi ý cho em/.test(text)) {
          intent = 'REQUEST_HINT'; confidence = 0.65;
        } else if (/chán|khó quá|không hiểu gì|bỏ cuộc|nản/.test(text)) {
          intent = 'DISCOURAGED'; confidence = 0.7;
        } else if (/sang bài|bài khác|skip|chuyển/.test(text)) {
          intent = 'SKIP_EXERCISE'; confidence = 0.65;
        } else if (/xong rồi|hiểu rồi|làm được rồi|bài tiếp/.test(text)) {
          intent = 'READY_NEXT'; confidence = 0.6;
        } else if (/nói chuyện|chơi|game|phim|hát/.test(text)) {
          intent = 'OFF_TOPIC'; confidence = 0.7;
        } else if (/giải thích|vì sao|tại sao|why|thế nào|là gì|nghĩa là/.test(text)) {
          intent = 'REQUEST_EXPLANATION'; confidence = 0.55;
        }

        return { messageIndex: message.messageIndex, intent, confidence };
      }

      // assistant
      let action = 'SCAFFOLDING';
      let confidence = 0.4;
      let is_correct_pedagogy = true;
      let pedagogy_note = '';

      if (/\?/.test(text) && /em thử|em nghĩ|theo em|sao lại|em làm|em có thể/.test(text)) {
        action = 'SCAFFOLDING'; confidence = 0.65;
      } else if (/gợi ý|hint|lưu ý|mẹo/.test(text)) {
        action = 'HINTING'; confidence = 0.6;
      } else if (/công thức|formula|áp dụng|định lý|định nghĩa/.test(text)) {
        action = 'CONCEPT_CLARIFY'; confidence = 0.6;
      } else if (/sai|chưa đúng|nhầm|lỗi|incorrect/.test(text) && /\?/.test(text)) {
        action = 'IDENTIFY_INCORRECT_ANSWER'; confidence = 0.6;
      } else if (/sai|chưa đúng|nhầm/.test(text) && !/\?/.test(text)) {
        action = 'CORRECT_MISTAKE'; confidence = 0.5;
        is_correct_pedagogy = false;
        pedagogy_note = 'Gia sư có thể đang chỉ ra lỗi mà không đặt câu hỏi gợi mở — cần xem xét lại.';
      } else if (/giỏi|tốt lắm|đúng rồi|chính xác|hay|great|cố lên/.test(text)) {
        action = 'CONFIRM_CORRECT_ANSWER'; confidence = 0.7;
      } else if (/tóm lại|tổng kết|summary|vậy ta có/.test(text)) {
        action = 'TRANSITIONING'; confidence = 0.6;
      } else if (/bước|step|đầu tiên|tiếp theo|thứ nhất/.test(text)) {
        action = 'LOGIC_BREAKDOWN'; confidence = 0.55;
      } else if (/ví dụ|chẳng hạn|hình dung/.test(text)) {
        action = 'SIMPLIFYING'; confidence = 0.6;
      } else if (/cố lên|không sao|bình thường|thử lại/.test(text)) {
        action = 'MOTIVATING'; confidence = 0.65;
      } else if (/\?/.test(text)) {
        action = 'WAITING'; confidence = 0.45;
      } else {
        action = 'DIRECT_ANSWER'; confidence = 0.4;
        is_correct_pedagogy = false;
        pedagogy_note = 'Phản hồi không có câu hỏi gợi mở — khả năng gia sư đang trả lời trực tiếp (cần kiểm tra lại).';
      }

      return {
        messageIndex: message.messageIndex,
        response_quality: is_correct_pedagogy ? 'Gold' : 'Bad',
        action,
        confidence,
        is_correct_pedagogy,
        pedagogy_note,
      };
    }),
  };
}
