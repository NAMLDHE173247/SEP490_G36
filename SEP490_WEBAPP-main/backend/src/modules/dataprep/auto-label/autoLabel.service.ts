import mongoose from 'mongoose';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { insertAssignments, removeLabelsByQuery } from '../../../services/labelAssignmentService';
import { ILlmProvider } from '../../../services/providers/ILlmProvider';

export const SUBJECT_LABELS = ['MATH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'HISTORY', 'LITERATURE', 'CODING', 'OTHER'] as const;
export type SubjectLabel = typeof SUBJECT_LABELS[number];

type ClusterSample = {
  sampleId: string;
  data: Record<string, any>;
};

type ClusterPayload = {
  clusterId: number;
  sampleCount: number;
  samples: ClusterSample[];
};

export type AutoLabelSuggestion = {
  clusterId: number;
  label: string;
  source: 'ai';
  topic: string;
  reason: string;
  sampleCount: number;
};



function normalizeSubjectLabel(value: unknown): string {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'MATH') return 'MATH';
  if (raw === 'PHYSICAL' || raw === 'PHYSICS') return 'PHYSICS';
  if (raw === 'CHEMISTRY') return 'CHEMISTRY';
  if (raw === 'BIOLOGY') return 'BIOLOGY';
  if (raw === 'HISTORY') return 'HISTORY';
  if (raw === 'LITERATURE') return 'LITERATURE';
  if (raw === 'CODING') return 'CODING';
  if (raw === 'OTHER') return 'OTHER';
  return raw.replace(/\s+/g, '_');
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function compactText(value: unknown, maxChars = 700): string {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.floor(maxChars * 0.7))}\n...[truncated]...\n${text.slice(-Math.floor(maxChars * 0.3))}`;
}

function serializeSample(data: Record<string, any>) {
  if (Array.isArray(data?.messages)) {
    return {
      messages: data.messages
        .filter((msg: any) => msg?.role === 'user' || msg?.role === 'assistant')
        .slice(-8)
        .map((msg: any) => ({
          role: String(msg.role || ''),
          content: compactText(msg.content),
        })),
    };
  }

  return {
    instruction: compactText(data?.instruction),
    input: compactText(data?.input),
    output: compactText(data?.output),
  };
}

function buildPrompt(clusters: ClusterPayload[]) {
  const payload = clusters.map((cluster) => ({
    clusterId: cluster.clusterId,
    sampleCount: cluster.sampleCount,
    samples: cluster.samples.map((sample) => ({
      sampleId: sample.sampleId,
      ...serializeSample(sample.data),
    })),
  }));

  return `Bạn là chuyên gia phân loại dữ liệu giáo dục theo môn học.

Hãy gán đúng MỘT nhãn môn học cho từng cụm dữ liệu. Các nhãn CƠ BẢN:
- MATH: toán học, số học, đại số, hình học, xác suất, thống kê.
- PHYSICS: vật lý, cơ học, điện, quang, nhiệt, lực, năng lượng.
- CHEMISTRY: hóa học, chất, phản ứng, phương trình hóa học, mol, nguyên tử.
- BIOLOGY: sinh học, cơ thể sống, tế bào, di truyền, sinh thái.
- HISTORY: lịch sử, sự kiện, chiến tranh, triều đại, văn hóa.
- LITERATURE: ngữ văn, đọc hiểu, viết văn, tiếng Việt, phân tích tác phẩm.
- CODING: lập trình, thuật toán, công nghệ thông tin, cấu trúc dữ liệu.

LƯU Ý QUAN TRỌNG: Nếu đoạn hội thoại rõ ràng thuộc về một môn học cụ thể KHÁC chưa có trong danh sách trên (ví dụ: GEOGRAPHY, CIVIC_EDUCATION, ECONOMICS), hãy tự định nghĩa ra nhãn đó BẰNG CHỮ IN HOA.
Chỉ dùng OTHER khi nội dung thực sự vô nghĩa, nhiễu, hoặc không thuộc môn học cụ thể nào.

DỮ LIỆU CỤM:
${JSON.stringify(payload)}

Yêu cầu output:
- CHỈ trả về JSON array hợp lệ.
- Mỗi object bắt buộc có: clusterId, label, topic, reason.
- label là tên môn học in hoa.
- topic tóm tắt nội dung chính của cụm trong một câu ngắn.
- reason nêu các đặc trưng nội dung chung khiến những hội thoại được gom vào cùng cụm.
- Không thêm markdown, không giải thích ngoài JSON.

