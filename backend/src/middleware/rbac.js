// src/middleware/rbac.js

/**
 * Middleware fábrica para verificação Baseada em Grupo (RBAC).
 * Usado em combinação/logo após o middleware `authMiddleware.js`.
 * 
 * @param {string} requiredPermission O nome da coluna booleana de Módulo no Grupo. Ex: 'canCreateUsers'
 */
const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    // 1. Verifica se a conta não possui nenhum grupo ou o token veio faltando informações
    if (!req.user || !req.user.group) {
        return res.status(403).json({ 
            error: 'Acesso Negado.', 
            details: 'O usuário ativo não participa de nenhum Grupo de Acesso.' 
        });
    }

    // 2. Extrai o grupo do Payload decodificado do token JWT emitido no Login
    const userGroup = req.user.group;

    // 3. Bypass total para SuperAdministrator — God-Mode irrestrito
    if (userGroup?.name === 'SuperAdministrator') {
        return next();
    }

    // 4. Testa se a permissão requirida (ex: canViewSettings) é falsa ou não existe.
    if (!userGroup || !userGroup[requiredPermission]) {
        console.log(`[RBAC DEBUG] FAILED: User '${req.user.username}' lacks '${requiredPermission}'.`);
        return res.status(403).json({ 
            error: 'Permissão Insuficiente.', 
            details: `O seu Grupo Administrativo atual (${userGroup?.name || 'N/A'}) não possui autorização para a ação '${requiredPermission}'.` 
        });
    }

    // 5. Se a flag for verdadeira, segue o fluxo para o Controller 
    next();
  };
};

module.exports = requirePermission;
