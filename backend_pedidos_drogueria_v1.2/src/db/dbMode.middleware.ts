import { Request, Response, NextFunction } from 'express';
import { dbModeContext } from '../db/db.conection';

export function dbModeMiddleware(req: Request, res: Response, next: NextFunction): void {
    const modoPruebas = req.headers['x-modo-pruebas'] === 'true';
    dbModeContext.run({ modoPruebas }, () => next());
}