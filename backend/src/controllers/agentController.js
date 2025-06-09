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

// Nova função para listar os hosts de agentes
async function getAgentHosts(req, res) {
 const { status } = req.query; // Captura o parâmetro 'status' da URL query
  try {
        const whereClause = {};
    if (status) {
      whereClause.status = status;
    }
    const agentHosts = await prisma.agentHost.findMany({
      where: whereClause, // Aplica o filtro se 'status' foi fornecido
      orderBy: {
        lastSeenAt: 'desc', 
      },
    });
    res.json(agentHosts);
  } catch (error) {
    console.error('Erro ao buscar hosts de agentes:', error);
    res.status(500).json({ error: 'Falha ao buscar hosts de agentes.' });
  }
}
// Nova função para aprovar um agente
async function approveAgentHost(req, res) {
  const { agentId } = req.params;
  const userId = req.user.id; // ID do usuário autenticado que está aprovando

  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório.' });
  }

  try {
    const agentHost = await prisma.agentHost.findUnique({
      where: { id: agentId },
    });

    if (!agentHost) {
      return res.status(404).json({ error: 'Host do agente não encontrado.' });
    }

    if (agentHost.status !== 'pending') {
      return res.status(400).json({ error: `Host do agente já está no status '${agentHost.status}'. Só é possível aprovar hosts pendentes.` });
    }

    const updatedAgentHost = await prisma.agentHost.update({
      where: { id: agentId },
      data: {
        status: 'approved',
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });
     // Após aprovar o AgentHost, criar um Device correspondente
    // Mapeando campos do AgentHost para Device
    // O Device será associado ao usuário que aprovou o agente.
    let deviceCreationSuccessful = false;
    let deviceCreationErrorMsg = null;
    try {
      await prisma.device.create({
        data: {
          name: updatedAgentHost.hostname, // Usar hostname como nome do dispositivo
          type: updatedAgentHost.osInfo || 'Dispositivo de Agente', // Usar osInfo como tipo, ou um padrão
          location: 'Detectado via Agente', // Localização padrão
          patrimony: `AGENT-${updatedAgentHost.id.substring(0, 8).toUpperCase()}`, // Patrimônio gerado ou deixar em branco
          userId: userId, // ID do usuário que aprovou
          // createdAt e updatedAt são gerenciados automaticamente
        },
      });
      console.log(`Device criado para o AgentHost ${agentId} aprovado.`);
      deviceCreationSuccessful = true;
    } catch (deviceCreationError) {
      console.error(`Erro CRÍTICO ao criar Device para AgentHost ${agentId} após aprovação:`, deviceCreationError);
      deviceCreationErrorMsg = deviceCreationError.message;
      // A aprovação do AgentHost ocorreu, mas a criação do Device falhou.
      // O erro será retornado na resposta.
    }
   let message = `Host do agente ${agentId} (${updatedAgentHost.hostname}) aprovado com sucesso.`;
    if (deviceCreationSuccessful) {
      message += ' Dispositivo correspondente criado no inventário.';
    } else {
      message += ` ATENÇÃO: Falha ao criar o dispositivo correspondente no inventário. Causa: ${deviceCreationErrorMsg || 'Erro desconhecido.'}. Verifique os logs do servidor backend.`;
    }
    
    res.json({
        message: message,
      agentHost: updatedAgentHost,
    });
  } catch (error) {
    console.error('Erro ao aprovar host do agente:', error);
    res.status(500).json({ error: 'Falha ao aprovar host do agente.' });
  }
}

// Nova função para rejeitar um agente
async function rejectAgentHost(req, res) {
  const { agentId } = req.params;
  // const userId = req.user.id; // Opcional: registrar quem rejeitou

  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório.' });
  }

  try {
    const agentHost = await prisma.agentHost.findUnique({
      where: { id: agentId },
    });

    if (!agentHost) {
      return res.status(404).json({ error: 'Host do agente não encontrado.' });
    }

    const updatedAgentHost = await prisma.agentHost.update({
      where: { id: agentId },
      data: {
        status: 'rejected',
        // approvedByUserId: null, // Limpar se estava aprovado antes e foi rejeitado
        // approvedAt: null,
      },
    });

    res.json({
      message: `Host do agente ${agentId} rejeitado com sucesso.`,
      agentHost: updatedAgentHost,
    });
  } catch (error) {
    console.error('Erro ao rejeitar host do agente:', error);
    res.status(500).json({ error: 'Falha ao rejeitar host do agente.' });
  }
}

module.exports = { checkIn, getAgentHosts, approveAgentHost, rejectAgentHost };
// Nova função para excluir um AgentHost
async function deleteAgentHost(req, res) {
  const { agentId } = req.params;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório.' });
  }

  try {
    const agentHost = await prisma.agentHost.findUnique({
      where: { id: agentId },
    });

    if (!agentHost) {
      return res.status(404).json({ error: 'Host do agente não encontrado.' });
    }

    await prisma.agentHost.delete({
      where: { id: agentId },
    });

    res.json({
      message: `Host do agente ${agentId} (${agentHost.hostname}) excluído com sucesso do banco de dados.`,
    });
  } catch (error) {
    console.error('Erro ao excluir host do agente:', error);
    res.status(500).json({ error: 'Falha ao excluir host do agente.' });
  }
}

module.exports = { checkIn, getAgentHosts, approveAgentHost, rejectAgentHost, deleteAgentHost };