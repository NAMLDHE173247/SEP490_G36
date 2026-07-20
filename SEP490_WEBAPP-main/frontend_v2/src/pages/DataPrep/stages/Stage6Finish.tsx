import React, { useState, useEffect, useCallback } from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, AlertCircle, Calendar, Download, FileText, Sparkles, MessageSquare, ChevronLeft, ChevronRight, Play, DownloadCloud, FileJson, CheckCircle2, RotateCcw, Upload } from 'lucide-react';
import { useDataPrep, SUB_STEPS_STAGE6, PROMPT_VERSIONS } from '../DataPrepContext';
import { useStage4Data } from '../../../hooks/useStage4Data';
import { Tooltip, getPageNumbers } from '../utils';
import { apiService } from '../../../services/api';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './Stage6Finish.css';

const EVALUATION_PACK_STORAGE_KEY = 'hybrid_evaluation_pack_v1';
const ROUTER_INTENTS = new Set([
  'solve_problem', 'explain_concept', 'give_hint', 'check_answer',
  'diagnose_error', 'ask_follow_up', 'ask_clarification'
]);

const normalizeEvaluationSubject = (value: any): string => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['MATH', 'MATHEMATICS'].includes(normalized)) return 'MATH';
  if (['ENGLISH', 'EN'].includes(normalized)) return 'ENGLISH';
  if (['HISTORY', 'HIST'].includes(normalized)) return 'HISTORY';
  if (['PHYSICS', 'PHYSICAL'].includes(normalized)) return 'PHYSICS';
  if (['CHEMISTRY', 'CHEM'].includes(normalized)) return 'CHEMISTRY';
  if (['GENERAL', 'OTHER', 'UNGROUPED', 'OUT_OF_SCOPE'].includes(normalized)) return 'GENERAL';
  return normalized || 'GENERAL';
};

const toEvaluationMessages = (row: any): Array<{ role: string; content: string; labels?: string[] }> => {
  if (Array.isArray(row?.messages)) {
    return row.messages
      .filter((message: any) => message?.role && String(message.content || '').trim())
      .map((message: any) => ({
        role: String(message.role),
        content: String(message.content),
        ...(Array.isArray(message.labels) ? { labels: message.labels.map((label: any) => String(label)) } : {}),
      }));
  }
  if (Array.isArray(row?.conversations)) {
    return row.conversations
      .map((message: any) => ({
        role: message.from === 'human' ? 'user' : message.from === 'gpt' ? 'assistant' : String(message.from || ''),
        content: String(message.value || ''),
      }))
      .filter((message: any) => message.role && message.content.trim());
  }
  return [];
};

const collectEvaluationLabels = (row: any, messages: Array<{ labels?: string[] }>): string[] => {
  const sampleLabels = Array.isArray(row?.labels?.sample) ? row.labels.sample : [];
  const messageLabels = Array.isArray(row?.labels?.messages)
    ? row.labels.messages.flatMap((entry: any) => Array.isArray(entry?.labels) ? entry.labels : [])
    : [];
  return [...sampleLabels, ...messageLabels, ...messages.flatMap(message => message.labels || [])]
    .map(label => String(label).trim().toLowerCase().replace(/\s+/g, '_'));
};

