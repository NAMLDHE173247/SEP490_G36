import React from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, AlertCircle, Calendar, Download, FileText, Sparkles, MessageSquare, ChevronLeft, ChevronRight, Play, DownloadCloud, FileJson, CheckCircle2, RotateCcw, Upload } from 'lucide-react';
import { useDataPrep, SUB_STEPS_STAGE6, PROMPT_VERSIONS, EXPORT_ROWS } from '../DataPrepContext';
import { Tooltip, getPageNumbers } from '../utils';
import './Stage6Finish.css';

export const Stage6Finish: React.FC = () => {
  const dataPrep = useDataPrep();
  const {
    currentSubStep6, setCurrentSubStep6,
    downloadFormat, setDownloadFormat,
    showConfirmPush, setShowConfirmPush,
    isPushing, setIsPushing,
    pushSuccess, setPushSuccess,
    setCurrentStage,
    promptText, setPromptText,
    sampleQuestion, setSampleQuestion,
    selectedVersion, setSelectedVersion,
    promptName, setPromptName,
    promptDesc, setPromptDesc,
    trialResponse,
    exportPage, setExportPage,
    cloudProvider, setCloudProvider
  } = dataPrep;

  const isStepCompleted = (num: number) => {
    if (num < currentSubStep6) return true;
    if (num === 13 && promptText && promptText.trim() !== '') return true;
    return false;
  };

    const livePreviewJSON = {
      messages: [
        { role: 'system', content: promptText || '[No system prompt yet]' },
        { role: 'user', content: sampleQuestion },
        { role: 'assistant', content: '"Chào bạn, phương trình này có thể giải bằng cách nhân nghiệm theo hệ thức Vi et: x1 + x2 = 5 và x1 * x2 = 6. Vậy nghiệm là x = 2 và x = 3. Có điều gì mà bạn muốn thảo luận thêm về cách giải này?"' }
      ]
    };

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

        {/* Sub-step 13: System Prompt */}
        {currentSubStep6 === 13 && (
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
                    <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Compare Mode</button>
                    <span className="s6-version-count">{PROMPT_VERSIONS.length} versions</span>
                  </div>
                </div>

                <input className="s6-search-input" placeholder="Search by description or version" />

                <div className="s6-version-list">
                  {PROMPT_VERSIONS.map(v => (
                    <div
                      key={v.id}
                      className={`s6-version-item ${selectedVersion?.id === v.id ? 's6-version-selected' : ''}`}
                      onClick={() => setSelectedVersion(v)}
                    >
                      <div className="s6-version-item-left">
                        <span className="s6-version-name">{v.name}</span>
                        <span className="s6-version-desc">{v.desc}</span>
                      </div>
                      <span className="s6-version-date">{v.date}</span>
                    </div>
                  ))}
                </div>
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

                  <button className="s6-save-btn">Save as New Version</button>
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
                <button className="s6-trial-btn"><Sparkles size={14} /> Run Trial</button>
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
                  <textarea
                    className="s6-trial-textarea s6-trial-response"
                    readOnly
                    value={trialResponse}
                    placeholder="Click 'Run Trial' to generate a response..."
                  />
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

        {/* Sub-step 14: Split Guard */}
        {currentSubStep6 === 14 && (
          <div className="sg-container">
            {/* Header */}
            <div className="sg-header">
              <div>
                <h3>Split Guard</h3>
                <p>Generate a train/test split with semantic conflict checking handled by the GPU service.</p>
              </div>
              <button className="s6-trial-btn"><Sparkles size={14} /> Generate safe split</button>
            </div>

            {/* Config Cards */}
            <div className="sg-config-row">
              <div className="sg-config-card">
                <span className="sg-config-label">TOTAL SAMPLES</span>
                <span className="sg-config-value">72</span>
              </div>
              <div className="sg-config-card">
                <div className="sg-config-label-row">
                  <span className="sg-config-label">TEST PERCENTAGE</span>
                  <span className="sg-config-pct">50%</span>
                </div>
                <input type="range" min="10" max="90" defaultValue={50} className="sg-slider sg-slider-purple" />
              </div>
              <div className="sg-config-card">
                <div className="sg-config-label-row">
                  <span className="sg-config-label">SEMANTIC THRESHOLD</span>
                  <span className="sg-config-pct">1.000</span>
                </div>
                <input type="range" min="0" max="100" defaultValue={100} className="sg-slider sg-slider-purple" />
              </div>
            </div>

            {/* Max Attempts */}
            <div className="sg-attempts-card">
              <span className="sg-config-label">MAX ATTEMPTS</span>
              <p className="sg-attempts-desc">The GPU service will reshuffle until the split is clean or this limit is reached.</p>
              <input type="number" defaultValue={20} className="sg-attempts-input" />
            </div>

            {/* Split Generated Result */}
            <div className="sg-result-card">
              <div className="sg-result-title"><Check size={16} /> Split Generated</div>
              <div className="sg-result-stats">
                <div className="sg-result-stat">
                  <span className="sg-result-label">TRAIN</span>
                  <span className="sg-result-value">36</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">TEST</span>
                  <span className="sg-result-value">36</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">ATTEMPTS</span>
                  <span className="sg-result-value">1</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">CONFLICTS</span>
                  <span className="sg-result-value sg-value-red">4</span>
                </div>
                <div className="sg-result-stat">
                  <span className="sg-result-label">MAX SIMILARITY</span>
                  <span className="sg-result-value">0.96</span>
                </div>
              </div>
            </div>

            {/* Venn Diagram */}
            <div className="sg-venn-card">
              <h4>Semantic Overlap Visualization</h4>
              <p className="sg-venn-sub">Visual representation of semantic similarity between <span style={{ color: '#7c3aed' }}>Train</span> and <span style={{ color: '#3b82f6' }}>Test</span> sets.</p>
              <div className="sg-venn-wrap">
                <svg viewBox="0 0 400 220" className="sg-venn-svg">
                  {/* Train circle */}
                  <circle cx="155" cy="110" r="80" fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth="2" />
                  {/* Test circle */}
                  <circle cx="245" cy="110" r="80" fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2" />
                  {/* Overlap area - dashed */}
                  <ellipse cx="200" cy="110" rx="35" ry="55" fill="rgba(239,68,68,0.08)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                  {/* Labels */}
                  <text x="115" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#7c3aed">TRAIN</text>
                  <text x="115" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#7c3aed">32 unique</text>
                  <text x="285" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#3b82f6">TEST</text>
                  <text x="285" y="122" textAnchor="middle" className="sg-venn-text-sub" fill="#3b82f6">32 unique</text>
                  <text x="200" y="105" textAnchor="middle" className="sg-venn-text-main" fill="#ef4444">OVERLAP</text>
                  <text x="200" y="120" textAnchor="middle" className="sg-venn-text-sub" fill="#ef4444">4 conflicts</text>
                </svg>
              </div>

              {/* Summary Cards */}
              <div className="sg-summary-row">
                <div className="sg-summary-card sg-summary-train">
                  <span className="sg-summary-value">32</span>
                  <span className="sg-summary-label">Train Only</span>
                </div>
                <div className="sg-summary-card sg-summary-conflict">
                  <span className="sg-summary-value">4</span>
                  <span className="sg-summary-label">Semantic Conflicts</span>
                </div>
                <div className="sg-summary-card sg-summary-test">
                  <span className="sg-summary-value">32</span>
                  <span className="sg-summary-label">Test Only</span>
                </div>
              </div>
            </div>

            {/* Manual Exclusion Tool */}
            <div className="sg-exclusion-card">
              <div className="sg-exclusion-header">
                <div>
                  <h4>Manual Exclusion Tool</h4>
                  <p>Select samples below to exclude them from the dataset and resolve conflicts.</p>
                </div>
                <span className="sg-excluded-count">0 excluded</span>
              </div>
              <div className="sg-conflict-list">
                {[
                  { text: 'Giải phương trình bậc hai x² - 5x + 6 = 0', sim: 0.92 },
                  { text: 'Tìm nghiệm của phương trình x² + 3x - 4 = 0', sim: 0.87 },
                  { text: 'Phương trình bậc hai có delta âm thì có mấy nghiệm?', sim: 0.95 },
                  { text: 'Công thức Vi-et dùng để làm gì?', sim: 0.89 },
                ].map((item, idx) => (
                  <div key={idx} className="sg-conflict-item">
                    <div className="sg-conflict-left">
                      <X size={14} className="sg-conflict-x" />
                      <div>
                        <span className="sg-conflict-text">{item.text}</span>
                        <div className="sg-conflict-meta">
                          <span className="sg-dot sg-dot-train"></span> In Train
                          <span className="sg-dot sg-dot-test"></span> In Test
                          <span className="sg-conflict-sim">Similarity: <strong style={{ color: '#dc2626' }}>{item.sim}</strong></span>
                        </div>
                      </div>
                    </div>
                    <button className="sg-exclude-btn">Click to exclude</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sub-step 15: Export */}
        {currentSubStep6 === 15 && (
          <div className="ex-container">
            {/* Dataset Preview */}
            <div className="ex-preview-card">
              <div className="ex-preview-header">
                <div>
                  <h3>Converted Dataset Preview</h3>
                  <p>Showing 1-5 of 72 records</p>
                </div>
                <div className="ex-preview-controls">
                  <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Show All</button>
                  <button className="s4-btn-outline" style={{ fontSize: '11px', padding: '5px 10px' }}>Increase Limit (5)</button>
                  <select className="s5-filter-select">
                    <option>5 / page</option>
                    <option>10 / page</option>
                    <option>20 / page</option>
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
                  {EXPORT_ROWS.map((row, idx) => (
                    <tr key={idx}>
                      <td>-</td>
                      <td>
                        <span className="ex-cell-text">{row.user}</span>
                        <a href="#" className="ex-read-more">Read more</a>
                      </td>
                      <td>
                        <span className="ex-cell-text">{row.assistant}</span>
                        <a href="#" className="ex-read-more">Read more</a>
                      </td>
                      <td>-</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ex-pagination">
                <button className="ex-page-btn" onClick={() => setExportPage(Math.max(1, exportPage - 1))}>Previous</button>
                <span className="ex-page-info">Page {exportPage} / 15</span>
                <button className="ex-page-btn" onClick={() => setExportPage(Math.min(15, exportPage + 1))}>Next</button>
              </div>
            </div>

            {/* Download Cards Row */}
            <div className="ex-download-row">
              <div className="ex-download-card">
                <h4>Download cooked Train/Test Split</h4>
                <p className="ex-download-stat">Train: 36 / Test: 36</p>
                <p className="ex-download-note">Export uses the safe split generated in the previous step. Handson-splitting is disabled here.</p>
                <button className="ex-btn-green"><Download size={14} /> Download train/test .zip</button>
              </div>
              <div className="ex-download-card">
                <h4>Download Split Filter by Overall Score</h4>
                <div className="ex-score-row">
                  <span className="ex-score-label">Overall Score ≥</span>
                  <span className="ex-score-value">6.0</span>
                </div>
                <input type="range" min="0" max="10" step="0.5" defaultValue={6} className="sg-slider sg-slider-purple" />
                <button className="ex-btn-purple"><Download size={14} /> Download split overall &gt;= filter</button>
              </div>
            </div>

            {/* Push & Sync Row */}
            <div className="ex-push-row">
              <div className="ex-push-card">
                <h4>🔥 Push to Hugging Face Hub</h4>
                <label className="s6-field-label" style={{ marginTop: 0 }}>Hugging Face Token</label>
                <input className="s6-field-input" defaultValue="hf_..." style={{ borderLeft: '1px solid #e2e8f0' }} />
                <label className="s6-field-label">Repository ID</label>
                <input className="s6-field-input" defaultValue="username/my-dataset" style={{ borderLeft: '1px solid #e2e8f0' }} />
                <label className="ex-checkbox-label">
                  <input type="checkbox" /> Make repository private
                </label>
                <button className="ex-btn-hub"><Upload size={14} /> Push to Hub</button>
              </div>
              <div className="ex-push-card">
                <h4>☁️ Sync to Cloud Storage</h4>
                <label className="s6-field-label" style={{ marginTop: 0 }}>Cloud Provider</label>
                <div className="ex-cloud-options">
                  <button
                    className={`ex-cloud-btn ${cloudProvider === 'gcloud' ? 'ex-cloud-active' : ''}`}
                    onClick={() => setCloudProvider('gcloud')}
                  >
                    Google Cloud
                  </button>
                  <button
                    className={`ex-cloud-btn ${cloudProvider === 'azure' ? 'ex-cloud-active' : ''}`}
                    onClick={() => setCloudProvider('azure')}
                  >
                    Azure Blob
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep6 > 13) {
              setCurrentSubStep6(currentSubStep6 - 1);
            } else {
              setCurrentStage(5);
            }
          }}>
            Back
          </button>
          <button className="s6-reset-btn" onClick={() => {
            localStorage.removeItem('current_version_id');
            window.location.reload();
          }}><RotateCcw size={14} /> Reset & Upload New</button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep6 < 15) {
              setCurrentSubStep6(currentSubStep6 + 1);
            }
          }}>
            Next
          </button>
        </div>
      </div>
    );
  
};
