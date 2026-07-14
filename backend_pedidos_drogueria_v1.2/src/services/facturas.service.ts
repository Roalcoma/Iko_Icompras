import { connectDb } from '../db/db.conection';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'facturas_config.json');

interface FacturasConfig { rutaSalida: string; }

function loadConfig(): FacturasConfig {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch { /* ignore */ }
    return { rutaSalida: '' };
}

function saveConfig(cfg: FacturasConfig): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

export class FacturasService {

    // ─── CONFIG ───────────────────────────────────────────────────────────────
    static getConfig() {
        return { success: true, data: loadConfig() };
    }

    static setConfig(data: Partial<FacturasConfig>) {
        const current = loadConfig();
        const updated = { ...current, ...data };
        saveConfig(updated);
        return { success: true, data: updated };
    }

    // ─── GUARDAR PDF EN RUTA CONFIGURADA ──────────────────────────────────────
    static guardarPDF(numserie: string, numfactura: number, pdfBase64: string): { success: boolean; ruta?: string; message?: string } {
        const cfg = loadConfig();
        if (!cfg.rutaSalida) return { success: false, message: 'Ruta de salida no configurada' };
        try {
            if (!fs.existsSync(cfg.rutaSalida)) fs.mkdirSync(cfg.rutaSalida, { recursive: true });
            const filename = `Factura_${numserie}_${numfactura}.pdf`;
            const fullPath = path.join(cfg.rutaSalida, filename);
            const buf = Buffer.from(pdfBase64, 'base64');
            fs.writeFileSync(fullPath, buf);
            return { success: true, ruta: fullPath };
        } catch (err: any) {
            return { success: false, message: err.message };
        }
    }

    // ─── LISTAR FACTURAS ──────────────────────────────────────────────────────
    static async getFacturas(filters: {
        serie?: string; desde?: number; hasta?: number;
        cliente?: string; ruta?: string; page?: number; limit?: number;
    }) {
        const pool = await connectDb();
        const { serie, desde, hasta, cliente, ruta, page = 1, limit = 100 } = filters;
        const offset = (page - 1) * limit;

        const req = pool.request();
        if (serie)   req.input('SERIE',   serie);
        if (desde)   req.input('DESDE',   desde);
        if (hasta)   req.input('HASTA',   hasta);
        if (cliente) req.input('CLIENTE', `%${cliente}%`);
        if (ruta)    req.input('RUTA',    ruta);
        req.input('OFFSET', offset);
        req.input('LIMIT',  limit);

        const where = [
            serie   ? 'FV.NUMSERIE = @SERIE'                               : null,
            desde   ? 'FV.NUMFACTURA >= @DESDE'                            : null,
            hasta   ? 'FV.NUMFACTURA <= @HASTA'                            : null,
            cliente ? "(CLI.NOMBRECLIENTE LIKE @CLIENTE OR CAST(FV.CODCLIENTE AS NVARCHAR) LIKE @CLIENTE)" : null,
            ruta    ? 'CCAM.ZONA COLLATE DATABASE_DEFAULT = @RUTA'         : null,
            // Excluir notas de crédito/débito
            "FV.NUMSERIE NOT IN ('ZACN','ZAVN','ZACE','ZAVQ')",
        ].filter(Boolean).join(' AND ');

        const sql = `
SELECT FV.NUMSERIE, FV.NUMFACTURA, CAST(FV.FECHA AS DATE) AS FECHA,
    FV.CODCLIENTE, CLI.NOMBRECLIENTE,
    CCAM.ZONA AS RUTA,
    FCAM.NOCONTROL,
    FV.TOTALBRUTO, FV.TOTALIMPUESTOS, FV.TOTALNETO
FROM FACTURASVENTA FV WITH(NOLOCK)
INNER JOIN CLIENTES CLI WITH(NOLOCK) ON CLI.CODCLIENTE = FV.CODCLIENTE
LEFT  JOIN CLIENTESCAMPOSLIBRES CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = FV.CODCLIENTE
LEFT  JOIN FACTURASVENTACAMPOSLIBRES FCAM WITH(NOLOCK)
        ON FCAM.NUMSERIE COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
        AND FCAM.NUMFACTURA = FV.NUMFACTURA
WHERE ${where || '1=1'}
ORDER BY FV.NUMSERIE, FV.NUMFACTURA DESC
OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
`;
        const countSql = `
SELECT COUNT(*) AS TOTAL
FROM FACTURASVENTA FV WITH(NOLOCK)
INNER JOIN CLIENTES CLI WITH(NOLOCK) ON CLI.CODCLIENTE = FV.CODCLIENTE
LEFT  JOIN CLIENTESCAMPOSLIBRES CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = FV.CODCLIENTE
LEFT  JOIN FACTURASVENTACAMPOSLIBRES FCAM WITH(NOLOCK)
        ON FCAM.NUMSERIE COLLATE DATABASE_DEFAULT = FV.NUMSERIE COLLATE DATABASE_DEFAULT
        AND FCAM.NUMFACTURA = FV.NUMFACTURA
WHERE ${where || '1=1'}
`;
        const [r1, r2] = await Promise.all([
            req.query(sql),
            pool.request()
                .input('SERIE',   serie ?? null)
                .input('DESDE',   desde ?? null)
                .input('HASTA',   hasta ?? null)
                .input('CLIENTE', cliente ? `%${cliente}%` : null)
                .input('RUTA',    ruta ?? null)
                .query(countSql),
        ]);
        return { success: true, data: r1.recordset, total: r2.recordset[0]?.TOTAL ?? 0 };
    }

