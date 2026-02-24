const prisma = require('../../prisma/prismaClient');
const bcrypt = require('bcrypt');

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

    await prisma.user.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: 'Usuário excluído permanentemente.' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ message: 'Falha durante a exclusão. Usuário pode possuir dispositivos vinculados.' });
  }
};
