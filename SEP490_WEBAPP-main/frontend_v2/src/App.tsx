import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Intro from './pages/Intro';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Navbar from './components/Navbar';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import './styles/index.css';

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <Router>
        <div className="app-container">
          <Navbar />
          <div className="page-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Routes>
              <Route path="/" element={<Intro />} />
              <Route path="/login" element={<Auth />} />
              <Route path="/register" element={<Auth />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
