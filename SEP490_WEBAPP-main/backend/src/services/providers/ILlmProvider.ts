export interface ILlmProvider {
    generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string>;
    getLastUsage?(): { inputTokens: number; outputTokens: number; totalTokens: number } | null;
}
