const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../services/auditService');

// Map global de agentes online: agentId -> socketId
const onlineAgents = new Map();

module.exports = function configureSockets(server) {
  // Inicialização do Socket.IO permitindo requisições do frontend
  const io = socketIo(server, {
    cors: {
      // Permite o frontend e também agentes Python (que não enviam Origin de browser)
      origin: function (origin, callback) {
        return callback(null, true);
      },
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
    const identity = socket.isAgent ? `Agente: ${socket.agentId}` : `Usuário: ${socket.user?.username}`;
    console.log(`[Socket] Nova conexão segura recebida: ${socket.id} (${identity})`);

    // ─── Tracking de agentes online ─────────────────────────────────
    if (socket.isAgent) {
      onlineAgents.set(socket.agentId, socket.id);
      // Notifica todos os clientes (browsers) que este agente ficou online
      io.emit('agent:online', { agentId: socket.agentId });
      console.log(`[Socket] Agente ${socket.agentId} ONLINE. Total online: ${onlineAgents.size}`);
    }

    // Quando um browser conecta, manda a lista de todos os agentes online
    if (!socket.isAgent) {
      socket.emit('agent:online-list', Array.from(onlineAgents.keys()));
    }

    // Permite que o frontend solicite a lista de agentes online a qualquer momento
    // (útil para singleton socket — componentes que montam depois da conexão inicial)
    socket.on('request:online-list', () => {
      if (!socket.isAgent) {
        socket.emit('agent:online-list', Array.from(onlineAgents.keys()));
      }
    });

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


    socket.on('terminal:output', ({ agentId, data }) => {
      // Repassa o texto puro pra tela do xterm no React
      io.emit('terminal:output', { agentId, data });
    });

    // --- Eventos de Remote Desktop (MJPEG/Canvas) ---
    // Start/Stop requests
    socket.on('desktop:start', ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou iniciar Remote Desktop para Agente: ${agentId}`);
      io.emit('desktop:start', { agentId });
    });

    socket.on('desktop:stop', ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou parar Remote Desktop para Agente: ${agentId}`);
      io.emit('desktop:stop', { agentId });
    });

    // Frame de video recebido do Agente (Python) -> Frontend (React)
    socket.on('desktop:frame', ({ agentId, imageB64, width, height }) => {
      // Broadcast para todos (ou apenas clientes frontend filtrados)
      io.emit('desktop:frame', { agentId, imageB64, width, height });
    });

    // Confirmação de parada vindo do Agente
    socket.on('desktop:stopped', ({ agentId }) => {
      io.emit('desktop:stopped', { agentId });
    });

    // Eventos de I/O (Frontend -> Agente)
    socket.on('desktop:mouse_move', ({ agentId, x, y, width, height }) => {
      io.emit('desktop:mouse_move', { agentId, x, y, width, height });
    });

    socket.on('desktop:mouse_click', ({ agentId, button, x, y, width, height }) => {
      io.emit('desktop:mouse_click', { agentId, button, x, y, width, height });
    });

    socket.on('desktop:key_down', ({ agentId, key }) => {
      io.emit('desktop:key_down', { agentId, key });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Conexão encerrada: ${socket.id}`);
      // Se era um agente, remove do Map e notifica os browsers
      if (socket.isAgent && socket.agentId) {
        onlineAgents.delete(socket.agentId);
        io.emit('agent:offline', { agentId: socket.agentId });
        console.log(`[Socket] Agente ${socket.agentId} OFFLINE. Total online: ${onlineAgents.size}`);
      }
    });
  });

  return io;
};
