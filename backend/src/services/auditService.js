const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Registra uma ação na trilha de auditoria se estiver habilitado na configuração.
 * 
 * @param {string} module - O módulo sendo auditado: 'USERS', 'DEVICES', 'TERMINAL', 'TERMINAL_CMD', 'SETTINGS', 'GROUPS'
 * @param {number|null} userId - ID do usuário que fez a ação (pode ser nulo para ações do sistema)
 * @param {string} action - 'CREATE', 'UPDATE', 'DELETE', 'ACCESS', 'COMMAND', etc.
 * @param {string} resource - 'USER', 'DEVICE', 'TERMINAL', 'GROUP', 'SETTING'
 * @param {object|null} details - Detalhes em JSON do que mudou ou comando
 * @param {string|null} ipAddress - IP de origem
 */
async function logAudit(module, userId, action, resource, details = null, ipAddress = null) {
  try {
    // Busca a configuração atual de auditoria
    let config = await prisma.auditConfig.findUnique({ where: { id: 1 } });
    
    // Se não existir, cria a default
    if (!config) {
      config = await prisma.auditConfig.create({ data: {} });
    }

    // Verifica se deve logar baseando no módulo
    let shouldLog = false;
    switch (module) {
      case 'USERS':
      case 'GROUPS':
        shouldLog = config.logUserActions;
        break;
      case 'DEVICES':
        shouldLog = config.logDeviceActions;
        break;
      case 'TERMINAL':
        shouldLog = config.logTerminalAccess;
        break;
      case 'TERMINAL_CMD':
        shouldLog = config.logTerminalCommands;
        break;
      case 'SETTINGS':
        shouldLog = config.logSettingsChanges;
        break;
      default:
        shouldLog = true; // Se o módulo não estiver nas regras, loga por padrão
    }

    if (shouldLog) {
      await prisma.auditLog.create({
        data: {
          userId,
          action,
          resource,
          details,
          ipAddress
        }
      });
    }
  } catch (error) {
    console.error('[AuditService] Erro ao registrar log de auditoria:', error);
    // Não lançamos o erro para não quebrar a funcionalidade principal caso a auditoria falhe
  }
}

module.exports = {
  logAudit
};
