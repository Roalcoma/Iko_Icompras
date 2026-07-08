import 'dotenv/config';
import { connectDb } from '../src/db/db.conection';
(async () => {
    const p = await connectDb();
    const r = await p.request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='CLIENTES' ORDER BY ORDINAL_POSITION`);
    console.log(r.recordset.map((x: any) => x.COLUMN_NAME).join('\n'));
    process.exit(0);
})().catch((e: any) => { console.error(e.message); process.exit(1); });
