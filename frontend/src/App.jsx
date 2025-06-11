// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import MfaSetupPage from "./pages/MfaSetupPage";
import { useAuth } from "./auth/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    // Enquanto o estado de autenticação está carregando, pode mostrar um loader global
    // ou null para evitar piscar conteúdo.
    return <div>Carregando autenticação...</div>; 
  }

  return isAuthenticated ? children : <Navigate to="/" replace />;
};

const App = () => {
  const { loading: authLoading } = useAuth(); // Renomear para evitar conflito se App tiver seu próprio 'loading'

  // Se o contexto de autenticação ainda está carregando o token inicial,
  // é melhor mostrar um loader global para evitar que as rotas tentem renderizar prematuramente.
  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Carregando aplicação...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Rota para a página de login */}
        <Route path="/" element={<LoginPage />} />
        
        {/* Rota para o Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        
        {/* Rota para a página de Dispositivos (exemplo, se você tiver) */}
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <Devices />
            </ProtectedRoute>
          }
        />

        {/* <<< 2. Adicionar a nova rota para a página de configuração do MFA */}
        <Route
          path="/setup-mfa" // Defina o caminho que você quer para esta página
          element={
            <ProtectedRoute> {/* MFA setup deve ser para usuários logados */}
              <MfaSetupPage />
            </ProtectedRoute>
          }
        />

        {/* Opcional: Rota para lidar com caminhos não encontrados */}
        <Route path="*" element={<Navigate to="/" replace />} /> 
      </Routes>
    </BrowserRouter>
  );
};

export default App;
