import { connectDb, mssql } from '../db/db.conection';

export class RuteroService {

    static async getZonas(): Promise<{ zona: string; display: string }[]> {
        const pool = await connectDb();
        const result = await pool.request().query(`
            SELECT DISTINCT
                CLC.ZONA,
                CASE
                    WHEN R.RUTA   IS NOT NULL THEN CLC.ZONA + ' - ' + R.RUTA
                    WHEN R.NOMBRE IS NOT NULL THEN CLC.ZONA + ' - ' + R.NOMBRE
                    ELSE CLC.ZONA
                END AS DISPLAY
            FROM CLIENTESCAMPOSLIBRES CLC
            LEFT JOIN RUTAS R WITH(NOLOCK) ON R.CODRUTA = CLC.ZONA
            WHERE CLC.ZONA IS NOT NULL AND LTRIM(RTRIM(CLC.ZONA)) <> ''
            ORDER BY CLC.ZONA
        `);
        return result.recordset.map((r: any) => ({ zona: r.ZONA, display: r.DISPLAY }));
    }

    static async getFacturas(zona: string): Promise<any[]> {
        const pool = await connectDb();
        const result = await pool.request()
            .input('ZONA', mssql.NVarChar(100), `%${zona}%`)
            .query(`
                SELECT
                    FV.NUMSERIE,
                    FV.NUMFACTURA,
                    FV.N,
                    FV.NUMSERIE + ' - ' + CAST(FV.NUMFACTURA AS VARCHAR(20)) AS FACTURA_VISUAL,
                    ISNULL(FV.TOTALNETO, 0)                             AS TOTAL,
                    CL.NOMBRECLIENTE                                     AS CLIENTE,
                    ISNULL(CL.DOMICILIO1, ISNULL(CL.DOMICILIO, ''))     AS DIRECCION,
                    ISNULL(CLC.ZONA, '')                                 AS ZONA,
                    ISNULL(FVCL.BULTOS, 1)                               AS BULTOS,
                    ISNULL(R.RUTA, ISNULL(R.NOMBRE, ''))                 AS NOMBRE_RUTA
                FROM FACTURASVENTA FV WITH(NOLOCK)
                INNER JOIN FACTURASVENTACAMPOSLIBRES FVCL WITH(NOLOCK)
                    ON FVCL.NUMSERIE = FV.NUMSERIE AND FVCL.NUMFACTURA = FV.NUMFACTURA AND FVCL.N = FV.N
                INNER JOIN CLIENTES CL WITH(NOLOCK)
                    ON CL.CODCLIENTE = FV.CODCLIENTE
                INNER JOIN CLIENTESCAMPOSLIBRES CLC WITH(NOLOCK)
                    ON CLC.CODCLIENTE = CL.CODCLIENTE
                LEFT JOIN RUTAS R WITH(NOLOCK)
                    ON R.CODRUTA = CL.CODRUTA
                WHERE FVCL.FECHARECIBIDO IS NULL
                  AND CLC.ZONA LIKE @ZONA
                ORDER BY CL.NOMBRECLIENTE, FV.NUMSERIE, FV.NUMFACTURA
            `);
        return result.recordset;
    }

    static async marcarEntregado(numserie: string, numfactura: number, n: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('NUMSERIE',    mssql.VarChar(20), numserie)
            .input('NUMFACTURA',  mssql.Int,         numfactura)
            .input('N',           mssql.Int,         n)
            .query(`
                UPDATE FACTURASVENTACAMPOSLIBRES
                SET FECHARECIBIDO = GETDATE()
                WHERE NUMSERIE = @NUMSERIE AND NUMFACTURA = @NUMFACTURA AND N = @N
            `);
    }
}
