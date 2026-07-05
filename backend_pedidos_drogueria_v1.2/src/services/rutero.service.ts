import { connectDb, mssql } from '../db/db.conection';

export class RuteroService {

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

    static async getFacturas(zona: string): Promise<any[]> {
        const pool = await connectDb();
        const result = await pool.request()
            .input('CODRUTA', mssql.Int, parseInt(zona))
            .query(`
                SELECT
                    FV.NUMSERIE,
                    FV.NUMFACTURA,
                    FV.NUMSERIE + ' - ' + CAST(FV.NUMFACTURA AS VARCHAR(20)) AS FACTURA_VISUAL,
                    ISNULL(FV.TOTALNETO, 0)                              AS TOTAL,
                    CL.NOMBRECLIENTE                                      AS CLIENTE,
                    ISNULL(R.DESCRIPCION, '')                             AS NOMBRE_RUTA,
                    (
                        SELECT COUNT(DISTINCT BC.IDBULTO)
                        FROM BULTOS_CONTEO BC WITH(NOLOCK)
                        INNER JOIN PEDVENTASCAB PV WITH(NOLOCK) ON PV.SUPEDIDO = BC.IDPEDIDO
                        INNER JOIN ALBVENTACAB AV WITH(NOLOCK)
                            ON AV.NUMSERIE = PV.SERIEALBARAN AND AV.NUMALBARAN = PV.NUMEROALBARAN
                        WHERE AV.NUMSERIEFAC = FV.NUMSERIE AND AV.NUMFAC = FV.NUMFACTURA
                    )                                                     AS BULTOS
                FROM FACTURASVENTA FV WITH(NOLOCK)
                INNER JOIN CLIENTES CL WITH(NOLOCK)
                    ON CL.CODCLIENTE = FV.CODCLIENTE
                LEFT JOIN FACTURASVENTACAMPOSLIBRES FVCL WITH(NOLOCK)
                    ON FVCL.NUMSERIE = FV.NUMSERIE AND FVCL.NUMFACTURA = FV.NUMFACTURA
                LEFT JOIN RUTAS R WITH(NOLOCK)
                    ON R.CODRUTA = CL.CODRUTA
                WHERE CL.CODRUTA = @CODRUTA
                  AND ISNULL(FVCL.FECHARECIBIDO, '') = ''
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
