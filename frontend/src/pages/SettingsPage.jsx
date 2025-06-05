// src/pages/SettingsPage.jsx
import React, { useState } from 'react';
import MfaSetupPage from './MfaSetupPage'; // Importa a página de setup do MFA que já criamos
import './SettingsPage.css'; // Criaremos este arquivo CSS para estilizar as abas e o conteúdo

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('userProfile'); // Aba ativa por padrão

  // Conteúdo para diferentes abas
  const renderTabContent = () => {
    switch (activeTab) {
      case 'userProfile':
        return (
          <div className="tab-pane active">
            <h3>Perfil e Segurança do Usuário</h3>
            <p>Gerencie as informações do seu perfil e as configurações de segurança da sua conta.</p>
            
            {/* Seção para Configuração do MFA */}
            <div className="settings-section mfa-settings-section">
              <h4>Autenticação de Dois Fatores (MFA)</h4>
              <MfaSetupPage /> {/* Renderiza o componente de setup do MFA aqui */}
            </div>

            {/* Outras configurações de perfil poderiam vir aqui */}
            {/* Exemplo:
            <div className="settings-section">
              <h4>Alterar Senha</h4>
              <p>Formulário para alterar senha...</p>
            </div>
            */}
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