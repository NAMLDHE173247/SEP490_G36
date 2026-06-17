import React from 'react';
import '../styles/dataprep.css';
import { DataPrepProvider, useDataPrep, STAGES, SUB_STEPS_STAGE2, SAMPLE_RAW_DATA, SAMPLE_OUTPUT, CONVERSATIONS, Tooltip } from './DataPrep/DataPrepContext';
import { Stage1Upload } from './DataPrep/stages/Stage1Upload';
import { Stage2Preprocessing } from './DataPrep/stages/Stage2Preprocessing';
import { Stage3Labeling } from './DataPrep/stages/Stage3Labeling';
import { Stage4TrainEval } from './DataPrep/stages/Stage4TrainEval';
import { Stage5Evaluation } from './DataPrep/stages/Stage5Evaluation';
import { Stage6Finish } from './DataPrep/stages/Stage6Finish';
import { Download, Search, AlertCircle, FileText, Upload, Check, ChevronDown, Trash2, GitCompare, ArrowUpDown, ChevronRight, CheckCircle, RefreshCw, MessageSquare, HelpCircle, Scissors, Filter, Calendar, BarChart2, XCircle, Tag, ClipboardList, Send, Play, Eye, RotateCcw, Plus, Sparkles, ChevronLeft, Settings, X } from 'lucide-react';

