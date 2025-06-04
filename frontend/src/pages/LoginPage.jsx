// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import API from '../api/api'; // Sua instância do Axios
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext.jsx";
import './LoginPage.css'; // Seu CSS para a página de login

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null); // Erro para o login com senha
  
  const [mfaRequired, setMfaRequired] = useState(false); // Novo estado: controla se o passo MFA é necessário
  const [mfaCode, setMfaCode] = useState('');             // Novo estado: para o código MFA
  const [mfaError, setMfaError] = useState(null);         // Novo estado: erro para o passo MFA
  const [userIdForMfa, setUserIdForMfa] = useState(null); // Novo estado: para guardar o userId para o passo MFA

  const { login } = useAuth();
  const navigate = useNavigate();

  // Handler para o primeiro passo: submeter username e password
  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setMfaError(null); // Limpa erros de MFA anteriores
    try {
      const response = await API.post("/auth/login", { username, password });
      
      if (response.data.mfaRequired) {
        // Backend indicou que MFA é necessário
        setMfaRequired(true);
        setUserIdForMfa(response.data.userId); // Guarda o userId retornado pelo backend
        setPassword(''); // Limpa o campo de senha por segurança
      } else if (response.data.token) {
        // Login bem-sucedido sem MFA, ou MFA já tratado (improvável neste fluxo)
        login(response.data.token);
        navigate("/dashboard");
      } else {
        // Resposta inesperada do backend
        setError("Resposta inesperada do servidor durante o login.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Usuário ou senha inválidos. Tente novamente.");
    }
  };

  // Handler para o segundo passo: submeter o código MFA
  const handleSubmitMfaCode = async (e) => {
    e.preventDefault();
    setMfaError(null);
    if (!mfaCode || !userIdForMfa) {
      setMfaError("Código MFA e ID do usuário são necessários.");
      return;
    }
    try {
      // Chama o endpoint do backend para verificar o código MFA
      const response = await API.post("/auth/verify-mfa", { userId: userIdForMfa, mfaCode });
      
      if (response.data.token) {
        login(response.data.token); // Login bem-sucedido com MFA
        navigate("/dashboard");
      } else {
        setMfaError("Resposta inesperada do servidor após verificação do MFA.");
      }
    } catch (err) {
      setMfaError(err.response?.data?.error || "Código MFA inválido ou erro na verificação. Tente novamente.");
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-form-container">
        {!mfaRequired ? (
          // Formulário de Login (Passo 1: Usuário e Senha)
          <>
            <h2>Login Doc-IT</h2>
            <form onSubmit={handleSubmitPassword}>
              <div className="form-group">
                <label htmlFor="username">Usuário</label>
                <input
                  id="username"
                  type="text"
                  placeholder="Digite seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Senha</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="login-button">Entrar</button>
              {error && <p className="error-message">{error}</p>}
            </form>
          </>
        ) : (
          // Formulário de Verificação MFA (Passo 2: Código MFA)
          <>
            <h2>Verificação de Dois Fatores</h2>
            <p>Insira o código de 6 dígitos do seu aplicativo autenticador para o usuário <strong>{username}</strong>.</p>
            <form onSubmit={handleSubmitMfaCode}>
              <div className="form-group">
                <label htmlFor="mfaCode">Código MFA</label>
                <input
                  id="mfaCode"
                  type="text"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  maxLength="6"
                  required
                  autoFocus // Foca neste campo automaticamente
                  autoComplete="one-time-code"
                />
              </div>
              <button type="submit" className="login-button">Verificar e Entrar</button>
              {mfaError && <p className="error-message">{mfaError}</p>}
            </form>
            <button 
              onClick={() => {
                setMfaRequired(false); 
                setError(null); 
                setMfaError(null);
                // Não precisa limpar username aqui, pode ser útil se o usuário quiser tentar a senha de novo
              }} 
              className="link-button" // Estilize este botão como um link
              style={{marginTop: '10px', background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline'}}
            >
              Voltar para login com senha
            </button>
          </>
        )}
        {/* Você pode manter o rodapé aqui se quiser */}
        {/* <p className="login-footer-text">
          Ainda não tem uma conta?{' '}
          <a href="#">Registre-se</a>
        </p> */}
      </div>
    </div>
  );
};

export default LoginPage;