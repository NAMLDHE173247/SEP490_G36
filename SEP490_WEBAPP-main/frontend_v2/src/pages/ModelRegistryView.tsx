import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { 
  Package, 
  Upload, 
  Search, 
  ChevronDown,
  ChevronUp,
  GitBranch,
  Activity,
  BarChart2,
  HardDrive,
  Trash2,
  X,
  Plus,
  RefreshCw,
  Check,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import '../styles/modelregistry.css';

interface ModelVersionType {
  _id: string;
  version: string;
  status: 'Use' | 'Not Use';
  metrics?: {
    accuracy?: number;
    latency?: string;
    size?: string;
    loss?: number;
    overallScore?: number;
    [key: string]: any;
  };
  notes?: string;
  hfRepoId?: string;
  createdBy?: string;
  createdAt: string;
}

interface ModelRegistryType {
  _id: string;
  name: string;
  description?: string;
  baseModel: string;
  createdAt: string;
  updatedAt: string;
  versionsCount: number;
  activeVersion?: ModelVersionType | null;
  versions: ModelVersionType[];
}

function ModelRegistryView() {
  const [registries, setRegistries] = useState<ModelRegistryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interaction states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBaseModel, setSelectedBaseModel] = useState('All Base Models');
  const [selectedVisibility, setSelectedVisibility] = useState('All Visibility');

  // Modal states for creating model registry
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBaseModel, setNewBaseModel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch all model registries (enriched with versions from the backend)
  const fetchRegistries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/model-registry');
      setRegistries(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch registries:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load model registry data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistries();
  }, [fetchRegistries]);

  // Create Model Registry handler
  const handleCreateRegistry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newBaseModel.trim()) {
      toast.error('Vui lòng điền đầy đủ Tên Registry và Base Model.');
      return;
    }

    setCreating(true);
    const toastId = toast.loading('Đang tạo Model Registry...');
    try {
      await api.post('/model-registry', {
        name: newName.trim(),
        baseModel: newBaseModel.trim(),
        description: newDescription.trim()
      });
      
      // Reset forms
      setNewName('');
      setNewBaseModel('');
      setNewDescription('');
      setShowCreateModal(false);
      
      // Refresh registry list
      await fetchRegistries();
      toast.success('Tạo Model Registry thành công!', { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi tạo Model Registry: ' + (err.response?.data?.message || err.message), { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  // Delete Model Registry handler
  const handleDeleteRegistry = async (e: React.MouseEvent, registryId: string, registryName: string) => {
    e.stopPropagation();
    if (!confirm(`Bạn có chắc muốn XÓA model registry "${registryName}" cùng toàn bộ phiên bản của nó không?`)) {
      return;
    }

    const toastId = toast.loading('Đang xóa Model Registry...');
    try {
      await api.delete(`/model-registry/${registryId}`);
      if (expandedId === registryId) setExpandedId(null);
      await fetchRegistries();
      toast.success('Xóa model registry thành công!', { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + (err.response?.data?.message || err.message), { id: toastId });
    }
  };

  // Toggle Model Version Status (USE vs NOT_USE)
  const handleToggleVersionStatus = async (version: ModelVersionType, registryId: string) => {
    const newStatus = version.status === 'Use' ? 'Not Use' : 'Use';
    const toastId = toast.loading('Đang cập nhật trạng thái phiên bản...');
    try {
      await api.put(`/model-versions/${version._id}/status`, { status: newStatus });
      // Refresh lists to reflect updated status
      await fetchRegistries();
      toast.success('Cập nhật trạng thái phiên bản thành công!', { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi cập nhật trạng thái phiên bản: ' + (err.response?.data?.message || err.message), { id: toastId });
    }
  };

  // Delete Model Version handler
  const handleDeleteVersion = async (versionId: string, versionStr: string) => {
    if (!confirm(`Bạn có chắc muốn xóa phiên bản "${versionStr}" này không?`)) {
      return;
    }

    const toastId = toast.loading('Đang xóa phiên bản...');
    try {
      await api.delete(`/model-versions/${versionId}`);
      await fetchRegistries();
      toast.success('Xóa phiên bản thành công!', { id: toastId });
    } catch (err: any) {
      toast.error('Lỗi khi xóa phiên bản: ' + (err.response?.data?.message || err.message), { id: toastId });
    }
  };

  // Dynamic tags and categories generator
  const getTagsAndCategories = (model: ModelRegistryType) => {
    const tags = [];
    const activeVersion = model.activeVersion;

    if (activeVersion?.status === 'Use') {
      tags.push({ label: 'Active', type: 'success' });
    }
    if (activeVersion?.hfRepoId || model.baseModel.includes('/')) {
      tags.push({ label: 'HuggingFace', type: 'primary' });
    } else {
      tags.push({ label: 'Local', type: 'disabled' });
    }

    const categories = ['production'];
    const nameLower = model.name.toLowerCase();
    if (nameLower.includes('chat') || nameLower.includes('llama')) {
      categories.push('chat', 'llm');
    } else if (nameLower.includes('code') || nameLower.includes('neo') || nameLower.includes('coder')) {
      categories.push('code', 'generation');
    } else if (nameLower.includes('instruct') || nameLower.includes('mistral')) {
      categories.push('instruct', 'reasoning');
    } else {
      categories.push('model');
    }

    return { tags, categories };
  };

  // Unique Base Models list for filtering
  const uniqueBaseModels = React.useMemo(() => {
    const bases = registries.map(r => r.baseModel.split('/')[0] || r.baseModel);
    return Array.from(new Set(bases));
  }, [registries]);

  // Filtering & searching logic
  const filteredRegistries = React.useMemo(() => {
    return registries.filter(model => {
      // 1. Search Query filter
      const matchesSearch = 
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (model.description && model.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        model.baseModel.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Base Model filter
      const matchesBaseModel = 
        selectedBaseModel === 'All Base Models' ||
        model.baseModel.startsWith(selectedBaseModel) || 
        model.baseModel.toLowerCase().includes(selectedBaseModel.toLowerCase());

      // 3. Visibility filter
      const isHF = !!model.activeVersion?.hfRepoId || model.baseModel.includes('/');
      const matchesVisibility =
        selectedVisibility === 'All Visibility' ||
        (selectedVisibility === 'Hugging Face Hosted' && isHF) ||
        (selectedVisibility === 'Local Disk' && !isHF);

      return matchesSearch && matchesBaseModel && matchesVisibility;
    });
  }, [registries, searchQuery, selectedBaseModel, selectedVisibility]);

  return (
    <div className="registry-view">
      {/* Header */}
      <div className="registry-header">
        <div className="registry-title-group">
          <h1>Model Registry</h1>
          <p>Duyệt, quản lý phiên bản và theo dõi các chỉ số đánh giá của Model</p>
        </div>
        <button className="btn-primary-upload" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Tạo Registry mới
        </button>
      </div>

      {/* Filter Bar */}
      <div className="registry-filters">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Tìm kiếm model theo tên, base model hoặc mô tả..." 
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-dropdowns">
          <select 
            className="filter-select"
            value={selectedBaseModel}
            onChange={(e) => setSelectedBaseModel(e.target.value)}
          >
            <option>All Base Models</option>
            {uniqueBaseModels.map((base, idx) => (
              <option key={idx} value={base}>{base}</option>
            ))}
          </select>
          <select 
            className="filter-select"
            value={selectedVisibility}
            onChange={(e) => setSelectedVisibility(e.target.value)}
          >
            <option>All Visibility</option>
            <option>Hugging Face Hosted</option>
            <option>Local Disk</option>
          </select>
          <button className="btn-outline" onClick={fetchRegistries} title="Tải lại dữ liệu">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Models List */}
      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner"></div>
          <p>Đang tải dữ liệu Model Registry...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#dc2626' }}>
          <p className="font-semibold">{error}</p>
          <button className="btn-outline" style={{ marginTop: '16px' }} onClick={fetchRegistries}>
            Tải lại
          </button>
        </div>
      ) : filteredRegistries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '12px', background: 'white' }}>
          <Package size={48} style={{ margin: '0 auto 16px auto', strokeWidth: 1.5, color: '#94a3b8' }} />
          <h3>Không tìm thấy model nào</h3>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Thử thay đổi bộ lọc hoặc tạo một Model Registry mới.</p>
        </div>
      ) : (
        <div className="models-list">
          {filteredRegistries.map((model) => {
            const isExpanded = expandedId === model._id;
            const { tags, categories } = getTagsAndCategories(model);
            const activeVersion = model.activeVersion;

            // Compute values for stats row
            const activeVersionName = activeVersion ? activeVersion.version : 'N/A';
            const versionsCountText = `${model.versionsCount} version${model.versionsCount !== 1 ? 's' : ''}`;
            const latencyText = activeVersion?.metrics?.latency || 'N/A';
            
            // Format accuracy representation
            let accuracyText = 'N/A';
            if (activeVersion?.metrics?.accuracy !== undefined) {
              accuracyText = `${activeVersion.metrics.accuracy}%`;
            } else if (activeVersion?.metrics?.overallScore !== undefined) {
              accuracyText = `${activeVersion.metrics.overallScore.toFixed(1)}%`;
            }
            
            const sizeText = activeVersion?.metrics?.size || 'N/A';

            return (
              <div 
                className={`model-card-wrapper ${isExpanded ? 'expanded' : ''}`} 
                key={model._id}
              >
                {/* Summary Card (Header click toggles expansion) */}
                <div className="model-card" onClick={() => setExpandedId(isExpanded ? null : model._id)}>
                  <div className="model-icon-wrapper">
                    <Package size={24} className="text-primary" />
                  </div>
                  
                  <div className="model-main-info">
                    <div className="model-title-row">
                      <h3>{model.name}</h3>
                      <div className="model-tags">
                        {tags.map((tag, i) => (
                          <span key={i} className={`model-tag tag-${tag.type}`}>{tag.label}</span>
                        ))}
                      </div>
                    </div>
                    <p className="model-description">{model.description || 'Không có mô tả cho registry này.'}</p>
                    <div className="model-meta">
                      <span className="model-team">Base: {model.baseModel}</span>
                      <span className="meta-dot">•</span>
                      <div className="model-categories">
                        {categories.map((cat, i) => (
                          <span key={i} className="category-item">{cat}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="model-stats">
                    <div className="stat-column">
                      <div className="stat-label-icon"><GitBranch size={14} /> Version</div>
                      <div className="stat-main-value">{activeVersionName}</div>
                      <div className="stat-sub-value">{versionsCountText}</div>
                    </div>
                    <div className="stat-column">
                      <div className="stat-label-icon"><Activity size={14} /> Latency</div>
                      <div className="stat-main-value">{latencyText}</div>
                      <div className="stat-sub-value text-success">Phản hồi trung bình</div>
                    </div>
                    <div className="stat-column">
                      <div className="stat-label-icon"><BarChart2 size={14} /> Accuracy</div>
                      <div className="stat-main-value">{accuracyText}</div>
                      <div className="stat-sub-value">Điểm Val / Eval</div>
                    </div>
                    <div className="stat-column">
                      <div className="stat-label-icon"><HardDrive size={14} /> Kích thước</div>
                      <div className="stat-main-value">{sizeText}</div>
                      <div className="stat-sub-value">Dung lượng file</div>
                    </div>
                  </div>

                  <div className="model-action-chevron">
                    {isExpanded ? <ChevronUp size={20} className="text-muted" /> : <ChevronDown size={20} className="text-muted" />}
                  </div>
                </div>

                {/* Expanded Details Row */}
                {isExpanded && (
                  <div className="model-versions-details">
                    <div className="versions-section-title">
                      <span>Danh sách các phiên bản đã lưu (Model Versions)</span>
                    </div>

                    {model.versions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', background: 'white', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        Chưa đăng ký phiên bản nào cho model này. Bạn có thể đăng ký phiên bản từ tab "Lịch sử Huấn luyện".
                      </div>
                    ) : (
                      <div className="versions-table-container">
                        <table className="versions-table">
                          <thead>
                            <tr>
                              <th>Phiên bản</th>
                              <th>Trạng thái hoạt động</th>
                              <th>Độ chính xác (Accuracy)</th>
                              <th>Loss</th>
                              <th>Độ trễ (Latency)</th>
                              <th>Kích thước</th>
                              <th>HF Repository</th>
                              <th>Ghi chú</th>
                              <th>Ngày tạo</th>
                              <th style={{ textAlign: 'right' }}>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {model.versions.map((ver) => {
                              const isActive = ver.status === 'Use';
                              const formattedAccuracy = ver.metrics?.accuracy !== undefined 
                                ? `${ver.metrics.accuracy}%` 
                                : (ver.metrics?.overallScore !== undefined ? `${ver.metrics.overallScore.toFixed(1)}%` : '-');

                              return (
                                <tr key={ver._id} className={isActive ? 'active-version-row' : ''}>
                                  <td style={{ fontWeight: 600 }}>{ver.version}</td>
                                  <td>
                                    <span className={`version-status-tag ${isActive ? 'status-use' : 'status-not-use'}`}>
                                      {isActive ? <Check size={12} /> : null}
                                      {isActive ? 'Đang dùng' : 'Không dùng'}
                                    </span>
                                  </td>
                                  <td style={{ fontWeight: 'bold' }}>{formattedAccuracy}</td>
                                  <td>{ver.metrics?.loss?.toFixed(4) || '-'}</td>
                                  <td>{ver.metrics?.latency || '-'}</td>
                                  <td>{ver.metrics?.size || '-'}</td>
                                  <td>
                                    {ver.hfRepoId ? (
                                      <a 
                                        href={`https://huggingface.co/${ver.hfRepoId}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#8b5cf6', textDecoration: 'underline' }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        HuggingFace <ExternalLink size={12} />
                                      </a>
                                    ) : (
                                      <span className="text-muted" style={{ fontStyle: 'italic' }}>Local</span>
                                    )}
                                  </td>
                                  <td>
                                    <span className="text-muted" title={ver.notes}>{ver.notes || '-'}</span>
                                  </td>
                                  <td className="text-muted" style={{ fontSize: '12px' }}>
                                    {new Date(ver.createdAt).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button 
                                      className={`version-action-btn ${isActive ? 'btn-status-demote' : 'btn-status-use'}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleVersionStatus(ver, model._id);
                                      }}
                                    >
                                      {isActive ? 'Hạ cấp' : 'Kích hoạt'}
                                    </button>
                                    <button 
                                      className="version-action-btn btn-delete-ver"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteVersion(ver._id, ver.version);
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Registry Actions Footer */}
                    <div className="registry-actions-footer">
                      <button 
                        className="btn-delete-registry"
                        onClick={(e) => handleDeleteRegistry(e, model._id, model.name)}
                      >
                        <Trash2 size={14} /> Xóa Model Registry này
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Creation Modal Popup */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Tạo mới Model Registry</h2>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateRegistry}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="reg-name">Tên Model Registry <span style={{ color: '#ef4444' }}>*</span></label>
                  <input 
                    type="text" 
                    id="reg-name"
                    placeholder="ví dụ: llama-3-8b-math-agent" 
                    className="form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-base">Base Model <span style={{ color: '#ef4444' }}>*</span></label>
                  <input 
                    type="text" 
                    id="reg-base"
                    placeholder="ví dụ: meta-llama/Meta-Llama-3-8B-Instruct" 
                    className="form-input"
                    value={newBaseModel}
                    onChange={(e) => setNewBaseModel(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="reg-desc">Mô tả chi tiết</label>
                  <textarea 
                    id="reg-desc"
                    placeholder="Mô tả mục đích sử dụng, domain hoặc lịch sử huấn luyện của registry này..." 
                    className="form-textarea"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setShowCreateModal(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Đang tạo...' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelRegistryView;
