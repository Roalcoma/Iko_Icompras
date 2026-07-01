import { Request, Response } from "express";
import { ClientesServices } from "../services/clientes.service";

export class ClientesController {

    static async getClientesPaginado(req: Request, res: Response): Promise<void> {
        const { search, page, limit } = req.query
        const result = await ClientesServices.getClientesPaginado((search as string) || '', Number(page) || 1, Number(limit) || 10)
        res.status(result.success ? 200 : 500).json(result)
    }

    static async actualizarDescuentoGlobal(req: Request, res: Response): Promise<void> {
        const codCliente = parseInt(req.params['codCliente'] as string)
        const { descuento } = req.body
        if (descuento === undefined || isNaN(Number(descuento))) {
            res.status(400).json({ success: false, message: 'Descuento inválido' })
            return
        }
        const result = await ClientesServices.actualizarDescuentoGlobal(codCliente, Number(descuento))
        res.status(result.success ? 200 : 500).json(result)
    }

    static async getClientes(req: Request, res: Response): Promise<void> {
        try {
            const { cif } = req.query

            if(!cif) {
                res.status(400).json({
                    success: false,
                    message: 'No se ha proporcionado un CIF para buscar clientes'
                })
                return
            }

            const clientes = await ClientesServices.getClientes(cif as string)
            if(clientes.success === false) {
                res.status(500).json({
                    success: false,
                    message: 'Error al obtener clientes',
                    error: clientes.error
                })
                return
            }

            res.status(200).json({
                success: true,
                clientes: clientes.clientes
            })
            
        } catch (error) {
            console.error('Error al obtener clientes: ', error)
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })

        }
    }

    static async getRiesgo(req: Request, res: Response): Promise<void> {
        try {
            const { codcliente } = req.query

            if(!codcliente) {
                res.status(400).json({
                    success: false,
                    message: 'Faltó enviar el codcliente'
                })
                return
            }

            const resultado = await ClientesServices.getRiesgo(Number(codcliente))

            if(resultado.success === false) {
                res.status(500).json(resultado)
                return
            }

            res.status(200).json({
                success: true,
                riesgo: resultado.riesgo
            })
        } catch (error) {
            console.error('Error al obtener clientes: ', error)
            res.status(500).json({
                success: false,
                message: 'Error al obtener clientes',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }

    static async getRiesgoMasivo(req: Request, res: Response): Promise<void> {
        try {
            const { codclientes } = req.body

            if (!Array.isArray(codclientes) || codclientes.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'codclientes debe ser un arreglo con al menos un cliente'
                })
                return
            }

            const resultado = await ClientesServices.getRiesgoMasivo(codclientes.map(Number))

            if (resultado.success === false) {
                res.status(500).json(resultado)
                return
            }

            res.status(200).json({
                success: true,
                riesgos: resultado.riesgo
            })
        } catch (error) {
            console.error('Error al obtener el riesgo masivo: ', error)
            res.status(500).json({
                success: false,
                message: 'Error al obtener el riesgo masivo',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }
}