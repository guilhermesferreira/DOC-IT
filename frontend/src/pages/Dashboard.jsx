// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import API from '../api/api';
import { useAuth } from "../auth/AuthContext.jsx";
import './Dashboard.css'; // Vamos usar este CSS para o layout geral do dashboard
// Vamos criar esses componentes em breve:
import Sidebar from '../components/Sidebar'; // Menu lateral
import InventoryView from '../components/InventoryView'; // A antiga lógica de inventário
import DashboardSummary from '../components/DashboardSummary'; // Para o resumo

const Dashboard = () => {
  const { logout } = useAuth(); //
  const [activeView, setActiveView] = useState('summary'); // Controla a visão atual: 'summary' ou 'inventory'

  // A lógica de fetchDevices, form, editingDevice, handleChange, handleSubmit, handleEdit, handleDelete
  // será movida para o componente InventoryView.jsx

  const renderView = () => {
    switch (activeView) {
      case 'inventory':
        return <InventoryView />;
      case 'summary':
      default:
        return <DashboardSummary />;
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar setActiveView={setActiveView} logout={logout} />
      <main className="dashboard-main-content">
        {renderView()}
      </main>
    </div>
  );
};

export default Dashboard;