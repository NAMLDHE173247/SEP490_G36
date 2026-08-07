/**
 * Abstraction over an object-storage backend (MinIO / S3-compatible).
 *
 * The same S3 API serves both environments — only the endpoint/credentials
 * differ (dev → local MinIO at localhost:9000, production → the CDN domain
 * cdn-lab.fpt.edu.vn with SECURE=true). This mirrors the LLMAware
 * `visual/storage.py` convention.
 */
export interface StorageSaveResult {
  /** Object key inside the bucket, e.g. `datasets/<jobId>/train.json`. */
  objectKey: string;
  /** Bucket the object was written to. */
  bucket: string;
  /** Public (or public-URL-prefixed) URL to fetch the object. */
  url: string;
  /** Size in bytes of the stored object, when known. */
  size: number;
}

export interface IStorageService {
  /** Whether object storage is enabled (STORAGE_ENABLED + configured). */
  isEnabled(): boolean;

  /** Uploads a file already present on local disk. */
  uploadFile(localPath: string, objectKey: string, contentType?: string): Promise<StorageSaveResult>;

  /** Uploads an in-memory buffer. */
  uploadBuffer(buffer: Buffer, objectKey: string, contentType?: string): Promise<StorageSaveResult>;

  /** Downloads an object to a fresh temp file and returns its path. Caller cleans up. */
  downloadToTemp(objectKey: string): Promise<string>;

  /** Removes an object from the backend (no-op if already absent). */
  delete(objectKey: string): Promise<void>;

  /** Whether the object currently exists in the backend. */
  exists(objectKey: string): Promise<boolean>;

  /** Public URL for an object (built from STORAGE_PUBLIC_URL or the endpoint). */
  getPublicUrl(objectKey: string): string;

  /** Time-limited presigned GET URL, for private buckets. */
  presignedUrl(objectKey: string, expirySeconds?: number): Promise<string>;
}
