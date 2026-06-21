import React from 'react';
import {
  Check, Play, Save, ChevronDown, ListFilter, Download, ArrowRight, ArrowLeft, MoreHorizontal,
  Search, Users, Star, Plus, Upload, Link as LinkIcon, Trash2, Edit3, X, Eye,
  MessageSquare, FileText, Database, Sparkles, Folder, Grid, MousePointer2, Settings, List, ChevronRight, HelpCircle, BarChart2, RefreshCw, Calendar, Loader2, Layers
} from 'lucide-react';
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
    setCurrentStage,
    setCurrentSubStep4,
    setConversationsList
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
  const [bulkSubject, setBulkSubject] = React.useState('');
  const [newSubjectInput, setNewSubjectInput] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const [useCustomApi, setUseCustomApi] = React.useState(false);

  // --- Added for Assignment Dashboard ---
  const [assignmentTotals, setAssignmentTotals] = React.useState<any>(null);
  const [assignmentSamples, setAssignmentSamples] = React.useState<any[]>([]);
  const [assignmentDashboard, setAssignmentDashboard] = React.useState<any>(null);
  const [shareUsers, setShareUsers] = React.useState<any[]>([]);
  const [supervisors, setSupervisors] = React.useState<any[]>([]);
  const [isFetchingDashboard, setIsFetchingDashboard] = React.useState(false);
  const [isAssigning, setIsAssigning] = React.useState(false);

  // Create Task Modal States
  const [taskBatchSize, setTaskBatchSize] = React.useState(30);
  const [taskAssigneeId, setTaskAssigneeId] = React.useState('');

  // Assign Samples Pagination
  const [samplesPage, setSamplesPage] = React.useState(1);
  const [samplesPerPage, setSamplesPerPage] = React.useState(10);
  const [selectedSamplesForBatch, setSelectedSamplesForBatch] = React.useState<number[]>([]);

  // Auto Split States
  const [assignActiveTab, setAssignActiveTab] = React.useState<'manual' | 'auto'>('manual');
  const [autoSplitMode, setAutoSplitMode] = React.useState<'by_batch_count' | 'by_batch_size'>('by_batch_count');
  const [autoSplitValue, setAutoSplitValue] = React.useState(3);
  const [autoSplitPrefix, setAutoSplitPrefix] = React.useState('Batch');
  const [autoSplitPreview, setAutoSplitPreview] = React.useState<{ id: string, name: string, samples: any[] }[]>([]);
  const [conflictThreshold, setConflictThreshold] = React.useState(0.6);

  // Wizard Step 2 States
  const [drawerStep, setDrawerStep] = React.useState<1 | 2>(1);
  const [staffAssignments, setStaffAssignments] = React.useState<Record<string, string[]>>({});
  const [taskNameInput, setTaskNameInput] = React.useState('');
  const [taskPriority, setTaskPriority] = React.useState('medium');
  const [assignedSupervisorId, setAssignedSupervisorId] = React.useState('');
  const [workloadFilter, setWorkloadFilter] = React.useState<'all' | 'free' | 'busy' | 'overloaded'>('all');
  const [overlapCount, setOverlapCount] = React.useState(1);

  const isStepCompleted = (num: number) => {
    if (num < currentSubStep3) return true;
    if (num === 5 && Object.keys(aiGroupLabels).length > 0) return true;
    if (num === 6 && assignmentSamples.some((s: any) => s.assignees && s.assignees.length > 0)) return true;
    return false;
  };

  const ensureDatasetVersionId = async () => {
    let versionId: string =
      (stage3Convs[0] as any)?.datasetVersionId ||
      (stage3Convs[0] as any)?.versionId ||
      localStorage.getItem('current_version_id') ||
      '';

    if (versionId) {
      localStorage.setItem('current_version_id', versionId);
      return versionId;
    }

    if (stage3Convs.length === 0) {
      throw new Error('No Stage 3 conversations available to create dataset version.');
    }

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
    return versionId;
  };

  React.useEffect(() => {
    let eventSource: EventSource | null = null;
    if (currentSubStep3 === 6) {
      const fetchAssignmentData = async () => {
        setIsFetchingDashboard(true);
        try {
          const versionId = localStorage.getItem('current_version_id');
          if (versionId) {
            const [dash, assign, usersRes] = await Promise.all([
              apiService.getDatasetVersionAssignmentDashboard(versionId),
              apiService.getDatasetVersionAssignments(versionId),
              apiService.listUsers()
            ]);
            setAssignmentDashboard(dash);
            setAssignmentTotals(assign.totals);
            setAssignmentSamples(assign.samples || []);

            const activeStaff = usersRes.users.filter((u: any) => u.role === 'staff' && u.status === 'active');
            let users = activeStaff.map((u: any) => ({ _id: u.id, name: u.name, email: u.email }));

            const activeSupervisors = usersRes.users.filter((u: any) => u.role === 'supervisor' && u.status === 'active');
            let sups = activeSupervisors.map((u: any) => ({ _id: u.id, name: u.name, email: u.email }));

            setShareUsers(users);
            setSupervisors(sups);
            if (users.length > 0) {
              setTaskAssigneeId(users[0]._id);
            }
          }
        } catch (err) {
          console.error('Failed to fetch assignment data:', err);
        } finally {
          setIsFetchingDashboard(false);
        }
      };
      fetchAssignmentData();

      // Listen for Real-Time Updates using SSE
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const sseUrl = `${apiBase}/dataprep/labeling/assignments/stream`;
      eventSource = new EventSource(sseUrl);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'assignment_updated') {
            console.log('[SSE] Received assignment update, refreshing dashboard...');
            fetchAssignmentData();
          }
        } catch (e) {
          console.error('[SSE] Error parsing event data', e);
        }
      };
      eventSource.onerror = (err) => {
        console.error('[SSE] EventSource failed:', err);
      };
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [currentSubStep3]);
  // --------------------------------------

  // Fetch staff when modal opens
  React.useEffect(() => {
    if (!showCreateTaskModal) return;
    const fetchStaffForModal = async () => {
      setIsFetchingDashboard(true);
      try {
        const usersRes = await apiService.listUsers();
        const activeStaff = usersRes.users.filter((u: any) => u.role === 'staff' && u.status === 'active');
        const users = activeStaff.map((u: any) => ({ _id: u.id, name: u.name, email: u.email }));
        setShareUsers(users);

        const activeSupervisors = usersRes.users.filter((u: any) => u.role === 'supervisor' && u.status === 'active');
        const sups = activeSupervisors.map((u: any) => ({ _id: u.id, name: u.name, email: u.email }));
        setSupervisors(sups);

        // Also try to load samples if versionId exists
        const versionId = localStorage.getItem('current_version_id');
        if (versionId && assignmentSamples.length === 0) {
          try {
            const assign = await apiService.getDatasetVersionAssignments(versionId);
            setAssignmentSamples(assign.samples || []);
            setAssignmentTotals(assign.totals);
          } catch (e) {
            console.warn('Could not load assignment samples:', e);
          }
        }
      } catch (err) {
        console.error('Failed to fetch staff for modal:', err);
      } finally {
        setIsFetchingDashboard(false);
      }
    };
    fetchStaffForModal();
  }, [showCreateTaskModal]);

  const handleCreateTask = async () => {
    if (!taskAssigneeId) {
      alert('Please select an assignee.');
      return;
    }
    const versionId = localStorage.getItem('current_version_id');
    if (!versionId) return;

    setIsAssigning(true);
    try {
      // Find the first unassigned index
      let startIndex = 1;
      const unassignedSample = assignmentSamples.find(s => !s.assignees || s.assignees.length === 0);
      if (unassignedSample) {
        startIndex = unassignedSample.sampleIndex;
      }

      await apiService.assignDatasetVersionRange(versionId, {
        assigneeId: taskAssigneeId,
        startIndex: startIndex,
        count: Number(taskBatchSize),
        similarityThreshold: conflictThreshold,
        supervisorId: assignedSupervisorId || undefined
      });
      // Refresh dashboard
      const [dash, assign] = await Promise.all([
        apiService.getDatasetVersionAssignmentDashboard(versionId),
        apiService.getDatasetVersionAssignments(versionId)
      ]);
      setAssignmentDashboard(dash);
      setAssignmentTotals(assign.totals);
      setAssignmentSamples(assign.samples || []);
      setShowCreateTaskModal(false);
      alert('Task created successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.error || err.message || 'Failed to create task');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleGenerateAutoSplit = () => {
    if (assignmentSamples.length === 0) return;

    let batches = [];
    if (autoSplitMode === 'by_batch_count') {
      const numBatches = autoSplitValue;
      if (numBatches <= 0) return;
      const baseSize = Math.floor(assignmentSamples.length / numBatches);
      let remainder = assignmentSamples.length % numBatches;

      let startIdx = 0;
      for (let i = 0; i < numBatches; i++) {
        let size = baseSize + (remainder > 0 ? 1 : 0);
        remainder--;
        if (size > 0) {
          batches.push({
            id: `batch-${i}`,
            name: `${autoSplitPrefix} ${i + 1}`,
            samples: assignmentSamples.slice(startIdx, startIdx + size)
          });
        }
        startIdx += size;
      }
    } else {
      const batchSize = autoSplitValue;
      if (batchSize <= 0) return;
      let startIdx = 0;
      let count = 1;
      while (startIdx < assignmentSamples.length) {
        batches.push({
          id: `batch-${count}`,
          name: `${autoSplitPrefix} ${count}`,
          samples: assignmentSamples.slice(startIdx, startIdx + batchSize)
        });
        startIdx += batchSize;
        count++;
      }
    }
    setAutoSplitPreview(batches);
  };

  const handleNextToStep2 = () => {
    if (assignActiveTab === 'manual') {
      if (selectedSamplesForBatch.length === 0) {
        alert('Vui lòng chọn ít nhất 1 Sample để giao việc!');
        return;
      }
      setAutoSplitPreview([{
        id: 'manual-batch',
        name: 'Lô Tùy Chỉnh (Manual)',
        samples: assignmentSamples.filter(s => selectedSamplesForBatch.includes(s.sampleIndex))
      }]);
    } else {
      if (autoSplitPreview.length === 0) {
        alert('Vui lòng Tạo trước danh sách batch trước khi tiếp tục!');
        return;
      }
    }

    // Khởi tạo staffAssignments
    const initAssignments: Record<string, string[]> = {};
    shareUsers.forEach(u => initAssignments[u._id] = []);
    setStaffAssignments(initAssignments);
    setDrawerStep(2);
  };

  const toggleStaffBatch = (staffId: string, batchId: string) => {
    setStaffAssignments(prev => {
      const current = prev[staffId] || [];
      if (current.includes(batchId)) {
        return { ...prev, [staffId]: current.filter(id => id !== batchId) };
      } else {
        return { ...prev, [staffId]: [...current, batchId] };
      }
    });
  };

  const handleBulkAssign = async () => {
    // Check if any assignment is made
    const hasAssignments = Object.values(staffAssignments).some(batches => batches.length > 0);
    if (!hasAssignments) {
      alert('Vui lòng gán ít nhất 1 Batch cho Nhân viên trước khi hoàn tất!');
      return;
    }

    let bulkVersionId: string;
    try {
      bulkVersionId = await ensureDatasetVersionId();
    } catch (e: any) {
      alert('Missing dataset version: ' + (e.message || ''));
      return;
    }

    setIsAssigning(true);
    try {
      // Loop over batches and make API calls
      for (let i = 0; i < autoSplitPreview.length; i++) {
        const batch = autoSplitPreview[i];
        const assignees = Object.keys(staffAssignments).filter(staffId =>
          staffAssignments[staffId].includes(batch.id)
        );

        if (assignees.length > 0) {
          const versionId = bulkVersionId;
          const startIndex = batch.samples.length > 0 ? batch.samples[0].sampleIndex : 0;
          const count = batch.samples.length;
          for (const assigneeId of assignees) {
            const finalBatchName = taskNameInput.trim()
              ? (autoSplitPreview.length > 1 ? `${taskNameInput.trim()} - ${batch.name}` : taskNameInput.trim())
              : batch.name;

            await apiService.assignDatasetVersionRange(versionId, {
              assigneeId,
              startIndex,
              count,
              batchName: finalBatchName,
              priority: taskPriority,
              similarityThreshold: conflictThreshold,
              supervisorId: assignedSupervisorId || undefined
            });
          }
        }
      }

      alert('Đã Giao Việc thành công (Backend Integration)!');
      const [dash, assign] = await Promise.all([
        apiService.getDatasetVersionAssignmentDashboard(bulkVersionId),
        apiService.getDatasetVersionAssignments(bulkVersionId)
      ]);
      setAssignmentDashboard(dash);
      setAssignmentTotals(assign.totals);
      setAssignmentSamples(assign.samples || []);

      setShowCreateTaskModal(false);
    } catch (err) {
      console.error('Error assigning task:', err);
      alert('Có lỗi xảy ra khi giao việc. Vui lòng thử lại.');
    } finally {
      setIsAssigning(false);
    }
    setDrawerStep(1);
  };

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
    .filter(r => selectedGroup3 === null || r.groupId === selectedGroup3)
    .filter(r => r.subGroup === stage3SubGroup);

  const stage3TotalPages = Math.ceil(filteredRows.length / stage3PerPage);
  const stage3PageRows = filteredRows.slice((stage3Page - 1) * stage3PerPage, stage3Page * stage3PerPage);

  const renderedContent = (
    <div className="dataprep-stage2">
      <div className="sub-stepper">
        {SUB_STEPS_STAGE3.map((step, idx) => (
          <React.Fragment key={step.num}>
            <div
              className={`sub-step ${step.num === currentSubStep3 ? 'active' : ''} ${isStepCompleted(step.num) ? 'completed' : ''}`}
              onClick={() => setCurrentSubStep3(step.num)}
            >
              <div className="sub-step-circle">
                {isStepCompleted(step.num) ? <Check size={14} /> : step.num}
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
                {selectedGroup3 !== null
                  ? `Group ${selectedGroup3} — ${filteredRows.length} conversations`
                  : `Showing all ${allConvRows.length} conversations`
                }
              </span>
            </div>

            {/* Bulk Label & Split Toolbar */}
            <div className="preview-toolbar" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="toolbar-label" style={{ fontWeight: 600 }}>Bulk Actions:</span>
              <select
                className="toolbar-select"
                style={{ minWidth: '150px' }}
                value={bulkSubject}
                onChange={e => setBulkSubject(e.target.value)}
              >
                <option value="">-- Select Subject --</option>
                <option value="MATH">MATH</option>
                <option value="CODING">CODING</option>
                <option value="PHYSICS">PHYSICS</option>
                <option value="PHYSICAL">PHYSICAL</option>
                <option value="CHEMISTRY">CHEMISTRY</option>
                <option value="BIOLOGY">BIOLOGY</option>
                <option value="HISTORY">HISTORY</option>
                <option value="LITERATURE">LITERATURE</option>
                <option value="GEOGRAPHY">GEOGRAPHY</option>
                <option value="OTHER">OTHER</option>
                <option value="NOISE">NOISE</option>
                {customSubjectLabels.map(lbl => <option key={lbl} value={lbl}>{lbl}</option>)}
                {pendingAiLabels.map(lbl => <option key={lbl} value={lbl}>{lbl} (Mới)</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Tên môn mới..."
                  value={newSubjectInput}
                  onChange={e => setNewSubjectInput(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', width: '130px', outline: 'none' }}
                />
                <button
                  onClick={() => {
                    if (newSubjectInput.trim() && !customSubjectLabels.includes(newSubjectInput.trim())) {
                      setCustomSubjectLabels(prev => [...prev, newSubjectInput.trim()]);
                      setBulkSubject(newSubjectInput.trim());
                      setNewSubjectInput('');
                    }
                  }}
                  style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center' }}
                  title="Thêm môn học mới vào danh sách"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <button
                onClick={() => {
                  if (!bulkSubject || checkedConvIds.length === 0) return;
                  const selectedGroups = new Set<number>();
                  stage3Convs.forEach(c => {
                    if (checkedConvIds.includes(c.id)) {
                      selectedGroups.add(c.groupId);
                    }
                  });
                  if (selectedGroups.size === 0) return;

                  const newGroupLabels = { ...aiGroupLabels };
                  selectedGroups.forEach(gId => {
                    newGroupLabels[gId] = bulkSubject;
                  });
                  setAiGroupLabels(newGroupLabels);

                  setStage3Convs(prev => prev.map(c =>
                    selectedGroups.has(c.groupId) ? { ...c, groupLabel: bulkSubject } : c
                  ));

                  setCheckedConvIds([]);
                  setBulkSubject('');
                }}
                disabled={!bulkSubject || checkedConvIds.length === 0}
                style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: (!bulkSubject || checkedConvIds.length === 0) ? '#94a3b8' : '#0f172a', color: '#fff', border: 'none', cursor: (!bulkSubject || checkedConvIds.length === 0) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'background 0.15s' }}
              >
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
                              {highlightSearch(conv.messages[0].user, stage3Search)}
                            </div>
                          ) : (
                            /* Đa lượt: Hiển thị chủ đề chính và tóm tắt danh sách lượt thoại */
                            <>
                              <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                <span style={{ fontSize: '14px' }}>Chủ đề:</span>
                                <span style={{ fontSize: '15px', color: '#4f46e5' }}>
                                  {getConversationTopic(conv.messages)}
                                </span>
                              </div>
                              <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                {conv.messages.slice(0, 3).map((msg, idx) => (
                                  <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                    <span style={{ fontWeight: '700', color: '#6366f1', flexShrink: 0 }}>U{idx + 1}:</span>
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
                              {highlightSearch(conv.messages[0].assistant, stage3Search)}
                            </div>
                          ) : (
                            /* Đa lượt: Hiển thị phản hồi chính và tóm tắt danh sách phản hồi */
                            <>
                              <div className="conv-topic-title" style={{ fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'normal' }}>
                                <span style={{ fontSize: '14px' }}>Phản hồi:</span>
                                <span style={{ fontSize: '15px', color: '#0891b2' }}>
                                  {getAssistantSummary(conv.messages)}
                                </span>
                              </div>
                              <div className="conv-turns-list" style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                                {conv.messages.slice(0, 3).map((msg, idx) => (
                                  <div key={idx} style={{ fontSize: '14.5px', display: 'flex', gap: '6px', overflow: 'hidden', lineHeight: '1.5' }}>
                                    <span style={{ fontWeight: '700', color: '#0ea5e9', flexShrink: 0 }}>A{idx + 1}:</span>
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
                            background: (selectedGroup3 === conv.groupId) ? conv.groupBg : '#f1f5f9',
                            color: (selectedGroup3 === conv.groupId) ? conv.groupColor : '#475569',
                            borderColor: (selectedGroup3 === conv.groupId) ? conv.groupColor : '#cbd5e1',
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
                            if (!newLabel) return;

                            let targetGroupId = -2;
                            if (newLabel === 'NOISE') {
                              targetGroupId = -1;
                            } else {
                              const foundEntry = Object.entries(aiGroupLabels).find(([_, label]) => label === newLabel);
                              if (foundEntry) {
                                targetGroupId = Number(foundEntry[0]);
                              }
                            }

                            if (targetGroupId === -2) {
                              const existingIds = stage3Convs.map(c => c.groupId);
                              const newGroupId = existingIds.length > 0 ? Math.max(...existingIds, 0) + 1 : 1;
                              setAiGroupLabels(prev => ({ ...prev, [newGroupId]: newLabel }));
                              setStage3Convs(prev => prev.map(c =>
                                c.id === conv.id ? { ...c, groupId: newGroupId, groupLabel: newLabel } : c
                              ));
                            } else {
                              setStage3Convs(prev => prev.map(c =>
                                c.id === conv.id ? { ...c, groupId: targetGroupId, groupLabel: newLabel } : c
                              ));
                            }
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
              <div className="pipeline-header" style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#6366f1" />
                  Pipeline 2 Bước
                </h3>
              </div>

              {/* Step 1: Phân loại chủ đề */}
              <div className="pipeline-step">
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                  1. Phân loại chủ đề
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="label-model-select"
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
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
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer', opacity: (!clusterRan || isLabelingWithAI) ? 0.6 : 1 }}
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
                          setStage3Convs(prev => prev.map(c =>
                            labelMap[c.groupId] ? { ...c, groupLabel: labelMap[c.groupId] } : c
                          ));
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

                  {/* API Key Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    <input
                      type="checkbox"
                      id="useCustomApi"
                      checked={useCustomApi}
                      onChange={(e) => setUseCustomApi(e.target.checked)}
                    />
                    <label htmlFor="useCustomApi" style={{ fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>Sử dụng API Key cá nhân</label>
                  </div>
                  {useCustomApi && (
                    <input
                      type="password"
                      placeholder="Nhập API Key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', width: '100%', marginTop: '6px' }}
                    />
                  )}
                </div>
              </div>

              {/* Step 2: Lọc nhiễu */}
              <div className="pipeline-step" style={{ marginTop: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
                  2. Lọc nhiễu (Noise Filter)
                </h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                  Loại bỏ các dữ liệu được gán nhãn NOISE ra khỏi tập dữ liệu.
                </div>
                <button
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    if (window.confirm('Bạn có chắc muốn loại bỏ các dữ liệu được đánh dấu là NOISE không?')) {
                      // Demo action
                      setStage3Convs(prev => prev.filter(c => c.groupLabel !== 'NOISE' && c.subject !== 'NOISE'));
                      alert('Đã lọc bỏ các dữ liệu NOISE thành công!');
                    }
                  }}
                >
                  <Trash2 size={14} />
                  Xóa dữ liệu nhiễu (NOISE)
                </button>
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
                      style={{ '--group-accent': '#64748b' } as React.CSSProperties}
                      onClick={() => { setSelectedGroup3(null); setStage3Page(1); }}
                    >
                      <div className="group-card-name" style={{ color: selectedGroup3 === null ? '#0f172a' : '#64748b', fontWeight: 700 }}>All Groups</div>
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
                        style={{ '--group-accent': g.color } as React.CSSProperties}
                        onClick={() => { setSelectedGroup3(g.id); setStage3Page(1); }}
                      >
                        <div className="group-card-name" style={{ color: selectedGroup3 === g.id ? g.color : '#64748b', fontWeight: 700 }}>Group {g.id}</div>
                        <div className="group-card-count">{g.count}</div>
                        <div className="group-card-label">
                          <select
                            className="inline-label-select"
                            style={{
                              color: selectedGroup3 === g.id ? g.color : '#334155',
                              borderColor: selectedGroup3 === g.id ? g.color : '#e2e8f0',
                            }}
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
                      const versionId = await ensureDatasetVersionId();

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
                      const detail = err?.response?.data?.details || err?.response?.data?.error || err.message || 'Unknown error';
                      alert(`Lỗi khi lưu nhãn: ${detail}`);
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
                  <p>{selectedConv3.id} · {selectedConv3.messages.length} messages · <span style={{ color: selectedConv3.groupColor, fontWeight: 700 }}>Group {selectedConv3.groupId} — {aiGroupLabels[selectedConv3.groupId] || selectedConv3.groupLabel}</span></p>
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
            {['ASSIGNED', 'ASSIGNEES', 'IN PROGRESS', 'SUBMITTED', 'SAVED DECISIONS', 'NEEDS REVIEW', 'PUBLISHED'].map(label => {
              let val = 0;
              if (assignmentDashboard?.overview) {
                const ov = assignmentDashboard.overview;
                if (label === 'ASSIGNED') val = ov.totalAssignedSamples;
                if (label === 'ASSIGNEES') val = ov.totalAssignees;
                if (label === 'IN PROGRESS') val = ov.inProgressAssignees;
                if (label === 'SUBMITTED') val = ov.submittedAssignees;
                if (label === 'SAVED DECISIONS') val = ov.savedDecisionCount;
                if (label === 'NEEDS REVIEW') val = ov.pendingConflicts;
                if (label === 'PUBLISHED') val = ov.publishedDecisionCount;
              }
              return (
                <div key={label} className="sa-status-card">
                  <span className="sa-status-label">{label}</span>
                  <span className="sa-status-value">{isFetchingDashboard ? '...' : val}</span>
                </div>
              );
            })}
          </div>

          <div className="sa-main-layout">
            {/* Left Content */}
            <div className="sa-left">
              {/* Task Allocation */}
              <div className="sa-section-card">
                <div className="sa-section-header">
                  <div>
                    <h4>Phân bổ Batch giao việc</h4>
                    <p>Chia nhỏ tập dữ liệu thành các batch (batch) để giao cho nhân sự gán nhãn.</p>
                  </div>
                  <button className="sa-create-task-btn" onClick={() => {
                    setSelectedSamplesForBatch([]);
                    setShowCreateTaskModal(true);
                  }}><Plus size={14} /> Tạo Batch mới</button>
                </div>

                <div className="sa-alloc-cards">
                  <div className="sa-alloc-card">
                    <span className="sa-alloc-label">Total Samples</span>
                    <span className="sa-alloc-value sa-dark">{isFetchingDashboard ? '...' : (assignmentTotals?.totalSamples || stage3Convs.length)}</span>
                  </div>
                  <div className="sa-alloc-card sa-alloc-green">
                    <span className="sa-alloc-label sa-green-text">Assigned</span>
                    <span className="sa-alloc-value sa-green-text">{isFetchingDashboard ? '...' : (assignmentTotals?.assigned || 0)}</span>
                  </div>
                  <div className="sa-alloc-card sa-alloc-orange">
                    <span className="sa-alloc-label sa-orange-text">Unassigned</span>
                    <span className="sa-alloc-value sa-orange-text">{isFetchingDashboard ? '...' : (assignmentTotals?.unassigned || 0)}</span>
                  </div>
                </div>

                <h5 className="sa-sub-title">Các Batch đang hoạt động (Active Batches)</h5>
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
                      {isFetchingDashboard ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={16} className="animate-spin inline mr-2" /> Loading...</td></tr>
                      ) : assignmentDashboard?.users && assignmentDashboard.users.length > 0 ? (
                        assignmentDashboard.users.map((u: any, i: number) => (
                          <tr key={i}>
                            <td><span className="sa-link">{u.submission?.name || `Batch ${i + 1}`}</span></td>
                            <td>{u.user.name || u.user.username}</td>
                            <td>{u.assignedSamples} samples assigned</td>
                            <td className="sa-date">-</td>
                            <td>
                              {u.submission?.status === 'submitted'
                                ? <span className="sa-badge-published">Submitted</span>
                                : <span className="sa-badge-pending">Pending</span>}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Không có Batch nào đang hoạt động</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Samples */}
              <div className="sa-section-card">
                <h4 className="sa-section-title">Samples</h4>
                {/* Samples Pagination */}
                {!isFetchingDashboard && assignmentSamples && assignmentSamples.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Rows per page:</span>
                      <select
                        className="sa-select"
                        value={samplesPerPage}
                        onChange={(e) => {
                          setSamplesPerPage(Number(e.target.value));
                          setSamplesPage(1);
                        }}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px' }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                      </select>
                    </div>
                    <div className="preview-pagination" style={{ marginTop: 0 }}>
                      <button
                        className="pagination-arrow"
                        disabled={samplesPage <= 1}
                        onClick={() => setSamplesPage(samplesPage - 1)}
                      >‹</button>
                      {getPageNumbers(samplesPage, Math.ceil(assignmentSamples.length / samplesPerPage)).map((page, idx) =>
                        page === '...' ? (
                          <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                        ) : (
                          <button
                            key={page}
                            className={`pagination-page-btn ${page === samplesPage ? 'active' : ''}`}
                            onClick={() => setSamplesPage(Number(page))}
                          >
                            {page}
                          </button>
                        )
                      )}
                      <button
                        className="pagination-arrow"
                        disabled={samplesPage >= Math.ceil(assignmentSamples.length / samplesPerPage)}
                        onClick={() => setSamplesPage(samplesPage + 1)}
                      >›</button>
                    </div>
                  </div>
                )}
                <div className="sa-tasks-table-wrap">
                  <table className="sa-tasks-table sa-samples-table">
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}>ID</th>
                        <th style={{ width: '65%' }}>SAMPLE KEY & CONTENT</th>
                        <th style={{ width: '30%' }}>ASSIGNEES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isFetchingDashboard ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}><Loader2 size={16} className="animate-spin inline mr-2" /> Loading...</td></tr>
                      ) : assignmentSamples && assignmentSamples.length > 0 ? (
                        assignmentSamples.slice((samplesPage - 1) * samplesPerPage, samplesPage * samplesPerPage).map((s, idx) => (
                          <tr key={idx}>
                            <td className="sa-id-cell">#{s.sampleIndex}</td>
                            <td>
                              <div className="sa-sample-key">
                                <span className="sa-conv-name">{s.sampleKey}</span>
                                {s.hasConflict && <span className="sa-conflict-badge">⊘ Conflict</span>}
                              </div>
                              <div className="sa-sample-content">{truncateText(s.preview, 100)}</div>
                              <div className="sa-sample-meta">
                                {s.lowestAgreementScore !== null && `IAA ${s.lowestAgreementScore?.toFixed(2)}`}
                                {s.pendingAdjudicationCount ? ` · ${s.pendingAdjudicationCount} pending adjudication` : ''}
                              </div>
                            </td>
                            <td>
                              {s.assignees && s.assignees.length > 0 ? (
                                s.assignees.map((u: any, j: number) => (
                                  <React.Fragment key={j}>
                                    <div className="sa-assignee">{u.name || u.username}</div>
                                    <div className="sa-assignee-email">@{u.username}</div>
                                  </React.Fragment>
                                ))
                              ) : (
                                <span className="sa-unassigned-tag">Unassigned</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No samples available</td></tr>
                      )}
                    </tbody>
                  </table>
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
                  <button className="ia-add-label-btn">Thêm Nhãn</button>
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

              {/* Result Pipeline & Export */}
              <div className="ia-section-card" style={{ marginTop: '16px', borderTop: '2px dashed #e2e8f0', paddingTop: '16px' }}>
                <h5 className="ia-section-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> KẾT QUẢ & EXPORT
                </h5>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', lineHeight: '1.5' }}>
                  Export kết quả gán nhãn ra file hoặc chuyển tiếp sang giai đoạn Training/Evaluation.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    style={{ padding: '8px 12px', borderRadius: '6px', background: '#3b82f6', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '13px' }}
                    onClick={async () => {
                      try {
                        const versionId = localStorage.getItem('current_version_id');
                        if (!versionId) return alert('Không tìm thấy Version ID');

                        // Demo
                        alert(`Đang lấy dữ liệu từ /dataprep/export/${versionId} và tải xuống...`);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    <Download size={16} />
                    Export Data (JSON)
                  </button>

                  <button
                    style={{ padding: '8px 12px', borderRadius: '6px', background: '#10b981', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '13px' }}
                    onClick={() => {
                      if (window.confirm('Bạn có chắc chắn muốn đẩy batch dữ liệu này sang Stage 4 (Training/Evaluation)?')) {
                        alert('Đã đẩy dữ liệu thành công!');
                        setCurrentSubStep4(7);
                        setCurrentStage(4);
                      }
                    }}
                  >
                    <ArrowRight size={16} />
                    Đẩy sang Stage 4
                  </button>
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
            setConversationsList(stage3Convs);
            setCurrentSubStep4(7);
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



      {/* Create Labeling Task Drawer — Refactored: Staff-First Flow */}
      {showCreateTaskModal && (
        <div className="ct-drawer-overlay" onClick={() => setShowCreateTaskModal(false)}>
          <div className="ct-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="ct-drawer-header" style={{ flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <h2>{drawerStep === 1 ? 'Bước 1: Chọn Nhân viên' : 'Bước 2: Cấu hình & Xác nhận'}</h2>
                  <p>{drawerStep === 1
                    ? 'Chọn nhân viên sẽ tham gia gán nhãn. Hệ thống sẽ tự động chia đều dữ liệu.'
                    : 'Cấu hình tên Task, mức ưu tiên và xem preview phân bổ.'}</p>
                </div>
                <button className="ct-drawer-close" onClick={() => setShowCreateTaskModal(false)}><X size={20} /></button>
              </div>
              {/* Step indicators */}
              <div className="ct-drawer-tabs">
                <button
                  className={`ct-drawer-tab ${drawerStep === 1 ? 'active' : ''}`}
                  onClick={() => setDrawerStep(1)}
                  style={drawerStep > 1 ? { opacity: 0.7 } : {}}
                >
                  <Users size={14} style={{ marginRight: '6px' }} />
                  1. Chọn Nhân viên
                </button>
                <button
                  className={`ct-drawer-tab ${drawerStep === 2 ? 'active' : ''}`}
                  style={{ pointerEvents: 'none' }}
                >
                  <Check size={14} style={{ marginRight: '6px' }} />
                  2. Xác nhận & Giao việc
                </button>
              </div>
            </div>

            {drawerStep === 1 ? (
              <>
                {/* Step 1: Staff Selection */}
                <div className="ct-drawer-body" style={{ flexDirection: 'column', padding: '24px' }}>
                  {/* Summary info */}
                  <div style={{
                    display: 'flex', gap: '16px', marginBottom: '20px', padding: '14px 16px',
                    background: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd',
                    alignItems: 'center'
                  }}>
                    <Database size={18} style={{ color: '#0284c7' }} />
                    <div>
                      <span style={{ fontWeight: 700, color: '#0c4a6e' }}>Tổng dữ liệu: </span>
                      <span style={{ fontWeight: 700, fontSize: '16px', color: '#0284c7' }}>
                        {assignmentSamples.length} samples
                      </span>
                      <span style={{ color: '#64748b', marginLeft: '12px', fontSize: '13px' }}>
                        sẽ được chia đều cho các nhân viên được chọn
                      </span>
                    </div>
                  </div>

                  {/* Staff search + Workload filter */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px', flex: 1,
                      padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px',
                      background: '#f8fafc'
                    }}>
                      <Search size={16} style={{ color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Tìm theo tên hoặc email..."
                        value={stage3Search}
                        onChange={e => setStage3Search(e.target.value)}
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: '14px', background: 'transparent', color: '#334155' }}
                      />
                    </div>
                    <select
                      value={workloadFilter}
                      onChange={e => setWorkloadFilter(e.target.value as any)}
                      style={{
                        padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px',
                        background: '#f8fafc', fontSize: '13px', fontWeight: 600, color: '#334155',
                        cursor: 'pointer', minWidth: '170px'
                      }}
                    >
                      <option value="all">Tất cả</option>
                      <option value="free">🟢 Rảnh rỗi (&lt; 100 câu)</option>
                      <option value="busy">🟡 Đang bận (100-500)</option>
                      <option value="overloaded">🔴 Quá tải (&gt; 500)</option>
                    </select>
                  </div>

                  {/* Staff list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                    {isFetchingDashboard ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        <Loader2 size={20} className="animate-spin" style={{ display: 'inline', marginRight: '8px' }} />
                        Đang tải danh sách nhân viên...
                      </div>
                    ) : (
                      shareUsers
                        .filter((u: any) => {
                          // Text search filter
                          if (stage3Search.trim()) {
                            const q = stage3Search.toLowerCase();
                            if (!(u.name || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false;
                          }
                          // Workload filter
                          const rem = u.remainingSamples || 0;
                          if (workloadFilter === 'free') return rem < 100;
                          if (workloadFilter === 'busy') return rem >= 100 && rem <= 500;
                          if (workloadFilter === 'overloaded') return rem > 500;
                          return true;
                        })
                        .map((user: any) => {
                          const staffSelected = (staffAssignments['__selected__'] || []).includes(user._id);
                          const rem = user.remainingSamples || 0;
                          const total = user.totalAssigned || 0;
                          const labeled = user.labeledSoFar || 0;
                          const tasks = user.pendingTasks || 0;
                          const pct = total > 0 ? Math.round((labeled / total) * 100) : 0;

                          // Dynamic badge
                          let badgeLabel = '', badgeBg = '', badgeColor = '', badgeEmoji = '';
                          if (rem < 100) {
                            badgeLabel = `Rảnh rỗi`; badgeBg = '#dcfce7'; badgeColor = '#16a34a'; badgeEmoji = '🟢';
                          } else if (rem <= 500) {
                            badgeLabel = `Đang bận`; badgeBg = '#fef3c7'; badgeColor = '#d97706'; badgeEmoji = '🟡';
                          } else {
                            badgeLabel = `Quá tải`; badgeBg = '#fee2e2'; badgeColor = '#dc2626'; badgeEmoji = '🔴';
                          }

                          return (
                            <div
                              key={user._id}
                              onClick={() => {
                                setStaffAssignments(prev => {
                                  const current = prev['__selected__'] || [];
                                  if (current.includes(user._id)) {
                                    return { ...prev, '__selected__': current.filter((id: string) => id !== user._id) };
                                  } else {
                                    return { ...prev, '__selected__': [...current, user._id] };
                                  }
                                });
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '14px 16px', border: `2px solid ${staffSelected ? '#6366f1' : '#e5e7eb'}`,
                                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s',
                                background: staffSelected ? '#eef2ff' : '#fff'
                              }}
                              title={`Đang giữ ${tasks} luồng công việc. Tiến độ tổng: ${labeled}/${total} câu (${pct}%)`}
                            >
                              <input type="checkbox" checked={staffSelected} readOnly
                                style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }} />
                              <div style={{
                                width: '38px', height: '38px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '14px', flexShrink: 0
                              }}>
                                {(user.name || 'U').split(' ').pop()?.[0] || 'U'}
                              </div>
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{user.name || user.username}</span>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{user.email}</span>
                                {total > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                    <div style={{ flex: 1, height: '4px', background: '#e5e7eb', borderRadius: '2px', maxWidth: '120px' }}>
                                      <div style={{ height: '100%', width: `${pct}%`, background: '#6366f1', borderRadius: '2px', transition: 'width 0.3s' }} />
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{labeled}/{total} ({pct}%)</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <span style={{
                                  fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
                                  background: badgeBg, color: badgeColor
                                }}>
                                  {badgeEmoji} {badgeLabel}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                  Còn {rem} câu chờ
                                </span>
                              </div>
                            </div>
                          );
                        })
                    )}
                    {!isFetchingDashboard && shareUsers.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                        Không tìm thấy nhân viên nào. Hãy thêm Staff trong quản lý User.
                      </div>
                    )}
                  </div>

                  {/* Overlap Config */}
                  {(staffAssignments['__selected__'] || []).length >= 2 && (
                    <div style={{
                      marginTop: '12px', border: '1px solid #e0e7ff', borderRadius: '10px',
                      background: 'linear-gradient(135deg, #f5f3ff, #eef2ff)', overflow: 'hidden'
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                        background: 'rgba(99, 102, 241, 0.08)', borderBottom: '1px solid #e0e7ff',
                        fontWeight: 600, fontSize: '13px', color: '#4f46e5'
                      }}>
                        <Layers size={16} />
                        <span>Gán trùng lặp (Overlap)</span>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <label style={{ fontSize: '13px', color: '#475569', whiteSpace: 'nowrap' }}>Số người cùng gán 1 lô:</label>
                          <select
                            value={overlapCount}
                            onChange={e => setOverlapCount(Number(e.target.value))}
                            style={{
                              flex: 1, maxWidth: '200px', padding: '8px 12px', border: '1px solid #d1d5db',
                              borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: '#fff'
                            }}
                          >
                            {(() => {
                              const M = (staffAssignments['__selected__'] || []).length;
                              const values: number[] = [];
                              for (let i = 1; i <= M; i++) { values.push(i); }
                              return values.map(v => (
                                <option key={v} value={v}>
                                  {v === 1 ? '1 (Không trùng lặp)' : `${v} người/nhóm`}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                        {overlapCount > 1 && (() => {
                          const M = (staffAssignments['__selected__'] || []).length;
                          const groups = Math.ceil(M / overlapCount);
                          const perGroup = Math.floor(assignmentSamples.length / groups);
                          return (
                            <div style={{ marginTop: '10px' }}>
                              <span style={{
                                display: 'inline-block', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500
                              }}>
                                📊 {groups} nhóm × {overlapCount} người — mỗi nhóm cùng gán {perGroup} câu giống nhau
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Selected count */}
                  <div style={{ marginTop: '16px', fontSize: '13px', color: '#64748b', textAlign: 'right' }}>
                    Đã chọn: <strong style={{ color: '#6366f1' }}>{(staffAssignments['__selected__'] || []).length}</strong> nhân viên
                    {overlapCount > 1 && (
                      <span style={{ marginLeft: 8, color: '#8b5cf6' }}>
                        • Overlap: <strong>{overlapCount}</strong> người/nhóm
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Step 1 */}
                <div className="ct-drawer-footer">
                  <button className="ct-btn-cancel" onClick={() => setShowCreateTaskModal(false)}>
                    Hủy (Cancel)
                  </button>
                  <button
                    className="ct-btn-create"
                    style={{
                      padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none',
                      borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
                      opacity: (staffAssignments['__selected__'] || []).length === 0 ? 0.5 : 1,
                      cursor: (staffAssignments['__selected__'] || []).length === 0 ? 'not-allowed' : 'pointer'
                    }}
                    disabled={(staffAssignments['__selected__'] || []).length === 0}
                    onClick={() => setDrawerStep(2)}
                  >
                    Tiếp tục: Xác nhận <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              /* Step 2: Config & Confirm */
              <>
                <div className="ct-wizard-step2" style={{ padding: '24px', overflowY: 'auto', flex: 1, gap: '24px' }}>
                  <div className="ct-wizard-config" style={{ flex: '0 0 320px', background: 'transparent', border: 'none', padding: 0 }}>
                    <div className="ct-form-group">
                      <label>Tên Task (Tùy chọn)</label>
                      <input
                        type="text"
                        className="ct-input"
                        placeholder="Nhập tên chung cho Task..."
                        value={taskNameInput}
                        onChange={(e) => setTaskNameInput(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div className="ct-form-group">
                        <label>Mức độ ưu tiên</label>
                        <select
                          className="ct-select"
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value)}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      <div className="ct-form-group">
                        <label><Calendar size={14} style={{ marginRight: '4px' }} /> Hạn chót</label>
                        <input type="date" className="ct-input" />
                      </div>
                    </div>

                    <div className="ct-form-group">
                      <label>Supervisor phụ trách</label>
                      <select 
                        className="ct-select"
                        value={assignedSupervisorId}
                        onChange={e => setAssignedSupervisorId(e.target.value)}
                      >
                        <option value="">Admin tự phân giải (mặc định)</option>
                        {supervisors.map(u => (
                          <option key={u._id} value={u._id}>{u.name || u.email || 'Supervisor'}</option>
                        ))}
                      </select>
                    </div>

                    <div className="ct-form-group" style={{ marginTop: '14px' }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Ngưỡng cảnh báo Conflict (Similarity)</span>
                        <span style={{ fontWeight: 600 }}>{Math.round(conflictThreshold * 100)}%</span>
                      </label>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={conflictThreshold}
                        onChange={(e) => setConflictThreshold(Number(e.target.value))}
                        style={{ width: '100%', marginTop: '8px', cursor: 'pointer' }}
                      />
                      <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                        Nếu độ tương đồng nhãn của 2 nhân viên thấp hơn mức này, hệ thống sẽ báo Xung đột.
                      </small>
                    </div>
                  </div>

                  {/* Distribution Preview */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f8fafc, #eef2ff)', border: '1px solid #c7d2fe',
                    borderRadius: '14px', padding: '20px', marginTop: '20px'
                  }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#4338ca', margin: '0 0 4px 0' }}>
                      📊 Phân bổ {overlapCount > 1 ? `(Overlap ${overlapCount} người/nhóm)` : 'tự động'}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>
                      {assignmentSamples.length} samples ÷ {(staffAssignments['__selected__'] || []).length} nhân viên
                      {overlapCount > 1 && ` (${Math.ceil((staffAssignments['__selected__'] || []).length / overlapCount)} nhóm × tối đa ${overlapCount} người)`}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        const selectedIds = staffAssignments['__selected__'] || [];
                        const N = assignmentSamples.length;
                        const M = selectedIds.length;
                        if (M === 0) return null;
                        const K = overlapCount;
                        const numberOfGroups = Math.ceil(M / K);
                        const perGroup = Math.floor(N / numberOfGroups);
                        const remainder = N % numberOfGroups;
                        let sampleCursor = 1;

                        if (K > 1) {
                          // Grouped display
                          return Array.from({ length: numberOfGroups }).map((_, gIdx) => {
                            const chunkSize = perGroup + (gIdx < remainder ? 1 : 0);
                            const staffStart = gIdx * K;
                            const groupStaffIds = selectedIds.slice(staffStart, Math.min(staffStart + K, M));
                            const range = `#${sampleCursor}–${sampleCursor + chunkSize - 1}`;
                            const startIdx = sampleCursor;
                            sampleCursor += chunkSize;
                            return (
                              <div key={gIdx} style={{
                                border: '1px solid #e0e7ff', borderRadius: '10px', overflow: 'hidden',
                                background: '#fafafe', marginBottom: '4px'
                              }}>
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.06))',
                                  borderBottom: '1px solid #e0e7ff', fontSize: '12px', fontWeight: 600, color: '#4f46e5'
                                }}>
                                  <Layers size={14} />
                                  <span>Nhóm {gIdx + 1} — Câu {range} ({chunkSize} samples)</span>
                                </div>
                                {groupStaffIds.map((staffId: string) => {
                                  const user = shareUsers.find((u: any) => u._id === staffId);
                                  return (
                                    <div key={staffId} style={{
                                      display: 'flex', alignItems: 'center', gap: '12px',
                                      padding: '8px 14px 8px 28px', borderBottom: '1px solid #f1f5f9'
                                    }}>
                                      <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: '12px', flexShrink: 0
                                      }}>
                                        {(user?.name || 'U').split(' ').pop()?.[0] || 'U'}
                                      </div>
                                      <span style={{ flex: 1, fontWeight: 600, fontSize: '13px', color: '#334155' }}>
                                        {user?.name || staffId}
                                      </span>
                                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#6366f1' }}>
                                        {chunkSize} samples
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          });
                        }

                        // Normal (no overlap) display
                        return selectedIds.map((staffId: string, i: number) => {
                          const user = shareUsers.find((u: any) => u._id === staffId);
                          const count = perGroup + (i < remainder ? 1 : 0);
                          const range = `#${sampleCursor}–${sampleCursor + count - 1}`;
                          sampleCursor += count;
                          return (
                            <div key={staffId} style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '10px 14px', background: '#fff', borderRadius: '10px',
                              border: '1px solid #e5e7eb'
                            }}>
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '13px', flexShrink: 0
                              }}>
                                {(user?.name || 'U').split(' ').pop()?.[0] || 'U'}
                              </div>
                              <span style={{ flex: 1, fontWeight: 600, fontSize: '14px', color: '#334155' }}>
                                {user?.name || staffId}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '14px', color: '#6366f1' }}>
                                {count} samples
                              </span>
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{range}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>

                {/* Footer Step 2 */}
                <div className="ct-drawer-footer" style={{ justifyContent: 'space-between' }}>
                  <button
                    className="ct-btn-cancel"
                    style={{ padding: '10px 16px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                    onClick={() => setDrawerStep(1)}
                  >
                    <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Quay lại Bước 1
                  </button>
                  <button
                    className="ct-btn-create"
                    style={{ padding: '10px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                    disabled={isAssigning}
                    onClick={async () => {
                      const selectedIds = staffAssignments['__selected__'] || [];
                      if (selectedIds.length === 0) return;
                      let versionId: string;
                      try { versionId = await ensureDatasetVersionId(); } catch (e: any) { alert('Missing dataset version: ' + (e.message || '')); return; }

                      setIsAssigning(true);
                      try {
                        await apiService.post(`/dataprep/versions/${versionId}/assignments/auto-assign`, {
                          assigneeIds: selectedIds,
                          taskName: taskNameInput.trim() || 'Labeling Task',
                          priority: taskPriority,
                          overlapCount,
                          supervisorId: assignedSupervisorId || undefined
                        });

                        alert('Đã Giao Việc thành công!');
                        // Refresh dashboard
                        const [dash, assign] = await Promise.all([
                          apiService.getDatasetVersionAssignmentDashboard(versionId),
                          apiService.getDatasetVersionAssignments(versionId)
                        ]);
                        setAssignmentDashboard(dash);
                        setAssignmentTotals(assign.totals);
                        setAssignmentSamples(assign.samples || []);
                        setShowCreateTaskModal(false);
                        setDrawerStep(1);
                        setStaffAssignments({});
                      } catch (err: any) {
                        console.error('Error assigning task:', err);
                        alert(err?.response?.data?.error || err.message || 'Có lỗi xảy ra khi giao việc.');
                      } finally {
                        setIsAssigning(false);
                      }
                    }}
                  >
                    {isAssigning ? (
                      <><Loader2 size={16} className="animate-spin" /> Đang giao việc...</>
                    ) : (
                      <><Check size={16} /> 🚀 Hoàn tất & Giao việc</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Stage3Labeling;
