//const { PrismaClient } = require('@prisma/client');
//const prisma = new PrismaClient();
const prisma = require('../../prisma/prismaClient');

async function getDevices(req, res) {
  const userId = req.user.id;
  try {
    const devices = await prisma.device.findMany({
      where: { userId }
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
        userId
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
  const { name, type, location, patrimony } = req.body;

  try {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== userId)
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
    if (!device || device.userId !== userId)
      return res.status(404).json({ error: 'Equipamento não encontrado' });

    await prisma.device.delete({ where: { id: deviceId } });
    res.json({ message: 'Equipamento deletado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar equipamento' });
  }
}

module.exports = { getDevices, addDevice, updateDevice, deleteDevice };
