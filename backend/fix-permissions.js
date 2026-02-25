const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando script de atualização de permissões do SuperAdmin...');

  try {
    const updatedGroup = await prisma.userGroup.update({
      where: {
        name: 'SuperAdministrator'
      },
      data: {
        canViewAuditLogs: true,
        canViewAuditSettings: true,
        canEditAuditSettings: true
      }
    });
    
    console.log('Sucesso! O grupo SuperAdministrator agora tem acesso ao módulo de Auditoria.');
    console.log(updatedGroup);

  } catch (error) {
    if (error.code === 'P2025') {
       console.log('Atenção: O grupo "SuperAdministrator" não foi encontrado no seu banco de dados.');
    } else {
       console.error('Erro desconhecido:', error);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
