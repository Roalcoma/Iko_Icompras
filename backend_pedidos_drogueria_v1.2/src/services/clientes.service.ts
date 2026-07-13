import { mssql } from "../db/db.conection";
import { connectDb } from "../db/db.conection";
import 'dotenv/config'

export class ClientesServices {

    static async getClientesPaginado(search: string, page: number, limit: number): Promise<any> {
        try {
            const pool = await connectDb()
            const offset = (Math.max(1, page) - 1) * limit
            const filtro = search ? `%${search.toUpperCase()}%` : '%'

            const result = await pool.request()
                .input('FILTRO', mssql.NVarChar, filtro)
                .input('OFFSET', mssql.Int, offset)
                .input('LIMIT', mssql.Int, limit)
                .query(`
                    SELECT
                        CL.CODCLIENTE, CL.NOMBRECLIENTE, ISNULL(CL.NOMBRECOMERCIAL,'') AS NOMBRECOMERCIAL, CL.CIF,
                        ISNULL(CL.TELEFONO1, '') TELF, ISNULL(CL.E_MAIL, '') EMAIL,
                        ISNULL((SELECT TOP 1 TRY_CAST(CCL.D1 AS FLOAT) FROM CLIENTESCAMPOSLIBRES CCL WHERE CCL.CODCLIENTE = CL.CODCLIENTE), 0) DESCUENTO
                    FROM CLIENTES CL
                    WHERE UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.NOMBRECOMERCIAL,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO
                    ORDER BY CL.NOMBRECLIENTE
                    OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
                `)

            const countResult = await pool.request()
                .input('FILTRO', mssql.NVarChar, filtro)
                .query(`SELECT COUNT(*) AS TOTAL FROM CLIENTES CL WHERE UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.NOMBRECOMERCIAL,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO`)

            return { success: true, data: result.recordset, total: countResult.recordset[0].TOTAL }
        } catch (error) {
            console.error('Error al obtener clientes paginados: ', error)
            return { success: false, message: 'Error al obtener clientes', error: error instanceof Error ? error.message : 'Error desconocido' }
        }
    }

    static async actualizarDescuentoGlobal(codCliente: number, descuento: number): Promise<any> {
        try {
            const pool = await connectDb()
            await pool.request()
                .input('CODCLIENTE', mssql.Int, codCliente)
                .input('D1', mssql.NVarChar, String(descuento))
                .query(`
                    IF EXISTS (SELECT 1 FROM CLIENTESCAMPOSLIBRES WHERE CODCLIENTE = @CODCLIENTE)
                        UPDATE CLIENTESCAMPOSLIBRES SET D1 = @D1 WHERE CODCLIENTE = @CODCLIENTE
                    ELSE
                        INSERT INTO CLIENTESCAMPOSLIBRES (CODCLIENTE, D1) VALUES (@CODCLIENTE, @D1)
                `)
            return { success: true }
        } catch (error) {
            console.error('Error al actualizar descuento global: ', error)
            return { success: false, message: 'Error al actualizar descuento', error: error instanceof Error ? error.message : 'Error desconocido' }
        }
    }

