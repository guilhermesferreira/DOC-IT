// src/components/Sidebar.jsx
import React, { useState } from 'react';
import './Sidebar.css';
import '../pages/Dashboard.css'; // Confirme que esta importação ainda está aqui para os estilos gerais

// Importe os ícones do Font Awesome (versão 6, por exemplo, se a FaHouse existir)
// Se FaHouse, FaBox, FaRightFromBracket não forem encontrados, tente a versão 5:
// import { FaHome, FaBoxOpen, FaSignOutAlt } from 'react-icons/fa';
import { FaHouse, FaBox, FaRightFromBracket } from 'react-icons/fa6'; // <-- Tente esta importação primeiro

const Sidebar = ({ setActiveView, logout }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <aside
      className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="sidebar-header">
        <h2>{isExpanded ? 'Doc-IT Painel' : 'D-IT'}</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <button onClick={() => setActiveView('summary')}>
              <span className="icon"><FaHouse /></span> {/* Ícone de casa */}
              <span className="button-text">{isExpanded && 'Resumo'}</span>
            </button>
          </li>
          <li>
            <button onClick={() => setActiveView('inventory')}>
              <span className="icon"><FaBox /></span> {/* Ícone de caixa */}
              <span className="button-text">{isExpanded && 'Inventário'}</span>
            </button>
          </li>
          {/* Adicione mais links/botões aqui com outros ícones do Font Awesome se precisar */}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <button onClick={logout} className="button-logout-sidebar">
          <span className="button-text">{isExpanded && 'Sair'}</span>
          <span className="button-icon"><FaRightFromBracket /></span> {/* Ícone de sair */}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;