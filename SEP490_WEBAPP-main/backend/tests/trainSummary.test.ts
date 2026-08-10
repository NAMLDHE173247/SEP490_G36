import { describe, expect, it } from 'vitest';
import { buildTrainSummary, parseAiTrainSummary } from '../src/utils/trainSummary';

describe('train summary', () => {
  it('marks a converging run as good without a hard-coded model choice', () => {
    const summary = buildTrainSummary({
      status: 'COMPLETED',
      baseModel: 'unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit',
      totalRecords: 322,
      lossHistory: [{ loss: 2.8, step: 1 }, { loss: 2.0, step: 4 }],
      evalLossHistory: [{ loss: 2.4, step: 2 }, { loss: 1.7, step: 4 }],
      effectiveConfig: {
        dataset: { train_samples: 289, eval_samples: 33 },
        data_report: {
          train_filter: { total: 322, kept: 322, dropped: 0, reasons: {} },
          length: { truncated_ratio: 0, p50: 321, p95: 343 },
          mask_preflight: { supervised_ratio: 0.164 },
        },
      },
    });

    expect(summary.verdict).toBe('good');
    expect(summary.training_analysis.final_eval_loss).toBe(1.7);
    expect((summary as any).cost_recommendation).toBeUndefined();
  });

  it('flags overfitting and truncation', () => {
    const summary = buildTrainSummary({
      status: 'COMPLETED',
      baseModel: 'Qwen/Qwen2.5-7B-Instruct',
      lossHistory: [{ loss: 3.0, step: 1 }, { loss: 1.0, step: 10 }],
      evalLossHistory: [{ loss: 2.0, step: 2 }, { loss: 2.4, step: 10 }],
      effectiveConfig: {
        data_report: {
          train_filter: { total: 100, kept: 80, dropped: 20, reasons: { duplicate: 20 } },
          length: { truncated_ratio: 0.35 },
          mask_preflight: { supervised_ratio: 0.06 },
        },
      },
    });

    expect(summary.training_analysis.overfit_risk).toBe('high');
    expect(summary.warnings.length).toBeGreaterThanOrEqual(3);
    expect(summary.verdict).toBe('needs_attention');
  });

  it('parses a fenced JSON response from the optional AI provider', () => {
    const parsed = parseAiTrainSummary('```json\n{"verdict":"good","headline":"Ổn","recommendations":["Giữ cấu hình"]}\n```');
    expect(parsed?.verdict).toBe('good');
    expect(parsed?.recommendations).toEqual(['Giữ cấu hình']);
  });

  it('marks a runtime failure as failed and does not invent loss or model advice', () => {
    const summary = buildTrainSummary({
      status: 'ERROR',
      error: "TorchaoLoraLinear.__init__() missing 1 required keyword-only argument: 'get_apply_tensor_subclass'",
      totalRecords: 400,
      finalMetrics: { loss: 0, eval_loss: 0 },
      effectiveConfig: {
        data_report: {
          train_filter: { total: 400, kept: 399, dropped: 1, reasons: { duplicate: 1 } },
        },
      },
    });

    expect(summary.verdict).toBe('needs_attention');
    expect(summary.training_analysis.failed).toBe(true);
    expect(summary.training_analysis.final_train_loss).toBeNull();
    expect(summary.training_analysis.final_eval_loss).toBeNull();
    expect(summary.warnings[0]).toContain('TorchaoLoraLinear');
    expect((summary as any).cost_recommendation).toBeUndefined();
  });
});
