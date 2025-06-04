// Doc-IT/backend/src/controllers/authController.js
const prisma = require('../../prisma/prismaClient');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { decrypt } = require('../utils/encryption'); // Para descriptografar mfaSecret
const otplib = require('otplib'); // Para verificar o token mfa

const JWT_SECRET = process.env.JWT_SECRET || 'troque_esta_chave';

async function register(req, res) {
  const { username, password, email } = req.body;
  // CORREÇÃO: Validação do email também e sem duplicar !password
  if (!username || !password || !email ) { 
    return res.status(400).json({ error: 'Usuário, email e senha são obrigatórios.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword },
    });
    res.status(201).json({ message: 'Usuário criado com sucesso.', userId: user.id });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);  // <<< log do erro
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    // DEBUG: Ver o objeto user completo e o campo isMfaEnabled
    console.log('--- User Object Fetched During Login ---');
    console.log(user); // Log do objeto user completo
    if (user) {
      console.log(`User: ${user.username}, Raw isMfaEnabled: ${user.isMfaEnabled}, Type: ${typeof user.isMfaEnabled}`);
    }
    // --- Fim do DEBUG ---

    if (!user) {
      console.log(`Login attempt for non-existent user: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log(`Login attempt with invalid password for user: ${username}`);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }

    // Verificação explícita se isMfaEnabled é estritamente true (booleano)
    if (user.isMfaEnabled === true) { 
      console.log(`MFA IS ENABLED for user: ${username}. Requiring MFA step.`);
      return res.json({ mfaRequired: true, userId: user.id });
    } else {
      console.log(`MFA IS NOT ENABLED (or value is not strictly true) for user: ${username} (isMfaEnabled: ${user.isMfaEnabled}). Issuing token directly.`);
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token });
    }   
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: 'Erro no login' });
  }
}

// Nova função para verificar o código MFA durante o login
async function verifyMfaLogin(req, res) {
  const { userId, mfaCode } = req.body;

  if (!userId || !mfaCode) {
    return res.status(400).json({ error: 'ID do usuário e código MFA são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } }); 
    if (!user || !user.isMfaEnabled || !user.mfaSecret) {
      return res.status(401).json({ error: 'MFA não habilitado ou usuário inválido.' });
    }

    const decryptedSecret = decrypt(user.mfaSecret); 
    const isValid = otplib.authenticator.check(mfaCode, decryptedSecret);

    if (isValid) {
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Código MFA inválido.' });
    }
  } catch (error) {
    console.error("Erro ao verificar MFA no login:", error);
    res.status(500).json({ error: 'Erro interno na verificação MFA.' });
  }
}

module.exports = { register, login, verifyMfaLogin };