import React, { useState } from 'react';
import {
  Users, BarChart2, Clock, TrendingUp, Award, Search, Filter,
  Download, Calendar, ChevronRight, X, Eye, Activity,
  CheckCircle, AlertCircle, FileText, ArrowUpDown, Star, Zap
} from 'lucide-react';
import '../staffstats.css';

/* ── Demo staff data ── */
const STAFF_DATA = [
  {
    id: 'u1', name: 'Nguyễn Văn A', email: 'nguyenvana@fpt.edu.vn', avatar: 'NA',
    tasksAssigned: 5, tasksDone: 4, samplesAssigned: 180, samplesDone: 165,
    completionRate: 91.7, labelsPerHour: 8.5, avgTimePerSample: 4.2,
    activeDays: 18, totalDays: 22, conflictRate: 5.2, iaaScore: 0.87,
    lastActive: '2026-06-03 14:30', joinDate: '2026-05-15',
    dailyData: [8, 12, 10, 15, 9, 0, 0, 11, 14, 8, 13, 10, 9, 12, 7, 0, 0, 11, 15, 10, 8, 14],
    tasks: [
      { id: 'TASK-001', name: 'Gán nhãn Toán 11 — Batch 1', status: 'completed', samples: 40, done: 40, submittedAt: '2026-06-02 10:30' },
      { id: 'TASK-002', name: 'Gán nhãn Toán 11 — Batch 2', status: 'completed', samples: 40, done: 40, submittedAt: '2026-06-03 14:30' },
      { id: 'TASK-006', name: 'Gán nhãn Sinh học 11 — Batch 1', status: 'in_progress', samples: 25, done: 18, submittedAt: null },
      { id: 'TASK-008', name: 'Gán nhãn Toán 11 — Batch 5', status: 'completed', samples: 40, done: 40, submittedAt: '2026-06-01 16:00' },
      { id: 'TASK-010', name: 'Gán nhãn Vật lý — Batch 3', status: 'completed', samples: 35, done: 35, submittedAt: '2026-06-02 09:15' },
    ],
    activityLog: [
      { time: '2026-06-03 14:30', action: 'Submitted', detail: 'TASK-002 — Gán nhãn Toán 11 Batch 2 (40 samples)' },
      { time: '2026-06-03 12:15', action: 'Saved Draft', detail: 'TASK-006 — Gán nhãn Sinh học 11 Batch 1 (18/25)' },
      { time: '2026-06-03 09:00', action: 'Started', detail: 'TASK-006 — Gán nhãn Sinh học 11 Batch 1' },
      { time: '2026-06-02 10:30', action: 'Submitted', detail: 'TASK-001 — Gán nhãn Toán 11 Batch 1 (40 samples)' },
      { time: '2026-06-02 09:15', action: 'Submitted', detail: 'TASK-010 — Gán nhãn Vật lý Batch 3 (35 samples)' },
      { time: '2026-06-01 16:00', action: 'Submitted', detail: 'TASK-008 — Gán nhãn Toán 11 Batch 5 (40 samples)' },
      { time: '2026-06-01 08:30', action: 'Started', detail: 'TASK-001 — Gán nhãn Toán 11 Batch 1' },
    ],
  },
  {
    id: 'u2', name: 'Trần Thị B', email: 'tranthib@fpt.edu.vn', avatar: 'TB',
    tasksAssigned: 4, tasksDone: 3, samplesAssigned: 150, samplesDone: 140,
    completionRate: 93.3, labelsPerHour: 7.2, avgTimePerSample: 5.0,
    activeDays: 16, totalDays: 22, conflictRate: 8.1, iaaScore: 0.82,
    lastActive: '2026-06-03 16:15', joinDate: '2026-05-15',
    dailyData: [6, 10, 8, 12, 11, 0, 0, 9, 13, 7, 10, 8, 11, 9, 6, 0, 0, 10, 12, 8, 7, 11],
    tasks: [
      { id: 'TASK-001', name: 'Gán nhãn Toán 11 — Batch 1', status: 'completed', samples: 40, done: 40, submittedAt: '2026-06-02 11:00' },
      { id: 'TASK-003', name: 'Gán nhãn Vật lý 12 — Batch 1', status: 'completed', samples: 35, done: 35, submittedAt: '2026-06-03 16:15' },
      { id: 'TASK-006', name: 'Gán nhãn Sinh học 11 — Batch 1', status: 'in_progress', samples: 25, done: 20, submittedAt: null },
      { id: 'TASK-009', name: 'Gán nhãn Hóa 10 — Batch 2', status: 'completed', samples: 50, done: 50, submittedAt: '2026-06-01 14:20' },
    ],
    activityLog: [
      { time: '2026-06-03 16:15', action: 'Submitted', detail: 'TASK-003 — Gán nhãn Vật lý 12 Batch 1 (35 samples)' },
      { time: '2026-06-03 10:00', action: 'Saved Draft', detail: 'TASK-006 — Gán nhãn Sinh học 11 Batch 1 (20/25)' },
      { time: '2026-06-02 11:00', action: 'Submitted', detail: 'TASK-001 — Gán nhãn Toán 11 Batch 1 (40 samples)' },
    ],
  },
  {
    id: 'u3', name: 'Lê Minh C', email: 'leminhc@fpt.edu.vn', avatar: 'LC',
    tasksAssigned: 3, tasksDone: 2, samplesAssigned: 100, samplesDone: 85,
    completionRate: 85.0, labelsPerHour: 6.8, avgTimePerSample: 5.3,
    activeDays: 14, totalDays: 22, conflictRate: 10.5, iaaScore: 0.78,
    lastActive: '2026-06-03 11:45', joinDate: '2026-05-18',
    dailyData: [5, 8, 6, 10, 7, 0, 0, 8, 11, 5, 9, 7, 8, 10, 4, 0, 0, 9, 11, 7, 6, 10],
    tasks: [
      { id: 'TASK-003', name: 'Gán nhãn Vật lý 12 — Batch 1', status: 'completed', samples: 35, done: 35, submittedAt: '2026-06-03 11:45' },
      { id: 'TASK-007', name: 'Gán nhãn Toán 11 — Batch 4', status: 'completed', samples: 40, done: 40, submittedAt: '2026-06-02 15:30' },
      { id: 'TASK-011', name: 'Gán nhãn Sinh học — Batch 2', status: 'in_progress', samples: 25, done: 10, submittedAt: null },
    ],
    activityLog: [
      { time: '2026-06-03 11:45', action: 'Submitted', detail: 'TASK-003 — Gán nhãn Vật lý 12 Batch 1 (35 samples)' },
      { time: '2026-06-02 15:30', action: 'Submitted', detail: 'TASK-007 — Gán nhãn Toán 11 Batch 4 (40 samples)' },
    ],
  },
  {
    id: 'u4', name: 'Phạm Hoàng D', email: 'phamhoangd@fpt.edu.vn', avatar: 'PD',
    tasksAssigned: 3, tasksDone: 1, samplesAssigned: 110, samplesDone: 55,
    completionRate: 50.0, labelsPerHour: 5.1, avgTimePerSample: 7.1,
    activeDays: 10, totalDays: 22, conflictRate: 14.2, iaaScore: 0.71,
    lastActive: '2026-06-03 09:00', joinDate: '2026-05-20',
    dailyData: [3, 5, 4, 7, 6, 0, 0, 5, 8, 3, 6, 4, 5, 7, 2, 0, 0, 6, 8, 4, 3, 7],
    tasks: [
      { id: 'TASK-004', name: 'Gán nhãn Vật lý 12 — Batch 2', status: 'in_progress', samples: 35, done: 15, submittedAt: null },
      { id: 'TASK-012', name: 'Gán nhãn Toán 11 — Batch 6', status: 'pending', samples: 40, done: 0, submittedAt: null },
      { id: 'TASK-013', name: 'Gán nhãn Hóa 10 — Batch 3', status: 'completed', samples: 35, done: 35, submittedAt: '2026-06-01 17:00' },
    ],
    activityLog: [
      { time: '2026-06-03 09:00', action: 'Saved Draft', detail: 'TASK-004 — Gán nhãn Vật lý 12 Batch 2 (15/35)' },
      { time: '2026-06-01 17:00', action: 'Submitted', detail: 'TASK-013 — Gán nhãn Hóa 10 Batch 3 (35 samples)' },
    ],
  },
  {
    id: 'u5', name: 'Hoàng Thị E', email: 'hoangthie@fpt.edu.vn', avatar: 'HE',
    tasksAssigned: 2, tasksDone: 1, samplesAssigned: 65, samplesDone: 40,
    completionRate: 61.5, labelsPerHour: 5.8, avgTimePerSample: 6.2,
    activeDays: 8, totalDays: 22, conflictRate: 7.5, iaaScore: 0.84,
    lastActive: '2026-06-02 16:30', joinDate: '2026-05-25',
    dailyData: [0, 0, 0, 4, 6, 0, 0, 5, 8, 3, 7, 5, 0, 6, 0, 0, 0, 5, 8, 4, 3, 6],
    tasks: [
      { id: 'TASK-005', name: 'Gán nhãn Hóa học 10 — Batch 1', status: 'in_progress', samples: 30, done: 5, submittedAt: null },
      { id: 'TASK-014', name: 'Gán nhãn Lý 12 — Batch 4', status: 'completed', samples: 35, done: 35, submittedAt: '2026-06-02 16:30' },
    ],
    activityLog: [
      { time: '2026-06-02 16:30', action: 'Submitted', detail: 'TASK-014 — Gán nhãn Lý 12 Batch 4 (35 samples)' },
    ],
  },
];

