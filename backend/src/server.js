//src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const setupSwagger = require("./config/swagger");


const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const healthRoutes = require('./routes/health');
const agentRoutes = require('./routes/agentRoutes'); 
const settingsRoutes = require('./routes/settingsRoutes');
const userRoutes = require('./routes/userRoutes');
const userGroupRoutes = require('./routes/userGroupRoutes');
const auditRoutes = require('./routes/auditRoutes'); // <-- Novas rotas de Auditoria

const https = require('https');
const fs = require('fs');
const path = require('path');

const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

setupSwagger(app); // chama o swagger aqui

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, true); // Allow all origins for network access
  },
  credentials: true // Permits sending cookies
}));
app.use(express.json());
app.use(cookieParser());

app.use('/auth', authRoutes);
app.use('/device', deviceRoutes);
app.use('/VerifyHealth', healthRoutes);
app.use('/agent', agentRoutes); 
app.use('/settings', settingsRoutes);
app.use('/users', userRoutes);
app.use('/user-groups', userGroupRoutes);
app.use('/audit', auditRoutes); // <-- Registrar endpoint principal de auditoria

app.get('/', (req, res) => {
  res.json({ message: 'API doc-it Backend funcionando!' });
});

// HTTPS Configuration
const certsDir = path.join(__dirname, '..', 'certs');
const httpsOptions = {
  key: fs.readFileSync(path.join(certsDir, 'server.key')),
  cert: fs.readFileSync(path.join(certsDir, 'server.crt')),
  ca: fs.readFileSync(path.join(certsDir, 'ca.crt')),
  requestCert: true, // Request client certificate
  rejectUnauthorized: false // Allow connections without cert (for frontend), validate in controller
};

const server = https.createServer(httpsOptions, app);

// Configuração do WebSocket (Socket.IO)
const configureSockets = require('./sockets/terminalSocket');
const io = configureSockets(server);

server.listen(PORT, () => {
  console.log(`Backend HTTPS rodando na porta ${PORT}`);
  console.log("Swagger disponível em /api-docs");

  // Inicia processos agendados após o servidor subir
  require('./cronJobs');
});
