require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const username = 'admin';
  const password = 'adminpassword'; // Senha padrão
  const email = 'admin@admin.com';

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      console.log(`Usuário '${username}' já existe.`);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        isMfaEnabled: false, // ou true se quiser forçar MFA logo de cara
        // role: 'ADMIN', // Se o schema tiver role, descomente isso.
      },
    });

    console.log(`Admin user created: ${user.username}`);
    console.log(`Password: ${password}`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
