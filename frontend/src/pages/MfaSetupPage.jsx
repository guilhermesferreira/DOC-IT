// src/pages/MfaSetupPage.jsx
import React, { useState } from 'react';
import API from '../api/api'; // Sua instância configurada do Axios
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import './MfaSetupPage.css'; // Crie este arquivo para estilização

const MfaSetupPage = () => {
  const [mfaSetupInfo, setMfaSetupInfo] = useState(null); // { otpauthUrl, secretKey }
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mfaAlreadyEnabled, setMfaAlreadyEnabled] = useState(false); // Para indicar se já está ativo

  // Idealmente, você teria uma forma de saber se o MFA já está habilitado para o usuário
  // ao carregar esta página (ex: através do contexto de autenticação ou uma chamada à API).
  // Por simplicidade, vamos assumir que não está habilitado inicialmente ou que o usuário
  // chegou aqui para configurar.

  const handleEnableMfa = async () => {
    setIsLoading(true);
    setSetupError('');
    setMfaSetupInfo(null);
    setRecoveryCodes([]);
    try {
      // Endpoint do backend para gerar o segredo e a URI do QR Code
      // Este endpoint deve ser protegido e acessível apenas por usuários logados.
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
    setSetupError('');
    try {
      // Envia o código TOTP e o segredo original para o backend verificar e ativar
      const response = await API.post('/auth/mfa/verify-setup', {
        token: mfaVerifyCode,
        secret: mfaSetupInfo.secretKey, // O backend precisa deste segredo para validar o token TOTP
      });
      
      setRecoveryCodes(response.data.recoveryCodes || []);
      alert("MFA ativado com sucesso! Guarde seus códigos de recuperação em um local MUITO seguro.");
      setMfaSetupInfo(null); // Limpa as informações de setup
      setMfaVerifyCode('');
      setMfaAlreadyEnabled(true); // Marca que o MFA agora está ativo
    } catch (error) {
      console.error("Erro ao verificar código MFA:", error);
      setSetupError(error.response?.data?.error || "Código de verificação inválido ou erro ao ativar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Futuramente, adicionar função para desabilitar MFA
  // const handleDisableMfa = async () => { ... };

  return (
    <div className="mfa-setup-page-container page-container"> {/* Reutilize .page-container se definido globalmente */}
      <div className="mfa-setup-card card-dashboard"> {/* Reutilize .card-dashboard */}
        <h2>Configurar Autenticação de Dois Fatores (MFA)</h2>

        {isLoading && <p>Carregando...</p>}
        
        {setupError && <p className="error-message">{setupError}</p>}

        {!mfaAlreadyEnabled && !mfaSetupInfo && (
          <div className="mfa-initiate-section">
            <p>Aumente a segurança da sua conta habilitando a autenticação de dois fatores.</p>
            <button onClick={handleEnableMfa} disabled={isLoading} className="button-submit">
              Habilitar MFA
            </button>
          </div>
        )}

        {mfaSetupInfo && recoveryCodes.length === 0 && (
          <div className="mfa-configure-section">
            <h3>1. Configure seu Aplicativo Autenticador</h3>
            <p>
              Escaneie o QR Code abaixo com seu aplicativo autenticador preferido
              (como Google Authenticator, Authy, Microsoft Authenticator, etc.).
            </p>
            <div className="qr-code-container">
              {mfaSetupInfo.otpauthUrl ? (
                //<QRCode value={mfaSetupInfo.otpauthUrl} size={200} level="H" />
                <QRCode value={mfaSetupInfo.otpauthUrl} size={200} level="H" />
              ) : (
                <p>Erro ao gerar QR Code.</p>
              )}
            </div>
            <p>
              Se não puder escanear, você pode inserir manualmente a seguinte chave secreta:
            </p>
            <code className="secret-key">{mfaSetupInfo.secretKey}</code>
            
            <form onSubmit={handleVerifyAndActivateMfa} className="mfa-verify-form">
              <h3>2. Verifique o Código</h3>
              <p>Após adicionar a conta ao seu aplicativo, insira o código de 6 dígitos gerado:</p>
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
                Verificar e Ativar MFA
              </button>
            </form>
          </div>
        )}

        {recoveryCodes.length > 0 && (
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

        {mfaAlreadyEnabled && recoveryCodes.length === 0 && !mfaSetupInfo && (
             <div className="mfa-status-section">
                <p>A Autenticação de Dois Fatores já está ativa para sua conta.</p>
                {/* Adicionar botão para desabilitar MFA aqui no futuro */}
                {/* <button onClick={handleDisableMfa} className="button-danger">Desabilitar MFA</button> */}
             </div>
        )}
      </div>
    </div>
  );
};

export default MfaSetupPage;