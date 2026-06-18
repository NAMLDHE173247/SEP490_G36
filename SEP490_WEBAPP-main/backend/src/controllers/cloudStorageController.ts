import { Request, Response } from 'express';
import { CloudStorageService } from '../services/cloudStorageService';

const cloudStorageService = new CloudStorageService();

export class CloudStorageController {
    /**
     * Upload dataset content from the client directly to Cloud Storage (GCS/Azure)
     */
    async syncDataset(req: Request, res: Response): Promise<void> {
        try {
            const { provider, fileName, content } = req.body;

            console.log(`[CloudStorage] syncDataset called: provider=${provider}, fileName=${fileName}, contentLength=${content?.length}`);
            console.log(`[CloudStorage] ENV check: AZURE_STORAGE_CONNECTION_STRING exists=${!!process.env.AZURE_STORAGE_CONNECTION_STRING}, length=${process.env.AZURE_STORAGE_CONNECTION_STRING?.length}`);
            console.log(`[CloudStorage] ENV check: AZURE_CONTAINER_NAME=${process.env.AZURE_CONTAINER_NAME}`);

            if (!provider || !content || !fileName) {
                res.status(400).json({ error: 'Missing required fields (provider, fileName, content)' });
                return;
            }

            if (provider === 'gcloud') {
                const bucketName = process.env.GCS_BUCKET_NAME;
                if (!bucketName) {
                    res.status(500).json({ error: 'GCS_BUCKET_NAME is not configured in the environment variables.' });
                    return;
                }
                const url = await cloudStorageService.uploadToGCS(bucketName, fileName, content);
                res.status(200).json({
                    message: 'Successfully synced to Google Cloud Storage',
                    url: url,
                });
            } else if (provider === 'azure') {
                const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
                const containerName = process.env.AZURE_CONTAINER_NAME || 'datasets';

                if (!connectionString) {
                    res.status(500).json({ error: 'AZURE_STORAGE_CONNECTION_STRING is not configured in the environment variables.' });
                    return;
                }

                // Validate connection string format
                if (!connectionString.includes('AccountName=') || !connectionString.includes('AccountKey=')) {
                    res.status(500).json({ 
                        error: 'AZURE_STORAGE_CONNECTION_STRING format is invalid. Must contain AccountName and AccountKey.',
                        tip: 'Go to Azure Portal -> Storage Account -> Access Keys -> Copy the full Connection String'
                    });
                    return;
                }

                console.log(`[CloudStorage] Uploading to Azure container="${containerName}"`);
                const url = await cloudStorageService.uploadToAzure(connectionString, containerName, fileName, content);
                res.status(200).json({
                    message: 'Successfully synced to Azure Blob Storage',
                    url: url,
                });
            } else {
                res.status(400).json({ error: 'Invalid provider. Supported providers: gcloud, azure.' });
            }
        } catch (error: any) {
            console.error('[CloudStorage] Sync Error full:', error);
            res.status(500).json({
                error: 'Failed to sync to Cloud Storage',
                details: error.message,
                code: error.code || error.statusCode || 'UNKNOWN',
            });
        }
    }
}
