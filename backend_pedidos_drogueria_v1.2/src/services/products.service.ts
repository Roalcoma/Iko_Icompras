import { mssql } from "../db/db.conection";
import { connectDb, closeDb } from "../db/db.conection";
import { getDbConfig } from './dbconfig.service';
import 'dotenv/config'; // Asegúrate de que dotenv esté instalado y configurado

const VED: number = Number(process.env.VED) || 1; // Asegúrate de que VED esté definido en tu archivo .env
const USD: number = Number(process.env.USD) || 2; // Asegúrate de que USD esté definido en tu archivo .env

// Stock disponible real: stock físico en ZAV menos lo ya reservado en pedidos
// PENDIENTE/PENDIENTE POR AUTORIZACION/AUTORIZADO/EMPACADO. Misma regla que usa
// getStocks() para el chip que ve el usuario — se reutiliza aquí para que el
// filtro con_stock/sin_stock y el orden por stock no contradigan lo que se muestra.
const STOCK_DISPONIBLE_SQL = `(
    ISNULL((SELECT SUM(STOCK) FROM STOCKS WHERE CODARTICULO = A.CODARTICULO AND CODALMACEN = 'ZAV'), 0)
    - ISNULL((
        SELECT SUM(LP.PRODUCTCOUNT) FROM CABECERA_PED CP
        INNER JOIN LINEA_PED LP ON LP.ORDERID = CP.ORDERID
        WHERE LP.CODARTICULO = A.CODARTICULO
            AND CP.ESTATUS IN ('PENDIENTE POR AUTORIZACION', 'APROBACION PSICOTROPICOS', 'AUTORIZADO', 'EMPACADO')
    ), 0)
)`;

export class ProductsService {
    // 1. FUNCIÓN PARA CONTAR EL TOTAL DE REGISTROS
    static async getTotalProductsCount(articulo: string, stockStatus: string = 'todos'): Promise<number> {
        try {
            const pool = await connectDb();
            const result = await pool.request()
                .input('ARTICULO', mssql.NVarChar, !articulo ? '%' : articulo)
                .input('STOCK_STATUS', mssql.VarChar, stockStatus) // <-- Pasamos el estado al SQL
                .query(`
                    DECLARE @FILTRO AS NVARCHAR(50)='%'+UPPER(REPLACE(LTRIM(RTRIM(@ARTICULO)),' ','%'))+'%'
                    
                    SELECT COUNT(DISTINCT A.CODARTICULO) AS TOTAL
                    FROM ARTICULOS A WITH(NOLOCK)
                        INNER JOIN ARTICULOSLIN AL WITH(NOLOCK) ON A.CODARTICULO=AL.CODARTICULO
                        INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON A.CODARTICULO=ACL.CODARTICULO
                    WHERE A.TIPOARTICULO='A' 
                        AND A.DESCATALOGADO='F' 
                        AND ( A.REFPROVEEDOR LIKE @FILTRO 
                            OR UPPER(A.DESCRIPCION) LIKE @FILTRO 
                            OR UPPER(AL.CODBARRAS) LIKE @FILTRO
                            OR UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO
                            OR UPPER(ACL.PRINCIPIOACTIVO) LIKE @FILTRO)
                        AND (
                            @STOCK_STATUS = 'todos'
                            OR (@STOCK_STATUS = 'con_stock' AND ${STOCK_DISPONIBLE_SQL} > 0)
                            OR (@STOCK_STATUS = 'sin_stock' AND ${STOCK_DISPONIBLE_SQL} <= 0)
                        )
                `);

            return result.recordset[0].TOTAL;
        } catch (error) {
            console.error('Error al contar productos:', error);
            return 0;
        }
    }