    static async getClientes(cif: string): Promise<any> {
        try {
            const pool = await connectDb()
            const result = await pool.request()
                .input('cif', mssql.VarChar, cif)
                .query(`;WITH CTE_GRUPOCLIENTES AS (
                            SELECT 
                                G.IDGRUPO,
                                C.CODCLIENTE,
                                G.CAMPO AS Regla_Aplicada,
                                G.VALOR AS Valor_Esperado,
                                P.IDPROMOCION,
                                P.DESCRIPCION PROMOCION,
                                P.PRIORIDAD,
                                P.FECHAINICIAL,
                                P.FECHAFINAL,
                                LEFT(AP.VALOR, CHARINDEX('|', AP.VALOR + '|') - 1) PORCENTAJE_DESCUENTO
                            FROM CLIENTESCAMPOSLIBRES C
                            JOIN CONDICIONESGRUPOSCLIENTES G ON 
                                (G.TABLA = 0 AND G.CAMPO = 'CODCLIENTE' AND CAST(C.CODCLIENTE AS VARCHAR) = G.VALOR)
                                OR 
                                (G.TABLA = 1 AND G.CAMPO = 'D3' AND CAST(C.D3 AS VARCHAR) = G.VALOR)
                                OR 
                                (G.TABLA = 1 AND G.CAMPO = 'D4' AND CAST(C.D4 AS VARCHAR) = G.VALOR)
                            LEFT JOIN PROMOCIONES P ON P.IDGRUPOCLIENTES = G.IDGRUPO
                            LEFT JOIN ACCIONESPROMOCION AP ON AP.IDPROMOCION = P.IDPROMOCION
                            WHERE CAST(GETDATE() AS DATE) BETWEEN P.FECHAINICIAL AND P.FECHAFINAL
                            
                        )

                        SELECT
                            ISNULL(CL.NOMBRECLIENTE, '') NOMBRECLIENTE,
                            ISNULL(CL.NOMBRECOMERCIAL, '') NOMBRECOMERCIAL,
                            ISNULL(CL.CODCLIENTE, 0) CODCLIENTE,
                            ISNULL(CL.NIF20, 0) ID,
                            ISNULL(CL.CIF, '') NIT,
                            ISNULL(CL.NIF20, '') NIF20,
                            ISNULL(CL.TELEFONO1, '') TELF,
                            ISNULL(CL.E_MAIL, '') EMAIL,
                            ISNULL(CL.DIRECCION1, '') DIRECCION,
                            ISNULL(CL.DIRECCION1, '') DIRECCION_FISCAL,
                            ISNULL(RUT.DESCRIPCION, '') DIRECCION_ENVIO,
                            ISNULL(TRY_CAST(CCL.D1 AS FLOAT), 0) DESCUENTO,
                            ISNULL((SELECT TOP 1 CG.PORCENTAJE_DESCUENTO FROM CTE_GRUPOCLIENTES CG WHERE CL.CODCLIENTE = CG.CODCLIENTE AND Regla_Aplicada = 'D3'), 0) DESCUENTO2,
                            ISNULL((SELECT TOP 1 CG.PORCENTAJE_DESCUENTO FROM CTE_GRUPOCLIENTES CG WHERE CL.CODCLIENTE = CG.CODCLIENTE AND Regla_Aplicada = 'D4'), 0) DESCUENTO3
                        FROM
                            CLIENTES CL
                            LEFT JOIN CLIENTESCAMPOSLIBRES CCL ON CL.CODCLIENTE = CCL.CODCLIENTE
                            LEFT JOIN RUTAS RUT ON RUT.CODRUTA = TRY_CAST(CCL.ZONA AS INT)
                        WHERE
                            (UPPER(ISNULL(CL.NOMBRECLIENTE, '')) LIKE ('%'+UPPER(REPLACE(LTRIM(RTRIM(@CIF)),' ','%'))+'%')
                            OR UPPER(ISNULL(CL.NOMBRECOMERCIAL, '')) LIKE ('%'+UPPER(REPLACE(LTRIM(RTRIM(@CIF)),' ','%'))+'%')
                            OR UPPER(ISNULL(CL.CIF, '')) LIKE ('%'+UPPER(REPLACE(LTRIM(RTRIM(@CIF)),' ','%'))+'%')
                            OR UPPER(ISNULL(CL.CODCLIENTE, '')) LIKE ('%'+UPPER(REPLACE(LTRIM(RTRIM(@CIF)),' ','%'))+'%'))`)
            
            return {
                success: true,
                clientes: result.recordset
            }
        } catch (error) {
            console.error('Error al obtener clientes: ', error)
            return {
                success: false,
                message: 'Error al obtener clientes',
                error: error instanceof Error ? error.message : 'Error desconocido'
            }
        }
    }

