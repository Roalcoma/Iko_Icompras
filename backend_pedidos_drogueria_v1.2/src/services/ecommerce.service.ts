import fs from 'fs';
import path from 'path';
import { mssql, connectDb } from '../db/db.conection';
import { PromocionesService } from './promociones.service';
import { getDbConfig }        from './dbconfig.service';

const VED     = Number(process.env.VED) || 1;
const esquema = process.env.DB_ESQUEMA  || 'dbo';

export class EcommerceService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
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
                        PROCESADO      BIT NOT NULL DEFAULT 0,
                        FECHA_IMPORT   DATETIME NOT NULL DEFAULT GETDATE()
                    );

                IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_ECOMMERCE_LINEAS')
                    CREATE TABLE APP_ECOMMERCE_LINEAS (
                        ID              INT IDENTITY PRIMARY KEY,
                        ID_PEDIDO       INT NOT NULL REFERENCES APP_ECOMMERCE_PEDIDOS(ID),
                        COD_ARTICULO    NVARCHAR(50),
                        DESCRIPCION     NVARCHAR(300),
                        CANTIDAD        INT,
                        PRECIO_UNITARIO DECIMAL(18,2)
                    );
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
                pedido = {
                    numeroPedido:  (f[0]  ?? '').trim(),
                    codCliente:    (f[1]  ?? '').trim(),
                    fecha:         (f[2]  ?? '').trim(),
                    estatus:       (f[3]  ?? '').trim(),
                    nombreCliente: (f[10] ?? '').trim(),
                    rif:           (f[11] ?? '').trim(),
                    total:         parseFloat(f[16] ?? '0') || 0,
                    archivo:       nombreArchivo,
                };
            } else {
                // f[2] = CODARTICULO interno (puede ser un entero); f[6] = EAN (puede no estar en el ERP)
                items.push({
                    codArticulo:    (f[2] ?? '').trim(),
                    descripcion:    (f[3] ?? '').trim(),
                    cantidad:       parseInt(f[4] ?? '0') || 0,
                    precioUnitario: parseFloat(f[5] ?? '0') || 0,
                });
            }
        }

        return pedido ? { pedido, lineas: items } : null;
    }

    static async escanearCarpeta(): Promise<{ importados: number; errores: number; mensaje?: string }> {
        const ruta = await this.getConfig();
        if (!ruta) return { importados: 0, errores: 0, mensaje: 'Ruta de carpeta no configurada en Administración' };
        if (!fs.existsSync(ruta)) return { importados: 0, errores: 0, mensaje: `Carpeta no encontrada: ${ruta}` };

        const archivos = fs.readdirSync(ruta).filter(f => f.endsWith('.txt'));
        if (!archivos.length) return { importados: 0, errores: 0, mensaje: `Sin archivos .txt pendientes en: ${ruta}` };

        let importados = 0, errores = 0;

        for (const archivo of archivos) {
            const rutaArchivo = path.join(ruta, archivo);
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
                    fs.renameSync(rutaArchivo, rutaArchivo + '.done');
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
                    .input('ARCH',   mssql.NVarChar(500),  archivo)
                    .query(`
                        INSERT INTO APP_ECOMMERCE_PEDIDOS
                            (NUMERO_PEDIDO, COD_CLIENTE, NOMBRE_CLIENTE, RIF, FECHA, ESTATUS, TOTAL, ARCHIVO)
                        OUTPUT INSERTED.ID
                        SELECT @NUM, @COD, @NOMBRE, @RIF, @FECHA, @ESTATUS, @TOTAL, @ARCH
                        WHERE NOT EXISTS (
                            SELECT 1 FROM APP_ECOMMERCE_PEDIDOS
                            WHERE NUMERO_PEDIDO = @NUM AND ARCHIVO = @ARCH
                        )
                    `);

                // Si rowsAffected=0, el otro scan ganó la carrera — no duplicamos
                if (!insRes.recordset.length) {
                    fs.renameSync(rutaArchivo, rutaArchivo + '.done');
                    continue;
                }

                const idPedido: number = insRes.recordset[0].ID;

                for (const l of parsed.lineas) {
                    await pool.request()
                        .input('ID_PED', mssql.Int,           idPedido)
                        .input('COD',    mssql.NVarChar(50),  l.codArticulo)
                        .input('DESC',   mssql.NVarChar(300), l.descripcion)
                        .input('CANT',   mssql.Int,           l.cantidad)
                        .input('PRECIO', mssql.Decimal(18,2), l.precioUnitario)
                        .query(`
                            INSERT INTO APP_ECOMMERCE_LINEAS
                                (ID_PEDIDO, COD_ARTICULO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO)
                            VALUES (@ID_PED, @COD, @DESC, @CANT, @PRECIO)
                        `);
                }

                // Auto-aprobar: insertar directamente en CABECERA_PED
                const aprob = await this.aprobarPedido(idPedido);
                fs.renameSync(rutaArchivo, rutaArchivo + '.done');
                if (aprob.success) {
                    console.log(`[Ecommerce] Pedido ${aprob.orderId} creado en Control de Estatus`);
                    importados++;
                } else {
                    console.warn(`[Ecommerce] ${archivo}: no se pudo crear en Control de Estatus — ${aprob.message}`);
                    errores++;
                }
            } catch (e) {
                console.error(`[Ecommerce] Error al importar ${archivo}:`, e);
                errores++;
            }
        }

        return { importados, errores };
    }

    static async getPedidos(search: string, page: number, limit: number): Promise<{ data: any[]; total: number }> {
        const pool = await connectDb();
        const filtro = `%${search ?? ''}%`;
        const offset = (page - 1) * limit;

        const totalRes = await pool.request()
            .input('F', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS T FROM APP_ECOMMERCE_PEDIDOS
                WHERE NOMBRE_CLIENTE LIKE @F OR NUMERO_PEDIDO LIKE @F OR RIF LIKE @F
            `);

        const dataRes = await pool.request()
            .input('F',   mssql.NVarChar, filtro)
            .input('OFF', mssql.Int, offset)
            .input('LIM', mssql.Int, limit)
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
                SELECT C.CODCLIENTE,
                       ISNULL(TRY_CAST(CCL.D1 AS FLOAT), 0) AS DESCUENTO_GLOBAL,
                       ISNULL(TRY_CAST(CCL.CODVENDEDOR AS INT), 0) AS CODVENDEDOR
                FROM CLIENTES C
                LEFT JOIN CLIENTESCAMPOSLIBRES CCL ON CCL.CODCLIENTE = C.CODCLIENTE
                WHERE C.CODCLIENTE = TRY_CAST(@COD AS INT)
                   OR C.CIF = @COD OR C.CIF = @RIF
            `);
        const cliente = clienteRes.recordset[0];
        if (!cliente) return { success: false, message: `Cliente "${codCli}" no encontrado en el sistema` };

        const clienteId: number     = Number(cliente.CODCLIENTE);
        const descuentoGlobal: number = Number(cliente.DESCUENTO_GLOBAL);
        const codVendedor: number   = Number(cliente.CODVENDEDOR);

        // 5. Resolver código → CODARTICULO + atributos para separación
        //    Busca por CODBARRAS primero; fallback a CODARTICULO directo
        const barcodes = [...new Set(lineas.map((l: any) => String(l.COD_ARTICULO).trim()).filter(Boolean))];
        const barcodeToArt = new Map<string, {
            codarticulo: number; nodto: boolean; ref: string;
            seccion: number; diasProteccion: number; precioUnitario: number;
        }>();
        if (barcodes.length > 0) {
            const artReq = pool.request();
            artReq.input('TARIFA', mssql.Int, getDbConfig().tarifaBaseCatalogo);
            const artPH  = barcodes.map((b, i) => { artReq.input(`b${i}`, mssql.NVarChar(50), b); return `@b${i}`; }).join(',');
            const artRes = await artReq.query(`
                SELECT AL.CODBARRAS AS LOOKUP_KEY, A.CODARTICULO,
                       ISNULL(A.NODTOAPLICABLE, 0)   AS NODTOAPLICABLE,
                       ISNULL(A.REFPROVEEDOR,'')      AS REFPROVEEDOR,
                       ISNULL(A.SECCION, 0)           AS SECCION,
                       ISNULL(PCL.DIASPROTECCION, 0)  AS DIASPROTECCION,
                       ISNULL(PV.PNETO, 0)            AS PNETO
                FROM ARTICULOSLIN AL
                JOIN ARTICULOS A ON A.CODARTICULO = AL.CODARTICULO
                LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                LEFT JOIN PRECIOSVENTA PV ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA
                WHERE AL.CODBARRAS IN (${artPH})
                UNION
                SELECT CAST(A.CODARTICULO AS NVARCHAR(50)) AS LOOKUP_KEY, A.CODARTICULO,
                       ISNULL(A.NODTOAPLICABLE, 0)   AS NODTOAPLICABLE,
                       ISNULL(A.REFPROVEEDOR,'')      AS REFPROVEEDOR,
                       ISNULL(A.SECCION, 0)           AS SECCION,
                       ISNULL(PCL.DIASPROTECCION, 0)  AS DIASPROTECCION,
                       ISNULL(PV.PNETO, 0)            AS PNETO
                FROM ARTICULOS A
                LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                LEFT JOIN PROVEEDORESCAMPOSLIBRES PCL ON PCL.CODPROVEEDOR = ACL.CODPROVEEDORICG
                LEFT JOIN PRECIOSVENTA PV ON PV.CODARTICULO = A.CODARTICULO AND PV.IDTARIFAV = @TARIFA
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

        // 8. Helper: armar tabla e insertar un grupo
        const insertarGrupo = async (sufijo: string, items: GrupoLinea[]) => {
            const orderIdGrupo = sufijo === 'normal' ? orderId : orderId + sufijo;
            const estatus = sufijo === 'P' ? 'APROBACION PSICOTROPICOS' : 'PENDIENTE';

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

            // Consolidar líneas duplicadas del mismo artículo sumando cantidades
            const consolidated = new Map<number, { linea: any; art: (typeof items)[0]['art'] }>();
            for (const { linea: l, art } of items) {
                const ex = consolidated.get(art.codarticulo);
                if (ex) ex.linea = { ...ex.linea, CANTIDAD: Number(ex.linea.CANTIDAD) + Number(l.CANTIDAD) };
                else    consolidated.set(art.codarticulo, { linea: { ...l }, art });
            }

            let total = 0;
            for (const { linea: l, art } of consolidated.values()) {
                const precioUsdBruto = art.precioUnitario;
                const cantidad       = Number(l.CANTIDAD);
                const desc1 = art.nodto ? 0 : descuentoGlobal;
                const desc2 = art.nodto ? 0 : (promoDescMap.get(art.codarticulo) ?? 0);
                const precioFinal = precioUsdBruto * (1 - desc1 / 100) * (1 - desc2 / 100);
                total += precioFinal * cantidad;
                tabla.rows.add(orderIdGrupo, art.codarticulo, art.ref, 'ZAV', VED,
                    cantidad, precioFinal, desc1, desc2, 0, 0, precioUsdBruto);
            }

            await pool.request()
                .input('ORDERID',     mssql.NVarChar(50), orderIdGrupo)
                .input('CLIENTEID',   mssql.Int,          clienteId)
                .input('CODVENDEDOR', mssql.Int,          codVendedor)
                .input('TOTAL',       mssql.Float,        total)
                .input('ESTATUS',     mssql.VarChar(50),  estatus)
                .query(`
                    INSERT INTO ${esquema}.CABECERA_PED (ORDERID, CLIENTEID, FECHA, ESTATUS, CODVENDEDOR, TOTALPRECIO)
                    VALUES (@ORDERID, @CLIENTEID, GETDATE(), @ESTATUS,
                        ISNULL(NULLIF((
                            SELECT TOP 1 CAST(CCL.CODVENDEDOR AS INT) FROM CLIENTESCAMPOSLIBRES CCL
                            WHERE CCL.CODCLIENTE = @CLIENTEID
                              AND CCL.CODVENDEDOR IS NOT NULL
                              AND LTRIM(RTRIM(CAST(CCL.CODVENDEDOR AS NVARCHAR))) != ''
                        ), 0), @CODVENDEDOR),
                        @TOTAL)
                `);

            await pool.request().bulk(tabla);

            await pool.request()
                .input('OID',     mssql.VarChar(50), orderIdGrupo)
                .input('ESTATUS', mssql.VarChar(50), estatus)
                .query(`
                    INSERT INTO ${esquema}.APP_PEDIDO_LOG (ORDERID, EST_ANTERIOR, EST_NUEVO, USUARIO, DETALLES)
                    VALUES (@OID, NULL, @ESTATUS, 'Ecommerce', 'Pedido importado desde integración Icompras')
                `);

            return orderIdGrupo;
        };

        // 9. Insertar cada grupo
        const idsCreados: string[] = [];
        for (const [sufijo, items] of gruposConLineas)
            idsCreados.push(await insertarGrupo(sufijo, items));

        // 10. Marcar procesado
        await pool.request()
            .input('ID', mssql.Int, id)
            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET PROCESADO = 1 WHERE ID = @ID`);

        return { success: true, message: `Pedidos creados: ${idsCreados.join(', ')}`, orderId: idsCreados[0] };
    }
}
