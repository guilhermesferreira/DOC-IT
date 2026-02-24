import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { UserCog, Trash2, Info, ShieldAlert, Plus, X, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const defaultUserState = { username: '', email: '', password: '', groupId: 'null' };
    const [newUser, setNewUser] = useState(defaultUserState);
    const [editingUserId, setEditingUserId] = useState(null);
    const { user } = useAuth(); // Importa os privilégios injetados pelo Backend!

    useEffect(() => {
        if (user && user.group?.canViewUsers) {
            fetchData();
        } else {
            setLoading(false); // Já mata o loading se não tem nem permissão de GET
        }
    }, [user]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setMessage('');

            // Tenta puxar usuários
            try {
                const usersRes = await api.get('/users');
                setUsers(usersRes.data);
            } catch (err) {
                if (err.response?.status === 403) {
                    setMessage("Permissão Negada: Você não pode visualizar a lista de usuários.");
                } else {
                    console.error("Erro /users:", err);
                    setMessage("Erro ao buscar usuários do servidor.");
                }
            }

            // Tenta puxar grupos apenas se o usuário tiver a flag visual
            if (user?.group?.canViewGroups || user?.group?.name === 'SuperAdministrator') {
                try {
                    const groupsRes = await api.get('/user-groups');
                    setGroups(groupsRes.data);
                } catch (err) {
                    if (err.response?.status === 403) {
                        console.warn("Sem acesso de leitura aos grupos, o select ficará vazio.");
                    } else {
                        console.error("Erro /groups:", err);
                    }
                }
            }

        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            const payload = { ...newUser, groupId: newUser.groupId === 'null' ? null : parseInt(newUser.groupId) };

            // Se a senha estiver vazia na edição, remove do payload para não atualizar
            if (editingUserId && !payload.password) {
                delete payload.password;
            }

            if (editingUserId) {
                const res = await api.put(`/users/${editingUserId}`, payload);
                setUsers(users.map(u => u.id === editingUserId ? { ...u, ...res.data } : u));
                setMessage("Conta de administrador atualizada.");
            } else {
                const res = await api.post('/users', payload);
                setUsers([...users, res.data]);
                setMessage("Usuário criado com sucesso!");
            }

            setIsModalOpen(false);
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(error.response?.data?.message || "Falha ao processar o usuário.");
        } finally {
            setSaving(false);
        }
    };

    const handleOpenCreate = () => {
        setNewUser(defaultUserState);
        setEditingUserId(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (user) => {
        setNewUser({
            username: user.username,
            email: user.email,
            password: '', // Senha não preenche por segurança, se vazia não muda no PUT
            groupId: user.groupId || 'null'
        });
        setEditingUserId(user.id);
        setIsModalOpen(true);
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

    if (!user || !user.group?.canViewUsers) {
        return (
            <div className="settings-view-embedded" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Lock size={48} style={{ color: 'var(--text-color-light)', marginBottom: '20px' }} />
                <h3>Acesso Negado ao Perfil</h3>
                <p className="text-secondary">O seu grupo administrativo ({user?.group?.name || 'Indefinido'}) não possui privilégios de leitura (Visualização) para o Módulo de Usuários do Doc-IT.</p>
            </div>
        );
    }

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
                {user.group?.canCreateUsers && (
                    <button className="button-submit" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center' }}>
                        <Plus size={16} strokeWidth={3} style={{ marginRight: '6px' }} /> Novo Usuário
                    </button>
                )}
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
                                        disabled={!user.group?.canEditUsers} // Desabilita mudança rápida se não puder editar
                                    >
                                        <option value="null">Visitante s/ Acesso</option>

                                        {/* Fallback de Visualização: Se o array `groups` estiver vazio (por falta de permissão canViewGroups),
                                            ainda assim precisamos mostrar onde o usuário está alocado usando os dados do GET /users */}
                                        {u.groupId !== null && !groups.some(g => g.id === u.groupId) && (
                                            <option value={u.groupId}>{u.group?.name || `Grupo #${u.groupId}`}</option>
                                        )}

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
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {user.group?.canEditUsers && (
                                            <button className="button-ghost" onClick={() => handleOpenEdit(u)} title="Editar Conta" style={{ color: 'var(--text-color-light)' }}>
                                                <UserCog size={16} />
                                            </button>
                                        )}
                                        {user.group?.canDeleteUsers && (
                                            <button className="button-ghost" onClick={() => handleDelete(u.id)} title="Desvincular e Excluir Usuário" style={{ color: 'var(--badge-red-text)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
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
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nome de Usuário</label>
                                <input type="text" placeholder="Ex: amanda_sec" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>E-Mail Comercial</label>
                                <input type="email" placeholder="amanda@empresa.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>{editingUserId ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha Inicial'}</label>
                                <input type="password" placeholder="Defina uma senha segura" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required={!editingUserId} minLength={6} />
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
                                {saving ? 'Processando Inclusão...' : (editingUserId ? 'Gravar Alterações' : 'Finalizar Criação')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersView;
