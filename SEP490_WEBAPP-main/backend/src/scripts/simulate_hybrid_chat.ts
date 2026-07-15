import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';

// Load env variables
dotenv.config();

import { decideHybridRoute } from '../services/routing/routingOrchestrator';

const DB_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sep_training';
const GPU_URL = 'http://localhost:5000';
const TEST_FILE_PATH = 'd:\\Sep_G36\\socratic_math_physics_v4_stratified_test.json';

interface TestConversation {
  conversation_id: string;
  subject: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

async function run() {
  console.log('--- KHỞI ĐỘNG MÔ PHỎNG KIỂM THỬ HYBRID ROUTER CHAT ---');
  console.log(`Connecting to MongoDB at: ${DB_URI}`);
  await mongoose.connect(DB_URI);
  console.log('Connected.');

  // Find a valid ownerId
  const firstRegistry = await mongoose.connection.collection('modelregistries').findOne({});
  if (!firstRegistry) {
    console.error('No registries found in database.');
    process.exit(1);
  }
  const ownerId = firstRegistry.ownerId.toString();

  // Load the test conversations
  const conversations: TestConversation[] = JSON.parse(fs.readFileSync(TEST_FILE_PATH, 'utf-8'));
  
  // Select 2 representative conversations: 1 Math, 1 Physics
  const mathConv = conversations.find(c => c.subject === 'MATH');
  const phyConv = conversations.find(c => c.subject === 'PHYSICS');

  const selectedConvs = [mathConv, phyConv].filter(Boolean) as TestConversation[];

  for (const c of selectedConvs) {
    console.log(`\n======================================================`);
    console.log(`BẮT ĐẦU MÔ PHỎNG HỘI THOẠI: ${c.conversation_id} (Môn học gốc: ${c.subject})`);
    console.log(`======================================================`);

    const simulatedHistory: { role: 'user' | 'assistant'; content: string }[] = [];

    // Replay the first 2 user turns
    let turnCount = 1;
    for (let i = 0; i < c.messages.length; i++) {
      const msg = c.messages[i];
      if (msg.role !== 'user') continue;

      console.log(`\n[Lượt ${turnCount}] 👤 Học sinh hỏi: "${msg.content}"`);
      simulatedHistory.push({ role: 'user', content: msg.content });

      console.log('🤖 Bộ định tuyến (Hybrid Router) đang phân tích...');
      const decision = await decideHybridRoute({
        ownerId,
        question: msg.content,
        history: simulatedHistory.slice(0, -1).map(h => ({
          role: h.role,
          content: h.content
        })),
        mode: 'hybrid',
        persistLog: true,
      });

      console.log(`   👉 Kết quả định tuyến:`);
      console.log(`      - Môn học xác định: ${decision.subject}`);
      console.log(`      - Mô hình được chọn: ${decision.selectedModel}`);
      console.log(`      - Phương thức: ${decision.strategy} (Định tuyến bằng LLM: ${decision.llmCalled})`);
      console.log(`      - Độ trễ định tuyến: ${decision.latencyMs} ms`);

      if (decision.needClarification || !decision.selectedModel) {
        console.log(`   ⚠️ Router yêu cầu học sinh làm rõ câu hỏi.`);
        simulatedHistory.push({ role: 'assistant', content: 'Thầy chưa rõ ý em lắm, bài toán này thuộc phần nào nhỉ?' });
        continue;
      }

      console.log(`🚀 Đang tải mô hình [${decision.selectedModel}] lên GPU slot 1...`);
      try {
        await axios.post(`${GPU_URL}/api/model/load`, {
          hf_model_id: decision.selectedModel,
          instance_id: 1,
          force_reload: false
        }, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'Bypass-Tunnel-Reminder': 'true'
          }
        });
        console.log(`✅ Mô hình đã sẵn sàng trên GPU.`);
      } catch (loadErr: any) {
        console.error(`   ❌ Lỗi khi load mô hình lên GPU:`, loadErr.message);
        continue;
      }

      console.log(`🚀 Đang kết nối tới GPU stream [${decision.selectedModel}]...`);
      try {
        const inferResp = await axios.post(`${GPU_URL}/api/infer/stream`, {
          hf_model_id: decision.selectedModel,
          text_input: msg.content,
          history: simulatedHistory.slice(0, -1).map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [h.content]
          })),
          instanceId: 1,
          system_prompt: 'Bạn là gia sư Socratic dành cho học sinh Việt Nam. Tránh trả lời trực tiếp, hãy đặt câu hỏi gợi mở.',
          max_new_tokens: 192,
          temperature: 0.2,
          top_p: 0.9,
          repetition_penalty: 1.15
        }, {
          headers: {
            'ngrok-skip-browser-warning': 'true',
            'Bypass-Tunnel-Reminder': 'true'
          },
          responseType: 'stream'
        });

        let fullReply = '';
        process.stdout.write(`🧑‍🏫 Phản hồi Socratic: "`);
        
        await new Promise<void>((resolve, reject) => {
          inferResp.data.on('data', (chunk: Buffer) => {
            const textChunk = chunk.toString();
            const lines = textChunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const dataStr = line.substring(6).trim();
                  if (!dataStr) continue;
                  const parsed = JSON.parse(dataStr);
                  if (parsed.text) {
                    fullReply += parsed.text;
                    process.stdout.write(parsed.text);
                  }
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          });
          inferResp.data.on('end', () => {
            console.log(`"`);
            resolve();
          });
          inferResp.data.on('error', (err: any) => {
            reject(err);
          });
        });

        simulatedHistory.push({ role: 'assistant', content: fullReply });
      } catch (err: any) {
        console.error(`   ❌ Lỗi khi gọi GPU inference:`, err.message);
      }

      turnCount++;
      if (turnCount > 2) break; // Mô phỏng 2 lượt để kiểm tra nhanh
    }
  }

  console.log('\n--- MÔ PHỎNG HOÀN TẤT THÀNH CÔNG ---');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
