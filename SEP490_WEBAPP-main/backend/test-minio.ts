import dotenv from 'dotenv';
dotenv.config();

import { MinioStorageService } from './src/services/storage/minioStorage';
import { randomUUID } from 'crypto';

async function runTest() {
  console.log('=== KỊCH BẢN TEST UPLOAD VÀ TẠO BUCKET TỰ ĐỘNG ===');
  
  // Khởi tạo Storage Service y như cách hệ thống Backend đang dùng
  const storage = new MinioStorageService();
  
  if (!storage.isEnabled()) {
    console.log('LỖI: Storage đang bị disable trong env!');
    return;
  }

  const dummyContent = 'Xin chao SEP490! Day la file test de kiem tra tinh nang tu dong tao bucket tren MinIO.';
  const buffer = Buffer.from(dummyContent, 'utf-8');
  const objectKey = `test-folder/test-upload-${randomUUID()}.txt`;

  try {
    console.log(`Đang tiến hành upload file: ${objectKey}`);
    console.log('Sẽ tự động gọi hàm ensureBucket() bên trong...');
    
    // Gọi hàm uploadBuffer (bên trong hàm này sẽ tự gọi ensureBucket() để tạo bucket llm-trains)
    const result = await storage.uploadBuffer(buffer, objectKey, 'text/plain');
    
    console.log('\n✅ UPLOAD THÀNH CÔNG RỰC RỠ!');
    console.log('=============================================');
    console.log(`Bucket lưu trữ : ${result.bucket}`);
    console.log(`Tên file       : ${result.objectKey}`);
    console.log(`Dung lượng     : ${result.size} bytes`);
    console.log(`Link truy cập  : ${result.url}`);
    console.log('=============================================');
    console.log('Hãy mở giao diện MinIO (localhost:9001) lên để xem thành quả!');

  } catch (err) {
    console.error('❌ Upload thất bại:', err);
  }
}

runTest();
