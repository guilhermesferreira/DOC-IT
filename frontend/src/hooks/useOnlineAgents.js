// src/hooks/useOnlineAgents.js
// Hook para rastrear agentes online em tempo real via WebSocket
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Mesma lógica do RemoteTerminal.jsx — conecta ao backend, não ao Vite
const BACKEND_URL = import.meta.env.VITE_API_URL || `https://${window.location.hostname}:3000`;

/**
 * Hook que mantém um Set de agentIds online, atualizado em tempo real via WebSocket.
 * @returns {{ onlineAgentIds: Set<string>, onlineCount: number }}
 */
export function useOnlineAgents() {
  const [onlineAgentIds, setOnlineAgentIds] = useState(new Set());
  const socketRef = useRef(null);

  useEffect(() => {
    // Conecta ao mesmo servidor Socket.IO (com cookies de auth)
    const socket = io(BACKEND_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    // Recebe a lista completa ao conectar
    socket.on('agent:online-list', (agentIds) => {
      setOnlineAgentIds(new Set(agentIds));
    });

    // Agente ficou online
    socket.on('agent:online', ({ agentId }) => {
      setOnlineAgentIds(prev => {
        const next = new Set(prev);
        next.add(agentId);
        return next;
      });
    });

    // Agente ficou offline
    socket.on('agent:offline', ({ agentId }) => {
      setOnlineAgentIds(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return {
    onlineAgentIds,
    onlineCount: onlineAgentIds.size,
    isAgentOnline: (agentId) => onlineAgentIds.has(agentId),
  };
}
