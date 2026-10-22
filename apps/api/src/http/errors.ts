import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ConflictError, ForbiddenError, NotFoundError } from '../db/records.js';

export function notFoundRoute(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

// Express 5 forwards rejected promises from async handlers here.
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof ForbiddenError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong on our side' });
}
