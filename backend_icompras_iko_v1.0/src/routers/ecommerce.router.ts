import { Router } from "express";
import { EcommerceController } from "../controllers/ecommerce.controller";

const ecommerceRouter = Router();

ecommerceRouter.get('/config',                  EcommerceController.getConfig);
ecommerceRouter.put('/config',                  EcommerceController.setConfig);
ecommerceRouter.post('/escanear',               EcommerceController.escanearAhora);
ecommerceRouter.get('/pedidos',                 EcommerceController.getPedidos);
ecommerceRouter.get('/pedidos/:id/lineas',      EcommerceController.getLineas);
ecommerceRouter.patch('/pedidos/:id/procesado', EcommerceController.marcarProcesado);
ecommerceRouter.post('/pedidos/:id/aprobar',    EcommerceController.aprobarPedido);

export default ecommerceRouter;
