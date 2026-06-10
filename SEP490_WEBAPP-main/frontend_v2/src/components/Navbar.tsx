import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Activity, User, Settings, CreditCard, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Hide header on login and register pages
  if (['/login', '/register'].includes(location.pathname)) {
    return null;
  }

  return (
    <header className="header" style={{ position: 'sticky', top: 0, zIndex: 50, width: '100%' }}>
      {/* Left: Logo */}
      <div className="logo-container" onClick={() => navigate(user ? '/dashboard' : '/')} style={{ cursor: 'pointer' }}>
        <img src="/logo.png" alt="Logo" className="app-logo" />
        <div className="logo-text">
          <span className="logo-title">Learning Hub</span>
          <span className="logo-subtitle">AI-Powered Education</span>
        </div>
      </div>

      {user ? (
        <>
          {/* Middle: Resources (Only shown when logged in) */}
          <div className="resources-pill">
            <div className="resources-item">
              <span className="status-dot"></span>
              <Activity size={16} className="icon-blue" />
              <span>4 GPUs</span>
            </div>
            <div className="divider"></div>
            <div className="resources-item">
              <span className="vram-text">VRAM:</span>
              <span className="vram-value">18.4 / 40.0 GB</span>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: '46%' }}></div>
              </div>
            </div>
          </div>

          {/* Right: User Profile (Logged in) */}
          <div 
            className="user-profile" 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            ref={dropdownRef}
          >
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
            <div className="user-avatar">
              <User size={20} />
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <div className="user-avatar">
                    <User size={24} />
                  </div>
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                </div>
                <ul className="dropdown-list">
                  <li className="dropdown-item">
                    <User size={18} className="dropdown-item-icon" />
                    Profile Settings
                  </li>
                  <li className="dropdown-item">
                    <CreditCard size={18} className="dropdown-item-icon" />
                    API Tokens
                  </li>
                  <li className="dropdown-item">
                    <Settings size={18} className="dropdown-item-icon" />
                    Settings
                  </li>
                  {user.role === 'admin' && (
                    <li className="dropdown-item">
                      <Shield size={18} className="dropdown-item-icon" />
                      Admin Panel
                    </li>
                  )}
                  <div className="dropdown-divider"></div>
                  <li className="dropdown-item danger" onClick={handleLogout}>
                    <LogOut size={18} className="dropdown-item-icon" />
                    Logout
                  </li>
                </ul>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Right: Login/Signup buttons (Not logged in) */
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link 
            to="/login" 
            style={{ 
              fontWeight: 600, 
              color: 'var(--text-main)', 
              textDecoration: 'none', 
              fontSize: '15px' 
            }}
          >
            Login
          </Link>
          <Link 
            to="/register" 
            style={{ 
              background: 'var(--primary-gradient)', 
              color: 'white', 
              padding: '8px 20px', 
              borderRadius: '99px', 
              fontWeight: 600, 
              textDecoration: 'none', 
              fontSize: '15px',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
            }}
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
}

export default Navbar;
