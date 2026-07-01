import { Router } from "express";
import { PedidosControllers } from "../controllers/pedidos.controller";

const pedidosRouter = Router()

pedidosRouter.post('/reservar-numero', PedidosControllers.reservarNumero)

pedidosRouter.post('/', PedidosControllers.postPedidos)

pedidosRouter.get('/', PedidosControllers.getPedidos)

pedidosRouter.put('/', PedidosControllers.updatePedido)

pedidosRouter.delete('/', PedidosControllers.deletePedido)

pedidosRouter.put('/status', PedidosControllers.updatePedidoStatus)

pedidosRouter.put('/aprobar-psicotropico', PedidosControllers.aprobarPsicotropico)

pedidosRouter.get('/auditoria', PedidosControllers.getAuditoria)

export default pedidosRouter