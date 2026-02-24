const express = require('express');
const router = express.Router();
const userGroupController = require('../controllers/userGroupController');
const verifyToken = require('../middleware/auth'); // Middleware de autenticação
const requirePermission = require('../middleware/rbac'); // Middleware de Permissão

// Rotas protegidas (Blindadas via permissões granulares dos Grupos RBAC)
router.get('/', verifyToken, requirePermission('canViewGroups'), userGroupController.getAllGroups);
router.post('/', verifyToken, requirePermission('canCreateGroups'), userGroupController.createGroup);
router.put('/:id', verifyToken, requirePermission('canEditGroups'), userGroupController.updateGroup);
router.delete('/:id', verifyToken, requirePermission('canDeleteGroups'), userGroupController.deleteGroup);

module.exports = router;
