import { connectDb } from '../db/db.conection';
import mssql from 'mssql';

export class ExchangeService {
    static async getCotizacion(): Promise<number> {
        try {
            const pool = await connectDb();
            
            // Leemos el código numérico del .env. 
            // Usamos '2' como valor por defecto por si se te olvida ponerlo en el .env
            const codMoneda = parseInt(process.env.MONEDA_COTIZACION || '2', 10); 

            const result = await pool.request()
                // ¡El cambio clave! Ahora usamos mssql.Int
                .input('MONEDA', mssql.Int, codMoneda) 
                .query(`SELECT DBO.F_GET_COTIZACION(GETDATE(), @MONEDA) AS TASA`);

            // Retornamos el número directo (ej: 38.50)
            return result.recordset[0].TASA;
        } catch (error) {
            console.error('Error consultando la tasa en BD:', error);
            throw error;
        }
    }
}