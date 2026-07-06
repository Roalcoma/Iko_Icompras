import { Router } from "express";
import { PedidosControllers } from "../controllers/pedidos.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const pedidosRouter = Router()

pedidosRouter.post('/reservar-numero', PedidosControllers.reservarNumero)

pedidosRouter.post('/', PedidosControllers.postPedidos)

pedidosRouter.get('/', PedidosControllers.getPedidos)

pedidosRouter.put('/', PedidosControllers.updatePedido)

pedidosRouter.delete('/', PedidosControllers.deletePedido)

pedidosRouter.put('/status', authMiddleware, PedidosControllers.updatePedidoStatus)

pedidosRouter.put('/aprobar-psicotropico', authMiddleware, PedidosControllers.aprobarPsicotropico)

pedidosRouter.get('/conteo', PedidosControllers.getConteo)

pedidosRouter.get('/auditoria', authMiddleware, PedidosControllers.getAuditoria)

export default pedidosRouter