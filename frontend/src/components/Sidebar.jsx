// src/components/Sidebar.jsx
import React, { useState } from 'react';
import './Sidebar.css';

// Usar FaCog de fa (Font Awesome 5) ou FaGear de fa6
import { FaHouse, FaBox, FaRightFromBracket } from 'react-icons/fa6'; 
import { FaCog as FaSettingsIcon } from 'react-icons/fa'; // Importa FaCog de fa e o apelida

const Sidebar = ({ setActiveView, logout, isExpanded, setIsExpanded }) => {
  // O estado isExpanded agora é controlado pelo componente pai (Dashboard)

  return (
    <aside
      className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}
      onMouseEnter={() => setIsExpanded(true)} // Mantém a lógica de hover
      onMouseLeave={() => setIsExpanded(false)} // Mantém a lógica de hover
    >
      <div className="sidebar-header">
        <h2>{isExpanded ? 'Doc-IT Painel' : 'D-IT'}</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <button onClick={() => setActiveView('summary')}>
              <span className="icon"><FaHouse /></span>
              <span className="button-text">{isExpanded && 'Resumo'}</span>
            </button>
          </li>
          <li>
            <button onClick={() => setActiveView('inventory')}>
              <span className="icon"><FaBox /></span>
              <span className="button-text">{isExpanded && 'Inventário'}</span>
            </button>
          </li>
          {/* O botão de Configurações foi movido para o sidebar-footer */}
        </ul>
      </nav>
      <div className="sidebar-footer">
        {/* Nova lista de navegação no rodapé para o botão Configurações */}
        <nav className="sidebar-nav footer-nav"> {/* Adicionada classe footer-nav para estilização específica se necessário */}
          <ul>
            <li>
              <button onClick={() => setActiveView('settings')}>
                <span className="icon"><FaSettingsIcon /></span>
                <span className="button-text">{isExpanded && 'Configurações'}</span>
              </button>
            </li>
          </ul>
        </nav>
        {/* Botão de Sair abaixo do de Configurações */}
        <button onClick={logout} className="button-logout-sidebar">
          <span className="button-icon"><FaRightFromBracket /></span>
          <span className="button-text">{isExpanded && 'Sair'}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
