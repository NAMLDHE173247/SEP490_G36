/**
 * Evidence-based AutoTrain summary.
 *
 * The rules layer is intentionally complete on its own: a missing LLM key
 * must not remove the quality verdict or the cost recommendation. An LLM can
 * add a clearer explanation on top of these measured values, but it cannot
 * invent the underlying metrics.
 */

type LossPoint = {
  loss?: number;
  step?: number;
  epoch?: number;
};

export const TRAIN_SUMMARY_VERSION = 2;

const finite = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const round = (value: number | null | undefined, digits = 4): number | null => {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percent = (from: number | undefined, to: number | undefined): number | null => {
  if (from === undefined || to === undefined || from === 0) return null;
  return round(((from - to) / Math.abs(from)) * 100, 1);
};

const validPoints = (points: unknown): LossPoint[] => (
  Array.isArray(points)
    ? points
      .map((point: any) => ({
        loss: finite(point?.loss),
        step: finite(point?.step),
        epoch: finite(point?.epoch),
      }))
      .filter((point) => point.loss !== undefined)
    : []
);

function parseLogPoints(logs: unknown): { train: LossPoint[]; eval: LossPoint[] } {
  const train: LossPoint[] = [];
  const evalPoints: LossPoint[] = [];
  if (!Array.isArray(logs)) return { train, eval: evalPoints };

  for (const raw of logs) {
    const line = String(raw || '');
    const match = line.match(/Step\s+(\d+)(?:\/\d+)?\s*\|\s*Epoch\s+([\d.]+)/i);
    const trainMatch = line.match(/\bLoss:\s*([\d.]+)/i);
    const evalMatch = line.match(/Eval Loss(?: \(Overfit\))?:\s*([\d.]+)/i);
    const step = match ? Number(match[1]) : undefined;
    const epoch = match ? Number(match[2]) : undefined;
    if (trainMatch) train.push({ loss: Number(trainMatch[1]), step, epoch });
    if (evalMatch) evalPoints.push({ loss: Number(evalMatch[1]), step, epoch });
  }
  return { train, eval: evalPoints };
}

function parseLogEvidence(logs: unknown) {
  const result: any = {
    trainFilter: { reasons: {} },
    validationFilter: { reasons: {} },
    length: {},
    mask: {},
    trainSamples: undefined,
  };
  if (!Array.isArray(logs)) return result;
  for (const raw of logs) {
    const line = String(raw || '');
    const quality = line.match(/\[DataQuality:(train_raw|validation)\]\s+kept=(\d+)\/(\d+)\s+dropped=(\d+)\s*\(([^)]*)\)/i);
    if (quality) {
      const target = quality[1].toLowerCase() === 'validation' ? result.validationFilter : result.trainFilter;
      target.kept = Number(quality[2]);
      target.total = Number(quality[3]);
      target.dropped = Number(quality[4]);
      for (const reason of quality[5].split(',')) {
        const [key, value] = reason.trim().split('=');
        if (key && value && Number.isFinite(Number(value))) target.reasons[key] = Number(value);
      }
    }
    const length = line.match(/\[Length\]\s+sampled=(\d+)\s+p50=(\d+)\s+p95=(\d+)\s+max=(\d+)\s+limit=(\d+)\s+truncated=([\d.]+)%/i);
    if (length) {
      result.length = {
        sampled: Number(length[1]),
        p50: Number(length[2]),
        p95: Number(length[3]),
        max_observed: Number(length[4]),
        max_length: Number(length[5]),
        truncated_ratio: Number(length[6]) / 100,
      };
    }
    const mask = line.match(/\[SFT Mask\]\s+(\d+)\/(\d+)\s+mẫu mask.*?supervised\s+([\d.]+)%/i);
    if (mask) {
      result.mask = {
        matched: Number(mask[1]),
        checked: Number(mask[2]),
        supervised_ratio: Number(mask[3]) / 100,
      };
    }
    const trainCount = line.match(/n_train=(\d+)/i);
    if (trainCount) result.trainSamples = Number(trainCount[1]);
  }
  return result;
}

