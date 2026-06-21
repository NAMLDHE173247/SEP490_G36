import React from 'react';
import { useDataPrep, SAMPLE_RAW_DATA, SAMPLE_OUTPUT, SUB_STEPS_STAGE2 } from '../DataPrepContext';
import { apiService } from '../../../services/api';
import { Download, Search, AlertCircle, FileText, Upload, Check, ChevronDown, Trash2, GitCompare, ArrowUpDown, ChevronRight, CheckCircle, RefreshCw, MessageSquare, HelpCircle, Scissors, Filter, Calendar, BarChart2, XCircle, Tag, ClipboardList, Send, Play, Eye, RotateCcw, Plus, Sparkles, ChevronLeft, Settings, X } from 'lucide-react';

export const Stage1Upload = () => {
  const { currentStage, setCurrentStage, currentSubStep, setCurrentSubStep, file, setFile, rawPreviewText, setRawPreviewText, sampleOutputText, setSampleOutputText, projectName, setProjectName, projects, setProjects, selectedProjectId, setSelectedProjectId, rawPreviewOpen, setRawPreviewOpen, conversationsList, setConversationsList, selectedFormat, setSelectedFormat, removeThinkTags, setRemoveThinkTags, cleaningEnabled, setCleaningEnabled, cleaningApplied, setCleaningApplied, showPreviewModal, setShowPreviewModal, previewTab, setPreviewTab, conversionStats, setConversionStats, cleaningPreviewBefore, setCleaningPreviewBefore, cleaningPreviewAfter, setCleaningPreviewAfter, cleaningPreviewRemoved, setCleaningPreviewRemoved, previewPage, setPreviewPage, previewItemsPerPage, setPreviewItemsPerPage, isCleaningLoading, setIsCleaningLoading, pendingCleanedList, setPendingCleanedList, removeErrorKeywords, setRemoveErrorKeywords, removeUnclosedThink, setRemoveUnclosedThink, removeCompleteThink, setRemoveCompleteThink, minChars, setMinChars, maxChars, setMaxChars, minPairs, setMinPairs, currentPage, setCurrentPage, convsPerPage, setConvsPerPage, expandedConvs, setExpandedConvs, expandedCells, setExpandedCells, searchQuery, setSearchQuery, maxK, setMaxK, eps, setEps, minSamples, setMinSamples, showVisualization, setShowVisualization, isFindingK, setIsFindingK, findKResults, setFindKResults, targetK, setTargetK, clusterEps, setClusterEps, clusterMinSamples, setClusterMinSamples, clusterRan, setClusterRan, simThreshold, setSimThreshold, clusterPage, setClusterPage, clusterPerPage, isClustering, setIsClustering, clusterResults, setClusterResults, backupConvs, setBackupConvs, showClusterOptionsPopup, setShowClusterOptionsPopup, showCleaningPopup, setShowCleaningPopup, cleaningPopupView, setCleaningPopupView, selectedConv, setSelectedConv, SUB_STEPS_STAGE3, currentSubStep3, setCurrentSubStep3, stage3Page, setStage3Page, stage3PerPage, setStage3PerPage, stage3Search, setStage3Search, showCompareLabels, setShowCompareLabels, showCreateTaskModal, setShowCreateTaskModal, iaActiveTab, setIaActiveTab, showUserGuide, setShowUserGuide, selectedGroup3, setSelectedGroup3, selectedConv3, setSelectedConv3, stage3SubGroup, setStage3SubGroup, stage3Convs, setStage3Convs, checkedConvIds, setCheckedConvIds, cleanVietnameseGreetings, cleanAssistantGreetings, truncateText, highlightSearch, getConversationTopic, getAssistantSummary, selectedIaMsgId, setSelectedIaMsgId, iaMessages, setIaMessages, getLabelBadgeStyle, handleToggleLabel, handleRemoveMessageSingleLabel, SUB_STEPS_STAGE4, currentSubStep4, setCurrentSubStep4, classPage, setClassPage, qualityTab, setQualityTab, rewriteConvIdx, setRewriteConvIdx, rewriteTab, setRewriteTab, judgeModels, setJudgeModels, evalExpanded, setEvalExpanded, sepQualityModal, setSepQualityModal, sepDistributionTab, setSepDistributionTab, sepEvalRecommendation, setSepEvalRecommendation, sepEvalConflictOnly, setSepEvalConflictOnly, sepEvalMinScore, setSepEvalMinScore, sepRunningClass, setSepRunningClass, sepRunningQuality, setSepRunningQuality, sepRunningEval, setSepRunningEval, sepSubjectFilter, setSepSubjectFilter, sepSelectedDistSubject, setSepSelectedDistSubject, sepSelectedDistQuality, setSepSelectedDistQuality, sepSelectedError, setSepSelectedError, sepBalanceApplied, setSepBalanceApplied, sepRewriteGenerated, setSepRewriteGenerated, sepRewriteDecision, setSepRewriteDecision, sepQualityRatings, setSepQualityRatings, sepQualityLabels, setSepQualityLabels, SUB_STEPS_STAGE6, currentSubStep6, setCurrentSubStep6, promptText, setPromptText, promptName, setPromptName, promptDesc, setPromptDesc, selectedVersion, setSelectedVersion, sampleQuestion, setSampleQuestion, trialResponse, setTrialResponse, PROMPT_VERSIONS, exportPage, setExportPage, cloudProvider, setCloudProvider, EXPORT_ROWS, fileInputRef, handleFileUpload, handleRemoveFile, mapConvertedToConversations, handleConvert, handleApplyCleaning, handleVisualizeK, handleCluster, handleRemoveNoise, handleDeduplicate, handleResetFilter, renderJsonHighlighted, getPageNumbers, PREVIEW_BEFORE, PREVIEW_AFTER, PREVIEW_REMOVED, QUALITY_CONVS } = useDataPrep();

  // ── Project: bắt buộc chọn/tạo Project trước khi xử lý dữ liệu ──
  const [newProjectName, setNewProjectName] = React.useState('');
  const [creatingProject, setCreatingProject] = React.useState(false);
  const [projectError, setProjectError] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiService.listProjects();
        if (!cancelled) setProjects(Array.isArray(res.projects) ? res.projects : []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [setProjects]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) { setProjectError('Vui lòng nhập tên Project'); return; }
    setCreatingProject(true);
    setProjectError('');
    try {
      const res = await apiService.createProject({ name });
      const project = res.project;
      setProjects([project, ...(projects || [])]);
      setSelectedProjectId(String(project._id));
      setProjectName(project.name);
      setNewProjectName('');
    } catch (e: any) {
      setProjectError(e?.response?.data?.error || e?.message || 'Tạo Project thất bại');
    }
    setCreatingProject(false);
  };

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    const p = (projects || []).find((x: any) => String(x._id) === String(id));
    if (p) setProjectName(p.name);
  };

  return (
(
    <>
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

          {/* Project (bắt buộc) — mọi dataset & task sẽ nằm trong Project này */}
          <div className="dataprep-field-group">
            <label htmlFor="dp-project-select">
              Project <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              id="dp-project-select"
              className="dataprep-input"
              value={selectedProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
            >
              <option value="">— Chọn Project có sẵn —</option>
              {(projects || []).map((p: any) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                className="dataprep-input"
                placeholder="Hoặc nhập tên Project mới..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateProject(); }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="upload-select-btn"
                onClick={handleCreateProject}
                disabled={creatingProject || !newProjectName.trim()}
              >
                <Plus size={16} /> {creatingProject ? 'Đang tạo...' : 'Tạo Project'}
              </button>
            </div>

            {projectError && (
              <div style={{ color: '#ef4444', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> {projectError}
              </div>
            )}
            {!selectedProjectId && !projectError && (
              <div style={{ color: '#f59e0b', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Bạn phải chọn hoặc tạo một Project trước khi tiếp tục.
              </div>
            )}
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
    </>
  )
);
};
