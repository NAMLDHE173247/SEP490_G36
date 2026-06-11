import React from 'react';
import { Upload, FileText, X, Eye, ChevronDown, Scissors } from 'lucide-react';
import { useDataPrep, SAMPLE_RAW_DATA, SAMPLE_OUTPUT } from '../DataPrepContext';
import './Stage1Upload.css';

const renderJsonHighlighted = (jsonString: string) => {
  if (!jsonString) return null;
  try {
    const lines = typeof jsonString === 'string' ? jsonString.split('\n') : JSON.stringify(jsonString, null, 2).split('\n');
    return lines.map((line, i) => {
      let content = line;
      let className = 'json-text';

      if (line.includes('"user"') || line.includes('"human"')) {
        className = 'json-key-user';
      } else if (line.includes('"assistant"') || line.includes('"gpt"')) {
        className = 'json-key-assistant';
      } else if (line.match(/"[^"]+":/)) {
        className = 'json-key';
      }

      if (line.match(/:\s*"[^"]*"/)) {
        content = line.replace(/(:\s*)("[^"]*")/, '$1<span class="json-string">$2</span>');
      }

      return (
        <div key={i} className="json-line">
          <span className="json-line-number">{i + 1}</span>
          <span className={className} dangerouslySetInnerHTML={{ __html: content }} />
        </div>
      );
    });
  } catch (e) {
    return jsonString;
  }
};

export const Stage1Upload: React.FC = () => {
  const {
    file,
    projectName, setProjectName,
    rawPreviewOpen, setRawPreviewOpen,
    selectedFormat, setSelectedFormat,
    rawPreviewText, sampleOutputText,
    fileInputRef, handleFileUpload, handleRemoveFile, handleConvert
  } = useDataPrep();

  return (
    <div className="stage-1-upload-container">
      {/* File upload section */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,.jsonl"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {!file ? (
        /* ── Upload zone (no file selected) ── */
        <div className="dataprep-upload-zone" onClick={() => fileInputRef.current?.click()}>
          <Upload size={36} className="upload-icon" />
          <div className="upload-title">Drop your file here, or click to browse</div>
          <div className="upload-sub">Supports .jsonl, .json, .csv files up to 100MB</div>
          <button className="upload-select-btn" type="button">Select File</button>
        </div>
      ) : (
        /* ── File selected: show full Stage 1 UI ── */
        <>
          <div className="dataprep-file-card">
            <div className="file-icon">
              <FileText size={24} />
            </div>
            <div className="file-details">
              <div className="file-name">{file.name}</div>
              <div className="file-meta-list">
                <div className="file-meta-item">
                  <span className="meta-emoji">📋</span>
                  {file.messages} tin nhắn
                </div>
                <span className="meta-dot">•</span>
                <div className="file-meta-item">
                  <span className="meta-emoji">💬</span>
                  {file.conversations} hội thoại
                </div>
                <span className="meta-dot">•</span>
                <div className="file-meta-item">
                  <span className="meta-emoji">📦</span>
                  {file.size}
                </div>
              </div>
            </div>
            <button className="file-remove-btn" onClick={handleRemoveFile} title="Remove file">
              <X size={20} />
            </button>
          </div>

          {/* Project Name */}
          <div className="dataprep-field-group">
            <label htmlFor="dp-project-name">Project Name</label>
            <input
              id="dp-project-name"
              className="dataprep-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          {/* Raw Data Preview Accordion */}
          <div className="dataprep-accordion">
            <div className="dataprep-accordion-header" onClick={() => setRawPreviewOpen(!rawPreviewOpen)}>
              <div className="accordion-title">
                <Eye size={16} />
                Xem trước dữ liệu gốc (Raw Data Preview)
              </div>
              <ChevronDown size={18} className={`accordion-chevron ${rawPreviewOpen ? 'open' : ''}`} />
            </div>
            {rawPreviewOpen && (
              <div className="dataprep-accordion-body">
                <pre className="raw-data-pre">
                  {renderJsonHighlighted(rawPreviewText || SAMPLE_RAW_DATA)}
                </pre>
              </div>
            )}
          </div>

          {/* Step 1 Options */}
          <div className="dataprep-options-card">
            <h3>Step 1 Options</h3>
            <div className="options-label">Output format</div>

            {/* Radio: OpenAI Message Format */}
            <div
              className={`dataprep-radio-option ${selectedFormat === 'openai' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('openai')}
            >
              <div className="radio-circle">
                <div className="radio-dot" />
              </div>
              <div className="radio-content">
                <h4>Convert to OpenAI Message Format</h4>
                <p>Transforms the dataset into OpenAI&apos;s chat completion format with message roles (system, user, assistant)</p>
              </div>
            </div>

            {/* Sample Output */}
            <div className="sample-output-section">
              <div className="sample-output-label">SAMPLE OUTPUT</div>
              <pre className="sample-output-pre">
                {renderJsonHighlighted(sampleOutputText || SAMPLE_OUTPUT)}
              </pre>
            </div>
          </div>

          {/* Convert Button */}
          <button className="dataprep-convert-btn" onClick={handleConvert}>
            <Scissors size={20} />
            Convert Dataset
          </button>
        </>
      )}
    </div>
  );
};
