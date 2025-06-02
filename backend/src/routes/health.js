const express = require('express');
const router = express.Router();
const { verifyHealth } = require('../controllers/healthController');

/**
 * @swagger
 * /verifyHealth:
 *   get:
 *     summary: Verifica o status do backend
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Backend funcionando corretamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Backend rodando
 */
router.get('/verifyHealth', verifyHealth);

router.get('/', verifyHealth); // Isso define a rota como /health

module.exports = router;