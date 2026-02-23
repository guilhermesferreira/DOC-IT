const socketIo = require('socket.io');

module.exports = function configureSockets(server) {
  // Inicialização do Socket.IO permitindo requisições do frontend
  const io = socketIo(server, {
    cors: {
      origin: ['http://localhost:5173', 'https://localhost:5173'],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Nova conexão recebida: ${socket.id}`);

    // Cliente (React) emitindo para o Agente (Python)
    socket.on('terminal:start', ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou iniciar terminal para o Agente: ${agentId}`);
      // No futuro podemos associar agentId -> socketId do Python, por hora usamos broadcast
      io.emit('terminal:start', { agentId });
    });

    socket.on('terminal:data', ({ agentId, data }) => {
      // Repassa as teclas do Frontend para o Python
      io.emit('terminal:data', { agentId, data });
    });

    socket.on('terminal:stop', ({ agentId }) => {
      console.log(`[Socket] Frontend solicitou parar terminal para o Agente: ${agentId}`);
      io.emit('terminal:stop', { agentId });
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
