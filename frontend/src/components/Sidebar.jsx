// src/components/Sidebar.jsx
import React from 'react';
import './Sidebar.css'; // CSS para o Sidebar

const Sidebar = ({ setActiveView, logout }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Doc-IT Painel</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          <li>
            <button onClick={() => setActiveView('summary')}>Resumo</button>
          </li>
          <li>
            <button onClick={() => setActiveView('inventory')}>Inventário</button>
          </li>
          {/* Adicione mais links/botões aqui para futuras seções */}
          {/* <li><button onClick={() => setActiveView('reports')}>Relatórios</button></li> */}
          {/* <li><button onClick={() => setActiveView('settings')}>Configurações</button></li> */}
        </ul>
      </nav>
      <div className="sidebar-footer">
        <button onClick={logout} className="button-logout-sidebar">Sair</button>
      </div>
    </aside>
  );
};

export default Sidebar;