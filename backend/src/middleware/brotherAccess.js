const { hasBrotherPermission } = require('../services/brotherPermissionsService');

function requireBrotherPermission(permission) {
  return (req, res, next) => {
    if (!hasBrotherPermission(req.user, permission)) return res.status(403).json({ message: 'Acesso restrito para esta permissao da Gestao de Irmaos.' });
    return next();
  };
}

function requireAnyBrotherPermission(...permissions) {
  return (req, res, next) => {
    if (!permissions.some((permission) => hasBrotherPermission(req.user, permission))) return res.status(403).json({ message: 'Acesso restrito para esta area da Gestao de Irmaos.' });
    return next();
  };
}

module.exports = { requireAnyBrotherPermission, requireBrotherPermission };
