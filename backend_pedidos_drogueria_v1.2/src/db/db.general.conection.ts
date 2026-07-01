import sql from 'mssql';
import 'dotenv/config';
import { getDbConfig } from '../services/dbconfig.service';

let poolGeneral: sql.ConnectionPool | null = null;

function buildConfig(): sql.config {
    const cfg = getDbConfig();
    return {
        user:     cfg.user,
        password: cfg.password,
        server:   cfg.server,
        port:     cfg.port,
        database: cfg.dbGeneralName,
        pool:     { max: 5, min: 0, idleTimeoutMillis: 30000 },
        options:  { encrypt: false, trustServerCertificate: true },
    };
}

export async function connectDbGeneral(): Promise<sql.ConnectionPool> {
    if (poolGeneral && poolGeneral.connected) return poolGeneral;
    poolGeneral = new sql.ConnectionPool(buildConfig());
    await poolGeneral.connect();
    console.log('Conexión a general_drogueria establecida.');
    return poolGeneral;
}

export async function reconectarDbGeneral(): Promise<void> {
    try { if (poolGeneral && poolGeneral.connected) await poolGeneral.close(); } catch { /* ignore */ }
    poolGeneral = null;
    await connectDbGeneral();
}
