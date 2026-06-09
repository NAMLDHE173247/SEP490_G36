import React, { createContext, useState, useContext, ReactNode } from 'react';
import { getAuthUser, setAuthSession, clearAuthSession } from '../services/authSession';

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

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
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
