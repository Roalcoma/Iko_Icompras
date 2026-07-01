import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const authRouter = Router();

// Publico
authRouter.post('/login', AuthController.login);

// Sesion activa
authRouter.get('/me',      authMiddleware, AuthController.me);
authRouter.get('/modulos', authMiddleware, AuthController.getModulos);

// BackOffice — solo administradores
authRouter.get('/usuarios',                    authMiddleware, adminMiddleware, AuthController.getUsuarios);
authRouter.patch('/usuarios/:id/visibilidad',  authMiddleware, adminMiddleware, AuthController.actualizarVisibilidad);
authRouter.patch('/usuarios/:id/password',     authMiddleware, adminMiddleware, AuthController.cambiarPassword);
authRouter.patch('/usuarios/:id/codvendedor',  authMiddleware, adminMiddleware, AuthController.actualizarCodVendedor);

export default authRouter;
