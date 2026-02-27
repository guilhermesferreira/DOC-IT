import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Play, Square, Loader, Maximize2, Monitor } from 'lucide-react';
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

    useEffect(() => {
        if (!socket || !isConnected) return;

        // Solicita a lista de monitores quando monta o componente
        socket.emit('desktop:get_monitors', { agentId });

        const handleDesktopFrame = (data) => {
            // data: { agentId, imageB64, width, height }
            if (data.agentId !== agentId) return;

            // Auto-Recupera a interface caso o stream mude de monitor e o backend tenha enviado stopped para a thread anterior
            setStreamActive(true);
            setLoading(false);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            const img = new Image();
            img.onload = () => {
                // Redimensiona o canvas para bater com a proporção nativa vinda do Python
                if (canvas.width !== data.width || canvas.height !== data.height) {
                    canvas.width = data.width;
                    canvas.height = data.height;
                }
                ctx.drawImage(img, 0, 0, data.width, data.height);

                // Calcular FPS
                setFrameStats(prev => {
                    const now = Date.now();
                    if (now - prev.lastFrameTime >= 1000) {
                        return { fps: prev.framesThisSecond + 1, lastFrameTime: now, framesThisSecond: 0 };
                    }
                    return { ...prev, framesThisSecond: prev.framesThisSecond + 1 };
                });
            };
            // A imagem vem pura do Python, concatenamos o prefixo DataURI
            img.src = `data:image/jpeg;base64,${data.imageB64}`;
        };

        const handleStreamStopped = (data) => {
            if (data.agentId === agentId) {
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
            // Garantir que a stream pare ao sair da aba
            if (streamActive) {
                stopStream();
            }
        };
    }, [socket, isConnected, agentId, streamActive]);

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
        socket.emit('desktop:start', { agentId, monitorIndex: selectedMonitor });
        // Simulamos que iniciou após 1 segundo se não houver confirmação específica
        setTimeout(() => {
            setStreamActive(true);
            setLoading(false);
        }, 1000);
    };

    const handleMonitorChange = (e) => {
        const newMonitor = parseInt(e.target.value, 10);
        setSelectedMonitor(newMonitor);

        // Se a stream já estiver ativa, reinicia automaticamente no novo monitor
        if (streamActive) {
            setLoading(true);
            socket.emit('desktop:start', { agentId, monitorIndex: newMonitor });
            setTimeout(() => setLoading(false), 1000);
        }
    };

    const stopStream = () => {
        if (!socket || !isConnected) return;
        socket.emit('desktop:stop', { agentId });
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
        if (!streamActive || !socket) return;
        // Opcional: Reduzir a taxa de envio usando debounce/throttle se sobrecarregar a rede
        const pos = getRelativeMousePosition(e);
        if (pos) {
            socket.emit('desktop:mouse_move', { agentId, ...pos });
        }
    };

    const handleMouseClick = (e) => {
        if (!streamActive || !socket) return;
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
        if (!streamActive || !socket) return;
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
                        <select
                            value={selectedMonitor}
                            onChange={handleMonitorChange}
                            className="bg-[#1A1B1E] text-gray-300 border border-gray-700 rounded px-2 py-1 text-sm outline-none ml-2"
                        >
                            {monitors.map(m => (
                                <option key={m.index} value={m.index}>
                                    {m.name} ({m.width}x{m.height})
                                </option>
                            ))}
                        </select>
                    )}
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
