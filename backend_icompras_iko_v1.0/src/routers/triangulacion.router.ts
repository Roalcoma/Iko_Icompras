import { Router } from 'express';
import { TriangulacionController } from '../controllers/triangulacion.controller';

const router = Router();

router.get('/',                          TriangulacionController.getPromos);
router.post('/',                         TriangulacionController.crearPromo);
router.put('/:id',                       TriangulacionController.actualizarPromo);
router.delete('/:id',                    TriangulacionController.eliminarPromo);
router.post('/:idPromo/escalas',         TriangulacionController.crearEscala);
router.delete('/escalas/:id',            TriangulacionController.eliminarEscala);
router.get('/buscar/proveedores',        TriangulacionController.buscarProveedores);
router.get('/buscar/marcas',             TriangulacionController.buscarMarcas);

export default router;
