import { Router } from 'express';
import { PedidosCtrlController } from '../controllers/pedidosCtrl.controller';

const router = Router();

router.get('/',                       PedidosCtrlController.getPedidos);
router.get('/:orderId/lineas',        PedidosCtrlController.getLineas);
router.post('/:orderId/autorizar',    PedidosCtrlController.autorizar);
router.delete('/:orderId',            PedidosCtrlController.eliminar);

export default router;
