export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', `No existe ${req.method} ${req.path}`));
}

// Middleware central: siempre responde JSON { error: { code, message, ...details } }.
export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }
  if (res.headersSent) return;
  if (err.details?.retryAfter) res.setHeader('Retry-After', String(err.details.retryAfter));
  res.status(status).json({
    error: {
      code: err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: status === 500 ? 'Error interno del servidor' : err.message,
      ...(status < 500 && err.details ? err.details : {}),
    },
  });
}
