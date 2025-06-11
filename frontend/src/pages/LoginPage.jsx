// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext.jsx";
import './LoginPage.css';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState(null);
  const [userIdForMfa, setUserIdForMfa] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setMfaError(null);
    try {
      // A resposta da sua API precisa ser acessada com .data
      const response = await API.post("/auth/login", { username, password });
      
      if (response.data.mfaRequired) {
        setMfaRequired(true);
        setUserIdForMfa(response.data.userId);
        setPassword('');
      } else if (response.data.token) {
        login(response.data.token);
        navigate("/dashboard");
      } else {
        setError("Resposta inesperada do servidor durante o login.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Usuário ou senha inválidos. Tente novamente.");
    }
  };

  const handleSubmitMfaCode = async (e) => {
    e.preventDefault();
    setMfaError(null);
    if (!mfaCode || !userIdForMfa) {
      setMfaError("Código MFA e ID do usuário são necessários.");
      return;
    }
    try {
      const response = await API.post("/auth/mfa/verify-mfa", { userId: userIdForMfa, mfaCode });
      
      if (response.data.token) {
        login(response.data.token);
        navigate("/dashboard");
      } else {
        setMfaError("Resposta inesperada do servidor após verificação do MFA.");
      }
    } catch (err) {
      setMfaError(err.response?.data?.error || "Código MFA inválido ou erro na verificação. Tente novamente.");
    }
  };

  const handleBackToLogin = () => {
    setMfaRequired(false);
    setError(null);
    setMfaError(null);
    setMfaCode("");
  };

  // Ícone de Seta para a Esquerda (SVG)
  const ArrowLeftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
      <path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>
    </svg>
  );

  return (
    <div className="login-page-container">
      <div className="login-content">
        <div className="login-header">
          <div className="logo-shield">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <h1 className="header-title">
            {!mfaRequired ? "Doc-IT" : "Verificação Segura"}
          </h1>
          <p className="header-subtitle">
            {!mfaRequired ? "" : "Confirme sua identidade para continuar"}
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {!mfaRequired ? "Login" : "Autenticação Dupla"}
            </h2>
            {mfaRequired && (
              <p className="card-description">
                Digite o código de 6 dígitos do seu aplicativo autenticador para o usuário{" "}
                <span className="username-highlight">{username}</span>
              </p>
            )}
          </div>
          <div className="card-content">
            {!mfaRequired ? (
              <form onSubmit={handleSubmitPassword} className="space-y-6">
                <div className="form-group">
                  <label htmlFor="username">Usuário</label>
                  <input id="username" type="text" placeholder="Digite seu usuário" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Senha</label>
                  <input id="password" type="password" placeholder="Digite sua senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {error && <div className="alert-destructive">{error}</div>}
                <button type="submit" className="button-primary">Acessar Sistema</button>
              </form>
            ) : (
              <form onSubmit={handleSubmitMfaCode} className="space-y-6">
                <div className="form-group">
                  <label htmlFor="mfaCode">Código de Autenticação</label>
                  <input id="mfaCode" type="text" placeholder="000000" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required autoFocus autoComplete="one-time-code" className="mfa-input" />
                </div>
                {mfaError && <div className="alert-destructive">{mfaError}</div>}
                <button type="submit" className="button-success">Verificar e Acessar</button>
                <button type="button" onClick={handleBackToLogin} className="button-ghost">
                  <ArrowLeftIcon />
                  Voltar ao Login
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="login-footer">
          <p>© 2024 Doc-IT.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;