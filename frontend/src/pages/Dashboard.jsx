// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import API from '../api/api';
import { useAuth } from "../auth/AuthContext.jsx";
import './Dashboard.css'; // Vamos usar este CSS para o layout geral do dashboard
// Vamos criar esses componentes em breve:
import Sidebar from '../components/Sidebar'; // Menu lateral
import InventoryView from '../components/InventoryView'; // A antiga lógica de inventário
import DashboardSummary from '../components/DashboardSummary'; // Para o resumo
import SettingsPage from './SettingsPage'; // Certifique-se que o caminho está correto (ex: './SettingsPage' se estiver na mesma pasta)

const Dashboard = () => {
  const { logout } = useAuth(); //
  const [activeView, setActiveView] = useState('summary'); // Controla a visão atual: 'summary' ou 'inventory'
  const [devices, setDevices] = useState([]); // <-- Adicione este estado para os dispositivos
  // A lógica de fetchDevices, form, editingDevice, handleChange, handleSubmit, handleEdit, handleDelete
  // será movida para o componente InventoryView.jsx

    // Função para buscar os dispositivos
  const fetchDevices = async () => {
    try {
      const res = await API.get('/device');
      setDevices(res.data); // <-- Atualiza o estado com os dispositivos
    } catch (error) {
      console.error("Erro ao buscar dispositivos no Dashboard:", error);
    }
  };

  // Chama fetchDevices uma vez ao carregar o componente
  useEffect(() => {
    fetchDevices();
    // Você pode chamar fetchDevices novamente se houver alguma ação que exija a atualização do resumo
  }, []);
  // Efeito para recarregar os dispositivos quando a aba "Resumo" for selecionada
  useEffect(() => {
    if (activeView === 'summary') {
      fetchDevices();
    }
  }, [activeView]); // Roda sempre que activeView mudar

const renderView = () => {
    switch (activeView) {
      case 'inventory':
        return <InventoryView />;
      case 'settings': 
        return <SettingsPage />; 
      case 'summary':
      default:
        return <DashboardSummary totalDevices={devices.length} />;
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