const getEvaluationIntent = (row: any, messages: Array<{ labels?: string[] }>): string | undefined => {
  const candidates = [row?.gold_intent, row?.intent, ...collectEvaluationLabels(row, messages)];
  return candidates
    .map(value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_'))
    .find(value => ROUTER_INTENTS.has(value));
};

const needsEvaluationClarification = (question: string, row: any): boolean => {
  if (typeof row?.gold_need_clarification === 'boolean') return row.gold_need_clarification;
  const normalized = question.trim().toLowerCase();
  return normalized.length < 32 || /^(giúp em|giup em|help me|i don't understand|em không hiểu|em khong hieu|english grammar|bài này|bai nay|this lesson)/i.test(normalized);
};

const inferEvaluationLanguage = (text: string): 'vi' | 'en' => {
  return /[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(text) ? 'vi' : 'en';
};

export const Stage6Finish: React.FC = () => {
  const dataPrep = useDataPrep();
  const {
    currentSubStep6, setCurrentSubStep6,
    setCurrentStage,
    promptText, setPromptText,
    sampleQuestion, setSampleQuestion,
    selectedVersion, setSelectedVersion,
    promptName, setPromptName,
    promptDesc, setPromptDesc,
    trialResponse, setTrialResponse,
    exportPage, setExportPage,
    cloudProvider, setCloudProvider,
    conversationsList,
    projectName,
    sepQualityRatings,
    sepQualityLabels
  } = dataPrep;

  const activeVersionId = localStorage.getItem('current_version_id');
  const { results, qualityResult } = useStage4Data(activeVersionId);

  // Local States
  const [downloadFormat, setDownloadFormat] = useState('json');
  const [showConfirmPush, setShowConfirmPush] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const [promptVersions, setPromptVersions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [isRunningTrial, setIsRunningTrial] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 5;

  const [trialProvider, setTrialProvider] = useState<'openrouter' | 'deepseek'>('openrouter');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitResult, setSplitResult] = useState<any>(null);

  const [splitTestPercentage, setSplitTestPercentage] = useState(20);
  const [splitValPercentage, setSplitValPercentage] = useState(10);
  const [splitThreshold, setSplitThreshold] = useState(0.85);
  const [splitMaxAttempts, setSplitMaxAttempts] = useState(20);
  const [excludedSamples, setExcludedSamples] = useState<Set<string>>(new Set());
  const [conflictDetailIdx, setConflictDetailIdx] = useState<number | null>(null);

  // === Plan B: phân bổ theo môn ===
  const [splitBySubject, setSplitBySubject] = useState<Array<{
    subject: string; train: number; val: number; test: number; total: number;
  }>>([]);

  // Hugging Face states
  const [hfToken, setHfToken] = useState('');
  const [hfRepoId, setHfRepoId] = useState('');
  const [hfIsPrivate, setHfIsPrivate] = useState(false);

  // Fetch prompts from backend
  const fetchPrompts = useCallback(async () => {
    setIsLoadingVersions(true);
    try {
      const data = await apiService.getDatasetPrompts();
      if (data && data.prompts && data.prompts.length > 0) {
        const formatted = data.prompts.map((p: any) => ({
          id: p._id,
          name: p.name,
          desc: p.description || `Version ${p.version}`,
          date: new Date(p.createdAt || Date.now()).toLocaleDateString(),
          content: p.content
        }));
        setPromptVersions(formatted);
      } else {
        setPromptVersions([]);
      }
    } catch (error) {
      console.error('Failed to fetch system prompts:', error);
      setPromptVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const isStepCompleted = (num: number) => {
    if (num < currentSubStep6) return true;
    if (num === 12 && promptText && promptText.trim() !== '') return true;
    if (num === 13 && splitResult) return true;
    return false;
  };

  const handleSaveNewVersion = async () => {
    if (!promptText.trim()) {
      alert('Vui lòng nhập nội dung System Prompt');
      return;
    }
    if (!promptName.trim()) {
      alert('Vui lòng nhập tên phiên bản System Prompt');
      return;
    }
    setIsLoadingVersions(true);
    try {
      await apiService.createDatasetPrompt({
        name: promptName.trim(),
        content: promptText.trim(),
        description: promptDesc.trim() || 'New prompt version'
      });
      alert('Đã lưu phiên bản System Prompt thành công!');
      await fetchPrompts();
    } catch (error: any) {
      console.error('Lỗi khi lưu prompt version:', error);
      alert(error.response?.data?.error || error.message || 'Lưu phiên bản prompt thất bại.');
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleRunTrial = async () => {
    if (!promptText.trim()) {
      alert('Vui lòng soạn thảo System Prompt trước khi chạy thử.');
      return;
    }
    if (!sampleQuestion.trim()) {
      alert('Vui lòng nhập câu hỏi chạy thử.');
      return;
    }
    setIsRunningTrial(true);
    setTrialResponse('Đang gọi API chạy thử prompt...');
    try {
      let modelId = 'meta-llama/llama-3.1-8b-instruct:free';
      if (trialProvider === 'deepseek') modelId = 'deepseek-chat';

      const res = await apiService.infer({
        text_input: sampleQuestion,
        system_prompt: promptText,
        provider: trialProvider,
        hf_model_id: modelId
      });
      setTrialResponse(res.result || 'Không nhận được phản hồi từ AI.');
    } catch (error: any) {
      console.error('Run trial error:', error);
      setTrialResponse(`Có lỗi xảy ra: ${error.response?.data?.error || error.message || 'Lỗi không xác định'}`);
    } finally {
      setIsRunningTrial(false);
    }
  };

  const handleGenerateSplit = async () => {
    if (!conversationsList || conversationsList.length === 0) {
      alert('Không có dữ liệu hội thoại để thực hiện phân chia.');
      return;
    }
    setIsSplitting(true);
    try {
      // Use the canonical training export as the source of truth. The stage
      // conversation list may not contain subject_final, which would silently
      // turn every item into UNGROUPED/GENERAL during subject-stratified split.
      let splitSource: any[] = conversationsList;
      try {
        const labeledExport = await loadLabeledExportSource();
        if (Array.isArray(labeledExport) && labeledExport.length > 0) splitSource = labeledExport;
      } catch (exportError) {
        console.warn('[Split] Falling back to stage conversation list:', exportError);
      }

      const formattedData = splitSource.map((c: any) => ({
        conversation_id: c.conversation_id || c.id,
        subject:
          c.subject ||
          c.subjectLabelWithHuman ||
          c.subjectLabelWithAI ||
          c.subjectLabelDefault ||
          'UNGROUPED',
        messages: (c.messages || []).flatMap((m: any) => {
          if (m.role && typeof m.content === 'string') {
            return [{ role: m.role, content: m.content }];
          }
          if (m.user !== undefined || m.assistant !== undefined) {
            return [
              { role: 'user', content: m.user || '' },
              { role: 'assistant', content: m.assistant || '' }
            ];
          }
          return [];
        })
      }));

      const res = await apiService.safeSplit({
        data: formattedData,
        test_percentage: splitTestPercentage,
        validation_percentage: splitValPercentage,
        stratify_by_subject: true,
        threshold: splitThreshold,
        max_attempts: splitMaxAttempts,
        seed: 42
      });
      let apiResponse = res;
      if (Array.isArray(res)) {
        throw new Error('Safe Split API returned an unsupported response without verified train/test partitions.');
      } else if (res && typeof res === 'object' && res.train) {
        // It returned { train, test }. Let's ensure IDs are present
        const injectIds = (arr: any[]) => (arr || []).map(apiItem => {
          let id = apiItem.conversation_id || apiItem.id;
          if (!id && apiItem.messages && apiItem.messages.length > 0) {
            const firstContent = apiItem.messages[0].content || '';
            const match = splitSource.find((c: any) => {
              if (!c.messages || c.messages.length === 0) return false;
              const cFirstContent = c.messages[0].content || c.messages[0].user || '';
              return cFirstContent === firstContent;
            });
            if (match) id = match.conversation_id || match.id;
          }
          if (!id) throw new Error('Safe Split response contains an item without a traceable conversation ID.');
          return { ...apiItem, conversation_id: id };
        });

        apiResponse = {
          ...res,
          train: injectIds(res.train),
          val: injectIds(res.val || []),
          test: injectIds(res.test)
        };
      } else if (res && typeof res === 'object' && res.trainIndices) {
        // GPU Service returned { trainIndices, testIndices, conflictCount, ... }
        const injectIds = (arr: any[]) => (arr || []).map(apiItem => {
          let id = apiItem.conversation_id || apiItem.id;
          if (!id && apiItem.messages && apiItem.messages.length > 0) {
            const firstContent = apiItem.messages[0].content || apiItem.messages[0].user || '';
            const match = splitSource.find((c: any) => {
              if (!c.messages || c.messages.length === 0) return false;
              const cFirstContent = c.messages[0].content || c.messages[0].user || '';
              return cFirstContent === firstContent;
            });
            if (match) id = match.conversation_id || match.id;
          }
          if (!id) throw new Error('Safe Split response contains an item without a traceable conversation ID.');
          return { ...apiItem, conversation_id: id };
        });

        const trainData = res.trainIndices.map((idx: number) => splitSource[idx] || formattedData[idx]);
        const testData = res.testIndices.map((idx: number) => splitSource[idx] || formattedData[idx]);

        apiResponse = {
          ...res,
          train: injectIds(trainData),
          test: injectIds(testData),
          train_count: res.trainCount,
          test_count: res.testCount,
          conflicts: res.conflictCount,
          max_similarity: res.maxCrossSplitSimilarity,
          overlap_info: res.conflictsPreview
        };
      }

      // Validation phải được GPU Split Guard trả về; frontend không tự cắt
      // một đoạn từ train vì cách đó không kiểm tra leakage và không stratify.
      const trainData: any[] = apiResponse.train || [];
      const valData: any[] = apiResponse.val || [];
      const testData: any[] = apiResponse.test || [];
      if (valData.length === 0) {
        throw new Error('Safe Split API did not return a locked validation partition.');
      }

      setSplitResult({
        ...apiResponse,
        train: trainData,
        val: valData,
        train_count: trainData.length,
        val_count: valData.length,
        test_count: testData.length,
        attempts: apiResponse.attempts ?? 1,
        conflicts: apiResponse.conflicts ?? 0,
        max_similarity: apiResponse.max_similarity ?? "N/A"
      });

      // === Plan B: Tính phân bổ theo môn học ===
      const subjectMap = new Map<string, { train: number; val: number; test: number }>();
      const addToMap = (items: any[], partition: 'train' | 'val' | 'test') => {
        for (const item of items) {
          // subject có thể nằm trực tiếp trên item (từ conversationsList)
          const convMatch = conversationsList?.find(
            (c: any) => String(c.id || c.conversation_id) === String(item.conversation_id || item.id)
          );
          const subj: string =
            (convMatch as any)?.subject ||
            (convMatch as any)?.subjectLabelWithAI ||
            (convMatch as any)?.subjectLabelDefault ||
            (item as any)?.subject ||
            'Ungrouped';
          const entry = subjectMap.get(subj) || { train: 0, val: 0, test: 0 };
          entry[partition]++;
          subjectMap.set(subj, entry);
        }
      };
      addToMap(trainData, 'train');
      addToMap(valData,   'val');
      addToMap(testData,  'test');
      const subjectRows = Array.isArray(apiResponse.subject_distribution)
        ? apiResponse.subject_distribution
        : Array.from(subjectMap.entries())
        .map(([subject, counts]) => ({ subject, ...counts, total: counts.train + counts.val + counts.test }))
        .sort((a, b) => b.total - a.total);
      setSplitBySubject(subjectRows);

      alert(`Đã tạo train/val/test split an toàn thành công!\nTrain: ${trainData.length} | Val: ${valData.length} | Test: ${testData.length}`);
    } catch (error: any) {
      console.error('Lỗi khi phân chia dữ liệu:', error);
      setSplitResult(null);
      alert(error?.response?.data?.error || error.message || 'Safe Split failed. Export is blocked until leakage validation succeeds.');
    } finally {
      setIsSplitting(false);
    }
  };

  // Real score from AI / Staff, or null if not evaluated
  const getOverallScoreData = (cId: string, sampleObjectId?: string) => {
    const candidates = [cId, sampleObjectId].filter(Boolean).map(String);
    
    // 1. Try to find AI Score
    let avgAI = null;
    if (results) {
      const getResultSampleId = (r: any) => String(r.sampleId?._id || r.sampleId || r.sampleIdRef?._id || r.sampleIdRef?.sampleId || '');
      const resMatch = results.find(r => candidates.includes(getResultSampleId(r)) || candidates.includes(String(r.sampleIdRef?.sampleId || '')));
      if (resMatch) {
        const modelScores = resMatch.modelScores || {};
        const openrouter = resMatch.scores?.openrouter || resMatch.scores?.OpenRouter || modelScores.openrouter?.overall || resMatch.scores?.gemini || resMatch.scores?.Gemini || modelScores.gemini?.overall || null;
        const deepseek = resMatch.scores?.deepseek || resMatch.scores?.Deepseek || modelScores.deepseek?.overall || null;
        const groq = resMatch.scores?.groq || resMatch.scores?.Groq || modelScores.groq?.overall || resMatch.scores?.openai || resMatch.scores?.OpenAI || modelScores.openai?.overall || null;
        const aiVals = [openrouter, deepseek, groq].filter(v => v != null) as number[];
        avgAI = resMatch.averageOverall ?? resMatch.averageScore ?? (aiVals.length ? aiVals.reduce((a, b) => a + b, 0) / aiVals.length : null);
      }
    }

    // 2. Try to find Human Score
    let humanScore = null;
    let label = null;
    if (qualityResult?.items) {
      const humanItem = qualityResult.items.find((i: any) => candidates.includes(String(i.sampleId)) || candidates.includes(String(i._id)));
      if (humanItem) {
        humanScore = typeof humanItem.humanScore === 'number' ? humanItem.humanScore : humanItem.ratings?.human;
        label = humanItem.finalClassification || humanItem.qualityClassification || humanItem.bucket;
      }
    }

    // Determine what to display (prefer AI score if available, otherwise human)
    if (avgAI !== null && avgAI !== undefined) {
      return { score: avgAI, evaluatedBy: 'Avg AI', label: label || (avgAI < 6.0 ? 'Needs improvement' : 'Good') };
    }
    if (humanScore !== null && humanScore !== undefined) {
      return { score: humanScore, evaluatedBy: 'Staff', label: label || (humanScore < 6.0 ? 'Needs improvement' : 'Good') };
    }
    
    // Fallback
    if (sepQualityRatings && sepQualityRatings[cId] && typeof sepQualityRatings[cId].overall === 'number') {
      return { score: sepQualityRatings[cId].overall, evaluatedBy: 'Manual', label: '-' };
    }
    
    return { score: null, evaluatedBy: '-', label: '-' };
  };

  // Helper: get full conversation messages by id
  const getConvMessages = (id: string): { role: string; content: string }[] => {
    if (!conversationsList || !id) return [];
    const conv = conversationsList.find((c: any) => String(c.id) === String(id) || String(c.conversation_id) === String(id));
    if (!conv?.messages) return [];
    return conv.messages.flatMap((m: any) => {
      if (m.role && typeof m.content === 'string') return [{ role: m.role, content: m.content }];
      const msgs: { role: string; content: string }[] = [];
      if (m.user) msgs.push({ role: 'user', content: m.user });
      if (m.assistant) msgs.push({ role: 'assistant', content: m.assistant });
      return msgs;
    });
  };

  /**
   * Convert raw conversation data to standard ChatML format for fine-tuning.
   * Output: [ { messages: [ {role, content}, ... ] }, ... ]
   */
  const toChatML = (data: any[]): any[] => {
    return data.map((conv: any) => {
      const messages: { role: string; content: string }[] = [];

      // 1. Insert system prompt if available
      if (promptText && promptText.trim()) {
        messages.push({ role: 'system', content: promptText.trim() });
      }

      // 2. Convert conversation messages
      if (Array.isArray(conv.messages)) {
        for (const m of conv.messages) {
          if (m.role && typeof m.content === 'string') {
            // Already in {role, content} format
            if (m.role !== 'system') { // avoid duplicate system
              messages.push({ role: m.role, content: m.content });
            }
          } else if (m.user !== undefined || m.assistant !== undefined) {
            // Convert {user, assistant} pair format
            if (m.user) {
              messages.push({ role: 'user', content: m.user });
            }
            if (m.assistant) {
              messages.push({ role: 'assistant', content: m.assistant });
            }
          }
        }
      }

      return {
        messages,
        labels: conv.labels || { sample: [], messages: [] },
        conversation_id: conv.conversation_id || conv.id,
        subject: conv.subject || conv.subjectLabelWithHuman || conv.subjectLabelWithAI || 'UNGROUPED',
      };
    }).filter(item => item.messages.length > 1); // Keep only items with actual conversation
  };

  const loadLabeledExportSource = async () => {
    const versionId = localStorage.getItem('current_version_id');
    if (!versionId) throw new Error('Không tìm thấy Dataset Version đang làm việc.');
    const result = await apiService.getTrainingExportData(versionId);
    if (result.total > 0 && result.labeledSamples === 0) {
      throw new Error('Dataset chưa có hard label nào. Hãy kiểm tra Staff đã Submit và Supervisor đã hoàn tất review.');
    }
    return result.data || [];
  };

  /**
   * Build one browser-persisted Evaluation Pack from the locked Safe Split.
   * This removes the need to hand-create/upload separate router and Model Eval files.
   * The response text is intentionally marked as a pilot reference: a final paper
   * evaluation still needs an independently reviewed reference answer.
   */
  const handleCreateEvaluationPack = async () => {
    if (!splitResult?.train || !splitResult?.val || !splitResult?.test) {
      alert('Hãy chạy Safe Split thành công trước khi tạo Evaluation Pack.');
      return;
    }

    try {
      const sourceData = await loadLabeledExportSource();
      const sourceById = new Map<string, any>();
      sourceData.forEach((row: any, index: number) => {
        const id = String(row?.conversation_id || row?.id || `conv_${index + 1}`);
        sourceById.set(id, row);
      });

      const buildRows = (partitionRows: any[], split: 'TRAIN' | 'VALIDATION' | 'TEST') => {
        return (partitionRows || []).map((partitionRow: any, index: number) => {
          const id = String(partitionRow?.conversation_id || partitionRow?.id || `case-${split.toLowerCase()}-${index + 1}`);
          const source = sourceById.get(id) || partitionRow;
          const sourceMessages = toEvaluationMessages(source);
          const messages = sourceMessages.length > 0 ? sourceMessages : toEvaluationMessages(partitionRow);
          const userMessages = messages.filter(message => message.role === 'user');
          const lastUserIndex = Math.max(0, messages.map(message => message.role).lastIndexOf('user'));
          const question = String(userMessages[userMessages.length - 1]?.content || '').trim();
          const subject = normalizeEvaluationSubject(source?.subject || partitionRow?.subject);
          const intent = getEvaluationIntent(source, messages);
          const assistantAnswer = [...messages].reverse().find(message => message.role === 'assistant')?.content || '';
          const history = messages.slice(0, lastUserIndex).filter(message => message.role === 'user' || message.role === 'assistant');
          const turns = userMessages.map(message => message.content);
          const baseCase: any = {
            id,
            split,
            question,
            history,
            previous_subject: null,
            gold_subject: subject,
            gold_need_clarification: needsEvaluationClarification(question, source),
            challenge_type: history.length > 0 ? 'follow_up' : 'baseline',
            expected_language: inferEvaluationLanguage(question),
            provenance: `dataprep_version_${localStorage.getItem('current_version_id') || 'unknown'}`,
            review_status: 'needs_human_review',
          };
          if (intent) baseCase.gold_intent = intent;
          if (turns.length > 0) {
            baseCase.turns = turns;
            baseCase.turn_gold_subjects = turns.map(() => subject);
          }

          return {
            sourceRow: source,
            routerCase: baseCase,
            modelEvalCase: {
              ...baseCase,
              messages: messages.map(message => ({ role: message.role, content: message.content })),
              reference_answer: String(assistantAnswer),
              gold_key_points: [],
              socratic_expectation: {
                may_reveal_final_answer: false,
                expected_scaffold: String(assistantAnswer),
              },
              reference_source: 'dataset_assistant_response',
            },
          };
        }).filter(item => item.routerCase.question.length > 0);
      };

      const trainRows = buildRows(splitResult.train, 'TRAIN');
      const validationRows = buildRows(splitResult.val, 'VALIDATION');
      const testRows = buildRows(splitResult.test, 'TEST');
      const versionId = localStorage.getItem('current_version_id');
      const pack = {
        schema_version: 'evaluation-pack-v1',
        dataset_role: 'dataprep_derived_evaluation_pack',
        created_at: new Date().toISOString(),
        dataset_version_id: versionId,
        split_strategy: splitResult.split_strategy || 'safe-split',
        counts: { train: trainRows.length, validation: validationRows.length, test: testRows.length },
        warnings: [
          'Pilot pack generated from the Data Prep dataset version.',
          'Router labels are copied from available Data Prep labels or generated heuristically when missing.',
          'reference_answer currently comes from the dataset assistant response; independently review before final RP5.',
        ],
        sft: {
          train: trainRows.map(row => row.sourceRow),
          validation: validationRows.map(row => row.sourceRow),
          test: testRows.map(row => row.sourceRow),
        },
        router: {
          calibration: trainRows.map(row => row.routerCase),
          validation: validationRows.map(row => row.routerCase),
          test: testRows.map(row => row.routerCase),
        },
        model_eval: {
          test: testRows.map(row => row.modelEvalCase),
        },
      };

      localStorage.setItem(EVALUATION_PACK_STORAGE_KEY, JSON.stringify(pack));

      // Also provide a real ZIP artifact. It is compatible with the existing
      // AutoTrain and Model Eval ZIP readers and keeps all derived partitions
      // traceable to the same Data Prep version.
      const zip = new JSZip();
      zip.file('train_dataset.json', JSON.stringify(pack.sft.train, null, 2));
      zip.file('validation_dataset.json', JSON.stringify(pack.sft.validation, null, 2));
      zip.file('test_dataset.json', JSON.stringify(pack.model_eval.test, null, 2));
      const subjectsForPack = ['ENGLISH', 'MATH', 'HISTORY'];
      subjectsForPack.forEach(subject => {
        const subjectTrain = pack.sft.train.filter((row: any) => normalizeEvaluationSubject(row?.subject) === subject);
        const subjectValidation = pack.sft.validation.filter((row: any) => normalizeEvaluationSubject(row?.subject) === subject);
        zip.file(`subjects/${subject.toLowerCase()}_train.json`, JSON.stringify(subjectTrain, null, 2));
        zip.file(`subjects/${subject.toLowerCase()}_validation.json`, JSON.stringify(subjectValidation, null, 2));
      });
      // General is the pooled baseline: it sees all approved subject data.
      zip.file('subjects/general_train.json', JSON.stringify(pack.sft.train, null, 2));
      zip.file('subjects/general_validation.json', JSON.stringify(pack.sft.validation, null, 2));
      zip.file('router_calibration.json', JSON.stringify(pack.router.calibration, null, 2));
      zip.file('router_validation.json', JSON.stringify(pack.router.validation, null, 2));
      zip.file('router_test.json', JSON.stringify(pack.router.test, null, 2));
      zip.file('model_eval_test.json', JSON.stringify(pack.model_eval.test, null, 2));
      zip.file('_metadata.json', JSON.stringify({
        projectName,
        datasetVersionId: versionId,
        totalTrain: trainRows.length,
        totalValidation: validationRows.length,
        totalTest: testRows.length,
        exportedAt: pack.created_at,
        evaluationPackSchema: pack.schema_version,
      }, null, 2));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `evaluation_pack_${versionId || 'latest'}.zip`);

      // Training must happen before routing can be benchmarked. Navigate to
      // AutoTrain now; Router Benchmark will be used after HF registration.
      window.dispatchEvent(new CustomEvent('lh-navigate-tab', { detail: 'AutoTrain' }));
      alert(`Đã tạo và tải Evaluation Pack.\nTrain: ${trainRows.length} | Validation: ${validationRows.length} | Test: ${testRows.length}\nBước tiếp theo: train/register model trong AutoTrain. Sau đó mở Router Benchmark.`);
    } catch (error: any) {
      console.error('[Evaluation Pack] generation failed:', error);
      alert(error?.response?.data?.error || error?.message || 'Không thể tạo Evaluation Pack.');
    }
  };

  const handleDownloadSplit = async () => {
    if (!splitResult?.train || !splitResult?.test) {
      alert('Safe Split chưa hoàn tất. Không thể export dữ liệu chưa được kiểm tra leakage.');
      return;
    }
    let sourceData: any[];
    try {
      sourceData = await loadLabeledExportSource();
    } catch (error: any) {
      alert(error?.response?.data?.error || error.message || 'Không thể tải dữ liệu đã gán nhãn từ server.');
      return;
    }

    const zip = new JSZip();
    const normalize = (value: any) => String(value || 'UNGROUPED').trim().toUpperCase();
    const filePrefix = (subject: string) => {
      const normalized = normalize(subject);
      if (normalized === 'MATH' || normalized === 'MATHEMATICS') return 'math';
      if (normalized === 'PHYSICAL' || normalized === 'PHYSICS') return 'physical';
      if (normalized === 'GENERAL' || normalized === 'OUT_OF_SCOPE' || normalized === 'UNGROUPED') return 'general';
      return normalized.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    };
    const idsFor = (partition: any[], subject: string) => new Set(
      partition
        .filter(item => normalize(item.subject) === normalize(subject))
        .map(item => String(item.conversation_id || item.id))
    );
    const select = (partition: any[], subject: string) => {
      const ids = idsFor(partition, subject);
      return sourceData.filter(item =>
        ids.has(String(item.conversation_id || item.id)) &&
        !excludedSamples.has(String(item.conversation_id || item.id))
      );
    };

    const exportedSubjects: Array<Record<string, any>> = [];
    for (const row of splitBySubject) {
      const prefix = filePrefix(row.subject);
      const trainData = select(splitResult.train || [], row.subject);
      const valData = select(splitResult.val || [], row.subject);
      const testData = select(splitResult.test || [], row.subject);
      if (trainData.length) zip.file(`${prefix}.train.json`, JSON.stringify(toChatML(trainData), null, 2));
      if (valData.length) zip.file(`${prefix}.validation.json`, JSON.stringify(toChatML(valData), null, 2));
      if (testData.length) zip.file(`${prefix}.test.json`, JSON.stringify(toChatML(testData), null, 2));
      exportedSubjects.push({
        subject: normalize(row.subject),
        prefix,
        train: trainData.length,
        validation: valData.length,
        test: testData.length,
      });
    }
    zip.file('_metadata.json', JSON.stringify({
      projectName,
      datasetVersionId: localStorage.getItem('current_version_id'),
      splitStrategy: splitResult.split_strategy || 'semantic-guard',
      seed: splitResult.seed ?? 42,
      threshold: splitResult.threshold ?? splitThreshold,
      fileConvention: '<subject>.train.json | <subject>.validation.json | <subject>.test.json',
      subjects: exportedSubjects,
      exportedAt: new Date().toISOString(),
    }, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${projectName || 'dataset'}_multi_subject_split.zip`);
  };

  const handleDownloadSubjectSplit = async (requestedSubject: string) => {
    if (!splitResult?.train || !splitResult?.val || !splitResult?.test) {
      alert('Hãy chạy Split Guard trước khi export theo môn.');
      return;
    }
    let sourceData: any[];
    try {
      sourceData = await loadLabeledExportSource();
    } catch (error: any) {
      alert(error?.response?.data?.error || error.message || 'Không thể tải dữ liệu đã gán nhãn.');
      return;
    }

    const normalize = (value: any) => String(value || 'UNGROUPED').trim().toUpperCase();
    const subject = normalize(requestedSubject);
    const idsFor = (partition: any[]) => new Set(
      partition
        .filter(item => normalize(item.subject) === subject)
        .map(item => String(item.conversation_id || item.id))
    );
    const select = (partition: any[]) => {
      const ids = idsFor(partition);
      return sourceData.filter(item =>
        ids.has(String(item.conversation_id || item.id)) &&
        !excludedSamples.has(String(item.conversation_id || item.id))
      );
    };

    const trainData = select(splitResult.train);
    const valData = select(splitResult.val);
    const testData = select(splitResult.test);
    if (!trainData.length || !valData.length || !testData.length) {
      alert(`Môn ${requestedSubject} chưa có đủ cả Train/Validation/Test.`);
      return;
    }

    const zip = new JSZip();
    zip.file('train_dataset.json', JSON.stringify(toChatML(trainData), null, 2));
    zip.file('validation_dataset.json', JSON.stringify(toChatML(valData), null, 2));
    zip.file('test_dataset.json', JSON.stringify(toChatML(testData), null, 2));
    zip.file('_metadata.json', JSON.stringify({
      projectName,
      datasetVersionId: localStorage.getItem('current_version_id'),
      subject,
      splitStrategy: splitResult.split_strategy,
      seed: splitResult.seed ?? 42,
      threshold: splitResult.threshold ?? splitThreshold,
      totalTrain: trainData.length,
      totalValidation: valData.length,
      totalTest: testData.length,
      exportedAt: new Date().toISOString(),
    }, null, 2));
    const content = await zip.generateAsync({ type: 'blob' });
    const safeSubject = subject.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    saveAs(content, `${projectName || 'dataset'}_${safeSubject}_split.zip`);
  };

  const [exportMinScore, setExportMinScore] = useState(6.0);

  const handleDownloadFiltered = async () => {
    if (!splitResult?.train || !splitResult?.test) {
      alert('Safe Split chưa hoàn tất. Không thể export dữ liệu chưa được kiểm tra leakage.');
      return;
    }
    let sourceData: any[];
    try {
      sourceData = await loadLabeledExportSource();
    } catch (error: any) {
      alert(error?.response?.data?.error || error.message || 'Không thể tải dữ liệu đã gán nhãn từ server.');
      return;
    }
    let trainData = sourceData;
    let valData: any[] = [];
    let testData: any[] = [];

    if (splitResult) {
      const trainIds = new Set((splitResult.train || []).map((c: any) => c.conversation_id || c.id));
      const valIds = new Set((splitResult.val || []).map((c: any) => c.conversation_id || c.id));
      const testIds = new Set((splitResult.test || []).map((c: any) => c.conversation_id || c.id));

      trainData = sourceData.filter((c: any) => trainIds.has(c.conversation_id || c.id));
      valData = sourceData.filter((c: any) => valIds.has(c.conversation_id || c.id));
      testData = sourceData.filter((c: any) => testIds.has(c.conversation_id || c.id));
    }

    // Filter out excluded samples first
    trainData = trainData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
    valData = valData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
    testData = testData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));

    // Filter by overall score
    trainData = trainData.filter((c: any) => {
      const s = getOverallScoreData(c.conversation_id || c.id, c.sampleObjectId).score;
      return s !== null && s >= exportMinScore;
    });
    valData = valData.filter((c: any) => {
      const s = getOverallScoreData(c.conversation_id || c.id, c.sampleObjectId).score;
      return s !== null && s >= exportMinScore;
    });
    testData = testData.filter((c: any) => {
      const s = getOverallScoreData(c.conversation_id || c.id, c.sampleObjectId).score;
      return s !== null && s >= exportMinScore;
    });

    const zip = new JSZip();
    zip.file('train_dataset.json', JSON.stringify(toChatML(trainData), null, 2));
    if (valData.length > 0) {
      zip.file('validation_dataset.json', JSON.stringify(toChatML(valData), null, 2));
    }
    if (testData.length > 0) {
      zip.file('test_dataset.json', JSON.stringify(toChatML(testData), null, 2));
    }

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${projectName || 'dataset'}_split_filtered.zip`);
  };

  const handlePushToHub = async () => {
    if (!hfToken.trim() || !hfRepoId.trim()) {
      alert('Vui lòng nhập Hugging Face Token và Repository ID trước khi Push!');
      return;
    }

    if (!splitResult || !splitResult.train) {
      alert('Chưa có dữ liệu Split. Vui lòng quay lại bước Split Guard để phân chia dữ liệu.');
      return;
    }

    setIsPushing(true);
    setPushSuccess(false);

    try {
      // Prepare dataset content
      let trainData = splitResult.train;
      let valData = splitResult.val || [];
      let testData = splitResult.test || [];

      // Filter out excluded items
      trainData = trainData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
      valData = valData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
      testData = testData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));

      const datasetObject = {
        train: toChatML(trainData),
        validation: toChatML(valData),
        test: toChatML(testData)
      };
      const content = JSON.stringify(datasetObject, null, 2);

      await apiService.pushToHuggingFace({
        token: hfToken,
        repoId: hfRepoId,
        fileName: 'dataset_split.json',
        content: content,
        isPrivate: hfIsPrivate
      });

      setPushSuccess(true);
      alert(`Đã push dataset thành công lên Hugging Face Hub (Repo: ${hfRepoId})!`);
    } catch (error: any) {
      console.error('Push to Hub Error:', error);
      alert(error.response?.data?.error || error.message || 'Lỗi khi push lên Hugging Face');
    } finally {
      setIsPushing(false);
    }
  };

  const handleSyncToCloud = async () => {
    if (!splitResult || !splitResult.train) {
      alert('Chưa có dữ liệu Split. Vui lòng phân chia dữ liệu trước khi Sync.');
      return;
    }

    setIsSyncing(true);
    setSyncSuccess(false);

    try {
      // Prepare dataset content
      let trainData = splitResult.train;
      let valData = splitResult.val || [];
      let testData = splitResult.test || [];

      trainData = trainData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
      valData = valData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));
      testData = testData.filter((c: any) => !excludedSamples.has(c.conversation_id || c.id));

      const datasetObject = {
        train: toChatML(trainData),
        validation: toChatML(valData),
        test: toChatML(testData)
      };
      const content = JSON.stringify(datasetObject, null, 2);
      const fileName = `${projectName || 'dataset'}_split.json`;

      await apiService.syncToCloud({
        provider: cloudProvider as 'gcloud' | 'azure',
        fileName: fileName,
        content: content
      });

      setSyncSuccess(true);
      alert(`Đã sync dataset thành công lên ${cloudProvider === 'gcloud' ? 'Google Cloud' : 'Azure'}!`);
    } catch (error: any) {
      console.error('Sync to Cloud Error:', error);
      alert(error.response?.data?.error || error.message || 'Lỗi khi sync lên Cloud Storage');
    } finally {
      setIsSyncing(false);
    }
  };

  // Format trial response: convert LaTeX \(...\) and \[...\] to readable text,
  // and convert markdown bold/headers to clean text
  const formatTrialResponse = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/\\\[([^\]]+)\\\]/g, ' $1 ')   // \[...\] block math
      .replace(/\\\(([^)]+)\\\)/g, '$1')        // \(...\) inline math
      .replace(/\*\*([^*]+)\*\*/g, '$1')         // **bold**
      .replace(/^#{1,4}\s+/gm, '')               // # headers
      .replace(/\\n/g, '\n')                      // literal \n
      .replace(/\n{3,}/g, '\n\n');                // collapse blank lines
  };

  const livePreviewJSON = {
    messages: [
      { role: 'system', content: promptText || '[No system prompt yet]' },
      { role: 'user', content: sampleQuestion },
      { role: 'assistant', content: trialResponse
        ? formatTrialResponse(trialResponse)
        : '[Chưa có phản hồi. Hãy bấm Run Trial để AI tạo câu trả lời dựa trên System Prompt ở trên.]' }
    ]
  };

  // Filter versions by search
  const filteredVersions = promptVersions.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pagination for history
  const totalHistoryPages = Math.max(1, Math.ceil(filteredVersions.length / historyPerPage));
  const paginatedVersions = filteredVersions.slice(
    (historyPage - 1) * historyPerPage,
    historyPage * historyPerPage
  );

  // Pagination for exported rows
  const itemsPerPage = 5;
  const totalItems = conversationsList?.length || 72;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const activePage = Math.min(exportPage, totalPages);

  const previewRows = conversationsList && conversationsList.length > 0
    ? conversationsList.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage).map(c => {
        let sys = promptText || '';
        let usr = '';
        let ast = '';
        if (c.messages && c.messages.length > 0) {
          const firstMsg = c.messages[0];
          if (firstMsg.user !== undefined || firstMsg.assistant !== undefined) {
            usr = firstMsg.user || '';
            ast = firstMsg.assistant || '';
          } else {
            const userMsg = c.messages.find((m: any) => m.role === 'user');
            const astMsg = c.messages.find((m: any) => m.role === 'assistant');
            const sysMsg = c.messages.find((m: any) => m.role === 'system');
            if (userMsg) usr = userMsg.content;
            if (astMsg) ast = astMsg.content;
            if (sysMsg) sys = sysMsg.content;
          }
        }
        return {
          id: c.id || c.conversation_id,
          sampleObjectId: c.sampleObjectId,
          system: sys,
          user: usr,
          assistant: ast,
        };
      })
    : [];

  return (
    <div className="dataprep-stage2">
      {/* Sub-stepper */}
      <div className="sub-stepper">
        {SUB_STEPS_STAGE6.map((step, idx) => (
          <React.Fragment key={step.num}>
            <div
              className={`sub-step ${step.num === currentSubStep6 ? 'active' : ''} ${isStepCompleted(step.num) ? 'completed' : ''}`}
              onClick={() => setCurrentSubStep6(step.num)}
            >
              <div className="sub-step-circle">
                {isStepCompleted(step.num) ? <Check size={14} /> : step.num}
              </div>
              <div className="sub-step-label" style={{ whiteSpace: 'pre-line', textAlign: 'center' }}>{step.label}</div>
            </div>
            {idx < SUB_STEPS_STAGE6.length - 1 && <div className="sub-step-connector" />}
          </React.Fragment>
        ))}
      </div>

      {/* Sub-step 12: System Prompt */}
      {currentSubStep6 === 12 && (
        <div className="s6-prompt">
          <div className="s6-prompt-title">
            <h3>System Prompt Versioning</h3>
            <p>Manage prompt history, compare versions, and test with trial run before saving.</p>
          </div>

          {/* Two-column: History + Editor */}
          <div className="s6-prompt-layout">
            {/* Left: History */}
            <div className="s6-history-card">
              <div className="s6-history-header">
                <h4>History</h4>
                <div className="s6-history-actions">
                  <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => alert('So sánh trực quan sự khác biệt giữa prompt hiện tại với phiên bản đã chọn.')}>Compare Mode</button>
                  <span className="s6-version-count">{filteredVersions.length} versions</span>
                </div>
              </div>

              <input
                className="s6-search-input"
                placeholder="Search by description or version"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setHistoryPage(1); }}
              />

              <div className="s6-version-list">
                {isLoadingVersions ? (
                  <div className="sep490-empty">Đang tải danh sách prompt...</div>
                ) : filteredVersions.length === 0 ? (
                  <div className="sep490-empty">Không tìm thấy phiên bản phù hợp.</div>
                ) : paginatedVersions.map(v => (
                  <div
                    key={v.id}
                    className={`s6-version-item ${selectedVersion?.id === v.id ? 's6-version-selected' : ''}`}
                    onClick={() => {
                      setSelectedVersion(v);
                      setPromptText(v.content);
                      setPromptName(v.name);
                      setPromptDesc(v.desc);
                    }}
                  >
                    <div className="s6-version-item-left">
                      <span className="s6-version-name">{v.name}</span>
                      <span className="s6-version-desc">{v.desc}</span>
                    </div>
                    <span className="s6-version-date">{v.date}</span>
                  </div>
                ))}
              </div>

              {/* History Pagination */}
              {filteredVersions.length > historyPerPage && (
                <div className="s6-history-paging">
                  <button
                    className="s6-history-paging-btn"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="s6-history-paging-info">
                    {historyPage} / {totalHistoryPages}
                  </span>
                  <button
                    className="s6-history-paging-btn"
                    disabled={historyPage >= totalHistoryPages}
                    onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Right: Viewer + Editor */}
            <div className="s6-editor-col">
              {/* Selected Version (Read-only) */}
              <div className="s6-viewer-card">
                <h4>Selected Version (Read-only)</h4>
                <textarea
                  className="s6-viewer-textarea"
                  readOnly
                  value={selectedVersion ? selectedVersion.content : ''}
                  placeholder="Select a version from History to inspect its content."
                />
              </div>

              {/* Editor */}
              <div className="s6-editor-card">
                <h4>Editor - Current Prompt</h4>
                <label className="s6-field-label">Current Prompt</label>
                <textarea
                  className="s6-editor-textarea"
                  placeholder="Write your current system prompt here..."
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                />

                <label className="s6-field-label">Prompt Name (Unique)</label>
                <input
                  className="s6-field-input"
                  value={promptName}
                  onChange={e => setPromptName(e.target.value)}
                />

                <label className="s6-field-label">Description</label>
                <input
                  className="s6-field-input"
                  value={promptDesc}
                  onChange={e => setPromptDesc(e.target.value)}
                />

                <span className="s6-library-source">Library Source: {promptName}</span>

                <button
                  className="s6-save-btn"
                  onClick={handleSaveNewVersion}
                  disabled={isLoadingVersions}
                >
                  {isLoadingVersions ? 'Saving...' : 'Save as New Version'}
                </button>
              </div>
            </div>
          </div>

          {/* Trial Run */}
          <div className="s6-trial-card">
            <div className="s6-trial-header">
              <div>
                <h4>Trial Run</h4>
                <p>Test your current prompt with a sample question before saving.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={trialProvider}
                  onChange={e => setTrialProvider(e.target.value as any)}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
                >
                  <option value="deepseek">Deepseek</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
                <button
                  className="s6-trial-btn"
                  onClick={handleRunTrial}
                  disabled={isRunningTrial}
                >
                  {isRunningTrial ? (
                    <>
                      <RefreshCw size={14} className="sep490-spin" /> Running...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Run Trial
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="s6-trial-body">
              <div className="s6-trial-col">
                <label className="s6-field-label">Sample Question</label>
                <textarea
                  className="s6-trial-textarea"
                  value={sampleQuestion}
                  onChange={e => setSampleQuestion(e.target.value)}
                />
              </div>
              <div className="s6-trial-col">
                <label className="s6-field-label">Generated Response</label>
                <div
                  className="s6-trial-textarea s6-trial-response"
                  style={{ whiteSpace: 'pre-wrap', overflowY: 'auto', fontFamily: 'inherit', cursor: 'default' }}
                >
                  {trialResponse
                    ? formatTrialResponse(trialResponse)
                    : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Click 'Run Trial' to generate a response...</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="s6-preview-card">
            <div className="s6-preview-header">
              <div>
                <h4>Live Preview</h4>
                <p>Preview of the first sample after inserting system prompt.</p>
              </div>
              <span className="s6-source-badge">Source: Editor</span>
            </div>
            <pre className="s6-json-preview">
              {JSON.stringify(livePreviewJSON, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Sub-step 13: Split Guard */}
      {currentSubStep6 === 13 && (
        <div className="sg-container">
          {/* Header */}
          <div className="sg-header">
            <div>
              <h3>Split Guard</h3>
              <p>Generate a train / val / test split with semantic conflict checking handled by the GPU service.</p>
            </div>
            <button
              className="s6-trial-btn"
              onClick={handleGenerateSplit}
              disabled={isSplitting}
            >
              {isSplitting ? (
                <>
                  <RefreshCw size={14} className="sep490-spin" /> Generating...
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Generate safe split
                </>
              )}
            </button>
          </div>

          {/* Config Cards */}
          <div className="sg-config-row">
            <div className="sg-config-card">
              <span className="sg-config-label">TOTAL SAMPLES</span>
              <span className="sg-config-value">{conversationsList?.length || 0}</span>
            </div>
            <div className="sg-config-card">
              <div className="sg-config-label-row">
                <span className="sg-config-label">TEST %</span>
                <span className="sg-config-pct">{splitTestPercentage}%</span>
              </div>
              <input
                type="range"
                min="5"
                max={Math.max(5, 90 - splitValPercentage)}
                value={splitTestPercentage}
                onChange={e => setSplitTestPercentage(Number(e.target.value))}
                className="sg-slider sg-slider-purple"
              />
            </div>
            <div className="sg-config-card">
              <div className="sg-config-label-row">
                <span className="sg-config-label">VAL %</span>
                <span className="sg-config-pct" style={{ color: '#10b981' }}>{splitValPercentage}%</span>
              </div>
              <input
                type="range"
                min="5"
                max={Math.max(5, 90 - splitTestPercentage)}
                value={splitValPercentage}
                onChange={e => setSplitValPercentage(Number(e.target.value))}
                className="sg-slider"
                style={{ accentColor: '#10b981' }}
              />
            </div>
            <div className="sg-config-card">
              <div className="sg-config-label-row">
                <span className="sg-config-label">TRAIN %</span>
                <span className="sg-config-pct" style={{ color: '#7c3aed' }}>
                  {Math.max(0, 100 - splitTestPercentage - splitValPercentage)}%
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                Tự tính = 100% − Test − Val
              </div>
            </div>
            <div className="sg-config-card">
              <div className="sg-config-label-row">
                <span className="sg-config-label">SEMANTIC THRESHOLD</span>
                <span className="sg-config-pct">{splitThreshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={Math.round(splitThreshold * 100)}
                onChange={e => setSplitThreshold(Number(e.target.value) / 100)}
                className="sg-slider sg-slider-purple"
              />
            </div>
          </div>

          {/* Max Attempts */}
          <div className="sg-attempts-card">
            <span className="sg-config-label">MAX ATTEMPTS</span>
            <p className="sg-attempts-desc">The GPU service will reshuffle until the split is clean or this limit is reached.</p>
            <input
              type="number"
              value={splitMaxAttempts}
              onChange={e => setSplitMaxAttempts(Math.max(1, Number(e.target.value)))}
              className="sg-attempts-input"
            />
          </div>

          {/* Split Generated Result */}
          <div className="sg-result-card">
            <div className="sg-result-title"><Check size={16} /> Split Generated</div>
            <div className="sg-result-stats">
              <div className="sg-result-stat">
                <span className="sg-result-label">TRAIN</span>
                <span className="sg-result-value" style={{ color: '#7c3aed' }}>
                  {splitResult ? (splitResult.train_count ?? splitResult.train?.length ?? 0) : '-'}
                </span>
              </div>
              <div className="sg-result-stat">
                <span className="sg-result-label">VAL</span>
                <span className="sg-result-value" style={{ color: '#10b981' }}>
                  {splitResult ? (splitResult.val_count ?? splitResult.val?.length ?? 0) : '-'}
                </span>
              </div>
              <div className="sg-result-stat">
                <span className="sg-result-label">TEST</span>
                <span className="sg-result-value" style={{ color: '#3b82f6' }}>
                  {splitResult ? (splitResult.test_count ?? splitResult.test?.length ?? 0) : '-'}
                </span>
              </div>
              <div className="sg-result-stat">
                <span className="sg-result-label">ATTEMPTS</span>
                <span className="sg-result-value">{splitResult ? splitResult.attempts : '-'}</span>
              </div>
              <div className="sg-result-stat">
                <span className="sg-result-label">CONFLICTS</span>
                <span className="sg-result-value sg-value-red">{splitResult ? splitResult.conflicts : '-'}</span>
              </div>
              <div className="sg-result-stat">
                <span className="sg-result-label">MAX SIMILARITY</span>
                <span className="sg-result-value">{splitResult ? splitResult.max_similarity : '-'}</span>
              </div>
            </div>
          </div>

          {/* Venn Diagram */}
          <div className="sg-venn-card">
            <h4>Semantic Overlap Visualization</h4>
            <p className="sg-venn-sub">Visual representation of semantic similarity between <span style={{ color: '#7c3aed' }}>Train</span>, <span style={{ color: '#10b981' }}>Val</span> and <span style={{ color: '#3b82f6' }}>Test</span> sets.</p>
            <div className="sg-venn-wrap">
              <svg viewBox="0 0 520 220" className="sg-venn-svg">
                {/* Train circle */}
                <circle cx="120" cy="110" r="80" fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth="2" />
                {/* Val circle */}
                <circle cx="260" cy="110" r="80" fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth="2" />
                {/* Test circle */}
                <circle cx="400" cy="110" r="80" fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2" />
                {/* Overlap Train-Val dashed */}
                <ellipse cx="190" cy="110" rx="28" ry="50" fill="rgba(239,68,68,0.07)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                {/* Overlap Val-Test dashed */}
                <ellipse cx="330" cy="110" rx="28" ry="50" fill="rgba(239,68,68,0.07)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                {/* Labels Train */}
                <text x="95" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#7c3aed">TRAIN</text>
                <text x="95" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#7c3aed">
                  {splitResult ? `${splitResult.train_count ?? splitResult.train?.length ?? 0}` : '-'}
                </text>
                {/* Labels Val */}
                <text x="260" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#10b981">VAL</text>
                <text x="260" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#10b981">
                  {splitResult ? `${splitResult.val_count ?? splitResult.val?.length ?? 0}` : '-'}
                </text>
                {/* Labels Test */}
                <text x="425" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#3b82f6">TEST</text>
                <text x="425" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#3b82f6">
                  {splitResult ? `${splitResult.test_count ?? splitResult.test?.length ?? 0}` : '-'}
                </text>
                {/* Conflicts label */}
                <text x="190" y="175" textAnchor="middle" className="sg-venn-text-sub" fill="#ef4444">
                  {splitResult ? `${splitResult.conflicts} conflicts` : ''}
                </text>
              </svg>
            </div>

            {/* Summary Cards */}
            <div className="sg-summary-row">
              <div className="sg-summary-card sg-summary-train">
                <span className="sg-summary-value">{splitResult ? (splitResult.train_count ?? splitResult.train?.length ?? 0) : '-'}</span>
                <span className="sg-summary-label">Train</span>
              </div>
              <div className="sg-summary-card" style={{ borderColor: '#10b981', background: 'rgba(16,185,129,0.08)' }}>
                <span className="sg-summary-value" style={{ color: '#10b981' }}>{splitResult ? (splitResult.val_count ?? splitResult.val?.length ?? 0) : '-'}</span>
                <span className="sg-summary-label">Val</span>
              </div>
              <div className="sg-summary-card sg-summary-conflict">
                <span className="sg-summary-value">{splitResult ? splitResult.conflicts : '-'}</span>
                <span className="sg-summary-label">Semantic Conflicts</span>
              </div>
              <div className="sg-summary-card sg-summary-test">
                <span className="sg-summary-value">{splitResult ? (splitResult.test_count ?? splitResult.test?.length ?? 0) : '-'}</span>
                <span className="sg-summary-label">Test</span>
              </div>
            </div>
          </div>

          {/* === Plan B: Subject Distribution Table === */}
          {splitBySubject.length > 0 && (
            <div className="sg-exclusion-card" style={{ marginTop: 16 }}>
              <div className="sg-exclusion-header">
                <div>
                  <h4>Subject Distribution</h4>
                  <p>Phân bổ Train / Val / Test theo từng môn học sau khi split.</p>
                </div>
                <span className="sg-excluded-count">{splitBySubject.length} môn</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(124,58,237,0.06)', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Môn học</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#7c3aed' }}>Train</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#10b981' }}>Val</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#3b82f6' }}>Test</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>Tổng</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>Dataset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {splitBySubject.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b' }}>
                          <span style={{
                            display: 'inline-block', width: 8, height: 8,
                            borderRadius: '50%', background: '#7c3aed',
                            marginRight: 8, opacity: 0.7
                          }} />
                          {row.subject}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#7c3aed', fontWeight: 600 }}>{row.train}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{row.val}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#3b82f6', fontWeight: 600 }}>{row.test}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>{row.total}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button
                            className="s6-trial-btn"
                            onClick={() => handleDownloadSubjectSplit(row.subject)}
                            title={`Export dataset riêng cho môn ${row.subject}`}
                          >
                            <Download size={13} /> ZIP
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Manual Exclusion Tool */}
          <div className="sg-exclusion-card">
            <div className="sg-exclusion-header">
              <div>
                <h4>Manual Exclusion Tool</h4>
                <p>Select samples below to exclude them from the dataset and resolve conflicts.</p>
              </div>
              <span className="sg-excluded-count">{excludedSamples.size} excluded</span>
            </div>
            <div className="sg-conflict-list">
              {(splitResult?.overlap_info || []).map((item: any, idx: number) => {
                // Determine ID and text using trainIndex/testIndex if available from GPU service
                let trainConv = item.trainIndex !== undefined ? conversationsList[item.trainIndex] : null;
                let itemId = item.id || item.conversation_id || item.train_id || (trainConv ? (trainConv.conversation_id || trainConv.id) : idx.toString());
                let text = item.text || item.content || '';

                if (!text && trainConv && trainConv.messages && trainConv.messages.length > 0) {
                  const firstMsg = trainConv.messages[0];
                  text = firstMsg.user || firstMsg.content || '';
                }

                // If text is still empty, look up from conversationsList by ID
                if (!text && conversationsList) {
                  const conv = conversationsList.find((c: any) =>
                    (String(c.id) === String(itemId) || String(c.conversation_id) === String(itemId))
                  );
                  if (conv && conv.messages && conv.messages.length > 0) {
                    const firstMsg = conv.messages[0];
                    text = firstMsg.user || firstMsg.content || '';
                  }
                }

                // Also try matching by train_id from overlap pair if it somehow exists
                if (!text && item.train_id && conversationsList) {
                  const conv = conversationsList.find((c: any) =>
                    (String(c.id) === String(item.train_id) || String(c.conversation_id) === String(item.train_id))
                  );
                  if (conv && conv.messages && conv.messages.length > 0) {
                    const firstMsg = conv.messages[0];
                    text = firstMsg.user || firstMsg.content || '';
                  }
                }

                if (!text) text = `Conversation ${itemId}`;

                // Truncate long text for display
                const displayText = text.length > 120 ? text.slice(0, 120) + '...' : text;

                const sim = item.similarity || item.sim || item.score || 0;
                const isExcluded = excludedSamples.has(itemId);
                return (
                  <div key={idx} className={`sg-conflict-item ${isExcluded ? 'excluded' : ''}`} style={isExcluded ? { opacity: 0.5 } : {}}>
                    <div className="sg-conflict-left">
                      <X size={14} className="sg-conflict-x" style={{ cursor: 'pointer' }} onClick={() => {
                        const newEx = new Set(excludedSamples);
                        if (newEx.has(itemId)) {
                          newEx.delete(itemId);
                        } else {
                          newEx.add(itemId);
                        }
                        setExcludedSamples(newEx);
                      }} />
                      <div>
                        <span className="sg-conflict-text" style={isExcluded ? { textDecoration: 'line-through' } : {}}>{displayText}</span>
                        <div className="sg-conflict-meta">
                          <span className="sg-dot sg-dot-train"></span> In Train
                          <span className="sg-dot sg-dot-test"></span> In Test
                          <span className="sg-conflict-sim">Similarity: <strong style={{ color: '#dc2626' }}>{typeof sim === 'number' ? sim.toFixed(2) : sim}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="sg-conflict-actions">
                      <button
                        className="sg-detail-btn"
                        onClick={() => setConflictDetailIdx(idx)}
                      >
                        <Eye size={13} /> View Detail
                      </button>
                      <button
                        className="sg-exclude-btn"
                        onClick={() => {
                          const newEx = new Set(excludedSamples);
                          if (newEx.has(itemId)) {
                            newEx.delete(itemId);
                          } else {
                            newEx.add(itemId);
                          }
                          setExcludedSamples(newEx);
                        }}
                      >
                        {isExcluded ? 'Include sample' : 'Exclude sample'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {!splitResult?.overlap_info?.length && (
                <div className="sep490-empty">No conflicts detected or split not generated yet.</div>
              )}
            </div>
          </div>

          {/* Conflict Detail Modal */}
          {conflictDetailIdx !== null && splitResult?.overlap_info?.[conflictDetailIdx] && (() => {
            const detailItem = splitResult.overlap_info[conflictDetailIdx];

            // Resolve train conversation from trainIndex if available
            let resolvedTrainConv = detailItem.trainIndex !== undefined ? conversationsList[detailItem.trainIndex] : null;
            let resolvedTrainId = detailItem.train_id || detailItem.id || detailItem.conversation_id || (resolvedTrainConv ? (resolvedTrainConv.conversation_id || resolvedTrainConv.id) : conflictDetailIdx.toString());

            // Resolve test conversation from testIndex if available
            let resolvedTestConv = detailItem.testIndex !== undefined ? conversationsList[detailItem.testIndex] : null;
            let resolvedTestId = detailItem.test_id || (resolvedTestConv ? (resolvedTestConv.conversation_id || resolvedTestConv.id) : '');

            const sim = detailItem.similarity || detailItem.sim || detailItem.score || 0;

            const trainMsgs = resolvedTrainConv?.messages?.length > 0 ? getConvMessages(resolvedTrainId) : getConvMessages(resolvedTrainId);
            let resolvedTestMsgs = resolvedTestId ? getConvMessages(resolvedTestId) : [];

            // If no test conversation found, find one from test set (mock fallback)
            if (resolvedTestMsgs.length === 0 && splitResult.test) {
              const testConvs = splitResult.test;
              if (testConvs.length > 0) {
                const testConv = testConvs[conflictDetailIdx % testConvs.length];
                resolvedTestId = testConv?.conversation_id || testConv?.id || '';
                resolvedTestMsgs = getConvMessages(resolvedTestId);
              }
            }

            return (
              <div className="sg-detail-overlay" onClick={() => setConflictDetailIdx(null)}>
                <div className="sg-detail-modal" onClick={e => e.stopPropagation()}>
                  <div className="sg-detail-header">
                    <div>
                      <h4>Conflict Comparison</h4>
                      <p>Similarity: <strong style={{ color: '#dc2626', fontSize: '16px' }}>{typeof sim === 'number' ? sim.toFixed(2) : sim}</strong></p>
                    </div>
                    <button className="sg-detail-close" onClick={() => setConflictDetailIdx(null)}><X size={18} /></button>
                  </div>
                  <div className="sg-detail-why">
                    <AlertCircle size={14} />
                    <span>These two conversations have high semantic similarity ({typeof sim === 'number' ? (sim * 100).toFixed(0) : sim}%), which may cause <strong>data leakage</strong> between train and test sets. Consider excluding one of them.</span>
                  </div>
                  <div className="sg-detail-compare">
                    {/* Train side */}
                    <div className="sg-detail-side sg-detail-train">
                      <div className="sg-detail-side-header">
                        <span className="sg-dot sg-dot-train"></span>
                        <strong>Train Set</strong>
                        <span className="sg-detail-id">{resolvedTrainId}</span>
                      </div>
                      <div className="sg-detail-messages">
                        {trainMsgs.length > 0 ? trainMsgs.map((m, i) => (
                          <div key={i} className={`sg-detail-msg sg-detail-msg-${m.role}`}>
                            <span className="sg-detail-role">{m.role}</span>
                            <span className="sg-detail-content">{m.content}</span>
                          </div>
                        )) : <div className="sep490-empty">No messages found</div>}
                      </div>
                    </div>
                    {/* Test side */}
                    <div className="sg-detail-side sg-detail-test">
                      <div className="sg-detail-side-header">
                        <span className="sg-dot sg-dot-test"></span>
                        <strong>Test Set</strong>
                        <span className="sg-detail-id">{resolvedTestId}</span>
                      </div>
                      <div className="sg-detail-messages">
                        {resolvedTestMsgs.length > 0 ? resolvedTestMsgs.map((m, i) => (
                          <div key={i} className={`sg-detail-msg sg-detail-msg-${m.role}`}>
                            <span className="sg-detail-role">{m.role}</span>
                            <span className="sg-detail-content">{m.content}</span>
                          </div>
                        )) : <div className="sep490-empty">No messages found</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Sub-step 14: Export */}
      {currentSubStep6 === 14 && (
        <div className="ex-container">
          {/* Dataset Preview */}
          <div className="ex-preview-card">
            <div className="ex-preview-header">
              <div>
                <h3>Converted Dataset Preview</h3>
                <p>Showing {(activePage - 1) * itemsPerPage + 1}-{Math.min(activePage * itemsPerPage, totalItems)} of {totalItems} records</p>
              </div>
              <div className="ex-preview-controls">
                <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => alert(`Hiển thị toàn bộ ${totalItems} dòng dữ liệu.`)}>Show All</button>
                <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => alert('Tăng giới hạn hiển thị.')}>Increase Limit (5)</button>
                <select className="s5-filter-select" defaultValue="5">
                  <option value="5">5 / page</option>
                  <option value="10">10 / page</option>
                  <option value="20">20 / page</option>
                </select>
              </div>
            </div>

            <table className="ex-table">
              <thead>
                <tr>
                  <th>System</th>
                  <th>User</th>
                  <th>Assistant</th>
                  <th>overall</th>
                  <th>reason</th>
                  <th>evaluated by</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Không có dữ liệu</td>
                  </tr>
                ) : previewRows.map((row, idx) => {
                  const scoreData = getOverallScoreData(row.id, row.sampleObjectId);
                  const hasScore = typeof scoreData.score === 'number' && !isNaN(scoreData.score);
                  const scoreText = hasScore ? scoreData.score.toFixed(1) : '-';
                  const reason = hasScore ? scoreData.label : '-';
                  return (
                    <tr key={idx}>
                      <td>
                        <span className="ex-cell-text">{row.system || '-'}</span>
                        { row.system && <a href="#" className="ex-read-more" onClick={(e) => { e.preventDefault(); alert(row.system); }}>Read more</a> }
                      </td>
                      <td>
                        <span className="ex-cell-text">{row.user || '-'}</span>
                        { row.user && <a href="#" className="ex-read-more" onClick={(e) => { e.preventDefault(); alert(row.user); }}>Read more</a> }
                      </td>
                      <td>
                        <span className="ex-cell-text">{row.assistant || '-'}</span>
                        { row.assistant && <a href="#" className="ex-read-more" onClick={(e) => { e.preventDefault(); alert(row.assistant); }}>Read more</a> }
                      </td>
                      <td>{scoreText}</td>
                      <td>{reason !== '-' ? <span className="ex-cell-text">{reason}</span> : '-'}</td>
                      <td>{scoreData.evaluatedBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="ex-pagination">
              <button className="ex-page-btn" onClick={() => setExportPage(Math.max(1, exportPage - 1))}>Previous</button>
              <span className="ex-page-info">Page {activePage} / {totalPages}</span>
              <button className="ex-page-btn" onClick={() => setExportPage(Math.min(totalPages, exportPage + 1))}>Next</button>
            </div>
          </div>

          {/* Evaluation Pack: connects Data Prep directly to Router Benchmark */}
          <div className="ex-download-card" style={{ marginTop: 16, border: '1px solid #c7d2fe', background: '#eef2ff' }}>
            <h4 style={{ color: '#3730a3' }}>Evaluation Pack cho Router + Model Eval</h4>
            <p className="ex-download-note">
              Tạo và tải ZIP gồm bộ SFT, Router calibration/test và Model Eval từ Dataset Version hiện tại.
            </p>
            <p className="ex-download-note" style={{ color: '#92400e' }}>
              Đây là pilot pack để chạy thử. Các reference answer cần được review độc lập trước khi dùng làm kết quả RP5 chính thức.
            </p>
            <button
              className="ex-btn-purple"
              onClick={handleCreateEvaluationPack}
              disabled={!splitResult?.train || !splitResult?.val || !splitResult?.test}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <FileJson size={14} /> Tạo Pack, tải ZIP và mở AutoTrain
            </button>
          </div>

          {/* Download Cards Row */}
          <div className="ex-download-row">
            <div className="ex-download-card">
              <h4>Download Multi-subject Split</h4>
              <p className="ex-download-stat">
                <span style={{ color: '#7c3aed' }}>Train: {splitResult ? (splitResult.train_count ?? splitResult.train?.length ?? 0) : '-'}</span>
                {' / '}
                <span style={{ color: '#10b981' }}>Val: {splitResult ? (splitResult.val_count ?? splitResult.val?.length ?? 0) : '-'}</span>
                {' / '}
                <span style={{ color: '#3b82f6' }}>Test: {splitResult ? (splitResult.test_count ?? splitResult.test?.length ?? 0) : '-'}</span>
              </p>
              <p className="ex-download-note">ZIP tổng chứa <code>math.train.json</code>, <code>math.validation.json</code>, <code>math.test.json</code>, <code>physical.train.json</code>... Dùng nút ZIP trong bảng Subject Distribution để tải gói upload AutoTrain riêng cho từng môn.</p>
              <button
                className="ex-btn-green"
                onClick={handleDownloadSplit}
              >
                <Download size={14} /> Download all subject files
              </button>
            </div>
            <div className="ex-download-card">
              <h4>Download Split Filter by Overall Score</h4>
              <div className="ex-score-row">
                <span className="ex-score-label">Overall Score ≥</span>
                <span className="ex-score-value">{exportMinScore.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={exportMinScore}
                onChange={(e) => setExportMinScore(Number(e.target.value))}
                className="sg-slider sg-slider-purple"
              />
              <button
                className="ex-btn-purple"
                onClick={handleDownloadFiltered}
              >
                <Download size={14} /> Download split overall &gt;= filter
              </button>
            </div>
          </div>

          {/* Push & Sync Row */}
          <div className="ex-push-row">
            <div className="ex-push-card">
              <h4>🔥 Push to Hugging Face Hub</h4>
              <label className="s6-field-label" style={{ marginTop: 0 }}>Hugging Face Token</label>
              <input
                className="s6-field-input"
                placeholder="hf_..."
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                style={{ borderLeft: '1px solid #e2e8f0' }}
              />
              <label className="s6-field-label">Repository ID</label>
              <input
                className="s6-field-input"
                placeholder="username/my-dataset"
                value={hfRepoId}
                onChange={(e) => setHfRepoId(e.target.value)}
                style={{ borderLeft: '1px solid #e2e8f0' }}
              />
              <label className="ex-checkbox-label">
                <input
                  type="checkbox"
                  checked={hfIsPrivate}
                  onChange={(e) => setHfIsPrivate(e.target.checked)}
                /> Make repository private
              </label>
              <button
                className="ex-btn-hub"
                onClick={handlePushToHub}
                disabled={isPushing}
              >
                {isPushing ? (
                  <>
                    <RefreshCw size={14} className="sep490-spin" style={{ marginRight: '6px' }} /> Pushing...
                  </>
                ) : pushSuccess ? (
                  <>
                    <CheckCircle2 size={14} style={{ marginRight: '6px' }} /> Pushed Successfully!
                  </>
                ) : (
                  <>
                    <Upload size={14} style={{ marginRight: '6px' }} /> Push to Hub
                  </>
                )}
              </button>
            </div>
            <div className="ex-cloud-card">
              <div className="ex-cloud-card-header">
                <div className="ex-cloud-icon-wrap">
                  <DownloadCloud size={22} />
                </div>
                <div className="ex-cloud-header-text">
                  <h4>Sync to Azure Blob Storage</h4>
                  <p>Push your dataset split directly to Azure Blob Storage for seamless integration with your ML pipeline.</p>
                </div>
              </div>

              <div className="ex-cloud-provider-badge">
                <div className="ex-cloud-azure-icon">
                  <svg width="18" height="18" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M33.338 6.544h26.038l-27.03 80.455a4.15 4.15 0 0 1-3.933 2.857H8.149a4.146 4.146 0 0 1-3.928-5.47L29.404 9.4a4.15 4.15 0 0 1 3.934-2.857z" fill="url(#azure-a)"/>
                    <path d="M71.175 60.261H41.617a1.91 1.91 0 0 0-1.305 3.309l21.32 20.013a4.15 4.15 0 0 0 2.846 1.13h22.468L71.175 60.26z" fill="#0078D4"/>
                    <path d="M33.338 6.544a4.12 4.12 0 0 0-3.943 2.898L4.252 84.384a4.146 4.146 0 0 0 3.897 5.472h21.26a4.12 4.12 0 0 0 3.33-2.897l5.076-14.81 17.636 16.57a4.18 4.18 0 0 0 2.715 1.137h22.336l-9.776-25.143-29.36.001 17.77-52.773h-25.8z" fill="url(#azure-b)"/>
                    <path d="M66.595 9.364a4.145 4.145 0 0 0-3.928-2.82H33.648a4.146 4.146 0 0 1 3.929 2.82l25.184 75.09a4.146 4.146 0 0 1-3.929 5.472h29.02a4.146 4.146 0 0 0 3.928-5.472L66.595 9.364z" fill="url(#azure-c)"/>
                    <defs>
                      <linearGradient id="azure-a" x1="46.817" y1="11.613" x2="23.202" y2="91.676" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#114A8B"/><stop offset="1" stopColor="#0669BC"/>
                      </linearGradient>
                      <linearGradient id="azure-b" x1="54.467" y1="49.393" x2="47.616" y2="52.039" gradientUnits="userSpaceOnUse">
                        <stop stopOpacity=".3"/><stop offset=".07" stopOpacity=".2"/><stop offset=".32" stopOpacity=".1"/><stop offset=".62" stopOpacity=".05"/><stop offset="1" stopOpacity="0"/>
                      </linearGradient>
                      <linearGradient id="azure-c" x1="52.075" y1="8.862" x2="76.318" y2="85.698" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#3CCBF4"/><stop offset="1" stopColor="#2892DF"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="ex-cloud-provider-info">
                  <span className="ex-cloud-provider-name">Azure Blob Storage</span>
                  <span className="ex-cloud-provider-status">
                    <span className="ex-cloud-status-dot"></span>
                    Ready to sync
                  </span>
                </div>
              </div>

              <div className="ex-cloud-details">
                <div className="ex-cloud-detail-item">
                  <span className="ex-cloud-detail-label">File Name</span>
                  <span className="ex-cloud-detail-value">{projectName || 'dataset'}_split.json</span>
                </div>
                <div className="ex-cloud-detail-item">
                  <span className="ex-cloud-detail-label">Dataset Size</span>
                  <span className="ex-cloud-detail-value">
                    {splitResult ? `${(splitResult.train_count || splitResult.train?.length || 0) + (splitResult.test_count || splitResult.test?.length || 0)} samples` : '—'}
                  </span>
                </div>
              </div>

              <button
                className={`ex-btn-azure ${syncSuccess ? 'ex-btn-azure-success' : ''}`}
                onClick={() => {
                  setCloudProvider('azure');
                  handleSyncToCloud();
                }}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <RefreshCw size={15} className="sep490-spin" /> Syncing to Azure...
                  </>
                ) : syncSuccess ? (
                  <>
                    <CheckCircle2 size={15} /> Synced Successfully!
                  </>
                ) : (
                  <>
                    <Upload size={15} /> Sync to Azure Blob
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="dataprep-actions-row">
        <button className="dataprep-btn-back" onClick={() => {
          if (currentSubStep6 > 12) {
            setCurrentSubStep6(currentSubStep6 - 1);
          } else {
            setCurrentStage(4);
          }
        }}>
          Back
        </button>
        <button className="s6-reset-btn" onClick={() => {
          localStorage.removeItem('current_version_id');
          window.location.reload();
        }}><RotateCcw size={14} /> Reset & Upload New</button>
        <button className="dataprep-btn-next" onClick={() => {
          if (currentSubStep6 < 14) {
            setCurrentSubStep6(currentSubStep6 + 1);
          }
        }}>
          Next
        </button>
      </div>
    </div>
  );
};
