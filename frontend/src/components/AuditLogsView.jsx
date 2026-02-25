import React, { useState, useEffect } from 'react';
import API from '../api/api';
import './AuditLogsView.css';

const AuditLogsView = () => {
    const [logs, setLogs] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedRow, setExpandedRow] = useState(null);

    // Filtros
    const [page, setPage] = useState(1);
    const [filterUser, setFilterUser] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterResource, setFilterResource] = useState('');

    useEffect(() => {
        loadLogs();
        // eslint-disable-next-line
    }, [page, filterUser, filterAction, filterResource]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const params = { page, limit: 15 };
            if (filterUser) params.user = filterUser;
            if (filterAction) params.action = filterAction;
            if (filterResource) params.resource = filterResource;

            const response = await API.get('/audit/logs', { params });
            setLogs(response.data.data);
            setMeta(response.data.meta);
        } catch (error) {
            console.error('Erro ao buscar logs', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleRow = (id) => {
        if (expandedRow === id) setExpandedRow(null);
        else setExpandedRow(id);
    };

    const translateAction = (action) => {
        const dict = { 'CREATE': 'Criação', 'UPDATE': 'Atualização', 'DELETE': 'Exclusão', 'ACCESS': 'Acesso', 'COMMAND': 'Comando' };
        return dict[action] || action;
    };

    const actionColor = (action) => {
        if (action === 'DELETE') return '#ef4444';
        if (action === 'CREATE') return '#10b981';
        if (action === 'UPDATE') return '#f59e0b';
        if (action === 'COMMAND') return '#a855f7';
        return '#3b82f6';
    };

    return (
        <div className="audit-logs-container">
            <div className="audit-header">
                <h3>Trilha de Auditoria do Sistema</h3>
                <div className="audit-filters">
                    <input
                        type="text"
                        placeholder="Filtrar por Usuário"
                        value={filterUser}
                        onChange={e => { setFilterUser(e.target.value); setPage(1); }}
                        className="audit-filter-input"
                    />
                    <select
                        value={filterAction}
                        onChange={e => { setFilterAction(e.target.value); setPage(1); }}
                        className="audit-filter-select"
                    >
                        <option value="">Todas as Ações</option>
                        <option value="CREATE">Criação</option>
                        <option value="UPDATE">Atualização</option>
                        <option value="DELETE">Exclusão</option>
                        <option value="ACCESS">Acesso</option>
                        <option value="COMMAND">Comandos (Terminal)</option>
                    </select>
                    <select
                        value={filterResource}
                        onChange={e => { setFilterResource(e.target.value); setPage(1); }}
                        className="audit-filter-select"
                    >
                        <option value="">Todos os Módulos</option>
                        <option value="USER">Usuários</option>
                        <option value="DEVICE">Dispositivos</option>
                        <option value="GROUP">Grupos</option>
                        <option value="TERMINAL">Sessão Remota</option>
                        <option value="TERMINAL_SESSION">Auditoria de Comandos</option>
                        <option value="AUDIT_CONFIG">Config. de Auditoria</option>
                        <option value="GLOBAL_SETTINGS">Setup do Sistema</option>
                    </select>
                </div>
            </div>

            <div className="audit-table-container">
                <table className="audit-table">
                    <thead>
                        <tr>
                            <th>Data e Hora</th>
                            <th>Usuário</th>
                            <th>Ação</th>
                            <th>Módulo / Alvo</th>
                            <th>IP de Origem</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && logs.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center' }}>Carregando dados...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center' }}>Nenhum log encontrado para estes filtros.</td></tr>
                        ) : (
                            logs.map(log => (
                                <React.Fragment key={log.id}>
                                    <tr className={expandedRow === log.id ? 'expanded' : ''}>
                                        <td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                                        <td>{log.user ? log.user.username : <span style={{ color: '#94a3b8' }}>Sistema</span>}</td>
                                        <td>
                                            <span className="action-badge" style={{ backgroundColor: actionColor(log.action) }}>
                                                {translateAction(log.action)}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 500 }}>{log.resource}</td>
                                        <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{log.ipAddress || '--'}</td>
                                        <td>
                                            <button
                                                className="btn-expand"
                                                onClick={() => toggleRow(log.id)}
                                            >
                                                {expandedRow === log.id ? 'Recolher' : 'Ver Detalhes'}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedRow === log.id && (
                                        <tr className="log-details-row">
                                            <td colSpan="6">
                                                <div className="log-details-box">
                                                    <strong>Dados Capturados:</strong>
                                                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {meta && meta.lastPage > 1 && (
                <div className="audit-pagination">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                    >
                        Anterior
                    </button>
                    <span>Página {page} de {meta.lastPage}</span>
                    <button
                        disabled={page === meta.lastPage}
                        onClick={() => setPage(page + 1)}
                    >
                        Próxima
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuditLogsView;
