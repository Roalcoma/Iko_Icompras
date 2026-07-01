import { Router } from "express";
import multer from "multer";
import { PromocionesController } from "../controllers/promociones.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const promocionesRouter = Router();

promocionesRouter.get('/vigentes', PromocionesController.getVigentes);
promocionesRouter.get('/campos-disponibles', PromocionesController.getCamposDisponibles);

promocionesRouter.get('/grupos-articulos', PromocionesController.getGruposArticulos);
promocionesRouter.post('/grupos-articulos', PromocionesController.crearGrupoArticulos);
promocionesRouter.put('/grupos-articulos/:id', PromocionesController.actualizarGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/condiciones', PromocionesController.getCondicionesGrupoArticulos);
promocionesRouter.get('/grupos-articulos/:id/articulos', PromocionesController.getArticulosDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/articulos', PromocionesController.agregarArticuloAGrupo);
promocionesRouter.delete('/grupos-articulos/:id/articulos/:codArticulo', PromocionesController.quitarArticuloDeGrupo);
promocionesRouter.post('/grupos-articulos/:id/importar-excel', upload.single('archivo'), PromocionesController.importarArticulosExcel);

promocionesRouter.get('/grupos-clientes', PromocionesController.getGruposClientes);
promocionesRouter.post('/grupos-clientes', PromocionesController.crearGrupoClientes);
promocionesRouter.put('/grupos-clientes/:id', PromocionesController.actualizarGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/condiciones', PromocionesController.getCondicionesGrupoClientes);
promocionesRouter.get('/grupos-clientes/:id/clientes', PromocionesController.getClientesDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/clientes', PromocionesController.agregarClienteAGrupo);
promocionesRouter.delete('/grupos-clientes/:id/clientes/:codCliente', PromocionesController.quitarClienteDeGrupo);
promocionesRouter.post('/grupos-clientes/:id/importar-excel', upload.single('archivo'), PromocionesController.importarClientesExcel);

promocionesRouter.get('/', PromocionesController.getPromociones);
promocionesRouter.post('/', PromocionesController.crearPromocion);
promocionesRouter.put('/:id', PromocionesController.actualizarPromocion);
promocionesRouter.patch('/:id/activo', PromocionesController.cambiarActivoPromocion);

export default promocionesRouter;
