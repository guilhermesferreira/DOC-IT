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

    // 1. Adicionar o Instalador Nativo do Agente
    const setupPath = path.join(basePath, 'updates', 'Doc-IT-Setup.exe');
    if (fs.existsSync(setupPath)) {
      zip.addLocalFile(setupPath);
    } else {
      console.warn(`Aviso: Arquivo de Setup não encontrado em ${setupPath}`);
    }

    // 3. (Removido) Certificados agora vão dentro do Setup.exe
    // 4. (Removido) config.json agora vai dentro do Setup.exe


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
