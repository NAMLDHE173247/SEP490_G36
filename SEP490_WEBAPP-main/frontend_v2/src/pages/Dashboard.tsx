import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Activity, MessageSquare, Database, Zap, Package, BarChart2,
  ChevronLeft, ChevronRight, Users, GitBranch, ClipboardList, Globe, TrendingUp, ClipboardCheck, ShieldCheck, History, ListChecks
} from 'lucide-react';
import HomeView from './HomeView';
import ChatView from './ChatView';
import DataPrepView from './DataPrepView';
import AutoTrainView from './AutoTrainView';
import ModelRegistryView from './ModelRegistryView';
import ModelEvalView from './ModelEvalView';
import AdminAccountView from './AdminAccountView';
import VersionDataPrepView from './VersionDataPrepView';
import ManagerAssignLabelingView from './ManagerAssignLabelingView';
import StaffTasksView from './StaffTasksView';
import StaffLabelView from './StaffLabelView';
import StaffRewriteView from './StaffRewriteView';
import LabelingTaskDetailView from './LabelingTaskDetailView';
import ReviewQueueView from './ReviewQueueView';
import StaffStatsView from './StaffStatsView';
import MyStatsView from './MyStatsView';
import SupervisorReviewView from './SupervisorReviewView';
import CheckerReviewView from './CheckerReviewView';
import CheckerRewriteView from './CheckerRewriteView';
import TrainingHistoryView from './TrainingHistoryView';
import ApiKeySettingsPage from './ApiKeySettingsPage';
import RouterBenchmarkView from './RouterBenchmarkView';
import HumanAuditReplayView from './HumanAuditReplayView';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Read tab from location state if available
  React.useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab as string);
    }
  }, [location.state]);

  // Redirect to login if user is not authenticated
  React.useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  // Default tab per role
  const getDefaultTab = () => {
    if (!user) return 'Dashboard';
    switch (user.role) {
      case 'admin': return 'Dashboard';
      case 'checker': return 'Checker Review';
      case 'supervisor': return 'Dashboard';
      case 'staff': return 'My Tasks';
      default: return 'Dashboard';
    }
  };

  const allMenuItems = [
    { key: 'Manager Account', label: 'Manager Account', icon: <Users size={18} style={{ minWidth: '18px' }} />, roles: ['admin'] },
    { key: 'Staff Stats', label: 'Thống kê Staff', icon: <TrendingUp size={18} style={{ minWidth: '18px' }} />, roles: ['admin'] },
    { key: 'Supervisor Review', label: 'Supervisor Review', icon: <ShieldCheck size={18} style={{ minWidth: '18px' }} />, roles: ['supervisor', 'admin'] },
    { key: 'Checker Review', label: 'Checker Review', icon: <ShieldCheck size={18} style={{ minWidth: '18px' }} />, roles: ['checker', 'admin'] },
    { key: 'Checker Rewrite', label: 'Kiểm duyệt Rewrite', icon: <ClipboardCheck size={18} style={{ minWidth: '18px' }} />, roles: ['checker', 'admin'] },
    { key: 'Dashboard', label: 'Dashboard', icon: <Activity size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Chat', label: 'Chat', icon: <MessageSquare size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Data Prep', label: 'Data Prep', icon: <Database size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Assign Labeling', label: 'Quản lý Task', icon: <ClipboardList size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Review Queue', label: 'Duyệt nhãn', icon: <ClipboardCheck size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Version Data Prep', label: 'Version Data Prep', icon: <GitBranch size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'AutoTrain', label: 'AutoTrain', icon: <Zap size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Training History', label: 'Lịch sử Huấn luyện', icon: <History size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Model Registry', label: 'Model Registry', icon: <Package size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Model Eval', label: 'Model Eval', icon: <BarChart2 size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Human Audit', label: 'Human Audit Replay', icon: <ListChecks size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Router Benchmark', label: 'Router Benchmark', icon: <GitBranch size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Staff Stats', label: 'Thống kê Staff', icon: <TrendingUp size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Supervisor Review', label: 'Supervisor Review', icon: <ShieldCheck size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'My Tasks', label: 'Task của tôi', icon: <ClipboardList size={18} style={{ minWidth: '18px' }} />, roles: ['staff'] },
    { key: 'My Stats', label: 'Thống kê cá nhân', icon: <TrendingUp size={18} style={{ minWidth: '18px' }} />, roles: ['staff'] },
  ];

  const [activeTab, setActiveTabState] = useState(() => {
    // Restore the last active tab from localStorage on reload
    const saved = localStorage.getItem(`dashboard_active_tab_${user?.role || 'guest'}`);
    if (saved) return saved;
    return getDefaultTab();
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewingTaskDetail, setViewingTaskDetail] = useState(false);
  const [managerSelectedTask, setManagerSelectedTask] = useState(null);
  const [managerSelectedBatchId, setManagerSelectedBatchId] = useState(null);

  // Wrapper: update state AND persist to localStorage
  const setActiveTab = (tab: string) => {
    localStorage.setItem(`dashboard_active_tab_${user?.role || 'guest'}`, tab);
    setActiveTabState(tab);
  };

  // Cho phép các màn con điều hướng tab qua custom event (vd: sau khi giao việc xong)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (typeof tab === 'string' && tab) setActiveTab(tab);
    };
    window.addEventListener('lh-navigate-tab', handler);
    return () => window.removeEventListener('lh-navigate-tab', handler);
  }, []);

  React.useEffect(() => {
    if (user) {
      if (activeTab === 'Staff Label' && !selectedTask) {
        setActiveTab('My Tasks');
        return;
      }
      if (activeTab === 'Staff Rewrite' && !selectedTask) {
        setActiveTab('My Tasks');
        return;
      }
      if (activeTab === 'Task Detail' && !managerSelectedTask) {
        setActiveTab('Assign Labeling');
        return;
      }

      const isValid =
        (activeTab === 'API Keys') ||
        (activeTab === 'Staff Label' && user.role === 'staff') ||
        (activeTab === 'Staff Rewrite' && user.role === 'staff') ||
        (activeTab === 'Task Detail' && ['admin', 'supervisor', 'checker'].includes(user.role)) ||
        allMenuItems.some(item => item.key === activeTab && item.roles.includes(user.role));

      if (!isValid) {
        setActiveTab(getDefaultTab());
      }
    }
  }, [user, activeTab, selectedTask, managerSelectedTask]);



  // Handle going back from labeling to task list
  const handleBackFromLabel = () => {
    setSelectedTask(null);
    setActiveTab('My Tasks');
  };

  // Handle Supervisor viewing task detail
  const handleViewTaskDetail = (task, batchId = null) => {
    setManagerSelectedTask(task);
    setManagerSelectedBatchId(batchId);
    setViewingTaskDetail(true);
    setActiveTab('Task Detail');
  };

  const handleBackFromDetail = () => {
    setViewingTaskDetail(false);
    setManagerSelectedTask(null);
    setManagerSelectedBatchId(null);
    setActiveTab('Assign Labeling');
  };

  if (!user) {
    return null;
  }

  const menuItems = allMenuItems.filter(item => item.roles.includes(user.role));

  const handleOpenTask = (task: any) => {
    setSelectedTask(task);
    setActiveTab(task?.taskType === 'rewrite' ? 'Staff Rewrite' : 'Staff Label');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <HomeView setActiveTab={setActiveTab} />;
      case 'Chat':
        return <ChatView />;
      case 'Data Prep':
        return <DataPrepView />;
      case 'AutoTrain':
        return <AutoTrainView setActiveTab={setActiveTab} />;
      case 'Training History':
        return <TrainingHistoryView setActiveTab={setActiveTab} />;
      case 'Model Registry':
        return <ModelRegistryView />;
      case 'Model Eval':
        return <ModelEvalView />;
      case 'Human Audit':
        return <HumanAuditReplayView />;
      case 'Router Benchmark':
        return <RouterBenchmarkView />;
      case 'Version Data Prep':
        return <VersionDataPrepView />;
      case 'Assign Labeling':
        return <ManagerAssignLabelingView onViewDetail={handleViewTaskDetail} />;
      case 'Review Queue':
        return <ReviewQueueView />;
      case 'Task Detail':
        return <LabelingTaskDetailView onBack={handleBackFromDetail} task={managerSelectedTask} initialBatchId={managerSelectedBatchId} />;
      case 'Manager Account':
        return <AdminAccountView />;
      case 'My Tasks':
        return <StaffTasksView onOpenTask={handleOpenTask} />;
      case 'Staff Label':
        return <StaffLabelView task={selectedTask} onBack={handleBackFromLabel} />;
      case 'Staff Rewrite':
        return <StaffRewriteView task={selectedTask} onBack={handleBackFromLabel} />;
      case 'Staff Stats':
        return <StaffStatsView />;
      case 'Supervisor Review':
        return <SupervisorReviewView onOpenTask={handleViewTaskDetail} />;
      case 'Checker Review':
        return <CheckerReviewView onOpenTask={handleViewTaskDetail} />;
      case 'Checker Rewrite':
        return <CheckerRewriteView />;
      case 'My Stats':
        return <MyStatsView />;
      case 'API Keys':
        return <ApiKeySettingsPage />;
      default:
        if (user.role === 'staff') return <StaffTasksView onOpenTask={handleOpenTask} />;
        if (user.role === 'supervisor') return <SupervisorReviewView onOpenTask={handleViewTaskDetail} />;
        if (user.role === 'checker') return <CheckerReviewView onOpenTask={handleViewTaskDetail} />;
        return <HomeView setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="main-content">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-menu">
          {menuItems.map((item) => (
            <p
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                ...(activeTab === item.key
                  ? { color: 'var(--primary)', fontWeight: '500', backgroundColor: '#e0e7ff' }
                  : {})
              }}
              title={item.label}
            >
              {item.icon} {!isSidebarCollapsed && item.label}
            </p>
          ))}
        </div>

        <div className="sidebar-toggle-wrapper">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="page-content">
        {renderContent()}
      </div>
    </div>
  );
}

export default Dashboard;
