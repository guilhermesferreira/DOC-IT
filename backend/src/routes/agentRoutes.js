// c:\Users\guilherme.ferreira\Desktop\Doc-IT\backend\src\routes\agentRoutes.js
const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/auth');
// A documentação Swagger precisará ser significativamente alterada ou movida.
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

// Apenas a rota de check-in do agente permanece aqui.
// A gestão de dispositivos originados por agentes (listar pendentes, aprovar, rejeitar, deletar)
// será tratada através das rotas de /devices, operando em entidades Device com source='agent'.
router.post('/check-in', agentController.checkIn);

module.exports = router;