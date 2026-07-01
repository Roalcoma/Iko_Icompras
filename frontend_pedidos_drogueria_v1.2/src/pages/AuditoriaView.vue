<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-clipboard-text-clock</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color:#164E63;">Auditoría de Pedidos</h1>
        <span class="text-caption text-medium-emphasis">Historial completo de cambios de estatus</span>
      </div>
      <v-spacer />
      <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="cargando" @click="cargar">Refrescar</v-btn>
    </div>

    <!-- Filtros -->
    <v-card rounded="xl" elevation="1" class="mb-4 pa-4">
      <div class="d-flex gap-3 align-end flex-wrap">
        <div style="min-width:180px">
          <div class="text-caption text-grey mb-1">N° de Orden</div>
          <v-text-field v-model="filtroOrder" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-pound" @keyup.enter="cargar" />
        </div>
        <div style="min-width:180px">
          <div class="text-caption text-grey mb-1">Usuario</div>
          <v-text-field v-model="filtroUsuario" placeholder="Buscar..." variant="outlined" density="compact" hide-details clearable prepend-inner-icon="mdi-account" @keyup.enter="cargar" />
        </div>
        <v-btn color="primary" variant="tonal" @click="cargar">Buscar</v-btn>
        <v-btn v-if="filtroOrder || filtroUsuario" variant="text" color="grey" @click="limpiar">Limpiar</v-btn>
      </div>
    </v-card>

    <v-card rounded="xl" elevation="2">
      <v-data-table-server
        :headers="headers"
        :items="registros"
        :items-length="total"
        :loading="cargando"
        v-model:items-per-page="itemsPerPage"
        @update:options="onOptions"
      >
        <template v-slot:item.FECHA="{ item }">
          <span class="text-caption">{{ new Date(item.FECHA).toLocaleString('es-VE', { timeZone: 'America/Caracas' }) }}</span>
        </template>
        <template v-slot:item.EST_ANTERIOR="{ item }">
          <v-chip v-if="item.EST_ANTERIOR" :color="colorEstatus(item.EST_ANTERIOR)" size="x-small" variant="tonal">
            {{ item.EST_ANTERIOR }}
          </v-chip>
          <span v-else class="text-caption text-grey">—</span>
        </template>
        <template v-slot:item.EST_NUEVO="{ item }">
          <v-chip :color="colorEstatus(item.EST_NUEVO)" size="x-small" variant="flat" class="font-weight-bold">
            {{ item.EST_NUEVO }}
          </v-chip>
        </template>
        <template v-slot:item.USUARIO="{ item }">
          <span class="text-caption">{{ item.USUARIO ?? '—' }}</span>
        </template>
        <template v-slot:item.DETALLES="{ item }">
          <span class="text-caption text-grey">{{ item.DETALLES ?? '' }}</span>
        </template>
      </v-data-table-server>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

const registros    = ref<any[]>([]);
const total        = ref(0);
const cargando     = ref(false);
const itemsPerPage = ref(25);
const pagina       = ref(1);
const filtroOrder   = ref('');
const filtroUsuario = ref('');

const headers = [
  { title: 'Fecha',          key: 'FECHA',        sortable: false },
  { title: 'N° Orden',       key: 'ORDERID',      sortable: false },
  { title: 'Estado anterior', key: 'EST_ANTERIOR', sortable: false },
  { title: 'Estado nuevo',   key: 'EST_NUEVO',    sortable: false },
  { title: 'Usuario',        key: 'USUARIO',      sortable: false },
  { title: 'Detalles',       key: 'DETALLES',     sortable: false },
];

const colorEstatus = (est: string) => {
  const map: Record<string, string> = {
    'PENDIENTE': 'blue-grey',
    'PENDIENTE POR AUTORIZACION': 'orange',
    'APROBACION PSICOTROPICOS': 'purple',
    'AUTORIZADO': 'cyan',
    'EMPACADO': 'teal',
    'FINALIZADO': 'green',
    'CANCELADO': 'red',
  };
  return map[est] ?? 'grey';
};

const cargar = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/pedidos/auditoria`, {
      params: {
        orderId:  filtroOrder.value   || undefined,
        usuario:  filtroUsuario.value || undefined,
        page:     pagina.value,
        limit:    itemsPerPage.value,
      }
    });
    if (res.data.success) {
      registros.value = res.data.data;
      total.value     = res.data.total;
    }
  } finally {
    cargando.value = false;
  }
};

const limpiar = () => { filtroOrder.value = ''; filtroUsuario.value = ''; cargar(); };

const onOptions = (opt: any) => {
  pagina.value       = opt.page;
  itemsPerPage.value = opt.itemsPerPage;
  cargar();
};
</script>
