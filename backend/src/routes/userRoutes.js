const express = require('express');
const router = express.Router();
const userMgmtController = require('../controllers/userMgmtController');
const verifyToken = require('../middleware/auth'); // Requer Auth
const requirePermission = require('../middleware/rbac'); // Requer Permissão

// Gerenciamento Master de Usuários (Protegido por RBAC Modular)
router.get('/', verifyToken, requirePermission('canViewUsers'), userMgmtController.getAllUsers);
router.post('/', verifyToken, requirePermission('canCreateUsers'), userMgmtController.createUser);
router.put('/:id', verifyToken, requirePermission('canEditUsers'), userMgmtController.updateUser);
router.delete('/:id', verifyToken, requirePermission('canDeleteUsers'), userMgmtController.deleteUser);

module.exports = router;
