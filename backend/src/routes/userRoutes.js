const express = require('express');
const router = express.Router();
const userMgmtController = require('../controllers/userMgmtController');
const verifyToken = require('../middleware/auth'); // Requer Auth

// Gerenciamento Master de Usuários (RBAC View)
router.get('/', verifyToken, userMgmtController.getAllUsers);
router.post('/', verifyToken, userMgmtController.createUser);
router.put('/:id', verifyToken, userMgmtController.updateUser);
router.delete('/:id', verifyToken, userMgmtController.deleteUser);

module.exports = router;
