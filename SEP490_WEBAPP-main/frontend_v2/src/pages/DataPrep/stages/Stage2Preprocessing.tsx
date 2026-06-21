import React from 'react';
import { useDataPrep, SAMPLE_RAW_DATA, SAMPLE_OUTPUT, SUB_STEPS_STAGE2 } from '../DataPrepContext';
import { Tooltip } from '../utils';
import { Download, Search, AlertCircle, FileText, Upload, Check, ChevronDown, Trash2, GitCompare, ArrowUpDown, ChevronRight, CheckCircle, RefreshCw, MessageSquare, HelpCircle, Scissors, Filter, Calendar, BarChart2, XCircle, Tag, ClipboardList, Send, Play, Eye, RotateCcw, Plus, Sparkles, ChevronLeft, Settings, X, Users } from 'lucide-react';

export const Stage2Preprocessing = () => {
  const { currentStage, setCurrentStage, currentSubStep, setCurrentSubStep, file, setFile, rawPreviewText, setRawPreviewText, sampleOutputText, setSampleOutputText, projectName, setProjectName, rawPreviewOpen, setRawPreviewOpen, conversationsList, setConversationsList, selectedFormat, setSelectedFormat, removeThinkTags, setRemoveThinkTags, cleaningEnabled, setCleaningEnabled, cleaningApplied, setCleaningApplied, showPreviewModal, setShowPreviewModal, previewTab, setPreviewTab, conversionStats, setConversionStats, cleaningPreviewBefore, setCleaningPreviewBefore, cleaningPreviewAfter, setCleaningPreviewAfter, cleaningPreviewRemoved, setCleaningPreviewRemoved, previewPage, setPreviewPage, previewItemsPerPage, setPreviewItemsPerPage, isCleaningLoading, setIsCleaningLoading, pendingCleanedList, setPendingCleanedList, removeErrorKeywords, setRemoveErrorKeywords, removeUnclosedThink, setRemoveUnclosedThink, removeCompleteThink, setRemoveCompleteThink, minChars, setMinChars, maxChars, setMaxChars, minPairs, setMinPairs, currentPage, setCurrentPage, convsPerPage, setConvsPerPage, expandedConvs, setExpandedConvs, expandedCells, setExpandedCells, searchQuery, setSearchQuery, maxK, setMaxK, eps, setEps, minSamples, setMinSamples, showVisualization, setShowVisualization, isFindingK, setIsFindingK, findKResults, setFindKResults, targetK, setTargetK, clusterEps, setClusterEps, clusterMinSamples, setClusterMinSamples, clusterRan, setClusterRan, simThreshold, setSimThreshold, clusterPage, setClusterPage, clusterPerPage, isClustering, setIsClustering, clusterResults, setClusterResults, backupConvs, setBackupConvs, showClusterOptionsPopup, setShowClusterOptionsPopup, showCleaningPopup, setShowCleaningPopup, cleaningPopupView, setCleaningPopupView, selectedConv, setSelectedConv, SUB_STEPS_STAGE3, currentSubStep3, setCurrentSubStep3, stage3Page, setStage3Page, stage3PerPage, setStage3PerPage, stage3Search, setStage3Search, showCompareLabels, setShowCompareLabels, showCreateTaskModal, setShowCreateTaskModal, iaActiveTab, setIaActiveTab, showUserGuide, setShowUserGuide, selectedGroup3, setSelectedGroup3, selectedConv3, setSelectedConv3, stage3SubGroup, setStage3SubGroup, stage3Convs, setStage3Convs, checkedConvIds, setCheckedConvIds, cleanVietnameseGreetings, cleanAssistantGreetings, truncateText, highlightSearch, getConversationTopic, getAssistantSummary, selectedIaMsgId, setSelectedIaMsgId, iaMessages, setIaMessages, getLabelBadgeStyle, handleToggleLabel, handleRemoveMessageSingleLabel, SUB_STEPS_STAGE4, currentSubStep4, setCurrentSubStep4, classPage, setClassPage, qualityTab, setQualityTab, rewriteConvIdx, setRewriteConvIdx, rewriteTab, setRewriteTab, judgeModels, setJudgeModels, evalExpanded, setEvalExpanded, sepQualityModal, setSepQualityModal, sepDistributionTab, setSepDistributionTab, sepEvalRecommendation, setSepEvalRecommendation, sepEvalConflictOnly, setSepEvalConflictOnly, sepEvalMinScore, setSepEvalMinScore, sepRunningClass, setSepRunningClass, sepRunningQuality, setSepRunningQuality, sepRunningEval, setSepRunningEval, sepSubjectFilter, setSepSubjectFilter, sepSelectedDistSubject, setSepSelectedDistSubject, sepSelectedDistQuality, setSepSelectedDistQuality, sepSelectedError, setSepSelectedError, sepBalanceApplied, setSepBalanceApplied, sepRewriteGenerated, setSepRewriteGenerated, sepRewriteDecision, setSepRewriteDecision, sepQualityRatings, setSepQualityRatings, sepQualityLabels, setSepQualityLabels, SUB_STEPS_STAGE6, currentSubStep6, setCurrentSubStep6, promptText, setPromptText, promptName, setPromptName, promptDesc, setPromptDesc, selectedVersion, setSelectedVersion, sampleQuestion, setSampleQuestion, trialResponse, setTrialResponse, PROMPT_VERSIONS, exportPage, setExportPage, cloudProvider, setCloudProvider, EXPORT_ROWS, fileInputRef, handleFileUpload, handleRemoveFile, mapConvertedToConversations, handleConvert, handleApplyCleaning, handleVisualizeK, handleCluster, handleRemoveNoise, handleDeduplicate, handleResetFilter, renderJsonHighlighted, getPageNumbers, PREVIEW_BEFORE, PREVIEW_AFTER, PREVIEW_REMOVED, QUALITY_CONVS } = useDataPrep();

  {
    const totalConvs = conversationsList.length;
    const totalMessages = conversationsList.reduce((sum, c) => sum + c.messages.length, 0);

    /* Filter conversations by search */
    const filtered = searchQuery.trim()
      ? conversationsList.filter(conv =>
        conv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages.some(m =>
          m.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.assistant.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
      : conversationsList;

    const filteredTotal = filtered.length;
    const totalPages = Math.ceil(filteredTotal / convsPerPage);

    /* Slice conversations for this page */
    const startConvIdx = (currentPage - 1) * convsPerPage;
    const pageConvs = filtered.slice(startConvIdx, startConvIdx + convsPerPage);
    const pageMsgCount = pageConvs.reduce((sum, c) => sum + c.messages.length, 0);

    const handleConvsPerPageChange = (val) => {
      setConvsPerPage(parseInt(val, 10));
      setCurrentPage(1);
    };

    const toggleConv = (convId) => {
      setExpandedConvs(prev => ({
        ...prev,
        [convId]: prev[convId] !== undefined ? !prev[convId] : false,
      }));
    };

    const expandAll = () => {
      const all = {};
      filtered.forEach(c => { all[c.id] = true; });
      setExpandedConvs(all);
    };

    const collapseAll = () => {
      const all = {};
      filtered.forEach(c => { all[c.id] = false; });
      setExpandedConvs(all);
    };

    /* Click-to-expand cell */
    const toggleCell = (cellKey) => {
      setExpandedCells(prev => ({ ...prev, [cellKey]: !prev[cellKey] }));
    };

    /* using component-level highlightSearch */

    return (
      <>
        {/* Sub-stepper */}
        <div className="sub-stepper">
          {SUB_STEPS_STAGE2.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep ? 'active' : ''} ${step.num < currentSubStep ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num < currentSubStep ? <Check size={14} /> : step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE2.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {currentSubStep === 1 && (
          <>
            {/* Post-conversion Statistics — shown above table after cleaning is applied */}
            {cleaningApplied && (() => {
              const converted = conversionStats?.stats?.totalConversations ?? conversionStats?.totalConversations ?? totalConvs;
              const sourceMessages = conversionStats?.stats?.totalMessages ?? (totalMessages + 47);
              const removedKeyword = conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0;
              const removedLength = (conversionStats?.stats?.cleaning?.removedTooShort ?? 0) + (conversionStats?.stats?.cleaning?.removedTooLong ?? 0);
              const removedThink = conversionStats?.stats?.cleaning?.removedUnclosedThink ?? 0;
              const final = conversionStats?.stats?.cleaning?.finalCount ?? totalConvs;
              const removed = (removedKeyword + removedLength + removedThink + (conversionStats?.stats?.cleaning?.removedDuplicates ?? 0)) || 47;
              const removedRecordPct = converted > 0 ? Math.round(((converted - final) / converted) * 100) : 0;
              const source = conversionStats?.stats?.cleaning?.originalCount ?? (final + removed);
              const finalPct = source > 0 ? Math.round((final / source) * 100) : 100;
              const ringR = 24;
              const ringCirc = 2 * Math.PI * ringR;
              const ringDash = (ringCirc * finalPct) / 100;

              return (
                <div className="post-stats-card">
                  <div className="post-stats-bar">
                    <div className="post-stats-title">
                      <Check size={16} className="post-stats-icon" />
                      <span>Thống kê Sau Chuyển đổi</span>
                    </div>

                    <div className="post-stats-sections">
                      <div className="post-stats-group">
                        <div className="post-stats-group-title">Tổng quan Nguồn</div>
                        <div className="post-stats-group-body">
                          <div className="stat-card">
                            <Users size={22} className="stat-card-icon icon-muted" />
                            <div className="stat-card-text">
                              <span className="stat-card-label">Tổng số Hồ sơ</span>
                              <span className="stat-card-value text-green">{converted}</span>
                            </div>
                          </div>
                          <div className="stat-card">
                            <MessageSquare size={22} className="stat-card-icon icon-muted" />
                            <div className="stat-card-text">
                              <span className="stat-card-label">Tổng số Tin nhắn</span>
                              <span className="stat-card-value text-green">{sourceMessages}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="post-stats-vline" />

                      <div className="post-stats-group">
                        <div className="post-stats-group-title">Lọc &amp; Chuyển đổi</div>
                        <div className="post-stats-group-body">
                          <div className="stat-card">
                            <Filter size={20} className="stat-card-icon icon-red" />
                            <div className="stat-card-text">
                              <span className="stat-card-label">
                                Đã loại bỏ: <strong className="text-strong">{removed} Tin nhắn</strong>{' '}
                                <span className="stat-card-sub">({removedRecordPct}% Hồ sơ)</span>
                              </span>
                              <div className="removed-pills">
                                <span>Từ khóa: {removedKeyword}</span>
                                <span className="dot">·</span>
                                <span>Độ dài: {removedLength}</span>
                                <span className="dot">·</span>
                                <span>Thẻ &lt;think&gt;: {removedThink}</span>
                              </div>
                            </div>
                          </div>
                          <div className="stat-card">
                            <CheckCircle size={22} className="stat-card-icon icon-green" />
                            <div className="stat-card-text">
                              <span className="stat-card-label">Hội thoại Hợp lệ</span>
                              <span className="stat-card-value text-green">{final}</span>
                            </div>
                          </div>
                          <div className="conversion-ring">
                            <svg width="56" height="56" viewBox="0 0 56 56">
                              <circle cx="28" cy="28" r={ringR} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                              <circle cx="28" cy="28" r={ringR} fill="none" stroke="#22c55e" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ringDash} ${ringCirc}`} transform="rotate(-90 28 28)" />
                              <text x="28" y="32" textAnchor="middle" style={{ fontSize: '14px', fontWeight: 800, fill: '#16a34a' }}>{finalPct}%</text>
                            </svg>
                            <div className="stat-card-text">
                              <span className="stat-card-label">Hoàn tất Chuyển đổi</span>
                              <span className="stat-card-value-sm">{final} / {converted}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Full-width content (no sidebar) */}
            <div className="cluster-fullwidth">
              <div className="preview-header">
                <h3>Converted Dataset Preview</h3>
                <div className="preview-header-right">
                  <span className="preview-count">
                    {pageMsgCount} messages · Showing {startConvIdx + 1}-{Math.min(startConvIdx + convsPerPage, filteredTotal)} of {filteredTotal} conversations
                    {searchQuery && ` (filtered from ${totalConvs})`}
                  </span>
                  <button className="cleaning-pipeline-trigger-btn" onClick={() => {
                    setShowCleaningPopup(true);
                    if (cleaningApplied) {
                      setCleaningPopupView('preview');
                    } else {
                      setCleaningPopupView('settings');
                    }
                  }}>
                    <Settings size={16} />
                    Data Cleaning Pipeline
                  </button>
                </div>
              </div>

              <div className="preview-toolbar">
                <div className="toolbar-select-wrapper">
                  <label className="toolbar-label">Conversations / page:</label>
                  <select
                    className="toolbar-select"
                    value={convsPerPage}
                    onChange={(e) => handleConvsPerPageChange(e.target.value)}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                  </select>
                </div>
                <div className="toolbar-search">
                  <input
                    type="text"
                    className="toolbar-search-input"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  />
                </div>
                <div className="toolbar-stats">
                  <span className="toolbar-stat-tag">{totalConvs} conversations</span>
                  <span className="toolbar-stat-tag">{totalMessages} messages</span>
                </div>
              </div>

              <div className="preview-table-wrapper cluster-table-full">
                <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }}>STT</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Conv ID</th>
                      <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '30%' }}>User</th>
                      <th style={{ width: '43%' }}>Assistant</th>
                      <th style={{ width: '8%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageConvs.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          No conversations match your search.
                        </td>
                      </tr>
                    )}
                    {pageConvs.map((conv, convPageIdx) => {
                      const groupClass = (startConvIdx + convPageIdx) % 2 === 1 ? 'conv-group-alt' : '';
                      const convGlobalIdx = startConvIdx + convPageIdx + 1;
                      const status = conv.status || 'clean';

                      return (
                        <tr
                          key={conv.id}
                          className={`conv-row conv-first conv-last ${groupClass} conv-clickable`}
                        >
                          <td className="col-conv-num-cell">{convGlobalIdx}</td>
                          <td className="col-conv-id-cell">
                            <span className="conv-id-badge">{conv.id}</span>
                            <span className="conv-msg-count">{conv.messages.length} messages</span>
                            {cleaningApplied && (
                              <span className={`conv-status-badge badge-${status}`}>
                                {status === 'clean' ? '✓ Clean' : status === 'fixed' ? '🔧 Fixed' : '✗ Removed'}
                              </span>
                            )}
                          </td>
                          <td className="col-msg-num-cell">{conv.messages.length}</td>
                          <td className="cell-text-col" style={{ padding: '12px' }}>
                            <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {conv.messages.length === 1 ? (
                                /* Đơn lượt: Hiển thị câu hỏi đầy đủ dạng bọc dòng */
                                <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                  {highlightSearch(conv.messages[0].user, searchQuery)}
                                </div>
                              ) : (
                                /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                                <>
                                  <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '13px' }}>Chủ đề:</span>
                                    <span style={{ fontSize: '13.5px', color: '#4f46e5' }}>
                                      {getConversationTopic(conv.messages)}
                                    </span>
                                  </div>
                                  <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                    {conv.messages.slice(0, 3).map((msg, idx) => (
                                      <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx + 1}:</span>
                                        <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                          {highlightSearch(truncateText(msg.user, 150), searchQuery)}
                                        </span>
                                      </div>
                                    ))}
                                    {conv.messages.length > 3 && (
                                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        + {conv.messages.length - 3} lượt thoại khác (bấm Detail để xem)
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="cell-text-col" style={{ padding: '12px' }}>
                            <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {conv.messages.length === 1 ? (
                                /* Đơn lượt: Hiển thị phản hồi đầy đủ dạng bọc dòng */
                                <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                  {highlightSearch(conv.messages[0].assistant, searchQuery)}
                                </div>
                              ) : (
                                /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                                <>
                                  <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '13px' }}>Phản hồi:</span>
                                    <span style={{ fontSize: '13.5px', color: '#0891b2' }}>
                                      {getAssistantSummary(conv.messages)}
                                    </span>
                                  </div>
                                  <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                    {conv.messages.slice(0, 3).map((msg, idx) => (
                                      <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                        <span style={{ fontWeight: '600', color: '#0ea5e9', flexShrink: 0 }}>A{idx + 1}:</span>
                                        <span style={{ color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                          {highlightSearch(truncateText(msg.assistant, 150), searchQuery)}
                                        </span>
                                      </div>
                                    ))}
                                    {conv.messages.length > 3 && (
                                      <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        + {conv.messages.length - 3} phản hồi khác (bấm Detail để xem)
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="col-action-cell">
                            <button className="view-detail-btn" onClick={() => setSelectedConv(conv)}>
                              <Eye size={14} />
                              Detail
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="preview-pagination">
                <button
                  className="pagination-arrow"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  ‹
                </button>
                {getPageNumbers(currentPage, totalPages).map((page, idx) =>
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  className="pagination-arrow"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Conversation Detail Popup */}
            {selectedConv && (
              <div className="cluster-popup-overlay" onClick={() => setSelectedConv(null)}>
                <div className="cluster-popup-content conv-detail-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="cluster-popup-header">
                    <div className="cluster-popup-header-left">
                      <MessageSquare size={20} />
                      <div>
                        <h2>Conversation Detail</h2>
                        <p>{selectedConv.id} · {selectedConv.messages.length} messages</p>
                      </div>
                    </div>
                    <button className="cluster-popup-close-btn" onClick={() => setSelectedConv(null)}>
                      <X size={18} />
                      Close
                    </button>
                  </div>

                  <div className="conv-detail-body">
                    {selectedConv.messages.map((msg, idx) => (
                      <div key={idx} className="conv-detail-pair">
                        <div className="conv-detail-label">#{idx + 1}</div>
                        <div className="conv-detail-msg conv-detail-user">
                          <div className="conv-detail-role">👤 User</div>
                          <div className="conv-detail-text">{msg.user}</div>
                        </div>
                        <div className="conv-detail-msg conv-detail-assistant">
                          <div className="conv-detail-role">🤖 Assistant</div>
                          <div className="conv-detail-text">{msg.assistant}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Data Cleaning Pipeline Popup (merged with Preview) */}
            {showCleaningPopup && (
              <div className="cluster-popup-overlay" onClick={() => { setShowCleaningPopup(false); setCleaningPopupView('settings'); }}>
                <div className={`cluster-popup-content cleaning-popup-content ${cleaningPopupView === 'preview' ? 'cleaning-popup-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
                  <div className="cluster-popup-header">
                    <div className="cluster-popup-header-left">
                      <Settings size={20} />
                      <div>
                        <h2>{cleaningPopupView === 'settings' ? 'Data Cleaning Pipeline' : '🔍 Cleaning Preview'}</h2>
                        <p>{cleaningPopupView === 'settings' ? 'Configure cleaning rules, character limits, and preview changes before applying' : 'Xem trước kết quả làm sạch dữ liệu — file gốc không bị thay đổi'}</p>
                      </div>
                    </div>
                    <button className="cluster-popup-close-btn" onClick={() => { setShowCleaningPopup(false); setCleaningPopupView('settings'); }}>
                      <X size={18} />
                      Close
                    </button>
                  </div>

                  {/* ===== VIEW: Settings ===== */}
                  {cleaningPopupView === 'settings' && (
                    <div className="cluster-popup-body">
                      {/* Enable toggle section */}
                      <div className="cluster-popup-section">
                        <div className="cleaning-pipeline-row">
                          <span className="cleaning-label">Data Cleaning Pipeline</span>
                          <label className="cleaning-toggle">
                            <span className="toggle-text">Enable</span>
                            <input
                              type="checkbox"
                              checked={cleaningEnabled}
                              onChange={() => setCleaningEnabled(!cleaningEnabled)}
                            />
                            <span className="toggle-checkmark"></span>
                          </label>
                        </div>

                        {cleaningEnabled && (
                          <div className="cleaning-options">
                            {/* Checkbox: Xóa thẻ think hoàn chỉnh */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeCompleteThink}
                                onChange={() => setRemoveCompleteThink(!removeCompleteThink)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Xóa các cặp thẻ &lt;think&gt;...&lt;/think&gt; hoàn chỉnh</span>
                            </label>

                            {/* Checkbox: Vá lỗi thẻ think */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeUnclosedThink}
                                onChange={() => setRemoveUnclosedThink(!removeUnclosedThink)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Vá lỗi thẻ &lt;think&gt; bị thiếu thẻ đóng/mở (Regex + AI)</span>
                            </label>

                            {/* Checkbox: Lọc từ khóa lỗi */}
                            <label className="cleaning-checkbox">
                              <input
                                type="checkbox"
                                checked={removeErrorKeywords}
                                onChange={() => setRemoveErrorKeywords(!removeErrorKeywords)}
                              />
                              <span className="checkbox-mark"></span>
                              <span className="checkbox-label">Lọc bỏ các từ khóa lỗi quy định</span>
                            </label>

                            {/* Min / Max chars */}
                            <div className="cleaning-inputs-row">
                              <div className="cleaning-input-group">
                                <label>Min chars assistant</label>
                                <input type="number" value={minChars} onChange={(e) => setMinChars(e.target.value)} />
                              </div>
                              <div className="cleaning-input-group">
                                <label>Max chars assistant</label>
                                <input type="number" value={maxChars} onChange={(e) => setMaxChars(e.target.value)} />
                              </div>
                            </div>

                            {/* Min pairs */}
                            <div className="cleaning-input-group" style={{ maxWidth: '50%' }}>
                              <label>Số cặp hỏi đáp tối thiểu:</label>
                              <input type="number" value={minPairs} onChange={(e) => setMinPairs(e.target.value)} />
                            </div>

                            {/* Preview button — switches to preview view */}
                            <button
                              className="cleaning-accept-btn"
                              disabled={isCleaningLoading}
                              onClick={handleApplyCleaning}
                            >
                              {isCleaningLoading ? (
                                <span>Đang xử lý...</span>
                              ) : (
                                <>
                                  <Eye size={16} />
                                  Preview & Apply Cleaning
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <button className="reset-btn" onClick={() => {
                          setCleaningApplied(false);
                          setCleaningEnabled(false);
                          setRemoveErrorKeywords(true);
                          setRemoveUnclosedThink(true);
                          setRemoveCompleteThink(false);
                          setMinChars('5');
                          setMaxChars('4000');
                          setMinPairs('1');
                        }}>
                          <RotateCcw size={14} />
                          Reset to Original
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ===== VIEW: Preview ===== */}
                  {cleaningPopupView === 'preview' && (
                    <>
                      {(() => {
                        const beforeList = cleaningPreviewBefore.length > 0 ? cleaningPreviewBefore : PREVIEW_BEFORE;
                        const afterList = cleaningPreviewAfter.length > 0 ? cleaningPreviewAfter : PREVIEW_AFTER;
                        const removedList = cleaningPreviewRemoved.length > 0 ? cleaningPreviewRemoved : PREVIEW_REMOVED;
                        const fixedList = afterList.filter(r => r.status === 'fixed');

                        const totalCount = beforeList.length;
                        const keptCount = afterList.length;
                        const fixedCount = fixedList.length;
                        const removedCount = removedList.length;

                        const activeList = previewTab === 'total' || previewTab === 'before' ? beforeList :
                          previewTab === 'kept' || previewTab === 'after' ? afterList :
                            previewTab === 'fixed' ? fixedList :
                              removedList;

                        const totalPages = Math.max(1, Math.ceil(activeList.length / previewItemsPerPage));
                        const startIdx = (previewPage - 1) * previewItemsPerPage;
                        const paginatedList = activeList.slice(startIdx, startIdx + previewItemsPerPage);

                        const realTotal = conversionStats?.stats?.cleaning?.originalCount ?? conversionStats?.stats?.totalConversations ?? conversationsList.length;
                        const realKept = conversionStats?.stats?.cleaning?.finalCount ?? conversationsList.length;
                        const realRemoved = realTotal - realKept;
                        const realFixed = conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0;

                        return (
                          <>
                            {/* New Tabs / Summary */}
                            <div className="preview-modal-summary" style={{ display: 'flex', gap: '8px', cursor: 'pointer', flexWrap: 'wrap' }}>
                              <button
                                className={`summary-tag summary-total ${previewTab === 'total' || previewTab === 'before' ? 'active-tab' : ''}`}
                                style={{ opacity: previewTab === 'total' || previewTab === 'before' ? 1 : 0.6, border: 'none', padding: '6px 12px' }}
                                onClick={() => { setPreviewTab('total'); setPreviewPage(1); }}
                              >
                                Tổng tệp: {realTotal} hội thoại
                              </button>
                              <button
                                className={`summary-tag summary-kept ${previewTab === 'kept' || previewTab === 'after' ? 'active-tab' : ''}`}
                                style={{ opacity: previewTab === 'kept' || previewTab === 'after' ? 1 : 0.6, border: 'none', padding: '6px 12px' }}
                                onClick={() => { setPreviewTab('kept'); setPreviewPage(1); }}
                              >
                                Giữ lại: {realKept}
                              </button>
                              <button
                                className={`summary-tag summary-fixed ${previewTab === 'fixed' ? 'active-tab' : ''}`}
                                style={{ opacity: previewTab === 'fixed' ? 1 : 0.6, border: 'none', padding: '6px 12px' }}
                                onClick={() => { setPreviewTab('fixed'); setPreviewPage(1); }}
                              >
                                Đã sửa: {realFixed}
                              </button>
                              <button
                                className={`summary-tag summary-removed ${previewTab === 'removed' ? 'active-tab' : ''}`}
                                style={{ opacity: previewTab === 'removed' ? 1 : 0.6, border: 'none', padding: '6px 12px' }}
                                onClick={() => { setPreviewTab('removed'); setPreviewPage(1); }}
                              >
                                Loại bỏ: {realRemoved}
                              </button>
                            </div>

                            {/* Toolbar for Pagination */}
                            <div className="preview-toolbar" style={{ margin: '16px', background: '#f8fafc', padding: '10px 16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div className="toolbar-select-wrapper">
                                <label className="toolbar-label">Hiển thị:</label>
                                <select
                                  className="toolbar-select"
                                  value={previewItemsPerPage}
                                  onChange={(e) => {
                                    setPreviewItemsPerPage(Number(e.target.value));
                                    setPreviewPage(1);
                                  }}
                                >
                                  <option value="5">5</option>
                                  <option value="10">10</option>
                                  <option value="15">15</option>
                                  <option value="20">20</option>
                                </select>
                              </div>
                              <div className="pagination-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                  className="page-btn"
                                  disabled={previewPage <= 1}
                                  onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                                  style={{ padding: '4px 8px', background: previewPage <= 1 ? '#e2e8f0' : '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: previewPage <= 1 ? 'not-allowed' : 'pointer' }}
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <span style={{ fontSize: '14px', color: '#475569' }}>Trang {previewPage} / {totalPages}</span>
                                <button
                                  className="page-btn"
                                  disabled={previewPage >= totalPages}
                                  onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
                                  style={{ padding: '4px 8px', background: previewPage >= totalPages ? '#e2e8f0' : '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: previewPage >= totalPages ? 'not-allowed' : 'pointer' }}
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            </div>

                            {/* Tab Content */}
                            <div className="preview-modal-body">
                              {(previewTab === 'total' || previewTab === 'before') && (
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
                                    {paginatedList.map((row) => (
                                      <tr key={row.id} className={row.status === 'has-issue' ? 'row-issue' : 'row-clean'}>
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td>
                                          {row.issue
                                            ? <span className="status-badge badge-issue">{row.issue}</span>
                                            : <span className="status-badge badge-clean">Clean</span>
                                          }
                                        </td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              {(previewTab === 'kept' || previewTab === 'after' || previewTab === 'fixed') && (
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
                                    {paginatedList.map((row) => (
                                      <tr key={row.id} className={row.status === 'fixed' ? 'row-fixed' : 'row-clean'}>
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td><span className={`status-badge ${row.status === 'fixed' ? 'badge-fixed' : 'badge-clean'}`}>{row.action}</span></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
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
                                    {paginatedList.map((row) => (
                                      <tr key={row.id} className="row-removed">
                                        <td><span className="conv-id-badge">{row.id}</span></td>
                                        <td><span className="status-badge badge-removed">{row.reason}</span></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                        <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {paginatedList.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                  Không có dữ liệu trong mục này
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}

                      {/* Footer */}
                      <div className="preview-modal-footer">
                        <button className="modal-cancel-btn" onClick={() => setCleaningPopupView('settings')}>
                          <ChevronLeft size={16} />
                          Quay lại cài đặt
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
                          setShowCleaningPopup(false);
                          setCleaningPopupView('settings');
                        }}>
                          <Check size={16} />
                          Xác nhận & Áp dụng
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {currentSubStep === 2 && (
          <div className="findk-container">
            <div className="findk-card">
              <h3>Find K</h3>
              <p className="findk-desc">Compute Elbow, Silhouette Score, and K-Distance curves through GPU Service before K-means clustering.</p>
              <div className="findk-params">
                <div className="findk-param">
                  <label>Max K:</label>
                  <input type="number" value={maxK} onChange={(e) => setMaxK(e.target.value)} />
                </div>
                <div className="findk-param">
                  <label>EPS:</label>
                  <input type="number" step="0.1" value={eps} onChange={(e) => setEps(e.target.value)} />
                </div>
                <div className="findk-param">
                  <label>Min Samples:</label>
                  <input type="number" value={minSamples} onChange={(e) => { let val = parseInt(e.target.value, 10); const maxVal = Math.max(2, conversationsList.length); if (!isNaN(val) && val > maxVal) val = maxVal; setMinSamples(isNaN(val) ? '' : val.toString()); }} min="2" max={Math.max(2, conversationsList.length)} />
                </div>
                <button className="findk-visualize-btn" onClick={handleVisualizeK} disabled={isFindingK}>
                  {isFindingK ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isFindingK ? 'Calculating...' : 'Visualize (GPU)'}
                </button>
              </div>
            </div>

            {showVisualization && findKResults && (() => {
              const elbow = findKResults.elbow || [];
              const silhouette = findKResults.silhouette || [];

              const wcssMax = Math.max(...elbow.map((d: any) => d.wcss), 12);
              const wcssMin = 0;
              const silMax = Math.max(...silhouette.map((d: any) => d.silhouette), 0.22);
              const silMin = 0;

              const chartHeight = 240;
              const chartBottom = 280;
              const chartWidth = 700;
              const chartLeft = 60;

              const maxKVal = elbow.length > 0 ? elbow.length : parseInt(maxK, 10);
              const stepX = maxKVal > 1 ? chartWidth / (maxKVal - 1) : 0;

              const wcssPoints = elbow.map((d: any, i: number) => {
                const x = chartLeft + i * stepX;
                const y = chartBottom - ((d.wcss - wcssMin) / (wcssMax - wcssMin || 1)) * chartHeight;
                return [x, y];
              });

              const silPoints = silhouette.map((d: any, i: number) => {
                const x = chartLeft + i * stepX;
                const y = chartBottom - ((d.silhouette - silMin) / (silMax - silMin || 1)) * chartHeight;
                return [x, y];
              });

              const recKIndex = elbow.findIndex((d: any) => d.k === findKResults.recommendedK);
              const recommendedX = recKIndex >= 0 ? chartLeft + recKIndex * stepX : chartLeft;

              return (
                <>
                  <div className="findk-result-banner">
                    <Sparkles size={16} className="banner-icon" />
                    <div>
                      <strong>{findKResults.pointCount || conversationsList.length} points analyzed, {findKResults.noiseCount || 0} noise points filtered by DBSCAN</strong>
                      <div className="banner-sub">Recommended K: <strong>{findKResults.recommendedK}</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</div>
                    </div>
                  </div>

                  <div className="findk-chart-card">
                    <div className="chart-header-row">
                      <div>
                        <h4>Elbow Method vs. Silhouette Score</h4>
                        <p className="chart-subtitle">Use the blue curve to spot the elbow and the green curve to confirm the strongest silhouette.</p>
                      </div>
                      <div className="chart-legend">
                        <span className="legend-item legend-wcss"><span className="legend-dot"></span> Elbow (WCSS)</span>
                        <span className="legend-item legend-sil"><span className="legend-dot"></span> Silhouette</span>
                        <span className="legend-item legend-rec"><span className="legend-dot"></span> Recommended K = {findKResults.recommendedK}</span>
                      </div>
                    </div>
                    <div className="chart-area">
                      <svg viewBox="0 0 840 340" className="findk-svg">
                        {/* Grid lines */}
                        {[0, 1, 2, 3, 4].map(i => (
                          <line key={`grid-${i}`} x1="60" y1={40 + i * 60} x2="760" y2={40 + i * 60} stroke="#f1f5f9" strokeWidth="1" />
                        ))}
                        {/* Y-axis left labels (WCSS) */}
                        <text x="8" y="44" className="axis-label">{wcssMax.toFixed(1)}</text>
                        <text x="16" y="104" className="axis-label">{(wcssMax * 0.75).toFixed(1)}</text>
                        <text x="16" y="164" className="axis-label">{(wcssMax * 0.5).toFixed(1)}</text>
                        <text x="16" y="224" className="axis-label">{(wcssMax * 0.25).toFixed(1)}</text>
                        <text x="16" y="284" className="axis-label">0</text>
                        <text x="10" y="175" className="axis-title" transform="rotate(-90, 10, 175)">WCSS</text>

                        {/* Y-axis right labels (Silhouette) */}
                        <text x="770" y="44" className="axis-label-right">{silMax.toFixed(3)}</text>
                        <text x="770" y="104" className="axis-label-right">{(silMax * 0.75).toFixed(3)}</text>
                        <text x="770" y="164" className="axis-label-right">{(silMax * 0.5).toFixed(3)}</text>
                        <text x="770" y="224" className="axis-label-right">{(silMax * 0.25).toFixed(3)}</text>
                        <text x="770" y="284" className="axis-label-right">0</text>
                        <text x="825" y="175" className="axis-title-right" transform="rotate(90, 825, 175)">Silhouette</text>

                        {/* X-axis labels */}
                        {elbow.map((d: any, i: number) => (
                          <text key={`x-${i}`} x={chartLeft + i * stepX} y="310" className="axis-label" textAnchor="middle">{d.k}</text>
                        ))}

                        {/* Recommended K dotted line */}
                        <line x1={recommendedX} y1="40" x2={recommendedX} y2="280" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6 4" />

                        {/* WCSS line (blue) */}
                        <polyline
                          fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round"
                          points={wcssPoints.map(p => p.join(',')).join(' ')}
                        />
                        {/* WCSS dots */}
                        {wcssPoints.map((p, i) => (
                          <circle key={`wc-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
                        ))}

                        {/* Silhouette line (green) */}
                        {silPoints.length > 0 && (
                          <>
                            <polyline
                              fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinejoin="round"
                              points={silPoints.map(p => p.join(',')).join(' ')}
                            />
                            {/* Silhouette dots */}
                            {silPoints.map((p, i) => (
                              <circle key={`sl-${i}`} cx={p[0]} cy={p[1]} r="4" fill="white" stroke="#16a34a" strokeWidth="2" />
                            ))}
                          </>
                        )}
                      </svg>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {currentSubStep === 3 && (() => {

          const CLUSTER_GROUPS = [
            { name: 'Group 0', count: 17, sim: 0.9973 },
            { name: 'Group 1', count: 17, sim: 0.9957 },
            { name: 'Group 2', count: 12, sim: 0.9683 },
            { name: 'Group 3', count: 4, sim: 0.9716 },
            { name: 'Group 4', count: 8, sim: 0.9703 },
            { name: 'Group 5', count: 6, sim: 0.9673 },
            { name: 'Group 6', count: 10, sim: 0.9669 },
            { name: 'Group 7', count: 8, sim: 0.9695 },
          ];

          return (
            <>
              {/* Full-width Dataset Preview */}
              <div className="cluster-fullwidth">
                <div className="preview-header">
                  <h3>Converted Dataset Preview</h3>
                  <div className="preview-header-right">
                    <span className="preview-count">
                      {pageMsgCount} messages · Showing {startConvIdx + 1}-{Math.min(startConvIdx + convsPerPage, filteredTotal)} of {filteredTotal} conversations
                      {searchQuery && ` (filtered from ${totalConvs})`}
                    </span>
                    <button className="cluster-options-trigger-btn" onClick={() => setShowClusterOptionsPopup(true)}>
                      <Settings size={16} />
                      Clustering Options
                    </button>
                  </div>
                </div>

                <div className="preview-toolbar">
                  <div className="toolbar-select-wrapper">
                    <label className="toolbar-label">Conversations / page:</label>
                    <select
                      className="toolbar-select"
                      value={convsPerPage}
                      onChange={(e) => handleConvsPerPageChange(e.target.value)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="15">15</option>
                    </select>
                  </div>

                  <div className="toolbar-search">
                    <input
                      type="text"
                      className="toolbar-search-input"
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    />
                  </div>
                  <div className="toolbar-stats">
                    <span className="toolbar-stat-tag">{totalConvs} conversations</span>
                    <span className="toolbar-stat-tag">{totalMessages} messages</span>
                  </div>
                </div>

                <div className="preview-table-wrapper cluster-table-full">
                  <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '4%', textAlign: 'center' }}>STT</th>
                        <th style={{ width: '12%', textAlign: 'center' }}>Conv ID</th>
                        <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                        <th style={{ width: '38%' }}>User</th>
                        <th style={{ width: '43%' }}>Assistant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageConvs.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                            No conversations match your search.
                          </td>
                        </tr>
                      )}
                      {pageConvs.map((conv, convPageIdx) => {
                        const groupClass = (startConvIdx + convPageIdx) % 2 === 1 ? 'conv-group-alt' : '';
                        const convGlobalIdx = startConvIdx + convPageIdx + 1;

                        return (
                          <tr
                            key={conv.id}
                            className={`conv-row conv-first conv-last ${groupClass}`}
                          >
                            <td className="col-conv-num-cell" style={{ textAlign: 'center', verticalAlign: 'middle' }}>{convGlobalIdx}</td>
                            <td className="col-conv-id-cell">
                              <span className="conv-id-badge">{conv.id}</span>
                              <span className="conv-msg-count">{conv.messages.length} messages</span>
                              {conv.groupLabel && (
                                <span className="conv-group-badge" style={{ backgroundColor: conv.groupBg, color: conv.groupColor, border: `1px solid ${conv.groupColor}40`, marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                                  {conv.groupLabel}
                                </span>
                              )}
                            </td>
                            <td className="col-msg-num-cell">{conv.messages.length}</td>
                            <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                              <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {conv.messages.length === 1 ? (
                                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                    {highlightSearch(conv.messages[0].user, searchQuery)}
                                  </div>
                                ) : (
                                  <>
                                    <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '13px' }}>Chủ đề:</span>
                                      <span style={{ fontSize: '13.5px', color: '#4f46e5' }}>
                                        {getConversationTopic(conv.messages)}
                                      </span>
                                    </div>
                                    <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                      {conv.messages.slice(0, 3).map((msg, idx) => (
                                        <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                          <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx + 1}:</span>
                                          <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                            {highlightSearch(truncateText(msg.user, 150), searchQuery)}
                                          </span>
                                        </div>
                                      ))}
                                      {conv.messages.length > 3 && (
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                          + {conv.messages.length - 3} lượt thoại khác (bấm Detail để xem)
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                              <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {conv.messages.length === 1 ? (
                                  <div style={{ fontSize: '14px', color: '#475569', lineHeight: '1.5', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                    {highlightSearch(conv.messages[0].assistant, searchQuery)}
                                  </div>
                                ) : (
                                  <>
                                    <div className="conv-topic-title" style={{ fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '13.5px', fontStyle: 'italic' }}>Phản hồi nổi bật</span>
                                    </div>
                                    <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                      {conv.messages.slice(0, 3).map((msg, idx) => (
                                        <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                          <span style={{ fontWeight: '600', color: '#10b981', flexShrink: 0 }}>A{idx + 1}:</span>
                                          <span style={{ color: '#475569', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                            {highlightSearch(truncateText(msg.assistant, 150), searchQuery)}
                                          </span>
                                        </div>
                                      ))}
                                      {conv.messages.length > 3 && (
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', visibility: 'hidden' }}>
                                          + {conv.messages.length - 3}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="preview-pagination">
                  <button
                    className="pagination-arrow"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    ‹
                  </button>
                  {getPageNumbers(currentPage, totalPages || 1).map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                    ) : (
                      <button
                        key={page}
                        className={`pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    className="pagination-arrow"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Clustering Options Popup */}
              {showClusterOptionsPopup && (
                <div className="cluster-popup-overlay" onClick={() => setShowClusterOptionsPopup(false)}>
                  <div className="cluster-popup-content" onClick={(e) => e.stopPropagation()}>
                    <div className="cluster-popup-header">
                      <div className="cluster-popup-header-left">
                        <Settings size={20} />
                        <div>
                          <h2>Clustering Options</h2>
                          <p>Configure clustering parameters, filter noise, and review group statistics</p>
                        </div>
                      </div>
                      <button className="cluster-popup-close-btn" onClick={() => setShowClusterOptionsPopup(false)}>
                        <X size={18} />
                        Close
                      </button>
                    </div>

                    <div className="cluster-popup-body">
                      {/* Clustering Parameters */}
                      <div className="cluster-popup-section">
                        <h3 className="cluster-card-title">Clustering Parameters</h3>
                        <div className="cleaning-input-group" style={{ marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Target K (Clusters)
                            <Tooltip position="bottom" text="Số lượng nhóm dữ liệu mà AI sẽ tự động phân loại. Giá trị này được AI khuyến nghị tự động (Recommended K) dựa trên biểu đồ Silhouette để đạt chất lượng chia nhóm tốt nhất.">
                              <HelpCircle size={14} color="#94a3b8" />
                            </Tooltip>
                          </label>
                          <input type="number" value={targetK} readOnly className="readonly-input-field" style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }} />
                        </div>
                        <p className="cluster-recommend">
                          {findKResults?.recommendedK ? (
                            <>
                              Recommended K: <strong>{findKResults.recommendedK}</strong> (stable plateau: silhouette remains strong while WCSS has flattened)
                            </>
                          ) : (
                            <>Run <strong>Find K</strong> step first to get Recommended K.</>
                          )}
                        </p>
                        <div className="cleaning-inputs-row" style={{ marginBottom: 12 }}>
                          <div className="cleaning-input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              DBSCAN EPS
                              <Tooltip position="bottom" text="Khoảng cách cho phép (bán kính) để 2 hội thoại được xem là 'giống nhau'. Nếu vượt quá mức này, AI sẽ loại chúng ra thành dữ liệu rác (Noise) để làm sạch cụm.">
                                <HelpCircle size={14} color="#94a3b8" />
                              </Tooltip>
                            </label>
                            <input type="number" step="0.1" value={clusterEps} readOnly className="readonly-input-field" style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }} />
                          </div>
                          <div className="cleaning-input-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              Min Samples
                              <Tooltip position="bottom" text="Số lượng hội thoại tối thiểu cần có để tạo thành 1 nhóm. Nếu một nhóm có ít hội thoại hơn mức này, nó sẽ bị AI coi là rác (Noise) và loại bỏ.">
                                <HelpCircle size={14} color="#94a3b8" />
                              </Tooltip>
                            </label>
                            <input type="number" value={clusterMinSamples} readOnly className="readonly-input-field" style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }} />
                          </div>
                        </div>
                        <button className="cluster-run-btn" onClick={handleCluster} disabled={isClustering}>
                          {isClustering ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {isClustering ? 'Clustering...' : 'Cluster'}
                        </button>
                      </div>

                      {clusterRan && (
                        <>
                          {/* Similarity Threshold */}
                          <div className="cluster-popup-section">
                            <div className="sim-header">
                              <span className="sim-label">Similarity Threshold (for Deduplicate)</span>
                              <span className="sim-value">{simThreshold.toFixed(3)}</span>
                            </div>
                            <input
                              type="range" min="0" max="1" step="0.001"
                              value={simThreshold}
                              onChange={(e) => setSimThreshold(parseFloat(e.target.value))}
                              className="sim-slider"
                              style={{ '--val': `${simThreshold * 100}%` } as React.CSSProperties}
                            />
                            <div className="cluster-action-btns">
                              <button className="cluster-btn-noise" onClick={handleRemoveNoise}>Remove Noise</button>
                              <button className="cluster-btn-dedup" onClick={handleDeduplicate} disabled={isClustering}>
                                {isClustering ? <RefreshCw size={14} className="animate-spin" /> : 'Deduplicate'}
                              </button>
                            </div>
                            <button className="reset-filter-btn" onClick={handleResetFilter}>Reset Filter</button>
                          </div>

                          {/* Cluster Statistics */}
                          <div className="cluster-popup-section">
                            <div className="cluster-stats-header">
                              <span className="cluster-stats-title">Cluster Statistics</span>
                            </div>
                            <table className="cluster-stats-table">
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left' }}>Group</th>
                                  <th style={{ textAlign: 'center' }}>Conversations</th>
                                  <th style={{ textAlign: 'right' }}>Avg Similarity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {clusterResults?.clusterStats ? clusterResults.clusterStats.map((g: any, i: number) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: 'left' }}><strong>{g.clusterId === -1 ? 'Group -1' : `Group ${g.clusterId}`}</strong></td>
                                    <td className="count-cell" style={{ textAlign: 'center' }}>{g.count}</td>
                                    <td className="sim-cell" style={{ textAlign: 'right' }}>{g.avgSimilarity?.toFixed(4) || 'N/A'}</td>
                                  </tr>
                                )) : CLUSTER_GROUPS.map((g, i) => (
                                  <tr key={i}>
                                    <td style={{ textAlign: 'left' }}><strong>{g.name}</strong></td>
                                    <td className="count-cell" style={{ textAlign: 'center' }}>{g.count}</td>
                                    <td className="sim-cell" style={{ textAlign: 'right' }}>{g.sim.toFixed(4)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep > 1) {
              setCurrentSubStep(currentSubStep - 1);
            } else {
              setCurrentStage(1);
            }
          }}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep < SUB_STEPS_STAGE2.length) {
              setCurrentSubStep(currentSubStep + 1);
            } else {
              setCurrentStage(3);
            }
          }}>
            Next
          </button>
        </div>
      </>
    );
  }
};
