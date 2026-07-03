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
sistemaRouter.get('/seq-pedidos',         authMiddleware, adminMiddleware, SistemaController.getSeqPedidos);
sistemaRouter.post('/seq-pedidos',        authMiddleware, adminMiddleware, SistemaController.setSeqPedidos);
sistemaRouter.get('/psicotropicos',       authMiddleware, adminMiddleware, SistemaController.getDptoPsicotropicos);
sistemaRouter.post('/psicotropicos',      authMiddleware, adminMiddleware, SistemaController.guardarDptoPsicotropicos);
sistemaRouter.get('/tarifa-catalogo',     authMiddleware, adminMiddleware, SistemaController.getTarifaCatalogo);
sistemaRouter.post('/tarifa-catalogo',    authMiddleware, adminMiddleware, SistemaController.guardarTarifaCatalogo);

export default sistemaRouter;
