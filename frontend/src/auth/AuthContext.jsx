import React, { createContext, useContext, useState, useEffect } from "react";
import API from "../api/api"; // Importa a nova API com credentials

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null); // Adicionado para guardar payload do RBAC
  const [loading, setLoading] = useState(true);

  // No carregamento inicial, o Frontend pergunta pro Backend se ele tem um cookie logado
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Envia uma request vazia bater no servidor. O navegador anexa o Cookie automaticamente.
        const response = await API.get("/auth/verify-session");
        if (response.data.isAuthenticated) {
          setIsAuthenticated(true);
          setUser(response.data.user); // Backend agora deverá retornar o payload descriptografado
        }
      } catch (err) {
        // Se der 401/403 ou qualquer erro, usuário não tem sessão ativa
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Login agora ativa a flag e armazena os dados vindos diretamente da verificação
  const login = (userData) => {
    setIsAuthenticated(true);
    if (userData) {
      setUser(userData);
    }
  };

  // Logout precisa avisar o Backend para apagar o Cookie e limpa as variáveis de Permissão locais
  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch (e) {
      console.error("Erro ao fazer logout", e);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
