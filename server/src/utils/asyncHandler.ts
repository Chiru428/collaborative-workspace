import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export const sendServerError = (res: Response, error: unknown, context = 'Request failed') => {
  logger.error(context, error);
  if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
};

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Payload too large' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Invalid JSON' });
    return;
  }
  sendServerError(res, err, 'Unhandled error');
};
