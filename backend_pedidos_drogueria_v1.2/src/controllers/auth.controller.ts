import { Request, Response } from 'express';
import { AuthService, MODULOS_SISTEMA } from '../services/auth.service';
import { RequestConUsuario } from '../middleware/auth.middleware';

export class AuthController {

    // LOGIN
    static async login(req: Request, res: Response): Promise<void> {
        const { clave } = req.body;
        if (!clave) {
            res.status(400).json({ success: false, message: 'Clave requerida' });
            return;
        }
        const result = await AuthService.login(clave);
        res.status(result.success ? 200 : 401).json(result);
    }

    // ME — refresca modulos desde BD
    static async me(req: RequestConUsuario, res: Response): Promise<void> {
        if (!req.usuario) {
            res.status(401).json({ success: false, message: 'No autenticado' });
            return;
        }
        try {
            const modulos = await AuthService.getModulosDeUsuario(req.usuario.id);
            res.status(200).json({
                success: true,
                usuario: { ...req.usuario, modulos }
            });
        } catch {
            res.status(500).json({ success: false, message: 'Error al obtener sesión' });
        }
    }

    // Lista todos los módulos del sistema
    static async getModulos(_req: Request, res: Response): Promise<void> {
        res.status(200).json({ success: true, modulos: MODULOS_SISTEMA });
    }

    // BACKOFFICE — lista usuarios (solo admin)
    static async getUsuarios(_req: RequestConUsuario, res: Response): Promise<void> {
        try {
            const usuarios = await AuthService.getUsuarios();
            res.status(200).json({ success: true, usuarios });
        } catch {
            res.status(500).json({ success: false, message: 'Error al obtener usuarios' });
        }
    }

    // Actualizar visibilidad numerica de un usuario
    static async actualizarVisibilidad(req: RequestConUsuario, res: Response): Promise<void> {
        const id          = parseInt(req.params['id'] as string);
        const visibilidad = parseInt(req.body.visibilidad);

        if (isNaN(id) || isNaN(visibilidad) || visibilidad < 0 || visibilidad > 8191) {
            res.status(400).json({ success: false, message: 'Visibilidad debe ser un número entre 0 y 8191' });
            return;
        }
        try {
            await AuthService.actualizarVisibilidad(id, visibilidad);
            res.status(200).json({ success: true, message: 'Visibilidad actualizada' });
        } catch {
            res.status(500).json({ success: false, message: 'Error al actualizar visibilidad' });
        }
    }

    // Actualizar código de vendedor de un usuario
    static async actualizarCodVendedor(req: RequestConUsuario, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const codVendedor = req.body.codVendedor;
        if (isNaN(id)) {
            res.status(400).json({ success: false, message: 'ID inválido' });
            return;
        }
        try {
            const cod = codVendedor === null || codVendedor === '' ? null : parseInt(codVendedor);
            await AuthService.actualizarCodVendedor(id, cod);
            res.status(200).json({ success: true, message: 'Código de vendedor actualizado' });
        } catch {
            res.status(500).json({ success: false, message: 'Error al actualizar código de vendedor' });
        }
    }

    // Cambiar clave de un usuario (encripta con algoritmo ICG)
    static async cambiarPassword(req: RequestConUsuario, res: Response): Promise<void> {
        const id       = parseInt(req.params['id'] as string);
        const { nuevaClave } = req.body as { nuevaClave: string };

        if (!nuevaClave) {
            res.status(400).json({ success: false, message: 'La nueva clave es requerida' });
            return;
        }
        try {
            await AuthService.actualizarClave(id, nuevaClave);
            res.status(200).json({ success: true, message: 'Clave actualizada correctamente' });
        } catch {
            res.status(500).json({ success: false, message: 'Error al actualizar la clave' });
        }
    }
}
