// src/context/SocketContext.jsx
// Singleton de Socket.IO — uma única conexão compartilhada por toda a aplicação
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_API_URL || `https://${window.location.hostname}:3000`;

const SocketContext = createContext(null);

/**
 * Provider que mantém uma única conexão Socket.IO durante toda a sessão.
 * Deve envolver os componentes que precisam de acesso ao socket.
 */
export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Cria a conexão apenas uma vez
        const newSocket = io(BACKEND_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => setIsConnected(true));
        newSocket.on('disconnect', () => setIsConnected(false));

        setSocket(newSocket);

        // Cleanup: desconecta apenas quando o Provider inteiro desmonta (logout / fechar app)
        return () => {
            newSocket.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};

/**
 * Hook para acessar a instância singleton do socket.
 * @returns {{ socket: import('socket.io-client').Socket | null, isConnected: boolean }}
 */
export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx) {
        throw new Error('useSocket() deve ser usado dentro de <SocketProvider>');
    }
    return ctx;
}
