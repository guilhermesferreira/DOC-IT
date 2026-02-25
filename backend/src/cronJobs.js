const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Roda todos os dias às 03:00 da manhã
cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Iniciando rotina de limpeza de Logs de Auditoria...');
    try {
        const config = await prisma.auditConfig.findUnique({ where: { id: 1 } });
        if (!config || !config.retentionDays) {
            console.log('[Cron] Configuração de auditoria não encontrada ou sem dias de retenção definidos.');
            return;
        }

        const retentionDays = config.retentionDays;
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - retentionDays);

        const { count } = await prisma.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: limitDate // Menor que (older than) a data limite
                }
            }
        });

        console.log(`[Cron] Limpeza concluída: ${count} registros de auditoria mais antigos que ${retentionDays} dias foram apagados.`);
    } catch (error) {
        console.error('[Cron] Erro ao limpar logs de auditoria:', error);
    }
});

console.log('[Cron] Rotinas de limpeza diária agendadas com sucesso.');
