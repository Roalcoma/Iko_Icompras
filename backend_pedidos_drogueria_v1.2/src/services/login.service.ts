import mssql from "mssql";
import { connectDb } from "../db/db.conection";
import 'dotenv/config'

export class loginServices {
    static async login(password: string){
        try {
            const pool = await connectDb()
            const result = await pool.request()
                .input('PASSWORD', password)
                .query(`SELECT 
                            CODVENDEDOR
                            , NOMVENDEDOR
                            , DIRECCION
                            , POBLACION
                            , PROVINCIA
                            , TELEFONO
                            , ACTIVO
                            , BLOQUEADO
                            , NEWPASSENTRADA
                            , NEWPASSREGISTRO
                            , VISIBILIDAD
                        FROM 
                            VENDEDORES
                        WHERE
                            NEWPASSENTRADA = @PASSWORD`)
            
            const resultGood = result.recordset

            if(resultGood.length == 0) {
                return {
                    success: false,
                    message: 'No existe ese usuario en la Base de datos'
                }
            }

            return {
                success: true,
                usuario: resultGood[0],
                message: 'USUARIO ENCONTRADO'
            }
        } catch (error) {
            console.error('Error en base da datos: ', error)
            return {
                success: false,
                message: 'Hubo un error en Base de datos'
            }
        }
    }
}