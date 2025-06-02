const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice
} = require('../controllers/deviceController');


/**
 * @swagger
 * tags:
 *   name: Devices
 *   description: Endpoints para gerenciar equipamentos
 */

/**
 * @swagger
 * /device:
 *   get:
 *     summary: Lista os equipamentos do usuário autenticado
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de equipamentos
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Device'
 *       401:
 *         description: Token inválido ou não fornecido
 *       500:
 *         description: Erro ao buscar equipamentos
 */

/**
 * @swagger
 * /device:
 *   post:
 *     summary: Adiciona um novo equipamento
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - location
 *             properties:
 *               name:
 *                 type: string
 *                 example: Impressora HP
 *               type:
 *                 type: string
 *                 example: Impressora
 *               location:
 *                 type: string
 *                 example: Sala 101
 *               patrimony:
 *                 type: string
 *                 example: 12345
 *     responses:
 *       201:
 *         description: Equipamento criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       400:
 *         description: Campos obrigatórios faltando
 *       401:
 *         description: Token inválido ou não fornecido
 *       500:
 *         description: Erro ao cadastrar equipamento
 */

/**
 * @swagger
 * /device/{id}:
 *   put:
 *     summary: Atualiza um equipamento pelo ID
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID do equipamento
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Impressora HP nova
 *               type:
 *                 type: string
 *                 example: Impressora
 *               location:
 *                 type: string
 *                 example: Sala 102
 *               patrimony:
 *                 type: string
 *                 example: 67890
 *     responses:
 *       200:
 *         description: Equipamento atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device'
 *       401:
 *         description: Token inválido ou não fornecido
 *       404:
 *         description: Equipamento não encontrado
 *       500:
 *         description: Erro ao atualizar equipamento
 */

/**
 * @swagger
 * /device/{id}:
 *   delete:
 *     summary: Deleta um equipamento pelo ID
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID do equipamento
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Equipamento deletado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Equipamento deletado com sucesso
 *       401:
 *         description: Token inválido ou não fornecido
 *       404:
 *         description: Equipamento não encontrado
 *       500:
 *         description: Erro ao deletar equipamento
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Device:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Impressora HP
 *         type:
 *           type: string
 *           example: Impressora
 *         location:
 *           type: string
 *           example: Sala 101
 *         patrimony:
 *           type: string
 *           example: 12345
 *         userId:
 *           type: integer
 *           example: 1
 * 
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */



router.use(authMiddleware);

router.get('/', getDevices);
router.post('/', addDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);

module.exports = router;
