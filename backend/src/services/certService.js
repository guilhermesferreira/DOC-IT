// backend/src/services/certService.js
// Gerencia toda a lógica de PKI: assinar CSRs dos agentes e renovar o server.crt
// Usa node-forge (JS pura, sem dependência do OpenSSL no PATH)

'use strict';

const forge = require('node-forge');
const fs   = require('fs');
const path = require('path');

const CERTS_DIR = path.join(__dirname, '..', '..', 'certs');

// ─── Helpers internos ───────────────────────────────────────────────────────

function _loadCert(filePath) {
  const pem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.certificateFromPem(pem);
}

function _loadPrivateKey(filePath) {
  const pem = fs.readFileSync(filePath, 'utf8');
  return forge.pki.privateKeyFromPem(pem);
}

/**
 * Extrai os SANs (Subject Alternative Names) de um certificado forge.
 * @returns {Array<{type:number, value:string, ip?:string}>}
 */
function _getSansFromCert(cert) {
  const altNames = [];
  try {
    const ext = cert.extensions.find(e => e.name === 'subjectAltName');
    if (ext && ext.altNames) {
      return ext.altNames; // já no formato esperado pelo forge
    }
  } catch (_) { /* sem SANs */ }
  return altNames;
}

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * Retorna os dias restantes até a expiração de um certificado.
 * @param {string} certPath - Caminho absoluto para o .crt
 * @returns {number} dias restantes (negativo se já expirou)
 */
function getCertExpiryDays(certPath) {
  try {
    const cert   = _loadCert(certPath);
    const now    = new Date();
    const expiry = cert.validity.notAfter;
    const diffMs = expiry.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch (err) {
    console.error(`[CertService] Erro ao ler cert ${certPath}:`, err.message);
    return -1;
  }
}

/**
 * Assina um CSR enviado por um agente, gerando um novo certificado cliente.
 * @param {string} csrPem       – CSR em formato PEM
 * @param {number} validityDays – Validade em dias (padrão: 365)
 * @returns {string}            – Novo certificado em PEM
 */
function signAgentCsr(csrPem, validityDays = 365) {
  const caCert = _loadCert(path.join(CERTS_DIR, 'ca.crt'));
  const caKey  = _loadPrivateKey(path.join(CERTS_DIR, 'ca.key'));

  const csr = forge.pki.certificationRequestFromPem(csrPem);
  if (!csr.verify()) {
    throw new Error('Assinatura do CSR inválida.');
  }

  const cert = forge.pki.createCertificate();
  cert.publicKey    = csr.publicKey;
  cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));

  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + validityDays);

  cert.setSubject(csr.subject.attributes);
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', clientAuth: true },
  ]);

  cert.sign(caKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

/**
 * Regenera o server.crt preservando os SANs do cert atual e a chave existente.
 * Salva em disco e retorna os PEMs para hot-reload via setSecureContext().
 * @param {number} validityDays – Validade em dias (padrão: 730 = 2 anos)
 * @returns {{ keyPem: string, certPem: string, caPem: string }}
 */
function renewServerCert(validityDays = 730) {
  const serverCertPath = path.join(CERTS_DIR, 'server.crt');
  const serverKeyPath  = path.join(CERTS_DIR, 'server.key');
  const caCertPath     = path.join(CERTS_DIR, 'ca.crt');
  const caKeyPath      = path.join(CERTS_DIR, 'ca.key');

  const existingCert = _loadCert(serverCertPath);
  const serverKey    = _loadPrivateKey(serverKeyPath);
  const caCert       = _loadCert(caCertPath);
  const caKey        = _loadPrivateKey(caKeyPath);

  // Preserva os SANs do certificado atual
  const currentSans = _getSansFromCert(existingCert);

  // Cria novo certificado com a mesma key e SANs
  const newCert = forge.pki.createCertificate();
  newCert.publicKey    = forge.pki.setRsaPublicKey(serverKey.n, serverKey.e);
  newCert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(16));

  newCert.validity.notBefore = new Date();
  newCert.validity.notAfter  = new Date();
  newCert.validity.notAfter.setDate(newCert.validity.notAfter.getDate() + validityDays);

  // Copia subject do cert antigo
  newCert.setSubject(existingCert.subject.attributes);
  newCert.setIssuer(caCert.subject.attributes);

  const extensions = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
  ];

  if (currentSans.length > 0) {
    extensions.push({ name: 'subjectAltName', altNames: currentSans });
  }

  newCert.setExtensions(extensions);
  newCert.sign(caKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(newCert);

  // Backup do cert antigo e salva o novo
  const backupPath = serverCertPath + '.bak';
  if (fs.existsSync(serverCertPath)) {
    fs.copyFileSync(serverCertPath, backupPath);
  }
  fs.writeFileSync(serverCertPath, certPem, 'utf8');

  console.log(`[CertService] server.crt renovado com sucesso. Backup em ${backupPath}`);

  return {
    keyPem:  fs.readFileSync(serverKeyPath, 'utf8'),
    certPem: certPem,
    caPem:   fs.readFileSync(caCertPath, 'utf8'),
  };
}

/**
 * Retorna o conteúdo do ca.crt para distribuição pública.
 * @returns {string} PEM do CA
 */
function getCaCertPem() {
  return fs.readFileSync(path.join(CERTS_DIR, 'ca.crt'), 'utf8');
}

module.exports = {
  getCertExpiryDays,
  signAgentCsr,
  renewServerCert,
  getCaCertPem,
};
