// src/components/modals/TemplateManagerModal.jsx
import React, { useState, useEffect } from 'react';
import API from '../../api/api';
import { X, Plus, Trash2, Edit2, Save, Terminal } from 'lucide-react';
import './TemplateManagerModal.css';

const TemplateManagerModal = ({ isOpen, onClose, onUpdate }) => {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ title: '', sql: '', description: '' });

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen]);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await API.get('/osquery-templates');
            setTemplates(res.data);
        } catch (err) {
            console.error("Erro ao buscar templates:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title || !formData.sql) return;

        try {
            if (editingId) {
                await API.put(`/osquery-templates/${editingId}`, formData);
            } else {
                await API.post('/osquery-templates', formData);
            }
            setFormData({ title: '', sql: '', description: '' });
            setEditingId(null);
            fetchTemplates();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error("Erro ao salvar template:", err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Tem certeza que deseja excluir este modelo?")) return;
        try {
            await API.delete(`/osquery-templates/${id}`);
            fetchTemplates();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error("Erro ao excluir template:", err);
        }
    };

    const startEdit = (tpl) => {
        setEditingId(tpl.id);
        setFormData({ title: tpl.title, sql: tpl.sql, description: tpl.description || '' });
    };

    if (!isOpen) return null;

    return (
        <div className="tm-modal-overlay">
            <div className="tm-modal-container">
                <header className="tm-modal-header">
                    <div className="tm-header-title">
                        <Terminal size={20} />
                        <h3>Gerenciar Modelos Osquery</h3>
                    </div>
                    <button className="tm-close-btn" onClick={onClose}><X size={20} /></button>
                </header>

                <div className="tm-modal-body">
                    {/* Formulário */}
                    <div className="tm-form-panel">
                        <h4>{editingId ? 'Editar Modelo' : 'Novo Modelo'}</h4>
                        <div className="tm-form-group">
                            <label>Título</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Ex: Informações da CPU"
                            />
                        </div>
                        <div className="tm-form-group">
                            <label>Consulta SQL</label>
                            <textarea
                                value={formData.sql}
                                onChange={(e) => setFormData({ ...formData, sql: e.target.value })}
                                placeholder="SELECT * FROM ..."
                            />
                        </div>
                        <div className="tm-form-group">
                            <label>Descrição</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Breve explicação da consulta"
                            />
                        </div>
                        <div className="tm-form-actions">
                            {editingId && (
                                <button className="tm-btn-secondary" onClick={() => { setEditingId(null); setFormData({ title: '', sql: '', description: '' }); }}>
                                    Cancelar
                                </button>
                            )}
                            <button className="tm-btn-primary" onClick={handleSave}>
                                <Save size={16} />
                                {editingId ? 'Atualizar' : 'Salvar'}
                            </button>
                        </div>
                    </div>

                    {/* Lista */}
                    <div className="tm-list-panel">
                        <h4>Modelos Cadastrados</h4>
                        {loading ? (
                            <div className="tm-loading">Carregando...</div>
                        ) : (
                            <div className="tm-items-list">
                                {templates.map(tpl => (
                                    <div key={tpl.id} className="tm-item">
                                        <div className="tm-item-info">
                                            <span className="tm-item-title">{tpl.title}</span>
                                            <span className="tm-item-sql">{tpl.sql}</span>
                                        </div>
                                        <div className="tm-item-actions">
                                            <button onClick={() => startEdit(tpl)} title="Editar"><Edit2 size={14} /></button>
                                            <button onClick={() => handleDelete(tpl.id)} className="danger" title="Excluir"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TemplateManagerModal;
