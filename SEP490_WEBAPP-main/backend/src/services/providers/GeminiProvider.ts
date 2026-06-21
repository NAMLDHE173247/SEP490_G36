import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILlmProvider } from './ILlmProvider';
import dotenv from 'dotenv';
dotenv.config();

export class GeminiProvider implements ILlmProvider {
    constructor(private isJson: boolean = true) {}

    async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const config: any = {
            temperature: 0.1,
            maxOutputTokens: 16384,
        };
        if (this.isJson) {
            config.responseMimeType = "application/json";
        }

        const modelConfig: any = {
            model: modelOverride || 'gemini-2.0-flash',
            generationConfig: config,
        };

        // Use systemInstruction to properly separate system prompt from user message
        if (systemPrompt) {
            modelConfig.systemInstruction = systemPrompt;
        }

        const currentModel = genAI.getGenerativeModel(modelConfig);
        let lastError: any;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const result = await currentModel.generateContent(prompt);
                const response = await result.response;
                return response.text()?.trim() || (this.isJson ? '[]' : '');
            } catch (error: any) {
                lastError = error;
                const transient = /\b(429|500|502|503|504)\b|high demand|service unavailable|temporar/i.test(String(error?.message || error));
                if (!transient || attempt === 2) break;
                await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
            }
        }
        if (/\b503\b|high demand|service unavailable/i.test(String(lastError?.message || lastError))) {
            throw new Error('Gemini đang quá tải tạm thời. Vui lòng thử lại sau ít phút.');
        }
        throw lastError;
    }
}
