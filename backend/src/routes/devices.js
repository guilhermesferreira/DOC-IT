const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  getDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  approveDevice, // Nova função importada
  rejectDevice   // Nova função importada
} = require('../controllers/deviceController');

// A documentação Swagger precisará ser atualizada para refletir o modelo Device unificado
// e as novas rotas de aprovação/rejeição.

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
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filtra dispositivos por ID do usuário proprietário/aprovador.
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [manual, agent]
 *         description: Filtra dispositivos pela origem (manual ou agente).
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, archived]
 *         description: Filtra dispositivos pelo status.
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
 *                 # Referenciar o schema Device atualizado
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
 * /device/{id}/approve:
 *   patch:
 *     summary: Aprova um dispositivo pendente originado por um agente.
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID do dispositivo (PK do banco) a ser aprovado.
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dispositivo aprovado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device' # Retorna o dispositivo atualizado
 *       400:
 *         description: ID do dispositivo ausente, dispositivo não é de agente ou não está pendente.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Dispositivo não encontrado.
 *       500:
 *         description: Falha interna ao aprovar o dispositivo.
 */

/**
 * @swagger
 * /device/{id}/reject:
 *   patch:
 *     summary: Rejeita um dispositivo (geralmente um pendente originado por agente).
 *     tags: [Devices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         description: ID do dispositivo (PK do banco) a ser rejeitado.
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dispositivo rejeitado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Device' # Retorna o dispositivo atualizado
 *       400: { description: "ID ausente, ou dispositivo não pode ser rejeitado neste estado." }
 *       401: { description: "Não autorizado." }
 *       404: { description: "Dispositivo não encontrado." }
 *       500: { description: "Falha interna ao rejeitar o dispositivo." }
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Device:
 *       type: object
 *       # Esta definição precisará ser atualizada para incluir os novos campos:
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
 *           nullable: true
 *           example: 1
 *         agentId:
 *           type: string
 *           nullable: true
 *           description: UUID fornecido pelo agente.
 *           example: "C0FFEE-C0FFEE-C0FFEE-C0FFEE"
 *         hostname:
 *           type: string
 *           nullable: true
 *         osUsername:
 *           type: string
 *           nullable: true
 *         ipAddress:
 *           type: string
 *           nullable: true
 *         agentVersion:
 *           type: string
 *           nullable: true
 *         osInfo:
 *           type: string
 *           nullable: true
 *         additionalData:
 *           type: object
 *           nullable: true
 *         status:
 *           type: string
 *           example: "approved" # pending, approved, rejected, archived
 *         source:
 *           type: string
 *           example: "manual" # manual, agent
 *         firstSeenAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastSeenAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         approvedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
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
router.patch('/:id/approve', approveDevice); // Rota para aprovar
router.patch('/:id/reject', rejectDevice);   // Rota para rejeitar

module.exports = router;
