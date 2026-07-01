<template>
  <v-container fluid class="pa-6 bg-background">

    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-shopping</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Pedidos Ecommerce</h1>
        <span class="text-caption text-medium-emphasis">Pedidos importados desde la integración local</span>
      </div>
      <v-spacer />
      <v-text-field
        v-model="busqueda"
        placeholder="Buscar pedido, cliente, RIF..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width:280px;"
        class="mr-3"
        @keyup.enter="cargar"
      />
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="cargando" @click="cargar">
        Actualizar
      </v-btn>
    </div>

    <v-card rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headers"
        :items="pedidos"
        :items-length="total"
        :loading="cargando"
        @update:options="cargarPagina"
        hover
        class="bg-white"
      >
        <template v-slot:item.NUMERO_PEDIDO="{ item }">
          <span class="font-weight-black text-primary">#{{ item.NUMERO_PEDIDO }}</span>
        </template>

        <template v-slot:item.FECHA="{ item }">
          {{ item.FECHA ? new Date(item.FECHA).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '---' }}
        </template>

        <template v-slot:item.TOTAL="{ item }">
          <span class="font-weight-bold">Bs. {{ Number(item.TOTAL).toLocaleString('es-VE', { minimumFractionDigits: 2 }) }}</span>
        </template>

        <template v-slot:item.PROCESADO="{ item }">
          <v-chip :color="item.PROCESADO ? 'success' : 'warning'" size="small" variant="flat" class="font-weight-bold">
            {{ item.PROCESADO ? 'Procesado' : 'Pendiente' }}
          </v-chip>
        </template>

        <template v-slot:item.acciones="{ item }">
          <v-btn icon="mdi-eye-outline" size="small" variant="text" color="primary" @click="verLineas(item)" />
          <v-btn
            :icon="item.PROCESADO ? 'mdi-close-circle-outline' : 'mdi-check-circle-outline'"
            size="small"
            variant="text"
            :color="item.PROCESADO ? 'warning' : 'success'"
            @click="toggleProcesado(item)"
          />
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Modal detalle de líneas -->
    <v-dialog v-model="modalLineas.mostrar" max-width="800">
      <v-card rounded="xl">
        <v-card-title class="bg-primary text-white font-weight-bold d-flex justify-space-between align-center pa-4">
          <span><v-icon start>mdi-cart-outline</v-icon> Pedido #{{ modalLineas.pedido?.NUMERO_PEDIDO }} — {{ modalLineas.pedido?.NOMBRE_CLIENTE }}</span>
          <v-btn icon="mdi-close" variant="text" color="white" @click="modalLineas.mostrar = false" />
        </v-card-title>
        <v-card-text class="pa-4">
          <div class="mb-4 d-flex flex-wrap gap-4">
            <div><span class="text-caption text-grey">RIF:</span> <strong>{{ modalLineas.pedido?.RIF }}</strong></div>
            <div><span class="text-caption text-grey">Estatus:</span> <strong>{{ modalLineas.pedido?.ESTATUS }}</strong></div>
            <div><span class="text-caption text-grey">Total:</span> <strong>Bs. {{ Number(modalLineas.pedido?.TOTAL || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 }) }}</strong></div>
          </div>
          <v-data-table :headers="headersLineas" :items="modalLineas.lineas" :loading="modalLineas.cargando" density="compact">
            <template v-slot:item.PRECIO_UNITARIO="{ item }">
              Bs. {{ Number(item.PRECIO_UNITARIO).toLocaleString('es-VE', { minimumFractionDigits: 2 }) }}
            </template>
            <template v-slot:item.subtotal="{ item }">
              Bs. {{ (Number(item.PRECIO_UNITARIO) * Number(item.CANTIDAD)).toLocaleString('es-VE', { minimumFractionDigits: 2 }) }}
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" rounded="pill">{{ snack.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL}/ecommerce`;

const busqueda = ref('');
const pedidos  = ref<any[]>([]);
const total    = ref(0);
const cargando = ref(false);
const pagina   = ref(1);
const porPagina = ref(10);
const snack    = ref({ show: false, text: '', color: 'success' });

const headers = [
  { title: 'N° Pedido',  key: 'NUMERO_PEDIDO' },
  { title: 'Cliente',    key: 'NOMBRE_CLIENTE' },
  { title: 'RIF',        key: 'RIF',         sortable: false },
  { title: 'Fecha',      key: 'FECHA' },
  { title: 'Estatus',    key: 'ESTATUS',     sortable: false },
  { title: 'Total',      key: 'TOTAL',       align: 'end' as const },
  { title: 'Estado',     key: 'PROCESADO',   sortable: false },
  { title: '',           key: 'acciones',    sortable: false },
];

const headersLineas = [
  { title: 'Código',      key: 'COD_ARTICULO' },
  { title: 'Descripción', key: 'DESCRIPCION' },
  { title: 'Cant.',       key: 'CANTIDAD', align: 'center' as const },
  { title: 'Precio',      key: 'PRECIO_UNITARIO', align: 'end' as const },
  { title: 'Subtotal',    key: 'subtotal',         align: 'end' as const, sortable: false },
];

const modalLineas = ref({ mostrar: false, pedido: null as any, lineas: [] as any[], cargando: false });

const cargar = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/pedidos`, {
      params: { search: busqueda.value, page: pagina.value, limit: porPagina.value }
    });
    if (res.data.success) { pedidos.value = res.data.data; total.value = res.data.total; }
  } catch { mostrarSnack('Error al cargar pedidos', 'error'); }
  finally { cargando.value = false; }
};

const cargarPagina = (opt: any) => {
  pagina.value = opt.page;
  porPagina.value = opt.itemsPerPage;
  cargar();
};

const verLineas = async (item: any) => {
  modalLineas.value = { mostrar: true, pedido: item, lineas: [], cargando: true };
  try {
    const res = await axios.get(`${API}/pedidos/${item.ID}/lineas`);
    if (res.data.success) modalLineas.value.lineas = res.data.data;
  } catch { mostrarSnack('Error al cargar líneas', 'error'); }
  finally { modalLineas.value.cargando = false; }
};

const toggleProcesado = async (item: any) => {
  try {
    await axios.patch(`${API}/pedidos/${item.ID}/procesado`, { procesado: !item.PROCESADO });
    item.PROCESADO = !item.PROCESADO;
  } catch { mostrarSnack('Error al actualizar', 'error'); }
};

const mostrarSnack = (text: string, color = 'success') => { snack.value = { show: true, text, color }; };

onMounted(cargar);
</script>
