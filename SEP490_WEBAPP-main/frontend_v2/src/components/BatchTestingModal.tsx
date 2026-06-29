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
}

export function BatchTestingModal({ onClose, activeModelId, provider, params, instanceId, selectedRegistryId }: BatchTestingModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [inputColumn, setInputColumn] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<any[]>([]);
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
    if (!activeModelId && provider !== "openrouter" && provider !== "openrouter") {
      toast.error("Vui lòng Load Model trước khi chạy kiểm thử!");
      return;
    }
    if (testCases.length === 0 || !inputColumn) {
      toast.error("Dữ liệu không hợp lệ");
      return;
    }

    setIsTesting(true);
    setProgress({ current: 0, total: testCases.length });
    const newResults = [];

    const options = {
      instanceId,
      modelRegistryId: provider === "registry" ? selectedRegistryId : undefined,
      system_prompt: params.systemPrompt || undefined,
      max_new_tokens: params.maxNewTokens === "" ? undefined : params.maxNewTokens,
      temperature: params.temperature === "" ? undefined : params.temperature,
      top_k: params.topK === "" ? undefined : params.topK,
      top_p: params.topP === "" ? undefined : params.topP,
      repetition_penalty: params.repetitionPenalty === "" ? undefined : params.repetitionPenalty,
      provider: provider === "local" || provider === "registry" ? undefined : provider,
    };

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const textInput = tc[inputColumn];
      
      let aiResponse = "";
      try {
        if (!textInput) throw new Error("Input rỗng");
        const res = await apiService.infer(textInput, activeModelId, provider);
        aiResponse = typeof res === 'string' ? res : (res.text || res.result || JSON.stringify(res));
      } catch (err: any) {
        aiResponse = `[LỖI] ${err.message}`;
      }

      newResults.push({
        ...tc,
        "AI_Response": aiResponse,
        "Model": activeModelId || provider
      });
      setProgress({ current: i + 1, total: testCases.length });
    }

    setResults(newResults);
    setIsTesting(false);
    toast.success("Đã hoàn thành kiểm thử hàng loạt!");
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "batch_results.json");
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

