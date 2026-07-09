import { Router } from 'express';
import { RuteroController } from '../controllers/rutero.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const ruteroRouter = Router();

ruteroRouter.get('/zonas',                     authMiddleware, RuteroController.getZonas);
ruteroRouter.get('/facturas',                  authMiddleware, RuteroController.getFacturas);
ruteroRouter.post('/crear',                    authMiddleware, RuteroController.crearRutero);
ruteroRouter.get('/ruteros',                   authMiddleware, RuteroController.getRuteros);
ruteroRouter.get('/ruteros/:id/facturas',      authMiddleware, RuteroController.getFacturasDeRutero);
ruteroRouter.get('/ruteros/picking/sesion',    authMiddleware, RuteroController.getMiSesionPicking);
ruteroRouter.get('/ruteros/:id/picking',       authMiddleware, RuteroController.getEstadoPicking);
ruteroRouter.post('/ruteros/:id/picking/iniciar', authMiddleware, RuteroController.iniciarPicking);
ruteroRouter.post('/ruteros/:id/picking/liberar', authMiddleware, RuteroController.liberarPicking);
ruteroRouter.post('/ruteros/:id/escanear',     authMiddleware, RuteroController.escanearCaja);
ruteroRouter.put('/ruteros/:id/confirmar',     authMiddleware, RuteroController.confirmarRutero);
ruteroRouter.put('/confirmar-factura',         authMiddleware, RuteroController.confirmarFacturaRutero);

export default ruteroRouter;
