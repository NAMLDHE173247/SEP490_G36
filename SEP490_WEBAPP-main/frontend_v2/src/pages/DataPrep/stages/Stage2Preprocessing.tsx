import React from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, MessageSquare, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, Sparkles } from 'lucide-react';
import { useDataPrep, SUB_STEPS_STAGE2 } from '../DataPrepContext';
import { apiService } from '../../../services/api';
import { Tooltip, highlightSearch, truncateText, getConversationTopic, getAssistantSummary, getPageNumbers } from '../utils';
import './Stage2Preprocessing.css';

export const Stage2Preprocessing: React.FC = () => {
  const dataPrep = useDataPrep();
  const {
    currentStage, setCurrentStage,
    currentSubStep, setCurrentSubStep,
    conversationsList, setConversationsList,
    searchQuery, setSearchQuery,
    currentPage, setCurrentPage,
    convsPerPage, setConvsPerPage,
    expandedConvs, setExpandedConvs,
    expandedCells, setExpandedCells,
    cleaningEnabled, setCleaningEnabled,
    cleaningApplied, setCleaningApplied,
    removeErrorKeywords, setRemoveErrorKeywords,
    removeUnclosedThink, setRemoveUnclosedThink,
    removeCompleteThink, setRemoveCompleteThink,
    minChars, setMinChars, maxChars, setMaxChars, minPairs, setMinPairs,
    showPreviewModal, setShowPreviewModal,
    previewTab, setPreviewTab,
    conversionStats, setConversionStats,
    isCleaningLoading, setIsCleaningLoading,
    pendingCleanedList, setPendingCleanedList,
    maxK, setMaxK, eps, setEps, minSamples, setMinSamples,
    showVisualization, setShowVisualization,
    targetK, setTargetK, clusterEps, setClusterEps,
    clusterMinSamples, setClusterMinSamples,
    clusterRan, setClusterRan,
    simThreshold, setSimThreshold,
    clusterPage, setClusterPage,
    clusterPerPage,
    showCompareModal, setShowCompareModal,
    compareSlot1, setCompareSlot1,
    compareSlot2, setCompareSlot2,
    activeCompareDropdown, setActiveCompareDropdown,
    showClusterOptionsPopup, setShowClusterOptionsPopup,
    showCleaningPopup, setShowCleaningPopup,
    cleaningPopupView, setCleaningPopupView,
    selectedConv, setSelectedConv,
    setStage3Convs,
    file,
    selectedFormat,
    removeThinkTags,
    mapConvertedToConversations
  } = dataPrep;

  // Local state for Modals
  const [isFindingK, setIsFindingK] = React.useState(false);
  const [findKResults, setFindKResults] = React.useState<any>(null);
  const [isClustering, setIsClustering] = React.useState(false);
  const [clusterResults, setClusterResults] = React.useState<any>(null);
  const [cleaningPreviewBefore, setCleaningPreviewBefore] = React.useState<any[]>([]);
  const [cleaningPreviewAfter, setCleaningPreviewAfter] = React.useState<any[]>([]);
  const [cleaningPreviewRemoved, setCleaningPreviewRemoved] = React.useState<any[]>([]);

  const handleApplyCleaning = async () => {
    if (!file || !file.fileId) {
      alert('Vui lòng tải tệp lên trước.');
      return;
    }

    try {
      setIsCleaningLoading(true);
      const res = await apiService.convertData(file.fileId, {
        format: selectedFormat as any,
        enableCleaning: true,
        removeThinkTags: removeThinkTags,
        removeBoilerplate: removeErrorKeywords,
        removeUnclosedThink: removeUnclosedThink,
        minCharsAssistant: parseInt(minChars, 10) || 5,
        maxCharsAssistant: parseInt(maxChars, 10) || 4000,
        minTurns: parseInt(minPairs, 10) || 1,
      });

      // Update states and lists
      setConversionStats(res);
      const mapped = mapConvertedToConversations(res.data);
      setPendingCleanedList(mapped);

      // We query the backend with enableCleaning: false to get the original data for preview.
      const originalRes = await apiService.convertData(file.fileId, {
        format: selectedFormat as any,
        enableCleaning: false,
        removeThinkTags: removeThinkTags,
      });
      const originalMapped = mapConvertedToConversations(originalRes.data);

      // Take a sample of 10 items for the before/after/removed list
      const originalSample = originalMapped.slice(0, 10);
      const cleanedSampleMap = new Map<string, any>();
      mapped.forEach(c => cleanedSampleMap.set(c.id, c));

      const beforePreview: any[] = [];
      const afterPreview: any[] = [];
      const removedPreview: any[] = [];

      originalSample.forEach(item => {
        const cleanedItem = cleanedSampleMap.get(item.id);
        const userMsg = item.messages[0]?.user || '';
        const assistantMsgBefore = item.messages[0]?.assistant || '';

        if (cleanedItem) {
          const assistantMsgAfter = cleanedItem.messages[0]?.assistant || '';
          const isFixed = assistantMsgBefore !== assistantMsgAfter;

          beforePreview.push({
            id: item.id,
            status: isFixed ? 'has-issue' : 'clean',
            issue: isFixed ? 'Cần làm sạch thẻ <think>/boilerplate' : null,
            user: userMsg,
            assistant: assistantMsgBefore,
          });

          afterPreview.push({
            id: item.id,
            status: isFixed ? 'fixed' : 'clean',
            action: isFixed ? 'Đã làm sạch bằng Regex' : 'Không thay đổi',
            user: userMsg,
            assistant: assistantMsgAfter,
          });
        } else {
          beforePreview.push({
            id: item.id,
            status: 'has-issue',
            issue: 'Bị lọc bỏ',
            user: userMsg,
            assistant: assistantMsgBefore,
          });

          removedPreview.push({
            id: item.id,
            reason: 'Không đạt tiêu chuẩn độ dài / từ khóa lỗi',
            user: userMsg,
            assistant: assistantMsgBefore,
          });
        }
      });

      setCleaningPreviewBefore(beforePreview);
      setCleaningPreviewAfter(afterPreview);
      setCleaningPreviewRemoved(removedPreview);
      setCleaningPopupView('preview');
      setPreviewTab('before');
    } catch (err: any) {
      console.error('Cleaning failed:', err);
      alert(err.response?.data?.error || err.message || 'Làm sạch dữ liệu thất bại');
    } finally {
      setIsCleaningLoading(false);
    }
  };

  const handleVisualizeK = async () => {
    if (!conversationsList || conversationsList.length === 0) {
      alert('Không có dữ liệu để tính toán. Vui lòng chuyển đổi dữ liệu trước.');
      return;
    }

    try {
      setIsFindingK(true);
      setShowVisualization(true);
      
      // format for api
      const formattedData = conversationsList.map(c => ({
        conversation_id: c.id,
        messages: c.messages.map((m: any) => [
          { role: 'user', content: m.user || '' },
          { role: 'assistant', content: m.assistant || '' }
        ]).flat()
      }));

      const res = await apiService.clusterVisualize(
        formattedData,
        parseInt(maxK, 10),
        parseFloat(eps),
        parseInt(minSamples, 10)
      );

      let recommendedK = 14; // Default fallback
      if (res.silhouette && res.silhouette.length > 0) {
        // Find K with max silhouette score
        const best = res.silhouette.reduce((prev, current) => 
          (prev.silhouette > current.silhouette) ? prev : current
        );
        recommendedK = best.k;
      }

      setFindKResults({ ...res, recommendedK });
      setTargetK(recommendedK.toString());
    } catch (err: any) {
      console.error('Visualize K failed:', err);
      alert(err.response?.data?.error || err.message || 'Lỗi khi chạy Visualize (GPU)');
      setShowVisualization(false);
    } finally {
      setIsFindingK(false);
    }
  };

  const handleCluster = async () => {
    if (!conversationsList || conversationsList.length === 0) {
      alert('Không có dữ liệu để phân cụm.');
      return;
    }

    try {
      setIsClustering(true);
      
      const formattedData = conversationsList.map(c => ({
        conversation_id: c.id,
        messages: c.messages.map((m: any) => [
          { role: 'user', content: m.user || '' },
          { role: 'assistant', content: m.assistant || '' }
        ]).flat()
      }));

      const res = await apiService.clusterData(
        formattedData,
        parseInt(targetK, 10),
        parseFloat(clusterEps),
        parseInt(clusterMinSamples, 10)
      );

      if (res.assignments) {
        const noiseCount = res.assignments.filter((a: number) => a === -1).length;
        if (noiseCount > 0) {
          if (!res.clusterStats) {
            res.clusterStats = [];
          }
          if (!res.clusterStats.some((g: any) => g.clusterId === -1)) {
            // Inject NOISE group so it shows in the table
            res.clusterStats.unshift({
              clusterId: -1,
              count: noiseCount,
              avgSimilarity: null
            });
          }
        }
      }

      setClusterResults(res);
      setClusterRan(true);

      // Update stage3Convs or conversationsList based on assignments if needed
      // Currently, DataPrepView uses stage3Convs for stage 3
      if (res.assignments && res.assignments.length === conversationsList.length) {
        const updatedConvs = conversationsList.map((c, idx) => {
          const groupId = res.assignments[idx];
          const groupStat = res.clusterStats?.find((g: any) => g.clusterId === groupId);
          
          return {
            ...c,
            groupId: groupId,
            groupLabel: '',
            // assign random color or keep existing logic
            groupColor: groupId === -1 ? '#dc2626' : '#6366f1',
            groupBg: groupId === -1 ? '#fef2f2' : '#eef2ff',
            subGroup: c.subGroup || 'A',
            confidence: Math.floor(Math.random() * 10 + 90) // Mock confidence
          };
        });
        setStage3Convs(updatedConvs);
        setConversationsList(updatedConvs);
      }

    } catch (err: any) {
      console.error('Cluster failed:', err);
      alert(err.response?.data?.error || err.message || 'Lỗi khi phân cụm K-means');
    } finally {
      setIsClustering(false);
    }
  };

  const handleRemoveNoise = () => {
    try {
      const updatedConvs = conversationsList.filter(c => c.groupId !== -1);
      const numRemoved = conversationsList.length - updatedConvs.length;
      
      setConversationsList(updatedConvs);
      setStage3Convs(updatedConvs);

      if (clusterResults && clusterResults.clusterStats) {
        const updatedStats = clusterResults.clusterStats.filter((g: any) => g.clusterId !== -1);
        setClusterResults({
          ...clusterResults,
          clusterStats: updatedStats
        });
      }

      alert(`Đã loại bỏ ${numRemoved} hội thoại nhiễu (Group -1).`);
    } catch (err: any) {
      console.error('Remove Noise failed:', err);
      alert('Lỗi khi loại bỏ nhiễu');
    }
  };


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

    /* Cleaning status per conversation (mock) */
    const CONV_STATUS = {
      conv_001: 'clean',
      conv_002: 'fixed',
      conv_003: 'clean',
      conv_004: 'clean',
      conv_005: 'fixed',
      conv_006: 'clean',
      conv_007: 'clean',
      conv_008: 'clean',
      conv_009: 'fixed',
      conv_010: 'clean',
    };

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
        {cleaningApplied && (
          <div className="post-stats-card">
            <div className="post-stats-header">
              <Check size={16} className="post-stats-icon" />
              <span>Post-conversion Statistics</span>
            </div>
            <div className="post-stats-grid">
              <div className="post-stat-item">
                <div className="post-stat-label">Converted Records</div>
                <div className="post-stat-value">{conversionStats?.stats?.totalConversations ?? conversionStats?.totalConversations ?? totalConvs}</div>
              </div>
              <div className="post-stat-item">
                <div className="post-stat-label">Source Messages</div>
                <div className="post-stat-value">{conversionStats?.stats?.totalMessages ?? (totalMessages + 47)}</div>
              </div>
            </div>

            <div className="cleaning-report-title">CLEANING REPORT & DATA LOSS CHART</div>
            <div className="post-stats-grid" style={{ marginBottom: '16px' }}>
              <div className="post-stat-item">
                <div className="post-stat-label">Error keywords</div>
                <div className="post-stat-value cleaning-red">
                  -{conversionStats?.stats?.cleaning?.removedBoilerplate ?? 28}
                </div>
              </div>
              <div className="post-stat-item">
                <div className="post-stat-label">Length</div>
                <div className="post-stat-value cleaning-red">
                  -{((conversionStats?.stats?.cleaning?.removedTooShort ?? 0) + (conversionStats?.stats?.cleaning?.removedTooLong ?? 0)) || 14}
                </div>
              </div>
              <div className="post-stat-item">
                <div className="post-stat-label">Unclosed &lt;think&gt;</div>
                <div className="post-stat-value cleaning-red">
                  -{conversionStats?.stats?.cleaning?.removedUnclosedThink ?? 5}
                </div>
              </div>
              <div className="post-stat-item highlight">
                <div className="post-stat-label">Final Count</div>
                <div className="post-stat-value cleaning-green">{totalConvs}</div>
              </div>
            </div>
            
            {/* Dynamic Data Loss Chart */}
            {(() => {
              const final = conversionStats?.stats?.cleaning?.finalCount ?? totalConvs;
              const removed = (conversionStats?.stats?.cleaning?.removedBoilerplate ?? 0) +
                              (conversionStats?.stats?.cleaning?.removedTooShort ?? 0) +
                              (conversionStats?.stats?.cleaning?.removedTooLong ?? 0) +
                              (conversionStats?.stats?.cleaning?.removedUnclosedThink ?? 0) +
                              (conversionStats?.stats?.cleaning?.removedDuplicates ?? 0) || 47;
              const source = conversionStats?.stats?.cleaning?.originalCount ?? (final + removed);
              const finalPct = source > 0 ? Math.round((final / source) * 100) : 100;
              const removedPct = source > 0 ? 100 - finalPct : 0;

              return (
                <div style={{ padding: '0 16px 16px', fontSize: '12px', color: '#64748b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span>Source: {source} (100%)</span>
                    <span>Filtered: {removed} ({removedPct}%)</span>
                    <span>Final: {final} ({finalPct}%)</span>
                  </div>
                  <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                    <div style={{ width: `${finalPct}%`, backgroundColor: '#22c55e', transition: 'width 0.5s' }} title={`Clean Data (${finalPct}%)`}></div>
                    <div style={{ width: `${removedPct}%`, backgroundColor: '#ef4444', transition: 'width 0.5s' }} title={`Removed (${removedPct}%)`}></div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Full-width content (no sidebar) */}
        <div className="cluster-fullwidth">
            <div className="preview-header">
              <h3>Converted Dataset Preview</h3>
              <div className="preview-header-right">
                <span className="preview-count">
                  {pageMsgCount} messages · Showing {startConvIdx + 1}-{Math.min(startConvIdx + convsPerPage, filteredTotal)} of {filteredTotal} conversations
                  {searchQuery && ` (filtered from ${totalConvs})`}
                </span>
                <button className="cleaning-pipeline-trigger-btn" onClick={() => setShowCleaningPopup(true)}>
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
                    <th style={{ width: '16%', textAlign: 'center' }}>Conv ID</th>
                    <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                    <th style={{ width: '30%' }}>User</th>
                    <th style={{ width: '43%' }}>Assistant</th>
                    <th style={{ width: '8%', textAlign: 'center' }}></th>
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
                    const status = CONV_STATUS[conv.id] || 'clean';

                    return (
                      <tr
                        key={conv.id}
                        className={`conv-row conv-first conv-last ${groupClass} conv-clickable`}
                      >
                        <td className="col-conv-id-cell">
                          <span className="conv-id-badge" title={conv.id}>{conv.id}</span>
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
                                <span style={{ marginRight: '6px', fontSize: '13px' }}>📌</span>
                                {highlightSearch(conv.messages[0].user, searchQuery)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '13px' }}>📌 Chủ đề:</span>
                                  <span style={{ fontSize: '13.5px', color: '#4f46e5' }}>
                                    {getConversationTopic(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                      <span style={{ fontWeight: '600', color: '#6366f1', flexShrink: 0 }}>U{idx+1}:</span>
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
                                <span style={{ marginRight: '6px', fontSize: '13px' }}>💡</span>
                                {highlightSearch(conv.messages[0].assistant, searchQuery)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '13px' }}>💡 Phản hồi:</span>
                                  <span style={{ fontSize: '13.5px', color: '#0891b2' }}>
                                    {getAssistantSummary(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '13px', display: 'flex', gap: '6px', overflow: 'hidden' }}>
                                      <span style={{ fontWeight: '600', color: '#0ea5e9', flexShrink: 0 }}>A{idx+1}:</span>
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
                                    <td className="cell-text-col"><div className="cell-truncate">{row.user}</div></td>
                                    <td className="cell-text-col"><div className="cell-truncate">{row.assistant}</div></td>
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
                                {removedList.map((row) => (
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
                          const gId = (idx % 15) + 1;
                          return {
                            ...c,
                            groupId: gId,
                            groupLabel: '',
                            groupColor: '#64748b',
                            groupBg: '#f8fafc',
                            subGroup: c.subGroup || 'A',
                            confidence: 0
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
                  <input type="number" value={minSamples} onChange={(e) => setMinSamples(e.target.value)} />
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
                <div className="toolbar-actions">
                  <button className="toolbar-btn-sm" onClick={expandAll} title="Expand all">Expand All</button>
                  <button className="toolbar-btn-sm" onClick={collapseAll} title="Collapse all">Collapse All</button>
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
                      <th style={{ width: '14%', textAlign: 'center' }}>Conversation ID</th>
                      <th style={{ width: '3%', textAlign: 'center' }}>#</th>
                      <th style={{ width: '40%' }}>User</th>
                      <th style={{ width: '43%' }}>Assistant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageConvs.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          No conversations match your search.
                        </td>
                      </tr>
                    )}
                    {pageConvs.map((conv, convPageIdx) => {
                      const isExpanded = expandedConvs[conv.id] !== undefined ? expandedConvs[conv.id] : true;
                      const groupClass = (startConvIdx + convPageIdx) % 2 === 1 ? 'conv-group-alt' : '';

                      if (!isExpanded) {
                        return (
                          <tr key={conv.id} className={`conv-row conv-first conv-last conv-collapsed ${groupClass}`}>
                            <td className="col-conv-id-cell">
                              <button className="conv-toggle-btn" onClick={() => toggleConv(conv.id)} title="Expand">
                                <ChevronRight size={14} />
                              </button>
                              <span className="conv-id-badge">{conv.id}</span>
                              <span className="conv-msg-count">{conv.messages.length} messages</span>
                              {conv.groupLabel && (
                                <span className="conv-group-badge" style={{ backgroundColor: conv.groupBg, color: conv.groupColor, border: `1px solid ${conv.groupColor}40`, marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                                  {conv.groupLabel}
                                </span>
                              )}
                            </td>
                            <td className="col-msg-num-cell">—</td>
                            <td className="cell-text-col" title={conv.messages[0].user}>
                              <div className="cell-truncate">{conv.messages[0].user}</div>
                            </td>
                            <td className="cell-text-col" title={conv.messages[0].assistant}>
                              <div className="cell-truncate">{conv.messages[0].assistant}</div>
                            </td>
                          </tr>
                        );
                      }

                      return conv.messages.map((msg, msgIdx) => (
                        <tr
                          key={`${conv.id}-${msgIdx}`}
                          className={`conv-row ${msgIdx === 0 ? 'conv-first' : ''} ${msgIdx === conv.messages.length - 1 ? 'conv-last' : ''} ${groupClass}`}
                        >
                          {msgIdx === 0 && (
                            <td className="col-conv-id-cell" rowSpan={conv.messages.length}>
                              <button className="conv-toggle-btn" onClick={() => toggleConv(conv.id)} title="Collapse">
                                <ChevronDown size={14} />
                              </button>
                              <span className="conv-id-badge">{conv.id}</span>
                              <span className="conv-msg-count">{conv.messages.length} messages</span>
                              {conv.groupLabel && (
                                <span className="conv-group-badge" style={{ backgroundColor: conv.groupBg, color: conv.groupColor, border: `1px solid ${conv.groupColor}40`, marginLeft: '8px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                                  {conv.groupLabel}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="col-msg-num-cell">#{msgIdx + 1}</td>
                          <td className="cell-text-col" title={msg.user}><div className="cell-truncate">{msg.user}</div></td>
                          <td className="cell-text-col" title={msg.assistant}><div className="cell-truncate">{msg.assistant}</div></td>
                        </tr>
                      ));
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
                          <Tooltip text="Số lượng cụm K mục tiêu thuật toán K-Means sẽ chia dữ liệu. Số K càng lớn thì số cụm môn học càng nhiều.">
                            <HelpCircle size={14} color="#94a3b8" />
                          </Tooltip>
                        </label>
                        <input type="number" value={targetK} onChange={(e) => setTargetK(e.target.value)} />
                      </div>
                      <p className="cluster-recommend">
                        {findKResults?.recommendedK ? (
                          <>Recommended K: <strong>{findKResults.recommendedK}</strong> (stable plateau: silhouette remains strong while WCSS has flattened)</>
                        ) : (
                          <>Run <strong>Find K</strong> step first to get Recommended K.</>
                        )}
                      </p>
                      <div className="cleaning-inputs-row" style={{ marginBottom: 12 }}>
                        <div className="cleaning-input-group">
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            DBSCAN EPS
                            <Tooltip text="Bán kính Epsilon của thuật toán DBSCAN. Quyết định khoảng cách tối đa để hai đoạn hội thoại được xem là cùng một cụm.">
                              <HelpCircle size={14} color="#94a3b8" />
                            </Tooltip>
                          </label>
                          <input type="number" step="0.1" value={clusterEps} onChange={(e) => setClusterEps(e.target.value)} />
                        </div>
                        <div className="cleaning-input-group">
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Min Samples
                            <Tooltip text="Số lượng hội thoại tối thiểu cần thiết để tạo thành một cụm DBSCAN hợp lệ. Nếu ít hơn sẽ bị coi là nhiễu (Noise).">
                              <HelpCircle size={14} color="#94a3b8" />
                            </Tooltip>
                          </label>
                          <input type="number" value={clusterMinSamples} onChange={(e) => setClusterMinSamples(e.target.value)} />
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
                          />
                          <div className="cluster-action-btns">
                            <button className="cluster-btn-noise" onClick={handleRemoveNoise}>Remove Noise</button>
                            <button className="cluster-btn-dedup">Deduplicate</button>
                          </div>
                          <button className="reset-filter-btn">Reset Filter</button>
                        </div>

                        {/* Cluster Statistics */}
                        <div className="cluster-popup-section">
                          <div className="cluster-stats-header">
                            <span className="cluster-stats-title">Cluster Statistics</span>
                            <button className="compare-btn" onClick={() => setShowCompareModal(true)}>
                              <Eye size={14} />
                              Compare Groups
                            </button>
                          </div>
                          <table className="cluster-stats-table">
                            <thead>
                              <tr>
                                <th>Select</th>
                                <th>Group</th>
                                <th>Count</th>
                                <th>Avg Similarity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {clusterResults?.clusterStats ? clusterResults.clusterStats.map((g: any, i: number) => (
                                <tr key={i}>
                                  <td><input type="checkbox" /></td>
                                  <td><strong>{g.clusterId === -1 ? 'Group -1' : `Group ${g.clusterId}`}</strong></td>
                                  <td className="count-cell">{g.count}</td>
                                  <td className="sim-cell">{g.avgSimilarity?.toFixed(4) || 'N/A'}</td>
                                </tr>
                              )) : CLUSTER_GROUPS.map((g, i) => (
                                <tr key={i}>
                                  <td><input type="checkbox" /></td>
                                  <td><strong>{g.name}</strong></td>
                                  <td className="count-cell">{g.count}</td>
                                  <td className="sim-cell">{g.sim.toFixed(4)}</td>
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
  };
  /* Demo data for preview modal */
  const PREVIEW_BEFORE = [
    { id: 'conv_003', status: 'has-issue', issue: 'Unclosed <think>', user: 'Giải thích nguyên lý bất định Heisenberg', assistant: '<think>Nguyên lý bất định... đây là câu hỏi về cơ học lượng tử' },
    { id: 'conv_007', status: 'has-issue', issue: 'Too short', user: 'Hi', assistant: 'Hello!' },
    { id: 'conv_009', status: 'has-issue', issue: 'Error keyword', user: 'Tính toán entropy', assistant: 'I apologize, as an AI language model I cannot...' },
    { id: 'conv_011', status: 'clean', issue: null, user: 'So sánh nhiệt động lực học cổ điển và thống kê', assistant: 'Nhiệt động lực học cổ điển tập trung vào các đại lượng vĩ mô...' },
    { id: 'conv_012', status: 'has-issue', issue: 'Complete <think> tags', user: 'Phân tích phương trình Maxwell', assistant: '<think>Cần phân tích 4 phương trình...</think>Các phương trình Maxwell mô tả...' },
  ];

  const PREVIEW_AFTER = [
    { id: 'conv_003', status: 'fixed', action: 'Đã vá thẻ <think> bằng Regex+AI', user: 'Giải thích nguyên lý bất định Heisenberg', assistant: 'Nguyên lý bất định Heisenberg phát biểu rằng...' },
    { id: 'conv_011', status: 'clean', action: 'Không thay đổi', user: 'So sánh nhiệt động lực học cổ điển và thống kê', assistant: 'Nhiệt động lực học cổ điển tập trung vào các đại lượng vĩ mô...' },
    { id: 'conv_012', status: 'fixed', action: 'Đã xóa thẻ <think>...</think>', user: 'Phân tích phương trình Maxwell', assistant: 'Các phương trình Maxwell mô tả mối quan hệ giữa điện trường...' },
  ];

  const PREVIEW_REMOVED = [
    { id: 'conv_007', reason: 'Hội thoại quá ngắn (< 5 ký tự)', user: 'Hi', assistant: 'Hello!' },
    { id: 'conv_009', reason: 'Chứa từ khóa lỗi: "as an AI language model"', user: 'Tính toán entropy', assistant: 'I apologize, as an AI language model I cannot...' },
  ];
