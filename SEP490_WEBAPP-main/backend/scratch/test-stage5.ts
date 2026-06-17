// import { MultiEvalService } from '../src/modules/dataprep/quality/multiEval.service';
import { GeminiProvider } from '../src/services/providers/GeminiProvider';
import { MULTI_MODEL_JUDGE_SYSTEM_PROMPT } from '../src/constants/prompts';
import '../src/dotenv';

const dataset = [
  {
    "messages": [
      {
        "role": "user",
        "content": "Một lớp có 30 học sinh, số học sinh giỏi chiếm 20%. Hỏi có bao nhiêu học sinh giỏi?"
      },
      {
        "role": "assistant",
        "content": "Em lấy 30 nhân với 20% nghĩa là nhân với \\(\frac{20}{100}\\), kết quả bằng bao nhiêu?"
      }
    ]
  }
];

async function test() {
  try {
    const provider = new GeminiProvider(true);
    for (const sample of dataset) {
      const messages = sample.messages;
      const targetIdx = messages.length - 1; // last assistant message
      const contextWindow = messages.map((m, mIdx) => ({
        role: m.role,
        content: m.content,
        isTarget: mIdx === targetIdx,
      }));

      const inputData = { contextWindow, originalMessageIndex: targetIdx };
      // Try string replace the buggy way first
      const prompt = MULTI_MODEL_JUDGE_SYSTEM_PROMPT.replace('${sampleJson}', JSON.stringify(inputData, null, 2));
      const systemPrompt = "You are a strict educational quality assurance assistant. You must return ONLY a raw, valid JSON object matching the requested schema. Do NOT wrap the JSON in markdown formatting. Do NOT include any explanations, greetings, or conversational text. Just the raw JSON object starting with { and ending with }.";
      
      console.log('Sending to Gemini...');
      const rawResponse = await provider.generateContent(prompt, 'gemini-flash-latest', systemPrompt);
      console.log('Raw Response:', rawResponse);
      
      const parsed = JSON.parse(rawResponse);
      console.log('Parsed JSON:', parsed);
    }
  } catch (err) {
    console.error('Test Failed:', err);
  }
}

test();
