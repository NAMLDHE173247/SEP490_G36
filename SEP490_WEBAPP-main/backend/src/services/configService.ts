import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();

class ConfigService {
  private gpuUrls: string[];
  private gpuCleared: boolean = false;
  private readonly runtimeFile = path.join(os.tmpdir(), 'sep490-gpu-service-url.txt');

  constructor() {
    let persisted = '';
    try {
      persisted = fs.readFileSync(this.runtimeFile, 'utf8').trim();
    } catch {
      // First run: fall back to .env until the user connects a GPU endpoint.
    }
    const raw = persisted || process.env.GPU_SERVICE_URL || '';
    this.gpuUrls = raw ? raw.split(',').map(url => url.trim().replace(/\/$/, '')) : [];
  }

  getGpuUrl(instanceId?: number): string {
    if (!this.gpuUrls.length) return 'http://localhost:5000';
    if (instanceId && instanceId > 0 && instanceId <= this.gpuUrls.length) {
      return this.gpuUrls[instanceId - 1];
    }
    return this.gpuUrls[0];
  }

  getGpuUrls(): string[] {
    return this.gpuUrls;
  }

  isGpuConfigured(): boolean {
    return this.gpuUrls.length > 0 && !this.gpuCleared;
  }

  setGpuUrlStr(urlStr: string) {
    if (!urlStr || urlStr.trim() === '') {
      return;
    }
    this.gpuCleared = false;
    this.gpuUrls = urlStr.split(',').map(url => url.trim().replace(/\/$/, ''));
    fs.writeFileSync(this.runtimeFile, this.gpuUrls.join(','), 'utf8');
    console.log('[ConfigService] GPU_SERVICE_URL updated to:', this.gpuUrls);
  }

  clearGpuUrl() {
    this.gpuUrls = [];
    this.gpuCleared = true;
    fs.writeFileSync(this.runtimeFile, '', 'utf8');
    console.log('[ConfigService] GPU_SERVICE_URL cleared.');
  }
}

export const configService = new ConfigService();
