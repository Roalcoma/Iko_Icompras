import 'dotenv/config';
import { connectDb, mssql } from '../src/db/db.conection';
(async () => {
    const p = await connectDb();

    const cols = await p.request().query(`
        SELECT TOP 5 COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'ARTICULOS' ORDER BY ORDINAL_POSITION
    `);
    console.log('Columnas ARTICULOS:', cols.recordset.map((r: any) => r.COLUMN_NAME));

    const r1 = await p.request()
        .input('c', mssql.Int, 1094)
        .query('SELECT TOP 1 CODARTICULO FROM ARTICULOS WHERE CODARTICULO = @c');
    console.log('CODARTICULO 1094:', r1.recordset.length ? 'EXISTE' : 'NO EXISTE');

    // Barcode en articuloslin
    const r2 = await p.request()
        .input('b', mssql.NVarChar(50), '7591196002785')
        .query('SELECT TOP 1 * FROM ARTICULOSLIN WHERE CODBARRAS = @b');
    console.log('Barcode 7591196002785:', r2.recordset.length ? 'EXISTE' : 'NO EXISTE');

    // Ver barcodes similares
    const r3 = await p.request()
        .input('b', mssql.NVarChar(50), '%759119600%')
        .query('SELECT TOP 5 CODBARRAS, CODARTICULO FROM ARTICULOSLIN WHERE CODBARRAS LIKE @b');
    console.log('Barcodes similares 759119600%:', r3.recordset);

    process.exit(0);
})().catch((e: any) => { console.error(e.message); process.exit(1); });
