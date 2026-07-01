import sql from 'mssql';
import 'dotenv/config';
import { AsyncLocalStorage } from 'async_hooks';
import { getDbConfig } from '../services/dbconfig.service';

export const mssql = sql;

export const dbModeContext = new AsyncLocalStorage<{ modoPruebas: boolean }>();

let poolProd:    sql.ConnectionPool | null = null;
let poolPruebas: sql.ConnectionPool | null = null;

function buildConfig(): { prod: sql.config; pruebas: sql.config } {
    const cfg = getDbConfig();
    const base: sql.config = {
        user:     cfg.user,
        password: cfg.password,
        server:   cfg.server,
        port:     cfg.port,
        pool:     { max: 10, min: 0, idleTimeoutMillis: 30000 },
        options:  { encrypt: false, trustServerCertificate: true },
    };
    return {
        prod:    { ...base, database: cfg.dbName },
        pruebas: { ...base, database: cfg.dbPruebas || cfg.dbName },
    };
}

export async function connectDb(): Promise<sql.ConnectionPool> {
    const usarPruebas = dbModeContext.getStore()?.modoPruebas === true;
    if (usarPruebas) {
        if (poolPruebas && poolPruebas.connected) return poolPruebas;
        poolPruebas = await new sql.ConnectionPool(buildConfig().pruebas).connect();
        console.log(`Conexión a BD de PRUEBAS establecida (${buildConfig().pruebas.database}).`);
        return poolPruebas;
    }
    if (poolProd && poolProd.connected) return poolProd;
    poolProd = await new sql.ConnectionPool(buildConfig().prod).connect();
    console.log(`Conexión a SQL Server establecida (${buildConfig().prod.database}).`);
    return poolProd;
}

export async function reconectarDb(): Promise<void> {
    try { if (poolProd    && poolProd.connected)    await poolProd.close();    } catch { /* ignore */ }
    try { if (poolPruebas && poolPruebas.connected) await poolPruebas.close(); } catch { /* ignore */ }
    poolProd    = null;
    poolPruebas = null;
    await connectDb(); // abre con nueva config
}

export async function closeDb(): Promise<void> {
    if (poolProd    && poolProd.connected)    await poolProd.close();
    if (poolPruebas && poolPruebas.connected) await poolPruebas.close();
}

export async function probarConexion(cfg: { server: string; user: string; password: string; dbName: string; port?: number }): Promise<{ ok: boolean; mensaje: string }> {
    let pool: sql.ConnectionPool | null = null;
    try {
        pool = await new sql.ConnectionPool({
            server:   cfg.server,
            user:     cfg.user,
            password: cfg.password,
            database: cfg.dbName,
            port:     cfg.port ?? 1433,
            options:  { encrypt: false, trustServerCertificate: true },
        }).connect();
        await pool.request().query('SELECT 1');
        return { ok: true, mensaje: `Conexión exitosa a ${cfg.dbName} en ${cfg.server}` };
    } catch (err: any) {
        return { ok: false, mensaje: err.message ?? 'Error desconocido' };
    } finally {
        try { pool?.close(); } catch { /* ignore */ }
    }
}
