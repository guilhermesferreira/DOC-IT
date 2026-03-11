import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { Box, CheckCircle, AlertCircle, RefreshCw, Terminal, ArrowRight } from 'lucide-react';
import './UserGroupsView.css';


const OsqueryBinariesView = () => {
    const [data, setData] = useState({ releases: [], activeVersion: '' });
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(null);
    const [selecting, setSelecting] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/settings/osquery/versions');
            setData(res.data);
        } catch (error) {
            console.error("Erro ao carregar versões do Osquery", error);
            setMessage("Erro ao carregar dados do servidor.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = async (version) => {
        try {
            setSelecting(true);
            setMessage('');
            // Primeiro sincroniza (baixa) no servidor se necessário
            setSyncing(version);
            await api.post('/settings/osquery/sync', { version });
            setSyncing(null);

            // Depois seleciona como ativa
            await api.post('/settings/osquery/select', { version });
            setData(prev => ({ ...prev, activeVersion: version }));
            setMessage(`Versão ${version} sincronizada e definida como ativa para deploy.`);
        } catch (error) {
            console.error("Erro ao selecionar", error);
            setMessage(`Falha ao processar versão ${version}.`);
        } finally {
            setSelecting(false);
            setSyncing(null);
        }
    };

    if (loading) return <div className="loading-state">Consultando infraestrutura Osquery...</div>;

    return (
        <div style={{ padding: '10px' }}>
            <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Terminal size={22} style={{ color: '#2563eb' }} />
                    Gestão de Binários Osquery
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '800px' }}>
                    Escolha qual versão do motor Osquery será distribuída para sua frota.
                    A versão selecionada será baixada pelos agentes automaticamente durante o próximo ciclo de atualização.
                </p>
            </div>

            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    backgroundColor: message.includes('Falha') ? 'rgba(220, 38, 38, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                    border: `1px solid ${message.includes('Falha') ? '#dc2626' : '#22c55e'}`,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '0.95rem'
                }}>
                    {!message.includes('Falha') ? <CheckCircle size={20} style={{ color: '#4ade80' }} /> : <AlertCircle size={20} style={{ color: '#f87171' }} />}
                    {message}
                </div>
            )}

            <div className="rbac-module-section" style={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                            <th style={{ padding: '18px 20px', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Versão</th>
                            <th style={{ padding: '18px 20px', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lançamento</th>
                            <th style={{ padding: '18px 20px', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                            <th style={{ padding: '18px 20px', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.releases.map((rel) => {
                            const isActive = data.activeVersion === rel.version;
                            const isSyncing = syncing === rel.version;

                            return (
                                <tr key={rel.version} className="table-row-hover" style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '6px',
                                                backgroundColor: isActive ? 'rgba(37, 99, 235, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                <Terminal size={16} style={{ color: isActive ? '#3b82f6' : '#64748b' }} />
                                            </div>
                                            <span style={{ fontWeight: 600, color: isActive ? '#f8fafc' : '#cbd5e1' }}>{rel.version}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '20px', color: '#64748b', fontSize: '0.9rem' }}>
                                        {new Date(rel.published_at).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td style={{ padding: '20px' }}>
                                        {isActive ? (
                                            <span style={{
                                                color: '#4ade80', fontSize: '0.75rem', fontWeight: 700,
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(74, 222, 128, 0.1)'
                                            }}>
                                                <CheckCircle size={12} /> EM PRODUÇÃO
                                            </span>
                                        ) : isSyncing ? (
                                            <span style={{ color: '#60a5fa', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <RefreshCw size={14} className="animate-spin" /> Provisionando...
                                            </span>
                                        ) : (
                                            <span style={{ color: '#475569', fontSize: '0.85rem' }}>Disponível no GitHub</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '20px', textAlign: 'right' }}>
                                        {!isActive && (
                                            <button
                                                onClick={() => handleSelect(rel.version)}
                                                disabled={selecting}
                                                style={{
                                                    backgroundColor: '#1e293b',
                                                    color: '#f8fafc',
                                                    border: '1px solid #334155',
                                                    padding: '8px 16px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.borderColor = '#3b82f6'; }}
                                                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.borderColor = '#334155'; }}
                                            >
                                                <ArrowRight size={14} /> Ativar Versão
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '30px', padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(30, 41, 59, 0.5) 100%)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <Box size={20} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <div>
                        <h4 style={{ color: '#f8fafc', margin: '0 0 5px 0', fontSize: '0.95rem' }}>Política de Integridade</h4>
                        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem', lineHeight: '1.5' }}>
                            Ao selecionar uma versão, o servidor Doc-IT baixa o instalador oficial, extrai o motor interativo e valida o hash do binário.
                            O agente Doc-IT validará a assinatura antes de cada ciclo de inventário para prevenir adulterações.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OsqueryBinariesView;
