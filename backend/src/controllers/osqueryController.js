// backend/src/controllers/osqueryController.js
'use strict';

const osqueryService = require('../services/osqueryService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Retorna as versões do Osquery no GitHub + a versão ativa no banco.
 */
async function getVersions(req, res) {
  try {
    const releases = await osqueryService.getLatestReleases();
    const settings = await prisma.globalSettings.findFirst();
    
    res.json({
      releases,
      activeVersion: settings?.selectedOsqueryVersion || 'latest'
    });
  } catch (error) {
    console.error('[OsqueryController] Erro ao buscar versões:', error);
    res.status(500).json({ error: 'Falha ao buscar versões do Osquery.' });
  }
}

/**
 * Dispara o download e extração de uma versão.
 */
async function syncVersion(req, res) {
  const { version } = req.body;
  if (!version) return res.status(400).json({ error: 'Versão é obrigatória.' });

  try {
    const result = await osqueryService.syncVersion(version);
    res.json(result);
  } catch (error) {
    console.error(`[OsqueryController] Erro ao sincronizar versão ${version}:`, error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Define qual versão será distribuída para os agentes.
 */
async function selectVersion(req, res) {
  const { version } = req.body;
  if (!version) return res.status(400).json({ error: 'Versão é obrigatória.' });

  try {
    // Atualiza (ou cria) as configurações globais
    const settings = await prisma.globalSettings.findFirst();
    if (settings) {
      await prisma.globalSettings.update({
        where: { id: settings.id },
        data: { selectedOsqueryVersion: version }
      });
    } else {
      await prisma.globalSettings.create({
        data: { selectedOsqueryVersion: version }
      });
    }

    res.json({ success: true, selectedOsqueryVersion: version });
  } catch (error) {
    console.error('[OsqueryController] Erro ao selecionar versão:', error);
    res.status(500).json({ error: 'Falha ao salvar seleção.' });
  }
}

module.exports = {
  getVersions,
  syncVersion,
  selectVersion
};
