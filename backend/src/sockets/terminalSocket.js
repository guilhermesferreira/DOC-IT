const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../services/auditService');

    // Map global de agentes online: agentId -> socketId
    const onlineAgents = new Map();
    // Map para tracking de visualizadores de Remote Desktop: agentId -> Set de socketIds
    const desktopViewers = new Map();

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
        socket.on('desktop:start', ({ agentId, monitorIndex, quality, invisible_mode }) => {
          const viewerName = socket.user?.username || 'Administrador';
          
          // Verifica exclusividade de controle
          if (desktopViewers.has(agentId)) {
            const currentViewer = desktopViewers.get(agentId);
            // Se já tem outra pessoa conectada e não é um reload do usuário atual
            if (currentViewer.socketId !== socket.id) {
              console.log(`[Socket] Acesso Negado: ${viewerName} tentou acessar Agente ${agentId}, mas já está em uso por ${currentViewer.viewerName}`);
              socket.emit('desktop:in_use', { currentViewer: currentViewer.viewerName });
              return; // Bloqueia a conexão!
            }
          }
          
          console.log(`[Socket] Frontend (${viewerName}) iniciou Remote Desktop para Agente: ${agentId} no monitor ${monitorIndex || 1}`);
          
          socket.join(`agent_data_${agentId}`);
          desktopViewers.set(agentId, { socketId: socket.id, viewerName });
          
          io.emit('desktop:start', { agentId, monitorIndex, quality, invisible_mode, viewer: viewerName });
        });

        // Evento de Takeover ("Roubar a Sessão")
        socket.on('desktop:force_start', ({ agentId, monitorIndex, quality, invisible_mode }) => {
          const viewerName = socket.user?.username || 'Administrador';
          
          if (desktopViewers.has(agentId)) {
            const oldViewer = desktopViewers.get(agentId);
            if (oldViewer.socketId !== socket.id) {
                console.log(`[Socket] TAKEOVER: ${viewerName} assumiu o controle do Agente ${agentId} expulsando ${oldViewer.viewerName}`);
                // Avisa o usuário que foi chutado para matar a tela dele
                io.to(oldViewer.socketId).emit('desktop:kicked');
                // Remove o antigo socket da sala de transmissão do agente
                const oldSocket = io.sockets.sockets.get(oldViewer.socketId);
                if (oldSocket) {
                    oldSocket.leave(`agent_data_${agentId}`);
                }
            }
          }
          
          socket.join(`agent_data_${agentId}`);
          desktopViewers.set(agentId, { socketId: socket.id, viewerName });
          
          // Re-inicia o loop de stream com este novo dono
          io.emit('desktop:start', { agentId, monitorIndex, quality, invisible_mode, viewer: viewerName });
        });
    
        socket.on('desktop:stop', ({ agentId }) => {
          console.log(`[Socket] Frontend (${socket.user?.username}) parando o Remote Desktop de: ${agentId}`);
          socket.leave(`agent_data_${agentId}`);

          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             console.log(`[Socket] Dono da sessão parou a visualização. Desligando streaming do Agente ${agentId}.`);
             io.emit('desktop:stop', { agentId });
             desktopViewers.delete(agentId);
          }
        });
    
        // Frame de video recebido do Agente (Python) -> Frontend (React)
        socket.on('desktop:frame', ({ agentId, imageB64, width, height }, callback) => {
          // REPASSA APENAS PARA QUEM ESTÁ NA SALA DO AGENTE (Isolamento de Tráfego)
          io.to(`agent_data_${agentId}`).emit('desktop:frame', { agentId, imageB64, width, height });
          
          // Confirma o recebimento para destravar o ws_busy do python (Controle de Fluxo)
          if (typeof callback === 'function') {
              callback();
          }
        });

        // Multi-Monitor Support
        socket.on('desktop:get_monitors', ({ agentId }) => {
          io.emit('desktop:get_monitors', { agentId });
        });
    
        socket.on('desktop:monitor_list', ({ agentId, monitors }) => {
          io.emit('desktop:monitor_list', { agentId, monitors });
        });
    
        // Confirmação de parada vindo do Agente
        socket.on('desktop:stopped', ({ agentId }) => {
          io.emit('desktop:stopped', { agentId });
          desktopViewers.delete(agentId); // Varre de vez
        });
    
        // Eventos de I/O (Frontend -> Agente)
        socket.on('desktop:mouse_move', ({ agentId, x, y, width, height }) => {
          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             io.emit('desktop:mouse_move', { agentId, x, y, width, height });
          }
        });
    
        socket.on('desktop:mouse_down', ({ agentId, button, x, y, width, height }) => {
          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             io.emit('desktop:mouse_down', { agentId, button, x, y, width, height });
          }
        });

        socket.on('desktop:mouse_up', ({ agentId, button, x, y, width, height }) => {
          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             io.emit('desktop:mouse_up', { agentId, button, x, y, width, height });
          }
        });

        socket.on('desktop:mouse_scroll', ({ agentId, clicks }) => {
          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             io.emit('desktop:mouse_scroll', { agentId, clicks });
          }
        });
    
        socket.on('desktop:key_down', ({ agentId, key }) => {
          const viewer = desktopViewers.get(agentId);
          if (viewer && viewer.socketId === socket.id) {
             io.emit('desktop:key_down', { agentId, key });
          }
        });
    
        // Relay de Confirmação de Tamper (Agente -> Backend/Frontend)
        socket.on('tamper:confirmed', (data) => {
          console.log(`[Socket] Agente ${data.agentId} confirmou recebimento de novo Tamper OTP.`);
          io.emit('tamper:confirmed', data);
          
          // Emite também no barramento interno para os controllers HTTP
          if (global.bus) {
            global.bus.emit('tamper:confirmed', data);
          }
        });
    
        socket.on('disconnect', () => {
          console.log(`[Socket] Conexão encerrada: ${socket.id}`);
          
          // Se era um agente, remove do Map e notifica os browsers
          if (socket.isAgent && socket.agentId) {
            onlineAgents.delete(socket.agentId);
            desktopViewers.delete(socket.agentId); // Limpa as sessoés desse agente que caiu
            io.emit('agent:offline', { agentId: socket.agentId });
            console.log(`[Socket] Agente ${socket.agentId} OFFLINE. Total online: ${onlineAgents.size}`);
          } else {
             // Limpeza se for um admin/browser que caiu silenciosamente
             for (const [agentId, viewer] of desktopViewers.entries()) {
                 if (viewer.socketId === socket.id) {
                     console.log(`[Socket] O admin dono da sessão do Agente ${agentId} caiu. Parando streaming...`);
                     io.emit('desktop:stop', { agentId });
                     desktopViewers.delete(agentId);
                 }
             }
          }
        });
      });
    
      return io;
    };
