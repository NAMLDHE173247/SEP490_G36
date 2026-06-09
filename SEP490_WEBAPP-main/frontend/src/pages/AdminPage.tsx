import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { 
  Users, 
  Shield, 
  Trash2, 
  ArrowLeft, 
  Mail, 
  Search, 
  UserCheck, 
  AlertTriangle,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'staff';
  createdAt?: string;
}

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.listUsers() as any;
      setUsers(data.users);
    } catch (error: any) {
      toast.error('Không thể tải danh sách người dùng: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'supervisor' | 'staff') => {
    if (userId === currentUser?.id) {
      toast.error('Bạn không thể tự thay đổi vai trò của chính mình.');
      return;
    }

    setUpdatingUserId(userId);
    try {
      await apiService.updateUserRole(userId, newRole);
      toast.success('Cập nhật vai trò người dùng thành công!');
      
      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(user => 
          user.id === userId ? { ...user, role: newRole } : user
        )
      );
    } catch (error: any) {
      toast.error('Lỗi khi cập nhật vai trò: ' + (error.response?.data?.error || error.message));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    
    if (deleteConfirmUser.id === currentUser?.id) {
      toast.error('Bạn không thể tự xóa tài khoản của chính mình.');
      setDeleteConfirmUser(null);
      return;
    }

    setDeleting(true);
    try {
      await apiService.deleteUser(deleteConfirmUser.id);
      toast.success(`Đã xóa người dùng ${deleteConfirmUser.name} thành công.`);
      setUsers(prevUsers => prevUsers.filter(u => u.id !== deleteConfirmUser.id));
      setDeleteConfirmUser(null);
    } catch (error: any) {
      toast.error('Lỗi khi xóa người dùng: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeleting(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeStyle = (role: 'admin' | 'supervisor' | 'staff') => {
    switch (role) {
      case 'admin':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'supervisor':
        return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      case 'staff':
        default:
        return 'bg-blue-50 text-blue-700 border border-blue-200';
    }
  };

  const getRoleLabel = (role: 'admin' | 'supervisor' | 'staff') => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'supervisor':
        return 'Supervisor';
      case 'staff':
      default:
        return 'Staff (Labeler)';
    }
  };

  // Generate unique initial-based avatar colors
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-600',
      'from-rose-500 to-orange-500',
      'from-teal-500 to-emerald-600',
      'from-violet-600 to-indigo-700',
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 transition-all duration-200 font-medium text-sm"
        >
          <ArrowLeft size={16} className="transform group-hover:-translate-x-1 transition-transform" />
          Quay lại Trang chủ
        </button>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md shadow-slate-900/20">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                Quản lý Vai trò & Người dùng
              </h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Xem thông tin, phân quyền (Admin, Supervisor, Staff) và quản trị tài khoản hệ thống.
              </p>
            </div>
          </div>
          
          {/* Current User Role Notice */}
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-100/70 border border-slate-200 rounded-xl self-start md:self-auto">
            <Shield className="w-4 h-4 text-slate-700 animate-pulse" />
            <span className="text-xs text-slate-600 font-semibold">
              Quản trị viên: <span className="text-slate-900">{currentUser?.name}</span>
            </span>
          </div>
        </div>

        {/* Toolbar & Search */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên hoặc email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-lg outline-none focus:border-slate-800 transition-colors text-sm placeholder:text-slate-400"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Hiển thị {filteredUsers.length} trên {users.length} người dùng
            </div>
          </div>

          {/* User Directory Table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900"></div>
              <p className="text-slate-500 text-sm font-medium">Đang tải danh sách người dùng...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">Không tìm thấy người dùng</h3>
              <p className="text-slate-500 text-xs mt-1">Hãy thử tìm kiếm với từ khóa khác.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/70">
                  <tr>
                    <th scope="col" className="px-6 py-4.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Thành viên
                    </th>
                    <th scope="col" className="px-6 py-4.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-4.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Vai trò hiện tại
                    </th>
                    <th scope="col" className="px-6 py-4.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Thay đổi quyền
                    </th>
                    <th scope="col" className="px-6 py-4.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {/* Initials Avatar */}
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(user.name)} text-white flex items-center justify-center font-bold text-sm shadow-sm`}>
                              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                                {user.name}
                                {isSelf && (
                                  <span className="text-[10px] bg-slate-900 text-white font-semibold px-1.5 py-0.5 rounded">
                                    Tôi
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">
                                {user.createdAt ? `Đăng ký: ${new Date(user.createdAt).toLocaleDateString()}` : 'Hệ thống'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <Mail size={14} className="text-slate-400" />
                            {user.email}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getRoleBadgeStyle(user.role)}`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={user.role}
                            disabled={isSelf || updatingUserId === user.id}
                            onChange={(e) => handleRoleChange(user.id, e.target.value as any)}
                            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-slate-800 focus:outline-none transition-colors disabled:opacity-60 cursor-pointer"
                          >
                            <option value="staff">Staff</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setDeleteConfirmUser(user)}
                            disabled={isSelf || deleting}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all duration-150 disabled:opacity-40"
                            title="Xóa người dùng"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modern Custom Delete Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 transform transition-all scale-100">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <button
                  onClick={() => setDeleteConfirmUser(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 mb-1">Xác nhận xóa tài khoản</h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                Bạn có chắc chắn muốn xóa tài khoản của <span className="font-semibold text-slate-900">{deleteConfirmUser.name}</span> ({deleteConfirmUser.email})? Hành động này không thể hoàn tác và tất cả các thông tin liên kết sẽ bị xóa.
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 flex gap-3 justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm hover:shadow shadow-rose-600/10 transition-colors flex items-center gap-1.5 disabled:opacity-60"
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
