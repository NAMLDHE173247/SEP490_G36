import React, { useState } from 'react';
import { 
  Zap, 
  History, 
  BarChart2, 
  Search, 
  Upload, 
  Eye, 
  Plus,
  Settings2,
  Download,
  Code,
  Activity,
  Layers,
  Target,
  ThermometerSun,
  Clock,
  Database,
  Hash,
  RefreshCcw,
  Sliders,
  Cpu,
  StopCircle,
  X
} from 'lucide-react';
import '../autotrain.css';

function AutoTrainView() {
  const [isTraining, setIsTraining] = useState(false);

  const startTraining = () => {
    setIsTraining(true);
  };

  const stopTraining = () => {
    setIsTraining(false);
  };

  if (isTraining) {
    return (
      <div className="autotrain-view">
        <div className="autotrain-header">
          <div className="autotrain-title-group">
            <Zap size={28} className="text-primary" />
            <div>
              <h1>AutoTrain</h1>
              <p>Fine-tune your language model</p>
            </div>
          </div>
          <div className="autotrain-header-actions">
            <button className="btn-outline"><History size={16} /> History</button>
            <button className="btn-outline"><BarChart2 size={16} /> Evaluation</button>
          </div>
        </div>

        <div className="card active-jobs-card">
          <div className="card-header">
            <BarChart2 size={18} className="text-primary" />
            <h3>Active Training Jobs (1)</h3>
          </div>
          <div className="card-body">
            <div className="job-container">
              <div className="job-header">
                <div className="job-info">
                  <div className="job-icon-wrapper">
                    <Zap size={20} className="text-success" />
                  </div>
                  <div>
                    <h4 className="job-id">Job: job_clfb6eec-e5ea-439a-af01-0fd9cc4f4be9</h4>
                    <span className="badge badge-success-outline">TRAINING</span>
                  </div>
                </div>
                <div className="job-actions">
                  <button className="btn-danger" onClick={stopTraining}>Stop Job</button>
                  <button className="btn-icon"><X size={20} /></button>
                </div>
              </div>

              <div className="job-progress-container">
                <div className="job-progress-labels">
                  <span className="font-medium text-sm">Training Progress</span>
                  <span className="text-primary text-sm font-medium">100% • ETA: Calculating...</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: '100%' }}></div>
                </div>
              </div>

              <div className="job-stats-row">
                <div className="job-stat">
                  <div className="stat-label text-primary">TRAIN LOSS</div>
                  <div className="stat-value text-primary font-bold">0.8664</div>
                </div>
                <div className="job-stat">
                  <div className="stat-label text-danger">EVAL LOSS <span className="info-icon">ⓘ</span></div>
                  <div className="stat-value text-danger font-bold">0.0000</div>
                </div>
                <div className="job-stat">
                  <div className="stat-label">OVERFIT GAP</div>
                  <div className="stat-value font-bold">0.0000</div>
                </div>
                <div className="job-stat">
                  <div className="stat-label">Accuracy</div>
                  <div className="stat-value font-bold">0%</div>
                </div>
                <div className="job-stat">
                  <div className="stat-label">VRAM</div>
                  <div className="stat-value font-bold">2378 MB</div>
                </div>
              </div>

              <div className="job-details-grid">
                <div className="job-chart-area">
                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-color bg-primary"></span> Training Loss</span>
                    <span className="legend-item"><span className="legend-color bg-danger"></span> Eval Loss (Overfit)</span>
                  </div>
                  <div className="chart-placeholder">
                     <div className="chart-dot" style={{ top: '70%', left: '30%' }}></div>
                     <span className="chart-x-axis">100%</span>
                  </div>
                </div>
                <div className="job-console-area">
                  <div className="console-header">
                    <span>CONSOLE OUTPUT</span>
                    <span className="console-job-id">Job ID: clfb6eec</span>
                  </div>
                  <div className="console-body">
                    <div className="console-line text-success">Resuming from checkpoint: /tmp/checkpoint_job_clfb6eec-e5ea-439a-af01-0fd9cc4f4be9/last-checkpoint</div>
                    <div className="console-line text-success">Step 4 | Epoch 1.0 | Loss: 3.4857</div>
                    <div className="console-line text-success">Step 4 | Epoch 1.0 | Loss: 3.4657 | Eval Loss (Overfit): 4.4349</div>
                    <div className="console-line text-success">✓ Checkpoints saved locally at step 4.</div>
                    <div className="console-line text-success">Step 4 | Epoch 1.0 | Loss: 0.8664</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="autotrain-view">
      <div className="autotrain-header">
        <div className="autotrain-title-group">
          <Zap size={28} className="text-primary" />
          <div>
            <h1>AutoTrain</h1>
            <p>Fine-tune your language model</p>
          </div>
        </div>
        <div className="autotrain-header-actions">
          <button className="btn-outline"><History size={16} /> History</button>
          <button className="btn-outline"><BarChart2 size={16} /> Evaluation</button>
        </div>
      </div>

      <div className="autotrain-layout">
        {/* Left Column */}
        <div className="autotrain-col-left">
          <div className="card">
            <div className="card-header border-bottom-light">
              <div className="flex-center gap-2">
                <Settings2 size={18} className="text-primary" />
                <h3 className="font-semibold">Project Configuration</h3>
              </div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>Project Name *</label>
                <input type="text" className="form-input" defaultValue="my-first-lm-project" />
              </div>

              <div className="form-group">
                <label>Base Model *</label>
                <div className="input-with-icon">
                  <input type="text" className="form-input" defaultValue="Qwen-Qwen2.5-8B" />
                  <Search size={18} className="input-icon-right" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Dataset Source</label>
                  <input type="text" className="form-input" defaultValue="user:Untried" />
                </div>
                <div className="form-group flex-1">
                  <label className="flex-between">
                    <span>Column Mapping</span>
                    <span className="text-link"><Eye size={14} /> Preview Data</span>
                  </label>
                  <select className="form-input">
                    <option>text</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Training Data *</label>
                <div className="upload-area">
                  <Upload size={24} className="text-muted mb-2" />
                  <p className="font-medium text-main">Click to upload .json or .csv</p>
                  <span className="text-muted text-sm">or drag and drop</span>
                </div>
              </div>

              <div className="form-group">
                <label>System Prompt (Optional)</label>
                <textarea className="form-input min-h-100" placeholder="e.g. You are a helpful assistant..."></textarea>
              </div>

              <div className="form-group">
                <label>HF Access Token *</label>
                <input type="password" className="form-input" defaultValue="hf_..." />
              </div>

              <div className="form-group">
                <label>Target Repository ID *</label>
                <input type="text" className="form-input" placeholder="e.g. username/my-model" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="autotrain-col-right">
          <div className="card mb-4">
            <div className="card-header border-bottom-light flex-between">
              <div className="flex-center gap-2">
                <Activity size={18} className="text-info" />
                <h3 className="font-semibold">Code Workers Status</h3>
              </div>
              <span className="text-link text-sm"><Plus size={14} /> Add</span>
            </div>
            <div className="card-body pb-3">
              <div className="worker-status flex-between">
                <div className="worker-info">
                  <h4 className="font-medium mb-1">Worker 1</h4>
                  <span className="text-sm text-muted block">Status: Idle</span>
                  <span className="text-sm text-muted block">Last seen: Never</span>
                </div>
                <div className="worker-badge">
                  <div className="dot dot-offline"></div> Offline
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header border-bottom-light flex-between">
              <div className="flex-center gap-2">
                <Sliders size={18} className="text-primary" />
                <h3 className="font-semibold">Parameters</h3>
              </div>
              <div className="flex-center gap-4">
                <span className="text-link text-sm"><Download size={14} /> LoRA Presets</span>
                <span className="text-primary text-sm font-medium">JSON View</span>
              </div>
            </div>
            <div className="card-body">
              <div className="parameters-grid">
                <div className="form-group">
                  <label><Activity size={14} className="text-success inline-icon"/> Epochs</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="1" readOnly />
                </div>
                <div className="form-group">
                  <label><Layers size={14} className="text-primary inline-icon"/> Batch Size</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="1" readOnly />
                </div>

                <div className="form-group">
                  <label><Target size={14} className="text-warning inline-icon"/> Learning Rate</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="0.00001" readOnly />
                </div>
                <div className="form-group">
                  <label><Target size={14} className="text-danger inline-icon"/> Max Length</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="1024" readOnly />
                </div>

                <div className="form-group">
                  <label><RefreshCcw size={14} className="text-blue inline-icon"/> Num Train Epochs</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="8" readOnly />
                </div>
                <div className="form-group">
                  <label><Hash size={14} className="text-success inline-icon"/> Random State</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="3407" readOnly />
                </div>

                <div className="form-group">
                  <label><ThermometerSun size={14} className="text-warning inline-icon"/> Warmup Ratio</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="0.1" readOnly />
                </div>
                <div className="form-group">
                  <label><Hash size={14} className="text-danger inline-icon"/> Seed</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="3407" readOnly />
                </div>

                <div className="form-group">
                  <label><Clock size={14} className="text-primary inline-icon"/> LR Scheduler</label>
                  <select className="form-input bg-white">
                    <option>linear</option>
                  </select>
                </div>
                <div className="form-group">
                  <label><Layers size={14} className="text-blue inline-icon"/> Grad Accum</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="4" readOnly />
                </div>

                <div className="form-group">
                  <label><Activity size={14} className="text-warning inline-icon"/> Weight Decay</label>
                  <input type="text" className="form-input bg-disabled" defaultValue="0.01" readOnly />
                </div>
                <div className="form-group">
                  <label><Settings2 size={14} className="text-info inline-icon"/> Optimizer</label>
                  <select className="form-input bg-white">
                    <option>adamw_8bit</option>
                  </select>
                </div>
              </div>

              <div className="lora-config-section mt-4">
                <h4 className="text-sm font-semibold mb-3 text-main">LoRA Configuration</h4>
                <div className="lora-grid">
                  <div className="form-group">
                    <label><Layers size={14} className="text-primary inline-icon"/> LoRA R</label>
                    <input type="text" className="form-input bg-disabled" defaultValue="8" readOnly />
                  </div>
                  <div className="form-group">
                    <label><Target size={14} className="text-primary inline-icon"/> LoRA Alpha</label>
                    <input type="text" className="form-input bg-disabled" defaultValue="16" readOnly />
                  </div>
                  <div className="form-group">
                    <label><Activity size={14} className="text-danger inline-icon"/> Dropout</label>
                    <input type="text" className="form-input bg-disabled" defaultValue="0.05" readOnly />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="start-training-section mt-4">
            <button className="btn-start-training" onClick={startTraining}>
              <Zap size={20} /> Start New Training Job
            </button>
            <p className="text-center text-sm text-muted mt-3">We will send it to mobile automatically when it task finished</p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AutoTrainView;
