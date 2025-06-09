// src/components/InventoryView.jsx
import React, { useState, useEffect, useCallback  } from 'react';
import API from '../api/api'; // Ajuste o caminho se necessário
// Não precisa mais do useAuth aqui se o logout for gerenciado pelo Sidebar/DashboardLayout
import '../pages/Dashboard.css';
import './InventoryView.css'; // CSS específico para esta visão 

const InventoryView = () => {
 // Estados para a aba "Dispositivos"
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', type: '', location: '', patrimony: '' });
  const [editingDevice, setEditingDevice] = useState(null);
 // Estado para controlar a sub-aba ativa
  const [activeInventorySubView, setActiveInventorySubView] = useState('devices'); // 'devices' ou 'onboarding'
  const [showRegistrationForm, setShowRegistrationForm] = useState(false); // Novo estado para controlar visibilidade do form
 // Estados para a aba "Onboarding"
  const [agentHosts, setAgentHosts] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentError, setAgentError] = useState(null);


  // Funções para a aba "Dispositivos"
  const fetchDevices = useCallback(async () => {
    try {
      const res = await API.get('/device');
      setDevices(res.data);
    } catch (error) {
      console.error("Erro ao buscar dispositivos:", error);
    }
  }, []); 

// useEffect(() => { // Este useEffect não é mais necessário aqui, pois será chamado condicionalmente
  //   fetchDevices();
  // }, [fetchDevices]); // Adicionado fetchDevices às dependências


  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        await API.put(`/device/${editingDevice.id}`, form);
      } else {
        await API.post('/device', form);
      }
      setForm({ name: '', type: '', location: '', patrimony: '' });
      setEditingDevice(null);
      setShowRegistrationForm(false);
      fetchDevices();
    } catch (error) {
      console.error("Erro ao salvar dispositivo:", error);
    }
  };

  const handleEdit = (device) => {
    setEditingDevice(device);
    setShowRegistrationForm(true); // Mostra o formulário para edição
    setForm({
      name: device.name,
      type: device.type,
      location: device.location,
      patrimony: device.patrimony || ''
    });
  };

  const handleDelete = async (deviceId) => {
    if (window.confirm("Tem certeza que deseja excluir este equipamento?")) {
      try {
        await API.delete(`/device/${deviceId}`);
        fetchDevices();
      } catch (error) {
        console.error("Erro ao deletar dispositivo:", error);
      }
    }
  };
  // Funções para a aba "Onboarding"
  const fetchAgentHosts = useCallback(async () => {
    setIsLoadingAgents(true);
    setAgentError(null);
    try {
      const response = await API.get('/agent/hosts');
      setAgentHosts(response.data);
    } catch (err) {
      console.error("Erro ao buscar hosts de agentes:", err);
      setAgentError(err.response?.data?.error || "Falha ao carregar dados de onboarding.");
    } finally {
      setIsLoadingAgents(false);
    }
  }, []); // useCallback

  const handleApproveAgent = async (agentId) => {
    if (window.confirm(`Tem certeza que deseja aprovar o agente ${agentId}?`)) {
      try {
        const response = await API.patch(`/agent/hosts/${agentId}/approve`);
        fetchAgentHosts(); // Re-fetch para atualizar a lista
        // Exibe a mensagem completa do backend
        alert(response.data.message);

        // Se a criação do dispositivo foi bem-sucedida e você quiser
        // que a lista de dispositivos seja atualizada imediatamente
        // (mesmo que o usuário não mude de aba), você pode descomentar a linha abaixo.
        // if (response.data.deviceCreationStatus === 'success') {
        //   fetchDevices();
        // }

      } catch (error) {
        console.error("Erro ao aprovar agente:", error);
         alert(error.response?.data?.message || error.response?.data?.error || "Falha ao aprovar agente.");
      }
    }
  };

  const handleDeleteAgent = async (agentId, agentHostname) => {
    if (window.confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE o agente ${agentHostname} (ID: ${agentId}) do sistema? Esta ação não pode ser desfeita.`)) {
      try {
        const response = await API.delete(`/agent/hosts/${agentId}`);
        fetchAgentHosts(); // Re-fetch para atualizar a lista
        alert(response.data.message);
      } catch (error) {
        console.error("Erro ao excluir agente:", error);
        alert(error.response?.data?.error || "Falha ao excluir agente.");
      }
    }
  };

  const handleRejectAgent = async (agentId) => {
    if (window.confirm(`Tem certeza que deseja rejeitar o agente ${agentId}?`)) {
      try {
        await API.patch(`/agent/hosts/${agentId}/reject`);
        fetchAgentHosts(); // Re-fetch para atualizar a lista
      } catch (error) {
        console.error("Erro ao rejeitar agente:", error);
        alert(error.response?.data?.error || "Falha ao rejeitar agente.");
      }
    }
  };


  // Efeito para buscar dados da aba "Dispositivos" quando ela estiver ativa
  useEffect(() => {
    if (activeInventorySubView === 'devices') {
      fetchDevices();
    }
  }, [activeInventorySubView, fetchDevices]);

  // Efeito para buscar dados da aba "Onboarding" quando ela estiver ativa
  useEffect(() => {
    if (activeInventorySubView === 'onboarding') {
      fetchAgentHosts();
    }
  }, [activeInventorySubView, fetchAgentHosts]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };


  return (
    <div className="inventory-view-container card-dashboard"> {/* Adicionado card-dashboard ao container principal */}
      {/* Navegação das Sub-abas */}
      <nav className="inventory-sub-nav">
        <button
          className={`sub-tab-link ${activeInventorySubView === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveInventorySubView('devices')}
        >
          Dispositivos
        </button>
        <button
          className={`sub-tab-link ${activeInventorySubView === 'onboarding' ? 'active' : ''}`}
          onClick={() => setActiveInventorySubView('onboarding')}
        >
          Onboarding Agentes
        </button>
      </nav>

      {/* Conteúdo da Sub-aba Ativa */}
      <div className="inventory-sub-content">
        {activeInventorySubView === 'devices' && (
          <>
              {/* Botão para mostrar o formulário de cadastro, se não estiver editando ou já mostrando */}
            {!editingDevice && !showRegistrationForm && (
              <div style={{ marginBottom: '20px', textAlign: 'right' }}>
                <button 
                  onClick={() => {
                    setShowRegistrationForm(true);
                    setEditingDevice(null); // Garante que não está em modo de edição
                    setForm({ name: '', type: '', location: '', patrimony: '' }); // Limpa o formulário
                  }} 
                  className="button-submit"
                >
                  Adicionar Novo Equipamento
                </button>
              </div>
            )}

            {/* Formulário de Cadastro/Edição */}
            {(showRegistrationForm || editingDevice) && (
              <section className="form-section">
                <h2>{editingDevice ? "Editar Equipamento" : "Cadastrar Novo Equipamento"}</h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="name">Nome do Equipamento</label>
                      <input id="name" name="name" placeholder="Ex: Impressora HP Laser" value={form.name} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="type">Tipo</label>
                      <input id="type" name="type" placeholder="Ex: Impressora, Notebook" value={form.type} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="location">Localização</label>
                      <input id="location" name="location" placeholder="Ex: Sala 101, Almoxarifado" value={form.location} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="patrimony">Patrimônio (Opcional)</label>
                      <input id="patrimony" name="patrimony" placeholder="Ex: 12345AB" value={form.patrimony} onChange={handleChange} />
                    </div>
                  </div>
                  <button type="submit" className="button-submit">
                    {editingDevice ? "Salvar Alterações" : "Cadastrar Equipamento"}
                  </button>
                      {(editingDevice || showRegistrationForm) && ( // Mostra cancelar se estiver editando OU cadastrando (form visível)
                    <button type="button" className="button-cancel" onClick={() => { setEditingDevice(null); setShowRegistrationForm(false); setForm({ name: '', type: '', location: '', patrimony: '' }); }}>
                      Cancelar
                    </button>
                  )}
                </form>
              </section>
            )}
            <section className="devices-section"> {/* Removido card-dashboard daqui */}
              <h2>Equipamentos Cadastrados</h2>
              {devices.length === 0 ? (
                <p className="empty-state">Nenhum equipamento cadastrado ainda.</p>
              ) : (
                <ul className="devices-list">
                  {devices.map((device) => (
                    <li key={device.id} className="device-item">
                      <div className="device-info">
                        <strong>{device.name}</strong> ({device.type})
                        <span>Local: {device.location}</span>
                        {device.patrimony && <span>Patrimônio: {device.patrimony}</span>}
                      </div>
                      <div className="device-actions">
                        <button onClick={() => handleEdit(device)} className="button-edit">Editar</button>
                        <button onClick={() => handleDelete(device.id)} className="button-delete">Excluir</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {activeInventorySubView === 'onboarding' && (
          <div className="onboarding-section">
            <h2>Hosts de Agentes para Onboarding</h2>
            {isLoadingAgents && <p>Carregando agentes...</p>}
            {agentError && <p className="error-message">{agentError}</p>}
            {!isLoadingAgents && !agentError && agentHosts.length === 0 && (
              <p className="empty-state">Nenhum agente fez check-in ainda ou todos foram processados.</p>
            )}
            {!isLoadingAgents && !agentError && agentHosts.length > 0 && (
              <table className="agent-hosts-table">
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>Usuário OS</th>
                    <th>IP</th>
                    <th>Versão Agente</th>
                    <th>OS Info</th>
                    <th>Status</th>
                    <th>Primeiro Check-in</th>
                    <th>Último Check-in</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {agentHosts.map((agent) => (
                    <tr key={agent.id}>
                      <td>{agent.hostname}</td>
                      <td>{agent.osUsername}</td>
                      <td>{agent.ipAddress || 'N/A'}</td>
                      <td>{agent.agentVersion || 'N/A'}</td>
                      <td>{agent.osInfo || 'N/A'}</td>
                      <td>
                        <span className={`status-badge status-${agent.status.toLowerCase()}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td>{formatDate(agent.firstSeenAt)}</td>
                      <td>{formatDate(agent.lastSeenAt)}</td>
                      <td>
                        {agent.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApproveAgent(agent.id)}
                              className="button-approve"
                              style={{ marginRight: '5px' }}
                            >
                              Aprovar
                            </button>
                            <button
                              onClick={() => handleRejectAgent(agent.id)}
                              className="button-reject"
                            >
                              Rejeitar
                             </button>
                            <button
                              onClick={() => handleDeleteAgent(agent.id, agent.hostname)}
                              className="button-delete" // Reutilizando estilo existente
                              style={{ marginLeft: '5px' }}
                            >
                              Excluir
                            </button>
                          </>
                        )}
                        {(agent.status === 'approved' || agent.status === 'rejected') && (
                                                    <>
                            {/* Mantém o botão de Rejeitar para 'approved' ou um de Reverter para Pendente se preferir */}
                            {agent.status === 'approved' && <button onClick={() => handleRejectAgent(agent.id)} className="button-reject" style={{ marginRight: '5px' }}>Rejeitar</button> }
                            <button
                              onClick={() => handleDeleteAgent(agent.id, agent.hostname)}
                              className="button-delete"
                            >Excluir</button>
                          </>
                        )}
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