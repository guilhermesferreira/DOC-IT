// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import API from '../api/api'; // Assumindo que você usa este arquivo
import { useNavigate } from 'react-router-dom'; //
import { useAuth } from "../auth/AuthContext.jsx"; // Assumindo que você usa este arquivo
import './LoginPage.css'; // <<< Importa o nosso CSS específico para esta página

const LoginPage = () => {
  const [username, setUsername] = useState(''); //
  const [password, setPassword] = useState(''); //
  const [error, setError] = useState(null); //
  const { login } = useAuth(); //
  const navigate = useNavigate(); //

  const handleSubmit = async (e) => { //
    e.preventDefault(); //
    try { //
      const response = await API.post("/auth/login", { username, password }); //
      const { token } = response.data; //
      login(token); //
      navigate("/dashboard"); //
    } catch (err) { //
      setError("Usuário ou senha inválidos"); //
    }
  };

  return (
    <div className="login-page-container"> {/* Container principal da página */}
      <div className="login-form-container"> {/* Container do formulário */}
        <h2>Login Doc-IT</h2> {/* Título */}
        <form onSubmit={handleSubmit}>
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
          {error && <p className="error-message">{error}</p>} {/* */}
        </form>
      </div>
      <p className="login-footer-text">
        Ainda não tem uma conta?{' '}
        <a href="#"> {/* Idealmente, isso seria um <Link> do react-router-dom para uma página de registro */}
          Registre-se
        </a>
      </p>
    </div>
  );
};

export default LoginPage;