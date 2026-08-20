import { User } from '../models/User';
import { encrypt, decrypt } from '../utils/crypto';
import { GlobalConfig } from '../models/GlobalConfig';
import { ILlmProvider } from './providers/ILlmProvider';
import { GroqProvider } from './providers/GroqProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { DeepseekProvider } from './providers/DeepseekProvider';
import { RESEARCH_MODEL_CATALOG } from '../config/modelCatalog';
import { OpenRouterProvider } from './providers/OpenRouterProvider';
import { FixedModelProvider } from './providers/FixedModelProvider';

export type ProviderType = 'openai' | 'gemini' | 'deepseek' | 'openrouter' | 'groq';

class ApiKeyService {
  private getEnvKey(provider: ProviderType): string {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY || '';
      case 'gemini': return process.env.GEMINI_API_KEY || '';
      case 'deepseek': return process.env.DEEPSEEK_API_KEY || '';
      case 'openrouter': return process.env.OPENROUTER_API_KEY || '';
      case 'groq': return process.env.GROQ_API_KEY || '';
      default: return '';
    }
  }

  async getGlobalKey(provider: ProviderType): Promise<string | null> {
    const config = await GlobalConfig.findOne({ key: 'global_api_keys' }).lean();
    if (config && config.value && config.value[provider]) {
      try {
        return decrypt(config.value[provider]);
      } catch (error) {
        console.error(`[ApiKeyService] Failed to decrypt global ${provider} key:`, error instanceof Error ? error.message : error);
        return null;
      }
    }
    return null;
  }

  async getPersonalKey(userId: string, provider: ProviderType): Promise<string | null> {
    const user = await User.findById(userId).select('apiKeys').lean();
    if (user && user.apiKeys && (user.apiKeys as any)[provider]) {
      try {
        return decrypt((user.apiKeys as any)[provider]);
      } catch (error) {
        console.error(`[ApiKeyService] Failed to decrypt personal ${provider} key:`, error instanceof Error ? error.message : error);
        return null;
      }
    }
    return null;
  }

  /**
   * Retrieves the API key for a specific user and provider.
   * Priority: Personal Key -> Global Key -> Environment Variable.
   */
  async getApiKeyForUser(userId: string | undefined | null, provider: ProviderType): Promise<string> {
    if (userId && userId !== 'public') {
      const personalKey = await this.getPersonalKey(userId, provider);
      if (personalKey) return personalKey;
    }

    const globalKey = await this.getGlobalKey(provider);
    if (globalKey) return globalKey;

    return this.getEnvKey(provider);
  }

  async updatePersonalKeys(userId: string, keys: Partial<Record<ProviderType, string>>): Promise<void> {
    const updateObj: Record<string, string> = {};
    for (const [provider, key] of Object.entries(keys)) {
      if (key !== undefined) {
        // If empty string, we just clear it
        updateObj[`apiKeys.${provider}`] = key ? encrypt(key) : '';
      }
    }

    if (Object.keys(updateObj).length > 0) {
      await User.findByIdAndUpdate(userId, { $set: updateObj });
    }
  }

  async updateGlobalKeys(keys: Partial<Record<ProviderType, string>>): Promise<void> {
    const config = await GlobalConfig.findOne({ key: 'global_api_keys' });
    let value = config?.value || {};

    for (const [provider, key] of Object.entries(keys)) {
      if (key !== undefined) {
        value[provider] = key ? encrypt(key) : '';
      }
    }

    await GlobalConfig.findOneAndUpdate(
      { key: 'global_api_keys' },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  async getPersonalKeyStatus(userId: string): Promise<Record<ProviderType, boolean>> {
    const user = await User.findById(userId).select('apiKeys').lean();
    const result = { openai: false, gemini: false, deepseek: false, openrouter: false, groq: false };
    for (const provider of Object.keys(result) as ProviderType[]) result[provider] = Boolean((user?.apiKeys as any)?.[provider]);
    return result;
  }

  async getGlobalKeyStatus(): Promise<Record<ProviderType, boolean>> {
    const config = await GlobalConfig.findOne({ key: 'global_api_keys' }).select('value').lean();
    const result = { openai: false, gemini: false, deepseek: false, openrouter: false, groq: false };
    for (const provider of Object.keys(result) as ProviderType[]) result[provider] = Boolean(config?.value?.[provider]);
    return result;
  }

  async createProvider(userId: string | undefined | null, providerName: string, isJson: boolean = true, model?: string): Promise<ILlmProvider> {
    const norm = providerName.toLowerCase();

    if (norm.includes('openrouter')) {
      const key = await this.getApiKeyForUser(userId, 'openrouter');
      return new FixedModelProvider(new OpenRouterProvider(key, isJson), model || RESEARCH_MODEL_CATALOG.gemini);
    }

    if (norm.includes('gemini')) {
      const key = await this.getApiKeyForUser(userId, 'gemini');
      if (key && key.startsWith('AIzaSy')) {
        return new GeminiProvider(isJson, key);
      }

      // Fallback: If Gemini key is invalid/missing but OpenRouter key is configured, fallback to OpenRouter
      const openRouterKey = await this.getApiKeyForUser(userId, 'openrouter').catch(() => '');
      if (openRouterKey && openRouterKey.startsWith('sk-or-')) {
        console.log('[ApiKeyService] Gemini key is invalid. Falling back to OpenRouter.');
        return new FixedModelProvider(
          new OpenRouterProvider(openRouterKey, isJson),
          model || RESEARCH_MODEL_CATALOG.gemini,
        );
      }

      // Secondary fallback to Groq
      const groqKey = await this.getApiKeyForUser(userId, 'groq').catch(() => '');
      if (groqKey || process.env.GROQ_API_KEY) {
        console.log('[ApiKeyService] Gemini key is invalid. Falling back to Groq.');
        return new GroqProvider(groqKey || process.env.GROQ_API_KEY);
      }

      return new GeminiProvider(isJson, key);
    } else if (norm.includes('deepseek')) {
      const key = await this.getApiKeyForUser(userId, 'deepseek');
      if (key && !key.startsWith('sk-or-')) {
        return new DeepseekProvider(key);
      }

      const openAIKey = await this.getApiKeyForUser(userId, 'openai').catch(() => '');
      if (openAIKey && !openAIKey.startsWith('sk-or-')) {
        return new OpenAIProvider(openAIKey);
      }

      // Fallback: If DeepSeek and OpenAI keys are missing, check if OpenRouter key is available
      const openRouterKey = await this.getApiKeyForUser(userId, 'openrouter').catch(() => '');
      if (openRouterKey && openRouterKey.startsWith('sk-or-')) {
        console.log('[ApiKeyService] DeepSeek and OpenAI keys missing. Falling back to OpenRouter.');
        return new FixedModelProvider(
          new OpenRouterProvider(openRouterKey, isJson),
          model || RESEARCH_MODEL_CATALOG.deepseek,
        );
      }

      return new DeepseekProvider(key);
    } else if (norm.includes('groq')) {
      const key = await this.getApiKeyForUser(userId, 'groq');
      return new GroqProvider(key);
    } else {
      const key = await this.getApiKeyForUser(userId, 'openai');
      return new OpenAIProvider(key);
    }
  }
}

export const apiKeyService = new ApiKeyService();
