const prisma = require('../../prisma/prismaClient');
const { logAudit } = require('../services/auditService');

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

// Objeto helper com apenas as colunas válidas permitidas na tabela UserGroup
const buildGroupDataMatrix = (body) => {
    return {
        name: body.name,
        description: body.description,
        canViewUsers: Boolean(body.canViewUsers),
        canCreateUsers: Boolean(body.canCreateUsers),
        canEditUsers: Boolean(body.canEditUsers),
        canDeleteUsers: Boolean(body.canDeleteUsers),
        canViewGroups: Boolean(body.canViewGroups),
        canCreateGroups: Boolean(body.canCreateGroups),
        canEditGroups: Boolean(body.canEditGroups),
        canDeleteGroups: Boolean(body.canDeleteGroups),
        canViewDevices: Boolean(body.canViewDevices),
        canManageDevices: Boolean(body.canManageDevices),
        canAccessRemote: Boolean(body.canAccessRemote),
        canViewSettings: Boolean(body.canViewSettings),
        canEditSettings: Boolean(body.canEditSettings)
    };
};

// Criar um novo grupo
exports.createGroup = async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ message: 'Nome do grupo é obrigatório.' });
  }

  try {
    const newGroup = await prisma.userGroup.create({
      data: buildGroupDataMatrix(req.body)
    });
    await logAudit('GROUPS', req.user?.id || null, 'CREATE', 'GROUP', newGroup, req.ip);
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

  try {
    const group = await prisma.userGroup.update({
      where: { id: parseInt(id) },
      data: buildGroupDataMatrix(req.body)
    });
    await logAudit('GROUPS', req.user?.id || null, 'UPDATE', 'GROUP', group, req.ip);
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
    await logAudit('GROUPS', req.user?.id || null, 'DELETE', 'GROUP', { id }, req.ip);
    res.json({ message: 'Grupo excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir grupo:', error);
    res.status(500).json({ message: 'Erro ao excluir grupo.' });
  }
};
