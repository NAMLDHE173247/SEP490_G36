import React from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, AlertCircle, Calendar, Download, FileText, Sparkles, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDataPrep, SUB_STEPS_STAGE4 } from '../DataPrepContext';
import { Tooltip, getPageNumbers } from '../utils';
import './Stage4TrainEval.css';

export const Stage4TrainEval: React.FC = () => {
  const dataPrep = useDataPrep();
  const {
    currentSubStep4, setCurrentSubStep4,
    classPage, setClassPage,
    qualityTab, setQualityTab,
    rewriteConvIdx, setRewriteConvIdx,
    rewriteTab, setRewriteTab,
    sepQualityModal, setSepQualityModal,
    sepDistributionTab, setSepDistributionTab,
    sepEvalRecommendation, setSepEvalRecommendation,
    sepEvalConflictOnly, setSepEvalConflictOnly,
    sepEvalMinScore, setSepEvalMinScore,
    sepRunningClass, setSepRunningClass,
    sepRunningQuality, setSepRunningQuality,
    sepRunningEval, setSepRunningEval,
    sepSubjectFilter, setSepSubjectFilter,
    sepSelectedDistSubject, setSepSelectedDistSubject,
    sepSelectedDistQuality, setSepSelectedDistQuality,
    sepSelectedError, setSepSelectedError,
    sepBalanceApplied, setSepBalanceApplied,
    sepRewriteGenerated, setSepRewriteGenerated,
    sepRewriteDecision, setSepRewriteDecision,
    sepQualityRatings, setSepQualityRatings,
    sepQualityLabels, setSepQualityLabels,
    setCurrentStage,
    stage3Convs
  } = dataPrep;

  const isStepCompleted = (num: number) => {
    if (num < currentSubStep4) return true;
    if (num === 8 && sepSubjectFilter !== 'ALL') return true;
    if (num === 9 && Object.keys(sepQualityLabels).length > 0) return true;
    if (num === 10 && sepBalanceApplied) return true;
    if (num === 11 && sepRewriteDecision === 'ai') return true;
    return false;
  };

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
        { role: 'user', text: 'Co le vi banh xe bi mat duong can lai?' },
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

  const getQualityLabel = (item) => sepQualityLabels[item.id] || (item.bucket === 'Reject' ? 'Bad' : item.bucket);
  const qualityClass = (label) => label === 'Bad' ? 'bad' : label.toLowerCase();

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
      user: 'Tinh dao ham cua x^2 nhu the nao?',
      original: 'Dao ham cua x^2 la 2x.',
      ai: 'Voi ham x^n, dao ham se la n*x^(n-1). Em thu thay n = 2 vao cong thuc do xem ket qua la gi?',
      manual: 'Em con nho quy tac dao ham cua x^n khong? Neu thay n bang 2, em thu viet tung buoc xem sao.',
      intent: 'REQUEST_EXPLANATION',
      action: 'DIRECT_ANSWER',
      expected: 'SCAFFOLDING',
    },
    {
      title: 'CONVERSATION 9',
      user: 'Chien tranh the gioi thu hai bat dau nam nao?',
      original: 'Dap an la 1939.',
      ai: 'Em thu nho lai su kien Duc tan cong Ba Lan. Theo em su kien do dien ra vao nam nao?',
      manual: 'Minh cung nho lai moc su kien nhe: khi Duc tan cong Ba Lan, do la nam nao?',
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
              className={`sub-step ${step.num === currentSubStep4 ? 'active' : ''} ${isStepCompleted(step.num) ? 'completed' : ''}`}
              onClick={() => setCurrentSubStep4(step.num)}
            >
              <div className="sub-step-circle">
                {isStepCompleted(step.num) ? <Check size={14} /> : step.num}
              </div>
              <div className="sub-step-label">{step.label}</div>
            </div>
            {idx < SUB_STEPS_STAGE4.length - 1 && <div className="sub-step-connector" />}
          </React.Fragment>
        ))}
      </div>

      {currentSubStep4 === 8 && (
        <div className="sep490-grid sep490-grid-2-1 sep490-classification">
          <section className="sep490-panel">
            <div className="sep490-panel-head">
              <div>
                <h3>Converted Dataset Preview</h3>
                <p>Conversation preview keeps the old chat-bubble style and supports multi-message dialogs.</p>
              </div>
              <span className="sep490-count">{visibleConversations.length} conversations</span>
            </div>
            <div className="sep490-toolbar">
              <button className="sep490-chip active" onClick={() => setSepSubjectFilter('ALL')}>Show all</button>
              <button className="sep490-chip" onClick={() => setClassPage((p) => (p % Math.max(visibleConversations.length, 1)) + 1)}>Next conversation</button>
              <select className="sep490-select" value={classPage} onChange={(e) => setClassPage(Number(e.target.value))}>
                {visibleConversations.map((conv, idx) => <option key={conv.id} value={idx + 1}>{conv.id}</option>)}
              </select>
            </div>
            <div className="sep490-chat-shell">
              <div className="sep490-chat-head">
                <span className="sep490-mono">{activeConversation.id}</span>
                <span className="sep490-badge indigo">{activeConversation.subject}</span>
              </div>
              <div className="sep490-chat-body">
                {activeConversation.messages.map((msg, idx) => (
                  <div key={idx} className={`sep490-chat-bubble ${msg.role}`}>
                    <span>{msg.role === 'user' ? 'USER' : 'ASSISTANT'}</span>
                    <p>{msg.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="sep490-panel sep490-side">
            <div className="sep490-panel-head compact">
              <h3>Subject Classification</h3>
              <button
                className="sep490-primary"
                onClick={() => {
                  setSepRunningClass(true);
                  window.setTimeout(() => setSepRunningClass(false), 700);
                }}
              >
                <RefreshCw size={14} className={sepRunningClass ? 'sep490-spin' : ''} />
                Run
              </button>
            </div>
            <div className="sep490-kpi">
              <span>Total samples</span>
              <strong>129</strong>
            </div>
            <button className={`sep490-filter-row ${sepSubjectFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setSepSubjectFilter('ALL'); setClassPage(1); }}>
              <span>All samples</span>
              {sepSubjectFilter === 'ALL' && <Check size={15} />}
            </button>
            {baseSubjects.map((item) => (
              <button key={item.group} className={`sep490-filter-row ${sepSubjectFilter === item.group ? 'active' : ''}`} onClick={() => { setSepSubjectFilter(item.group); setClassPage(1); }}>
                <span>{item.group}</span>
                <span>{item.percentage}% <strong>{item.count}</strong>{sepSubjectFilter === item.group && <Check size={15} />}</span>
              </button>
            ))}
            <div className="sep490-note">
              <AlertCircle size={15} />
              Run subject classification before moving into quality and distribution checks.
            </div>
          </aside>
        </div>
      )}

      {currentSubStep4 === 9 && (
        <>
          <section className="sep490-hero-panel">
            <div className="sep490-icon-box"><Sparkles size={22} /></div>
            <div>
              <h3>Pedagogical Quality Management <span>Stage 4</span></h3>
              <p>Review conversation quality, resolve conflicts, and prepare samples for rewrite.</p>
            </div>
            <button
              className="sep490-primary"
              onClick={() => {
                setSepRunningQuality(true);
                window.setTimeout(() => setSepRunningQuality(false), 700);
              }}
            >
              <RefreshCw size={14} className={sepRunningQuality ? 'sep490-spin' : ''} />
              Run Quality Classification
            </button>
          </section>

          <div className="sep490-alert">
            <Check size={15} />
            Assignment labeling check: reviewed <strong>18</strong> / <strong>24</strong> conversations.
          </div>

          <div className="sep490-grid sep490-grid-3-1">
            <main>
              <div className="sep490-tabs">
                {[
                  ['all', 'All', '24 HT / 96 MSG'],
                  ['gold', 'Gold', '6 HT / 24 MSG'],
                  ['rewrite', 'Needs Rewrite', '14 HT / 56 MSG'],
                  ['bad', 'Bad', '4 HT / 16 MSG'],
                ].map(([key, label, sub]) => (
                  <button key={key} className={qualityTab === key ? 'active' : ''} onClick={() => { setQualityTab(key); setSepSelectedError(''); }}>
                    <span>{label}</span>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>

              <div className="sep490-card-grid">
                {filteredQualitySamples.map((item) => {
                  const itemLabel = getQualityLabel(item);
                  return (
                    <button
                      key={item.id}
                      className={`sep490-quality-card ${qualityClass(itemLabel)}`}
                      onClick={() => setSepQualityModal(item)}
                    >
                      <div className="sep490-card-top">
                        <span className="sep490-mono">{item.id}</span>
                        <span className={`sep490-badge ${itemLabel === 'Gold' ? 'emerald' : itemLabel === 'Bad' ? 'rose' : itemLabel === 'Incomplete' ? 'slate' : 'amber'}`}>{itemLabel}</span>
                      </div>
                      <h4>{item.subject}</h4>
                      <p>{item.issue}</p>
                      <div className="sep490-card-meta">
                        <span>{item.messages.length} messages</span>
                        <strong>Score {item.score.toFixed(1)}</strong>
                      </div>
                      <span className="sep490-open-review">Open review</span>
                    </button>
                  );
                })}
              </div>
            </main>

            <aside className="sep490-stack">
              <div className="sep490-panel">
                <div className="sep490-panel-head compact">
                  <h3>Review Progress</h3>
                  <span>18 / 24</span>
                </div>
                <div className="sep490-progress"><span style={{ width: '75%' }} /></div>
                <p className="sep490-muted">75% of conversations have supervisor-ready quality labels.</p>
              </div>
              <div className="sep490-panel danger">
                <h3>Error Pattern</h3>
                {[
                  ['direct-answer', 'Student asks theory -> AI gives direct answer', '68%'],
                  ['low-training-value', 'Low training value or reject-level answer', '32%'],
                ].map(([key, label, width]) => (
                  <button key={key} className={`sep490-error-row ${sepSelectedError === key ? 'active' : ''}`} onClick={() => setSepSelectedError((prev) => prev === key ? '' : key)}>
                    <span>{label}</span>
                    <div className="sep490-progress rose"><span style={{ width }} /></div>
                  </button>
                ))}
              </div>
              <div className="sep490-panel">
                <h3>Adjudication Guide</h3>
                <p className="sep490-muted">Expanded cards show exactly which message failed and why, matching the old project review flow.</p>
              </div>
            </aside>
          </div>
        </>
      )}

      {currentSubStep4 === 10 && (
        <div className="s4-distribution sep490-distribution-old">
          <div className="s4-dist-header">
            <div>
              <h3>Dataset Distribution</h3>
              <p>Overview of subject distribution and data quality metrics.</p>
            </div>
            <div className="s4-dist-actions" style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`s4-btn-outline ${sepBalanceApplied ? 'active' : ''}`}
                onClick={() => setSepBalanceApplied(!sepBalanceApplied)}
                style={{
                  borderColor: sepBalanceApplied ? '#10b981' : '#e2e8f0',
                  color: sepBalanceApplied ? '#10b981' : '#334155',
                  background: sepBalanceApplied ? '#f0fdf4' : '#ffffff',
                }}
              >
                <Sparkles size={14} />
                {sepBalanceApplied ? 'Balanced' : 'Balance Dataset'}
              </button>
              <button className="s4-btn-primary"><Download size={14} /> Export report</button>
            </div>
          </div>

          <div className="s4-dist-stats">
            <div className="s4-stat-card">
              <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-blue">#</span><span className="s4-stat-change s4-change-up">+12%</span></div>
              <div className="s4-stat-value">{subjectTotal}</div>
              <div className="s4-stat-label">TOTAL SAMPLES</div>
            </div>
            <div className="s4-stat-card">
              <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-purple">S</span><span className="s4-stat-badge">stable</span></div>
              <div className="s4-stat-value">{subjectGroups.length - 1}</div>
              <div className="s4-stat-label">SUBJECTS</div>
            </div>
            <div className="s4-stat-card">
              <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-green">✓</span><span className="s4-stat-change s4-change-up">+2.4%</span></div>
              <div className="s4-stat-value">{qualityTotal}</div>
              <div className="s4-stat-label">QUALITY LABELED</div>
            </div>
            <div className="s4-stat-card">
              <div className="s4-stat-icon-row"><span className="s4-stat-icon s4-stat-icon-red">!</span><span className="s4-stat-change s4-change-down">-0.5%</span></div>
              <div className="s4-stat-value">{selectedQuality.count}</div>
              <div className="s4-stat-label">{selectedQuality.label.toUpperCase()}</div>
            </div>
          </div>

          <div className="s4-dist-charts">
            <div className="s4-chart-card">
              <h4><BarChart2 size={16} /> SUBJECT DISTRIBUTION</h4>
              <div className="s4-bar-chart">
                {subjectGroups.map((item) => (
                  <button
                    key={item.group}
                    className={`s4-bar-row s4-bar-row-click ${sepSelectedDistSubject === item.group ? 'active' : ''}`}
                    onClick={() => {
                      setSepSelectedDistSubject(item.group);
                      setSepSubjectFilter(item.group);
                    }}
                  >
                    <span className="s4-bar-label">{item.label}</span>
                    <div className="s4-bar-track">
                      <div className="s4-bar-fill-dist" style={{ width: `${item.percentage}%`, background: item.color }} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="s4-chart-selected">
                Selected: <strong>{selectedSubject.label}</strong> - {selectedSubject.count} samples ({selectedSubject.percentage}%)
              </div>
            </div>

            <div className="s4-chart-card">
              <h4>⏳ QUALITY CLASSIFICATION</h4>
              <div className="s4-donut-container">
                <div className="s4-donut-wrapper" style={{ position: 'relative', width: '230px', height: '230px', flexShrink: 0 }}>
                  <svg viewBox="0 0 200 200" className="s4-donut-svg" style={{ width: '100%', height: '100%' }}>
                    <circle cx="100" cy="100" r="70" fill="none" stroke="#f1f5f9" strokeWidth="28" />
                    <circle cx="100" cy="100" r="70" fill="none" stroke="#10b981" strokeWidth="28" strokeDasharray="175.93 263.89" strokeDashoffset="0" transform="rotate(-90 100 100)" strokeLinecap="round" />
                    <circle cx="100" cy="100" r="70" fill="none" stroke="#f59e0b" strokeWidth="28" strokeDasharray="197.92 241.90" strokeDashoffset="-175.93" transform="rotate(-90 100 100)" />
                    <circle cx="100" cy="100" r="70" fill="none" stroke="#ef4444" strokeWidth="28" strokeDasharray="65.97 373.85" strokeDashoffset="-373.85" transform="rotate(-90 100 100)" />
                  </svg>
                  <div className="s4-donut-center" style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <strong style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', lineHeight: '1.1' }}>{qualityTotal}</strong>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</span>
                  </div>
                </div>
                <div className="s4-donut-legend">
                  {qualityDistribution.slice(0, 3).map(({ label, count, tone }) => (
                    <button
                      key={label}
                      className={`s4-legend-item s4-legend-click ${sepSelectedDistQuality === label ? 'active' : ''}`}
                      onClick={() => {
                        setSepSelectedDistQuality(label);
                        setQualityTab(label.toLowerCase());
                      }}
                      style={sepSelectedDistQuality === label ? (
                        label === 'Gold' ? { borderColor: '#bbf7d0', background: '#f0fdf4' } :
                          label === 'Rewrite' ? { borderColor: '#fde68a', background: '#fffbeb' } :
                            { borderColor: '#fecaca', background: '#fef2f2' }
                      ) : {}}
                    >
                      <span className="s4-legend-dot" style={{ background: tone === 'emerald' ? '#10b981' : tone === 'amber' ? '#f59e0b' : '#ef4444' }} />
                      <span>{label === 'Gold' ? 'Gold (Excellent)' : label === 'Rewrite' ? 'Needs Rewrite' : 'Bad (Reject)'}</span>
                      <strong>{Math.round((count / qualityTotal) * 100)}%</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
      {currentSubStep4 === 11 && (
        <div className="sep490-rewrite">
          <section className="sep490-panel sep490-rewrite-header">
            <div className="sep490-panel-head">
              <div>
                <h3>Rewrite Workspace</h3>
                <p>Review the flagged tutor turn, compare suggestions, and choose the final training response.</p>
              </div>
              <div className="sep490-actions">
                <select className="sep490-select" defaultValue="gemini">
                  <option value="gemini">AI Judge: GEMINI</option>
                  <option value="openai">AI Judge: OPENAI</option>
                  <option value="deepseek">AI Judge: DEEPSEEK</option>
                </select>
                <button className="sep490-outline" onClick={() => { setSepRewriteGenerated(true); setSepRewriteDecision('ai'); }}><Sparkles size={14} /> AI fix all</button>
                <button className="sep490-outline" onClick={() => setSepRewriteDecision('ai')}><Check size={14} /> Quick approve all</button>
                <button className="sep490-primary" onClick={() => setSepRewriteDecision('ai')}><Check size={14} /> Save rewrite</button>
              </div>
            </div>
            <div className="sep490-metric-grid">
              <div><span>Need Rewrite</span><strong>10</strong></div>
              <div><span>AI Suggestions</span><strong>{sepRewriteGenerated ? 11 : 7}</strong></div>
              <div><span>AI Accepted</span><strong>{sepRewriteDecision === 'ai' ? 5 : 4}</strong></div>
              <div><span>Manual Edited</span><strong>2</strong></div>
              <div><span>Original Kept</span><strong>1</strong></div>
            </div>
          </section>

          <div className="sep490-rewrite-workspace">
            <aside className="sep490-panel sep490-rewrite-queue">
              <div className="sep490-panel-head compact">
                <h3>Rewrite Queue</h3>
                <span className="sep490-pill amber">10 pending</span>
              </div>
              {rewriteRows.map((row, idx) => {
                const convNumber = idx + 8;
                return (
                  <button
                    key={row.title}
                    className={rewriteConvIdx === convNumber ? 'active' : ''}
                    onClick={() => setRewriteConvIdx(convNumber)}
                  >
                    <span>{row.title}</span>
                    <strong>{row.intent}</strong>
                    <small>{row.action} {'->'} {row.expected}</small>
                  </button>
                );
              })}
              <div className="sep490-nav-pair">
                <button onClick={() => setRewriteConvIdx(Math.max(8, rewriteConvIdx - 1))}><ChevronLeft size={14} /> Previous</button>
                <button onClick={() => setRewriteConvIdx(Math.min(9, rewriteConvIdx + 1))}>Next <ChevronRight size={14} /></button>
              </div>
            </aside>

            <main className="rw-content sep490-rw-full">
              <div className="rw-turn-card rw-turn-rewrite">
                <div className="rw-turn-header">
                  <span className="rw-turn-title">Turn #1 needs edit</span>
                  <span className="rw-turn-badge-required">REWRITE REQUIRED</span>
                </div>
                <div className="rw-turn-tags">
                  <span className="rw-tag rw-tag-blue">INTENT: {currentRewrite.intent}</span>
                  <span className="rw-tag rw-tag-green">ACTION: {currentRewrite.action}</span>
                  <span className="rw-tag rw-tag-purple">EXPECTED: {currentRewrite.expected}</span>
                </div>

                <div className="rw-turn-columns">
                  <div className="rw-col">
                    <span className="rw-col-title">STUDENT (USER)</span>
                    <div className="rw-col-box">{currentRewrite.user}</div>
                  </div>
                  <div className="rw-col">
                    <span className="rw-col-title">ORIGINAL ANSWER</span>
                    <div className="rw-col-box">{currentRewrite.original}</div>
                  </div>
                  <div className="rw-col rw-col-edit">
                    <div className="rw-col-title-row">
                      <span className="rw-col-title">REWRITE</span>
                      <div className="rw-edit-tabs">
                        {[
                          ['original', 'Original'],
                          ['ai', 'AI'],
                          ['manual', 'Manual'],
                        ].map(([tab, label]) => (
                          <button key={tab} className={`rw-edit-tab ${sepRewriteDecision === tab ? 'active' : ''}`} onClick={() => setSepRewriteDecision(tab)}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {sepRewriteDecision === 'manual' ? (
                      <textarea defaultValue={currentRewrite.manual} className="rw-col-box rw-col-editable sep490-textarea" />
                    ) : (
                      <div className="rw-col-box rw-col-editable">
                        <p>{rewriteText}</p>
                        <p className="rw-hint-text">{sepRewriteDecision === 'ai' ? 'AI suggestion is selected.' : 'Original answer is selected.'}</p>
                      </div>
                    )}
                  </div>
                </div>

                <button className="rw-suggest-btn" onClick={() => { setSepRewriteGenerated(true); setSepRewriteDecision('ai'); }}><Sparkles size={14} /> Generate AI suggestion for this turn</button>
              </div>

              <div className="rw-turn-card rw-turn-context">
                <div className="rw-turn-header">
                  <span className="rw-turn-title">Turn #2 (context only)</span>
                  <span className="rw-turn-badge-ok">VALID - NO EDIT</span>
                </div>
                <div className="rw-turn-columns rw-turn-cols-2">
                  <div className="rw-col">
                    <span className="rw-col-title">STUDENT</span>
                    <div className="rw-col-box">Hinh nhu nam 1939 a.</div>
                  </div>
                  <div className="rw-col">
                    <span className="rw-col-title">AI TUTOR</span>
                    <div className="rw-col-box">Chinh xac. Su kien do thuong duoc xem la moc khoi dau cua cuoc chien.</div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      )}

      <div className="dataprep-actions-row">
        <button className="dataprep-btn-back" onClick={() => {
          if (currentSubStep4 > 8) setCurrentSubStep4(currentSubStep4 - 1);
          else setCurrentStage(3);
        }}>
          Back
        </button>
        <button className="dataprep-btn-next" onClick={() => {
          if (currentSubStep4 < 11) setCurrentSubStep4(currentSubStep4 + 1);
          else setCurrentStage(5);
        }}>
          Next
        </button>
      </div>

      {sepQualityModal && (
        <div className="compare-modal-overlay" onClick={() => setSepQualityModal(null)}>
          <div className="sep490-modal sep490-quality-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sep490-modal-head">
              <div>
                <h3>Quality Review & Pedagogy Finalization</h3>
                <p>{sepQualityModal.id} - {sepQualityModal.subject} - score {sepQualityModal.score.toFixed(1)}</p>
              </div>
              <button className="compare-close-btn" onClick={() => setSepQualityModal(null)}><X size={14} /> Close</button>
            </div>

            <div className="sep490-quality-modal-body">
              <section className="sep490-modal-thread">
                <div className="sep490-review-section-title">Conversation thread</div>
                {sepQualityModal.errorMessageIndex !== null && (
                  <div className="sep490-error-banner">
                    <AlertCircle size={16} />
                    <div>
                      <strong>Error detected at Turn #{sepQualityModal.errorMessageIndex + 1}</strong>
                      <span>{sepQualityModal.reason}</span>
                    </div>
                  </div>
                )}
                {sepQualityModal.messages.map((msg, idx) => (
                  <div key={idx} className={`sep490-review-bubble ${msg.role} ${idx === sepQualityModal.errorMessageIndex ? 'error' : ''}`}>
                    <div>
                      <span>{msg.role === 'user' ? 'Câu hỏi - Học sinh' : 'Câu trả lời - AI Tutor'}</span>
                      <em>#Turn {idx + 1}</em>
                    </div>
                    <div className="sep490-message-tags">
                      <b>{msg.role === 'user' ? 'QUESTION' : 'ANSWER'}</b>
                      <b>{sepQualityModal.subject}</b>
                      {idx === sepQualityModal.errorMessageIndex && <b className="danger">ERROR</b>}
                    </div>
                    <p>{msg.text}</p>
                    {idx === sepQualityModal.errorMessageIndex && <small>{sepQualityModal.reason}</small>}
                  </div>
                ))}
              </section>

              <aside className="sep490-modal-score">
                <div className="sep490-quality-classifier">
                  <strong>Phân loại chất lượng hội thoại</strong>
                  <div>
                    {['Gold', 'Rewrite', 'Bad', 'Incomplete'].map((label) => {
                      const active = getQualityLabel(sepQualityModal) === label;
                      return (
                        <button
                          key={label}
                          className={`${qualityClass(label)} ${active ? 'active' : ''}`}
                          onClick={() => setSepQualityLabels((prev) => ({ ...prev, [sepQualityModal.id]: label }))}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sep490-rubric-grid">
                  {[
                    ['Factuality', sepQualityModal.bucket === 'Reject' ? 2 : 5, 'Correct knowledge, no hallucination.'],
                    ['Socratic method', sepQualityModal.bucket === 'Gold' ? 5 : 2, 'Guides learner instead of answering too soon.'],
                    ['Encouragement', sepQualityModal.bucket === 'Reject' ? 2 : 5, 'Patient and motivating tone.'],
                    ['Vietnamese quality', 5, 'Natural wording and clean grammar.'],
                    ['Completeness', sepQualityModal.bucket === 'Reject' ? 2 : 4, 'No broken or missing context.'],
                    ['Training readiness', Math.max(1, Math.round(sepQualityModal.score / 2)), 'Ready to use for fine-tuning.'],
                  ].map(([name, defaultScore, desc]) => {
                    const score = getQualityScore(sepQualityModal.id, name, defaultScore);
                    return (
                      <div key={name} className="sep490-rubric-card">
                        <div><strong>{name}</strong><span>{score}/5</span></div>
                        <div className="sep490-star-buttons" aria-label={`${score} out of 5`}>
                          {Array.from({ length: 5 }, (_, starIndex) => (
                            <button
                              key={starIndex}
                              className={starIndex < score ? 'filled' : ''}
                              onClick={() => setSepQualityRatings((prev) => ({ ...prev, [`${sepQualityModal.id}-${name}`]: starIndex + 1 }))}
                            >
                              {'★'}
                            </button>
                          ))}
                        </div>
                        <small>{desc}</small>
                      </div>
                    );
                  })}
                </div>

                <div className="sep490-alert amber">
                  <FileText size={15} />
                  <span>{sepQualityModal.reason}</span>
                </div>

                <div className="sep490-review-checks">
                  <strong>Detected issues</strong>
                  {['Wrong fact', 'Direct answer too early', 'Needs supervisor review', 'Vietnamese wording issue'].map((label) => (
                    <label key={label}>
                      <input type="checkbox" defaultChecked={sepQualityModal.bucket !== 'Gold' && label !== 'Wrong fact'} />
                      {label}
                    </label>
                  ))}
                </div>

                <label className="sep490-review-note">
                  Detailed note
                  <textarea defaultValue={sepQualityModal.reason} />
                </label>

                <div className="sep490-actions end">
                  <button className="sep490-outline" onClick={() => { setSepQualityModal(null); setCurrentSubStep4(11); }}>Mark Rewrite</button>
                  <button className="sep490-primary" onClick={() => setSepQualityModal(null)}>Save quality decision</button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};
