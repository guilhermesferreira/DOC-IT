//const { PrismaClient } = require('@prisma/client');
//const prisma = new PrismaClient();
const prisma = require('../../prisma/prismaClient');

async function getDevices(req, res) {
  const loggedInUserId = req.user.id; // Usuário logado
  const { userId, source, status } = req.query; // Filtros opcionais

  const whereClause = {};

  // Se um userId específico é fornecido no query param, filtra por ele.
  // Caso contrário, por padrão, pode-se listar apenas os do usuário logado (se não for admin)
  // ou todos se for uma visão administrativa. Para este exemplo, vamos permitir filtrar por qualquer userId.
  if (userId) whereClause.userId = parseInt(userId, 10);
  // else { // Por padrão, mostra apenas os dispositivos do usuário logado se não for admin
  //   whereClause.userId = loggedInUserId;
  // }
  if (source) whereClause.source = source; // "agent" ou "manual"

   if (status) {
    const statuses = status.split(',');
    if (statuses.length > 1) {
      whereClause.status = { in: statuses };
    } else {
      whereClause.status = statuses[0]; // "pending", "approved", "rejected"
    }
  }


  try {
    const devices = await prisma.device.findMany({
       where: whereClause,
       orderBy: { createdAt: 'desc' }
    });
    res.json(devices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar equipamentos' });
  }
}

async function addDevice(req, res) {
  const userId = req.user.id;
  const { name, type, location, patrimony } = req.body;

  if (!name || !type || !location)
    return res.status(400).json({ error: 'Preencha os campos obrigatórios' });

  try {
    const device = await prisma.device.create({
      data: {
        name,
        type,
        location,
        patrimony,
        userId: userId, // Dono do dispositivo é quem o cadastrou
        source: 'manual', // Dispositivo cadastrado manualmente
        status: 'approved'  // Dispositivos manuais já entram como aprovados
      }
    });
    res.status(201).json(device);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar equipamento' });
  }
}

async function updateDevice(req, res) {
  const userId = req.user.id;
  const deviceId = Number(req.params.id);
  const { name, type, location, patrimony, status } = req.body; // Adicionado status para atualizações gerais

  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    // Permite atualização se o dispositivo pertence ao usuário ou se o usuário é admin (lógica de admin não implementada aqui)
    // Por simplicidade, vamos permitir que o dono atualize.
    // A atualização de status para 'approved'/'rejected' de devices de 'agent' tem rotas específicas.
    if (!device) return res.status(404).json({ error: 'Equipamento não encontrado' });
    if (device.userId !== userId && device.source === 'manual') // Só o dono pode alterar dispositivo manual
      return res.status(404).json({ error: 'Equipamento não encontrado' });

    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: { name, type, location, patrimony }
    });
    res.json(updatedDevice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar equipamento' });
  }
}

async function deleteDevice(req, res) {
  const userId = req.user.id;
  const deviceId = Number(req.params.id);

  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return res.status(404).json({ error: 'Equipamento não encontrado' });
    // Adicionar lógica de permissão: só o dono ou admin pode deletar.
    if (device.userId !== userId && device.source === 'manual') return res.status(403).json({ error: 'Não autorizado' });

    await prisma.device.delete({ where: { id: deviceId } });
    res.json({ message: 'Equipamento deletado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar equipamento' });
  }
}

// Aprova um dispositivo que foi descoberto por um agente. 
async function approveDevice(req, res) {
  const deviceId = parseInt(req.params.id, 10);
  const approverUserId = req.user.id;

  if (isNaN(deviceId)) {
    return res.status(400).json({ error: 'ID do dispositivo inválido.' });
  }

  try {
    const deviceToApprove = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!deviceToApprove) {
      return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    }

    if (deviceToApprove.source !== 'agent') {
      return res.status(400).json({ error: 'Este dispositivo não foi originado por um agente.' });
    }

     if (deviceToApprove.status === 'approved') {
      return res.status(400).json({ error: `Dispositivo já está no status 'approved'.` });
    }
    if (!['pending', 'rejected'].includes(deviceToApprove.status)) {
        return res.status(400).json({ error: `Só é possível aprovar dispositivos com status 'pending' ou 'rejected'. Status atual: '${deviceToApprove.status}'.` });
    }

    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'approved',
        userId: approverUserId, // Associa o dispositivo ao usuário que aprovou
        approvedAt: new Date(),
        // Campos como name, type, location podem ter sido preenchidos no check-in do agente
        // ou podem ser atualizados aqui se necessário.
        // Ex: gerar patrimônio se ainda não existir
        patrimony: deviceToApprove.patrimony || (deviceToApprove.agentId ? `AGENT-${deviceToApprove.agentId.substring(0, 8).toUpperCase()}` : undefined),
      },
    });

    res.json({
      message: `Dispositivo '${updatedDevice.name}' (Agent ID: ${updatedDevice.agentId || 'N/A'}) aprovado com sucesso.`,
      device: updatedDevice,
    });
  } catch (error) {
    console.error('Erro ao aprovar dispositivo:', error);
    res.status(500).json({ error: 'Falha ao aprovar dispositivo.' });
  }
}

// Rejeita um dispositivo.
async function rejectDevice(req, res) {
  const deviceId = parseInt(req.params.id, 10);
  // const rejectorUserId = req.user.id; // Opcional: registrar quem rejeitou

  if (isNaN(deviceId)) {
    return res.status(400).json({ error: 'ID do dispositivo inválido.' });
  }

  try {
    const deviceToReject = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!deviceToReject) {
      return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    }

    // Permite rejeitar dispositivos pendentes ou já aprovados (caso mude de ideia)
    if (!['pending', 'approved'].includes(deviceToReject.status)) {
        return res.status(400).json({ error: `Não é possível rejeitar um dispositivo com status '${deviceToReject.status}'.` });
    }

    const updatedDevice = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'rejected',
        userId: null, // Remove a associação com qualquer usuário
        approvedAt: null, // Limpa data de aprovação
      },
    });

    res.json({
      message: `Dispositivo '${updatedDevice.name}' (Agent ID: ${updatedDevice.agentId || 'N/A'}) rejeitado com sucesso.`,
      device: updatedDevice,
    });
  } catch (error) {
    console.error('Erro ao rejeitar dispositivo:', error);
    res.status(500).json({ error: 'Falha ao rejeitar dispositivo.' });
  }
}

module.exports = { getDevices, addDevice, updateDevice, deleteDevice, approveDevice, rejectDevice };
