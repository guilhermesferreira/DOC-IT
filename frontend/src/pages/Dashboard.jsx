import React, { useState, useEffect } from 'react';
import API from '../api/api';
import { useAuth } from "../auth/AuthContext.jsx";


const Dashboard = () => {
  const { logout } = useAuth();
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ name: '', type: '', location: '', patrimony: '' });

  const fetchDevices = async () => {
    const res = await API.get('/device');
    setDevices(res.data);
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await API.post('/device', form);
    setForm({ name: '', type: '', location: '', patrimony: '' });
    fetchDevices();
  };

  return (
    <div>
      <h2>Inventário</h2>
      <button onClick={logout}>Sair</button>
      <form onSubmit={handleSubmit}>
        <input name="name" placeholder="Nome" value={form.name} onChange={handleChange} required />
        <input name="type" placeholder="Tipo" value={form.type} onChange={handleChange} required />
        <input name="location" placeholder="Local" value={form.location} onChange={handleChange} required />
        <input name="patrimony" placeholder="Patrimônio" value={form.patrimony} onChange={handleChange} />
        <button type="submit">Cadastrar</button>
      </form>
      <ul>
        {devices.map((device) => (
          <li key={device.id}>
            {device.name} - {device.type} ({device.location})
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Dashboard;
