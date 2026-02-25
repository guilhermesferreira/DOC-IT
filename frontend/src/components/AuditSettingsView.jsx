import React, { useState, useEffect } from 'react';
import API from '../api/api';
import './UserGroupsView.css';

// Reusa o ToggleSwitch do UserGroupsView com o mesmo CSS
const ToggleSwitch = ({ checked, onChange, label, description }) => (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #1e293b' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', flexShrink: 0 }}>
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                    position: 'absolute', cursor: 'pointer', inset: 0,
                    backgroundColor: checked ? '#2563eb' : '#334155',
                    borderRadius: '34px',
                    border: `1px solid ${checked ? '#3b82f6' : '#475569'}`,
                    boxShadow: checked ? '0 0 8px rgba(59,130,246,0.4)' : 'none',
                    transition: 'all 0.25s'
                }}>
                    <span style={{
                        position: 'absolute',
                        height: '16px', width: '16px',
                        left: '3px', bottom: '3px',
                        backgroundColor: checked ? '#fff' : '#94a3b8',
                        borderRadius: '50%',
                        transition: 'transform 0.25s, background-color 0.25s',
                        transform: checked ? 'translateX(18px)' : 'translateX(0)'
                    }}></span>
                </span>
            </div>
            <div>
                <span style={{ display: 'block', color: '#e2e8f0', fontSize: '0.95rem' }}>{label}</span>
                {description && <small style={{ color: '#64748b', fontSize: '0.8rem' }}>{description}</small>}
            </div>
        </label>
    </div>
);

const AuditSettingsView = () => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const response = await API.get('/audit/config');
            setConfig(response.data);
        } catch (error) {
            console.error('Erro ao carregar config de auditoria', error);
            setMessage('Erro ao carregar configurações.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (field) => {
        setConfig(prev => ({ ...prev, [field]: !prev[field] }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await API.put('/audit/config', config);
            setMessage('Configurações salvas com sucesso!');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error('Erro ao salvar config', error);
            setMessage('Erro ao salvar as configurações.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="loading-state">Carregando políticas de auditoria...</div>;

    return (
        <div style={{ padding: '24px' }}>
            <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '6px', color: '#f8fafc' }}>
                Políticas de Auditoria
            </h3>
            <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '0.9rem' }}>
                Ative ou desative o registro de atividades no banco de dados para cada módulo do sistema.
            </p>

            {message && (
                <div style={{
                    padding: '10px 16px',
                    backgroundColor: message.includes('Erro') ? 'rgba(127,29,29,0.6)' : 'rgba(20,83,45,0.6)',
                    color: '#fff', borderRadius: '8px', marginBottom: '20px',
                    border: `1px solid ${message.includes('Erro') ? '#dc2626' : '#16a34a'}`
                }}>
                    {message}
                </div>
            )}

            <form onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                    {/* Módulos Principais */}
                    <div className="rbac-module-section">
                        <strong className="rbac-module-title">Módulos Principais</strong>
                        <ToggleSwitch
                            checked={config.logUserActions}
                            onChange={() => handleToggle('logUserActions')}
                            label="Ações de Usuários"
                            description="Login, criação e exclusão de usuários"
                        />
                        <ToggleSwitch
                            checked={config.logDeviceActions}
                            onChange={() => handleToggle('logDeviceActions')}
                            label="Ações em Dispositivos"
                            description="Aprovação, edição e remoção de agentes"
                        />
                        <ToggleSwitch
                            checked={config.logSettingsChanges}
                            onChange={() => handleToggle('logSettingsChanges')}
                            label="Alterações de Configurações"
                            description="Mudanças em configurações globais do sistema"
                        />
                    </div>

                    {/* Segurança e Acesso Remoto */}
                    <div className="rbac-module-section rbac-module-audit">
                        <strong className="rbac-module-title" style={{ color: '#60a5fa' }}>Acesso Remoto (Terminal)</strong>
                        <ToggleSwitch
                            checked={config.logTerminalAccess}
                            onChange={() => handleToggle('logTerminalAccess')}
                            label="Sessões de Terminal"
                            description="Registra quando uma sessão remota inicia ou fecha"
                        />
                        <ToggleSwitch
                            checked={config.logTerminalCommands}
                            onChange={() => handleToggle('logTerminalCommands')}
                            label="Comandos Executados"
                            description="⚠ Atenção: pode gerar grande volume de logs"
                        />
                    </div>
                </div>

                {/* Retenção */}
                <div className="rbac-module-section" style={{ marginTop: '20px' }}>
                    <strong className="rbac-module-title">Retenção de Logs</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                        <label style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>Dias para manter o histórico de auditoria</label>
                        <input
                            type="number"
                            min="1"
                            max="3650"
                            value={config.retentionDays}
                            onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) || 30 })}
                            style={{
                                padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid #334155', backgroundColor: '#0f172a',
                                color: '#fff', width: '100px', fontSize: '1rem'
                            }}
                        />
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>dias</span>
                    </div>
                    <p style={{ color: '#475569', fontSize: '0.8rem', marginTop: '6px' }}>
                        Rotina automática de limpeza roda todo dia às 03:00 AM
                    </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                        type="submit"
                        disabled={saving}
                        className="button-submit"
                    >
                        {saving ? 'Salvando...' : 'Salvar Diretrizes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AuditSettingsView;
