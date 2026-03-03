const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const authMiddleware = require('../middleware/auth');

// Rota protegida para baixar o pacote do agente
router.get('/agent-bundle', authMiddleware, (req, res) => {
  try {
    const zip = new AdmZip();
    const basePath = path.join(__dirname, '..', '..');

    // 1. Adicionar o executável do Agente (se existir)
    const agentPath = path.join(basePath, 'updates', 'Doc-IT-agent.exe');
    if (fs.existsSync(agentPath)) {
      zip.addLocalFile(agentPath);
    } else {
      console.warn(`Aviso: Arquivo do Agente não encontrado em ${agentPath}`);
    }

    // 2. Adicionar o updater do Agente (se existir)
    const updaterPath = path.join(basePath, 'updates', 'Doc-IT-updater.exe');
    if (fs.existsSync(updaterPath)) {
      zip.addLocalFile(updaterPath);
    } else {
      console.warn(`Aviso: Arquivo do Updater não encontrado em ${updaterPath}`);
    }

    // 3. Adicionar o Certificado Raiz da CA
    const caPath = path.join(basePath, 'certs', 'ca.crt');
    if (fs.existsSync(caPath)) {
      // Cria a pasta "certs" dentro do ZIP e coloca o CA lá dentro,
      // ou apenas coloca na raiz dependendo de como o agente espera
      // O agente espera: ./certs/ca.crt, ./certs/agent.key, ./certs/agent.crt
      zip.addLocalFile(caPath, "certs"); 
    } else {
      console.warn(`Aviso: Certificado CA não encontrado em ${caPath}`);
    }

    // 4. Gerar o config.json e adicionar ao ZIP
    // Tenta identificar o hostname do servidor ou usa o que veio na requisição
    const serverHostname = req.hostname || 'localhost'; 
    const isSecure = req.secure || process.env.NODE_ENV === 'production';
    const protocol = isSecure ? 'https' : 'http';
    const port = process.env.PORT || 3000;
    
    // Opcional: Se houver uma variável de ambiente que defina a URL pública externa do Backend
    const serverUrl = process.env.EXTERNAL_API_URL || `${protocol}://${serverHostname}:${port}`;

    const configData = {
      server_base_url: serverUrl,
      log_level: "INFO"
    };

    // Adiciona o config.json direto da memória (Buffer)
    zip.addFile("config.json", Buffer.from(JSON.stringify(configData, null, 4), "utf8"));

    // Prepara o ZIP em memória e envia
    const zipBuffer = zip.toBuffer();

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="Doc-IT-Agent-Bundle.zip"',
      'Content-Length': zipBuffer.length
    });

    res.send(zipBuffer);

  } catch (error) {
    console.error("Erro ao gerar ZIP do Agente:", error);
    res.status(500).json({ error: "Falha ao gerar o pacote do Agente." });
  }
});

module.exports = router;
