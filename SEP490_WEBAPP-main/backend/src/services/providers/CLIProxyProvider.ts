import axios from 'axios';
import { ILlmProvider } from './ILlmProvider';

export class CLIProxyProvider implements ILlmProvider {
  private static modelCache: { expiresAt: number; models: Set<string> } | null = null;
  private readonly baseUrl = String(process.env.CLIPROXY_BASE_URL || 'http://127.0.0.1:8317/v1').replace(/\/$/, '');
  private readonly apiKey = String(process.env.CLIPROXY_API_KEY || '');
  private readonly defaultModel = String(process.env.CLIPROXY_MODEL || 'gpt-5-codex');

  constructor(private readonly userPrefix: string) {
    if (String(process.env.CLIPROXY_ENABLED || '').toLowerCase() !== 'true') {
      throw new Error('OAuth AI Gateway is disabled. Set CLIPROXY_ENABLED=true to enable it.');
    }
    if (!this.apiKey || this.apiKey === 'REPLACE_WITH_RANDOM_INTERNAL_KEY') {
      throw new Error('CLIPROXY_API_KEY is missing or unsafe.');
    }
  }

  async generateContent(prompt: string, modelOverride?: string, systemPrompt?: string): Promise<string> {
    if (!this.userPrefix) throw Object.assign(new Error('Connect your personal OAuth account before using OAuth Gateway.'), { statusCode: 409 });
    const baseModel = modelOverride || this.defaultModel;
    const routedModel = `${this.userPrefix}/${baseModel}`;
    await this.assertModelAvailable(routedModel);
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: routedModel,
      messages: [
        { role: 'system', content: systemPrompt || 'Return only the requested result.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }, {
      timeout: Number(process.env.CLIPROXY_TIMEOUT_MS || 60000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    });
    const content = String(response.data?.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('OAuth AI Gateway returned an empty response.');
    return content;
  }

  private async assertModelAvailable(model: string): Promise<void> {
    if (!/^[A-Za-z0-9._:/-]{1,200}$/.test(model)) {
      throw Object.assign(new Error('Invalid model id.'), { statusCode: 400 });
    }
    if (!CLIProxyProvider.modelCache || CLIProxyProvider.modelCache.expiresAt < Date.now()) {
      const response = await axios.get(`${this.baseUrl}/models`, {
        timeout: 5000,
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const models = new Set<string>(Array.isArray(response.data?.data)
        ? response.data.data.map((item: any) => String(item?.id || '').trim()).filter(Boolean)
        : []);
      CLIProxyProvider.modelCache = { models, expiresAt: Date.now() + 30000 };
    }
    if (!CLIProxyProvider.modelCache.models.has(model)) {
      throw Object.assign(new Error(`Model "${model}" is not available for the connected OAuth account.`), { statusCode: 400 });
    }
  }
}
