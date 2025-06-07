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
    let agentHost;
    let message;
    let httpStatus = 200; // Default to 200 OK

    const existingAgent = await prisma.agentHost.findUnique({
      where: { id: agentId },
    });

    if (existingAgent) {
      // Agente já existe, atualiza as informações e lastSeenAt
      agentHost = await prisma.agentHost.update({
        where: { id: agentId },
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
      message = `Host já cadastrado. Informações atualizadas. Status atual: ${agentHost.status}.`;
    } else {
      // Agente não existe, cria um novo com status 'pending'
      agentHost = await prisma.agentHost.create({
        data: {
          id: agentId,
          hostname,
          osUsername,
          ipAddress,
          agentVersion,
          osInfo,
          additionalData,
          status: 'pending',
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      message = `Novo host registrado e aguardando aprovação. Status atual: ${agentHost.status}.`;
      httpStatus = 201; // 201 Created para novo recurso
    }

    res.status(httpStatus).json({
      status: agentHost.status,
      agentId: agentHost.id,
      message: message,
    });

    console.log(agentHost)

  } catch (error) {
    console.error('Erro durante o check-in do agente:', error);
    res.status(500).json({ error: 'Falha ao processar o check-in do agente.' });
  }
}

module.exports = { checkIn };