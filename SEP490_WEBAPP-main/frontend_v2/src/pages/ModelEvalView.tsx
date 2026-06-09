import React, { useState } from 'react';
import { 
  Play, 
  Download, 
  Filter, 
  Eye, 
  MoreVertical,
  BarChart2,
  TrendingUp,
  Award,
  Calendar,
  X
} from 'lucide-react';
import '../modeleval.css';

function ModelEvalView() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const leaderboardData = [
    {
      rank: 1,
      modelName: 'mistral-7b-instruct-v0.2',
      version: 'v0.2.4',
      trend: '+2.3%',
      trendUp: true,
      score: 91.5,
      accuracy: '92.4%',
      f1: '90.8%',
      latency: '128ms',
      cost: '$0.0024',
      lastRun: '2 hours ago'
    },
    {
      rank: 2,
      modelName: 'llama-2-7b-chat-finetuned',
      version: 'v2.3.1',
      trend: '—',
      trendUp: null,
      score: 89.2,
      accuracy: '89.2%',
      f1: '88.7%',
      latency: '142ms',
      cost: '$0.0021',
      lastRun: '2 hours ago'
    },
    {
      rank: 3,
      modelName: 'gpt-neo-2.7b-custom',
      version: 'v1.5.0',
      trend: '-1.2%',
      trendUp: false,
      score: 84.7,
      accuracy: '84.7%',
      f1: '84.1%',
      latency: '98ms',
      cost: '$0.0015',
      lastRun: '2 hours ago'
    },
    {
      rank: 4,
      modelName: 'falcon-7b-instruct',
      version: 'v1.0.0',
      trend: '+0.8%',
      trendUp: true,
      score: 82.1,
      accuracy: '81.9%',
      f1: '82.3%',
      latency: '156ms',
      cost: '$0.0028',
      lastRun: '2 hours ago'
    }
  ];

  const getRankBadge = (rank) => {
    if (rank === 1) return <div className="rank-badge gold"><Award size={16} /></div>;
    if (rank === 2) return <div className="rank-badge silver"><Award size={16} /></div>;
    if (rank === 3) return <div className="rank-badge bronze"><Award size={16} /></div>;
    return <div className="rank-badge standard">{rank}</div>;
  };

  return (
    <div className="eval-view">
      {/* Header */}
      <div className="eval-header">
        <div className="eval-title-group">
          <h1>Model Evaluation Leaderboard</h1>
          <p>Compare model performance across standardized benchmarks</p>
        </div>
        <button className="btn-run-eval" onClick={() => setIsModalOpen(true)}>
          <Play size={16} /> Run Evaluation
        </button>
      </div>

      {/* Filters */}
      <div className="eval-filters-bar">
        <div className="filters-left">
          <div className="filter-label">
            <Filter size={16} /> Filters:
          </div>
          <select className="filter-select">
            <option>All Datasets</option>
          </select>
          <select className="filter-select">
            <option>Composite Score</option>
          </select>
          <select className="filter-select">
            <option>Last 30 Days</option>
          </select>
        </div>
        <button className="btn-outline-eval">
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Leaderboard Table */}
      <div className="eval-table-container">
        <table className="eval-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>MODEL</th>
              <th className="text-right">SCORE</th>
              <th className="text-center">ACCURACY</th>
              <th className="text-center">F1 SCORE</th>
              <th className="text-center">LATENCY</th>
              <th className="text-center">COST</th>
              <th>LAST RUN</th>
              <th className="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardData.map((row, index) => (
              <tr key={index}>
                <td className="col-rank">
                  {getRankBadge(row.rank)}
                </td>
                <td className="col-model">
                  <div className="model-name">{row.modelName}</div>
                  <div className="model-meta">
                    <span className="version-tag">{row.version}</span>
                    {row.trendUp !== null && (
                      <span className={`trend-tag ${row.trendUp ? 'text-success' : 'text-danger'}`}>
                        {row.trendUp ? '↗ ' : '↘ '}{row.trend}
                      </span>
                    )}
                    {row.trendUp === null && (
                      <span className="trend-tag text-muted">{row.trend}</span>
                    )}
                  </div>
                </td>
                <td className="col-score text-right">
                  <div className="score-main">{row.score}</div>
                  <div className="score-sub">/ 100</div>
                </td>
                <td className="text-center font-medium">{row.accuracy}</td>
                <td className="text-center font-medium">{row.f1}</td>
                <td className="text-center font-medium">{row.latency}</td>
                <td className="text-center font-medium">{row.cost}</td>
                <td className="text-muted text-sm flex-center gap-1"><Calendar size={14}/> {row.lastRun}</td>
                <td className="col-actions text-right">
                  <button className="btn-icon"><Eye size={16} /></button>
                  <button className="btn-icon"><MoreVertical size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats Cards */}
      <div className="eval-stats-grid">
        <div className="eval-stat-card">
          <div className="stat-card-header">
            <BarChart2 size={16} className="text-muted" />
            <span className="text-muted text-sm">Avg. Score</span>
          </div>
          <div className="stat-card-body">
            <div className="stat-card-value">86.9</div>
            <div className="stat-card-trend text-success">+1.2% from last week</div>
          </div>
        </div>
        <div className="eval-stat-card">
          <div className="stat-card-header">
            <TrendingUp size={16} className="text-blue" />
            <span className="text-muted text-sm">Top Performer</span>
          </div>
          <div className="stat-card-body">
            <div className="stat-card-value text-md">mistral-7b-instruct</div>
            <div className="stat-card-trend text-muted">91.5 score</div>
          </div>
        </div>
        <div className="eval-stat-card">
          <div className="stat-card-header">
            <Award size={16} className="text-warning" />
            <span className="text-muted text-sm">Total Evals</span>
          </div>
          <div className="stat-card-body">
            <div className="stat-card-value">127</div>
            <div className="stat-card-trend text-muted">Last 30 days</div>
          </div>
        </div>
        <div className="eval-stat-card">
          <div className="stat-card-header">
            <Calendar size={16} className="text-muted" />
            <span className="text-muted text-sm">Latest Run</span>
          </div>
          <div className="stat-card-body">
            <div className="stat-card-value">2h ago</div>
            <div className="stat-card-trend text-muted">mistral-7b-instruct</div>
          </div>
        </div>
      </div>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <div>
                <h2>Run Evaluation</h2>
                <p>Configure and start a new model evaluation</p>
              </div>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Select Models</label>
                <select className="form-input">
                  <option>mistral-7b-instruct-v0.2</option>
                  <option>llama-2-7b-chat-finetuned</option>
                  <option>gpt-neo-2.7b-custom</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Dataset / Benchmark</label>
                <select className="form-input">
                  <option>MMLU (Massive Multitask Language Understanding)</option>
                  <option>HellaSwag</option>
                  <option>TruthfulQA</option>
                  <option>Custom Benchmark</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Number of Samples</label>
                  <input type="number" className="form-input" defaultValue="1000" />
                </div>
                <div className="form-group flex-1">
                  <label>Seed</label>
                  <input type="number" className="form-input" defaultValue="42" />
                </div>
              </div>

              <div className="modal-summary-box">
                <div className="summary-row">
                  <span className="text-muted">Estimated Runtime:</span>
                  <span className="font-medium">~2h 30m</span>
                </div>
                <div className="summary-row">
                  <span className="text-muted">Estimated Cost:</span>
                  <span className="font-medium">$4.80</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-outline-modal" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn-primary-modal" onClick={() => setIsModalOpen(false)}>
                <Play size={16} /> Start Evaluation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelEvalView;
