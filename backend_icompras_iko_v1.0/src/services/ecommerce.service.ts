import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import { connectDb } from '../db/db.conection';
import { PromocionesService }   from './promociones.service';
import { TriangulacionService } from './triangulacion.service';
import { getDbConfig }          from './dbconfig.service';

const VED        = Number(process.env.VED) || 1;
const esquema    = process.env.DB_ESQUEMA  || 'dbo';
const MAX_LINEAS = 18;

export class EcommerceService {

    private static escaneando = false;

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                -- ── Tablas propias de la integración ───────────────────────────────────

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_CONFIG')
                    CREATE TABLE APP_ECOMMERCE_CONFIG (
                        ID   INT PRIMARY KEY DEFAULT 1,
                        RUTA NVARCHAR(500) NOT NULL DEFAULT '',
                        CONSTRAINT CK_ECOMMERCE_CONFIG_ID CHECK (ID = 1)
                    );
                IF NOT EXISTS (SELECT 1 FROM APP_ECOMMERCE_CONFIG WHERE ID = 1)
                    INSERT INTO APP_ECOMMERCE_CONFIG (ID, RUTA) VALUES (1, '');

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_PEDIDOS')
                    CREATE TABLE APP_ECOMMERCE_PEDIDOS (
                        ID             INT IDENTITY PRIMARY KEY,
                        NUMERO_PEDIDO  NVARCHAR(50)  NOT NULL,
                        COD_CLIENTE    NVARCHAR(50),
                        NOMBRE_CLIENTE NVARCHAR(200),
                        RIF            NVARCHAR(50),
                        FECHA          DATETIME,
                        ESTATUS        NVARCHAR(50),
                        TOTAL          DECIMAL(18,2),
                        ARCHIVO        NVARCHAR(500),
                        PROCESADO      BIT          NOT NULL DEFAULT 0,
                        FECHA_IMPORT   DATETIME     NOT NULL DEFAULT GETDATE(),
                        MENSAJE_ERROR  NVARCHAR(500)    NULL,
                        DESCUENTO_PCT  DECIMAL(5,2)     NULL
                    );
                -- Columnas agregadas en versiones anteriores (instalaciones existentes)
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_ECOMMERCE_PEDIDOS' AND COLUMN_NAME='MENSAJE_ERROR')
                    ALTER TABLE APP_ECOMMERCE_PEDIDOS ADD MENSAJE_ERROR NVARCHAR(500) NULL;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_ECOMMERCE_PEDIDOS' AND COLUMN_NAME='DESCUENTO_PCT')
                    ALTER TABLE APP_ECOMMERCE_PEDIDOS ADD DESCUENTO_PCT DECIMAL(5,2) NULL;

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ECOMP_NUMARCH' AND object_id=OBJECT_ID('APP_ECOMMERCE_PEDIDOS'))
                    CREATE INDEX IX_ECOMP_NUMARCH ON APP_ECOMMERCE_PEDIDOS (NUMERO_PEDIDO, ARCHIVO);

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_LINEAS')
                    CREATE TABLE APP_ECOMMERCE_LINEAS (
                        ID              INT IDENTITY PRIMARY KEY,
                        ID_PEDIDO       INT          NOT NULL REFERENCES APP_ECOMMERCE_PEDIDOS(ID),
                        COD_ARTICULO    NVARCHAR(50),
                        DESCRIPCION     NVARCHAR(300),
                        CANTIDAD        INT,
                        PRECIO_UNITARIO DECIMAL(18,2),
                        LOTE            NVARCHAR(50)     NULL,
                        DESCUENTO1      DECIMAL(5,2)     NULL
                    );
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_ECOMMERCE_LINEAS' AND COLUMN_NAME='LOTE')
                    ALTER TABLE APP_ECOMMERCE_LINEAS ADD LOTE NVARCHAR(50) NULL;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_ECOMMERCE_LINEAS' AND COLUMN_NAME='DESCUENTO1')
                    ALTER TABLE APP_ECOMMERCE_LINEAS ADD DESCUENTO1 DECIMAL(5,2) NULL;

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ECOML_IDPEDIDO' AND object_id=OBJECT_ID('APP_ECOMMERCE_LINEAS'))
                    CREATE INDEX IX_ECOML_IDPEDIDO ON APP_ECOMMERCE_LINEAS (ID_PEDIDO);

