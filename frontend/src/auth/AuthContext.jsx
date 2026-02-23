import React, { createContext, useContext, useState, useEffect } from "react";
import API from "../api/api"; // Importa a nova API com credentials

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // No carregamento inicial, o Frontend pergunta pro Backend se ele tem um cookie logado
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Envia uma request vazia bater no servidor. O navegador anexa o Cookie automaticamente.
        const response = await API.get("/auth/verify-session");
        if (response.data.isAuthenticated) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        // Se der 401/403 ou qualquer erro, usuário não tem sessão ativa
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Login agora apenas ativa a flag no Frontend, pois o Backend já chumbou o Cookie
  const login = () => {
    setIsAuthenticated(true);
  };

  // Logout precisa avisar o Backend para apagar o Cookie
  const logout = async () => {
    try {
      await API.post("/auth/logout");
    } catch (e) {
      console.error("Erro ao fazer logout", e);
    } finally {
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
