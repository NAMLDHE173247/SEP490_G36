import React, { useState } from 'react';
import {
  BarChart2, Clock, CheckCircle, TrendingUp, Zap, Calendar,
  FileText, Activity, Award, Target, ChevronRight
} from 'lucide-react';
import '../mystats.css';

/* ── Demo personal data (staff nhìn thấy data của mình) ── */
const MY_DATA = {
  name: 'Staff User',
  email: 'staff@fpt.edu.vn',
  tasksAssigned: 5,
  tasksDone: 3,
  samplesAssigned: 180,
  samplesDone: 135,
  completionRate: 75.0,
  labelsPerHour: 7.5,
  avgTimePerSample: 4.8,
  activeDays: 15,
  totalDays: 22,
  streak: 5,
  rank: 2,
  totalStaff: 5,
};

const DAILY_DATA = [6, 10, 8, 12, 9, 0, 0, 11, 14, 7, 13, 10, 9, 12, 7, 0, 0, 11, 15, 10, 8, 0];
const DAY_LABELS = Array.from({ length: 22 }, (_, i) => `${i + 1}/06`);

const WEEKLY_DATA = [
  { week: 'Tuần 1 (01–07)', labels: 45, hours: 6.0 },
  { week: 'Tuần 2 (08–14)', labels: 67, hours: 8.5 },
  { week: 'Tuần 3 (15–21)', labels: 58, hours: 7.2 },
  { week: 'Tuần 4 (22–30)', labels: 18, hours: 2.4 },
];

const TASKS = [
  { id: 'TASK-001', name: 'Gán nhãn Toán 11 — Batch 1', dataset: 'Toan_11', status: 'completed', samples: 40, done: 40, deadline: '2026-06-03', submittedAt: '2026-06-02 10:30' },
  { id: 'TASK-002', name: 'Gán nhãn Vật lý — Batch 2', dataset: 'Vatly_12', status: 'completed', samples: 35, done: 35, deadline: '2026-06-04', submittedAt: '2026-06-03 14:30' },
  { id: 'TASK-004', name: 'Gán nhãn Toán 11 — Batch 2', dataset: 'Toan_11', status: 'completed', samples: 40, done: 40, deadline: '2026-06-10', submittedAt: '2026-06-05 09:00' },
  { id: 'TASK-003', name: 'Gán nhãn Hóa học — Batch 1', dataset: 'Hoahoc_10', status: 'in_progress', samples: 30, done: 12, deadline: '2026-06-08', submittedAt: null },
  { id: 'TASK-005', name: 'Gán nhãn Sinh học — Batch 1', dataset: 'Sinhhoc_11', status: 'pending', samples: 25, done: 0, deadline: '2026-06-12', submittedAt: null },
];

const ACTIVITY_LOG = [
  { time: '2026-06-03 14:30', action: 'Submitted', detail: 'TASK-002 — Gán nhãn Vật lý Batch 2 (35 samples)' },
  { time: '2026-06-03 12:15', action: 'Saved Draft', detail: 'TASK-003 — Gán nhãn Hóa học Batch 1 (12/30)' },
  { time: '2026-06-03 09:00', action: 'Started', detail: 'TASK-003 — Gán nhãn Hóa học Batch 1' },
  { time: '2026-06-02 10:30', action: 'Submitted', detail: 'TASK-001 — Gán nhãn Toán 11 Batch 1 (40 samples)' },
  { time: '2026-06-02 08:30', action: 'Started', detail: 'TASK-002 — Gán nhãn Vật lý Batch 2' },
  { time: '2026-06-01 16:00', action: 'Submitted', detail: 'TASK-004 — Gán nhãn Toán 11 Batch 2 (40 samples)' },
  { time: '2026-06-01 08:00', action: 'Started', detail: 'TASK-001 — Gán nhãn Toán 11 Batch 1' },
];

const TIME_FILTERS = [
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'all', label: 'Tất cả' },
];

