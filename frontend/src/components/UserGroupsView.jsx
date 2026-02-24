import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { Users, Trash2, Plus, Info, X, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const UserGroupsView = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const defaultGroupState = {
        name: '', description: '',
        canViewUsers: false, canCreateUsers: false, canEditUsers: false, canDeleteUsers: false,
        canViewGroups: false, canCreateGroups: false, canEditGroups: false, canDeleteGroups: false,
        canViewDevices: false, canManageDevices: false, canAccessRemote: false,
        canViewSettings: false, canEditSettings: false
    };

    const [newGroup, setNewGroup] = useState(defaultGroupState);
    const [editingGroupId, setEditingGroupId] = useState(null); // NULL=Inclusão, ID=Edição
    const { user } = useAuth(); // Importamos os privilégios descriptografados do JWT!

    useEffect(() => {
        if (user && user.group?.canViewGroups) {
            fetchGroups();
        } else {
            setLoading(false); // Mata a requisição proxima caso não tenha a flag View
        }
    }, [user]);

    const fetchGroups = async () => {
        try {
            setLoading(true);
            const res = await api.get('/user-groups');
            setGroups(res.data);
        } catch (error) {
            console.error("Erro ao carregar grupos:", error);
            setMessage("Erro ao carregar os Grupos de Acesso.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');

            if (editingGroupId) {
                // Modo Edição
                const res = await api.put(`/user-groups/${editingGroupId}`, newGroup);
                // Atualiza o array local com o modificado
                setGroups(groups.map(g => g.id === editingGroupId ? { ...res.data, _count: g._count } : g));
                setMessage("Permissões de Grupo alteradas com sucesso!");
            } else {
                // Modo Criação
                const res = await api.post('/user-groups', newGroup);
                setGroups([...groups, { ...res.data, _count: { users: 0 } }]);
                setMessage("Novo Grupo criado com sucesso!");
            }

            setIsModalOpen(false);
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(error.response?.data?.message || "Falha ao processar o grupo.");
        } finally {
            setSaving(false);
        }
    };

    const handleOpenCreate = () => {
        setNewGroup(defaultGroupState);
        setEditingGroupId(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (group) => {
        // Carrega o Objeto exato mapeando as checkboxes (Ignorando propriedades extras como _count na Inclusão)
        setNewGroup({
            name: group.name, description: group.description || '',
            canViewUsers: group.canViewUsers, canCreateUsers: group.canCreateUsers, canEditUsers: group.canEditUsers, canDeleteUsers: group.canDeleteUsers,
            canViewGroups: group.canViewGroups, canCreateGroups: group.canCreateGroups, canEditGroups: group.canEditGroups, canDeleteGroups: group.canDeleteGroups,
            canViewDevices: group.canViewDevices, canManageDevices: group.canManageDevices, canAccessRemote: group.canAccessRemote,
            canViewSettings: group.canViewSettings, canEditSettings: group.canEditSettings
        });
        setEditingGroupId(group.id);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Certeza que deseja remover este Grupo de Acesso?")) return;
        try {
            await api.delete(`/user-groups/${id}`);
            setGroups(groups.filter(g => g.id !== id));
        } catch (error) {
            setMessage(error.response?.data?.message || "Erro ao deletar o grupo. Remova os usuários atrelados primeiro.");
        }
    };

    if (loading) return <div className="loading-state">Buscando definições de grupo...</div>;

    if (!user || !user.group?.canViewGroups) {
        return (
            <div className="settings-view-embedded" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Lock size={48} style={{ color: 'var(--text-color-light)', marginBottom: '20px' }} />
                <h3>Setor Restrito</h3>
                <p className="text-secondary">O seu grupo não possui autorização para ler as matrizes de privilégio do Sistema RBAC.</p>
            </div>
        );
    }

    return (
        <div className="settings-view-embedded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h3>Gerenciamento de Papéis (RBAC)</h3>
                    <p className="text-secondary">Crie e edite os grupos que ditarão as permissões dos administradores e técnicos.</p>
                </div>
                {user.group?.canCreateGroups && (
                    <button className="button-submit" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center' }}>
                        <Plus size={16} strokeWidth={3} style={{ marginRight: '6px' }} /> Novo Grupo
                    </button>
                )}
            </div>

            {message && (
                <div className={`status-badge ${message.includes('Erro') || message.includes('Falha') ? 'status-rejected' : 'status-approved'}`} style={{ marginBottom: '20px', padding: '10px 15px', display: 'flex' }}>
                    <Info size={16} style={{ marginRight: '8px' }} /> {message}
                </div>
            )}

            <div className="data-table-container">
                <table className="devices-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Grupo de Acesso</th>
                            <th>Descrição</th>
                            <th>Membros Vinculados</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((g) => (
                            <tr key={g.id}>
                                <td><span className="premium-badge badge-gray">#{g.id}</span></td>
                                <td>
                                    <div className="table-row-profile">
                                        <div className="premium-avatar" style={{ backgroundColor: 'var(--avatar-teal)', width: '32px', height: '32px', fontSize: '0.9rem' }}>
                                            <Users size={16} />
                                        </div>
                                        <strong>{g.name}</strong>
                                    </div>
                                </td>
                                <td className="text-secondary">{g.description || 'Sem descrição'}</td>
                                <td>
                                    <span className="premium-badge badge-gray">
                                        {g._count?.users || 0} Membros
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {user.group?.canEditGroups && (
                                            <button className="button-ghost" onClick={() => handleOpenEdit(g)} title="Editar Permissões" style={{ color: 'var(--text-color-light)' }}>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"></path></svg>
                                            </button>
                                        )}
                                        {user.group?.canDeleteGroups && (
                                            <button className="button-ghost" onClick={() => handleDelete(g.id)} title="Excluir Grupo" style={{ color: 'var(--badge-red-text)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {groups.length === 0 && (
                            <tr>
                                <td colSpan="5" className="text-center text-secondary" style={{ padding: '30px' }}>Nenhum grupo cadastrado na base.</td>
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
                            <h4>Criar Novo Grupo</h4>
                            <button className="button-ghost" onClick={() => setIsModalOpen(false)} style={{ padding: '4px', height: 'auto', color: 'var(--text-color-light)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nome do Grupo</label>
                                <input type="text" placeholder="Ex: Suporte N1" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Descrição</label>
                                <input type="text" placeholder="Permite leitura de relatórios" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
                            </div>

                            {/* Matriz RBAC */}
                            <div className="rbac-matrix-container" style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
                                <h5 style={{ marginBottom: '15px', color: 'var(--text-color)' }}>Permissões do Grupo</h5>

                                <div className="rbac-module-section" style={{ marginBottom: '15px' }}>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-color-light)', marginBottom: '8px' }}>Módulo de Usuários</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canViewUsers} onChange={(e) => setNewGroup({ ...newGroup, canViewUsers: e.target.checked })} style={{ marginRight: '8px' }} /> Ver Usuários
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canCreateUsers} onChange={(e) => setNewGroup({ ...newGroup, canCreateUsers: e.target.checked })} style={{ marginRight: '8px' }} /> Criar Usuários
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canEditUsers} onChange={(e) => setNewGroup({ ...newGroup, canEditUsers: e.target.checked })} style={{ marginRight: '8px' }} /> Editar Usuários
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canDeleteUsers} onChange={(e) => setNewGroup({ ...newGroup, canDeleteUsers: e.target.checked })} style={{ marginRight: '8px' }} /> Excluir Usuários
                                        </label>
                                    </div>
                                </div>

                                <div className="rbac-module-section" style={{ marginBottom: '15px' }}>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-color-light)', marginBottom: '8px' }}>Módulo RBAC (Identidades)</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canViewGroups} onChange={(e) => setNewGroup({ ...newGroup, canViewGroups: e.target.checked })} style={{ marginRight: '8px' }} /> Ver Grupos
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canCreateGroups} onChange={(e) => setNewGroup({ ...newGroup, canCreateGroups: e.target.checked })} style={{ marginRight: '8px' }} /> Criar Grupos
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canEditGroups} onChange={(e) => setNewGroup({ ...newGroup, canEditGroups: e.target.checked })} style={{ marginRight: '8px' }} /> Editar Grupos
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canDeleteGroups} onChange={(e) => setNewGroup({ ...newGroup, canDeleteGroups: e.target.checked })} style={{ marginRight: '8px' }} /> Excluir Grupos
                                        </label>
                                    </div>
                                </div>

                                <div className="rbac-module-section" style={{ marginBottom: '15px' }}>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-color-light)', marginBottom: '8px' }}>Agentes & Dispositivos</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canViewDevices} onChange={(e) => setNewGroup({ ...newGroup, canViewDevices: e.target.checked })} style={{ marginRight: '8px' }} /> Ver Inventário
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canManageDevices} onChange={(e) => setNewGroup({ ...newGroup, canManageDevices: e.target.checked })} style={{ marginRight: '8px' }} /> Aprovar/Rejeitar
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canAccessRemote} onChange={(e) => setNewGroup({ ...newGroup, canAccessRemote: e.target.checked })} style={{ marginRight: '8px' }} /> Acesso Remoto
                                        </label>
                                    </div>
                                </div>

                                <div className="rbac-module-section" style={{ marginBottom: '25px' }}>
                                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-color-light)', marginBottom: '8px' }}>Sistema e Motor</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canViewSettings} onChange={(e) => setNewGroup({ ...newGroup, canViewSettings: e.target.checked })} style={{ marginRight: '8px' }} /> Ver Configs
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={newGroup.canEditSettings} onChange={(e) => setNewGroup({ ...newGroup, canEditSettings: e.target.checked })} style={{ marginRight: '8px' }} /> Editar Agendamentos
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" disabled={saving} className="button-submit" style={{ width: '100%', justifyContent: 'center' }}>
                                {saving ? (editingGroupId ? 'Atualizando...' : 'Processando Inclusão...') : (editingGroupId ? 'Gravar Alterações' : 'Finalizar Criação')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserGroupsView;
