// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const mfaController = require('../controllers/mfaController');
const authenticateToken = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Endpoints para registro e login de usuários
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra um novo usuário
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *                 example: guilherme
 *               password:
 *                 type: string
 *                 example: senha123
 *               email:
 *                 type: string
 *                 format: email
 *                 example: guilherme@example.com
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuário criado com sucesso.
 *                 userId:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: Falta algum campo obrigatório
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Erro interno ao criar usuário
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Realiza login do usuário
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: guilherme
 *               password:
 *                 type: string
 *                 example: senha123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
  *         oneOf: # Indica que a resposta pode ser uma das seguintes
 *           - description: Login bem-sucedido, MFA não habilitado ou já verificado. Retorna token.
 *             content:
 *               application/json:
 *                 schema:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJndWls...
 *           - description: MFA é necessário para este usuário.
 *             content:
 *               application/json:
 *                 schema:
 *                   type: object
 *                   properties:
 *                     mfaRequired:
 *                       type: boolean
 *                       example: true
 *                     userId:
 *                       type: integer
 *                       example: 1
 *       400:
 *         description: Parâmetros inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Usuário ou senha inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *               examples: # Adicionado no nível correto
 *                 InvalidCredentials: # Nome do exemplo
 *                 summary: Exemplo de credenciais inválidas # Descrição opcional do exemplo
 *                 value: { "error": "Usuário ou senha inválidos" } # O valor do exemplo
 *       500:
 *         description: Erro interno no login
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Mensagem de erro aqui
 */



/**
 * @swagger
 * tags:
 *   name: Mfa
 *   description: Endpoints para gerenciamento da Autenticação de Múltiplos Fatores (MFA)
 */

/**
 * @swagger
 * /auth/mfa/verify-mfa:
 *   post:
 *     summary: Verifica o código MFA durante o processo de login
 *     tags: [Mfa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - mfaCode
 *             properties:
 *               userId:
 *                 type: integer
 *                 example:  1
 *               mfaCode:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Código MFA válido, token de sessão retornado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Dados ausentes (userId ou mfaCode)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Código MFA inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description:  Erro interno na verificação MFA
 *         content:
 *           application/json:
 *             schema:
 *              $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * @swagger
 * /auth/mfa/status-mfa:
 *   get:
 *     summary: Verifica se o MFA está habilitado para o usuário autenticado
 *     tags: [Mfa]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status do MFA
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Token inválido ou não fornecido
 *       500:
 *         description: Erro interno ao verificar status do MFA
 */

/**
 * @swagger
 * /auth/mfa/generate-secret:
 *   post:
 *     summary: Inicia o processo de configuração do MFA, gerando um segredo e QR Code URI
 *     tags: [Mfa]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Segredo MFA e URI do QR Code gerados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 otpauthUrl:
 *                   type: string
 *                   example: otpauth://totp/Doc-IT:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Doc-IT
 *                 secretKey:
 *                   type: string
 *                   example: JBSWY3DPEHPK3PXP
 *       401:
 *         description: Token inválido ou não fornecido
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno ao gerar segredo MFA
 *         content:
 *           application/json:
 *             schema:
 *              $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /auth/mfa/verify-setup:
 *   post:
 *     summary: Verifica o código TOTP e ativa o MFA para o usuário autenticado
 *     tags: [Mfa]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - secret
 *             properties:
 *               token:
 *                 type: string
 *                 example: 123456
 *               secret:
 *                 type: string
 *                 example: JBSWY3DPEHPK3PXP # O segredo gerado na etapa anterior
 *     responses:
 *       200:
 *         description: MFA ativado com sucesso, retorna códigos de recuperação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'MFA ativado com sucesso!' }
 *                 recoveryCodes: { type: array, items: { type: string }, example: ["ABCDE-12345", "FGHIJ-67890"] }
 *       400: { description: Código MFA inválido ou dados ausentes }
 *       401: { description: Token inválido ou não fornecido }
 *       500: { description: Erro interno ao ativar MFA }
 */

/**
 * @swagger
 * /auth/mfa/disable:
 *   post:
 *     summary: Desativa o MFA para o usuário autenticado
 *     tags: [Mfa]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mfaCode
 *             properties:
 *               mfaCode:
 *                 type: string
 *                 example: "123456"
 *                 description: O código MFA atual do usuário.
 *     responses:
 *       200:
 *         description: MFA desativado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: MFA desativado com sucesso.
 *       400:
 *         description: Código MFA inválido ou ausente, ou MFA não estava ativo.
 *       401:
 *         description: Token inválido ou não fornecido.
 *       500:
 *         description: Erro interno ao desativar MFA.
 */


router.post('/register', authController.register);

router.post('/login', authController.login);

router.post('/mfa/verify-mfa', authController.verifyMfaLogin);

router.post('/mfa/generate-secret', authenticateToken, mfaController.generateMfaSecret);

router.post('/mfa/verify-setup', authenticateToken, mfaController.verifyAndActivateMfa);

router.get('/mfa/status-mfa', authenticateToken, authController.getMfaStatus);

router.post('/mfa/disable', authenticateToken, mfaController.disableMfa);

module.exports = router;
  