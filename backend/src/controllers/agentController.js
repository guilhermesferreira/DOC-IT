// c:\Users\guilherme.ferreira\Desktop\Doc-IT\backend\src\controllers\agentController.js
const prisma = require('../../prisma/prismaClient');

async function checkIn(req, res) {
  const { agentId, hostname, osUsername, ipAddress, agentVersion, osInfo, additionalData } = req.body;

  // Força o mTLS para o Agente (certificado válido assinado pela nossa CA)
  const isDirectMTLS = req.socket.authorized;
  
  // Segurança: Previne spoofing do cabeçalho 'x-ssl-client-verify' 
  // Aceita o cabeçalho apenas se a requisição vier do próprio servidor (onde o Nginx roda local).
  const internalIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const isProxyMTLS = req.headers['x-ssl-client-verify'] === 'SUCCESS' && internalIps.includes(req.socket.remoteAddress || req.ip);

  // Em ambiente sem Nginx, isDirectMTLS será true se o Python bater direto no Node.js
  // Em ambiente com Nginx, o Node.js perde o req.socket (pois o Nginx faz o bypass),
  // então dependemos do cabeçalho que o próprio Nginx validou e anexou à requisição.
  if (!isDirectMTLS && !isProxyMTLS) {
    console.log('Tentativa de check-in de agente recusada: Certificado inválido ou ausente.');
    return res.status(401).json({
      error: 'Acesso não autorizado. Certificado de cliente válido é obrigatório.',
    });
  }

  if (!agentId || !hostname || !osUsername) {
    return res.status(400).json({
      error: 'agentId, hostname e osUsername são obrigatórios.',
    });
  }

  try {
    const now = new Date();
    let device;
    let message;
    let httpStatus = 200; // Default to 200 OK

    const existingDevice = await prisma.device.findUnique({ // Changed from agentHost
      where: { agentId: agentId }, // Query by agentId in the Device model
    });

    if (existingDevice) {
      // Device (agent) already exists, update its information and lastSeenAt
      device = await prisma.device.update({ // Changed from agentHost
        where: { agentId: agentId },
        data: {
          hostname,
          osUsername,
          ipAddress,
          agentVersion,
          osInfo,
          additionalData,
          lastSeenAt: now,
          // O status não é alterado aqui pelo agente
        },
      });
          message = `Check-in do agente ${agentId} (${hostname}). Informações atualizadas. Status atual: ${device.status}.`;
    } else {
      // Agente não existe, cria um novo com status 'pending' 
      device = await prisma.device.create({
        data: {
          agentId: agentId,
          hostname,
          name: hostname,
          osUsername,
          ipAddress,
          agentVersion,
          osInfo,
          type: osInfo ? `SO: ${osInfo.substring(0,50)}` : 'Descoberto por Agente',
          location: 'Detectado via Agente',
          additionalData,
          status: 'pending',
          source: 'agent',
          createdAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      message = `Novo agente ${agentId} (${hostname}) registrado. Aguardando aprovação. Status: ${device.status}.`;
      httpStatus = 201; // 201 Created para novo recurso
    }

    res.status(httpStatus).json({
      status: device.status,
      agentId: device.agentId, // Return agentId
      deviceId: device.id,     // Return the database ID of the device
      message: message,
    });


  } catch (error) {
    console.error('Erro durante o check-in do agente:', error);
        // Check for unique constraint violation on agentId if create fails after findUnique misses
    if (error.code === 'P2002' && error.meta?.target?.includes('agentId')) {
        return res.status(409).json({ error: 'Conflito: agentId já existe. O agente pode ter se registrado momentos antes.' });
    }
    res.status(500).json({ error: 'Falha ao processar o check-in do agente.' });
  }
}

// Retorna as informações da última versão e seus Hashes SHA-256
async function getVersion(req, res) {
  try {
    const fs = require('fs');
    const path = require('path');
    const versionPath = path.join(__dirname, '..', '..', 'updates', 'version.json');
    
    if (fs.existsSync(versionPath)) {
      const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return res.json(versionData);
    } else {
      return res.status(404).json({ error: 'Nenhuma atualização disponível.' });
    }
  } catch (error) {
    console.error('Erro ao ler versão do agente:', error);
    res.status(500).json({ error: 'Erro interno ao consultar versão.' });
  }
}

// Serve os arquivos executáveis do update .exe
async function downloadUpdate(req, res) {
  try {
    const { file } = req.params;
    
    // Segurança: Previne Path Traversal garantindo que a requisição não saia da pasta updates
    if (file !== 'agent.exe' && file !== 'updater.exe') {
      return res.status(403).json({ error: 'Arquivo não autorizado.' });
    }

    const path = require('path');
    const filePath = path.join(__dirname, '..', '..', 'updates', file);

    res.download(filePath);
  } catch (error) {
    console.error('Erro ao baixar arquivo do agente:', error);
    res.status(500).json({ error: 'Erro interno ao iniciar o download.' });
  }
}

// As funções getAgentHosts, approveAgentHost, rejectAgentHost, deleteAgentHost
// foram movidas e adaptadas para o deviceController.js
module.exports = { checkIn, getVersion, downloadUpdate };