import React, { useState, useEffect } from 'react';
import api from '../api/api';
import { Users, Trash2, Plus, Info } from 'lucide-react';

const UserGroupsView = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [newGroup, setNewGroup] = useState({ name: '', description: '' });

    useEffect(() => {
        fetchGroups();
    }, []);

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

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            setSaving(true);
            setMessage('');
            const res = await api.post('/user-groups', newGroup);
            setGroups([...groups, { ...res.data, _count: { users: 0 } }]);
            setNewGroup({ name: '', description: '' });
            setMessage("Grupo criado com sucesso!");
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage(error.response?.data?.message || "Falha ao criar o grupo.");
        } finally {
            setSaving(false);
        }
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

    return (
        <div className="settings-view-embedded">
            <div style={{ marginBottom: '20px' }}>
                <h3>Gerenciamento de Papéis (RBAC)</h3>
                <p className="text-secondary">Crie e edite os grupos que ditarão as permissões dos administradores e técnicos.</p>
            </div>

            {message && (
                <div className={`status-badge ${message.includes('Erro') || message.includes('Falha') ? 'status-rejected' : 'status-approved'}`} style={{ marginBottom: '20px', padding: '10px 15px', display: 'flex' }}>
                    <Info size={16} style={{ marginRight: '8px' }} /> {message}
                </div>
            )}

            <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px', alignItems: 'start' }}>
                {/* Painel de Criação */}
                <div className="card-dashboard">
                    <h4>Criar Novo Grupo</h4>
                    <form onSubmit={handleCreate} className="mfa-verify-form" style={{ marginTop: '15px' }}>
                        <div className="form-group">
                            <label>Nome do Grupo</label>
                            <input
                                type="text"
                                placeholder="Ex: Suporte N1"
                                value={newGroup.name}
                                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Descrição</label>
                            <input
                                type="text"
                                placeholder="Permite leitura de relatórios"
                                value={newGroup.description}
                                onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                            />
                        </div>
                        <button type="submit" disabled={saving} className="button-submit">
                            <Plus size={16} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                            {saving ? 'Criando...' : 'Criar Grupo'}
                        </button>
                    </form>
                </div>

                {/* Lista de Grupos */}
                <div>
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
                                        <td>#{g.id}</td>
                                        <td><strong>{g.name}</strong></td>
                                        <td className="text-secondary">{g.description || 'Sem descrição'}</td>
                                        <td>
                                            <span className="status-badge status-pending" style={{ padding: '2px 8px' }}>
                                                {g._count?.users || 0}
                                            </span>
                                        </td>
                                        <td>
                                            <button className="button-ghost" onClick={() => handleDelete(g.id)} title="Excluir Grupo" style={{ color: 'var(--status-rejected)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {groups.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="text-center text-secondary">Nenhum grupo cadastrado na base.</td>
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

export default UserGroupsView;
