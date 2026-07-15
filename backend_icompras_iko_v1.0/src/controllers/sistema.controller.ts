import { Request, Response } from "express";
import { getDbConfigPublica, guardarDbConfig } from "../services/dbconfig.service";
import { reconectarDb, probarConexion }        from "../db/db.conection";
import { ejecutarActualizacion }               from "../services/actualizador.service";

export class SistemaController {

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
            const { server, user, password, dbName, esquema, port,
                    githubZipUrl, nssmServicioBackend, nssmServicioFrontend,
                    intervaloEscaneo } = req.body;
            const cfg: any = {};
            if (server)                                     cfg.server = server;
            if (user)                                       cfg.user   = user;
            if (dbName)                                     cfg.dbName = dbName;
            if (esquema)                                    cfg.esquema = esquema;
            if (port)                                       cfg.port   = Number(port);
            if (password && password !== '••••••••')        cfg.password = password;
            if (githubZipUrl   !== undefined)               cfg.githubZipUrl   = githubZipUrl;
            if (nssmServicioBackend  !== undefined)         cfg.nssmServicioBackend  = nssmServicioBackend;
            if (nssmServicioFrontend !== undefined)         cfg.nssmServicioFrontend = nssmServicioFrontend;
            if (intervaloEscaneo    !== undefined)          cfg.intervaloEscaneo = Math.max(5, Number(intervaloEscaneo));

            guardarDbConfig(cfg);
            if (server || user || password || dbName) await reconectarDb();

            res.json({ success: true, message: 'Configuración guardada.' });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Error desconocido',
            });
        }
    }

    static async actualizarApp(_req: Request, res: Response): Promise<void> {
        try {
            const resultado = await ejecutarActualizacion();
            res.status(resultado.success ? 200 : 500).json(resultado);
        } catch (error) {
            res.status(500).json({
                success: false,
                mensaje: 'Error inesperado al ejecutar la actualización',
                error: error instanceof Error ? error.message : 'Error desconocido',
                log: [],
            });
        }
    }
}
