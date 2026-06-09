import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, token } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (token && user && allowedRoles && !allowedRoles.includes(user.role)) {
      toast.error('Bạn không có quyền truy cập vào trang này.');
    }
  }, [token, user, allowedRoles]);

  if (!token) {
    // Redirect to login page and save previous location for redirect back
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // User is logged in but does not have the required role
    return <Navigate to="/" replace />;
  }

  return children;
};
