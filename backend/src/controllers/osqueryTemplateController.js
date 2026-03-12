// backend/src/controllers/osqueryTemplateController.js
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Retorna todos os templates cadastrados.
 */
async function getAllTemplates(req, res) {
  try {
    const templates = await prisma.osqueryTemplate.findMany({
      orderBy: { title: 'asc' }
    });
    res.json(templates);
  } catch (error) {
    console.error('[OsqueryTemplateController] Erro ao buscar templates:', error);
    res.status(500).json({ error: 'Falha ao buscar templates do Osquery.' });
  }
}

/**
 * Cria um novo template.
 */
async function createTemplate(req, res) {
  const { title, sql, description } = req.body;
  if (!title || !sql) {
    return res.status(400).json({ error: 'Título e SQL são obrigatórios.' });
  }

  try {
    const template = await prisma.osqueryTemplate.create({
      data: { title, sql, description }
    });
    res.status(201).json(template);
  } catch (error) {
    console.error('[OsqueryTemplateController] Erro ao criar template:', error);
    res.status(500).json({ error: 'Falha ao criar template.' });
  }
}

/**
 * Atualiza um template existente.
 */
async function updateTemplate(req, res) {
  const { id } = req.params;
  const { title, sql, description } = req.body;

  try {
    const template = await prisma.osqueryTemplate.update({
      where: { id: parseInt(id) },
      data: { title, sql, description }
    });
    res.json(template);
  } catch (error) {
    console.error('[OsqueryTemplateController] Erro ao atualizar template:', error);
    res.status(500).json({ error: 'Falha ao atualizar template.' });
  }
}

/**
 * Exclui um template.
 */
async function deleteTemplate(req, res) {
  const { id } = req.params;

  try {
    await prisma.osqueryTemplate.delete({
      where: { id: parseInt(id) }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[OsqueryTemplateController] Erro ao excluir template:', error);
    res.status(500).json({ error: 'Falha ao excluir template.' });
  }
}

module.exports = {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
