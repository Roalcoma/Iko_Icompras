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

    static async actualizarApp(_req: Request, res: Response): Promise<void> {
        try {
            const resultado = await ejecutarActualizacion();
            res.json({ success: true, ...resultado });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Error al ejecutar la actualización',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }
}
