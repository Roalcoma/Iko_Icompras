import { Request, Response } from "express";
import { loginServices } from "../services/login.service";

export class loginController {
    static async login(req: Request, res: Response){
        try {
            const { password } = req.query

            if(!password) {
                console.error('No se envió el password en la request')
                res.status(400).json({
                    success: false,
                    message: 'Falta enviar el password en la request'
                })

                return
            }

            const login = await loginServices.login(password as string)

            if(!login || login.success === false) {
                console.log('Ocurrió algo durante el login: ', login.message)
                res.status(401).json({
                    success: false,
                    message: login.message
                })
                return
            }

            res.status(200).json(login)
        } catch (error) {
            console.error('Error al loguear: ', error)
            res.status(500).json({
                success: false,
                message: 'Hubo un error al intentar loguear',
                error
            })
        }
    }
}