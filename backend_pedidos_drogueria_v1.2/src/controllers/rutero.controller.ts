import { Request, Response } from 'express';
import { RuteroService } from '../services/rutero.service';
import { RequestConUsuario } from '../middleware/auth.middleware';

export class RuteroController {

    static async getZonas(_req: Request, res: Response): Promise<void> {
        try {
            const zonas = await RuteroService.getZonas();
            res.json({ success: true, data: zonas });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener zonas', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getFacturas(req: Request, res: Response): Promise<void> {
        const zona = (req.query.zona as string || '').trim();
        if (!zona) { res.status(400).json({ success: false, message: 'zona requerida' }); return; }
        try {
            const data = await RuteroService.getFacturas(zona);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener facturas', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async crearRutero(req: Request, res: Response): Promise<void> {
        const { codruta, nombreRuta, facturas } = req.body;
        if (!codruta || !Array.isArray(facturas) || !facturas.length) {
            res.status(400).json({ success: false, message: 'codruta y facturas requeridos' }); return;
        }
        try {
            const result = await RuteroService.crearRutero(Number(codruta), String(nombreRuta ?? ''), facturas);
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al crear rutero', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getRuteros(req: Request, res: Response): Promise<void> {
        const codruta       = req.query.codruta       ? Number(req.query.codruta)             : undefined;
        const buscarNumero  = req.query.buscarNumero  ? String(req.query.buscarNumero).trim()  : undefined;
        const buscarFactura = req.query.buscarFactura ? String(req.query.buscarFactura).trim() : undefined;
        const buscarPedido  = req.query.buscarPedido  ? String(req.query.buscarPedido).trim()  : undefined;
        const page          = req.query.page          ? Number(req.query.page)                 : 1;
        const limit         = req.query.limit         ? Number(req.query.limit)                : 15;
        try {
            const { data, total } = await RuteroService.getRuteros(codruta, buscarNumero, buscarFactura, buscarPedido, page, limit);
            res.json({ success: true, data, total });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener ruteros', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getFacturasDeRutero(req: Request, res: Response): Promise<void> {
        const id = Number(req.params.id);
        try {
            const data = await RuteroService.getFacturasDeRutero(id);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener facturas del rutero', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async confirmarFacturaRutero(req: Request, res: Response): Promise<void> {
        const { idrutero, numserie, numfactura, fechaEntrega } = req.body;
        if (!idrutero || !numserie || !numfactura) {
            res.status(400).json({ success: false, message: 'idrutero, numserie y numfactura requeridos' }); return;
        }
        try {
            await RuteroService.confirmarFacturaRutero(Number(idrutero), String(numserie), Number(numfactura), fechaEntrega ? String(fechaEntrega) : undefined);
            res.json({ success: true, message: 'Factura confirmada' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al confirmar factura', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getEstadoPicking(req: Request, res: Response): Promise<void> {
        const id = Number(req.params.id);
        try {
            const data = await RuteroService.getEstadoPicking(id);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener estado de picking', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async escanearCaja(req: RequestConUsuario, res: Response): Promise<void> {
        const id      = Number(req.params.id);
        const barcode = String(req.body.barcode ?? '').trim();
        const usuario = req.usuario?.usuario ?? '';
        if (!barcode) { res.status(400).json({ success: false, message: 'barcode requerido' }); return; }
        try {
            const result = await RuteroService.escanearCaja(id, barcode, usuario);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al escanear caja', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async iniciarPicking(req: RequestConUsuario, res: Response): Promise<void> {
        const id      = Number(req.params.id);
        const usuario = req.usuario?.usuario ?? '';
        try {
            const result = await RuteroService.iniciarPicking(id, usuario);
            res.json({ success: result.ok, bloqueadoPor: result.bloqueadoPor });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al iniciar picking', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async liberarPicking(req: RequestConUsuario, res: Response): Promise<void> {
        const id      = Number(req.params.id);
        const usuario = req.usuario?.usuario ?? '';
        try {
            await RuteroService.liberarPicking(id, usuario);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al liberar picking', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getMiSesionPicking(req: RequestConUsuario, res: Response): Promise<void> {
        const usuario = req.usuario?.usuario ?? '';
        try {
            const data = await RuteroService.getMiSesionPicking(usuario);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener sesión', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async escanearCajaGlobal(req: RequestConUsuario, res: Response): Promise<void> {
        const barcode = String(req.body.barcode ?? '').trim();
        const usuario = req.usuario?.usuario ?? '';
        if (!barcode) { res.status(400).json({ success: false, message: 'barcode requerido' }); return; }
        try {
            const result = await RuteroService.escanearCajaGlobal(barcode, usuario);
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al escanear caja', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async getRegistroPicking(req: RequestConUsuario, res: Response): Promise<void> {
        const usuario = req.usuario?.usuario ?? '';
        try {
            const data = await RuteroService.getRegistroPicking(usuario);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener registro', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async iniciarViajeSession(req: RequestConUsuario, res: Response): Promise<void> {
        const usuario    = req.usuario?.usuario ?? '';
        const claveAdmin = req.body?.claveAdmin;
        try {
            const result = await RuteroService.iniciarViajeSession(usuario, claveAdmin);
            res.json({ success: result.ok, requireAdminKey: result.requireAdminKey, message: result.message, marcados: result.marcados });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al iniciar viaje', error: error instanceof Error ? error.message : String(error) });
        }
    }

    static async confirmarRutero(req: Request, res: Response): Promise<void> {
        const id = Number(req.params.id);
        try {
            await RuteroService.confirmarRutero(id);
            res.json({ success: true, message: 'Rutero confirmado como entregado' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al confirmar rutero', error: error instanceof Error ? error.message : String(error) });
        }
    }
}
