import React from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, Calendar, FileText, Sparkles, MessageSquare } from 'lucide-react';
import { useDataPrep, SUB_STEPS_STAGE3 } from '../DataPrepContext';
import { apiService } from '../../../services/api';
import { Tooltip, highlightSearch, truncateText, getConversationTopic, getAssistantSummary, getPageNumbers } from '../utils';
import './Stage3Labeling.css';

export const Stage3Labeling: React.FC = () => {
  const dataPrep = useDataPrep();
  const {
    currentSubStep3, setCurrentSubStep3,
    stage3Convs, setStage3Convs,
    stage3Search, setStage3Search,
    stage3Page, setStage3Page,
    stage3PerPage, setStage3PerPage,
    showCompareLabels, setShowCompareLabels,
    showCreateTaskModal, setShowCreateTaskModal,
    iaActiveTab, setIaActiveTab,
    showUserGuide, setShowUserGuide,
    selectedGroup3, setSelectedGroup3,
    selectedConv3, setSelectedConv3,
    getLabelBadgeStyle,
    handleToggleLabel,
    handleRemoveMessageSingleLabel,
    selectedIaMsgId, setSelectedIaMsgId,
    iaMessages, setIaMessages,
    clusterRan,
    setCurrentStage
  } = dataPrep;

  // Local states
  const [customSubjectLabels, setCustomSubjectLabels] = React.useState<string[]>([]);
  const [pendingAiLabels, setPendingAiLabels] = React.useState<string[]>([]);
  const [stage3SubGroup, setStage3SubGroup] = React.useState('A');
  const [aiProvider, setAiProvider] = React.useState<'deepseek' | 'openai' | 'gemini'>('deepseek');
  const [isLabelingWithAI, setIsLabelingWithAI] = React.useState(false);
  const [isSavingLabels, setIsSavingLabels] = React.useState(false);
  const [aiGroupLabels, setAiGroupLabels] = React.useState<Record<number, string>>({});
  const [checkedConvIds, setCheckedConvIds] = React.useState<string[]>([]);

  // renderStage3 body begins
    /* Group data — tự sinh từ dữ liệu thực tế, chỉ hiện nhóm có conversation */
    const GROUP_COLORS = [
      { color: '#6366f1', bg: '#eef2ff' },
      { color: '#0891b2', bg: '#ecfeff' },
      { color: '#059669', bg: '#ecfdf5' },
      { color: '#d97706', bg: '#fffbeb' },
      { color: '#dc2626', bg: '#fef2f2' },
      { color: '#7c3aed', bg: '#f5f3ff' },
      { color: '#2563eb', bg: '#eff6ff' },
      { color: '#9333ea', bg: '#faf5ff' },
      { color: '#ea580c', bg: '#fff7ed' },
      { color: '#16a34a', bg: '#f0fdf4' },
      { color: '#0284c7', bg: '#f0f9ff' },
      { color: '#e11d48', bg: '#fff1f2' },
      { color: '#4f46e5', bg: '#eef2ff' },
      { color: '#c026d3', bg: '#fdf4ff' },
      { color: '#b45309', bg: '#fef3c7' },
    ];

    // Đếm conversations theo groupId, chỉ lấy nhóm có ít nhất 1 conversation
    const groupCountMap = new Map<number, number>();
    stage3Convs.forEach(c => {
      groupCountMap.set(c.groupId, (groupCountMap.get(c.groupId) || 0) + 1);
    });

    const GROUP_DATA = Array.from(groupCountMap.entries())
      .sort((a, b) => a[0] - b[0]) // sắp xếp theo groupId
      .map(([groupId, count]) => {
        const colorIdx = groupId === -1 ? 4 : (groupId - 1) % GROUP_COLORS.length;
        const palette = GROUP_COLORS[colorIdx >= 0 ? colorIdx : 0];
        return {
          id: groupId,
          label: groupId === -1 ? 'NOISE' : (aiGroupLabels[groupId] || ''),
          color: groupId === -1 ? '#dc2626' : palette.color,
          bg: groupId === -1 ? '#fef2f2' : palette.bg,
          count,
        };
      });

    const allConvRows = stage3Convs;

    const filteredRows = allConvRows
      .filter(r => !selectedGroup3 || r.groupId === selectedGroup3)
      .filter(r => r.subGroup === stage3SubGroup);

    const stage3TotalPages = Math.ceil(filteredRows.length / stage3PerPage);
    const stage3PageRows = filteredRows.slice((stage3Page - 1) * stage3PerPage, stage3Page * stage3PerPage);

    const renderedContent = (
      <div className="dataprep-stage2">
        <div className="sub-stepper">
          {SUB_STEPS_STAGE3.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep3 ? 'active' : ''} ${step.num < currentSubStep3 ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep3(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE3.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        {currentSubStep3 === 5 && (
          <div className="stage2-layout cluster-layout">
            {/* Left: Dataset Preview */}
            <div className="stage2-main">
              <div className="preview-header">
                <h3>Converted Dataset Preview</h3>
                <span className="record-count">
                  {selectedGroup3
                    ? `Group ${selectedGroup3} — ${filteredRows.length} conversations`
                    : `Showing all ${allConvRows.length} conversations`
                  }
                </span>
              </div>

              {/* Bulk Label & Split Toolbar */}
              <div className="preview-toolbar" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="toolbar-label" style={{ fontWeight: 600 }}>Bulk Actions:</span>
                <select className="toolbar-select" style={{ minWidth: '150px' }}>
                  <option value="">-- Select Subject --</option>
                  <option value="MATH">Toán học (MATH)</option>
                  <option value="CODING">Lập trình (CODING)</option>
                  <option value="PHYSICS">Vật lý (PHYSICS)</option>
                </select>
                <button style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: '#0f172a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'background 0.15s' }}>
                  Apply Bulk Label
                </button>
                <div style={{ flex: 1 }}></div>
                <button 
                  style={{ backgroundColor: stage3SubGroup === 'A' ? '#ef4444' : '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: checkedConvIds.length === 0 ? 0.5 : 1 }} 
                  title={`Di chuyển các dòng đã chọn sang Group ${stage3SubGroup === 'A' ? 'B (Nhiễu)' : 'A (Chuẩn)'}`}
                  disabled={checkedConvIds.length === 0}
                  onClick={() => {
                    setStage3Convs(prev => prev.map(c => 
                      checkedConvIds.includes(c.id) 
                        ? { ...c, subGroup: stage3SubGroup === 'A' ? 'B' : 'A' }
                        : c
                    ));
                    setCheckedConvIds([]);
                  }}
                >
                  Move to Group {stage3SubGroup === 'A' ? 'B (Noise)' : 'A (Standard)'} {checkedConvIds.length > 0 ? `(${checkedConvIds.length})` : ''}
                </button>
              </div>

              {/* Toolbar */}
              <div className="preview-toolbar" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <button
                    onClick={() => { setStage3SubGroup('A'); setStage3Page(1); setCheckedConvIds([]); }}
                    style={{ padding: '6px 12px', border: 'none', background: stage3SubGroup === 'A' ? '#e0f2fe' : '#fff', color: stage3SubGroup === 'A' ? '#0284c7' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                  >
                    Group A (Chuẩn bộ môn)
                  </button>
                  <button
                    onClick={() => { setStage3SubGroup('B'); setStage3Page(1); setCheckedConvIds([]); }}
                    style={{ padding: '6px 12px', border: 'none', background: stage3SubGroup === 'B' ? '#fef2f2' : '#fff', color: stage3SubGroup === 'B' ? '#dc2626' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '13px', borderLeft: '1px solid #e2e8f0' }}
                  >
                    Group B (Nhiễu bộ môn)
                  </button>
                </div>
                <div style={{ flex: 1 }}></div>
                <span className="toolbar-label">Conversations / page:</span>
                <select
                  className="toolbar-select"
                  value={stage3PerPage}
                  onChange={(e) => { setStage3PerPage(parseInt(e.target.value, 10)); setStage3Page(1); }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="preview-table-wrapper" style={{ maxHeight: '620px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                <table className="preview-table conv-grouped" style={{ tableLayout: 'fixed', minWidth: '1100px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '4%', textAlign: 'center' }} title="Select to move to noise group">
                        <input 
                          type="checkbox" 
                          checked={stage3PageRows.length > 0 && stage3PageRows.every(r => checkedConvIds.includes(r.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const newIds = [...checkedConvIds];
                              stage3PageRows.forEach(r => {
                                if (!newIds.includes(r.id)) newIds.push(r.id);
                              });
                              setCheckedConvIds(newIds);
                            } else {
                              const pageIds = stage3PageRows.map(r => r.id);
                              setCheckedConvIds(prev => prev.filter(id => !pageIds.includes(id)));
                            }
                          }}
                        />
                      </th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Conv ID</th>
                      <th style={{ width: '25%' }}>User</th>
                      <th style={{ width: '36%' }}>Assistant</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Subject Label</th>
                      <th style={{ width: '8%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage3PageRows.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          No conversations in this group.
                        </td>
                      </tr>
                    )}
                    {stage3PageRows.map((conv, idx) => (
                      <tr key={conv.id} className="conv-row conv-first conv-last">
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <input 
                            type="checkbox" 
                            checked={checkedConvIds.includes(conv.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCheckedConvIds(prev => [...prev, conv.id]);
                              } else {
                                setCheckedConvIds(prev => prev.filter(id => id !== conv.id));
                              }
                            }}
                          />
                        </td>
                        <td className="col-conv-id-cell">
                          <span className="conv-id-badge" title={conv.id}>{conv.id}</span>
                          <span className="conv-msg-count">{conv.messages.length} msgs</span>
                        </td>
                        <td className="cell-text-col" style={{ padding: '12px', verticalAlign: 'middle' }}>
                          <div className="conv-card-cell" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {conv.messages.length === 1 ? (
                              /* Đơn lượt: Hiển thị câu hỏi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '15px', color: '#1e293b', lineHeight: '1.6', whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: 500 }}>
                                <span style={{ marginRight: '6px', fontSize: '14px' }}>📌</span>
                                {highlightSearch(conv.messages[0].user, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '14px' }}>📌 Chủ đề:</span>
                                  <span style={{ fontSize: '15px', color: '#4f46e5' }}>
                                    {getConversationTopic(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: '700', color: '#6366f1', flexShrink: 0 }}>U{idx+1}:</span>
                                      <span style={{ color: '#1e293b', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.user}>
                                        {highlightSearch(truncateText(msg.user, 150), stage3Search)}
                                      </span>
                                    </div>
                                  ))}
                                  {conv.messages.length > 3 && (
                                    <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic' }}>
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
                              /* Đơn lượt: Hiển thị phản hồi đầy đủ dạng bọc dòng */
                              <div style={{ fontSize: '15px', color: '#334155', lineHeight: '1.6', whiteSpace: 'normal', wordBreak: 'break-word', fontWeight: 500 }}>
                                <span style={{ marginRight: '6px', fontSize: '14px' }}>💡</span>
                                {highlightSearch(conv.messages[0].assistant, stage3Search)}
                              </div>
                            ) : (
                              /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                              <>
                                <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                  <span style={{ fontSize: '14px' }}>💡 Phản hồi:</span>
                                  <span style={{ fontSize: '15px', color: '#0891b2' }}>
                                    {getAssistantSummary(conv.messages)}
                                  </span>
                                </div>
                                <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                  {conv.messages.slice(0, 3).map((msg, idx) => (
                                    <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: '700', color: '#0ea5e9', flexShrink: 0 }}>A{idx+1}:</span>
                                      <span style={{ color: '#334155', whiteSpace: 'normal', wordBreak: 'break-word' }} title={msg.assistant}>
                                        {highlightSearch(truncateText(msg.assistant, 150), stage3Search)}
                                      </span>
                                    </div>
                                  ))}
                                  {conv.messages.length > 3 && (
                                    <div style={{ fontSize: '12.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      + {conv.messages.length - 3} phản hồi khác (bấm Detail để xem)
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <select
                            className="toolbar-select"
                            style={{
                              background: conv.groupBg,
                              color: conv.groupColor,
                              borderColor: conv.groupColor,
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              height: 'auto',
                              minWidth: '90px',
                              cursor: 'pointer'
                            }}
                            value={aiGroupLabels[conv.groupId] || conv.groupLabel || ''}
                            onChange={e => {
                              const newLabel = e.target.value;
                              setAiGroupLabels(prev => ({ ...prev, [conv.groupId]: newLabel }));
                              setStage3Convs(prev => prev.map(c =>
                                c.groupId === conv.groupId ? { ...c, groupLabel: newLabel } : c
                              ));
                            }}
                          >
                            <option value="">-- Select --</option>
                            <option value="MATH">MATH</option>
                            <option value="CODING">CODING</option>
                            <option value="PHYSICS">PHYSICS</option>
                            <option value="CHEMISTRY">CHEMISTRY</option>
                            <option value="BIOLOGY">BIOLOGY</option>
                            <option value="HISTORY">HISTORY</option>
                            <option value="LITERATURE">LITERATURE</option>
                            <option value="OTHER">OTHER</option>
                            <option value="NOISE">NOISE</option>
                            {customSubjectLabels.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                            {pendingAiLabels.map(lbl => <option key={lbl} value={lbl}>{lbl} (Mới)</option>)}
                          </select>
                        </td>
                        <td className="col-action-cell" style={{ verticalAlign: 'middle' }}>
                          <button className="view-detail-btn" onClick={() => setSelectedConv3(conv)}>
                            <Eye size={14} />
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="preview-pagination">
                <button className="pagination-arrow" disabled={stage3Page <= 1} onClick={() => setStage3Page(stage3Page - 1)}>‹</button>
                {getPageNumbers(stage3Page, stage3TotalPages).map((page, idx) =>
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                  ) : (
                    <button
                      key={page}
                      className={`pagination-page-btn ${page === stage3Page ? 'active' : ''}`}
                      onClick={() => setStage3Page(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button className="pagination-arrow" disabled={stage3Page >= stage3TotalPages} onClick={() => setStage3Page(stage3Page + 1)}>›</button>
              </div>
            </div>

            {/* Right: Sidebar */}
            <div className="stage2-sidebar">
              <div className="cleaning-pipeline-card">
                <div className="auto-labeling-header" style={{ paddingBottom: '0', borderBottom: 'none' }}>
                  <div className="auto-labeling-actions" style={{ width: '100%', display: 'flex', gap: '8px' }}>
                    <select
                      className="label-model-select"
                      style={{ flex: 1 }}
                      value={aiProvider}
                      onChange={e => setAiProvider(e.target.value as any)}
                      disabled={isLabelingWithAI}
                    >
                      <option value="deepseek">Deepseek</option>
                      <option value="openai">ChatGPT</option>
                      <option value="gemini">Gemini</option>
                    </select>
                    <button
                      className="label-ai-btn"
                      style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', opacity: (!clusterRan || isLabelingWithAI) ? 0.6 : 1 }}
                      disabled={!clusterRan || isLabelingWithAI}
                      onClick={async () => {
                        if (!clusterRan) return;

                        const hasExistingLabels = Object.values(aiGroupLabels).some(val => val !== '' && val !== undefined);
                        if (hasExistingLabels) {
                          const confirmRelabel = window.confirm('Dữ liệu này đã được gán nhãn. Bạn có muốn yêu cầu AI chạy lại và ghi đè nhãn mới không?');
                          if (!confirmRelabel) return;
                          
                          // Xóa nhãn hiện tại trên UI để chạy lại
                          setAiGroupLabels({});
                          setPendingAiLabels([]);
                        }

                        setIsLabelingWithAI(true);
                        try {
                          // Lấy versionId từ metadata của dữ liệu (nếu có) hoặc từ localStorage
                          let versionId: string =
                            (stage3Convs[0] as any)?.datasetVersionId ||
                            (stage3Convs[0] as any)?.versionId ||
                            localStorage.getItem('current_version_id') ||
                            '';

                          // Nếu chưa có versionId, tự động tạo Dataset Version mới để lưu vào DB
                          if (!versionId) {
                            const payload = {
                              projectName: 'Auto-Label Dataset',
                              operationType: 'labeling_base' as const,
                              similarityThreshold: 0.85,
                              format: 'openai' as const,
                              data: stage3Convs.map((conv, idx) => {
                                const messages = conv.messages.flatMap((m: any) => [
                                  { role: 'user', content: m.user },
                                  { role: 'assistant', content: m.assistant }
                                ]).filter((m: any) => m.content && String(m.content).trim() !== '');

                                return {
                                  sourceKey: `conv-${idx}`,
                                  data: {
                                    messages,
                                    cluster: conv.groupId,
                                    conversation_id: `conv-${idx}`
                                  }
                                };
                              })
                            };
                            const created = await apiService.createDatasetVersion(payload);
                            versionId = created.datasetVersion._id;
                            localStorage.setItem('current_version_id', versionId);
                          }

                          // Gọi endpoint thật: POST /dataprep/versions/:versionId/auto-label/preview
                          const res = await apiService.previewAutoLabels(versionId, aiProvider);
                          const suggestions = res.suggestions || [];

                          // BE trả về clusterId (0-indexed) → map sang groupId của GROUP_DATA
                          const labelMap: Record<number, string> = {};
                          const predefinedLabels = ['MATH', 'CODING', 'PHYSICS', 'PHYSICAL', 'CHEMISTRY', 'BIOLOGY', 'HISTORY', 'LITERATURE', 'OTHER', 'NOISE'];
                          const newLabels = new Set<string>();

                          suggestions.forEach((s: any) => {
                            // clusterId từ BE có thể là 0,1,2... còn groupId trong UI là 1,2,3...
                            const groupId = (s.clusterId ?? s.groupId);
                            if (groupId !== undefined) {
                              labelMap[groupId] = s.label;
                              if (s.label && !predefinedLabels.includes(s.label) && !customSubjectLabels.includes(s.label)) {
                                newLabels.add(s.label);
                              }
                            }
                          });
                          
                          if (newLabels.size > 0) {
                            setPendingAiLabels(Array.from(newLabels));
                          }
                          setAiGroupLabels(prev => ({ ...prev, ...labelMap }));
                        } catch (err: any) {
                          const msg = err?.response?.data?.error || err?.message || 'AI labeling failed.';
                          alert(`Lỗi gán nhãn AI: ${msg}`);
                        } finally {
                          setIsLabelingWithAI(false);
                        }
                      }}
                    >
                      {isLabelingWithAI
                        ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý...</>
                        : <><Sparkles size={14} /> Label with AI</>
                      }
                    </button>
                  </div>
                </div>

                {pendingAiLabels.length > 0 && (
                  <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ color: '#d97706', marginTop: '2px' }}><Sparkles size={16} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                          AI phát hiện môn học mới
                        </div>
                        <div style={{ fontSize: '12px', color: '#b45309', marginBottom: '10px' }}>
                          Có vẻ dữ liệu của bạn có các môn: <strong>{pendingAiLabels.join(', ')}</strong>. Bạn có muốn thêm vào danh sách lựa chọn?
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            style={{ padding: '4px 10px', fontSize: '12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => {
                              setCustomSubjectLabels(prev => [...new Set([...prev, ...pendingAiLabels])]);
                              setPendingAiLabels([]);
                            }}
                          >
                            Thêm & Áp dụng
                          </button>
                          <button
                            style={{ padding: '4px 10px', fontSize: '12px', background: 'transparent', color: '#b45309', border: '1px solid #fcd34d', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }}
                            onClick={() => setPendingAiLabels([])}
                          >
                            Bỏ qua
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Group Cards */}
                <div className="group-cards-container" style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {!clusterRan ? (
                    /* Placeholder: chưa chạy cluster */
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔬</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>Chưa có dữ liệu phân cụm</div>
                      <div style={{ fontSize: '12px', lineHeight: '1.6' }}>Vui lòng quay lại <strong>Stage 2 → K-means Cluster</strong> và chạy phân cụm trước khi gán nhãn.</div>
                    </div>
                  ) : (
                    <>
                      {/* Show All button */}
                      <div
                        className={`group-card-item ${selectedGroup3 === null ? 'group-card-active' : ''}`}
                        style={{ borderColor: '#94a3b8', '--group-accent': '#64748b' } as React.CSSProperties}
                        onClick={() => { setSelectedGroup3(null); setStage3Page(1); }}
                      >
                        <div className="group-card-name" style={{ color: '#64748b' }}>All Groups</div>
                        <div className="group-card-count">{allConvRows.length}</div>
                      </div>

                      {/* Legend Header */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px 16px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <div style={{ flex: 1 }}>Group Name</div>
                        <div style={{ width: '36px', textAlign: 'center', marginRight: '12px' }}>Count</div>
                        <div style={{ width: '120px', textAlign: 'left', paddingLeft: '4px' }}>Label</div>
                      </div>

                      {GROUP_DATA.map(g => (
                        <div
                          key={g.id}
                          className={`group-card-item ${selectedGroup3 === g.id ? 'group-card-active' : ''}`}
                          style={{ borderColor: g.color, '--group-accent': g.color } as React.CSSProperties}
                          onClick={() => { setSelectedGroup3(g.id); setStage3Page(1); }}
                        >
                          <div className="group-card-name" style={{ color: g.color, fontWeight: 700 }}>Group {g.id}</div>
                          <div className="group-card-count">{g.count}</div>
                          <div className="group-card-label">
                            <select
                              className="inline-label-select"
                              onClick={e => e.stopPropagation()}
                              value={aiGroupLabels[g.id] || g.label}
                              onChange={e => {
                                const newLabel = e.target.value;
                                setAiGroupLabels(prev => ({ ...prev, [g.id]: newLabel }));
                                setStage3Convs(prev => prev.map(c =>
                                  c.groupId === g.id ? { ...c, groupLabel: newLabel } : c
                                ));
                              }}
                            >
                              <option value="">-- Select --</option>
                              <option value="MATH">MATH</option>
                              <option value="CODING">CODING</option>
                              <option value="PHYSICS">PHYSICS</option>
                              <option value="PHYSICAL">PHYSICAL</option>
                              <option value="CHEMISTRY">CHEMISTRY</option>
                              <option value="BIOLOGY">BIOLOGY</option>
                              <option value="HISTORY">HISTORY</option>
                              <option value="LITERATURE">LITERATURE</option>
                              <option value="OTHER">OTHER</option>
                              <option value="NOISE">NOISE</option>
                              {customSubjectLabels.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                              {pendingAiLabels.map(lbl => <option key={lbl} value={lbl}>{lbl} (Mới)</option>)}
                            </select>
                          </div>
                        </div>
                      ))}

                      {isLabelingWithAI && (
                        <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', color: '#6366f1', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                          AI đang phân tích và gán nhãn...
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="label-bottom-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  {/* Clear button — luôn hiển thị khi đã chạy cluster */}
                  {clusterRan && (
                    <button
                      onClick={() => {
                        setAiGroupLabels({});
                        setPendingAiLabels([]);
                        setCustomSubjectLabels([]);
                        setStage3Convs(prev => prev.map(c => ({ ...c, groupLabel: '' })));
                      }}
                      disabled={Object.keys(aiGroupLabels).length === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'white', border: '1.5px solid #e2e8f0',
                        color: Object.keys(aiGroupLabels).length > 0 ? '#64748b' : '#cbd5e1',
                        padding: '8px 16px', borderRadius: '6px',
                        fontSize: '13px', fontWeight: 600, cursor: Object.keys(aiGroupLabels).length > 0 ? 'pointer' : 'not-allowed',
                        transition: 'all 0.15s',
                        opacity: Object.keys(aiGroupLabels).length > 0 ? 1 : 0.5
                      }}
                      onMouseEnter={e => {
                        if (Object.keys(aiGroupLabels).length === 0) return;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#ef4444';
                        (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                        (e.currentTarget as HTMLButtonElement).style.color = Object.keys(aiGroupLabels).length > 0 ? '#64748b' : '#cbd5e1';
                        (e.currentTarget as HTMLButtonElement).style.background = 'white';
                      }}
                      title="Xóa toàn bộ nhãn AI đã gán"
                    >
                      <X size={14} /> Clear
                    </button>
                  )}
                  <button
                    className="save-labels-btn"
                    disabled={!clusterRan || isSavingLabels}
                    style={{ opacity: (clusterRan && !isSavingLabels) ? 1 : 0.5 }}
                    onClick={async () => {
                      if (!clusterRan || isSavingLabels) return;
                      setIsSavingLabels(true);
                      try {
                        const versionId = localStorage.getItem('current_version_id');
                        if (!versionId) {
                          alert('Không tìm thấy versionId, không thể lưu nhãn lên DB.');
                          setIsSavingLabels(false);
                          return;
                        }

                        // Payload: { clusterId, label }
                        const payloadLabels = Object.entries(aiGroupLabels).map(([groupId, label]) => ({
                          clusterId: Number(groupId),
                          label
                        }));

                        if (payloadLabels.length === 0) {
                          alert('Chưa có nhãn nào được gắn.');
                          setIsSavingLabels(false);
                          return;
                        }

                        await apiService.saveAutoLabels(versionId, payloadLabels);
                        
                        // Cập nhật giao diện cục bộ sau khi lưu thành công
                        setStage3Convs(prev => prev.map(c => ({
                          ...c,
                          groupLabel: aiGroupLabels[c.groupId] || c.groupLabel
                        })));
                        alert('Đã lưu nhãn thành công vào Database!');
                      } catch (err: any) {
                        console.error('Save labels error:', err);
                        alert(`Lỗi khi lưu nhãn: ${err.message || 'Unknown error'}`);
                      } finally {
                        setIsSavingLabels(false);
                      }
                    }}
                  >
                    {isSavingLabels ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} 
                    {isSavingLabels ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Detail Popup for Stage 3 */}
        {selectedConv3 && (
          <div className="cluster-popup-overlay" onClick={() => setSelectedConv3(null)}>
            <div className="cluster-popup-content conv-detail-popup" onClick={(e) => e.stopPropagation()}>
              <div className="cluster-popup-header">
                <div className="cluster-popup-header-left">
                  <MessageSquare size={20} />
                  <div>
                    <h2>Conversation Detail</h2>
                    <p>{selectedConv3.id} · {selectedConv3.messages.length} messages · <span style={{ color: selectedConv3.groupColor, fontWeight: 700 }}>Group {selectedConv3.groupId} — {selectedConv3.groupLabel}</span></p>
                  </div>
                </div>
                <button className="cluster-popup-close-btn" onClick={() => setSelectedConv3(null)}>
                  <X size={18} /> Close
                </button>
              </div>
              <div className="conv-detail-body">
                {selectedConv3.messages.map((msg, idx) => (
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

        {currentSubStep3 === 6 && (
          <div className="sa-dashboard">
            {/* Public Access Bar */}
            <div className="sa-public-bar">
              <div>
                <h4>Public Access</h4>
                <p>Publish this sample publicly while managing assignee target labels.</p>
              </div>
              <div className="sa-public-actions">
                <button className="sa-btn-outline"><Settings size={14} /> Refresh</button>
                <button className="sa-btn-outline">Public: OFF</button>
              </div>
            </div>

            {/* Status Cards Row */}
            <div className="sa-status-row">
              {['ASSIGNED','ASSIGNEES','IN PROGRESS','SUBMITTED','SAVED DECISIONS','NEEDS REVIEW','PUBLISHED'].map(label => (
                <div key={label} className="sa-status-card">
                  <span className="sa-status-label">{label}</span>
                  <span className="sa-status-value">0</span>
                </div>
              ))}
            </div>

            <div className="sa-main-layout">
              {/* Left Content */}
              <div className="sa-left">
                {/* Task Allocation */}
                <div className="sa-section-card">
                  <div className="sa-section-header">
                    <div>
                      <h4>Task Allocation Dashboard</h4>
                      <p>Divide your unassigned dataset into batches and assign to annotation.</p>
                    </div>
                    <button className="sa-create-task-btn" onClick={() => setShowCreateTaskModal(true)}><Plus size={14} /> Create Task</button>
                  </div>

                  <div className="sa-alloc-cards">
                    <div className="sa-alloc-card">
                      <span className="sa-alloc-label">Total Samples</span>
                      <span className="sa-alloc-value sa-dark">120</span>
                    </div>
                    <div className="sa-alloc-card sa-alloc-green">
                      <span className="sa-alloc-label sa-green-text">Assigned</span>
                      <span className="sa-alloc-value sa-green-text">30</span>
                    </div>
                    <div className="sa-alloc-card sa-alloc-orange">
                      <span className="sa-alloc-label sa-orange-text">Unassigned</span>
                      <span className="sa-alloc-value sa-orange-text">90</span>
                    </div>
                  </div>

                  <h5 className="sa-sub-title">Active Tasks</h5>
                  <div className="sa-tasks-table-wrap">
                    <table className="sa-tasks-table">
                      <thead>
                        <tr>
                          <th>BATCH</th>
                          <th>ASSIGNEES</th>
                          <th>SAMPLES</th>
                          <th>DUE DATE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="sa-link">batch1</span></td>
                          <td>hoang22_nmgf</td>
                          <td>30 samples assigned</td>
                          <td className="sa-date">June 8, 2026</td>
                          <td><span className="sa-badge-pending">Pending</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Samples */}
                <div className="sa-section-card">
                  <h4 className="sa-section-title">Samples</h4>
                  <div className="sa-tasks-table-wrap">
                    <table className="sa-tasks-table sa-samples-table">
                      <thead>
                        <tr>
                          <th style={{width:'5%'}}>ID</th>
                          <th style={{width:'65%'}}>SAMPLE KEY & CONTENT</th>
                          <th style={{width:'30%'}}>ASSIGNEES</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="sa-id-cell">#1</td>
                          <td>
                            <div className="sa-sample-key">
                              <span className="sa-conv-name">conv-1</span>
                              <span className="sa-conflict-badge">⊘ Conflict</span>
                            </div>
                            <div className="sa-sample-content">Em không hiểu hàm số bậc nhất là gì. Em cứ nhìn thế nào dạng tổng quát của đường thẳng trên mặt phẳng tọa độ không? Thử đoán hàm số bậc nhất có dạng y = ax + b với a như thế nào?</div>
                            <div className="sa-sample-meta">IAA 0.11 · 3 pending adjudication</div>
                          </td>
                          <td>
                            <div className="sa-assignee">hoang22</div>
                            <div className="sa-assignee-email">hoangndnhe180790@fpt.edu.vn</div>
                            <div className="sa-assignee">uhhgf</div>
                            <div className="sa-assignee-email">hoangndnhe180790@fpt.edu.vn</div>
                          </td>
                        </tr>
                        <tr>
                          <td className="sa-id-cell">#2</td>
                          <td>
                            <div className="sa-sample-key">
                              <span className="sa-conv-name">conv-2</span>
                            </div>
                            <div className="sa-sample-content">Hệ số góc của đường thẳng là gì? Khi x tăng 1 đơn vị mà y thay đổi bao nhiêu đơn vị, em nghĩ đại lượng nào đang có là góc dốc của đường thẳng đó?</div>
                          </td>
                          <td><span className="sa-unassigned-tag">Unassigned</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Sidebar */}
              <div className="sa-right">
                <div className="sa-section-card">
                  <h4 className="sa-section-title"><FileText size={14} /> Realtime Productivity</h4>
                  <div className="sa-productivity-info">
                    <span className="sa-prod-name">hoang22</span>
                    <span className="sa-prod-detail">Last active: 0 seconds ago</span>
                    <span className="sa-prod-detail">0/30 pages · 05:0h samples</span>
                    <span className="sa-prod-detail">0.00s/page (avg. 0 samples)</span>
                  </div>
                </div>

                <div className="sa-section-card sa-conflict-card">
                  <h4 className="sa-section-title sa-conflict-title">⊘ Conflict Review Queue</h4>
                  <div className="sa-conflict-item">
                    <div className="sa-conflict-left">
                      <span className="sa-conflict-id">#1 : conv-1</span>
                      <span className="sa-conflict-meta">IAA 0.11 · 3 annotators</span>
                    </div>
                    <span className="sa-pending-count">3 pending</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentSubStep3 === 7 && (
          <div className="ia-dashboard">
            {/* Coverage Bar */}
            <div className="ia-coverage-bar">
              <div>
                <h4>Intent-Action Coverage</h4>
                <p>0 / 90 samples have complete Intent-Action labels.</p>
              </div>
              <div className="ia-coverage-stats">
                <span className="ia-stat-green">Complete: 0</span>
                <span className="ia-stat-red">Missing: 90</span>
              </div>
            </div>

            <div className="ia-main-layout">
              {/* Left: Chat History */}
              <div className="ia-left">
                <div className="ia-section-card">
                  <div className="ia-chat-header">
                    <h4><FileText size={14} /> Chat History</h4>
                    <div className="ia-chat-meta">Conversation 1 &nbsp; <strong>1 / 90</strong></div>
                  </div>

                  <div className="ia-chat-tabs">
                    <button className={`ia-tab ${iaActiveTab === 'assignment' ? 'active' : ''}`} onClick={() => setIaActiveTab('assignment')}>Assignment</button>
                    <button className={`ia-tab ${iaActiveTab === 'unassigned' ? 'active' : ''}`} onClick={() => setIaActiveTab('unassigned')}>Unassigned</button>
                  </div>

                  {iaActiveTab === 'assignment' && (
                  <>
                  <div className="ia-chat-messages">
                    {iaMessages.map((msg) => {
                      const isUser = msg.role === 'user';
                      const isSelected = selectedIaMsgId === msg.id;
                      
                      const msgClass = isUser ? 'ia-msg ia-msg-user' : 'ia-msg ia-msg-assistant';
                      const bubbleClass = isUser 
                        ? `ia-msg-bubble ia-bubble-user ${isSelected ? 'ia-bubble-selected-user' : ''}` 
                        : `ia-msg-bubble ia-bubble-assistant ${isSelected ? 'ia-bubble-selected-assistant' : ''}`;
                      
                      const numClass = isUser ? 'ia-msg-num' : 'ia-msg-num ia-num-green';
                      
                      const activeLabels = [];
                      Object.keys(msg.labels).forEach((groupName) => {
                        msg.labels[groupName].forEach((tag) => {
                          if (tag.active) {
                            activeLabels.push(tag.name);
                          }
                        });
                      });

                      return (
                        <div 
                          key={msg.id} 
                          className={msgClass}
                          onClick={() => setSelectedIaMsgId(prev => prev === msg.id ? null : msg.id)}
                          style={{ cursor: 'pointer', marginBottom: '8px' }}
                        >
                          {isUser ? (
                            <>
                              <div className={bubbleClass}>
                                <span className="ia-msg-role">USER</span>
                                <p>{msg.text}</p>
                              </div>
                              <span className={numClass}>{msg.turn}</span>
                              {activeLabels.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', marginLeft: '0' }}>
                                  {activeLabels.map((lbl) => (
                                    <div 
                                      key={lbl}
                                      className="ia-msg-label"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        margin: '0',
                                        ...getLabelBadgeStyle(lbl)
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveMessageSingleLabel(msg.id, lbl);
                                      }}
                                    >
                                      {lbl === 'OK' && <Check size={10} style={{ marginRight: '2px' }} />}
                                      {lbl} <X size={10} style={{ marginLeft: '4px' }} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <span className={numClass}>{msg.turn}</span>
                              <div className={bubbleClass}>
                                <span className="ia-msg-role">ASSISTANT</span>
                                <p>{msg.text}</p>
                              </div>
                              {activeLabels.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', marginLeft: '32px' }}>
                                  {activeLabels.map((lbl) => (
                                    <div 
                                      key={lbl}
                                      className="ia-msg-label"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        margin: '0',
                                        ...getLabelBadgeStyle(lbl)
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveMessageSingleLabel(msg.id, lbl);
                                      }}
                                    >
                                      {lbl} <X size={10} style={{ marginLeft: '4px' }} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  <div className="ia-chat-pagination">
                    <button className="ia-page-btn">← Previous</button>
                    <span className="ia-page-info">1 / 90</span>
                    <button className="ia-page-btn">Next →</button>
                  </div>
                  </>
                  )}

                  {iaActiveTab === 'unassigned' && (
                  <>
                  <div className="ia-unassigned-list">
                    {[
                      { id: 'conv-4', preview: 'Thầy ơi, lực ma sát là gì ạ? Em nghe nói có 2 loại...', turns: 6, subject: 'PHYSICAL' },
                      { id: 'conv-5', preview: 'Cho em hỏi cách tính diện tích hình thang ạ?', turns: 4, subject: 'MATH' },
                      { id: 'conv-7', preview: 'Em không hiểu phản ứng oxi hóa khử, giải thích giúp em...', turns: 8, subject: 'CHEM' },
                      { id: 'conv-9', preview: 'Anh ơi giải giúp em bài toán xác suất này...', turns: 5, subject: 'MATH' },
                      { id: 'conv-12', preview: 'Quang hợp là gì ạ? Cây xanh hấp thụ ánh sáng như nào?', turns: 7, subject: 'BIO' },
                      { id: 'conv-15', preview: 'Cho em hỏi về thuyết tương đối của Einstein...', turns: 10, subject: 'PHYSICAL' },
                    ].map((conv) => (
                      <div key={conv.id} className="ia-unassigned-item">
                        <div className="ia-unassigned-info">
                          <div className="ia-unassigned-top">
                            <span className="ia-unassigned-id">{conv.id}</span>
                            <span className={`ia-unassigned-subject ia-subj-${conv.subject.toLowerCase()}`}>{conv.subject}</span>
                            <span className="ia-unassigned-turns">{conv.turns} turns</span>
                          </div>
                          <p className="ia-unassigned-preview">{conv.preview}</p>
                        </div>
                        <button className="ia-assign-btn">Assign to me</button>
                      </div>
                    ))}
                  </div>

                  <div className="ia-chat-pagination">
                    <button className="ia-page-btn">← Previous</button>
                    <span className="ia-page-info">1 / 15</span>
                    <button className="ia-page-btn">Next →</button>
                  </div>
                  </>
                  )}
                </div>
              </div>

              {/* Right: Labels Panel */}
              <div className="ia-right">
                {/* Current Labels */}
                <div className="ia-section-card">
                  <div className="ia-labels-header">
                    <h4>◇ Current Labels</h4>
                    <span className="ia-label-count">1</span>
                  </div>
                  <input type="text" defaultValue="Conversation" className="ia-label-input" />
                  <div className="ia-current-label-card">
                    <div className="ia-cl-info">
                      <span className="ia-cl-name">MATH</span>
                      <span className="ia-cl-meta">1 user(s)</span>
                      <span className="ia-cl-assigned">Assigned by you</span>
                    </div>
                    <button className="ia-cl-remove"><X size={14} /></button>
                  </div>
                  <div className="ia-label-actions-row">
                    <button className="ia-add-label-btn">Add Label</button>
                    <input type="number" defaultValue={1} className="ia-label-num-input" />
                    <select className="ia-label-select">
                      <option>Gemini</option>
                      <option>Deepseek</option>
                    </select>
                  </div>
                  <div className="ia-label-btn-row">
                    <button className="ia-auto-labeling-btn">Auto Labeling</button>
                    <button className="ia-user-guide-btn" onClick={() => setShowUserGuide(true)}>📋 User Guide</button>
                  </div>
                </div>

                {/* Hard Labels */}
                <div className="ia-section-card">
                  {selectedIaMsgId ? (
                    (() => {
                      const selectedMsg = iaMessages.find(m => m.id === selectedIaMsgId);
                      if (!selectedMsg) return null;
                      
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h5 className="ia-section-subtitle" style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800' }}>
                              {selectedMsg.role === 'user' ? 'USER HARD LABELS' : 'ASSISTANT HARD LABELS'}
                            </h5>
                            <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: '13px' }}>
                              Turn {selectedMsg.turn}
                            </span>
                          </div>
                          
                          {Object.keys(selectedMsg.labels).map((groupName) => (
                            <div key={groupName} className="ia-hl-group" style={{ marginBottom: '16px' }}>
                              <span className="ia-hl-group-label" style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                                {groupName}
                              </span>
                              <div className="ia-hl-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {selectedMsg.labels[groupName].map((tag) => {
                                  const isTagActive = tag.active;
                                  const isGreen = tag.colorClass === 'green' || (selectedMsg.role === 'user' && groupName === 'KNOWLEDGE' && tag.name === 'OK');
                                  const isBlue = tag.colorClass === 'blue' || (selectedMsg.role === 'assistant' && groupName === 'PEDAGOGY' && tag.name === 'SCAF');
                                  const isRed = tag.colorClass === 'red';
                                  
                                  let tagStyle: React.CSSProperties = {
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '4px 8px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease-in-out',
                                    minWidth: '75px',
                                    flex: '1 1 calc(33.33% - 6px)',
                                    background: 'white',
                                    color: '#334155',
                                    boxSizing: 'border-box'
                                  };

                                  if (isTagActive) {
                                    if (isGreen) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#e8f5e9',
                                        borderColor: '#4caf50',
                                        color: '#2e7d32',
                                        fontWeight: 700,
                                      };
                                    } else if (isBlue) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#e3f2fd',
                                        borderColor: '#2196f3',
                                        color: '#1565c0',
                                        fontWeight: 700,
                                      };
                                    } else if (isRed) {
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#ffebee',
                                        borderColor: '#ef5350',
                                        color: '#c62828',
                                        fontWeight: 700,
                                      };
                                    } else {
                                      // Default active: purple
                                      tagStyle = {
                                        ...tagStyle,
                                        background: '#f3e8ff',
                                        borderColor: '#a855f7',
                                        color: '#6b21a8',
                                        fontWeight: 700,
                                      };
                                    }
                                  }

                                  // Specific widths to match image:
                                  // OK and NO: 2 per row
                                  if (groupName === 'KNOWLEDGE' || groupName === 'OTHER' || (groupName === 'ISSUES' && selectedMsg.role === 'user')) {
                                    tagStyle.flex = '1 1 calc(50% - 6px)';
                                  }

                                  return (
                                    <div
                                      key={tag.name}
                                      style={tagStyle}
                                      onClick={() => handleToggleLabel(selectedMsg.id, groupName, tag.name)}
                                      className="ia-hl-tag-interactive"
                                    >
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                        <span style={{ fontSize: '11px' }}>{tag.icon}</span>
                                        <span>{tag.name}</span>
                                      </span>
                                      <span style={{ opacity: 0.8, fontSize: '11px', fontWeight: 'bold', marginLeft: '4px' }}>{tag.count}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  ) : (
                    <div>
                      <h5 className="ia-section-subtitle">HARD LABELS</h5>
                      <p className="ia-empty-hint">Chọn một tin nhắn để gán nhãn</p>
                    </div>
                  )}
                </div>

                {/* Conversation Hard Labels */}
                <div className="ia-section-card">
                  <h5 className="ia-section-subtitle">CONVERSATION HARD LABELS</h5>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">DECISION</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag">✕ REJ 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">SUBJECT</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-purple">▦ MATH 0</span>
                      <span className="ia-hl-tag ia-tag-green">⟡ PHYS 1</span>
                      <span className="ia-hl-tag ia-tag-red">⟡ CHEM 0</span>
                      <span className="ia-hl-tag">▭ LIT 0</span>
                      <span className="ia-hl-tag ia-tag-purple">⊞ BIO 0</span>
                      <span className="ia-hl-tag">▦ MULTI 0</span>
                      <span className="ia-hl-tag">◎ UNCLEAR 0</span>
                      <span className="ia-hl-tag">○ OOS 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">STATUS</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-green">✓ COMPLETED 0</span>
                      <span className="ia-hl-tag ia-tag-orange">◎ INCOMPLETE 0</span>
                      <span className="ia-hl-tag ia-tag-red">✕ DROPPED 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">QUALITY</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag ia-tag-green">✦ GOOD 0</span>
                      <span className="ia-hl-tag">⊞ MEDIUM 0</span>
                      <span className="ia-hl-tag ia-tag-red">✕ POOR 0</span>
                    </div>
                  </div>

                  <div className="ia-hl-group">
                    <span className="ia-hl-group-label">ISSUES</span>
                    <div className="ia-hl-tags">
                      <span className="ia-hl-tag">⊙ FACT_ERR 0</span>
                      <span className="ia-hl-tag">› DIR_ANS 0</span>
                      <span className="ia-hl-tag">▭ LANG_ISSUE 0</span>
                    </div>
                  </div>
                </div>

                {/* Soft Label */}
                <div className="ia-section-card">
                  <h5 className="ia-section-subtitle">SOFT LABEL</h5>
                  <div className="ia-soft-label-row">
                    <input type="text" placeholder="e.g. grammar error" className="ia-soft-input" />
                    <button className="ia-soft-add-btn">Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Guide Modal */}
        {showUserGuide && (
          <div className="modal-overlay" onClick={() => setShowUserGuide(false)}>
            <div className="ug-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ug-header">
                <h2>Labeling User Guide</h2>
                <button className="modal-close-btn" onClick={() => setShowUserGuide(false)}>
                  <X size={20} />
                </button>
              </div>
              <p className="ug-subtitle">Reference for manual intent-action labeling, with definitions and common intent-action pairings.</p>

              <div className="ug-body">
                {/* Conversation Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Conversation Labels</h3>
                  <p className="ug-section-desc">Nhãn ở mức toàn bộ hội thoại.</p>

                  <div className="ug-cards-grid">
                    <div className="ug-card ug-card-reject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-red">✕</span>
                        <span className="ug-card-name ug-name-red">REJECT</span>
                      </div>
                      <p className="ug-card-desc">Dùng khi toàn bộ hội thoại không nên đi tiếp trong pipeline vì chất lượng hoặc phạm vi không phù hợp.</p>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-purple">▦</span>
                        <span className="ug-card-name ug-name-purple">MATH</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Toán.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">REQUEST_HINT + HINTING</span>
                      </div>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-green">⟡</span>
                        <span className="ug-card-name ug-name-green">PHYS</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Vật lý.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">EXPLAIN_CONCEPT + SCAFFOLDING</span>
                      </div>
                    </div>

                    <div className="ug-card ug-card-subject">
                      <div className="ug-card-header">
                        <span className="ug-card-icon ug-icon-red">⟡</span>
                        <span className="ug-card-name ug-name-red">CHEM</span>
                      </div>
                      <p className="ug-card-desc">Hội thoại thuộc môn Hóa học.</p>
                      <div className="ug-pairings">
                        <span className="ug-pairings-label">GOOD PAIRINGS</span>
                        <span className="ug-pairing-tag">REQUEST_HINT + HINTING</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Intent Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Intent Labels (User)</h3>
                  <p className="ug-section-desc">Nhãn mô tả ý định của học sinh trong mỗi lượt nói.</p>

                  <div className="ug-table-wrap">
                    <table className="ug-table">
                      <thead>
                        <tr>
                          <th>Intent</th>
                          <th>Mô tả</th>
                          <th>Ví dụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="ug-intent-tag">REQUEST_HINT</span></td>
                          <td>Học sinh yêu cầu gợi ý hoặc hướng dẫn</td>
                          <td className="ug-example">"Em không hiểu, thầy gợi ý giúp em"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">EXPLAIN_CONCEPT</span></td>
                          <td>Học sinh yêu cầu giải thích khái niệm</td>
                          <td className="ug-example">"Chuyển động thẳng đều là gì ạ?"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">ANSWER</span></td>
                          <td>Học sinh trả lời câu hỏi của giáo viên</td>
                          <td className="ug-example">"Là vật đang di chuyển a."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">CONFIRM</span></td>
                          <td>Học sinh xác nhận hoặc đồng ý</td>
                          <td className="ug-example">"Dạ em hiểu rồi ạ!"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-intent-tag">ASK_FOLLOWUP</span></td>
                          <td>Học sinh hỏi thêm về chủ đề liên quan</td>
                          <td className="ug-example">"Vậy trên Mặt Trăng thì sao ạ?"</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Action Labels */}
                <div className="ug-section">
                  <h3 className="ug-section-title">Action Labels (Assistant)</h3>
                  <p className="ug-section-desc">Nhãn mô tả hành động của giáo viên AI trong mỗi lượt trả lời.</p>

                  <div className="ug-table-wrap">
                    <table className="ug-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Mô tả</th>
                          <th>Ví dụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="ug-action-tag">HINTING</span></td>
                          <td>Đưa ra gợi ý để dẫn dắt học sinh tự suy luận</td>
                          <td className="ug-example">"Em thử nghĩ xem: khi nói vật chuyển động..."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">SCAFFOLDING</span></td>
                          <td>Chia nhỏ vấn đề thành các bước dễ hiểu hơn</td>
                          <td className="ug-example">"Mình đi từng bước nhé..."</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">DIRECT_ANSWER</span></td>
                          <td>Trả lời trực tiếp câu hỏi</td>
                          <td className="ug-example">"Công thức là F = m × a"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">POSITIVE_FEEDBACK</span></td>
                          <td>Khen ngợi, khuyến khích học sinh</td>
                          <td className="ug-example">"Chính xác! Em hiểu rất nhanh!"</td>
                        </tr>
                        <tr>
                          <td><span className="ug-action-tag">REDIRECT</span></td>
                          <td>Chuyển hướng khi học sinh lạc đề hoặc yêu cầu đáp án</td>
                          <td className="ug-example">"Mình chỉ cần một câu thôi..."</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dataprep-actions-row">
          <button className="dataprep-btn-back" onClick={() => {
            if (currentSubStep3 > 5) {
              setCurrentSubStep3(currentSubStep3 - 1);
            } else {
              setCurrentStage(2);
            }
          }}>
            Back
          </button>
          <button className="dataprep-btn-next" onClick={() => {
            if (currentSubStep3 < 7) {
              setCurrentSubStep3(currentSubStep3 + 1);
            } else {
              setCurrentStage(4);
            }
          }}>
            Next
          </button>
        </div>
      </div>
    );
  
  return (
    <>
      {renderedContent}
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
    </>
  );
};
