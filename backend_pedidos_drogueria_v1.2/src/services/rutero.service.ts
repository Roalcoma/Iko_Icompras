import { connectDb, connectRuteroDB, mssql } from '../db/db.conection';

export class RuteroService {

    // Crea las tablas en la BD de rutero (separada de DROGUERIA)
    static async initTablas(): Promise<void> {
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
            console.log('Tablas de rutero verificadas (BD rutero).');
        } catch (err) {
            console.error('Advertencia en RuteroService.initTablas:', err);
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
                    ) AS BULTOS
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
                INNER JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                    ON CLC.CODCLIENTE = CL.CODCLIENTE
                LEFT JOIN FACTURASVENTACAMPOSLIBRES FVCL WITH(NOLOCK)
                    ON FVCL.NUMSERIE   COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
                   AND FVCL.NUMFACTURA = FV.NUMFACTURA
                LEFT JOIN RUTAS R WITH(NOLOCK)
                    ON R.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                WHERE TRY_CAST(CLC.ZONA AS INT) = @CODRUTA
                  AND ISNULL(FVCL.FECHARECIBIDO, '') = ''
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

    static async getRuteros(codruta?: number): Promise<any[]> {
        const pool = await connectRuteroDB();
        const req  = pool.request();
        let where  = `WHERE AR.ESTADO = 'PENDIENTE'`;
        if (codruta) {
            req.input('CODRUTA', mssql.Int, codruta);
            where += ' AND AR.CODRUTA = @CODRUTA';
        }
        const result = await req.query(`
            SELECT
                AR.ID,
                AR.NUMERO,
                AR.CODRUTA,
                AR.NOMBRE_RUTA,
                CONVERT(VARCHAR(16), AR.FECHA, 120) AS FECHA,
                AR.ESTADO,
                COUNT(ARD.ID)             AS TOTAL_FACTURAS,
                COUNT(ARD.FECHARECIBIDO)  AS ENTREGADAS
            FROM APP_RUTEROS AR WITH(NOLOCK)
            LEFT JOIN APP_RUTEROS_DETALLE ARD WITH(NOLOCK) ON ARD.IDRUTERO = AR.ID
            ${where}
            GROUP BY AR.ID, AR.NUMERO, AR.CODRUTA, AR.NOMBRE_RUTA, AR.FECHA, AR.ESTADO
            ORDER BY AR.FECHA DESC
        `);
        return result.recordset;
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
                ) AS BULTOS
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
