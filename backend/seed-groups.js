const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedGroups() {
  console.log('Iniciando provisionamento dos Grupos Padrão (Seed)...');

  try {
    // 1. SuperAdministrator (Controle 100% Absoluto)
    const superAdmin = await prisma.userGroup.upsert({
      where: { name: 'SuperAdministrator' },
      update: {
        canViewAuditLogs: true,
        canViewAuditSettings: true,
      },
      create: {
        name: 'SuperAdministrator',
        description: 'Acesso total e irrestrito (God-Mode) a Módulos, RBAC e Motor.',
        canViewUsers: true,
        canCreateUsers: true,
        canEditUsers: true,
        canDeleteUsers: true,
        canViewGroups: true,
        canCreateGroups: true,
        canEditGroups: true,
        canDeleteGroups: true,
        canViewDevices: true,
        canManageDevices: true,
        canAccessRemote: true,
        canViewSettings: true,
        canEditSettings: true,
        canViewAuditLogs: true,
        canViewAuditSettings: true,
      }
    });
    console.log(`[Seed] Grupo '${superAdmin.name}' verificado/criado.`);

    // 2. Administrator (Controle Operacional Alto)
    const admin = await prisma.userGroup.upsert({
      where: { name: 'Administrator' },
      update: {},
      create: {
        name: 'Administrator',
        description: 'Administrador Operacional. Pode gerir tudo exceto RBAC e Settings do Node.',
        canViewUsers: true,
        canCreateUsers: true,
        canEditUsers: true,
        canDeleteUsers: false,  // Proteção: Previne deleção acidental de staffs
        canViewGroups: true,    // Pode Ver as regras, mas não edita-las
        canCreateGroups: false,
        canEditGroups: false,
        canDeleteGroups: false,
        canViewDevices: true,
        canManageDevices: true,
        canAccessRemote: true,  // Pode acessar maquinas ativamente
        canViewSettings: true,
        canEditSettings: false, // Proteção: Nao pode mudar o motor
        canViewAuditLogs: true,
        canViewAuditSettings: false,
      }
    });
    console.log(`[Seed] Grupo '${admin.name}' verificado/criado.`);

    // 3. Visualizador (Read-Only Observer)
    const viewer = await prisma.userGroup.upsert({
      where: { name: 'Read-Only Observer' },
      update: {},
      create: {
        name: 'Read-Only Observer',
        description: 'Espectador. Possui acesso visual aos Painéis e Inventário, sem poder de edição/deleção.',
        canViewUsers: true,
        canCreateUsers: false,
        canEditUsers: false,
        canDeleteUsers: false,
        canViewGroups: false,
        canCreateGroups: false,
        canEditGroups: false,
        canDeleteGroups: false,
        canViewDevices: true,
        canManageDevices: false,
        canAccessRemote: false,
        canViewSettings: false,
        canEditSettings: false,
      }
    });
    console.log(`[Seed] Grupo '${viewer.name}' verificado/criado.`);

    console.log('--- Provisionamento Concluído com Sucesso ---');
  } catch (err) {
    console.error('Erro ao executar o Seed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seedGroups();
