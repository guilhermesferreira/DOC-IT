import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Play, Square, Loader, Maximize2, Monitor, Eye, EyeOff, MouseOff, Mouse, WifiOff } from 'lucide-react';
import './RemoteDesktop.css';

const RemoteDesktop = ({ agentId, deviceName, isAgentOnline = true }) => {
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

    // Watchdog de Sinal: se não recebermos frames por X segundos, consideramos sinal perdido
    const isViewingRef = useRef(false);
    const lastFrameReceivedRef = useRef(Date.now());
    const [isSignalLost, setIsSignalLost] = useState(false);

    // Refs para valores mutáveis que NÃO devem causar re-registro de listeners
    const selectedMonitorRef = useRef(selectedMonitor);
    const selectedQualityRef = useRef(selectedQuality);
    const isInvisibleModeRef = useRef(isInvisibleMode);

    // Sincroniza os refs quando o state mudar (sem causar re-render do useEffect)
    useEffect(() => { selectedMonitorRef.current = selectedMonitor; }, [selectedMonitor]);
    useEffect(() => { selectedQualityRef.current = selectedQuality; }, [selectedQuality]);
    useEffect(() => { isInvisibleModeRef.current = isInvisibleMode; }, [isInvisibleMode]);

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

            // Auto-Recupera a interface caso o sinal volte
            setStreamActive(true);
            setLoading(false);
            setIsSignalLost(false);
            lastFrameReceivedRef.current = Date.now();

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
                if (!data.monitors.find(m => m.index === selectedMonitorRef.current)) {
                    setSelectedMonitor(1);
                }
            }
        };

        const handleInUse = (data) => {
            if (window.confirm(`${data.currentViewer} já está controlando esta máquina.\n\nDeseja assumir o controle e desconectá-lo?`)) {
                // Usuário quer roubar a sessão
                setLoading(true);
                isViewingRef.current = true;
                socket.emit('desktop:force_start', { agentId, monitorIndex: selectedMonitorRef.current, quality: selectedQualityRef.current, invisible_mode: isInvisibleModeRef.current });
                setTimeout(() => {
                    setStreamActive(true);
                    setLoading(false);
                }, 1000);
            } else {
                // Usuário desistiu
                setLoading(false);
                setStreamActive(false);
                isViewingRef.current = false;
            }
        };

        const handleKicked = () => {
            alert("Sua sessão foi encerrada porque outro administrador assumiu o controle desta máquina.");
            isViewingRef.current = false;
            setStreamActive(false);
            setLoading(false);
            clearCanvas();
        };

        // BUG 3 Fix: Auto-rejoin na sala após reconexão do WebSocket do browser
        const handleReconnect = () => {
            if (isViewingRef.current) {
                console.log('[RemoteDesktop] Reconexão detectada. Re-entrando na sala do agente...');
                socket.emit('desktop:start', { agentId, monitorIndex: selectedMonitorRef.current, quality: selectedQualityRef.current, invisible_mode: isInvisibleModeRef.current });
            }
        };

        socket.on('desktop:frame', handleDesktopFrame);
        socket.on('desktop:stopped', handleStreamStopped);
        socket.on('desktop:monitor_list', handleMonitorList);
        socket.on('desktop:in_use', handleInUse);
        socket.on('desktop:kicked', handleKicked);
        socket.on('connect', handleReconnect);

        return () => {
            socket.off('desktop:frame', handleDesktopFrame);
            socket.off('desktop:stopped', handleStreamStopped);
            socket.off('desktop:monitor_list', handleMonitorList);
            socket.off('desktop:in_use', handleInUse);
            socket.off('desktop:kicked', handleKicked);
            socket.off('connect', handleReconnect);
        };
    }, [socket, isConnected, agentId]); // BUG 2 Fix: apenas dependências estáveis

    // Auto-resume persistente (resolve gap de 10s pro Doc-IT-Remote.exe ligar ou travamento do módulo)
    useEffect(() => {
        let reconnectInterval = null;

        // Watchdog loop: verifica a cada 1s se o sinal parou
        const watchdogInterval = setInterval(() => {
            if (isViewingRef.current && streamActive && !isSignalLost) {
                const timeSinceLastFrame = Date.now() - lastFrameReceivedRef.current;
                if (timeSinceLastFrame > 5000) { // 5 segundos sem frame = sinal perdido
                    console.warn('[RemoteDesktop] Watchdog: Sinal de vídeo interrompido (5s timeout).');
                    setIsSignalLost(true);
                }
            }
        }, 1000);

        // Lógica de Re-emissão quando o sinal é perdido (seja por isAgentOnline=false ou por watchdog de frames)
        if (isViewingRef.current && (isSignalLost || !isAgentOnline)) {
            console.log('[RemoteDesktop] Tentando recuperar sinal... Disparando desktop:start periodicamente.');

            const payload = {
                agentId,
                monitorIndex: selectedMonitorRef.current,
                quality: selectedQualityRef.current,
                invisible_mode: isInvisibleModeRef.current
            };

            // Primeira tentativa imediata
            socket.emit('desktop:start', payload);

            // Retentativa a cada 3 segundos até que frames voltem (streamActive voltando a resetar o isSignalLost)
            reconnectInterval = setInterval(() => {
                if (isConnected && socket) {
                    console.log('[RemoteDesktop] Retentando desktop:start (3s)...');
                    socket.emit('desktop:start', payload);
                }
            }, 3000);
        }

        return () => {
            if (reconnectInterval) clearInterval(reconnectInterval);
            if (watchdogInterval) clearInterval(watchdogInterval);
        };
    }, [isAgentOnline, socket, isConnected, agentId, streamActive, isSignalLost]);

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

    // Throttle: limita mouse_move a no máximo 20 eventos/segundo para não inundar o IPC do agente
    const lastMouseSendRef = useRef(0);

    const handleMouseMove = (e) => {
        if (!streamActive || !socket || viewOnly) return;

        const now = Date.now();
        if (now - lastMouseSendRef.current < 50) return; // 50ms = máx 20 eventos/s
        lastMouseSendRef.current = now;

        const pos = getRelativeMousePosition(e);
        if (pos) {
            socket.emit('desktop:mouse_move', { agentId, ...pos });
        }
    };

    const handleMouseDown = (e) => {
        if (!streamActive || !socket || viewOnly) return;
        const pos = getRelativeMousePosition(e);
        if (pos) {
            const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
            socket.emit('desktop:mouse_down', { agentId, button, ...pos });
        }
    };

    const handleMouseUp = (e) => {
        if (!streamActive || !socket || viewOnly) return;
        const pos = getRelativeMousePosition(e);
        if (pos) {
            const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
            socket.emit('desktop:mouse_up', { agentId, button, ...pos });
        }
    };

    // Scroll (wheel) com throttle de 50ms
    const lastScrollRef = useRef(0);
    const handleWheel = (e) => {
        if (!streamActive || !socket || viewOnly) return;
        e.preventDefault();

        const now = Date.now();
        if (now - lastScrollRef.current < 50) return;
        lastScrollRef.current = now;

        // deltaY positivo = scroll pra baixo, negativo = scroll pra cima
        const clicks = Math.sign(e.deltaY) * Math.max(1, Math.min(Math.abs(Math.round(e.deltaY / 100)), 5));
        socket.emit('desktop:mouse_scroll', { agentId, clicks });
    };

    // Impedir o menu de contexto real (botão direito) no canvas
    const handleContextMenu = (e) => {
        e.preventDefault();
    };

    const handleKeyDown = (e) => {
        if (!streamActive || !socket || viewOnly) return;
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
                            <option value="low">Baixa (~1 Mbps / 10 FPS)</option>
                            <option value="medium">Média (~3 Mbps / 15 FPS)</option>
                            <option value="high">Alta (~6 Mbps / 20 FPS)</option>
                            <option value="ultra">Máxima (~10 Mbps / 24 FPS)</option>
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

            <div className={`canvas-container ${streamActive ? 'active' : ''}`} style={{ position: 'relative' }}>
                {!streamActive && !loading && isAgentOnline && (
                    <div className="canvas-placeholder">
                        <Monitor size={48} />
                        <p>Clique em Iniciar para capturar a tela de <strong>{deviceName}</strong></p>
                    </div>
                )}

                {!streamActive && !loading && !isAgentOnline && (
                    <div className="canvas-placeholder offline-placeholder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <WifiOff size={48} className="offline-icon" />
                        <h3>Área de Trabalho Indisponível</h3>
                        <p>O agente encontra-se offline. Aguarde o computador restabelecer o link.</p>
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
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleContextMenu}
                    tabIndex={1}
                    onKeyDown={handleKeyDown}
                />

                {/* Overlay for connection loss or frozen signal during active stream */}
                {(isSignalLost || !isAgentOnline) && streamActive && (
                    <div className="reconnect-overlay" style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        color: 'white', zIndex: 10
                    }}>
                        <WifiOff size={48} className="offline-icon" style={{ marginBottom: '16px', opacity: 0.8 }} />
                        <h3 style={{ margin: '0 0 8px 0' }}>Sinal Interrompido</h3>
                        <p style={{ margin: 0, opacity: 0.8 }}>
                            {!isAgentOnline ? "O agente oscilou. Aguardando reconexão..." : "Vídeo travado. Tentando reiniciar streaming..."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemoteDesktop;