    // ─── DETALLE PARA PDF ─────────────────────────────────────────────────────
    static async getFacturaDetalle(numserie: string, numfactura: number) {
        const pool = await connectDb();

        // 1. Totales del pie (para decidir si tiene IVA)
        const totalesRes = await pool.request()
            .input('NS', numserie)
            .input('NF', numfactura)
            .query(`SELECT TOP 1 TOTALBRUTO, TOTALIMPUESTOS, TOTALNETO
                    FROM FACTURASVENTA WITH(NOLOCK)
                    WHERE NUMSERIE = @NS AND NUMFACTURA = @NF`);

        if (!totalesRes.recordset.length) return { success: false, message: 'Factura no encontrada' };
        const tot = totalesRes.recordset[0];
        const tieneIva = parseFloat(tot.TOTALIMPUESTOS || 0) > 0;

        // 2. NOCONTROL
        const ncRes = await pool.request()
            .input('NS', numserie)
            .input('NF', numfactura)
            .query(`SELECT TOP 1 NOCONTROL FROM FACTURASVENTACAMPOSLIBRES WITH(NOLOCK)
                    WHERE NUMSERIE COLLATE DATABASE_DEFAULT = @NS AND NUMFACTURA = @NF`);
        const nocontrol = ncRes.recordset[0]?.NOCONTROL ?? null;

        // 3. Líneas de la factura
        const colsConIva = `
    DBO.F_GET_COTIZACION(AVC.FECHA, 1) AS COTIZACION,
    VENTA.TOTAL / VENTA.UNIDADESTOTAL * DBO.F_GET_COTIZACION(AVC.FECHA, 1) AS PRECIO_BS_DTO,
    CAST((VENTA.TOTAL * (1 + (VENTA.IVA / 100.0))) * DBO.F_GET_COTIZACION(AVC.FECHA, 1) AS DECIMAL(16,2)) AS TOTAL_BS,
    VENTA.IVA AS IVA_ARTICULO,
    VENTA.TOTAL AS VENTA_TOTAL,
    VENTA.UNIDADESTOTAL AS VENTA_UNIDADES`;

        const colsSinIva = `
    CO.COTIZACION,
    CAST(AVC.TOTALCOSTEIVA * CO.COTIZACION AS DECIMAL(16,2)) AS IVA_BS,
    0 AS IVA_ARTICULO,
    VENTA.TOTAL AS VENTA_TOTAL,
    VENTA.UNIDADESTOTAL AS VENTA_UNIDADES`;

        const joinsCotiz = tieneIva
            ? ''
            : `INNER JOIN COTIZACIONES AS CO WITH(NOLOCK) ON CO.FECHA = CAST(FACVE.FECHA AS DATE)`;

        const extraCols = tieneIva ? colsConIva : colsSinIva;

        const sql = `
SELECT DISTINCT
    PED.SUPEDIDO AS PEDIDO,
    CAST(FACVE.FECHA AS DATE) AS FECHA,
    ALIN.CODBARRAS AS LOTE,
    TRY_CAST(TESO.FECHAVENCIMIENTO AS DATE) AS FECHA_VENCIMIENTO_PEDIDO,
    TRY_CAST(ALIN.GARANTIACOMPRA AS DATE) AS FECHA_VENCIMIENTO_ARTICULO,
    (SELECT COUNT(*) FROM BULTOS_CONTEO B WITH(NOLOCK)
     INNER JOIN PEDIDOS_CONTEOS PC WITH(NOLOCK) ON PC.IDCONTEO = B.IDCONTEO
     WHERE PC.IDPEDIDO = PED.SUPEDIDO COLLATE DATABASE_DEFAULT) AS BULTOS,
    ISNULL(CLI.CIF, CLI.NIF20) AS RIF_CLIENTE,
    CLI.NOMBRECLIENTE, CLI.CODCLIENTE,
    ISNULL(CLI.DIRECCION1, CLI.DIRECCION2) AS DIRECCION_CLIENTE,
    V.NOMVENDEDOR,
    ART.CODARTICULO, ART.DESCRIPCION,
    LIP.PRECIOUNITARIO AS PRECIOUNI_USD,
    VENTA.UNIDADESTOTAL AS CANTIDAD_PRODUCTOS,
    LIP.TOTALLINEA AS TOTAL_USD,
    LIP.DESCUENTO1, LIP.DESCUENTO2, LIP.DESCUENTO3, LIP.DESCUENTO4,
    AVC.TOTALBRUTO AS TOTBRUTO, AVC.TOTALIMPUESTOS AS TOTIMPUESTOS,
    AVC.TOTALNETO AS TOTNETO,
    LIP.PRECIOBRUTO AS PVP,
    AVC.NUMFAC AS NUMERO_FACTURA,
    CCAM.TIPO AS FORMA_PAGO,
    CONCAT(CCAM.ZONA COLLATE DATABASE_DEFAULT, ' - ', RUTAS.DESCRIPCION COLLATE DATABASE_DEFAULT) AS RUTA,
    FORM.DESCRIPCION AS FORMA_PAGO_DESC,
    CCAM.SICM,
    C.OBSERVACIONES AS PSICOTROPICO,
    ${extraCols}
FROM PEDVENTACAB AS PED WITH(NOLOCK)
    LEFT JOIN ALBVENTACAB AVC WITH(NOLOCK)
        ON AVC.NUMSERIE = PED.SERIEALBARAN AND AVC.NUMALBARAN = PED.NUMEROALBARAN AND AVC.N = PED.NALBARAN
    LEFT JOIN CABECERA_PED AS C WITH(NOLOCK) ON C.ORDERID = PED.SUPEDIDO COLLATE DATABASE_DEFAULT
    INNER JOIN CLIENTES AS CLI WITH(NOLOCK) ON CLI.CODCLIENTE = C.CLIENTEID
    INNER JOIN VENDEDORES AS V WITH(NOLOCK) ON V.CODVENDEDOR = C.CODVENDEDOR
    INNER JOIN FACTURASVENTA AS FACVE WITH(NOLOCK)
        ON FACVE.NUMSERIE = AVC.NUMSERIEFAC AND FACVE.NUMFACTURA = AVC.NUMFAC
    LEFT JOIN LINEA_PED AS LIP WITH(NOLOCK) ON LIP.ORDERID = PED.SUPEDIDO COLLATE DATABASE_DEFAULT
    INNER JOIN ARTICULOS AS ART WITH(NOLOCK) ON ART.CODARTICULO = LIP.CODARTICULO
    INNER JOIN CLIENTESCAMPOSLIBRES AS CCAM WITH(NOLOCK) ON CCAM.CODCLIENTE = CLI.CODCLIENTE
    INNER JOIN TESORERIA AS TESO WITH(NOLOCK)
        ON TESO.SERIE = AVC.NUMSERIEFAC AND TESO.NUMERO = AVC.NUMFAC AND TESO.FECHACARTERA IS NOT NULL
    INNER JOIN FORMASPAGO AS FORM WITH(NOLOCK) ON FORM.CODFORMAPAGO = TESO.CODFORMAPAGO
    OUTER APPLY (
        SELECT TOP 1 CODBARRAS,
            COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) AS GARANTIACOMPRA
        FROM ARTICULOSLIN WITH(NOLOCK)
        WHERE CODARTICULO = ART.CODARTICULO
          AND COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) IS NOT NULL
        ORDER BY COALESCE(TRY_CONVERT(DATE, GARANTIACOMPRA, 103), TRY_CONVERT(DATE, GARANTIACOMPRA, 23)) DESC
    ) AS ALIN
    ${joinsCotiz}
    INNER JOIN ALBVENTALIN AS VENTA WITH(NOLOCK)
        ON VENTA.NUMSERIE = AVC.NUMSERIE AND VENTA.NUMALBARAN = AVC.NUMALBARAN
        AND VENTA.CODARTICULO = ART.CODARTICULO
    INNER JOIN IMPUESTOS AS IMP WITH(NOLOCK) ON IMP.TIPOIVA = VENTA.TIPOIMPUESTO
    INNER JOIN RUTAS AS RUTAS WITH(NOLOCK) ON RUTAS.CODRUTA = CCAM.ZONA COLLATE DATABASE_DEFAULT
WHERE AVC.NUMSERIEFAC = @NS AND AVC.NUMFAC = @NF AND VENTA.UNIDADESTOTAL <> 0
`;
        const lineasRes = await pool.request()
            .input('NS', numserie)
            .input('NF', numfactura)
            .query(sql);

        const rows = lineasRes.recordset;
        if (!rows.length) return { success: false, message: 'No se encontraron líneas para esta factura' };

        const p = rows[0];
        const fmtNum  = (x: any) => x != null ? parseFloat(x).toFixed(2) : '0.00';
        const fmtNum3 = (x: any) => x != null ? parseFloat(x).toFixed(3) : '0.000';
        const fmtFecha = (f: any) => {
            const s = String(f || '').split('T')[0].split(' ')[0];
            const parts = s.split('-');
            return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : s;
        };

        const tasa = parseFloat(p.COTIZACION || 1);
        let subRef = 0, ivaRef = 0, baseImponibleRef = 0, baseExentaRef = 0;
        let subBs  = 0, ivaBs  = 0, baseImponibleBs  = 0, baseExentaBs  = 0;

        const items = rows.map((r: any) => {
            const cant    = parseFloat(r.CANTIDAD_PRODUCTOS || 0);
            const pvpUsd  = parseFloat(r.PVP || 0);
            const d1 = parseFloat(r.DESCUENTO1 || 0) / 100;
            const d2 = parseFloat(r.DESCUENTO2 || 0) / 100;
            const d3 = parseFloat(r.DESCUENTO3 || 0) / 100;
            const d4 = parseFloat(r.DESCUENTO4 || 0) / 100;
            const ivaP = parseFloat(r.IVA_ARTICULO || 0) / 100;

            let precUUsd: number, precUBs: number, netoLinBs: number, netoLinUsd: number;
            let ivaLinBs: number, ivaLinUsd: number;

            if (tieneIva) {
                precUBs    = parseFloat(r.PRECIO_BS_DTO || 0);
                precUUsd   = tasa ? precUBs / tasa : 0;
                netoLinBs  = parseFloat(r.TOTAL_BS || 0);
                netoLinUsd = tasa ? Math.round(netoLinBs / tasa * 100) / 100 : 0;
                const subLinBs = Math.round(precUBs * cant * 100) / 100;
                ivaLinBs  = Math.round((netoLinBs - subLinBs) * 100) / 100;
                ivaLinUsd = tasa ? Math.round(ivaLinBs / tasa * 100) / 100 : 0;
                ivaLinBs  = Math.round(ivaLinUsd * tasa * 100) / 100;
            } else {
                const vtTotal = parseFloat(r.VENTA_TOTAL || 0);
                const vtUnid  = parseFloat(r.VENTA_UNIDADES || 0) || cant;
                precUUsd   = vtTotal / vtUnid;
                precUBs    = precUUsd * tasa;
                netoLinBs  = Math.round(precUBs * cant * 100) / 100;
                netoLinUsd = Math.round(precUUsd * cant * 100) / 100;
                ivaLinBs   = 0;
                ivaLinUsd  = 0;
            }

            subRef += Math.round(precUUsd * cant * 100) / 100;
            subBs  += Math.round(precUBs  * cant * 100) / 100;
            if (ivaP > 0) {
                baseImponibleRef += Math.round(precUUsd * cant * 100) / 100;
                baseImponibleBs  += Math.round(precUBs  * cant * 100) / 100;
            } else {
                baseExentaRef += Math.round(precUUsd * cant * 100) / 100;
                baseExentaBs  += Math.round(precUBs  * cant * 100) / 100;
            }

            return {
                Desc: r.DESCRIPCION, Cant: cant,
                Lote:  String(r.LOTE  || '-'),
                Vence: String(r.FECHA_VENCIMIENTO_ARTICULO  || '-').split('T')[0],
                PVP:   fmtNum(pvpUsd),
                D1: fmtNum(r.DESCUENTO1), D2: fmtNum(r.DESCUENTO2),
                D3: fmtNum(r.DESCUENTO3), D4: fmtNum(r.DESCUENTO4),
                PrecU:   fmtNum3(precUBs),
                PrecDolar: fmtNum3(precUUsd),
                IVA_USD: fmtNum(ivaLinUsd),
                IVA_V:   fmtNum(ivaLinBs),
                Neto:    fmtNum(netoLinBs),
            };
        });

        // Totales del pie: desde FACTURASVENTA (valor fiscal de ICG)
        const totalBruto = Math.round(parseFloat(tot.TOTALBRUTO  || 0) * 100) / 100;
        const totalIva   = Math.round(parseFloat(tot.TOTALIMPUESTOS || 0) * 100) / 100;
        const totalNeto  = Math.round(parseFloat(tot.TOTALNETO  || 0) * 100) / 100;

        ivaRef  = totalIva;
        subRef  = totalBruto;
        ivaBs   = Math.round(ivaRef  * tasa * 100) / 100;
        subBs   = Math.round(subRef  * tasa * 100) / 100;
        const netoBs = Math.round(totalNeto * tasa * 100) / 100;

        const header = {
            Pedido: p.PEDIDO || '',
            FacturaNo: String(p.NUMERO_FACTURA || numfactura),
            Fecha: fmtFecha(p.FECHA),
            FechaVencimiento: fmtFecha(p.FECHA_VENCIMIENTO_PEDIDO),
            RazonSocial: p.NOMBRECLIENTE || '',
            DireccionEnvio: p.DIRECCION_CLIENTE || '',
            Vendedor: p.NOMVENDEDOR || '',
            TasaVal: tasa, TasaStr: String(tasa),
            CondicionPago: p.FORMA_PAGO || 'CONTADO',
            RIF: p.RIF_CLIENTE || '',
            CodCliente: p.CODCLIENTE || '',
            Unidades: rows.reduce((s: number, r: any) => s + parseFloat(r.CANTIDAD_PRODUCTOS || 0), 0),
            Bultos: p.BULTOS ?? '-',
            SICM: String(p.SICM || '').trim() || '-',
            Ruta: p.RUTA || '-',
            Psicotropico: String(p.PSICOTROPICO || '').trim(),
            TipoDoc: 'Factura',
            SubTotalRef: fmtNum(subRef),         BaseExentaRef: fmtNum(baseExentaRef),
            BaseImponibleRef: fmtNum(baseImponibleRef), IVA_Ref: fmtNum(ivaRef),
            DescRef: '0.00',                     NetoRef: fmtNum(totalNeto),
            SubTotalBs: fmtNum(subBs),           BaseExentaBs: fmtNum(baseExentaBs),
            BaseImponibleBs: fmtNum(baseImponibleBs), IVA_Bs: fmtNum(ivaBs),
            DescBs: '0.00',                      NetoBs: fmtNum(netoBs),
        };

        return { success: true, data: { header, items, nocontrol } };
    }

