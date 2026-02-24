const prisma = require('../../prisma/prismaClient');

// Listar todos os grupos
exports.getAllGroups = async (req, res) => {
  try {
    const groups = await prisma.userGroup.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
    res.json(groups);
  } catch (error) {
    console.error('Erro ao buscar grupos:', error);
    res.status(500).json({ message: 'Erro ao buscar grupos.' });
  }
};

// Criar um novo grupo
exports.createGroup = async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Nome do grupo é obrigatório.' });
  }

  try {
    const newGroup = await prisma.userGroup.create({
      data: { name, description },
    });
    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Erro ao criar grupo:', error);
    if (error.code === 'P2002') {
      res.status(409).json({ message: 'Já existe um grupo com este nome.' });
    } else {
      res.status(500).json({ message: 'Erro interno ao criar grupo.' });
    }
  }
};

// Atualizar um grupo
exports.updateGroup = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const group = await prisma.userGroup.update({
      where: { id: parseInt(id) },
      data: { name, description },
    });
    res.json(group);
  } catch (error) {
    console.error('Erro ao atualizar grupo:', error);
    res.status(500).json({ message: 'Erro ao atualizar grupo.' });
  }
};

// Deletar um grupo
exports.deleteGroup = async (req, res) => {
  const { id } = req.params;

  try {
    // Verificar se existem usuários atrelados antes de deletar
    const usersCount = await prisma.user.count({
      where: { groupId: parseInt(id) },
    });

    if (usersCount > 0) {
      return res.status(400).json({ message: 'Não é possível excluir um grupo que possui usuários associados.' });
    }

    await prisma.userGroup.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: 'Grupo excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir grupo:', error);
    res.status(500).json({ message: 'Erro ao excluir grupo.' });
  }
};
