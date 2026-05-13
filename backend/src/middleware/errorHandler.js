function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const isValidationError = error.name === 'ZodError';
  const status = isValidationError ? 400 : error.status || error.statusCode || 500;
  const payload = {
    message: status === 500 ? 'Erro interno no servidor.' : error.message
  };

  if (isValidationError) payload.issues = error.issues;

  if (process.env.NODE_ENV !== 'production' && status === 500) {
    payload.detail = error.message;
  }

  return res.status(status).json(payload);
}

module.exports = errorHandler;
