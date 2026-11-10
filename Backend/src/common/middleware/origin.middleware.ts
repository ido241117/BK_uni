import { NextFunction, Request, Response } from 'express';
import { buildError } from '../dto/api-response.dto';

export function originMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      res.status(403).json(buildError('Nguồn yêu cầu không được phép.'));
      return;
    }
    next();
  };
}
