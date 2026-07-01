import { Router } from "express";
import { ClientesController } from "../controllers/clientes.controller";

const clientesRouter = Router()

clientesRouter.get('/paginado', ClientesController.getClientesPaginado)
clientesRouter.patch('/:codCliente/descuento', ClientesController.actualizarDescuentoGlobal)
clientesRouter.get('/', ClientesController.getClientes)
clientesRouter.get('/riesgo', ClientesController.getRiesgo)
clientesRouter.post('/riesgo-masivo', ClientesController.getRiesgoMasivo)

export default clientesRouter