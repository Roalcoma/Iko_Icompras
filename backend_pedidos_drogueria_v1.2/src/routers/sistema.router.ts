import { Router } from "express";
import { SistemaController } from "../controllers/sistema.controller";
import { authMiddleware, adminMiddleware } from "../middleware/auth.middleware";

const sistemaRouter = Router();

// Admin
sistemaRouter.post('/inicializar-bd',     authMiddleware, adminMiddleware, SistemaController.inicializarBD);
sistemaRouter.get('/db-config',           authMiddleware, adminMiddleware, SistemaController.getDbConfig);
sistemaRouter.post('/db-config/probar',   authMiddleware, adminMiddleware, SistemaController.probarConexionBD);
sistemaRouter.post('/db-config/guardar',  authMiddleware, adminMiddleware, SistemaController.guardarDbConfig);
sistemaRouter.post('/actualizar',         authMiddleware, adminMiddleware, SistemaController.actualizarApp);

export default sistemaRouter;