    static async getRiesgo(codcliente: number): Promise<any> {
        try {
            const pool = await connectDb()
            const result = await pool.request()
                .input('CODCLIENTE', codcliente)
                .query(`SELECT 
                            CL.CODCLIENTE
                            , CL.NOMBRECLIENTE
                            , CL.RIESGOCONCEDIDO
                            , ISNULL(SUM(T.IMPORTE), 0) CX                          
                            , CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END PORCENTAJE_RIESGO
                            , CASE
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) BETWEEN 80 AND 99 THEN 'ALTO'
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) >= 100 THEN 'SUPERADO'
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) BETWEEN 30 AND 79 THEN 'MEDIO'
                                ELSE 'BAJO'
                              END ESTATUS
                        FROM 
                            CLIENTES CL
                            LEFT JOIN TESORERIA T ON T.CODIGOINTERNO = CL.CODCLIENTE
                        WHERE
                            T.ESTADO = 'P'
                            AND ORIGEN = 'C'
                            AND CL.CODCLIENTE = @CODCLIENTE
                            AND T.SERIE NOT LIKE '%P'
                        GROUP BY
                            CL.CODCLIENTE, CL.NOMBRECLIENTE, CL.RIESGOCONCEDIDO`)

            return {
                success: true,
                riesgo: result.recordset
            }
        } catch (error) {
            console.error('Error al obtener clientes: ', error)
            return {
                success: false,
                message: 'Error al obtener clientes',
                error: error instanceof Error ? error.message : 'Error desconocido'
            }
        }
    }

    // Version "en lote" de getRiesgo: una sola consulta para todos los clientes
    // pedidos, en vez de una llamada HTTP por cliente. Ademas, a diferencia de
    // getRiesgo, los filtros de TESORERIA van en el ON del LEFT JOIN (no en el
    // WHERE), asi un cliente sin movimientos pendientes si devuelve fila
    // (CX=0/BAJO) en lugar de quedar afuera del resultado.
    static async getRiesgoMasivo(codclientes: number[]): Promise<any> {
        try {
            if (!codclientes || codclientes.length === 0) {
                return { success: true, riesgo: [] }
            }

            const pool = await connectDb()
            const request = pool.request()
            const placeholders = codclientes.map((id, i) => {
                request.input(`id${i}`, id)
                return `@id${i}`
            }).join(',')

            const result = await request.query(`SELECT
                            CL.CODCLIENTE
                            , CL.NOMBRECLIENTE
                            , CL.RIESGOCONCEDIDO
                            , ISNULL(SUM(T.IMPORTE), 0) CX
                            , CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END PORCENTAJE_RIESGO
                            , CASE
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) BETWEEN 80 AND 99 THEN 'ALTO'
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) >= 100 THEN 'SUPERADO'
                                WHEN (CASE WHEN CL.RIESGOCONCEDIDO <> 0 THEN (ISNULL(SUM(T.IMPORTE), 0) * 100) / CL.RIESGOCONCEDIDO ELSE 0 END) BETWEEN 30 AND 79 THEN 'MEDIO'
                                ELSE 'BAJO'
                              END ESTATUS
                        FROM
                            CLIENTES CL
                            LEFT JOIN TESORERIA T ON T.CODIGOINTERNO = CL.CODCLIENTE
                                AND T.ESTADO = 'P' AND T.ORIGEN = 'C' AND T.SERIE NOT LIKE '%P'
                        WHERE
                            CL.CODCLIENTE IN (${placeholders})
                        GROUP BY
                            CL.CODCLIENTE, CL.NOMBRECLIENTE, CL.RIESGOCONCEDIDO`)

            return {
                success: true,
                riesgo: result.recordset
            }
        } catch (error) {
            console.error('Error al obtener el riesgo masivo: ', error)
            return {
                success: false,
                message: 'Error al obtener el riesgo masivo',
                error: error instanceof Error ? error.message : 'Error desconocido'
            }
        }
    }
}