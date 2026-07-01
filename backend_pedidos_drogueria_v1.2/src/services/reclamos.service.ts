import { mssql } from "../db/db.conection";
import { connectDb } from "../db/db.conection";

export class ReclamosService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_RECLAMOS' AND xtype='U')
                CREATE TABLE APP_RECLAMOS (
                    ID INT IDENTITY PRIMARY KEY,
                    CODCLIENTE INT NOT NULL,
                    NUMSERIE VARCHAR(20) NULL,
                    NUMFACTURA INT NULL,
                    RECLAMO NVARCHAR(MAX) NOT NULL,
                    FECHACREACION DATETIME NOT NULL DEFAULT GETDATE()
                );
            `);
            console.log('Tabla APP_RECLAMOS verificada.');
        } catch (err) {
            console.error('Advertencia en ReclamosService.initTablas:', err);
        }
    }

    static async crear(codCliente: number, numSerie: string | null, numFactura: number | null, reclamo: string) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('CODCLIENTE', mssql.Int, codCliente)
            .input('NUMSERIE', mssql.VarChar, numSerie)
            .input('NUMFACTURA', mssql.Int, numFactura)
            .input('RECLAMO', mssql.NVarChar, reclamo)
            .query(`
                INSERT INTO APP_RECLAMOS (CODCLIENTE, NUMSERIE, NUMFACTURA, RECLAMO)
                OUTPUT INSERTED.ID
                VALUES (@CODCLIENTE, @NUMSERIE, @NUMFACTURA, @RECLAMO)
            `);
        return result.recordset[0].ID;
    }

    static async getReclamos(search: string, page: number, limit: number) {
        const pool = await connectDb();
        const offset = (page - 1) * limit;
        const filtro = search ? `%${search.toUpperCase()}%` : '%';
        const result = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, limit)
            .query(`
                SELECT R.ID, R.CODCLIENTE, CL.NOMBRECLIENTE, R.NUMSERIE, R.NUMFACTURA, R.RECLAMO, R.FECHACREACION
                FROM APP_RECLAMOS R
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = R.CODCLIENTE
                WHERE UPPER(ISNULL(CL.NOMBRECLIENTE, '')) LIKE @FILTRO OR UPPER(R.RECLAMO) LIKE @FILTRO
                ORDER BY R.FECHACREACION DESC
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS TOTAL
                FROM APP_RECLAMOS R
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = R.CODCLIENTE
                WHERE UPPER(ISNULL(CL.NOMBRECLIENTE, '')) LIKE @FILTRO OR UPPER(R.RECLAMO) LIKE @FILTRO
            `);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async getFacturasDeCliente(codCliente: number) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('CODCLIENTE', mssql.Int, codCliente)
            .query(`
                SELECT TOP 100 NUMSERIE, NUMFACTURA, FECHA, TOTALNETO
                FROM FACTURASVENTA
                WHERE CODCLIENTE = @CODCLIENTE
                ORDER BY FECHA DESC
            `);
        return result.recordset;
    }
}
