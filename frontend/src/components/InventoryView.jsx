// src/components/InventoryView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import API from '../api/api';
import './InventoryView.css'; // Usaremos este para a lista e o layout geral

// O novo componente que mostrará os detalhes completos
import DeviceDetailsView from './DeviceDetailsView';
import ConfirmationModal from './ConfirmationModal'; // Importar o modal

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

  // Estados para o modal de confirmação
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState(null); // { id, name, fromOnboarding }
  const [actionToConfirm, setActionToConfirm] = useState(null); // 'approve' ou 'reject'
  const [deviceForAction, setDeviceForAction] = useState(null); // Dispositivo para aprovar/rejeitar


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

  // Abre o modal de confirmação
  const requestDeleteDevice = (device, fromOnboarding = false) => {
    setDeviceToDelete({ ...device, fromOnboarding });
    setIsConfirmModalOpen(true);
  };

  // Função chamada quando a exclusão é confirmada no modal
  const confirmDeleteDevice = async () => {
    if (!deviceToDelete) return;

    const { id, name, fromOnboarding } = deviceToDelete;

    try {
      await API.delete(`/device/${id}`);
      if (fromOnboarding) {
        fetchAgentDevicesForOnboarding();
      } else {
        fetchApprovedDevices();
        if (selectedDevice && selectedDevice.id === id) {
          setSelectedDevice(null); // Fecha a view de detalhes se o dispositivo excluído era o selecionado
        }
      }
      alert(`Dispositivo '${name}' excluído com sucesso.`);
    } catch (error) {
      console.error("Erro ao deletar dispositivo:", error);
      alert(error.response?.data?.error || "Falha ao excluir dispositivo.");
    } finally {
      setIsConfirmModalOpen(false);
      setDeviceToDelete(null);
    }
  };

  const cancelDeleteDevice = () => {
    setIsConfirmModalOpen(false);
    setDeviceToDelete(null);
  };
  
  // Abre o modal para aprovar/rejeitar
  const requestAgentAction = (device, action) => {
    setDeviceForAction(device);
    setActionToConfirm(action); // 'approve' ou 'reject'
    setIsConfirmModalOpen(true);
  };

  // Função chamada quando a ação (aprovar/rejeitar) é confirmada no modal
  const confirmAgentAction = async () => {
    if (!deviceForAction || !actionToConfirm) return;

    const { id, name } = deviceForAction;

    try {
      let response;
      if (actionToConfirm === 'approve') {
        response = await API.patch(`/device/${id}/approve`);
        fetchApprovedDevices(); // Atualiza a lista de aprovados
        alert(response.data.message || `Dispositivo '${name}' aprovado com sucesso.`);
      } else if (actionToConfirm === 'reject') {
        response = await API.patch(`/device/${id}/reject`);
        alert(response.data.message || `Dispositivo '${name}' rejeitado com sucesso.`);
      }
      fetchAgentDevicesForOnboarding(); // Atualiza a lista de onboarding em ambos os casos
    } catch (error) {
      console.error(`Erro ao ${actionToConfirm} dispositivo do agente:`, error);
      alert(error.response?.data?.message || error.response?.data?.error || `Falha ao ${actionToConfirm} dispositivo.`);
    } finally {
      setIsConfirmModalOpen(false);
      setDeviceForAction(null);
      setActionToConfirm(null);
    }
  };

  // Função para determinar o que o modal deve fazer ao confirmar
  const handleModalConfirm = () => {
    if (deviceToDelete) {
      confirmDeleteDevice();
    } else if (deviceForAction && actionToConfirm) {
      confirmAgentAction();
    }
  };

  // Função para fechar o modal e limpar os estados relevantes
  const handleModalClose = () => {
    setIsConfirmModalOpen(false);
    setDeviceToDelete(null);
    setDeviceForAction(null);
    setActionToConfirm(null);
  };

  // Determina a mensagem do modal dinamicamente
  const getModalMessage = () => {
    if (deviceToDelete) {
      return `Tem certeza que deseja excluir o dispositivo "${deviceToDelete.name}"? ${deviceToDelete.fromOnboarding ? 'Esta ação não pode ser desfeita.' : ''}`;
    }
    if (deviceForAction && actionToConfirm) {
      return `Tem certeza que deseja ${actionToConfirm === 'approve' ? 'aprovar' : 'rejeitar'} o dispositivo "${deviceForAction.name}"?`;
    }
    return '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  return (
    <div className="inventory-view-container card-dashboard">
      {selectedDevice ? (
        <DeviceDetailsView 
          device={selectedDevice} 
          onBack={() => setSelectedDevice(null)}
          onDeleteRequest={() => requestDeleteDevice(selectedDevice, false)}
        />
      ) : (
        <> {/* Fragmento para agrupar a visualização da lista */}
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
                            {device.status === 'pending' && (<button onClick={() => requestAgentAction(device, 'approve')} className="button-approve">Aprovar</button>)}
                            {(device.status === 'pending' || device.status === 'approved') && (<button onClick={() => requestAgentAction(device, 'reject')} className="button-reject">Rejeitar</button>)}
                            {device.status === 'rejected' && (<button onClick={() => requestAgentAction(device, 'approve')} className="button-approve">Aprovar</button>)}
                            <button onClick={() => requestDeleteDevice(device, true)} className="button-delete">Excluir</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {/* Modal de Confirmação */}
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        title={`Confirmar ${actionToConfirm === 'approve' ? 'Aprovação' : actionToConfirm === 'reject' ? 'Rejeição' : 'Exclusão'}`}
        message={getModalMessage()}
        confirmText={actionToConfirm === 'approve' ? 'Aprovar' : actionToConfirm === 'reject' ? 'Rejeitar' : 'Excluir'}
        cancelText="Cancelar"
      />
    </div>
  );
};

export default InventoryView;
