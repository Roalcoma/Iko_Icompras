import sql from 'mssql';
import { connectDb, connectRuteroDB, mssql } from '../db/db.conection';
import { getDbConfig } from './dbconfig.service';

export class RuteroService {

    // Crea las tablas en la BD de rutero (separada de DROGUERIA)
    static async initTablas(): Promise<void> {
        // Crea la BD si no existe, conectando al servidor sin especificar BD
        try {
            const cfg = getDbConfig();
            if (cfg.dbRutero) {
                const serverPool = await new sql.ConnectionPool({
                    user:     cfg.user,
                    password: cfg.password,
                    server:   cfg.server,
                    port:     cfg.port,
                    options:  { encrypt: false, trustServerCertificate: true },
                }).connect();
                await serverPool.request().query(
                    `IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'${cfg.dbRutero}')
                     CREATE DATABASE [${cfg.dbRutero}]`
                );
                await serverPool.close();
                console.log(`BD ${cfg.dbRutero} verificada/creada.`);
            }
        } catch (err) {
            console.error('Advertencia al crear BD rutero:', err);
        }

        try {
            const pool = await connectRuteroDB();
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_RUTEROS' AND xtype='U')
                CREATE TABLE APP_RUTEROS (
                    ID          INT IDENTITY(1,1) PRIMARY KEY,
                    NUMERO      VARCHAR(20)      NOT NULL,
                    CODRUTA     INT              NOT NULL,
                    NOMBRE_RUTA NVARCHAR(200)    NOT NULL DEFAULT '',
                    FECHA       DATETIME         NOT NULL DEFAULT GETDATE(),
                    ESTADO      VARCHAR(20)      NOT NULL DEFAULT 'PENDIENTE'
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_RUTEROS_DETALLE' AND xtype='U')
                CREATE TABLE APP_RUTEROS_DETALLE (
                    ID            INT IDENTITY(1,1) PRIMARY KEY,
                    IDRUTERO      INT          NOT NULL,
                    NUMSERIE      VARCHAR(20)  NOT NULL,
                    NUMFACTURA    INT          NOT NULL,
                    FECHARECIBIDO DATETIME     NULL
                )
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='APP_RUTEROS_CAJAS' AND xtype='U')
                CREATE TABLE APP_RUTEROS_CAJAS (
                    ID         INT IDENTITY(1,1) PRIMARY KEY,
                    IDRUTERO   INT          NOT NULL,
                    IDCONTEO   INT          NOT NULL,
                    POSICION   INT          NOT NULL,
                    NUMSERIE   VARCHAR(20)  NOT NULL DEFAULT '',
                    NUMFACTURA INT          NOT NULL DEFAULT 0,
                    FECHAESCAN DATETIME     NOT NULL DEFAULT GETDATE(),
                    CONSTRAINT UQ_RUTERO_CAJA UNIQUE (IDRUTERO, IDCONTEO, POSICION)
                )
            `);
            // Migración: columnas de sesión de picking
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RUTEROS') AND name='PICKING_USUARIO')
                    ALTER TABLE APP_RUTEROS ADD PICKING_USUARIO VARCHAR(100) NULL
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('APP_RUTEROS') AND name='PICKING_FECHA')
                    ALTER TABLE APP_RUTEROS ADD PICKING_FECHA DATETIME NULL
            `);
            console.log('Tablas de rutero verificadas (BD rutero).');
        } catch (err) {
            console.error('Advertencia en RuteroService.initTablas (BD rutero):', err);
        }

