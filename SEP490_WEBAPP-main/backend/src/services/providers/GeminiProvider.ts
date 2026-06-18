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
        const result = await currentModel.generateContent(prompt);
        const response = await result.response;
        return response.text()?.trim() || (this.isJson ? '[]' : '');
    }
}
