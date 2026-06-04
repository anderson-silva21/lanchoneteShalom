const { logRequestError } = require('./requestLogger');

function getSqliteErrorResponse(error) {
  if (typeof error.code !== 'string' || !error.code.startsWith('SQLITE_CONSTRAINT')) return null;

  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' && /products\.internal_code/.test(error.message)) {
    return {
      status: 409,
      message: 'Codigo interno ja cadastrado.'
    };
  }

  return {
    status: 400,
    message: 'Dados violam uma regra do banco de dados.'
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const isValidationError = error.name === 'ZodError';
  const sqliteResponse = getSqliteErrorResponse(error) || {};
  const isJsonSyntaxError = error.type === 'entity.parse.failed';
  const status = isValidationError ? 400 : sqliteResponse.status || error.status || error.statusCode || 500;
  const payload = {
    message: sqliteResponse.message || (isJsonSyntaxError ? 'JSON invalido.' : (status === 500 ? 'Erro interno no servidor.' : error.message)),
    requestId: req.id
  };

  if (isValidationError) payload.issues = error.issues;

  if (process.env.NODE_ENV !== 'production' && status === 500) {
    payload.detail = error.message;
  }

  logRequestError(error, req, status, {
    responseMessage: payload.message,
    issues: isValidationError ? error.issues : undefined
  });

  return res.status(status).json(payload);
}

module.exports = errorHandler;
