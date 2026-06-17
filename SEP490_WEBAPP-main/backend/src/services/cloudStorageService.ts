import { Storage } from '@google-cloud/storage';
import { BlobServiceClient } from '@azure/storage-blob';


export class CloudStorageService {
    /**
     * Upload a dataset content to Google Cloud Storage
     */
    async uploadToGCS(bucketName: string, fileName: string, content: string): Promise<string> {
        try {
            // Khởi tạo GCS Client
            // Lưu ý: GOOGLE_APPLICATION_CREDENTIALS path cần được cấu hình trong .env
            const storage = new Storage();
            const bucket = storage.bucket(bucketName);
            const file = bucket.file(fileName);

            await file.save(content, {
                contentType: 'application/json',
                resumable: false
            });

            return `gs://${bucketName}/${fileName}`;
        } catch (error: any) {
            console.error('GCS Upload Error:', error);
            throw new Error(`Failed to upload to Google Cloud Storage: ${error.message}`);
        }
    }

    /**
     * Upload a dataset content to Azure Blob Storage
     */
    async uploadToAzure(connectionString: string, containerName: string, fileName: string, content: string): Promise<string> {
        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            const containerClient = blobServiceClient.getContainerClient(containerName);

            // Tạo container nếu chưa tồn tại
            await containerClient.createIfNotExists({ access: 'container' });

            const blockBlobClient = containerClient.getBlockBlobClient(fileName);
            
            await blockBlobClient.upload(content, Buffer.byteLength(content), {
                blobHTTPHeaders: { blobContentType: 'application/json' }
            });

            return blockBlobClient.url;
        } catch (error: any) {
            console.error('Azure Upload Error:', error);
            throw new Error(`Failed to upload to Azure Blob Storage: ${error.message}`);
        }
    }
}