export function buildTrainSummary(history: any, _options: { gpuRateUsdPerHour?: number } = {}) {
  const effective = history?.effectiveConfig || history?.effective_config || {};
  const dataset = effective?.dataset || {};
  const report = effective?.data_report || {};
  const allLogs = history?.trainLogs || history?.logs;
  const logEvidence = parseLogEvidence(allLogs);
  const trainFilter = {
    ...logEvidence.trainFilter,
    ...(report?.train_filter || {}),
    reasons: { ...logEvidence.trainFilter.reasons, ...(report?.train_filter?.reasons || {}) },
  };
  const validationFilter = {
    ...logEvidence.validationFilter,
    ...(report?.validation_filter || {}),
    reasons: { ...logEvidence.validationFilter.reasons, ...(report?.validation_filter?.reasons || {}) },
  };
  const length = { ...logEvidence.length, ...(report?.length || {}) };
  const mask = { ...logEvidence.mask, ...(report?.mask_preflight || effective?.mask_preflight || {}) };
  const parsedLogs = parseLogPoints(allLogs);
  const trainPoints = validPoints(history?.lossHistory).length > 0
    ? validPoints(history.lossHistory)
    : parsedLogs.train;
  const evalPoints = validPoints(history?.evalLossHistory).length > 0
    ? validPoints(history.evalLossHistory)
    : parsedLogs.eval;

  const finalMetrics = history?.finalMetrics || {};
  const modelName = String(effective?.model_name || history?.baseModel || 'unknown model');
  const initialTrain = trainPoints[0]?.loss;
  const positive = (value: unknown) => {
    const number = finite(value);
    return number !== undefined && number > 0 ? number : undefined;
  };
  const finalTrain = trainPoints.at(-1)?.loss ?? positive(finalMetrics.loss);
  const initialEval = evalPoints[0]?.loss;
  const finalEval = evalPoints.at(-1)?.loss ?? positive(finalMetrics.eval_loss);
  const bestEval = evalPoints.length > 0 ? Math.min(...evalPoints.map((p) => p.loss as number)) : finalEval;
  const trainImprovement = percent(initialTrain, finalTrain);
  const evalImprovement = percent(initialEval, finalEval);
  const evalDelta = initialEval !== undefined && finalEval !== undefined ? finalEval - initialEval : null;
  const gap = finalTrain !== undefined && finalEval !== undefined ? finalEval - finalTrain : null;

  const totalRecords = finite(trainFilter.total) ?? finite(dataset.train_samples) ?? finite(history?.totalRecords);
  const keptRecords = finite(trainFilter.kept) ?? finite(dataset.train_samples);
  const droppedRecords = finite(trainFilter.dropped) ?? (totalRecords !== undefined && keptRecords !== undefined ? totalRecords - keptRecords : undefined);
  const droppedRatio = totalRecords && droppedRecords !== undefined ? droppedRecords / totalRecords : 0;
  const truncatedRatio = finite(length.truncated_ratio) ?? 0;
  const supervisedRatio = finite(mask.supervised_ratio);
  const duplicateCount = finite(trainFilter.reasons?.duplicate) ?? 0;
  const missingAssistant = finite(trainFilter.reasons?.missing_assistant) ?? 0;

  const status = String(history?.status || 'UNKNOWN').toUpperCase();
  const errorMessage = String(
    history?.error || history?.lastError || history?.technicalError || history?.technical_error || '',
  ).trim();
  const noLossEvidence = trainPoints.length === 0 && evalPoints.length === 0
    && finalTrain === undefined && finalEval === undefined;
  const failed = ['ERROR', 'FAILED'].includes(status) || (noLossEvidence && status === 'COMPLETED');

  const overfitRisk = failed
    ? 'not_evaluable'
    : evalDelta !== null && evalDelta > 0.05 && (trainImprovement ?? 0) > 5
    ? 'high'
    : gap !== null && gap > 0.8
      ? 'medium'
      : evalImprovement !== null && evalImprovement > 0
        ? 'low'
        : 'unknown';
  const convergence = failed
    ? 'failed_before_training'
    : trainImprovement !== null && trainImprovement > 10
    ? (evalImprovement === null || evalImprovement >= -2 ? 'improving' : 'train_only')
    : trainPoints.length < 2 ? 'insufficient_evidence' : 'flat_or_unstable';

  const warnings: string[] = [];
  const recommendations: string[] = [];
  if (failed) {
    warnings.push(
      `Fine-tune thất bại trước khi tạo ra model: ${errorMessage || 'worker không hoàn tất quá trình train.'}`,
    );
    recommendations.push(
      'Sửa lỗi runtime rồi chạy lại hoặc Resume từ persistent checkpoint; chưa được đánh giá chất lượng model.',
    );
  }
  if (droppedRatio > 0.1) warnings.push(`Data quality đã loại ${(droppedRatio * 100).toFixed(1)}% mẫu.`);
  if (duplicateCount > 0) warnings.push(`Có ${duplicateCount} mẫu trùng đã bị loại.`);
  if (missingAssistant > 0) warnings.push(`Có ${missingAssistant} mẫu thiếu câu trả lời assistant.`);
  if (truncatedRatio > 0.2) warnings.push(`Khoảng ${(truncatedRatio * 100).toFixed(1)}% mẫu bị cắt theo max_length.`);
  if (supervisedRatio !== undefined && supervisedRatio < 0.1) warnings.push('Tỉ lệ token assistant được supervise thấp; cần kiểm tra chat template/mask.');
  if (!failed) {
    if (overfitRisk === 'high') recommendations.push('Giảm epochs hoặc learning rate, tăng validation và dùng early stopping.');
    if (convergence === 'improving' && overfitRisk !== 'high') recommendations.push('Có thể giữ cấu hình hiện tại; xác nhận thêm bằng bộ test chưa thấy trong train.');
    if (trainPoints.length < 3 || evalPoints.length < 2) recommendations.push('Cần thêm điểm train/eval hoặc chạy nhiều epoch hơn để kết luận chắc chắn.');
    if (truncatedRatio > 0.2) recommendations.push('Tăng modelMaxLength hoặc rút gọn system prompt/dữ liệu dài.');
    if (supervisedRatio !== undefined && supervisedRatio < 0.1) recommendations.push('Kiểm tra assistant header của tokenizer trước khi train tiếp.');
  }

  let score = failed ? 0 : 50;
  if ((trainImprovement ?? 0) > 10) score += 15;
  if ((trainImprovement ?? 0) > 30) score += 8;
  if ((evalImprovement ?? 0) > 5) score += 18;
  if (overfitRisk === 'low') score += 7;
  if (overfitRisk === 'medium') score -= 8;
  if (overfitRisk === 'high') score -= 25;
  if (droppedRatio > 0.1) score -= 8;
  if (truncatedRatio > 0.2) score -= 12;
  if (supervisedRatio !== undefined && supervisedRatio < 0.1) score -= 15;
  if (status === 'COMPLETED' && !failed) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = failed ? 'needs_attention' : score >= 75 ? 'good' : score >= 55 ? 'acceptable' : 'needs_attention';
  const trainSamples = dataset.train_samples ?? logEvidence.trainSamples ?? null;
  const evalSamples = dataset.eval_samples
    ?? validationFilter.kept
    ?? (totalRecords !== undefined && trainSamples !== null && totalRecords > trainSamples ? totalRecords - trainSamples : null);

  const headline = failed
    ? 'Fine-tune đã thất bại; chưa có model fine-tune thành công để đánh giá.'
    : verdict === 'good'
    ? 'Kết quả train đang tốt và chưa thấy dấu hiệu overfit mạnh.'
    : verdict === 'acceptable'
      ? 'Train có tiến bộ nhưng cần kiểm tra thêm trước khi đưa vào production.'
      : 'Chưa nên kết luận train tốt; cần xử lý các cảnh báo dữ liệu/cấu hình trước.';

  return {
    version: TRAIN_SUMMARY_VERSION,
    source: 'rules',
    generated_at: new Date().toISOString(),
    verdict,
    score,
    headline,
    training_analysis: {
      status: history?.status || 'UNKNOWN',
      model: modelName,
      failed,
      failure_reason: failed ? (errorMessage || null) : null,
      train_points: trainPoints.length,
      eval_points: evalPoints.length,
      initial_train_loss: round(initialTrain),
      final_train_loss: round(finalTrain),
      train_improvement_pct: trainImprovement,
      initial_eval_loss: round(initialEval),
      final_eval_loss: round(finalEval),
      best_eval_loss: round(bestEval),
      eval_improvement_pct: evalImprovement,
      train_eval_gap: round(gap),
      convergence,
      overfit_risk: overfitRisk,
    },
    data_analysis: {
      total_records: totalRecords ?? null,
      kept_records: keptRecords ?? null,
      dropped_records: droppedRecords ?? null,
      dropped_ratio: round(droppedRatio * 100, 1),
      duplicate_records: duplicateCount,
      missing_assistant_records: missingAssistant,
      train_samples: trainSamples,
      eval_samples: evalSamples,
      length_p50: length.p50 ?? null,
      length_p95: length.p95 ?? null,
      max_length: length.max_length ?? effective.max_length ?? null,
      truncated_ratio: round(truncatedRatio * 100, 1),
      supervised_ratio: supervisedRatio !== undefined ? round(supervisedRatio * 100, 1) : null,
    },
    warnings,
    recommendations,
  };
}

