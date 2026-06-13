// ============================================================
// StepDataset — AutoTrain Wizard Step 1: Dataset Selection
// ============================================================

import React, { useState, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Upload,
  CheckCircle2,
  Download,
  Search,
  Database,
  Table2,
  ChevronRight,
  FileText,
  Cloud,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  TrainingConfig,
  PreviewData,
  PreviewRow,
  EMPTY_PREVIEW,
  formatRowPreview,
} from './types';
import { getAuthToken } from '../../services/authSession';

// ── Props ──
interface StepDatasetProps {
  config: TrainingConfig;
  onConfigChange: (updates: Partial<TrainingConfig>) => void;
  previewData: PreviewData;
  onPreviewDataChange: (data: PreviewData) => void;
  onNext: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

// ── HuggingFace types ──
interface HfRepo {
  id: string;
  lastModified?: string;
}

// ── CSV parser (handles quoted fields with commas / newlines) ──
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field.trim());
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        current.push(field.trim());
        if (current.some(c => c.length > 0)) rows.push(current);
        current = [];
        field = '';
        if (ch === '\r') i++; // skip \n after \r
      } else {
        field += ch;
      }
    }
  }
  // last field
  current.push(field.trim());
  if (current.some(c => c.length > 0)) rows.push(current);

  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map(cols => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
}

// ── Auto-detect best column for training ──
const AUTO_DETECT_COLUMNS = ['messages', 'text', 'conversations', 'instruction', 'turns', 'prompt'];

function detectColumn(headers: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase());
  for (const candidate of AUTO_DETECT_COLUMNS) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ── Generate sample CSV for download ──
