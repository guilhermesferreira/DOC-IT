import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { Settings, Save, Clock, RefreshCw } from 'lucide-react';
import '../pages/Dashboard.css';

const SettingsView = () => {
    const [settings, setSettings] = useState({
        inventoryIntervalMinutes: 60,
        updateCheckIntervalMinutes: 120
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await api.get('/settings');
            setSettings({
                inventoryIntervalMinutes: res.data.inventoryIntervalMinutes,
                updateCheckIntervalMinutes: res.data.updateCheckIntervalMinutes
            });
        } catch (error) {
            const errDetails = error.response ? error.response.data : error.message;
            console.error("Erro Detalhado ao buscar configurações:", errDetails);
            setMessage("Erro ao carregar configurações atuais. Olhe o Console (F12) para detalhes.");
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: parseInt(value) || value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            await api.post('/settings', settings);
            setMessage("Configurações salvas com sucesso! O novo ritmo será adotado pelos Agentes no próximo Check-In.");
            setTimeout(() => setMessage(''), 5000);
        } catch (error) {
            console.error("Erro ao salvar", error);
            setMessage("Falha ao salvar. Verifique se os campos contêm números inteiros válidos.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="loading-state">Conectando ao banco de dados...</div>;
    }

    return (
        <div className="settings-view-embedded">
            <div style={{ marginBottom: '20px' }}>
                <h3>Ajustes Globais e Comunicação</h3>
                <p className="text-secondary">Defina os parâmetros de polling paramétricos de Agentes.</p>
            </div>

            {message && (
                <div className={`status-badge ${message.includes('sucesso') ? 'status-approved' : 'status-rejected'}`} style={{ marginBottom: '20px', padding: '10px 15px', display: 'flex' }}>
                    {message}
                </div>
            )}

            <div style={{ maxWidth: '600px' }}>
                <p className="text-secondary" style={{ marginBottom: '20px' }}>
                    Os Agentes processam esta solicitação em background no próximo check-in deles.
                </p>

                <form onSubmit={handleSubmit} className="mfa-verify-form">
                    <div className="form-group">
                        <label htmlFor="inventoryIntervalMinutes">
                            <Clock size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Intervalo de Inventário (Minutos)
                        </label>
                        <input
                            id="inventoryIntervalMinutes"
                            type="number"
                            name="inventoryIntervalMinutes"
                            value={settings.inventoryIntervalMinutes}
                            onChange={handleChange}
                            min="1"
                            required
                        />
                        <p className="text-secondary" style={{ fontSize: '0.85em', marginTop: '4px' }}>Padrão da Indústria: 60 minutos.</p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="updateCheckIntervalMinutes">
                            <RefreshCw size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Atualização Binária (Minutos)
                        </label>
                        <input
                            id="updateCheckIntervalMinutes"
                            type="number"
                            name="updateCheckIntervalMinutes"
                            value={settings.updateCheckIntervalMinutes}
                            onChange={handleChange}
                            min="1"
                            required
                        />
                        <p className="text-secondary" style={{ fontSize: '0.85em', marginTop: '4px' }}>Ciclo do Auto-Updater. Padrão: 120 minutos.</p>
                    </div>

                    <button type="submit" disabled={saving} className="button-submit" style={{ marginTop: '20px' }}>
                        {saving ? 'Aplicando...' : 'Gravar Regras no Servidor'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default SettingsView;
