import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';

const esquema = process.env.DB_ESQUEMA || 'dbo';

export class PedidosCtrlService {

    // Agrupa sub-pedidos por número base (EC-589, EC-589NI, EC-589P, etc. → un grupo "589")
    static async getPedidos(search: string, page: number, limit: number, estatus?: string): Promise<{ data: any[]; total: number }> {
        const pool = await connectDb();

        const dataRes = await pool.request()
            .query(`
                SELECT CP.ORDERID, CP.CLIENTEID,
                       LEFT(SUBSTRING(CP.ORDERID,4,50),
                           PATINDEX('%[^0-9]%', SUBSTRING(CP.ORDERID,4,50)+'X')-1) AS BASE_NUM,
                       ISNULL(
                           (SELECT TOP 1 EP.NOMBRE_CLIENTE FROM APP_ECOMMERCE_PEDIDOS EP WITH (NOLOCK)
                            WHERE EP.NUMERO_PEDIDO = LEFT(SUBSTRING(CP.ORDERID,4,50),
                                PATINDEX('%[^0-9]%', SUBSTRING(CP.ORDERID,4,50)+'X')-1)),
                           CAST(CP.CLIENTEID AS NVARCHAR)
                       ) AS NOMBRE_CLIENTE,
                       CP.ESTATUS, CP.FECHA,
                       ISNULL(CP.TOTALPRECIO, 0) AS TOTAL,
                       (SELECT COUNT(*) FROM ${esquema}.LINEA_PED LP WITH (NOLOCK) WHERE LP.ORDERID = CP.ORDERID) AS NLINEAS
                FROM ${esquema}.CABECERA_PED CP WITH (NOLOCK)
                WHERE CP.ORDERID LIKE 'EC-%'
                ORDER BY CP.FECHA DESC
            `);

        // Agrupar en TypeScript por BASE_NUM
        const map = new Map<string, any>();
        for (const r of dataRes.recordset) {
            const base = r.BASE_NUM as string;
            if (!map.has(base)) {
                const suffix = (r.ORDERID as string).replace(/^EC-\d+/, '');
                map.set(base, {
                    baseNum:       base,
                    baseOrderId:   `EC-${base}`,
                    nombreCliente: r.NOMBRE_CLIENTE,
                    clienteId:     r.CLIENTEID,
                    fecha:         r.FECHA,
                    subPedidos:    [],
                    totalGeneral:  0,
                });
            }
            const g = map.get(base)!;
            const suffix = (r.ORDERID as string).replace(/^EC-\d+/, '');
            g.subPedidos.push({
                ORDERID: r.ORDERID,
                SUFIJO:  suffix || 'Normal',
                ESTATUS: r.ESTATUS,
                TOTAL:   Number(r.TOTAL),
                NLINEAS: r.NLINEAS,
            });
            g.totalGeneral += Number(r.TOTAL);
        }

        let grupos = [...map.values()].map(g => ({
            ...g,
            estatusGeneral: g.subPedidos.some((s: any) => s.ESTATUS === 'PENDIENTE') ? 'PENDIENTE' : 'AUTORIZADO',
        }));

        // Filtro de estatus sobre el grupo
        if (estatus && estatus !== 'TODOS') {
            grupos = grupos.filter(g => g.estatusGeneral === estatus);
        }

        // Filtro de búsqueda
        if (search) {
            const q = search.toLowerCase();
            grupos = grupos.filter(g =>
                g.baseOrderId.toLowerCase().includes(q) ||
                g.nombreCliente.toLowerCase().includes(q)
            );
        }

        const total     = grupos.length;
        const safeLimit = limit === -1 ? total : Math.max(1, limit);
        const offset    = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        return { data: grupos.slice(offset, offset + safeLimit), total };
    }

