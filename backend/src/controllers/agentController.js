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
    const agentHost = await prisma.agentHost.upsert({
      where: { id: agentId },
      create: {
        id: agentId,
        hostname,
        osUsername,
        ipAddress,
        agentVersion,
        osInfo,
        additionalData,
        status: 'pending', // Novos agentes iniciam como pendentes
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        hostname,
        osUsername,
        ipAddress,
        agentVersion,
        osInfo,
        additionalData,
        lastSeenAt: now,
      },
    });

    res.status(200).json({
      status: agentHost.status,
      agentId: agentHost.id,
      message: `Check-in do agente processado. Status atual: ${agentHost.status}.`,
    });

    console.log(agentHost)

  } catch (error) {
    console.error('Erro durante o check-in do agente:', error);
    res.status(500).json({ error: 'Falha ao processar o check-in do agente.' });
  }
}

module.exports = { checkIn };