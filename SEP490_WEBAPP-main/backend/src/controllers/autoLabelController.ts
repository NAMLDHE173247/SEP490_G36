import { Request, Response } from 'express';
import axios from 'axios';

/**
 * POST /api/auto-label
 *
 * Nhận danh sách cluster groups (mỗi group gồm groupId, count, samples).
 * Gọi AI (deepseek | openai | gemini) để gợi ý nhãn môn học cho từng group.
 *
 * Request body:
 *   {
 *     provider: 'deepseek' | 'openai' | 'gemini',
 *     groups: Array<{
 *       groupId: number,
 *       count: number,
 *       samples: Array<{ user: string, assistant: string }>
 *     }>
 *   }
 *
 * Response:
 *   {
 *     suggestions: Array<{ groupId: number, label: string, reason: string }>
 *   }
 */

const SUBJECT_LABELS = ['MATH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'HISTORY', 'LITERATURE', 'CODING', 'OTHER'] as const;

interface GroupSample {
  user: string;
  assistant: string;
}

interface ClusterGroup {
  groupId: number;
  count: number;
  samples: GroupSample[];
}

function buildPrompt(groups: ClusterGroup[]): string {
  const groupDescriptions = groups.map(g => {
    const sampleText = g.samples
      .slice(0, 3)
      .map((s, i) => `  [Sample ${i + 1}]\n  User: ${s.user.slice(0, 200)}\n  Assistant: ${s.assistant.slice(0, 200)}`)
      .join('\n');
    return `Group ${g.groupId} (${g.count} conversations):\n${sampleText}`;
  }).join('\n\n');

  return `You are an expert AI assistant for educational data labeling.
Analyze the following conversation cluster groups and assign the most appropriate subject label to each group.

Available base labels: ${SUBJECT_LABELS.join(', ')}
- MATH: Mathematics, algebra, calculus, geometry, statistics
- PHYSICS: Physics, mechanics, thermodynamics, optics, electricity
- CHEMISTRY: Chemistry, elements, reactions, organic/inorganic
- BIOLOGY: Biology, cells, genetics, ecology, human body
- HISTORY: History, events, civilizations, wars, culture
- LITERATURE: Literature, poetry, grammar, writing, language arts
- CODING: Programming, software, algorithms, data structures, web/app development

IMPORTANT: If the conversation clearly belongs to a well-known subject NOT listed above (e.g., GEOGRAPHY, CIVIC_EDUCATION, ECONOMICS), output the name of that new subject in UPPERCASE. Only use OTHER if the conversation is truly random, unclear, or does not belong to any specific educational subject.

Groups to analyze:
${groupDescriptions}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "suggestions": [
    { "groupId": <number>, "label": "<LABEL>", "reason": "<brief reason in Vietnamese>" }
  ]
}`;
}

async function callDeepseek(prompt: string): Promise<any> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }
  );
  const content = response.data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function callOpenAI(prompt: string): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }
  );
  const content = response.data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

async function callGemini(prompt: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  );
  const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(content);
}

export const autoLabelGroups = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider = 'deepseek', groups } = req.body as {
      provider: 'deepseek' | 'openai' | 'gemini';
      groups: ClusterGroup[];
    };

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ error: 'Missing or empty groups array' });
      return;
    }

    const prompt = buildPrompt(groups);
    console.log(`[AutoLabel] Prompt being sent:\n${prompt}\n`);
    console.log(`[AutoLabel] Calling ${provider} for ${groups.length} groups...`);

    let result: any;
    switch (provider) {
      case 'openai':
        result = await callOpenAI(prompt);
        break;
      case 'gemini':
        result = await callGemini(prompt);
        break;
      case 'deepseek':
      default:
        result = await callDeepseek(prompt);
        break;
    }

    console.log(`[AutoLabel] Raw result from AI:\n${JSON.stringify(result, null, 2)}\n`);

    // Validate and sanitize suggestions
    const rawSuggestions: any[] = result?.suggestions || [];
    const suggestions = rawSuggestions
      .filter(s => typeof s.groupId === 'number')
      .map(s => {
        let finalLabel = (s.label || 'OTHER').toString().trim().toUpperCase();
        finalLabel = finalLabel.replace(/\s+/g, '_');
        return {
          groupId: s.groupId,
          label: finalLabel,
          reason: s.reason || '',
        };
      });

    console.log(`[AutoLabel] ${provider} returned ${suggestions.length} suggestions`);
    res.json({ suggestions });

  } catch (err: any) {
    console.error('[AutoLabel] Error:', err?.response?.data || err.message);
    res.status(500).json({
      error: err?.response?.data?.error?.message || err.message || 'Auto-labeling failed',
    });
  }
};
