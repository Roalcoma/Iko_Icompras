import 'dotenv/config';
import { connectDb, mssql } from '../src/db/db.conection';
(async () => {
    const p = await connectDb();
    const r = await p.request()
        .input('OLD', mssql.NVarChar(50), '7591196002785')
        .input('NEW', mssql.NVarChar(50), '1094')
        .query(`UPDATE APP_ECOMMERCE_LINEAS SET COD_ARTICULO = @NEW WHERE COD_ARTICULO = @OLD`);
    console.log('Filas corregidas:', r.rowsAffected[0]);
    process.exit(0);
})().catch((e: any) => { console.error(e.message); process.exit(1); });
