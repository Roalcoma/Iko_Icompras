import { Router } from "express";
import { ReclamosController } from "../controllers/reclamos.controller";

const reclamosRouter = Router();

reclamosRouter.get('/', ReclamosController.getReclamos);
reclamosRouter.post('/', ReclamosController.crear);
reclamosRouter.get('/facturas/:codCliente', ReclamosController.getFacturasDeCliente);

export default reclamosRouter;
