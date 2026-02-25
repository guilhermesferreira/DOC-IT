const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { logAudit } = require('../services/auditService');

// Retorna os logs paginados e filtrados
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, user, action, resource } = req.query;
    
    // Montando a query dinamicamente baseada nos filtros
    const whereClause = {};
    if (user) {
      // Busca pelo ID do usuário ou pelo nome (via relation)
      const parsedUser = parseInt(user);
      if (!isNaN(parsedUser)) {
        whereClause.userId = parsedUser;
      } else {
        whereClause.user = { username: { contains: user, mode: 'insensitive' } };
      }
    }
    if (action) whereClause.action = action;
    if (resource) whereClause.resource = resource;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: { select: { username: true, id: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: skip,
      take: parseInt(limit)
    });

    const total = await prisma.auditLog.count({ where: whereClause });

    res.json({
      data: logs,
      meta: {
        total,
        page: parseInt(page),
        lastPage: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error("Erro ao buscar logs:", error);
    res.status(500).json({ error: "Falha ao buscar auditoria." });
  }
};

// Retorna as configurações atuais de auditoria
exports.getAuditConfig = async (req, res) => {
  try {
    let config = await prisma.auditConfig.findUnique({ where: { id: 1 } });
    if (!config) {
      config = await prisma.auditConfig.create({ data: {} });
    }
    res.json(config);
  } catch (error) {
    console.error("Erro ao carregar config de auditoria:", error);
    res.status(500).json({ error: "Falha ao carregar configurações." });
  }
};

// Atualiza as configurações
exports.updateAuditConfig = async (req, res) => {
  try {
    const {
      logUserActions,
      logDeviceActions,
      logTerminalAccess,
      logTerminalCommands,
      logSettingsChanges,
      retentionDays
    } = req.body;

    const updatedConfig = await prisma.auditConfig.update({
      where: { id: 1 },
      data: {
        logUserActions,
        logDeviceActions,
        logTerminalAccess,
        logTerminalCommands,
        logSettingsChanges,
        retentionDays: retentionDays ? parseInt(retentionDays) : undefined
      }
    });

    res.json(updatedConfig);

    // Registra a mudança drástica de configurações de auditoria
    await logAudit('SETTINGS', req.user.id, 'UPDATE', 'AUDIT_CONFIG', { newConfig: updatedConfig }, req.ip);

  } catch (error) {
    console.error("Erro ao atualizar config de auditoria:", error);
    res.status(500).json({ error: "Falha ao atualizar configurações de log." });
  }
};
