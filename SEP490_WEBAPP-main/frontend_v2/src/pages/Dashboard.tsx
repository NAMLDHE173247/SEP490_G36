import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Activity, MessageSquare, Database, Zap, Package, BarChart2,
  ChevronLeft, ChevronRight, Users, GitBranch, ClipboardList, Globe, TrendingUp
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
import LabelingTaskDetailView from './LabelingTaskDetailView';
import StaffStatsView from './StaffStatsView';
import MyStatsView from './MyStatsView';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Default tab per role
  const getDefaultTab = () => {
    if (!user) return 'Dashboard';
    switch (user.role) {
      case 'admin': return 'Dashboard';
      case 'supervisor': return 'Chat';
      case 'staff': return 'My Tasks';
      default: return 'Dashboard';
    }
  };

  const [activeTab, setActiveTab] = useState(getDefaultTab());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewingTaskDetail, setViewingTaskDetail] = useState(false);

  if (!user) {
    navigate('/login');
    return null;
  }

  const allMenuItems = [
    { key: 'Dashboard', label: 'Dashboard', icon: <Activity size={18} style={{ minWidth: '18px' }} />, roles: ['admin'] },
    { key: 'Chat', label: 'Chat', icon: <MessageSquare size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Data Prep', label: 'Data Prep', icon: <Database size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Version Data Prep', label: 'Version Data Prep', icon: <GitBranch size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Assign Labeling', label: 'Quản lý Task', icon: <ClipboardList size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'AutoTrain', label: 'AutoTrain', icon: <Zap size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Model Registry', label: 'Model Registry', icon: <Package size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Model Eval', label: 'Model Eval', icon: <BarChart2 size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'Manager Account', label: 'Manager Account', icon: <Users size={18} style={{ minWidth: '18px' }} />, roles: ['admin'] },
    { key: 'Staff Stats', label: 'Thống kê Staff', icon: <TrendingUp size={18} style={{ minWidth: '18px' }} />, roles: ['admin', 'supervisor'] },
    { key: 'My Tasks', label: 'Task của tôi', icon: <ClipboardList size={18} style={{ minWidth: '18px' }} />, roles: ['staff'] },
    { key: 'My Stats', label: 'Thống kê cá nhân', icon: <TrendingUp size={18} style={{ minWidth: '18px' }} />, roles: ['staff'] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(user.role));

  // Handle Staff opening a task for labeling
  const handleOpenTask = (task) => {
    setSelectedTask(task);
    setActiveTab('Staff Label');
  };

  // Handle going back from labeling to task list
  const handleBackFromLabel = () => {
    setSelectedTask(null);
    setActiveTab('My Tasks');
  };

  // Handle Supervisor viewing task detail
  const handleViewTaskDetail = (task) => {
    setViewingTaskDetail(true);
    setActiveTab('Task Detail');
  };

  const handleBackFromDetail = () => {
    setViewingTaskDetail(false);
    setActiveTab('Assign Labeling');
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
        return <AutoTrainView />;
      case 'Model Registry':
        return <ModelRegistryView />;
      case 'Model Eval':
        return <ModelEvalView />;
      case 'Version Data Prep':
        return <VersionDataPrepView />;
      case 'Assign Labeling':
        return <ManagerAssignLabelingView onViewDetail={handleViewTaskDetail} />;
      case 'Task Detail':
        return <LabelingTaskDetailView onBack={handleBackFromDetail} />;
      case 'Manager Account':
        return <AdminAccountView />;
      case 'My Tasks':
        return <StaffTasksView onOpenTask={handleOpenTask} />;
      case 'Staff Label':
        return <StaffLabelView task={selectedTask} onBack={handleBackFromLabel} />;
      case 'Staff Stats':
        return <StaffStatsView />;
      case 'My Stats':
        return <MyStatsView />;
      default:
        if (user.role === 'staff') return <StaffTasksView onOpenTask={handleOpenTask} />;
        if (user.role === 'supervisor') return <ChatView />;
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
