const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const authMiddleware = require('../middleware/auth');
const requirePermission = require('../middleware/rbac');

// Aplica autenticação a todas rotas desta página
router.use(authMiddleware);

// Endpoint da Tabela de Logs (apenas visível para quem tem permissão)
router.get('/logs', requirePermission('canViewAuditLogs'), auditController.getAuditLogs);

// Endpoints das Configurações de Log
router.get('/config', requirePermission('canViewAuditSettings'), auditController.getAuditConfig);
router.put('/config', requirePermission('canEditAuditSettings'), auditController.updateAuditConfig);

module.exports = router;
