// backend/src/routes/osqueryTemplateRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const osqueryTemplateController = require('../controllers/osqueryTemplateController');
const authMiddleware = require('../middleware/auth');
const requirePermission = require('../middleware/rbac');

// Todas as rotas de templates exigem autenticação
// GET é permitido para quem pode ver configurações (ou acesso geral ao osquery)
router.get('/', authMiddleware, osqueryTemplateController.getAllTemplates);

// Mutações exigem permissão específica
router.post('/', authMiddleware, requirePermission('canManageTemplates'), osqueryTemplateController.createTemplate);
router.put('/:id', authMiddleware, requirePermission('canManageTemplates'), osqueryTemplateController.updateTemplate);
router.delete('/:id', authMiddleware, requirePermission('canManageTemplates'), osqueryTemplateController.deleteTemplate);

module.exports = router;
