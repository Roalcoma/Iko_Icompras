import sql from 'mssql';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Mismo algoritmo que encriptacion.ts
const iConstantes = [78,79,82,77,65,76,75,69,89,78,79,82,77,65,76,75,69,89,78,79,82,77,65,76,75,69,89,78,79,82,77,65,76,75,69,89,78];

function desEncriptar(sEncriptado: string): string {
    let sReturn = '';
    let j = 0;
    for (let i = 0; i < sEncriptado.length; i += 2) {
        sReturn += String.fromCharCode(parseInt(sEncriptado.substring(i, i + 2), 16) - iConstantes[j % iConstantes.length]);
        j++;
    }
    return sReturn;
}

const config: sql.config = {
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    server: process.env.DB_SERVER!,
    database: process.env.DB_GENERAL_NAME!,
    options: { encrypt: true, trustServerCertificate: true }
};

(async () => {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();

    // Mostrar columnas de la tabla
    const cols = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'usuarios' ORDER BY ORDINAL_POSITION
    `);
    console.log('\nColumnas:', cols.recordset.map((r: any) => r.COLUMN_NAME).join(', '));

    // Buscar supervisor
    const res = await pool.request().query(`SELECT * FROM usuarios WHERE UPPER(USUARIO) = 'SUPERVISOR'`);

    if (res.recordset.length === 0) {
        console.log('\n❌ Usuario SUPERVISOR no encontrado. Usuarios disponibles:');
        const todos = await pool.request().query(`SELECT TOP 20 USUARIO, NOMBRE, VISIBILIDAD FROM usuarios`);
        console.table(todos.recordset);
        await pool.close();
        return;
    }

    const sup = res.recordset[0];
    const claveEncriptada = sup['NEWPASS'] ?? '';
    const claveDescifrada = claveEncriptada ? desEncriptar(claveEncriptada) : '(sin clave)';

    console.log('\n✅ Usuario encontrado:');
    console.log('   USUARIO    :', sup['USUARIO']);
    console.log('   NOMBRE     :', sup['NOMBRE']);
    console.log('   NEWPASS    :', claveEncriptada);
    console.log('   Clave real :', claveDescifrada);
    console.log('   VISIBILIDAD:', sup['VISIBILIDAD']);

    // Asignar VISIBILIDAD = 31 (acceso total)
    const campoId = ['ID','CODUSER','IDUSUARIO','CODUSUARIO'].find(c =>
        Object.keys(sup).map(k => k.toUpperCase()).includes(c)
    ) ?? 'ID';

    await pool.request()
        .input('VIS', 31)
        .input('ID', sup[campoId])
        .query(`UPDATE usuarios SET VISIBILIDAD = @VIS WHERE ${campoId} = @ID`);

    console.log('\n✅ VISIBILIDAD actualizada a 31 (acceso total admin)');
    await pool.close();
})();
