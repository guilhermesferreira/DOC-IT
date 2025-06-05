// src/pages/MfaSetupPage.jsx
import React, { useState, useEffect } from 'react';
import API from '../api/api'; // Sua instância configurada do Axios
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import './MfaSetupPage.css'; // Crie este arquivo para estilização

const MfaSetupPage = () => {
  const [mfaSetupInfo, setMfaSetupInfo] = useState(null); // { otpauthUrl, secretKey }
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [setupError, setSetupError] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mfaEnabledStatus, setMfaEnabledStatus] = useState(null); // null: carregando, true: habilitado, false: não habilitado
  // Estados para o fluxo de desativação
  const [isDisablingMfa, setIsDisablingMfa] = useState(false); // Controla se o formulário de desativação está visível
  const [disableMfaCode, setDisableMfaCode] = useState(''); // Código MFA para desativar
  const [disableMfaError, setDisableMfaError] = useState(null); // Erro ao desativar

  // Efeito para verificar o status do MFA ao carregar o componente
  useEffect(() => {
    const checkMfaStatus = async () => {
      setIsLoading(true);
      setSetupError(null);
      try {
        // Assumindo um endpoint no backend que retorna o status do MFA para o usuário logado
        // Ex: GET /auth/mfa/status -> { enabled: true/false }
        const response = await API.get('/auth/mfa/status-mfa');
        setMfaEnabledStatus(response.data.enabled); 
      } catch (error) {
        console.error("Erro ao verificar status do MFA:", error);
        // Em caso de erro na verificação, assume-se que não está habilitado ou há um problema
        setSetupError(error.response?.data?.error || "Não foi possível verificar o status do MFA.");
        setMfaEnabledStatus(false); // Define como false para permitir a tentativa de habilitação
      } finally {
        setIsLoading(false);
      }
    };
    checkMfaStatus();
  }, []); // Array de dependências vazio para executar apenas na montagem

  const handleEnableMfa = async () => {
    setIsLoading(true);
    setSetupError(null); // Limpa erro anterior
    setMfaSetupInfo(null); // Limpa info de setup anterior
    setRecoveryCodes([]);  // Limpa códigos de recuperação anteriores
    try {
      // Endpoint do backend para gerar o segredo e a URI do QR Code
      const response = await API.post('/auth/mfa/generate-secret');
      if (response.data && response.data.otpauthUrl && response.data.secretKey) {
        setMfaSetupInfo(response.data);
      } else {
        setSetupError("Não foi possível obter os dados para configuração do MFA. Resposta inesperada do servidor.");
      }
    } catch (error) {
      console.error("Erro ao iniciar setup do MFA:", error);
      setSetupError(error.response?.data?.error || "Não foi possível iniciar a configuração do MFA. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndActivateMfa = async (e) => {
    e.preventDefault();
    if (!mfaSetupInfo || !mfaVerifyCode) {
      setSetupError("Código de verificação é necessário.");
      return;
    }
    setIsLoading(true);
    setSetupError(null); // Limpa erro anterior
    try {
      // Envia o código TOTP e o segredo original para o backend verificar e ativar
      const response = await API.post('/auth/mfa/verify-setup', {
        token: mfaVerifyCode,
        secret: mfaSetupInfo.secretKey,
      });

      setRecoveryCodes(response.data.recoveryCodes || []);
      alert("MFA ativado com sucesso! Guarde seus códigos de recuperação em um local MUITO seguro.");
      setMfaSetupInfo(null); // Limpa as informações de setup
      setMfaVerifyCode('');
      setMfaEnabledStatus(true); // Marca que o MFA agora está ativo
    } catch (error) {
      console.error("Erro ao verificar código MFA:", error);
      setSetupError(error.response?.data?.error || "Código de verificação inválido ou erro ao ativar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };
const handleInitiateDisableMfa = () => {
    if (window.confirm("Tem certeza que deseja desativar a Autenticação de Dois Fatores? Sua conta ficará menos segura.")) {
      setIsDisablingMfa(true);
      setDisableMfaError(null); // Limpa erros anteriores
      setDisableMfaCode(''); // Limpa código anterior
    }
  };

  const handleConfirmDisableMfa = async (e) => {
    e.preventDefault();
    if (!disableMfaCode) {
      setDisableMfaError("Código MFA é obrigatório para desativar.");
      return;
    }
    setIsLoading(true);
    setDisableMfaError(null);
    try {
      await API.post('/auth/mfa/disable', { mfaCode: disableMfaCode });
      alert("MFA desativado com sucesso.");
      setMfaEnabledStatus(false);
      setIsDisablingMfa(false);
      setDisableMfaCode('');
      // Limpar mfaSetupInfo e recoveryCodes caso o usuário reative em seguida
      setMfaSetupInfo(null);
      setRecoveryCodes([]);
      setSetupError(null);
    } catch (error) {
      console.error("Erro ao desativar MFA:", error);
      setDisableMfaError(error.response?.data?.error || "Não foi possível desativar o MFA. Verifique o código e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Removido .mfa-setup-page-container e .page-container pois este componente
    // é renderizado dentro de .settings-section que já está em um .card-dashboard
    // na SettingsPage.
    <div className="mfa-setup-card card-dashboard"> {/* Reutilize .card-dashboard */}
      <h2>Configurar Autenticação de Dois Fatores (MFA)</h2>

      {/* Mostra mensagem de carregamento inicial enquanto verifica o status */}
      {isLoading && mfaEnabledStatus === null && <p>Verificando status do MFA...</p>}

      {setupError && <p className="error-message">{setupError}</p>}
      {disableMfaError && <p className="error-message">{disableMfaError}</p>}

      {/* Se MFA não estiver habilitado (status false) E não estiver no meio de um setup, mostra botão para habilitar */}
      {mfaEnabledStatus === false && !mfaSetupInfo && !isLoading && (
        <div className="mfa-initiate-section">
          <p>Aumente a segurança da sua conta habilitando a autenticação de dois fatores.</p>
          <button onClick={handleEnableMfa} disabled={isLoading} className="button-submit">
            {isLoading ? 'Gerando...' : 'Habilitar MFA'}
          </button>
        </div>
      )}

      {/* Se estiver no meio do setup (mfaSetupInfo existe) E ainda não mostrou os códigos de recuperação */}
      {mfaSetupInfo && recoveryCodes.length === 0 && !isLoading && (
        <div className="mfa-configure-section">
          <h3>1. Adicione ao seu App Autenticador</h3>
          <div className="mfa-setup-details">
            <div className="qr-code-area">
              <p>Escaneie com seu app:</p>
              <div className="qr-code-container">
                {mfaSetupInfo.otpauthUrl ? (
                  <QRCode value={mfaSetupInfo.otpauthUrl} size={160} level="H" />
                ) : (
                  <p>Erro ao gerar QR Code.</p>
                )}
              </div>
            </div>
            <div className="manual-setup-area">
              <p>Ou insira a chave manualmente:</p>
              <code className="secret-key">{mfaSetupInfo.secretKey}</code>
            </div>
          </div>

          <form onSubmit={handleVerifyAndActivateMfa} className="mfa-verify-form">
            <h3>2. Verifique o Código</h3>
            <p>Insira o código de 6 dígitos gerado pelo seu aplicativo:</p>
            <div className="form-group">
              <label htmlFor="mfaVerifyCode">Código de Verificação</label>
              <input
                id="mfaVerifyCode"
                type="text"
                value={mfaVerifyCode}
                onChange={(e) => setMfaVerifyCode(e.target.value)}
                placeholder="000000"
                maxLength="6"
                required
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" disabled={isLoading} className="button-submit">
              {isLoading ? 'Verificando...' : 'Verificar e Ativar MFA'}
            </button>
          </form>
        </div>
      )}

      {/* Se os códigos de recuperação foram gerados */}
      {recoveryCodes.length > 0 && !isLoading && (
        <div className="mfa-recovery-codes-section">
          <h3>MFA Ativado com Sucesso!</h3>
          <h4>Seus Códigos de Recuperação:</h4>
          <p className="recovery-warning">
            <strong>Importante:</strong> Guarde estes códigos em um local MUITO seguro.
            Eles são a única forma de acessar sua conta caso você perca o acesso ao seu
            dispositivo autenticador. Cada código só pode ser usado uma vez.
          </p>
          <ul className="recovery-codes-list">
            {recoveryCodes.map((code, index) => (
              <li key={index}><code>{code}</code></li>
            ))}
          </ul>
          <p>Após salvar seus códigos de recuperação, você pode fechar esta página ou navegar para outra seção.</p>
        </div>
      )}

      {/* Se MFA já estiver habilitado (status true) E não estiver no meio de um setup ou mostrando códigos, mostra mensagem de status */}
      {mfaEnabledStatus === true && recoveryCodes.length === 0 && !mfaSetupInfo && !isLoading && !isDisablingMfa && (
           <div className="mfa-status-section">
              <p>A Autenticação de Dois Fatores já está ativa para sua conta.</p>
              <div className="mfa-disable-button-container"> {/* Nova div para centralizar */}
                <button onClick={handleInitiateDisableMfa} className="button-danger">
                  Desativar MFA
                </button>
              </div>
           </div>
      
            )}

      {/* Formulário para desativar MFA */}
      {mfaEnabledStatus === true && isDisablingMfa && !isLoading && (
        <div className="mfa-disable-section" style={{marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed #ddd'}}>
          <h3>Desativar Autenticação de Dois Fatores</h3>
          <p>Para confirmar a desativação, insira um código MFA atual do seu aplicativo autenticador.</p>
          <form onSubmit={handleConfirmDisableMfa} className="mfa-verify-form"> {/* Reutilizando classe para consistência */}
            <div className="form-group">
              <label htmlFor="disableMfaCode">Código MFA Atual</label>
              <input
                id="disableMfaCode"
                type="text"
                value={disableMfaCode}
                onChange={(e) => setDisableMfaCode(e.target.value)}
                placeholder="000000"
                maxLength="6"
                required
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" disabled={isLoading} className="button-danger">
              {isLoading ? 'Desativando...' : 'Confirmar Desativação'}
            </button>
            <button type="button" onClick={() => setIsDisablingMfa(false)} className="button-cancel" style={{marginLeft: '10px'}}>Cancelar</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default MfaSetupPage;
