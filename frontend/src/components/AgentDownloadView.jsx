import React, { useState } from 'react';
import { DownloadCloud, Info } from 'lucide-react';
import API from '../api/api';

const AgentDownloadView = () => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState(null);

    const handleDownload = async () => {
        setIsDownloading(true);
        setError(null);
        try {
            const response = await API.get('/api/download/agent-bundle', {
                responseType: 'blob', // Importante para arquivos binários
            });

            // Cria um link temporário para iniciar o download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Doc-IT-Agent-Bundle.zip');
            document.body.appendChild(link);
            link.click();

            // Limpeza
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Erro ao baixar o agente:", err);
            setError("Falha ao gerar o instalador do Agente. Verifique se os arquivos base existem no servidor.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="agent-download-section" style={{ padding: '24px', maxWidth: '800px' }}>
            <h2>Instaladores do Agente Doc-IT</h2>
            <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
                Baixe o pacote pré-configurado do Agente para instalação em novas máquinas da rede.
                O pacote já inclui o executável principal, o atualizador automático e os certificados de segurança necessários.
            </p>

            {error && (
                <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '24px',
                backgroundColor: 'var(--bg-secondary)',
                padding: '24px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Agente Windows (x64)
                    </h3>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '20px', marginBottom: '24px', color: 'var(--text-color)', lineHeight: '1.6' }}>
                        <li>Requer Windows 10/11 ou Windows Server 2016+.</li>
                        <li>Extraia o arquivo ZIP recebido.</li>
                        <li>Execute <strong>Agent.exe</strong> como Administrador.</li>
                        <li>O Agente aparecerá na aba "Onboarding" para sua aprovação.</li>
                    </ul>

                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '6px',
                            fontSize: '15px',
                            fontWeight: '500',
                            cursor: isDownloading ? 'not-allowed' : 'pointer',
                            opacity: isDownloading ? 0.7 : 1,
                            transition: 'background-color 0.2s',
                        }}
                    >
                        <DownloadCloud size={20} />
                        {isDownloading ? 'Gerando Pacote...' : 'Baixar Pacote .ZIP'}
                    </button>
                </div>

                <div style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    padding: '16px',
                    borderRadius: '8px',
                    width: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontWeight: 'bold' }}>
                        <Info size={18} /> Conteúdo do ZIP
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <strong>Doc-IT-agent.exe</strong><br />
                        Executável principal do serviço.<br /><br />

                        <strong>Doc-IT-updater.exe</strong><br />
                        Utilitário de atualização invisível.<br /><br />

                        <strong>ca.crt</strong><br />
                        Certificado Raiz para comunicação mTLS segura.<br /><br />

                        <strong>config.json</strong><br />
                        Arquivo gerado automaticamente apontando para este servidor.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentDownloadView;
