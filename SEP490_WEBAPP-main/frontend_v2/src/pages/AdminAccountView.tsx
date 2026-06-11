import React, { useState, useEffect } from 'react';
import {
  Search, Plus, MoreHorizontal, Shield, ShieldCheck, ShieldX,
  UserCheck, UserX, Ban, CheckCircle2, XCircle, Clock,
  Mail, Calendar, Filter, ChevronDown, ChevronLeft, ChevronRight,
  X, Eye, EyeOff, ChevronsLeft, ChevronsRight,
  Users, UserPlus, AlertTriangle, RefreshCw, ShieldAlert
} from 'lucide-react';
import { apiService } from '../services/api';
import '../styles/admin.css';

const formatDateTime = (dateStr: any) => {
  if (!dateStr || dateStr === '-') return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (num: number) => String(num).padStart(2, '0');
    const dd = pad(d.getDate());
    const MM = pad(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
  } catch {
    return dateStr;
  }
};

interface DropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  icon: React.ReactNode;
}

const CustomDropdown: React.FC<DropdownProps> = ({ value, onChange, options, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="custom-dropdown-container">
      <button 
        type="button" 
        className="custom-dropdown-trigger" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="custom-dropdown-icon">{selectedOption.icon || icon}</span>
        <span className="custom-dropdown-label">{selectedOption.label}</span>
        <ChevronDown size={14} className={`custom-dropdown-arrow ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="custom-dropdown-backdrop" onClick={() => setIsOpen(false)} />
          <ul className="custom-dropdown-menu">
            {options.map((option) => (
              <li 
                key={option.value} 
                className={`custom-dropdown-item ${option.value === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.icon && <span className="item-icon">{option.icon}</span>}
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

const statusOptions = [
  { value: 'all', label: 'All Status', icon: <Filter size={14} /> },
  { value: 'active', label: 'Active', icon: <CheckCircle2 size={14} style={{ color: '#16a34a' }} /> },
  { value: 'pending', label: 'Pending', icon: <Clock size={14} style={{ color: '#d97706' }} /> },
  { value: 'banned', label: 'Banned', icon: <Ban size={14} style={{ color: '#dc2626' }} /> },
  { value: 'inactive', label: 'Inactive', icon: <XCircle size={14} style={{ color: '#64748b' }} /> }
];

const roleOptions = [
  { value: 'all', label: 'All Roles', icon: <Shield size={14} /> },
  { value: 'Admin', label: 'Admin', icon: <ShieldCheck size={14} style={{ color: '#d97706' }} /> },
  { value: 'Supervisor', label: 'Supervisor', icon: <ShieldAlert size={14} style={{ color: '#10b981' }} /> },
  { value: 'Staff', label: 'Staff', icon: <Shield size={14} style={{ color: '#6366f1' }} /> }
];

function AdminAccountView() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<any>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({ name: '', email: '', role: 'Staff', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
 
  const fetchAccounts = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiService.listUsers();
      const mapped = data.users.map((u: any) => {
        const initials = u.name ? u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '??';
        return {
          id: u.id,
          name: u.name || '',
          email: u.email || '',
          role: u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : 'Staff',
          status: u.status || 'active',
          joinDate: u.createdAt ? formatDateTime(u.createdAt) : '-',
          lastLogin: u.lastLogin ? formatDateTime(u.lastLogin) : '-',
          avatar: initials
        };
      });
      setAccounts(mapped);
    } catch (err: any) {
      console.error('Error fetching accounts:', err);
      setErrorMsg(err.response?.data?.error || 'Không thể tải danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Stats
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.status === 'active').length;
  const pendingAccounts = accounts.filter(a => a.status === 'pending').length;
  const bannedAccounts = accounts.filter(a => a.status === 'banned').length;

  // Filter accounts
  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          account.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || account.status === filterStatus;
    const matchesRole = filterRole === 'all' || account.role === filterRole;
    return matchesSearch && matchesStatus && matchesRole;
  });

  // Pagination
  const totalPages = Math.ceil(filteredAccounts.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterRole, rowsPerPage]);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // Actions
  const handleApprove = async (id: string) => {
    try {
      await apiService.updateUserStatus(id, 'active');
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'active' } : a));
      setActionMenuId(null);
    } catch (err: any) {
      alert('Lỗi khi phê duyệt tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleBan = async (id: string) => {
    try {
      await apiService.updateUserStatus(id, 'banned');
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'banned' } : a));
      setActionMenuId(null);
    } catch (err: any) {
      alert('Lỗi khi ban tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.updateUserStatus(id, 'active');
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'active' } : a));
      setActionMenuId(null);
    } catch (err: any) {
      alert('Lỗi khi kích hoạt tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.updateUserStatus(id, 'inactive');
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'inactive' } : a));
      setActionMenuId(null);
    } catch (err: any) {
      alert('Lỗi khi hủy kích hoạt tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReject = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tài khoản này không?')) {
      try {
        await apiService.deleteUser(id);
        setAccounts(prev => prev.filter(a => a.id !== id));
        setActionMenuId(null);
      } catch (err: any) {
        alert('Lỗi khi xóa người dùng: ' + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleAddAccount = async () => {
    if (!newAccount.name || !newAccount.email) return;
    try {
      await apiService.createUser({
        name: newAccount.name,
        email: newAccount.email,
        password: newAccount.password || '1',
        role: newAccount.role.toLowerCase()
      });
      await fetchAccounts();
      setNewAccount({ name: '', email: '', role: 'Staff', password: '' });
      setShowAddModal(false);
    } catch (err: any) {
      alert('Lỗi khi tạo tài khoản: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    try {
      await apiService.updateUserRole(id, newRole.toLowerCase());
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, role: newRole } : a));
      setActionMenuId(null);
    } catch (err: any) {
      alert('Lỗi khi thay đổi vai trò: ' + (err.response?.data?.error || err.message));
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'active': return { label: 'Active', className: 'status-active', icon: <CheckCircle2 size={14} /> };
      case 'pending': return { label: 'Pending', className: 'status-pending', icon: <Clock size={14} /> };
      case 'banned': return { label: 'Banned', className: 'status-banned', icon: <Ban size={14} /> };
      case 'inactive': return { label: 'Inactive', className: 'status-inactive', icon: <XCircle size={14} /> };
      default: return { label: status, className: '', icon: null };
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'Admin': return <ShieldCheck size={14} className="role-icon-admin" />;
      case 'Supervisor': return <ShieldAlert size={14} className="role-icon-supervisor" />;
      case 'Staff': return <Shield size={14} className="role-icon-staff" />;
      default: return <Shield size={14} />;
    }
  };

  const getAvatarClass = (role) => {
    switch (role) {
      case 'Admin': return 'avatar-admin';
      case 'Supervisor': return 'avatar-supervisor';
      default: return '';
    }
  };

  // Generate role change options based on current role
  const getRoleChangeOptions = (currentRole) => {
    const allRoles = ['Admin', 'Supervisor', 'Staff'];
    return allRoles.filter(r => r !== currentRole);
  };

  const getRoleChangeIcon = (targetRole) => {
    switch (targetRole) {
      case 'Admin': return <ShieldCheck size={14} />;
      case 'Supervisor': return <ShieldAlert size={14} />;
      case 'Staff': return <Shield size={14} />;
      default: return <Shield size={14} />;
    }
  };

  return (
    <div className="admin-accounts">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-left">
          <h1>Account Management</h1>
          <p>Manage user accounts, approvals, and permissions</p>
        </div>
        <div className="admin-header-right">
          <button className="admin-btn-add" onClick={() => setShowAddModal(true)}>
            <UserPlus size={18} />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="admin-stats-row">
        <div className="admin-stat-card" onClick={() => setFilterStatus('all')}>
          <div className="admin-stat-icon stat-total"><Users size={20} /></div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{totalAccounts}</span>
            <span className="admin-stat-label">Total Accounts</span>
          </div>
        </div>
        <div className="admin-stat-card" onClick={() => setFilterStatus('active')}>
          <div className="admin-stat-icon stat-active"><CheckCircle2 size={20} /></div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{activeAccounts}</span>
            <span className="admin-stat-label">Active</span>
          </div>
        </div>
        <div className="admin-stat-card" onClick={() => setFilterStatus('pending')}>
          <div className="admin-stat-icon stat-pending"><Clock size={20} /></div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{pendingAccounts}</span>
            <span className="admin-stat-label">Pending Approval</span>
          </div>
        </div>
        <div className="admin-stat-card" onClick={() => setFilterStatus('banned')}>
          <div className="admin-stat-icon stat-banned"><Ban size={20} /></div>
          <div className="admin-stat-info">
            <span className="admin-stat-value">{bannedAccounts}</span>
            <span className="admin-stat-label">Banned</span>
          </div>
        </div>
      </div>

      {/* Pending Approvals Banner */}
      {pendingAccounts > 0 && (
        <div className="pending-banner">
          <div className="pending-banner-left">
            <AlertTriangle size={18} />
            <span><strong>{pendingAccounts}</strong> account(s) waiting for approval</span>
          </div>
          <button className="pending-banner-btn" onClick={() => setFilterStatus('pending')}>
            Review Now
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="admin-filters">
          <CustomDropdown 
            value={filterStatus} 
            onChange={setFilterStatus} 
            options={statusOptions} 
            icon={<Filter size={14} />} 
          />
          <CustomDropdown 
            value={filterRole} 
            onChange={setFilterRole} 
            options={roleOptions} 
            icon={<Shield size={14} />} 
          />
          <button className="admin-btn-refresh" onClick={() => { setFilterStatus('all'); setFilterRole('all'); setSearchTerm(''); }}>
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Join Date</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="admin-empty">
                  <div className="spinner-loader" style={{
                    width: '32px', height: '32px', border: '3px solid #e2e8f0',
                    borderTopColor: '#4f46e5', borderRadius: '50%', margin: '0 auto 12px',
                    animation: 'sep490Spin 1s linear infinite'
                  }}></div>
                  <p>Loading accounts...</p>
                </td>
              </tr>
            ) : errorMsg ? (
              <tr>
                <td colSpan={6} className="admin-empty">
                  <AlertTriangle size={36} style={{ color: '#ef4444', marginBottom: '12px' }} />
                  <p style={{ color: '#ef4444' }}>{errorMsg}</p>
                  <button onClick={fetchAccounts} className="admin-btn-refresh" style={{ marginTop: '12px', display: 'inline-flex', alignSelf: 'center' }}>
                    <RefreshCw size={14} /> Retry
                  </button>
                </td>
              </tr>
            ) : paginatedAccounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-empty">
                  <Users size={40} />
                  <p>No accounts found</p>
                </td>
              </tr>
            ) : (
              paginatedAccounts.map(account => {
                const statusConfig = getStatusConfig(account.status);
                return (
                  <tr key={account.id} className={account.status === 'pending' ? 'row-pending' : ''}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-avatar-sm ${getAvatarClass(account.role)}`}>
                          {account.avatar}
                        </div>
                        <div className="user-cell-info">
                          <span className="user-cell-name">{account.name}</span>
                          <span className="user-cell-email">{account.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={`role-badge role-${account.role.toLowerCase()}`}>
                        {getRoleIcon(account.role)}
                        <span>{account.role}</span>
                      </div>
                    </td>
                    <td>
                      <div className={`status-badge ${statusConfig.className}`}>
                        {statusConfig.icon}
                        <span>{statusConfig.label}</span>
                      </div>
                    </td>
                    <td><span className="date-cell">{account.joinDate}</span></td>
                    <td><span className="date-cell">{account.lastLogin}</span></td>
                    <td>
                      <div className="actions-cell">
                        {account.status === 'pending' && (
                          <>
                            <button className="action-btn approve" onClick={() => handleApprove(account.id)} title="Approve">
                              <UserCheck size={16} />
                            </button>
                            <button className="action-btn reject" onClick={() => handleReject(account.id)} title="Reject">
                              <UserX size={16} />
                            </button>
                          </>
                        )}
                        <div className="action-more-wrapper">
                          <button className="action-btn more" onClick={() => setActionMenuId(actionMenuId === account.id ? null : account.id)}>
                            <MoreHorizontal size={16} />
                          </button>
                          {actionMenuId === account.id && (
                            <div className="action-dropdown">
                              <button onClick={() => setShowDetailModal(account)}>
                                <Eye size={14} /> View Details
                              </button>
                              {account.status === 'active' && (
                                <>
                                  <button onClick={() => handleBan(account.id)}>
                                    <Ban size={14} /> Ban Account
                                  </button>
                                  <button onClick={() => handleDeactivate(account.id)}>
                                    <XCircle size={14} /> Deactivate
                                  </button>
                                </>
                              )}
                              {(account.status === 'banned' || account.status === 'inactive') && (
                                <button onClick={() => handleActivate(account.id)}>
                                  <CheckCircle2 size={14} /> Activate
                                </button>
                              )}
                              <div className="dropdown-sep"></div>
                              <div className="dropdown-label">Change Role</div>
                              {getRoleChangeOptions(account.role).map(targetRole => (
                                <button key={targetRole} onClick={() => handleChangeRole(account.id, targetRole)}>
                                  {getRoleChangeIcon(targetRole)} Change to {targetRole}
                                </button>
                              ))}
                              <div className="dropdown-sep"></div>
                              <button className="danger" onClick={() => handleReject(account.id)}>
                                <XCircle size={14} /> Delete Account
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="admin-pagination">
        <div className="pagination-info">
          <span>Showing <strong>{filteredAccounts.length > 0 ? startIndex + 1 : 0}</strong>–<strong>{Math.min(endIndex, filteredAccounts.length)}</strong> of <strong>{filteredAccounts.length}</strong> accounts</span>
        </div>

        <div className="pagination-controls">
          <div className="pagination-rows">
            <span>Rows per page:</span>
            <div className="pagination-rows-select">
              <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <ChevronDown size={12} className="select-arrow-sm" />
            </div>
          </div>

          <div className="pagination-pages">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              title="First page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>

            {getPageNumbers()[0] > 1 && (
              <span className="pagination-ellipsis">…</span>
            )}

            {getPageNumbers().map(page => (
              <button
                key={page}
                className={`pagination-btn pagination-num ${currentPage === page ? 'active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}

            {getPageNumbers()[getPageNumbers().length - 1] < totalPages && (
              <span className="pagination-ellipsis">…</span>
            )}

            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              title="Last page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="admin-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3><UserPlus size={20} /> Add New Account</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <div className="modal-field">
                <label>Full Name</label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                />
              </div>
              <div className="modal-field">
                <label>Email</label>
                <div className="input-with-icon">
                  <Mail size={16} />
                  <input
                    type="email"
                    placeholder="user@fpt.edu.vn"
                    value={newAccount.email}
                    onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-field">
                <label>Password</label>
                <div className="input-with-icon">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={newAccount.password}
                    onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                  />
                  <button className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="modal-field">
                <label>Role</label>
                <select value={newAccount.role} onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}>
                  <option value="Staff">Staff</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="modal-btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="modal-btn-submit" onClick={handleAddAccount}>
                <Plus size={16} /> Create Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && (
        <div className="admin-modal-overlay" onClick={() => setShowDetailModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3><Eye size={20} /> Account Details</h3>
              <button className="modal-close" onClick={() => setShowDetailModal(null)}><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <div className="detail-profile">
                <div className={`detail-avatar ${getAvatarClass(showDetailModal.role)}`}>
                  {showDetailModal.avatar}
                </div>
                <h3>{showDetailModal.name}</h3>
                <p>{showDetailModal.email}</p>
              </div>
              <div className="detail-info-grid">
                <div className="detail-info-item">
                  <span className="detail-label">Role</span>
                  <div className={`role-badge role-${showDetailModal.role.toLowerCase()}`}>
                    {getRoleIcon(showDetailModal.role)}
                    <span>{showDetailModal.role}</span>
                  </div>
                </div>
                <div className="detail-info-item">
                  <span className="detail-label">Status</span>
                  <div className={`status-badge ${getStatusConfig(showDetailModal.status).className}`}>
                    {getStatusConfig(showDetailModal.status).icon}
                    <span>{getStatusConfig(showDetailModal.status).label}</span>
                  </div>
                </div>
                <div className="detail-info-item">
                  <span className="detail-label">Join Date</span>
                  <span className="detail-value"><Calendar size={14} /> {showDetailModal.joinDate}</span>
                </div>
                <div className="detail-info-item">
                  <span className="detail-label">Last Login</span>
                  <span className="detail-value"><Clock size={14} /> {showDetailModal.lastLogin}</span>
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="modal-btn-cancel" onClick={() => setShowDetailModal(null)}>Close</button>
              {showDetailModal.status === 'active' && (
                <button className="modal-btn-danger" onClick={() => { handleBan(showDetailModal.id); setShowDetailModal(null); }}>
                  <Ban size={16} /> Ban Account
                </button>
              )}
              {(showDetailModal.status === 'banned' || showDetailModal.status === 'inactive') && (
                <button className="modal-btn-submit" onClick={() => { handleActivate(showDetailModal.id); setShowDetailModal(null); }}>
                  <CheckCircle2 size={16} /> Activate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Click away to close action menu */}
      {actionMenuId !== null && (
        <div className="action-backdrop" onClick={() => setActionMenuId(null)}></div>
      )}
    </div>
  );
}

export default AdminAccountView;
