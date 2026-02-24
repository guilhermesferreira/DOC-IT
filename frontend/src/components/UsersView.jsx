import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { UserCog, Trash2, Info, ShieldAlert, Plus } from 'lucide-react';

const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [newUser, setNewUser] = useState({ username: '', email: '', password: '', groupId: 'null' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, groupsRes] = await Promise.all([
                api.get('/users'),
                api.get('/user-groups')
            ]);
            setUsers(usersRes.data);
            setGroups(groupsRes.data);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            setMessage("Erro crítico ao sincronizar Usuários e Grupos com o Servidor.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            const payload = { ...newUser, groupId: newUser.groupId === 'null' ? null : parseInt(newUser.groupId) };
            const res = await api.post('/users', payload);
            setUsers([...users, res.data]);
            setNewUser({ username: '', email: '', password: '', groupId: 'null' });
            setMessage("Usuário criado com sucesso!");
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(error.response?.data?.message || "Falha ao criar o usuário. Nome ou E-mail já utilizados.");
        } finally {
            setSaving(false);
        }
    };

    const handleGroupChange = async (userId, newGroupId) => {
        try {
            setMessage('');
            // Se o valor for a string "null" (Nenhum), convertemos para null pra enviar pra API
            const groupIdPayload = newGroupId === "null" ? null : parseInt(newGroupId);
            const res = await api.put(`/users/${userId}`, { groupId: groupIdPayload });

            setUsers(users.map(u => u.id === userId ? { ...u, groupId: res.data.groupId, group: res.data.group } : u));
        } catch (error) {
            setMessage(error.response?.data?.message || "Falha ao alternar permissão do usuário.");
        }
    };

    const handleDelete = async (userId) => {
        if (!window.confirm("Atenção Definitiva: Tem certeza que deseja excluir esta conta de usuário para sempre?")) return;
        try {
            await api.delete(`/users/${userId}`);
            setUsers(users.filter(u => u.id !== userId));
            setMessage("Conta de administrador revogada e excluída.");
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(error.response?.data?.message || "Não foi possível excluir o usuário (Ele pode possuir devices registrados).");
        }
    };

    if (loading) return <div className="loading-state">Carregando painel de administradores...</div>;

    return (
        <div className="settings-view-embedded">
            <div style={{ marginBottom: '20px' }}>
                <h3>Administração e Identidades</h3>
                <p className="text-secondary">Associe as contas ativas do Doc-IT a seus devidos Grupos de Permissão.</p>
            </div>

            {message && (
                <div className={`status-badge ${message.includes('Falha') || message.includes('Erro') || message.includes('Não') ? 'status-rejected' : 'status-approved'}`} style={{ marginBottom: '20px', padding: '10px 15px', display: 'flex' }}>
                    <Info size={16} style={{ marginRight: '8px' }} /> {message}
                </div>
            )}

            <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px', alignItems: 'start' }}>
                {/* Painel de Criação */}
                <div className="card-dashboard">
                    <h4>Criar Nova Conta</h4>
                    <form onSubmit={handleCreate} className="mfa-verify-form" style={{ marginTop: '15px' }}>
                        <div className="form-group">
                            <label>Nome de Usuário</label>
                            <input
                                type="text"
                                placeholder="ex: admin_sec"
                                value={newUser.username}
                                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>E-Mail Comercial</label>
                            <input
                                type="email"
                                placeholder="seu@email.com"
                                value={newUser.email}
                                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Senha Inicial</label>
                            <input
                                type="password"
                                placeholder="Uma senha forte"
                                value={newUser.password}
                                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                required
                                minLength={6}
                            />
                        </div>
                        <div className="form-group">
                            <label>Grupo (Opcional)</label>
                            <select
                                value={newUser.groupId}
                                onChange={(e) => setNewUser({ ...newUser, groupId: e.target.value })}
                            >
                                <option value="null">-- Sem Acesso --</option>
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" disabled={saving} className="button-submit" style={{ width: '100%', justifyContent: 'center' }}>
                            <Plus size={16} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                            {saving ? 'Criando...' : 'Criar Usuário'}
                        </button>
                    </form>
                </div>

                {/* Lista de Usuários */}
                <div>
                    <div className="data-table-container">
                        <table className="devices-table">
                            <thead>
                                <tr>
                                    <th>Identificação</th>
                                    <th>E-Mail Comercial</th>
                                    <th>Grupo de Acesso Associado</th>
                                    <th>Autenticação 2FA</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>
                                            <strong>{u.username}</strong>
                                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>Cadastrado em {new Date(u.createdAt).toLocaleDateString()}</div>
                                        </td>
                                        <td>{u.email}</td>
                                        <td>
                                            <select
                                                className="form-group"
                                                style={{ padding: '6px 10px', height: 'auto', marginBottom: 0, minWidth: '180px' }}
                                                value={u.groupId === null ? "null" : u.groupId}
                                                onChange={(e) => handleGroupChange(u.id, e.target.value)}
                                            >
                                                <option value="null">-- Sem Acesso Administrativo --</option>
                                                {groups.map(g => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            {u.isMfaEnabled ? (
                                                <span className="status-badge status-approved"><ShieldAlert size={12} style={{ marginRight: '4px' }} /> Blindado</span>
                                            ) : (
                                                <span className="status-badge status-rejected">Exposto</span>
                                            )}
                                        </td>
                                        <td>
                                            <button className="button-ghost" onClick={() => handleDelete(u.id)} title="Desvincular e Excluir Usuário" style={{ color: 'var(--status-rejected)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center text-secondary">Nenhum usuário localizado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UsersView;
