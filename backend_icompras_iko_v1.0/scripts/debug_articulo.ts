import 'dotenv/config';
import { connectDb, mssql } from '../src/db/db.conection';
(async () => {
    const p = await connectDb();

    const r1 = await p.request()
        .input('b', mssql.NVarChar(50), '7591196002785')
        .query('SELECT TOP 5 CODBARRAS, CODARTICULO FROM ARTICULOSLIN WHERE CODBARRAS = @b');
    console.log('ARTICULOSLIN barcode 7591196002785:', r1.recordset);

    const r2 = await p.request()
        .input('c', mssql.Int, 1094)
        .query('SELECT TOP 1 CODARTICULO, DESCART FROM ARTICULOS WHERE CODARTICULO = @c');
    console.log('ARTICULOS codarticulo 1094:', r2.recordset);

    if (r2.recordset.length) {
        const r3 = await p.request()
            .input('c', mssql.Int, 1094)
            .query('SELECT CODBARRAS FROM ARTICULOSLIN WHERE CODARTICULO = @c');
        console.log('Barcodes de CODARTICULO 1094:', r3.recordset);
    }

    // Buscar por descripción para ver si el artículo existe con otro código
    const r4 = await p.request()
        .input('d', mssql.NVarChar(100), '%APIRET%')
        .query('SELECT TOP 5 CODARTICULO, DESCART FROM ARTICULOS WHERE DESCART LIKE @d');
    console.log('Búsqueda por descripción APIRET:', r4.recordset);

    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
