// Doc-IT/backend/src/utils/encryption.js
// Para produção, use uma biblioteca de criptografia robusta e gerenciamento de chaves adequado.
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
// IMPORTANTE: Esta chave DEVE ser armazenada de forma segura e NÃO hardcoded. Use variáveis de ambiente.
const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY //|| 'uma_chave_secreta_muito_longa_de_32_bytes!'; // 32 bytes
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };