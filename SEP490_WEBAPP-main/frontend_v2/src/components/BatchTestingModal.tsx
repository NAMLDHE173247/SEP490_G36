import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Play, Download, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';

interface BatchTestingModalProps {
  onClose: () => void;
  activeModelId: string;
  provider: string;
  params: any;
  instanceId: number;
  selectedRegistryId?: string;
  targets?: BatchModelTarget[];
  requiredTargetCount?: number;
}

export interface BatchModelTarget {
  modelId: string;
  provider: string;
  instanceId: number;
  registryId?: string;
  label?: string;
}

export function BatchTestingModal({ onClose, activeModelId, provider, params, instanceId, selectedRegistryId, targets, requiredTargetCount = 1 }: BatchTestingModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [inputColumn, setInputColumn] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [runMetadata, setRunMetadata] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string) => {
    const rows = text.split('\n').filter(r => r.trim());
    if (rows.length < 2) throw new Error("File CSV trống hoặc không đúng định dạng");
    const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const data = rows.slice(1).map(row => {
      const values = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ? values[i].replace(/^"|"$/g, '').trim() : '';
      });
      return obj;
    });
    return { headers, data };
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    const text = await selectedFile.text();
    try {
      if (selectedFile.name.endsWith('.json')) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("File JSON phải chứa một mảng (array) các object");
        setTestCases(data);
        if (data.length > 0) {
          setColumns(Object.keys(data[0]));
          setInputColumn(Object.keys(data[0])[0]);
        }
      } else if (selectedFile.name.endsWith('.csv')) {
        const { headers, data } = parseCSV(text);
        setTestCases(data);
        setColumns(headers);
        setInputColumn(headers[0]);
      } else {
        toast.error("Chỉ hỗ trợ file .json hoặc .csv");
      }
    } catch (err: any) {
      toast.error(`Lỗi đọc file: ${err.message}`);
      setFile(null);
    }
  };

  const handleStartBatch = async () => {
    const fallbackTarget: BatchModelTarget = { modelId: activeModelId, provider, instanceId, registryId: selectedRegistryId, label: "Model 1" };
    const runTargets = (targets?.length ? targets : [fallbackTarget]).filter((target) => {
      const isExternal = !["local", "registry", "hybrid"].includes(target.provider);
      return Boolean(target.modelId) || isExternal || target.provider === "hybrid";
    });
    if (runTargets.length === 0) {
      toast.error("Vui lòng Load Model trước khi chạy kiểm thử!");
      return;
    }
    if (runTargets.length < requiredTargetCount) {
      toast.error(`Vui lòng Load đủ ${requiredTargetCount} model trước khi chạy kiểm thử so sánh!`);
      return;
    }
    if (testCases.length === 0 || !inputColumn) {
      toast.error("Dữ liệu không hợp lệ");
      return;
    }

    setIsTesting(true);
    setProgress({ current: 0, total: testCases.length * runTargets.length });
    const newResults = [];
    const startedAt = new Date().toISOString();

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const textInput = tc[inputColumn];

      const outputs = await Promise.all(runTargets.map(async (target) => {
        const targetIsHybrid = target.provider === "hybrid";
        const requestStarted = performance.now();
        let aiResponse = "";
        let error: string | null = null;
        let routing: any = null;
        let retryCount = 0;
        const maxRetries = 2;
        const isTransientGatewayError = (message: string) => /bad gateway|502|503|504|tunnel unavailable|gateway timeout/i.test(message);
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (!textInput) throw new Error("Input rỗng");
            let streamResponse = "";
            const res = await apiService.inferStream({
              text_input: textInput,
              hf_hub_id: targetIsHybrid ? undefined : (target.modelId || undefined),
              routing_mode: targetIsHybrid ? "hybrid" : undefined,
              history: Array.isArray(tc.history) ? tc.history : undefined,
              previous_subject: typeof tc.previous_subject === "string" ? tc.previous_subject : undefined,
              instanceId: target.instanceId,
              modelRegistryId: target.provider === "registry" ? target.registryId : undefined,
              system_prompt: params.systemPrompt || undefined,
              max_new_tokens: params.maxNewTokens === "" ? undefined : params.maxNewTokens,
              temperature: params.temperature === "" ? undefined : params.temperature,
              top_k: params.topK === "" ? undefined : params.topK,
              top_p: params.topP === "" ? undefined : params.topP,
              repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
              provider: target.provider === "local" || target.provider === "registry" || targetIsHybrid ? undefined : target.provider,
              onFinalInfo: (info: any) => {
                routing = info?.routing || null;
              },
            }, (chunk: string) => {
              streamResponse += chunk;
            });
            aiResponse = streamResponse || (typeof res === 'string' ? res : JSON.stringify(res || {}));
            error = null;
            break;
          } catch (err: any) {
            error = err.response?.data?.error || err.message || String(err);
            if (!isTransientGatewayError(error) || attempt === maxRetries) break;
            retryCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
          }
        }
        if (error) aiResponse = `[LỖI] ${error}`;
        return {
          ...tc,
          "AI_Response": aiResponse,
          "Model": target.modelId || target.provider,
          "Model_Label": target.label || target.modelId || target.provider,
          "Provider": target.provider,
          "Instance_Id": target.instanceId,
          "Response_Time_Ms": Math.round(performance.now() - requestStarted),
          "Retry_Count": retryCount,
          "Inference_Status": error ? "error" : "success",
          "Inference_Error": error,
          "Routing": routing,
        };
      }));
      newResults.push(...outputs);
      setProgress({ current: (i + 1) * runTargets.length, total: testCases.length * runTargets.length });
    }

    setResults(newResults);
    setRunMetadata({
      schema_version: "batch-test-v2",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      source_file: file?.name || null,
      input_column: inputColumn,
      test_case_count: testCases.length,
      models: runTargets.map((target) => ({
        label: target.label || target.modelId || target.provider,
        model_id: target.modelId || null,
        provider: target.provider,
        registry_id: target.registryId || null,
        instance_id: target.instanceId,
      })),
      inference_parameters: {
        system_prompt: params.systemPrompt || null,
        max_new_tokens: params.maxNewTokens === "" ? null : params.maxNewTokens,
        temperature: params.temperature === "" ? null : params.temperature,
        top_k: params.topK === "" ? null : params.topK,
        top_p: params.topP === "" ? null : params.topP,
        repetition_penalty: params.repetitionPenalty === "" ? null : params.repetitionPenalty,
      },
      success_count: newResults.filter((row: any) => row.Inference_Status === "success").length,
      error_count: newResults.filter((row: any) => row.Inference_Status === "error").length,
    });
    setIsTesting(false);
    toast.success("Đã hoàn thành kiểm thử hàng loạt!");
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const exportPayload = { metadata: runMetadata, results };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const safeModel = runMetadata?.models?.length > 1 ? "comparison" : String(activeModelId || provider || "model").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadAnchorNode.setAttribute("download", `batch_results_${safeModel}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return createPortal(
    <div className="batch-modal-overlay" onMouseDown={onClose}>
      <div className="batch-modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={24} color="var(--primary)" /> Kiểm Thử Hàng Loạt (Batch Testing)
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X /></button>
        </div>

        {!file ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-elevated)', transition: 'all 0.2s' }}
          >
            <Upload size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Tải lên file Test Case</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Hỗ trợ định dạng .json hoặc .csv</p>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.csv" style={{ display: 'none' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-elevated)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 600 }}>{file.name}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{testCases.length} bản ghi</p>
              </div>
              {!isTesting && results.length === 0 && (
                <button onClick={() => setFile(null)} style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}>Thay đổi</button>
              )}
            </div>

            {!isTesting && results.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label>Cột chứa câu hỏi (Input Text):</label>
                <select value={inputColumn} onChange={(e) => setInputColumn(e.target.value)} style={{ padding: '8px', borderRadius: '4px' }}>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {isTesting && (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 16px', color: 'var(--primary)' }} />
                <p style={{ fontWeight: 600, marginBottom: '8px' }}>Đang chạy kiểm thử...</p>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(progress.current / progress.total) * 100}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.3s' }} />
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>{progress.current} / {progress.total} hoàn thành</p>
              </div>
            )}

            {results.length > 0 && !isTesting && (
              <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#ecfdf5', borderRadius: '8px' }}>
                <CheckCircle2 size={32} color="#10b981" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontWeight: 600, color: '#10b981', marginBottom: '16px' }}>Đã hoàn tất {results.length} bản ghi</p>
                <button onClick={handleDownload} style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={16} /> Tải Kết Quả (.json)
                </button>
              </div>
            )}

            {!isTesting && results.length === 0 && (
              <button onClick={handleStartBatch} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Play size={18} /> Bắt đầu chạy
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