Định dạng:
[
  { "clusterId": 0, "label": "MATH", "topic": "Phương trình bậc hai", "reason": "Các mẫu đều hỏi về nghiệm và cách giải phương trình bậc hai." }
]`;
}

function parseSuggestions(rawText: string, clusters: ClusterPayload[]): AutoLabelSuggestion[] {
  let parsed: any[] = [];
  try {
    const firstBracket = rawText.indexOf('[');
    const lastBracket = rawText.lastIndexOf(']');
    const jsonText = firstBracket >= 0 && lastBracket > firstBracket
      ? rawText.slice(firstBracket, lastBracket + 1)
      : rawText;
    const value = JSON.parse(jsonText);
    parsed = Array.isArray(value) ? value : [value];
  } catch {
    parsed = [];
  }

  const byCluster = new Map<number, any>();
  parsed.forEach((item) => {
    const clusterId = Number(item?.clusterId);
    if (Number.isFinite(clusterId)) {
      byCluster.set(clusterId, item);
    }
  });

  return clusters.map((cluster) => {
    const item = byCluster.get(cluster.clusterId);
    return {
      clusterId: cluster.clusterId,
      label: normalizeSubjectLabel(item?.label),
      source: 'ai' as const,
      topic: String(item?.topic || 'Chưa đủ dữ liệu để tóm tắt'),
      reason: String(item?.reason || 'AI không cung cấp giải thích đủ tin cậy cho cụm này.'),
      sampleCount: cluster.sampleCount,
    };
  });
}

export class AutoLabelingService {
  constructor(private readonly provider: ILlmProvider) { }

  async loadAuthorizedVersion(versionId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Invalid dataset version id.'), { statusCode: 400 });
    }

    const version = await DatasetVersion.findById(versionId).lean();
    if (!version) {
      throw Object.assign(new Error('Dataset version not found.'), { statusCode: 404 });
    }

    const isOwner = String(version.ownerId) === String(userId);

    if (!isOwner) {
      throw Object.assign(new Error('Forbidden: only the dataset owner can auto-label this version.'), { statusCode: 403 });
    }

    return version;
  }

  async loadClusters(versionId: string, userId: string): Promise<ClusterPayload[]> {
    const version = await this.loadAuthorizedVersion(versionId, userId);

    const items = await ProcessedDatasetItem.find({ datasetVersionId: version._id }).sort({ createdAt: 1 }).lean();
    const grouped = new Map<number, ClusterSample[]>();

    items.forEach((item: any) => {
      const clusterId = Number(item?.data?.cluster);
      if (!Number.isFinite(clusterId)) return;
      const list = grouped.get(clusterId) || [];
      list.push({ sampleId: String(item._id), data: item.data || {} });
      grouped.set(clusterId, list);
    });

    if (!grouped.size) {
      throw Object.assign(new Error('No clustered samples found. Run K-means clustering before Auto Labeling.'), { statusCode: 400 });
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a - b)
      .map(([clusterId, samples]) => ({
        clusterId,
        sampleCount: samples.length,
        samples: shuffle(samples).slice(0, 5),
      }));
  }

  async preview(versionId: string, userId: string): Promise<AutoLabelSuggestion[]> {
    const clusters = await this.loadClusters(versionId, userId);
    const rawText = await this.provider.generateContent(buildPrompt(clusters));
    return parseSuggestions(rawText, clusters);
  }

  async save(versionId: string, userId: string, labels: Array<{ clusterId: number; label: string }>) {
    if (!Array.isArray(labels) || labels.length === 0) {
      throw Object.assign(new Error('labels is required.'), { statusCode: 400 });
    }

    const clusters = await this.loadClusters(versionId, userId);
    const validClusterIds = new Set(clusters.map((cluster) => cluster.clusterId));
    const requestedLabels = labels.map((item) => ({
      clusterId: Number(item.clusterId),
      label: normalizeSubjectLabel(item.label),
    }));

    const invalid = requestedLabels.find((item) => !validClusterIds.has(item.clusterId) || !item.label);
    if (invalid) {
      throw Object.assign(new Error('Invalid cluster label payload.'), { statusCode: 400 });
    }

    const version = await this.loadAuthorizedVersion(versionId, userId);


    const userOid = new mongoose.Types.ObjectId(userId);
    let insertedCount = 0;

    for (const item of requestedLabels) {
      const samples = await ProcessedDatasetItem.find({
        datasetVersionId: version._id,
        'data.cluster': item.clusterId,
      }).select('_id').lean();
      const sampleIds = samples.map((sample: any) => sample._id);
      if (!sampleIds.length) continue;

      await removeLabelsByQuery({
        sampleId: { $in: sampleIds },
        type: 'hard',
        createdBy: userOid,
        $or: [
          { targetScope: 'sample' },
          { targetScope: { $exists: false } },
          { targetScope: null },
        ],
      });

      const docs = sampleIds.map((sampleId) => ({
        sampleId,
        name: item.label,
        type: 'hard' as const,
        targetScope: 'sample' as const,
        createdBy: userOid,
      }));

      if (docs.length) {
        await insertAssignments(docs);
        insertedCount += docs.length;
      }
    }

    return { insertedCount };
  }
}