        // Migración: FECHARECIBIDO en DROGUERIA..FACTURASVENTACAMPOSLIBRES (usada por getFacturas y confirmarFacturaRutero)
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (
                    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = 'FACTURASVENTACAMPOSLIBRES' AND COLUMN_NAME = 'FECHARECIBIDO'
                )
                ALTER TABLE FACTURASVENTACAMPOSLIBRES ADD FECHARECIBIDO DATETIME NULL
            `);
            console.log('Columna FECHARECIBIDO verificada en FACTURASVENTACAMPOSLIBRES.');
        } catch (err) {
            console.error('Advertencia en RuteroService.initTablas (FECHARECIBIDO):', err);
        }
    }

    // ── Lectura de DROGUERIA ─────────────────────────────────────────────────

    static async getZonas(): Promise<{ zona: string; display: string }[]> {
        const pool = await connectDb();
        const result = await pool.request().query(`
            SELECT
                CAST(CODRUTA AS VARCHAR(20)) AS ZONA,
                CAST(CODRUTA AS VARCHAR(20)) + ' - ' + ISNULL(DESCRIPCION, '') AS DISPLAY
            FROM RUTAS WITH(NOLOCK)
            WHERE CODRUTA IS NOT NULL
            ORDER BY CODRUTA
        `);
        return result.recordset.map((r: any) => ({ zona: r.ZONA, display: r.DISPLAY }));
    }

    private static readonly FACTURAS_SELECT = `
                SELECT
                    FV.NUMSERIE,
                    FV.NUMFACTURA,
                    FV.NUMSERIE + ' - ' + CAST(FV.NUMFACTURA AS VARCHAR(20)) AS FACTURA_VISUAL,
                    ISNULL(FV.TOTALNETO, 0)   AS TOTAL,
                    CL.CODCLIENTE,
                    CL.NOMBRECLIENTE          AS CLIENTE,
                    ISNULL(R.DESCRIPCION, '') AS NOMBRE_RUTA,
                    (
                        SELECT COUNT(DISTINCT BC.IDBULTO)
                        FROM BULTOS_CONTEO BC WITH(NOLOCK)
                        INNER JOIN PEDVENTACAB PV WITH(NOLOCK)
                            ON PV.SUPEDIDO COLLATE DATABASE_DEFAULT = BC.IDPEDIDO COLLATE DATABASE_DEFAULT
                        INNER JOIN ALBVENTACAB AV WITH(NOLOCK)
                            ON AV.NUMSERIE   COLLATE DATABASE_DEFAULT = PV.SERIEALBARAN COLLATE DATABASE_DEFAULT
                           AND AV.NUMALBARAN = PV.NUMEROALBARAN
                        WHERE AV.NUMSERIEFAC COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                          AND AV.NUMFAC = FV.NUMFACTURA
                    ) AS BULTOS,
                    (
                        SELECT TOP 1 PV2.SUPEDIDO
                        FROM ALBVENTACAB AV2 WITH(NOLOCK)
                        INNER JOIN PEDVENTACAB PV2 WITH(NOLOCK)
                            ON PV2.SERIEALBARAN COLLATE DATABASE_DEFAULT = AV2.NUMSERIE COLLATE DATABASE_DEFAULT
                           AND PV2.NUMEROALBARAN = AV2.NUMALBARAN
                        WHERE AV2.NUMSERIEFAC COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                          AND AV2.NUMFAC = FV.NUMFACTURA
                    ) AS PEDIDO
    `;

    static async getFacturas(zona: string): Promise<any[]> {
        const pool     = await connectDb();
        const ruteroDB = await connectRuteroDB();

        // Facturas ya asignadas a un rutero PENDIENTE (en BD de rutero)
        const pendRes = await ruteroDB.request().query(`
            SELECT ARD.NUMSERIE, ARD.NUMFACTURA
            FROM APP_RUTEROS_DETALLE ARD
            INNER JOIN APP_RUTEROS AR ON AR.ID = ARD.IDRUTERO
            WHERE AR.ESTADO = 'PENDIENTE'
        `);
        const pendSet = new Set<string>(
            pendRes.recordset.map((r: any) => `${r.NUMSERIE}|${r.NUMFACTURA}`)
        );

        const result = await pool.request()
            .input('CODRUTA', mssql.Int, parseInt(zona))
            .query(`
                ${RuteroService.FACTURAS_SELECT}
                FROM FACTURASVENTA FV WITH(NOLOCK)
                INNER JOIN CLIENTES CL WITH(NOLOCK)
                    ON CL.CODCLIENTE = FV.CODCLIENTE
                OUTER APPLY (
                    SELECT TOP 1 ZONA FROM CLIENTESCAMPOSLIBRES WITH(NOLOCK)
                    WHERE CODCLIENTE = CL.CODCLIENTE
                ) CLC
                LEFT JOIN FACTURASVENTACAMPOSLIBRES FVCL WITH(NOLOCK)
                    ON FVCL.NUMSERIE   COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                   AND FVCL.NUMFACTURA = FV.NUMFACTURA
                LEFT JOIN RUTAS R WITH(NOLOCK)
                    ON R.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                WHERE TRY_CAST(CLC.ZONA AS INT) = @CODRUTA
                  AND FVCL.FECHARECIBIDO IS NULL
                ORDER BY CL.NOMBRECLIENTE, FV.NUMSERIE, FV.NUMFACTURA
            `);

        // Excluye en JS las que ya están asignadas a un rutero pendiente
        return result.recordset.filter(
            (f: any) => !pendSet.has(`${f.NUMSERIE}|${f.NUMFACTURA}`)
        );
    }

    // ── Escritura en BD de rutero ────────────────────────────────────────────

    static async crearRutero(
        codruta: number,
        nombreRuta: string,
        facturas: { numserie: string; numfactura: number }[]
    ): Promise<{ id: number; numero: string }> {
        const pool = await connectRuteroDB();

        const numRes = await pool.request().query(`
            SELECT ISNULL(MAX(CAST(SUBSTRING(NUMERO, 5, LEN(NUMERO)) AS INT)), 0) + 1 AS NEXT_NUM
            FROM APP_RUTEROS
        `);
        const numero = 'RUT-' + String(numRes.recordset[0].NEXT_NUM).padStart(6, '0');

        const ruteroRes = await pool.request()
            .input('NUMERO',      mssql.VarChar(20),   numero)
            .input('CODRUTA',     mssql.Int,           codruta)
            .input('NOMBRE_RUTA', mssql.NVarChar(200), nombreRuta)
            .query(`
                INSERT INTO APP_RUTEROS (NUMERO, CODRUTA, NOMBRE_RUTA)
                OUTPUT INSERTED.ID
                VALUES (@NUMERO, @CODRUTA, @NOMBRE_RUTA)
            `);
        const id = ruteroRes.recordset[0].ID;

        for (const f of facturas) {
            await pool.request()
                .input('IDRUTERO',   mssql.Int,         id)
                .input('NUMSERIE',   mssql.VarChar(20), f.numserie)
                .input('NUMFACTURA', mssql.Int,         f.numfactura)
                .query(`
                    INSERT INTO APP_RUTEROS_DETALLE (IDRUTERO, NUMSERIE, NUMFACTURA)
                    VALUES (@IDRUTERO, @NUMSERIE, @NUMFACTURA)
                `);
        }

        return { id, numero };
    }

    static async getRuteros(
        codruta?: number, buscarNumero?: string, buscarFactura?: string,
        page = 1, limit = 15
    ): Promise<{ data: any[]; total: number }> {
        const pool   = await connectRuteroDB();
        const req    = pool.request();
        const reqCnt = pool.request();
        let where  = `WHERE AR.ESTADO = 'PENDIENTE'`;
        if (codruta) {
            req.input('CODRUTA', mssql.Int, codruta);
            reqCnt.input('CODRUTA', mssql.Int, codruta);
            where += ' AND AR.CODRUTA = @CODRUTA';
        }
        if (buscarNumero) {
            req.input('BUSCAR_NUM', mssql.NVarChar(100), `%${buscarNumero}%`);
            reqCnt.input('BUSCAR_NUM', mssql.NVarChar(100), `%${buscarNumero}%`);
            where += ' AND AR.NUMERO LIKE @BUSCAR_NUM';
        }
        if (buscarFactura) {
            req.input('BUSCAR_FAC', mssql.NVarChar(100), `%${buscarFactura}%`);
            reqCnt.input('BUSCAR_FAC', mssql.NVarChar(100), `%${buscarFactura}%`);
            where += ` AND EXISTS (
                SELECT 1 FROM APP_RUTEROS_DETALLE ARD2
                WHERE ARD2.IDRUTERO = AR.ID
                  AND (CAST(ARD2.NUMFACTURA AS NVARCHAR(20)) LIKE @BUSCAR_FAC
                    OR ARD2.NUMSERIE LIKE @BUSCAR_FAC)
            )`;
        }
        req.input('OFFSET', mssql.Int, (page - 1) * limit);
        req.input('LIMIT',  mssql.Int, limit);

        const [dataRes, cntRes] = await Promise.all([
            req.query(`
                SELECT
                    AR.ID, AR.NUMERO, AR.CODRUTA, AR.NOMBRE_RUTA,
                    CONVERT(VARCHAR(16), AR.FECHA, 120) AS FECHA,
                    AR.ESTADO,
                    AR.PICKING_USUARIO,
                    COUNT(ARD.ID)            AS TOTAL_FACTURAS,
                    COUNT(ARD.FECHARECIBIDO) AS ENTREGADAS
                FROM APP_RUTEROS AR WITH(NOLOCK)
                LEFT JOIN APP_RUTEROS_DETALLE ARD WITH(NOLOCK) ON ARD.IDRUTERO = AR.ID
                ${where}
                GROUP BY AR.ID, AR.NUMERO, AR.CODRUTA, AR.NOMBRE_RUTA, AR.FECHA, AR.ESTADO, AR.PICKING_USUARIO
                ORDER BY AR.FECHA DESC
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `),
            reqCnt.query(`
                SELECT COUNT(DISTINCT AR.ID) AS TOTAL
                FROM APP_RUTEROS AR WITH(NOLOCK)
                ${where}
            `),
        ]);

        return { data: dataRes.recordset, total: cntRes.recordset[0].TOTAL };
    }

    // ── Sesión de picking ─────────────────────────────────────────────────────

    static async iniciarPicking(idrutero: number, usuario: string): Promise<{ ok: boolean; bloqueadoPor?: string }> {
        const pool = await connectRuteroDB();
        // Claim atómico: toma si está libre, expirado (>8h) o ya es del mismo usuario
        const upd = await pool.request()
            .input('ID',      mssql.Int,          idrutero)
            .input('USUARIO', mssql.VarChar(100),  usuario)
            .query(`
                UPDATE APP_RUTEROS
                SET PICKING_USUARIO = @USUARIO, PICKING_FECHA = GETDATE()
                WHERE ID = @ID
                  AND (PICKING_USUARIO IS NULL
                    OR PICKING_USUARIO = @USUARIO
                    OR DATEDIFF(HOUR, PICKING_FECHA, GETDATE()) >= 8)
            `);
        if (upd.rowsAffected[0] > 0) return { ok: true };
        const row = await pool.request()
            .input('ID', mssql.Int, idrutero)
            .query(`SELECT PICKING_USUARIO FROM APP_RUTEROS WHERE ID = @ID`);
        return { ok: false, bloqueadoPor: row.recordset[0]?.PICKING_USUARIO ?? 'otro usuario' };
    }

    static async liberarPicking(idrutero: number, usuario: string): Promise<void> {
        const pool = await connectRuteroDB();
        await pool.request()
            .input('ID',      mssql.Int,         idrutero)
            .input('USUARIO', mssql.VarChar(100), usuario)
            .query(`
                UPDATE APP_RUTEROS
                SET PICKING_USUARIO = NULL, PICKING_FECHA = NULL
                WHERE ID = @ID AND PICKING_USUARIO = @USUARIO
            `);
    }

    static async getMiSesionPicking(usuario: string): Promise<any[]> {
        const pool = await connectRuteroDB();
        const res  = await pool.request()
            .input('USUARIO', mssql.VarChar(100), usuario)
            .query(`
                SELECT
                    AR.ID, AR.NUMERO, AR.CODRUTA, AR.NOMBRE_RUTA,
                    CONVERT(VARCHAR(16), AR.FECHA, 120) AS FECHA,
                    AR.ESTADO,
                    COUNT(ARD.ID)            AS TOTAL_FACTURAS,
                    COUNT(ARD.FECHARECIBIDO) AS ENTREGADAS,
                    (SELECT COUNT(*) FROM APP_RUTEROS_CAJAS ARC WHERE ARC.IDRUTERO = AR.ID) AS CAJAS_ESCANEADAS
                FROM APP_RUTEROS AR WITH(NOLOCK)
                LEFT JOIN APP_RUTEROS_DETALLE ARD WITH(NOLOCK) ON ARD.IDRUTERO = AR.ID
                WHERE AR.PICKING_USUARIO = @USUARIO AND AR.ESTADO = 'PENDIENTE'
                GROUP BY AR.ID, AR.NUMERO, AR.CODRUTA, AR.NOMBRE_RUTA, AR.FECHA, AR.ESTADO
                ORDER BY AR.FECHA DESC
            `);
        return res.recordset;
    }

    static async getFacturasDeRutero(idrutero: number): Promise<any[]> {
        const ruteroDB = await connectRuteroDB();

        // Paso 1: detalle desde BD de rutero
        const detalleRes = await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`
                SELECT NUMSERIE, NUMFACTURA, FECHARECIBIDO
                FROM APP_RUTEROS_DETALLE
                WHERE IDRUTERO = @IDRUTERO
            `);
        const detalle: { NUMSERIE: string; NUMFACTURA: number; FECHARECIBIDO: Date | null }[] =
            detalleRes.recordset;
        if (!detalle.length) return [];

        // Paso 2: info de facturas desde DROGUERIA
        const pool = await connectDb();
        const req2 = pool.request();
        const wherePairs = detalle.map((d, i) => {
            req2.input(`S${i}`, mssql.VarChar(20), d.NUMSERIE);
            req2.input(`N${i}`, mssql.Int,          d.NUMFACTURA);
            return `(FV.NUMSERIE COLLATE DATABASE_DEFAULT = @S${i} AND FV.NUMFACTURA = @N${i})`;
        }).join(' OR ');

        const factRes = await req2.query(`
            SELECT
                FV.NUMSERIE,
                FV.NUMFACTURA,
                FV.NUMSERIE + ' - ' + CAST(FV.NUMFACTURA AS VARCHAR(20)) AS FACTURA_VISUAL,
                ISNULL(FV.TOTALNETO, 0)   AS TOTAL,
                CL.CODCLIENTE,
                CL.NOMBRECLIENTE          AS CLIENTE,
                ISNULL(R.DESCRIPCION, '') AS NOMBRE_RUTA,
                (
                    SELECT COUNT(DISTINCT BC.IDBULTO)
                    FROM BULTOS_CONTEO BC WITH(NOLOCK)
                    INNER JOIN PEDVENTACAB PV WITH(NOLOCK)
                        ON PV.SUPEDIDO COLLATE DATABASE_DEFAULT = BC.IDPEDIDO COLLATE DATABASE_DEFAULT
                    INNER JOIN ALBVENTACAB AV WITH(NOLOCK)
                        ON AV.NUMSERIE   COLLATE DATABASE_DEFAULT = PV.SERIEALBARAN COLLATE DATABASE_DEFAULT
                       AND AV.NUMALBARAN = PV.NUMEROALBARAN
                    WHERE AV.NUMSERIEFAC COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                      AND AV.NUMFAC = FV.NUMFACTURA
                ) AS BULTOS,
                (
                    SELECT TOP 1 PV2.SUPEDIDO
                    FROM ALBVENTACAB AV2 WITH(NOLOCK)
                    INNER JOIN PEDVENTACAB PV2 WITH(NOLOCK)
                        ON PV2.SERIEALBARAN COLLATE DATABASE_DEFAULT = AV2.NUMSERIE COLLATE DATABASE_DEFAULT
                       AND PV2.NUMEROALBARAN = AV2.NUMALBARAN
                    WHERE AV2.NUMSERIEFAC COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                      AND AV2.NUMFAC = FV.NUMFACTURA
                ) AS PEDIDO
            FROM FACTURASVENTA FV WITH(NOLOCK)
            LEFT JOIN CLIENTES CL WITH(NOLOCK)
                ON CL.CODCLIENTE = FV.CODCLIENTE
            LEFT JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                ON CLC.CODCLIENTE = CL.CODCLIENTE
            LEFT JOIN RUTAS R WITH(NOLOCK)
                ON R.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
            WHERE ${wherePairs}
            ORDER BY CL.NOMBRECLIENTE, FV.NUMSERIE, FV.NUMFACTURA
        `);

        // Combina FECHARECIBIDO (BD rutero) con el resto (DROGUERIA)
        const fechaMap = new Map(
            detalle.map(d => [`${d.NUMSERIE}|${d.NUMFACTURA}`, d.FECHARECIBIDO])
        );
        return factRes.recordset.map((f: any) => ({
            ...f,
            FECHARECIBIDO: fechaMap.get(`${f.NUMSERIE}|${f.NUMFACTURA}`) ?? null,
        }));
    }

    static async confirmarFacturaRutero(idrutero: number, numserie: string, numfactura: number): Promise<void> {
        const ruteroDB = await connectRuteroDB();

        await ruteroDB.request()
            .input('IDRUTERO',   mssql.Int,         idrutero)
            .input('NUMSERIE',   mssql.VarChar(20),  numserie)
            .input('NUMFACTURA', mssql.Int,          numfactura)
            .query(`
                UPDATE APP_RUTEROS_DETALLE
                SET FECHARECIBIDO = GETDATE()
                WHERE IDRUTERO = @IDRUTERO
                  AND NUMSERIE   COLLATE DATABASE_DEFAULT = @NUMSERIE   COLLATE DATABASE_DEFAULT
                  AND NUMFACTURA = @NUMFACTURA
                  AND FECHARECIBIDO IS NULL
            `);

        const pool = await connectDb();
        await pool.request()
            .input('NUMSERIE',   mssql.VarChar(20), numserie)
            .input('NUMFACTURA', mssql.Int,         numfactura)
            .query(`
                UPDATE FACTURASVENTACAMPOSLIBRES
                SET FECHARECIBIDO = GETDATE()
                WHERE NUMSERIE   COLLATE DATABASE_DEFAULT = @NUMSERIE COLLATE DATABASE_DEFAULT
                  AND NUMFACTURA = @NUMFACTURA
                  AND FECHARECIBIDO IS NULL
            `);

        // Auto-cierra el rutero si todas las facturas fueron entregadas
        await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`
                UPDATE APP_RUTEROS SET ESTADO = 'ENTREGADO'
                WHERE ID = @IDRUTERO
                  AND NOT EXISTS (
                    SELECT 1 FROM APP_RUTEROS_DETALLE
                    WHERE IDRUTERO = @IDRUTERO AND FECHARECIBIDO IS NULL
                  )
            `);
    }

    static async getEstadoPicking(idrutero: number): Promise<{
        totalCajas: number; cajasEscaneadas: number;
        lineas: { numserie: string; numfactura: number; cliente: string; idconteo: number; ncajas: number; escaneadas: number }[];
    }> {
        const ruteroDB = await connectRuteroDB();
        const pool     = await connectDb();

        const detRes = await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`SELECT NUMSERIE, NUMFACTURA FROM APP_RUTEROS_DETALLE WHERE IDRUTERO = @IDRUTERO`);
        const detalle = detRes.recordset;
        if (!detalle.length) return { totalCajas: 0, cajasEscaneadas: 0, lineas: [] };

        const req2 = pool.request();
        const pairs = detalle.map((d: any, i: number) => {
            req2.input(`S${i}`, mssql.VarChar(20), d.NUMSERIE);
            req2.input(`N${i}`, mssql.Int,          d.NUMFACTURA);
            return `(FV.NUMSERIE COLLATE DATABASE_DEFAULT = @S${i} AND FV.NUMFACTURA = @N${i})`;
        }).join(' OR ');

        const conteoRes = await req2.query(`
            SELECT DISTINCT CC.IDCONTEO, CC.NCAJAS, FV.NUMSERIE, FV.NUMFACTURA,
                   ISNULL(CL.NOMBRECLIENTE, '') AS CLIENTE
            FROM CONTEO_CAJAS CC WITH(NOLOCK)
            INNER JOIN PEDIDOS_CONTEOS PC  WITH(NOLOCK) ON PC.IDCONTEO = CC.IDCONTEO
            INNER JOIN CABECERA_PED CP     WITH(NOLOCK) ON CP.ORDERID  = PC.IDPEDIDO
            INNER JOIN PEDVENTACAB PVC     WITH(NOLOCK) ON PVC.SUPEDIDO    COLLATE Modern_Spanish_CI_AS = CP.ORDERID COLLATE Modern_Spanish_CI_AS
            INNER JOIN ALBVENTACAB AVC     WITH(NOLOCK) ON AVC.NUMSERIE    = PVC.SERIEALBARAN
                AND AVC.NUMALBARAN = PVC.NUMEROALBARAN AND AVC.N = PVC.NALBARAN
            INNER JOIN FACTURASVENTA FV    WITH(NOLOCK) ON FV.NUMSERIE     = AVC.NUMSERIEFAC
                AND FV.NUMFACTURA  = AVC.NUMFAC AND FV.N = AVC.NFAC
            INNER JOIN CLIENTES CL         WITH(NOLOCK) ON CL.CODCLIENTE   = FV.CODCLIENTE
            WHERE ${pairs}
        `);

        const cajasRes = await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`SELECT IDCONTEO, COUNT(*) AS CNT FROM APP_RUTEROS_CAJAS WHERE IDRUTERO = @IDRUTERO GROUP BY IDCONTEO`);
        const escMap = new Map<number, number>(cajasRes.recordset.map((r: any) => [r.IDCONTEO, r.CNT]));

        const lineas = conteoRes.recordset.map((r: any) => ({
            numserie: r.NUMSERIE, numfactura: r.NUMFACTURA, cliente: r.CLIENTE,
            idconteo: r.IDCONTEO, ncajas: Number(r.NCAJAS),
            escaneadas: escMap.get(r.IDCONTEO) ?? 0,
        }));

        return {
            totalCajas:      lineas.reduce((s, l) => s + l.ncajas, 0),
            cajasEscaneadas: lineas.reduce((s, l) => s + l.escaneadas, 0),
            lineas,
        };
    }

    static async escanearCaja(idrutero: number, barcode: string, usuario: string): Promise<{
        success: boolean; message: string; duplicado?: boolean;
        factura?: string; cliente?: string; posicion?: number; ncajas?: number;
    }> {
        // Validar que el usuario tiene el rutero en su sesión de picking
        const ruteroDB0 = await connectRuteroDB();
        const sesRow = await ruteroDB0.request()
            .input('ID', mssql.Int, idrutero)
            .query(`SELECT PICKING_USUARIO FROM APP_RUTEROS WHERE ID = @ID`);
        const dueño = sesRow.recordset[0]?.PICKING_USUARIO;
        if (dueño !== usuario)
            return { success: false, message: dueño ? `Rutero en sesión de ${dueño}` : 'Agrega este rutero a tu sesión de picking primero' };
        const parts = barcode.trim().split('|');
        if (parts.length !== 2) return { success: false, message: 'Código de barras inválido' };
        const idConteo = parseInt(parts[0]);
        const posicion = parseInt(parts[1]);
        if (isNaN(idConteo) || isNaN(posicion) || posicion < 1)
            return { success: false, message: 'Código de barras inválido' };

        const pool     = await connectDb();
        const ruteroDB = await connectRuteroDB();

        const conteoRes = await pool.request()
            .input('IDCONTEO', mssql.Int, idConteo)
            .query(`
                SELECT DISTINCT CC.NCAJAS, FV.NUMSERIE, FV.NUMFACTURA,
                       ISNULL(CL.NOMBRECLIENTE, '') AS CLIENTE
                FROM CONTEO_CAJAS CC WITH(NOLOCK)
                INNER JOIN PEDIDOS_CONTEOS PC  WITH(NOLOCK) ON PC.IDCONTEO = CC.IDCONTEO
                INNER JOIN CABECERA_PED CP     WITH(NOLOCK) ON CP.ORDERID  = PC.IDPEDIDO
                INNER JOIN PEDVENTACAB PVC     WITH(NOLOCK) ON PVC.SUPEDIDO    COLLATE Modern_Spanish_CI_AS = CP.ORDERID COLLATE Modern_Spanish_CI_AS
                INNER JOIN ALBVENTACAB AVC     WITH(NOLOCK) ON AVC.NUMSERIE    = PVC.SERIEALBARAN
                    AND AVC.NUMALBARAN = PVC.NUMEROALBARAN AND AVC.N = PVC.NALBARAN
                INNER JOIN FACTURASVENTA FV    WITH(NOLOCK) ON FV.NUMSERIE     = AVC.NUMSERIEFAC
                    AND FV.NUMFACTURA  = AVC.NUMFAC AND FV.N = AVC.NFAC
                INNER JOIN CLIENTES CL         WITH(NOLOCK) ON CL.CODCLIENTE   = FV.CODCLIENTE
                WHERE CC.IDCONTEO = @IDCONTEO
            `);

        if (!conteoRes.recordset.length)
            return { success: false, message: `Conteo ${idConteo} no encontrado` };

        const info       = conteoRes.recordset[0];
        const ncajas     = Number(info.NCAJAS);
        const numserie   = info.NUMSERIE;
        const numfactura = info.NUMFACTURA;

        if (posicion > ncajas)
            return { success: false, message: `Posición ${posicion} fuera de rango (conteo tiene ${ncajas} cajas)` };

        const pertRes = await ruteroDB.request()
            .input('IDRUTERO',   mssql.Int,        idrutero)
            .input('NUMSERIE',   mssql.VarChar(20), numserie)
            .input('NUMFACTURA', mssql.Int,         numfactura)
            .query(`
                SELECT 1 FROM APP_RUTEROS_DETALLE
                WHERE IDRUTERO   = @IDRUTERO
                  AND NUMSERIE   COLLATE DATABASE_DEFAULT = @NUMSERIE COLLATE DATABASE_DEFAULT
                  AND NUMFACTURA = @NUMFACTURA
            `);

        if (!pertRes.recordset.length)
            return { success: false, message: `Factura ${numserie}-${numfactura} no pertenece a este rutero` };

        try {
            await ruteroDB.request()
                .input('IDRUTERO',   mssql.Int,        idrutero)
                .input('IDCONTEO',   mssql.Int,         idConteo)
                .input('POSICION',   mssql.Int,         posicion)
                .input('NUMSERIE',   mssql.VarChar(20), numserie)
                .input('NUMFACTURA', mssql.Int,         numfactura)
                .query(`
                    INSERT INTO APP_RUTEROS_CAJAS (IDRUTERO, IDCONTEO, POSICION, NUMSERIE, NUMFACTURA)
                    VALUES (@IDRUTERO, @IDCONTEO, @POSICION, @NUMSERIE, @NUMFACTURA)
                `);
            return {
                success: true,
                message: `Caja ${posicion}/${ncajas} verificada`,
                factura: `${numserie}-${numfactura}`,
                cliente: info.CLIENTE,
                posicion, ncajas,
            };
        } catch (e: any) {
            if (e.number === 2627 || e.number === 2601)
                return { success: false, duplicado: true, message: `Caja ${posicion}/${ncajas} ya fue escaneada`, factura: `${numserie}-${numfactura}`, posicion, ncajas };
            throw e;
        }
    }

    static async confirmarRutero(idrutero: number): Promise<void> {
        const ruteroDB = await connectRuteroDB();

        await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`
                UPDATE APP_RUTEROS_DETALLE
                SET FECHARECIBIDO = GETDATE()
                WHERE IDRUTERO = @IDRUTERO AND FECHARECIBIDO IS NULL
            `);

        const detalles = await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`SELECT NUMSERIE, NUMFACTURA FROM APP_RUTEROS_DETALLE WHERE IDRUTERO = @IDRUTERO`);

        const pool = await connectDb();
        for (const d of detalles.recordset) {
            await pool.request()
                .input('NUMSERIE',   mssql.VarChar(20), d.NUMSERIE)
                .input('NUMFACTURA', mssql.Int,         d.NUMFACTURA)
                .query(`
                    UPDATE FACTURASVENTACAMPOSLIBRES
                    SET FECHARECIBIDO = GETDATE()
                    WHERE NUMSERIE   COLLATE DATABASE_DEFAULT = @NUMSERIE COLLATE DATABASE_DEFAULT
                      AND NUMFACTURA = @NUMFACTURA
                      AND FECHARECIBIDO IS NULL
                `);
        }

        await ruteroDB.request()
            .input('IDRUTERO', mssql.Int, idrutero)
            .query(`UPDATE APP_RUTEROS SET ESTADO = 'ENTREGADO' WHERE ID = @IDRUTERO`);
    }
}
