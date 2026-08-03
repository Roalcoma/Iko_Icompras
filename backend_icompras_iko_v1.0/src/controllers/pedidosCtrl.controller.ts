import { Request, Response } from 'express';
import { PedidosCtrlService } from '../services/pedidosCtrl.service';

export class PedidosCtrlController {

    static async getPedidos(req: Request, res: Response): Promise<void> {
        const search  = String(req.query.search  ?? '');
        const page    = Number(req.query.page    ?? 1);
        const limit   = Number(req.query.limit   ?? 50);
        const estatus = String(req.query.estatus ?? 'TODOS');
        res.json(await PedidosCtrlService.getPedidos(search, page, limit, estatus));
    }

    static async getLineas(req: Request, res: Response): Promise<void> {
        res.json(await PedidosCtrlService.getLineas(String(req.params.orderId)));
    }

    static async autorizar(req: Request, res: Response): Promise<void> {
        await PedidosCtrlService.autorizar(String(req.params.orderId));
        res.json({ ok: true });
    }

    static async eliminar(req: Request, res: Response): Promise<void> {
        await PedidosCtrlService.eliminar(String(req.params.orderId));
        res.json({ ok: true });
    }
}
