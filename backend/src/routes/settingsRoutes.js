const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');
const requirePermission = require('../middleware/rbac');

// Rotas exclusivas para o Painel Web (Protegidas)
router.get('/', authMiddleware, requirePermission('canViewSettings'), settingsController.getSettings);
router.post('/', authMiddleware, requirePermission('canEditSettings'), settingsController.updateSettings);

// Rota para o Agente ler (Pode ser pública ou protegida via mTLS no contexto AgentRoute, mas iremos montar em /api/settings/agent ou chamá-la direto de /agent)
router.get('/agent', settingsController.getAgentSettings);

module.exports = router;
