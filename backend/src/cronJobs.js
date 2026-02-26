const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

/**
 * Inicializa todas as rotinas agendadas (cron jobs).
 * Recebe o `server` HTTPS para poder fazer hot-reload de certs.
 * @param {import('https').Server} httpsServer
 */
module.exports = function initCronJobs(httpsServer) {

  // ─── Job 1: Limpeza de Logs de Auditoria (03:00) ────────────────────────
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
            lt: limitDate
          }
        }
      });

      console.log(`[Cron] Limpeza concluída: ${count} registros de auditoria mais antigos que ${retentionDays} dias foram apagados.`);
    } catch (error) {
      console.error('[Cron] Erro ao limpar logs de auditoria:', error);
    }
  });

  // ─── Job 2: Verificação de Expiração do server.crt (03:30) ──────────────
  cron.schedule('30 3 * * *', () => {
    console.log('[Cron] Verificando expiração do certificado do servidor...');
    try {
      const certService = require('./services/certService');
      const certsDir = path.join(__dirname, '..', 'certs');
      const serverCertPath = path.join(certsDir, 'server.crt');

      const daysLeft = certService.getCertExpiryDays(serverCertPath);
      console.log(`[Cron] server.crt expira em ${daysLeft} dias.`);

      if (daysLeft < 30) {
        console.log('[Cron] Certificado do servidor expira em menos de 30 dias. Renovando...');

        const newCerts = certService.renewServerCert();

        // Hot-reload do TLS sem reiniciar o processo
        if (httpsServer && typeof httpsServer.setSecureContext === 'function') {
          httpsServer.setSecureContext({
            key: newCerts.keyPem,
            cert: newCerts.certPem,
            ca: newCerts.caPem,
          });
          console.log('[Cron] Hot-reload do certificado TLS realizado com sucesso! Zero downtime.');
        } else {
          console.log('[Cron] AVISO: Não foi possível fazer hot-reload. Reinicie o servidor manualmente para aplicar o novo certificado.');
        }
      } else {
        console.log(`[Cron] server.crt OK — ${daysLeft} dias restantes.`);
      }
    } catch (error) {
      console.error('[Cron] Erro ao verificar/renovar server.crt:', error);
    }
  });

  console.log('[Cron] Rotinas agendadas: limpeza de auditoria (03:00) e verificação de cert (03:30).');
};
