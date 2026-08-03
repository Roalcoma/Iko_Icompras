import { Request, Response } from 'express';
import { TriangulacionService } from '../services/triangulacion.service';

export class TriangulacionController {

    static async getPromos(_req: Request, res: Response): Promise<void> {
        res.json(await TriangulacionService.getPromos());
    }

    static async crearPromo(req: Request, res: Response): Promise<void> {
        const id = await TriangulacionService.crearPromo(req.body);
        res.json({ id });
    }

    static async actualizarPromo(req: Request, res: Response): Promise<void> {
        await TriangulacionService.actualizarPromo(Number(req.params.id), req.body);
        res.json({ ok: true });
    }

    static async eliminarPromo(req: Request, res: Response): Promise<void> {
        await TriangulacionService.eliminarPromo(Number(req.params.id));
        res.json({ ok: true });
    }

    static async crearEscala(req: Request, res: Response): Promise<void> {
        const id = await TriangulacionService.crearEscala(Number(req.params.idPromo), req.body);
        res.json({ id });
    }

    static async eliminarEscala(req: Request, res: Response): Promise<void> {
        await TriangulacionService.eliminarEscala(Number(req.params.id));
        res.json({ ok: true });
    }

    static async buscarProveedores(req: Request, res: Response): Promise<void> {
        res.json(await TriangulacionService.buscarProveedores(String(req.query.q ?? '')));
    }

    static async buscarMarcas(req: Request, res: Response): Promise<void> {
        res.json(await TriangulacionService.buscarMarcas(String(req.query.q ?? '')));
    }
}
