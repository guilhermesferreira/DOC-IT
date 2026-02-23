const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is missing in auth.js. Tokens cannot be verified.");
}

function authMiddleware(req, res, next) {
  // Lê o token diretamente do cookie injetado de forma segura pelo navegador
  const token = req.cookies?.token;

  if (!token) return res.status(401).json({ error: 'Token não fornecido ou cookie ausente' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
