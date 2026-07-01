import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';
import type { ArticuloCarrito, Cliente } from './useCarritoStore';

const API = `${import.meta.env.VITE_API_URL}/promociones`;

export interface PromocionVigente {
    id: number;
    nombre: string;
    base: 'UNIDADES' | 'MONTO';
    alcanceCliente: 'TODOS' | 'INCLUIR_GRUPO' | 'EXCLUIR_GRUPO';
    codigosArticulo: number[];
    codigosCliente: number[];
    escalas: { minimo: number; maximo: number | null; porcentaje: number }[];
}

export interface PromocionAplicada {
    idPromocion: number;
    nombre: string;
    porcentaje: number;
    base: number;
}

export const usePromocionesStore = defineStore('promociones', () => {
    const vigentes = ref<PromocionVigente[]>([]);

    const cargarVigentes = async () => {
        try {
            const res = await axios.get(`${API}/vigentes`);
            if (res.data.success) vigentes.value = res.data.data;
        } catch {
            vigentes.value = [];
        }
    };

    const clienteCalifica = (promo: PromocionVigente, cliente: Cliente | null): boolean => {
        if (promo.alcanceCliente === 'TODOS') return true;
        const codCliente = cliente ? Number(cliente.CODCLIENTE) : null;
        const perteneceAlGrupo = codCliente !== null && promo.codigosCliente.includes(codCliente);
        return promo.alcanceCliente === 'INCLUIR_GRUPO' ? perteneceAlGrupo : !perteneceAlGrupo;
    };

    const precioBase = (item: ArticuloCarrito): number =>
        (item.prices && item.prices.length > 0) ? parseFloat(item.prices[0].PNETO) : 0;

    /** Devuelve, por CODARTICULO, el % de descuento de promoción que corresponde según el carrito actual. */
    const calcularDescuentosPromocion = (
        articulos: ArticuloCarrito[],
        cliente: Cliente | null
    ): { porcentajesPorArticulo: Map<string | number, number>; aplicadas: PromocionAplicada[] } => {
        const porcentajesPorArticulo = new Map<string | number, number>();
        const aplicadas: PromocionAplicada[] = [];

        for (const promo of vigentes.value) {
            if (!clienteCalifica(promo, cliente)) continue;

            const itemsDelGrupo = articulos.filter(a => promo.codigosArticulo.includes(Number(a.CODARTICULO)));
            if (itemsDelGrupo.length === 0) continue;

            // Evalúa la escala línea por línea: cada artículo se evalúa
            // con su propia cantidad/monto, no con el total del grupo.
            let promoRegistrada = false;
            for (const item of itemsDelGrupo) {
                const base = promo.base === 'UNIDADES'
                    ? item.cantidad
                    : precioBase(item) * item.cantidad;

                const tramo = promo.escalas.find(e => base >= e.minimo && (e.maximo === null || base <= e.maximo));
                if (!tramo || tramo.porcentaje <= 0) continue;

                porcentajesPorArticulo.set(item.CODARTICULO, tramo.porcentaje);
                if (!promoRegistrada) {
                    aplicadas.push({ idPromocion: promo.id, nombre: promo.nombre, porcentaje: tramo.porcentaje, base });
                    promoRegistrada = true;
                }
            }
        }

        return { porcentajesPorArticulo, aplicadas };
    };

    return { vigentes, cargarVigentes, calcularDescuentosPromocion };
});
