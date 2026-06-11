import React, { useEffect, useState, useCallback } from 'react';
import { api, apiService } from '../services/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import {
  BarChart2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  ClipboardList,
  History,
  FileText
} from 'lucide-react';
import '../styles/history.css';

interface TrainingHistoryItem {
  _id: string;
  jobId: string;
  projectName: string;
  baseModel: string;
  datasetSource: string;
  datasetName: string;
  columnMapping: string;
  systemPrompt?: string;
  systemPromptVersion?: string;
  datasetVersionId?: string;
  parameters: {
    batchSize: number;
    epochs: number;
    learningRate: number;
    blockSize: number;
    modelMaxLength: number;
    r: number;
    lora_alpha: number;
    lora_dropout: number;
    random_state: number;
    gradient_accumulation_steps: number;
    warmup_steps: number;
    weight_decay: number;
    seed: number;
    early_stopping_loss: number;
    early_stopping_patience: number;
    optim: string;
    lr_scheduler_type: string;
  };
  pushToHub: boolean;
  hfRepoId: string;
  status: string;
  finalMetrics?: {
    loss: number;
    eval_loss?: number;
    accuracy: number;
    vram: number;
    gpu_util: number;
  };
  lastLogLine?: string;
  trainingDuration: number;
  startedAt: string;
  completedAt?: string;
  lossHistory?: { progress: number; loss: number }[];
  evalLossHistory?: { progress: number; loss: number }[];
  createdAt: string;
  latest_checkpoint_file_id?: string;
  workerUrl?: string;
  totalTokens?: number;
  totalRecords?: number;
}

interface TrainingHistoryViewProps {
  setActiveTab: (tab: string) => void;
}

