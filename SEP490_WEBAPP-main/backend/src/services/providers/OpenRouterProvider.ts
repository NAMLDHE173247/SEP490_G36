import { ILlmProvider } from './ILlmProvider';
const fetch = async (url: any, init?: any) => {
  const module = await import('node-fetch');
  return module.default(url, init);
};
import dotenv from 'dotenv';
import { RESEARCH_MODEL_CATALOG } from '../../config/modelCatalog';
dotenv.config();

export class OpenRouterProvider implements ILlmProvider {
    private apiKey: string;
    private lastUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null = null;

    constructor(customApiKey?: string, private readonly isJson: boolean = true) {
        this.apiKey = customApiKey || process.env.OPENROUTER_API_KEY || '';
    }

    async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
        this.lastUsage = null;
        // Fallback to a sensible default if no model is provided
        const model = modelOverride || process.env.OPENROUTER_MODEL || RESEARCH_MODEL_CATALOG.gemini;
        
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const maxRetries = 5;
        let delay = 2000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:3000', // Optional, for OpenRouter rankings
                        'X-Title': 'SEP490 Web App'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        temperature: 0.1,
                        max_tokens: 1024,
                        ...(this.isJson && !model.toLowerCase().includes('gemini') ? { response_format: { type: 'json_object' } } : {})
                    })
                });

                if (response.status === 429) {
                    console.warn(`[OpenRouter] Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                    continue;
                }

                if (!response.ok) {
                    const errorData: any = await response.json().catch(() => ({}));
                    throw new Error(`OpenRouter Error: ${response.statusText} ${JSON.stringify(errorData)}`);
                }

                const data: any = await response.json();
                if (data.usage) {
                    const inputTokens = Number(data.usage.prompt_tokens || 0);
                    const outputTokens = Number(data.usage.completion_tokens || 0);
                    this.lastUsage = { inputTokens, outputTokens, totalTokens: Number(data.usage.total_tokens || inputTokens + outputTokens) };
                }
                const choice = data.choices?.[0];

                if (choice?.finish_reason === 'error' || choice?.error) {
                    const errMsg = choice.error?.message || '';
                    const errType = choice.error?.metadata?.error_type || '';
                    const isRateLimit = errMsg.includes('rate_limit') || errType.includes('rate_limit');

                    if (isRateLimit && attempt < maxRetries) {
                        console.warn(`[OpenRouter] Inline rate limit detected. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2;
                        continue;
                    }
                    throw new Error(`OpenRouter Upstream Error: ${errMsg || JSON.stringify(choice.error)}`);
                }

                return choice?.message?.content?.trim() || '';
            } catch (error: any) {
                if (attempt === maxRetries) {
                    throw error;
                }
                console.warn(`[OpenRouter] Error on attempt ${attempt}. Retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }
        }
        throw new Error('OpenRouter API failed after max retries due to rate limiting or errors.');
    }

    getLastUsage() {
        return this.lastUsage;
    }
}
