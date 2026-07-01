<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="purple-darken-2" size="32" class="mr-3">mdi-shield-alert</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Aprobación de Psicotrópicos</h1>
        <span class="text-caption text-medium-emphasis">Pedidos con artículos controlados pendientes de aprobación</span>
      </div>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="cargando" @click="cargarPedidos">Refrescar</v-btn>
    </div>

    <v-card rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headers" :items="pedidos" :items-length="totalPedidos" :loading="cargando"
        v-model:items-per-page="itemsPerPage" @update:options="cargarPagina">
        <template v-slot:item.FECHA="{ item }">
          {{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: 'America/Caracas' }) }}
        </template>
        <template v-slot:item.cliente_psico="{ item }">
          <span class="font-weight-medium">{{ item.CLIENTEID }}</span>
          <span v-if="item.NOMBRECLIENTE" class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
        </template>
        <template v-slot:item.TOTALPRECIO="{ item }">
          <v-chip color="green-darken-1" variant="tonal" class="font-weight-black">$ {{ Number(item.TOTALPRECIO || 0).toFixed(2) }}</v-chip>
        </template>
        <template v-slot:item.acciones="{ item }">
          <v-btn size="small" color="purple-darken-1" variant="tonal" prepend-icon="mdi-eye" @click="abrirDetalle(item)">
            Revisar
          </v-btn>
        </template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="modalDetalle.mostrar" max-width="700">
      <v-card rounded="xl" v-if="modalDetalle.pedido">
        <v-card-title class="pa-4 bg-purple-darken-2 text-white">
          Pedido #{{ modalDetalle.pedido.ORDERID }}
        </v-card-title>
        <v-card-text class="pa-4">
          <div class="text-caption text-grey mb-3">Cliente: {{ modalDetalle.pedido.CLIENTEID }} — Total: $ {{ Number(modalDetalle.pedido.TOTALPRECIO || 0).toFixed(2) }}</div>
          <v-table density="compact" class="mb-4">
            <thead>
              <tr><th>Código</th><th>Descripción</th><th class="text-center">Cant.</th><th class="text-right">Precio</th></tr>
            </thead>
            <tbody>
              <tr v-for="l in modalDetalle.pedido.lineas" :key="l.LINEAID">
                <td>{{ l.CODARTICULO }}</td>
                <td>{{ l.DESCRIPCION }}</td>
                <td class="text-center">{{ l.PRODUCTCOUNT }}</td>
                <td class="text-right">$ {{ Number(l.PRECIOUNITARIO).toFixed(2) }}</td>
              </tr>
            </tbody>
          </v-table>

          <v-divider class="mb-4" />
          <div class="text-subtitle-2 font-weight-bold mb-2">Código de aprobación gubernamental</div>
          <v-text-field v-model="codigoAprobacion" label="Código" variant="outlined" density="comfortable" autofocus />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="modalDetalle.mostrar = false">Cancelar</v-btn>
          <v-btn color="purple-darken-1" variant="elevated" :loading="aprobando" :disabled="!codigoAprobacion.trim()" @click="aprobar">
            Aprobar → Pendiente por Autorización
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const ESTATUS = 'APROBACION PSICOTROPICOS';

const pedidos = ref<any[]>([]);
const totalPedidos = ref(0);
const cargando = ref(false);
const itemsPerPage = ref(10);
const pagina = ref(1);
const headers = [
  { title: 'Orden', key: 'ORDERID' },
  { title: 'Fecha', key: 'FECHA' },
  { title: 'Cliente', key: 'cliente_psico', sortable: false },
  { title: 'Total', key: 'TOTALPRECIO' },
  { title: '', key: 'acciones', sortable: false },
];

const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

const cargarPedidos = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/pedidos`, { params: { estatus: ESTATUS, page: pagina.value, limit: itemsPerPage.value } });
    if (res.data.success) { pedidos.value = res.data.data; totalPedidos.value = res.data.total; }
  } finally { cargando.value = false; }
};
const cargarPagina = (opt: any) => { pagina.value = opt.page; itemsPerPage.value = opt.itemsPerPage; cargarPedidos(); };

const modalDetalle = ref<any>({ mostrar: false, pedido: null });
const codigoAprobacion = ref('');
const aprobando = ref(false);

const abrirDetalle = async (item: any) => {
  codigoAprobacion.value = '';
  const res = await axios.get(`${API}/pedidos`, { params: { orderId: item.ORDERID } });
  if (res.data.success) modalDetalle.value = { mostrar: true, pedido: res.data.data };
};

const aprobar = async () => {
  if (!modalDetalle.value.pedido) return;
  aprobando.value = true;
  try {
    const res = await axios.put(`${API}/pedidos/aprobar-psicotropico`, {
      orderId: modalDetalle.value.pedido.ORDERID,
      codigoAprobacion: codigoAprobacion.value,
    });
    if (res.data.success) {
      lanzarAviso('Pedido aprobado — liberado a PENDIENTE POR AUTORIZACIÓN');
      modalDetalle.value.mostrar = false;
      cargarPedidos();
    } else {
      lanzarAviso(res.data.message || 'Error al aprobar', 'error');
    }
  } catch (e: any) {
    lanzarAviso(e.response?.data?.message || 'Error al aprobar', 'error');
  } finally {
    aprobando.value = false;
  }
};

let refreshInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => { cargarPedidos(); refreshInterval = setInterval(cargarPedidos, 60_000); });
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval); });
</script>
