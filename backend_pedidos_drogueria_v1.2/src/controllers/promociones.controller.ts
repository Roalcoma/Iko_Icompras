import { Request, Response } from "express";
import { PromocionesService } from "../services/promociones.service";

export class PromocionesController {

    static async getCamposDisponibles(_req: Request, res: Response): Promise<void> {
        res.status(200).json({ success: true, data: PromocionesService.getCamposDisponibles() });
    }

    // ---------- GRUPOS DE ARTICULOS ----------

    static async getGruposArticulos(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await PromocionesService.getGruposArticulos((search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async crearGrupoArticulos(req: Request, res: Response): Promise<void> {
        const { nombre, tipo, condiciones } = req.body;
        if (!nombre) { res.status(400).json({ success: false, message: 'Nombre requerido' }); return; }
        try {
            const id = await PromocionesService.crearGrupoArticulos(nombre, tipo || 'MANUAL', condiciones);
            res.status(201).json({ success: true, id });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al crear el grupo' });
        }
    }

    static async actualizarGrupoArticulos(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const { nombre, activo, tipo, condiciones } = req.body;
        try {
            await PromocionesService.actualizarGrupoArticulos(id, nombre, activo, tipo, condiciones);
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al actualizar el grupo' });
        }
    }

    static async getCondicionesGrupoArticulos(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const data = await PromocionesService.getCondicionesGrupoArticulos(idGrupo);
        res.status(200).json({ success: true, data });
    }

    static async getArticulosDeGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const { search, page, limit } = req.query;
        const result = await PromocionesService.getArticulosDeGrupo(idGrupo, (search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async agregarArticuloAGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const { codArticulo } = req.body;
        if (!codArticulo) { res.status(400).json({ success: false, message: 'codArticulo requerido' }); return; }
        try {
            await PromocionesService.agregarArticuloAGrupo(idGrupo, Number(codArticulo));
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al agregar artículo' });
        }
    }

    static async importarArticulosExcel(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        if (!req.file) { res.status(400).json({ success: false, message: 'Archivo requerido' }); return; }
        try {
            const resultado = await PromocionesService.importarArticulosExcel(idGrupo, req.file.buffer);
            res.status(200).json({ success: true, ...resultado });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al importar' });
        }
    }

    static async quitarArticuloDeGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const codArticulo = parseInt(req.params['codArticulo'] as string);
        try {
            await PromocionesService.quitarArticuloDeGrupo(idGrupo, codArticulo);
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al quitar artículo' });
        }
    }

    // ---------- GRUPOS DE CLIENTES ----------

    static async getGruposClientes(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await PromocionesService.getGruposClientes((search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async crearGrupoClientes(req: Request, res: Response): Promise<void> {
        const { nombre, tipo, condiciones } = req.body;
        if (!nombre) { res.status(400).json({ success: false, message: 'Nombre requerido' }); return; }
        try {
            const id = await PromocionesService.crearGrupoClientes(nombre, tipo || 'MANUAL', condiciones);
            res.status(201).json({ success: true, id });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al crear el grupo' });
        }
    }

    static async actualizarGrupoClientes(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const { nombre, activo, tipo, condiciones } = req.body;
        try {
            await PromocionesService.actualizarGrupoClientes(id, nombre, activo, tipo, condiciones);
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al actualizar el grupo' });
        }
    }

    static async getCondicionesGrupoClientes(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const data = await PromocionesService.getCondicionesGrupoClientes(idGrupo);
        res.status(200).json({ success: true, data });
    }

    static async getClientesDeGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const { search, page, limit } = req.query;
        const result = await PromocionesService.getClientesDeGrupo(idGrupo, (search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async agregarClienteAGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const { codCliente } = req.body;
        if (!codCliente) { res.status(400).json({ success: false, message: 'codCliente requerido' }); return; }
        try {
            await PromocionesService.agregarClienteAGrupo(idGrupo, Number(codCliente));
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al agregar cliente' });
        }
    }

    static async quitarClienteDeGrupo(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        const codCliente = parseInt(req.params['codCliente'] as string);
        try {
            await PromocionesService.quitarClienteDeGrupo(idGrupo, codCliente);
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al quitar cliente' });
        }
    }

    static async importarClientesExcel(req: Request, res: Response): Promise<void> {
        const idGrupo = parseInt(req.params['id'] as string);
        if (!req.file) { res.status(400).json({ success: false, message: 'Archivo requerido' }); return; }
        try {
            const resultado = await PromocionesService.importarClientesExcel(idGrupo, req.file.buffer);
            res.status(200).json({ success: true, ...resultado });
        } catch (error) {
            res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Error al importar' });
        }
    }

    // ---------- PROMOCIONES ----------

    static async getPromociones(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await PromocionesService.getPromociones((search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async crearPromocion(req: Request, res: Response): Promise<void> {
        try {
            const id = await PromocionesService.crearPromocion(req.body);
            res.status(201).json({ success: true, id });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al crear la promoción', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    static async actualizarPromocion(req: Request, res: Response): Promise<void> {
        try {
            const id = parseInt(req.params['id'] as string);
            await PromocionesService.actualizarPromocion(id, req.body);
            res.status(200).json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al actualizar la promoción', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    static async cambiarActivoPromocion(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const { activo } = req.body;
        await PromocionesService.cambiarActivoPromocion(id, !!activo);
        res.status(200).json({ success: true });
    }

    static async getVigentes(_req: Request, res: Response): Promise<void> {
        const data = await PromocionesService.getVigentes();
        res.status(200).json({ success: true, data });
    }
}
