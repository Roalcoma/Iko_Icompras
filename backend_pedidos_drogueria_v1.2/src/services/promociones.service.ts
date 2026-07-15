import { mssql } from "../db/db.conection";
import { connectDb } from "../db/db.conection";

export interface EscalaInput {
    minimo: number;
    maximo: number | null;
    porcentaje: number;
}

export interface PromocionAplicada {
    idPromocion: number;
    nombre: string;
    porcentaje: number;
    base: number;
}

export interface CondicionInput {
    campo: string;
    operador: '=' | '<>' | 'CONTIENE' | '>' | '<' | '>=' | '<=';
    valor: string;
}

interface CampoDef {
    tabla: string;
    columna: string;
    tipo: 'numero' | 'texto';
    label: string;
}

// Allowlist: nunca se interpola SQL del usuario, solo se usa para indexar estos diccionarios.
const CAMPOS_ARTICULOS: Record<string, CampoDef> = {
    DPTO:            { tabla: 'A',   columna: 'DPTO',            tipo: 'numero', label: 'Departamento' },
    SECCION:         { tabla: 'A',   columna: 'SECCION',         tipo: 'numero', label: 'Sección' },
    FAMILIA:         { tabla: 'A',   columna: 'FAMILIA',         tipo: 'numero', label: 'Familia' },
    SUBFAMILIA:      { tabla: 'A',   columna: 'SUBFAMILIA',      tipo: 'numero', label: 'Subfamilia' },
    LINEA:           { tabla: 'A',   columna: 'LINEA',           tipo: 'numero', label: 'Línea' },
    MARCA:           { tabla: 'A',   columna: 'MARCA',           tipo: 'numero', label: 'Marca' },
    TIPOARTICULO:    { tabla: 'A',   columna: 'TIPOARTICULO',    tipo: 'texto',  label: 'Tipo de Artículo' },
    REFPROVEEDOR:    { tabla: 'A',   columna: 'REFPROVEEDOR',    tipo: 'texto',  label: 'Referencia Proveedor' },
    PRINCIPIOACTIVO: { tabla: 'ACL', columna: 'PRINCIPIOACTIVO', tipo: 'texto',  label: 'Principio Activo' },
    TIPOLIBRE:       { tabla: 'ACL', columna: 'TIPO',            tipo: 'texto',  label: 'Tipo (campo libre)' },
};

const CAMPOS_CLIENTES: Record<string, CampoDef> = {
    ZONA:        { tabla: 'CL', columna: 'ZONA',        tipo: 'texto',  label: 'Zona' },
    TIPOCLIENTE: { tabla: 'CL', columna: 'TIPOCLIENTE',  tipo: 'numero', label: 'Tipo de Cliente' },
    PROVINCIA:   { tabla: 'CL', columna: 'PROVINCIA',   tipo: 'texto',  label: 'Provincia' },
    POBLACION:   { tabla: 'CL', columna: 'POBLACION',   tipo: 'texto',  label: 'Población' },
    CODVENDEDOR: { tabla: 'CL', columna: 'CODVENDEDOR', tipo: 'numero', label: 'Vendedor' },
    D3:          { tabla: 'CCL', columna: 'D3',         tipo: 'texto',  label: 'D3' },
    D4:          { tabla: 'CCL', columna: 'D4',         tipo: 'texto',  label: 'D4' },
};

const OPERADORES_TEXTO = ['=', '<>', 'CONTIENE'];
const OPERADORES_NUMERO = ['=', '<>', '>', '<', '>=', '<='];

function construirWhereCondiciones(condiciones: CondicionInput[], campos: Record<string, CampoDef>, request: any): string {
    const fragmentos: string[] = [];
    condiciones.forEach((c, i) => {
        const def = campos[c.campo];
        if (!def) throw new Error(`Campo no permitido: ${c.campo}`);
        const operadoresValidos = def.tipo === 'numero' ? OPERADORES_NUMERO : OPERADORES_TEXTO;
        if (!operadoresValidos.includes(c.operador)) throw new Error(`Operador no permitido para ${c.campo}: ${c.operador}`);

        const param = `cond${i}`;
        const columna = `${def.tabla}.${def.columna}`;
        if (c.operador === 'CONTIENE') {
            request.input(param, mssql.NVarChar, `%${c.valor}%`);
            fragmentos.push(`${columna} LIKE @${param}`);
        } else {
            if (def.tipo === 'numero') request.input(param, mssql.Float, Number(c.valor));
            else request.input(param, mssql.NVarChar, c.valor);
            fragmentos.push(`${columna} ${c.operador} @${param}`);
        }
    });
    return fragmentos.length > 0 ? fragmentos.join(' AND ') : '1=0';
}

