import React, { useState, useEffect } from 'react';
import {
  Users, BarChart2, Clock, TrendingUp, Award, Search, Filter,
  Download, Calendar, ChevronRight, X, Eye, Activity,
  CheckCircle, AlertCircle, FileText, ArrowUpDown, Star, Zap
} from 'lucide-react';
import { api } from '../services/api';
import * as XLSX from 'xlsx';
import '../styles/staffstats.css';

const TIME_FILTERS = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chọn' },
];

const DAY_LABELS = Array.from({ length: 22 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (21 - i));
  return `${d.getDate()}/${d.getMonth() + 1}`;
});

function StaffStatsView() {
  const [staffData, setStaffData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('completion');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [showExportToast, setShowExportToast] = useState(false);
  const [dateFrom, setDateFrom] = useState('2026-06-01');
  const [dateTo, setDateTo] = useState('2026-06-30');

  const fetchStaffStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/dataprep/assignments/staff-stats');
      if (res.data?.success) {
        setStaffData(res.data.data || []);
      } else {
        setError(res.data?.error || 'Lấy thống kê thất bại.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Lỗi kết nối server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffStats();
  }, []);

  const handleExport = () => {
    try {
      if (!filtered || filtered.length === 0) {
        alert('Không có dữ liệu để xuất báo cáo.');
        return;
      }

      // 1. Prepare raw data for Excel
      const excelData = filtered.map((staff, idx) => ({
        'STT': idx + 1,
        'Họ và tên': staff.name,
        'Email': staff.email,
        'Số dự án tham gia': staff.projectsParticipated,
        'Số task hoàn thành': `${staff.tasksDone}/${staff.tasksAssigned}`,
        'Tổng số mẫu được giao': staff.samplesAssigned,
        'Tổng số mẫu gán nhãn xong': staff.samplesDone,
        'Tỷ lệ hoàn thành (%)': `${staff.completionRate}%`,
        'Tốc độ (nhãn/giờ)': staff.labelsPerHour,
        'TB phút/sample': staff.avgTimePerSample,
        'Ngày hoạt động': staff.activeDays,
        'Tỷ lệ Conflict (%)': `${staff.conflictRate}%`,
        'Tỉ lệ gán nhãn tốt (%)': `${staff.goodLabelingRate}%`,
        'Tỉ lệ nộp đúng hạn (%)': `${staff.onTimeRate}%`,
        'Hoạt động gần nhất': staff.lastActive,
      }));

      // 2. Create Sheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'KPI_Staff');

      // 3. Auto-fit columns
      const maxLens = Object.keys(excelData[0] || {}).map(key => {
        let maxLen = key.length;
        excelData.forEach(row => {
          const val = String((row as any)[key] || '');
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: maxLen + 3 };
      });
      worksheet['!cols'] = maxLens;

      // 4. Generate and download Excel file using XLSX.writeFile
      const fileName = `BaoCaoNangSuat_Staff_${dateFrom.replace(/-/g, '')}__${dateTo.replace(/-/g, '')}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setShowExportToast(true);
      setTimeout(() => setShowExportToast(false), 3000);
    } catch (err: any) {
      console.error('Lỗi khi xuất excel:', err);
      alert('Đã xảy ra lỗi khi xuất báo cáo Excel: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="ss-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '500px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid #6366f1', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 15px' }} />
          <p style={{ color: '#64748b', fontSize: '14px' }}>Đang tải dữ liệu thống kê hiệu năng...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ss-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '500px' }}>
        <div style={{ textAlign: 'center', background: '#fef2f2', border: '1px solid #fee2e2', padding: '30px', borderRadius: '16px', maxWidth: '420px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}>
          <AlertCircle size={44} style={{ color: '#ef4444', marginBottom: '14px' }} />
          <h3 style={{ color: '#991b1b', marginBottom: '10px', fontSize: '18px', fontWeight: 600 }}>Lỗi tải dữ liệu</h3>
          <p style={{ color: '#b91c1c', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>{error}</p>
          <button className="ss-btn ss-btn-export" style={{ margin: '0 auto', background: '#6366f1', color: 'white' }} onClick={fetchStaffStats}>Tải lại</button>
        </div>
      </div>
    );
  }

  const totalStaff = staffData.length;
  const totalSamples = staffData.reduce((s, d) => s + d.samplesDone, 0);
  const avgTimePerSample = totalStaff > 0 ? (staffData.reduce((s, d) => s + d.avgTimePerSample, 0) / totalStaff).toFixed(1) : '0';
  const avgLabelsPerHour = totalStaff > 0 ? (staffData.reduce((s, d) => s + d.labelsPerHour, 0) / totalStaff).toFixed(1) : '0';
  const topStaff = totalStaff > 0 
    ? staffData.reduce((best, d) => d.labelsPerHour > best.labelsPerHour ? d : best, staffData[0])
    : { name: 'Chưa có', labelsPerHour: 0 };

  let filtered = staffData.filter(s =>
    searchQuery.trim() === '' ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'completion': return b.completionRate - a.completionRate;
      case 'speed': return b.labelsPerHour - a.labelsPerHour;
      case 'samples': return b.samplesDone - a.samplesDone;
      case 'iaa': return b.goodLabelingRate - a.goodLabelingRate;
      case 'name': return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  const maxLabelsPerHour = totalStaff > 0 ? Math.max(...staffData.map(s => s.labelsPerHour)) || 1 : 1;
  const maxDaily = totalStaff > 0 
    ? Math.max(...DAY_LABELS.map((_, i) => staffData.reduce((s, d) => s + (d.dailyData[i] || 0), 0))) || 1
    : 1;

  return (
    <div className="ss-container">
      {showExportToast && (
        <div className="ss-toast">
          <Download size={16} />
          Đã xuất: BaoCaoNangSuat_{dateFrom.replace(/-/g, '')}__{dateTo.replace(/-/g, '')}.xlsx
        </div>
      )}

      <div className="ss-header">
        <div className="ss-header-left">
          <div className="ss-icon-wrapper"><BarChart2 size={24} /></div>
          <div>
            <h2>Thống kê năng suất nhân viên</h2>
            <p className="ss-subtitle">Theo dõi, đánh giá và giám sát KPIs gán nhãn của nhân viên</p>
          </div>
        </div>
        <div className="ss-header-actions">
          <button className="ss-btn ss-btn-export" onClick={handleExport}>
            <Download size={16} /> Xuất báo cáo Excel
          </button>
        </div>
      </div>

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
        {totalStaff > 0 && (
          <div className="ss-card ss-card-top">
            <div className="ss-card-icon" style={{ background: '#fef3c7', color: '#d97706' }}><Award size={22} /></div>
            <div className="ss-card-info">
              <span className="ss-card-value">{topStaff.name}</span>
              <span className="ss-card-label">🏆 Top năng suất ({topStaff.labelsPerHour} labels/h)</span>
            </div>
          </div>
        )}
      </div>

      <div className="ss-charts-row">
        <div className="ss-chart-card">
          <h3><BarChart2 size={16} /> So sánh năng suất Staff (Labels/giờ)</h3>
          <div className="ss-bar-chart">
            {staffData.map(staff => (
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
                {[0, 40, 80, 120, 160].map(y => (
                  <line key={y} x1="0" y1={y} x2={DAY_LABELS.length * 40} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                <polyline
                  fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  points={DAY_LABELS.map((_, i) => {
                    const val = staffData.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
                    const x = i * 40 + 20;
                    const y = maxDaily > 0 ? 160 - (val / maxDaily) * 150 : 160;
                    return `${x},${y}`;
                  }).join(' ')}
                />
                <polygon
                  fill="url(#ss-gradient)" opacity="0.15"
                  points={`20,160 ${DAY_LABELS.map((_, i) => {
                    const val = staffData.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
                    const x = i * 40 + 20;
                    const y = maxDaily > 0 ? 160 - (val / maxDaily) * 150 : 160;
                    return `${x},${y}`;
                  }).join(' ')} ${(DAY_LABELS.length - 1) * 40 + 20},160`}
                />
                {DAY_LABELS.map((_, i) => {
                  const val = staffData.reduce((s, d) => s + (d.dailyData[i] || 0), 0);
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
            <option value="iaa">Tỉ lệ nhãn tốt</option>
            <option value="name">Tên A–Z</option>
          </select>
        </div>
      </div>

      <div className="ss-table-wrapper">
        <table className="ss-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Nhân viên</th>
              <th>Dự án tham gia</th>
              <th>Task xong</th>
              <th>Samples giao</th>
              <th>Samples xong</th>
              <th>% Hoàn thành</th>
              <th>Labels/giờ</th>
              <th>TB phút/sample</th>
              <th>Ngày hoạt động</th>
              <th>Tỷ lệ Conflict</th>
              <th>Gán nhãn tốt</th>
              <th>Đúng deadline</th>
              <th>Hoạt động gần nhất</th>
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
                <td style={{ textAlign: 'center' }}><strong>{staff.projectsParticipated}</strong></td>
                <td>{staff.tasksDone} / {staff.tasksAssigned}</td>
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
                  <span className="ss-days-badge">{staff.activeDays} ngày</span>
                </td>
                <td>
                  <span className={`ss-conflict-badge ${staff.conflictRate > 10 ? 'high' : staff.conflictRate > 6 ? 'medium' : 'low'}`}>
                    {staff.conflictRate}%
                  </span>
                </td>
                <td>
                  <span className={`ss-iaa-badge ${staff.goodLabelingRate >= 85 ? 'good' : staff.goodLabelingRate >= 70 ? 'fair' : 'poor'}`}>
                    {staff.goodLabelingRate}%
                  </span>
                </td>
                <td>
                  <span className={`ss-iaa-badge ${staff.onTimeRate >= 90 ? 'good' : staff.onTimeRate >= 70 ? 'fair' : 'poor'}`}>
                    {staff.onTimeRate}%
                  </span>
                </td>
                <td className="ss-time-cell">{staff.lastActive}</td>
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
              <div className="ss-modal-stats">
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.projectsParticipated}</span><span className="ss-ms-label">Dự án tham gia</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.goodLabelingRate}%</span><span className="ss-ms-label">Nhãn tốt</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.onTimeRate}%</span><span className="ss-ms-label">Đúng deadline</span></div>
                <div className="ss-ms-card"><span className="ss-ms-value">{selectedStaff.samplesDone}</span><span className="ss-ms-label">Samples xong</span></div>
              </div>

              <div className="ss-modal-chart">
                <h4><TrendingUp size={14} /> Biểu đồ cá nhân (Mẫu gán nhãn/ngày)</h4>
                <div className="ss-personal-chart">
                  {selectedStaff.dailyData.map((v: number, i: number) => (
                    <div key={i} className="ss-pc-bar-wrapper" title={`${DAY_LABELS[i]}: ${v} nhãn`}>
                      <div className="ss-pc-bar"
                        style={{
                          height: `${Math.max((v / (Math.max(...selectedStaff.dailyData) || 1)) * 100, 2)}%`,
                          background: v === 0 ? '#e2e8f0' : 'linear-gradient(to top, #6366f1, #818cf8)'
                        }}></div>
                      {i % 3 === 0 && <span className="ss-pc-label">{DAY_LABELS[i]}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ss-modal-section">
                <h4><FileText size={14} /> Lịch sử Task</h4>
                <div className="ss-task-history">
                  {selectedStaff.tasks.map((task: any) => (
                    <div key={task.id} className="ss-th-row">
                      <code>{task.id}</code>
                      <span className="ss-th-name">{task.name}</span>
                      <span className="ss-th-progress">{task.done}/{task.samples}</span>
                      <span className={`ss-th-status ${task.status}`}>
                        {task.status === 'completed' || task.status === 'submitted' || task.status === 'approved'
                          ? `✅ Xong ${task.onTime ? '(Đúng hạn)' : '(Trễ hạn)'}`
                          : task.status === 'in_progress' || task.status === 'draft'
                            ? '🔄 Đang làm'
                            : '⏳ Chờ'}
                      </span>
                      {task.submittedAt && <span className="ss-th-time">{task.submittedAt}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="ss-modal-section">
                <h4><Activity size={14} /> Activity Log</h4>
                <div className="ss-activity-log">
                  {selectedStaff.activityLog.map((log: any, i: number) => (
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
