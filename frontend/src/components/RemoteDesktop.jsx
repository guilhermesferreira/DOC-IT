import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Play, Square, Loader, Maximize2, Monitor, Eye, EyeOff, MouseOff, Mouse } from 'lucide-react';
import './RemoteDesktop.css';

const RemoteDesktop = ({ agentId, deviceName }) => {
    const { socket, isConnected } = useSocket();
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [streamActive, setStreamActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [frameStats, setFrameStats] = useState({ fps: 0, lastFrameTime: Date.now(), framesThisSecond: 0 });
    const [monitors, setMonitors] = useState([]);
    const [selectedMonitor, setSelectedMonitor] = useState(1); // Default to 1 (Primary)
    const [selectedQuality, setSelectedQuality] = useState('medium'); // low, medium, high, ultra
    const [isInvisibleMode, setIsInvisibleMode] = useState(false); // Modo furtivo sem OSD no Agent
    const [viewOnly, setViewOnly] = useState(false); // Somente visualizar, bloqueia input

    // Trava lógica para Sessão Colaborativa (ignora frames de outros usuários conectados neste agentId se eu não iniciei)
    const isViewingRef = useRef(false);

    useEffect(() => {
        if (!socket || !isConnected) return;

        // Solicita a lista de monitores quando monta o componente
        socket.emit('desktop:get_monitors', { agentId });

        const handleDesktopFrame = async (data) => {
            // data: { agentId, imageB64, width, height }
            if (data.agentId !== agentId) return;

            // Isolamento Básico Colaborativo:
            // Apenas reage ao Broadcast do Proxy Node se VOCÊ tiver ativado a visualização.
            if (!isViewingRef.current) return;

            // Auto-Recupera a interface caso o stream mude de monitor e o backend tenha enviado stopped para a thread anterior
            setStreamActive(true);
            setLoading(false);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            try {
                // Decodifica o Base64 manualmente para Blobs nativos. 
                // Isso EVITA o spam monstruoso de "data:image" na aba Network do DevTools
                // e é mais gentil com o Garbage Collector do DOM.
                const byteCharacters = atob(data.imageB64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/jpeg' });

                // createImageBitmap processa a imagem em background (off-main-thread)
                const bitmap = await createImageBitmap(blob);

                // Redimensiona o canvas para bater com a proporção nativa vinda do Python
                if (canvas.width !== data.width || canvas.height !== data.height) {
                    canvas.width = data.width;
                    canvas.height = data.height;
                }
                ctx.drawImage(bitmap, 0, 0, data.width, data.height);
                bitmap.close(); // Libera IMEDIATAMENTE a memoria bitmap pro GC

                // Calcular FPS
                setFrameStats(prev => {
                    const now = Date.now();
                    if (now - prev.lastFrameTime >= 1000) {
                        return { fps: prev.framesThisSecond + 1, lastFrameTime: now, framesThisSecond: 0 };
                    }
                    return { ...prev, framesThisSecond: prev.framesThisSecond + 1 };
                });
            } catch (err) {
                console.error("Erro ao desenhar frame remoto:", err);
            }
        };

        const handleStreamStopped = (data) => {
            if (data.agentId === agentId) {
                // Se fomos avisados do stop reativo pelo Agent -> Todo mundo desliga
                isViewingRef.current = false;
                setStreamActive(false);
                setLoading(false);
                clearCanvas();
            }
        };

        const handleMonitorList = (data) => {
            if (data.agentId === agentId && data.monitors) {
                setMonitors(data.monitors);
                // Se o monitor atual selecionado não existir na lista nova, reseta pro default
                if (!data.monitors.find(m => m.index === selectedMonitor)) {
                    setSelectedMonitor(1);
                }
            }
        };

        socket.on('desktop:frame', handleDesktopFrame);
        socket.on('desktop:stopped', handleStreamStopped);
        socket.on('desktop:monitor_list', handleMonitorList);

        return () => {
            socket.off('desktop:frame', handleDesktopFrame);
            socket.off('desktop:stopped', handleStreamStopped);
            socket.off('desktop:monitor_list', handleMonitorList);
        };
    }, [socket, isConnected, agentId]); // Remoção de selectedMonitor e selectedQuality das dependências para evitar desconexão ao trocar

    // Efeito dedicado apenas para parar a stream quando o componente é desmontado (sair da página)
    useEffect(() => {
        return () => {
            if (isViewingRef.current && socket) {
                socket.emit('desktop:stop', { agentId });
                isViewingRef.current = false;
            }
        };
    }, [socket, agentId]);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };

    const startStream = () => {
        if (!socket || !isConnected) return;
        setLoading(true);
        isViewingRef.current = true;
        socket.emit('desktop:start', { agentId, monitorIndex: selectedMonitor, quality: selectedQuality, invisible_mode: isInvisibleMode });
        // Simulamos que iniciou após 1 segundo se não houver confirmação específica
        setTimeout(() => {
            setStreamActive(true);
            setLoading(false);
        }, 1000);
    };

    const handleMonitorChange = (e) => {
        const newMonitor = parseInt(e.target.value, 10);
        setSelectedMonitor(newMonitor);

        // Dispara o inicio/mudança automaticamente, mesmo se estiver parado
        setLoading(true);
        isViewingRef.current = true;
        socket.emit('desktop:start', { agentId, monitorIndex: newMonitor, quality: selectedQuality, invisible_mode: isInvisibleMode });
        setTimeout(() => {
            setStreamActive(true);
            setLoading(false);
        }, 1000);
    };

    const handleQualityChange = (e) => {
        const newQuality = e.target.value;
        setSelectedQuality(newQuality);

        // Dispara o inicio/mudança automaticamente, mesmo se estiver parado
        setLoading(true);
        isViewingRef.current = true;
        socket.emit('desktop:start', { agentId, monitorIndex: selectedMonitor, quality: newQuality, invisible_mode: isInvisibleMode });
        setTimeout(() => {
            setStreamActive(true);
            setLoading(false);
        }, 1000);
    };

    // Alternar o modo invisível (se a stream tiver ativa, reinicia para aplicar a OSD no host)
    const toggleInvisibleMode = () => {
        const novoInvisivel = !isInvisibleMode;
        setIsInvisibleMode(novoInvisivel);
        if (streamActive) {
            setLoading(true);
            socket.emit('desktop:start', { agentId, monitorIndex: selectedMonitor, quality: selectedQuality, invisible_mode: novoInvisivel });
            setTimeout(() => setLoading(false), 1000);
        }
    };

    const stopStream = () => {
        if (!socket || !isConnected) return;
        socket.emit('desktop:stop', { agentId });
        isViewingRef.current = false;
        setStreamActive(false);
        clearCanvas();
    };

    const toggleFullscreen = () => {
        if (containerRef.current) {
            if (!document.fullscreenElement) {
                containerRef.current.requestFullscreen().catch(err => {
                    console.error(`Error attempting to enable full-screen mode: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        }
    };

    // --- Handlers de Controle (Mouse e Teclado) ---

    // Pegar posição relativa do clique DENTRO do canvas, independente de estar escalonado (CSS)
    const getRelativeMousePosition = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();

        // x e y físicos na tela
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calcular a proporção (já que o CSS pode espremer o canvas)
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // Posição final mapeada pro tamanho real do sistema alvo
        return {
            x: Math.round(x * scaleX),
            y: Math.round(y * scaleY),
            width: canvas.width,
            height: canvas.height
        };
    };

    const handleMouseMove = (e) => {
        if (!streamActive || !socket || viewOnly) return; // Bloqueado se viewOnly
        // Opcional: Reduzir a taxa de envio usando debounce/throttle se sobrecarregar a rede
        const pos = getRelativeMousePosition(e);
        if (pos) {
            socket.emit('desktop:mouse_move', { agentId, ...pos });
        }
    };

    const handleMouseClick = (e) => {
        if (!streamActive || !socket || viewOnly) return; // Bloqueado se viewOnly
        const pos = getRelativeMousePosition(e);
        if (pos) {
            const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
            socket.emit('desktop:mouse_click', { agentId, button, ...pos });
        }
    };

    // Impedir o menu de contexto real (botão direito) no canvas
    const handleContextMenu = (e) => {
        e.preventDefault();
    };

    const handleKeyDown = (e) => {
        if (!streamActive || !socket || viewOnly) return; // Bloqueado se viewOnly
        // Evitar scroll de tela quando apertar seta pra baixo/cima
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
            e.preventDefault();
        }
        socket.emit('desktop:key_down', { agentId, key: e.key });
    };

    return (
        <div className="remote-desktop-wrapper" ref={containerRef}>
            <div className="remote-desktop-toolbar">
                <div className="toolbar-left">
                    <span className="rd-badge">MJPEG Socket</span>
                    <span className="rd-status">
                        {loading ? 'Conectando...' : streamActive ? `Conectado - ${frameStats.fps} FPS` : 'Desconectado'}
                    </span>
                    {monitors.length > 0 && (
                        <div className="monitor-select-container">
                            <select
                                value={selectedMonitor}
                                onChange={handleMonitorChange}
                                className="monitor-select"
                            >
                                {monitors.map(m => (
                                    <option key={m.index} value={m.index}>
                                        {m.name} ({m.width}x{m.height})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="monitor-select-container" style={{ marginLeft: 0 }}>
                        <select
                            value={selectedQuality}
                            onChange={handleQualityChange}
                            className="monitor-select"
                        >
                            <option value="low">Baixa (Econômica)</option>
                            <option value="medium">Média (Padrão)</option>
                            <option value="high">Alta (20 FPS)</option>
                            <option value="ultra">Mais Alta (30 FPS)</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: '10px' }}>
                        <button
                            className={`tool-icon-btn ${viewOnly ? 'active' : ''}`}
                            onClick={() => setViewOnly(!viewOnly)}
                            title={viewOnly ? "Modo Somente Visualização Ativado (Entradas Bloqueadas)" : "Modo Interativo Ativado (Enviando Entradas)"}
                            style={{ background: viewOnly ? '#ffe8e8' : 'transparent', color: viewOnly ? '#d32f2f' : '#555', border: '1px solid #ddd', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {viewOnly ? <MouseOff size={16} /> : <Mouse size={16} />}
                        </button>

                        <button
                            className={`tool-icon-btn ${isInvisibleMode ? 'active' : ''}`}
                            onClick={toggleInvisibleMode}
                            title={isInvisibleMode ? "Modo Invisível (Sem aviso no monitor host)" : "Modo Transparente (Aviso no monitor host)"}
                            style={{ background: isInvisibleMode ? '#ebf5ff' : 'transparent', color: isInvisibleMode ? '#007bff' : '#555', border: '1px solid #ddd', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            {isInvisibleMode ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>
                <div className="toolbar-right">
                    {!streamActive ? (
                        <button className="button-submit" onClick={startStream} disabled={loading || !isConnected}>
                            {loading ? <Loader size={16} className="spinner" /> : <Play size={16} />}
                            Iniciar Visualização
                        </button>
                    ) : (
                        <button className="button-danger" onClick={stopStream}>
                            <Square size={16} /> Parar Visualização
                        </button>
                    )}
                    <button className="button-ghost" onClick={toggleFullscreen} title="Tela Cheia">
                        <Maximize2 size={16} />
                    </button>
                </div>
            </div>

            <div className={`canvas-container ${streamActive ? 'active' : ''}`}>
                {!streamActive && !loading && (
                    <div className="canvas-placeholder">
                        <Monitor size={48} />
                        <p>Clique em Iniciar para capturar a tela de <strong>{deviceName}</strong></p>
                    </div>
                )}

                {loading && (
                    <div className="canvas-placeholder">
                        <Loader size={48} className="spinner" />
                        <p>Estabelecendo streaming...</p>
                    </div>
                )}

                <canvas
                    ref={canvasRef}
                    className="desktop-canvas"
                    style={{ display: streamActive ? 'block' : 'none' }}
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleMouseClick}
                    onContextMenu={handleContextMenu}
                    tabIndex={1} // Permitir captura de teclado
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
};

export default RemoteDesktop;
