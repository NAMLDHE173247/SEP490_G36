import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { getAuthUser, setAuthSession, clearAuthSession } from '../services/authSession';
import toast from 'react-hot-toast';

interface User {
  id?: string;
  _id?: string;
  name?: string;
  role?: string;
  email?: string;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
  updateUser: (updatedData: Partial<User>) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const cachedUser = getAuthUser();
    if (cachedUser) {
      return {
        id: cachedUser.id || cachedUser._id || cachedUser.userId,
        name: cachedUser.name,
        email: cachedUser.email,
        role: cachedUser.role
      };
    }
    return null;
  }); // null = chưa đăng nhập

  // Sync logout across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // If token is removed from localStorage (in another tab), log out this tab
      if (e.key === 'token' && e.newValue === null) {
        setUser(null);
        toast('Phiên đăng nhập đã hết hạn hoặc bạn đã đăng xuất ở tab khác.', {
          icon: '⚠️',
          duration: 5000,
        });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = (userData: User, token: string) => {
    const mappedUser = {
      id: userData.id || userData._id || userData.userId,
      name: userData.name,
      email: userData.email,
      role: userData.role
    };
    setAuthSession(mappedUser, token);
    setUser(mappedUser);
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
  };

  const updateUser = (updatedData: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const nextUser = { ...prev, ...updatedData };
      const currentToken = localStorage.getItem('token') || '';
      if (currentToken) {
        setAuthSession(nextUser, currentToken);
      }
      return nextUser;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
