import { Request, Response } from 'express';
import { configService } from '../services/configService';
import { apiKeyService } from '../services/apiKeyService';
import { getAuthUserId } from '../utils/auth';
import axios from 'axios';
import crypto from 'crypto';
import { ProviderConnectionAudit } from '../models/ProviderConnectionAudit';
import { CircuitBreakerProvider } from '../services/providers/CircuitBreakerProvider';
import { oauthUserPrefix } from '../services/providers/oauthIdentity';
import { OAuthAccountOwnership } from '../models/OAuthAccountOwnership';

const oauthStartByUser = new Map<string, number>();
const oauthSessionFiles = new Map<string, { userId: string; provider: string; existingFiles: Map<string, { updatedAt: string; prefix: string }>; createdAt: number }>();

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

export const getCliProxyStatus = async (req: Request, res: Response) => {
  const enabled = String(process.env.CLIPROXY_ENABLED || '').toLowerCase() === 'true';
  const baseUrl = String(process.env.CLIPROXY_BASE_URL || 'http://127.0.0.1:8317/v1').replace(/\/$/, '');
  if (!enabled) {
    res.json({ enabled: false, reachable: false, managementConfigured: false, models: [], message: 'OAuth AI Gateway is disabled.' });
    return;
  }
  try {
    const response = await axios.get(`${baseUrl}/models`, {
      timeout: 5000,
      headers: { Authorization: `Bearer ${process.env.CLIPROXY_API_KEY || ''}` },
    });
    let models = Array.isArray(response.data?.data)
      ? response.data.data.map((item: any) => String(item?.id || '')).filter(Boolean).slice(0, 100)
      : [];
    const userId = getAuthUserId(req);
    if (userId) {
      const prefix = `${oauthUserPrefix(userId)}/`;
      models = models.filter((model: string) => model.startsWith(prefix)).map((model: string) => model.slice(prefix.length));
    }
    const circuitKey = userId ? `oauth-ai-gateway:${oauthUserPrefix(userId)}` : 'oauth-ai-gateway';
    const payload = { enabled: true, reachable: true, managementConfigured: Boolean(process.env.CLIPROXY_MANAGEMENT_KEY), circuit: CircuitBreakerProvider.getStatus(circuitKey), models, modelCount: models.length };
    res.json(payload);
  } catch (error: any) {
    const payload = { enabled: true, reachable: false, managementConfigured: Boolean(process.env.CLIPROXY_MANAGEMENT_KEY), circuit: CircuitBreakerProvider.getStatus('oauth-ai-gateway'), models: [], message: error?.message || 'OAuth AI Gateway is unreachable.' };
    res.status(503).json(payload);
  }
};

// Safe, read-only model catalogue for authenticated AI users. Management and
// connected-account details stay on the admin-only status endpoints.
export const getCliProxyModels = async (req: Request, res: Response) => {
  const userId = getAuthUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const enabled = String(process.env.CLIPROXY_ENABLED || '').toLowerCase() === 'true';
  if (!enabled) {
    res.json({ enabled: false, reachable: false, models: [], defaultModel: '' });
    return;
  }
  const baseUrl = String(process.env.CLIPROXY_BASE_URL || 'http://127.0.0.1:8317/v1').replace(/\/$/, '');
  try {
    const response = await axios.get(`${baseUrl}/models`, {
      timeout: 5000,
      headers: { Authorization: `Bearer ${process.env.CLIPROXY_API_KEY || ''}` },
    });
    const models = Array.isArray(response.data?.data)
      ? response.data.data.map((item: any) => String(item?.id || '').trim()).filter(Boolean).slice(0, 100)
      : [];
    const prefix = `${oauthUserPrefix(userId)}/`;
    const chatModels = models
      .filter((model: string) => model.startsWith(prefix))
      .map((model: string) => model.slice(prefix.length))
      .filter((model: string) => !model.startsWith('gpt-image-') && model !== 'codex-auto-review');
    const configuredDefault = String(process.env.CLIPROXY_MODEL || '').trim();
    const preferred = chatModels.find((model: string) => model === 'gpt-5.4-mini') || chatModels[0] || '';
    res.json({ enabled: true, reachable: true, models: chatModels, defaultModel: chatModels.includes(configuredDefault) ? configuredDefault : preferred });
  } catch (error: any) {
    res.status(503).json({ enabled: true, reachable: false, models: [], defaultModel: '', message: error?.message || 'OAuth AI Gateway is unreachable.' });
  }
};

