import { Router } from "express";
import { SistemaController } from "../controllers/sistema.controller";

const sistemaRouter = Router();

sistemaRouter.get('/db-config',          SistemaController.getDbConfig);
sistemaRouter.post('/db-config/probar',  SistemaController.probarConexionBD);
sistemaRouter.post('/db-config/guardar', SistemaController.guardarDbConfig);
sistemaRouter.post('/actualizar',        SistemaController.actualizarApp);

export default sistemaRouter;