                -- Log de cambios de estatus de pedidos
                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_PEDIDO_LOG')
                    CREATE TABLE ${esquema}.APP_PEDIDO_LOG (
                        ID           INT IDENTITY PRIMARY KEY,
                        ORDERID      NVARCHAR(50)  NOT NULL,
                        EST_ANTERIOR NVARCHAR(50)      NULL,
                        EST_NUEVO    NVARCHAR(50)  NOT NULL,
                        USUARIO      NVARCHAR(100)     NULL,
                        DETALLES     NVARCHAR(500)     NULL,
                        FECHA        DATETIME      NOT NULL DEFAULT GETDATE()
                    );

                -- ── Columnas extendidas sobre tablas ICG ───────────────────────────────

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='LOTE')
                    ALTER TABLE ${esquema}.LINEA_PED ADD LOTE NVARCHAR(50) NULL;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='TOTAL_BRUTO')
                    ALTER TABLE ${esquema}.LINEA_PED ADD TOTAL_BRUTO FLOAT NULL;
                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='LINEA_PED' AND COLUMN_NAME='TOTAL_DESCUENTO')
                    ALTER TABLE ${esquema}.LINEA_PED ADD TOTAL_DESCUENTO FLOAT NULL;
            `);
            console.log('[Ecommerce] Tablas verificadas/creadas');
        } catch (err) {
            console.error('[Ecommerce] Error en initTablas:', err);
        }
    }

    static async getConfig(): Promise<string> {
        const pool = await connectDb();
        const res = await pool.request()
            .query(`SELECT RUTA FROM APP_ECOMMERCE_CONFIG WHERE ID = 1`);
        return res.recordset[0]?.RUTA ?? '';
    }

    static async setConfig(ruta: string): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('RUTA', mssql.NVarChar(500), ruta)
            .query(`UPDATE APP_ECOMMERCE_CONFIG SET RUTA = @RUTA WHERE ID = 1`);
    }

    private static parsearArchivo(contenido: string, nombreArchivo: string): { pedido: any; lineas: any[] } | null {
        const lineas = contenido.split('\n').map(l => l.trim()).filter(Boolean);
        let pedido: any = null;
        const items: any[] = [];

        for (const linea of lineas) {
            const f = linea.split('|');
            if (f.length < 5) continue;
            // Header: campo[2] es fecha (YYYY-MM-DD ...)
            if (/^\d{4}-\d{2}-\d{2}/.test(f[2])) {
                const totalBruto = parseFloat(f[16] ?? '0') || 0;
                const descMonto  = parseFloat(f[17] ?? '0') || 0;
                pedido = {
                    numeroPedido:  (f[0]  ?? '').trim(),
                    codCliente:    (f[1]  ?? '').trim(),
                    fecha:         (f[2]  ?? '').trim(),
                    estatus:       (f[3]  ?? '').trim(),
                    nombreCliente: (f[10] ?? '').trim(),
                    rif:           (f[11] ?? '').trim(),
                    total:         totalBruto,
                    descuentoPct:  totalBruto > 0 ? Math.round(descMonto / totalBruto * 10000) / 100 : 0,
                    archivo:       nombreArchivo,
                };
            } else {
                // f[4]=cantidad solicitada, f[19]=cantdesp (contada); usamos contada
                const cantDesp = parseInt(f[19] ?? '0') || 0;
                if (cantDesp <= 0) continue; // no contado o sin stock: no insertar
                const dtoF47 = parseFloat(f[47] ?? '0') || 0;
                const dtoF51 = parseFloat(f[51] ?? '0') || 0;
                items.push({
                    codArticulo:    (f[2] ?? '').trim(),
                    descripcion:    (f[3] ?? '').trim(),
                    cantidad:       cantDesp,
                    precioUnitario: parseFloat(f[5] ?? '0') || 0,
                    lote:           (f[24] ?? '').trim(),
                    descuento1:     dtoF47 !== 0 ? dtoF47 : dtoF51,
                });
            }
        }

        return pedido ? { pedido, lineas: items } : null;
    }

    static async escanearCarpeta(): Promise<{ importados: number; errores: number; mensaje?: string }> {
        if (EcommerceService.escaneando) return { importados: 0, errores: 0, mensaje: 'Scan anterior todavía en curso — omitido' };
        EcommerceService.escaneando = true;
        try {
            return await EcommerceService._escanearCarpetaInterno();
        } finally {
            EcommerceService.escaneando = false;
        }
    }

    private static async _escanearCarpetaInterno(): Promise<{ importados: number; errores: number; mensaje?: string }> {
        const ruta = await this.getConfig();
        if (!ruta) return { importados: 0, errores: 0, mensaje: 'Ruta de carpeta no configurada en Administración' };
        if (!fs.existsSync(ruta)) return { importados: 0, errores: 0, mensaje: `Carpeta no encontrada: ${ruta}` };

        const archivos = fs.readdirSync(ruta).filter(f => f.endsWith('.txt'));
        if (!archivos.length) return { importados: 0, errores: 0, mensaje: `Sin archivos .txt pendientes en: ${ruta}` };

        let importados = 0, errores = 0;

        for (const archivo of archivos) {
            const rutaArchivo = path.join(ruta, archivo);
            let idPedidoActual: number | null = null;
            try {
                const contenido = fs.readFileSync(rutaArchivo, 'utf-8');
                const parsed = this.parsearArchivo(contenido, archivo);
                if (!parsed) { errores++; continue; }

                const pool = await connectDb();

                // Evitar duplicados por numero + archivo
                const existe = await pool.request()
                    .input('NUM',  mssql.NVarChar(50),  parsed.pedido.numeroPedido)
                    .input('ARCH', mssql.NVarChar(500), archivo)
                    .query(`SELECT 1 FROM APP_ECOMMERCE_PEDIDOS WHERE NUMERO_PEDIDO = @NUM AND ARCHIVO = @ARCH`);

                if (existe.recordset.length > 0) {
                    try { fs.renameSync(rutaArchivo, rutaArchivo + '.done'); } catch {}
                    continue;
                }

                // INSERT atómico — previene duplicados por scans simultáneos
                const insRes = await pool.request()
                    .input('NUM',    mssql.NVarChar(50),   parsed.pedido.numeroPedido)
                    .input('COD',    mssql.NVarChar(50),   parsed.pedido.codCliente)
                    .input('NOMBRE', mssql.NVarChar(200),  parsed.pedido.nombreCliente)
                    .input('RIF',    mssql.NVarChar(50),   parsed.pedido.rif)
                    .input('FECHA',  mssql.DateTime,       new Date(parsed.pedido.fecha))
                    .input('ESTATUS',mssql.NVarChar(50),   parsed.pedido.estatus)
                    .input('TOTAL',  mssql.Decimal(18, 2), parsed.pedido.total)
                    .input('ARCH',    mssql.NVarChar(500),  archivo)
                    .input('DESC_PCT', mssql.Decimal(5, 2), parsed.pedido.descuentoPct)
                    .query(`
                        INSERT INTO APP_ECOMMERCE_PEDIDOS
                            (NUMERO_PEDIDO, COD_CLIENTE, NOMBRE_CLIENTE, RIF, FECHA, ESTATUS, TOTAL, ARCHIVO, DESCUENTO_PCT)
                        OUTPUT INSERTED.ID
                        SELECT @NUM, @COD, @NOMBRE, @RIF, @FECHA, @ESTATUS, @TOTAL, @ARCH, @DESC_PCT
                        WHERE NOT EXISTS (
                            SELECT 1 FROM APP_ECOMMERCE_PEDIDOS
                            WHERE NUMERO_PEDIDO = @NUM AND ARCHIVO = @ARCH
                        )
                    `);

                // Si rowsAffected=0, el otro scan ganó la carrera — no duplicamos
                if (!insRes.recordset.length) {
                    try { fs.renameSync(rutaArchivo, rutaArchivo + '.done'); } catch {}
                    continue;
                }

                const idPedido: number = insRes.recordset[0].ID;
                idPedidoActual = idPedido;

                for (const l of parsed.lineas) {
                    await pool.request()
                        .input('ID_PED', mssql.Int,           idPedido)
                        .input('COD',    mssql.NVarChar(50),  l.codArticulo)
                        .input('DESC',   mssql.NVarChar(300), l.descripcion)
                        .input('CANT',   mssql.Int,           l.cantidad)
                        .input('PRECIO', mssql.Decimal(18,2), l.precioUnitario)
                        .input('LOTE',   mssql.NVarChar(50),  l.lote ?? '')
                        .input('DTO1',   mssql.Decimal(5, 2), l.descuento1 ?? 0)
                        .query(`
                            INSERT INTO APP_ECOMMERCE_LINEAS
                                (ID_PEDIDO, COD_ARTICULO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, LOTE, DESCUENTO1)
                            VALUES (@ID_PED, @COD, @DESC, @CANT, @PRECIO, @LOTE, @DTO1)
                        `);
                }

                // Auto-aprobar: insertar directamente en CABECERA_PED
                const aprob = await this.aprobarPedido(idPedido);
                if (aprob.success) {
                    try { fs.renameSync(rutaArchivo, rutaArchivo + '.done'); } catch {}
                    console.log(`[Ecommerce] Pedido ${aprob.orderId} creado en Control de Estatus`);
                    importados++;
                } else {
                    // Marcar como error pero NO como done — permite revisar qué falló
                    try { fs.renameSync(rutaArchivo, rutaArchivo + '.error'); } catch {}
                    console.warn(`[Ecommerce] ${archivo}: no se pudo crear en Control de Estatus — ${aprob.message}`);
                    try {
                        await pool.request()
                            .input('ID',  mssql.Int,          idPedido)
                            .input('MSG', mssql.NVarChar(500), aprob.message.substring(0, 500))
                            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET MENSAJE_ERROR = @MSG WHERE ID = @ID`);
                    } catch {}
                    errores++;
                }
            } catch (e: any) {
                const msg = (e?.message ?? String(e)).substring(0, 500);
                console.error(`[Ecommerce] Error al importar ${archivo}:`, e);
                errores++;
                try { fs.renameSync(rutaArchivo, rutaArchivo + '.error'); } catch {}
                if (idPedidoActual !== null) {
                    try {
                        const pool2 = await connectDb();
                        await pool2.request()
                            .input('ID',  mssql.Int,           idPedidoActual)
                            .input('MSG', mssql.NVarChar(500), msg)
                            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET MENSAJE_ERROR = @MSG WHERE ID = @ID`);
                    } catch {}
                }
            }
        }

        return { importados, errores };
    }  // fin _escanearCarpetaInterno

    static async getPedidos(search: string, page: number, limit: number): Promise<{ data: any[]; total: number }> {
        const pool = await connectDb();
        const filtro = `%${search ?? ''}%`;
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;

        const totalRes = await pool.request()
            .input('F', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS T FROM APP_ECOMMERCE_PEDIDOS
                WHERE NOMBRE_CLIENTE LIKE @F OR NUMERO_PEDIDO LIKE @F OR RIF LIKE @F
            `);

        const dataRes = await pool.request()
            .input('F',   mssql.NVarChar, filtro)
            .input('OFF', mssql.Int, offset)
            .input('LIM', mssql.Int, safeLimit)
            .query(`
                SELECT * FROM APP_ECOMMERCE_PEDIDOS
                WHERE NOMBRE_CLIENTE LIKE @F OR NUMERO_PEDIDO LIKE @F OR RIF LIKE @F
                ORDER BY FECHA_IMPORT DESC
                OFFSET @OFF ROWS FETCH NEXT @LIM ROWS ONLY
            `);

        return { data: dataRes.recordset, total: totalRes.recordset[0].T };
    }

    static async getLineas(idPedido: number): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('ID', mssql.Int, idPedido)
            .query(`SELECT * FROM APP_ECOMMERCE_LINEAS WHERE ID_PEDIDO = @ID ORDER BY ID`);
        return res.recordset;
    }

    static async marcarProcesado(id: number, procesado: boolean): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID', mssql.Int, id)
            .input('P',  mssql.Bit, procesado ? 1 : 0)
            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET PROCESADO = @P WHERE ID = @ID`);
    }

    static async aprobarPedido(id: number): Promise<{ success: boolean; message: string; orderId?: string }> {
        const pool = await connectDb();

        // 1. Cargar cabecera del pedido ecommerce
        const pedRes = await pool.request()
            .input('ID', mssql.Int, id)
            .query(`SELECT * FROM APP_ECOMMERCE_PEDIDOS WHERE ID = @ID`);
        const ped = pedRes.recordset[0];
        if (!ped) return { success: false, message: 'Pedido no encontrado' };
        if (ped.PROCESADO) return { success: false, message: 'El pedido ya fue aprobado anteriormente' };

        const orderId = `EC-${ped.NUMERO_PEDIDO}`;

        // 2. Evitar duplicado en CABECERA_PED
        const dupRes = await pool.request()
            .input('OID', mssql.NVarChar(50), orderId)
            .query(`SELECT 1 FROM ${esquema}.CABECERA_PED WHERE ORDERID = @OID`);
        if (dupRes.recordset.length > 0)
            return { success: false, message: `El pedido ${orderId} ya existe en el sistema` };

        // 3. Líneas del pedido
        const lineasRes = await pool.request()
            .input('ID', mssql.Int, id)
            .query(`SELECT * FROM APP_ECOMMERCE_LINEAS WHERE ID_PEDIDO = @ID ORDER BY ID`);
        const lineas = lineasRes.recordset;
        if (lineas.length === 0) return { success: false, message: 'El pedido no tiene líneas' };

        // 4. Buscar cliente por CODCLIENTE o CIF/RIF
        const codCli = String(ped.COD_CLIENTE ?? '').trim();
        const rifCli = String(ped.RIF ?? '').trim();
        const clienteRes = await pool.request()
            .input('COD', mssql.NVarChar(50), codCli)
            .input('RIF', mssql.NVarChar(50), rifCli)
            .query(`
                SELECT CODCLIENTE FROM CLIENTES WITH (NOLOCK)
                WHERE CODCLIENTE = TRY_CAST(@COD AS INT)
                   OR CIF = @COD OR CIF = @RIF
            `);
        const cliente = clienteRes.recordset[0];
        if (!cliente) return { success: false, message: `Cliente "${codCli}" no encontrado en el sistema` };

        const clienteId: number    = Number(cliente.CODCLIENTE);
        const descuentoPct: number = Number(ped.DESCUENTO_PCT ?? 0);
        const codVendedor: number     = VED;

        // 5. Resolver código → CODARTICULO + atributos para separación
        //    Busca por CODBARRAS primero; fallback a CODARTICULO directo
        const barcodes = [...new Set(lineas.map((l: any) => String(l.COD_ARTICULO).trim()).filter(Boolean))];
        const barcodeToArt = new Map<string, {
            codarticulo: number; nodto: boolean; ref: string;
            seccion: number; diasProteccion: number; precioUnitario: number;
            codproveedor: string; codmarca: string;
        }>();
        if (barcodes.length > 0) {
            const artReq = pool.request();
            artReq.input('TARIFA', mssql.Int, getDbConfig().tarifaBaseCatalogo);
            const artPH  = barcodes.map((b, i) => { artReq.input(`b${i}`, mssql.NVarChar(50), b); return `@b${i}`; }).join(',');
            const artRes = await artReq.query(`
                SELECT CAST(A.CODARTICULO AS NVARCHAR(50)) AS LOOKUP_KEY, A.CODARTICULO,
                       ISNULL(A.NODTOAPLICABLE, 0)   AS NODTOAPLICABLE,
                       ISNULL(A.REFPROVEEDOR,'')      AS REFPROVEEDOR,
                       ISNULL(A.SECCION, 0)           AS SECCION,
                       ISNULL(PCL.DIASPROTECCION, 0)  AS DIASPROTECCION,
                       ISNULL(PV.PNETO, 0)            AS PNETO,
                       ISNULL(CAST(RP.CODPROVEEDOR AS NVARCHAR(50)), '') AS CODPROVEEDOR,
                       ISNULL(CAST(A.MARCA AS NVARCHAR(50)), '')         AS CODMARCA
                FROM ARTICULOS A WITH (NOLOCK)
                LEFT JOIN ARTICULOSCAMPOSLIBRES ACL WITH (NOLOCK) ON ACL.CODARTICULO = A.CODARTICULO
                LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL WITH (NOLOCK) ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                LEFT JOIN PRECIOSVENTA PV WITH (NOLOCK) ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA
                OUTER APPLY (
                    SELECT TOP 1 CODPROVEEDOR FROM REFERENCIASPROV WITH (NOLOCK)
                    WHERE CODARTICULO = A.CODARTICULO ORDER BY CODPROVEEDOR
                ) RP
                WHERE CAST(A.CODARTICULO AS NVARCHAR(50)) IN (${artPH})
            `);
            artRes.recordset.forEach((r: any) => {
                barcodeToArt.set(String(r.LOOKUP_KEY), {
                    codarticulo:    Number(r.CODARTICULO),
                    nodto:          r.NODTOAPLICABLE === true || r.NODTOAPLICABLE === 1,
                    ref:            r.REFPROVEEDOR,
                    seccion:        Number(r.SECCION),
                    diasProteccion: Number(r.DIASPROTECCION),
                    precioUnitario: Number(r.PNETO),
                    codproveedor:   String(r.CODPROVEEDOR ?? ''),
                    codmarca:       String(r.CODMARCA ?? ''),
                });
            });
        }

        const noResueltos = barcodes.filter(b => !barcodeToArt.has(b));
        if (noResueltos.length > 0)
            console.warn(`[Ecommerce] Barcodes no encontrados en ARTICULOS: ${noResueltos.join(', ')}`);

        // 6. Descuentos promocionales
        const promoDescMap = new Map<number, number>();
        try {
            const promos = await PromocionesService.getVigentes();
            for (const p of promos) {
                let califica = false;
                if      (p.alcanceCliente === 'TODOS')         califica = !(p.codigosClienteExcluir as number[]).includes(clienteId);
                else if (p.alcanceCliente === 'INCLUIR_GRUPO') califica = (p.codigosCliente as number[]).includes(clienteId);
                else if (p.alcanceCliente === 'EXCLUIR_GRUPO') califica = !(p.codigosCliente as number[]).includes(clienteId);
                if (!califica) continue;
                const matchLineas = lineas.filter((l: any) => {
                    const art = barcodeToArt.get(String(l.COD_ARTICULO).trim());
                    return art && (p.codigosArticulo as number[]).includes(art.codarticulo);
                });
                if (!matchLineas.length) continue;
                const base = p.base === 'UNIDADES'
                    ? matchLineas.reduce((s: number, l: any) => s + Number(l.CANTIDAD), 0)
                    : matchLineas.reduce((s: number, l: any) => {
                        const art = barcodeToArt.get(String(l.COD_ARTICULO).trim())!;
                        return s + art.precioUnitario * Number(l.CANTIDAD);
                    }, 0);
                const escala = (p.escalas as any[]).find(e => base >= e.minimo && (e.maximo == null || base <= e.maximo));
                if (!escala) continue;
                for (const l of matchLineas) {
                    const art = barcodeToArt.get(String(l.COD_ARTICULO).trim());
                    if (art && (promoDescMap.get(art.codarticulo) ?? 0) < escala.porcentaje)
                        promoDescMap.set(art.codarticulo, escala.porcentaje);
                }
            }
        } catch { /* sin promociones activas */ }

        let promosTriangulacion: any[] = [];
        try { promosTriangulacion = await TriangulacionService.getPromosActivas(); } catch { /* sin promos tri */ }

        // 7. Separar líneas en grupos: P (psicotrópico) > SD (sin dto) > NI (no indexado) > normal
        //    Misma lógica que CarritoView.vue
        type GrupoLinea = { linea: any; art: typeof barcodeToArt extends Map<any, infer V> ? V : never };
        const grupos: Record<string, GrupoLinea[]> = { normal: [], P: [], SD: [], NI: [] };
        const lineasSinArticulo: string[] = [];

        for (const l of lineas) {
            const barcode = String(l.COD_ARTICULO).trim();
            const art = barcodeToArt.get(barcode);
            if (!art) { lineasSinArticulo.push(barcode); continue; }
            if (art.seccion === getDbConfig().dptoPsicotropicos)                  grupos.P.push({ linea: l, art });
            else if (art.nodto)                                                  grupos.SD.push({ linea: l, art });
            else if (art.diasProteccion > 0)                                     grupos.NI.push({ linea: l, art });
            else                                                                 grupos.normal.push({ linea: l, art });
        }

        if (lineasSinArticulo.length > 0)
            console.warn(`[Ecommerce] ${orderId}: sin artículo: ${lineasSinArticulo.join(', ')}`);

        const gruposConLineas = Object.entries(grupos).filter(([, items]) => items.length > 0);
        if (!gruposConLineas.length)
            return { success: false, message: 'Ningún artículo del pedido fue encontrado en el sistema' };

        // 8. Helper: armar tabla e insertar un grupo (dentro de una transacción)
        //    Si el grupo supera MAX_LINEAS, se parte en sub-pedidos con sufijo -1, -2, ...
        const insertarGrupo = async (sufijo: string, items: GrupoLinea[], tx: mssql.Transaction): Promise<string[] | null> => {
            const orderIdBase = sufijo === 'normal' ? orderId : orderId + sufijo;
            const estatus = 'AUTORIZADO';

            // Consolidar por (artículo + lote) — distintos lotes = líneas separadas
            const consolidated = new Map<string, { linea: any; art: (typeof items)[0]['art']; lote: string }>();
            for (const { linea: l, art } of items) {
                const lote = String(l.LOTE ?? '').trim();
                const key  = `${art.codarticulo}|${lote}`;
                const ex   = consolidated.get(key);
                if (ex) ex.linea = { ...ex.linea, CANTIDAD: Number(ex.linea.CANTIDAD) + Number(l.CANTIDAD) };
                else    consolidated.set(key, { linea: { ...l }, art, lote });
            }

            // Resolver lotes "N/A" → lote más próximo a vencer en ARTICULOSLIN
            const naEntries = [...consolidated.entries()].filter(([, v]) => v.lote.toUpperCase() === 'N/A');
            if (naEntries.length > 0) {
                const naCods = [...new Set(naEntries.map(([, v]) => v.art.codarticulo))];
                const naReq  = new mssql.Request(tx);
                const naPH   = naCods.map((c, i) => { naReq.input(`na${i}`, mssql.Int, c); return `@na${i}`; }).join(',');
                const naRes  = await naReq.query(`
                    SELECT codarticulo, CODBARRAS FROM (
                        SELECT CODARTICULO AS codarticulo, ISNULL(CODBARRAS,'') AS CODBARRAS,
                               ROW_NUMBER() OVER (PARTITION BY CODARTICULO ORDER BY TRY_CONVERT(DATE, GARANTIACOMPRA, 103) ASC) AS RN
                        FROM ARTICULOSLIN WITH (NOLOCK)
                        WHERE CODARTICULO IN (${naPH})
                          AND TRY_CONVERT(DATE, GARANTIACOMPRA, 103) IS NOT NULL
                          AND CODBARRAS IS NOT NULL AND LTRIM(RTRIM(CODBARRAS)) != ''
                    ) t WHERE RN = 1
                `);
                const loteMap = new Map<number, string>(
                    naRes.recordset.map((r: any) => [Number(r.codarticulo), String(r.CODBARRAS)])
                );
                for (const [oldKey, val] of naEntries) {
                    const resolved = loteMap.get(val.art.codarticulo) ?? '';
                    if (!resolved) continue;
                    consolidated.delete(oldKey);
                    val.lote = resolved;
                    const newKey = `${val.art.codarticulo}|${resolved}`;
                    const existing = consolidated.get(newKey);
                    if (existing) existing.linea = { ...existing.linea, CANTIDAD: Number(existing.linea.CANTIDAD) + Number(val.linea.CANTIDAD) };
                    else consolidated.set(newKey, val);
                }
            }

            // Verificar stock disponible por artículo antes de insertar
            const codArticulos = [...new Set([...consolidated.values()].map(v => v.art.codarticulo))];
            const stockReq = new mssql.Request(tx);
            const stockPlaceholders = codArticulos.map((c, i) => { stockReq.input(`sc${i}`, mssql.Int, c); return `@sc${i}`; }).join(',');
            stockReq.input('ALMACEN_ST', mssql.VarChar(10), getDbConfig().codAlmacen);
            const stockMap = new Map<number, number>();
            if (codArticulos.length > 0) {
                const stockRes = await stockReq.query(`
                    SELECT CODARTICULO, ISNULL(SUM(STOCK), 0) AS STOCK
                    FROM STOCKS WITH (NOLOCK) WHERE CODARTICULO IN (${stockPlaceholders}) AND CODALMACEN = @ALMACEN_ST
                    GROUP BY CODARTICULO
                `);
                for (const r of stockRes.recordset) stockMap.set(r.CODARTICULO, Number(r.STOCK));
            }

            // Resolver líneas con precio/cantidad final (descartando sin stock)
            type RowData = { codarticulo: number; ref: string; lote: string; cantidad: number; precioFinal: number; desc1: number; desc2: number; desc3: number; precioUsdBruto: number; codproveedor: string; codmarca: string };
            const rowsData: RowData[] = [];
            for (const { linea: l, art, lote } of consolidated.values()) {
                const stockDisponible = stockMap.get(art.codarticulo) ?? 0;
                if (stockDisponible <= 0) {
                    console.log(`[Ecommerce] ${orderIdBase}: artículo ${art.codarticulo} sin stock — descartado`);
                    continue;
                }
                const precioUsdBruto = art.precioUnitario;
                const cantidad       = Math.min(Number(l.CANTIDAD), stockDisponible);
                const desc1 = art.nodto ? 0 : Number(l.DESCUENTO1 ?? 0);
                const desc2 = art.nodto ? 0 : (promoDescMap.get(art.codarticulo) ?? 0);
                const precioFinal = precioUsdBruto * (1 - desc1 / 100) * (1 - desc2 / 100);
                rowsData.push({ codarticulo: art.codarticulo, ref: art.ref, lote, cantidad, precioFinal, desc1, desc2, desc3: 0, precioUsdBruto, codproveedor: art.codproveedor, codmarca: art.codmarca });
            }

            if (rowsData.length === 0) {
                console.log(`[Ecommerce] ${orderIdBase}: todas las líneas sin stock — grupo omitido`);
                return null;
            }

            // Descuentos de triangulación → DESCUENTO3
            const triMap = TriangulacionService.calcularDescPorArticulo(
                promosTriangulacion,
                new Map(rowsData.map(r => [r.codarticulo, { codproveedor: r.codproveedor, codmarca: r.codmarca, cantidad: r.cantidad, precioFinal: r.precioFinal }])),
            );
            for (const row of rowsData) {
                row.desc3 = triMap.get(row.codarticulo) ?? 0;
                if (row.desc3 > 0) row.precioFinal = row.precioFinal * (1 - row.desc3 / 100);
            }

            // Partir en bloques de MAX_LINEAS; si hay uno solo el ORDERID no cambia
            const chunks: RowData[][] = [];
            for (let i = 0; i < rowsData.length; i += MAX_LINEAS) chunks.push(rowsData.slice(i, i + MAX_LINEAS));

            const idsInsertados: string[] = [];
            for (let ci = 0; ci < chunks.length; ci++) {
                const chunk = chunks[ci];
                // ponytail: solo agrega sufijo -N si hay más de un chunk
                const orderIdGrupo = chunks.length === 1 ? orderIdBase : `${orderIdBase}-${ci + 1}`;

                const tabla = new mssql.Table(`${esquema}.LINEA_PED`);
                tabla.create = false;
                tabla.columns.add('ORDERID',        mssql.VarChar(50), { nullable: false });
                tabla.columns.add('CODARTICULO',    mssql.Int,         { nullable: false });
                tabla.columns.add('REFERENCIA',     mssql.VarChar(50), { nullable: true  });
                tabla.columns.add('CODALMACEN',     mssql.VarChar(10), { nullable: false });
                tabla.columns.add('IDTARIFAV',      mssql.Int,         { nullable: false });
                tabla.columns.add('PRODUCTCOUNT',   mssql.Int,         { nullable: false });
                tabla.columns.add('PRECIOUNITARIO', mssql.Float,       { nullable: false });
                tabla.columns.add('DESCUENTO1',     mssql.Float,       { nullable: true  });
                tabla.columns.add('DESCUENTO2',     mssql.Float,       { nullable: true  });
                tabla.columns.add('DESCUENTO3',     mssql.Float,       { nullable: true  });
                tabla.columns.add('DESCUENTO4',     mssql.Float,       { nullable: true  });
                tabla.columns.add('PRECIOBRUTO',    mssql.Float,       { nullable: true  });
                tabla.columns.add('LOTE',           mssql.NVarChar(50),{ nullable: true  });
                tabla.columns.add('TOTAL_BRUTO',    mssql.Float,       { nullable: true  });
                tabla.columns.add('TOTAL_DESCUENTO',mssql.Float,       { nullable: true  });

                let total = 0;
                for (const row of chunk) {
                    const totalBrutoLinea = row.precioUsdBruto * row.cantidad;
                    const totalFinalLinea = row.precioFinal    * row.cantidad;
                    total += totalFinalLinea;
                    tabla.rows.add(orderIdGrupo, row.codarticulo, row.ref, 'ZAV', VED,
                        row.cantidad, row.precioFinal, row.desc1, row.desc2, row.desc3, 0, row.precioUsdBruto,
                        row.lote, totalBrutoLinea, totalBrutoLinea - totalFinalLinea);
                }

                await new mssql.Request(tx)
                    .input('ORDERID',     mssql.NVarChar(50), orderIdGrupo)
                    .input('CLIENTEID',   mssql.Int,          clienteId)
                    .input('CODVENDEDOR', mssql.Int,          codVendedor)
                    .input('TOTAL',       mssql.Float,        total)
                    .input('ESTATUS',     mssql.VarChar(50),  estatus)
                    .query(`
                        INSERT INTO ${esquema}.CABECERA_PED (ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO)
                        VALUES (@ORDERID, @CLIENTEID, GETDATE(), @ESTATUS,
                            ISNULL(NULLIF((SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL WHERE CCL.CODCLIENTE = @CLIENTEID AND CCL.CODVENDEDOR IS NOT NULL AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR)))!=''), 0), @CODVENDEDOR),
                            @TOTAL)
                    `);

                await new mssql.Request(tx).bulk(tabla);

                await new mssql.Request(tx)
                    .input('OID',     mssql.VarChar(50), orderIdGrupo)
                    .input('ESTATUS', mssql.VarChar(50), estatus)
                    .query(`
                        INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, USUARIO, DETALLES)
                        VALUES (@OID, NULL, @ESTATUS, 'Ecommerce', 'Pedido importado desde integración Icompras')
                    `);

                idsInsertados.push(orderIdGrupo);
            }

            return idsInsertados;
        };

        // 9. Insertar cada grupo dentro de una transacción — si falla alguno, todos se revierten
        const idsCreados: string[] = [];
        const tx = new mssql.Transaction(pool);
        await tx.begin();
        try {
            for (const [sufijo, items] of gruposConLineas) {
                const ids = await insertarGrupo(sufijo, items, tx);
                if (ids !== null) idsCreados.push(...ids);
            }
            await tx.commit();
        } catch (err) {
            await tx.rollback();
            throw err;
        }

        // 10. Marcar procesado
        await pool.request()
            .input('ID', mssql.Int, id)
            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET PROCESADO = 1 WHERE ID = @ID`);

        return { success: true, message: `Pedidos creados: ${idsCreados.join(', ')}`, orderId: idsCreados[0] };
    }
}
