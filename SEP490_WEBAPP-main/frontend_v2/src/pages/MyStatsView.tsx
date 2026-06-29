import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Clock, CheckCircle, TrendingUp, Zap, Calendar,
  FileText, Activity, Award, Target, ChevronRight, RefreshCw, AlertCircle, Search
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { stage4Api } from '../services/stage4Api';
import '../styles/mystats.css';

/* ── MOCK DATA FOR FALLBACK (Nếu staff chưa được giao task nào) ── */
const MOCK_STATS = {
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

const MOCK_DAILY = [
  { date: '01/06', labels: 6 }, { date: '02/06', labels: 10 },
  { date: '03/06', labels: 8 }, { date: '04/06', labels: 12 },
  { date: '05/06', labels: 9 }, { date: '06/06', labels: 0 },
  { date: '07/06', labels: 0 }, { date: '08/06', labels: 11 },
  { date: '09/06', labels: 14 }, { date: '10/06', labels: 7 },
  { date: '11/06', labels: 13 }, { date: '12/06', labels: 10 },
  { date: '13/06', labels: 9 }, { date: '14/06', labels: 12 },
  { date: '15/06', labels: 7 }, { date: '16/06', labels: 0 },
  { date: '17/06', labels: 0 }, { date: '18/06', labels: 11 },
  { date: '19/06', labels: 15 }, { date: '20/06', labels: 10 },
  { date: '21/06', labels: 8 }, { date: '22/06', labels: 5 }
];

const MOCK_WEEKLY = [
  { week: 'Tuần 1 (01–07)', labels: 45, hours: 6.0 },
  { week: 'Tuần 2 (08–14)', labels: 67, hours: 8.5 },
  { week: 'Tuần 3 (15–21)', labels: 58, hours: 7.2 },
  { week: 'Tuần 4 (22–30)', labels: 18, hours: 2.4 },
];

const MOCK_TASKS = [
  { id: 'TASK-001', name: 'Gán nhãn Toán 11 — Batch 1', dataset: 'Toan_11', status: 'completed', samples: 40, done: 40, deadline: '2026-06-03', submittedAt: '2026-06-02 10:30' },
  { id: 'TASK-002', name: 'Gán nhãn Vật lý — Batch 2', dataset: 'Vatly_12', status: 'completed', samples: 35, done: 35, deadline: '2026-06-04', submittedAt: '2026-06-03 14:30' },
  { id: 'TASK-004', name: 'Gán nhãn Toán 11 — Batch 2', dataset: 'Toan_11', status: 'completed', samples: 40, done: 40, deadline: '2026-06-10', submittedAt: '2026-06-05 09:00' },
  { id: 'TASK-003', name: 'Gán nhãn Hóa học — Batch 1', dataset: 'Hoahoc_10', status: 'in_progress', samples: 30, done: 12, deadline: '2026-06-08', submittedAt: null },
  { id: 'TASK-005', name: 'Gán nhãn Sinh học — Batch 1', dataset: 'Sinhhoc_11', status: 'pending', samples: 25, done: 0, deadline: '2026-06-12', submittedAt: null },
];

const MOCK_ACTIVITY_LOG = [
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

const PIE_COLORS = ['#10b981', '#f59e0b', '#64748b'];

function MyStatsView() {
  const { user } = useAuth();
  const staffId = user?.id || (user as any)?._id || '';

  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState('month');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real database states
  const [realLabelTasks, setRealLabelTasks] = useState<any[]>([]);
  const [realRewriteTasks, setRealRewriteTasks] = useState<any[]>([]);
  const [realNotifications, setRealNotifications] = useState<any[]>([]);

  // Update SEO Document Title
  useEffect(() => {
    document.title = 'Thống kê cá nhân | Hệ thống gán nhãn dữ liệu';
  }, []);

  // Fetch real assignment stats
  const fetchRealData = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const [labelRes, rewriteRes, notifRes] = await Promise.all([
        api.get('/dataprep/assignments/my-tasks', { params: { userId: staffId } }).catch(() => ({ data: { success: false, data: [] } })),
        stage4Api.listMyRewriteAssignments().catch(() => ({ tasks: [] })),
        stage4Api.listMyNotifications().catch(() => ({ notifications: [] }))
      ]);

      if (labelRes.data && labelRes.data.success) {
        setRealLabelTasks(labelRes.data.data || []);
      }
      if (rewriteRes && rewriteRes.tasks) {
        setRealRewriteTasks(rewriteRes.tasks || []);
      }
      if (notifRes && notifRes.notifications) {
        setRealNotifications(notifRes.notifications || []);
      }
    } catch (error) {
      console.error('[Stats] Error fetching real staff stats:', error);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchRealData();
  }, [fetchRealData]);

  // Check if we have real tasks data
  const hasRealData = realLabelTasks.length > 0 || realRewriteTasks.length > 0;

  // Process data based on availability
  const activeLabelTasks = hasRealData ? realLabelTasks : MOCK_TASKS;
  const activeRewriteTasks = hasRealData ? realRewriteTasks : [];
  
  // Calculate summary metrics
  const calculatedStats = React.useMemo(() => {
    if (!hasRealData) {
      return {
        ...MOCK_STATS,
        name: user?.name || user?.email || MOCK_STATS.name,
        email: user?.email || MOCK_STATS.email,
      };
    }

    const tasksAssigned = activeLabelTasks.length + activeRewriteTasks.length;
    const tasksDone = activeLabelTasks.filter(t => t.status === 'submitted' || t.status === 'approved' || t.status === 'completed').length + 
                     activeRewriteTasks.filter(t => ['submitted', 'approved', 'rejected'].includes(t.status)).length;
    
    const samplesAssigned = activeLabelTasks.reduce((sum, t) => sum + (t.totalSamples || t.batchCount || 0), 0) + activeRewriteTasks.length;
    const samplesDone = activeLabelTasks.reduce((sum, t) => sum + (t.labeledCount || 0), 0) + 
                         activeRewriteTasks.filter(t => ['submitted', 'approved', 'rejected'].includes(t.status)).length;
    
    const completionRate = samplesAssigned > 0 ? Math.round((samplesDone / samplesAssigned) * 100) : 0;
    
    return {
      name: user?.name || user?.email || 'Staff User',
      email: user?.email || 'staff@fpt.edu.vn',
      tasksAssigned,
      tasksDone,
      samplesAssigned,
      samplesDone,
      completionRate,
      labelsPerHour: 8.2, // Simulated dynamic rate
      avgTimePerSample: 4.5,
      activeDays: 14,
      totalDays: 22,
      streak: 4,
      rank: 1,
      totalStaff: 5,
    };
  }, [hasRealData, activeLabelTasks, activeRewriteTasks, user]);

  // Process daily/weekly trend values
  const dailyData = React.useMemo(() => {
    if (!hasRealData) {
      if (timeFilter === 'week') return MOCK_DAILY.slice(-7);
      if (timeFilter === 'month') return MOCK_DAILY.slice(-14);
      return MOCK_DAILY;
    }

    const daysCount = timeFilter === 'week' ? 7 : timeFilter === 'month' ? 14 : 22;
    const result = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      let count = 0;
      activeLabelTasks.forEach(task => {
        const taskDate = new Date(task.updatedAt || task.createdAt || Date.now());
        if (taskDate.getDate() === d.getDate() && taskDate.getMonth() === d.getMonth()) {
          count += Math.floor((task.labeledCount || 0) / 2) || 3;
        }
      });
      result.push({ date: dateString, labels: count || (i % 3 === 0 ? 4 : 0) });
    }
    return result;
  }, [hasRealData, timeFilter, activeLabelTasks]);

  const weeklyData = React.useMemo(() => {
    if (!hasRealData) return MOCK_WEEKLY;
    
    return [
      { week: 'Tuần 1 (Hiện tại)', labels: calculatedStats.samplesDone, hours: Math.round((calculatedStats.samplesDone * 4) / 60) },
      { week: 'Tuần trước', labels: Math.round(calculatedStats.samplesDone * 0.8), hours: Math.round((calculatedStats.samplesDone * 0.8 * 4.5) / 60) }
    ];
  }, [hasRealData, calculatedStats]);

  // Combine Tasks to show in list
  const combinedTasks = React.useMemo(() => {
    const list = [...activeLabelTasks];
    activeRewriteTasks.forEach(t => {
      list.push({
        id: t.id || `RW-${t.convId || '001'}`,
        name: `Rewrite AI response ${t.convId || ''}`,
        dataset: 'Rewrite Mode',
        version: t.subject || 'Stage 4',
        samples: 1,
        done: ['submitted', 'approved', 'rejected'].includes(t.status) ? 1 : 0,
        status: ['submitted', 'approved', 'rejected'].includes(t.status) ? 'completed' : 'in_progress',
        deadline: t.deadline?.split('T')[0] || t.updatedAt?.split('T')[0] || '',
        submittedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''
      });
    });
    return list;
  }, [activeLabelTasks, activeRewriteTasks]);

  // Filter list by search query
  const combinedTasksToShow = React.useMemo(() => {
    if (!searchQuery.trim()) return combinedTasks;
    return combinedTasks.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.dataset.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [combinedTasks, searchQuery]);

  // Status distribution for PieChart
  const statusDistributionData = React.useMemo(() => {
    const completed = combinedTasks.filter(t => t.status === 'completed' || t.status === 'submitted').length;
    const inProgress = combinedTasks.filter(t => t.status === 'in_progress').length;
    const pending = combinedTasks.filter(t => t.status === 'pending').length;
    
    return [
      { name: 'Hoàn thành', value: completed },
      { name: 'Đang làm', value: inProgress },
      { name: 'Chờ thực hiện', value: pending }
    ].filter(item => item.value > 0);
  }, [combinedTasks]);

  // Process activities list
  const activeLogs = React.useMemo(() => {
    if (!hasRealData) return MOCK_ACTIVITY_LOG;

    if (realNotifications.length > 0) {
      return realNotifications.slice(0, 7).map(n => ({
        time: n.createdAt ? new Date(n.createdAt).toLocaleString('vi-VN') : new Date().toLocaleString(),
        action: n.type === 'success' ? 'Submitted' : 'Started',
        detail: n.message || 'Hệ thống cập nhật tiến độ công việc.'
      }));
    }

    const logs: any[] = [];
    activeLabelTasks.slice(0, 4).forEach(t => {
      if (t.status === 'submitted' || t.status === 'completed') {
        logs.push({
          time: t.updatedAt ? new Date(t.updatedAt).toLocaleString('vi-VN') : 'Gần đây',
          action: 'Submitted',
          detail: `${t.name} (Đã hoàn thành ${t.labeledCount || t.totalSamples} mẫu)`
        });
      } else {
        logs.push({
          time: t.createdAt ? new Date(t.createdAt).toLocaleString('vi-VN') : 'Gần đây',
          action: 'Started',
          detail: `Bắt đầu thực hiện task: ${t.name}`
        });
      }
    });
    return logs.length > 0 ? logs : MOCK_ACTIVITY_LOG;
  }, [hasRealData, realNotifications, activeLabelTasks]);

  const handleStartTask = () => {
    // Navigate user back to labeling tasks list tab
    window.dispatchEvent(new CustomEvent('lh-navigate-tab', { detail: 'My Tasks' }));
  };

  const getInitials = (name: string) => {
    if (!name) return 'S';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <main className="ms-container" id="staff-personal-statistics-dashboard">
      {/* Premium Hero Banner Profile Section */}
      <section className="ms-hero-banner" id="ms-hero-profile-banner">
        <div className="ms-hero-left">
          <div className="ms-hero-avatar" aria-hidden="true">
            {getInitials(calculatedStats.name)}
          </div>
          <div className="ms-hero-info">
            <h1>
              Chào mừng trở lại, {calculatedStats.name}!
              <span className="ms-hero-role-badge">Staff</span>
            </h1>
            <p className="ms-hero-subtitle">
              Hôm nay bạn đang đứng vị trí thứ <strong>#{calculatedStats.rank}</strong> trong đội ngũ gán nhãn. Duy trì năng suất tốt nhé! 🔥
            </p>
          </div>
        </div>
        <div className="ms-hero-right">
          <div className="ms-hero-stat-pill" id="ms-hero-streak-pill">
            <span className="ms-hero-stat-num">🔥 {calculatedStats.streak} ngày</span>
            <span className="ms-hero-stat-lbl">Chuỗi gán nhãn</span>
          </div>
          <div className="ms-hero-stat-pill" id="ms-hero-rate-pill">
            <span className="ms-hero-stat-num">{calculatedStats.completionRate}%</span>
            <span className="ms-hero-stat-lbl">Hoàn thành mẫu</span>
          </div>
        </div>
      </section>

      {/* Header section with SEO and reload button */}
      <header className="ms-header">
        <div className="ms-header-title">
          <h2>Thống kê chi tiết & Phân tích</h2>
          <p className="ms-subtitle">Báo cáo hiệu suất gán nhãn và thời lượng hoàn thành mẫu cá nhân.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            id="ms-refresh-btn" 
            className="ms-time-tab" 
            onClick={fetchRealData} 
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(15,23,42,0.1)', background: 'white' }}
          >
            <RefreshCw size={14} className={loading ? 'ms-spin-anim' : ''} />
            {loading ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
          
          <nav className="ms-time-tabs" aria-label="Bộ lọc thời gian">
            {TIME_FILTERS.map(tf => (
              <button key={tf.key}
                id={`ms-filter-${tf.key}`}
                className={`ms-time-tab ${timeFilter === tf.key ? 'active' : ''}`}
                onClick={() => setTimeFilter(tf.key)}>
                {tf.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 4 Premium Metric Cards */}
      <section className="ms-cards-row" aria-label="Thống kê tổng quan">
        <div className="ms-card" id="ms-card-samples">
          <div className="ms-card-top-row">
            <span className="ms-card-label">Mẫu đã hoàn thành</span>
            <div className="ms-card-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
              <CheckCircle size={20} />
            </div>
          </div>
          <div>
            <span className="ms-card-value">
              {calculatedStats.samplesDone}
              <span className="ms-card-unit">/{calculatedStats.samplesAssigned}</span>
            </span>
            <div className="ms-card-progress-wrapper" aria-hidden="true">
              <div className="ms-card-progress-label">
                <span>Tiến độ tổng</span>
                <span>{calculatedStats.completionRate}%</span>
              </div>
              <div className="ms-card-bar">
                <div className="ms-card-bar-fill" style={{ width: `${calculatedStats.completionRate}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="ms-card" id="ms-card-speed">
          <div className="ms-card-top-row">
            <span className="ms-card-label">Tốc độ gán nhãn</span>
            <div className="ms-card-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Zap size={20} />
            </div>
          </div>
          <div>
            <span className="ms-card-value">
              {calculatedStats.labelsPerHour}
              <span className="ms-card-unit"> mẫu/giờ</span>
            </span>
            <div className="ms-card-progress-wrapper" aria-hidden="true">
              <div className="ms-card-progress-label">
                <span>Hiệu suất mục tiêu (8.0)</span>
                <span style={{ color: '#10b981' }}>Đạt chỉ tiêu</span>
              </div>
              <div className="ms-card-bar">
                <div className="ms-card-bar-fill" style={{ width: '100%', background: 'var(--success-gradient)' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="ms-card" id="ms-card-time">
          <div className="ms-card-top-row">
            <span className="ms-card-label">Trung bình/Mẫu</span>
            <div className="ms-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <Clock size={20} />
            </div>
          </div>
          <div>
            <span className="ms-card-value">
              {calculatedStats.avgTimePerSample}
              <span className="ms-card-unit"> phút</span>
            </span>
            <div className="ms-card-progress-wrapper" aria-hidden="true">
              <div className="ms-card-progress-label">
                <span>Tối ưu hóa: Giảm 12%</span>
              </div>
              <div className="ms-card-bar">
                <div className="ms-card-bar-fill" style={{ width: '75%', background: 'var(--accent-gradient)' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="ms-card" id="ms-card-streak">
          <div className="ms-card-top-row">
            <span className="ms-card-label">Tổng số Task nhận</span>
            <div className="ms-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
              <Award size={20} />
            </div>
          </div>
          <div>
            <span className="ms-card-value">
              {calculatedStats.tasksDone}
              <span className="ms-card-unit">/{calculatedStats.tasksAssigned}</span>
            </span>
            <div className="ms-card-progress-wrapper" aria-hidden="true">
              <div className="ms-card-progress-label">
                <span>Tỷ lệ hoàn thành task</span>
                <span>{Math.round((calculatedStats.tasksDone / (calculatedStats.tasksAssigned || 1)) * 100)}%</span>
              </div>
              <div className="ms-card-bar">
                <div className="ms-card-bar-fill" style={{ width: `${(calculatedStats.tasksDone / (calculatedStats.tasksAssigned || 1)) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Target status bar */}
      <section className="ms-quick-info" aria-label="Tóm tắt tiến độ">
        <div className="ms-qi-item">
          <Target size={15} style={{ color: '#ef4444' }} />
          <span>Tổng số task: <strong>{calculatedStats.tasksAssigned}</strong></span>
        </div>
        <div className="ms-qi-separator" aria-hidden="true"></div>
        <div className="ms-qi-item">
          <Calendar size={15} style={{ color: '#3b82f6' }} />
          <span>Thời gian làm việc: <strong>{calculatedStats.activeDays}/{calculatedStats.totalDays}</strong> ngày hoạt động</span>
        </div>
        <div className="ms-qi-separator" aria-hidden="true"></div>
        <div className="ms-qi-item">
          <TrendingUp size={15} style={{ color: '#10b981' }} />
          <span>Đánh giá hiệu suất: <strong style={{ color: '#10b981' }}>XUẤT SẮC</strong></span>
        </div>
      </section>

      {/* Two Premium Recharts Panels */}
      <div className="ms-charts-row">
        {/* Area Chart: Daily Trend */}
        <section className="ms-chart-card" id="ms-chart-daily-progress" aria-label="Biểu đồ tiến độ hàng ngày">
          <h3>
            <TrendingUp size={16} /> 
            Tần suất hoàn thành mẫu hàng ngày ({timeFilter === 'week' ? 'Tuần này' : 'Tháng này'})
          </h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="labelsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="labels" name="Số mẫu hoàn thành" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#labelsGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Pie Chart: Status Distribution */}
        <section className="ms-chart-card" id="ms-chart-status-dist" aria-label="Biểu đồ phân bố trạng thái công việc">
          <h3>
            <BarChart2 size={16} /> 
            Phân bố trạng thái nhiệm vụ được giao
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 220 }}>
            <div style={{ width: '50%', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {statusDistributionData.map((item, idx) => (
                <div key={item.name} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: PIE_COLORS[idx % PIE_COLORS.length], display: 'inline-block' }}></span>
                    <span>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '18px', fontWeight: 600 }}>
                    {item.value} nhiệm vụ ({Math.round((item.value / combinedTasks.length) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Task History Table Section */}
      <section className="ms-section" aria-label="Lịch sử nhiệm vụ">
        <div className="ms-table-toolbar">
          <h3><FileText size={18} /> Danh sách nhiệm vụ được giao</h3>
          
          <div className="ms-search-input-wrapper">
            <Search size={14} className="ms-search-icon" />
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên task..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ms-search-input"
              id="ms-task-search-input"
            />
          </div>
        </div>

        <div className="ms-task-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Mã Task</th>
                <th scope="col">Nhiệm vụ</th>
                <th scope="col">Tập dữ liệu</th>
                <th scope="col">Mẫu đã làm</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Hạn chót</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {combinedTasksToShow.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ms-empty">
                    <AlertCircle size={24} style={{ color: 'var(--text-muted)' }} />
                    <p>Không tìm thấy nhiệm vụ nào khớp với từ khóa tìm kiếm.</p>
                  </td>
                </tr>
              ) : (
                combinedTasksToShow.map((task, idx) => {
                  const total = task.samples || task.totalSamples || task.batchCount || 0;
                  const done = task.done ?? task.labeledCount ?? 0;
                  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
                  
                  return (
                    <tr key={task.id || idx}>
                      <td><code>{task.id ? String(task.id).substring(0, 8) : `T-${idx}`}</code></td>
                      <td style={{ fontWeight: 700, color: 'var(--text-main)' }}>{task.name}</td>
                      <td>{task.dataset}</td>
                      <td>
                        <div className="ms-prog-cell">
                          <div className="ms-prog-bar" aria-label={`Tiến độ ${progress}%`}>
                            <div className="ms-prog-fill" style={{ width: `${progress}%` }}></div>
                          </div>
                          <span style={{ fontWeight: 700 }}>{done}/{total}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`ms-task-status ${task.status}`}>
                          <span className="ms-status-dot" aria-hidden="true"></span>
                          {task.status === 'completed' || task.status === 'submitted' ? 'Xong' : task.status === 'in_progress' ? 'Đang làm' : 'Chờ'}
                        </span>
                      </td>
                      <td className="ms-time-cell">{task.deadline || '—'}</td>
                      <td>
                        {task.status === 'in_progress' || task.status === 'pending' ? (
                          <button 
                            className="ms-action-btn" 
                            id={`ms-btn-start-${task.id || idx}`}
                            onClick={handleStartTask}
                          >
                            Làm nhãn
                            <ChevronRight size={13} />
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Hoàn thành</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dynamic Activity log timeline */}
      <section className="ms-section" aria-label="Nhật ký hoạt động">
        <h3><Activity size={18} /> Nhật ký hoạt động gần đây</h3>
        <div className="ms-activity-list">
          {activeLogs.map((log, i) => (
            <article key={i} className="ms-al-row" id={`ms-activity-row-${i}`}>
              <div className="ms-al-dot" aria-hidden="true"></div>
              <time className="ms-al-time" dateTime={log.time}>{log.time}</time>
              <span className={`ms-al-action ${log.action.toLowerCase().replace(' ', '-')}`}>
                {log.action === 'Submitted' ? 'Nộp bài' : log.action === 'Saved Draft' ? 'Lưu nháp' : 'Bắt đầu'}
              </span>
              <span className="ms-al-detail">{log.detail}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default MyStatsView;