function MyStatsView() {
  const [timeFilter, setTimeFilter] = useState('month');
  const maxDaily = Math.max(...DAILY_DATA);
  const maxWeeklyLabels = Math.max(...WEEKLY_DATA.map(w => w.labels));

  return (
    <div className="ms-container">
      {/* Header */}
      <div className="ms-header">
        <div className="ms-header-left">
          <div className="ms-icon-wrapper"><BarChart2 size={24} /></div>
          <div>
            <h2>Thống kê cá nhân</h2>
            <p className="ms-subtitle">Theo dõi tiến độ và năng suất gán nhãn của bạn</p>
          </div>
        </div>
        <div className="ms-time-tabs">
          {TIME_FILTERS.map(tf => (
            <button key={tf.key}
              className={`ms-time-tab ${timeFilter === tf.key ? 'active' : ''}`}
              onClick={() => setTimeFilter(tf.key)}>
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Summary Cards — NO conflict rate, NO IAA (tránh áp lực tiêu cực) */}
      <div className="ms-cards-row">
        <div className="ms-card">
          <div className="ms-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><CheckCircle size={22} /></div>
          <div className="ms-card-info">
            <span className="ms-card-value">{MY_DATA.samplesDone}<span className="ms-card-unit">/{MY_DATA.samplesAssigned}</span></span>
            <span className="ms-card-label">Samples đã hoàn thành</span>
            <div className="ms-card-bar">
              <div className="ms-card-bar-fill" style={{ width: `${MY_DATA.completionRate}%` }}></div>
            </div>
          </div>
        </div>
        <div className="ms-card">
          <div className="ms-card-icon" style={{ background: '#fff7ed', color: '#f59e0b' }}><Zap size={22} /></div>
          <div className="ms-card-info">
            <span className="ms-card-value">{MY_DATA.labelsPerHour}<span className="ms-card-unit"> labels/giờ</span></span>
            <span className="ms-card-label">Tốc độ gán nhãn</span>
          </div>
        </div>
        <div className="ms-card">
          <div className="ms-card-icon" style={{ background: '#f0fdf4', color: '#10b981' }}><Clock size={22} /></div>
          <div className="ms-card-info">
            <span className="ms-card-value">{MY_DATA.avgTimePerSample}<span className="ms-card-unit"> phút</span></span>
            <span className="ms-card-label">TB Thời gian/sample</span>
          </div>
        </div>
        <div className="ms-card">
          <div className="ms-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Award size={22} /></div>
          <div className="ms-card-info">
            <span className="ms-card-value">🔥 {MY_DATA.streak}<span className="ms-card-unit"> ngày</span></span>
            <span className="ms-card-label">Chuỗi hoạt động liên tục</span>
          </div>
        </div>
      </div>

      {/* Quick info */}
      <div className="ms-quick-info">
        <div className="ms-qi-item"><Target size={14} /> <strong>{MY_DATA.tasksDone}/{MY_DATA.tasksAssigned}</strong> task hoàn thành</div>
        <div className="ms-qi-item"><Calendar size={14} /> Hoạt động <strong>{MY_DATA.activeDays}/{MY_DATA.totalDays}</strong> ngày</div>
        <div className="ms-qi-item"><TrendingUp size={14} /> Xếp hạng: <strong>#{MY_DATA.rank}/{MY_DATA.totalStaff}</strong></div>
      </div>

      {/* Charts */}
      <div className="ms-charts-row">
        {/* Daily Bar Chart */}
        <div className="ms-chart-card">
          <h3><TrendingUp size={16} /> Labels/ngày (tháng 06)</h3>
          <div className="ms-daily-chart">
            {DAILY_DATA.map((v, i) => (
              <div key={i} className="ms-dc-col" title={`${DAY_LABELS[i]}: ${v} labels`}>
                <div className="ms-dc-bar"
                  style={{
                    height: `${maxDaily > 0 ? Math.max((v / maxDaily) * 100, 3) : 3}%`,
                    background: v === 0 ? '#e2e8f0' : v >= 12 ? 'linear-gradient(to top, #10b981, #34d399)' : 'linear-gradient(to top, #6366f1, #818cf8)'
                  }}></div>
                {i % 3 === 0 && <span className="ms-dc-label">{DAY_LABELS[i]}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="ms-chart-card">
          <h3><BarChart2 size={16} /> Tổng kết theo tuần</h3>
          <div className="ms-weekly-table">
            {WEEKLY_DATA.map((w, i) => (
              <div key={i} className="ms-wt-row">
                <span className="ms-wt-week">{w.week}</span>
                <div className="ms-wt-bar-wrapper">
                  <div className="ms-wt-bar">
                    <div className="ms-wt-fill"
                      style={{ width: `${(w.labels / maxWeeklyLabels) * 100}%` }}></div>
                  </div>
                  <span className="ms-wt-value">{w.labels} labels</span>
                </div>
                <span className="ms-wt-hours">{w.hours}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task History */}
      <div className="ms-section">
        <h3><FileText size={16} /> Lịch sử Task</h3>
        <div className="ms-task-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên Task</th>
                <th>Dataset</th>
                <th>Tiến độ</th>
                <th>Trạng thái</th>
                <th>Deadline</th>
                <th>Submit lúc</th>
              </tr>
            </thead>
            <tbody>
              {TASKS.map(task => {
                const progress = task.samples > 0 ? Math.round((task.done / task.samples) * 100) : 0;
                return (
                  <tr key={task.id}>
                    <td><code>{task.id}</code></td>
                    <td>{task.name}</td>
                    <td>{task.dataset}</td>
                    <td>
                      <div className="ms-prog-cell">
                        <div className="ms-prog-bar">
                          <div className="ms-prog-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                        <span>{task.done}/{task.samples}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`ms-task-status ${task.status}`}>
                        {task.status === 'completed' ? '✅ Xong' : task.status === 'in_progress' ? '🔄 Đang làm' : '⏳ Chờ'}
                      </span>
                    </td>
                    <td>{task.deadline}</td>
                    <td className="ms-time-cell">{task.submittedAt || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Activity Log */}
      <div className="ms-section">
        <h3><Activity size={16} /> Nhật ký hoạt động</h3>
        <div className="ms-activity-list">
          {ACTIVITY_LOG.map((log, i) => (
            <div key={i} className="ms-al-row">
              <div className="ms-al-dot"></div>
              <span className="ms-al-time">{log.time}</span>
              <span className={`ms-al-action ${log.action.toLowerCase().replace(' ', '-')}`}>{log.action}</span>
              <span className="ms-al-detail">{log.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MyStatsView;
