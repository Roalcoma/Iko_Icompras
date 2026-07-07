/**
 * Script de diagnóstico Icompras.
 * Uso: npx ts-node scripts/debug_icompras.ts
 */
import 'dotenv/config';
import { connectDb, mssql } from '../src/db/db.conection';
import { EcommerceService } from '../src/services/ecommerce.service';

async function main() {
    const pool = await connectDb();

    const rows = await pool.request().query(`
        SELECT ID, NUMERO_PEDIDO, COD_CLIENTE, RIF, PROCESADO, ARCHIVO
        FROM APP_ECOMMERCE_PEDIDOS ORDER BY FECHA_IMPORT DESC
    `);
    console.log('\n=== APP_ECOMMERCE_PEDIDOS ===');
    for (const r of rows.recordset) {
        console.log(`  ID=${r.ID}  #${r.NUMERO_PEDIDO}  cliente=${r.COD_CLIENTE}/${r.RIF}  procesado=${r.PROCESADO}`);
    }

    const pendientes = rows.recordset.filter((r: any) => !r.PROCESADO);
    if (!pendientes.length) {
        console.log('\nTodos procesados.');
        process.exit(0);
    }

    // Mostrar líneas actuales
    for (const r of pendientes) {
        const lins = await pool.request()
            .input('ID', mssql.Int, r.ID)
            .query('SELECT * FROM APP_ECOMMERCE_LINEAS WHERE ID_PEDIDO = @ID');
        console.log(`\nLíneas pedido #${r.NUMERO_PEDIDO}:`, lins.recordset.map((l: any) => `${l.COD_ARTICULO} x${l.CANTIDAD}`));
    }

    console.log(`\n=== Reintentando aprobación ===`);
    for (const r of pendientes) {
        console.log(`\n--- #${r.NUMERO_PEDIDO} (ID=${r.ID}) ---`);
        try {
            const result = await EcommerceService.aprobarPedido(r.ID);
            if (result.success) console.log(`  OK → ${result.orderId} en CABECERA_PED`);
            else                console.log(`  FALLO → ${result.message}`);
        } catch (e: any) {
            console.error(`  ERROR → ${e?.message ?? e}`);
        }
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
