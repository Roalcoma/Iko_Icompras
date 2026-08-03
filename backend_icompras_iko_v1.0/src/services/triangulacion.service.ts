import mssql from 'mssql';
import { connectDb } from '../db/db.conection';

export class TriangulacionService {

    static async initTablas(): Promise<void> {
        const pool = await connectDb();
        await pool.request().query(`
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_TRI_PROMO')
                CREATE TABLE APP_TRI_PROMO (
                    ID             INT IDENTITY PRIMARY KEY,
                    NOMBRE         NVARCHAR(200) NOT NULL,
                    TIPO           NVARCHAR(20)  NOT NULL,  -- PROVEEDOR | MARCA
                    CODIGO         NVARCHAR(100) NOT NULL,
                    NOMBRE_ENTIDAD NVARCHAR(200) NOT NULL DEFAULT '',
                    BASE           NVARCHAR(20)  NOT NULL,  -- UNIDADES | MONTO
                    ACTIVO         BIT NOT NULL DEFAULT 1
                );
            IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'APP_TRI_ESCALA')
                CREATE TABLE APP_TRI_ESCALA (
                    ID         INT IDENTITY PRIMARY KEY,
                    ID_PROMO   INT NOT NULL REFERENCES APP_TRI_PROMO(ID) ON DELETE CASCADE,
                    MINIMO     DECIMAL(18,2) NOT NULL,
                    MAXIMO     DECIMAL(18,2) NULL,
                    PORCENTAJE DECIMAL(5,2)  NOT NULL
                );
        `);
    }

