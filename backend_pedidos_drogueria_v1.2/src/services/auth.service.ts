import jwt from 'jsonwebtoken';
import { connectDbGeneral } from '../db/db.general.conection';
import { encriptacion } from '../middleware/encriptacion';
import 'dotenv/config';

const JWT_SECRET  = process.env.JWT_SECRET  || 'pedidos_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// Columnas reales de general_drogueria.usuarios
const CAMPO_ID      = 'CODUSUARIO';
const CAMPO_USUARIO = 'USUARIO';
const CAMPO_PASS    = 'NEWPASS';
const CAMPO_VIS     = 'VISIBILIDAD';

// Bitmask de modulos — VISIBILIDAD es un entero en la BD
export const MODULOS_SISTEMA = [
    { bit: 1,  codigo: 'CATALOGO',   nombre: 'Catálogo',        ruta: '/',                icono: 'mdi-store-search', orden: 1 },
    { bit: 2,  codigo: 'CARRITO',    nombre: 'Carrito',          ruta: '/carrito',         icono: 'mdi-cart',         orden: 2 },
    { bit: 4,  codigo: 'ESTATUS',    nombre: 'Control Estatus',  ruta: '/pedidos-estatus', icono: 'mdi-list-status',  orden: 3 },
    { bit: 8,  codigo: 'EDICION',    nombre: 'Edición Pedidos',  ruta: '/pedidos-edicion', icono: 'mdi-file-edit',    orden: 4 },
    { bit: 16, codigo: 'BACKOFFICE', nombre: 'Administración',   ruta: '/backoffice',      icono: 'mdi-shield-crown', orden: 5 },
    { bit: 32, codigo: 'PROMOCIONES', nombre: 'Promociones',     ruta: '/promociones',     icono: 'mdi-sale',         orden: 6 },
    { bit: 64, codigo: 'CLIENTES',   nombre: 'Gestión Clientes', ruta: '/gestion-clientes', icono: 'mdi-account-group', orden: 7 },
    { bit: 128, codigo: 'APROBACION_PSICO', nombre: 'Aprobación Psicotrópicos', ruta: '/aprobacion-psicotropicos', icono: 'mdi-shield-alert', orden: 8 },
    { bit: 256,  codigo: 'RECLAMOS',   nombre: 'Reclamos',             ruta: '/reclamos',   icono: 'mdi-comment-alert',         orden: 9  },
    { bit: 512,  codigo: 'ECOMMERCE',  nombre: 'Pedidos Ecommerce',    ruta: '/ecommerce',  icono: 'mdi-shopping',              orden: 10 },
    { bit: 1024, codigo: 'AUDITORIA',    nombre: 'Auditoría',              ruta: '/auditoria',  icono: 'mdi-clipboard-text-clock',  orden: 11 },
    { bit: 2048, codigo: 'AUTORIZADOR', nombre: 'Puede autorizar pedidos', ruta: '',            icono: 'mdi-check-decagram',        orden: 12 },
];

export interface ModuloPermiso {
    bit: number;
    codigo: string;
    nombre: string;
    ruta: string;
    icono: string;
    orden: number;
    puede_ver: boolean;
}

export interface UsuarioAuth {
    id: number;
    usuario: string;
    visibilidad: number;
    codVendedor?: number | null;
    es_admin: boolean;
    modulos: ModuloPermiso[];
}

function parsearVisibilidad(vis: number | null | undefined): ModuloPermiso[] {
    const v = Number(vis ?? 0);
    return MODULOS_SISTEMA
        .filter(m => (v & m.bit) !== 0)
        .map(m => ({ ...m, puede_ver: true }));
}

export function esAdmin(vis: number | null | undefined): boolean {
    const v = Number(vis ?? 0);
    return (v & 16) !== 0; // bit 16 = BACKOFFICE
}

export class AuthService {

    static async initTablas(): Promise<void> {
        try {
            const pool = await connectDbGeneral();
            await pool.request().query(`
                IF NOT EXISTS (
                    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'VISIBILIDAD'
                )
                ALTER TABLE usuarios ADD VISIBILIDAD INT NULL
            `);
            await pool.request().query(`
                IF NOT EXISTS (
                    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'CODVENDEDOR'
                )
                ALTER TABLE usuarios ADD CODVENDEDOR INT NULL
            `);
            console.log('Columnas VISIBILIDAD/CODVENDEDOR verificadas en general_drogueria.usuarios');
        } catch (err) {
            console.error('Advertencia en initTablas:', err);
        }
    }