export function buildTrainSummaryPrompt(summary: any, history: any): string {
  const evidence = {
    summary,
    recent_logs: Array.isArray(history?.trainLogs) ? history.trainLogs.slice(-25) : [],
    requested_parameters: history?.parameters || {},
  };
  return [
    'Bạn là chuyên gia MLOps. Hãy đánh giá kết quả fine-tune dựa trên bằng chứng JSON dưới đây.',
    'Không được bịa số liệu. Nếu thiếu dữ liệu, nói rõ là chưa đủ bằng chứng.',
    'Trả về JSON hợp lệ với các key: verdict, headline, analysis, data_findings, training_findings, recommendations, model_recommendation.',
    'verdict chỉ nhận good, acceptable hoặc needs_attention. Các danh sách phải là mảng chuỗi.',
    'Nếu job đã ERROR/FAILED hoặc không có loss hợp lệ, phải kết luận train thất bại và không được đề xuất model mới.',
    'Chỉ bạn (AI) được đưa ra model_recommendation khi đủ bằng chứng và người dùng có yêu cầu. Backend không áp dụng rule cứng để tự chọn model. Nếu thiếu đơn giá GPU, không bịa chi phí; hãy ghi rõ cần đơn giá để tính.',
    JSON.stringify(evidence, null, 2),
  ].join('\n\n');
}

export function parseAiTrainSummary(raw: string): Record<string, any> | null {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const list = (value: unknown) => Array.isArray(value) ? value.map(String).slice(0, 12) : [];
    return {
      verdict: ['good', 'acceptable', 'needs_attention'].includes(String(parsed.verdict)) ? parsed.verdict : undefined,
      headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 1000) : undefined,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis.slice(0, 4000) : undefined,
      data_findings: list(parsed.data_findings),
      training_findings: list(parsed.training_findings),
      recommendations: list(parsed.recommendations),
      model_recommendation: parsed.model_recommendation && typeof parsed.model_recommendation === 'object'
        ? parsed.model_recommendation
        : undefined,
    };
  } catch {
    return null;
  }
}
