import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export interface RequestConUsuario extends Request {
    usuario?: { id: number; usuario: string; es_admin: boolean; visibilidad?: number };
}

export function authMiddleware(req: RequestConUsuario, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'Token de autenticación requerido' });
        return;
    }

    const token = authHeader.split(' ')[1];
    const payload = AuthService.verifyToken(token);

    if (!payload) {
        res.status(401).json({ success: false, message: 'Token inválido o expirado' });
        return;
    }

    req.usuario = payload;
    next();
}

export function adminMiddleware(req: RequestConUsuario, res: Response, next: NextFunction): void {
    if (!req.usuario?.es_admin) {
        res.status(403).json({ success: false, message: 'Acceso restringido a administradores' });
        return;
    }
    next();
}