const cliProxyManagementRequest = async (path: string) => {
  const managementKey = String(process.env.CLIPROXY_MANAGEMENT_KEY || '');
  if (!managementKey) throw Object.assign(new Error('CLIProxy Management API is not configured.'), { statusCode: 409 });
  const managementUrl = String(process.env.CLIPROXY_MANAGEMENT_URL || 'http://127.0.0.1:8317').replace(/\/$/, '');
  return axios.get(`${managementUrl}/v0/management/${path}`, {
    timeout: 10000,
    headers: { Authorization: `Bearer ${managementKey}` },
  });
};

const patchCliProxyAuthFile = async (name: string, fields: Record<string, unknown>) => {
  const managementKey = String(process.env.CLIPROXY_MANAGEMENT_KEY || '');
  if (!managementKey) throw Object.assign(new Error('CLIProxy Management API is not configured.'), { statusCode: 409 });
  const managementUrl = String(process.env.CLIPROXY_MANAGEMENT_URL || 'http://127.0.0.1:8317').replace(/\/$/, '');
  return axios.patch(`${managementUrl}/v0/management/auth-files/fields`, { name, ...fields }, {
    timeout: 10000,
    headers: { Authorization: `Bearer ${managementKey}`, 'Content-Type': 'application/json' },
  });
};

const oauthStateHash = (state: string) => crypto.createHash('sha256').update(state).digest('hex');
const writeProviderAudit = async (data: { userId: string; provider: 'codex' | 'claude' | 'gemini' | 'unknown'; action: 'oauth_started' | 'oauth_succeeded' | 'oauth_failed' | 'account_disconnected'; state: string; detail?: string }) => {
  try {
    if (data.action === 'account_disconnected') {
      await ProviderConnectionAudit.create({ userId: data.userId, provider: data.provider, action: data.action, stateHash: oauthStateHash(data.state), detail: data.detail || '' });
      return;
    }
    await ProviderConnectionAudit.updateOne(
      { stateHash: oauthStateHash(data.state), action: data.action },
      { $setOnInsert: { userId: data.userId, provider: data.provider, action: data.action, stateHash: oauthStateHash(data.state), detail: data.detail || '' } },
      { upsert: true },
    );
  } catch (error) {
    console.error('Could not write provider connection audit:', error);
  }
};

const maskEmail = (value: string) => {
  const [name, domain] = value.split('@');
  if (!domain) return value ? `${value.slice(0, 2)}***` : '';
  return `${name.slice(0, 1)}***@${domain}`;
};

export const listCliProxyAccounts = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const response = await cliProxyManagementRequest('auth-files');
    const ownerships = await OAuthAccountOwnership.find({ ownerId: userId }).select('accountHash').lean();
    const ownedHashes = new Set(ownerships.map((item: any) => String(item.accountHash)));
    const files = Array.isArray(response.data?.files) ? response.data.files.filter((file: any) => ownedHashes.has(oauthStateHash(String(file.name || file.id || '')))) : [];
    res.json({ accounts: files.map((file: any) => ({
      id: oauthStateHash(String(file.name || file.id || '')).slice(0, 32),
      provider: String(file.provider || file.type || 'unknown'),
      email: maskEmail(String(file.email || '')),
      status: String(file.status || 'unknown'),
      disabled: Boolean(file.disabled),
    })) });
  } catch (error: any) {
    res.status(error?.statusCode || error?.response?.status || 502).json({ error: error?.response?.data?.error || error?.message || 'Could not list OAuth accounts.' });
  }
};

