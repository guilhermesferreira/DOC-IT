const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed Unificado (Grupos, Admin, Config) ---');

  try {
    // 1. Grupos de Usuários
    console.log('[Seed] Provisionando Grupos...');
    
    const superAdminGroup = await prisma.userGroup.upsert({
      where: { name: 'SuperAdministrator' },
      update: {},
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
        canManageTemplates: true,
      }
    });

    await prisma.userGroup.upsert({
      where: { name: 'Administrator' },
      update: {},
      create: {
        name: 'Administrator',
        description: 'Administrador Operacional. Pode gerir tudo exceto RBAC e Settings do Node.',
        canViewUsers: true,
        canCreateUsers: true,
        canEditUsers: true,
        canDeleteUsers: false,
        canViewGroups: true,
        canCreateGroups: false,
        canEditGroups: false,
        canDeleteGroups: false,
        canViewDevices: true,
        canManageDevices: true,
        canAccessRemote: true,
        canViewSettings: true,
        canEditSettings: false,
        canViewAuditLogs: true,
        canViewAuditSettings: false,
      }
    });

    await prisma.userGroup.upsert({
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

    // 2. Usuário Admin Padrão
    console.log('[Seed] Provisionando Usuário Admin...');
    const adminUsername = 'admin';
    const adminPassword = 'admin';
    const adminEmail = 'admin@admin.com';

    const existingAdmin = await prisma.user.findUnique({
      where: { username: adminUsername },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await prisma.user.create({
        data: {
          username: adminUsername,
          password: hashedPassword,
          email: adminEmail,
          isMfaEnabled: false,
          groupId: superAdminGroup.id,
        },
      });
      console.log(`[Seed] Usuário 'admin' criado com sucesso.`);
    } else {
      console.log(`[Seed] Usuário 'admin' já existe.`);
    }

    // 3. Configurações Globais
    console.log('[Seed] Provisionando Configurações Globais...');
    await prisma.globalSettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        inventoryIntervalMinutes: 60,
        updateCheckIntervalMinutes: 120,
        selectedOsqueryVersion: 'latest',
      },
    });

    // 4. Configuração de Auditoria
    console.log('[Seed] Provisionando Configurações de Auditoria...');
    await prisma.auditConfig.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        logUserActions: true,
        logDeviceActions: true,
        logTerminalAccess: true,
        logTerminalCommands: false,
        logSettingsChanges: true,
        retentionDays: 30,
      },
    });

    console.log('--- Seed Unificado Concluído com Sucesso ---');
  } catch (error) {
    console.error('Erro ao executar o seed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
