// src/components/InventoryView.jsx
import React, { useState, useEffect } from 'react';
import API from '../api/api'; // Ajuste o caminho se necessário
// Não precisa mais do useAuth aqui se o logout for gerenciado pelo Sidebar/DashboardLayout
import '../pages/Dashboard.css';
import './InventoryView.css'; // CSS específico para esta visão 

const InventoryView = () => {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', type: '', location: '', patrimony: '' });
  const [editingDevice, setEditingDevice] = useState(null);
  const [activeInventorySubView, setActiveInventorySubView] = useState('devices'); // 'devices' ou 'onboarding'
  const [showRegistrationForm, setShowRegistrationForm] = useState(false); // Novo estado para controlar visibilidade do form


  const fetchDevices = async () => {
    try {
      const res = await API.get('/device');
      setDevices(res.data);
    } catch (error) {
      console.error("Erro ao buscar dispositivos:", error);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

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
          Onboarding
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
            <h2>Processo de Onboarding de Equipamentos</h2>
            <p>Aqui você poderá gerenciar o fluxo de entrada de novos equipamentos, checklists, etc.</p>
            {/* Conteúdo futuro da aba de Onboarding */}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryView;