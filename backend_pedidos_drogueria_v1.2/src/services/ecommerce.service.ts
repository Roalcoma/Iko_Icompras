import fs from 'fs';
import path from 'path';
import { mssql, connectDb } from '../db/db.conection';

export class EcommerceService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_CONFIG')
                    CREATE TABLE APP_ECOMMERCE_CONFIG (
                        ID   INT PRIMARY KEY DEFAULT 1,
                        RUTA NVARCHAR(500) NOT NULL DEFAULT '',
                        CONSTRAINT CK_ECOMMERCE_CONFIG_ID CHECK (ID = 1)
                    );
                IF NOT EXISTS (SELECT 1 FROM APP_ECOMMERCE_CONFIG WHERE ID = 1)
                    INSERT INTO APP_ECOMMERCE_CONFIG (ID, RUTA) VALUES (1, '');

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_PEDIDOS')
                    CREATE TABLE APP_ECOMMERCE_PEDIDOS (
                        ID             INT IDENTITY PRIMARY KEY,
                        NUMERO_PEDIDO  NVARCHAR(50)  NOT NULL,
                        COD_CLIENTE    NVARCHAR(50),
                        NOMBRE_CLIENTE NVARCHAR(200),
                        RIF            NVARCHAR(50),
                        FECHA          DATETIME,
                        ESTATUS        NVARCHAR(50),
                        TOTAL          DECIMAL(18,2),
                        ARCHIVO        NVARCHAR(500),
                        PROCESADO      BIT NOT NULL DEFAULT 0,
                        FECHA_IMPORT   DATETIME NOT NULL DEFAULT GETDATE()
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_LINEAS')
                    CREATE TABLE APP_ECOMMERCE_LINEAS (
                        ID              INT IDENTITY PRIMARY KEY,
                        ID_PEDIDO       INT NOT NULL REFERENCES APP_ECOMMERCE_PEDIDOS(ID),
                        COD_ARTICULO    NVARCHAR(50),
                        DESCRIPCION     NVARCHAR(300),
                        CANTIDAD        INT,
                        PRECIO_UNITARIO DECIMAL(18,2)
                    );
            `);
            console.log('[Ecommerce] Tablas verificadas/creadas');
        } catch (err) {
            console.error('[Ecommerce] Error en initTablas:', err);
        }
    }

    static async getConfig(): Promise<string> {
        const pool = await connectDb();
        const res = await pool.request()
            .query(`SELECT RUTA FROM APP_ECOMMERCE_CONFIG WHERE ID = 1`);
        return res.recordset[0]?.RUTA ?? '';
    }

    static async setConfig(ruta: string): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('RUTA', mssql.NVarChar(500), ruta)
            .query(`UPDATE APP_ECOMMERCE_CONFIG SET RUTA = @RUTA WHERE ID = 1`);
    }

    private static parsearArchivo(contenido: string, nombreArchivo: string): { pedido: any; lineas: any[] } | null {
        const lineas = contenido.split('\n').map(l => l.trim()).filter(Boolean);
        let pedido: any = null;
        const items: any[] = [];

        for (const linea of lineas) {
            const f = linea.split('|');
            if (f.length < 5) continue;
            // Header: campo[2] es fecha (YYYY-MM-DD ...)
            if (/^\d{4}-\d{2}-\d{2}/.test(f[2])) {
                pedido = {
                    numeroPedido:  (f[0]  ?? '').trim(),
                    codCliente:    (f[1]  ?? '').trim(),
                    fecha:         (f[2]  ?? '').trim(),
                    estatus:       (f[3]  ?? '').trim(),
                    nombreCliente: (f[10] ?? '').trim(),
                    rif:           (f[11] ?? '').trim(),
                    total:         parseFloat(f[16] ?? '0') || 0,
                    archivo:       nombreArchivo,
                };
            } else {
                items.push({
                    codArticulo:    (f[2] ?? '').trim(),
                    descripcion:    (f[3] ?? '').trim(),
                    cantidad:       parseInt(f[4] ?? '0') || 0,
                    precioUnitario: parseFloat(f[5] ?? '0') || 0,
                });
            }
        }

        return pedido ? { pedido, lineas: items } : null;
    }

    static async escanearCarpeta(): Promise<{ importados: number; errores: number }> {
        const ruta = await this.getConfig();
        if (!ruta || !fs.existsSync(ruta)) return { importados: 0, errores: 0 };

        const archivos = fs.readdirSync(ruta).filter(f => f.endsWith('.txt'));
        let importados = 0, errores = 0;

        for (const archivo of archivos) {
            const rutaArchivo = path.join(ruta, archivo);
            try {
                const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
                const parsed = this.parsearArchivo(contenido, archivo);
                if (!parsed) { errores++; continue; }

                const pool = await connectDb();

                // Evitar duplicados por numero + archivo
                const existe = await pool.request()
                    .input('NUM',  mssql.NVarChar(50),  parsed.pedido.numeroPedido)
                    .input('ARCH', mssql.NVarChar(500), archivo)
                    .query(`SELECT 1 FROM APP_ECOMMERCE_PEDIDOS WHERE NUMERO_PEDIDO = @NUM AND ARCHIVO = @ARCH`);

                if (existe.recordset.length > 0) {
                    fs.renameSync(rutaArchivo, rutaArchivo + '.done');
                    continue;
                }

                const insRes = await pool.request()
                    .input('NUM',    mssql.NVarChar(50),   parsed.pedido.numeroPedido)
                    .input('COD',    mssql.NVarChar(50),   parsed.pedido.codCliente)
                    .input('NOMBRE', mssql.NVarChar(200),  parsed.pedido.nombreCliente)
                    .input('RIF',    mssql.NVarChar(50),   parsed.pedido.rif)
                    .input('FECHA',  mssql.DateTime,       new Date(parsed.pedido.fecha))
                    .input('ESTATUS',mssql.NVarChar(50),   parsed.pedido.estatus)
                    .input('TOTAL',  mssql.Decimal(18, 2), parsed.pedido.total)
                    .input('ARCH',   mssql.NVarChar(500),  archivo)
                    .query(`
                        INSERT INTO APP_ECOMMERCE_PEDIDOS
                            (NUMERO_PEDIDO, COD_CLIENTE, NOMBRE_CLIENTE, RIF, FECHA, ESTATUS, TOTAL, ARCHIVO)
                        OUTPUT INSERTED.ID
                        VALUES (@NUM, @COD, @NOMBRE, @RIF, @FECHA, @ESTATUS, @TOTAL, @ARCH)
                    `);

                const idPedido: number = insRes.recordset[0].ID;

                for (const l of parsed.lineas) {
                    await pool.request()
                        .input('ID_PED', mssql.Int,           idPedido)
                        .input('COD',    mssql.NVarChar(50),  l.codArticulo)
                        .input('DESC',   mssql.NVarChar(300), l.descripcion)
                        .input('CANT',   mssql.Int,           l.cantidad)
                        .input('PRECIO', mssql.Decimal(18,2), l.precioUnitario)
                        .query(`
                            INSERT INTO APP_ECOMMERCE_LINEAS
                                (ID_PEDIDO, COD_ARTICULO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO)
                            VALUES (@ID_PED, @COD, @DESC, @CANT, @PRECIO)
                        `);
                }

                fs.renameSync(rutaArchivo, rutaArchivo + '.done');
                importados++;
                console.log(`[Ecommerce] Importado: ${archivo}`);
            } catch (e) {
                console.error(`[Ecommerce] Error al importar ${archivo}:`, e);
                errores++;
            }
        }

        return { importados, errores };
    }

    static async getPedidos(search: string, page: number, limit: number): Promise<{ data: any[]; total: number }> {
        const pool = await connectDb();
        const filtro = `%${search ?? ''}%`;
        const offset = (page - 1) * limit;

        const totalRes = await pool.request()
            .input('F', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS T FROM APP_ECOMMERCE_PEDIDOS
                WHERE NOMBRE_CLIENTE LIKE @F OR NUMERO_PEDIDO LIKE @F OR RIF LIKE @F
            `);

        const dataRes = await pool.request()
            .input('F',   mssql.NVarChar, filtro)
            .input('OFF', mssql.Int, offset)
            .input('LIM', mssql.Int, limit)
            .query(`
                SELECT * FROM APP_ECOMMERCE_PEDIDOS
                WHERE NOMBRE_CLIENTE LIKE @F OR NUMERO_PEDIDO LIKE @F OR RIF LIKE @F
                ORDER BY FECHA_IMPORT DESC
                OFFSET @OFF ROWS FETCH NEXT @LIM ROWS ONLY
            `);

        return { data: dataRes.recordset, total: totalRes.recordset[0].T };
    }

    static async getLineas(idPedido: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('ID', mssql.Int, idPedido)
            .query(`SELECT * FROM APP_ECOMMERCE_LINEAS WHERE ID_PEDIDO = @ID ORDER BY ID`);
        return res.recordset;
    }

    static async marcarProcesado(id: number, procesado: boolean): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID', mssql.Int, id)
            .input('P',  mssql.Bit, procesado ? 1 : 0)
            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET PROCESADO = @P WHERE ID = @ID`);
    }
}
