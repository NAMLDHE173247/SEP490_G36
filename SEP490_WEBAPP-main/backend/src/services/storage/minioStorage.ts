import os from 'os';
import path from 'path';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { IStorageService, StorageSaveResult } from './IStorageService';

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.jsonl': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

function contentTypeFor(objectKey: string): string {
  return CONTENT_TYPES[path.extname(objectKey).toLowerCase()] || 'application/octet-stream';
}

/**
 * Public-read bucket policy (matches the LLMAware visual-storage convention so
 * uploaded datasets are fetchable through the CDN domain without presigning).
 */
function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetBucketLocation', 's3:ListBucket'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

interface StorageConfig {
  enabled: boolean;
  host: string;
  port: number;
  useSSL: boolean;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
}

/**
 * Resolve whether the client should use TLS. Explicit STORAGE_SECURE wins;
 * otherwise infer from an https STORAGE_PUBLIC_URL on the same host (avoids
 * http→https redirects that strip S3 auth headers → AccessDenied).
 */
function resolveSecure(rawEndpoint: string, publicUrl: string): boolean {
  const explicit = process.env.STORAGE_SECURE;
  if (explicit !== undefined && explicit !== '') {
    return explicit === 'true';
  }
  if (publicUrl.toLowerCase().startsWith('https://')) {
    try {
      const pubHost = new URL(publicUrl).hostname;
      const epHost = rawEndpoint.split(':')[0];
      if (pubHost && pubHost === epHost) return true;
    } catch {
      // Ignore malformed public URL.
    }
  }
  return false;
}

function loadConfig(): StorageConfig {
  const rawEndpoint = (process.env.STORAGE_ENDPOINT || 'localhost:9000').trim();
  const publicUrl = (process.env.STORAGE_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const useSSL = resolveSecure(rawEndpoint, publicUrl);

  const [host, portStr] = rawEndpoint.replace(/^https?:\/\//i, '').split(':');
  const port = portStr ? parseInt(portStr, 10) : useSSL ? 443 : 80;

  return {
    enabled: (process.env.STORAGE_ENABLED ?? 'true') === 'true',
    host,
    port,
    useSSL,
    bucket: (process.env.STORAGE_BUCKET || 'llm_trains').trim(),
    accessKey: (process.env.STORAGE_ACCESS_KEY || 'minioadmin').trim(),
    secretKey: (process.env.STORAGE_SECRET_KEY || 'minioadmin').trim(),
    publicUrl,
  };
}

/**
 * MinIO / S3-compatible storage service. A single implementation serves both
 * dev (local MinIO) and production (CDN domain) — only the env differs.
 */
export class MinioStorageService implements IStorageService {
  private readonly config: StorageConfig;
  private client: Minio.Client | null = null;
  private bucketEnsured = false;

  constructor() {
    this.config = loadConfig();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  private getClient(): Minio.Client {
    if (!this.client) {
      this.client = new Minio.Client({
        endPoint: this.config.host,
        port: this.config.port,
        useSSL: this.config.useSSL,
        accessKey: this.config.accessKey,
        secretKey: this.config.secretKey,
      });
    }
    return this.client;
  }

  private async ensureBucket(): Promise<string> {
    const { bucket } = this.config;
    if (this.bucketEnsured) return bucket;

    const client = this.getClient();
    try {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
      }
      try {
        await client.setBucketPolicy(bucket, publicReadPolicy(bucket));
      } catch (err: any) {
        // A managed CDN/MinIO may deny policy changes; assume it is preconfigured.
        if (err?.code !== 'AccessDenied') {
          console.warn('[Storage] Could not set bucket policy:', err?.message || err);
        }
      }
    } catch (err: any) {
      // Bucket may already exist under a restricted account; surface but continue.
      if (err?.code !== 'BucketAlreadyOwnedByYou' && err?.code !== 'AccessDenied') {
        throw err;
      }
    }

    this.bucketEnsured = true;
    return bucket;
  }

  async uploadFile(localPath: string, objectKey: string, contentType?: string): Promise<StorageSaveResult> {
    const bucket = await this.ensureBucket();
    await this.getClient().fPutObject(bucket, objectKey, localPath, {
      'Content-Type': contentType || contentTypeFor(objectKey),
    });
    const size = (await this.getClient().statObject(bucket, objectKey)).size;
    return { objectKey, bucket, url: this.getPublicUrl(objectKey), size };
  }

  async uploadBuffer(buffer: Buffer, objectKey: string, contentType?: string): Promise<StorageSaveResult> {
    const bucket = await this.ensureBucket();
    await this.getClient().putObject(bucket, objectKey, buffer, buffer.length, {
      'Content-Type': contentType || contentTypeFor(objectKey),
    });
    return { objectKey, bucket, url: this.getPublicUrl(objectKey), size: buffer.length };
  }

  async downloadToTemp(objectKey: string): Promise<string> {
    const bucket = await this.ensureBucket();
    const tempPath = path.join(os.tmpdir(), `storage-${randomUUID()}-${path.basename(objectKey)}`);
    await this.getClient().fGetObject(bucket, objectKey, tempPath);
    return tempPath;
  }

  async delete(objectKey: string): Promise<void> {
    try {
      await this.getClient().removeObject(this.config.bucket, objectKey);
    } catch (err: any) {
      if (err?.code !== 'NoSuchKey' && err?.code !== 'NotFound') {
        throw err;
      }
    }
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.getClient().statObject(this.config.bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(objectKey: string): string {
    const { publicUrl, bucket, useSSL, host, port } = this.config;
    if (publicUrl) {
      return `${publicUrl}/${bucket}/${objectKey}`;
    }
    const scheme = useSSL ? 'https' : 'http';
    const authority = (useSSL && port === 443) || (!useSSL && port === 80) ? host : `${host}:${port}`;
    return `${scheme}://${authority}/${bucket}/${objectKey}`;
  }

  presignedUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
    return this.getClient().presignedGetObject(this.config.bucket, objectKey, expirySeconds);
  }
}
