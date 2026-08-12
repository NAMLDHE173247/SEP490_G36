import React, { useState } from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, AlertCircle, Calendar, Download, FileText, Sparkles, MessageSquare, ChevronLeft, ChevronRight, Play, ChevronDown } from 'lucide-react';
import { useDataPrep } from '../DataPrepContext';
import { Tooltip, getPageNumbers } from '../utils';
import { useStage4Data } from '../../../hooks/useStage4Data';
import './Stage5Evaluation.css';

export const Stage5Evaluation: React.FC = () => {
  const dataPrep = useDataPrep();
  const versionId = window.localStorage.getItem('current_version_id');
  const { results, latestJob, runMultiEval, error: multiEvalError } = useStage4Data(versionId);
  const {
    currentSubStep5, setCurrentSubStep5,
    judgeModels, setJudgeModels,
    evalExpanded, setEvalExpanded,
    sepSelectedDistSubject,
    sepSelectedDistQuality,
    setCurrentStage,
    sepEvalRecommendation, setSepEvalRecommendation,
    sepEvalConflictOnly, setSepEvalConflictOnly,
    sepEvalMinScore, setSepEvalMinScore,
    sepRunningEval, setSepRunningEval
  } = dataPrep;
  const isEvalRunning = sepRunningEval || latestJob?.status === 'running' || latestJob?.status === 'pending';


  const demoEvalItems = [
    {
      id: 'eval_428051',
      subject: 'MATH',
      score: 4.3,
      recommendation: 'Reject',
      conflict: true,
      messages: [
        ['Student', 'Em khong hieu dao ham cua x^2 tinh the nao a?'],
        ['AI Tutor', 'Hay nho quy tac dao ham cua x^n va thu ap dung voi n = 2.'],
        ['Student', 'Hinh nhu la n*x^(n-1) a?'],
      ],
      models: [
        { name: 'GEMINI 2.5 FLASH', rec: 'Reject', score: 4.0, color: 'rose' },
        { name: 'DEEPSEEK V4 FLASH', rec: 'Pass', score: 7.8, color: 'emerald' },
        { name: 'GPT 5.6 LUNA', rec: 'Need Rewrite', score: 6.2, color: 'amber' },
      ],
    },
    {
      id: 'eval_42D67D',
      subject: 'PHYSICAL',
      score: 8.7,
      recommendation: 'Pass',
      conflict: false,
      messages: [
        ['Student', 'Luc ma sat la gi a?'],
        ['AI Tutor', 'Em thu nghi xem vi sao xe phanh lai dung duoc tren mat duong?'],
      ],
      models: [
        { name: 'GEMINI 2.5 FLASH', rec: 'Pass', score: 8.8, color: 'emerald' },
        { name: 'DEEPSEEK V4 FLASH', rec: 'Pass', score: 8.4, color: 'emerald' },
      ],
    },
  ];

  const modelLabels: Record<string, string> = {
    gemini: 'GEMINI 2.5 FLASH',
    deepseek: 'DEEPSEEK V4 FLASH',
    openai: 'GPT 5.6 LUNA',
  };
  const evalItems = results.length > 0 ? results.map((result: any) => ({
    id: String(result.sampleIdRef?.sampleId || result.sampleIdRef?._id || result.sampleId || result._id),
    subject: result.subject || 'UNGROUPED',
    score: Number(result.averageOverall ?? result.averageScore ?? 0),
    recommendation: result.finalRecommendation || result.recommendation || 'Need Rewrite',
    conflict: Boolean(result.hasConflict),
    messages: (result.sampleIdRef?.data?.messages || []).map((message: any) => [
      message.role === 'assistant' ? 'AI Tutor' : 'Student',
      String(message.content || ''),
    ]),
    models: Object.entries(result.modelScores || {}).map(([name, scorecard]: [string, any]) => ({
      name: modelLabels[name] || name.toUpperCase(),
      rec: scorecard?.recommendation || 'Need Rewrite',
      score: Number(scorecard?.overall || 0),
      color: scorecard?.recommendation === 'Pass' ? 'emerald' : scorecard?.recommendation === 'Reject' ? 'rose' : 'amber',
    })),
  })) : demoEvalItems;

  const visibleEvalItems = evalItems.filter((item) => {
    const matchesRec = sepEvalRecommendation === 'all' || item.recommendation === sepEvalRecommendation;
    const matchesConflict = !sepEvalConflictOnly || item.conflict;
    const matchesScore = item.score >= Number(sepEvalMinScore || 0);
    return matchesRec && matchesConflict && matchesScore;
  });

  return (
    <div className="dataprep-stage2 sep490-stage">
      <div className="sep490-grid sep490-grid-1-2">
        <section className="sep490-panel">
          <div className="sep490-panel-head compact">
            <h3>AI Judge Setup</h3>
            <span className="sep490-pill indigo">1-3 models</span>
          </div>
          <div className="sep490-check-list">
            {[
              ['gemini', 'Gemini 2.5 Flash', 'Fast education-quality judge'],
              ['deepseek', 'DeepSeek V4 Flash', 'Advanced logic and factuality judge'],
              ['openai', 'GPT 5.6 Luna', 'Independent high-precision verification'],
            ].map(([key, label, desc]) => (
              <label key={key} className={judgeModels[key] ? 'active' : ''}>
                <input
                  type="checkbox"
                  checked={judgeModels[key]}
                  onChange={() => setJudgeModels((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
                <span><strong>{label}</strong><small>{desc}</small></span>
              </label>
            ))}
          </div>
          <label className="sep490-field">
            Context window
            <select className="sep490-select">
              <option>n - 2 to n + 2 (recommended)</option>
              <option>n - 1 to n + 1</option>
              <option>Whole conversation</option>
            </select>
          </label>
          <button
            className="sep490-primary full"
            disabled={!versionId || isEvalRunning || Object.values(judgeModels).every((enabled) => !enabled)}
            onClick={async () => {
              const selectedModels = Object.entries(judgeModels).filter(([, enabled]) => enabled).map(([name]) => name);
              setSepRunningEval(true);
              try {
                await runMultiEval(selectedModels, 'n - 2 to n + 2', 2);
              } catch (runError: any) {
                window.alert(runError?.message || 'Không thể khởi chạy Multi-Eval.');
              } finally {
                setSepRunningEval(false);
              }
            }}
          >
            <Sparkles size={14} className={isEvalRunning ? 'sep490-spin' : ''} />
            {isEvalRunning ? 'AI verification is running...' : 'Start AI verification & refinement'}
          </button>
          {!versionId && <small style={{ color: '#b91c1c' }}>Chưa có Dataset Version đang hoạt động.</small>}
          {multiEvalError && <small style={{ color: '#b91c1c' }}>{multiEvalError}</small>}
        </section>

        <section className="sep490-panel">
          <div className="sep490-panel-head compact">
            <h3>Verification Status</h3>
            <span className={`sep490-pill ${latestJob?.status === 'failed' ? 'rose' : 'emerald'}`}>{isEvalRunning ? 'RUNNING' : latestJob?.status?.toUpperCase() || 'READY'}</span>
          </div>
          <div className="sep490-progress large"><span style={{ width: `${latestJob?.progress?.total ? Math.round((latestJob.progress.evaluated / latestJob.progress.total) * 100) : isEvalRunning ? 5 : 0}%` }} /></div>
          <div className="sep490-status-grid">
            <div><span>Evaluated</span><strong>{latestJob?.progress?.evaluated || 0}</strong></div>
            <div><span>Processing</span><strong>{latestJob?.progress?.processing || 0}</strong></div>
            <div><span>Auto refined</span><strong>2</strong></div>
            <div><span>API errors</span><strong>{latestJob?.progress?.failed || 0}</strong></div>
            <div><span>Conflicts</span><strong className="amber">{latestJob?.progress?.conflictCount || 0}</strong></div>
          </div>
        </section>
      </div>

      <div className="sep490-filterbar">
        <span><Sparkles size={14} /> Auto filter</span>
        <label>Recommendation
          <select value={sepEvalRecommendation} onChange={(e) => setSepEvalRecommendation(e.target.value)}>
            <option value="all">All</option>
            <option value="Pass">Pass</option>
            <option value="Need Rewrite">Need Rewrite</option>
            <option value="Reject">Reject</option>
          </select>
        </label>
        <label>Min score
          <input type="number" min="0" max="10" step="0.5" value={sepEvalMinScore} onChange={(e) => setSepEvalMinScore(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="sep490-inline-check">
          <input type="checkbox" checked={sepEvalConflictOnly} onChange={() => setSepEvalConflictOnly(!sepEvalConflictOnly)} />
          Conflict only
        </label>
        <button className="sep490-outline"><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="sep490-stack">
        {visibleEvalItems.length === 0 ? (
          <div className="sep490-empty">No evaluation result matches this filter.</div>
        ) : visibleEvalItems.map((item) => (
          <section key={item.id} className="sep490-eval-card">
            <div className="sep490-eval-head" onClick={() => setEvalExpanded(evalExpanded === item.id ? "" : item.id)}>
              <div>
                <span className={`sep490-score ${item.score >= 8 ? 'emerald' : item.score >= 6 ? 'amber' : 'rose'}`}>{item.score.toFixed(1)} / 10</span>
                {item.conflict && <span className="sep490-badge rose">Conflict</span>}
                <strong>{item.subject} - sample #{item.id.slice(-6).toUpperCase()}</strong>
              </div>
              <div>
                <span className={`sep490-badge ${item.recommendation === 'Pass' ? 'emerald' : item.recommendation === 'Reject' ? 'rose' : 'amber'}`}>Suggest: {item.recommendation}</span>
                <ChevronDown size={16} style={{ transform: evalExpanded === item.id ? 'rotate(180deg)' : 'none' }} />
              </div>
            </div>
            {evalExpanded === item.id && (
              <div className="sep490-eval-body">
                <div className="sep490-context">
                  <div className="sep490-context-head">
                    <span>Conversation context</span>
                    <button>Score history</button>
                  </div>
                  {item.messages.map(([role, content], idx) => (
                    <p key={idx} className={idx === 1 ? 'target' : ''}><strong>{role}:</strong> {content}{idx === 1 && <span>TARGET</span>}</p>
                  ))}
                </div>

                <div className="sep490-model-grid">
                  {item.models.map((model) => (
                    <div key={model.name} className={`sep490-model-card ${model.color}`}>
                      <div><strong>{model.name}</strong><span>{model.rec} ({model.score.toFixed(1)})</span></div>
                      <dl>
                        <dt>Factuality</dt><dd>{Math.min(10, model.score + 0.8).toFixed(1)}/10</dd>
                        <dt>Socratic</dt><dd>{Math.max(0, model.score - 0.6).toFixed(1)}/10</dd>
                        <dt>Vietnamese quality</dt><dd>{Math.min(10, model.score + 1).toFixed(1)}/10</dd>
                        <dt>Training readiness</dt><dd>{model.score.toFixed(1)}/10</dd>
                      </dl>
                      <p>The response is checked for correctness, Socratic guidance, context fit, and training readiness.</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="dataprep-actions-row">
        <button className="dataprep-btn-back" onClick={() => setCurrentStage(4)}>
          Back
        </button>
        <button className="dataprep-btn-next" onClick={() => setCurrentStage(6)}>
          Next
        </button>
      </div>
    </div>
  );

};
