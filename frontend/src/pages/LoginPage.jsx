import React, { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../auth/AuthContext.jsx";


const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const { login } = useAuth();
  const navigate = useNavigate();

const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    const response = await API.post("/auth/login", { username, password });
    const { token } = response.data;
    login(token);          // atualiza estado e salva token
    navigate("/dashboard"); 
  } catch (err) {
    setError("Usuário ou senha inválidos");
  }
};

 return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Usuário"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Entrar</button>
      {error && <p>{error}</p>}
    </form>
  );
};

export default LoginPage;