    // 2. FUNCIÓN PARA TRAER LOS PRODUCTOS PAGINADOS
    static async getProducts(articulo: string, page: number, limit: number, stockStatus: string = 'todos'): Promise<any[]> {
        try {
            const offset = (page - 1) * limit;
            const pool = await connectDb();
            
            const result = await pool.request()
                .input('ARTICULO', mssql.NVarChar, !articulo ? '%' : articulo)
                .input('OFFSET', mssql.Int, offset)
                .input('LIMIT', mssql.Int, limit)
                .input('STOCK_STATUS', mssql.VarChar, stockStatus)
                .input('dptoPsico', mssql.Int, getDbConfig().dptoPsicotropicos)
                .query(`
                    DECLARE @FILTRO AS NVARCHAR(50)='%'+UPPER(REPLACE(LTRIM(RTRIM(@ARTICULO)),' ','%'))+'%'

                    CREATE TABLE #PROMO (
                        CODGRUPO INT,
                        GRUPO_DESC NVARCHAR(MAX),
                        CODARTICULO INT,
                        REFERENCIA NVARCHAR(MAX)
                    )

                    INSERT INTO #PROMO
                    EXEC [rip].[GET_ARTICULOS_EN_PROMOCION_SP]

                    SELECT DISTINCT A.CODARTICULO, A.REFPROVEEDOR, A.NODTOAPLICABLE, ACL.DESCRIPCIONLARGA DESCRIPCION, ACL.PRINCIPIOACTIVO, CASE WHEN A.SECCION = @dptoPsico THEN 'T' ELSE 'F' END ES_PSICOTROPICO, ISNULL(PCL.DIASPROTECCION, 0) AS DIASPROTECCION, ISNULL((SELECT
                        TOP 1 LEFT(AP.VALOR, CHARINDEX('|', AP.VALOR + '|') - 1) PORCENTAJE_DESCUENTO 
                    FROM 
                        PROMOCIONES P 
                        INNER JOIN #PROMO G ON G.CODGRUPO = P.IDGRUPO 
                        INNER JOIN ACCIONESPROMOCION AP ON AP.IDPROMOCION = P.IDPROMOCION
                    WHERE CAST(GETDATE() AS DATE) BETWEEN P.FECHAINICIAL AND P.FECHAFINAL AND PRIORIDAD = 1 AND G.CODARTICULO = A.CODARTICULO), 0) DESCUENTOART,
                        ${STOCK_DISPONIBLE_SQL} AS STOCKTOTAL
                    FROM ARTICULOS A WITH(NOLOCK)
                        INNER JOIN ARTICULOSLIN AL WITH(NOLOCK) ON A.CODARTICULO=AL.CODARTICULO
                        INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON A.CODARTICULO=ACL.CODARTICULO
                        LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL WITH(NOLOCK) ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                    WHERE A.TIPOARTICULO='A'
                        AND A.DESCATALOGADO='F'
                        AND ( A.REFPROVEEDOR LIKE @FILTRO
                            OR UPPER(A.DESCRIPCION) LIKE @FILTRO
                            OR UPPER(AL.CODBARRAS) LIKE @FILTRO
                            OR UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO
                            OR UPPER(ACL.PRINCIPIOACTIVO) LIKE @FILTRO)
                        AND (
                            @STOCK_STATUS = 'todos'
                            OR (@STOCK_STATUS = 'con_stock' AND ${STOCK_DISPONIBLE_SQL} > 0)
                            OR (@STOCK_STATUS = 'sin_stock' AND ${STOCK_DISPONIBLE_SQL} <= 0)
                        )
                    ORDER BY STOCKTOTAL DESC, ACL.DESCRIPCIONLARGA
                    OFFSET @OFFSET ROWS
                    FETCH NEXT @LIMIT ROWS ONLY
                `);

            return result.recordset;
        } catch (error) {
            console.error('Error al obtener productos:', error);
            throw error;
        }
    }

