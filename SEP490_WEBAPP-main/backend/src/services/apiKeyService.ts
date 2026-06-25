import { User } from '../models/User';
import { GlobalConfig } from '../models/GlobalConfig';
import { encrypt, decrypt } from '../utils/crypto';
import { ILlmProvider } from './providers/ILlmProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { DeepseekProvider } from './providers/DeepseekProvider';
import { GroqProvider } from './providers/GroqProvider';

export type ProviderType = 'openai' | 'gemini' | 'deepseek';

class ApiKeyService {
  private getEnvKey(provider: ProviderType): string {
    switch (provider) {
      case 'openai': return process.env.OPENAI_API_KEY || '';
      case 'gemini': return process.env.GEMINI_API_KEY || '';
      case 'deepseek': return process.env.DEEPSEEK_API_KEY || '';
      default: return '';
    }
  }

  async getGlobalKey(provider: ProviderType): Promise<string | null> {
    const config = await GlobalConfig.findOne({ key: 'global_api_keys' }).lean();
    if (config && config.value && config.value[provider]) {
      return decrypt(config.value[provider]);
    }
    return null;
  }

  async getPersonalKey(userId: string, provider: ProviderType): Promise<string | null> {
    const user = await User.findById(userId).select('apiKeys').lean();
    if (user && user.apiKeys && (user.apiKeys as any)[provider]) {
      return decrypt((user.apiKeys as any)[provider]);
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

  async getAllPersonalKeys(userId: string): Promise<Record<ProviderType, string>> {
    const user = await User.findById(userId).select('apiKeys').lean();
    const result: Record<string, string> = {
      openai: '', gemini: '', deepseek: ''
    };
    if (user && user.apiKeys) {
      for (const provider of Object.keys(result) as ProviderType[]) {
        if ((user.apiKeys as any)[provider]) {
          result[provider] = decrypt((user.apiKeys as any)[provider]);
        }
      }
    }
    return result;
  }

  async getAllGlobalKeys(): Promise<Record<ProviderType, string>> {
    const config = await GlobalConfig.findOne({ key: 'global_api_keys' }).lean();
    const result: Record<string, string> = {
      openai: '', gemini: '', deepseek: ''
    };
    if (config && config.value) {
      for (const provider of Object.keys(result) as ProviderType[]) {
        if (config.value[provider]) {
          result[provider] = decrypt(config.value[provider]);
        }
      }
    }
    return result;
  }

  async createProvider(userId: string | undefined | null, providerName: string, isJson: boolean = true): Promise<ILlmProvider> {
    const norm = providerName.toLowerCase();
    
    if (norm.includes('gemini')) {
      const key = await this.getApiKeyForUser(userId, 'gemini');
      return new GeminiProvider(isJson, key);
    } else if (norm.includes('deepseek')) {
      const key = await this.getApiKeyForUser(userId, 'deepseek');
      return new DeepseekProvider(key);
    } else if (norm.includes('groq')) {
      // Groq uses OpenAI SDK, so we can map it to OpenAI key logic if no specific Groq key is managed in DB
      return new GroqProvider();
    } else {
      const key = await this.getApiKeyForUser(userId, 'openai');
      return new OpenAIProvider(key);
    }
  }
}

export const apiKeyService = new ApiKeyService();
