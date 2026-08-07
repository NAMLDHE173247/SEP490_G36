import { MinioStorageService } from './minioStorage';
import { IStorageService, StorageSaveResult } from './IStorageService';

export type { IStorageService, StorageSaveResult };

/**
 * Singleton storage backend. Production and dev both use the S3/MinIO client;
 * only the STORAGE_* env vars differ (dev → local MinIO, prod → CDN domain).
 * Kept behind a factory so an alternate backend can be swapped in later.
 */
export const storage: IStorageService = new MinioStorageService();
