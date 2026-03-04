import React, { useState, useEffect } from 'react';
import './DashboardSummary.css';
import { useAuth } from '../auth/AuthContext';
import { useOnlineAgents } from '../hooks/useOnlineAgents';
import API from '../api/api';
import {
  MonitorSmartphone,
  Activity,
  Wifi,
  WifiOff,
  Plus,
  Settings,
  FileDown,
  Clock,
  UserCheck
} from 'lucide-react';

const DashboardSummary = ({ devices = [], setActiveView }) => {
  const { user } = useAuth();
  const { onlineAgentIds } = useOnlineAgents();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await API.get('/device?status=pending');
        setPendingCount(res.data.length);
      } catch (e) {
        console.error('Erro ao buscar dispositivos pendentes:', e);
      }
    };
    fetchPending();
  }, []);

  // Calcular métricas derivadas
  const totalDevices = devices.length;
  // Filtra onlineCount para considerar apenas dispositivos aprovados
  const approvedAgentIds = new Set(devices.map(d => d.agentId).filter(Boolean));
  const approvedOnlineCount = [...onlineAgentIds].filter(id => approvedAgentIds.has(id)).length;
  const offlineCount = totalDevices - approvedOnlineCount;

  // Pegar os últimos 5 dispositivos baseados no ID (assumindo IDs incrementais como mais recentes) ou data
  const recentDevices = [...devices]
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);

  return (
    <div className="summary-container">
      {/* Header Removido conforme solicitação do usuário, mantendo layout limpo e direto aos dados */}

      {/* Seção 1: Métricas (KPIs) */}
      <div className="kpi-grid">
        <div className="kpi-card" style={{ flexGrow: 1 }}>
          <div className="kpi-icon-wrapper" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
            <MonitorSmartphone size={24} color="#3b82f6" />
          </div>
          <div className="kpi-content">
            <h3 className="kpi-title">Total de Equipamentos</h3>
            <p className="kpi-value">{totalDevices}</p>
          </div>
        </div>

        <div className="kpi-card" style={{ flexGrow: 1 }}>
          <div className="kpi-icon-wrapper" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <Wifi size={24} color="#10b981" />
          </div>
          <div className="kpi-content">
            <h3 className="kpi-title">Máquinas Online</h3>
            <p className="kpi-value" style={{ color: '#10b981' }}>{approvedOnlineCount}</p>
          </div>
        </div>

        <div className="kpi-card" style={{ flexGrow: 1 }}>
          <div className="kpi-icon-wrapper" style={{ backgroundColor: 'rgba(107, 114, 128, 0.1)' }}>
            <WifiOff size={24} color="#6b7280" />
          </div>
          <div className="kpi-content">
            <h3 className="kpi-title">Máquinas Offline</h3>
            <p className="kpi-value" style={{ color: '#6b7280' }}>{offlineCount < 0 ? 0 : offlineCount}</p>
          </div>
        </div>

        <div className="kpi-card" style={{ flexGrow: 1, cursor: 'pointer' }} onClick={() => setActiveView('inventory')}>
          <div className="kpi-icon-wrapper" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <UserCheck size={24} color="#f59e0b" />
          </div>
          <div className="kpi-content">
            <h3 className="kpi-title">Aguardando Aprovação</h3>
            <p className="kpi-value" style={{ color: '#f59e0b' }}>{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Grid Principal Inferior */}
      <div className="dashboard-main-grid">

        {/* Feed de Atividades Recentes */}
        <div className="recent-activity-card card-dashboard">
          <div className="card-header">
            <h3><Clock size={18} /> Últimas Adições ao Sistema</h3>
          </div>
          <div className="card-body">
            {recentDevices.length > 0 ? (
              <div className="activity-feed">
                {recentDevices.map(device => (
                  <div key={device.id} className="feed-item">
                    <div className="feed-icon">
                      <MonitorSmartphone size={16} />
                    </div>
                    <div className="feed-content">
                      <p className="feed-title">
                        <strong>{device.name}</strong> foi registrado
                      </p>
                      <p className="feed-meta">Tipo: {device.equipmentType?.name || device.type || 'Desconhecido'} {device.ipAddress ? `• IP: ${device.ipAddress}` : ''}</p>
                    </div>
                    {/* Placeholder de tempo relativo se tivesse createdAt */}
                    <div className="feed-time">
                      Recente
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data-text">Nenhum equipamento registrado ainda.</p>
            )}
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="quick-actions-card card-dashboard">
          <div className="card-header">
            <h3>Ações Rápidas</h3>
          </div>
          <div className="card-body quick-actions-body">
            <button
              className="quick-action-btn primary"
              onClick={() => setActiveView('inventory')}
            >
              <div className="qa-icon"><Plus size={20} /></div>
              <div className="qa-text">
                <strong>Registrar Dispositivo</strong>
                <span>Adicionar novo equipamento ao inventário</span>
              </div>
            </button>

            {user?.group?.name === 'SuperAdministrator' && (
              <button
                className="quick-action-btn secondary"
                onClick={() => setActiveView('settings')}
              >
                <div className="qa-icon"><Settings size={20} /></div>
                <div className="qa-text">
                  <strong>Gerenciar Administradores</strong>
                  <span>Configurar contas e permissões</span>
                </div>
              </button>
            )}

            <button
              className="quick-action-btn outline"
              onClick={() => alert("Módulo de relatórios estará disponível em breve.")}
            >
              <div className="qa-icon"><FileDown size={20} /></div>
              <div className="qa-text">
                <strong>Exportar Relatório (em breve)</strong>
                <span>Baixar inventário em Excel/PDF</span>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardSummary;