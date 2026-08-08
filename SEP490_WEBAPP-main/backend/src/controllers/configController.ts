import { Request, Response } from 'express';
import { configService } from '../services/configService';
import { apiKeyService } from '../services/apiKeyService';
import { getAuthUserId } from '../utils/auth';

const parseApiKeyUpdates = (body: any) => {
  const updates: Record<string, string> = {};
  for (const provider of ['openai', 'gemini', 'deepseek', 'openrouter', 'groq']) {
    if (body?.[provider] === undefined) continue;
    if (typeof body[provider] !== 'string' || body[provider].length > 4096) {
      throw Object.assign(new Error(`Invalid ${provider} API key.`), { statusCode: 400 });
    }
    updates[provider] = body[provider].trim();
  }
  return updates;
};

export const getGpuConfig = (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const gpuUrls = configService.getGpuUrls(userId || undefined);
  res.json({
    gpuUrl: gpuUrls.join(', '),
    configured: configService.isGpuConfigured(userId || undefined),
  });
};

export const updateGpuConfig = (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  const { gpuUrl } = req.body;
  if (typeof gpuUrl === 'string') {
    if (gpuUrl.trim() === '') {
      if (userId) configService.setUserGpuUrl(userId, '');
      configService.clearGpuUrl(userId || undefined);
      res.json({ success: true, gpuUrl: '', configured: false });
    } else {
      if (userId) {
        configService.setUserGpuUrl(userId, gpuUrl);
      }
      configService.setGpuUrlStr(gpuUrl);
      const updatedUrls = configService.getGpuUrls(userId || undefined);
      res.json({ success: true, gpuUrl: updatedUrls.join(', '), configured: true });
    }
  } else {
    res.status(400).json({ error: 'Invalid gpuUrl format' });
  }
};

export const getPersonalApiKeys = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const configured = await apiKeyService.getPersonalKeyStatus(userId);
    res.json({ configured });
  } catch (error) {
    console.error('Error getting personal api keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePersonalApiKeys = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await apiKeyService.updatePersonalKeys(userId, parseApiKeyUpdates(req.body));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating personal api keys:', error);
    res.status(error?.statusCode || 500).json({ error: error?.statusCode ? error.message : 'Internal server error' });
  }
};

export const getGlobalApiKeys = async (_req: Request, res: Response) => {
  try {
    const configured = await apiKeyService.getGlobalKeyStatus();
    res.json({ configured });
  } catch (error) {
    console.error('Error getting global api keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateGlobalApiKeys = async (req: Request, res: Response) => {
  try {
    await apiKeyService.updateGlobalKeys(parseApiKeyUpdates(req.body));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating global api keys:', error);
    res.status(error?.statusCode || 500).json({ error: error?.statusCode ? error.message : 'Internal server error' });
  }
};
