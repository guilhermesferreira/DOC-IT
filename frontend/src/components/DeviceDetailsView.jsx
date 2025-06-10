// src/components/DeviceDetailsView.jsx
import React, { useState } from 'react';
import './DeviceDetailsView.css'; // Criaremos este CSS
import { ArrowLeft, Monitor, Cpu, HardDrive, Wifi, Shield, Clock, Server } from 'lucide-react';
const DeviceDetailsView = ({ device, onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");

  // Função para formatar datas
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  // Função para normalizar e preparar dados do agente para exibição
  const getAgentData = () => {
    const data = device.additionalData || {};
    return {
      // Overview & General
      domain: data.domain || 'N/A',
      gateway: data.gateway || 'N/A', // Assumindo que o agente colete isso
      // Hardware
      processor: data.cpu_model || 'N/A', // Já estava bom
      memory: data.ram_total_gb ? `${data.ram_total_gb} GB` : 'N/A',
      disks: (data.disks && Array.isArray(data.disks)) ? data.disks : [], // Garante que seja um array
      graphics: data.graphics_card || 'N/A',
      // Network
      networkAdapters: data.network_interfaces || [],
      // Software
      installedSoftware: (data.installed_software && Array.isArray(data.installed_software)) ? data.installed_software : [], // Garante que seja um array
      // Security
      antivirus: data.antivirus_status || data.antivirus || 'N/A', // Exemplo, ajuste conforme o nome do campo
      firewallStatus: data.firewall_status || 'N/A',
      encryptionStatus: data.disk_encryption_status || 'N/A', // Exemplo
    };
  };

  const agentData = getAgentData();

  return (
    <div className="device-details-container">
      {/* Header com botão de voltar */}
      <div className="details-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={16} /> Voltar para a Lista
        </button>
      </div>

      {/* Cabeçalho de Informações do Dispositivo */}
      <div className="device-main-info card-dashboard">
        <div className="info-icon-wrapper">
          <Monitor size={32} className="info-icon" />
        </div>
        <div className="info-text-wrapper">
          <h1 className="device-title">{device.name}</h1>
          <p className="device-subtitle">{device.osInfo || 'Sistema Operacional não informado'}</p>
          <div className="status-line">
            <span className={`status-badge status-${device.status?.toLowerCase()}`}>{device.status}</span>
            <span className="last-seen">Última atividade: {formatDate(device.lastSeenAt)}</span>
          </div>
        </div>
      </div>
      
      {/* Sistema de Abas */}
      <nav className="details-tabs-nav">
        <button onClick={() => setActiveTab('overview')} className={activeTab === 'overview' ? 'active' : ''}>Visão Geral</button>
        <button onClick={() => setActiveTab('hardware')} className={activeTab === 'hardware' ? 'active' : ''}>Hardware</button>
        <button onClick={() => setActiveTab('network')} className={activeTab === 'network' ? 'active' : ''}>Rede</button>
        <button onClick={() => setActiveTab('software')} className={activeTab === 'software' ? 'active' : ''}>Software</button>
        <button onClick={() => setActiveTab('security')} className={activeTab === 'security' ? 'active' : ''}>Segurança</button>
      </nav>

      <div className="details-tab-content">
        {/* Aba: Visão Geral */}
        {activeTab === 'overview' && (
          <div className="tab-pane-grid">
            <div className="info-card">
              <h3><Monitor size={16}/> Informações Básicas</h3>
              <ul>
                <li><span>Hostname:</span> <strong>{device.hostname}</strong></li>
                <li><span>Usuário Principal:</span> <strong>{device.osUsername}</strong></li>
                <li><span>Domínio/Workgroup:</span> <strong>{agentData.domain}</strong></li>
                <li><span>ID do Agente:</span> <strong>{device.agentId}</strong></li>
              </ul>
            </div>
            <div className="info-card">
              <h3><Wifi size={16}/> Conectividade</h3>
              <ul>
                <li><span>Endereço IP Principal:</span> <strong>{device.ipAddress}</strong></li>
                <li><span>Endereço MAC:</span> <strong>{agentData.networkAdapters[0]?.mac_addresses[0] || 'N/A'}</strong></li>
                <li><span>Gateway:</span> <strong>{agentData.gateway || 'N/A'}</strong></li>
              </ul>
            </div>
            <div className="info-card">
              <h3><Shield size={16}/> Status de Segurança</h3>
              <ul>
                <li><span>Antivírus:</span> <strong>{agentData.antivirus}</strong></li>
                <li><span>Firewall:</span> <strong>{agentData.firewallStatus}</strong></li>
                <li><span>Criptografia de Disco:</span> <strong>{agentData.encryptionStatus}</strong></li>
              </ul>
            </div>
          </div>
        )}

        {/* Aba: Hardware */}
        {activeTab === 'hardware' && (
            <div className="tab-pane-grid">
                <div className="info-card">
                    <h3><Cpu size={16}/> Processador</h3>
                    <ul>
                        <li><span>Modelo:</span> <strong>{agentData.processor}</strong></li>
                        {/* Adicionar mais detalhes da CPU se o agente coletar */}
                    </ul>
                </div>
                <div className="info-card">
                    <h3><Server size={16}/> Memória RAM</h3>
                    <ul>
                        <li><span>Total:</span> <strong>{agentData.memory}</strong></li>
                        {/* Adicionar mais detalhes se o agente coletar */}
                    </ul>
                </div>
                <div className="info-card">
                    <h3><HardDrive size={16}/> Armazenamento</h3>
                    {agentData.disks.length > 0 ? (
                        <ul>
                            {agentData.disks.map((disk, index) => (
                                <li key={index}><span>{disk.drive_mountpoint}</span> <strong>{disk.total_gb} GB ({disk.filesystem_type})</strong></li>
                            ))}
                        </ul>
                    ) : <p>Nenhuma informação de disco disponível.</p>}
                </div>
            </div>
        )}

        {/* Aba: Software */}
        {activeTab === 'software' && (
            <div className="info-card full-width">
                <h3>Softwares Instalados ({agentData.installedSoftware.length})</h3>
                <ul className="software-list">
                    {agentData.installedSoftware.length > 0 ? (
                        agentData.installedSoftware.map((sw, index) => (
                            <li key={index}>
                                <strong>{sw.name || 'Software Desconhecido'}</strong>
                                {(sw.version && sw.version !== 'N/A') && <span>(Versão: {sw.version})</span>}
                            </li>
                        ))
                    ) : (
                        <li>Nenhum software listado.</li>
                    )}
                </ul>
            </div>
        )}

        {/* Adicione aqui as outras abas: Network, Security, etc., seguindo o mesmo padrão */}
      </div>
    </div>
  );
};

export default DeviceDetailsView;
