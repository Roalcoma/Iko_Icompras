import sql from 'mssql';
import 'dotenv/config';

const config: sql.config = {
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    server: process.env.DB_SERVER!,
    database: process.env.DB_GENERAL_NAME!,
    options: { encrypt: true, trustServerCertificate: true }
};

(async () => {
    const pool = await sql.connect(config);

    console.log('\n=== COLUMNAS DE LA TABLA USUARIOS ===');
    const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'usuarios'
        ORDER BY ORDINAL_POSITION
    `);
    console.table(cols.recordset);

    console.log('\n=== PRIMEROS 10 USUARIOS ===');
    const users = await pool.request().query(`SELECT TOP 10 * FROM usuarios`);
    console.table(users.recordset);

    await pool.close();
})();
