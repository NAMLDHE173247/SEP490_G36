import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();

class ConfigService {
  private gpuUrls: string[];
  private userGpuMap: Map<string, string[]> = new Map();
  private gpuCleared: boolean = false;
  private readonly runtimeFile = path.join(os.tmpdir(), 'sep490-gpu-service-url.txt');
  private readonly userGpuFile = path.join(os.tmpdir(), 'sep490-user-gpu-urls.json');

  private normalizeUrl(value: string): string {
    let url = String(value || '').trim().replace(/^['"`]|['"`]$/g, '');
    // Accept common copy/paste variants from Colab/LocalTunnel output.
    url = url.replace(/^https?:\/\/https?:\/\//i, 'https://');
    url = url.replace(/^https?:\/\/https?\/\//i, 'https://');
    url = url.replace(/^https?:\/([^/])/i, (_match, first) => `https://${first}`);
    url = url.replace(/^\/\//, 'https://');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      parsed.pathname = parsed.pathname.replace(/\/+(health|api\/health)\/?$/i, '').replace(/\/+$/, '');
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      return url.replace(/\/+$/, '');
    }
  }

  private normalizeList(raw: string): string[] {
    return raw.split(',').map(url => this.normalizeUrl(url)).filter(Boolean);
  }

  constructor() {
    let persisted = '';
    try {
      persisted = fs.readFileSync(this.runtimeFile, 'utf8').trim();
    } catch {
      // First run: fall back to .env until the user connects a GPU endpoint.
    }
    const raw = persisted || process.env.GPU_SERVICE_URL || '';
    this.gpuUrls = raw ? this.normalizeList(raw) : [];

    // Load persisted user GPU mapping if present
    try {
      if (fs.existsSync(this.userGpuFile)) {
        const rawUserMap = fs.readFileSync(this.userGpuFile, 'utf8').trim();
        if (rawUserMap) {
          const data = JSON.parse(rawUserMap);
          for (const [uid, urls] of Object.entries(data)) {
            if (Array.isArray(urls)) {
              this.userGpuMap.set(uid, urls as string[]);
            }
          }
        }
      }
    } catch (e) {
      console.error('[ConfigService] Could not load user GPU file:', e);
    }
  }

  getGpuUrl(instanceId?: number, userId?: string): string {
    if (userId && this.userGpuMap.has(userId)) {
      const userUrls = this.userGpuMap.get(userId)!;
      if (userUrls.length > 0) {
        if (instanceId && instanceId > 0 && instanceId <= userUrls.length) {
          return userUrls[instanceId - 1];
        }
        return userUrls[0];
      }
    }
    if (!this.gpuUrls.length) return 'http://localhost:5000';
    if (instanceId && instanceId > 0 && instanceId <= this.gpuUrls.length) {
      return this.gpuUrls[instanceId - 1];
    }
    return this.gpuUrls[0];
  }

  getGpuUrls(userId?: string): string[] {
    if (userId && this.userGpuMap.has(userId)) {
      const userUrls = this.userGpuMap.get(userId)!;
      if (userUrls.length > 0) return userUrls;
    }
    return this.gpuUrls;
  }

  setUserGpuUrl(userId: string, urlStr: string) {
    if (!userId) return;
    if (!urlStr || urlStr.trim() === '') {
      this.userGpuMap.delete(userId);
    } else {
      const urls = this.normalizeList(urlStr);
      this.userGpuMap.set(userId, urls);
    }
    this.saveUserGpuMap();
  }

  private saveUserGpuMap() {
    try {
      const obj: Record<string, string[]> = {};
      for (const [uid, urls] of this.userGpuMap.entries()) {
        obj[uid] = urls;
      }
      fs.writeFileSync(this.userGpuFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      console.error('[ConfigService] Failed to save user GPU map:', e);
    }
  }

  isGpuConfigured(userId?: string): boolean {
    if (userId && this.userGpuMap.has(userId)) {
      return (this.userGpuMap.get(userId)?.length || 0) > 0;
    }
    return this.gpuUrls.length > 0 && !this.gpuCleared;
  }

  setGpuUrlStr(urlStr: string) {
    if (!urlStr || urlStr.trim() === '') {
      return;
    }
    this.gpuCleared = false;
    this.gpuUrls = this.normalizeList(urlStr);
    fs.writeFileSync(this.runtimeFile, this.gpuUrls.join(','), 'utf8');
    console.log('[ConfigService] GPU_SERVICE_URL updated to:', this.gpuUrls);
  }

  clearGpuUrl(userId?: string) {
    if (userId) {
      this.userGpuMap.delete(userId);
      this.saveUserGpuMap();
    }
    this.gpuUrls = [];
    this.gpuCleared = true;
    fs.writeFileSync(this.runtimeFile, '', 'utf8');
    console.log('[ConfigService] GPU_SERVICE_URL cleared.');
  }
}

export const configService = new ConfigService();
