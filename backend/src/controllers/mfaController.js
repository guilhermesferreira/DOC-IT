// Doc-IT/backend/src/controllers/mfaController.js
const prisma = require('../../prisma/prismaClient'); // Ajuste o caminho se necessário
const otplib = require('otplib');
const { encrypt, decrypt } = require('../utils/encryption'); // VOCÊ PRECISARÁ CRIAR ESTE UTILITÁRIO!
// const bcrypt = require('bcrypt'); // Para hashear códigos de recuperação

// Função para gerar e retornar segredo e QR Code URI para setup
async function generateMfaSecret(req, res) {
  const userId = req.user.id; // Assumindo que o usuário está logado para habilitar MFA
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const secret = otplib.authenticator.generateSecret();
    // NÃO SALVE O SEGREDO DIRETAMENTE AINDA. Guarde-o temporariamente ou
    // confie que o frontend o enviará de volta na etapa de verificação.
    // Para este exemplo, vamos retornar e esperar que o frontend o envie de volta.

    const otpauthUrl = otplib.authenticator.keyuri(
      user.email, // Ou user.username
      'Doc-IT',   // Nome do seu serviço/aplicação
      secret
    );

    // Guardar o segredo temporariamente para verificação (ex: em sessão, ou um campo temporário no usuário)
    // Ou, como faremos aqui, enviar para o front e esperar que ele retorne na verificação.
    // ATENÇÃO: Enviar o secret para o front e esperar ele de volta para verificação não é o ideal
    // para produção sem proteção adicional. O ideal é uma sessão ou token temporário.
    // Mas para simplificar o exemplo inicial:
    res.json({ otpauthUrl, secretKey: secret });

  } catch (error) {
    console.error("Erro ao gerar segredo MFA:", error);
    res.status(500).json({ error: 'Erro ao iniciar configuração MFA.' });
  }
}

// Função para verificar o token TOTP durante o setup e ativar MFA
async function verifyAndActivateMfa(req, res) {
  const userId = req.user.id;
  const { token, secret } = req.body; // 'secret' é o mfaSecret gerado no passo anterior

  if (!token || !secret) {
    return res.status(400).json({ error: 'Token e segredo são obrigatórios.' });
  }

  const isValid = otplib.authenticator.check(token, secret);

  if (isValid) {
    try {
      const encryptedSecret = encrypt(secret); // VOCÊ PRECISA IMPLEMENTAR encrypt()
      await prisma.user.update({
        where: { id: userId },
        data: { 
          mfaSecret: encryptedSecret, 
          isMfaEnabled: true 
        },
      });
      // Gerar e retornar códigos de recuperação aqui (omitido para brevidade)
      res.json({ message: 'MFA ativado com sucesso!', recoveryCodes: ["ABCDE-12345"] /* Exemplos */ });
    } catch (dbError) {
      console.error("Erro ao salvar segredo MFA:", dbError);
      res.status(500).json({ error: 'Erro ao ativar MFA.' });
    }
  } else {
    res.status(400).json({ error: 'Código MFA inválido.' });
  }
}

// Função para desativar o MFA
async function disableMfa(req, res) {
  const userId = req.user.id;
  const { mfaCode } = req.body;

  if (!mfaCode) {
    return res.status(400).json({ error: 'Código MFA é obrigatório.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isMfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ error: 'MFA não está habilitado ou usuário inválido.' });
    }

    const decryptedSecret = decrypt(user.mfaSecret);
    const isValid = otplib.authenticator.check(mfaCode, decryptedSecret);

    if (isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { isMfaEnabled: false, mfaSecret: null },
      });
      res.json({ message: 'MFA desativado com sucesso.' });
    } else {
      res.status(400).json({ error: 'Código MFA inválido.' });
    }
  } catch (error) {
    console.error("Erro ao desativar MFA:", error);
    res.status(500).json({ error: 'Erro interno ao desativar MFA.' });
  }
}

module.exports = { generateMfaSecret, verifyAndActivateMfa, disableMfa };