const LINE_COLORS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function TrainingHistoryView({ setActiveTab }: TrainingHistoryViewProps) {
  const [histories, setHistories] = useState<TrainingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState<string | null>(null);

  // Filter state
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Multi-run Checked items
  const [checkedJobIds, setCheckedJobIds] = useState<string[]>([]);

  // Registry state for Register Modal
  const [registries, setRegistries] = useState<any[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState<string | null>(null); // jobId
  const [selectedRegistryId, setSelectedRegistryId] = useState<string>('');
  const [versionName, setVersionName] = useState<string>('v1.0.0');
  const [promptVersion, setPromptVersion] = useState<string>('Default');
  const [jobEvaluations, setJobEvaluations] = useState<any[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string>('');
  const [registering, setRegistering] = useState(false);

  // Fetch base models
  const fetchBaseModels = useCallback(async () => {
    try {
      const res = await api.get('/train/history/models');
      if (Array.isArray(res.data)) {
        setBaseModels(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch base models:', err);
    }
  }, []);

  // Fetch model registries
  const fetchRegistries = useCallback(async () => {
    try {
      const data = await apiService.listModelRegistries();
      setRegistries(data);
      if (data.length > 0) setSelectedRegistryId(data[0]._id);
    } catch (err) {
      console.error('Failed to fetch registries:', err);
    }
  }, []);

  // Fetch training history list
  const fetchHistories = useCallback(async (modelFilter?: string) => {
    setLoading(true);
    try {
      const url = modelFilter
        ? `/train/history?baseModel=${encodeURIComponent(modelFilter)}`
        : '/train/history';
      const res = await api.get(url);
      setHistories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch training history:', err);
      setHistories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBaseModels();
    fetchHistories();
    fetchRegistries();
  }, [fetchBaseModels, fetchHistories, fetchRegistries]);

  // Model filter handler
  const handleModelFilterChange = (model: string) => {
    setSelectedModel(model);
    setExpandedId(null);
    setCheckedJobIds([]); // Clear selection on filter
    fetchHistories(model || undefined);
  };

  // Toggle multi-run run checkbox
  const handleCheckboxToggle = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation(); // Prevent expanding details when clicking checkbox
    setCheckedJobIds(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  };

  // Delete run
  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa bản ghi training này không?')) return;
    setDeleteLoading(jobId);
    try {
      await api.delete(`/train/history/${jobId}`);
      setHistories(prev => prev.filter(h => h.jobId !== jobId));
      setCheckedJobIds(prev => prev.filter(id => id !== jobId));
      if (expandedId === jobId) setExpandedId(null);
      fetchBaseModels();
    } catch (err) {
      console.error('Failed to delete history record:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Resume training
  const handleResume = async (e: React.MouseEvent, item: TrainingHistoryItem) => {
    e.stopPropagation();
    setResumeLoading(item.jobId);
    try {
      const res = await api.post(`/train/resume/${item.jobId}`);
      if (res.data && res.data.job_id) {
        // Save the jobId to trigger tracking inside AutoTrainView
        localStorage.setItem('autotrain_resume_job_id', res.data.job_id);
        setActiveTab('AutoTrain');
      } else {
        throw new Error('Không nhận được Job ID mới từ backend');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Khôi phục Job thất bại');
    } finally {
      setResumeLoading(null);
    }
  };

  // Register model version modal
  const openRegisterModal = async (e: React.MouseEvent, item: TrainingHistoryItem) => {
    e.stopPropagation();
    setShowRegisterModal(item.jobId);
    setVersionName('v1.0.0');
    setPromptVersion(item.systemPromptVersion || 'Default');
    setSelectedEvalId('');
    setJobEvaluations([]);

    try {
      const evals = await apiService.getEvaluationsByJob(item.jobId);
      setJobEvaluations(evals);
      if (evals.length > 0) {
        setSelectedEvalId(evals[0]._id);
      }
    } catch (error) {
      console.error('Error fetching job evaluations:', error);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!selectedRegistryId) {
      alert('Vui lòng tạo hoặc chọn Model Registry trước.');
      return;
    }
    const item = histories.find(h => h.jobId === showRegisterModal);
    if (!item) return;

    setRegistering(true);
    try {
      await apiService.registerModelVersion({
        modelRegistryId: selectedRegistryId,
        version: versionName,
        trainingHistoryId: item._id,
        evaluationId: selectedEvalId || undefined,
        hfRepoId: item.hfRepoId,
        promptVersion: promptVersion,
        notes: `Đăng ký từ Training Job: ${item.jobId}`,
      });
      alert('Đăng ký phiên bản Model thành công!');
      setShowRegisterModal(null);
    } catch (err: any) {
      alert('Lỗi đăng ký model: ' + (err.response?.data?.message || err.message));
    } finally {
      setRegistering(false);
    }
  };

  // Compute Loss curves data for Checked Items comparison
  const checkedRuns = histories.filter(h => checkedJobIds.includes(h.jobId));
  
  const multiChartData = React.useMemo(() => {
    if (checkedRuns.length === 0) return [];
    
    // Group values by rounded progress percentage 0 to 100
    const progressMap = new Map<number, Record<string, any>>();
    for (let p = 0; p <= 100; p++) {
      progressMap.set(p, { progress: p });
    }

    checkedRuns.forEach((run) => {
      const keySuffix = run.jobId;
      if (run.lossHistory) {
        run.lossHistory.forEach(lh => {
          const p = Math.round(lh.progress);
          if (p >= 0 && p <= 100) {
            const pt = progressMap.get(p) || { progress: p };
            pt[`loss_${keySuffix}`] = lh.loss;
            progressMap.set(p, pt);
          }
        });
      }
    });

    return Array.from(progressMap.values())
      .filter(pt => Object.keys(pt).length > 1) // Keep only points that have some run data
      .sort((a, b) => a.progress - b.progress);
  }, [checkedRuns]);

  // Compute Single-run loss chart data
  const getSingleChartData = (item: TrainingHistoryItem) => {
    if (!item.lossHistory) return [];
    const combined = [...item.lossHistory.map(h => ({
      progress: Math.round(h.progress),
      loss: h.loss,
      evalLoss: undefined as number | undefined
    }))];

    if (item.evalLossHistory) {
      item.evalLossHistory.forEach(eh => {
        const rounded = Math.round(eh.progress);
        const existing = combined.find(c => c.progress === rounded);
        if (existing) {
          existing.evalLoss = eh.loss;
        } else {
          combined.push({
            progress: rounded,
            loss: undefined as any,
            evalLoss: eh.loss
          });
        }
      });
    }
    return combined.sort((a, b) => a.progress - b.progress);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'status-completed';
      case 'STOPPED': return 'status-stopped';
      case 'FAILED': return 'status-failed';
      case 'ERROR': return 'status-stopped';
      case 'TRAINING':
      case 'RUNNING': return 'status-running';
      default: return '';
    }
  };

  return (
    <div className="history-view">
      {/* Header */}
      <div className="history-header">
        <div className="history-title-group">
          <History size={28} className="text-primary" />
          <div>
            <h1>Lịch sử Huấn luyện (Training History)</h1>
            <p>Quản lý các đợt fine-tune model, so sánh các run và tải checkpoint</p>
          </div>
        </div>
        <div className="history-header-actions">
          <button className="btn-outline" onClick={() => fetchHistories(selectedModel || undefined)}>
            <RefreshCw size={16} /> Tải lại danh sách
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-card">
        <div className="filter-row">
          <div className="filter-label">
            <FileText size={18} className="text-muted" />
            <span>Lọc theo Base Model:</span>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => handleModelFilterChange(e.target.value)}
            className="filter-select"
          >
            <option value="">Tất cả Models</option>
            {baseModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {selectedModel && (
            <button className="btn-outline" onClick={() => handleModelFilterChange('')}>
              Xóa lọc
            </button>
          )}
          <span className="text-muted text-sm" style={{ marginLeft: 'auto' }}>
            Tìm thấy {histories.length} bản ghi
          </span>
        </div>
      </div>

      {/* Multi-run Comparison Section (Visible when 2+ runs selected) */}
      {checkedRuns.length >= 2 && (
        <div className="comparison-container">
          <div className="comparison-header">
            <h3>📈 So sánh Đa-Run (Multi-run Comparison)</h3>
            <button className="btn-outline" onClick={() => setCheckedJobIds([])} style={{ padding: '4px 10px', fontSize: '12px' }}>
              Xóa so sánh ({checkedRuns.length} đã chọn)
            </button>
          </div>

          <div className="comparison-grid">
            {/* Multi-run Loss Chart */}
            <div className="comparison-chart-card">
              <h4 className="text-sm font-semibold mb-3 text-muted">Biểu đồ đối chiếu Loss giữa các Run</h4>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={multiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="progress" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip labelFormatter={v => `Progress: ${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {checkedRuns.map((run, idx) => (
                    <Line
                      key={run.jobId}
                      type="monotone"
                      dataKey={`loss_${run.jobId}`}
                      name={run.projectName || run.jobId.slice(4, 12)}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison Metrics Grid */}
            <div className="comparison-table-card">
              <table className="comp-table">
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Base Model</th>
                    <th>Epochs</th>
                    <th>Batch</th>
                    <th>Loss cuối</th>
                    <th>VRAM</th>
                    <th>Records nhồi vào</th>
                    <th>Tokens thực tế</th>
                  </tr>
                </thead>
                <tbody>
                  {checkedRuns.map(run => (
                    <tr key={run.jobId}>
                      <td className="font-semibold">{run.projectName}</td>
                      <td className="text-muted">{run.baseModel}</td>
                      <td>{run.parameters.epochs}</td>
                      <td>{run.parameters.batchSize}</td>
                      <td className="text-primary font-bold">{run.finalMetrics?.loss?.toFixed(4) || '-'}</td>
                      <td>{run.finalMetrics?.vram || '-'} MB</td>
                      <td className="font-semibold text-success">{run.totalRecords || '-'}</td>
                      <td className="font-semibold text-info">{(run.totalTokens && run.totalTokens.toLocaleString('vi-VN')) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Main Table List */}
      <div className="runs-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            Đang tải dữ liệu lịch sử...
          </div>
        ) : histories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            Không tìm thấy bản ghi huấn luyện nào.
          </div>
        ) : (
          <table className="runs-table">
            <thead>
              <tr>
                <th className="checkbox-cell">
                  {/* Select Header */}
                </th>
                <th>Trạng thái</th>
                <th>Tên dự án (Project)</th>
                <th>Base Model</th>
                <th>Loss</th>
                <th>Accuracy</th>
                <th>Thời gian chạy</th>
                <th>Số records</th>
                <th>Số tokens</th>
                <th>Thời điểm</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {histories.map((item) => {
                const isExpanded = expandedId === item.jobId;
                const isChecked = checkedJobIds.includes(item.jobId);
                return (
                  <React.Fragment key={item.jobId}>
                    {/* Row Summary */}
                    <tr
                      className={`summary-row ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.jobId)}
                    >
                      <td className="checkbox-cell" onClick={(e) => handleCheckboxToggle(e, item.jobId)}>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Controlled click via cell
                          disabled={item.status !== 'COMPLETED' && item.status !== 'STOPPED'}
                        />
                      </td>
                      <td>
                        <span className={`status-badge ${getStatusBadgeClass(item.status)}`}>
                          <span className="status-dot" />
                          {item.status}
                        </span>
                      </td>
                      <td className="font-bold">{item.projectName}</td>
                      <td className="text-muted text-sm">{item.baseModel}</td>
                      <td className="font-bold text-primary">{item.finalMetrics?.loss?.toFixed(4) || '-'}</td>
                      <td>{item.finalMetrics?.accuracy ? `${item.finalMetrics.accuracy}%` : '-'}</td>
                      <td>{formatDuration(item.trainingDuration)}</td>
                      <td className="font-bold text-success text-center">{item.totalRecords || '-'}</td>
                      <td className="font-bold text-info">{item.totalTokens ? item.totalTokens.toLocaleString('vi-VN') : '-'}</td>
                      <td className="text-muted text-sm">{formatDate(item.completedAt || item.startedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {isExpanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                        </div>
                      </td>
                    </tr>

                    {/* Expanding Details Panel */}
                    {isExpanded && (
                      <tr className="details-row">
                        <td colSpan={11}>
                          <div className="details-container">
                            <div className="details-grid">
                              {/* Left: Hyperparameters JSON */}
                              <div>
                                <div className="detail-section-title">Thông số huấn luyện (Hyperparameters)</div>
                                <pre className="params-code-box">
                                  {JSON.stringify(item.parameters, null, 2)}
                                </pre>
                              </div>

                              {/* Right: Curve & Metrics */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div className="detail-stats-card">
                                  <div className="detail-stats-row">
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">Loss Cuối</div>
                                      <div className="detail-stat-value text-primary">{item.finalMetrics?.loss?.toFixed(4) || '-'}</div>
                                    </div>
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">VRAM Đỉnh</div>
                                      <div className="detail-stat-value">{item.finalMetrics?.vram || '-'} MB</div>
                                    </div>
                                    <div className="detail-stat-item">
                                      <div className="detail-stat-label">GPU Average</div>
                                      <div className="detail-stat-value">{item.finalMetrics?.gpu_util || '-'}%</div>
                                    </div>
                                  </div>

                                  <div className="detail-info-list">
                                    <div className="detail-info-item">
                                      <span className="info-label">Dataset:</span>
                                      <span className="info-value">{item.datasetName} ({item.datasetSource})</span>
                                    </div>
                                    <div className="detail-info-item">
                                      <span className="info-label">Cột Mapping:</span>
                                      <span className="info-value">`{item.columnMapping}`</span>
                                    </div>
                                    {item.hfRepoId && (
                                      <div className="detail-info-item">
                                        <span className="info-label">Hugging Face Repo:</span>
                                        <span className="info-value" style={{ fontFamily: 'monospace' }}>{item.hfRepoId}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Loss LineChart */}
                                {item.lossHistory && item.lossHistory.length > 0 && (
                                  <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', height: '180px' }}>
                                    <div className="detail-section-title" style={{ marginBottom: '8px' }}>Đường cong suy giảm Loss (Loss Curve)</div>
                                    <ResponsiveContainer width="100%" height="80%">
                                      <LineChart data={getSingleChartData(item)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis dataKey="progress" tick={{ fontSize: 8, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                                        <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                        <Tooltip labelFormatter={v => `Progress: ${v}%`} contentStyle={{ fontSize: 10 }} />
                                        <Line type="monotone" dataKey="loss" name="Train Loss" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                                        <Line type="monotone" dataKey="evalLoss" name="Eval Loss" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* System Prompt preview */}
                            {item.systemPrompt && (
                              <div style={{ marginBottom: '16px' }}>
                                <div className="detail-section-title">System Prompt đã áp dụng</div>
                                <div className="detail-prompt-box">
                                  {item.systemPrompt}
                                </div>
                              </div>
                            )}

                            {/* Last console log line */}
                            {item.lastLogLine && (
                              <div className="log-box">
                                <div className="log-header">
                                  <span className="log-dot red" />
                                  <span className="log-dot yellow" />
                                  <span className="log-dot green" />
                                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px', fontWeight: 'bold' }}>Dòng Log Cuối</span>
                                </div>
                                <pre className="log-content">{item.lastLogLine}</pre>
                              </div>
                            )}

                            {/* Actions bar */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                              {item.status === 'COMPLETED' && (
                                <button className="btn-emerald-outline" onClick={(e) => openRegisterModal(e, item)}>
                                  Đăng ký Model vào Registry
                                </button>
                              )}
                              {(item.status === 'STOPPED' || item.status === 'FAILED' || item.status === 'RUNNING') && (
                                <button
                                  className="btn-blue-outline"
                                  onClick={(e) => handleResume(e, item)}
                                  disabled={!(item.latest_checkpoint_file_id || (item.pushToHub && item.hfRepoId)) || resumeLoading === item.jobId}
                                >
                                  {resumeLoading === item.jobId ? 'Đang khôi phục...' : 'Resume (Tiếp tục)'}
                                </button>
                              )}
                              <button
                                className="btn-danger-outline"
                                onClick={(e) => handleDelete(e, item.jobId)}
                                disabled={deleteLoading === item.jobId}
                              >
                                {deleteLoading === item.jobId ? 'Đang xóa...' : 'Xóa Run'}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Model registration modal popup */}
      {showRegisterModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Đăng ký Phiên bản Model</h2>
              <button className="modal-close-btn" onClick={() => setShowRegisterModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Chọn Model Registry</label>
                {registries.length > 0 ? (
                  <select
                    value={selectedRegistryId}
                    onChange={(e) => setSelectedRegistryId(e.target.value)}
                    className="form-input"
                  >
                    {registries.map((r) => (
                      <option key={r._id} value={r._id}>{r.name} ({r.baseModel})</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-danger" style={{ padding: '8px', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px' }}>
                    Không tìm thấy registry nào. Hãy tạo Registry trong Model Registry trước.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Tên Phiên bản (Version)</label>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  className="form-input"
                  placeholder="Ví dụ: v1.0.0"
                />
              </div>

              <div className="form-group">
                <label>Phiên bản System Prompt</label>
                <input
                  type="text"
                  value={promptVersion}
                  onChange={(e) => setPromptVersion(e.target.value)}
                  className="form-input"
                  placeholder="Ví dụ: Default / V1.2"
                />
              </div>

              {jobEvaluations.length > 0 && (
                <div className="form-group">
                  <label>Liên kết kết quả đánh giá (Evaluation)</label>
                  <select
                    value={selectedEvalId}
                    onChange={(e) => setSelectedEvalId(e.target.value)}
                    className="form-input"
                  >
                    <option value="">Không liên kết</option>
                    {jobEvaluations.map((ev) => (
                      <option key={ev._id} value={ev._id}>
                        {ev.modelEvalId} - Điểm: {ev.summary?.overall?.ft_avg?.toFixed(2) || '-'} / {ev.summary?.max_possible || 5}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowRegisterModal(null)}>Hủy</button>
              <button
                className="btn-primary"
                onClick={handleRegisterSubmit}
                disabled={registering || registries.length === 0}
              >
                {registering ? 'Đang đăng ký...' : 'Đăng ký'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
