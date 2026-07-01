import { Request, Response } from "express";
import { PedidosServices } from "../services/pedidos.service";
import { RequestConUsuario } from "../middleware/auth.middleware";

export class PedidosControllers {
    static async reservarNumero(req: Request, res: Response) {
        try {
            const numero = await PedidosServices.reservarNumero();
            return res.json({ success: true, numero });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al reservar número de pedido' });
        }
    }

    static async postPedidos(req: RequestConUsuario, res: Response) {
        try {
            const {pedidos} = req.body
            console.log('Pedido recibido en controller: ', req.body)

            const postPedidos = await PedidosServices.postPedidosCabecera(pedidos, req.usuario?.id, req.usuario?.usuario)

            if (!postPedidos.success) {
                console.error('Hubo un error al subir el pedido', postPedidos.message);
                return res.status(500).json(postPedidos);
            }

            return res.status(200).json(postPedidos);
        } catch (error) {
            console.error('Error al subir el pedido: ', error)
            return res.status(500).json({
                success: false,
                message: 'Error al subir el pedido',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }

    static async getPedidos(req: Request, res: Response) {
        try {
            const { orderId, buscarId, estatus, page, limit } = req.query;

            // orderId solo = obtener detalle completo con lineas
            if (orderId && !buscarId && !estatus) {
                const pedido = await PedidosServices.getPedidoById(orderId as string);
                if (!pedido.success) return res.status(500).json(pedido);
                return res.status(200).json(pedido);
            }

            // Lista paginada con filtros opcionales
            const estatusFiltro   = estatus  as string | undefined;
            const buscarIdFiltro  = buscarId as string | undefined;
            const result = await PedidosServices.getPedidos(page, limit, estatusFiltro, buscarIdFiltro);
            if (!result.success) return res.status(500).json(result);
            return res.status(200).json(result);

        } catch (error) {
            console.error('Error al obtener pedidos: ', error);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener el pedido',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }

    static async updatePedido(req: Request, res: Response) {
        try {
            const { pedidos } = req.body
            const orderId = pedidos.orderId

            if(!pedidos) {
                console.error('No fue enviado un pedido en body')
                return res.status(500).json({
                    success: false,
                    message: 'No fue enviado un pedido en body'
                })
            }

            const updatePedido = await PedidosServices.updatePedidoCompleto(orderId, pedidos)

            if(updatePedido.success === false) {
                console.error('Hubo un error al actualizar el pedido', updatePedido.message)
                return res.status(500).json(updatePedido)
            }

            return res.status(200).json(updatePedido)
            
        } catch (error) {
            console.error('Error al actualizar el pedido: ', error)
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar el pedido',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }

    static async deletePedido(req: Request, res: Response) {
        try {
            const { orderId } = req.query

            if(!orderId) {
                console.error('No se proporcionó un orderId para eliminar el pedido')
                return res.status(500).json({
                    success: false,
                    message: 'No se proporcionó un orderId para eliminar el pedido'
                })
            }

            const deletePedido = await PedidosServices.deletePedido(orderId as string)

            if(deletePedido.success === false) {
                console.error('Hubo un error al eliminar el pedido', deletePedido.message)
                return res.status(500).json(deletePedido)
            }

            return res.status(200).json(deletePedido)
        } catch (error) {
            console.error('Error al eliminar el pedido: ', error)
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar el pedido',
                error: error instanceof Error ? error.message : 'Error desconocido'
            })
        }
    }

    static async updatePedidoStatus(req: Request, res: Response) {
        try {
            // Extraemos los datos del body
            const { orderId, status } = req.body;

            // 1. Validación de campos obligatorios con retorno temprano
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Falta el identificador del pedido (orderId).'
                });
            }

            // 2. Definir "PENDIENTE" por defecto si el status no viene en la petición
            const statusFinal = status ? status.trim().toUpperCase() : 'PENDIENTE';

            // 3. Llamada al servicio
            const reqU = req as RequestConUsuario;
            const result = await PedidosServices.updateEstatusPedido(orderId, statusFinal, reqU.usuario?.id, reqU.usuario?.usuario, reqU.usuario?.visibilidad);

            // 4. Manejo de respuesta del servicio
            if (!result.success) {
                console.error(`[UPDATE_STATUS_ERROR] Pedido: ${orderId} -> ${result.message}`);
                return res.status(400).json(result);
            }

            // 5. Éxito
            return res.status(200).json({
                success: true,
                message: `Estatus del pedido ${orderId} actualizado a ${statusFinal} correctamente.`,
                data: result.message // Opcional, por si el servicio devuelve el registro afectado
            });

        } catch (error) {
            console.error('--- ERROR CRÍTICO EN updatePedidoStatus ---');
            console.error(error);

            return res.status(500).json({
                success: false,
                message: 'Ocurrió un error inesperado al actualizar el estado del pedido.',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }

    static async getAuditoria(req: Request, res: Response) {
        try {
            const { orderId, usuario, page, limit } = req.query;
            const result = await PedidosServices.getAuditoria(
                orderId as string | undefined,
                usuario as string | undefined,
                page ? Number(page) : 1,
                limit ? Number(limit) : 50
            );
            return res.json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error al obtener auditoría' });
        }
    }

    static async aprobarPsicotropico(req: RequestConUsuario, res: Response) {
        try {
            const { orderId, codigoAprobacion } = req.body;
            if (!orderId) {
                return res.status(400).json({ success: false, message: 'Falta el identificador del pedido (orderId).' });
            }
            const result = await PedidosServices.aprobarPsicotropico(orderId, codigoAprobacion, req.usuario?.id, req.usuario?.usuario);
            return res.status(result.success ? 200 : 400).json(result);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Ocurrió un error inesperado al aprobar el pedido.',
                error: error instanceof Error ? error.message : 'Error desconocido'
            });
        }
    }
}