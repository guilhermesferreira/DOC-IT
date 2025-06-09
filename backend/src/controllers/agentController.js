// c:\Users\guilherme.ferreira\Desktop\Doc-IT\backend\src\controllers\agentController.js
const prisma = require('../../prisma/prismaClient');

async function checkIn(req, res) {
  const { agentId, hostname, osUsername, ipAddress, agentVersion, osInfo, additionalData } = req.body;

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


// As funções getAgentHosts, approveAgentHost, rejectAgentHost, deleteAgentHost
// foram movidas e adaptadas para o deviceController.js
module.exports = { checkIn };