import fs from 'fs';
import path from 'path';
import 'dotenv/config';

export interface DbConfig {
    server:               string;
    user:                 string;
    password:             string;
    dbName:               string;
    dbGeneralName:        string;
    dbPruebas:            string;
    dbRutero:             string;
    esquema:              string;
    port:                 number;
    dptoPsicotropicos:    number;
    tarifaBaseCatalogo:   number;
    codAlmacen:           string;
    maxLineasPorPedido:   number;
    clavePickingAdmin:    string;
    githubZipUrl:         string;
    nssmServicioBackend:  string;
    nssmServicioFrontend: string;
    intervaloEscaneo:     number;
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
        dbRutero:      file.dbRutero      ?? process.env.DB_RUTERO        ?? '',
        esquema:       file.esquema       ?? process.env.DB_ESQUEMA        ?? 'dbo',
        port:                Number(file.port                ?? process.env.DB_PORT          ?? 1433),
        dptoPsicotropicos:   Number((file as any).dptoPsicotropicos  ?? 9),
        tarifaBaseCatalogo:  Number((file as any).tarifaBaseCatalogo  ?? 2),
        codAlmacen:          String((file as any).codAlmacen ?? 'ZAV'),
        maxLineasPorPedido:  Number((file as any).maxLineasPorPedido ?? 50),
        clavePickingAdmin:   String((file as any).clavePickingAdmin ?? 'admin123'),
        githubZipUrl:        String((file as any).githubZipUrl ?? ''),
        nssmServicioBackend: String((file as any).nssmServicioBackend ?? ''),
        nssmServicioFrontend:String((file as any).nssmServicioFrontend ?? ''),
        intervaloEscaneo:    Number((file as any).intervaloEscaneo ?? 30),
    };
}

export function guardarDbConfig(config: Partial<DbConfig>): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const actual = leerArchivoConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...actual, ...config }, null, 2), 'utf-8');
}

export function getDbConfigPublica(): Omit<DbConfig, 'password'> & { passwordMask: string } {
    const cfg = getDbConfig();
    return {
        server:               cfg.server,
        user:                 cfg.user,
        passwordMask:         cfg.password ? '••••••••' : '',
        dbName:               cfg.dbName,
        dbGeneralName:        cfg.dbGeneralName,
        dbPruebas:            cfg.dbPruebas,
        dbRutero:             cfg.dbRutero,
        esquema:              cfg.esquema,
        port:                 cfg.port,
        dptoPsicotropicos:    cfg.dptoPsicotropicos,
        tarifaBaseCatalogo:   cfg.tarifaBaseCatalogo,
        codAlmacen:           cfg.codAlmacen,
        maxLineasPorPedido:   cfg.maxLineasPorPedido,
        clavePickingAdmin:    cfg.clavePickingAdmin,
        githubZipUrl:         cfg.githubZipUrl,
        nssmServicioBackend:  cfg.nssmServicioBackend,
        nssmServicioFrontend: cfg.nssmServicioFrontend,
        intervaloEscaneo:     cfg.intervaloEscaneo,
    };
}
