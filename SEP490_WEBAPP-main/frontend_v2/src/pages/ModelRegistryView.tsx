import React from 'react';
import { 
  Package, 
  Upload, 
  Search, 
  ChevronRight,
  GitBranch,
  Activity,
  BarChart2,
  HardDrive
} from 'lucide-react';
import '../modelregistry.css';

function ModelRegistryView() {
  const models = [
    {
      name: 'llama-2-7b-chat-finetuned',
      tags: [
        { label: 'Official', type: 'primary' },
        { label: 'public', type: 'success' }
      ],
      description: 'Fine-tuned Llama 2 7B model for conversational AI with custom domain adaptation',
      team: 'ML Team',
      categories: ['chat', 'llm', 'production'],
      stats: {
        version: 'v2.3.1',
        versionsCount: '12 versions',
        latency: '142ms',
        latencySub: 'Avg. response',
        latencyColor: 'text-success',
        accuracy: '89.2%',
        accuracySub: 'Val. score',
        size: '13.5 GB',
        sizeSub: 'Total'
      }
    },
    {
      name: 'gpt-neo-2.7b-custom',
      tags: [
        { label: 'private', type: 'disabled' }
      ],
      description: 'GPT Neo 2.7B model optimized for code generation and technical documentation',
      team: 'Dev Team',
      categories: ['code', 'generation', 'experimental'],
      stats: {
        version: 'v1.5.0',
        versionsCount: '8 versions',
        latency: '98ms',
        latencySub: 'Avg. response',
        latencyColor: 'text-success',
        accuracy: '84.7%',
        accuracySub: 'Val. score',
        size: '10.2 GB',
        sizeSub: 'Total'
      }
    },
    {
      name: 'mistral-7b-instruct-v0.2',
      tags: [
        { label: 'Official', type: 'primary' },
        { label: 'public', type: 'success' }
      ],
      description: 'Mistral 7B instruction-tuned model with enhanced reasoning capabilities',
      team: 'Research Team',
      categories: ['instruct', 'reasoning', 'production'],
      stats: {
        version: 'v0.2.4',
        versionsCount: '5 versions',
        latency: '128ms',
        latencySub: 'Avg. response',
        latencyColor: 'text-success',
        accuracy: '91.5%',
        accuracySub: 'Val. score',
        size: '14.1 GB',
        sizeSub: 'Total'
      }
    }
  ];

  return (
    <div className="registry-view">
      {/* Header */}
      <div className="registry-header">
        <div className="registry-title-group">
          <h1>Model Registry</h1>
          <p>Browse, upload, and manage model versions</p>
        </div>
        <button className="btn-primary-upload">
          <Upload size={16} /> Upload Model
        </button>
      </div>

      {/* Filter Bar */}
      <div className="registry-filters">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search models by name, tag, or owner..." 
            className="search-input"
          />
        </div>
        <div className="filter-dropdowns">
          <select className="filter-select">
            <option>All Licenses</option>
          </select>
          <select className="filter-select">
            <option>All Visibility</option>
          </select>
        </div>
      </div>

      {/* Models List */}
      <div className="models-list">
        {models.map((model, index) => (
          <div className="model-card" key={index}>
            <div className="model-icon-wrapper">
              <Package size={24} className="text-primary" />
            </div>
            
            <div className="model-main-info">
              <div className="model-title-row">
                <h3>{model.name}</h3>
                <div className="model-tags">
                  {model.tags.map((tag, i) => (
                    <span key={i} className={`model-tag tag-${tag.type}`}>{tag.label}</span>
                  ))}
                </div>
              </div>
              <p className="model-description">{model.description}</p>
              <div className="model-meta">
                <span className="model-team">{model.team}</span>
                <span className="meta-dot">•</span>
                <div className="model-categories">
                  {model.categories.map((cat, i) => (
                    <span key={i} className="category-item">{cat}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="model-stats">
              <div className="stat-column">
                <div className="stat-label-icon"><GitBranch size={14} /> Version</div>
                <div className="stat-main-value">{model.stats.version}</div>
                <div className="stat-sub-value">{model.stats.versionsCount}</div>
              </div>
              <div className="stat-column">
                <div className="stat-label-icon"><Activity size={14} /> Latency</div>
                <div className="stat-main-value">{model.stats.latency}</div>
                <div className={`stat-sub-value ${model.stats.latencyColor}`}>{model.stats.latencySub}</div>
              </div>
              <div className="stat-column">
                <div className="stat-label-icon"><BarChart2 size={14} /> Accuracy</div>
                <div className="stat-main-value">{model.stats.accuracy}</div>
                <div className="stat-sub-value">{model.stats.accuracySub}</div>
              </div>
              <div className="stat-column">
                <div className="stat-label-icon"><HardDrive size={14} /> Size</div>
                <div className="stat-main-value">{model.stats.size}</div>
                <div className="stat-sub-value">{model.stats.sizeSub}</div>
              </div>
            </div>

            <div className="model-action-chevron">
              <ChevronRight size={20} className="text-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ModelRegistryView;
