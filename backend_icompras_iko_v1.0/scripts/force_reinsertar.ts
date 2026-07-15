/**
 * Fuerza la re-inserción de un pedido Icompras en CABECERA_PED.
 * Uso: npx ts-node scripts/force_reinsertar.ts
 * Resetea PROCESADO=0 si el pedido ya no está en CABECERA_PED, luego llama aprobarPedido.
 */
import 'dotenv/config';
import { connectDb, mssql } from '../src/db/db.conection';
import { EcommerceService } from '../src/services/ecommerce.service';

async function main() {
    const pool = await connectDb();

    const rows = await pool.request().query(`
        SELECT ID, NUMERO_PEDIDO, PROCESADO FROM APP_ECOMMERCE_PEDIDOS ORDER BY ID
    `);

    for (const r of rows.recordset) {
        const orderId = `EC-${r.NUMERO_PEDIDO}`;
        const enCab = await pool.request()
            .input('OID', mssql.NVarChar(50), orderId)
            .query(`SELECT ORDERID, ESTATUS FROM dbo.CABECERA_PED WHERE ORDERID = @OID`);

        if (enCab.recordset.length) {
            console.log(`${orderId} → ya en CABECERA_PED (estatus=${enCab.recordset[0].ESTATUS})`);
            continue;
        }

        console.log(`${orderId} → NO está en CABECERA_PED. Reseteando PROCESADO y reintentando...`);
        await pool.request()
            .input('ID', mssql.Int, r.ID)
            .query(`UPDATE APP_ECOMMERCE_PEDIDOS SET PROCESADO = 0 WHERE ID = @ID`);

        const res = await EcommerceService.aprobarPedido(r.ID);
        if (res.success) console.log(`  OK → ${res.orderId} insertado en CABECERA_PED`);
        else             console.log(`  FALLO → ${res.message}`);
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