    static async getPromos(): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request().query(`
            SELECT P.ID, P.NOMBRE, P.TIPO, P.CODIGO, P.NOMBRE_ENTIDAD, P.BASE, P.ACTIVO,
                   E.ID AS EID, E.MINIMO, E.MAXIMO, E.PORCENTAJE
            FROM APP_TRI_PROMO P
            LEFT JOIN APP_TRI_ESCALA E ON E.ID_PROMO = P.ID
            ORDER BY P.ID, E.MINIMO
        `);
        const map = new Map<number, any>();
        for (const r of res.recordset) {
            if (!map.has(r.ID)) {
                map.set(r.ID, {
                    id: r.ID, nombre: r.NOMBRE, tipo: r.TIPO, codigo: r.CODIGO,
                    nombreEntidad: r.NOMBRE_ENTIDAD, base: r.BASE, activo: !!r.ACTIVO,
                    escalas: [],
                });
            }
            if (r.EID != null) {
                map.get(r.ID).escalas.push({
                    id: r.EID, minimo: Number(r.MINIMO),
                    maximo: r.MAXIMO != null ? Number(r.MAXIMO) : null,
                    porcentaje: Number(r.PORCENTAJE),
                });
            }
        }
        return [...map.values()];
    }

    static async getPromosActivas(): Promise<any[]> {
        return (await TriangulacionService.getPromos()).filter(p => p.activo && p.escalas.length > 0);
    }

    static async crearPromo(data: any): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('NOMBRE', mssql.NVarChar(200), data.nombre)
            .input('TIPO',   mssql.NVarChar(20),  data.tipo)
            .input('CODIGO', mssql.NVarChar(100), data.codigo)
            .input('NE',     mssql.NVarChar(200), data.nombreEntidad ?? '')
            .input('BASE',   mssql.NVarChar(20),  data.base)
            .input('ACTIVO', mssql.Bit,            data.activo ?? 1)
            .query(`INSERT INTO APP_TRI_PROMO (NOMBRE,TIPO,CODIGO,NOMBRE_ENTIDAD,BASE,ACTIVO)
                    OUTPUT INSERTED.ID VALUES (@NOMBRE,@TIPO,@CODIGO,@NE,@BASE,@ACTIVO)`);
        return res.recordset[0].ID;
    }

    static async actualizarPromo(id: number, data: any): Promise<void> {
        const pool = await connectDb();
        await pool.request()
            .input('ID',     mssql.Int,           id)
            .input('NOMBRE', mssql.NVarChar(200), data.nombre)
            .input('TIPO',   mssql.NVarChar(20),  data.tipo)
            .input('CODIGO', mssql.NVarChar(100), data.codigo)
            .input('NE',     mssql.NVarChar(200), data.nombreEntidad ?? '')
            .input('BASE',   mssql.NVarChar(20),  data.base)
            .input('ACTIVO', mssql.Bit,            data.activo ?? 1)
            .query(`UPDATE APP_TRI_PROMO
                    SET NOMBRE=@NOMBRE, TIPO=@TIPO, CODIGO=@CODIGO,
                        NOMBRE_ENTIDAD=@NE, BASE=@BASE, ACTIVO=@ACTIVO
                    WHERE ID=@ID`);
    }

    static async eliminarPromo(id: number): Promise<void> {
        const pool = await connectDb();
        await pool.request().input('ID', mssql.Int, id)
            .query(`DELETE FROM APP_TRI_PROMO WHERE ID=@ID`);
    }

    static async crearEscala(idPromo: number, data: any): Promise<number> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('ID_PROMO',   mssql.Int,          idPromo)
            .input('MINIMO',     mssql.Decimal(18,2), Number(data.minimo))
            .input('MAXIMO',     mssql.Decimal(18,2), data.maximo != null ? Number(data.maximo) : null)
            .input('PORCENTAJE', mssql.Decimal(5,2),  Number(data.porcentaje))
            .query(`INSERT INTO APP_TRI_ESCALA (ID_PROMO,MINIMO,MAXIMO,PORCENTAJE)
                    OUTPUT INSERTED.ID VALUES (@ID_PROMO,@MINIMO,@MAXIMO,@PORCENTAJE)`);
        return res.recordset[0].ID;
    }

    static async eliminarEscala(id: number): Promise<void> {
        const pool = await connectDb();
        await pool.request().input('ID', mssql.Int, id)
            .query(`DELETE FROM APP_TRI_ESCALA WHERE ID=@ID`);
    }

    static async buscarProveedores(q: string): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('Q', mssql.NVarChar(100), `%${q}%`)
            .query(`SELECT DISTINCT TOP 20 CAST(P.CODPROVEEDOR AS NVARCHAR(50)) AS codigo, P.NOMPROVEEDOR AS nombre
                    FROM PROVEEDORES P WITH (NOLOCK)
                    WHERE P.NOMPROVEEDOR LIKE @Q OR CAST(P.CODPROVEEDOR AS NVARCHAR(50)) LIKE @Q
                    ORDER BY P.NOMPROVEEDOR`);
        return res.recordset;
    }

    static async buscarMarcas(q: string): Promise<any[]> {
        const pool = await connectDb();
        const res = await pool.request()
            .input('Q', mssql.NVarChar(100), `%${q}%`)
            .query(`SELECT DISTINCT TOP 20 CAST(M.CODMARCA AS NVARCHAR(50)) AS codigo, M.DESCRIPCION AS nombre
                    FROM MARCA M WITH (NOLOCK)
                    WHERE M.DESCRIPCION LIKE @Q OR CAST(M.CODMARCA AS NVARCHAR(50)) LIKE @Q
                    ORDER BY M.DESCRIPCION`);
        return res.recordset;
    }

    // Calcula descuento triangulación por codarticulo dado un map de items del grupo
    static calcularDescPorArticulo(
        promos: any[],
        items: Map<number, { codproveedor: string; codmarca: string; cantidad: number; precioFinal: number }>,
    ): Map<number, number> {
        const result = new Map<number, number>();
        for (const promo of promos) {
            const matching: Array<[number, { codproveedor: string; codmarca: string; cantidad: number; precioFinal: number }]> = [];
            for (const [cod, art] of items) {
                const match = promo.tipo === 'PROVEEDOR'
                    ? String(art.codproveedor) === String(promo.codigo)
                    : String(art.codmarca)     === String(promo.codigo);
                if (match) matching.push([cod, art]);
            }
            if (!matching.length) continue;
            const total = promo.base === 'UNIDADES'
                ? matching.reduce((s, [, a]) => s + a.cantidad, 0)
                : matching.reduce((s, [, a]) => s + a.precioFinal * a.cantidad, 0);
            const escala = (promo.escalas as any[])
                .filter(e => total >= e.minimo && (e.maximo == null || total <= e.maximo))
                .sort((a: any, b: any) => b.porcentaje - a.porcentaje)[0];
            if (!escala) continue;
            for (const [cod] of matching)
                result.set(cod, Math.max(result.get(cod) ?? 0, escala.porcentaje));
        }
        return result;
    }
}