    static async login(
        claveInput: string
    ): Promise<{ success: boolean; token?: string; usuario?: UsuarioAuth; message: string }> {
        try {
            const pool = await connectDbGeneral();
            const claveEncriptada = encriptacion.encriptar(claveInput);

            const result = await pool.request()
                .input('PASS', claveEncriptada)
                .query(`
                    SELECT ${CAMPO_ID}, ${CAMPO_USUARIO}, ${CAMPO_PASS}, ${CAMPO_VIS}, BLOQUEADO, CODVENDEDOR
                    FROM usuarios
                    WHERE ${CAMPO_PASS} = @PASS
                `);

            if (result.recordset.length === 0) {
                return { success: false, message: 'Contraseña incorrecta' };
            }

            const row = result.recordset[0];

            if (row['BLOQUEADO'] === true || row['BLOQUEADO'] === 1) {
                return { success: false, message: 'Usuario bloqueado. Contacte al administrador.' };
            }

            const visibilidad = Number(row[CAMPO_VIS] ?? 0);
            const isAdminUser = esAdmin(visibilidad);
            // Admins ven todos los módulos en el sidebar sin necesitar cada bit activo
            const modulos = isAdminUser
                ? MODULOS_SISTEMA.map(m => ({ ...m, puede_ver: true }))
                : parsearVisibilidad(visibilidad);
            const id = Number(row[CAMPO_ID]);

            const usuarioAuth: UsuarioAuth = {
                id,
                usuario: row[CAMPO_USUARIO],
                visibilidad,
                codVendedor: row['CODVENDEDOR'] ?? null,
                es_admin: esAdmin(visibilidad),
                modulos
            };

            const token = jwt.sign(
                { id, usuario: usuarioAuth.usuario, es_admin: usuarioAuth.es_admin, visibilidad },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES } as jwt.SignOptions
            );

            return { success: true, token, usuario: usuarioAuth, message: 'Login exitoso' };

        } catch (error) {
            console.error('Error en AuthService.login:', error);
            return { success: false, message: 'Error interno del servidor' };
        }
    }

    static async getModulosDeUsuario(id: number): Promise<ModuloPermiso[]> {
        const pool = await connectDbGeneral();
        const result = await pool.request()
            .input('ID', id)
            .query(`SELECT ${CAMPO_VIS} FROM usuarios WHERE ${CAMPO_ID} = @ID`);
        return parsearVisibilidad(result.recordset[0]?.[CAMPO_VIS]);
    }

    static async getUsuarios(): Promise<any[]> {
        const pool = await connectDbGeneral();
        const result = await pool.request().query(`
            SELECT
                ${CAMPO_ID}                       AS ID,
                ${CAMPO_USUARIO}                  AS USUARIO,
                ISNULL(BLOQUEADO, 0)              AS BLOQUEADO,
                ISNULL(${CAMPO_VIS}, 0)           AS VISIBILIDAD,
                CODVENDEDOR
            FROM usuarios
            ORDER BY ${CAMPO_USUARIO}
        `);
        return result.recordset;
    }

    static async actualizarCodVendedor(id: number, codVendedor: number | null): Promise<void> {
        const pool = await connectDbGeneral();
        await pool.request()
            .input('COD', codVendedor ?? null)
            .input('ID', id)
            .query(`UPDATE usuarios SET CODVENDEDOR = @COD WHERE ${CAMPO_ID} = @ID`);
    }

    static async actualizarVisibilidad(id: number, visibilidad: number): Promise<void> {
        const pool = await connectDbGeneral();
        await pool.request()
            .input('VIS', visibilidad)
            .input('ID', id)
            .query(`UPDATE usuarios SET ${CAMPO_VIS} = @VIS WHERE ${CAMPO_ID} = @ID`);
    }

    static async actualizarClave(id: number, nuevaClave: string): Promise<void> {
        const pool = await connectDbGeneral();
        const claveEncriptada = encriptacion.encriptar(nuevaClave);
        await pool.request()
            .input('PASS', claveEncriptada)
            .input('ID', id)
            .query(`UPDATE usuarios SET ${CAMPO_PASS} = @PASS WHERE ${CAMPO_ID} = @ID`);
    }

    static verifyToken(token: string): { id: number; usuario: string; es_admin: boolean } | null {
        try {
            return jwt.verify(token, JWT_SECRET) as any;
        } catch {
            return null;
        }
    }
}
