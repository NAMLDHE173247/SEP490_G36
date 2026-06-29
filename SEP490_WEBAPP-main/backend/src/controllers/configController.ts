import { Request, Response } from 'express';
import { configService } from '../services/configService';
import { apiKeyService } from '../services/apiKeyService';
import { getAuthUserId } from '../utils/auth';

export const getGpuConfig = (_req: Request, res: Response) => {
  const gpuUrl = configService.getGpuUrls().join(', ');
  res.json({
    gpuUrl,
    configured: configService.isGpuConfigured(),
  });
};

export const updateGpuConfig = (req: Request, res: Response) => {
  const { gpuUrl } = req.body;
  if (typeof gpuUrl === 'string') {
    if (gpuUrl.trim() === '') {
      configService.clearGpuUrl();
      res.json({ success: true, gpuUrl: '', configured: false });
    } else {
      configService.setGpuUrlStr(gpuUrl);
      res.json({ success: true, gpuUrl: configService.getGpuUrls().join(', '), configured: true });
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
    const keys = await apiKeyService.getAllPersonalKeys(userId);
    res.json(keys);
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
    const { openai, gemini, deepseek } = req.body;
    await apiKeyService.updatePersonalKeys(userId, { openai, gemini, deepseek });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating personal api keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getGlobalApiKeys = async (_req: Request, res: Response) => {
  try {
    const keys = await apiKeyService.getAllGlobalKeys();
    res.json(keys);
  } catch (error) {
    console.error('Error getting global api keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateGlobalApiKeys = async (req: Request, res: Response) => {
  try {
    const { openai, gemini, deepseek } = req.body;
    await apiKeyService.updateGlobalKeys({ openai, gemini, deepseek });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating global api keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
