// c:\Users\guilherme.ferreira\Desktop\Doc-IT\backend\src\routes\agentRoutes.js
const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Agent
 *   description: Endpoints para o agente de monitoramento
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AgentCheckInRequest:
 *       type: object
 *       required:
 *         - agentId
 *         - hostname
 *         - osUsername
 *       properties:
 *         agentId:
 *           type: string
 *           description: Identificador único do agente 
 *           example: "C0FFEE-C0FFEE-C0FFEE-C0FFEE"
 *         hostname:
 *           type: string
 *           description: Nome do host da máquina.
 *           example: "DESKTOP-ABC123"
 *         osUsername:
 *           type: string
 *           description: Nome do usuário do sistema operacional logado na máquina.
 *           example: "guilherme.ferreira"
 *         ipAddress:
 *           type: string
 *           description: Endereço IP principal da máquina (opcional).
 *           example: "192.168.1.10"
 *         agentVersion:
 *           type: string
 *           description: Versão do script/software do agente (opcional).
 *           example: "1.0.2"
 *         osInfo:
 *           type: string
 *           description: Informações sobre o sistema operacional (opcional).
 *           example: "Windows 10 Pro 22H2"
 *         additionalData:
 *           type: object
 *           description: Dados adicionais em formato JSON que o agente queira enviar (opcional).
 *           example: { "cpu_model": "Intel Core i7", "ram_total_gb": 16 }
 *     AgentCheckInResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           description: Status atual do agente no servidor ("pending", "approved", "rejected").
 *           example: "pending"
 *         agentId:
 *           type: string
 *           description: O ID do agente que fez o check-in.
 *           example: "C0FFEE-C0FFEE-C0FFEE-C0FFEE"
 *         message:
 *           type: string
 *           description: Mensagem informativa sobre o resultado do check-in.
 *           example: "Check-in do agente processado. Status atual: pending."
 *     AgentHost:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Identificador único do agente.
 *           example: "C0FFEE-C0FFEE-C0FFEE-C0FFEE"
 *         hostname:
 *           type: string
 *           description: Nome do host da máquina.
 *           example: "DESKTOP-ABC123"
 *         osUsername:
 *           type: string
 *           description: Nome do usuário do sistema operacional logado na máquina.
 *           example: "guilherme.ferreira"
 *         ipAddress:
 *           type: string
 *           nullable: true
 *           description: Endereço IP principal da máquina.
 *           example: "192.168.1.10"
 *         agentVersion:
 *           type: string
 *           nullable: true
 *           description: Versão do script/software do agente.
 *           example: "1.0.2"
 *         osInfo:
 *           type: string
 *           nullable: true
 *           description: Informações sobre o sistema operacional.
 *           example: "Windows 10 Pro 22H2"
 *         additionalData:
 *           type: object
 *           nullable: true
 *           description: Dados adicionais em formato JSON.
 *           example: { "cpu_model": "Intel Core i7", "ram_total_gb": 16 }
 *         status:
 *           type: string
 *           description: Status do agente ("pending", "approved", "rejected").
 *           example: "pending"
 *         firstSeenAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora do primeiro check-in.
 *         lastSeenAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora do último check-in.
 *         approvedByUserId:
 *           type: integer
 *           nullable: true
 *           description: ID do usuário que aprovou o agente.
 *         approvedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Data e hora da aprovação.
 */

/**
 * @swagger
 * /agent/check-in:
 *   post:
 *     summary: Permite que um agente faça o check-in ou se registre no servidor.
 *     tags: [Agent]
 *     description: |
 *       Se o agente não existir, ele é criado com status "pending".
 *       Se já existir, suas informações são atualizadas (exceto o status, que é gerenciado por administradores).
 *       Este endpoint não requer autenticação JWT, pois é o primeiro contato do agente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentCheckInRequest'
 *     responses:
 *       200:
 *         description: Check-in processado com sucesso. Retorna o status atual do agente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AgentCheckInResponse'
 *       400:
 *         description: Dados obrigatórios ausentes na requisição (agentId, hostname, osUsername).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse' # Reutilizando o ErrorResponse definido em auth.js
 *       500:
 *         description: Falha interna ao processar o check-in do agente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * @swagger
 * /agent/hosts:
 *   get:
 *     summary: Lista todos os hosts de agentes registrados.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     description: Retorna uma lista de todos os hosts que fizeram check-in. Requer autenticação.
 *     responses:
 *       200:
 *         description: Lista de hosts de agentes obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AgentHost'
 *       401:
 *         description: Não autorizado (token JWT ausente ou inválido).
 *       500:
 *         description: Falha interna ao buscar hosts de agentes.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */


/**
 * @swagger
 * /agent/hosts/{agentId}/approve:
 *   patch:
 *     summary: Aprova um host de agente pendente.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: O ID do host do agente a ser aprovado.
 *     responses:
 *       200:
 *         description: Host do agente aprovado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agentHost:
 *                   $ref: '#/components/schemas/AgentHost'
 *       400:
 *         description: ID do agente ausente ou host não está pendente.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Host do agente não encontrado.
 *       500:
 *         description: Falha interna ao aprovar o host.
 */


/**
 * @swagger
 * /agent/hosts/{agentId}/reject:
 *   patch:
 *     summary: Rejeita um host de agente.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: O ID do host do agente a ser rejeitado.
 *     responses:
 *       200:
 *         description: Host do agente rejeitado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agentHost:
 *                   $ref: '#/components/schemas/AgentHost'
 *       400:
 *         description: ID do agente ausente.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Host do agente não encontrado.
 *       500:
 *         description: Falha interna ao rejeitar o host.
 */
/**
 * @swagger
 * /agent/hosts/{agentId}:
 *   delete:
 *     summary: Exclui um host de agente do banco de dados.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *         description: O ID do host do agente a ser excluído.
 *     responses:
 *       200:
 *         description: Host do agente excluído com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: ID do agente ausente.
 *       401:
 *         description: Não autorizado.
 *       404:
 *         description: Host do agente não encontrado.
 *       500:
 *         description: Falha interna ao excluir o host.
 */



router.post('/check-in', agentController.checkIn);

router.get('/hosts', authMiddleware, agentController.getAgentHosts);

router.patch('/hosts/:agentId/reject', authMiddleware, agentController.rejectAgentHost);

router.patch('/hosts/:agentId/approve', authMiddleware, agentController.approveAgentHost);

router.delete('/hosts/:agentId', authMiddleware, agentController.deleteAgentHost);

module.exports = router;