const TIME_FILTERS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chọn' },
];

const DAY_LABELS = Array.from({ length: 22 }, (_, i) => `${i + 1}/06`);

function StaffStatsView() {
  const [timeFilter, setTimeFilter] = useState('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('completion');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showExportToast, setShowExportToast] = useState(false);
  const [dateFrom, setDateFrom] = useState('2026-06-01');
  const [dateTo, setDateTo] = useState('2026-06-30');

  // Overall stats
  const totalStaff = STAFF_DATA.length;
  const totalSamples = STAFF_DATA.reduce((s, d) => s + d.samplesDone, 0);
  const avgTimePerSample = (STAFF_DATA.reduce((s, d) => s + d.avgTimePerSample, 0) / totalStaff).toFixed(1);
  const avgLabelsPerHour = (STAFF_DATA.reduce((s, d) => s + d.labelsPerHour, 0) / totalStaff).toFixed(1);
  const topStaff = STAFF_DATA.reduce((best, d) => d.labelsPerHour > best.labelsPerHour ? d : best, STAFF_DATA[0]);

  // Filter & Sort
  let filtered = STAFF_DATA.filter(s =>
    searchQuery.trim() === '' ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'completion': return b.completionRate - a.completionRate;
      case 'speed': return b.labelsPerHour - a.labelsPerHour;
      case 'samples': return b.samplesDone - a.samplesDone;
      case 'iaa': return b.iaaScore - a.iaaScore;
      case 'name': return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  // Bar chart max
  const maxLabelsPerHour = Math.max(...STAFF_DATA.map(s => s.labelsPerHour));

  // Line chart — aggregate daily data
  const maxDaily = Math.max(...DAY_LABELS.map((_, i) => STAFF_DATA.reduce((s, d) => s + (d.dailyData[i] || 0), 0)));

  const handleExport = () => {
    setShowExportToast(true);
    setTimeout(() => setShowExportToast(false), 3000);
  };

  return (
    <div className="ss-container">
      {/* Toast */}
      {showExportToast && (
        <div className="ss-toast">
          <Download size={16} />
          Đã xuất: BaoCaoNangSuat_{dateFrom.replace(/-/g, '')}__{dateTo.replace(/-/g, '')}.xlsx
        </div>
      )}

      {/* Header */}
      <div className="ss-header">
        <div className="ss-header-left">
          <div className="ss-icon-wrapper"><BarChart2 size={24} /></div>
          <div>
            <h2>Thống kê năng suất nhân viên</h2>
            <p className="ss-subtitle">Theo dõi, đánh giá và chấm công nhân viên gán nhãn</p>
          </div>
        </div>
        <div className="ss-header-actions">
          <button className="ss-btn ss-btn-export" onClick={handleExport}>
            <Download size={16} /> Xuất báo cáo Excel
          </button>
        </div>
      </div>

      {/* Time filter */}
      <div className="ss-time-filter">
        <div className="ss-time-tabs">
          {TIME_FILTERS.map(tf => (
            <button key={tf.key}
              className={`ss-time-tab ${timeFilter === tf.key ? 'active' : ''}`}
              onClick={() => setTimeFilter(tf.key)}>
              {tf.label}
            </button>
          ))}
        </div>
        {timeFilter === 'custom' && (
          <div className="ss-date-range">
            <Calendar size={14} />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="ss-date-input" />
            <span>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="ss-date-input" />
          </div>
        )}
      </div>

      {/* 5 Summary Cards */}
      <div className="ss-cards-row">
        <div className="ss-card">
          <div className="ss-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}><Users size={22} /></div>
          <div className="ss-card-info">
            <span className="ss-card-value">{totalStaff}</span>
            <span className="ss-card-label">Tổng Staff</span>
          </div>
        </div>
        <div className="ss-card">
          <div className="ss-card-icon" style={{ background: '#f0fdf4', color: '#10b981' }}><CheckCircle size={22} /></div>
          <div className="ss-card-info">
            <span className="ss-card-value">{totalSamples}</span>
            <span className="ss-card-label">Tổng Samples</span>
          </div>
        </div>
        <div className="ss-card">
          <div className="ss-card-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}><Clock size={22} /></div>
          <div className="ss-card-info">
            <span className="ss-card-value">{avgTimePerSample} phút</span>
            <span className="ss-card-label">TB Thời gian/sample</span>
          </div>
        </div>
        <div className="ss-card">
          <div className="ss-card-icon" style={{ background: '#fff7ed', color: '#f59e0b' }}><Zap size={22} /></div>
          <div className="ss-card-info">
            <span className="ss-card-value">{avgLabelsPerHour}</span>
            <span className="ss-card-label">TB Labels/giờ</span>
          </div>
        </div>
        <div className="ss-card ss-card-top">
          <div className="ss-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Award size={22} /></div>
          <div className="ss-card-info">
            <span className="ss-card-value">{topStaff.name}</span>
            <span className="ss-card-label">🏆 Top năng suất ({topStaff.labelsPerHour} labels/h)</span>
          </div>
        </div>
      </div>

      {/* 2 Charts */}
      <div className="ss-charts-row">
        {/* Bar Chart: Labels/giờ so sánh Staff */}
        <div className="ss-chart-card">
          <h3><BarChart2 size={16} /> So sánh năng suất Staff (Labels/giờ)</h3>
          <div className="ss-bar-chart">
            {STAFF_DATA.map(staff => (
              <div key={staff.id} className="ss-bar-row">
                <span className="ss-bar-name">{staff.name.split(' ').slice(-2).join(' ')}</span>
                <div className="ss-bar-track">
                  <div className="ss-bar-fill"
                    style={{
                      width: `${(staff.labelsPerHour / maxLabelsPerHour) * 100}%`,
                      background: staff.id === topStaff.id ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #6366f1, #818cf8)'
                    }}>
                  </div>
                </div>
                <span className="ss-bar-value">{staff.labelsPerHour}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Line Chart: Xu hướng theo ngày */}
        <div className="ss-chart-card">
          <h3><TrendingUp size={16} /> Xu hướng gán nhãn theo ngày (tổng team)</h3>
          <div className="ss-line-chart">
            <div className="ss-line-y-axis">
              {[maxDaily, Math.round(maxDaily * 0.75), Math.round(maxDaily * 0.5), Math.round(maxDaily * 0.25), 0].map((v, i) => (
                <span key={i} className="ss-line-y-label">{v}</span>
              ))}
            </div>
            <div className="ss-line-area">
              <svg viewBox={`0 0 ${DAY_LABELS.length * 40} 160`} className="ss-line-svg">
                {/* Grid lines */}
                {[0, 40, 80, 120, 160].map(y => (
                  <line key={y} x1="0" y1={y} x2={DAY_LABELS.length * 40} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                {/* Data line */}
                <polyline
                  fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  points={DAY_LABELS.map((_, i) => {
                    const val = STAFF_DATA.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
                    const x = i * 40 + 20;
                    const y = maxDaily > 0 ? 160 - (val / maxDaily) * 150 : 160;
                    return `${x},${y}`;
                  }).join(' ')}
                />
                {/* Area fill */}
                <polygon
                  fill="url(#ss-gradient)" opacity="0.15"
                  points={`20,160 ${DAY_LABELS.map((_, i) => {
                    const val = STAFF_DATA.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
                    const x = i * 40 + 20;
                    const y = maxDaily > 0 ? 160 - (val / maxDaily) * 150 : 160;
                    return `${x},${y}`;
                  }).join(' ')} ${(DAY_LABELS.length - 1) * 40 + 20},160`}
                />
                {/* Dots */}
                {DAY_LABELS.map((_, i) => {
                  const val = STAFF_DATA.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
                  const x = i * 40 + 20;
                  const y = maxDaily > 0 ? 160 - (val / maxDaily) * 150 : 160;
                  return <circle key={i} cx={x} cy={y} r="3.5" fill="#6366f1" stroke="white" strokeWidth="2" />;
                })}
                <defs>
                  <linearGradient id="ss-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="ss-line-x-axis">
                {DAY_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
                  <span key={i} className="ss-line-x-label">{label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ss-toolbar">
        <div className="ss-search-wrapper">
          <Search size={16} className="ss-search-icon" />
          <input type="text" placeholder="Tìm nhân viên..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="ss-search-input" />
        </div>
        <div className="ss-sort-wrapper">
          <ArrowUpDown size={14} />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="ss-sort-select">
            <option value="completion">% Hoàn thành</option>
            <option value="speed">Labels/giờ</option>
            <option value="samples">Samples done</option>
            <option value="iaa">Điểm IAA</option>
            <option value="name">Tên A–Z</option>
          </select>
        </div>
      </div>

      {/* Detail Table — 15 columns */}
      <div className="ss-table-wrapper">
        <table className="ss-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nhân viên</th>
              <th>Task giao</th>
              <th>Task xong</th>
              <th>Samples giao</th>
              <th>Samples xong</th>
              <th>% Hoàn thành</th>
              <th>Labels/giờ</th>
              <th>TB phút/sample</th>
              <th>Ngày hoạt động</th>
              <th>Tỷ lệ Conflict</th>
              <th>Điểm IAA</th>
              <th>Hoạt động gần nhất</th>
              <th>Ngày tham gia</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((staff, idx) => (
              <tr key={staff.id}>
                <td>{idx + 1}</td>
                <td>
                  <div className="ss-staff-cell">
                    <div className="ss-avatar">{staff.avatar}</div>
                    <div>
                      <span className="ss-staff-name">{staff.name}</span>
                      <span className="ss-staff-email">{staff.email}</span>
                    </div>
                  </div>
                </td>
                <td>{staff.tasksAssigned}</td>
                <td>{staff.tasksDone}</td>
                <td>{staff.samplesAssigned}</td>
                <td><strong>{staff.samplesDone}</strong></td>
                <td>
                  <div className="ss-completion-cell">
                    <div className="ss-mini-bar">
                      <div className="ss-mini-fill"
                        style={{
                          width: `${staff.completionRate}%`,
                          background: staff.completionRate >= 80 ? '#10b981' : staff.completionRate >= 50 ? '#f59e0b' : '#ef4444'
                        }}></div>
                    </div>
                    <span>{staff.completionRate}%</span>
                  </div>
                </td>
                <td>
                  <span className={`ss-speed-badge ${staff.labelsPerHour >= 7 ? 'fast' : staff.labelsPerHour >= 5 ? 'normal' : 'slow'}`}>
                    {staff.labelsPerHour}
                  </span>
                </td>
                <td>{staff.avgTimePerSample} phút</td>
                <td>
                  <span className="ss-days-badge">{staff.activeDays}/{staff.totalDays} ngày</span>
                </td>
                <td>
                  <span className={`ss-conflict-badge ${staff.conflictRate > 10 ? 'high' : staff.conflictRate > 6 ? 'medium' : 'low'}`}>
                    {staff.conflictRate}%
                  </span>
                </td>
                <td>
                  <span className={`ss-iaa-badge ${staff.iaaScore >= 0.85 ? 'good' : staff.iaaScore >= 0.75 ? 'fair' : 'poor'}`}>
                    {staff.iaaScore}
                  </span>
                </td>
                <td className="ss-time-cell">{staff.lastActive}</td>
                <td className="ss-time-cell">{staff.joinDate}</td>
                <td>
                  <button className="ss-detail-btn" onClick={() => setSelectedStaff(staff)}>
                    <Eye size={14} /> Chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Staff Detail Modal */}
      {selectedStaff && (
        <div className="ss-modal-overlay" onClick={() => setSelectedStaff(null)}>
          <div className="ss-modal" onClick={e => e.stopPropagation()}>
            <div className="ss-modal-header">
              <div className="ss-modal-title">
                <div className="ss-avatar lg">{selectedStaff.avatar}</div>
                <div>
                  <h3>{selectedStaff.name}</h3>
                  <span>{selectedStaff.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedStaff(null)}><X size={20} /></button>
            </div>
            <div className="ss-modal-body">
              {/* Personal stats */}
              <div className="ss-modal-stats">
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.labelsPerHour}</span><span className="ss-ms-label">Labels/giờ</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.completionRate}%</span><span className="ss-ms-label">Hoàn thành</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.samplesDone}</span><span className="ss-ms-label">Samples xong</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.iaaScore}</span><span className="ss-ms-label">Điểm IAA</span></div>
              </div>

              {/* Personal chart */}
              <div className="ss-modal-chart">
                <h4><TrendingUp size={14} /> Biểu đồ cá nhân (Labels/ngày)</h4>
                <div className="ss-personal-chart">
                  {selectedStaff.dailyData.map((v, i) => (
                    <div key={i} className="ss-pc-bar-wrapper" title={`${DAY_LABELS[i]}: ${v} labels`}>
                      <div className="ss-pc-bar"
                        style={{
                          height: `${Math.max((v / Math.max(...selectedStaff.dailyData)) * 100, 2)}%`,
                          background: v === 0 ? '#e2e8f0' : 'linear-gradient(to top, #6366f1, #818cf8)'
                        }}></div>
                      {i % 3 === 0 && <span className="ss-pc-label">{DAY_LABELS[i]}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Task history */}
              <div className="ss-modal-section">
                <h4><FileText size={14} /> Lịch sử Task</h4>
                <div className="ss-task-history">
                  {selectedStaff.tasks.map(task => (
                    <div key={task.id} className="ss-th-row">
                      <code>{task.id}</code>
                      <span className="ss-th-name">{task.name}</span>
                      <span className="ss-th-progress">{task.done}/{task.samples}</span>
                      <span className={`ss-th-status ${task.status}`}>
                        {task.status === 'completed' ? '✅ Xong' : task.status === 'in_progress' ? '🔄 Đang làm' : '⏳ Chờ'}
                      </span>
                      {task.submittedAt && <span className="ss-th-time">{task.submittedAt}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Log */}
              <div className="ss-modal-section">
                <h4><Activity size={14} /> Activity Log</h4>
                <div className="ss-activity-log">
                  {selectedStaff.activityLog.map((log, i) => (
                    <div key={i} className="ss-al-row">
                      <span className="ss-al-time">{log.time}</span>
                      <span className={`ss-al-action ${log.action.toLowerCase().replace(' ', '-')}`}>{log.action}</span>
                      <span className="ss-al-detail">{log.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffStatsView;
