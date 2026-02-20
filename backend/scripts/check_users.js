require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const userCount = await prisma.user.count();
    console.log(`Total users found: ${userCount}`);
    if (userCount > 0) {
      const users = await prisma.user.findMany({
        select: { username: true, email: true, role: true }
      });
      console.log('Users:', users);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
