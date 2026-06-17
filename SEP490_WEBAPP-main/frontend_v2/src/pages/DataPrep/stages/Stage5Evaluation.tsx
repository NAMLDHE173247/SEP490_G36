import React, { useState } from 'react';
import { Check, Eye, X, Settings, Database, Plus, Search, HelpCircle, BarChart2, RefreshCw, AlertCircle, Calendar, Download, FileText, Sparkles, MessageSquare, ChevronLeft, ChevronRight, Play, ChevronDown } from 'lucide-react';
import { useDataPrep } from '../DataPrepContext';
import { Tooltip, getPageNumbers } from '../utils';
import './Stage5Evaluation.css';

export const Stage5Evaluation: React.FC = () => {
  const dataPrep = useDataPrep();
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


  const evalItems = [
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
        { name: 'GEMINI', rec: 'Reject', score: 4.0, color: 'rose' },
        { name: 'DEEPSEEK', rec: 'Pass', score: 7.8, color: 'emerald' },
        { name: 'OPENAI', rec: 'Need Rewrite', score: 6.2, color: 'amber' },
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
        { name: 'GEMINI', rec: 'Pass', score: 8.8, color: 'emerald' },
        { name: 'DEEPSEEK', rec: 'Pass', score: 8.4, color: 'emerald' },
      ],
    },
  ];

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
              ['gemini', 'Gemini (Flash 1.5)', 'Default education judge'],
              ['openai', 'OpenAI (GPT-4o)', 'High precision verification'],
              ['deepseek', 'Deepseek (R1/V3)', 'Advanced logic judge'],
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
            onClick={() => {
              setSepRunningEval(true);
              window.setTimeout(() => setSepRunningEval(false), 900);
            }}
          >
            <Sparkles size={14} className={sepRunningEval ? 'sep490-spin' : ''} />
            Start AI verification & refinement
          </button>
        </section>

        <section className="sep490-panel">
          <div className="sep490-panel-head compact">
            <h3>Verification Status</h3>
            <span className="sep490-pill emerald">{sepRunningEval ? 'RUNNING' : 'COMPLETE'}</span>
          </div>
          <div className="sep490-progress large"><span style={{ width: sepRunningEval ? '62%' : '100%' }} /></div>
          <div className="sep490-status-grid">
            <div><span>Evaluated</span><strong>{sepRunningEval ? 6 : 9}</strong></div>
            <div><span>Processing</span><strong>{sepRunningEval ? 3 : 0}</strong></div>
            <div><span>Auto refined</span><strong>2</strong></div>
            <div><span>API errors</span><strong>0</strong></div>
            <div><span>Conflicts</span><strong className="amber">1</strong></div>
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
