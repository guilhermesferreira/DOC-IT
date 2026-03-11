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
    Table as TableIcon,
    BookOpen
} from 'lucide-react';
import './OsqueryConsole.css';

const OSQUERY_TEMPLATES = [
    { title: "Tempo de Atividade (Uptime)", sql: "SELECT * FROM uptime;", desc: "Mostra o tempo que a máquina está ligada." },
    { title: "Informações do Sistema", sql: "SELECT hostname, cpu_brand, physical_memory, hardware_vendor, hardware_model FROM system_info;", desc: "Detalhes de hardware e versão do SO." },
    { title: "Usuários Locais", sql: "SELECT uid, username, description, directory FROM users;", desc: "Lista todas as contas de usuário locais." },
    { title: "Administradores Locais", sql: "SELECT * FROM users JOIN user_groups USING (uid) WHERE gid = 'S-1-5-32-544';", desc: "Lista usuários do grupo de Administradores." },
    { title: "Programas Inicializados (Startup)", sql: "SELECT name, path, source FROM startup_items;", desc: "Programas configurados para iniciar com o Windows." },
    { title: "Processos em Execução", sql: "SELECT pid, name, path, on_disk, state, resident_size FROM processes ORDER BY resident_size DESC LIMIT 20;", desc: "Top 20 processos que mais consomem memória." },
    { title: "Portas Abertas (Listening)", sql: "SELECT lp.port, lp.protocol, p.name, p.path FROM listening_ports lp JOIN processes p ON lp.pid = p.pid WHERE lp.port != 0;", desc: "Serviços e processos aguardando conexão de rede." },
    { title: "Tarefas Agendadas", sql: "SELECT name, hidden, state, next_run_time, path FROM scheduled_tasks;", desc: "Verifica as tarefas agendadas no sistema." },
    { title: "Softwares Instalados", sql: "SELECT name, version, publisher, install_date FROM programs;", desc: "Lista de todos os softwares instalados na máquina." },
    { title: "Compartilhamentos de Rede", sql: "SELECT name, path, description, type FROM shared_resources;", desc: "Pastas e recursos compartilhados na rede." },
    { title: "Rotas de Rede", sql: "SELECT destination, netmask, gateway, interface, metric FROM routes;", desc: "Tabela de roteamento local da máquina." },
    { title: "Dispositivos USB Histórico", sql: "SELECT usb_address, usb_port, model, serial FROM usb_devices;", desc: "Lista dispositivos USB conectados recentemente." }
];

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
                        <label className="osq-label">
                            <BookOpen size={14} className="osq-panel-icon" />
                            Modelos Prontos (Windows)
                        </label>
                        <div className="osq-templates-list">
                            {OSQUERY_TEMPLATES.map((tpl, i) => (
                                <div
                                    key={i}
                                    className="osq-template-item"
                                    onClick={() => setSql(tpl.sql)}
                                    title={tpl.sql}
                                >
                                    <div className="osq-tpl-header">
                                        <span className="osq-tpl-title">{tpl.title}</span>
                                    </div>
                                    <span className="osq-tpl-desc">{tpl.desc}</span>
                                </div>
                            ))}
                        </div>
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
                            <label className="osq-label">
                                <Clock size={14} className="osq-panel-icon" />
                                Histórico Recente
                            </label>
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
