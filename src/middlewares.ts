import { NextFunction, Request, Response } from 'express';

import { ErrorResponse } from './types/ErrorResponse';

export function notFound(req: Request, res: Response, next: NextFunction) {
  res.status(404);
  next(new Error(`404 Not Found - ${req.originalUrl}`));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ErrorResponse>,
) {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);
  res.json({
    statusCode,
    message: err.message,
    isOperational: true,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });
}
