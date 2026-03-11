// src/components/OsqueryConsole.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import API from '../api/api';
import {
    Database,
    Play,
    Terminal,
    AlertCircle,
    Search,
    Clock,
    Download,
    Trash2,
    Table as TableIcon
} from 'lucide-react';
import './OsqueryConsole.css'; // O CSS que resolveremos a seguir

const OsqueryConsole = () => {
    const { socket, isConnected } = useSocket();
    const [onlineAgents, setOnlineAgents] = useState([]);
    const [devices, setDevices] = useState([]);
    const [selectedAgent, setSelectedAgent] = useState('');
    const [sql, setSql] = useState('SELECT * FROM uptime;');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [history, setHistory] = useState([]);

    // Fetch approved devices to show names/ips
    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const res = await API.get('/device?status=approved');
                setDevices(res.data);
            } catch (err) {
                console.error("Erro ao buscar dispositivos:", err);
            }
        };
        fetchDevices();
    }, []);

    // Load online agents via Socket
    useEffect(() => {
        if (!socket) return;

        socket.emit('request:online-list');

        const handleAgentList = (list) => setOnlineAgents(list);
        const handleResults = (data) => {
            if (data.agentId === selectedAgent || !selectedAgent) {
                if (data.error) {
                    setError(data.error);
                    setResults(null);
                } else {
                    setResults(data.results);
                    setError(null);
                }
                setLoading(false);
            }
        };

        socket.on('agent:online-list', handleAgentList);
        socket.on('osquery:results', handleResults);

        return () => {
            socket.off('agent:online-list', handleAgentList);
            socket.off('osquery:results', handleResults);
        };
    }, [socket, selectedAgent]);

    const executeQuery = () => {
        if (!selectedAgent) {
            setError('Selecione um agente primeiro.');
            return;
        }
        if (!sql.trim()) return;

        setLoading(true);
        setError(null);
        setResults(null);

        socket.emit('osquery:query', { agentId: selectedAgent, sql });

        setHistory(prev => [{ sql, timestamp: new Date() }, ...prev].slice(0, 10));
    };

    const downloadResults = () => {
        if (!results) return;
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `osquery_results_${selectedAgent}_${new Date().getTime()}.json`;
        a.click();
    };

    const renderTable = () => {
        if (!results || results.length === 0) {
            return <div className="osq-no-data">Nenhum dado retornado.</div>;
        }

        const columns = Object.keys(results[0]);

        return (
            <div className="osq-table-wrapper">
                <table className="osq-table">
                    <thead>
                        <tr>
                            {columns.map(col => <th key={col}>{col}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((row, idx) => (
                            <tr key={idx}>
                                {columns.map(col => <td key={col}>{row[col]}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const onlineDevices = onlineAgents.map(agentId => {
        const dev = devices.find(d => d.agentId === agentId);
        return dev ? { ...dev, displayId: agentId } : { agentId, name: 'Desconhecido', displayId: agentId };
    });

    return (
        <div className="osq-container">
            <header className="osq-header">
                <div className="osq-header-icon">
                    <Terminal size={24} />
                </div>
                <div>
                    <h2>Console SQL Osquery</h2>
                    <p>Execute consultas estruturadas em tempo real nos agentes remotos.</p>
                </div>
            </header>

            <div className="osq-layout">
                {/* Lateral Esquerda - Controles */}
                <div className="osq-sidebar">
                    <div className="osq-panel">
                        <label className="osq-label">
                            <span className="osq-pulse-dot"></span>
                            Selecione o Agente
                        </label>
                        <select
                            className="osq-select"
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                        >
                            <option value="">-- Selecione um agente online --</option>
                            {onlineDevices.map(dev => (
                                <option key={dev.displayId} value={dev.displayId}>
                                    {dev.name !== 'Desconhecido'
                                        ? `${dev.name} - IP: ${dev.ipAddress || '?'} (${dev.osUsername || '?'})`
                                        : dev.displayId}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="osq-panel">
                        <label className="osq-label">Editor SQL</label>
                        <div className="osq-editor-group">
                            <textarea
                                className="osq-textarea"
                                value={sql}
                                onChange={(e) => setSql(e.target.value)}
                                placeholder="SELECT * FROM uptime;"
                                spellCheck="false"
                            />
                            <button
                                className={`osq-btn-run ${loading ? 'loading' : ''}`}
                                onClick={executeQuery}
                                disabled={loading}
                            >
                                {loading ? (
                                    <div className="osq-spinner"></div>
                                ) : (
                                    <Play size={16} />
                                )}
                                <span>{loading ? 'Executando...' : 'Rodar Query'}</span>
                            </button>
                        </div>
                    </div>

                    {history.length > 0 && (
                        <div className="osq-panel">
                            <label className="osq-label">Histórico Recente</label>
                            <div className="osq-history-list">
                                {history.map((h, i) => (
                                    <div
                                        key={i}
                                        className="osq-history-item"
                                        onClick={() => setSql(h.sql)}
                                    >
                                        <span className="osq-history-sql">{h.sql}</span>
                                        <Clock size={14} className="osq-history-icon" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Lateral Direita - Resultados */}
                <div className="osq-main osq-panel">
                    <div className="osq-main-header">
                        <div className="osq-main-title">
                            <TableIcon size={18} />
                            <span>RESULTADOS DA QUERY</span>
                            {results && <span className="osq-badge">{results.length} linhas</span>}
                        </div>
                        <div className="osq-actions">
                            {results && (
                                <button onClick={downloadResults} className="osq-btn-icon" title="Exportar JSON">
                                    <Download size={16} />
                                </button>
                            )}
                            <button onClick={() => { setResults(null); setError(null); }} className="osq-btn-icon danger" title="Limpar">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="osq-main-content">
                        {loading && (
                            <div className="osq-state-box loading-state">
                                <div className="osq-loader-ring"></div>
                                <h4>Consultando agente remotamente...</h4>
                                <p>Aguardando resposta do cliente via mTLS.</p>
                            </div>
                        )}

                        {error && (
                            <div className="osq-state-box error-state">
                                <AlertCircle size={48} className="osq-error-icon" />
                                <h4>Erro na Consulta Osquery</h4>
                                <div className="osq-error-block">{error}</div>
                            </div>
                        )}

                        {!loading && !error && results && renderTable()}

                        {!loading && !error && !results && (
                            <div className="osq-state-box empty-state">
                                <div className="osq-icon-circle">
                                    <Search size={40} />
                                </div>
                                <h4>Pronto para Consulta</h4>
                                <p>Selecione um agente, digite a query no editor e execute.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OsqueryConsole;
