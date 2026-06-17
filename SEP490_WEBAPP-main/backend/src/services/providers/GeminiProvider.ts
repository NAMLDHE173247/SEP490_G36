import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ILlmProvider } from './ILlmProvider';
import dotenv from 'dotenv';
dotenv.config();

export class GeminiProvider implements ILlmProvider {
    private model: GenerativeModel;

    constructor(private isJson: boolean = true) {
        // Default constructor uses gemini-1.5-flash with JSON by default for backward compatibility
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const config: any = {
            temperature: 0.1,
            maxOutputTokens: 16384,
        };
        if (this.isJson) {
            config.responseMimeType = "application/json";
        }
        this.model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: config
        });
    }

    async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
        let currentModel = this.model;

        // If a model override is provided, instantiate a temporary model instance
        if (modelOverride) {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
            const config: any = {
                temperature: 0.1,
                maxOutputTokens: 16384,
            };
            if (this.isJson) {
                config.responseMimeType = "application/json";
            }
            currentModel = genAI.getGenerativeModel({
                model: modelOverride,
                generationConfig: config
            });
        }

        const fullPrompt = systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}` : prompt;
        const result = await currentModel.generateContent(fullPrompt);
        const response = await result.response;
        return response.text()?.trim() || (this.isJson ? '[]' : '');
    }
}
