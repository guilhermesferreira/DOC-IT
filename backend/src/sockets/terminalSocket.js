const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../services/auditService');

module.exports = function configureSockets(server) {
  // Inicialização do Socket.IO permitindo requisições do frontend
  const io = socketIo(server, {
    cors: {
      origin: ['http://localhost:5173', 'https://localhost:5173'],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Middleware de Autenticação do Socket via Cookie JWT
  // Agentes Python se identificam pelo header "x-agent-id" e não precisam de JWT
  io.use((socket, next) => {
    const agentId = socket.handshake.headers['x-agent-id'];
    if (agentId) {
      // É um agente Python — libera a conexão sem JWT
      socket.isAgent = true;
      socket.agentId = agentId;
      return next();
    }

    // É um cliente humano (browser) — exige cookie JWT
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error('Autenticação necessária (Sem cookies)'));
    }

    const tokenMatch = cookieHeader.match(/token=([^;]+)/);
    if (!tokenMatch) {
      return next(new Error('Token não encontrado nos cookies'));
    }

    const token = tokenMatch[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      socket.isAgent = false;
      next();
    } catch (err) {
      return next(new Error('Token inválido ou expirado'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Nova conexão segura recebida: ${socket.id} (Usuário: ${socket.user?.username})`);

    // Cliente (React) emitindo para o Agente (Python)
    socket.on('terminal:start', async ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou iniciar terminal para o Agente: ${agentId}`);
      io.emit('terminal:start', { agentId });
      await logAudit('TERMINAL', socket.user?.id, 'ACCESS', 'TERMINAL', { agentId, event: 'START' }, socket.handshake.address);
    });

    socket.on('terminal:data', async ({ agentId, data }) => {
      // Repassa as teclas/comando do Frontend para o Python
      io.emit('terminal:data', { agentId, data });
      
      // Se tiver dados e for o comando completo (como configurado no React)
      if (data && data.trim().length > 0) {
        await logAudit('TERMINAL_CMD', socket.user?.id, 'COMMAND', 'TERMINAL_SESSION', { agentId, command: data.trim() }, socket.handshake.address);
      }
    });

    socket.on('terminal:stop', async ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou parar terminal para o Agente: ${agentId}`);
      io.emit('terminal:stop', { agentId });
      await logAudit('TERMINAL', socket.user?.id, 'ACCESS', 'TERMINAL', { agentId, event: 'STOP' }, socket.handshake.address);
    });


    // Agente (Python) emitindo de volta para o Cliente (React)
    socket.on('terminal:output', ({ agentId, data }) => {
      // Repassa o texto puro pra tela do xterm no React
      io.emit('terminal:output', { agentId, data });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Conexão encerrada: ${socket.id}`);
    });
  });

  return io;
};
