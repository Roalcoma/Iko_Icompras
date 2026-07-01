import { Request, Response } from "express";
import { ReclamosService } from "../services/reclamos.service";

export class ReclamosController {

    static async crear(req: Request, res: Response): Promise<void> {
        const { codCliente, numSerie, numFactura, reclamo } = req.body;
        if (!codCliente || !reclamo || !reclamo.trim()) {
            res.status(400).json({ success: false, message: 'Cliente y reclamo son requeridos' });
            return;
        }
        try {
            const id = await ReclamosService.crear(Number(codCliente), numSerie || null, numFactura || null, reclamo.trim());
            res.status(201).json({ success: true, id });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al guardar el reclamo', error: error instanceof Error ? error.message : 'Error desconocido' });
        }
    }

    static async getReclamos(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query;
        const result = await ReclamosService.getReclamos((search as string) || '', Number(page) || 1, Number(limit) || 10);
        res.status(200).json({ success: true, ...result });
    }

    static async getFacturasDeCliente(req: Request, res: Response): Promise<void> {
        const codCliente = parseInt(req.params['codCliente'] as string);
        const data = await ReclamosService.getFacturasDeCliente(codCliente);
        res.status(200).json({ success: true, data });
    }
}
