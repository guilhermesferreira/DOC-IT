// src/components/InventoryView.jsx
import React, { useState, useEffect } from 'react';
import API from '../api/api'; // Ajuste o caminho se necessário
// Não precisa mais do useAuth aqui se o logout for gerenciado pelo Sidebar/DashboardLayout
import './InventoryView.css'; // CSS específico para esta visão

const InventoryView = () => {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', type: '', location: '', patrimony: '' });
  const [editingDevice, setEditingDevice] = useState(null);

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
      fetchDevices();
    } catch (error) {
      console.error("Erro ao salvar dispositivo:", error);
    }
  };

  const handleEdit = (device) => {
    setEditingDevice(device);
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
    <div className="inventory-view-container">
      <section className="form-section card-dashboard"> {/* Reutilizando card-dashboard */}
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
          {editingDevice && (
            <button type="button" className="button-cancel" onClick={() => { setEditingDevice(null); setForm({ name: '', type: '', location: '', patrimony: '' }); }}>
              Cancelar Edição
            </button>
          )}
        </form>
      </section>

      <section className="devices-section card-dashboard"> {/* Reutilizando card-dashboard */}
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
    </div>
  );
};

export default InventoryView;