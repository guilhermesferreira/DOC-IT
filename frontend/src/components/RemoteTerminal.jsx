import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useSocket } from '../context/SocketContext';
import 'xterm/css/xterm.css';

const RemoteTerminal = ({ agentId }) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const fitAddonRef = useRef(null);
    const { socket, isConnected } = useSocket();

    useEffect(() => {
        if (!socket) return;

        // 1. Inicializa o Xterm.js
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#f3f3f3',
                cursor: '#f3f3f3'
            },
            fontFamily: '"Fira Code", monospace',
            fontSize: 14
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);

        // Timeout para dar tempo da renderização do DOM (evita erro "dimensions undefined")
        setTimeout(() => {
            try {
                fitAddon.fit();
            } catch (e) {
                console.warn("Retrying fit:", e);
            }
        }, 150);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.writeln(`Iniciando conexão segura com a API do ${import.meta.env.VITE_PROJECT_NAME || 'Doc-IT'}...`);

        // 2. Se já estiver conectado, inicia o terminal imediatamente
        if (socket.connected) {
            term.writeln(`\x1b[32m[+] Conectado ao Servidor WebSocket (${import.meta.env.VITE_PROJECT_NAME || 'Doc-IT'} API)\x1b[0m`);
            term.writeln('\x1b[33m[*] Solicitando handshake com o Agente Python...\x1b[0m');
            socket.emit('terminal:start', { agentId });
        }

        const handleConnect = () => {
            term.writeln(`\x1b[32m[+] Conectado ao Servidor WebSocket (${import.meta.env.VITE_PROJECT_NAME || 'Doc-IT'} API)\x1b[0m`);
            term.writeln('\x1b[33m[*] Solicitando handshake com o Agente Python...\x1b[0m');
            socket.emit('terminal:start', { agentId });
        };

        const handleDisconnect = () => {
            term.writeln('\r\n\x1b[31m[-] Conexão com o servidor encerrada.\x1b[0m');
        };

        // 3. Recebe output do Agente Python e joga na tela preta
        const handleOutput = (payload) => {
            if (payload.agentId === agentId) {
                term.write(payload.data);
            }
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('terminal:output', handleOutput);

        // 4. Captura teclas do usuário no modo 'Line Buffer'
        let internalBuffer = '';
        term.onData((data) => {
            if (data === '\r' || data === '\n') {
                term.write('\r\n');
                socket.emit('terminal:data', { agentId, data: internalBuffer + '\n' });
                internalBuffer = '';
            } else if (data === '\x7f' || data === '\b') {
                if (internalBuffer.length > 0) {
                    term.write('\b \b'); // Apaga um caracter visualmente
                    internalBuffer = internalBuffer.slice(0, -1);
                }
            } else {
                // Suporte a digitação e 'Paste' limpando teclas de controle/direcionais
                let cleanInput = '';
                for (let i = 0; i < data.length; i++) {
                    if (data.charCodeAt(i) >= 32 && data.charCodeAt(i) !== 127) {
                        cleanInput += data[i];
                    }
                }
                if (cleanInput) {
                    term.write(cleanInput);
                    internalBuffer += cleanInput;
                }
            }
        });

        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        // Limpeza na desmontagem: remove listeners e para o terminal, mas NÃO desconecta o socket
        return () => {
            window.removeEventListener('resize', handleResize);
            socket.emit('terminal:stop', { agentId });
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('terminal:output', handleOutput);
            term.dispose();
        };
    }, [socket, agentId]);

    return (
        <div style={{ width: '100%', height: '500px', backgroundColor: '#1e1e1e', borderRadius: '8px', padding: '10px', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 5, right: 15, zIndex: 10, color: isConnected ? '#4CAF50' : '#F44336', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isConnected ? '#4CAF50' : '#F44336' }}></div>
                {isConnected ? 'API Conectada' : 'Desconectado'}
            </div>
            <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default RemoteTerminal;
