<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-btn icon="mdi-arrow-left" variant="text" color="grey-darken-1" class="mr-2" @click="$router.back()"></v-btn>
      <h1 class="text-h4 font-weight-black" style="color: #164E63;">Resumen del Pedido</h1>
      <v-spacer></v-spacer>
      <v-btn 
        v-if="carritoStore.articulos.length > 0"
        prepend-icon="mdi-file-pdf-box" 
        color="red-darken-1" 
        variant="elevated" 
        rounded="pill"
        @click="exportarPDF"
      >
        Exportar PDF
      </v-btn>
    </div>

    <v-row>
      <v-col cols="12" md="8">
        <v-card class="rounded-xl elevation-2 border-0">
          <v-table hover>
            <thead>
              <tr class="bg-primary">
                <th class="text-left font-weight-bold py-4 text-white">Descripción</th>
                <th class="text-center font-weight-bold text-white">Cantidad</th>
                <th class="text-right font-weight-bold text-white">Precio Unit.</th>
                <th class="text-right font-weight-bold text-white">Subtotal</th>
                <th class="text-center font-weight-bold text-white">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in carritoStore.articulos" :key="item.CODARTICULO">
                <td class="py-4">
                  <div class="d-flex align-center">
                    <div>
                      <div class="font-weight-bold text-on-surface">{{ item.DESCRIPCION }}</div>
                      <div class="text-caption text-grey">Código: {{ item.CODARTICULO }}</div>
                    </div>
                    <v-chip v-if="item.ES_PSICOTROPICO === 'T'" color="purple-darken-2" size="x-small" variant="flat" class="font-weight-black ml-2">CONTROLADO</v-chip>
                    <v-chip v-else-if="item.NODTOAPLICABLE === true || item.NODTOAPLICABLE === 1" color="red-darken-2" size="x-small" variant="flat" class="font-weight-black ml-2">SIN DTO</v-chip>
                    <v-chip v-else-if="Number(item.DIASPROTECCION ?? 0) > 0" color="teal-darken-2" size="x-small" variant="flat" class="font-weight-black ml-2">NI {{ item.DIASPROTECCION }}d</v-chip>
                  </div>
                  <div v-if="item.descuentos?.length" class="mt-1">
                    <v-chip size="x-small" color="orange-darken-2" variant="flat" class="font-weight-bold">
                      {{ item.descuentos.length }} Desc. Aplicados ({{ item.descuentos.join('%+') }}%)
                    </v-chip>
                  </div>
                </td>
                
                <td class="text-center" style="min-width: 150px;">
                  <div class="d-flex align-center justify-center">
                    <v-btn icon="mdi-minus" variant="tonal" size="x-small" @click="actualizarCantidad(item, -1)" :disabled="item.cantidad <= 1"></v-btn>
                    <div class="mx-3 font-weight-black text-h6 text-primary cursor-pointer" @click="abrirModalEdicion(item)">
                      {{ item.cantidad }}
                    </div>
                    <v-btn 
                      icon="mdi-plus" 
                      variant="tonal" 
                      size="x-small" 
                      @click="actualizarCantidad(item, 1)" 
                      :disabled="item.cantidad >= getStockDisponible(item)"
                      :color="item.cantidad >= getStockDisponible(item) ? 'grey' : 'primary'"
                    ></v-btn>
                  </div>
                  <div class="text-caption text-grey-darken-1 mt-1">Stock: {{ getStockDisponible(item) }}</div>
                </td>

                <td class="text-right">
                  <div v-if="item.descuentos?.length" class="text-caption text-grey text-decoration-line-through">
                    $ {{ obtenerPrecioBase(item).toFixed(2) }}
                  </div>
                  <MontoDisplay :usd="calcularPrecioConDescuento(item)" :tasa="carritoStore.tasa" main-class="font-weight-bold text-on-surface" align-end />
                </td>

                <td class="text-right font-weight-bold text-success">
                  <MontoDisplay :usd="calcularPrecioConDescuento(item) * item.cantidad" :tasa="carritoStore.tasa" main-class="font-weight-bold text-success" align-end />
                </td>

                <td class="text-center">
                  <v-btn v-if="authStore.esAdmin" icon="mdi-sale" variant="text" color="orange-darken-2" @click="abrirGestorDescuentos(item)"></v-btn>
                  <v-btn icon="mdi-delete-outline" variant="text" color="error" @click="eliminarDelCarrito(item.CODARTICULO)"></v-btn>
                </td>
              </tr>
              <tr v-if="carritoStore.articulos.length === 0">
                <td colspan="5" class="pa-10 text-center text-grey">El carrito está vacío</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card class="rounded-xl elevation-3 border-0 sticky-card">
          <div class="bg-primary pa-4 text-white font-weight-bold text-center text-uppercase">Finalizar Pedido</div>
          <v-card-text class="pa-6">
            <div class="mb-6" v-if="carritoStore.clienteSeleccionado">
              <div class="text-caption text-grey text-uppercase font-weight-bold">Razón Social:</div>
              <div class="text-h6 font-weight-black text-primary" style="line-height: 1.2;">{{ carritoStore.clienteSeleccionado.NOMBRECLIENTE }}</div>
              <div class="text-caption text-grey mt-1">Cód: {{ carritoStore.clienteSeleccionado.CODCLIENTE }} · RIF: {{ carritoStore.clienteSeleccionado.NIT }}</div>
            </div>

            <v-divider class="mb-4"></v-divider>

            <div class="d-flex justify-space-between mb-2 align-center">
              <span class="text-grey-darken-1 font-weight-bold">SUBTOTAL USD:</span>
              <span class="text-h6 font-weight-bold">$ {{ totalUSD.toFixed(2) }}</span>
            </div>

            <div class="pa-4 rounded-lg mb-6 text-center" style="background: #ECFDF5; border: 1px dashed #059669;">
              <div class="text-secondary font-weight-bold mb-1 text-subtitle-2">TOTAL A PAGAR (BS):</div>
              <div class="text-h4 font-weight-black text-secondary">Bs. {{ totalBS.toFixed(2) }}</div>
              <div class="text-caption text-grey-darken-1 mt-1">Tasa: {{ carritoStore.tasa }}</div>
            </div>
            
            <v-btn 
              block color="primary" size="x-large" class="rounded-pill font-weight-bold mt-4 shadow-primary elevation-2" 
              :loading="enviando"
              :disabled="!carritoStore.articulos.length || !carritoStore.clienteSeleccionado" 
              @click="procesarVenta"
            >
              CONFIRMAR PEDIDO
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="modalEdicion.mostrar" max-width="300">
      <v-card class="rounded-xl text-center pa-4">
        <v-card-title class="font-weight-bold">Ajustar Cantidad</v-card-title>
        <v-card-text>
          <v-text-field 
            v-model.number="modalEdicion.nuevaCantidad" 
            type="number" 
            variant="outlined" 
            autofocus 
            class="mt-2"
            :error="modalEdicion.nuevaCantidad > modalEdicion.stockMax"
            :error-messages="modalEdicion.nuevaCantidad > modalEdicion.stockMax ? 'Excede stock' : ''"
            hide-details="auto"
          ></v-text-field>
          <div class="text-caption mt-2" :class="modalEdicion.nuevaCantidad > modalEdicion.stockMax ? 'text-error' : 'text-grey'">
            Máximo disponible: {{ modalEdicion.stockMax }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn block color="primary" variant="elevated" rounded="pill" @click="guardarNuevaCantidad" :disabled="modalEdicion.nuevaCantidad <= 0 || modalEdicion.nuevaCantidad > modalEdicion.stockMax">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="modalDescuento.mostrar" max-width="400">
      <v-card class="rounded-xl">
        <v-card-title class="bg-orange-darken-2 text-white px-6 py-4">
          <v-icon start>mdi-sale</v-icon> Descuentos Comerciales
        </v-card-title>
        <v-card-text class="pt-6 px-6">
          <p class="text-subtitle-1 font-weight-bold mb-4">{{ modalDescuento.item?.DESCRIPCION }}</p>
          <v-list v-if="modalDescuento.item?.descuentos?.length" border class="rounded-lg mb-4">
            <v-list-item v-for="(d, i) in modalDescuento.item.descuentos" :key="i">
              <v-list-item-title class="font-weight-bold text-orange-darken-3">Descuento: {{ d }}%</v-list-item-title>
              <template v-slot:append>
                <v-btn icon="mdi-close-circle" variant="text" color="error" @click="eliminarDescuento(modalDescuento.item, Number(i))"></v-btn>
              </template>
            </v-list-item>
          </v-list>
          <div class="d-flex align-center">
            <v-text-field v-model.number="modalDescuento.nuevoValor" label="Nuevo %" variant="outlined" type="number" hide-details></v-text-field>
            <v-btn color="orange-darken-2" height="56" class="ml-2 font-weight-bold px-6" @click="agregarDescuento">AÑADIR</v-btn>
          </div>
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer></v-spacer><v-btn color="grey" variant="text" @click="modalDescuento.mostrar = false">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbarStock.show" :color="snackbarStock.color" rounded="pill" timeout="2500">
      <v-icon start>{{ snackbarStock.color === 'error' ? 'mdi-close-circle' : 'mdi-alert-circle' }}</v-icon>
      {{ snackbarStock.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';
import { useCarritoStore } from '../stores/useCarritoStore';
import MontoDisplay from '../components/MontoDisplay.vue';
import { useAuthStore } from '../stores/useAuthStore';
import { useRouter } from 'vue-router';
import { generarPedidoPDF } from '../utils/pedidoPDF';

const carritoStore = useCarritoStore();
const authStore    = useAuthStore();
const router = useRouter();
const enviando = ref(false);
const numeroReservado = ref<number | null>(null);

const modalEdicion = ref({ mostrar: false, nuevaCantidad: 0, stockMax: 0, item: null as any });
const modalDescuento = ref({ mostrar: false, nuevoValor: 0, item: null as any });
const snackbarStock = ref({ show: false, text: '', color: 'orange-darken-3' });

const lanzarAviso = (text: string, color = 'orange-darken-3') => {
  snackbarStock.value = { show: true, text, color };
};

const obtenerPrecioBase = (item: any): number => {
  return (item.prices && item.prices.length > 0) ? parseFloat(item.prices[0].PNETO) : 0;
};

const calcularPrecioConDescuento = (item: any): number => {
  let precio = obtenerPrecioBase(item);
  if (item.descuentos && item.descuentos.length > 0) {
    item.descuentos.forEach((desc: number) => {
      precio = precio - (precio * (Number(desc) / 100));
    });
  }
  return precio;
};

const getStockDisponible = (item: any) => item.stocks?.reduce((t: number, s: any) => t + s.STOCK, 0) || 0;

const actualizarCantidad = (item: any, cambio: number) => {
  const stockMax = getStockDisponible(item);
  const n = item.cantidad + cambio;
  if (cambio > 0 && n > stockMax) {
    lanzarAviso(`Stock insuficiente. Solo hay ${stockMax} disponibles.`);
    return;
  }
  if (n >= 1) {
    item.cantidad = n;
    carritoStore.recalcularPromociones();
  }
};

const abrirModalEdicion = (item: any) => {
  modalEdicion.value.item = item;
  modalEdicion.value.nuevaCantidad = item.cantidad;
  modalEdicion.value.stockMax = getStockDisponible(item);
  modalEdicion.value.mostrar = true;
};

const guardarNuevaCantidad = () => {
  const { nuevaCantidad, stockMax, item } = modalEdicion.value;
  if (nuevaCantidad > stockMax) {
    lanzarAviso(`No puedes exceder el stock de ${stockMax} unidades.`);
    return;
  }
  if (nuevaCantidad >= 1) {
    item.cantidad = nuevaCantidad;
    carritoStore.recalcularPromociones();
    modalEdicion.value.mostrar = false;
  }
};

const abrirGestorDescuentos = (item: any) => {
  modalDescuento.value.item = item;
  modalDescuento.value.nuevoValor = 0;
  modalDescuento.value.mostrar = true;
};

const agregarDescuento = () => {
  const item = modalDescuento.value.item;
  const val = modalDescuento.value.nuevoValor;
  if (val > 0 && val < 100) {
    if (!item.descuentos) item.descuentos = [];
    item.descuentos.push(val);
    modalDescuento.value.nuevoValor = 0;
  }
};

const eliminarDescuento = (item: any, index: number) => item.descuentos.splice(index, 1);

const totalUSD = computed(() => carritoStore.articulos.reduce((acc, item) => acc + (calcularPrecioConDescuento(item) * item.cantidad), 0));
const totalBS = computed(() => totalUSD.value * carritoStore.tasa);

const eliminarDelCarrito = (cod: any) => {
  const i = carritoStore.articulos.findIndex(a => a.CODARTICULO === cod);
  if (i !== -1) carritoStore.articulos.splice(i, 1);
  carritoStore.recalcularPromociones();
};

const reservarNumeroPedido = async (): Promise<number> => {
  if (numeroReservado.value) return numeroReservado.value;
  const res = await axios.post(`${import.meta.env.VITE_API_URL}/pedidos/reservar-numero`);
  numeroReservado.value = res.data.numero;
  return res.data.numero;
};

const exportarPDF = async (ordenId?: string) => {
  const cliente = carritoStore.clienteSeleccionado;
  let numeroMostrar = ordenId;
  if (!numeroMostrar) {
    try {
      const num = await reservarNumeroPedido();
      numeroMostrar = String(num);
    } catch {
      numeroMostrar = '---';
    }
  }
  await generarPedidoPDF({
    numeroOrden: numeroMostrar,
    cliente: {
      codcliente: cliente?.CODCLIENTE,
      nombrecliente: cliente?.NOMBRECLIENTE || 'N/A',
      nit: cliente?.NIT || cliente?.ID,
      direccionFiscal: cliente?.DIRECCION_FISCAL || cliente?.DIRECCION,
      direccionEnvio:  cliente?.DIRECCION_ENVIO  || cliente?.DIRECCION,
    },
    lineas: carritoStore.articulos.map(item => ({
      codigo: item.CODARTICULO,
      descripcion: item.DESCRIPCION || '',
      cantidad: item.cantidad,
      precioBase: obtenerPrecioBase(item),
      precioUnitario: calcularPrecioConDescuento(item),
      descuentos: item.descuentos,
      esControlado: item.ES_PSICOTROPICO === 'T',
    })),
    totalUSD: totalUSD.value,
  });
};

// --- PROCESAR VENTA (SEPARACIÓN POR TIPO: P / SD / NI / normal) ---
const procesarVenta = async () => {
  if (!carritoStore.clienteSeleccionado) return;
  enviando.value = true;

  // Prioridad: psicotrópico > sin descuento > no indexado > normal
  const itemsP  = carritoStore.articulos.filter(art => art.ES_PSICOTROPICO === 'T');
  const itemsSD = carritoStore.articulos.filter(art =>
    art.ES_PSICOTROPICO !== 'T' && (art.NODTOAPLICABLE === true || art.NODTOAPLICABLE === 1)
  );
  const itemsNI = carritoStore.articulos.filter(art =>
    art.ES_PSICOTROPICO !== 'T' && !(art.NODTOAPLICABLE === true || art.NODTOAPLICABLE === 1) &&
    Number(art.DIASPROTECCION ?? 0) > 0
  );
  const itemsNormal = carritoStore.articulos.filter(art =>
    art.ES_PSICOTROPICO !== 'T' && !(art.NODTOAPLICABLE === true || art.NODTOAPLICABLE === 1) &&
    !(Number(art.DIASPROTECCION ?? 0) > 0)
  );

  const mapearLineas = (items: any[]) => items.map(art => ({
    codarticulo:  parseInt(String(art.CODARTICULO)),
    referencia:   art.REFPROVEEDOR || '',
    codalmacen:   'ZAV',
    idtarifav:    1,
    cantidad:     art.cantidad,
    precio:       calcularPrecioConDescuento(art),
    PRECIOBRUTO:  obtenerPrecioBase(art),
    DESCUENTO1:   art.descuentos?.[0] || 0,
    DESCUENTO2:   art.descuentos?.[1] || 0,
    DESCUENTO3:   art.descuentos?.[2] || 0,
    DESCUENTO4:   art.descuentos?.[3] || 0,
  }));

  const num = await reservarNumeroPedido();
  const promesas: Promise<any>[] = [];
  const clienteId  = parseInt(String(carritoStore.clienteSeleccionado.CODCLIENTE));
  const codVendedor = authStore.usuario?.codVendedor ?? 1;
  const promocionesAplicadas = carritoStore.promocionesAplicadas;

  const crearPedido = (sufijo: string, items: any[]) => {
    const total = items.reduce((acc, art) => acc + (calcularPrecioConDescuento(art) * art.cantidad), 0);
    return axios.post(`${import.meta.env.VITE_API_URL}/pedidos`, {
      pedidos: { orderId: `${num}${sufijo}`, clienteId, codVendedor, totalPed: total, lineas: mapearLineas(items), promocionesAplicadas }
    });
  };

  if (itemsNormal.length > 0) promesas.push(crearPedido('', itemsNormal));
  if (itemsP.length  > 0) promesas.push(crearPedido('P',  itemsP));
  if (itemsSD.length > 0) promesas.push(crearPedido('SD', itemsSD));
  if (itemsNI.length > 0) promesas.push(crearPedido('NI', itemsNI));

  try {
    const resultados = await Promise.all(promesas);
    const ids = resultados.map(r => r.data?.orderId || '').filter(Boolean).join(', ');
    lanzarAviso(`Pedido(s) guardado(s) correctamente${ids ? `: ${ids}` : ''}`, 'success');
    await exportarPDF(ids);
    numeroReservado.value = null;
    setTimeout(() => {
      carritoStore.limpiarCarrito();
      router.push('/pedidos-estatus');
    }, 1500);
  } catch (error) {
    lanzarAviso('Error al guardar el pedido. Intente nuevamente.', 'error');
  } finally {
    enviando.value = false;
  }
};
</script>

<style scoped>
.sticky-card { position: sticky; top: 80px; }
.shadow-primary { box-shadow: 0 4px 15px rgba(8, 145, 178, 0.3) !important; }
.cursor-pointer { cursor: pointer; }
.text-error { color: #ff5252; font-weight: bold; }
</style>