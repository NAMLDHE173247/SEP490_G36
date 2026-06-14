import React from 'react';
import { Loader2, CheckCircle, ChevronDown, ChevronRight, X, Play, RefreshCw, Eye, ExternalLink, Settings, Download, Trash2, Edit2, Check, ArrowRight, AlertTriangle, User, Bot, Info, FileText, Search, RotateCcw, Zap, Inbox, MousePointer2, MessageSquare, Award, BookOpen, Sparkles, BarChart2, Pencil, Ban, Upload } from 'lucide-react';

export const Stage4Labeling = ({SUB_STEPS_STAGE4,
  balancedQuality,
  balancedSubject,
  bulkAssignStaff,
  classPage,
  completedRewrites,
  currentSubStep4,
  handleAdjudicateQuality,
  handleExportDataset,
  handleStartScoring,
  isStage4Loading,
  judgeModels,
  latestJob,
  name,
  qualityResult,
  qualityTab,
  reassignStaff,
  refreshData,
  results,
  reviewDetailModal,
  rewriteConvIdx,
  rewriteTextContent,
  selectedRewriteIds,
  sepBalanceApplied,
  sepQualityLabels,
  sepQualityRatings,
  sepRewriteDecision,
  sepRunningEval,
  sepSelectedDistQuality,
  sepSelectedDistSubject,
  sepSelectedError,
  sepSubjectFilter,
  setBalancedQuality,
  setBalancedSubject,
  setBulkAssignStaff,
  setCompletedRewrites,
  setCurrentStage,
  setCurrentSubStep4,
  setCurrentSubStep5,
  setJudgeModels,
  setQualityTab,
  setReassignStaff,
  setReviewDetailModal,
  setRewriteConvIdx,
  setRewriteTextContent,
  setSelectedRewriteIds,
  setStage4StaffReady,
  stage4Error,
  statistics,
  status}: any) => {
  
    // --- HELPER FUNCTIONS FOR BACKEND INTEGRATION ---
    const getSeededSubject = (sampleId: string) => {
      const num = parseInt(sampleId.replace('conv_', '').replace('sample_', ''));
      if (isNaN(num)) return 'MATH';
      const subjects = ['MATH', 'PHYSICAL', 'CHEMISTRY', 'BIOLOGY', 'LITERATURE'];
      return subjects[(num - 1) % subjects.length];
    };

    const mapBackendMessagesToUiMessages = (messages: any[]): any[] => {
      if (!Array.isArray(messages)) return [];
      return messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        text: msg.content || ''
      }));
    };

    const getScoresForSample = (sampleId: string) => {
      const resMatch = results.find(r => r.sampleId === sampleId || r.sampleIdRef?.sampleId === sampleId);
      if (resMatch) {
        return {
          gemini: resMatch.scores?.gemini || resMatch.scores?.Gemini || null,
          deepseek: resMatch.scores?.deepseek || resMatch.scores?.Deepseek || null,
          openai: resMatch.scores?.openai || resMatch.scores?.OpenAI || null,
          human: resMatch.scores?.human || resMatch.scores?.Human || null,
          conflict: resMatch.recommendation === 'Conflict' || resMatch.diff >= 2.0
        };
      }
      const item = qualityResult?.items?.find(i => i.sampleId === sampleId);
      return {
        gemini: item?.score || null,
        deepseek: null,
        openai: null,
        human: item?.score || null,
        conflict: false
      };
    };

    const getAvgAI = (scores) => {
      const vals = [scores.gemini, scores.deepseek, scores.openai].filter(v => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    const displayQualityItems = qualityResult?.items ? qualityResult.items.map(item => ({
      id: item._id,
      convId: item.sampleId,
      subject: getSeededSubject(item.sampleId),
      bucket: item.bucket,
      score: item.score,
      issue: item.conflict ? 'Conflict' : 'None',
      issueKey: item.conflict ? 'conflict' : 'none',
      reason: item.note || 'No special issues flagged.',
      errorMessageIndex: 1, // Defaulting to first assistant turn
      messages: mapBackendMessagesToUiMessages(item.data?.messages || []),
      rawItem: item
    })) : [];

    const getQualityLabel = (item) => sepQualityLabels[item.id] || (item.bucket === 'Reject' ? 'Bad' : item.bucket);
    const qualityClass = (label) => label === 'Bad' ? 'bad' : label.toLowerCase();

    const baseSubjects = sepBalanceApplied ? [
      { group: 'MATH', label: 'Math', count: 300, percentage: 42, color: '#6366f1' },
      { group: 'PHYSICAL', label: 'Physics', count: 280, percentage: 40, color: '#06b6d4' },
      { group: 'CHEMISTRY', label: 'Chemistry', count: 290, percentage: 41, color: '#10b981' },
      { group: 'BIOLOGY', label: 'Biology', count: 275, percentage: 39, color: '#f59e0b' },
      { group: 'HISTORY', label: 'History', count: 285, percentage: 40, color: '#ef4444' },
      { group: 'GEOGRAPHY', label: 'Geography', count: 270, percentage: 38, color: '#ec4899' },
      { group: 'LITERATURE', label: 'Literature', count: 295, percentage: 41, color: '#8b5cf6' },
    ] : [
      { group: 'MATH', label: 'Math', count: 450, percentage: 85, color: '#6366f1' },
      { group: 'PHYSICAL', label: 'Physics', count: 300, percentage: 70, color: '#06b6d4' },
      { group: 'CHEMISTRY', label: 'Chemistry', count: 200, percentage: 55, color: '#10b981' },
      { group: 'BIOLOGY', label: 'Biology', count: 150, percentage: 40, color: '#f59e0b' },
      { group: 'HISTORY', label: 'History', count: 100, percentage: 20, color: '#ef4444' },
      { group: 'GEOGRAPHY', label: 'Geography', count: 80, percentage: 18, color: '#ec4899' },
      { group: 'LITERATURE', label: 'Literature', count: 320, percentage: 65, color: '#8b5cf6' },
    ];

    const subjectTotal = baseSubjects.reduce((sum, item) => sum + item.count, 0);

    const subjectGroups = [
      { group: 'ALL', label: 'All', count: subjectTotal, percentage: 100, color: '#64748b' },
      ...baseSubjects
    ];

    const conversations = [
      {
        id: 'conv_428051',
        subject: 'MATH',
        messages: [
          { role: 'user', text: 'Em khong hieu dao ham cua x^2 tinh the nao a?' },
          { role: 'assistant', text: 'Dao ham cua x^2 la 2x.' },
          { role: 'user', text: 'Vi sao lai la 2x a?' },
          { role: 'assistant', text: 'Em thu nho lai cong thuc dao ham cua x^n: n*x^(n-1). Neu n = 2 thi em thay ket qua la gi?' },
        ],
      },
      {
        id: 'conv_42D67D',
        subject: 'PHYSICAL',
        messages: [
          { role: 'user', text: 'Luc ma sat la gi a?' },
          { role: 'assistant', text: 'Truoc het em thu nghi vi sao xe phanh lai dung duoc tren mat duong?' },
          { role: 'user', text: 'Yes le vi banh xe bi mat duong can lai?' },
          { role: 'assistant', text: 'Dung huong roi. Luc can do chinh la luc ma sat, no xuat hien khi hai be mat tiep xuc va can tro chuyen dong.' },
        ],
      },
      {
        id: 'conv_42DE5T',
        subject: 'HISTORY',
        messages: [
          { role: 'user', text: 'Cho em dap an luon di, em dang voi.' },
          { role: 'assistant', text: 'Dap an la 1939, em ghi vao bai nhe.' },
        ],
      },
    ];

    const visibleConversations = sepSubjectFilter === 'ALL'
      ? conversations
      : conversations.filter((item) => item.subject === sepSubjectFilter);
    const activeConversation = visibleConversations[(classPage - 1) % Math.max(visibleConversations.length, 1)] || conversations[0];

    const baseQualitySamples = [
      {
        id: 'sample_428051',
        convId: 'conv_428051',
        subject: 'MATH',
        bucket: 'Rewrite',
        score: 4.3,
        issueKey: 'direct-answer',
        issue: 'Direct answer too early',
        errorMessageIndex: 1,
        reason: 'Assistant gave "2x" immediately before checking whether the learner remembered the derivative rule.',
        messages: conversations[0].messages,
      },
      {
        id: 'sample_42D67D',
        convId: 'conv_42D67D',
        subject: 'PHYSICAL',
        bucket: 'Gold',
        score: 9.1,
        issueKey: 'none',
        issue: 'No critical issue',
        errorMessageIndex: null,
        reason: 'Good Socratic framing, uses a familiar braking example before defining friction.',
        messages: conversations[1].messages,
      },
      {
        id: 'sample_42DE5T',
        convId: 'conv_42DE5T',
        subject: 'HISTORY',
        bucket: 'Reject',
        score: 2.1,
        issueKey: 'low-training-value',
        issue: 'Direct answer and low training value',
        errorMessageIndex: 1,
        reason: 'The reply gives the final answer directly and does not guide the learner.',
        messages: conversations[2].messages,
      },
    ];

    const qualityDistribution = [
      { label: 'Gold', count: 8, tone: 'emerald', summary: 'Ready for training with strong Socratic guidance.' },
      { label: 'Rewrite', count: 9, tone: 'amber', summary: 'Needs tutor reply rewrite before evaluation.' },
      { label: 'Bad', count: 3, tone: 'rose', summary: 'Reject or send to supervisor because quality is too low.' },
      { label: 'Incomplete', count: 0, tone: 'slate', summary: 'Missing turns or incomplete context.' },
    ];

    const qualitySamples = Array.from({ length: 20 }, (_, idx) => {
      const source = baseQualitySamples[idx % baseQualitySamples.length];
      const cycle = Math.floor(idx / baseQualitySamples.length);
      const bucket = idx < 8 ? 'Gold' : idx < 17 ? 'Rewrite' : 'Reject';
      const issueKey = bucket === 'Gold' ? 'none' : idx % 2 === 0 ? 'direct-answer' : 'low-training-value';
      return {
        ...source,
        id: `${source.id}_${idx + 1}`,
        convId: `${source.convId}_${idx + 1}`,
        subject: baseSubjects[idx % baseSubjects.length].group,
        bucket,
        score: bucket === 'Gold' ? 8.6 + (idx % 3) * 0.2 : bucket === 'Rewrite' ? 4.1 + (idx % 5) * 0.35 : 2.0 + (idx % 3) * 0.25,
        issueKey,
        issue: bucket === 'Gold'
          ? 'No critical issue'
          : issueKey === 'direct-answer'
            ? 'Direct answer too early'
            : 'Low training value',
        errorMessageIndex: bucket === 'Gold' ? null : 1,
        reason: bucket === 'Gold'
          ? 'Good Socratic guidance and usable for training.'
          : issueKey === 'direct-answer'
            ? 'Assistant answers too directly before checking learner understanding.'
            : 'The response does not guide the learner enough for training.',
        messages: source.messages.map((msg, msgIdx) => ({
          ...msg,
          text: cycle === 0 ? msg.text : `${msg.text} (${baseSubjects[idx % baseSubjects.length].label} sample ${idx + 1}.${msgIdx + 1})`,
        })),
      };
    });

    const filteredQualitySamples = qualitySamples.filter((item) => {
      const itemLabel = getQualityLabel(item);
      const labelLower = itemLabel.toLowerCase();
      const tabLower = qualityTab.toLowerCase();
      const bucketOk = tabLower === 'all' ||
                       labelLower === tabLower ||
                       (tabLower === 'gold' && labelLower === 'good') ||
                       (tabLower === 'good' && labelLower === 'gold');
      const errorOk = !sepSelectedError || item.issueKey === sepSelectedError;
      return bucketOk && errorOk;
    });

    // subjectTotal computed earlier
    const qualityTotal = qualityDistribution.reduce((sum, item) => sum + item.count, 0);
    const selectedSubject = subjectGroups.find((item) => item.group === sepSelectedDistSubject) || subjectGroups[0];
    const selectedQuality = qualityDistribution.find((item) => item.label === sepSelectedDistQuality) || qualityDistribution[1];
    const getQualityScore = (sampleId, rubricName, defaultScore) => sepQualityRatings[`${sampleId}-${rubricName}`] ?? defaultScore;

    const rewriteRows = [
      {
        title: 'CONVERSATION 8',
        user: 'How do I calculate the derivative of x^2?',
        original: 'The derivative of x^2 is 2x.',
        ai: 'For the function x^n, the derivative is n*x^(n-1). Can you try substituting n = 2 into this formula to see what you get?',
        manual: 'Do you remember the power rule for derivatives of x^n? If you substitute n = 2, can you write it down step-by-step?',
        intent: 'REQUEST_EXPLANATION',
        action: 'DIRECT_ANSWER',
        expected: 'SCAFFOLDING',
      },
      {
        title: 'CONVERSATION 9',
        user: 'What year did World War II start?',
        original: 'The answer is 1939.',
        ai: 'Try to recall the event when Germany invaded Poland. In your opinion, which year did that take place?',
        manual: 'Let\'s recall the historical event: when Germany invaded Poland, what year was that?',
        intent: 'ASK_THEORY',
        action: 'DIRECT_ANSWER',
        expected: 'HINTING',
      },
    ];
    const currentRewrite = rewriteRows[Math.max(0, rewriteConvIdx - 8) % rewriteRows.length];
    const rewriteText = sepRewriteDecision === 'manual' ? currentRewrite.manual : sepRewriteDecision === 'ai' ? currentRewrite.ai : currentRewrite.original;

    return (
      <div className="dataprep-stage2 sep490-stage">
        <div className="sub-stepper">
          {SUB_STEPS_STAGE4.map((step, idx) => (
            <React.Fragment key={step.num}>
              <div
                className={`sub-step ${step.num === currentSubStep4 ? 'active' : ''} ${step.num < currentSubStep4 ? 'completed' : ''}`}
                onClick={() => setCurrentSubStep4(step.num)}
              >
                <div className="sub-step-circle">
                  {step.num < currentSubStep4 ? <Check size={14} /> : step.num}
                </div>
                <div className="sub-step-label">{step.label}</div>
              </div>
              {idx < SUB_STEPS_STAGE4.length - 1 && <div className="sub-step-connector" />}
            </React.Fragment>
          ))}
        </div>

        <style>{`
          @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
          .skeleton-pulse {
            animation: skeleton-pulse 1.5s infinite ease-in-out;
          }
        `}</style>

        {/* ERROR STATE */}
        {stage4Error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: '12px', padding: '32px 24px', textAlign: 'center', margin: '20px 0', boxShadow: '0 4px 12px rgba(220,38,38,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#dc2626' }}>
              <AlertTriangle size={40} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '800', color: '#991b1b' }}>Failed to load Stage 4 data</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#b91c1c', lineHeight: '1.5' }}>{stage4Error}</p>
            <button onClick={refreshData}
              style={{ padding: '12px 28px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(220,38,38,0.25)', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'transform 0.1s' }}>
              <RefreshCw size={14} /> Retry loading
            </button>
          </div>
        )}

        {/* LOADING SKELETON */}
        {isStage4Loading && !stage4Error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', margin: '20px 0' }}>
            {/* Header Skeleton */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="skeleton-pulse" style={{ width: '30%', height: '24px', background: '#f1f5f9', borderRadius: '6px' }} />
              <div className="skeleton-pulse" style={{ width: '60%', height: '14px', background: '#f1f5f9', borderRadius: '4px' }} />
            </div>
            {/* Cards Skeleton Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton-pulse" style={{ width: '50%', height: '12px', background: '#f1f5f9', borderRadius: '4px' }} />
                  <div className="skeleton-pulse" style={{ width: '80%', height: '28px', background: '#f1f5f9', borderRadius: '6px' }} />
                  <div className="skeleton-pulse" style={{ width: '60%', height: '10px', background: '#f1f5f9', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
            {/* Body Skeleton */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', height: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="skeleton-pulse" style={{ width: '40%', height: '16px', background: '#f1f5f9', borderRadius: '4px' }} />
                <div className="skeleton-pulse" style={{ flex: 1, background: '#f8fafc', borderRadius: '8px' }} />
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', height: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="skeleton-pulse" style={{ width: '40%', height: '16px', background: '#f1f5f9', borderRadius: '4px' }} />
                <div className="skeleton-pulse" style={{ flex: 1, background: '#f8fafc', borderRadius: '8px' }} />
              </div>
            </div>
          </div>
        )}

        {!isStage4Loading && !stage4Error && (
          <>
            {/* ===== STEP 7: LOBBY GATE ===== */}
            {currentSubStep4 === 7 && (
          <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Hero card - Light Theme */}
            <div style={{ background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', border: '1px solid #dbeafe', borderRadius: '12px', padding: '32px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(37,99,235,0.03)' }}>
              <div style={{ flex: '1', minWidth: '240px' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>STAGE 4 - AWAITING STAFF</div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '900', color: '#0f172a', fontFamily: 'Outfit, sans-serif' }}>Awaiting Staff Completion of Stage 3</h2>
                <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
                  Once all staff members submit their assigned labeled samples, the system will unlock Stage 4 for running AI Judges.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#4f46e5" strokeWidth="8"
                      strokeDasharray={`${(77 / 100) * 264} 264`}
                      strokeLinecap="round" transform="rotate(-90 50 50)" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '22px', fontWeight: '900', color: '#1e293b' }}>77%</span>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>completed</span>
                  </div>
                </div>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: '600' }}>3 Staff pending</span>
              </div>
            </div>

            {/* Staff Status Board */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Staff Status Board</h3>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Updated: 2 minutes ago</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Staff</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Assigned Subject</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Submitted / Assigned</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase', minWidth: '150px' }}>Progress</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Nguyen Thi A', mon: 'Math', done: 120, total: 120, pct: 100 },
                      { name: 'Tran Van B', mon: 'Physics', done: 98, total: 120, pct: 82 },
                      { name: 'Le Thi C', mon: 'Chemistry', done: 75, total: 120, pct: 63 },
                      { name: 'Pham Van D', mon: 'Biology', done: 120, total: 120, pct: 100 },
                      { name: 'Hoang Thi E', mon: 'History', done: 42, total: 120, pct: 35 },
                      { name: 'Bui Van F', mon: 'Geography', done: 120, total: 120, pct: 100 },
                      { name: 'Do Thi G', mon: 'Literature', done: 110, total: 120, pct: 92 },
                    ].map((staff, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' }}>
                              {staff.name[0]}
                            </div>
                            <span style={{ fontWeight: '600', color: '#1e293b' }}>{staff.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#475569' }}>{staff.mon}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: staff.pct === 100 ? '#16a34a' : '#ea580c' }}>
                          {staff.done} / {staff.total}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${staff.pct}%`, background: staff.pct === 100 ? '#16a34a' : staff.pct > 60 ? '#f59e0b' : '#ef4444', borderRadius: '999px' }} />
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', minWidth: '36px' }}>{staff.pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700',
                            background: staff.pct === 100 ? '#dcfce7' : staff.pct > 60 ? '#fef3c7' : '#fee2e2',
                            color: staff.pct === 100 ? '#15803d' : staff.pct > 60 ? '#92400e' : '#b91c1c'
                          }}>
                            {staff.pct === 100 ? 'Finish' : staff.pct > 60 ? 'In Progress' : 'Behind schedule'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {staff.pct < 100 && (
                            <button
                              onClick={() => alert(`Reminder sent to ${staff.name}`)}
                              style={{ 
                                padding: '10px 22px', 
                                fontSize: '14px', 
                                fontWeight: '700', 
                                borderRadius: '8px', 
                                border: '1.5px solid #4f46e5', 
                                background: 'transparent', 
                                cursor: 'pointer', 
                                color: '#4f46e5',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.05)'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.background = '#4f46e5';
                                e.currentTarget.style.color = '#ffffff';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 10px rgba(79, 70, 229, 0.2)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = '#4f46e5';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.05)';
                              }}
                            >
                              Remind
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setStage4StaffReady(true); setCurrentSubStep4(8); }}
                style={{ padding: '14px 28px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#e2e8f0', color: '#64748b', cursor: 'pointer' }}
              >
                Skip (Demo Mode)
              </button>
              <button
                onClick={() => { setStage4StaffReady(true); setCurrentSubStep4(8); }}
                style={{ padding: '14px 28px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}
              >
                Next: AI Scoring &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ===== STEP 8: AUTOMATED AI SCORING ===== */}
        {currentSubStep4 === 8 && (() => {
          const aiModels = [
            { key: 'gemini',   label: 'Gemini Flash 1.5', desc: 'Default education judge, low cost',  color: '#4f46e5', badge: 'Recommended' },
            { key: 'openai',   label: 'Qwen 3.7 Plus',    desc: 'Qwen model on Groq API (gpt-oss-120b)', color: '#059669', badge: '' },
            { key: 'deepseek', label: 'Deepseek R1/V3',   desc: 'Advanced pedagogical logic, free',      color: '#0891b2', badge: 'Free' },
          ];
          const selectedCount = Object.values(judgeModels).filter(Boolean).length;
          
          const isJobRunning = latestJob?.status === 'running' || latestJob?.status === 'pending' || sepRunningEval;
          const isJobCompleted = latestJob?.status === 'completed';
          const jobProgress = latestJob?.progress || { evaluated: 0, total: 20, conflictCount: 0 };
          const progressPercent = jobProgress.total > 0 ? Math.round((jobProgress.evaluated / jobProgress.total) * 100) : 0;
          const conflictCount = jobProgress.conflictCount || 0;

          return (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Automated AI Scoring</h2>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b' }}>Pick the AI judges that will score each conversation. Choose at least 2 models so conflicts can be detected. A conflict is when |avg(AI) - Human| &gt; threshold.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                {/* Model Selection */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Select AI Judge Models</h3>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '999px', background: selectedCount >= 2 ? '#dcfce7' : '#fef3c7', color: selectedCount >= 2 ? '#15803d' : '#92400e' }}>
                      {selectedCount} / 3 selected
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    {aiModels.map(({ key, label, desc, color, badge }) => (
                      <label key={key} onClick={() => setJudgeModels(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '8px', border: `2px solid ${judgeModels[key] ? color : '#e2e8f0'}`, background: judgeModels[key] ? `${color}08` : '#fafafa', cursor: 'pointer', transition: 'all 0.2s' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '8px', border: `2px solid ${judgeModels[key] ? color : '#cbd5e1'}`, background: judgeModels[key] ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {judgeModels[key] && <span style={{ color: '#fff', fontSize: '14px', fontWeight: '900' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{label}</span>
                            {badge && <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: badge === 'Free' ? '#dcfce7' : '#e0e7ff', color: badge === 'Free' ? '#15803d' : '#4338ca' }}>{badge}</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{desc}</div>
                        </div>
                        {judgeModels[key] && <span style={{ fontSize: '12px', fontWeight: '700', color, padding: '4px 10px', borderRadius: '999px', background: `${color}15` }}>ON</span>}
                      </label>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Conflict Threshold: |avg(AI) - Human|</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[1.5, 2.0, 2.5, 3.0].map(v => (
                        <button key={v} style={{ flex: 1, padding: '8px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: `1px solid ${v === 2.0 ? '#4f46e5' : '#e2e8f0'}`, background: v === 2.0 ? '#e0e7ff' : '#f8fafc', color: v === 2.0 ? '#4338ca' : '#475569', cursor: 'pointer' }}>
                          ±{v}
                        </button>
                      ))}
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Default ±2.0. Conflicts will appear in Quality Review and the Distribution Dashboard.</p>
                  </div>
                  <button
                    disabled={selectedCount === 0 || isJobCompleted || isJobRunning}
                    onClick={handleStartScoring}
                    style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: selectedCount === 0 ? '#f1f5f9' : isJobCompleted ? '#dcfce7' : '#1e293b', color: selectedCount === 0 ? '#94a3b8' : isJobCompleted ? '#15803d' : '#fff', cursor: (selectedCount === 0 || isJobRunning || isJobCompleted) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    {isJobRunning ? 'Scoring in progress...' : isJobCompleted ? 'Scoring completed' : `Start scoring (${selectedCount} model${selectedCount === 1 ? '' : 's'})`}
                  </button>
                </div>
                {/* Status Panel */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Scoring status</h3>
                  <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Overall progress</span>
                      <span style={{ fontSize: '13px', fontWeight: '900', color: isJobCompleted ? '#15803d' : '#4f46e5' }}>{isJobCompleted ? `${jobProgress.total} / ${jobProgress.total}` : isJobRunning ? `${jobProgress.evaluated} / ${jobProgress.total}` : `0 / ${jobProgress.total}`}</span>
                    </div>
                    <div style={{ height: '10px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div className={isJobRunning ? "progress-bar-pulse" : ""} style={{ height: '100%', width: `${isJobCompleted ? 100 : progressPercent}%`, background: isJobCompleted ? '#16a34a' : '#4f46e5', borderRadius: '999px', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b' }}>{isJobCompleted ? 'Done. Ready to view results.' : isJobRunning ? 'Calling AI judge APIs...' : 'Not Started'}</div>
                  </div>
                  {aiModels.map(({ key, label, color }) => (
                    judgeModels[key] && (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: `1px solid ${color}22` }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isJobCompleted ? '#16a34a' : isJobRunning ? color : '#cbd5e1', flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155', flex: 1 }}>{label}</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: isJobCompleted ? '#15803d' : isJobRunning ? color : '#94a3b8' }}>
                          {isJobCompleted ? `${jobProgress.total}/${jobProgress.total} done` : isJobRunning ? 'Running...' : 'Waiting'}
                        </span>
                      </div>
                    )
                  ))}
                  {isJobCompleted && (
                    <div style={{ background: '#fff7f7', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {conflictCount} conflicts detected</div>
                      <div style={{ fontSize: '11px', color: '#7f1d1d', lineHeight: '1.6' }}>
                        Conversations where |avg(AI) - Human| &gt; 2.0 will be flagged in Quality Review.
                      </div>
                    </div>
                  )}
                  {isJobCompleted ? (
                    <button onClick={() => setCurrentSubStep4(9)}
                      style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                      View Quality Review &rarr;
                    </button>
                  ) : (
                    <button onClick={() => setCurrentSubStep4(9)}
                      style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#475569', cursor: 'pointer' }}>
                      Next: Quality Review &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ===== STEP 9: QUALITY REVIEW (read-only) ===== */}
        {currentSubStep4 === 9 && (() => {
          const rewriteItems = displayQualityItems.filter(i => i.bucket === 'Rewrite' || i.bucket === 'Reject');
          const goldItems = displayQualityItems.filter(i => i.bucket === 'Gold');
          const allItems = displayQualityItems;
          const conflictItems = allItems.filter(i => getScoresForSample(i.convId).conflict);
          const displayItems = qualityTab === 'rewrite' ? rewriteItems : qualityTab === 'gold' ? goldItems : qualityTab === 'conflict' ? conflictItems : allItems;

          const ScoreCell = ({ val }) => val != null
            ? <span style={{ fontWeight: '700', color: val >= 7 ? '#16a34a' : val >= 5 ? '#d97706' : '#dc2626' }}>{val.toFixed(1)}</span>
            : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>-</span>;

          return (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header read-only */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Quality Review (read-only)</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Read AI judge and human reviewer scores. Use Assign Rewrite or Review Submissions to act on conversations.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[{ bg: '#dcfce7', clr: '#15803d', lbl: 'Gold', cnt: goldItems.length }, { bg: '#fef3c7', clr: '#92400e', lbl: 'Rewrite', cnt: rewriteItems.length }, { bg: '#fee2e2', clr: '#dc2626', lbl: 'Reject', cnt: displayQualityItems.filter(i => i.bucket === 'Reject').length }, { bg: '#fff1f2', clr: '#dc2626', lbl: 'Conflict', cnt: conflictItems.length }].map(({ bg, clr, lbl, cnt }) => (
                    <div key={lbl} style={{ background: bg, borderRadius: '12px', padding: '8px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: clr }}>{lbl}</div>
                      <div style={{ fontSize: '20px', fontWeight: '900', color: clr }}>{cnt}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary bar + tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: 'All', count: allItems.length, color: '#475569' },
                    { key: 'gold', label: 'Gold', count: goldItems.length, color: '#15803d' },
                    { key: 'rewrite', label: 'Needs Edit', count: rewriteItems.length, color: '#92400e' },
                    { key: 'conflict', label: 'Conflict', count: conflictItems.length, color: '#dc2626' },
                  ].map(({ key, label, count, color }) => (
                    <button key={key} onClick={() => setQualityTab(key)} style={{
                      padding: '8px 16px', fontSize: '13px', fontWeight: '700', borderRadius: '999px', border: '1px solid',
                      background: qualityTab === key ? '#1e293b' : '#fff',
                      color: qualityTab === key ? '#fff' : color,
                      borderColor: qualityTab === key ? '#1e293b' : '#e2e8f0', cursor: 'pointer'
                    }}>
                      {label} <span style={{ fontWeight: '900' }}>({count})</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button onClick={() => setCurrentSubStep4(10)}
                    style={{ padding: '12px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer' }}>
                    Go to Assign Rewrite &rarr;
                  </button>
                </div>
              </div>

              {/* Main Table */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'auto' }}>
                {displayItems.length === 0 ? (
                  <div className="empty-state-card">
                    <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                    <h3 className="empty-state-title">All clear!</h3>
                    <p className="empty-state-desc">No items found in this category. Everything looks great so far.</p>
                  </div>
                ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Conv ID</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Subject</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', maxWidth: '200px' }}>Issue</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#4f46e5', fontSize: '11px', textTransform: 'uppercase', background: '#f0f4ff' }}>Gemini</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#0891b2', fontSize: '11px', textTransform: 'uppercase', background: '#ecfeff' }}>Deepseek</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#059669', fontSize: '11px', textTransform: 'uppercase', background: '#f0fdf4' }}>Qwen</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#7c3aed', fontSize: '11px', textTransform: 'uppercase', background: '#f5f3ff' }}>Avg AI</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#ea580c', fontSize: '11px', textTransform: 'uppercase', background: '#fff7ed', borderLeft: '2px solid #e2e8f0' }}>Human</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#dc2626', fontSize: '11px', textTransform: 'uppercase' }}>Conflict</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Verdict</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItems.map((item, i) => {
                      const label = getQualityLabel(item);
                      const scores = getScoresForSample(item.convId);
                      const avgAI = getAvgAI(scores);
                      const diff = (avgAI != null && scores.human != null) ? Math.abs(avgAI - scores.human) : null;
                      return (
                        <tr key={item.id} className="premium-table-row"
                          style={{ borderBottom: '1px solid #f1f5f9', background: scores.conflict ? '#fff7f7' : i % 2 === 0 ? '#fff' : '#fafafa', cursor: 'pointer' }}
                          onClick={() => setReviewDetailModal({ ...item, scores })}>
                          <td style={{ padding: '10px 14px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {item.convId}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#475569' }}>{item.subject}</span>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f8faff' }}><ScoreCell val={scores.gemini} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0faff' }}><ScoreCell val={scores.deepseek} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f0fff4' }}><ScoreCell val={scores.openai} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', background: '#f5f3ff' }}>
                            {avgAI != null ? <span style={{ fontWeight: '800', color: avgAI >= 7 ? '#7c3aed' : avgAI >= 5 ? '#d97706' : '#dc2626' }}>{avgAI.toFixed(1)}</span> : <span style={{ color: '#cbd5e1' }}>-</span>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}><ScoreCell val={scores.human} /></td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {scores.conflict ? (
                              <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: '#fee2e2', color: '#dc2626', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <AlertTriangle size={10} /> ±{diff?.toFixed(1) ?? '?'}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '12px' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                              background: label === 'Gold' ? '#dcfce7' : label === 'Rewrite' ? '#fef3c7' : '#fee2e2',
                              color: label === 'Gold' ? '#15803d' : label === 'Rewrite' ? '#92400e' : '#dc2626'
                            }}>{label}</span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); setReviewDetailModal({ ...item, scores }); }}
                              style={{ padding: '5px 12px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#4f46e5' }}>
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>

              {/* Navigation button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setCurrentSubStep4(10)}
                  style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Next: Assign Rewrite &rarr;
                </button>
              </div>

              {/* READ-ONLY Detail Modal */}
              {reviewDetailModal && (() => {
                const scores = reviewDetailModal.scores || getScoresForSample(reviewDetailModal.convId);
                const label = getQualityLabel(reviewDetailModal);
                const avgAI = getAvgAI(scores);
                const diff = (avgAI != null && scores.human != null) ? Math.abs(avgAI - scores.human) : null;
                return (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                    onClick={() => setReviewDetailModal(null)}>
                    <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ background: '#1e293b', padding: '20px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#f8fafc' }}>{reviewDetailModal.convId}</h3>
                          <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: label === 'Gold' ? '#dcfce7' : label === 'Rewrite' ? '#fef3c7' : '#fee2e2', color: label === 'Gold' ? '#15803d' : label === 'Rewrite' ? '#92400e' : '#dc2626' }}>{label}</span>
                          {scores.conflict && <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: '#fee2e2', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> CONFLICT</span>}
                        </div>
                        <button onClick={() => setReviewDetailModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer' }}>&#x2715;</button>
                      </div>
                      <div style={{ padding: '2px 24px 12px', background: '#1e293b' }}>
                        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Subject: {reviewDetailModal.subject} - Issue: {reviewDetailModal.reason}</p>
                      </div>
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Evaluation Scores (read-only)</h4>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {[{ label: 'Gemini', val: scores.gemini, color: '#4f46e5', bg: '#e0e7ff' }, { label: 'Deepseek', val: scores.deepseek, color: '#0891b2', bg: '#cffafe' }, { label: 'OpenAI', val: scores.openai, color: '#059669', bg: '#d1fae5' }].map(({ label: lbl, val, color, bg }) => (
                            <div key={lbl} style={{ background: bg, borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color, marginBottom: '4px' }}>{lbl}</div>
                              <div style={{ fontSize: '20px', fontWeight: '900', color: val == null ? '#cbd5e1' : val >= 7 ? '#15803d' : val >= 5 ? '#d97706' : '#dc2626' }}>{val != null ? val.toFixed(1) : '-'}</div>
                            </div>
                          ))}
                          <div style={{ background: '#f5f3ff', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '90px', border: '2px solid #c4b5fd' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#7c3aed', marginBottom: '4px' }}>Avg AI</div>
                            <div style={{ fontSize: '22px', fontWeight: '900', color: avgAI == null ? '#cbd5e1' : avgAI >= 7 ? '#7c3aed' : avgAI >= 5 ? '#d97706' : '#dc2626' }}>{avgAI != null ? avgAI.toFixed(1) : '-'}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Average of AIs</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8', fontSize: '22px', fontWeight: '300', alignSelf: 'center' }}>vs</div>
                          <div style={{ background: '#fed7aa', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px', border: scores.conflict ? '2px solid #f97316' : '2px solid transparent' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#ea580c', marginBottom: '4px' }}>Human</div>
                            <div style={{ fontSize: '22px', fontWeight: '900', color: scores.human == null ? '#cbd5e1' : scores.human >= 7 ? '#15803d' : scores.human >= 5 ? '#d97706' : '#dc2626' }}>{scores.human != null ? scores.human.toFixed(1) : '-'}</div>
                          </div>
                          {diff != null && (
                            <div style={{ background: scores.conflict ? '#fee2e2' : '#f1f5f9', borderRadius: '8px', padding: '10px 16px', textAlign: 'center', minWidth: '80px', border: scores.conflict ? '1px solid #fca5a5' : '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: scores.conflict ? '#dc2626' : '#64748b', marginBottom: '4px' }}>Delta</div>
                              <div style={{ fontSize: '20px', fontWeight: '900', color: scores.conflict ? '#dc2626' : '#64748b' }}>±{diff.toFixed(1)}</div>
                              {scores.conflict && <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '2px' }}>Conflict &gt; 2.0</div>}
                            </div>
                          )}
                        </div>
                        {scores.conflict && diff != null && (
                          <div style={{ marginTop: '14px', background: '#fff7f7', border: '1px solid #fca5a5', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#b91c1c', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <AlertTriangle size={16} />
                            <span><strong>Conflict AI vs Human:</strong> The average AI score ({avgAI?.toFixed(1)}) differs from the Human score ({scores.human?.toFixed(1)}) by ±{diff.toFixed(1)} exceeding the threshold of 2.0. Requires expert human review.</span>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '20px 24px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conversation Content</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                          {reviewDetailModal.messages.map((msg, idx) => (
                            <div key={idx} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.6', background: msg.role === 'user' ? '#f8fafc' : idx === reviewDetailModal.errorMessageIndex ? '#fef3c7' : '#f0fdf4', border: idx === reviewDetailModal.errorMessageIndex ? '2px solid #fcd34d' : '1px solid transparent', alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                                {msg.role === 'user' ? 'Student' : idx === reviewDetailModal.errorMessageIndex ? 'AI Tutor (with error)' : 'AI Tutor'}
                              </div>
                              {msg.text}
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Info size={16} />
                          <span>This screen is read-only. To edit, use step "Assign Rewrite" or "Review Submissions".</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ===== STEP 10: ASSIGN REWRITE (BULK ASSIGN) ===== */}
        {currentSubStep4 === 10 && (() => {
          const realRewriteItems = displayQualityItems.filter(i => i.bucket === 'Rewrite');
          const rewriteItems = (realRewriteItems.length > 0 ? realRewriteItems : filteredQualitySamples.filter(i => i.bucket === 'Rewrite')) as any[];
          const allSelected = rewriteItems.length > 0 && selectedRewriteIds.length === rewriteItems.length;
          const assignedCount = rewriteItems.filter(i => reassignStaff[i.id]).length;
          const pendingCount = rewriteItems.length - assignedCount;
          const progress = rewriteItems.length > 0 ? Math.round((assignedCount / rewriteItems.length) * 100) : 0;

          const subjectColors = {
            'Math': { bg: '#e0e7ff', color: '#4338ca' }, 'Physics': { bg: '#cffafe', color: '#0e7490' },
            'Chemistry': { bg: '#d1fae5', color: '#065f46' }, 'Biology': { bg: '#fef3c7', color: '#92400e' },
            'History': { bg: '#ede9fe', color: '#6d28d9' }, 'Geography': { bg: '#fee2e2', color: '#b91c1c' },
            'Literature': { bg: '#fce7f3', color: '#9d174d' }, 'English': { bg: '#fff7ed', color: '#9a3412' },
            'PHYSICAL': { bg: '#cffafe', color: '#0e7490' }, 'CHEMISTRY': { bg: '#d1fae5', color: '#065f46' },
            'BIOLOGY': { bg: '#fef3c7', color: '#92400e' }, 'HISTORY': { bg: '#ede9fe', color: '#6d28d9' },
            'GEOGRAPHY': { bg: '#fee2e2', color: '#b91c1c' }, 'LITERATURE': { bg: '#fce7f3', color: '#9d174d' },
            'MATH': { bg: '#e0e7ff', color: '#4338ca' },
          };
          const getSubjectStyle = (s) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };

          const staffList = [
            { value: 'Nguyen Thi A', initials: 'NA', color: '#4f46e5' },
            { value: 'Tran Van B', initials: 'TB', color: '#0891b2' },
            { value: 'Le Thi C', initials: 'LC', color: '#059669' },
            { value: 'Pham Van D', initials: 'PD', color: '#d97706' },
          ];
          const getStaffColor = (name) => staffList.find(s => s.value === name)?.color || '#64748b';
          const getStaffInitials = (name) => staffList.find(s => s.value === name)?.initials || '??';

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header card */}
              <div style={{ background: 'linear-gradient(135deg, #fafbff 0%, #f0f4ff 100%)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={18} style={{ color: '#fff' }} />
                      </div>
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#0f172a' }}>Assign Rewrite Tasks to Staff</h2>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Assign conversations that need editing to team members. Select multiple for bulk assignment.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Not Assigned</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', lineHeight: 1.2 }}>{pendingCount}</div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 18px', textAlign: 'center', minWidth: '70px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned</div>
                      <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', lineHeight: 1.2 }}>{assignedCount}</div>
                    </div>
                    <button onClick={() => setCurrentSubStep4(11)}
                      style={{ padding: '12px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.25)', whiteSpace: 'nowrap' }}>
                      Go to Review &rarr;
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Assignment progress</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5' }}>{assignedCount} / {rewriteItems.length} conversations</span>
                  </div>
                  <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #4f46e5, #7c3aed)', borderRadius: '999px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '14px 16px', width: '44px' }}>
                        <input type="checkbox" checked={allSelected} onChange={() => setSelectedRewriteIds(allSelected ? [] : rewriteItems.map(i => i.id))}
                          style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }} />
                      </th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conv ID</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Issue Detected</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '220px' }}>Assign to</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '100px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewriteItems.map((item, i) => {
                      const checked = selectedRewriteIds.includes(item.id);
                      const staff = reassignStaff[item.id];
                      const subjStyle = getSubjectStyle(item.subject);
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: checked ? '#f5f3ff' : i % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 0.15s' }}>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <input type="checkbox" checked={checked} onChange={() => setSelectedRewriteIds(prev => checked ? prev.filter(x => x !== item.id) : [...prev, item.id])}
                              style={{ width: '16px', height: '16px', accentColor: '#4f46e5', cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ fontWeight: '700', color: '#1e293b', fontFamily: 'monospace', fontSize: '13px', background: '#f8fafc', padding: '3px 8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>{item.convId}</span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', background: subjStyle.bg, color: subjStyle.color }}>{item.subject}</span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0, display: 'inline-block' }} />
                              {item.issue}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            {staff ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: getStaffColor(staff), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: '10px', fontWeight: '800', color: '#fff' }}>{getStaffInitials(staff)}</span>
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{staff}</span>
                                <button onClick={() => setReassignStaff(prev => { const n = {...prev}; delete n[item.id]; return n; })}
                                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>&times;</button>
                              </div>
                            ) : (
                              <select value="" onChange={e => setReassignStaff(prev => ({...prev, [item.id]: e.target.value}))}
                                style={{ padding: '7px 12px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', outline: 'none', minWidth: '160px' }}>
                                <option value="">Select staff member...</option>
                                {staffList.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                              </select>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', background: staff ? '#dcfce7' : '#f1f5f9', color: staff ? '#15803d' : '#94a3b8', letterSpacing: '0.3px' }}>
                              {staff ? '✓ Assigned' : 'Not Assigned'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Floating bulk assign bar */}
              {selectedRewriteIds.length > 0 && (
                <div style={{ position: 'sticky', bottom: '16px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '12px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '900' }}>{selectedRewriteIds.length}</span>
                    </div>
                    <span style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '14px' }}>conversations selected</span>
                  </div>
                  <div style={{ width: '1px', height: '32px', background: '#334155' }} />
                  <select value={bulkAssignStaff} onChange={e => setBulkAssignStaff(e.target.value)}
                    style={{ padding: '10px 14px', fontSize: '14px', borderRadius: '8px', border: '1px solid #475569', background: '#334155', color: '#f1f5f9', cursor: 'pointer', flex: 1, maxWidth: '240px', outline: 'none' }}>
                    <option value="">Select staff to assign...</option>
                    {staffList.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                  </select>
                  <button onClick={() => {
                    if (!bulkAssignStaff) return alert('Vui long chon nhan vien!');
                    const updates = {};
                    selectedRewriteIds.forEach(id => { updates[id] = bulkAssignStaff; });
                    setReassignStaff(prev => ({...prev, ...updates}));
                    setSelectedRewriteIds([]);
                    setBulkAssignStaff('');
                  }} style={{ padding: '10px 24px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.4)' }}>
                    Assign All
                  </button>
                  <button onClick={() => setSelectedRewriteIds([])}
                    style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>
                    Cancel
                </button>
              </div>
            )}
            {/* Navigation button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setCurrentSubStep4(11)}
                style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Next: Review Submissions &rarr;
              </button>
            </div>
          </div>
        );
      })()}

        {/* ===== STEP 11: STAFF SUBMISSION REVIEW (3b) ===== */}
        {currentSubStep4 === 11 && (() => {
          const realRewriteItems = displayQualityItems.filter(i => i.bucket === 'Rewrite' || i.bucket === 'Reject');
          const rewriteItems = (realRewriteItems.length > 0 ? realRewriteItems : filteredQualitySamples.filter(i => i.bucket === 'Rewrite')) as any[];
          const activeItem = rewriteItems[rewriteConvIdx] || rewriteItems[0];
          const approvedCount = rewriteItems.filter(i => completedRewrites[i.id]).length;
          const pendingCount = rewriteItems.filter(i => !completedRewrites[i.id]).length;

          const subjectColors = {
            'Math': { bg: '#e0e7ff', color: '#4338ca' }, 'Physics': { bg: '#cffafe', color: '#0e7490' },
            'Chemistry': { bg: '#d1fae5', color: '#065f46' }, 'Biology': { bg: '#fef3c7', color: '#92400e' },
            'History': { bg: '#ede9fe', color: '#6d28d9' }, 'Geography': { bg: '#fee2e2', color: '#b91c1c' },
            'Literature': { bg: '#fce7f3', color: '#9d174d' }, 'English': { bg: '#fff7ed', color: '#9a3412' },
            'PHYSICAL': { bg: '#cffafe', color: '#0e7490' }, 'CHEMISTRY': { bg: '#d1fae5', color: '#065f46' },
            'BIOLOGY': { bg: '#fef3c7', color: '#92400e' }, 'HISTORY': { bg: '#ede9fe', color: '#6d28d9' },
            'GEOGRAPHY': { bg: '#fee2e2', color: '#b91c1c' }, 'LITERATURE': { bg: '#fce7f3', color: '#9d174d' },
            'MATH': { bg: '#e0e7ff', color: '#4338ca' },
          };
          const getSubjectStyle = (s) => subjectColors[s] || { bg: '#f1f5f9', color: '#475569' };

          return (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a', borderRadius: '12px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                    <Search size={22} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#78350f' }}>Review Staff Submissions</h2>
                    <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: '#92400e' }}>Compare the original and staff-revised versions. Approve (Gold) or request a redo.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>Pending Review</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#d97706', lineHeight: 1.2 }}>{pendingCount}</div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>Approved</div>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#16a34a', lineHeight: 1.2 }}>{approvedCount}</div>
                  </div>
                  <button onClick={() => setCurrentSubStep4(12)}
                    style={{ padding: '12px 22px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #1e293b, #334155)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,41,59,0.25)', whiteSpace: 'nowrap' }}>
                    Dataset Distribution &rarr;
                  </button>
                </div>
              </div>

              {/* 2-col layout */}
              {rewriteItems.length === 0 ? (
                <div className="empty-state-card">
                  <CheckCircle size={48} className="empty-state-icon" style={{ color: '#10b981' }} />
                  <h3 className="empty-state-title">No submissions pending!</h3>
                  <p className="empty-state-desc">All staff submissions have been reviewed and approved.</p>
                </div>
              ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', alignItems: 'flex-start' }}>
                {/* Left sidebar */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Submission List</h4>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>{rewriteItems.length} items</span>
                  </div>
                  <div style={{ maxHeight: '540px', overflowY: 'auto' }}>
                    {rewriteItems.map((item, idx) => {
                      const isSelected = activeItem?.id === item.id;
                      const isDone = completedRewrites[item.id];
                      const staffName = reassignStaff[item.id];
                      const subjStyle = getSubjectStyle(item.subject);
                      return (
                        <div key={item.id} className="premium-table-row"
                          onClick={() => { setRewriteConvIdx(idx); setRewriteTextContent(''); }}
                          style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isSelected ? '#f5f3ff' : '#fff', borderLeft: isSelected ? '3px solid #4f46e5' : '3px solid transparent' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', fontFamily: 'monospace' }}>{item.convId}</span>
                            <span style={{ fontSize: '10px', fontWeight: '800', padding: '3px 8px', borderRadius: '999px', background: isDone ? '#dcfce7' : staffName ? '#fef9c3' : '#f1f5f9', color: isDone ? '#15803d' : staffName ? '#854d0e' : '#94a3b8', letterSpacing: '0.3px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              {isDone ? <><Check size={10} /> Approved</> : staffName ? <><RotateCcw size={10} /> Pending Review</> : 'Not Submitted'}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', background: subjStyle.bg, color: subjStyle.color }}>{item.subject}</span>
                          {staffName && <div style={{ fontSize: '11px', color: '#4f46e5', marginTop: '5px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> {staffName}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right review panel */}
                {activeItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Conv header */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: getSubjectStyle(activeItem.subject).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${getSubjectStyle(activeItem.subject).color}30` }}>
                          <span style={{ fontSize: '10px', fontWeight: '900', color: getSubjectStyle(activeItem.subject).color }}>{activeItem.subject.slice(0,3)}</span>
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a', fontFamily: 'monospace' }}>{activeItem.convId}</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                            Subject: <strong style={{ color: getSubjectStyle(activeItem.subject).color }}>{activeItem.subject}</strong>
                            {reassignStaff[activeItem.id] && <> &middot; Assigned to: <strong style={{ color: '#4f46e5' }}>{reassignStaff[activeItem.id]}</strong></>}
                          </p>
                        </div>
                      </div>
                      {!completedRewrites[activeItem.id] && (
                        <button onClick={() => setRewriteTextContent(`[Simulated submission from ${reassignStaff[activeItem.id] || 'Staff'}]: Before answering, try thinking about which rule applies here.`)}
                          style={{ padding: '9px 16px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: '1.5px dashed #c7d2fe', background: '#f0f4ff', cursor: 'pointer', color: '#4338ca', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Zap size={13} /> Simulate Staff Submission
                        </button>
                      )}
                    </div>

                    {/* Error context banner */}
                    <div style={{ background: 'linear-gradient(135deg, #fff7ed, #fffbeb)', border: '1px solid #fcd34d', borderRadius: '12px', padding: '14px 18px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                        <AlertTriangle size={14} />
                      </div>
                      <div>
                        <p style={{ margin: '0 0 3px 0', fontSize: '11px', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Error to Fix (Detected by AI Judges)</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#78350f', lineHeight: '1.6', fontWeight: '500' }}>{activeItem.reason}</p>
                      </div>
                    </div>

                    {/* Comparison: Original vs Rewrite */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ background: '#fff', border: '1.5px solid #fca5a5', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', background: '#fff1f2', borderBottom: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Original Response (Has Error)</span>
                          <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto' }}>Turn #{(activeItem.errorMessageIndex || 1) + 1}</span>
                        </div>
                        <div style={{ padding: '16px', fontSize: '14px', color: '#374151', lineHeight: '1.7', minHeight: '100px' }}>
                          {activeItem.messages[activeItem.errorMessageIndex || 1]?.text || '(no content found)'}
                        </div>
                      </div>
                      <div style={{ background: '#fff', border: `1.5px solid ${(rewriteTextContent || completedRewrites[activeItem.id]) ? '#86efac' : '#e2e8f0'}`, borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', background: (rewriteTextContent || completedRewrites[activeItem.id]) ? '#f0fdf4' : '#f8fafc', borderBottom: `1px solid ${(rewriteTextContent || completedRewrites[activeItem.id]) ? '#86efac' : '#e2e8f0'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: (rewriteTextContent || completedRewrites[activeItem.id]) ? '#16a34a' : '#94a3b8' }} />
                          <span style={{ fontSize: '12px', fontWeight: '800', color: (rewriteTextContent || completedRewrites[activeItem.id]) ? '#15803d' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Staff Submission</span>
                          {reassignStaff[activeItem.id] && <span style={{ fontSize: '11px', color: '#4f46e5', marginLeft: 'auto', fontWeight: '600' }}>by {reassignStaff[activeItem.id]}</span>}
                        </div>
                        <div style={{ padding: '16px', fontSize: '14px', color: (rewriteTextContent || completedRewrites[activeItem.id]) ? '#15803d' : '#94a3b8', lineHeight: '1.7', minHeight: '100px', fontStyle: (rewriteTextContent || completedRewrites[activeItem.id]) ? 'normal' : 'italic' }}>
                          {(rewriteTextContent || completedRewrites[activeItem.id]) ? (rewriteTextContent || 'Rewrite submitted.') : 'Staff has not submitted a rewrite yet. Click "Simulate Staff Submission" above for a demo.'}
                        </div>
                      </div>
                    </div>

                    {/* Admin action bar */}
                    {(rewriteTextContent || completedRewrites[activeItem.id]) ? (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 22px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569', flex: 1 }}>Admin Decision:</span>
                        <button onClick={() => {
                          handleAdjudicateQuality(activeItem.convId, 'Gold', 'Approved by Admin');
                          setCompletedRewrites(prev => ({...prev, [activeItem.id]: true}));
                          const next = rewriteItems.find((x, xi) => xi > rewriteConvIdx && !completedRewrites[x.id]);
                          if (next) { setRewriteConvIdx(rewriteItems.indexOf(next)); setRewriteTextContent(''); }
                        }} disabled={!!completedRewrites[activeItem.id]}
                          style={{ padding: '11px 24px', fontSize: '14px', fontWeight: '800', borderRadius: '8px', border: 'none', background: completedRewrites[activeItem.id] ? '#e2e8f0' : 'linear-gradient(135deg, #16a34a, #15803d)', color: completedRewrites[activeItem.id] ? '#94a3b8' : '#fff', cursor: completedRewrites[activeItem.id] ? 'default' : 'pointer', boxShadow: completedRewrites[activeItem.id] ? 'none' : '0 4px 12px rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {completedRewrites[activeItem.id] ? <><Check size={14} /> Approved - Gold</> : <><Check size={14} /> Approve - Gold</>}
                        </button>
                        <button onClick={() => {
                          handleAdjudicateQuality(activeItem.convId, 'Rewrite', 'Redo requested by Admin');
                          setRewriteTextContent('');
                          setCompletedRewrites(prev => { const n = {...prev}; delete n[activeItem.id]; return n; });
                        }}
                          disabled={!!completedRewrites[activeItem.id]}
                          style={{ padding: '11px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: completedRewrites[activeItem.id] ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RotateCcw size={14} /> Request Redo
                        </button>
                        <button onClick={() => {
                          handleAdjudicateQuality(activeItem.convId, 'Reject', 'Rejected by Supervisor');
                          setCompletedRewrites(prev => ({...prev, [activeItem.id]: true}));
                          const next = rewriteItems.find((x, xi) => xi > rewriteConvIdx && !completedRewrites[x.id]);
                          if (next) { setRewriteConvIdx(rewriteItems.indexOf(next)); setRewriteTextContent(''); }
                        }} disabled={!!completedRewrites[activeItem.id]}
                          style={{ padding: '11px 20px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#dc2626', cursor: completedRewrites[activeItem.id] ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', color: '#cbd5e1' }}><Inbox size={32} /></div>
                        <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Staff has not submitted a rewrite yet.</p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>Click "Simulate Staff Submission" above for a demo.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '60px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px', color: '#cbd5e1' }}><MousePointer2 size={40} /></div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Select a conversation on the left to review it.</p>
                  </div>
                )}
              </div>
              )}
              {/* Navigation button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => setCurrentSubStep4(12)}
                  style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Next: Dataset Distribution &rarr;
                </button>
              </div>
            </div>
          );
        })()}

        {/* ===== STEP 12: FINAL DISTRIBUTION DASHBOARD ===== */}
        {currentSubStep4 === 12 && (() => {
          const statSummary = statistics?.summary;
          const totalConv = statSummary?.totalSamples ?? 20;
          
          // Count total messages from displayQualityItems
          const totalMsg = displayQualityItems.reduce((acc, item) => acc + (item.messages?.length || 0), 0) || 148;
          
          const goldCount = statSummary?.distribution?.Gold ?? 8;
          const rewriteCount = statSummary?.distribution?.Rewrite ?? 9;
          const rejectCount = statSummary?.distribution?.Reject ?? 3;
          const goldRate = totalConv > 0 ? Math.round((goldCount / totalConv) * 100) : 0;
          
          // Calculate average AI score from displayQualityItems
          const scorableItems = displayQualityItems.filter(item => item.score > 0);
          const avgAIScore = scorableItems.length > 0 
            ? parseFloat((scorableItems.reduce((acc, item) => acc + item.score, 0) / scorableItems.length).toFixed(1))
            : 6.9;
            
          const conflictCount = statSummary?.conflictCount ?? 3;

          const subjectColors = {
            'Math': '#4f46e5', 'Physics': '#0891b2', 'Chemistry': '#059669', 'Biology': '#d97706',
            'History': '#7c3aed', 'Geography': '#dc2626', 'Literature': '#0d9488', 'English': '#ea580c',
            'PHYSICAL': '#0891b2', 'CHEMISTRY': '#059669', 'BIOLOGY': '#d97706', 'HISTORY': '#7c3aed',
            'GEOGRAPHY': '#dc2626', 'LITERATURE': '#0d9488', 'MATH': '#4f46e5'
          };
          const subjectData = statistics?.bySubject ? statistics.bySubject.map(s => {
            const name = s.subject;
            const conv = s.total;
            const pct = totalConv > 0 ? Math.round((conv / totalConv) * 100) : 0;
            return {
              name,
              conv,
              pct,
              color: subjectColors[name] || '#64748b'
            };
          }) : [
            { name: 'Math', conv: 5, pct: 25, color: '#4f46e5' },
            { name: 'Physics', conv: 4, pct: 20, color: '#0891b2' },
            { name: 'Chemistry', conv: 3, pct: 15, color: '#059669' },
            { name: 'Biology', conv: 3, pct: 15, color: '#d97706' },
            { name: 'History', conv: 2, pct: 10, color: '#7c3aed' },
            { name: 'Geography', conv: 1, pct: 5, color: '#dc2626' },
            { name: 'Literature', conv: 1, pct: 5, color: '#0d9488' },
            { name: 'English', conv: 1, pct: 5, color: '#ea580c' },
          ];

          const topReasons = statistics?.commonErrors ? statistics.commonErrors.map(e => ({
            reason: e.error,
            count: e.count,
            pct: rewriteCount + rejectCount > 0 ? Math.round((e.count / (rewriteCount + rejectCount)) * 100) : 0,
            bucket: e.error.toLowerCase().includes('reject') || e.error.toLowerCase().includes('fail') || e.error.toLowerCase().includes('sai') ? 'Reject' : 'Rewrite'
          })) : [
            { reason: 'AI tutor answered directly without Socratic hints', count: 7, pct: 58, bucket: 'Rewrite' },
            { reason: 'Low training value response', count: 5, pct: 42, bucket: 'Rewrite' },
            { reason: 'Factual knowledge error', count: 2, pct: 17, bucket: 'Reject' },
            { reason: 'Tone/language not suitable for students', count: 1, pct: 8, bucket: 'Reject' },
          ];

          const staffData = [
            { name: 'Nguyen Thi A', subject: 'Math', assigned: 6, approved: 6, rate: 100, status: 'Completed' },
            { name: 'Tran Van B', subject: 'Physics', assigned: 5, approved: 4, rate: 80, status: 'Approved' },
            { name: 'Le Thi C', subject: 'Chemistry', assigned: 4, approved: 4, rate: 100, status: 'Completed' },
            { name: 'Pham Van D', subject: 'Biology', assigned: 3, approved: 2, rate: 67, status: 'Pending Review' },
            { name: 'Hoang Thi E', subject: 'History', assigned: 2, approved: 1, rate: 50, status: 'Pending Review' },
          ];

          const realConflicts = results.filter(r => r.recommendation === 'Conflict' || r.diff >= 2.0);
          const conflictData = realConflicts.length > 0 ? realConflicts.map(c => ({
            id: c.sampleIdRef?.sampleId || c.sampleId,
            subject: getSeededSubject(c.sampleIdRef?.sampleId || c.sampleId),
            gemini: c.scores?.gemini || c.scores?.Gemini || null,
            deepseek: c.scores?.deepseek || c.scores?.Deepseek || null,
            human: c.scores?.human || c.scores?.Human || null,
            diff: c.diff,
            resolved: c.resolved
          })) : [
            { id: 'conv_42DE5T_9', subject: 'Physics', gemini: 4.2, deepseek: 7.8, human: null, diff: 3.6, resolved: false },
            { id: 'conv_42D67D_11', subject: 'Biology', gemini: 4.1, deepseek: 7.2, human: null, diff: 3.1, resolved: false },
            { id: 'conv_42D67D_14', subject: 'History', gemini: 4.9, deepseek: 7.1, human: 5.0, diff: 2.2, resolved: true },
          ];

          // Donut arc calculation
          const total = goldCount + rewriteCount + rejectCount;
          const r = 70, circ = 2 * Math.PI * r;
          const goldArc = total > 0 ? (goldCount / total) * circ : 0;
          const rewriteArc = total > 0 ? (rewriteCount / total) * circ : 0;
          const rejectArc = total > 0 ? (rejectCount / total) * circ : 0;

          return (
            <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* PROJECT METADATA HEADER */}
              <div style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 50%, #f0fdf4 100%)', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', position: 'relative', overflow: 'hidden' }}>
                {/* decorative bg circles */}
                <div style={{ position: 'absolute', top: '-20px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, #4f46e520 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-30px', right: '40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, #7c3aed15 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>SEP490-G36</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>v2.4 - Batch 3</span>
                    <span style={{ fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> READY TO EXPORT</span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#0f172a', letterSpacing: '-0.3px' }}>Dataset Distribution Dashboard</h2>
                  <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                    Overview of dataset before export and training - Finished: 12/06/2026
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => window.print()}
                    style={{ padding: '10px 18px', fontSize: '13px', fontWeight: '700', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <Download size={14} /> Export Report
                  </button>
                  <button onClick={handleExportDataset}
                    style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '800', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}>
                    Export Dataset
                  </button>
                </div>
              </div>

              {/* 5 KPI CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
                {[
                  { label: 'Conversations', value: totalConv, sub: `${totalMsg} messages`, color: '#4f46e5', bg: '#eef2ff', Icon: MessageSquare },
                  { label: 'Gold Rate', value: `${goldRate}%`, sub: `${goldCount} / ${totalConv} conv`, color: '#15803d', bg: '#f0fdf4', Icon: Award },
                  { label: 'Avg AI Score', value: avgAIScore, sub: 'Gemini + Deepseek', color: '#0891b2', bg: '#f0f9ff', Icon: Bot },
                  { label: 'Subjects', value: subjectData.length, sub: 'Evenly distributed', color: '#7c3aed', bg: '#f5f3ff', Icon: BookOpen },
                  { label: 'Conflict', value: conflictCount, sub: `${conflictData.filter(c => c.resolved).length} resolved`, color: '#dc2626', bg: '#fff5f5', Icon: AlertTriangle },
                ].map(({ label, value, sub, color, bg, Icon }) => (
                  <div key={label} style={{ background: bg, border: `1.5px solid ${color}22`, borderRadius: '12px', padding: '16px 18px', position: 'relative', overflow: 'hidden', boxShadow: `0 2px 8px ${color}10` }}>
                    <div style={{ position: 'absolute', top: '12px', right: '14px', opacity: 0.25, color }}><Icon size={22} /></div>
                    <div style={{ fontSize: '11px', fontWeight: '800', color, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontSize: '30px', fontWeight: '900', color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '11.5px', color: `${color}bb`, marginTop: '5px', fontWeight: '500' }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* SUBJECT DISTRIBUTION + QUALITY DONUT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
                {/* Subject Distribution */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> Subject Distribution</h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>{subjectData.length} subjects / {totalConv} conversations</p>
                    </div>
                    <button
                      onClick={() => setBalancedSubject(!balancedSubject)}
                      style={{ padding: '7px 13px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: `1.5px solid ${balancedSubject ? '#15803d' : '#e2e8f0'}`, background: balancedSubject ? '#dcfce7' : '#f8fafc', color: balancedSubject ? '#15803d' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s' }}>
                      <Sparkles size={12} />
                      {balancedSubject ? 'Subject balanced' : 'Balance subjects'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {subjectData.map(({ name, conv, pct, color }) => {
                      const displayPct = balancedSubject ? 12.5 : pct;
                      const displayConv = balancedSubject ? Math.round(totalConv / subjectData.length) : conv;
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', minWidth: '76px' }}>{name}</span>
                          <div style={{ flex: 1, height: '14px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${displayPct * 4}%`, background: `linear-gradient(90deg, ${color}bb, ${color})`, borderRadius: '999px', transition: 'width 0.55s ease', boxShadow: `inset 0 1px 2px rgba(255,255,255,0.4)` }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '800', color, minWidth: '78px', textAlign: 'right' }}>{displayConv} ({displayPct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  {balancedSubject && (
                    <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px', fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} /> Rebalanced: every subject adjusted to ~2-3 conv (12.5% each).
                    </div>
                  )}
                </div>

                {/* Quality Donut */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '22px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}><BarChart2 size={14} /> Quality Classification</h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>{total} conversations classified</p>
                    </div>
                    <button
                      onClick={() => setBalancedQuality(!balancedQuality)}
                      style={{ padding: '7px 13px', fontSize: '12px', fontWeight: '700', borderRadius: '8px', border: `1.5px solid ${balancedQuality ? '#15803d' : '#e2e8f0'}`, background: balancedQuality ? '#dcfce7' : '#f8fafc', color: balancedQuality ? '#15803d' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s' }}>
                      <Sparkles size={12} />
                      {balancedQuality ? 'Quality balanced' : 'Balance quality'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                    {/* Donut SVG - larger and with drop shadow */}
                    <div style={{ position: 'relative', width: '190px', height: '190px', flexShrink: 0 }}>
                      <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.10))' }}>
                        <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f5f9" strokeWidth="30" />
                        <circle cx="100" cy="100" r={r} fill="none" stroke="#16a34a" strokeWidth="30"
                          strokeDasharray={`${balancedQuality ? circ * 0.6 : goldArc} ${circ}`} strokeDashoffset="0" strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                        <circle cx="100" cy="100" r={r} fill="none" stroke="#d97706" strokeWidth="30"
                          strokeDasharray={`${balancedQuality ? circ * 0.3 : rewriteArc} ${circ}`} strokeDashoffset={`${-(balancedQuality ? circ * 0.6 : goldArc)}`} style={{ transition: 'all 0.6s ease' }} />
                        <circle cx="100" cy="100" r={r} fill="none" stroke="#dc2626" strokeWidth="30"
                          strokeDasharray={`${balancedQuality ? circ * 0.1 : rejectArc} ${circ}`} strokeDashoffset={`${-(balancedQuality ? circ * 0.9 : goldArc + rewriteArc)}`} style={{ transition: 'all 0.6s ease' }} />
                      </svg>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                        <div style={{ fontSize: '28px', fontWeight: '900', color: '#1e293b', lineHeight: 1 }}>{total}</div>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.5px', marginTop: '3px' }}>TOTAL</div>
                      </div>
                    </div>
                    {/* Legend cards with mini progress bars */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[
                        { label: 'Gold (Excellent)', count: balancedQuality ? 12 : goldCount, pct: balancedQuality ? 60 : goldRate, color: '#16a34a', bg: '#f0fdf4', Icon: Award },
                        { label: 'Rewrite (Edit)', count: balancedQuality ? 6 : rewriteCount, pct: balancedQuality ? 30 : 45, color: '#d97706', bg: '#fffbeb', Icon: Pencil },
                        { label: 'Reject (Drop)', count: balancedQuality ? 2 : rejectCount, pct: balancedQuality ? 10 : 15, color: '#dc2626', bg: '#fff5f5', Icon: Ban },
                      ].map(({ label, count, pct, color, bg, Icon }) => (
                        <div key={label} style={{ padding: '10px 12px', borderRadius: '12px', background: bg, border: `1px solid ${color}25` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                            <Icon size={14} style={{ color }} />
                            <span style={{ fontSize: '12.5px', fontWeight: '700', color, flex: 1 }}>{label}</span>
                            <span style={{ fontSize: '17px', fontWeight: '900', color, lineHeight: 1 }}>{count}</span>
                            <span style={{ fontSize: '11px', color: `${color}99`, fontWeight: '600' }}>({pct}%)</span>
                          </div>
                          <div style={{ height: '5px', background: `${color}18`, borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: '999px', transition: 'width 0.6s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {balancedQuality && (
                    <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px', fontSize: '12px', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} /> Rebalanced: Gold oversampled, Reject undersampled. New rate: 60% / 30% / 10%.
                    </div>
                  )}
                </div>
              </div>

              {/* ── STAFF PERFORMANCE ── */}
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Staff Performance</h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>{staffData.length} staff members contributed to this dataset</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ background: '#dcfce7', borderRadius: '12px', padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#15803d' }}>Completed</div>
                      <div style={{ fontSize: '18px', fontWeight: '900', color: '#15803d' }}>{staffData.filter(s => s.status === 'Completed').length}</div>
                    </div>
                    <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#92400e' }}>Pending Review</div>
                      <div style={{ fontSize: '18px', fontWeight: '900', color: '#92400e' }}>{staffData.filter(s => s.status === 'Pending Review').length}</div>
                    </div>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      {['Staff', 'Subject', 'Submitted / Assigned', 'Approval rate', 'Progress', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffData.map((s, i) => (
                      <tr key={s.name} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
                              {s.name[0]}
                            </div>
                            <span style={{ fontWeight: '700', color: '#1e293b' }}>{s.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#475569' }}>{s.subject}</span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: s.approved === s.assigned ? '#15803d' : '#d97706' }}>
                          {s.approved} / {s.assigned}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: s.rate >= 100 ? '#15803d' : s.rate >= 70 ? '#d97706' : '#dc2626' }}>
                          {s.rate}%
                        </td>
                        <td style={{ padding: '12px 16px', minWidth: '120px' }}>
                          <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${s.rate}%`, background: s.rate >= 100 ? '#16a34a' : s.rate >= 70 ? '#d97706' : '#dc2626', borderRadius: '999px', transition: 'width 0.3s' }} />
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                            background: s.status === 'Completed' ? '#dcfce7' : s.status === 'Approved' ? '#e0e7ff' : '#fef3c7',
                            color: s.status === 'Completed' ? '#15803d' : s.status === 'Approved' ? '#4338ca' : '#92400e'
                          }}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── TOP REASONS + CONFLICT ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Top Reasons */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>Top Reasons for Failure / Rewrite</h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Why samples were classified as Rewrite or Reject</p>
                  </div>
                  <div style={{ padding: '16px' }}>
                    {topReasons.map(({ reason, count, pct, bucket }, idx) => (
                      <div key={idx} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: bucket === 'Rewrite' ? '#fef3c7' : '#fee2e2', color: bucket === 'Rewrite' ? '#92400e' : '#dc2626' }}>{bucket}</span>
                            <span style={{ fontSize: '13px', color: '#334155', fontWeight: '600' }}>{reason}</span>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>{count} samples</span>
                        </div>
                        <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: bucket === 'Rewrite' ? '#d97706' : '#dc2626', borderRadius: '999px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI vs Human Conflict */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7f7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#b91c1c' }}>AI vs Human Conflict</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#dc2626' }}>{conflictData.filter(c => !c.resolved).length} unresolved / {conflictData.length} total</p>
                      </div>
                      <AlertTriangle size={22} style={{ color: '#b91c1c' }} />
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                        {['ID', 'Subject', 'Gemini', 'Deepseek', 'Human', 'Delta', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {conflictData.map(({ id, subject, gemini, deepseek, human, diff, resolved }) => (
                        <tr key={id} style={{ borderBottom: '1px solid #f1f5f9', background: resolved ? '#f0fdf4' : '#fff7f7' }}>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', fontWeight: '700', color: '#1e293b' }}>{id.slice(-6)}</td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569' }}>{subject}</td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#dc2626', fontSize: '13px' }}>{gemini}</td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#16a34a', fontSize: '13px' }}>{deepseek}</td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: human ? '#ea580c' : '#cbd5e1', fontSize: '13px' }}>{human ?? '-'}</td>
                          <td style={{ padding: '10px 12px', fontWeight: '800', color: diff >= 3 ? '#dc2626' : '#d97706', fontSize: '13px' }}>±{diff}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', background: resolved ? '#dcfce7' : '#fee2e2', color: resolved ? '#15803d' : '#dc2626' }}>
                              {resolved ? 'Resolved' : 'Needs action'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 16px', background: '#fafafa', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#64748b' }}>
                    Conflict occurs when AI and Human scores differ by more than 2.0. Resolve before exporting the dataset.
                  </div>
                </div>
              </div>

              {/* Navigation button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button onClick={() => { setCurrentStage(5); setCurrentSubStep5(11); }}
                  style={{ padding: '12px 24px', fontSize: '14px', fontWeight: '700', borderRadius: '8px', border: 'none', background: '#1e293b', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Next: System Prompt &rarr;
                </button>
              </div>

            </div>
          );
        })()}
          </>
        )}
      </div>
    );
  ;
};
