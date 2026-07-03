import fs from 'fs';
import path from 'path';
import 'dotenv/config';

export interface DbConfig {
    server:              string;
    user:                string;
    password:            string;
    dbName:              string;
    dbGeneralName:       string;
    dbPruebas:           string;
    esquema:             string;
    port:                number;
    dptoPsicotropicos:   number;
    tarifaBaseCatalogo:  number;
}

const CONFIG_PATH = path.resolve(process.cwd(), 'config', 'connections.json');

function leerArchivoConfig(): Partial<DbConfig> {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch {
        // archivo corrupto — ignora y usa .env
    }
    return {};
}

export function getDbConfig(): DbConfig {
    const file = leerArchivoConfig();
    return {
        server:        file.server        ?? process.env.DB_SERVER        ?? 'localhost',
        user:          file.user          ?? process.env.DB_USER          ?? 'sa',
        password:      file.password      ?? process.env.DB_PASSWORD      ?? '',
        dbName:        file.dbName        ?? process.env.DB_NAME          ?? '',
        dbGeneralName: file.dbGeneralName ?? process.env.DB_GENERAL_NAME  ?? 'general_drogueria',
        dbPruebas:     file.dbPruebas     ?? process.env.DB_PRUEBAS       ?? '',
        esquema:       file.esquema       ?? process.env.DB_ESQUEMA        ?? 'dbo',
        port:                Number(file.port                ?? process.env.DB_PORT          ?? 1433),
        dptoPsicotropicos:   Number((file as any).dptoPsicotropicos  ?? 9),
        tarifaBaseCatalogo:  Number((file as any).tarifaBaseCatalogo  ?? 2),
    };
}

export function guardarDbConfig(config: Partial<DbConfig>): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const actual = leerArchivoConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...actual, ...config }, null, 2), 'utf-8');
}

/** Versión enmascarada para exponer al frontend */
export function getDbConfigPublica(): Omit<DbConfig, 'password'> & { passwordMask: string } {
    const cfg = getDbConfig();
    return {
        server:              cfg.server,
        user:                cfg.user,
        passwordMask:        cfg.password ? '••••••••' : '',
        dbName:              cfg.dbName,
        dbGeneralName:       cfg.dbGeneralName,
        dbPruebas:           cfg.dbPruebas,
        esquema:             cfg.esquema,
        port:                cfg.port,
        dptoPsicotropicos:   cfg.dptoPsicotropicos,
        tarifaBaseCatalogo:  cfg.tarifaBaseCatalogo,
    };
}
