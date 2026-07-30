import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, apiService } from '../services/api';
import {
  MessageSquare, Database, Zap, Package, BarChart2, ArrowRight,
  Activity, Clock, Users, UserPlus, UserCheck, Shield, ShieldCheck,
  ShieldAlert, Ban, CheckCircle2, TrendingUp, AlertTriangle,
  ClipboardList, GitBranch, ChevronRight
} from 'lucide-react';
import '../styles/home.css';

const getRelativeTime = (dateStr: any) => {
  if (!dateStr) return '-';
  try {
    const now = new Date();
    const past = new Date(dateStr);
    const diffMs = now.getTime() - past.getTime();
    if (diffMs < 0) return 'Vừa xong';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  } catch {
    return '-';
  }
};

function HomeView({ setActiveTab }) {
  const { user } = useAuth();
  const role = user?.role || 'admin';
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const res = await api.get('/system/dashboard-stats');
        setDashboardStats(res.data);
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (user) {
      fetchDashboardStats();
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="dashboard-loading-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: 'var(--text-muted)',
        gap: '16px'
      }}>
        <div className="spinner" style={{
          width: '40px',
          height: '40px',
          border: '3px solid #f3e8ff',
          borderTop: '3px solid #8b5cf6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ fontSize: '14px', fontWeight: '500' }}>Đang tải dữ liệu hệ thống...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // ==================== ADMIN VIEW ====================
  if (role === 'admin') {
    return <AdminHomeView setActiveTab={setActiveTab} dashboardStats={dashboardStats} />;
  }

  // ==================== SUPERVISOR VIEW ====================
  if (role === 'supervisor') {
    return <SupervisorHomeView setActiveTab={setActiveTab} dashboardStats={dashboardStats} />;
  }

  // ==================== CHECKER VIEW ====================
  if (role === 'checker') {
    return <CheckerHomeView setActiveTab={setActiveTab} dashboardStats={dashboardStats} />;
  }

  // ==================== STAFF VIEW ====================
  return <StaffHomeView setActiveTab={setActiveTab} dashboardStats={dashboardStats} />;
}

/* ──────── ADMIN HOME ──────── */
function AdminHomeView({ setActiveTab, dashboardStats }) {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState([
    { value: '12', label: 'Datasets', color: 'text-primary' },
    { value: '2', label: 'Active Jobs', color: 'text-blue' },
    { value: '18.4 GB', label: 'VRAM Used', color: 'text-green' },
    { value: '10', label: 'Total Users', color: 'text-orange' }
  ]);

  const [accountStats, setAccountStats] = useState({
    total: 10, active: 5, pending: 3, banned: 1, inactive: 1, newThisWeek: 4, growthPercent: 25
  });

  const [recentAccounts, setRecentAccounts] = useState([
    { name: 'Bùi Văn H', email: 'buivanh@fpt.edu.vn', status: 'pending', role: 'Staff', avatar: 'BH', time: '2 hours ago' },
    { name: 'Võ Thanh E', email: 'vothanhe@fpt.edu.vn', status: 'pending', role: 'Staff', avatar: 'VE', time: '5 hours ago' },
    { name: 'Phạm Minh D', email: 'phamminhd@fpt.edu.vn', status: 'pending', role: 'Staff', avatar: 'PD', time: '1 day ago' },
    { name: 'Ngô Thị I', email: 'ngothii@fpt.edu.vn', status: 'active', role: 'Supervisor', avatar: 'NI', time: '3 days ago' },
  ]);

  const [roleDistribution, setRoleDistribution] = useState([
    { role: 'Admin', count: 1, color: '#f59e0b', icon: <ShieldCheck size={14} style={{ color: '#f59e0b' }} /> },
    { role: 'Supervisor', count: 2, color: '#10b981', icon: <ShieldAlert size={14} style={{ color: '#10b981' }} /> },
    { role: 'Staff', count: 7, color: '#6366f1', icon: <Shield size={14} style={{ color: '#6366f1' }} /> },
  ]);

  const [activities, setActivities] = useState([
    { icon: <UserPlus size={18} className="activity-icon-user" />, title: 'New account registered', subtitle: 'Bùi Văn H — Staff', time: '2 hours ago' },
    { icon: <UserCheck size={18} className="activity-icon-approve" />, title: 'Account approved', subtitle: 'Ngô Thị I — Supervisor', time: '3 hours ago' },
    { icon: <Zap size={18} className="activity-icon-zap" />, title: 'Training job completed', subtitle: 'model-v2-llama-8b', time: '5 hours ago' },
    { icon: <Database size={18} className="activity-icon-db" />, title: 'Dataset uploaded', subtitle: 'conversation-data-v3.jsonl', time: '8 hours ago' },
    { icon: <Ban size={18} className="activity-icon-ban" />, title: 'Account banned', subtitle: 'Đỗ Quang F — Staff', time: '1 day ago' },
    { icon: <BarChart2 size={18} className="activity-icon-chart" />, title: 'Evaluation completed', subtitle: 'GPT-4 vs Claude comparison', time: '2 days ago' },
  ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersData, projectsRes, activeJobsRes, systemRes] = await Promise.all([
          apiService.listUsers().catch(() => ({ users: [] })),
          api.get('/dataprep/projects').catch(() => ({ data: { projects: [] } })),
          api.get('/train/active').catch(() => ({ data: [] })),
          api.get('/system/resources').catch(() => ({ data: {} }))
        ]);

        const usersList = usersData.users || [];
        const projectsList = projectsRes.data?.projects || [];
        const activeJobsList = activeJobsRes.data || [];
        const systemData = systemRes.data || {};

        // 1. Calculate user stats
        const total = usersList.length;
        const active = usersList.filter((u: any) => u.status === 'active').length;
        const pending = usersList.filter((u: any) => u.status === 'pending').length;
        const banned = usersList.filter((u: any) => u.status === 'banned').length;
        const inactive = usersList.filter((u: any) => u.status === 'inactive').length;

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const newThisWeek = usersList.filter((u: any) => u.createdAt && new Date(u.createdAt) > oneWeekAgo).length;
        const growthPercent = total > newThisWeek ? Math.round((newThisWeek / (total - newThisWeek)) * 100) : 0;

        setAccountStats({
          total,
          active,
          pending,
          banned,
          inactive,
          newThisWeek,
          growthPercent
        });

        // 2. Calculate Stats row
        const datasetCount = projectsList.length;
        const activeJobsCount = activeJobsList.length;
        
        let vramStr = '18.4 GB';
        if (typeof systemData.vram_used_mb === 'number') {
          vramStr = `${(systemData.vram_used_mb / 1024).toFixed(1)} GB`;
        }

        setStats([
          { value: String(datasetCount), label: 'Datasets', color: 'text-primary' },
          { value: String(activeJobsCount), label: 'Active Jobs', color: 'text-blue' },
          { value: vramStr, label: 'VRAM Used', color: 'text-green' },
          { value: String(total), label: 'Total Users', color: 'text-orange' }
        ]);

        // 3. Role distribution
        const adminCount = usersList.filter((u: any) => u.role === 'admin').length;
        const supervisorCount = usersList.filter((u: any) => u.role === 'supervisor').length;
        const staffCount = usersList.filter((u: any) => u.role === 'staff').length;
        const checkerCount = usersList.filter((u: any) => u.role === 'checker').length;

        setRoleDistribution([
          { role: 'Admin', count: adminCount, color: '#f59e0b', icon: <ShieldCheck size={14} style={{ color: '#f59e0b' }} /> },
          { role: 'Supervisor', count: supervisorCount, color: '#10b981', icon: <ShieldAlert size={14} style={{ color: '#10b981' }} /> },
          { role: 'Staff', count: staffCount, color: '#6366f1', icon: <Shield size={14} style={{ color: '#6366f1' }} /> },
          { role: 'Checker', count: checkerCount, color: '#f43f5e', icon: <ShieldAlert size={14} style={{ color: '#f43f5e' }} /> }
        ]);

        // 4. Recent accounts
        const sortedUsers = [...usersList].sort((a: any, b: any) => {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        const mappedRecent = sortedUsers.slice(0, 4).map((u: any) => {
          const name = u.name || '';
          const initials = name ? name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '??';
          return {
            name,
            email: u.email || '',
            status: u.status || 'pending',
            role: u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Staff',
            avatar: initials,
            time: getRelativeTime(u.createdAt)
          };
        });

        if (mappedRecent.length > 0) {
          setRecentAccounts(mappedRecent);
        }

        // 5. Recent activities
        const activityList: any[] = [];
        sortedUsers.slice(0, 3).forEach((u: any) => {
          if (u.createdAt) {
            activityList.push({
              icon: <UserPlus size={18} className="activity-icon-user" />,
              title: 'New account registered',
              subtitle: `${u.name || ''} — ${u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Staff'}`,
              time: getRelativeTime(u.createdAt),
              date: new Date(u.createdAt).getTime()
            });
          }
        });

        const sortedLogins = [...usersList]
          .filter((u: any) => u.lastLogin)
          .sort((a: any, b: any) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime());
        
        sortedLogins.slice(0, 3).forEach((u: any) => {
          activityList.push({
            icon: <UserCheck size={18} className="activity-icon-approve" />,
            title: 'User logged in',
            subtitle: `${u.name || ''} (${u.email || ''})`,
            time: getRelativeTime(u.lastLogin),
            date: new Date(u.lastLogin).getTime()
          });
        });

        const defaultActs = [
          { icon: <Zap size={18} className="activity-icon-zap" />, title: 'Training job completed', subtitle: 'model-v2-llama-8b', time: '5 hours ago', date: Date.now() - 5 * 3600000 },
          { icon: <Database size={18} className="activity-icon-db" />, title: 'Dataset uploaded', subtitle: 'conversation-data-v3.jsonl', time: '8 hours ago', date: Date.now() - 8 * 3600000 },
          { icon: <BarChart2 size={18} className="activity-icon-chart" />, title: 'Evaluation completed', subtitle: 'GPT-4 vs Claude comparison', time: '2 days ago', date: Date.now() - 2 * 24 * 3600000 },
        ];

        activityList.push(...defaultActs);
        activityList.sort((a, b) => b.date - a.date);
        
        setActivities(activityList.slice(0, 6));

      } catch (err) {
        console.error('Error fetching admin dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="dashboard-loading-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: 'var(--text-muted)',
        gap: '16px'
      }}>
        <div className="spinner" style={{
          width: '40px',
          height: '40px',
          border: '3px solid #f3e8ff',
          borderTop: '3px solid #8b5cf6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ fontSize: '14px', fontWeight: '500' }}>Đang tải dữ liệu chi tiết...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  const cards = [
    { icon: <MessageSquare size={24} />, title: 'Chat', description: 'Conversational AI with streaming inference', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.chatSessionsCount ?? 0} active sessions`, actionText: 'New Chat', badge: 'Idle', badgeColor: 'default', tab: 'Chat' },
    { icon: <Database size={24} />, title: 'Data Prep', description: 'Multi-step dataset conversion pipeline', metaIcon: <Activity size={14} />, metaText: `${stats[0].value} datasets`, actionText: 'Start Conversion', badge: 'Idle', badgeColor: 'default', tab: 'Data Prep' },
    { icon: <Zap size={24} />, title: 'AutoTrain', description: 'Configure and run training jobs', metaIcon: <Activity size={14} />, metaText: `${stats[1].value} active jobs`, actionText: 'New Training Job', badge: stats[1].value !== '0' ? 'Running' : 'Idle', badgeColor: stats[1].value !== '0' ? 'success' : 'default', tab: 'AutoTrain' },
    { icon: <Package size={24} />, title: 'Model Registry', description: 'Upload, version, and manage models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelRegistryCount ?? 0} models`, actionText: 'Browse Models', badge: 'Idle', badgeColor: 'default', tab: 'Model Registry' },
    { icon: <BarChart2 size={24} />, title: 'Model Evaluation', description: 'Run evaluations and compare models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelEvaluationCount ?? 0} evaluations`, actionText: 'Run Evaluation', badge: 'Idle', badgeColor: 'default', tab: 'Model Eval' },
    { icon: <Users size={24} />, title: 'Manager Account', description: 'Manage user accounts and approvals', metaIcon: <AlertTriangle size={14} />, metaText: `${accountStats.pending} pending approvals`, actionText: 'Manage Accounts', badge: accountStats.pending > 0 ? `${accountStats.pending} Pending` : 'OK', badgeColor: accountStats.pending > 0 ? 'warning' : 'default', tab: 'Manager Account' },
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle2 size={12} />;
      case 'pending': return <Clock size={12} />;
      case 'banned': return <Ban size={12} />;
      default: return null;
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'Admin': return 'role-dot-admin';
      case 'Supervisor': return 'role-dot-supervisor';
      case 'Staff': return 'role-dot-staff';
      case 'Checker': return 'role-dot-checker';
      default: return '';
    }
  };

  return (
    <div className="home-view">
      <div className="home-header card">
        <div className="home-header-title">
          <h1>Welcome to SEP490</h1>
          <p>Enterprise ML & Data Platform</p>
        </div>
        <div className="home-header-stats">
          {stats.map((stat, index) => (
            <React.Fragment key={index}>
              <div className="stat-item">
                <span className={`stat-value ${stat.color}`}>{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
              {index < stats.length - 1 && <div className="stat-divider"></div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="account-overview-section">
        <div className="account-overview-header">
          <div className="account-overview-title"><Users size={20} /><h2>Account Overview</h2></div>
          <button className="account-manage-btn" onClick={() => setActiveTab('Manager Account')}>
            <span>Manage All</span><ArrowRight size={16} />
          </button>
        </div>
        <div className="account-stats-grid">
          <div className="account-stat-card account-stat-total" onClick={() => setActiveTab('Manager Account')}>
            <div className="account-stat-icon-wrapper"><Users size={22} /></div>
            <div className="account-stat-content">
              <span className="account-stat-number">{accountStats.total}</span>
              <span className="account-stat-text">Total Accounts</span>
            </div>
            <div className="account-stat-trend"><TrendingUp size={14} /><span>+{accountStats.growthPercent}%</span></div>
          </div>
          <div className="account-stat-card account-stat-active" onClick={() => setActiveTab('Manager Account')}>
            <div className="account-stat-icon-wrapper"><CheckCircle2 size={22} /></div>
            <div className="account-stat-content">
              <span className="account-stat-number">{accountStats.active}</span>
              <span className="account-stat-text">Active</span>
            </div>
            <div className="account-stat-bar"><div className="account-stat-bar-fill" style={{ width: `${(accountStats.active / accountStats.total) * 100}%` }}></div></div>
          </div>
          <div className="account-stat-card account-stat-pending" onClick={() => setActiveTab('Manager Account')}>
            <div className="account-stat-icon-wrapper"><Clock size={22} /></div>
            <div className="account-stat-content">
              <span className="account-stat-number">{accountStats.pending}</span>
              <span className="account-stat-text">Pending Approval</span>
            </div>
            {accountStats.pending > 0 && (<div className="account-stat-alert"><AlertTriangle size={14} /><span>Needs review</span></div>)}
          </div>
          <div className="account-stat-card account-stat-banned" onClick={() => setActiveTab('Manager Account')}>
            <div className="account-stat-icon-wrapper"><Ban size={22} /></div>
            <div className="account-stat-content">
              <span className="account-stat-number">{accountStats.banned}</span>
              <span className="account-stat-text">Banned</span>
            </div>
          </div>
        </div>
        <div className="account-detail-row">
          <div className="account-detail-card card">
            <div className="account-detail-card-header"><h3><Shield size={16} /> Role Distribution</h3></div>
            <div className="role-distribution-content">
              <div className="role-bar-chart">
                {roleDistribution.map((item, idx) => (
                  <div className="role-bar-row" key={idx}>
                    <div className="role-bar-label">{item.icon}<span>{item.role}</span></div>
                    <div className="role-bar-track"><div className="role-bar-fill" style={{ width: `${(item.count / accountStats.total) * 100}%`, background: item.color }}></div></div>
                    <span className="role-bar-count">{item.count}</span>
                  </div>
                ))}
              </div>
              <div className="role-summary">
                {roleDistribution.map((item, idx) => (
                  <div className="role-summary-item" key={idx}>
                    <span className="role-dot" style={{ background: item.color }}></span>
                    <span>{item.role}: {((item.count / accountStats.total) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="account-detail-card card">
            <div className="account-detail-card-header">
              <h3><UserPlus size={16} /> Recent Registrations</h3>
              <span className="new-badge">+{accountStats.newThisWeek} this week</span>
            </div>
            <div className="recent-accounts-list">
              {recentAccounts.map((account, idx) => (
                <div className="recent-account-item" key={idx}>
                  <div className={`recent-account-avatar ${account.status === 'pending' ? 'avatar-pending' : ''}`}>{account.avatar}</div>
                  <div className="recent-account-info">
                    <span className="recent-account-name">{account.name}</span>
                    <span className="recent-account-email">{account.email}</span>
                  </div>
                  <div className={`recent-account-role ${getRoleBadgeClass(account.role)}`}><span>{account.role}</span></div>
                  <div className={`recent-account-status status-dot-${account.status}`}>
                    {getStatusIcon(account.status)}<span>{account.status}</span>
                  </div>
                  <span className="recent-account-time">{account.time}</span>
                </div>
              ))}
            </div>
            <div className="account-detail-footer" onClick={() => setActiveTab('Manager Account')}>
              <span>View all accounts</span><ArrowRight size={14} />
            </div>
          </div>
        </div>
      </div>

      <div className="home-cards-grid">
        {cards.map((card, index) => (
          <div className="home-card card" key={index}>
            <div className="home-card-header">
              <div className="home-card-icon">{card.icon}</div>
              <div className={`home-badge badge-${card.badgeColor}`}>
                {card.badgeColor === 'success' && <div className="badge-dot"></div>}
                {card.badgeColor === 'warning' && <div className="badge-dot-warning"></div>}
                {card.badge}
              </div>
            </div>
            <div className="home-card-body">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <div className="home-card-meta">{card.metaIcon}<span>{card.metaText}</span></div>
            </div>
            <div className="home-card-footer" onClick={() => setActiveTab(card.tab)}>
              <span>{card.actionText}</span><ArrowRight size={16} />
            </div>
          </div>
        ))}
      </div>

      <div className="home-activity card">
        <div className="activity-header"><h2>Recent Activity</h2><span className="view-all">View All</span></div>
        <div className="activity-list">
          {activities.map((activity, index) => (
            <div className="activity-item" key={index}>
              <div className="activity-icon-wrapper">{activity.icon}</div>
              <div className="activity-content">
                <div className="activity-title">{activity.title}</div>
                <div className="activity-subtitle">{activity.subtitle}</div>
              </div>
              <div className="activity-time"><Clock size={14} /><span>{activity.time}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────── SUPERVISOR HOME ──────── */
function SupervisorHomeView({ setActiveTab, dashboardStats }) {
  const cards = [
    { icon: <ShieldCheck size={24} />, title: 'Supervisor Review', description: 'Phân xử và giải quyết bất đồng nhãn giữa các nhân viên', metaIcon: <AlertTriangle size={14} />, metaText: `${dashboardStats?.needsReview ?? 0} task cần phân xử`, actionText: 'Vào duyệt nhãn', badge: dashboardStats?.needsReview > 0 ? `${dashboardStats.needsReview} Review` : 'OK', badgeColor: dashboardStats?.needsReview > 0 ? 'warning' : 'default', tab: 'Supervisor Review' },
    { icon: <ClipboardList size={24} />, title: 'Quản lý Task gán nhãn', description: 'Tạo, giao việc và theo dõi tiến độ gán nhãn', metaIcon: <AlertTriangle size={14} />, metaText: `${dashboardStats?.needsReview ?? 0} tasks cần review`, actionText: 'Quản lý Task', badge: dashboardStats?.needsReview > 0 ? `${dashboardStats.needsReview} Review` : 'OK', badgeColor: dashboardStats?.needsReview > 0 ? 'warning' : 'default', tab: 'Assign Labeling' },
    { icon: <MessageSquare size={24} />, title: 'Chat', description: 'Conversational AI with streaming inference', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.chatSessionsCount ?? 0} active sessions`, actionText: 'New Chat', badge: 'Idle', badgeColor: 'default', tab: 'Chat' },
    { icon: <Database size={24} />, title: 'Data Prep', description: 'Multi-step dataset conversion pipeline', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.datasetCount ?? 0} datasets`, actionText: 'Start Conversion', badge: 'Idle', badgeColor: 'default', tab: 'Data Prep' },
    { icon: <GitBranch size={24} />, title: 'Version Data Prep', description: 'Quản lý phiên bản dữ liệu', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.datasetCount ?? 0} versions`, actionText: 'Xem Versions', badge: 'Idle', badgeColor: 'default', tab: 'Version Data Prep' },
    { icon: <Zap size={24} />, title: 'AutoTrain', description: 'Configure and run training jobs', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.activeJobsCount ?? 0} active jobs`, actionText: 'New Training Job', badge: dashboardStats?.activeJobsCount > 0 ? 'Running' : 'Idle', badgeColor: dashboardStats?.activeJobsCount > 0 ? 'success' : 'default', tab: 'AutoTrain' },
    { icon: <Package size={24} />, title: 'Model Registry', description: 'Upload, version, and manage models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelRegistryCount ?? 0} models`, actionText: 'Browse Models', badge: 'Idle', badgeColor: 'default', tab: 'Model Registry' },
    { icon: <BarChart2 size={24} />, title: 'Model Evaluation', description: 'Run evaluations and compare models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelEvaluationCount ?? 0} evaluations`, actionText: 'Run Evaluation', badge: 'Idle', badgeColor: 'default', tab: 'Model Eval' },
  ];

  return (
    <div className="home-view">
      <div className="home-header card">
        <div className="home-header-title">
          <h1>👋 Xin chào, Supervisor</h1>
          <p>Quản lý dữ liệu & giám sát gán nhãn</p>
        </div>
        <div className="home-header-stats">
          <div className="stat-item"><span className="stat-value text-primary">{dashboardStats?.datasetCount ?? 0}</span><span className="stat-label">Tasks</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-blue">{dashboardStats?.needsReview ?? 0}</span><span className="stat-label">Cần Review</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-green">{dashboardStats?.completed ?? 0}</span><span className="stat-label">Completed</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-orange">{dashboardStats?.staffCount ?? 0}</span><span className="stat-label">Staff</span></div>
        </div>
      </div>
      <div className="home-cards-grid">
        {cards.map((card, index) => (
          <div className="home-card card" key={index}>
            <div className="home-card-header">
              <div className="home-card-icon">{card.icon}</div>
              <div className={`home-badge badge-${card.badgeColor}`}>
                {card.badgeColor === 'success' && <div className="badge-dot"></div>}
                {card.badgeColor === 'warning' && <div className="badge-dot-warning"></div>}
                {card.badge}
              </div>
            </div>
            <div className="home-card-body">
              <h3>{card.title}</h3><p>{card.description}</p>
              <div className="home-card-meta">{card.metaIcon}<span>{card.metaText}</span></div>
            </div>
            <div className="home-card-footer" onClick={() => setActiveTab(card.tab)}>
              <span>{card.actionText}</span><ArrowRight size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────── STAFF HOME ──────── */
function StaffHomeView({ setActiveTab, dashboardStats }) {
  return (
    <div className="home-view">
      <div className="home-header card">
        <div className="home-header-title">
          <h1>👋 Xin chào, Staff</h1>
          <p>Thực hiện gán nhãn dữ liệu được giao</p>
        </div>
        <div className="home-header-stats">
          <div className="stat-item"><span className="stat-value text-primary">{dashboardStats?.totalTasks ?? 0}</span><span className="stat-label">Tổng Task</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-blue">{dashboardStats?.inProgress ?? 0}</span><span className="stat-label">Đang làm</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-green">{dashboardStats?.submitted ?? 0}</span><span className="stat-label">Đã Submit</span></div>
        </div>
      </div>
      <div className="home-cards-grid">
        <div className="home-card card" style={{ gridColumn: 'span 2' }}>
          <div className="home-card-header">
            <div className="home-card-icon"><ClipboardList size={24} /></div>
            <div className="home-badge badge-warning">
              <div className="badge-dot-warning"></div>
              {dashboardStats?.inProgress ?? 0} đang chờ
            </div>
          </div>
          <div className="home-card-body">
            <h3>📋 Task gán nhãn của tôi</h3>
            <p>Xem danh sách task được giao, thực hiện gán nhãn và submit kết quả</p>
            <div className="home-card-meta">
              <Activity size={14} />
              <span>{dashboardStats?.totalTasks ?? 0} tasks · {dashboardStats?.inProgress ?? 0} đang thực hiện · {dashboardStats?.submitted ?? 0} đã submit</span>
            </div>
          </div>
          <div className="home-card-footer" onClick={() => setActiveTab('My Tasks')}>
            <span>Xem Task của tôi</span><ArrowRight size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────── CHECKER HOME ──────── */
function CheckerHomeView({ setActiveTab, dashboardStats }) {
  const cards = [
    { icon: <ShieldCheck size={24} />, title: 'Checker Review', description: 'Phân xử bất đồng nhãn và theo dõi nhật ký hoạt động', metaIcon: <AlertTriangle size={14} />, metaText: `${dashboardStats?.needsReview ?? 0} mẫu cần phân xử`, actionText: 'Vào thẩm định', badge: dashboardStats?.needsReview > 0 ? `${dashboardStats.needsReview} Review` : 'OK', badgeColor: dashboardStats?.needsReview > 0 ? 'warning' : 'default', tab: 'Checker Review' },
    { icon: <ClipboardList size={24} />, title: 'Quản lý Task gán nhãn', description: 'Tạo, giao việc và theo dõi tiến độ gán nhãn', metaIcon: <AlertTriangle size={14} />, metaText: `${dashboardStats?.needsReview ?? 0} tasks cần review`, actionText: 'Quản lý Task', badge: dashboardStats?.needsReview > 0 ? `${dashboardStats.needsReview} Review` : 'OK', badgeColor: dashboardStats?.needsReview > 0 ? 'warning' : 'default', tab: 'Assign Labeling' },
    { icon: <MessageSquare size={24} />, title: 'Chat', description: 'Conversational AI with streaming inference', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.chatSessionsCount ?? 0} active sessions`, actionText: 'New Chat', badge: 'Idle', badgeColor: 'default', tab: 'Chat' },
    { icon: <Database size={24} />, title: 'Data Prep', description: 'Multi-step dataset conversion pipeline', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.datasetCount ?? 0} datasets`, actionText: 'Start Conversion', badge: 'Idle', badgeColor: 'default', tab: 'Data Prep' },
    { icon: <GitBranch size={24} />, title: 'Version Data Prep', description: 'Quản lý phiên bản dữ liệu', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.datasetCount ?? 0} versions`, actionText: 'Xem Versions', badge: 'Idle', badgeColor: 'default', tab: 'Version Data Prep' },
    { icon: <Zap size={24} />, title: 'AutoTrain', description: 'Configure and run training jobs', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.activeJobsCount ?? 0} active jobs`, actionText: 'New Training Job', badge: dashboardStats?.activeJobsCount > 0 ? 'Running' : 'Idle', badgeColor: dashboardStats?.activeJobsCount > 0 ? 'success' : 'default', tab: 'AutoTrain' },
    { icon: <Package size={24} />, title: 'Model Registry', description: 'Upload, version, and manage models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelRegistryCount ?? 0} models`, actionText: 'Browse Models', badge: 'Idle', badgeColor: 'default', tab: 'Model Registry' },
    { icon: <BarChart2 size={24} />, title: 'Model Evaluation', description: 'Run evaluations and compare models', metaIcon: <Activity size={14} />, metaText: `${dashboardStats?.modelEvaluationCount ?? 0} evaluations`, actionText: 'Run Evaluation', badge: 'Idle', badgeColor: 'default', tab: 'Model Eval' },
  ];

  return (
    <div className="home-view">
      <div className="home-header card">
        <div className="home-header-title">
          <h1>👋 Xin chào, Checker</h1>
          <p>Quản lý dữ liệu & giám sát gán nhãn</p>
        </div>
        <div className="home-header-stats">
          <div className="stat-item"><span className="stat-value text-primary">{dashboardStats?.datasetCount ?? 0}</span><span className="stat-label">Tasks</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-blue">{dashboardStats?.needsReview ?? 0}</span><span className="stat-label">Cần Review</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-green">{dashboardStats?.completed ?? 0}</span><span className="stat-label">Completed</span></div>
          <div className="stat-divider"></div>
          <div className="stat-item"><span className="stat-value text-orange">{dashboardStats?.staffCount ?? 0}</span><span className="stat-label">Staff</span></div>
        </div>
      </div>
      <div className="home-cards-grid">
        {cards.map((card, index) => (
          <div className="home-card card" key={index}>
            <div className="home-card-header">
              <div className="home-card-icon">{card.icon}</div>
              <div className={`home-badge badge-${card.badgeColor}`}>
                {card.badgeColor === 'success' && <div className="badge-dot"></div>}
                {card.badgeColor === 'warning' && <div className="badge-dot-warning"></div>}
                {card.badge}
              </div>
            </div>
            <div className="home-card-body">
              <h3>{card.title}</h3><p>{card.description}</p>
              <div className="home-card-meta">{card.metaIcon}<span>{card.metaText}</span></div>
            </div>
            <div className="home-card-footer" onClick={() => setActiveTab(card.tab)}>
              <span>{card.actionText}</span><ArrowRight size={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HomeView;
