import { Request, Response } from "express";
import { EcommerceService } from "../services/ecommerce.service";

export class EcommerceController {

    static async getConfig(req: Request, res: Response): Promise<void> {
        const ruta = await EcommerceService.getConfig();
        res.json({ success: true, ruta });
    }

    static async setConfig(req: Request, res: Response): Promise<void> {
        const { ruta } = req.body;
        if (typeof ruta !== 'string') { res.status(400).json({ success: false, message: 'Ruta requerida' }); return; }
        await EcommerceService.setConfig(ruta.trim());
        res.json({ success: true, message: 'Configuración guardada' });
    }

    static async getPedidos(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await EcommerceService.getPedidos(
            (search as string) || '', Number(page) || 1, Number(limit) || 10
        );
        res.json({ success: true, ...result });
    }

    static async getLineas(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const data = await EcommerceService.getLineas(id);
        res.json({ success: true, data });
    }

    static async marcarProcesado(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        const { procesado } = req.body;
        await EcommerceService.marcarProcesado(id, procesado !== false);
        res.json({ success: true });
    }

    static async escanearAhora(_req: Request, res: Response): Promise<void> {
        const result = await EcommerceService.escanearCarpeta();
        res.json({ success: true, ...result });
    }

    static async aprobarPedido(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string);
        try {
            const result = await EcommerceService.aprobarPedido(id);
            res.status(result.success ? 200 : 400).json(result);
        } catch (e: any) {
            res.status(500).json({ success: false, message: e.message ?? 'Error al aprobar pedido' });
        }
    }
}
