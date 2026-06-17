import mongoose from 'mongoose';
import { MultiModelEvaluationJob } from '../../../models/MultiModelEvaluationJob';
import { MultiModelEvaluationResult, ILlmScorecard } from '../../../models/MultiModelEvaluationResult';
import { ProcessedDatasetItem } from '../../../models/ProcessedDatasetItem';
import { ConversationRewriteHistory } from '../../../models/ConversationRewriteHistory';
import { DatasetVersion } from '../../../models/DatasetVersion';
import { GeminiProvider } from '../../../services/providers/GeminiProvider';
import { OpenAIProvider } from '../../../services/providers/OpenAIProvider';
import { DeepseekProvider } from '../../../services/providers/DeepseekProvider';
import { MULTI_MODEL_JUDGE_SYSTEM_PROMPT, REFINEMENT_SYSTEM_PROMPT } from '../../../constants/prompts';
import { QualityService } from './quality.service';

export class MultiEvalService {
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private getProvider(modelName: string) {
    const name = String(modelName).toLowerCase();
    if (name === 'openai') {
      return new OpenAIProvider();
    }
    if (name === 'deepseek') {
      return new DeepseekProvider();
    }
    return new GeminiProvider();
  }

  async runJob(
    versionId: string,
    startedBy: string,
    models: ('gemini' | 'openai' | 'deepseek')[],
    contextWindow: 'No Context' | 'n - 1' | 'n - 2 to n' | 'n - 1 to n + 1' | 'n - 2 to n + 2'
  ) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Dataset version ID không hợp lệ.'), { statusCode: 400 });
    }

    const version = await DatasetVersion.findById(versionId).lean();
    if (!version) {
      throw Object.assign(new Error('Không tìm thấy dataset version.'), { statusCode: 404 });
    }

    // Find all samples in the version
    const samples = await ProcessedDatasetItem.find({ datasetVersionId: version._id }).lean();
    if (!samples.length) {
      throw Object.assign(new Error('Dataset version không có mẫu dữ liệu nào để đánh giá.'), { statusCode: 400 });
    }

    // Create the background job
    const job = await MultiModelEvaluationJob.create({
      datasetVersionId: version._id,
      models,
      contextWindow,
      status: 'running',
      progress: {
        total: samples.length,
        evaluated: 0,
        processing: 0,
        failed: 0,
        conflictCount: 0,
      },
      startedBy: new mongoose.Types.ObjectId(startedBy),
    });

    // Start background execution
    this.executeJobInBackground(job.id, versionId, models, contextWindow);

    return job;
  }

  private async executeJobInBackground(
    jobId: string,
    versionId: string,
    models: string[],
    contextWindowSetting: string
  ) {
    try {
      const job = await MultiModelEvaluationJob.findById(jobId);
      if (!job) return;

      const samples = await ProcessedDatasetItem.find({ datasetVersionId: versionId }).sort({ createdAt: 1 }).lean();
      
      // Clean up any old evaluation results for the same version before saving new ones
      await MultiModelEvaluationResult.deleteMany({ datasetVersionId: versionId });

      let evaluatedCount = 0;
      let failedCount = 0;
      let conflictCount = 0;

      const qualityService = new QualityService();
      const qualityResult = await qualityService.classify(
        job.datasetVersionId.toString(),
        job.startedBy ? job.startedBy.toString() : ''
      );
      const toTenPointBaseline = (item: any): number | null => {
        if (Number.isFinite(Number(item?.humanScore))) {
          return Number(item.humanScore);
        }
        if (!item || item.bucket === 'Incomplete' || Number(item.scorableTurns || 0) <= 0) return null;
        const raw = Number(item.score);
        if (!Number.isFinite(raw)) return null;
        if (raw >= -1 && raw <= 1) {
          return Math.round(((raw + 1) / 2) * 100) / 10;
        }
        return Math.max(0, Math.min(10, raw));
      };
      const humanScoresMap = new Map<string, number>();
      const failedTargetMap = new Map<string, number[]>();
      qualityResult.items.forEach((i: any) => {
        const baseline = toTenPointBaseline(i);
        if (baseline != null) {
          humanScoresMap.set(String(i._id), baseline);
          humanScoresMap.set(String(i.sampleId), baseline);
        }
        const failedTargets = Array.isArray(i.turnPairs)
          ? i.turnPairs
            .filter((pair: any) => pair && (pair.matched === false || (Array.isArray(pair.intentScores) && pair.intentScores.some((score: any) => Array.isArray(score.harmfulActions) && score.harmfulActions.length > 0))))
            .map((pair: any) => Number(pair.assistantMessageIndex))
            .filter((idx: number) => Number.isInteger(idx) && idx >= 0)
          : [];
        if (failedTargets.length) {
          const uniqueTargets = Array.from(new Set<number>(failedTargets));
          failedTargetMap.set(String(i._id), uniqueTargets);
          failedTargetMap.set(String(i.sampleId), uniqueTargets);
        }
      });

      for (const sample of samples) {
        // Mark sample as processing in job progress
        job.progress.processing = 1;
        await job.save();

        // 1. Identify which message index to evaluate.
        const rewriteHistories = await ConversationRewriteHistory.find({
          datasetVersionId: versionId,
          sampleId: sample._id,
        }).lean();

        let targetMessageIndices: number[] = [];
        if (rewriteHistories.length > 0) {
          targetMessageIndices = rewriteHistories.map((h) => h.messageIndex);
        } else if (failedTargetMap.has(String(sample._id)) || failedTargetMap.has(String((sample as any).sampleId))) {
          targetMessageIndices = failedTargetMap.get(String(sample._id)) || failedTargetMap.get(String((sample as any).sampleId)) || [];
        } else {
          // Default to the last assistant message in the conversation
          const messages = (sample.data as any)?.messages;
          if (Array.isArray(messages)) {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]?.role === 'assistant') {
                targetMessageIndices.push(i);
                break;
              }
            }
          }
        }

        // If no assistant message found, skip or mark as failed
        if (targetMessageIndices.length === 0) {
          failedCount += 1;
          job.progress.failed = failedCount;
          job.progress.evaluated = evaluatedCount + failedCount;
          await job.save();
          continue;
        }

        const uniqueTargetMessageIndices = Array.from(new Set(targetMessageIndices));
        if (uniqueTargetMessageIndices.length > 1) {
          job.progress.total += uniqueTargetMessageIndices.length - 1;
          await job.save();
        }
        const messages = (sample.data as any)?.messages || [];
        for (const targetIdx of uniqueTargetMessageIndices) {
        
        // 2. Extract Context Window
        let start = 0;
        let end = messages.length - 1;

        if (contextWindowSetting === 'No Context') {
          start = targetIdx;
          end = targetIdx;
        } else if (contextWindowSetting === 'n - 1') {
          start = Math.max(0, targetIdx - 1);
          end = targetIdx;
        } else if (contextWindowSetting === 'n - 2 to n') {
          start = Math.max(0, targetIdx - 2);
          end = targetIdx;
        } else if (contextWindowSetting === 'n - 1 to n + 1') {
          start = Math.max(0, targetIdx - 1);
          end = Math.min(messages.length - 1, targetIdx + 1);
        } else if (contextWindowSetting === 'n - 2 to n + 2') {
          start = Math.max(0, targetIdx - 2);
          end = Math.min(messages.length - 1, targetIdx + 2);
        }

        const contextWindow = messages.slice(start, end + 1).map((m: any, mIdx: number) => ({
          role: m.role,
          content: String(m.content || ''),
          isTarget: (start + mIdx) === targetIdx,
        }));

        // 3. Evaluate with each selected model in parallel
        const modelNames = models;
        const evaluationPromises = modelNames.map(async (modelName) => {
          try {
            const provider = this.getProvider(modelName);
            const inputData = {
              contextWindow,
              originalMessageIndex: targetIdx,
            };

            const prompt = MULTI_MODEL_JUDGE_SYSTEM_PROMPT.replace('${sampleJson}', JSON.stringify(inputData, null, 2));
            const systemPrompt = "You are a strict educational quality assurance assistant. You must return ONLY a raw, valid JSON object matching the requested schema. Do NOT wrap the JSON in markdown formatting. Do NOT include any explanations, greetings, or conversational text. Just the raw JSON object starting with { and ending with }.";
            const rawResponse = await this.withTimeout(
              provider.generateContent(prompt, undefined, systemPrompt),
              45000,
              `${modelName} evaluation`
            );

            const firstBracket = rawResponse.indexOf('{');
            const lastBracket = rawResponse.lastIndexOf('}');
            const jsonString = (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket)
              ? rawResponse.substring(firstBracket, lastBracket + 1)
              : rawResponse;

            let parsed: any;
            try {
              parsed = JSON.parse(jsonString);
            } catch (err) {
              console.error(`[MultiEval] JSON parse error for model ${modelName}:`, err);
              parsed = {};
            }

            const scorecard: ILlmScorecard = {
              socratic: parsed.socratic !== undefined ? Number(parsed.socratic) : null,
              encouragement: parsed.encouragement !== undefined ? Number(parsed.encouragement) : null,
              factuality: parsed.factuality !== undefined ? Number(parsed.factuality) : null,
              languageQuality: parsed.languageQuality !== undefined ? Number(parsed.languageQuality) : null,
              consistency: parsed.consistency !== undefined ? Number(parsed.consistency) : null,
              completeness: parsed.completeness !== undefined ? Number(parsed.completeness) : null,
              readiness: parsed.readiness !== undefined ? Number(parsed.readiness) : null,
              overall: parsed.overall !== undefined ? Number(parsed.overall) : 0,
              reason: String(parsed.reason || 'Không nhận diện được nhận xét.'),
              recommendation: ['Pass', 'Need Rewrite', 'Reject'].includes(parsed.recommendation)
                ? parsed.recommendation
                : 'Need Rewrite',
            };

            // Force overall recalculation if model output overall is weird/missing
            if (!scorecard.overall || isNaN(scorecard.overall)) {
              const scores = [
                scorecard.socratic,
                scorecard.encouragement,
                scorecard.factuality,
                scorecard.languageQuality,
                scorecard.consistency,
                scorecard.completeness,
                scorecard.readiness,
              ].filter((v) => typeof v === 'number' && v !== null) as number[];
              
              scorecard.overall = scores.length > 0 
                ? Math.round((scores.reduce((s, c) => s + c, 0) / scores.length) * 10) / 10
                : 5;
            }

            return { modelName, scorecard };
          } catch (err: any) {
            console.error(`[MultiEval] Model ${modelName} call failed:`, err.message);
            return {
              modelName,
              scorecard: {
                socratic: null,
                encouragement: null,
                factuality: null,
                languageQuality: null,
                consistency: null,
                completeness: null,
                readiness: null,
                overall: 5,
                reason: `Lỗi API khi gọi model ${modelName}: ${err.message}`,
                recommendation: 'Need Rewrite' as const,
              }
            };
          }
        });

        const evaluationResults = await Promise.all(evaluationPromises);
        const modelScores: Record<string, ILlmScorecard> = {};
        evaluationResults.forEach((res) => {
          modelScores[res.modelName] = res.scorecard;
        });

        // 4. Calculate overall statistics, conflict status & auto-select the best model
        const scores = Object.values(modelScores);
        const averageOverall = scores.length > 0
          ? Math.round((scores.reduce((sum, s) => sum + s.overall, 0) / scores.length) * 10) / 10
          : 0;

        // Auto-select best model scorecard using a consensus/reliability metric
        let bestModelSelected = '';
        let bestModelScorecard: ILlmScorecard | null = null;
        let maxReliability = -Infinity;

        for (const [modelName, scorecard] of Object.entries(modelScores)) {
          const metricsCount = [
            scorecard.socratic,
            scorecard.encouragement,
            scorecard.factuality,
            scorecard.languageQuality,
            scorecard.consistency,
            scorecard.completeness,
            scorecard.readiness
          ].filter(v => v !== null && v !== undefined).length;

          const reasonLength = scorecard.reason ? scorecard.reason.length : 0;
          const diffFromAvg = Math.abs(scorecard.overall - averageOverall);

          // Reliability score formula
          const reliability = (metricsCount * 2) + (Math.min(reasonLength, 300) / 100) - (diffFromAvg * 3);

          if (reliability > maxReliability) {
            maxReliability = reliability;
            bestModelSelected = modelName;
            bestModelScorecard = scorecard;
          }
        }

        // Detect Conflict
        const humanScore = humanScoresMap.get(String(sample._id)) ?? null;
        const hasConflict = this.detectConflict(modelScores, humanScore);
        if (hasConflict) {
          conflictCount += 1;
        }

        // Resolve Final Recommendation proposal
        let finalRecommendation: 'Pass' | 'Need Rewrite' | 'Reject' = 'Pass';
        const recs = scores.map((s) => s.recommendation);
        if (recs.includes('Reject')) {
          finalRecommendation = 'Reject';
        } else if (recs.includes('Need Rewrite')) {
          finalRecommendation = 'Need Rewrite';
        }

        let autoRefined = false;

        // Auto Rewrite Logic
        if (finalRecommendation === 'Need Rewrite' && bestModelSelected && bestModelScorecard?.reason) {
          try {
            const refineProvider = this.getProvider(bestModelSelected);
            const assistantString = contextWindow.map((m: any) => `[${m.role.toUpperCase()}${m.isTarget ? ' (TARGET)' : ''}]: ${m.content}`).join('\n\n');
            const payload = [{
              index: 0,
              assistant: assistantString,
              reason: bestModelScorecard.reason
            }];

            const prompt = REFINEMENT_SYSTEM_PROMPT.replace('${samplesJson}', JSON.stringify(payload, null, 2));
            const systemPrompt = "You are a strict text refinement assistant. You must return ONLY a raw, valid JSON array containing the refined output items. Do NOT wrap the JSON in markdown formatting. Do NOT include any explanations, greetings, or conversational text.";
            const rawResponse = await this.withTimeout(
              refineProvider.generateContent(prompt, undefined, systemPrompt),
              45000,
              `${bestModelSelected} rewrite refinement`
            );
            
            const firstBracket = rawResponse.indexOf('[');
            const lastBracket = rawResponse.lastIndexOf(']');
            const jsonString = (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket)
              ? rawResponse.substring(firstBracket, lastBracket + 1)
              : rawResponse;

            const parsed = JSON.parse(jsonString);
            const refinedOutput = parsed[0]?.refinedOutput;
            
            if (typeof refinedOutput === 'string' && refinedOutput.trim()) {
              if (Array.isArray(messages)) {
                let finalCleanOutput = refinedOutput.replace(/^\[ASSISTANT.*?\]:\s*/i, '').trim();

                await ConversationRewriteHistory.create({
                  datasetVersionId: new mongoose.Types.ObjectId(versionId),
                  sampleId: sample._id,
                  messageIndex: targetIdx,
                  originalText: messages[targetIdx].content,
                  proposedText: finalCleanOutput,
                  approvedText: '',
                  editReason: 'AI rewrite proposal by ' + bestModelSelected + ': ' + bestModelScorecard.reason,
                  editorId: job.startedBy,
                  editType: 'ai',
                  createdAt: new Date()
                });
                
                autoRefined = true;
                job.progress.refinedCount = (job.progress.refinedCount || 0) + 1;
              }
            }
          } catch (err: any) {
            console.error(`[MultiEvalJob] Auto-refine failed for sample ${sample._id}:`, err.message);
          }
        }

        // Save evaluation scorecard result
        await MultiModelEvaluationResult.create({
          jobId: job._id,
          datasetVersionId: new mongoose.Types.ObjectId(versionId),
          sampleId: sample._id,
          modelScores,
          averageOverall,
          humanScore,
          finalRecommendation,
          hasConflict,
          bestModelSelected,
          bestModelScorecard: bestModelScorecard || undefined,
          autoRefined,
          targetIdx,
          contextSize: contextWindow.length,
        });

        evaluatedCount += 1;
        job.progress.evaluated = evaluatedCount + failedCount;
        job.progress.conflictCount = conflictCount;
        await job.save();

        // Pause briefly to manage API rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      job.status = 'completed';
      job.progress.processing = 0;
      await job.save();
    } catch (error: any) {
      console.error(`[MultiEvalJob] Async execution failed:`, error);
      await MultiModelEvaluationJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        'progress.processing': 0,
      });
    }
  }

  private detectConflict(scorecards: Record<string, ILlmScorecard>, humanScore: number | null = null): boolean {
    const models = Object.keys(scorecards);
    if (models.length <= 1 && humanScore === null) return false;

    let hasPass = false;
    let hasReject = false;
    const overallScores: number[] = [];

    for (const m of models) {
      const card = scorecards[m];
      if (card.recommendation === 'Pass') hasPass = true;
      if (card.recommendation === 'Reject') hasReject = true;
      if (typeof card.overall === 'number' && !isNaN(card.overall)) {
        overallScores.push(card.overall);
      }
    }

    // Conflict 1: Disagreement between Pass and Reject
    if (hasPass && hasReject) {
      return true;
    }

    // Conflict 2: Score difference between any two models exceeds 1.5
    if (overallScores.length > 1) {
      const maxScore = Math.max(...overallScores);
      const minScore = Math.min(...overallScores);
      if (maxScore - minScore > 1.5) {
        return true;
      }
    }

    // Conflict 3: Difference between Avg AI and Human score >= 2.0
    if (overallScores.length > 0 && humanScore !== null && humanScore >= 0) {
      const avgAI = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;
      if (Math.abs(avgAI - humanScore) >= 2.0) {
        return true;
      }
    }

    return false;
  }

  async getJobStatus(jobId: string) {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw Object.assign(new Error('Job ID không hợp lệ.'), { statusCode: 400 });
    }
    const job = await MultiModelEvaluationJob.findById(jobId).lean();
    if (!job) {
      throw Object.assign(new Error('Không tìm thấy Job.'), { statusCode: 404 });
    }
    return job;
  }

  async getLatestJob(versionId: string) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) {
      throw Object.assign(new Error('Dataset version ID không hợp lệ.'), { statusCode: 400 });
    }
    return MultiModelEvaluationJob.findOne({ datasetVersionId: versionId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getResults(
    versionId: string,
    filters: {
      scoreMin?: number;
      scoreMax?: number;
      conflictOnly?: boolean;
      recommendation?: 'Pass' | 'Need Rewrite' | 'Reject';
      subject?: string;
    } = {}
  ) {
    const query: any = { datasetVersionId: new mongoose.Types.ObjectId(versionId) };

    if (filters.conflictOnly) {
      query.hasConflict = true;
    }

    if (filters.recommendation) {
      query.finalRecommendation = filters.recommendation;
    }

    if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
      query.averageOverall = {};
      if (filters.scoreMin !== undefined) {
        query.averageOverall.$gte = Number(filters.scoreMin);
      }
      if (filters.scoreMax !== undefined) {
        query.averageOverall.$lte = Number(filters.scoreMax);
      }
    }

    // Retrieve scorecards and populate conversation details
    const results = await MultiModelEvaluationResult.find(query)
      .populate('sampleId')
      .sort({ averageOverall: 1 }) // Show lowest scoring items first
      .lean();

    const qualityService = new QualityService();
    const qualityResult = await qualityService.classify(versionId, '');
    const qualityBySampleId = new Map<string, any>();
    qualityResult.items.forEach((item: any) => {
      qualityBySampleId.set(String(item._id), item);
      qualityBySampleId.set(String(item.sampleId), item);
    });

    const sampleIds = results.map(r => r.sampleId?._id).filter(Boolean);
    const rewriteHistories = await ConversationRewriteHistory.find({ sampleId: { $in: sampleIds } }).lean();
    const historyMap = new Map();
    rewriteHistories.forEach(h => historyMap.set(String(h.sampleId), h));

    // Map and filter by subject if required
    let mappedResults = results.map((r: any) => {
      const sample = r.sampleId;
      const qualityItem = qualityBySampleId.get(String(sample?._id)) || qualityBySampleId.get(String(sample?.sampleId));
      const qualityHasHumanScore = qualityItem && qualityItem.bucket !== 'Incomplete' && Number(qualityItem.scorableTurns || 0) > 0;
      const humanScore = qualityHasHumanScore && Number.isFinite(Number(qualityItem?.humanScore))
        ? Number(qualityItem.humanScore)
        : qualityHasHumanScore && Number.isFinite(Number((r as any).humanScore))
          ? Number((r as any).humanScore)
          : null;

      // Unified 0..10 final score:
      //  - staff + AI present  -> weighted blend (60% staff rule, 40% AI semantic)
      //  - only one present     -> use whichever exists (AI covers "Other"/unscorable samples)
      const avgAI = Number.isFinite(Number(r.averageOverall)) ? Number(r.averageOverall) : null;
      const combinedScore = (humanScore != null && avgAI != null)
        ? Math.round((0.6 * humanScore + 0.4 * avgAI) * 10) / 10
        : (humanScore ?? avgAI);
      const finalBucket = combinedScore == null
        ? 'Incomplete'
        : combinedScore >= 7 ? 'Gold' : combinedScore >= 5 ? 'Rewrite' : 'Reject';
      return {
        _id: r._id,
        jobId: r.jobId,
        datasetVersionId: r.datasetVersionId,
        sampleId: sample?._id,
        sampleData: sample?.data || {},
        subject: qualityItem?.data?.subject || sample?.data?.subject || sample?.data?.meta?.subject || 'Unknown',
        modelScores: r.modelScores,
        scores: { human: humanScore },
        humanScore,
        combinedScore,
        finalBucket,
        averageOverall: r.averageOverall,
        finalRecommendation: r.finalRecommendation,
        hasConflict: humanScore == null ? false : r.hasConflict,
        supervisorAction: r.supervisorAction,
        supervisorNote: r.supervisorNote,
        adjudicatedBy: r.adjudicatedBy,
        adjudicatedAt: r.adjudicatedAt,
        bestModelSelected: r.bestModelSelected,
        bestModelScorecard: r.bestModelScorecard,
        autoRefined: r.autoRefined,
        targetIdx: r.targetIdx,
        contextSize: r.contextSize,
        rewriteHistory: historyMap.get(String(sample?._id)) || null,
        turnPairs: qualityItem?.turnPairs || [],
        staffTargets: qualityItem?.staffTargets || [],
      };
    });

    if (filters.subject) {
      mappedResults = mappedResults.filter((r) => String(r.subject).toLowerCase() === String(filters.subject).toLowerCase());
    }

    return mappedResults;
  }

  async adjudicateResult(
    versionId: string,
    resultId: string,
    supervisorId: string,
    action: 'approve' | 'rewrite' | 'reevaluate' | 'reject',
    note?: string
  ) {
    if (!mongoose.Types.ObjectId.isValid(resultId)) {
      throw Object.assign(new Error('Result ID không hợp lệ.'), { statusCode: 400 });
    }

    const result = await MultiModelEvaluationResult.findOne({
      _id: new mongoose.Types.ObjectId(resultId),
      datasetVersionId: new mongoose.Types.ObjectId(versionId),
    });
    if (!result) {
      throw Object.assign(new Error('Không tìm thấy kết quả kiểm định chất lượng.'), { statusCode: 404 });
    }

    result.supervisorAction = action;
    result.supervisorNote = note || '';
    result.adjudicatedBy = new mongoose.Types.ObjectId(supervisorId);
    result.adjudicatedAt = new Date();

    await result.save();

    return result;
  }
}
