// src/components/DeviceDetailsView.jsx
import React, { useState } from 'react';
import './DeviceDetailsView.css'; // Criaremos este CSS
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { ArrowLeft, Monitor, Cpu, HardDrive, Wifi, Shield, Clock, Server, Network, Trash2, Users, FileText } from 'lucide-react'; // Adicionado Trash2 e Users
const DeviceDetailsView = ({ device, onBack, onDeleteRequest }) => { // Adicionada prop onDeleteRequest
  const [activeTab, setActiveTab] = useState("overview");
  const [activeSecurityTab, setActiveSecurityTab] = useState("firewall");

  // Função para formatar datas
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  // Função para formatar o Uptime a partir do boot_time (em segundos)
  const formatUptime = (bootTimestamp) => {
    if (!bootTimestamp) return 'N/A';
    const now = Date.now();
    const bootMs = bootTimestamp * 1000;
    const diffMs = now - bootMs;

    if (diffMs < 0) return 'N/A';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const diffMinutes = Math.floor((diffMs / 1000 / 60) % 60);

    if (diffDays > 0) return `${diffDays} dia(s), ${diffHours} hora(s)`;
    if (diffHours > 0) return `${diffHours} hora(s), ${diffMinutes} min`;
    return `${diffMinutes} min`;
  };

  // Função para normalizar e preparar dados do agente para exibição
  const getAgentData = () => {
    const data = device.additionalData || {};
    const ramTotalGB = parseFloat(data.ram_total_gb) || 0;
    const ramUsedGB = parseFloat(data.ram_used_gb) || 0; // Assumindo que o agente envia ram_used_gb

    return {
      // Overview & General
      domain: data.domain || 'N/A',
      gateway: data.gateway || 'N/A', // Assumindo que o agente colete isso
      uptime: formatUptime(data.boot_time_timestamp),
      // Hardware
      processor: data.cpu_model || 'N/A', // Já estava bom
      memoryData: { // Objeto para dados de memória para o gráfico
        total: ramTotalGB,
        used: ramUsedGB,
        free: Math.max(0, ramTotalGB - ramUsedGB), // Garante que não seja negativo
        unit: 'GB',
        usagePercentage: ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0,
      },
      disksData: (data.disks && Array.isArray(data.disks)) ? data.disks.map(disk => ({ // Objeto para dados de disco para o gráfico
        name: disk.drive_mountpoint || disk.name || 'N/A', // Usar drive_mountpoint ou name
        filesystem: disk.filesystem_type || 'N/A',
        total: parseFloat(disk.total_gb) || 0,
        used: parseFloat(disk.used_gb) || 0, // Assumindo que o agente envia used_gb
        free: Math.max(0, (parseFloat(disk.total_gb) || 0) - (parseFloat(disk.used_gb) || 0)),
        unit: 'GB',
        usagePercentage: (parseFloat(disk.total_gb) || 0) > 0 ? Math.round(((parseFloat(disk.used_gb) || 0) / (parseFloat(disk.total_gb) || 0)) * 100) : 0,
      })) : [],
      graphics: data.graphics_card || 'N/A',
      // Network
      networkAdapters: data.network_interfaces || [],
      // Software
      installedSoftware: (data.installed_software && Array.isArray(data.installed_software)) ? data.installed_software : [], // Garante que seja um array
      // Security
      antivirus: data.antivirus_status || data.antivirus || 'N/A', // Exemplo, ajuste conforme o nome do campo
      firewallStatus: data.firewall_status || 'N/A',
      encryptionStatus: data.disk_encryption_status || 'N/A', // Exemplo

      // New Security payload from Agent
      securityDetails: data.security || null,
      userDetails: data.users || { local_accounts: [], active_sessions: [] },
      adGpoDetails: data.ad_gpo || { domain_or_workgroup: 'N/A', is_domain_joined: false, applied_gpos: [] },
    };
  };

  const agentData = getAgentData();
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  // Dados para o gráfico de RAM
  const ramChartData = [{ name: 'RAM', used: agentData.memoryData.used, free: agentData.memoryData.free }];

  return (
    <div className="device-details-container">
      {/* Header com botão de voltar */}
      <div className="details-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={16} /> Voltar para a Lista
        </button>
        {/* Botão de Excluir Dispositivo */}
        <button onClick={onDeleteRequest} className="button-danger delete-device-button">
          <Trash2 size={16} /> Excluir Dispositivo
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
            <div className="card-dashboard"> {/* Alterado de info-card */}
              <h2><Monitor size={16} /> Informações Básicas</h2> {/* Alterado para h2 ou h3 com classe de título padrão */}
              <ul>
                <li><span>Hostname:</span> <strong>{device.hostname}</strong></li>
                <li><span>Usuário Principal:</span> <strong>{device.osUsername}</strong></li>
                <li><span>Domínio/Workgroup:</span> <strong>{agentData.domain}</strong></li>
                <li><span>ID do Agente:</span> <strong>{device.agentId}</strong></li>
                <li><span>Tempo Ligado (Uptime):</span> <strong>{agentData.uptime}</strong></li>
              </ul>
            </div>
            <div className="card-dashboard"> {/* Alterado de info-card */}
              <h2><Wifi size={16} /> Conectividade</h2> {/* Alterado */}
              <ul>
                <li><span>Endereço IP Principal:</span> <strong>{device.ipAddress}</strong></li>
                <li><span>Endereço MAC:</span> <strong>{agentData.networkAdapters[0]?.mac_addresses[0] || 'N/A'}</strong></li>
                <li><span>Gateway:</span> <strong>{agentData.gateway || 'N/A'}</strong></li>
              </ul>
            </div>
            <div className="card-dashboard"> {/* Alterado de info-card */}
              <h2><Shield size={16} /> Status de Segurança</h2> {/* Alterado */}
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
            <div className="card-dashboard"> {/* Alterado */}
              <h2><Cpu size={16} /> Processador</h2> {/* Alterado */}
              <ul>
                <li><span>Modelo:</span> <strong>{agentData.processor}</strong></li>
                {/* Adicionar mais detalhes da CPU se o agente coletar */}
              </ul>
            </div>
            <div className="card-dashboard chart-card">
              <h2><Server size={16} /> Memória RAM</h2>
              {agentData.memoryData.total > 0 ? (
                <>
                  <p className="chart-summary">
                    Usado: {agentData.memoryData.used.toFixed(1)} {agentData.memoryData.unit} /
                    Total: {agentData.memoryData.total.toFixed(1)} {agentData.memoryData.unit}
                    ({agentData.memoryData.usagePercentage}%)
                  </p>
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart layout="vertical" data={ramChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis type="number" hide domain={[0, agentData.memoryData.total]} />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip formatter={(value, name) => [`${value.toFixed(1)} ${agentData.memoryData.unit}`, name === 'used' ? 'Usado' : 'Livre']} cursor={{ fill: 'transparent' }} isAnimationActive={false} />
                      <Bar dataKey="used" stackId="a" fill="#0088FE" barSize={20} radius={[5, 0, 0, 5]} activeBar={false} />
                      <Bar dataKey="free" stackId="a" fill="#e0e0e0" barSize={20} radius={[0, 5, 5, 0]} activeBar={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : <p>Informação de memória não disponível.</p>}
            </div>

            {agentData.disksData.map((disk, index) => (
              <div key={index} className="card-dashboard chart-card">
                <h2><HardDrive size={16} /> Disco: {disk.name} ({disk.filesystem})</h2>
                {disk.total > 0 ? (
                  <>
                    <p className="chart-summary">
                      Usado: {disk.used.toFixed(1)} {disk.unit} /
                      Total: {disk.total.toFixed(1)} {disk.unit}
                      ({disk.usagePercentage}%)
                    </p>
                    <ResponsiveContainer width="100%" height={80}>
                      <BarChart layout="vertical" data={[{ name: disk.name, used: disk.used, free: disk.free }]} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <XAxis type="number" hide domain={[0, disk.total]} />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip formatter={(value, name) => [`${value.toFixed(1)} ${disk.unit}`, name === 'used' ? 'Usado' : 'Livre']} cursor={{ fill: 'transparent' }} isAnimationActive={false} />
                        <Bar dataKey="used" stackId={`disk-${index}`} fill={COLORS[index % COLORS.length]} barSize={20} radius={[5, 0, 0, 5]} activeBar={false} />
                        <Bar dataKey="free" stackId={`disk-${index}`} fill="#e0e0e0" barSize={20} radius={[0, 5, 5, 0]} activeBar={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </>
                ) : <p>Informação para este disco não disponível.</p>}
              </div>
            ))}
            {agentData.disksData.length === 0 && (
              <div className="card-dashboard">
                <h2><HardDrive size={16} /> Armazenamento</h2>
                <p>Nenhuma informação de disco disponível.</p>
              </div>
            )}
          </div>
        )}

        {/* Aba: Rede */}
        {activeTab === 'network' && (
          <div className="tab-pane-grid">
            {agentData.networkAdapters.length > 0 ? (
              agentData.networkAdapters.map((adapter, index) => (
                <div key={index} className="card-dashboard">
                  <h2><Network size={16} /> {adapter.name || `Adaptador ${index + 1}`}</h2>
                  <ul>
                    {adapter.ipv4_addresses && adapter.ipv4_addresses.length > 0 && (
                      <li>
                        <span>Endereços IPv4:</span>
                        <strong>
                          {adapter.ipv4_addresses.map(ip => `${ip.ip_address}${ip.netmask ? ` (${ip.netmask})` : ''}`).join(', ')}
                        </strong>
                      </li>
                    )}
                    {adapter.ipv6_addresses && adapter.ipv6_addresses.length > 0 && (
                      <li><span>Endereços IPv6:</span> <strong>{adapter.ipv6_addresses.map(ip => ip.ip_address).join(', ')}</strong></li>
                    )}
                    {adapter.mac_addresses && adapter.mac_addresses.length > 0 && (
                      <li><span>Endereços MAC:</span> <strong>{adapter.mac_addresses.join(', ')}</strong></li>
                    )}
                    {adapter.gateway && <li><span>Gateway (Adaptador):</span> <strong>{adapter.gateway}</strong></li>}
                    {adapter.dns_servers && adapter.dns_servers.length > 0 && (
                      <li><span>Servidores DNS:</span> <strong>{adapter.dns_servers.join(', ')}</strong></li>
                    )}
                    {typeof adapter.dhcp_enabled === 'boolean' && (
                      <li><span>DHCP Habilitado:</span> <strong>{adapter.dhcp_enabled ? 'Sim' : 'Não'}</strong></li>
                    )}
                    {adapter.dhcp_server && <li><span>Servidor DHCP:</span> <strong>{adapter.dhcp_server}</strong></li>}
                  </ul>
                </div>
              ))
            ) : (
              <div className="card-dashboard full-width">
                <h2><Network size={16} /> Informações de Rede</h2>
                <p>Nenhuma informação de adaptador de rede disponível.</p>
              </div>
            )}
          </div>
        )}
        {/* Aba: Software */}
        {activeTab === 'software' && (
          <div className="card-dashboard full-width"> {/* Alterado e mantido full-width se necessário */}
            <h2>Softwares Instalados ({agentData.installedSoftware.length})</h2> {/* Alterado */}
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

        {/* Aba: Security */}
        {activeTab === 'security' && (
          <div className="tab-pane-grid">

            {/* Card: Firewall */}
            <div className="card-dashboard">
              <h2><Shield size={16} /> Status do Windows Firewall</h2>
              {agentData.securityDetails?.firewall && !agentData.securityDetails.firewall.error ? (
                <ul>
                  <li><span>Perfil de Domínio (Domain):</span> <strong>{agentData.securityDetails.firewall.domain?.toUpperCase() || 'N/A'}</strong></li>
                  <li><span>Perfil Privado (Private):</span> <strong>{agentData.securityDetails.firewall.private?.toUpperCase() || 'N/A'}</strong></li>
                  <li><span>Perfil Público (Public):</span> <strong>{agentData.securityDetails.firewall.public?.toUpperCase() || 'N/A'}</strong></li>
                </ul>
              ) : (
                <p>Dados do Firewall indisponíveis ou erro na coleta: {agentData.securityDetails?.firewall?.error || 'Aguardando sincronização do agente.'}</p>
              )}
            </div>

            {/* Card: Antivírus / Endpoint */}
            <div className="card-dashboard">
              <h2><Shield size={16} /> Status do Sophos Endpoint</h2>
              {agentData.securityDetails?.antivirus ? (
                <div>
                  <ul>
                    <li>
                      <span>Sophos Instalado:</span>
                      <strong>{agentData.securityDetails.antivirus.installed ? 'Sim' : 'Não'}</strong>
                    </li>
                  </ul>

                  {agentData.securityDetails.antivirus.installed && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                      <h3 style={{ fontSize: '1em', color: '#555', marginBottom: '10px' }}>Serviços Encontrados:</h3>
                      {agentData.securityDetails.antivirus.running_services.length > 0 ? (
                        <ul className="software-list" style={{ maxHeight: '200px' }}>
                          {agentData.securityDetails.antivirus.running_services.map((srv, idx) => (
                            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: 'none' }}>
                              <span>{srv.name}</span>
                              <strong style={{ color: srv.status === 'Running' ? '#28a745' : '#dc3545' }}>
                                {srv.status === 'Running' ? 'Rodando' : 'Parado'}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontSize: '0.9em', color: '#777' }}>Nenhum serviço atrelado ao Sophos foi detectado em execução ou acessível.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p>Dados de Antivírus indisponíveis. Aguardando sincronização do agente.</p>
              )}
            </div>

            {/* Card: Usuários Locais e Sessões Ativas */}
            <div className="card-dashboard">
              <h2><Users size={16} /> Contas de Usuários e Sessões</h2>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1em', color: '#555', marginBottom: '10px' }}>Contas Locais do Windows:</h3>
                {agentData.userDetails.local_accounts.length > 0 ? (
                  <ul className="software-list" style={{ maxHeight: '150px' }}>
                    {agentData.userDetails.local_accounts.map((user, idx) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                        <span>{user.name}</span>
                        <strong style={{ color: user.enabled ? '#28a745' : '#6c757d', fontSize: '0.85em' }}>
                          {user.enabled ? 'Ativo' : 'Desativado'}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: '0.9em', color: '#777' }}>Nenhuma conta local detectada.</p>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '1em', color: '#555', marginBottom: '10px' }}>Sessões Logadas Agora:</h3>
                {agentData.userDetails.active_sessions.length > 0 ? (
                  <ul className="software-list" style={{ maxHeight: '150px' }}>
                    {agentData.userDetails.active_sessions.map((session, idx) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                        <span>
                          <strong>{session.username}</strong>
                          <span style={{ fontSize: '0.8em', color: '#888', marginLeft: '8px' }}>({session.terminal})</span>
                        </span>
                        <span style={{ fontSize: '0.85em', color: '#555' }}>Desde: {session.started.split(' ')[0]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ fontSize: '0.9em', color: '#777' }}>Nenhum usuário logado neste instante.</p>
                )}
              </div>
            </div>

            {/* Card: Active Directory e GPOs */}
            <div className="card-dashboard">
              <h2><Network size={16} /> Domínio e Políticas (GPO)</h2>
              <ul>
                <li>
                  <span>Tipo de Rede:</span>
                  <strong>{agentData.adGpoDetails.is_domain_joined ? 'Active Directory (Domínio)' : 'Workgroup Local'}</strong>
                </li>
                <li>
                  <span>Nome do Domínio/Workgroup:</span>
                  <strong>{agentData.adGpoDetails.domain_or_workgroup}</strong>
                </li>
              </ul>

              {agentData.adGpoDetails.is_domain_joined && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                  <h3 style={{ fontSize: '1em', color: '#555', marginBottom: '10px' }}>Políticas Aplicadas (GPO Computador):</h3>
                  {agentData.adGpoDetails.applied_gpos.length > 0 ? (
                    <ul className="software-list" style={{ maxHeight: '250px' }}>
                      {agentData.adGpoDetails.applied_gpos.map((gpo, idx) => (
                        <li key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #eee', justifyContent: 'flex-start' }}>
                          <span style={{ fontSize: '0.95em' }}>{gpo}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: '0.9em', color: '#777' }}>Nenhuma GPO detectada além das locais.</p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default DeviceDetailsView;
