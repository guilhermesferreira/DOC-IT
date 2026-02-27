import React from 'react';
import './Sidebar.css';
import { ShieldAlert } from 'lucide-react';
import { FaHouse, FaBox, FaRightFromBracket } from 'react-icons/fa6';
import { FaCog as FaSettingsIcon } from 'react-icons/fa';
import { useAuth } from '../auth/AuthContext';

const Sidebar = ({ setActiveView, logout, isExpanded, setIsExpanded }) => {
  const { user } = useAuth();

  const getAvatarColor = (name) => {
    if (!name) return 'var(--sidebar-active-bg-color)';
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <aside
      className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="sidebar-header">
        <h2>
          <ShieldAlert className="logo-icon" size={24} strokeWidth={2.5} />
          {isExpanded && (import.meta.env.VITE_PROJECT_NAME || 'Doc-IT')}
        </h2>
      </div>

      <nav className="sidebar-nav">
        <ul>
          <li>
            <button onClick={() => setActiveView('summary')}>
              <span className="icon"><FaHouse /></span>
              <span className="button-text">Painel Principal</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setActiveView('inventory')}
              aria-label="Gestão de Dispositivos"
            >
              <span className="icon"><FaBox /></span>
              <span className="button-text">Gestão de Dispositivos</span>
            </button>
          </li>

          {/* Logs de Auditoria de volta ao Sidebar */}
          {user?.group?.canViewAuditLogs && (
            <li>
              <button onClick={() => setActiveView('audit-logs')}>
                <span className="icon"><ShieldAlert size={18} /></span>
                <span className="button-text">Logs de Auditoria</span>
              </button>
            </li>
          )}

          {(user?.group?.name === 'SuperAdministrator' || user?.group?.canViewAuditSettings || user?.group?.canViewSettings) && (
            <li>
              <button onClick={() => setActiveView('settings')}>
                <span className="icon"><FaSettingsIcon /></span>
                <span className="button-text">Configurações</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user-profile" title={`Logado como ${user.username}`}>
            <div className="sidebar-avatar" style={{ backgroundColor: getAvatarColor(user.username) }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-username">{user.username}</span>
              <span className="sidebar-role">{user.group?.name || 'Admin'}</span>
            </div>
          </div>
        )}

        <button onClick={logout} className="button-logout-sidebar" title="Encerrar Sessão">
          <span className="button-icon"><FaRightFromBracket /></span>
          <span className="button-text">Sair do Sistema</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
