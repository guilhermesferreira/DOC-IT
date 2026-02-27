// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import MfaSetupPage from './MfaSetupPage'; // Importa a página de setup do MFA que já criamos
import SettingsView from '../components/SettingsView'; // Painel Global de Settings
import UsersView from '../components/UsersView'; // Gestão de Usuários
import UserGroupsView from '../components/UserGroupsView'; // Gestão de Grupos de Usuários
import AuditSettingsView from '../components/AuditSettingsView';
import { useAuth } from '../auth/AuthContext';
import './SettingsPage.css'; // Criaremos este arquivo CSS para estilizar as abas e o conteúdo

const SettingsPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('userProfile'); // Aba principal ativa por padrão
  const [activeUserSecuritySubView, setActiveUserSecuritySubView] = useState('profile'); // Sub-visão ativa dentro de 'userProfile'
  const [activeAgentsSubView, setActiveAgentsSubView] = useState('scheduling'); // Sub-visão ativa dentro de 'applicationSettings' (Agentes)
  const [activeAuditSubView, setActiveAuditSubView] = useState('settings'); // Sub-visão ativa para Auditoria

  // Permissões
  const canViewAuditLogs = user?.group?.canViewAuditLogs;
  const canViewAuditSettings = user?.group?.canViewAuditSettings;
  const hasAnyAuditPermission = canViewAuditLogs || canViewAuditSettings;

  // Conteúdo para diferentes abas
  const renderTabContent = () => {
    switch (activeTab) {
      case 'userProfile':
        return (
          <div className="tab-pane active">
            {/* Sub-navegação para a aba "Usuário e Segurança" */}
            <nav className="user-security-sub-nav">
              <button
                className={`sub-tab-link ${activeUserSecuritySubView === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveUserSecuritySubView('profile')}
              >
                Meu Perfil
              </button>
              <button
                className={`sub-tab-link ${activeUserSecuritySubView === 'mfa' ? 'active' : ''}`}
                onClick={() => setActiveUserSecuritySubView('mfa')}
              >
                Autenticação de Dois Fatores (MFA)
              </button>
              {/* Adicione mais botões para outras sub-visões aqui */}
              {/* Ex: Alterar Senha, Gerenciar Sessões, etc. */}
            </nav>

            {/* Conteúdo da sub-visão ativa */}
            <div className="user-security-sub-content">
              {activeUserSecuritySubView === 'profile' && (
                <div className="settings-section">
                  <h3>Meu Perfil</h3>
                  <p>Informações do seu perfil de usuário.</p>
                  {/* Adicionar formulário ou detalhes do perfil aqui */}
                </div>
              )}

              {activeUserSecuritySubView === 'mfa' && (
                <div className="settings-section mfa-settings-section">
                  <MfaSetupPage /> {/* Renderiza o componente de setup do MFA */}
                </div>
              )}
            </div>

          </div>
        );
      case 'applicationSettings':
        return (
          <div className="tab-pane active">
            <nav className="user-security-sub-nav">
              <button
                className={`sub-tab-link ${activeAgentsSubView === 'scheduling' ? 'active' : ''}`}
                onClick={() => setActiveAgentsSubView('scheduling')}
              >
                Agendamento
              </button>
              {/* Espaço para futuras sub-abas de agentes: "Listagem", "Políticas", etc */}
            </nav>

            <div className="user-security-sub-content">
              {activeAgentsSubView === 'scheduling' && (
                <div className="settings-section">
                  <SettingsView />
                </div>
              )}
            </div>
          </div>
        );
      case 'usersSettings':
        return (
          <div className="tab-pane active" style={{ padding: 0 }}>
            <UsersView />
          </div>
        );
      case 'userGroupsSettings':
        return (
          <div className="tab-pane active" style={{ padding: 0 }}>
            <UserGroupsView />
          </div>
        );
      case 'auditSettings':
        if (!hasAnyAuditPermission) return <div>Acesso Negado.</div>;
        return (
          <div className="tab-pane active">
            <nav className="user-security-sub-nav">
              {canViewAuditSettings && (
                <button
                  className={`sub-tab-link ${activeAuditSubView === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveAuditSubView('settings')}
                >
                  Regras e Retenção
                </button>
              )}
            </nav>

            <div className="user-security-sub-content">
              {activeAuditSubView === 'settings' && canViewAuditSettings && (
                <div className="settings-section" style={{ padding: 0 }}>
                  <AuditSettingsView />
                </div>
              )}
            </div>
          </div>
        );
      default:
        return <div>Selecione uma aba de configuração.</div>;
    }
  };

  return (
    <div className="settings-page-container card-dashboard"> {/* Reutiliza a classe .card-dashboard para o container */}
      <h2 className="settings-page-title">Configurações</h2>

      <nav className="settings-tabs-nav">
        <button
          className={`tab-link ${activeTab === 'userProfile' ? 'active' : ''}`}
          onClick={() => setActiveTab('userProfile')}
        >
          Usuário e Segurança
        </button>
        <button
          className={`tab-link ${activeTab === 'applicationSettings' ? 'active' : ''}`}
          onClick={() => setActiveTab('applicationSettings')}
        >
          Agentes
        </button>
        <button
          className={`tab-link ${activeTab === 'usersSettings' ? 'active' : ''}`}
          onClick={() => setActiveTab('usersSettings')}
        >
          Usuários
        </button>
        <button
          className={`tab-link ${activeTab === 'userGroupsSettings' ? 'active' : ''}`}
          onClick={() => setActiveTab('userGroupsSettings')}
        >
          Grupos de Acesso
        </button>
        {hasAnyAuditPermission && (
          <button
            className={`tab-link ${activeTab === 'auditSettings' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('auditSettings');
              if (canViewAuditSettings) setActiveAuditSubView('settings');
            }}
          >
            Auditoria
          </button>
        )}
      </nav>

      <div className="settings-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default SettingsPage;
