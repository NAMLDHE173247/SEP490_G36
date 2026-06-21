declare module '@azure/storage-blob' {
  export class BlobServiceClient {
    static fromConnectionString(connectionString: string): BlobServiceClient;
    getContainerClient(containerName: string): {
      createIfNotExists(options?: { access?: string }): Promise<unknown>;
      getBlockBlobClient(fileName: string): {
        url: string;
        upload(content: string, length: number, options?: { blobHTTPHeaders?: { blobContentType?: string } }): Promise<unknown>;
      };
    };
  }
}