    // Líneas de un CABECERA_PED con descripción de artículo y todos los descuentos
    static async getLineas(orderId: string): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('OID', mssql.NVarChar(50), orderId)
            .query(`
                SELECT LP.CODARTICULO,
                       ISNULL(A.DESCRIPCION, CAST(LP.CODARTICULO AS NVARCHAR)) AS DESCRIPCION,
                       LP.PRODUCTCOUNT    AS CANTIDAD,
                       LP.PRECIOBRUTO     AS PRECIO_BRUTO,
                       LP.PRECIOUNITARIO  AS PRECIO_FINAL,
                       ISNULL(LP.DESCUENTO1,     0) AS DESC1,
                       ISNULL(LP.DESCUENTO2,     0) AS DESC2,
                       ISNULL(LP.DESCUENTO3,     0) AS DESC3,
                       ISNULL(LP.DESCUENTO4,     0) AS DESC4,
                       ISNULL(LP.LOTE,          '') AS LOTE,
                       ISNULL(LP.TOTAL_BRUTO,    0) AS TOTAL_BRUTO,
                       ISNULL(LP.TOTAL_DESCUENTO,0) AS TOTAL_DESCUENTO
                FROM ${esquema}.LINEA_PED LP WITH (NOLOCK)
                LEFT JOIN ARTICULOS A WITH (NOLOCK) ON A.CODARTICULO = LP.CODARTICULO
                WHERE LP.ORDERID = @OID
                ORDER BY LP.CODARTICULO, LP.LOTE
            `);
        return res.recordset;
    }

    // Autoriza un pedido PENDIENTE → AUTORIZADO
    static async autorizar(orderId: string): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('OID', mssql.NVarChar(50), orderId)
            .query(`UPDATE ${esquema}.CABECERA_PED SET ESTATUS = 'AUTORIZADO' WHERE ORDERID = @OID`);
        await pool.request()
            .input('OID', mssql.NVarChar(50), orderId)
            .query(`
                INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, USUARIO, DETALLES)
                VALUES (@OID, 'PENDIENTE', 'AUTORIZADO', 'Control', 'Pedido autorizado desde panel de control')
            `);
    }

    // Elimina TODOS los sub-pedidos del mismo archivo y resetea para reprocesar
    static async eliminar(orderId: string): Promise<void> {
        // Extraer número base: EC-589P-2 → 589
        const match = orderId.match(/^EC-(\d+)/);
        if (!match) throw new Error(`ORDERID inválido: ${orderId}`);
        const numBase = match[1];
        const base    = `EC-${numBase}`;

        const pool = await connectDb();

        // Todos los sub-pedidos relacionados (EC-589, EC-589P, EC-589SD, EC-589NI, EC-589-1, ...)
        const relRes = await pool.request()
            .input('BASE',    mssql.NVarChar(50), base)
            .input('PATTERN', mssql.NVarChar(60), `${base}[^0-9]%`)
            .query(`
                SELECT ORDERID FROM ${esquema}.CABECERA_PED WITH (NOLOCK)
                WHERE ORDERID = @BASE OR ORDERID LIKE @PATTERN
            `);
        const orderIds: string[] = relRes.recordset.map((r: any) => r.ORDERID);

        for (const oid of orderIds) {
            await pool.request()
                .input('OID', mssql.NVarChar(50), oid)
                .query(`DELETE FROM ${esquema}.LINEA_PED     WHERE ORDERID = @OID`);
            await pool.request()
                .input('OID', mssql.NVarChar(50), oid)
                .query(`DELETE FROM ${esquema}.APP_PEDIDO_LOG WHERE ORDERID = @OID`);
            await pool.request()
                .input('OID', mssql.NVarChar(50), oid)
                .query(`DELETE FROM ${esquema}.CABECERA_PED  WHERE ORDERID = @OID`);
        }

        // Recuperar el registro en APP_ECOMMERCE_PEDIDOS para resetear el archivo
        const pedRes = await pool.request()
            .input('NUM', mssql.NVarChar(50), numBase)
            .query(`SELECT TOP 1 * FROM APP_ECOMMERCE_PEDIDOS WHERE NUMERO_PEDIDO = @NUM ORDER BY ID DESC`);
        const ped = pedRes.recordset[0];
        if (!ped) return;

        // Eliminar staging
        await pool.request()
            .input('ID', mssql.Int, ped.ID)
            .query(`DELETE FROM APP_ECOMMERCE_LINEAS WHERE ID_PEDIDO = @ID`);
        await pool.request()
            .input('ID', mssql.Int, ped.ID)
            .query(`DELETE FROM APP_ECOMMERCE_PEDIDOS WHERE ID = @ID`);

        // Renombrar .done → .txt para que pueda reprocesarse
        try {
            const rutaRes = await pool.request()
                .query(`SELECT RUTA FROM APP_ECOMMERCE_CONFIG WHERE ID = 1`);
            const ruta = rutaRes.recordset[0]?.RUTA ?? '';
            const archivoDone = path.join(ruta, ped.ARCHIVO + '.done');
            const archivoTxt  = path.join(ruta, ped.ARCHIVO);
            if (fs.existsSync(archivoDone)) fs.renameSync(archivoDone, archivoTxt);
            else if (fs.existsSync(archivoTxt + '.error')) fs.renameSync(archivoTxt + '.error', archivoTxt);
        } catch { /* si falla el rename el operador puede moverlo manualmente */ }
    }
}