export const disconnectCliProxyAccount = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const accountId = String(req.params.accountId || '');
    if (!/^[a-f0-9]{32}$/.test(accountId)) { res.status(400).json({ error: 'Invalid account id.' }); return; }
    const response = await cliProxyManagementRequest('auth-files');
    const files = Array.isArray(response.data?.files) ? response.data.files : [];
    const ownerships = await OAuthAccountOwnership.find({ ownerId: userId }).select('accountHash').lean();
    const ownedHashes = new Set(ownerships.map((item: any) => String(item.accountHash)));
    const file = files.find((item: any) => ownedHashes.has(oauthStateHash(String(item.name || item.id || ''))) && oauthStateHash(String(item.name || item.id || '')).slice(0, 32) === accountId);
    if (!file) { res.status(404).json({ error: 'Connected account not found.' }); return; }
    const managementKey = String(process.env.CLIPROXY_MANAGEMENT_KEY || '');
    const managementUrl = String(process.env.CLIPROXY_MANAGEMENT_URL || 'http://127.0.0.1:8317').replace(/\/$/, '');
    await axios.delete(`${managementUrl}/v0/management/auth-files`, {
      timeout: 10000,
      params: { name: String(file.name || file.id) },
      headers: { Authorization: `Bearer ${managementKey}` },
    });
    const rawProvider = String(file.provider || file.type || 'unknown').toLowerCase();
    const provider = rawProvider.includes('codex') ? 'codex' : rawProvider.includes('claude') ? 'claude' : rawProvider.includes('gemini') ? 'gemini' : 'unknown';
    await writeProviderAudit({ userId, provider, action: 'account_disconnected', state: String(file.name || file.id) });
    await OAuthAccountOwnership.deleteOne({ accountHash: oauthStateHash(String(file.name || file.id || '')), ownerId: userId });
    res.json({ success: true });
  } catch (error: any) {
    res.status(error?.statusCode || error?.response?.status || 502).json({ error: error?.response?.data?.error || error?.message || 'Could not disconnect OAuth account.' });
  }
};

export const startCliProxyOAuth = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (req.body?.consent !== true) { res.status(400).json({ error: 'Explicit provider account consent is required.' }); return; }
    const lastStartedAt = oauthStartByUser.get(userId) || 0;
    if (Date.now() - lastStartedAt < 10000) { res.status(429).json({ error: 'Please wait before starting another OAuth session.' }); return; }
    oauthStartByUser.set(userId, Date.now());
    const provider = String(req.params.provider || '').toLowerCase();
    const endpoint = provider === 'codex' ? 'codex-auth-url' : provider === 'claude' ? 'anthropic-auth-url' : '';
    if (!endpoint) {
      res.status(501).json({ error: provider === 'gemini' ? 'Gemini OAuth needs a separate verified CLI/plugin flow.' : 'Unsupported OAuth provider.' });
      return;
    }
    const beforeResponse = await cliProxyManagementRequest('auth-files');
    const existingFiles = new Map<string, { updatedAt: string; prefix: string }>((Array.isArray(beforeResponse.data?.files) ? beforeResponse.data.files : []).map((file: any) => [
      String(file.name || file.id || ''),
      { updatedAt: String(file.updated_at || ''), prefix: String(file.prefix || '') },
    ]));
    const response = await cliProxyManagementRequest(`${endpoint}?is_webui=true`);
    const url = String(response.data?.url || '');
    const state = String(response.data?.state || '');
    let trustedAuthorizationUrl = false;
    try {
      const parsed = new URL(url);
      trustedAuthorizationUrl = parsed.protocol === 'https:' && (
        (provider === 'codex' && parsed.hostname === 'auth.openai.com' && parsed.pathname === '/oauth/authorize') ||
        (provider === 'claude' && parsed.hostname === 'claude.ai' && parsed.pathname === '/oauth/authorize')
      );
    } catch { trustedAuthorizationUrl = false; }
    if (!state || !trustedAuthorizationUrl) {
      res.status(502).json({ error: 'OAuth gateway returned an invalid authorization session.' });
      return;
    }
    await writeProviderAudit({ userId, provider: provider as 'codex' | 'claude', action: 'oauth_started', state });
    oauthSessionFiles.set(oauthStateHash(state), { userId, provider, existingFiles, createdAt: Date.now() });
    res.json({ provider, url, state });
  } catch (error: any) {
    res.status(error?.statusCode || error?.response?.status || 502).json({ error: error?.response?.data?.error || error?.message || 'Could not start OAuth.' });
  }
};

