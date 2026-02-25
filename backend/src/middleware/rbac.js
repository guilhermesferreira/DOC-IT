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
    
    // console.log(`[RBAC DEBUG] User: ${req.user.username}`);
    // console.log(`[RBAC DEBUG] Required: ${requiredPermission}`);
    // console.log(`[RBAC DEBUG] UserGroup object:`, userGroup);

    // 3. Testa se a permissão requirida (ex: canViewSettings) é falsa ou não existe.
    if (!userGroup || !userGroup[requiredPermission]) {
        console.log(`[RBAC DEBUG] FAILED: User '${req.user.username}' lacks '${requiredPermission}'.`);
        return res.status(403).json({ 
            error: 'Permissão Insuficiente.', 
            details: `O seu Grupo Administrativo atual (${userGroup?.name || 'N/A'}) não possui autorização para a ação '${requiredPermission}'.` 
        });
    }

    // 4. Se a flag for verdadeira, segue o fluxo para o Controller 
    // Console log ativo para fins de Log de Audit/Debug por segurança
    // console.log(`[RBAC AUDIT] O usuário '${req.user.username}' acessou operação protegida requerida por '${requiredPermission}'.`);
    next();
  };
};

module.exports = requirePermission;
