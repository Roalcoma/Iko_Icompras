import { Request, Response } from "express";
import { AuthService }       from "../services/auth.service";
import { PromocionesService } from "../services/promociones.service";
import { PedidosServices }   from "../services/pedidos.service";
import { ReclamosService }   from "../services/reclamos.service";
import { EcommerceService }  from "../services/ecommerce.service";
import { getDbConfigPublica, guardarDbConfig } from "../services/dbconfig.service";
import { reconectarDb, probarConexion }        from "../db/db.conection";
import { reconectarDbGeneral }                 from "../db/db.general.conection";
import { ejecutarActualizacion }               from "../services/actualizador.service";

export class SistemaController {

    static async inicializarBD(_req: Request, res: Response): Promise<void> {
        try {
            await AuthService.initTablas();
            await PromocionesService.initTablas();
            await PedidosServices.initTablas();
            await ReclamosService.initTablas();
            await EcommerceService.initTablas();
            res.status(200).json({
                success: true,
                message: 'Base de datos inicializada: tablas y columnas de la app verificadas/creadas correctamente.'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error al inicializar la base de datos',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }

    static async getDbConfig(_req: Request, res: Response): Promise<void> {
        res.json({ success: true, config: getDbConfigPublica() });
    }

    static async probarConexionBD(req: Request, res: Response): Promise<void> {
        const { server, user, password, dbName, port } = req.body;
        if (!server || !user || !dbName) {
            res.status(400).json({ success: false, message: 'server, user y dbName son requeridos' });
            return;
        }
        const resultado = await probarConexion({ server, user, password, dbName, port });
        res.json({ success: resultado.ok, message: resultado.mensaje });
    }

    static async guardarDbConfig(req: Request, res: Response): Promise<void> {
        try {
            const { server, user, password, dbName, dbGeneralName, dbPruebas, esquema, port } = req.body;
            if (!server || !user || !dbName || !dbGeneralName) {
                res.status(400).json({ success: false, message: 'server, user, dbName y dbGeneralName son requeridos' });
                return;
            }
            // Solo guardar password si se envió uno nuevo (no el placeholder)
            const cfg: any = { server, user, dbName, dbGeneralName, esquema: esquema || 'dbo', port: Number(port) || 1433 };
            if (password && password !== '••••••••') cfg.password = password;
            if (dbPruebas) cfg.dbPruebas = dbPruebas;

            guardarDbConfig(cfg);

            // Reconectar con la nueva config
            await reconectarDb();
            await reconectarDbGeneral();

            res.json({ success: true, message: 'Configuración guardada y conexiones restablecidas.' });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error al guardar configuración',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }

    static async getSeqPedidos(_req: Request, res: Response): Promise<void> {
        const ultimoId = await PedidosServices.getSeq();
        res.json({ success: true, ultimoId, siguiente: ultimoId + 1 });
    }

    static async setSeqPedidos(req: Request, res: Response): Promise<void> {
        const { ultimoId } = req.body;
        if (!Number.isInteger(Number(ultimoId)) || Number(ultimoId) < 0) {
            res.status(400).json({ success: false, message: 'ultimoId debe ser un entero >= 0' });
            return;
        }
        await PedidosServices.setSeq(Number(ultimoId));
        res.json({ success: true, message: `Secuencia actualizada. El próximo pedido será #${Number(ultimoId) + 1}` });
    }

    static async getDptoPsicotropicos(_req: Request, res: Response): Promise<void> {
        const cfg = getDbConfigPublica() as any;
        res.json({ success: true, dptoPsicotropicos: cfg.dptoPsicotropicos ?? 9 });
    }

    static async guardarDptoPsicotropicos(req: Request, res: Response): Promise<void> {
        const { dptoPsicotropicos } = req.body;
        if (!Number.isInteger(Number(dptoPsicotropicos)) || Number(dptoPsicotropicos) <= 0) {
            res.status(400).json({ success: false, message: 'dptoPsicotropicos debe ser un entero positivo' });
            return;
        }
        guardarDbConfig({ dptoPsicotropicos: Number(dptoPsicotropicos) } as any);
        res.json({ success: true, message: `Departamento de psicotrópicos actualizado a ${dptoPsicotropicos}` });
    }

    static async getTarifaCatalogo(_req: Request, res: Response): Promise<void> {
        const cfg = getDbConfigPublica() as any;
        res.json({ success: true, tarifaBaseCatalogo: cfg.tarifaBaseCatalogo ?? 2 });
    }

    static async guardarTarifaCatalogo(req: Request, res: Response): Promise<void> {
        const { tarifaBaseCatalogo } = req.body;
        if (!Number.isInteger(Number(tarifaBaseCatalogo)) || Number(tarifaBaseCatalogo) <= 0) {
            res.status(400).json({ success: false, message: 'tarifaBaseCatalogo debe ser un entero positivo' });
            return;
        }
        guardarDbConfig({ tarifaBaseCatalogo: Number(tarifaBaseCatalogo) } as any);
        res.json({ success: true, message: `Tarifa base del catálogo actualizada a ${tarifaBaseCatalogo}` });
    }

    static async actualizarApp(_req: Request, res: Response): Promise<void> {
        try {
            const resultado = await ejecutarActualizacion();
            res.status(resultado.success ? 200 : 500).json(resultado);
        } catch (error) {
            // No debería llegar aquí — ejecutarActualizacion ya captura sus errores internamente
            res.status(500).json({
                success: false,
                mensaje: 'Error inesperado al ejecutar la actualización',
                error: error instanceof Error ? error.message : 'Error desconocido',
                log: [],
            });
        }
    }
}
