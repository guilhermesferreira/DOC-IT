import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { UserCog, Trash2, Info, ShieldAlert, Plus, X } from 'lucide-react';

const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
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
            setIsModalOpen(false);
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

    const getAvatarColor = (name) => {
        const colors = ['var(--avatar-blue)', 'var(--avatar-purple)', 'var(--avatar-teal)', 'var(--avatar-pink)', 'var(--avatar-orange)'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <div className="settings-view-embedded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h3>Administração e Identidades</h3>
                    <p className="text-secondary">Associe as contas ativas do Doc-IT a seus devidos Grupos de Permissão.</p>
                </div>
                <button className="button-submit" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center' }}>
                    <Plus size={16} strokeWidth={3} style={{ marginRight: '6px' }} /> Novo Usuário
                </button>
            </div>

            {message && (
                <div className={`status-badge ${message.includes('Falha') || message.includes('Erro') || message.includes('Não') ? 'status-rejected' : 'status-approved'}`} style={{ marginBottom: '20px', padding: '10px 15px', display: 'flex' }}>
                    <Info size={16} style={{ marginRight: '8px' }} /> {message}
                </div>
            )}

            <div className="data-table-container">
                <table className="devices-table">
                    <thead>
                        <tr>
                            <th>Identificação</th>
                            <th>E-Mail Comercial</th>
                            <th>Grupo de Acesso</th>
                            <th>Status de Segurança</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id}>
                                <td>
                                    <div className="table-row-profile">
                                        <div className="premium-avatar" style={{ backgroundColor: getAvatarColor(u.username) }}>
                                            {u.username.charAt(0)}
                                        </div>
                                        <div>
                                            <strong>{u.username}</strong>
                                            <div className="text-secondary" style={{ fontSize: '0.8rem' }}>Adicionado em {new Date(u.createdAt).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>{u.email}</td>
                                <td>
                                    <select
                                        className="form-group"
                                        style={{ padding: '4px 8px', height: 'auto', marginBottom: 0, minWidth: '160px', borderRadius: '6px', backgroundColor: 'var(--background-light)', border: 'none', fontWeight: 500 }}
                                        value={u.groupId === null ? "null" : u.groupId}
                                        onChange={(e) => handleGroupChange(u.id, e.target.value)}
                                    >
                                        <option value="null">Visitante s/ Acesso</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    {u.isMfaEnabled ? (
                                        <span className="premium-badge badge-green"><ShieldAlert size={12} style={{ marginRight: '4px' }} /> Blindado</span>
                                    ) : (
                                        <span className="premium-badge badge-red">Exposto</span>
                                    )}
                                </td>
                                <td>
                                    <button className="button-ghost" onClick={() => handleDelete(u.id)} title="Desvincular e Excluir Usuário" style={{ color: 'var(--badge-red-text)' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan="5" className="text-center text-secondary" style={{ padding: '30px' }}>Nenhuma conta de administrador localizada no banco de dados.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Criação (Premium UI) */}
            {isModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h4>Criar Nova Conta</h4>
                            <button className="button-ghost" onClick={() => setIsModalOpen(false)} style={{ padding: '4px', height: 'auto', color: 'var(--text-color-light)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="form-group">
                                <label>Nome de Usuário</label>
                                <input type="text" placeholder="Ex: amanda_sec" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>E-Mail Comercial</label>
                                <input type="email" placeholder="amanda@empresa.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Senha Inicial</label>
                                <input type="password" placeholder="Defina uma senha segura" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={6} />
                            </div>
                            <div className="form-group">
                                <label>Grupo (Papel base)</label>
                                <select value={newUser.groupId} onChange={(e) => setNewUser({ ...newUser, groupId: e.target.value })}>
                                    <option value="null">-- Sem Acesso --</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit" disabled={saving} className="button-submit" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                                {saving ? 'Processando Inclusão...' : 'Finalizar Criação'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersView;
