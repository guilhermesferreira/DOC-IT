// c:\Users\guilherme.ferreira\Desktop\Doc-IT\backend\src\controllers\agentController.js
const prisma = require('../../prisma/prismaClient');

async function checkIn(req, res) {
  const { agentId, hostname, osUsername, ipAddress, agentVersion, guiVersion, osInfo, additionalData } = req.body;

  // Força o mTLS para o Agente (certificado válido assinado pela nossa CA)
  const isDirectMTLS = req.socket.authorized;
  
  // Segurança: Previne spoofing do cabeçalho 'x-ssl-client-verify' 
  // Aceita o cabeçalho apenas se a requisição vier do próprio servidor (onde o Nginx roda local).
  const internalIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const isProxyMTLS = req.headers['x-ssl-client-verify'] === 'SUCCESS' && internalIps.includes(req.socket.remoteAddress || req.ip);

  // Em ambiente sem Nginx, isDirectMTLS será true se o Python bater direto no Node.js
  // Em ambiente com Nginx, o Node.js perde o req.socket (pois o Nginx faz o bypass),
  // então dependemos do cabeçalho que o próprio Nginx validou e anexou à requisição.
  if (!isDirectMTLS && !isProxyMTLS) {
    console.log('Tentativa de check-in de agente recusada: Certificado inválido ou ausente.');
    return res.status(401).json({
      error: 'Acesso não autorizado. Certificado de cliente válido é obrigatório.',
    });
  }

  if (!agentId || !hostname || !osUsername) {
    return res.status(400).json({
      error: 'agentId, hostname e osUsername são obrigatórios.',
    });
  }

  try {
    const now = new Date();
    let device;
    let message;
    let httpStatus = 200; // Default to 200 OK

    const existingDevice = await prisma.device.findUnique({ // Changed from agentHost
      where: { agentId: agentId }, // Query by agentId in the Device model
    });

    if (existingDevice) {
      // Device (agent) already exists, update its information and lastSeenAt
      device = await prisma.device.update({ // Changed from agentHost
        where: { agentId: agentId },
        data: {
          hostname,
          osUsername,
          ipAddress,
          agentVersion,
          guiVersion,
          osInfo,
          additionalData,
          lastSeenAt: now,
          // O status não é alterado aqui pelo agente
        },
      });
          message = `Check-in do agente ${agentId} (${hostname}). Informações atualizadas. Status atual: ${device.status}.`;
    } else {
      // Agente não existe, cria um novo com status 'pending' 
      device = await prisma.device.create({
        data: {
          agentId: agentId,
          hostname,
          name: hostname,
          osUsername,
          ipAddress,
          agentVersion,
          guiVersion,
          osInfo,
          type: osInfo ? `SO: ${osInfo.substring(0,50)}` : 'Descoberto por Agente',
          location: 'Detectado via Agente',
          additionalData,
          status: 'pending',
          source: 'agent',
          createdAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      message = `Novo agente ${agentId} (${hostname}) registrado. Aguardando aprovação. Status: ${device.status}.`;
      httpStatus = 201; // 201 Created para novo recurso
    }

    res.status(httpStatus).json({
      status: device.status,
      agentId: device.agentId, // Return agentId
      deviceId: device.id,     // Return the database ID of the device
      message: message,
      tamperEnabled: device.tamperEnabled || false,
      tamperPassword: device.tamperPassword || null
    });


  } catch (error) {
    console.error('Erro durante o check-in do agente:', error);
        // Check for unique constraint violation on agentId if create fails after findUnique misses
    if (error.code === 'P2002' && error.meta?.target?.includes('agentId')) {
        return res.status(409).json({ error: 'Conflito: agentId já existe. O agente pode ter se registrado momentos antes.' });
    }
    res.status(500).json({ error: 'Falha ao processar o check-in do agente.' });
  }
}

// Retorna as informações da última versão e seus Hashes SHA-256
async function getVersion(req, res) {
  try {
    const fs = require('fs');
    const path = require('path');
    const versionPath = path.join(__dirname, '..', '..', 'updates', 'version.json');
    
    if (fs.existsSync(versionPath)) {
      const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return res.json(versionData);
    } else {
      return res.status(404).json({ error: 'Nenhuma atualização disponível.' });
    }
  } catch (error) {
    console.error('Erro ao ler versão do agente:', error);
    res.status(500).json({ error: 'Erro interno ao consultar versão.' });
  }
}

// Serve os arquivos executáveis do update .exe
async function downloadUpdate(req, res) {
  try {
    const { file } = req.params;
    const path = require('path');
    const fs = require('fs');

    // Segurança: Previne Path Traversal
    // O nome do arquivo não pode conter diretórios (ex: '../server.key') e deve ser .exe
    if (!file || path.basename(file) !== file || !file.endsWith('.exe')) {
      return res.status(403).json({ error: 'Arquivo não autorizado.' });
    }

    const updatesDir = path.join(__dirname, '..', '..', 'updates');
    const filePath = path.join(updatesDir, file);

    // Verificação extra: caminho resolvido deve estar dentro da pasta updates
    if (!filePath.startsWith(updatesDir + path.sep) && filePath !== updatesDir) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }

    res.download(filePath);
  } catch (error) {
    console.error('Erro ao baixar arquivo do agente:', error);
    res.status(500).json({ error: 'Erro interno ao iniciar o download.' });
  }
}

// Serve o binário do Osquery para o agente (Protegido por mTLS)
async function downloadOsquery(req, res) {
  try {
    const { version } = req.params;
    const path = require('path');
    const fs = require('fs');
    const crypto = require('crypto');

    // Força mTLS para o Agente
    const isDirectMTLS = req.socket.authorized;
    const internalIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const isProxyMTLS = req.headers['x-ssl-client-verify'] === 'SUCCESS' && internalIps.includes(req.socket.remoteAddress || req.ip);

    if (!isDirectMTLS && !isProxyMTLS) {
      console.warn(`[mTLS] Acesso negado para /osquery/${version}. Motivo: ${req.socket.authorizationError || 'Nenhum certificado enviado'}`);
      return res.status(401).json({ error: 'Acesso negado. Certificado mTLS válido é obrigatório.' });
    }

    // Segurança: Previne Path Traversal
    if (!version || path.basename(version) !== version) {
      return res.status(400).json({ error: 'Formato de versão inválido.' });
    }

    const versionsDir = path.join(__dirname, '..', '..', 'updates', 'osquery', 'versions');
    const filePath = path.join(versionsDir, version, 'osqueryi.exe');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Binário não encontrado para esta versão.' });
    }

    // Calcula Hash em tempo real para o agente validar a integridade
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex');

    res.header('X-Osquery-Hash', hex);
    res.download(filePath);
  } catch (error) {
    console.error('Erro ao servir Osquery para o agente:', error);
    res.status(500).json({ error: 'Erro interno ao iniciar o download.' });
  }
}

const certService = require('../services/certService');

// ─── Enrollment Inicial (Sem mTLS, o agente ainda não possui certificado) ───

async function enrollAgent(req, res) {
  const { agentId, csr, hostname, osUsername } = req.body;

  if (!agentId || !csr || !hostname) {
    return res.status(400).json({ error: 'agentId, hostname e csr são obrigatórios.' });
  }

  try {
    // 1. Verifica ou cria o dispositivo no estado pending
    let device = await prisma.device.findUnique({ where: { agentId } });
    const now = new Date();

    if (!device) {
      device = await prisma.device.create({
        data: {
          agentId,
          hostname,
          name: hostname,
          osUsername: osUsername || 'Desconhecido',
          type: 'Descoberto por Agente (Enroll)',
          location: 'Detectado via Enrollment',
          status: 'pending',
          source: 'agent',
          createdAt: now,
          firstSeenAt: now,
          lastSeenAt: now,
        },
      });
      console.log(`[Enrollment] Novo agente registrado: ${agentId}`);
    } else {
      await prisma.device.update({
        where: { agentId },
        data: { lastSeenAt: now }
      });
      console.log(`[Enrollment] Agente existente solicitando cert: ${agentId}`);
    }

    // 2. Assina o CSR usando a CA do servidor
    const newCertPem = certService.signAgentCsr(csr);
    console.log(`[Enrollment] Certificado forjado e assinado para ${agentId}`);

    // Retorna o certificado para o agente salvar
    res.json({ cert: newCertPem, message: 'Enrollment bem-sucedido.' });

  } catch (error) {
    console.error('Erro geral no enrollment do agente:', error);
    res.status(500).json({ error: 'Falha grave no processo de enrollment.' });
  }
}

// ─── Renovação de Certificado (mTLS obrigatório — cert ainda válido) ────────

async function renewCert(req, res) {
  const { agentId, csr } = req.body;

  // Exige mTLS (igual ao check-in)
  const isDirectMTLS = req.socket.authorized;
  const internalIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const isProxyMTLS = req.headers['x-ssl-client-verify'] === 'SUCCESS' && internalIps.includes(req.socket.remoteAddress || req.ip);

  if (!isDirectMTLS && !isProxyMTLS) {
    return res.status(401).json({ error: 'Certificado de cliente válido é obrigatório para renovação.' });
  }

  if (!agentId || !csr) {
    return res.status(400).json({ error: 'agentId e csr são obrigatórios.' });
  }

  try {
    // Verifica que o agente existe e está aprovado
    const device = await prisma.device.findUnique({ where: { agentId } });
    if (!device || device.status !== 'approved') {
      return res.status(403).json({ error: 'Agente não encontrado ou não aprovado.' });
    }

    const newCertPem = certService.signAgentCsr(csr);
    console.log(`[Agent] Cert renovado para agente ${agentId}`);
    res.json({ cert: newCertPem });
  } catch (error) {
    console.error('Erro ao renovar cert do agente:', error);
    res.status(500).json({ error: 'Falha ao assinar o CSR.' });
  }
}

// ─── Solicitação de Emergência (sem mTLS — cert expirado) ───────────────────

async function emergencyCertRequest(req, res) {
  const { agentId } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId é obrigatório.' });
  }

  try {
    const device = await prisma.device.findUnique({ where: { agentId } });

    if (!device) {
      return res.status(404).json({ error: 'Agente não cadastrado no sistema.' });
    }

    if (device.status !== 'approved') {
      return res.status(403).json({ error: 'Agente não está aprovado. Contate o administrador.' });
    }

    // Marca o dispositivo como pendente de renovação de cert
    await prisma.device.update({
      where: { agentId },
      data: { certRenewalPending: true },
    });

    console.log(`[Agent] Solicitação de emergência de cert recebida para agente ${agentId}`);
    res.json({ message: 'Solicitação de renovação registrada. Aguarde aprovação do administrador.' });
  } catch (error) {
    console.error('Erro na solicitação de emergência de cert:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

// ─── Endpoint público para o ca.crt ────────────────────────────────────────

function getCaCert(req, res) {
  try {
    const caPem = certService.getCaCertPem();
    res.type('application/x-pem-file').send(caPem);
  } catch (error) {
    console.error('Erro ao servir ca.crt:', error);
    res.status(500).json({ error: 'Erro ao ler o certificado CA.' });
  }
}

// As funções getAgentHosts, approveAgentHost, rejectAgentHost, deleteAgentHost
// foram movidas e adaptadas para o deviceController.js
module.exports = { checkIn, getVersion, downloadUpdate, downloadOsquery, renewCert, emergencyCertRequest, getCaCert, enrollAgent };