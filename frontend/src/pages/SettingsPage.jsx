// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import MfaSetupPage from './MfaSetupPage'; // Importa a página de setup do MFA que já criamos
import './SettingsPage.css'; // Criaremos este arquivo CSS para estilizar as abas e o conteúdo

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('userProfile'); // Aba principal ativa por padrão
  const [activeUserSecuritySubView, setActiveUserSecuritySubView] = useState('profile'); // Sub-visão ativa dentro de 'userProfile'

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
            <h3>Configurações do Aplicativo</h3>
            <p>Ajuste as preferências gerais do aplicativo Doc-IT.</p>
            {/* Exemplo:
            <div className="settings-section">
              <h4>Tema</h4>
              <p>Opções para tema claro/escuro...</p>
            </div>
            <div className="settings-section">
              <h4>Notificações</h4>
              <p>Gerenciar preferências de notificação...</p>
            </div>
            */}
          </div>
        );
      // Adicione mais 'case' para outras abas de configuração no futuro
      // case 'billingSettings':
      //   return <div className="tab-pane active"><h3>Faturamento</h3><p>Detalhes de faturamento...</p></div>;
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
          Aplicativo
        </button>
        {/* Adicione mais botões de aba aqui, por exemplo:
        <button
          className={`tab-link ${activeTab === 'billingSettings' ? 'active' : ''}`}
          onClick={() => setActiveTab('billingSettings')}
        >
          Faturamento
        </button>
        */}
      </nav>

      <div className="settings-content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default SettingsPage;
