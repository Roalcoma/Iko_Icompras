import { Router } from "express";
import { EcommerceController } from "../controllers/ecommerce.controller";
import { authMiddleware, adminMiddleware } from "../middleware/auth.middleware";

const ecommerceRouter = Router();

ecommerceRouter.use(authMiddleware);

ecommerceRouter.get('/config',          adminMiddleware, EcommerceController.getConfig);
ecommerceRouter.put('/config',          adminMiddleware, EcommerceController.setConfig);
ecommerceRouter.post('/escanear',       adminMiddleware, EcommerceController.escanearAhora);
ecommerceRouter.get('/pedidos',         EcommerceController.getPedidos);
ecommerceRouter.get('/pedidos/:id/lineas', EcommerceController.getLineas);
ecommerceRouter.patch('/pedidos/:id/procesado', EcommerceController.marcarProcesado);

export default ecommerceRouter;
