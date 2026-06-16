import { ILlmProvider } from '../../../services/providers/ILlmProvider';

export type AutoLabelV2InputMessage = {
  messageIndex: number;
  role: 'user' | 'assistant';
  content: string;
};

export type AutoLabelV2Response = {
  subject: string;
  completion: string;
  quality: string;
  messages: Array<{
    messageIndex: number;
    intent?: string;
    action?: string;
  }>;
};

export class AutoLabelV2Service {
  constructor(private readonly provider: ILlmProvider) {}

  async preview(messages: AutoLabelV2InputMessage[]): Promise<AutoLabelV2Response> {
    if (!messages || !messages.length) {
      throw Object.assign(new Error('messages is required.'), { statusCode: 400 });
    }

    const prompt = `Bạn là chuyên gia phân tích hội thoại gia sư AI. Hãy phân tích đoạn hội thoại sau và gán nhãn cho nó.

DỮ LIỆU HỘI THOẠI:
${JSON.stringify(messages.map(m => ({ messageIndex: m.messageIndex, role: m.role, content: m.content })), null, 2)}

YÊU CẦU ĐẦU RA:
CHỈ trả về một JSON object hợp lệ với cấu trúc sau:
{
  "subject": "chọn 1 trong: Toán, Vật lý, Hóa học, Sinh học, Tiếng Anh, Lịch sử, Địa lý, GDCD, Tin học, Multi-subject, Unclear. (Hoặc tự đề xuất môn học khác nếu cần)",
  "completion": "chọn 1 trong: Completed, Incomplete, Abandoned",
  "quality": "chọn 1 trong: Good, Medium, Poor",
  "messages": [
    { 
      "messageIndex": 0, 
      "intent": "chọn 1 trong (CHỈ DÀNH CHO USER): Ask Explanation, Solve Exercise, Request Formula, Confirm Understanding, Ask Example. Nếu không có nhãn nào phù hợp, HÃY TỰ ĐỀ XUẤT một nhãn mới (ngắn gọn, tiếng Anh). Tuyệt đối không trả về 'Other'.",
      "action": "chọn 1 trong (CHỈ DÀNH CHO ASSISTANT): Guide Step-by-step, Give Hint, Ask Probing Question, Provide Formula, Encourage, Correct Error, Summarize. Nếu không có nhãn nào phù hợp, HÃY TỰ ĐỀ XUẤT một nhãn mới (ngắn gọn, tiếng Anh). Tuyệt đối không trả về 'Other'."
    }
  ]
}

- Lưu ý: Với tin nhắn của user thì trả về trường "intent". Với tin nhắn của assistant thì trả về trường "action".
- Tuyệt đối không thêm bất kỳ văn bản giải thích nào ngoài JSON.`;

    const rawText = await this.provider.generateContent(prompt);
    
    try {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      const jsonText = firstBrace >= 0 && lastBrace > firstBrace
        ? rawText.slice(firstBrace, lastBrace + 1)
        : rawText;
      return JSON.parse(jsonText);
    } catch (e) {
      console.error('Failed to parse AI response:', rawText);
      throw Object.assign(new Error('AI response formatting error.'), { statusCode: 500 });
    }
  }
}
