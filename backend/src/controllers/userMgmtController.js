const prisma = require('../../prisma/prismaClient');
const bcrypt = require('bcrypt');
const { logAudit } = require('../services/auditService');

// Listar todos os usuários (painel administrativo)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        isMfaEnabled: true,
        createdAt: true,
      },
    });
    res.json(users);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ message: 'Erro ao buscar dados dos usuários.' });
  }
};

// Criar um novo usuário pelo painel administrativo
exports.createUser = async (req, res) => {
  const { username, email, password, groupId } = req.body;

  try {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Nome de usuário ou E-mail já utilizados.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const dataToCreate = {
      username,
      email,
      password: hashedPassword,
    };
    if (groupId) {
      // Regra de Elevação de Privilégio no momento da Criação
      const targetGroup = await prisma.userGroup.findUnique({ where: { id: parseInt(groupId) } });
      if (targetGroup && targetGroup.name === 'SuperAdministrator') {
           const callerGroup = req.user.group;
           if (!callerGroup || callerGroup.name !== 'SuperAdministrator') {
               return res.status(403).json({ message: 'Permissão negada. Você não tem autorização para criar contas com nível SuperAdministrador.' });
           }
      }
      dataToCreate.groupId = parseInt(groupId);
    }

    const newUser = await prisma.user.create({
      data: dataToCreate,
      select: {
        id: true,
        username: true,
        email: true,
        groupId: true,
        group: { select: { name: true } },
        isMfaEnabled: true,
        createdAt: true,
      }
    });

    await logAudit('USERS', req.user?.id || null, 'CREATE', 'USER', newUser, req.ip);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ message: 'Erro ao criar conta de usuário.' });
  }
};

// Atualizar informações ou grupo de um usuário
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, email, groupId } = req.body;

  try {
    // 1. Busca o usuário que está sendo atacado/alterado
    const targetUser = await prisma.user.findUnique({
        where: { id: parseInt(id) },
        include: { group: true }
    });

    if (!targetUser) return res.status(404).json({ message: 'Usuário não encontrado.' });

    // 2. Regra Anti-Rebelião: Um Administrador normal NÃO PODE alterar dados de um SuperAdministrator
    if (targetUser.group && targetUser.group.name === 'SuperAdministrator') {
        const callerGroup = req.user.group; // Variável injetada pelo rbac/auth middleware no jwt payload
        if (!callerGroup || callerGroup.name !== 'SuperAdministrator') {
            return res.status(403).json({ message: 'Permissão negada. Apenas um SuperAdministrador pode editar a conta de outro SuperAdministrador.' });
        }
    }

    // 3. Regra de Elevação de Privilégio: Impedir que um Administrador normal atribua o cargo de SuperAdministrator
    if (groupId !== undefined && groupId !== null) {
        // Precisamos verificar se o groupId de destino é o SuperAdministrator
        const targetGroup = await prisma.userGroup.findUnique({ where: { id: parseInt(groupId) } });
        if (targetGroup && targetGroup.name === 'SuperAdministrator') {
             const callerGroup = req.user.group;
             if (!callerGroup || callerGroup.name !== 'SuperAdministrator') {
                 return res.status(403).json({ message: 'Permissão negada. Você não tem autorização para promover um usuário a SuperAdministrador.' });
             }
        }
    }

    const dataToUpdate = {};
    if (username) dataToUpdate.username = username;
    if (email) dataToUpdate.email = email;
    if (groupId !== undefined) dataToUpdate.groupId = groupId !== null ? parseInt(groupId) : null;

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        groupId: true,
        group: { select: { name: true } }
      }
    });

    await logAudit('USERS', req.user?.id || null, 'UPDATE', 'USER', updatedUser, req.ip);
    res.json(updatedUser);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ message: 'Erro ao efetuar a atualização do usuário.' });
  }
};

// Deletar um usuário
exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Proteger contra deletar a si próprio (req.user.id injetado p/ verifyToken)
    if (req.user && parseInt(id) === parseInt(req.user.id)) {
        return res.status(400).json({ message: 'Você não pode excluir sua própria conta enquanto estiver logado.' });
    }

    // Busca o alvo pra checar nível hierárquico
    const targetUser = await prisma.user.findUnique({
        where: { id: parseInt(id) },
        include: { group: true }
    });

    if (!targetUser) return res.status(404).json({ message: 'Usuário não encontrado.' });

    // Regra Anti-Mutiny: Um Administrador normal não pode DELETAR um SuperAdministrator
    if (targetUser.group && targetUser.group.name === 'SuperAdministrator') {
        const callerGroup = req.user.group;
        if (!callerGroup || callerGroup.name !== 'SuperAdministrator') {
            return res.status(403).json({ message: 'Permissão negada. Apenas um SuperAdministrador tem privilégio para destituir outro SuperAdministrador.' });
        }
    }

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });
    
    await logAudit('USERS', req.user?.id || null, 'DELETE', 'USER', { id: targetUser.id, username: targetUser.username }, req.ip);
    res.json({ message: 'Usuário excluído permanentemente.' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ message: 'Falha durante a exclusão. Usuário pode possuir dispositivos vinculados.' });
  }
};
