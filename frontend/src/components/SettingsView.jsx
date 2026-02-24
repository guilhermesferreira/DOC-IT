import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { Settings, Save, Clock, RefreshCw, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import '../pages/Dashboard.css';

const SettingsView = () => {
    const [settings, setSettings] = useState({
        inventoryIntervalMinutes: 60,
        updateCheckIntervalMinutes: 120
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const { user } = useAuth(); // Importa os privilégios injetados pelo Backend

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
            <div style={{ marginBottom: '35px' }}>
                <h3 style={{ fontSize: '1.25rem', color: '#1f2937', marginBottom: '8px' }}>Ajustes Globais e Comunicação</h3>
                <p className="text-secondary" style={{ fontSize: '0.9rem', maxWidth: '600px' }}>
                    Defina o comportamento padrão e os temporizadores da sua frota. Agentes processam essa mudança no próximo check-in de forma transparente.
                </p>
            </div>

            {message && (
                <div className={`status-badge ${message.includes('sucesso') ? 'status-approved' : 'status-rejected'}`} style={{ marginBottom: '25px', padding: '10px 15px', display: 'inline-flex' }}>
                    {message}
                </div>
            )}

            <div style={{ maxWidth: '550px' }}>
                <form onSubmit={handleSubmit} className="mfa-verify-form">
                    <div className="form-group" style={{ marginBottom: '30px' }}>
                        <label htmlFor="inventoryIntervalMinutes" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                            <Clock size={16} style={{ marginRight: '8px', verticalAlign: '-3px', color: 'var(--primary-color)' }} />
                            Intervalo de Inventário
                        </label>
                        <p className="text-secondary" style={{ fontSize: '0.8rem', marginTop: 0, marginBottom: '12px' }}>Frequência com que o agente reporta os dados de hardware e software.</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                id="inventoryIntervalMinutes"
                                type="number"
                                name="inventoryIntervalMinutes"
                                value={settings.inventoryIntervalMinutes}
                                onChange={handleChange}
                                min="1"
                                required
                                disabled={!user?.group?.canEditSettings}
                                style={{ maxWidth: '120px', padding: '8px 12px' }}
                            />
                            <span className="premium-badge badge-gray" style={{ fontSize: '0.75rem' }}>Alvo: 60 min</span>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '30px' }}>
                        <label htmlFor="updateCheckIntervalMinutes" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                            <RefreshCw size={16} style={{ marginRight: '8px', verticalAlign: '-3px', color: 'var(--avatar-teal)' }} />
                            Frequência de atualização automática
                        </label>
                        <p className="text-secondary" style={{ fontSize: '0.8rem', marginTop: 0, marginBottom: '12px' }}>Tempo entre as verificações de novas versões do motor binário Doc-IT.</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                id="updateCheckIntervalMinutes"
                                type="number"
                                name="updateCheckIntervalMinutes"
                                value={settings.updateCheckIntervalMinutes}
                                onChange={handleChange}
                                min="1"
                                required
                                disabled={!user?.group?.canEditSettings}
                                style={{ maxWidth: '120px', padding: '8px 12px' }}
                            />
                            <span className="premium-badge badge-gray" style={{ fontSize: '0.75rem' }}>Motor: 120 min</span>
                        </div>
                    </div>

                    <div style={{ paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                        {user?.group?.canEditSettings && (
                            <button type="submit" disabled={saving} className="button-submit" style={{ display: 'flex', alignItems: 'center', fontSize: '0.95rem', padding: '10px 20px' }}>
                                <Save size={16} style={{ marginRight: '8px' }} />
                                {saving ? 'Aplicando Regras...' : 'Gravar Alterações'}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SettingsView;