function downloadSampleCSV() {
  const BOM = '\uFEFF';
  const csv = `${BOM}instruction,input,output
"What is 2+2?","","4. Two plus two equals four."
"Explain photosynthesis.","","Photosynthesis is the process by which green plants convert sunlight, water, and carbon dioxide into glucose and oxygen."
"Translate to French: Hello","Hello","Bonjour"
"What is the capital of Japan?","","The capital of Japan is Tokyo."
"Summarize: The quick brown fox jumps over the lazy dog.","The quick brown fox jumps over the lazy dog.","A fox jumps over a dog."`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_training_data.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Component ──
const StepDataset: React.FC<StepDatasetProps> = ({
  config,
  onConfigChange,
  previewData,
  onPreviewDataChange,
  onNext,
  toast,
}) => {
  // ── Local state ──
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [fetchingHf, setFetchingHf] = useState(false);
  const [hfUsername, setHfUsername] = useState('');
  const [hfDatasets, setHfDatasets] = useState<HfRepo[]>([]);
  const [hfModels, setHfModels] = useState<HfRepo[]>([]);
  const [cloudProvider, setCloudProvider] = useState<'gcs' | 'azure'>('gcs');
  const [previewOpen, setPreviewOpen] = useState(true);

  // Cloud file fetch states
  const [cloudUrl, setCloudUrl] = useState('');
  const [fetchingCloud, setFetchingCloud] = useState(false);
  const [cloudFileDetails, setCloudFileDetails] = useState<{ name: string; size: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // ── File parsing ──
  const processFile = useCallback(
    async (file: File) => {
      // Size check
      if (file.size > 50 * 1024 * 1024) {
        toast('File exceeds 50 MB. Large files may slow down training setup.', 'error');
      }

      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['json', 'jsonl', 'csv'].includes(ext ?? '')) {
        toast('Unsupported file type. Please use .json, .jsonl, or .csv', 'error');
        return;
      }

      onConfigChange({ localFile: file, datasetSource: 'local' });

      try {
        // Read only first 500 KB
        const slice = file.slice(0, 500 * 1024);
        const text = await slice.text();

        let records: any[] = [];

        if (ext === 'json') {
          const parsed = JSON.parse(text);
          records = Array.isArray(parsed) ? parsed : [parsed];
        } else if (ext === 'jsonl') {
          records = text
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean);
        } else if (ext === 'csv') {
          records = parseCSV(text);
        }

        if (records.length === 0) {
          toast('Could not parse any records from the file.', 'error');
          onPreviewDataChange(EMPTY_PREVIEW);
          return;
        }

        // Extract headers
        const headers =
          records.length > 0 && typeof records[0] === 'object' && !Array.isArray(records[0])
            ? Object.keys(records[0])
            : [];

        // Auto-detect column mapping
        const detected = detectColumn(headers);
        if (detected) {
          onConfigChange({ columnMapping: detected });
        }

        // Stats
        const totalRecords = records.length;
        const totalTokens = Math.round(text.length / 4);

        // Preview rows
        const previewRows: PreviewRow[] = records.slice(0, 5).map(r => {
          if (detected && r[detected]) {
            const value = r[detected];
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                return formatRowPreview(parsed);
              } catch {
                return formatRowPreview(r);
              }
            }
            if (Array.isArray(value)) {
              return formatRowPreview(value);
            }
          }
          return formatRowPreview(r);
        });

        onPreviewDataChange({
          rows: previewRows,
          totalRecords,
          totalTokens,
          headers,
        });

        toast(`Loaded ${totalRecords.toLocaleString()} records from ${file.name}`, 'success');
      } catch (err) {
        console.error('File parse error:', err);
        toast('Failed to parse file. Check the format and try again.', 'error');
        onPreviewDataChange(EMPTY_PREVIEW);
      }
    },
    [onConfigChange, onPreviewDataChange, toast],
  );

  // ── Drag & Drop ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
      e.target.value = '';
    },
    [processFile],
  );

  // ── HuggingFace fetch ──
  const fetchHfRepos = useCallback(async () => {
    const username = hfUsername.trim();
    if (!username) {
      toast('Please enter a HuggingFace username.', 'info');
      return;
    }

    setFetchingHf(true);
    setHfDatasets([]);
    setHfModels([]);

    try {
      const [dsRes, mdRes] = await Promise.allSettled([
        axios.get<HfRepo[]>(`https://huggingface.co/api/datasets?author=${username}&limit=20`),
        axios.get<HfRepo[]>(`https://huggingface.co/api/models?author=${username}&limit=10`),
      ]);

      if (dsRes.status === 'fulfilled') {
        setHfDatasets(dsRes.value.data ?? []);
      }
      if (mdRes.status === 'fulfilled') {
        setHfModels(mdRes.value.data ?? []);
      }

      if (
        (dsRes.status === 'fulfilled' && dsRes.value.data.length === 0) &&
        (mdRes.status === 'fulfilled' && mdRes.value.data.length === 0)
      ) {
        toast(`No public datasets or models found for "${username}".`, 'info');
      }
    } catch {
      toast('Failed to fetch from HuggingFace. Check the username and try again.', 'error');
    } finally {
      setFetchingHf(false);
    }
  }, [hfUsername, toast]);

  const selectHfDataset = useCallback(
    async (repoId: string) => {
      onConfigChange({ selectedHfDataset: repoId, datasetSource: 'hub' });

      try {
        const [rowsRes, infoRes] = await Promise.allSettled([
          axios.get(
            `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(repoId)}&config=default&split=train&limit=5`,
          ),
          axios.get(
            `https://datasets-server.huggingface.co/info?dataset=${encodeURIComponent(repoId)}`,
          ),
        ]);

        let rows: PreviewRow[] = [];
        let headers: string[] = [];
        let totalRecords: number | null = null;
        let totalTokens: number | null = null;

        if (rowsRes.status === 'fulfilled') {
          const data = rowsRes.value.data;
          const rawRows: any[] = data?.rows ?? [];
          rows = rawRows.map((r: any) => formatRowPreview(r.row ?? r));

          if (data?.features) {
            headers = data.features.map((f: any) => f.name ?? f.feature_name ?? '');
          } else if (rawRows.length > 0) {
            const first = rawRows[0].row ?? rawRows[0];
            if (first && typeof first === 'object') {
              headers = Object.keys(first);
            }
          }
        }

        if (infoRes.status === 'fulfilled') {
          const info = infoRes.value.data;
          const datasetInfo = info?.dataset_info;
          if (datasetInfo) {
            const configs = Object.values(datasetInfo) as any[];
            for (const cfg of configs) {
              const splits = cfg?.splits;
              if (splits) {
                const trainSplit = splits.train ?? Object.values(splits)[0] as any;
                if (trainSplit?.num_examples) {
                  totalRecords = trainSplit.num_examples;
                } else if (trainSplit?.num_rows) {
                  totalRecords = trainSplit.num_rows;
                }
                if (trainSplit?.num_bytes) {
                  totalTokens = Math.round(trainSplit.num_bytes / 4);
                }
                break;
              }
            }
          }
        }

        const detected = detectColumn(headers);
        if (detected) {
          onConfigChange({ columnMapping: detected });
        }

        onPreviewDataChange({ rows, headers, totalRecords, totalTokens });
        toast(`Loaded preview for ${repoId}`, 'success');
      } catch {
        onPreviewDataChange({
          rows: [{ instruction: 'Preview unavailable', input: '', output: '' }],
          headers: [],
          totalRecords: null,
          totalTokens: null,
        });
        toast('Could not fetch preview for this dataset. It may require authentication.', 'error');
      }
    },
    [onConfigChange, onPreviewDataChange, toast],
  );

  const autoDetected = useMemo(() => {
    if (previewData.headers.length === 0) return null;
    return detectColumn(previewData.headers);
  }, [previewData.headers]);

  const handleNext = useCallback(() => {
    const errors: Record<string, string> = {};

    if (!config.projectName.trim()) {
      errors.projectName = 'Project name is required.';
    }

    const hasDataset =
      (config.datasetSource === 'local' && config.localFile) ||
      (config.datasetSource === 'cloud' && config.cloudLoadedDataset) ||
      (config.datasetSource === 'hub' && config.selectedHfDataset);

    if (!hasDataset) {
      errors.dataset = 'Please upload a file, fetch a cloud dataset, or select a HuggingFace dataset.';
    }

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      toast('Please fix the errors before continuing.', 'error');
      return;
    }

    onNext();
  }, [config, onNext, toast]);

  const fetchCloudDataset = useCallback(async () => {
    const trimmed = cloudUrl.trim();
    if (!trimmed) {
      toast('Please enter a Google Drive link or download URL.', 'error');
      return;
    }

    setFetchingCloud(true);
    try {
      const token = getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.post('/api/train/download-cloud', { url: trimmed }, { headers });
      const data = response.data;
      
      onConfigChange({
        cloudLoadedDataset: data.tempFilePath,
        datasetSource: 'cloud'
      });

      setCloudFileDetails({
        name: data.filename,
        size: data.size
      });

      onPreviewDataChange({
        rows: data.previewRows,
        totalRecords: data.totalRecords,
        totalTokens: data.totalTokens,
        headers: data.headers
      });

      if (data.columnMapping) {
        onConfigChange({ columnMapping: data.columnMapping });
      }

      toast(`Successfully fetched dataset: ${data.filename}`, 'success');
    } catch (err: any) {
      console.error('Fetch cloud dataset error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to download cloud file';
      toast(errMsg, 'error');
    } finally {
      setFetchingCloud(false);
    }
  }, [cloudUrl, onConfigChange, onPreviewDataChange, toast]);

  const hasFile = !!config.localFile;

  return (
    <div className="at-wizard-layout-2col">
      {/* ── Left Column: Config Panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Project Name Panel */}
        <div className="at-panel">
          <div className="at-panel-body">
            <div className="at-form-group primary">
              <label className="at-label">
                Project Name <span className="at-required">*</span>
              </label>
              <input
                type="text"
                className={`at-input ${validationErrors.projectName ? 'at-input-error' : ''}`}
                placeholder="e.g. my-socratic-math-tutor"
                value={config.projectName}
                onChange={e => {
                  onConfigChange({ projectName: e.target.value });
                  if (validationErrors.projectName) {
                    setValidationErrors(prev => {
                      const next = { ...prev };
                      delete next.projectName;
                      return next;
                    });
                  }
                }}
                aria-label="Project name"
              />
              {validationErrors.projectName && (
                <span className="at-field-error">{validationErrors.projectName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Dataset Source Panel */}
        <div className="at-panel">
          <div className="at-panel-header">
            <div className="at-panel-header-left">
              <Database size={16} className="at-icon" />
              <h3>Dataset Source</h3>
            </div>
          </div>
          <div className="at-panel-body">
            {/* Segmented Control */}
            <div className="at-segmented">
              <button
                type="button"
                className={`at-seg-btn ${config.datasetSource === 'local' ? 'active' : ''}`}
                onClick={() => onConfigChange({ datasetSource: 'local' })}
                aria-label="Local upload"
              >
                <Upload size={14} /> Local
              </button>
              <button
                type="button"
                className={`at-seg-btn ${config.datasetSource === 'hub' ? 'active' : ''}`}
                onClick={() => onConfigChange({ datasetSource: 'hub' })}
                aria-label="HuggingFace Hub"
              >
                🤗 HuggingFace
              </button>
              <button
                type="button"
                className={`at-seg-btn ${config.datasetSource === 'cloud' ? 'active' : ''}`}
                onClick={() => onConfigChange({ datasetSource: 'cloud' })}
                aria-label="Cloud storage"
              >
                <Cloud size={14} /> Cloud
              </button>
            </div>

            {/* Local Upload Tab */}
            {config.datasetSource === 'local' && (
              <div>
                <div
                  className={`at-dropzone ${hasFile ? 'has-file' : ''} ${isDragging ? 'at-dropzone-dragover' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Drop a file here or click to browse"
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.jsonl,.csv"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                    aria-hidden="true"
                  />

                  {hasFile ? (
                    <>
                      <CheckCircle2 size={28} className="at-dropzone-icon" style={{ color: 'var(--at-green)' }} />
                      <span className="at-dropzone-text" style={{ color: 'var(--at-green)' }}>
                        {config.localFile!.name}
                      </span>
                      <span className="at-dropzone-hint">
                        {(config.localFile!.size / 1024).toFixed(1)} KB — Click/drop to replace
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={28} className="at-dropzone-icon" />
                      <span className="at-dropzone-text">
                        {isDragging ? 'Drop file here…' : 'Drag & drop file, or click to browse'}
                      </span>
                      <span className="at-dropzone-hint">Accepts .json, .jsonl, .csv (max 50 MB)</span>
                    </>
                  )}
                </div>

                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="at-btn-history"
                    style={{ borderStyle: 'dashed', width: '100%', justifyContent: 'center' }}
                    onClick={e => {
                      e.stopPropagation();
                      downloadSampleCSV();
                      toast('Sample CSV downloaded!', 'info');
                    }}
                  >
                    <Download size={13} /> Download Sample CSV
                  </button>
                </div>
              </div>
            )}

            {/* HuggingFace Hub Tab */}
            {config.datasetSource === 'hub' && (
              <div className="at-hf-panel">
                <div className="at-hf-search-row">
                  <input
                    type="text"
                    className="at-input"
                    placeholder="HuggingFace username (e.g. tatsu-lab)"
                    value={hfUsername}
                    onChange={e => setHfUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchHfRepos()}
                    aria-label="HuggingFace username"
                  />
                  <button
                    type="button"
                    className="at-btn-primary"
                    disabled={fetchingHf}
                    onClick={fetchHfRepos}
                    style={{ padding: '8px 16px' }}
                  >
                    {fetchingHf ? 'Fetching…' : <Search size={14} />}
                  </button>
                </div>

                {hfDatasets.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="at-hf-section-title">
                      Datasets ({hfDatasets.length})
                    </span>
                    <div className="at-hf-grid" style={{ maxHeight: 150, overflowY: 'auto', padding: 2 }}>
                      {hfDatasets.map(ds => (
                        <button
                          key={ds.id}
                          type="button"
                          className={`at-hf-item ${config.selectedHfDataset === ds.id ? 'selected' : ''}`}
                          onClick={() => selectHfDataset(ds.id)}
                        >
                          {ds.id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hfModels.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span className="at-hf-section-title">
                      Models ({hfModels.length})
                    </span>
                    <div className="at-hf-grid" style={{ maxHeight: 100, overflowY: 'auto', padding: 2 }}>
                      {hfModels.map(m => (
                        <span key={m.id} className="at-hf-item" style={{ cursor: 'default', opacity: 0.6 }}>
                          {m.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!fetchingHf && hfDatasets.length === 0 && hfModels.length === 0 && (
                  <div className="at-empty-state">
                    <span className="at-empty-text">Fetch user repositories</span>
                    <span className="at-empty-hint">Try "tatsu-lab" or "HuggingFaceTB".</span>
                  </div>
                )}
              </div>
            )}

            {/* Cloud Tab (Google Drive / Direct URL) */}
            {config.datasetSource === 'cloud' && (
              <div className="at-cloud-panel">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="at-form-group">
                    <label className="at-label">
                      Google Drive Link or Cloud URL
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className="at-input"
                        placeholder="Paste Google Drive sharing link or direct download URL..."
                        value={cloudUrl}
                        onChange={e => setCloudUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && fetchCloudDataset()}
                        aria-label="Cloud dataset URL"
                      />
                      <button
                        type="button"
                        className="at-btn-primary"
                        disabled={fetchingCloud}
                        onClick={fetchCloudDataset}
                        style={{ padding: '8px 16px', minWidth: 100 }}
                      >
                        {fetchingCloud ? 'Fetching…' : 'Fetch'}
                      </button>
                    </div>
                    <span className="at-empty-hint" style={{ marginTop: 4 }}>
                      Supports Google Drive file sharing links and direct file download URLs (.json, .jsonl, .csv).
                    </span>
                  </div>

                  {cloudFileDetails && config.cloudLoadedDataset && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: 'var(--at-green-bg)',
                        border: '1px solid var(--at-green-border)',
                        borderRadius: 'var(--at-radius)',
                        marginTop: 4,
                      }}
                    >
                      <CheckCircle2 size={18} style={{ color: 'var(--at-green)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--at-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cloudFileDetails.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--at-text-muted)', marginTop: 2 }}>
                          {(cloudFileDetails.size / 1024).toFixed(1)} KB — Loaded successfully
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {validationErrors.dataset && (
              <span className="at-field-error" style={{ marginTop: 12, display: 'block' }}>
                {validationErrors.dataset}
              </span>
            )}
          </div>
        </div>

        {/* Column Mapping Panel */}
        {previewData.headers.length > 0 && (
          <div className="at-panel">
            <div className="at-panel-body">
              <div className="at-form-group">
                <label className="at-label">Training Data Column</label>
                {autoDetected ? (
                  <div className="at-auto-detect-success">
                    <CheckCircle2 size={14} style={{ color: 'var(--at-green)' }} />
                    Auto-detected column: <strong>{autoDetected}</strong>
                  </div>
                ) : (
                  <select
                    className="at-select"
                    value={config.columnMapping}
                    onChange={e => onConfigChange({ columnMapping: e.target.value })}
                    aria-label="Select training data column"
                  >
                    {previewData.headers.map(h => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Column: Data Preview & Next ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="at-panel" style={{ minHeight: '340px', display: 'flex', flexDirection: 'column' }}>
          <div className="at-panel-header">
            <div className="at-panel-header-left">
              <Table2 size={16} className="at-icon" />
              <h3>Data Preview</h3>
            </div>
            {previewData.rows.length > 0 && (
              <button
                type="button"
                className="at-btn-icon-sm"
                onClick={() => setPreviewOpen(p => !p)}
                aria-label={previewOpen ? 'Collapse preview' : 'Expand preview'}
              >
                {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>

          <div className="at-panel-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
            {previewData.rows.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
                {/* Stats row */}
                <div className="at-badge-row">
                  {previewData.totalRecords != null && (
                    <span className="at-badge at-badge-green">
                      {previewData.totalRecords.toLocaleString()} rows
                    </span>
                  )}
                  {previewData.totalTokens != null && (
                    <span className="at-badge at-badge-blue">
                      ~{previewData.totalTokens.toLocaleString()} tokens
                    </span>
                  )}
                </div>

                {/* Table */}
                {previewOpen && (
                  <div className="at-preview-table-wrap" style={{ flex: 1, minHeight: '200px' }}>
                    <table className="at-preview-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40%' }}>Instruction</th>
                          <th style={{ width: '30%' }}>Input</th>
                          <th style={{ width: '30%' }}>Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.rows.map((row, i) => (
                          <tr key={i}>
                            <td title={row.instruction} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                              {row.instruction}
                            </td>
                            <td title={row.input} style={{ whiteSpace: 'normal', color: 'var(--at-text-muted)', wordBreak: 'break-word' }}>
                              {row.input || '—'}
                            </td>
                            <td title={row.output} style={{ whiteSpace: 'normal', color: 'var(--at-green)', wordBreak: 'break-word' }}>
                              {row.output || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* Empty state placeholder */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  height: '100%',
                  color: 'var(--at-text-dim)',
                  border: '1px dashed var(--at-border)',
                  borderRadius: 'var(--at-radius)',
                  padding: '40px 20px',
                  background: '#FCFCFD',
                }}
              >
                <Table2 size={36} style={{ marginBottom: 12, color: 'var(--at-text-dim)' }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--at-text-secondary)', textAlign: 'center' }}>
                  No dataset selected
                </p>
                <span style={{ fontSize: 12, color: 'var(--at-text-muted)', textAlign: 'center', marginTop: 4, maxWidth: '280px', lineHeight: 1.4 }}>
                  Configure your dataset source on the left to see a content preview of your training data here.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Action */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            className="at-btn-primary"
            style={{ padding: '12px 28px', fontSize: 14, fontWeight: 700 }}
            onClick={handleNext}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StepDataset;
