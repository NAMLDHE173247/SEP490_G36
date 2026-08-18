import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import './styles/index.css';

const Intro = lazy(() => import('./pages/Intro'));
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

function App() {
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('app_theme') || 'light';
    const isCompact = localStorage.getItem('app_compact_mode') === 'true';
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.body.classList.toggle('compact-mode', isCompact);

    // Warmup backend server on Render (wake up early if container is sleeping)
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const healthEndpoint = baseUrl.endsWith('/api')
      ? baseUrl.replace(/\/api$/, '/health')
      : `${baseUrl}/health`;

    fetch(healthEndpoint, { method: 'GET' }).catch(() => {
      // Ignore background ping errors
    });
  }, []);

  return (
    <AuthProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <div className="app-container">
          <Navbar />
          <div className="page-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Đang tải...</div>}>
              <Routes>
                <Route path="/" element={<Intro />} />
                <Route path="/login" element={<Auth />} />
                <Route path="/register" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