const MainRender = () => {
  const { currentStage, setCurrentStage, currentSubStep, setCurrentSubStep, file, setFile, rawPreviewText, setRawPreviewText, sampleOutputText, setSampleOutputText, projectName, setProjectName, rawPreviewOpen, setRawPreviewOpen, conversationsList, setConversationsList, selectedFormat, setSelectedFormat, removeThinkTags, setRemoveThinkTags, cleaningEnabled, setCleaningEnabled, cleaningApplied, setCleaningApplied, showPreviewModal, setShowPreviewModal, previewTab, setPreviewTab, conversionStats, setConversionStats, cleaningPreviewBefore, setCleaningPreviewBefore, cleaningPreviewAfter, setCleaningPreviewAfter, cleaningPreviewRemoved, setCleaningPreviewRemoved, previewPage, setPreviewPage, previewItemsPerPage, setPreviewItemsPerPage, isCleaningLoading, setIsCleaningLoading, pendingCleanedList, setPendingCleanedList, removeErrorKeywords, setRemoveErrorKeywords, removeUnclosedThink, setRemoveUnclosedThink, removeCompleteThink, setRemoveCompleteThink, minChars, setMinChars, maxChars, setMaxChars, minPairs, setMinPairs, currentPage, setCurrentPage, convsPerPage, setConvsPerPage, expandedConvs, setExpandedConvs, expandedCells, setExpandedCells, searchQuery, setSearchQuery, maxK, setMaxK, eps, setEps, minSamples, setMinSamples, showVisualization, setShowVisualization, isFindingK, setIsFindingK, findKResults, setFindKResults, targetK, setTargetK, clusterEps, setClusterEps, clusterMinSamples, setClusterMinSamples, clusterRan, setClusterRan, simThreshold, setSimThreshold, clusterPage, setClusterPage, clusterPerPage, isClustering, setIsClustering, clusterResults, setClusterResults, backupConvs, setBackupConvs, showClusterOptionsPopup, setShowClusterOptionsPopup, showCleaningPopup, setShowCleaningPopup, cleaningPopupView, setCleaningPopupView, selectedConv, setSelectedConv, SUB_STEPS_STAGE3, currentSubStep3, setCurrentSubStep3, stage3Page, setStage3Page, stage3PerPage, setStage3PerPage, stage3Search, setStage3Search, showCompareLabels, setShowCompareLabels, showCreateTaskModal, setShowCreateTaskModal, iaActiveTab, setIaActiveTab, showUserGuide, setShowUserGuide, selectedGroup3, setSelectedGroup3, selectedConv3, setSelectedConv3, stage3SubGroup, setStage3SubGroup, stage3Convs, setStage3Convs, checkedConvIds, setCheckedConvIds, cleanVietnameseGreetings, cleanAssistantGreetings, truncateText, highlightSearch, getConversationTopic, getAssistantSummary, selectedIaMsgId, setSelectedIaMsgId, iaMessages, setIaMessages, getLabelBadgeStyle, handleToggleLabel, handleRemoveMessageSingleLabel, SUB_STEPS_STAGE4, currentSubStep4, setCurrentSubStep4, classPage, setClassPage, qualityTab, setQualityTab, rewriteConvIdx, setRewriteConvIdx, rewriteTab, setRewriteTab, judgeModels, setJudgeModels, evalExpanded, setEvalExpanded, sepQualityModal, setSepQualityModal, sepDistributionTab, setSepDistributionTab, sepEvalRecommendation, setSepEvalRecommendation, sepEvalConflictOnly, setSepEvalConflictOnly, sepEvalMinScore, setSepEvalMinScore, sepRunningClass, setSepRunningClass, sepRunningQuality, setSepRunningQuality, sepRunningEval, setSepRunningEval, sepSubjectFilter, setSepSubjectFilter, sepSelectedDistSubject, setSepSelectedDistSubject, sepSelectedDistQuality, setSepSelectedDistQuality, sepSelectedError, setSepSelectedError, sepBalanceApplied, setSepBalanceApplied, sepRewriteGenerated, setSepRewriteGenerated, sepRewriteDecision, setSepRewriteDecision, sepQualityRatings, setSepQualityRatings, sepQualityLabels, setSepQualityLabels, SUB_STEPS_STAGE6, currentSubStep6, setCurrentSubStep6, promptText, setPromptText, promptName, setPromptName, promptDesc, setPromptDesc, selectedVersion, setSelectedVersion, sampleQuestion, setSampleQuestion, trialResponse, setTrialResponse, PROMPT_VERSIONS, exportPage, setExportPage, cloudProvider, setCloudProvider, EXPORT_ROWS, fileInputRef, handleFileUpload, handleRemoveFile, mapConvertedToConversations, handleConvert, handleApplyCleaning, handleVisualizeK, handleCluster, handleRemoveNoise, handleDeduplicate, handleResetFilter, renderJsonHighlighted, getPageNumbers, PREVIEW_BEFORE, PREVIEW_AFTER, PREVIEW_REMOVED, QUALITY_CONVS } = useDataPrep();
  return (
    <div className="dataprep-view">
      {/* Cleaning Preview Modal */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content cleaning-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔍 Cleaning Preview</h2>
              <p className="modal-subtitle">Xem trước kết quả làm sạch dữ liệu — file gốc không bị thay đổi</p>
              <button className="modal-close-btn" onClick={() => setShowPreviewModal(false)}>
                <X size={20} />
              </button>
            </div>

            {(() => {
              const beforeList = cleaningPreviewBefore.length > 0 ? cleaningPreviewBefore : PREVIEW_BEFORE;
              const afterList = cleaningPreviewAfter.length > 0 ? cleaningPreviewAfter : PREVIEW_AFTER;
              const removedList = cleaningPreviewRemoved.length > 0 ? cleaningPreviewRemoved : PREVIEW_REMOVED;
              const totalCount = beforeList.length;
              const keptCount = afterList.length;
              const fixedCount = afterList.filter(r => r.status === 'fixed').length;
              const removedCount = removedList.length;

              return (
                <>
                  {/* Tabs */}
                  <div className="preview-modal-tabs">
                    <button
                      className={`preview-tab ${previewTab === 'before' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('before')}
                    >
                      📄 Before (Mẫu {totalCount})
                    </button>
                    <button
                      className={`preview-tab ${previewTab === 'after' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('after')}
                    >
                      ✅ After (Mẫu {keptCount})
                    </button>
                    <button
                      className={`preview-tab tab-removed ${previewTab === 'removed' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('removed')}
                    >
                      🗑️ Removed (Mẫu {removedCount})
                    </button>
                  </div>

                  {(() => {
                    const realTotal = conversionStats?.stats?.cleaning?.originalCount ?? conversionStats?.stats?.totalConversations ?? conversationsList.length;
                    const realKept = conversionStats?.stats?.cleaning?.finalCount ?? conversationsList.length;
                    const realRemoved = realTotal - realKept;
                    const realFixed = conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0;

                    return (
                      <>
                        {/* Summary bar */}
                        <div className="preview-modal-summary">
                          <span className="summary-tag summary-total">Tổng tệp: {realTotal} hội thoại</span>
                          <span className="summary-tag summary-kept">Giữ lại: {realKept}</span>
                          <span className="summary-tag summary-fixed">Đã sửa: {realFixed}</span>
                          <span className="summary-tag summary-removed">Loại bỏ: {realRemoved}</span>
                        </div>

                        {/* Info Alert */}
                        <div className="preview-modal-info-alert" style={{ margin: '8px 16px', padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: '6px', borderLeft: '4px solid #3b82f6', color: '#1e3a8a', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>ℹ️</span>
                          <span><strong>Lưu ý:</strong> Bảng bên dưới chỉ hiển thị mẫu {totalCount} hội thoại đầu tiên để xem trước kết quả. Khi bấm "Xác nhận & Áp dụng", bộ lọc sẽ được áp dụng cho <strong>tất cả {realTotal} cuộc hội thoại</strong> trong tệp dữ liệu.</span>
                        </div>
                      </>
                    );
                  })()}

                  {/* Tab Content */}
                  <div className="preview-modal-body">
                    {previewTab === 'before' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Status</th>
                            <th>User</th>
                            <th>Assistant (trước)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {beforeList.map((row) => (
                            <tr key={row.id} className={row.status === 'has-issue' ? 'row-issue' : 'row-clean'}>
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td>
                                {row.issue
                                  ? <span className="status-badge badge-issue">{row.issue}</span>
                                  : <span className="status-badge badge-clean">Clean</span>
                                }
                              </td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {previewTab === 'after' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Action</th>
                            <th>User</th>
                            <th>Assistant (sau)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {afterList.map((row) => (
                            <tr key={row.id} className={row.status === 'fixed' ? 'row-fixed' : 'row-clean'}>
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td><span className={`status-badge ${row.status === 'fixed' ? 'badge-fixed' : 'badge-clean'}`}>{row.action}</span></td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {previewTab === 'removed' && (
                      <table className="preview-modal-table">
                        <thead>
                          <tr>
                            <th>Conv ID</th>
                            <th>Lý do loại bỏ</th>
                            <th>User</th>
                            <th>Assistant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {removedList.map((row) => (
                            <tr key={row.id} className="row-removed">
                              <td><span className="conv-id-badge">{row.id}</span></td>
                              <td><span className="status-badge badge-removed">{row.reason}</span></td>
                              <td className="cell-truncate">{row.user}</td>
                              <td className="cell-truncate">{row.assistant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="preview-modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowPreviewModal(false)}>
                Hủy
              </button>
              <button className="modal-confirm-btn" onClick={() => {
                if (pendingCleanedList.length > 0) {
                  setConversationsList(pendingCleanedList);
                  setStage3Convs(pendingCleanedList.map((c, idx) => {
                    const INITIAL_GROUP_DATA = [
                      { id: 1, label: 'MATH', color: '#6366f1', bg: '#eef2ff' },
                      { id: 2, label: 'CODING', color: '#0891b2', bg: '#ecfeff' },
                      { id: 3, label: 'PHYSICS', color: '#059669', bg: '#ecfdf5' },
                      { id: 4, label: 'MATH', color: '#d97706', bg: '#fffbeb' },
                      { id: 5, label: 'Group -1', color: '#dc2626', bg: '#fef2f2' }
                    ];
                    const group = INITIAL_GROUP_DATA[idx % INITIAL_GROUP_DATA.length];
                    return {
                      ...c,
                      groupId: group.id,
                      groupLabel: group.label,
                      groupColor: group.color,
                      groupBg: group.bg,
                      confidence: Math.floor(Math.random() * 10 + 90)
                    };
                  }));
                }
                setCleaningApplied(true);
                setShowPreviewModal(false);
              }}>
                <Check size={16} />
                Xác nhận & Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="dataprep-stepper">
        {STAGES.map((stage, idx) => (
          <React.Fragment key={stage.num}>
            <div
              className={`stepper-step ${stage.num === currentStage ? 'active' : ''} ${stage.num < currentStage ? 'completed' : ''}`}
              onClick={() => setCurrentStage(stage.num)}
            >
              <div className="stepper-circle">
                {stage.num < currentStage ? <Check size={16} /> : stage.num}
              </div>
              <div className="stepper-label">
                <span className="stepper-stage-tag">STAGE {stage.num}</span>
                <span className="stepper-title">{stage.label}</span>
                <span className="stepper-sublabel">{stage.sub}</span>
              </div>
            </div>
            {idx < STAGES.length - 1 && <div className="stepper-divider" />}
          </React.Fragment>
        ))}
      </div>

      {/* Stage Content */}
      {currentStage === 1 && <Stage1Upload />}
      {currentStage === 2 && <Stage2Preprocessing />}
      {currentStage === 3 && <Stage3Labeling />}
      {currentStage === 4 && <Stage4TrainEval />}
      {currentStage === 5 && <Stage5Evaluation />}
      {currentStage === 6 && <Stage6Finish />}

      {/* Compare Groups Modal */}


      {/* Compare AI Labels Modal */}
      {showCompareLabels && (
        <div className="compare-modal-overlay" onClick={() => setShowCompareLabels(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-header">
              <div>
                <h2>Compare AI Labels</h2>
                <p>Select two AI providers to compare their auto-labeling results.</p>
              </div>
              <button className="cl-close" onClick={() => setShowCompareLabels(false)}><X size={18} /></button>
            </div>

            <div className="cl-providers">
              <span className="cl-prov-label">Provider A:</span>
              <select className="cl-prov-select"><option>Gemini</option><option>Deepseek</option></select>
              <span className="cl-prov-arrow">›</span>
              <span className="cl-prov-label">Provider B:</span>
              <select className="cl-prov-select"><option>Deepseek</option><option>Gemini</option></select>
            </div>

            <div className="cl-stats">
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-green">100%</span>
                <span className="cl-stat-label">AGREEMENT RATE</span>
              </div>
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-blue">120</span>
                <span className="cl-stat-label">MATCHES</span>
              </div>
              <div className="cl-stat-card">
                <span className="cl-stat-value cl-red">0</span>
                <span className="cl-stat-label">MISMATCHES</span>
              </div>
            </div>

            <div className="cl-table-wrap">
              <table className="cl-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>CONVERSATION</th>
                    <th style={{ width: '20%' }}>GEMINI LABEL</th>
                    <th style={{ width: '20%' }}>DEEPSEEK LABEL</th>
                    <th style={{ width: '20%' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { user: 'Em không hiểu chuyển động thẳng đều là gì.', asst: 'Không sao, mình đi từng bước nhé. Em thử nghĩ xem: khi nói một vật chuyển động, điều đó có nghĩa là gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Là vật đang đi chuyển a.', asst: 'Đúng rồi. Bây giờ em thử nghĩ thêm: nếu một xe ô tô chạy trên đường thẳng và luôn giữ nguyên tốc độ, em nghĩ là gọi đó là loại chuyển động gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Chuyển động đều a?', asst: 'Rất gần rồi! Đầy đủ hơn là \'chuyển động thẳng đều\'. Em thử đoán xem \'thẳng\' ở đây có nghĩa là gì trong chuyển động?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Công thức x = x0 + vt có nghĩa là gì a?', asst: 'Câu hỏi hay. Trước khi giải thích, em đoán xem \'x\' và \'x0\' biểu diễn điều gì?', gLabel: 'PHYSICAL', gConf: 98, dLabel: 'MATH', dConf: 90, match: false },
                    { user: 'x là vị trí còn x0 là vị trí ban đầu a?', asst: 'Đúng rồi! Vậy vt là gì? Nếu v là vận tốc và t là thời gian, tích v nhân t sẽ cho ta biết điều gì?', gLabel: 'PHYSICAL', gConf: 100, dLabel: 'PHYSICAL', dConf: 95, match: true },
                    { user: 'Tính đạo hàm của hàm số f(x) = x² - 3x + 2.', asst: 'f\'(x) = 2x - 3. Áp dụng quy tắc đạo hàm lũy thừa.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 97, match: true },
                    { user: 'Tính tích phân ∫x² dx.', asst: '∫x² dx = x³/3 + C. Áp dụng công thức ∫xⁿ dx = xⁿ⁺¹/(n+1) + C.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 96, match: true },
                    { user: 'Giải hệ phương trình: x + y = 5 và x - y = 1.', asst: 'Cộng hai phương trình: 2x = 6 → x = 3, y = 2.', gLabel: 'MATH', gConf: 99, dLabel: 'MATH', dConf: 95, match: true },
                    { user: 'Tính xác suất để tung đồng xu 3 lần ra đúng 2 mặt ngửa.', asst: 'P(X=2) = C(3,2) · (1/2)² · (1/2)¹ = 3/8.', gLabel: 'MATH', gConf: 100, dLabel: 'MATH', dConf: 94, match: true },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td>
                        <div className="cl-conv-user">{row.user}</div>
                        <div className="cl-conv-asst">{row.asst}</div>
                      </td>
                      <td><span className={`cl-pill cl-pill-${row.gLabel.toLowerCase()}`}>{row.gLabel} ({row.gConf}%)</span></td>
                      <td><span className={`cl-pill cl-pill-${row.dLabel.toLowerCase()}`}>{row.dLabel} ({row.dConf}%)</span></td>
                      <td><span className={`cl-status ${row.match ? 'cl-match' : 'cl-mismatch'}`}>{row.match ? 'Match' : 'Mismatch'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Labeling Task Modal */}
      {showCreateTaskModal && (
        <div className="compare-modal-overlay" onClick={() => setShowCreateTaskModal(false)}>
          <div className="ct-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ct-header">
              <h2>Create Labeling Task</h2>
              <p>Divide unassigned samples into a new task. (Unassigned samples left: 4)</p>
            </div>

            <div className="ct-body">
              <div className="ct-form-group">
                <label>Task Name</label>
                <input type="text" placeholder="e.g. Batch 1 - Math Labeling" className="ct-input" />
              </div>

              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Batch Size</label>
                  <input type="number" defaultValue={30} className="ct-input" />
                </div>
                <div className="ct-form-group">
                  <label>Priority</label>
                  <select className="ct-select" defaultValue="Medium">
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </div>
              </div>

              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Review Mode</label>
                  <select className="ct-select" defaultValue="Single Review (1 Annotator)">
                    <option>Single Review (1 Annotator)</option>
                    <option>Double Review (2 Annotators)</option>
                    <option>Triple Review (3 Annotators)</option>
                  </select>
                </div>
                <div className="ct-form-group">
                  <label>Deadline (Optional)</label>
                  <div className="ct-date-input">
                    <input type="text" placeholder="dd/mm/yyyy" className="ct-input" />
                    <Calendar size={14} className="ct-date-icon" />
                  </div>
                </div>
              </div>

              <div className="ct-form-group">
                <label>Assignees</label>
                <div className="ct-assignees-box">
                  <label className="ct-checkbox-label">
                    <input type="checkbox" />
                    <span><strong>hoang22</strong> (hoangndnhe180790@fpt.edu.vn)</span>
                  </label>
                  <label className="ct-checkbox-label">
                    <input type="checkbox" />
                    <span><strong>uhhgf</strong> (hoangndhhefff180790@fpt.edu.vn)</span>
                  </label>
                </div>
              </div>

              <div className="ct-form-group">
                <label>Guideline (URL or Instructions)</label>
                <textarea placeholder="Link to Notion/Google Doc, or short text..." className="ct-textarea"></textarea>
              </div>

              <div className="ct-form-group">
                <label className="ct-checkbox-label" style={{ marginTop: '8px' }}>
                  <input type="checkbox" />
                  <strong>Tắt gợi ý nhãn từ AI (Disable AI Suggestion)</strong>
                </label>
              </div>
            </div>

            <div className="ct-footer">
              <button className="ct-btn-cancel" onClick={() => setShowCreateTaskModal(false)}>Cancel</button>
              <button className="ct-btn-create">Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function DataPrepView() {
  return (
    <DataPrepProvider>
      <MainRender />
    </DataPrepProvider>
  );
}
