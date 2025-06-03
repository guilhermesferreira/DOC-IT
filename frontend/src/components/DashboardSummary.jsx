// src/components/DashboardSummary.jsx
import React from 'react';
import './DashboardSummary.css'; // CSS para o Resumo

const DashboardSummary = () => {
  // No futuro, aqui você pode buscar e exibir dados resumidos
  // Ex: total de equipamentos, equipamentos por tipo, etc.
  return (
    <div className="summary-container card-dashboard"> {/* Reutilizando card-dashboard se definido globalmente */}
      <h2>Resumo do Painel</h2>
      <p>Bem-vindo ao seu painel Doc-IT!</p>
      <div className="summary-metrics">
        <div className="metric-card">
          <h3>Total de Equipamentos</h3>
          <p className="metric-value">N/A</p> {/* Substituir por dados reais */}
        </div>
        <div className="metric-card">
          <h3>Equipamentos Ativos</h3>
          <p className="metric-value">N/A</p>
        </div>
        <div className="metric-card">
          <h3>Manutenções Agendadas</h3>
          <p className="metric-value">N/A</p>
        </div>
      </div>
      {/* Adicione mais informações ou gráficos aqui */}
    </div>
  );
};

export default DashboardSummary;