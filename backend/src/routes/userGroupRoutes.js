const express = require('express');
const router = express.Router();
const userGroupController = require('../controllers/userGroupController');
const verifyToken = require('../middleware/auth'); // Middleware de autenticação

// Rotas protegidas (Requer login Admin/Usuário RBAC no futuro)
router.get('/', verifyToken, userGroupController.getAllGroups);
router.post('/', verifyToken, userGroupController.createGroup);
router.put('/:id', verifyToken, userGroupController.updateGroup);
router.delete('/:id', verifyToken, userGroupController.deleteGroup);

module.exports = router;
