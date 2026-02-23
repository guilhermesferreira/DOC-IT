const prisma = require('../../prisma/prismaClient');

// --- PARA OS AGENTES (Leitura) ---
// Rota utilitária que os agentes chamam para saber o ritmo deles
exports.getAgentSettings = async (req, res) => {
  try {
    let settings = await prisma.globalSettings.findFirst();
    
    // Se ainda não existir no banco, cria o registro inicial padrão
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: {
          inventoryIntervalMinutes: 60,
          updateCheckIntervalMinutes: 120
        }
      });
    }
    
    // Retorna apenas os campos necessários pro Agente
    res.json({
      inventoryIntervalMinutes: settings.inventoryIntervalMinutes,
      updateCheckIntervalMinutes: settings.updateCheckIntervalMinutes
    });
  } catch (error) {
    console.error("Erro ao buscar configurações para o agente:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// --- PARA O DASHBOARD REACT (Leitura e Escrita) ---
exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.globalSettings.findFirst();
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: {
          inventoryIntervalMinutes: 60,
          updateCheckIntervalMinutes: 120
        }
      });
    }
    res.json(settings);
  } catch (error) {
    console.error("Erro ao carregar configurações do painel:", error);
    res.status(500).json({ message: "Erro ao buscar configurações." });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { inventoryIntervalMinutes, updateCheckIntervalMinutes } = req.body;

    // Validação básica
    if (inventoryIntervalMinutes < 1 || updateCheckIntervalMinutes < 1) {
      return res.status(400).json({ message: "Os intervalos devem ser maiores que 0." });
    }

    let settings = await prisma.globalSettings.findFirst();
    
    if (settings) {
      settings = await prisma.globalSettings.update({
        where: { id: settings.id },
        data: {
          inventoryIntervalMinutes: parseInt(inventoryIntervalMinutes),
          updateCheckIntervalMinutes: parseInt(updateCheckIntervalMinutes)
        }
      });
    } else {
      settings = await prisma.globalSettings.create({
        data: {
          inventoryIntervalMinutes: parseInt(inventoryIntervalMinutes),
          updateCheckIntervalMinutes: parseInt(updateCheckIntervalMinutes)
        }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error);
    res.status(500).json({ message: "Erro ao salvar configurações." });
  }
};