    // ─── ASIGNAR NOCONTROL ────────────────────────────────────────────────────
    static async asignarNoControl(
        facturas: { numserie: string; numfactura: number }[],
        desdeNoControl: string   // formato "00-215826"
    ) {
        if (!facturas.length) return { success: false, message: 'No hay facturas seleccionadas' };

        // Parsear prefijo y parte numérica: "00-215826" → prefix="00-", num=215826
        const match = String(desdeNoControl).match(/^(.*?)(\d+)$/);
        if (!match) return { success: false, message: 'Formato NOCONTROL inválido. Use formato XX-NNNNNN (ej: 00-215826)' };
        const prefix   = match[1];          // "00-"
        const startNum = parseInt(match[2], 10); // 215826

        const pool = await connectDb();
        const resultados: { numserie: string; numfactura: number; nocontrol: string }[] = [];

        for (let i = 0; i < facturas.length; i++) {
            const { numserie, numfactura } = facturas[i];
            const nc = `${prefix}${startNum + i}`;
            await pool.request()
                .input('NS', numserie)
                .input('NF', numfactura)
                .input('NC', nc)
                .query(`UPDATE FACTURASVENTACAMPOSLIBRES
                        SET NOCONTROL = @NC
                        WHERE NUMSERIE COLLATE DATABASE_DEFAULT = @NS AND NUMFACTURA = @NF`);
            resultados.push({ numserie, numfactura, nocontrol: nc });
        }

        return { success: true, data: resultados, message: `NOCONTROL asignado a ${facturas.length} facturas` };
    }

    // ─── LISTAR SERIES DISPONIBLES ────────────────────────────────────────────
    static async getSeries() {
        const pool = await connectDb();
        const res = await pool.request().query(`
            SELECT DISTINCT NUMSERIE AS serie
            FROM FACTURASVENTA WITH(NOLOCK)
            WHERE NUMSERIE NOT IN ('ZACN','ZAVN','ZACE','ZAVQ')
            ORDER BY NUMSERIE
        `);
        return { success: true, data: res.recordset.map((r: any) => r.serie) };
    }

    // ─── LISTAR RUTAS ─────────────────────────────────────────────────────────
    static async getRutas() {
        const pool = await connectDb();
        const res = await pool.request().query(`
            SELECT DISTINCT CODRUTA AS codruta, DESCRIPCION AS descripcion
            FROM RUTAS WITH(NOLOCK)
            ORDER BY CODRUTA
        `);
        return { success: true, data: res.recordset };
    }
}