export class PromocionesService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDb();
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_ARTICULOS' AND xtype='U')
                CREATE TABLE APP_GRUPOS_ARTICULOS (
                    ID INT IDENTITY PRIMARY KEY,
                    NOMBRE NVARCHAR(150) NOT NULL,
                    ACTIVO BIT NOT NULL DEFAULT 1,
                    FECHACREACION DATETIME NOT NULL DEFAULT GETDATE()
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_ARTICULOS_DETALLE' AND xtype='U')
                CREATE TABLE APP_GRUPOS_ARTICULOS_DETALLE (
                    ID INT IDENTITY PRIMARY KEY,
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_ARTICULOS(ID),
                    CODARTICULO INT NOT NULL,
                    CONSTRAINT UQ_GRUPOART_DETALLE UNIQUE(IDGRUPO, CODARTICULO)
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_CLIENTES' AND xtype='U')
                CREATE TABLE APP_GRUPOS_CLIENTES (
                    ID INT IDENTITY PRIMARY KEY,
                    NOMBRE NVARCHAR(150) NOT NULL,
                    ACTIVO BIT NOT NULL DEFAULT 1,
                    FECHACREACION DATETIME NOT NULL DEFAULT GETDATE()
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_CLIENTES_DETALLE' AND xtype='U')
                CREATE TABLE APP_GRUPOS_CLIENTES_DETALLE (
                    ID INT IDENTITY PRIMARY KEY,
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_CLIENTES(ID),
                    CODCLIENTE INT NOT NULL,
                    CONSTRAINT UQ_GRUPOCLI_DETALLE UNIQUE(IDGRUPO, CODCLIENTE)
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_PROMOCIONES' AND xtype='U')
                CREATE TABLE APP_PROMOCIONES (
                    ID INT IDENTITY PRIMARY KEY,
                    NOMBRE NVARCHAR(150) NOT NULL,
                    IDGRUPOARTICULOS INT NOT NULL REFERENCES APP_GRUPOS_ARTICULOS(ID),
                    BASE VARCHAR(10) NOT NULL CHECK (BASE IN ('UNIDADES','MONTO')),
                    ALCANCE_CLIENTE VARCHAR(20) NOT NULL CHECK (ALCANCE_CLIENTE IN ('TODOS','INCLUIR_GRUPO','EXCLUIR_GRUPO')),
                    IDGRUPOCLIENTES INT NULL REFERENCES APP_GRUPOS_CLIENTES(ID),
                    FECHAINICIO DATE NOT NULL,
                    FECHAFIN DATE NOT NULL,
                    ACTIVO BIT NOT NULL DEFAULT 1,
                    FECHACREACION DATETIME NOT NULL DEFAULT GETDATE()
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_PROMOCIONES_ESCALAS' AND xtype='U')
                CREATE TABLE APP_PROMOCIONES_ESCALAS (
                    ID INT IDENTITY PRIMARY KEY,
                    IDPROMOCION INT NOT NULL REFERENCES APP_PROMOCIONES(ID),
                    MINIMO FLOAT NOT NULL,
                    MAXIMO FLOAT NULL,
                    PORCENTAJE FLOAT NOT NULL
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_PEDIDO_PROMOCIONES' AND xtype='U')
                CREATE TABLE APP_PEDIDO_PROMOCIONES (
                    ID INT IDENTITY PRIMARY KEY,
                    ORDERID VARCHAR(50) NOT NULL,
                    IDPROMOCION INT NOT NULL,
                    NOMBREPROMOCION NVARCHAR(150) NOT NULL,
                    PORCENTAJEAPLICADO FLOAT NOT NULL,
                    BASETOTAL FLOAT NOT NULL,
                    FECHA DATETIME NOT NULL DEFAULT GETDATE()
                );

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_GRUPOS_ARTICULOS' AND COLUMN_NAME='TIPO')
                ALTER TABLE APP_GRUPOS_ARTICULOS ADD TIPO VARCHAR(10) NOT NULL DEFAULT 'MANUAL' CHECK (TIPO IN ('MANUAL','CONDICION'));

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_GRUPOS_CLIENTES' AND COLUMN_NAME='TIPO')
                ALTER TABLE APP_GRUPOS_CLIENTES ADD TIPO VARCHAR(10) NOT NULL DEFAULT 'MANUAL' CHECK (TIPO IN ('MANUAL','CONDICION'));

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PROMOCIONES' AND COLUMN_NAME='IDGRUPOARTICULOS_EXCLUIR')
                ALTER TABLE APP_PROMOCIONES ADD IDGRUPOARTICULOS_EXCLUIR INT NULL REFERENCES APP_GRUPOS_ARTICULOS(ID);

                IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PROMOCIONES' AND COLUMN_NAME='IDGRUPOCLIENTES_EXCLUIR')
                ALTER TABLE APP_PROMOCIONES ADD IDGRUPOCLIENTES_EXCLUIR INT NULL REFERENCES APP_GRUPOS_CLIENTES(ID);

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_ARTICULOS_CONDICIONES' AND xtype='U')
                CREATE TABLE APP_GRUPOS_ARTICULOS_CONDICIONES (
                    ID INT IDENTITY PRIMARY KEY,
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_ARTICULOS(ID),
                    CAMPO VARCHAR(60) NOT NULL,
                    OPERADOR VARCHAR(10) NOT NULL CHECK (OPERADOR IN ('=','<>','CONTIENE','>','<','>=','<=')),
                    VALOR NVARCHAR(200) NOT NULL
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_GRUPOS_CLIENTES_CONDICIONES' AND xtype='U')
                CREATE TABLE APP_GRUPOS_CLIENTES_CONDICIONES (
                    ID INT IDENTITY PRIMARY KEY,
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_CLIENTES(ID),
                    CAMPO VARCHAR(60) NOT NULL,
                    OPERADOR VARCHAR(10) NOT NULL CHECK (OPERADOR IN ('=','<>','CONTIENE','>','<','>=','<=')),
                    VALOR NVARCHAR(200) NOT NULL
                );

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PROMESC_IDPROM' AND object_id=OBJECT_ID('APP_PROMOCIONES_ESCALAS'))
                    CREATE INDEX IX_PROMESC_IDPROM ON APP_PROMOCIONES_ESCALAS (IDPROMOCION);

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PEDPROM_ORDERID' AND object_id=OBJECT_ID('APP_PEDIDO_PROMOCIONES'))
                    CREATE INDEX IX_PEDPROM_ORDERID ON APP_PEDIDO_PROMOCIONES (ORDERID);

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_GRPARTCOND_IDGRUPO' AND object_id=OBJECT_ID('APP_GRUPOS_ARTICULOS_CONDICIONES'))
                    CREATE INDEX IX_GRPARTCOND_IDGRUPO ON APP_GRUPOS_ARTICULOS_CONDICIONES (IDGRUPO);

                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_GRPCLIICOND_IDGRUPO' AND object_id=OBJECT_ID('APP_GRUPOS_CLIENTES_CONDICIONES'))
                    CREATE INDEX IX_GRPCLIICOND_IDGRUPO ON APP_GRUPOS_CLIENTES_CONDICIONES (IDGRUPO);
            `);

            // Hacer nullable la columna IDGRUPOARTICULOS (antes NOT NULL con FK)
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PROMOCIONES' AND COLUMN_NAME='IDGRUPOARTICULOS' AND IS_NULLABLE='NO')
                BEGIN
                    DECLARE @fk1 NVARCHAR(200) = (
                        SELECT TOP 1 RC.CONSTRAINT_NAME
                        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS RC
                        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU ON RC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME
                        WHERE KCU.TABLE_NAME = 'APP_PROMOCIONES' AND KCU.COLUMN_NAME = 'IDGRUPOARTICULOS'
                    )
                    IF @fk1 IS NOT NULL EXEC('ALTER TABLE APP_PROMOCIONES DROP CONSTRAINT [' + @fk1 + ']')
                    ALTER TABLE APP_PROMOCIONES ALTER COLUMN IDGRUPOARTICULOS INT NULL
                END
            `);

            // Hacer nullable la columna IDGRUPOCLIENTES (antes NOT NULL con FK implícita)
            await pool.request().query(`
                IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='APP_PROMOCIONES' AND COLUMN_NAME='IDGRUPOCLIENTES' AND IS_NULLABLE='NO')
                BEGIN
                    DECLARE @fk2 NVARCHAR(200) = (
                        SELECT TOP 1 RC.CONSTRAINT_NAME
                        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS RC
                        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU ON RC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME
                        WHERE KCU.TABLE_NAME = 'APP_PROMOCIONES' AND KCU.COLUMN_NAME = 'IDGRUPOCLIENTES'
                    )
                    IF @fk2 IS NOT NULL EXEC('ALTER TABLE APP_PROMOCIONES DROP CONSTRAINT [' + @fk2 + ']')
                    ALTER TABLE APP_PROMOCIONES ALTER COLUMN IDGRUPOCLIENTES INT NULL
                END
            `);

            // Tablas junction para múltiples grupos por promoción
            await pool.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_PROMOCIONES_GRUPOS_ARTICULOS' AND xtype='U')
                CREATE TABLE APP_PROMOCIONES_GRUPOS_ARTICULOS (
                    ID INT IDENTITY PRIMARY KEY,
                    IDPROMO INT NOT NULL REFERENCES APP_PROMOCIONES(ID),
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_ARTICULOS(ID),
                    TIPO VARCHAR(10) NOT NULL CHECK (TIPO IN ('INCLUIR','EXCLUIR')),
                    CONSTRAINT UQ_PROMO_GRP_ART UNIQUE(IDPROMO, IDGRUPO, TIPO)
                );

                IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='APP_PROMOCIONES_GRUPOS_CLIENTES' AND xtype='U')
                CREATE TABLE APP_PROMOCIONES_GRUPOS_CLIENTES (
                    ID INT IDENTITY PRIMARY KEY,
                    IDPROMO INT NOT NULL REFERENCES APP_PROMOCIONES(ID),
                    IDGRUPO INT NOT NULL REFERENCES APP_GRUPOS_CLIENTES(ID),
                    TIPO VARCHAR(10) NOT NULL CHECK (TIPO IN ('INCLUIR','EXCLUIR')),
                    CONSTRAINT UQ_PROMO_GRP_CLI UNIQUE(IDPROMO, IDGRUPO, TIPO)
                );
            `);

            // Migrar datos existentes de columnas únicas a junction tables (idempotente)
            await pool.request().query(`
                INSERT INTO APP_PROMOCIONES_GRUPOS_ARTICULOS (IDPROMO, IDGRUPO, TIPO)
                SELECT P.ID, P.IDGRUPOARTICULOS, 'INCLUIR'
                FROM APP_PROMOCIONES P
                WHERE P.IDGRUPOARTICULOS IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_ARTICULOS X WHERE X.IDPROMO = P.ID AND X.TIPO = 'INCLUIR');

                INSERT INTO APP_PROMOCIONES_GRUPOS_ARTICULOS (IDPROMO, IDGRUPO, TIPO)
                SELECT P.ID, P.IDGRUPOARTICULOS_EXCLUIR, 'EXCLUIR'
                FROM APP_PROMOCIONES P
                WHERE P.IDGRUPOARTICULOS_EXCLUIR IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_ARTICULOS X WHERE X.IDPROMO = P.ID AND X.TIPO = 'EXCLUIR' AND X.IDGRUPO = P.IDGRUPOARTICULOS_EXCLUIR);

                INSERT INTO APP_PROMOCIONES_GRUPOS_CLIENTES (IDPROMO, IDGRUPO, TIPO)
                SELECT P.ID, P.IDGRUPOCLIENTES, 'INCLUIR'
                FROM APP_PROMOCIONES P
                WHERE P.IDGRUPOCLIENTES IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES X WHERE X.IDPROMO = P.ID AND X.TIPO = 'INCLUIR');

                INSERT INTO APP_PROMOCIONES_GRUPOS_CLIENTES (IDPROMO, IDGRUPO, TIPO)
                SELECT P.ID, P.IDGRUPOCLIENTES_EXCLUIR, 'EXCLUIR'
                FROM APP_PROMOCIONES P
                WHERE P.IDGRUPOCLIENTES_EXCLUIR IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM APP_PROMOCIONES_GRUPOS_CLIENTES X WHERE X.IDPROMO = P.ID AND X.TIPO = 'EXCLUIR' AND X.IDGRUPO = P.IDGRUPOCLIENTES_EXCLUIR);
            `);
            console.log('Tablas APP_* de promociones verificadas.');
        } catch (err) {
            console.error('Advertencia en PromocionesService.initTablas:', err);
        }
    }

    // ---------- CAMPOS DISPONIBLES PARA CONDICIONES ----------

    static getCamposDisponibles() {
        const mapear = (campos: Record<string, CampoDef>) =>
            Object.entries(campos).map(([codigo, def]) => ({ codigo, label: def.label, tipo: def.tipo }));
        return { articulos: mapear(CAMPOS_ARTICULOS), clientes: mapear(CAMPOS_CLIENTES) };
    }

    // ---------- GRUPOS DE ARTICULOS ----------

    static async getGruposArticulos(search: string, page: number, limit: number) {
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro = search ? `%${search}%` : '%';
        const result = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, safeLimit)
            .query(`
                SELECT ID, NOMBRE, ACTIVO, TIPO, FECHACREACION,
                    (SELECT COUNT(*) FROM APP_GRUPOS_ARTICULOS_DETALLE WHERE IDGRUPO = G.ID) AS TOTALARTICULOS
                FROM APP_GRUPOS_ARTICULOS G
                WHERE NOMBRE LIKE @FILTRO
                ORDER BY NOMBRE
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`SELECT COUNT(*) AS TOTAL FROM APP_GRUPOS_ARTICULOS WHERE NOMBRE LIKE @FILTRO`);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async crearGrupoArticulos(nombre: string, tipo: 'MANUAL' | 'CONDICION', condiciones?: CondicionInput[]) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            const headerReq = new mssql.Request(transaction);
            const result = await headerReq
                .input('NOMBRE', mssql.NVarChar, nombre)
                .input('TIPO', mssql.VarChar, tipo)
                .query(`INSERT INTO APP_GRUPOS_ARTICULOS (NOMBRE, TIPO) OUTPUT INSERTED.ID VALUES (@NOMBRE, @TIPO)`);
            const id = result.recordset[0].ID;

            if (tipo === 'CONDICION') {
                for (const c of (condiciones ?? [])) {
                    const condReq = new mssql.Request(transaction);
                    await condReq
                        .input('IDGRUPO', mssql.Int, id)
                        .input('CAMPO', mssql.VarChar, c.campo)
                        .input('OPERADOR', mssql.VarChar, c.operador)
                        .input('VALOR', mssql.NVarChar, c.valor)
                        .query(`INSERT INTO APP_GRUPOS_ARTICULOS_CONDICIONES (IDGRUPO, CAMPO, OPERADOR, VALOR) VALUES (@IDGRUPO, @CAMPO, @OPERADOR, @VALOR)`);
                }
            }
            await transaction.commit();
            return id;
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async actualizarGrupoArticulos(id: number, nombre: string, activo: boolean, tipo?: 'MANUAL' | 'CONDICION', condiciones?: CondicionInput[]) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            const headerReq = new mssql.Request(transaction);
            await headerReq
                .input('ID', mssql.Int, id)
                .input('NOMBRE', mssql.NVarChar, nombre)
                .input('ACTIVO', mssql.Bit, activo)
                .input('TIPO', mssql.VarChar, tipo ?? 'MANUAL')
                .query(`UPDATE APP_GRUPOS_ARTICULOS SET NOMBRE = @NOMBRE, ACTIVO = @ACTIVO, TIPO = @TIPO WHERE ID = @ID`);

            if (tipo === 'CONDICION') {
                const delReq = new mssql.Request(transaction);
                await delReq.input('ID', mssql.Int, id).query(`DELETE FROM APP_GRUPOS_ARTICULOS_CONDICIONES WHERE IDGRUPO = @ID`);
                for (const c of (condiciones ?? [])) {
                    const condReq = new mssql.Request(transaction);
                    await condReq
                        .input('IDGRUPO', mssql.Int, id)
                        .input('CAMPO', mssql.VarChar, c.campo)
                        .input('OPERADOR', mssql.VarChar, c.operador)
                        .input('VALOR', mssql.NVarChar, c.valor)
                        .query(`INSERT INTO APP_GRUPOS_ARTICULOS_CONDICIONES (IDGRUPO, CAMPO, OPERADOR, VALOR) VALUES (@IDGRUPO, @CAMPO, @OPERADOR, @VALOR)`);
                }
            }
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async getCondicionesGrupoArticulos(idGrupo: number) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .query(`SELECT CAMPO AS campo, OPERADOR AS operador, VALOR AS valor FROM APP_GRUPOS_ARTICULOS_CONDICIONES WHERE IDGRUPO = @IDGRUPO`);
        return result.recordset;
    }

    private static async getTipoGrupoArticulos(idGrupo: number): Promise<'MANUAL' | 'CONDICION'> {
        const pool = await connectDb();
        const result = await pool.request().input('ID', mssql.Int, idGrupo).query(`SELECT TIPO FROM APP_GRUPOS_ARTICULOS WHERE ID = @ID`);
        return result.recordset[0]?.TIPO ?? 'MANUAL';
    }

    static async resolverMiembrosCondicionArticulos(idGrupo: number): Promise<number[]> {
        const pool = await connectDb();
        const condiciones = await this.getCondicionesGrupoArticulos(idGrupo);
        if (condiciones.length === 0) return [];
        const request = pool.request();
        const where = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_ARTICULOS, request);
        const result = await request.query(`
            SELECT A.CODARTICULO
            FROM ARTICULOS A LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
            WHERE A.TIPOARTICULO = 'A' AND A.DESCATALOGADO = 'F' AND ISNULL(A.NODTOAPLICABLE, 0) <> 1 AND (${where})
        `);
        return result.recordset.map((r: any) => r.CODARTICULO);
    }

    static async getArticulosDeGrupo(idGrupo: number, search: string, page: number, limit: number) {
        const tipo = await this.getTipoGrupoArticulos(idGrupo);
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro = search ? `%${search.toUpperCase()}%` : '%';

        if (tipo === 'CONDICION') {
            const condiciones = await this.getCondicionesGrupoArticulos(idGrupo);
            if (condiciones.length === 0) return { data: [], total: 0 };
            const request = pool.request();
            const where = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_ARTICULOS, request);
            request.input('FILTRO', mssql.NVarChar, filtro).input('OFFSET', mssql.Int, offset).input('LIMIT', mssql.Int, safeLimit);
            const result = await request.query(`
                SELECT A.CODARTICULO, A.REFPROVEEDOR, ACL.DESCRIPCIONLARGA AS DESCRIPCION
                FROM ARTICULOS A LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                WHERE A.TIPOARTICULO = 'A' AND A.DESCATALOGADO = 'F' AND (${where})
                    AND (UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO OR UPPER(A.REFPROVEEDOR) LIKE @FILTRO)
                ORDER BY ACL.DESCRIPCIONLARGA
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
            const countRequest = pool.request();
            const countWhere = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_ARTICULOS, countRequest);
            countRequest.input('FILTRO', mssql.NVarChar, filtro);
            const countResult = await countRequest.query(`
                SELECT COUNT(*) AS TOTAL
                FROM ARTICULOS A LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                WHERE A.TIPOARTICULO = 'A' AND A.DESCATALOGADO = 'F' AND (${countWhere})
                    AND (UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO OR UPPER(A.REFPROVEEDOR) LIKE @FILTRO)
            `);
            return { data: result.recordset, total: countResult.recordset[0].TOTAL };
        }

        const result = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, safeLimit)
            .query(`
                SELECT D.ID, D.CODARTICULO, A.REFPROVEEDOR, ACL.DESCRIPCIONLARGA AS DESCRIPCION
                FROM APP_GRUPOS_ARTICULOS_DETALLE D
                    INNER JOIN ARTICULOS A ON A.CODARTICULO = D.CODARTICULO
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                WHERE D.IDGRUPO = @IDGRUPO
                    AND (UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO OR UPPER(A.REFPROVEEDOR) LIKE @FILTRO)
                ORDER BY ACL.DESCRIPCIONLARGA
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS TOTAL
                FROM APP_GRUPOS_ARTICULOS_DETALLE D
                    INNER JOIN ARTICULOS A ON A.CODARTICULO = D.CODARTICULO
                    LEFT JOIN ARTICULOSCAMPOSLIBRES ACL ON ACL.CODARTICULO = A.CODARTICULO
                WHERE D.IDGRUPO = @IDGRUPO
                    AND (UPPER(ACL.DESCRIPCIONLARGA) LIKE @FILTRO OR UPPER(A.REFPROVEEDOR) LIKE @FILTRO)
            `);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async agregarArticuloAGrupo(idGrupo: number, codArticulo: number) {
        const tipo = await this.getTipoGrupoArticulos(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones, no se agregan artículos manualmente.');
        const pool = await connectDb();
        await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('CODARTICULO', mssql.Int, codArticulo)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM APP_GRUPOS_ARTICULOS_DETALLE WHERE IDGRUPO = @IDGRUPO AND CODARTICULO = @CODARTICULO)
                INSERT INTO APP_GRUPOS_ARTICULOS_DETALLE (IDGRUPO, CODARTICULO) VALUES (@IDGRUPO, @CODARTICULO)
            `);
    }

    static async importarArticulosExcel(idGrupo: number, buffer: Buffer): Promise<{ insertados: number; noEncontrados: string[]; yaEnGrupo: string[] }> {
        const tipo = await this.getTipoGrupoArticulos(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones.');
        const XLSX = await import('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        // Acepta CODARTICULO (número) o REFPROVEEDOR (texto de referencia/código de barras)
        const valores: string[] = rows.map(r => String(r[0] ?? '').trim()).filter(v => v.length > 0);
        if (valores.length === 0) return { insertados: 0, noEncontrados: [], yaEnGrupo: [] };

        const pool = await connectDb();
        const req = pool.request();
        // Búsqueda dual: por CODARTICULO si es numérico, por REFPROVEEDOR siempre
        const placeholders = valores.map((v, i) => {
            req.input(`v${i}`, mssql.NVarChar, v);
            return `(CAST(CODARTICULO AS VARCHAR) = @v${i} OR REFPROVEEDOR = @v${i})`;
        }).join(' OR ');
        const validos = (await req.query(
            `SELECT CODARTICULO, ISNULL(REFPROVEEDOR,'') AS REFPROVEEDOR FROM ARTICULOS WHERE ${placeholders}`
        )).recordset;

        const validosPorClave = new Map<string, number>();
        for (const r of validos) {
            validosPorClave.set(String(r.CODARTICULO), r.CODARTICULO);
            if (r.REFPROVEEDOR) validosPorClave.set(r.REFPROVEEDOR, r.CODARTICULO);
        }

        const existentes = new Set((await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .query(`SELECT CODARTICULO FROM APP_GRUPOS_ARTICULOS_DETALLE WHERE IDGRUPO = @IDGRUPO`))
            .recordset.map((r: any) => r.CODARTICULO as number));

        const noEncontrados: string[] = [];
        const yaEnGrupo: string[] = [];
        const aNuevos: number[] = [];

        for (const v of valores) {
            const cod = validosPorClave.get(v);
            if (cod === undefined) { noEncontrados.push(v); continue; }
            if (existentes.has(cod)) { yaEnGrupo.push(v); continue; }
            if (!aNuevos.includes(cod)) aNuevos.push(cod);
        }

        for (const cod of aNuevos) {
            await pool.request()
                .input('IDGRUPO', mssql.Int, idGrupo)
                .input('CODARTICULO', mssql.Int, cod)
                .query(`INSERT INTO APP_GRUPOS_ARTICULOS_DETALLE (IDGRUPO, CODARTICULO) VALUES (@IDGRUPO, @CODARTICULO)`);
        }
        return { insertados: aNuevos.length, noEncontrados, yaEnGrupo };
    }

    static async quitarArticuloDeGrupo(idGrupo: number, codArticulo: number) {
        const tipo = await this.getTipoGrupoArticulos(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones, no se quitan artículos manualmente.');
        const pool = await connectDb();
        await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('CODARTICULO', mssql.Int, codArticulo)
            .query(`DELETE FROM APP_GRUPOS_ARTICULOS_DETALLE WHERE IDGRUPO = @IDGRUPO AND CODARTICULO = @CODARTICULO`);
    }

    // ---------- GRUPOS DE CLIENTES ----------

    static async getGruposClientes(search: string, page: number, limit: number) {
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro = search ? `%${search}%` : '%';
        const result = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, safeLimit)
            .query(`
                SELECT ID, NOMBRE, ACTIVO, TIPO, FECHACREACION,
                    (SELECT COUNT(*) FROM APP_GRUPOS_CLIENTES_DETALLE WHERE IDGRUPO = G.ID) AS TOTALCLIENTES
                FROM APP_GRUPOS_CLIENTES G
                WHERE NOMBRE LIKE @FILTRO
                ORDER BY NOMBRE
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`SELECT COUNT(*) AS TOTAL FROM APP_GRUPOS_CLIENTES WHERE NOMBRE LIKE @FILTRO`);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async crearGrupoClientes(nombre: string, tipo: 'MANUAL' | 'CONDICION', condiciones?: CondicionInput[]) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            const headerReq = new mssql.Request(transaction);
            const result = await headerReq
                .input('NOMBRE', mssql.NVarChar, nombre)
                .input('TIPO', mssql.VarChar, tipo)
                .query(`INSERT INTO APP_GRUPOS_CLIENTES (NOMBRE, TIPO) OUTPUT INSERTED.ID VALUES (@NOMBRE, @TIPO)`);
            const id = result.recordset[0].ID;

            if (tipo === 'CONDICION') {
                for (const c of (condiciones ?? [])) {
                    const condReq = new mssql.Request(transaction);
                    await condReq
                        .input('IDGRUPO', mssql.Int, id)
                        .input('CAMPO', mssql.VarChar, c.campo)
                        .input('OPERADOR', mssql.VarChar, c.operador)
                        .input('VALOR', mssql.NVarChar, c.valor)
                        .query(`INSERT INTO APP_GRUPOS_CLIENTES_CONDICIONES (IDGRUPO, CAMPO, OPERADOR, VALOR) VALUES (@IDGRUPO, @CAMPO, @OPERADOR, @VALOR)`);
                }
            }
            await transaction.commit();
            return id;
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async actualizarGrupoClientes(id: number, nombre: string, activo: boolean, tipo?: 'MANUAL' | 'CONDICION', condiciones?: CondicionInput[]) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            const headerReq = new mssql.Request(transaction);
            await headerReq
                .input('ID', mssql.Int, id)
                .input('NOMBRE', mssql.NVarChar, nombre)
                .input('ACTIVO', mssql.Bit, activo)
                .input('TIPO', mssql.VarChar, tipo ?? 'MANUAL')
                .query(`UPDATE APP_GRUPOS_CLIENTES SET NOMBRE = @NOMBRE, ACTIVO = @ACTIVO, TIPO = @TIPO WHERE ID = @ID`);

            if (tipo === 'CONDICION') {
                const delReq = new mssql.Request(transaction);
                await delReq.input('ID', mssql.Int, id).query(`DELETE FROM APP_GRUPOS_CLIENTES_CONDICIONES WHERE IDGRUPO = @ID`);
                for (const c of (condiciones ?? [])) {
                    const condReq = new mssql.Request(transaction);
                    await condReq
                        .input('IDGRUPO', mssql.Int, id)
                        .input('CAMPO', mssql.VarChar, c.campo)
                        .input('OPERADOR', mssql.VarChar, c.operador)
                        .input('VALOR', mssql.NVarChar, c.valor)
                        .query(`INSERT INTO APP_GRUPOS_CLIENTES_CONDICIONES (IDGRUPO, CAMPO, OPERADOR, VALOR) VALUES (@IDGRUPO, @CAMPO, @OPERADOR, @VALOR)`);
                }
            }
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async getCondicionesGrupoClientes(idGrupo: number) {
        const pool = await connectDb();
        const result = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .query(`SELECT CAMPO AS campo, OPERADOR AS operador, VALOR AS valor FROM APP_GRUPOS_CLIENTES_CONDICIONES WHERE IDGRUPO = @IDGRUPO`);
        return result.recordset;
    }

    private static async getTipoGrupoClientes(idGrupo: number): Promise<'MANUAL' | 'CONDICION'> {
        const pool = await connectDb();
        const result = await pool.request().input('ID', mssql.Int, idGrupo).query(`SELECT TIPO FROM APP_GRUPOS_CLIENTES WHERE ID = @ID`);
        return result.recordset[0]?.TIPO ?? 'MANUAL';
    }

    static async resolverMiembrosCondicionClientes(idGrupo: number): Promise<number[]> {
        const pool = await connectDb();
        const condiciones = await this.getCondicionesGrupoClientes(idGrupo);
        if (condiciones.length === 0) return [];
        const request = pool.request();
        const where = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_CLIENTES, request);
        const result = await request.query(`
            SELECT CL.CODCLIENTE
            FROM CLIENTES CL LEFT JOIN CLIENTESCAMPOSLIBRES CCL ON CCL.CODCLIENTE = CL.CODCLIENTE
            WHERE (${where})
        `);
        return result.recordset.map((r: any) => r.CODCLIENTE);
    }

    static async getClientesDeGrupo(idGrupo: number, search: string, page: number, limit: number) {
        const tipo = await this.getTipoGrupoClientes(idGrupo);
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro = search ? `%${search.toUpperCase()}%` : '%';

        if (tipo === 'CONDICION') {
            const condiciones = await this.getCondicionesGrupoClientes(idGrupo);
            if (condiciones.length === 0) return { data: [], total: 0 };
            const request = pool.request();
            const where = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_CLIENTES, request);
            request.input('FILTRO', mssql.NVarChar, filtro).input('OFFSET', mssql.Int, offset).input('LIMIT', mssql.Int, safeLimit);
            const result = await request.query(`
                SELECT CL.CODCLIENTE, CL.NOMBRECLIENTE, CL.CIF
                FROM CLIENTES CL LEFT JOIN CLIENTESCAMPOSLIBRES CCL ON CCL.CODCLIENTE = CL.CODCLIENTE
                WHERE (${where})
                    AND (UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO)
                ORDER BY CL.NOMBRECLIENTE
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
            const countRequest = pool.request();
            const countWhere = construirWhereCondiciones(condiciones as CondicionInput[], CAMPOS_CLIENTES, countRequest);
            countRequest.input('FILTRO', mssql.NVarChar, filtro);
            const countResult = await countRequest.query(`
                SELECT COUNT(*) AS TOTAL
                FROM CLIENTES CL LEFT JOIN CLIENTESCAMPOSLIBRES CCL ON CCL.CODCLIENTE = CL.CODCLIENTE
                WHERE (${countWhere})
                    AND (UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO)
            `);
            return { data: result.recordset, total: countResult.recordset[0].TOTAL };
        }

        const result = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, safeLimit)
            .query(`
                SELECT D.ID, D.CODCLIENTE, CL.NOMBRECLIENTE, CL.CIF
                FROM APP_GRUPOS_CLIENTES_DETALLE D
                    INNER JOIN CLIENTES CL ON CL.CODCLIENTE = D.CODCLIENTE
                WHERE D.IDGRUPO = @IDGRUPO
                    AND (UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO)
                ORDER BY CL.NOMBRECLIENTE
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`
                SELECT COUNT(*) AS TOTAL
                FROM APP_GRUPOS_CLIENTES_DETALLE D
                    INNER JOIN CLIENTES CL ON CL.CODCLIENTE = D.CODCLIENTE
                WHERE D.IDGRUPO = @IDGRUPO
                    AND (UPPER(ISNULL(CL.NOMBRECLIENTE,'')) LIKE @FILTRO OR UPPER(ISNULL(CL.CIF,'')) LIKE @FILTRO)
            `);
        return { data: result.recordset, total: countResult.recordset[0].TOTAL };
    }

    static async agregarClienteAGrupo(idGrupo: number, codCliente: number) {
        const tipo = await this.getTipoGrupoClientes(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones, no se agregan clientes manualmente.');
        const pool = await connectDb();
        await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('CODCLIENTE', mssql.Int, codCliente)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM APP_GRUPOS_CLIENTES_DETALLE WHERE IDGRUPO = @IDGRUPO AND CODCLIENTE = @CODCLIENTE)
                INSERT INTO APP_GRUPOS_CLIENTES_DETALLE (IDGRUPO, CODCLIENTE) VALUES (@IDGRUPO, @CODCLIENTE)
            `);
    }

    static async importarClientesExcel(idGrupo: number, buffer: Buffer): Promise<{ insertados: number; noEncontrados: string[]; yaEnGrupo: string[] }> {
        const tipo = await this.getTipoGrupoClientes(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones.');
        const XLSX = await import('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        // Acepta CODCLIENTE (número), CIF o NIF20 (texto)
        const valores: string[] = rows.map(r => String(r[0] ?? '').trim()).filter(v => v.length > 0);
        if (valores.length === 0) return { insertados: 0, noEncontrados: [], yaEnGrupo: [] };

        const pool = await connectDb();
        const req = pool.request();
        const placeholders = valores.map((v, i) => {
            req.input(`v${i}`, mssql.NVarChar, v);
            return `(CAST(CODCLIENTE AS VARCHAR) = @v${i} OR ISNULL(CIF,'') = @v${i} OR ISNULL(NIF20,'') = @v${i})`;
        }).join(' OR ');
        const validos = (await req.query(
            `SELECT CODCLIENTE, ISNULL(CIF,'') AS CIF, ISNULL(NIF20,'') AS NIF20 FROM CLIENTES WHERE ${placeholders}`
        )).recordset;

        const validosPorClave = new Map<string, number>();
        for (const r of validos) {
            validosPorClave.set(String(r.CODCLIENTE), r.CODCLIENTE);
            if (r.CIF)   validosPorClave.set(r.CIF, r.CODCLIENTE);
            if (r.NIF20) validosPorClave.set(r.NIF20, r.CODCLIENTE);
        }

        const existentes = new Set((await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .query(`SELECT CODCLIENTE FROM APP_GRUPOS_CLIENTES_DETALLE WHERE IDGRUPO = @IDGRUPO`))
            .recordset.map((r: any) => r.CODCLIENTE as number));

        const noEncontrados: string[] = [];
        const yaEnGrupo: string[] = [];
        const aNuevos: number[] = [];

        for (const v of valores) {
            const cod = validosPorClave.get(v);
            if (cod === undefined) { noEncontrados.push(v); continue; }
            if (existentes.has(cod)) { yaEnGrupo.push(v); continue; }
            if (!aNuevos.includes(cod)) aNuevos.push(cod);
        }

        for (const cod of aNuevos) {
            await pool.request()
                .input('IDGRUPO', mssql.Int, idGrupo)
                .input('CODCLIENTE', mssql.Int, cod)
                .query(`INSERT INTO APP_GRUPOS_CLIENTES_DETALLE (IDGRUPO, CODCLIENTE) VALUES (@IDGRUPO, @CODCLIENTE)`);
        }
        return { insertados: aNuevos.length, noEncontrados, yaEnGrupo };
    }

    static async quitarClienteDeGrupo(idGrupo: number, codCliente: number) {
        const tipo = await this.getTipoGrupoClientes(idGrupo);
        if (tipo === 'CONDICION') throw new Error('Grupo dinámico: edita las condiciones, no se quitan clientes manualmente.');
        const pool = await connectDb();
        await pool.request()
            .input('IDGRUPO', mssql.Int, idGrupo)
            .input('CODCLIENTE', mssql.Int, codCliente)
            .query(`DELETE FROM APP_GRUPOS_CLIENTES_DETALLE WHERE IDGRUPO = @IDGRUPO AND CODCLIENTE = @CODCLIENTE`);
    }

    // ---------- PROMOCIONES ----------

    static async getPromociones(search: string, page: number, limit: number) {
        const pool = await connectDb();
        const safeLimit = limit === -1 ? 10000 : Math.max(1, limit);
        const offset = limit === -1 ? 0 : (Math.max(1, page) - 1) * safeLimit;
        const filtro = search ? `%${search}%` : '%';
        const result = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .input('OFFSET', mssql.Int, offset)
            .input('LIMIT', mssql.Int, safeLimit)
            .query(`
                SELECT P.ID, P.NOMBRE, P.BASE, P.ALCANCE_CLIENTE, P.FECHAINICIO, P.FECHAFIN, P.ACTIVO
                FROM APP_PROMOCIONES P
                WHERE P.NOMBRE LIKE @FILTRO
                ORDER BY P.FECHACREACION DESC
                OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
            `);
        const countResult = await pool.request()
            .input('FILTRO', mssql.NVarChar, filtro)
            .query(`SELECT COUNT(*) AS TOTAL FROM APP_PROMOCIONES WHERE NOMBRE LIKE @FILTRO`);

        const ids: number[] = result.recordset.map((r: any) => r.ID);
        if (ids.length === 0) return { data: [], total: 0 };

        const idList = ids.join(',');
        const [escResult, grpArtResult, grpCliResult] = await Promise.all([
            pool.request().query(`SELECT IDPROMOCION, MINIMO, MAXIMO, PORCENTAJE FROM APP_PROMOCIONES_ESCALAS WHERE IDPROMOCION IN (${idList}) ORDER BY MINIMO`),
            pool.request().query(`SELECT PGA.IDPROMO, PGA.TIPO, GA.ID, GA.NOMBRE FROM APP_PROMOCIONES_GRUPOS_ARTICULOS PGA JOIN APP_GRUPOS_ARTICULOS GA ON GA.ID = PGA.IDGRUPO WHERE PGA.IDPROMO IN (${idList})`),
            pool.request().query(`SELECT PGC.IDPROMO, PGC.TIPO, GC.ID, GC.NOMBRE FROM APP_PROMOCIONES_GRUPOS_CLIENTES PGC JOIN APP_GRUPOS_CLIENTES GC ON GC.ID = PGC.IDGRUPO WHERE PGC.IDPROMO IN (${idList})`),
        ]);

        const escalas: Record<number, any[]> = {};
        escResult.recordset.forEach((e: any) => { (escalas[e.IDPROMOCION] ??= []).push(e); });
        const grpArt: Record<number, any[]> = {};
        grpArtResult.recordset.forEach((r: any) => { (grpArt[r.IDPROMO] ??= []).push({ ID: r.ID, NOMBRE: r.NOMBRE, TIPO: r.TIPO }); });
        const grpCli: Record<number, any[]> = {};
        grpCliResult.recordset.forEach((r: any) => { (grpCli[r.IDPROMO] ??= []).push({ ID: r.ID, NOMBRE: r.NOMBRE, TIPO: r.TIPO }); });

        const data = result.recordset.map((r: any) => ({
            ...r,
            gruposArticulos: grpArt[r.ID] ?? [],
            gruposClientes: grpCli[r.ID] ?? [],
            escalas: escalas[r.ID] ?? [],
        }));
        return { data, total: countResult.recordset[0].TOTAL };
    }

    static async crearPromocion(promo: {
        nombre: string;
        gruposArticulos: { id: number; tipo: 'INCLUIR' | 'EXCLUIR' }[];
        gruposClientes: { id: number; tipo: 'INCLUIR' | 'EXCLUIR' }[];
        base: 'UNIDADES' | 'MONTO';
        alcanceCliente: 'TODOS' | 'INCLUIR_GRUPO' | 'EXCLUIR_GRUPO';
        fechaInicio: string; fechaFin: string; escalas: EscalaInput[];
    }) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            const headerReq = new mssql.Request(transaction);
            const result = await headerReq
                .input('NOMBRE', mssql.NVarChar, promo.nombre)
                .input('BASE', mssql.VarChar, promo.base)
                .input('ALCANCE', mssql.VarChar, promo.alcanceCliente)
                .input('FECHAINICIO', mssql.Date, promo.fechaInicio)
                .input('FECHAFIN', mssql.Date, promo.fechaFin)
                .query(`INSERT INTO APP_PROMOCIONES (NOMBRE, BASE, ALCANCE_CLIENTE, FECHAINICIO, FECHAFIN) OUTPUT INSERTED.ID VALUES (@NOMBRE, @BASE, @ALCANCE, @FECHAINICIO, @FECHAFIN)`);
            const idPromocion = result.recordset[0].ID;

            for (const g of promo.gruposArticulos) {
                await new mssql.Request(transaction)
                    .input('IDPROMO', mssql.Int, idPromocion).input('IDGRUPO', mssql.Int, g.id).input('TIPO', mssql.VarChar, g.tipo)
                    .query(`INSERT INTO APP_PROMOCIONES_GRUPOS_ARTICULOS (IDPROMO, IDGRUPO, TIPO) VALUES (@IDPROMO, @IDGRUPO, @TIPO)`);
            }
            for (const g of promo.gruposClientes) {
                await new mssql.Request(transaction)
                    .input('IDPROMO', mssql.Int, idPromocion).input('IDGRUPO', mssql.Int, g.id).input('TIPO', mssql.VarChar, g.tipo)
                    .query(`INSERT INTO APP_PROMOCIONES_GRUPOS_CLIENTES (IDPROMO, IDGRUPO, TIPO) VALUES (@IDPROMO, @IDGRUPO, @TIPO)`);
            }
            for (const esc of promo.escalas) {
                await new mssql.Request(transaction)
                    .input('IDPROMOCION', mssql.Int, idPromocion).input('MINIMO', mssql.Float, esc.minimo)
                    .input('MAXIMO', mssql.Float, esc.maximo).input('PORCENTAJE', mssql.Float, esc.porcentaje)
                    .query(`INSERT INTO APP_PROMOCIONES_ESCALAS (IDPROMOCION, MINIMO, MAXIMO, PORCENTAJE) VALUES (@IDPROMOCION, @MINIMO, @MAXIMO, @PORCENTAJE)`);
            }
            await transaction.commit();
            return idPromocion;
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async actualizarPromocion(id: number, promo: {
        nombre: string;
        gruposArticulos: { id: number; tipo: 'INCLUIR' | 'EXCLUIR' }[];
        gruposClientes: { id: number; tipo: 'INCLUIR' | 'EXCLUIR' }[];
        base: 'UNIDADES' | 'MONTO';
        alcanceCliente: 'TODOS' | 'INCLUIR_GRUPO' | 'EXCLUIR_GRUPO';
        fechaInicio: string; fechaFin: string; escalas: EscalaInput[];
    }) {
        const pool = await connectDb();
        const transaction = new mssql.Transaction(pool);
        await transaction.begin();
        try {
            await new mssql.Request(transaction)
                .input('ID', mssql.Int, id).input('NOMBRE', mssql.NVarChar, promo.nombre)
                .input('BASE', mssql.VarChar, promo.base).input('ALCANCE', mssql.VarChar, promo.alcanceCliente)
                .input('FECHAINICIO', mssql.Date, promo.fechaInicio).input('FECHAFIN', mssql.Date, promo.fechaFin)
                .query(`UPDATE APP_PROMOCIONES SET NOMBRE=@NOMBRE, BASE=@BASE, ALCANCE_CLIENTE=@ALCANCE, FECHAINICIO=@FECHAINICIO, FECHAFIN=@FECHAFIN WHERE ID=@ID`);

            await new mssql.Request(transaction).input('ID', mssql.Int, id)
                .query(`DELETE FROM APP_PROMOCIONES_GRUPOS_ARTICULOS WHERE IDPROMO=@ID`);
            await new mssql.Request(transaction).input('ID', mssql.Int, id)
                .query(`DELETE FROM APP_PROMOCIONES_GRUPOS_CLIENTES WHERE IDPROMO=@ID`);
            await new mssql.Request(transaction).input('ID', mssql.Int, id)
                .query(`DELETE FROM APP_PROMOCIONES_ESCALAS WHERE IDPROMOCION=@ID`);

            for (const g of promo.gruposArticulos) {
                await new mssql.Request(transaction)
                    .input('IDPROMO', mssql.Int, id).input('IDGRUPO', mssql.Int, g.id).input('TIPO', mssql.VarChar, g.tipo)
                    .query(`INSERT INTO APP_PROMOCIONES_GRUPOS_ARTICULOS (IDPROMO, IDGRUPO, TIPO) VALUES (@IDPROMO, @IDGRUPO, @TIPO)`);
            }
            for (const g of promo.gruposClientes) {
                await new mssql.Request(transaction)
                    .input('IDPROMO', mssql.Int, id).input('IDGRUPO', mssql.Int, g.id).input('TIPO', mssql.VarChar, g.tipo)
                    .query(`INSERT INTO APP_PROMOCIONES_GRUPOS_CLIENTES (IDPROMO, IDGRUPO, TIPO) VALUES (@IDPROMO, @IDGRUPO, @TIPO)`);
            }
            for (const esc of promo.escalas) {
                await new mssql.Request(transaction)
                    .input('IDPROMOCION', mssql.Int, id).input('MINIMO', mssql.Float, esc.minimo)
                    .input('MAXIMO', mssql.Float, esc.maximo).input('PORCENTAJE', mssql.Float, esc.porcentaje)
                    .query(`INSERT INTO APP_PROMOCIONES_ESCALAS (IDPROMOCION, MINIMO, MAXIMO, PORCENTAJE) VALUES (@IDPROMOCION, @MINIMO, @MAXIMO, @PORCENTAJE)`);
            }
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    static async cambiarActivoPromocion(id: number, activo: boolean) {
        const pool = await connectDb();
        await pool.request()
            .input('ID', mssql.Int, id)
            .input('ACTIVO', mssql.Bit, activo)
            .query(`UPDATE APP_PROMOCIONES SET ACTIVO = @ACTIVO WHERE ID = @ID`);
    }

    static async getVigentes() {
        const pool = await connectDb();
        const result = await pool.request().query(`
            SELECT P.ID, P.NOMBRE, P.BASE, P.ALCANCE_CLIENTE
            FROM APP_PROMOCIONES P
            WHERE P.ACTIVO = 1 AND CAST(GETDATE() AS DATE) BETWEEN P.FECHAINICIO AND P.FECHAFIN
        `);
        const promos = result.recordset;
        if (promos.length === 0) return [];

        const idList = promos.map((p: any) => p.ID).join(',');

        // Cargar escalas, grupos de artículos y grupos de clientes en paralelo
        const [escalasResult, juncArtResult, juncCliResult] = await Promise.all([
            pool.request().query(`SELECT IDPROMOCION, MINIMO, MAXIMO, PORCENTAJE FROM APP_PROMOCIONES_ESCALAS WHERE IDPROMOCION IN (${idList}) ORDER BY MINIMO`),
            pool.request().query(`SELECT IDPROMO, IDGRUPO, TIPO FROM APP_PROMOCIONES_GRUPOS_ARTICULOS WHERE IDPROMO IN (${idList})`),
            pool.request().query(`SELECT IDPROMO, IDGRUPO, TIPO FROM APP_PROMOCIONES_GRUPOS_CLIENTES WHERE IDPROMO IN (${idList})`),
        ]);

        // { idPromo → { INCLUIR: number[], EXCLUIR: number[] } }
        const juncArt: Record<number, { INCLUIR: number[]; EXCLUIR: number[] }> = {};
        juncArtResult.recordset.forEach((r: any) => {
            juncArt[r.IDPROMO] ??= { INCLUIR: [], EXCLUIR: [] };
            juncArt[r.IDPROMO][r.TIPO as 'INCLUIR' | 'EXCLUIR'].push(r.IDGRUPO);
        });
        const juncCli: Record<number, { INCLUIR: number[]; EXCLUIR: number[] }> = {};
        juncCliResult.recordset.forEach((r: any) => {
            juncCli[r.IDPROMO] ??= { INCLUIR: [], EXCLUIR: [] };
            juncCli[r.IDPROMO][r.TIPO as 'INCLUIR' | 'EXCLUIR'].push(r.IDGRUPO);
        });

        // IDs únicos de todos los grupos de artículos y clientes a resolver
        const todosIdsGrpArt = [...new Set(juncArtResult.recordset.map((r: any) => r.IDGRUPO as number))];
        const todosIdsGrpCli = [...new Set(juncCliResult.recordset.map((r: any) => r.IDGRUPO as number))];

        // Tipos de grupos
        const tiposGrpArt: Record<number, string> = {};
        const tiposGrpCli: Record<number, string> = {};
        if (todosIdsGrpArt.length > 0) {
            (await pool.request().query(`SELECT ID, TIPO FROM APP_GRUPOS_ARTICULOS WHERE ID IN (${todosIdsGrpArt.join(',')})`))
                .recordset.forEach((r: any) => { tiposGrpArt[r.ID] = r.TIPO; });
        }
        if (todosIdsGrpCli.length > 0) {
            (await pool.request().query(`SELECT ID, TIPO FROM APP_GRUPOS_CLIENTES WHERE ID IN (${todosIdsGrpCli.join(',')})`))
                .recordset.forEach((r: any) => { tiposGrpCli[r.ID] = r.TIPO; });
        }

        // Resolver artículos por grupo (MANUAL: query con filtro NODTOAPLICABLE; CONDICION: resolver dinámico)
        const articulosPorGrupo: Record<number, number[]> = {};
        const idsManualArt = todosIdsGrpArt.filter(id => tiposGrpArt[id] !== 'CONDICION');
        if (idsManualArt.length > 0) {
            (await pool.request().query(`
                SELECT D.IDGRUPO, D.CODARTICULO
                FROM APP_GRUPOS_ARTICULOS_DETALLE D
                JOIN ARTICULOS A ON A.CODARTICULO = D.CODARTICULO
                WHERE D.IDGRUPO IN (${idsManualArt.join(',')})
                  AND ISNULL(A.NODTOAPLICABLE, 0) <> 1
            `)).recordset.forEach((r: any) => { (articulosPorGrupo[r.IDGRUPO] ??= []).push(r.CODARTICULO); });
        }
        for (const id of todosIdsGrpArt.filter(id => tiposGrpArt[id] === 'CONDICION')) {
            articulosPorGrupo[id] = await this.resolverMiembrosCondicionArticulos(id);
        }

        // Resolver clientes por grupo
        const clientesPorGrupo: Record<number, number[]> = {};
        const idsManualCli = todosIdsGrpCli.filter(id => tiposGrpCli[id] !== 'CONDICION');
        if (idsManualCli.length > 0) {
            (await pool.request().query(`SELECT IDGRUPO, CODCLIENTE FROM APP_GRUPOS_CLIENTES_DETALLE WHERE IDGRUPO IN (${idsManualCli.join(',')})`))
                .recordset.forEach((r: any) => { (clientesPorGrupo[r.IDGRUPO] ??= []).push(r.CODCLIENTE); });
        }
        for (const id of todosIdsGrpCli.filter(id => tiposGrpCli[id] === 'CONDICION')) {
            clientesPorGrupo[id] = await this.resolverMiembrosCondicionClientes(id);
        }

        const escalasPorPromo: Record<number, any[]> = {};
        escalasResult.recordset.forEach((e: any) => { (escalasPorPromo[e.IDPROMOCION] ??= []).push(e); });

        return promos.map((p: any) => {
            const grpArt = juncArt[p.ID] ?? { INCLUIR: [], EXCLUIR: [] };
            const grpCli = juncCli[p.ID] ?? { INCLUIR: [], EXCLUIR: [] };

            // Unión de todos los grupos INCLUIR de artículos
            const artIncluidos = [...new Set(grpArt.INCLUIR.flatMap(id => articulosPorGrupo[id] ?? []))];
            // Unión de todos los grupos EXCLUIR de artículos
            const artExcluidosSet = new Set(grpArt.EXCLUIR.flatMap(id => articulosPorGrupo[id] ?? []));
            const codigosArticulo = artIncluidos.filter(cod => !artExcluidosSet.has(cod));

            // Unión de grupos INCLUIR de clientes
            const cliIncluidos = [...new Set(grpCli.INCLUIR.flatMap(id => clientesPorGrupo[id] ?? []))];
            // Unión de grupos EXCLUIR de clientes
            const cliExcluidosSet = new Set(grpCli.EXCLUIR.flatMap(id => clientesPorGrupo[id] ?? []));
            const codigosCliente = cliIncluidos.filter(cod => !cliExcluidosSet.has(cod));
            const codigosClienteExcluir = [...cliExcluidosSet]; // para modo TODOS+excluir

            return {
                id: p.ID,
                nombre: p.NOMBRE,
                base: p.BASE,
                alcanceCliente: p.ALCANCE_CLIENTE,
                codigosArticulo,
                codigosCliente,
                codigosClienteExcluir,
                escalas: (escalasPorPromo[p.ID] ?? []).map((e: any) => ({ minimo: e.MINIMO, maximo: e.MAXIMO, porcentaje: e.PORCENTAJE })),
            };
        });
    }

    static async registrarAplicadas(orderId: string, promociones: PromocionAplicada[]) {
        if (!promociones || promociones.length === 0) return;
        try {
            const pool = await connectDb();
            for (const promo of promociones) {
                await pool.request()
                    .input('ORDERID', mssql.VarChar, orderId)
                    .input('IDPROMOCION', mssql.Int, promo.idPromocion)
                    .input('NOMBRE', mssql.NVarChar, promo.nombre)
                    .input('PORCENTAJE', mssql.Float, promo.porcentaje)
                    .input('BASE', mssql.Float, promo.base)
                    .query(`
                        INSERT INTO APP_PEDIDO_PROMOCIONES (ORDERID, IDPROMOCION, NOMBREPROMOCION, PORCENTAJEAPLICADO, BASETOTAL)
                        VALUES (@ORDERID, @IDPROMOCION, @NOMBRE, @PORCENTAJE, @BASE)
                    `);
            }
        } catch (err) {
            console.error(`Error registrando promociones aplicadas para pedido ${orderId}:`, err);
        }
    }
}
