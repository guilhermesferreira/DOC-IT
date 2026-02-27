// src/hooks/useOnlineAgents.js
// Hook para rastrear agentes online em tempo real via WebSocket (usa singleton)
import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

/**
 * Hook que mantém um Set de agentIds online, atualizado em tempo real via WebSocket.
 * Usa o socket singleton do SocketProvider — não cria conexões próprias.
 * @returns {{ onlineAgentIds: Set<string>, onlineCount: number, isAgentOnline: (id: string) => boolean }}
 */
export function useOnlineAgents() {
  const { socket } = useSocket();
  const [onlineAgentIds, setOnlineAgentIds] = useState(new Set());

  useEffect(() => {
    if (!socket) return;

    const handleOnlineList = (agentIds) => {
      setOnlineAgentIds(new Set(agentIds));
    };

    const handleOnline = ({ agentId }) => {
      setOnlineAgentIds(prev => {
        const next = new Set(prev);
        next.add(agentId);
        return next;
      });
    };

    const handleOffline = ({ agentId }) => {
      setOnlineAgentIds(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    };

    // Registra listeners
    socket.on('agent:online-list', handleOnlineList);
    socket.on('agent:online', handleOnline);
    socket.on('agent:offline', handleOffline);

    // Se já estiver conectado, solicita a lista atualizada ao servidor
    // (o servidor só envia automaticamente no 'connection', mas o socket singleton já pode estar conectado)
    if (socket.connected) {
      socket.emit('request:online-list');
    }

    // Cleanup: remove apenas os listeners, NÃO desconecta o socket
    return () => {
      socket.off('agent:online-list', handleOnlineList);
      socket.off('agent:online', handleOnline);
      socket.off('agent:offline', handleOffline);
    };
  }, [socket]);

  return {
    onlineAgentIds,
    onlineCount: onlineAgentIds.size,
    isAgentOnline: (agentId) => onlineAgentIds.has(agentId),
  };
}