export const getCliProxyOAuthStatus = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const state = String(req.query.state || '').trim();
    if (!/^[A-Za-z0-9._~-]{16,512}$/.test(state)) {
      res.status(400).json({ error: 'Invalid OAuth state.' });
      return;
    }
    const response = await cliProxyManagementRequest(`get-auth-status?state=${encodeURIComponent(state)}`);
    const status = response.data?.status || 'wait';
    if (status === 'ok' || status === 'error') {
      const started = await ProviderConnectionAudit.findOne({ stateHash: oauthStateHash(state), action: 'oauth_started' }).lean();
      if (String(started?.userId || '') !== userId) { res.status(403).json({ error: 'OAuth session belongs to another user.' }); return; }
      if (status === 'ok') {
        const session = oauthSessionFiles.get(oauthStateHash(state));
        if (!session || session.userId !== userId) { res.status(409).json({ error: 'OAuth ownership session expired. Please connect again.' }); return; }
        const filesResponse = await cliProxyManagementRequest('auth-files');
        const files = Array.isArray(filesResponse.data?.files) ? filesResponse.data.files : [];
        const candidates = files.filter((file: any) => {
          const name = String(file.name || file.id || '');
          const type = String(file.provider || file.type || '').toLowerCase();
          const before = session.existingFiles.get(name);
          const changed = !before || before.updatedAt !== String(file.updated_at || '');
          return changed && (type.includes(session.provider) || (session.provider === 'claude' && type.includes('anthropic')));
        });
        const candidate = candidates.sort((a: any, b: any) => Date.parse(String(b.updated_at || 0)) - Date.parse(String(a.updated_at || 0)))[0];
        if (!candidate) { res.status(409).json({ error: 'Could not identify the new OAuth credential. Disconnect it in Gateway and connect again.' }); return; }
        const candidateName = String(candidate.name || candidate.id);
        const accountHash = oauthStateHash(candidateName);
        const existingOwnership = await OAuthAccountOwnership.findOne({ accountHash }).lean();
        if (existingOwnership && String(existingOwnership.ownerId) !== userId) {
          await patchCliProxyAuthFile(candidateName, { prefix: oauthUserPrefix(String(existingOwnership.ownerId)) });
          res.status(409).json({ error: 'This provider account is already connected to another application user.' });
          return;
        }
        const previousPrefix = session.existingFiles.get(candidateName)?.prefix || '';
        const requestedPrefix = oauthUserPrefix(userId);
        if (previousPrefix && previousPrefix !== requestedPrefix) {
          await patchCliProxyAuthFile(candidateName, { prefix: previousPrefix });
          res.status(409).json({ error: 'This provider account is already connected to another application user.' });
          return;
        }
        await patchCliProxyAuthFile(candidateName, { prefix: requestedPrefix, note: 'SEP490 personal OAuth credential' });
        await OAuthAccountOwnership.updateOne(
          { accountHash },
          { $set: { ownerId: userId, provider: session.provider, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true },
        );
        oauthSessionFiles.delete(oauthStateHash(state));
      }
      await writeProviderAudit({ userId, provider: (started?.provider as any) || 'unknown', action: status === 'ok' ? 'oauth_succeeded' : 'oauth_failed', state, detail: String(response.data?.error || '') });
    }
    res.json({ status, error: response.data?.error || '' });
  } catch (error: any) {
    res.status(error?.statusCode || error?.response?.status || 502).json({ error: error?.response?.data?.error || error?.message || 'Could not read OAuth status.' });
  }
};
