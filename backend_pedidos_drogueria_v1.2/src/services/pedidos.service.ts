import mssql from 'mssql'
import { connectDb } from "../db/db.conection";
import { PromocionesService } from "./promociones.service";
import { getDbConfig } from './dbconfig.service';
import 'dotenv/config'

const esquema = process.env.DB_ESQUEMA || 'dbo';

const TRANSICIONES_PERMITIDAS: Record<string, string[]> = {
    'PENDIENTE':                  ['PENDIENTE POR AUTORIZACION', 'AUTORIZADO', 'CANCELADO'],
    'PENDIENTE POR AUTORIZACION': ['AUTORIZADO', 'CANCELADO'],
    'AUTORIZADO':                 ['EMPACADO', 'CANCELADO'],
    'OK':                         ['CANCELADO'],
    'EMPACADO':                   ['FINALIZADO'],
    'ICG':                        ['CANCELADO'],
    // 'APROBACION PSICOTROPICOS' deliberadamente sin entrada: no debe poder cambiarse
    // desde el dropdown normal de estatus, solo vía aprobarPsicotropico().
};

export const ESTATUS_APROBACION_PSICOTROPICOS = 'APROBACION PSICOTROPICOS';

export class PedidosServices {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CABECERA_PED' AND COLUMN_NAME='OBSERVACIONES')
                ALTER TABLE ${esquema}.CABECERA_PED ADD OBSERVACIONES NVARCHAR(255) NULL
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='PORCENTAJEIVA')
                ALTER TABLE ${esquema}.LINEA_PED ADD PORCENTAJEIVA FLOAT NULL
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='MONTOIVA')
                ALTER TABLE ${esquema}.LINEA_PED ADD MONTOIVA FLOAT NULL
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_SEQ')
                    CREATE TABLE ${esquema}.APP_PEDIDO_SEQ (ULTIMO_ID INT NOT NULL DEFAULT 0)
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM ${esquema}.APP_PEDIDO_SEQ)
                    INSERT INTO ${esquema}.APP_PEDIDO_SEQ VALUES (0)
            `);
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='APP_PEDIDO_LOG')
                    CREATE TABLE ${esquema}.APP_PEDIDO_LOG (
                        ID           INT IDENTITY(1,1) PRIMARY KEY,
                        ORDERID      VARCHAR(50)   NOT NULL,
                        EST_ANTERIOR VARCHAR(50)   NULL,
                        EST_NUEVO    VARCHAR(50)   NOT NULL,
                        CODUSUARIO   INT           NULL,
                        USUARIO      VARCHAR(100)  NULL,
                        FECHA        DATETIME      NOT NULL DEFAULT GETDATE(),
                        DETALLES     NVARCHAR(500) NULL
                    )
            `);
            console.log('Tablas de pedidos verificadas.');
        } catch (err) {
            console.error('Advertencia en PedidosServices.initTablas:', err);
        }
    }

    static async reservarNumero(): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request().query(`
            UPDATE ${esquema}.APP_PEDIDO_SEQ SET ULTIMO_ID = ULTIMO_ID + 1
            OUTPUT INSERTED.ULTIMO_ID
        `);
        return res.recordset[0].ULTIMO_ID as number;
    }

    static async getSeq(): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request().query(`SELECT ULTIMO_ID FROM ${esquema}.APP_PEDIDO_SEQ`);
        return res.recordset[0]?.ULTIMO_ID ?? 0;
    }

    static async setSeq(valor: number): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('V', mssql.Int, valor)
            .query(`UPDATE ${esquema}.APP_PEDIDO_SEQ SET ULTIMO_ID = @V`);
    }

    private static async tieneArticulosPsicotropicos(codigos: number[]): Promise<boolean> {
        if (codigos.length === 0) return false;
        const pool = await connectDb();
        const request = pool.request();
        const placeholders = codigos.map((id, i) => { request.input(`cod${i}`, id); return `@cod${i}`; }).join(',');
        request.input('dptoPsico', mssql.Int, getDbConfig().dptoPsicotropicos);
        const result = await request.query(`SELECT COUNT(*) AS CNT FROM ARTICULOS WHERE CODARTICULO IN (${placeholders}) AND SECCION = @dptoPsico`);
        return result.recordset[0].CNT > 0;
    }

    static async postPedidosCabecera(pedido: any, codusuario?: number, usuario?: string) {
        try {
            console.log('Datos recibidos para el pedido:', pedido);
            const { clienteId, codVendedor, totalPed, lineas, sufijo, promocionesAplicadas } = pedido;
            // Si el frontend pre-asignó un número, úsalo; si no, reserva uno nuevo
            let orderId: string;
            if (pedido.orderId) {
                orderId = String(pedido.orderId);
            } else {
                const num = await PedidosServices.reservarNumero();
                orderId = sufijo ? `${num}${sufijo}` : String(num);
            }

            const requierePsicotropicos = await this.tieneArticulosPsicotropicos(lineas.map((l: any) => l.codarticulo));
            const estatusInicial = requierePsicotropicos ? ESTATUS_APROBACION_PSICOTROPICOS : 'PENDIENTE';

            const pool = await connectDb()
            const result = await pool.request()
                .input('ORDERID', mssql.NVarChar, orderId)
                .input('CLIENTEID', mssql.Int, clienteId)
                .input('CODVENDEDOR', mssql.Int, codVendedor)
                .input('TOTALPRECIO', mssql.Float, totalPed)
                .input('ESTATUS', mssql.VarChar, estatusInicial)
                .query(`INSERT INTO ${esquema}.CABECERA_PED (
                            ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO
                        ) VALUES (
                            @ORDERID, @CLIENTEID, GETDATE(), @ESTATUS,
                            ISNULL(NULLIF((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL WHERE CCL.CODCLIENTE = @CLIENTEID AND CCL.CODVENDEDOR IS NOT NULL AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR)))!=''), 0), @CODVENDEDOR),
                            @TOTALPRECIO
                        );`)


            const insertLineas = await this.postPedidosLinea(lineas, orderId)

            if (Number(result.rowsAffected) === 0 || insertLineas.success === false) {
                return {
                    success: false,
                    message: 'No se pudo insertar el pedido'
                }
            }

            await PromocionesService.registrarAplicadas(orderId, promocionesAplicadas);
            await PedidosServices.registrarLog(orderId, null, estatusInicial, codusuario, usuario, `Pedido creado. Cliente: ${clienteId}. Total: ${totalPed}`);

            return {
                success: true,
                message: 'El pedido fue insertado de forma satisfactoria',
                orderId
            }

        } catch (error) {
            console.error('Error al subir el pedido: ', error)
            return {
                success: false,
                message: 'Hubo un fallo con la base de datos',
                error: error
            }
        }
    }

    static async postPedidosLinea(lineas: any[], orderId: string) {
        try {
            const pool = await connectDb();

            // 1. OBTENER REFERENCIAS DE FORMA MASIVA
            // Extraemos los IDs únicos para la consulta
            const idsArticulos = [...new Set(lineas.map(l => l.codarticulo))];

            // Consultamos todas las referencias de una sola vez
            const refRequest = pool.request();
            const refPlaceholders = idsArticulos.map((id, i) => {
                refRequest.input(`id${i}`, id);
                return `@id${i}`;
            }).join(',');

            const refResult = await refRequest
                .query(`SELECT CODARTICULO, REFPROVEEDOR FROM ARTICULOS WHERE CODARTICULO IN (${refPlaceholders})`);
            
            // Creamos un mapa { id: referencia } para búsqueda rápida
            const mapaReferencias: Record<number, string> = {};
            refResult.recordset.forEach(row => {
                mapaReferencias[row.CODARTICULO] = row.REFPROVEEDOR;
            });

            // 2. PREPARAR LA TABLA EN MEMORIA
            const tablaLineas = new mssql.Table(`${esquema}.LINEA_PED`); 
            tablaLineas.create = false;

            tablaLineas.columns.add('ORDERID', mssql.VarChar(50), { nullable: false });
            tablaLineas.columns.add('CODARTICULO', mssql.Int, { nullable: false });
            tablaLineas.columns.add('REFERENCIA', mssql.VarChar(50), { nullable: true });
            tablaLineas.columns.add('CODALMACEN', mssql.VarChar(10), { nullable: false });
            tablaLineas.columns.add('IDTARIFAV', mssql.Int, { nullable: false });
            tablaLineas.columns.add('PRODUCTCOUNT', mssql.Int, { nullable: false });
            tablaLineas.columns.add('PRECIOUNITARIO', mssql.Float, { nullable: false });
            
            tablaLineas.columns.add('DESCUENTO1', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO2', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO3', mssql.Float, { nullable: true });
            tablaLineas.columns.add('DESCUENTO4', mssql.Float, { nullable: true });
            tablaLineas.columns.add('PRECIOBRUTO', mssql.Float, { nullable: true });
            tablaLineas.columns.add('PORCENTAJEIVA', mssql.Float, { nullable: true });
            tablaLineas.columns.add('MONTOIVA', mssql.Float, { nullable: true });

            // 3. LLENAR LA TABLA
            for (let i = 0; i < lineas.length; i++) {
                const {
                    codarticulo, idtarifav, cantidad, precio,
                    DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO,
                    PORCENTAJEIVA, MONTOIVA
                } = lineas[i];

                const referenciaReal = mapaReferencias[codarticulo] || '';

                tablaLineas.rows.add(
                    orderId,
                    codarticulo,
                    referenciaReal,
                    getDbConfig().codAlmacen,
                    idtarifav,
                    cantidad,
                    precio,
                    DESCUENTO1 || 0,
                    DESCUENTO2 || 0,
                    DESCUENTO3 || 0,
                    DESCUENTO4 || 0,
                    PRECIOBRUTO || precio,
                    PORCENTAJEIVA || 0,
                    MONTOIVA || 0
                );
            }

            // 4. EJECUTAR BULK INSERT
            const result = await pool.request().bulk(tablaLineas);
            
            return {
                success: true,
                message: `Se insertaron ${lineas.length} líneas correctamente`,
                filasAfectadas: result.rowsAffected
            };

        } catch (error) {
            console.error('Error al subir las líneas del pedido: ', error);
            return {
                success: false,
                message: 'Hubo un fallo con la base de datos al procesar el detalle',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async getPedidos(page: any = 1, limit: any = 10, estatus?: string, buscarId?: string,
                             clienteId?: string, codVendedor?: string, riesgo?: string, codruta?: string,
                             fechaDesde?: string, fechaHasta?: string, esPsicotropico?: boolean) {
        try {
            let validPage = Math.max(1, Number(page) || 1);
            let validLimit = Math.max(1, Number(limit) || 10);
            const offset = (validPage - 1) * validLimit;

            const pool = await connectDb();
            const req = pool.request()
                .input('OFFSET',       mssql.Int,        offset)
                .input('LIMIT',        mssql.Int,        validLimit)
                .input('ESTATUS',      mssql.VarChar(50), estatus    || null)
                .input('BUSCAR_ID',    mssql.VarChar(50), buscarId   ? `%${buscarId}%`   : null)
                .input('CLIENTE_ID',   mssql.Int,         clienteId  ? Number(clienteId)  : null)
                .input('COD_VENDEDOR', mssql.Int,         codVendedor ? Number(codVendedor) : null)
                .input('RIESGO',       mssql.VarChar(20), riesgo     || null)
                .input('CODRUTA',      mssql.Int,         codruta    ? Number(codruta)    : null)
                .input('FECHA_DESDE',  mssql.Date,        fechaDesde || null)
                .input('FECHA_HASTA',  mssql.Date,        fechaHasta || null)
                .input('PSICO',        mssql.Bit,         esPsicotropico ? 1 : null);

            const result = await req.query(`
                SELECT
                    CP.ORDERID, CP.CLIENTEID, CP.FECHA, CP.ESTATUS, CP.CODVENDEDOR, CP.TOTALPRECIO,
                    CP.OBSERVACIONES,
                    CL.NOMBRECLIENTE, CL.CIF, ISNULL(CL.NIF20, '') AS NIF20, CL.DIRECCION1, CL.ENVIODIRECION AS DIRECCION_ENVIO,
                    ISNULL(RUT.DESCRIPCION, '') AS RUTA,
                    V.NOMVENDEDOR,
                    CR.ESTATUS AS RIESGO_ESTATUS,
                    (SELECT SUM(LP.PRODUCTCOUNT) FROM ${esquema}.LINEA_PED LP WHERE LP.ORDERID = CP.ORDERID) AS TOTALUNIDADES
                FROM
                    ${esquema}.CABECERA_PED CP
                    LEFT JOIN CLIENTES CL ON CL.CODCLIENTE = CP.CLIENTEID
                    LEFT JOIN VENDEDORES V ON V.CODVENDEDOR = CP.CODVENDEDOR
                    LEFT JOIN CLIENTESCAMPOSLIBRES CLC ON CLC.CODCLIENTE = CP.CLIENTEID
                    LEFT JOIN RUTAS RUT ON RUT.CODRUTA = TRY_CAST(CLC.ZONA AS INT)
                    LEFT JOIN (
                        SELECT CL.CODCLIENTE,
                            CASE
                                WHEN CL.RIESGOCONCEDIDO = 0 THEN 'SIN LIMITE'
                                WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 100 THEN 'SUPERADO'
                                WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 80  THEN 'ALTO'
                                WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 30  THEN 'MEDIO'
                                ELSE 'BAJO'
                            END AS ESTATUS
                        FROM CLIENTES CL
                        LEFT JOIN TESORERIA T ON T.CODIGOINTERNO = CL.CODCLIENTE
                            AND T.ESTADO = 'P' AND T.ORIGEN = 'C' AND T.SERIE NOT LIKE '%P'
                        GROUP BY CL.CODCLIENTE, CL.RIESGOCONCEDIDO
                    ) CR ON CR.CODCLIENTE = CP.CLIENTEID
                WHERE
                    (@ESTATUS       IS NULL OR CP.ESTATUS    = @ESTATUS)
                    AND (@BUSCAR_ID    IS NULL OR CP.ORDERID    LIKE @BUSCAR_ID)
                    AND (@CLIENTE_ID   IS NULL OR CP.CLIENTEID  = @CLIENTE_ID)
                    AND (@COD_VENDEDOR IS NULL OR CP.CODVENDEDOR = @COD_VENDEDOR)
                    AND (@RIESGO       IS NULL OR CR.ESTATUS     = @RIESGO)
                    AND (@CODRUTA      IS NULL OR TRY_CAST(CLC.ZONA AS INT) = @CODRUTA)
                    AND (@FECHA_DESDE  IS NULL OR CAST(CP.FECHA AS DATE) >= @FECHA_DESDE)
                    AND (@FECHA_HASTA  IS NULL OR CAST(CP.FECHA AS DATE) <= @FECHA_HASTA)
                    AND (@PSICO        IS NULL OR (@PSICO = 1 AND CP.OBSERVACIONES IS NOT NULL AND CP.OBSERVACIONES <> ''))
                ORDER BY
                    CP.FECHA DESC
                OFFSET @OFFSET ROWS
                FETCH NEXT @LIMIT ROWS ONLY
            `);

            const countReq = pool.request()
                .input('ESTATUS2',       mssql.VarChar(50), estatus    || null)
                .input('BUSCAR_ID2',     mssql.VarChar(50), buscarId   ? `%${buscarId}%`   : null)
                .input('CLIENTE_ID2',    mssql.Int,         clienteId  ? Number(clienteId)  : null)
                .input('COD_VENDEDOR2',  mssql.Int,         codVendedor ? Number(codVendedor) : null)
                .input('RIESGO2',        mssql.VarChar(20), riesgo     || null)
                .input('CODRUTA2',       mssql.Int,         codruta    ? Number(codruta)    : null)
                .input('FECHA_DESDE2',   mssql.Date,        fechaDesde || null)
                .input('FECHA_HASTA2',   mssql.Date,        fechaHasta || null)
                .input('PSICO2',         mssql.Bit,         esPsicotropico ? 1 : null);

            const countResult = await countReq.query(`
                SELECT COUNT(*) AS TOTAL, ISNULL(SUM(CP.TOTALPRECIO), 0) AS TOTAL_USD
                FROM ${esquema}.CABECERA_PED CP
                LEFT JOIN CLIENTESCAMPOSLIBRES CLC ON CLC.CODCLIENTE = CP.CLIENTEID
                LEFT JOIN (
                    SELECT CL.CODCLIENTE,
                        CASE
                            WHEN CL.RIESGOCONCEDIDO = 0 THEN 'SIN LIMITE'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 100 THEN 'SUPERADO'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 80  THEN 'ALTO'
                            WHEN (ISNULL(SUM(T.IMPORTE),0) * 100.0 / CL.RIESGOCONCEDIDO) >= 30  THEN 'MEDIO'
                            ELSE 'BAJO'
                        END AS ESTATUS
                    FROM CLIENTES CL
                    LEFT JOIN TESORERIA T ON T.CODIGOINTERNO = CL.CODCLIENTE
                        AND T.ESTADO = 'P' AND T.ORIGEN = 'C' AND T.SERIE NOT LIKE '%P'
                    GROUP BY CL.CODCLIENTE, CL.RIESGOCONCEDIDO
                ) CR ON CR.CODCLIENTE = CP.CLIENTEID
                WHERE (@ESTATUS2       IS NULL OR CP.ESTATUS    = @ESTATUS2)
                    AND (@BUSCAR_ID2    IS NULL OR CP.ORDERID    LIKE @BUSCAR_ID2)
                    AND (@CLIENTE_ID2   IS NULL OR CP.CLIENTEID  = @CLIENTE_ID2)
                    AND (@COD_VENDEDOR2 IS NULL OR CP.CODVENDEDOR = @COD_VENDEDOR2)
                    AND (@RIESGO2       IS NULL OR CR.ESTATUS     = @RIESGO2)
                    AND (@CODRUTA2      IS NULL OR TRY_CAST(CLC.ZONA AS INT) = @CODRUTA2)
                    AND (@FECHA_DESDE2  IS NULL OR CAST(CP.FECHA AS DATE) >= @FECHA_DESDE2)
                    AND (@FECHA_HASTA2  IS NULL OR CAST(CP.FECHA AS DATE) <= @FECHA_HASTA2)
                    AND (@PSICO2        IS NULL OR (@PSICO2 = 1 AND CP.OBSERVACIONES IS NOT NULL AND CP.OBSERVACIONES <> ''))
            `);

            return {
                success: true,
                message: 'Pedidos obtenidos correctamente',
                data: result.recordset,
                total: countResult.recordset[0].TOTAL,
                totalUSD: Number(countResult.recordset[0].TOTAL_USD)
            };

        } catch (error) {
            console.error('Error al obtener la lista de pedidos: ', error);
            return {
                success: false,
                message: 'Hubo un fallo al obtener los pedidos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async getConteo(orderId: string) {
        try {
            const pool = await connectDb();
            const result = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`
                    SELECT
                        PC.IDCONTEO,
                        CONVERT(VARCHAR(16), PC.FECHA, 120)  AS FECHA_CONTEO,
                        PC.ESTADO                            AS ESTADO_CONTEO,
                        RTRIM(PC.ESTADOPED)                  AS ESTADOPED,
                        LP.CODARTICULO,
                        ACL.DESCRIPCIONLARGA                 AS DESCRIPCION,
                        LP.PRODUCTCOUNT                      AS CANTPEDIDA,
                        ISNULL(CL.UNIDADES, 0)               AS CANTCONTADA,
                        LP.PRECIOUNITARIO
                    FROM ${esquema}.LINEA_PED LP WITH(NOLOCK)
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ACL WITH(NOLOCK) ON ACL.CODARTICULO = LP.CODARTICULO
                    OUTER APPLY (
                        SELECT TOP 1 PC2.IDCONTEO, PC2.FECHA, PC2.ESTADO, PC2.ESTADOPED
                        FROM PEDIDOS_CONTEOS PC2 WITH(NOLOCK)
                        WHERE PC2.IDPEDIDO COLLATE DATABASE_DEFAULT
                            = CAST(LP.ORDERID AS NVARCHAR(50)) COLLATE DATABASE_DEFAULT
                        ORDER BY PC2.FECHA DESC
                    ) PC
                    LEFT JOIN CONTEOSLIN CL WITH(NOLOCK)
                        ON  CL.IDCONTEO COLLATE DATABASE_DEFAULT = PC.IDCONTEO COLLATE DATABASE_DEFAULT
                        AND CL.CODARTICULO = LP.CODARTICULO
                    WHERE LP.ORDERID = @ORDERID
                    ORDER BY ACL.DESCRIPCIONLARGA
                `);

            const rows = result.recordset;
            if (!rows.length) return { success: true, data: null };

            return {
                success: true,
                data: {
                    idConteo:     rows[0].IDCONTEO    ?? null,
                    fechaConteo:  rows[0].FECHA_CONTEO ?? null,
                    estadoConteo: rows[0].ESTADO_CONTEO ?? null,
                    estadoPed:    rows[0].ESTADOPED    ?? null,
                    lineas: rows.map((l: any) => ({
                        codarticulo: l.CODARTICULO,
                        descripcion: l.DESCRIPCION || '',
                        cantPedida:  Number(l.CANTPEDIDA),
                        cantContada: Number(l.CANTCONTADA),
                        precio:      Number(l.PRECIOUNITARIO),
                    }))
                }
            };
        } catch (error) {
            console.error('Error al obtener conteo:', error);
            return { success: false, message: error instanceof Error ? error.message : String(error) };
        }
    }

    static async getPedidoById(orderId: string) {
        try {
            const pool = await connectDb();
            
            // 1. Buscamos la cabecera
            const cabeceraResult = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT * FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID`);

            if (cabeceraResult.recordset.length === 0) {
                return {
                    success: false,
                    message: 'El pedido solicitado no existe'
                };
            }

            const pedido = cabeceraResult.recordset[0];

            // 2. Buscamos las líneas con todos los campos de descuento
            const lineasResult = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`
                    SELECT
                        LP.LINEAID,
                        LP.CODARTICULO,
                        ACL.DESCRIPCIONLARGA AS DESCRIPCION,
                        LP.REFERENCIA,
                        LP.CODALMACEN,
                        LP.IDTARIFAV,
                        LP.PRODUCTCOUNT,
                        LP.PRECIOUNITARIO,
                        ISNULL(LP.PRECIOBRUTO, LP.PRECIOUNITARIO) AS PRECIOBRUTO,
                        ISNULL(LP.DESCUENTO1, 0) AS DESCUENTO1,
                        ISNULL(LP.DESCUENTO2, 0) AS DESCUENTO2,
                        ISNULL(LP.DESCUENTO3, 0) AS DESCUENTO3,
                        ISNULL(LP.DESCUENTO4, 0) AS DESCUENTO4,
                        LP.TOTALLINEA,
                        ISNULL(PCL.DIASPROTECCION, 0) AS DIASPROTECCION,
                        ISNULL(ARTICULOS.NODTOAPLICABLE, 0) AS NODTOAPLICABLE,
                        ISNULL(LP.PORCENTAJEIVA, 0) AS PORCENTAJEIVA,
                        ISNULL(LP.MONTOIVA, 0) AS MONTOIVA,
                        ISNULL(LV.LOTE, '') AS LOTE,
                        ISNULL(LV.FECHA_VEN, '') AS FECHA_VENCIMIENTO
                    FROM
                        ${esquema}.LINEA_PED LP
                        INNER JOIN ARTICULOS ON LP.CODARTICULO = ARTICULOS.CODARTICULO
                        LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON LP.CODARTICULO = ACL.CODARTICULO
                        LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                        OUTER APPLY (
                            SELECT TOP 1
                                AL.CODBARRAS AS LOTE,
                                CONVERT(VARCHAR(10), AL.GARANTIACOMPRA, 103) AS FECHA_VEN
                            FROM ARTICULOSLIN AL
                            WHERE AL.CODARTICULO = LP.CODARTICULO
                              AND AL.GARANTIACOMPRA IS NOT NULL
                            ORDER BY AL.GARANTIACOMPRA ASC
                        ) LV
                    WHERE
                        LP.ORDERID = @ORDERID
                `);

            pedido.lineas = lineasResult.recordset;

            return {
                success: true,
                message: 'Detalle del pedido obtenido correctamente',
                data: pedido
            };

        } catch (error) {
            console.error(`Error al obtener el detalle del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al obtener el detalle del pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async updatePedidoCompleto(orderId: string, pedido: any) {
        let transaction: mssql.Transaction | null = null;
        
        try {
            const { clienteId, codVendedor, totalPed, lineas } = pedido;
            
            const pool = await connectDb();
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            // 1. Verificar que el pedido existe y está PENDIENTE
            const checkReq = new mssql.Request(transaction);
            const checkRes = await checkReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID`);

            if (checkRes.recordset.length === 0) {
                await transaction.rollback();
                return { success: false, message: 'El pedido no existe' };
            }

            if (checkRes.recordset[0].ESTATUS !== 'PENDIENTE') {
                await transaction.rollback();
                return { success: false, message: 'Solo se pueden editar pedidos en estatus PENDIENTE' };
            }

            // 2. Actualizar la Cabecera (Totales, Vendedor o Cliente si cambió)
            const updateCabeceraReq = new mssql.Request(transaction);
            await updateCabeceraReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('CLIENTEID', mssql.Int, clienteId)
                .input('CODVENDEDOR', mssql.Int, codVendedor)
                .input('TOTALPRECIO', mssql.Decimal(18, 2), totalPed)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET CLIENTEID = @CLIENTEID,
                        CODVENDEDOR = ISNULL((SELECT CODVENDEDOR FROM CLIENTES WHERE CODCLIENTE = @CLIENTEID), @CODVENDEDOR),
                        TOTALPRECIO = @TOTALPRECIO
                    WHERE ORDERID = @ORDERID
                `);

            // 3. Borrar todas las líneas actuales de este pedido
            const deleteLineasReq = new mssql.Request(transaction);
            await deleteLineasReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.LINEA_PED WHERE ORDERID = @ORDERID`);

            // 4. Preparar la tabla en memoria para la Inserción Masiva (Bulk) de las nuevas líneas
            const tablaLineas = new mssql.Table(`${esquema}.LINEA_PED`);
            tablaLineas.create = false;

            tablaLineas.columns.add('ORDERID',       mssql.VarChar(50),    { nullable: false });
            tablaLineas.columns.add('CODARTICULO',   mssql.Int,            { nullable: false });
            tablaLineas.columns.add('REFERENCIA',    mssql.VarChar(50),    { nullable: true  });
            tablaLineas.columns.add('CODALMACEN',    mssql.VarChar(10),    { nullable: false });
            tablaLineas.columns.add('IDTARIFAV',     mssql.Int,            { nullable: false });
            tablaLineas.columns.add('PRODUCTCOUNT',  mssql.Int,            { nullable: false });
            tablaLineas.columns.add('PRECIOUNITARIO',mssql.Decimal(18, 2), { nullable: false });
            tablaLineas.columns.add('DESCUENTO1',    mssql.Float,          { nullable: true  });
            tablaLineas.columns.add('DESCUENTO2',    mssql.Float,          { nullable: true  });
            tablaLineas.columns.add('DESCUENTO3',    mssql.Float,          { nullable: true  });
            tablaLineas.columns.add('DESCUENTO4',    mssql.Float,          { nullable: true  });
            tablaLineas.columns.add('PRECIOBRUTO',   mssql.Float,          { nullable: true  });

            for (let i = 0; i < lineas.length; i++) {
                const { codarticulo, referencia, codalmacen, idtarifav, cantidad, precio,
                        DESCUENTO1, DESCUENTO2, DESCUENTO3, DESCUENTO4, PRECIOBRUTO } = lineas[i];
                tablaLineas.rows.add(
                    orderId,
                    codarticulo,
                    referencia || '',
                    codalmacen,
                    idtarifav,
                    cantidad,
                    precio,
                    DESCUENTO1 || 0,
                    DESCUENTO2 || 0,
                    DESCUENTO3 || 0,
                    DESCUENTO4 || 0,
                    PRECIOBRUTO || precio
                );
            }

            // 5. Ejecutar la inserción masiva de las líneas bajo la misma transacción
            const bulkReq = new mssql.Request(transaction);
            await bulkReq.bulk(tablaLineas);

            // 6. Si todo salió perfecto, confirmamos los cambios en la base de datos
            await transaction.commit();

            return {
                success: true,
                message: 'El pedido fue actualizado de forma satisfactoria'
            };

        } catch (error) {
            // Si ocurre cualquier error, revertimos absolutamente todo
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Error al intentar hacer rollback:', rollbackError);
                }
            }
            console.error(`Error al actualizar el pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo crítico al actualizar el pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async deletePedido(orderId: string) {
        let transaction: mssql.Transaction | null = null;

        try {
            const pool = await connectDb();
            transaction = new mssql.Transaction(pool);
            await transaction.begin();

            // 1. Borrar promociones aplicadas
            const deletePromoReq = new mssql.Request(transaction);
            await deletePromoReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.APP_PEDIDO_PROMOCIONES WHERE ORDERID = @ORDERID`);

            // 2. Borrar líneas
            const deleteLineasReq = new mssql.Request(transaction);
            await deleteLineasReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.LINEA_PED WHERE ORDERID = @ORDERID`);

            // 2. Borrar luego la cabecera (Maestro)
            const deleteCabeceraReq = new mssql.Request(transaction);
            const result = await deleteCabeceraReq
                .input('ORDERID', mssql.VarChar(50), orderId)
                .query(`DELETE FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID`);

            // Verificamos si realmente se borró la cabecera (por si enviaron un ID que no existe)
            if (Number(result.rowsAffected[0]) === 0) {
                await transaction.rollback();
                return {
                    success: false,
                    message: 'No se pudo eliminar. El pedido no existe.'
                };
            }

            // 3. Confirmar la transacción si todo salió bien
            await transaction.commit();

            return {
                success: true,
                message: 'El pedido y todos sus artículos fueron eliminados de forma satisfactoria'
            };

        } catch (error) {
            // Revertir en caso de cualquier fallo
            if (transaction) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Error al intentar hacer rollback:', rollbackError);
                }
            }
            console.error(`Error al eliminar el pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al eliminar el pedido de la base de datos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    static async updateEstatusPedido(orderId: string, nuevoEstatus: string, codusuario?: number, usuario?: string, visibilidadUsuario?: number) {
        try {
            const estatusLimpio = nuevoEstatus.trim().toUpperCase();
            const BIT_AUTORIZADOR = 2048;
            const BIT_BACKOFFICE  = 16;

            const pool = await connectDb();

            // Leer visibilidad directo de la BD — más confiable que el JWT
            let vis = visibilidadUsuario ?? 0;
            if (codusuario) {
                const visRes = await pool.request()
                    .input('COD', codusuario)
                    .query(`SELECT ISNULL(VISIBILIDAD, 0) AS VIS FROM VENDEDORES WHERE CODVENDEDOR = @COD`);
                if (visRes.recordset.length > 0) vis = Number(visRes.recordset[0].VIS);
            }

            const puedeAutorizar = (vis & BIT_AUTORIZADOR) !== 0 || (vis & BIT_BACKOFFICE) !== 0;

            // Validar permiso para transiciones que requieren AUTORIZADOR
            const requiereAutorizador = ['AUTORIZADO', 'CANCELADO'].includes(estatusLimpio);
            if (requiereAutorizador && !puedeAutorizar) {
                return {
                    success: false,
                    message: 'No tienes permiso para realizar esta transición. Se requiere el rol Autorizador.'
                };
            }

            // Obtener estatus actual para validar la transición
            const checkRes = await pool.request()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID_CHK`);

            if (checkRes.recordset.length === 0) {
                return { success: false, message: 'El pedido no existe' };
            }

            const estadoActual = checkRes.recordset[0].ESTATUS as string;
            const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] ?? [];
            if (!permitidos.includes(estatusLimpio)) {
                return {
                    success: false,
                    message: `No se puede cambiar de "${estadoActual}" a "${estatusLimpio}". Transición no permitida.`
                };
            }

            // Al pasar a PENDIENTE POR AUTORIZACION, verificar stock disponible por línea
            // (mientras estuvo en PENDIENTE no reservaba stock, otro pedido pudo haberlo agotado)
            if (estatusLimpio === 'PENDIENTE POR AUTORIZACION') {
                const lineasRes = await pool.request()
                    .input('ORDERID_LINEAS', mssql.VarChar(50), orderId)
                    .query(`SELECT LP.CODARTICULO, LP.PRODUCTCOUNT AS CANTIDAD
                            FROM ${esquema}.LINEA_PED LP WHERE LP.ORDERID = @ORDERID_LINEAS`);

                const faltantes: string[] = [];
                for (const linea of lineasRes.recordset) {
                    const stockRes = await pool.request()
                        .input('COD', mssql.Int, linea.CODARTICULO)
                        .input('ORDERID_EXCL', mssql.VarChar(50), orderId)
                        .input('ALMACEN', mssql.VarChar(10), getDbConfig().codAlmacen)
                        .query(`
                            SELECT
                                ISNULL((SELECT SUM(STOCK) FROM STOCKS WHERE CODARTICULO = @COD AND CODALMACEN = @ALMACEN), 0)
                                - ISNULL((
                                    SELECT SUM(LP2.PRODUCTCOUNT) FROM ${esquema}.CABECERA_PED CP2
                                    INNER JOIN ${esquema}.LINEA_PED LP2 ON LP2.ORDERID = CP2.ORDERID
                                    WHERE LP2.CODARTICULO = @COD
                                      AND CP2.ORDERID <> @ORDERID_EXCL
                                      AND CP2.ESTATUS IN ('PENDIENTE POR AUTORIZACION','APROBACION PSICOTROPICOS','AUTORIZADO','EMPACADO','OK')
                                ), 0) AS DISPONIBLE
                        `);
                    const disponible: number = stockRes.recordset[0]?.DISPONIBLE ?? 0;
                    if (disponible < linea.CANTIDAD) {
                        faltantes.push(`${linea.CODARTICULO} (necesita ${linea.CANTIDAD}, disponible ${disponible})`);
                    }
                }
                if (faltantes.length > 0) {
                    return {
                        success: false,
                        message: `Stock insuficiente para: ${faltantes.join('; ')}`
                    };
                }
            }

            const result = await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('ESTATUS', mssql.VarChar(50), estatusLimpio)
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET ESTATUS = @ESTATUS
                    WHERE ORDERID = @ORDERID
                `);

            // Validamos si realmente se encontró un pedido con ese ID
            if (Number(result.rowsAffected[0]) === 0) {
                return {
                    success: false,
                    message: 'No se pudo actualizar el estatus. El pedido no existe en el sistema.'
                };
            }

            await PedidosServices.registrarLog(orderId, estadoActual, estatusLimpio, codusuario, usuario);

            return {
                success: true,
                message: `El estatus del pedido se actualizó a ${estatusLimpio} de forma satisfactoria`
            };

        } catch (error) {
            console.error(`Error al actualizar el estatus del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al actualizar el estatus en la base de datos',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private static async registrarLog(
        orderId: string,
        estAnterior: string | null,
        estNuevo: string,
        codusuario?: number,
        usuario?: string,
        detalles?: string
    ): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request()
                .input('ORDERID',      mssql.VarChar(50),    orderId)
                .input('EST_ANT',      mssql.VarChar(50),    estAnterior ?? null)
                .input('EST_NUE',      mssql.VarChar(50),    estNuevo)
                .input('CODUSUARIO',   mssql.Int,            codusuario ?? null)
                .input('USUARIO',      mssql.VarChar(100),   usuario ?? null)
                .input('DETALLES',     mssql.NVarChar(500),  detalles ?? null)
                .query(`INSERT INTO ${esquema}.APP_PEDIDO_LOG
                        (ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, DETALLES)
                        VALUES (@ORDERID, @EST_ANT, @EST_NUE, @CODUSUARIO, @USUARIO, @DETALLES)`);
        } catch (err) {
            console.error('Error al registrar log de auditoría:', err);
        }
    }

    static async getAuditoria(orderId?: string, usuario?: string, page = 1, limit = 50) {
        try {
            const pool = await connectDb();
            const offset = (page - 1) * limit;
            const result = await pool.request()
                .input('ORDERID',    mssql.VarChar(50),   orderId  ? `%${orderId}%`  : '%')
                .input('USUARIO',    mssql.VarChar(100),  usuario  ? `%${usuario}%`  : '%')
                .input('LIMIT',      mssql.Int, limit)
                .input('OFFSET',     mssql.Int, offset)
                .query(`
                    SELECT ID, ORDERID, EST_ANTERIOR, EST_NUEVO, CODUSUARIO, USUARIO, FECHA, DETALLES
                    FROM ${esquema}.APP_PEDIDO_LOG
                    WHERE ORDERID LIKE @ORDERID AND ISNULL(USUARIO,'') LIKE @USUARIO
                    ORDER BY FECHA DESC
                    OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
                `);
            const countRes = await pool.request()
                .input('ORDERID2',   mssql.VarChar(50),   orderId  ? `%${orderId}%`  : '%')
                .input('USUARIO2',   mssql.VarChar(100),  usuario  ? `%${usuario}%`  : '%')
                .query(`SELECT COUNT(*) AS TOTAL FROM ${esquema}.APP_PEDIDO_LOG
                        WHERE ORDERID LIKE @ORDERID2 AND ISNULL(USUARIO,'') LIKE @USUARIO2`);
            return { success: true, data: result.recordset, total: countRes.recordset[0].TOTAL };
        } catch (error) {
            return { success: false, data: [], total: 0, message: String(error) };
        }
    }

    static async aprobarPsicotropico(orderId: string, codigoAprobacion: string, codusuario?: number, usuario?: string) {
        try {
            if (!codigoAprobacion || !codigoAprobacion.trim()) {
                return { success: false, message: 'El código de aprobación es requerido' };
            }
            const pool = await connectDb();
            const checkRes = await pool.request()
                .input('ORDERID_CHK', mssql.VarChar(50), orderId)
                .query(`SELECT ESTATUS FROM ${esquema}.CABECERA_PED WHERE ORDERID = @ORDERID_CHK`);

            if (checkRes.recordset.length === 0) {
                return { success: false, message: 'El pedido no existe' };
            }
            if (checkRes.recordset[0].ESTATUS !== ESTATUS_APROBACION_PSICOTROPICOS) {
                return { success: false, message: 'El pedido no está pendiente de aprobación de psicotrópicos' };
            }

            await pool.request()
                .input('ORDERID', mssql.VarChar(50), orderId)
                .input('OBSERVACIONES', mssql.NVarChar(255), codigoAprobacion.trim())
                .query(`
                    UPDATE ${esquema}.CABECERA_PED
                    SET ESTATUS = 'PENDIENTE POR AUTORIZACION', OBSERVACIONES = @OBSERVACIONES
                    WHERE ORDERID = @ORDERID
                `);

            await PedidosServices.registrarLog(orderId, ESTATUS_APROBACION_PSICOTROPICOS, 'PENDIENTE POR AUTORIZACION', codusuario, usuario, `Código aprobación: ${codigoAprobacion.trim()}`);

            return { success: true, message: 'Pedido aprobado y liberado a PENDIENTE' };
        } catch (error) {
            console.error(`Error al aprobar psicotrópico del pedido ${orderId}: `, error);
            return {
                success: false,
                message: 'Hubo un fallo al aprobar el pedido',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}