import axios from 'axios';
import { ILlmProvider } from './ILlmProvider';
import dotenv from 'dotenv';

dotenv.config();

export class GroqProvider implements ILlmProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.defaultModel = 'llama-3.3-70b-versatile';

    if (!this.apiKey) {
      console.warn('GROQ_API_KEY is missing. Evaluation using Groq will fail.');
    }
  }

  async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
    const finalSystemPrompt = systemPrompt || 'You are a strict data formatter. You must return ONLY a raw, valid JSON array. Do NOT wrap the JSON in markdown formatting. Do NOT include any explanations, greetings, or conversational text. Just the raw JSON array starting with [ and ending with ].';
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: modelOverride || this.defaultModel,
          messages: [
            {
              role: 'system',
              content: finalSystemPrompt
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 8192,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      return String(content || '[]').trim();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText || 'Unknown error';
        const responseMessage = error.response?.data?.error?.message || '';
        throw new Error(`Groq API request failed (${status} ${statusText}): ${responseMessage}`);
      }
      throw error;
    }
  }
}
