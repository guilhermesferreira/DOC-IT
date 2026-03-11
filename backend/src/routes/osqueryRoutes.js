// backend/src/routes/osqueryRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const osqueryController = require('../controllers/osqueryController');
const authMiddleware = require('../middleware/auth');
const requirePermission = require('../middleware/rbac');

// Todas as rotas de gestão exigem autenticação e permissão de edição de configs
router.get('/versions', authMiddleware, requirePermission('canViewSettings'), osqueryController.getVersions);
router.post('/sync', authMiddleware, requirePermission('canEditSettings'), osqueryController.syncVersion);
router.post('/select', authMiddleware, requirePermission('canEditSettings'), osqueryController.selectVersion);

module.exports = router;
