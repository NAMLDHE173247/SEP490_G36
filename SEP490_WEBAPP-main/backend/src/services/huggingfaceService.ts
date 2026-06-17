import { createRepo, uploadFiles } from '@huggingface/hub';

export class HuggingFaceService {
    /**
     * Upload a dataset to Hugging Face Hub
     * @param token Hugging Face User Access Token
     * @param repoId The targeted repository ID, e.g. "username/my-dataset"
     * @param content The dataset content (JSON/JSONL string)
     * @param fileName The name of the file
     * @param isPrivate Whether the dataset should be private
     */
    async uploadDataset(
        token: string,
        repoId: string,
        content: string,
        fileName: string,
        isPrivate: boolean = true
    ): Promise<{ url: string }> {
        try {
            if (!token) {
                throw new Error('Hugging Face Token is missing.');
            }
            if (!repoId) {
                throw new Error('Repository ID is missing.');
            }
            if (!repoId.includes('/')) {
                throw new Error(`Invalid repo ID format: "${repoId}". Must be "username/dataset-name".`);
            }

            const credentials = { accessToken: token };
            const repo = { name: repoId, type: 'dataset' as const };

            // Ensure the repository exists
            try {
                await createRepo({
                    credentials,
                    repo,
                    private: isPrivate,
                });
                console.log(`Created HF repo: ${repoId}`);
            } catch (error: any) {
                // If repo already exists, `createRepo` throws a 409 Conflict.
                // We can safely ignore it and proceed to upload.
                if (error?.statusCode !== 409 && !error?.message?.includes('already exists') && !error?.message?.includes('409')) {
                    console.error('createRepo error:', error?.message, error?.statusCode);
                    throw new Error(`Failed to create repo "${repoId}": ${error?.message || 'Unknown error'}`);
                }
                console.log(`HF repo "${repoId}" already exists, proceeding to upload.`);
            }

            // Upload the file
            const fileBlob = new Blob([content], { type: 'text/plain' });
            console.log(`Uploading ${fileName} (${(content.length / 1024).toFixed(1)} KB) to ${repoId}...`);

            await uploadFiles({
                credentials,
                repo,
                files: [
                    {
                        path: fileName,
                        content: fileBlob,
                    },
                ],
                commitTitle: `Add dataset ${fileName}`,
            });

            console.log(`Successfully uploaded ${fileName} to ${repoId}`);
            return {
                url: `https://huggingface.co/datasets/${repoId}`,
            };
        } catch (error: any) {
            console.error('HuggingFace Service Error:', error?.message || error);
            // Preserve the original error message for better debugging
            throw new Error(error.message || 'Failed to upload dataset to Hugging Face');
        }
    }
}