    static async getStocks(codarticulo: number): Promise<any[]> {
        try {
            const pool = await connectDb();
            const result = await pool.request()
                .input('CODARTICULO', mssql.Int, !codarticulo ? 0 : Number(codarticulo))
                .query(`;WITH CTE_STOCK_RESERVADO AS (
                            SELECT CODARTICULO, ISNULL(SUM(LP.PRODUCTCOUNT), 0) STOCK FROM CABECERA_PED CP
                            INNER JOIN LINEA_PED LP ON LP.ORDERID = CP.ORDERID
                            WHERE CP.ESTATUS IN ('PENDIENTE POR AUTORIZACION', 'APROBACION PSICOTROPICOS', 'AUTORIZADO', 'EMPACADO')
                            GROUP BY
                            LP.CODARTICULO
                        )

                        SELECT 
                            S.CODALMACEN
                            , S.CODARTICULO
                            , SUM(S.STOCK) - ISNULL(CSR.STOCK, 0) STOCK
                            , 0 STOCK_A_SERVIR
                            , ISNULL(CSR.STOCK, 0)
                        FROM 
                            STOCKS S
                            LEFT JOIN CTE_STOCK_RESERVADO CSR ON CSR.CODARTICULO = S.CODARTICULO
                        WHERE
                            (S.CODARTICULO = @CODARTICULO OR ISNULL(@CODARTICULO, 0) = 0)
                            AND S.CODALMACEN = 'ZAV'
                        GROUP BY
                            S.CODALMACEN
                            , S.CODARTICULO
                            , CSR.STOCK`)

            return result.recordset
        } catch (error) {
            console.error('Error al obtener stocks:', error);
            throw error;
        }
    }

    // Retorna los valores distintos de D1 (descuento global) que existen en clientes
    static async getSegmentosDescuento(): Promise<number[]> {
        const pool = await connectDb();
        const result = await pool.request().query(`
            SELECT DISTINCT TRY_CAST(D1 AS FLOAT) AS D1
            FROM CLIENTESCAMPOSLIBRES
            WHERE TRY_CAST(D1 AS FLOAT) > 0
            ORDER BY D1
        `);
        return result.recordset.map((r: any) => Number(r.D1));
    }

    static async getCatalogoSegmentos(): Promise<any[]> {
        const { tarifaBaseCatalogo } = getDbConfig();
        const pool = await connectDb();
        const result = await pool.request()
            .input('TARIFA', mssql.Int, tarifaBaseCatalogo)
            .query(`
                SELECT DISTINCT A.CODARTICULO, A.REFPROVEEDOR,
                    ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                    PV.PNETO AS PRECIO_BASE,
                    ${STOCK_DISPONIBLE_SQL} AS STOCK_DISP
                FROM ARTICULOS A WITH(NOLOCK)
                    INNER JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON A.CODARTICULO = ACL.CODARTICULO
                    INNER JOIN PRECIOSVENTA PV WITH(NOLOCK) ON PV.CODARTICULO = A.CODARTICULO
                        AND PV.IDTARIFAV = @TARIFA
                WHERE A.TIPOARTICULO = 'A'
                    AND A.DESCATALOGADO = 'F'
                    AND ISNULL(A.NODTOAPLICABLE, 0) <> 1
                ORDER BY ACL.DESCRIPCIONLARGA
            `);
        return result.recordset;
    }

    static async getPrices(codarticulo: number, tarifa: number): Promise<any[]> {
        try {
            const pool = await connectDb();
            const result = await pool.request()
                .input('CODARTICULO', mssql.Int, !codarticulo ? 0 : Number(codarticulo))
                .input('TARIFA', mssql.Int, !tarifa ? 0: Number(tarifa))
                .query(`SELECT 
                            PV.IDTARIFAV
                            , PV.CODARTICULO
                            , PV.PNETO
                            , PV.PNETO2
                            , PV.CODMONEDA
                        FROM 
                            PRECIOSVENTA PV
                        WHERE
                            (PV.CODARTICULO = @CODARTICULO OR ISNULL(@CODARTICULO, 0) = 0)
                            AND (PV.IDTARIFAV = @TARIFA OR ISNULL(@TARIFA, 0) = 0)`)

            return result.recordset;
        } catch (error) {
            console.error('Error al obtener precios:', error);
            throw error;
        }
    }
}