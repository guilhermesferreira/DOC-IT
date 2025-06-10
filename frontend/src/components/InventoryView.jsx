// src/components/InventoryView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import API from '../api/api';
import './InventoryView.css'; // Usaremos este para a lista e o layout geral

// O novo componente que mostrará os detalhes completos
import DeviceDetailsView from './DeviceDetailsView';

const InventoryView = () => {
  const [devices, setDevices] = useState([]);
  const [manualDeviceForm, setManualDeviceForm] = useState({ name: '', type: '', location: '', patrimony: '' });
  const [editingDevice, setEditingDevice] = useState(null);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null); // Novo estado para o dispositivo selecionado

  // Estados para a aba de Onboarding de Agentes
  const [activeInventorySubView, setActiveInventorySubView] = useState('approvedList'); // 'approvedList' ou 'agentOnboarding'
  const [pendingAgentDevices, setPendingAgentDevices] = useState([]);
  const [isLoadingPendingAgents, setIsLoadingPendingAgents] = useState(false);
  const [agentError, setAgentError] = useState(null);


  // Função para buscar dispositivos APROVADOS (para a lista principal de cards)
  const fetchApprovedDevices = useCallback(async () => {
    // Não precisa verificar activeInventorySubView aqui, pois pode ser chamada por outras ações
    try {
      const res = await API.get('/device?status=approved'); // Buscando apenas dispositivos aprovados para a lista principal
      setDevices(res.data);
    } catch (error) {
      console.error("Erro ao buscar dispositivos aprovados:", error);
    }
  }, []);

  // Função para buscar dispositivos de AGENTES (para onboarding)
  const fetchAgentDevicesForOnboarding = useCallback(async () => {
    // Não precisa verificar activeInventorySubView aqui
    setIsLoadingPendingAgents(true);
    setAgentError(null);
    try {
      // Busca Devices com source 'agent' e status 'pending' ou 'rejected'
      // Poderia incluir 'approved' se quiséssemos permitir rejeitar um aprovado diretamente desta lista
      const response = await API.get('/device?source=agent&status=pending,rejected');
      setPendingAgentDevices(response.data);
    } catch (err) {
      console.error("Erro ao buscar dispositivos de agentes para onboarding:", err);
      setAgentError(err.response?.data?.error || "Falha ao carregar dados de onboarding.");
    } finally {
      setIsLoadingPendingAgents(false);
    }
  }, []);

  // Efeito para buscar dados baseado na sub-aba ativa
  useEffect(() => {
    if (activeInventorySubView === 'approvedList') {
      fetchApprovedDevices();
    } else if (activeInventorySubView === 'agentOnboarding') {
      fetchAgentDevicesForOnboarding();
    }
  }, [activeInventorySubView, fetchApprovedDevices, fetchAgentDevicesForOnboarding]);


  const handleManualDeviceFormChange = (e) => setManualDeviceForm({ ...manualDeviceForm, [e.target.name]: e.target.value });

  const handleSubmitManualDevice = async (e) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        await API.put(`/device/${editingDevice.id}`, manualDeviceForm);
      } else {
        // Backend já define source='manual' e status='approved' para POST em /device
        await API.post('/device', manualDeviceForm);
      }
      setManualDeviceForm({ name: '', type: '', location: '', patrimony: '' });
      setEditingDevice(null);
      setShowRegistrationForm(false);
      fetchApprovedDevices(); // Re-busca a lista de dispositivos aprovados
    } catch (error) {
      console.error("Erro ao salvar dispositivo:", error);
    }
  };

  const handleEdit = (device) => {
    setEditingDevice(device);
    setShowRegistrationForm(true);
    setManualDeviceForm({
      name: device.name,
      type: device.type,
      location: device.location,
      patrimony: device.patrimony || ''
    });
    setSelectedDevice(null); // Fecha a visão de detalhes se estiver aberta
    setActiveInventorySubView('approvedList'); // Garante que o form apareça na aba correta
  };

  const handleDeleteDevice = async (deviceId, deviceName, fromOnboarding = false) => {
    const confirmationMessage = fromOnboarding
      ? `Tem certeza que deseja EXCLUIR PERMANENTEMENTE o dispositivo de agente '${deviceName}' (ID: ${deviceId})? Esta ação não pode ser desfeita.`
      : `Tem certeza que deseja excluir o equipamento '${deviceName}' (ID: ${deviceId})?`;

    if (window.confirm(confirmationMessage)) {
      try {
        await API.delete(`/device/${deviceId}`);
        if (fromOnboarding) {
          fetchAgentDevicesForOnboarding(); // Atualiza a lista de onboarding
        } else {
          fetchApprovedDevices(); // Atualiza a lista de aprovados
          if (selectedDevice && selectedDevice.id === deviceId) {
            setSelectedDevice(null);
          }
        }
        alert('Dispositivo excluído com sucesso.');
      } catch (error) {
        console.error("Erro ao deletar dispositivo:", error);
        alert(error.response?.data?.error || "Falha ao excluir dispositivo.");
      }
    }
  };
  
  const handleApproveAgentDevice = async (deviceId, deviceName) => {
    if (window.confirm(`Tem certeza que deseja aprovar o dispositivo '${deviceName}' (ID: ${deviceId})?`)) {
      try {
        const response = await API.patch(`/device/${deviceId}/approve`);
        fetchAgentDevicesForOnboarding(); // Atualiza a lista de onboarding
        fetchApprovedDevices(); // Atualiza a lista de aprovados, pois um novo item pode aparecer lá
        alert(response.data.message || 'Dispositivo aprovado com sucesso.');
      } catch (error) {
        console.error("Erro ao aprovar dispositivo do agente:", error);
        alert(error.response?.data?.message || error.response?.data?.error || "Falha ao aprovar dispositivo.");
      }
    }
  };

  const handleRejectAgentDevice = async (deviceId, deviceName) => {
    if (window.confirm(`Tem certeza que deseja rejeitar o dispositivo '${deviceName}' (ID: ${deviceId})?`)) {
      try {
        const response = await API.patch(`/device/${deviceId}/reject`);
        fetchAgentDevicesForOnboarding(); // Atualiza a lista de onboarding
        // Não precisa atualizar fetchApprovedDevices aqui, pois um item rejeitado não vai para lá
        alert(response.data.message || 'Dispositivo rejeitado com sucesso.');
      } catch (error) {
        console.error("Erro ao rejeitar dispositivo do agente:", error);
        alert(error.response?.data?.error || "Falha ao rejeitar dispositivo.");
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  // Se um dispositivo estiver selecionado, mostra a visão de detalhes.
  // Senão, mostra a lista de inventário.
  if (selectedDevice) {
    return (
      <DeviceDetailsView 
        device={selectedDevice} 
        onBack={() => setSelectedDevice(null)} // Passa uma função para voltar
      />
    );
  }

  return (
    <div className="inventory-view-container card-dashboard">
      {/* Navegação das Sub-abas */}
      <nav className="inventory-sub-nav">
        <button
          className={`sub-tab-link ${activeInventorySubView === 'approvedList' ? 'active' : ''}`}
          onClick={() => setActiveInventorySubView('approvedList')}
        >
          Dispositivos Aprovados
        </button>
        <button
          className={`sub-tab-link ${activeInventorySubView === 'agentOnboarding' ? 'active' : ''}`}
          onClick={() => setActiveInventorySubView('agentOnboarding')}
        >
          Onboarding Agentes
        </button>
      </nav>

      {/* Conteúdo da Sub-aba Ativa */}
      <div className="inventory-sub-content">
        {activeInventorySubView === 'approvedList' && (
          <>
            <div className="inventory-header">
              <h2>Inventário de Dispositivos Aprovados</h2>
              {!editingDevice && !showRegistrationForm && (
                <button onClick={() => {
                  setShowRegistrationForm(true);
                  setEditingDevice(null);
                  setManualDeviceForm({ name: '', type: '', location: '', patrimony: '' });
                }} className="button-submit">
                  Adicionar Manualmente
                </button>
              )}
            </div>

            {(showRegistrationForm || editingDevice) && (
              <section className="form-section-compact">
                <h4>{editingDevice ? "Editar Equipamento Manual" : "Cadastrar Novo Equipamento Manual"}</h4>
                <form onSubmit={handleSubmitManualDevice}>
                  <div className="form-grid">
                    <div className="form-group"><label>Nome</label><input name="name" value={manualDeviceForm.name} onChange={handleManualDeviceFormChange} required /></div>
                    <div className="form-group"><label>Tipo</label><input name="type" value={manualDeviceForm.type} onChange={handleManualDeviceFormChange} required /></div>
                    <div className="form-group"><label>Localização</label><input name="location" value={manualDeviceForm.location} onChange={handleManualDeviceFormChange} required /></div>
                    <div className="form-group"><label>Patrimônio</label><input name="patrimony" value={manualDeviceForm.patrimony} onChange={handleManualDeviceFormChange} /></div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="button-submit">{editingDevice ? "Salvar" : "Cadastrar"}</button>
                    <button type="button" className="button-cancel" onClick={() => { setEditingDevice(null); setShowRegistrationForm(false); }}>Cancelar</button>
                  </div>
                </form>
              </section>
            )}

            <div className="devices-grid">
              {devices.length > 0 ? devices.map((device) => (
                <div key={device.id} className="device-summary-card" onClick={() => setSelectedDevice(device)}>
                  <div className="device-card-header">
                    <div className={`status-indicator status-${device.status?.toLowerCase() || 'unknown'}`}></div>
                    <strong className="device-name">{device.name}</strong>
                  </div>
                  <div className="device-card-body">
                    <p><strong>Local:</strong> {device.location || 'N/A'}</p>
                    <p><strong>IP:</strong> {device.ipAddress || 'N/A'}</p>
                    <p><strong>Usuário:</strong> {device.osUsername || 'N/A'}</p>
                    <p>{device.type}</p>
                  </div>
                  <div className="device-card-footer">
                    <span>Última Atividade: {formatDate(device.lastSeenAt || device.updatedAt)}</span>
                  </div>
                </div>
              )) : <p className="empty-state">Nenhum dispositivo aprovado encontrado.</p>}
            </div>
          </>
        )}

        {activeInventorySubView === 'agentOnboarding' && (
          <div className="onboarding-section">
            <h2>Dispositivos de Agentes para Onboarding</h2>
            {isLoadingPendingAgents && <p>Carregando dispositivos de agentes...</p>}
            {agentError && <p className="error-message">{agentError}</p>}
            {!isLoadingPendingAgents && !agentError && pendingAgentDevices.length === 0 && (
              <p className="empty-state">Nenhum dispositivo de agente aguardando onboarding ou rejeitado.</p>
            )}
            {!isLoadingPendingAgents && !agentError && pendingAgentDevices.length > 0 && (
              <table className="agent-onboarding-table">
                <thead>
                  <tr>
                    <th>Hostname</th><th>Nome (Device)</th><th>Usuário OS</th><th>IP</th><th>Status</th><th>Último Check-in</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingAgentDevices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.hostname || 'N/A'}</td><td>{device.name}</td><td>{device.osUsername || 'N/A'}</td><td>{device.ipAddress || 'N/A'}</td>
                      <td><span className={`status-badge status-${device.status?.toLowerCase()}`}>{device.status}</span></td>
                      <td>{formatDate(device.lastSeenAt)}</td>
                      <td>
                        {device.status === 'pending' && (<button onClick={() => handleApproveAgentDevice(device.id, device.name)} className="button-approve">Aprovar</button>)}
                        {(device.status === 'pending' || device.status === 'approved') && (<button onClick={() => handleRejectAgentDevice(device.id, device.name)} className="button-reject">Rejeitar</button>)}
                        {device.status === 'rejected' && (<button onClick={() => handleApproveAgentDevice(device.id, device.name)} className="button-approve">Aprovar</button>)}
                        <button onClick={() => handleDeleteDevice(device.id, device.name, true)} className="button-delete">Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryView;
