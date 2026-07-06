<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <!-- ============================================================
         MODO SELECTOR — cuando no hay pedido cargado
    ============================================================ -->
    <template v-if="!pedidoOriginal">
      <div class="d-flex align-center mb-6">
        <v-icon size="36" color="primary" class="mr-3">mdi-file-edit</v-icon>
        <div>
          <h1 class="text-h5 font-weight-black text-on-surface">Edición de Pedidos</h1>
          <p class="text-body-2 text-grey-darken-1 mb-0">Seleccioná un pedido para editar</p>
        </div>
        <v-spacer />
        <v-btn
          prepend-icon="mdi-refresh"
          variant="tonal"
          color="primary"
          :loading="loadingLista"
          @click="cargarLista"
        >Recargar</v-btn>
      </div>

      <!-- Filtros rápidos -->
      <v-card rounded="xl" elevation="2" class="mb-4 pa-4">
        <v-row dense align="center">
          <v-col cols="12" sm="5">
            <v-text-field
              v-model="busquedaId"
              label="Buscar por N° de orden"
              prepend-inner-icon="mdi-pound"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              @keyup.enter="cargarLista"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="filtroEstatus"
              :items="opcionesEstatus"
              label="Estado"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="3">
            <v-btn color="primary" block @click="cargarLista">Buscar</v-btn>
          </v-col>
        </v-row>
      </v-card>

      <!-- Tabla de pedidos -->
      <v-card rounded="xl" elevation="2">
        <v-data-table-server
          v-model:items-per-page="itemsPerPage"
          :headers="headersSel"
          :items="listaPedidos"
          :items-length="totalPedidos"
          :loading="loadingLista"
          @update:options="onTableOptions"
        >
          <template v-slot:item.ORDERID="{ item }">
            <span class="font-weight-black text-primary">#{{ item.ORDERID }}</span>
          </template>

          <template v-slot:item.FECHA="{ item }">
            <span class="text-caption">{{ formatearFecha(item.FECHA) }}</span>
          </template>

          <template v-slot:item.TOTALPRECIO="{ item }">
            <span class="font-weight-bold">$ {{ Number(item.TOTALPRECIO).toFixed(2) }}</span>
          </template>

          <template v-slot:item.ESTATUS="{ item }">
            <v-chip :color="getColorEstatus(item.ESTATUS)" size="small" variant="flat" class="font-weight-bold">
              {{ item.ESTATUS }}
            </v-chip>
          </template>

          <template v-slot:item.acciones="{ item }">
            <v-btn
              size="small"
              color="primary"
              variant="flat"
              rounded="pill"
              prepend-icon="mdi-pencil"
              :disabled="item.ESTATUS !== 'PENDIENTE'"
              @click="seleccionarPedido(item.ORDERID)"
            >
              Editar
            </v-btn>
          </template>
        </v-data-table-server>
      </v-card>
    </template>

    <!-- ============================================================
         MODO EDICIÓN — cuando hay un pedido cargado
    ============================================================ -->
    <template v-else>
      <v-row class="mb-6 align-center">
        <v-col cols="12" md="8" class="d-flex align-center">
          <v-btn icon="mdi-arrow-left" variant="tonal" class="mr-4" @click="volver" />
          <div>
            <h1 class="text-h4 font-weight-black text-on-surface">Editando Pedido</h1>
            <p class="text-subtitle-2 text-primary mb-0">Orden: #{{ pedidoOriginal.ORDERID }}</p>
          </div>
        </v-col>
        <v-col cols="12" md="4" class="text-right">
          <v-chip :color="getColorEstatus(pedidoOriginal.ESTATUS)" variant="flat" class="font-weight-black">
            ESTADO: {{ pedidoOriginal.ESTATUS }}
          </v-chip>
        </v-col>
      </v-row>

      <v-row v-if="loadingPedido">
        <v-col class="text-center pa-10">
          <v-progress-circular indeterminate color="primary" size="64" />
        </v-col>
      </v-row>

      <v-row v-else>
        <!-- Tabla de líneas -->
        <v-col cols="12" md="8">
          <v-card elevation="2" class="rounded-xl overflow-hidden">
            <div class="bg-primary pa-4 text-white d-flex align-center">
              <v-icon start>mdi-package-variant</v-icon>
              <span class="font-weight-bold">Artículos en la Orden</span>
              <v-spacer />
              <v-btn prepend-icon="mdi-plus" size="small" color="success" rounded="pill" @click="() => { busquedaProducto = ''; resultadosBusqueda = []; modalBusqueda = true; }">
                Añadir Producto
              </v-btn>
            </div>
            <v-table hover>
              <thead>
                <tr>
                  <th class="text-left font-weight-bold">Producto</th>
                  <th class="text-center font-weight-bold">Cantidad</th>
                  <th class="text-right font-weight-bold">Precio Unit.</th>
                  <th class="text-right font-weight-bold">Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(linea, index) in lineasEditadas" :key="index">
                  <td class="py-3">
                    <div class="font-weight-bold text-on-surface">{{ linea.DESCRIPCION || 'Sin descripción' }}</div>
                    <div class="text-caption text-grey">Código: {{ linea.CODARTICULO }}</div>
                    <div v-if="descuentosDeLinea(linea).length" class="mt-1">
                      <v-chip size="x-small" color="orange-darken-2" variant="flat" class="font-weight-bold cursor-pointer"
                        @click="abrirDescuento(linea)">
                        {{ descuentosDeLinea(linea).join('%+') }}% descuento
                      </v-chip>
                    </div>
                  </td>
                  <td class="text-center">
                    <div class="d-flex align-center justify-center">
                      <v-btn icon="mdi-minus" size="x-small" variant="tonal" @click="linea.PRODUCTCOUNT > 1 ? linea.PRODUCTCOUNT-- : null" />
                      <span class="mx-3 font-weight-black">{{ linea.PRODUCTCOUNT }}</span>
                      <v-btn icon="mdi-plus" size="x-small" variant="tonal" @click="linea.PRODUCTCOUNT++" />
                    </div>
                  </td>
                  <td class="text-right">
                    <div v-if="descuentosDeLinea(linea).length" class="text-caption text-grey text-decoration-line-through">
                      $ {{ Number(linea.PRECIOBRUTO || linea.PRECIOUNITARIO).toFixed(2) }}
                    </div>
                    <div class="font-weight-bold">$ {{ Number(linea.PRECIOUNITARIO).toFixed(2) }}</div>
                  </td>
                  <td class="text-right font-weight-bold">$ {{ (linea.PRECIOUNITARIO * linea.PRODUCTCOUNT).toFixed(2) }}</td>
                  <td class="text-center">
                    <v-btn icon="mdi-sale" size="small" color="orange-darken-2" variant="text" @click="abrirDescuento(linea)" />
                    <v-btn icon="mdi-delete-outline" size="small" color="error" variant="text" @click="confirmarEliminarLinea(index)" />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card>
        </v-col>

        <!-- Resumen -->
        <v-col cols="12" md="4">
          <v-card elevation="4" class="rounded-xl pa-6 sticky-card">
            <h3 class="text-h6 font-weight-bold mb-4 border-bottom pb-2 text-on-surface">Resumen de Cambios</h3>
            <div class="d-flex justify-space-between mb-2">
              <span class="text-grey">ID Orden:</span>
              <span class="font-weight-bold">#{{ pedidoOriginal.ORDERID }}</span>
            </div>
            <div class="d-flex justify-space-between mb-2">
              <span class="text-grey">ID Cliente:</span>
              <span class="font-weight-bold">{{ pedidoOriginal.CLIENTEID }}</span>
            </div>
            <div class="d-flex justify-space-between mb-2">
              <span class="text-grey">Total original:</span>
              <span class="text-grey">$ {{ Number(pedidoOriginal.TOTALPRECIO).toFixed(2) }}</span>
            </div>
            <v-divider class="my-4" />
            <div class="d-flex justify-space-between align-center mb-6">
              <span class="text-h6">Nuevo Total:</span>
              <span class="text-h4 font-weight-black text-success">$ {{ totalNuevo.toFixed(2) }}</span>
            </div>
            <v-btn
              block color="primary" size="x-large" rounded="pill"
              class="mb-3 font-weight-bold"
              :loading="guardando"
              @click="guardarCambios"
            >GUARDAR CAMBIOS</v-btn>
            <v-btn block variant="text" color="grey" @click="volver">Cancelar</v-btn>
          </v-card>
        </v-col>
      </v-row>

      <!-- Modal búsqueda de producto -->
      <v-dialog v-model="modalBusqueda" max-width="860">
        <v-card class="rounded-xl">
          <v-card-title class="pa-4 bg-primary text-white d-flex align-center">
            <v-icon start>mdi-magnify</v-icon> Añadir Producto
          </v-card-title>
          <v-card-text class="pa-4">
            <v-text-field
              v-model="busquedaProducto"
              label="Buscar por código o descripción"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              clearable
              hide-details
              class="mb-4"
              @keyup.enter="buscarProductos"
            >
              <template #append-inner>
                <v-btn size="small" color="primary" variant="flat" :loading="buscandoProducto" @click="buscarProductos">Buscar</v-btn>
              </template>
            </v-text-field>

            <v-list v-if="resultadosBusqueda.length" lines="two" border class="rounded-lg" max-height="360" style="overflow-y:auto">
              <v-list-item
                v-for="p in resultadosBusqueda"
                :key="p.CODARTICULO"
                :title="p.DESCRIPCION"
                :subtitle="`Cód: ${p.CODARTICULO} | Stock: ${p.STOCK ?? 0}`"
              >
                <template #append>
                  <div class="d-flex align-center" style="gap:8px">
                    <span class="text-subtitle-2 font-weight-bold text-success">$ {{ Number(p.PRECIO ?? 0).toFixed(2) }}</span>
                    <v-btn size="small" color="primary" variant="flat" icon="mdi-plus" :loading="agregandoProducto === p.CODARTICULO" @click="seleccionarProducto(p)" />
                  </div>
                </template>
              </v-list-item>
            </v-list>
            <div v-else-if="!buscandoProducto && busquedaProducto" class="text-center text-grey pa-4">Sin resultados</div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="modalBusqueda = false">Cerrar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Modal descuento manual -->
      <v-dialog v-model="modalDescuento.mostrar" max-width="400">
        <v-card class="rounded-xl">
          <v-card-title class="bg-orange-darken-2 text-white px-6 py-4">
            <v-icon start>mdi-sale</v-icon> Descuentos Comerciales
          </v-card-title>
          <v-card-text class="pt-6 px-6">
            <p class="text-subtitle-1 font-weight-bold mb-4">{{ modalDescuento.linea?.DESCRIPCION }}</p>
            <v-list v-if="descuentosDeLinea(modalDescuento.linea || {}).length" border class="rounded-lg mb-4">
              <v-list-item v-for="(d, i) in descuentosDeLinea(modalDescuento.linea || {})" :key="i">
                <v-list-item-title class="font-weight-bold text-orange-darken-3">Descuento: {{ d }}%</v-list-item-title>
                <template v-slot:append>
                  <v-btn icon="mdi-close-circle" variant="text" color="error" @click="quitarDescuento(modalDescuento.linea, i)" />
                </template>
              </v-list-item>
            </v-list>
            <div class="d-flex align-center">
              <v-text-field v-model.number="modalDescuento.nuevoValor" label="Nuevo %" variant="outlined" type="number" hide-details />
              <v-btn color="orange-darken-2" height="56" class="ml-2 font-weight-bold px-6" @click="agregarDescuento">AÑADIR</v-btn>
            </div>
          </v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn color="grey" variant="text" @click="modalDescuento.mostrar = false">Cerrar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Confirmación eliminar línea -->
      <v-dialog v-model="confirmarEliminar.mostrar" max-width="360">
        <v-card class="rounded-xl">
          <v-card-title class="pa-4">¿Eliminar artículo?</v-card-title>
          <v-card-text>Se quitará <strong>{{ confirmarEliminar.descripcion }}</strong> del pedido.</v-card-text>
          <v-card-actions class="pa-4">
            <v-spacer />
            <v-btn variant="text" @click="confirmarEliminar.mostrar = false">Cancelar</v-btn>
            <v-btn color="error" variant="flat" @click="ejecutarEliminarLinea">Eliminar</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>

    <v-snackbar v-model="notificacion.show" :color="notificacion.color" rounded="pill">
      {{ notificacion.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';

const route  = useRoute();
const router = useRouter();
const API    = import.meta.env.VITE_API_URL;

// ----------------------------------------------------------------
// Estado del SELECTOR
// ----------------------------------------------------------------
const listaPedidos  = ref<any[]>([]);
const totalPedidos  = ref(0);
const loadingLista  = ref(false);
const itemsPerPage  = ref(10);
const paginaActual  = ref(1);
const busquedaId    = ref('');
const filtroEstatus = ref('PENDIENTE');
const opcionesEstatus = ['TODOS', 'PENDIENTE', 'APROBACION PSICOTROPICOS', 'FINALIZADO', 'CANCELADO'];

const headersSel = [
  { title: 'N° Orden',  key: 'ORDERID',    sortable: false },
  { title: 'Fecha',     key: 'FECHA',      sortable: false },
  { title: 'Cliente',   key: 'CLIENTEID',  sortable: false },
  { title: 'Total',     key: 'TOTALPRECIO',sortable: false },
  { title: 'Estado',    key: 'ESTATUS',    sortable: false },
  { title: '',          key: 'acciones',   sortable: false },
];

const cargarLista = async () => {
  loadingLista.value = true;
  try {
    const params: any = { page: paginaActual.value, limit: itemsPerPage.value };
    if (busquedaId.value) params.buscarId = busquedaId.value;
    if (filtroEstatus.value !== 'TODOS') params.estatus = filtroEstatus.value;

    const res = await axios.get(`${API}/pedidos`, { params });
    if (res.data.success) {
      listaPedidos.value = res.data.data;
      totalPedidos.value = res.data.total || 0;
    }
  } catch {
    lanzarNotificacion('Error al cargar pedidos', 'error');
  } finally {
    loadingLista.value = false;
  }
};

const onTableOptions = ({ page, itemsPerPage: ipp }: any) => {
  paginaActual.value = page;
  itemsPerPage.value = ipp;
  cargarLista();
};

const seleccionarPedido = async (orderId: string) => {
  // Actualiza la URL con el id y carga el pedido sin navegar
  router.replace({ path: '/pedidos-edicion', query: { id: orderId } });
  await cargarPedido(orderId);
};

// ----------------------------------------------------------------
// Estado del EDITOR
// ----------------------------------------------------------------
const pedidoOriginal   = ref<any>(null);
const lineasEditadas   = ref<any[]>([]);
const loadingPedido    = ref(false);
const guardando        = ref(false);
const modalBusqueda        = ref(false);
const busquedaProducto     = ref('');
const resultadosBusqueda   = ref<any[]>([]);
const buscandoProducto     = ref(false);
const agregandoProducto    = ref('');
const notificacion     = ref({ show: false, text: '', color: '' });
const modalDescuento   = ref({ mostrar: false, nuevoValor: 0, linea: null as any });
const confirmarEliminar = ref({ mostrar: false, index: -1, descripcion: '' });

const totalNuevo = computed(() =>
  lineasEditadas.value.reduce((acc, l) => acc + (l.PRECIOUNITARIO * l.PRODUCTCOUNT), 0)
);

const cargarPedido = async (id: string) => {
  loadingPedido.value = true;
  try {
    const res = await axios.get(`${API}/pedidos?orderId=${id}`);
    if (res.data.success) {
      pedidoOriginal.value = res.data.data;
      lineasEditadas.value = JSON.parse(JSON.stringify(res.data.data.lineas));
    } else {
      lanzarNotificacion('No se encontró el pedido', 'error');
    }
  } catch {
    lanzarNotificacion('Error al cargar el pedido', 'error');
  } finally {
    loadingPedido.value = false;
  }
};

const guardarCambios = async () => {
  if (lineasEditadas.value.length === 0) return lanzarNotificacion('El pedido no puede quedar vacío', 'warning');
  guardando.value = true;
  try {
    const id = pedidoOriginal.value.ORDERID;
    const payload = {
      pedidos: {
        clienteId:  pedidoOriginal.value.CLIENTEID,
        codVendedor: pedidoOriginal.value.CODVENDEDOR || 1,
        orderId:    id,
        totalPed:   totalNuevo.value,
        lineas: lineasEditadas.value.map(l => ({
          codarticulo: l.CODARTICULO,
          referencia:  l.REFERENCIA   || '',
          codalmacen:  l.CODALMACEN   || 'ZAV',
          idtarifav:   l.IDTARIFAV    || 0,
          cantidad:    l.PRODUCTCOUNT,
          precio:      l.PRECIOUNITARIO,
          PRECIOBRUTO: l.PRECIOBRUTO  || l.PRECIOUNITARIO,
          DESCUENTO1:  l.DESCUENTO1   || 0,
          DESCUENTO2:  l.DESCUENTO2   || 0,
          DESCUENTO3:  l.DESCUENTO3   || 0,
          DESCUENTO4:  l.DESCUENTO4   || 0,
        }))
      }
    };
    const res = await axios.put(`${API}/pedidos?orderId=${id}`, payload);
    if (res.data.success) {
      lanzarNotificacion('¡Pedido actualizado con éxito!', 'success');
      setTimeout(volver, 1500);
    } else {
      lanzarNotificacion(res.data.message || 'Error al actualizar', 'error');
    }
  } catch (err: any) {
    lanzarNotificacion(err.response?.data?.message || 'Error al actualizar', 'error');
  } finally {
    guardando.value = false;
  }
};

const volver = () => {
  pedidoOriginal.value = null;
  lineasEditadas.value = [];
  router.replace({ path: '/pedidos-edicion' });
  cargarLista();
};

const confirmarEliminarLinea = (index: number) => {
  confirmarEliminar.value = {
    mostrar: true,
    index,
    descripcion: lineasEditadas.value[index]?.DESCRIPCION || 'artículo',
  };
};
const ejecutarEliminarLinea = () => {
  lineasEditadas.value.splice(confirmarEliminar.value.index, 1);
  confirmarEliminar.value.mostrar = false;
};

const descuentosDeLinea = (linea: any): number[] =>
  [linea.DESCUENTO1, linea.DESCUENTO2, linea.DESCUENTO3, linea.DESCUENTO4]
    .map(Number)
    .filter(d => d > 0);

const calcularPrecioConDescuentos = (linea: any): number => {
  let p = Number(linea.PRECIOBRUTO || linea.PRECIOUNITARIO);
  descuentosDeLinea(linea).forEach(d => { p = p * (1 - d / 100); });
  return p;
};

const abrirDescuento = (linea: any) => {
  if (!linea.PRECIOBRUTO) linea.PRECIOBRUTO = linea.PRECIOUNITARIO;
  modalDescuento.value = { mostrar: true, nuevoValor: 0, linea };
};

const agregarDescuento = () => {
  const val = modalDescuento.value.nuevoValor;
  if (!val || val <= 0 || val >= 100) return;
  const l = modalDescuento.value.linea;
  const campos = ['DESCUENTO1', 'DESCUENTO2', 'DESCUENTO3', 'DESCUENTO4'] as const;
  const libre = campos.find(c => !Number(l[c]));
  if (!libre) { lanzarNotificacion('Máximo 4 descuentos por línea', 'warning'); return; }
  l[libre] = val;
  l.PRECIOUNITARIO = calcularPrecioConDescuentos(l);
  modalDescuento.value.nuevoValor = 0;
};

const quitarDescuento = (linea: any, idx: number) => {
  const campos = ['DESCUENTO1', 'DESCUENTO2', 'DESCUENTO3', 'DESCUENTO4'] as const;
  const vals = campos.map(c => Number(linea[c])).filter(v => v > 0);
  vals.splice(idx, 1);
  campos.forEach((c, i) => { linea[c] = vals[i] || 0; });
  linea.PRECIOUNITARIO = calcularPrecioConDescuentos(linea);
};

const getColorEstatus = (status: string) => {
  const s = (status || '').toUpperCase();
  if (s === 'PENDIENTE')  return 'amber-darken-3';
  if (s === 'FINALIZADO') return 'green-darken-2';
  if (s === 'CANCELADO')  return 'red-darken-2';
  if (s === 'APROBACION PSICOTROPICOS') return 'purple-darken-3';
  return 'blue-grey';
};

const formatearFecha = (f: string) => f ? new Date(f).toLocaleDateString('es-PY') : '-';
const lanzarNotificacion = (text: string, color: string) => notificacion.value = { show: true, text, color };

const buscarProductos = async () => {
  if (!busquedaProducto.value?.trim()) return;
  buscandoProducto.value = true;
  resultadosBusqueda.value = [];
  try {
    const res = await axios.get(`${API}/products/get-products`, { params: { articulo: busquedaProducto.value.trim() } });
    const tarifa = lineasEditadas.value[0]?.IDTARIFAV || 1;
    resultadosBusqueda.value = (res.data.data ?? res.data ?? []).map((p: any) => ({
      ...p,
      STOCK: p.STOCKTOTAL ?? 0,
      PRECIO: p.prices?.find((pr: any) => pr.IDTARIFAV === tarifa)?.PNETO
               ?? p.prices?.[0]?.PNETO
               ?? 0,
    }));
  } catch {
    lanzarNotificacion('Error al buscar productos', 'error');
  } finally {
    buscandoProducto.value = false;
  }
};

const seleccionarProducto = async (producto: any) => {
  agregandoProducto.value = producto.CODARTICULO;
  try {
    const tarifa = lineasEditadas.value[0]?.IDTARIFAV || 1;
    // Precio ya calculado en buscarProductos; si es 0 hacemos fetch de respaldo
    let precio = Number(producto.PRECIO || 0);
    if (!precio) {
      const res = await axios.get(`${API}/products/get-prices`, { params: { codarticulo: producto.CODARTICULO, tarifa } });
      precio = res.data.data?.[0]?.PNETO ?? res.data?.[0]?.PNETO ?? 0;
    }
    // Aplicar descuento del cliente igual que en catálogo (DESCUENTO1 del primer artículo del pedido)
    const d1 = Number(lineasEditadas.value[0]?.DESCUENTO1 || 0);
    const precioConDto = d1 > 0 ? precio * (1 - d1 / 100) : precio;

    const yaExiste = lineasEditadas.value.find(l => l.CODARTICULO === producto.CODARTICULO);
    if (yaExiste) {
      yaExiste.PRODUCTCOUNT += 1;
    } else {
      lineasEditadas.value.push({
        CODARTICULO:    producto.CODARTICULO,
        REFERENCIA:     producto.REFERENCIA   || '',
        DESCRIPCION:    producto.DESCRIPCION  || '',
        CODALMACEN:     lineasEditadas.value[0]?.CODALMACEN || 'ZAV',
        IDTARIFAV:      tarifa,
        PRECIOBRUTO:    precio,
        PRECIOUNITARIO: precioConDto,
        PRODUCTCOUNT:   1,
        DESCUENTO1: d1, DESCUENTO2: 0, DESCUENTO3: 0, DESCUENTO4: 0,
      });
    }
    lanzarNotificacion(`${producto.DESCRIPCION} añadido`, 'success');
    modalBusqueda.value = false;
  } catch {
    lanzarNotificacion('Error al obtener precio del producto', 'error');
  } finally {
    agregandoProducto.value = '';
  }
};

// ----------------------------------------------------------------
// Inicio
// ----------------------------------------------------------------
onMounted(() => {
  const idQuery = route.query.id as string | undefined;
  if (idQuery) {
    cargarPedido(idQuery);
  } else {
    cargarLista();
  }
});
</script>

<style scoped>
.sticky-card { position: sticky; top: 24px; }
</style>
