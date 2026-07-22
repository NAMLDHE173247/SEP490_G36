import { ILlmProvider } from './ILlmProvider';

export class FallbackProvider implements ILlmProvider {
  constructor(
    private readonly primary: ILlmProvider,
    private readonly fallback: ILlmProvider,
    private readonly primaryName = 'primary provider',
  ) {}

  async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
    try {
      const result = await this.primary.generateContent(prompt, modelOverride, systemPrompt);
      if (!String(result || '').trim()) throw new Error(`${this.primaryName} returned an empty response.`);
      return result;
    } catch (error) {
      // Configuration/user-input errors must be visible; fallback is only for
      // transient gateway failures.
      if ((error as any)?.statusCode && (error as any).statusCode < 500) throw error;
      console.warn(`[FallbackProvider] ${this.primaryName} failed; using API-key fallback.`, error instanceof Error ? error.message : error);
      // Do not pass a gateway-specific model name to a different provider.
      return this.fallback.generateContent(prompt, undefined, systemPrompt);
    }
  }
}
