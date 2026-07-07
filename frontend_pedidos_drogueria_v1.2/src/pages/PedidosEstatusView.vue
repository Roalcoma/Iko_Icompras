<template>
  <v-container fluid class="pa-6 bg-background h-100">
    
    <v-row class="mb-6">
      <v-col cols="12" class="d-flex align-center">
        <v-icon size="40" color="primary" class="mr-4">mdi-store-clock-outline</v-icon>
        <div>
          <h1 class="text-h4 font-weight-black mb-0" style="color: #164E63;">Seguimiento de Órdenes</h1>
          <p class="text-body-2 text-grey-darken-1">Gestione el flujo logístico y actualice estados</p>
        </div>
        <v-spacer></v-spacer>
        <v-chip
          color="primary"
          variant="tonal"
          size="large"
          prepend-icon="mdi-clipboard-list-outline"
          class="mr-3 font-weight-black text-h6 px-5"
        >
          {{ totalPedidos.toLocaleString() }} pedido{{ totalPedidos !== 1 ? 's' : '' }}
        </v-chip>
        <v-btn
          prepend-icon="mdi-sync"
          variant="flat"
          color="white"
          class="text-primary elevation-1 rounded-pill px-6"
          :loading="loading"
          @click="obtenerPedidos()"
        >
          Refrescar
        </v-btn>
      </v-col>
    </v-row>

    <!-- Filtros -->
    <v-row class="mb-2">
      <v-col cols="12" sm="6" md="2">
        <v-text-field v-model="filtros.buscarId" label="N° Pedido" density="compact" variant="outlined"
          clearable hide-details prepend-inner-icon="mdi-pound" @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field v-model="filtros.clienteId" label="Código Cliente" density="compact" variant="outlined"
          clearable hide-details prepend-inner-icon="mdi-account" type="number" @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field v-model="filtros.codVendedor" label="Código Vendedor" density="compact" variant="outlined"
          clearable hide-details prepend-inner-icon="mdi-account-tie" type="number" @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-select v-model="filtros.estatus" label="Estatus" density="compact" variant="outlined"
          clearable hide-details prepend-inner-icon="mdi-list-status"
          :items="estatusOpciones" @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-autocomplete
          v-model="filtros.codruta"
          :items="zonas"
          item-title="display"
          item-value="zona"
          label="Ruta"
          density="compact"
          variant="outlined"
          clearable
          hide-details
          prepend-inner-icon="mdi-map-marker"
          @update:model-value="aplicarFiltros"
        />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-select v-model="filtros.riesgo" label="Riesgo Crédito" density="compact" variant="outlined"
          clearable hide-details prepend-inner-icon="mdi-shield-half-full"
          :items="['BAJO','MEDIO','ALTO','SUPERADO','SIN LIMITE']" @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field v-model="filtros.fechaDesde" label="Fecha desde" density="compact" variant="outlined"
          type="date" hide-details prepend-inner-icon="mdi-calendar-start" clearable @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2">
        <v-text-field v-model="filtros.fechaHasta" label="Fecha hasta" density="compact" variant="outlined"
          type="date" hide-details prepend-inner-icon="mdi-calendar-end" clearable @update:model-value="aplicarFiltros" />
      </v-col>
      <v-col cols="12" sm="6" md="2" class="d-flex align-center">
        <v-switch
          v-model="filtros.esPsicotropico"
          label="Solo Psicotrópicos"
          color="purple-darken-2"
          density="compact"
          hide-details
          @update:model-value="aplicarFiltros"
        />
      </v-col>
      <v-col cols="12" sm="6" md="2" class="d-flex align-center">
        <v-switch
          v-model="filtros.soloIcompras"
          label="Solo Icompras"
          color="teal-darken-1"
          density="compact"
          hide-details
          @update:model-value="aplicarFiltros"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-xl border-0 overflow-hidden">
          <v-data-table-server
            v-model:items-per-page="itemsPerPage"
            :headers="headers"
            :items="pedidos"
            :items-length="totalPedidos"
            :loading="loading"
            class="custom-table"
            @update:options="cargarPagina"
          >
            <template v-slot:item.ORDERID="{ item }">
              <div class="d-flex align-center" style="gap:4px">
                <span class="font-weight-black text-primary">#{{ item.ORDERID }}</span>
                <v-chip v-if="item.ORDERID?.startsWith('EC-')" size="x-small" color="teal-darken-1"
                  variant="flat" prepend-icon="mdi-shopping" class="font-weight-bold">
                  Icompras
                </v-chip>
                <v-tooltip v-if="item.OBSERVACIONES" location="top">
                  <template #activator="{ props }">
                    <v-chip v-bind="props" size="x-small" color="purple-darken-2" variant="flat"
                      prepend-icon="mdi-shield-alert" class="font-weight-bold cursor-pointer">
                      PSI
                    </v-chip>
                  </template>
                  <div style="background:#000;color:#fff;padding:6px 10px;border-radius:4px;font-size:13px">
                    Cód. aprobación: <strong>{{ item.OBSERVACIONES }}</strong>
                  </div>
                </v-tooltip>
              </div>
            </template>

            <template v-slot:item.cliente_col="{ item }">
              <div class="d-flex flex-column">
                <span class="font-weight-medium">{{ item.CLIENTEID }} — {{ riesgosMap[item.CLIENTEID]?.NOMBRECLIENTE || '' }}</span>
              </div>
            </template>

            <template v-slot:item.FECHA="{ item }">
              <div class="d-flex flex-column text-caption">
                <span class="font-weight-bold">{{ formatearFecha(item.FECHA) }}</span>
                <span class="text-grey">{{ formatearHora(item.FECHA) }}</span>
              </div>
            </template>

            <template v-slot:item.vendedor_col="{ item }">
              <span class="text-caption">{{ item.NOMVENDEDOR || item.CODVENDEDOR || '—' }}</span>
            </template>

            <template v-slot:item.RIESGO="{ item }">
              <v-chip
                v-if="riesgosMap[item.CLIENTEID]"
                :color="getColorRiesgo(riesgosMap[item.CLIENTEID].ESTATUS)"
                size="small"
                variant="flat"
                class="font-weight-black cursor-pointer px-4"
                @click="verDetalleRiesgo(item.CLIENTEID)"
              >
                {{ riesgosMap[item.CLIENTEID].ESTATUS }}
                <v-icon end size="14">mdi-information-outline</v-icon>
              </v-chip>
              <v-progress-circular v-else indeterminate size="16" width="2" color="grey"></v-progress-circular>
            </template>

            <template v-slot:item.ESTATUS="{ item }">
              <!-- Chip con menú si tiene transiciones posibles -->
              <v-menu v-if="transicionesPermitidas(item.ESTATUS).length > 0" transition="scale-transition">
                <template v-slot:activator="{ props }">
                  <v-chip
                    v-bind="props"
                    :color="getColores(item.ESTATUS).color"
                    class="font-weight-black text-uppercase justify-center elevation-1 cursor-pointer"
                    style="min-width: 200px; height: 32px;"
                  >
                    <v-icon start size="16">mdi-chevron-down</v-icon>
                    {{ item.ESTATUS || 'SIN ESTADO' }}
                  </v-chip>
                </template>

                <v-list density="compact" class="rounded-lg">
                  <v-list-item
                    v-for="opcion in transicionesPermitidas(item.ESTATUS)"
                    :key="opcion"
                    :prepend-icon="getColores(opcion).icon"
                    @click="actualizarEstatusBD(item, opcion)"
                    color="primary"
                  >
                    <v-list-item-title class="text-caption font-weight-bold">{{ opcion }}</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>

              <!-- Chip estático para estados sin transición -->
              <v-chip
                v-else
                :color="getColores(item.ESTATUS).color"
                class="font-weight-black text-uppercase justify-center elevation-0 opacity-80"
                style="min-width: 200px; height: 32px;"
              >
                {{ item.ESTATUS }}
              </v-chip>
            </template>

            <template v-slot:item.TOTALUNIDADES="{ item }">
              <v-chip size="small" color="blue-grey" variant="tonal" class="font-weight-bold">
                {{ item.TOTALUNIDADES ?? 0 }}
              </v-chip>
            </template>

            <template v-slot:item.TOTALPRECIO="{ item }">
              <v-chip color="secondary" variant="tonal" class="font-weight-black" style="height: auto; padding: 6px 12px;">
                <MontoDisplay :usd="item.TOTALPRECIO || 0" :tasa="carritoStore.tasa" align-end />
              </v-chip>
            </template>

            <template v-slot:item.acciones="{ item }">
              <div class="d-flex align-center" style="gap: 2px;">
                <v-btn
                  v-if="puedeEditar"
                  icon="mdi-pencil-outline"
                  variant="text"
                  size="small"
                  :disabled="item.ESTATUS !== 'PENDIENTE'"
                  :color="item.ESTATUS === 'PENDIENTE' ? 'blue-grey-darken-2' : 'grey-lighten-2'"
                  @click="irAEdicion(item)"
                ></v-btn>
                <v-btn
                  v-if="item.ESTATUS === 'PENDIENTE'"
                  icon="mdi-delete-outline"
                  variant="text"
                  size="small"
                  color="error"
                  @click="pedidoAEliminar = item; dialogEliminar = true"
                ></v-btn>
                <v-btn
                  v-if="item.ESTATUS === 'OK'"
                  icon="mdi-eye-outline"
                  variant="text"
                  size="small"
                  color="teal-darken-2"
                  :loading="conteoModal.loadingId === item.ORDERID"
                  @click="verConteo(item)"
                ></v-btn>
                <v-btn
                  icon="mdi-file-pdf-box"
                  variant="text"
                  size="small"
                  color="red-darken-2"
                  :loading="pdfCargando === item.ORDERID"
                  @click="imprimirPDF(item)"
                ></v-btn>
              </div>
            </template>

          </v-data-table-server>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="modalRiesgo.show" max-width="500">
      <v-card v-if="modalRiesgo.data" class="rounded-xl pa-2">
        <v-card-title class="d-flex align-center py-4">
          <v-icon :color="getColorRiesgo(modalRiesgo.data.ESTATUS)" class="mr-3" size="32">mdi-shield-account</v-icon>
          <div>
            <div class="text-h6 font-weight-black">Análisis de Crédito</div>
            <div class="text-caption text-grey">{{ modalRiesgo.data.NOMBRECLIENTE }}</div>
          </div>
        </v-card-title>
        
        <v-divider></v-divider>

        <v-card-text class="py-6">
          <v-row dense>
            <v-col cols="6">
              <div class="text-caption text-grey text-uppercase font-weight-bold">Límite Concedido</div>
              <div class="text-h6 font-weight-bold">$ {{ modalRiesgo.data.RIESGOCONCEDIDO.toLocaleString() }}</div>
            </v-col>
            <v-col cols="6" class="text-right">
              <div class="text-caption text-grey text-uppercase font-weight-bold">Deuda Actual (CxC)</div>
              <div class="text-h6 font-weight-bold text-error">$ {{ Number(modalRiesgo.data.CX || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) }}</div>
            </v-col>
          </v-row>

          <div class="mt-6">
            <div class="d-flex justify-space-between mb-2 align-end">
              <span class="text-subtitle-2 font-weight-bold">Uso del Crédito</span>
              <span class="text-h5 font-weight-black" :style="{ color: getColorRiesgo(modalRiesgo.data.ESTATUS) }">
                {{ modalRiesgo.data.PORCENTAJE_RIESGO.toFixed(1) }}%
              </span>
            </div>
            <v-progress-linear
              :model-value="modalRiesgo.data.PORCENTAJE_RIESGO"
              :color="getColorRiesgo(modalRiesgo.data.ESTATUS)"
              height="12"
              rounded
              striped
            ></v-progress-linear>
          </div>

          <v-alert
            :color="getColorRiesgo(modalRiesgo.data.ESTATUS)"
            variant="tonal"
            class="mt-6 rounded-lg"
            border="start"
          >
            <template v-slot:prepend>
              <v-icon size="24">mdi-alert-circle-outline</v-icon>
            </template>
            El cliente se encuentra en estatus <strong>{{ modalRiesgo.data.ESTATUS }}</strong>. 
            {{ modalRiesgo.data.PORCENTAJE_RIESGO >= 100 ? 'Se requiere pago inmediato para liberar nuevas órdenes.' : 'Crédito disponible para procesamiento.' }}
          </v-alert>
        </v-card-text>

        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="grey-darken-1" @click="modalRiesgo.show = false" class="px-6">Cerrar</v-btn>
          <v-btn color="primary" variant="elevated" rounded="pill" class="px-6" @click="modalRiesgo.show = false">Entendido</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirmación eliminar pedido -->
    <v-dialog v-model="dialogEliminar" max-width="400">
      <v-card class="rounded-xl">
        <v-card-title class="pa-4 d-flex align-center">
          <v-icon color="error" class="mr-2">mdi-alert</v-icon> Eliminar pedido
        </v-card-title>
        <v-card-text>
          ¿Eliminar permanentemente el pedido <strong>#{{ pedidoAEliminar?.ORDERID }}</strong>?
          Esta acción no se puede deshacer.
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="dialogEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="eliminando" @click="eliminarPedido">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Modal visor de conteo -->
    <v-dialog v-model="conteoModal.show" max-width="800">
      <v-card class="rounded-xl">
        <v-card-title class="pa-4 bg-teal-darken-2 text-white d-flex align-center">
          <v-icon start>mdi-clipboard-check-outline</v-icon>
          Conteo de Almacén — Pedido #{{ conteoModal.orderId }}
          <v-spacer />
          <v-chip v-if="conteoModal.data" size="small" variant="flat" color="white" class="text-teal-darken-2 font-weight-bold">
            {{ conteoModal.data.estadoConteo }}
          </v-chip>
        </v-card-title>

        <v-card-text class="pa-4">
          <div v-if="!conteoModal.data" class="text-center text-grey pa-6">
            Sin datos de conteo para este pedido.
          </div>
          <template v-else>
            <div class="text-caption text-grey mb-3">Fecha conteo: {{ conteoModal.data.fechaConteo ?? '—' }}</div>
            <v-table density="compact" hover>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th class="text-center">Pedido</th>
                  <th class="text-center">Contado</th>
                  <th class="text-center">Dif.</th>
                  <th class="text-right">Precio</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in conteoModal.data.lineas" :key="l.codarticulo"
                    :class="l.cantContada !== l.cantPedida ? 'bg-orange-lighten-5' : ''">
                  <td class="text-caption">{{ l.codarticulo }}</td>
                  <td>{{ l.descripcion }}</td>
                  <td class="text-center font-weight-bold">{{ l.cantPedida }}</td>
                  <td class="text-center font-weight-bold">{{ l.cantContada }}</td>
                  <td class="text-center font-weight-bold"
                      :class="l.cantContada - l.cantPedida > 0 ? 'text-success' : l.cantContada - l.cantPedida < 0 ? 'text-error' : 'text-grey'">
                    {{ l.cantContada - l.cantPedida === 0 ? '—' : (l.cantContada - l.cantPedida > 0 ? '+' : '') + (l.cantContada - l.cantPedida) }}
                  </td>
                  <td class="text-right text-caption">$ {{ l.precio.toFixed(2) }}</td>
                </tr>
              </tbody>
            </v-table>

            <v-divider class="my-3" />
            <div class="d-flex justify-end gap-6 text-body-2">
              <span>Total pedido: <strong>{{ conteoModal.data.lineas.reduce((s, l) => s + l.cantPedida, 0) }}</strong> uds</span>
              <span class="ml-4">Total contado: <strong>{{ conteoModal.data.lineas.reduce((s, l) => s + l.cantContada, 0) }}</strong> uds</span>
            </div>
          </template>
        </v-card-text>

        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="conteoModal.show = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" rounded="pill">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { generarPedidoPDF, type ConteoPDFData } from '../utils/pedidoPDF';
import { useAuthStore } from '../stores/useAuthStore';
import { useCarritoStore } from '../stores/useCarritoStore';
import MontoDisplay from '../components/MontoDisplay.vue';

const router       = useRouter();
const authStore    = useAuthStore();
const carritoStore = useCarritoStore();

const BIT_AUTORIZADOR = 2048;
const BIT_BACKOFFICE  = 16;
const BIT_EDICION     = 8;
const vis = computed(() => Number(authStore.usuario?.visibilidad ?? 0));
const puedeAutorizar = computed(() => (vis.value & BIT_AUTORIZADOR) !== 0 || (vis.value & BIT_BACKOFFICE) !== 0);
const puedeEditar    = computed(() => (vis.value & BIT_EDICION)     !== 0 || (vis.value & BIT_BACKOFFICE) !== 0);
const pedidos     = ref<any[]>([]);
const pdfCargando = ref<string | null>(null);
const totalPedidos = ref(0);
const loading = ref(false);
const itemsPerPage = ref(10);
const snackbar = ref({ show: false, text: '', color: '' });
const dialogEliminar  = ref(false);
const pedidoAEliminar = ref<any>(null);
const eliminando      = ref(false);

const riesgosMap = ref<Record<number, any>>({});
const modalRiesgo = ref({ show: false, data: null as any });

const conteoModal = ref<{ show: boolean; loadingId: string | null; orderId: string; data: any }>({
    show: false, loadingId: null, orderId: '', data: null
});

const verConteo = async (item: any) => {
    conteoModal.value.loadingId = item.ORDERID;
    try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/pedidos/conteo`, { params: { orderId: item.ORDERID } });
        conteoModal.value.data    = res.data.data ?? null;
        conteoModal.value.orderId = item.ORDERID;
        conteoModal.value.show    = true;
    } catch {
        lanzarNotificacion('Error al cargar conteo', 'error');
    } finally {
        conteoModal.value.loadingId = null;
    }
};

const TRANSICIONES_BASE: Record<string, string[]> = {
  'PENDIENTE':                  ['PENDIENTE POR AUTORIZACION', 'AUTORIZADO', 'CANCELADO'],
  'PENDIENTE POR AUTORIZACION': ['AUTORIZADO', 'CANCELADO'],
  'AUTORIZADO':                 ['EMPACADO', 'CANCELADO'],
  'OK':                         ['CANCELADO'],
  'EMPACADO':                   ['FINALIZADO'],
  'ICG':                        ['CANCELADO'],
};

// Filtra las opciones según permisos del usuario actual
const transicionesPermitidas = (estatus: string): string[] => {
  const todas = TRANSICIONES_BASE[estatus] ?? [];
  if (puedeAutorizar.value) return todas;
  // Sin autorizar: pueden cancelar PENDIENTE, pero no avanzar a AUTORIZADO ni cancelar estados avanzados
  if (estatus === 'PENDIENTE') return todas.filter(t => t !== 'AUTORIZADO');
  return todas.filter(t => t !== 'AUTORIZADO' && t !== 'CANCELADO');
};

const headers = [
  { title: 'ORDEN',       key: 'ORDERID',       align: 'start'  as const },
  { title: 'REGISTRO',    key: 'FECHA',          align: 'start'  as const },
  { title: 'CLIENTE',     key: 'cliente_col',    align: 'start'  as const, sortable: false },
  { title: 'VENDEDOR',    key: 'vendedor_col',  align: 'start'  as const, sortable: false },
  { title: 'RIESGO',      key: 'RIESGO',        align: 'center' as const, sortable: false },
  { title: 'ESTADO ACTUAL', key: 'ESTATUS',     align: 'center' as const, sortable: false },
  { title: 'UNIDADES',    key: 'TOTALUNIDADES', align: 'center' as const, sortable: false },
  { title: 'TOTAL',       key: 'TOTALPRECIO',   align: 'end'    as const },
  { title: 'ACCIONES',    key: 'acciones',      align: 'center' as const, sortable: false },
];

const estatusOpciones = [
  'PENDIENTE', 'PENDIENTE POR AUTORIZACION', 'APROBACION PSICOTROPICOS',
  'AUTORIZADO', 'ICG', 'OK', 'EMPACADO', 'FINALIZADO', 'CANCELADO',
];

const zonas  = ref<{ zona: string; display: string }[]>([]);
const filtros = ref({ buscarId: '', clienteId: '', codVendedor: '', estatus: null as string | null, riesgo: null as string | null, codruta: null as string | null, fechaDesde: null as string | null, fechaHasta: null as string | null, esPsicotropico: false, soloIcompras: false });

let filtroTimer: ReturnType<typeof setTimeout> | null = null;
const aplicarFiltros = () => {
  if (filtroTimer) clearTimeout(filtroTimer);
  filtroTimer = setTimeout(() => obtenerPedidos(1, itemsPerPage.value), 400);
};

const obtenerPedidos = async (page = 1, limit = 10) => {
  loading.value = true;
  try {
    const params: Record<string, any> = { page, limit };
    if (filtros.value.soloIcompras) params.buscarId = 'EC-%';
    else if (filtros.value.buscarId) params.buscarId = filtros.value.buscarId;
    if (filtros.value.clienteId)  params.clienteId   = filtros.value.clienteId;
    if (filtros.value.codVendedor) params.codVendedor = filtros.value.codVendedor;
    if (filtros.value.estatus)    params.estatus     = filtros.value.estatus;
    if (filtros.value.riesgo)      params.riesgo      = filtros.value.riesgo;
    if (filtros.value.codruta)     params.codruta     = filtros.value.codruta;
    if (filtros.value.fechaDesde)     params.fechaDesde     = filtros.value.fechaDesde;
    if (filtros.value.fechaHasta)     params.fechaHasta     = filtros.value.fechaHasta;
    if (filtros.value.esPsicotropico) params.esPsicotropico = '1';
    const response = await axios.get(`${import.meta.env.VITE_API_URL}/pedidos`, { params });
    if (response.data.success) {
      pedidos.value = response.data.data;
      totalPedidos.value = response.data.total ?? 0;
      cargarRiesgosMasivos();
    }
  } catch (error) {
    lanzarNotificacion('Error al cargar datos', 'error');
  } finally {
    loading.value = false;
  }
};

const cargarRiesgosMasivos = async () => {
  const idsUnicos = [...new Set(pedidos.value.map(p => p.CLIENTEID))];
  if (idsUnicos.length === 0) return;

  try {
    const res = await axios.post(`${import.meta.env.VITE_API_URL}/clientes/riesgo-masivo`, {
      codclientes: idsUnicos
    });
    if (res.data.success && res.data.riesgos) {
      const nuevoMapa: Record<number, any> = {};
      res.data.riesgos.forEach((r: any) => { nuevoMapa[r.CODCLIENTE] = r; });
      riesgosMap.value = nuevoMapa;
    }
  } catch (e) {
    console.error("Error cargando riesgos", e);
  }
};

const verDetalleRiesgo = (clienteId: number) => {
  if (riesgosMap.value[clienteId]) {
    modalRiesgo.value.data = riesgosMap.value[clienteId];
    modalRiesgo.value.show = true;
  }
};

const getColorRiesgo = (status: string) => {
  const s = status?.toUpperCase() || '';
  if (s === 'BAJO') return 'success';
  if (s === 'MEDIO') return 'orange';
  if (s === 'ALTO') return 'red-darken-2';
  if (s === 'SUPERADO') return 'grey-darken-4';
  return 'grey';
};

const cargarPagina = ({ page, itemsPerPage }: any) => {
  obtenerPedidos(page, itemsPerPage);
};

const actualizarEstatusBD = async (item: any, nuevoStatus: string) => {
  const orderId     = item.ORDERID;
  const statusActual = item.ESTATUS;

  // Verificar que la transición esté permitida
  const permitidos = transicionesPermitidas(statusActual);
  if (!permitidos.includes(nuevoStatus)) {
    return lanzarNotificacion(`No se puede cambiar de "${statusActual}" a "${nuevoStatus}"`, 'warning');
  }

  try {
    const res = await axios.put(`${import.meta.env.VITE_API_URL}/pedidos/status`, {
      orderId,
      status: nuevoStatus
    });
    if (res.data.success) {
      // Actualizar el item en la lista local para respuesta inmediata
      item.ESTATUS = nuevoStatus;
      lanzarNotificacion(`Estatus de #${orderId} actualizado a ${nuevoStatus}`, 'success');
    }
  } catch (error: any) {
    const msg = error.response?.data?.message || 'Error al actualizar estatus';
    lanzarNotificacion(msg, 'error');
  }
};

const getColores = (status: string) => {
  if (!status) return { color: 'grey', icon: 'mdi-circle-outline' };
  const s = status.toUpperCase().trim();
  if (s === 'APROBACION PSICOTROPICOS') return { color: 'purple-darken-3', icon: 'mdi-shield-alert' };
  if (s === 'ICG')                      return { color: 'green-darken-3',  icon: 'mdi-check-decagram' };
  if (s.includes('AUTORIZACION'))       return { color: 'orange-darken-3', icon: 'mdi-clock-alert' };
  if (s === 'PENDIENTE')                return { color: 'amber-darken-3',  icon: 'mdi-clock-outline' };
  if (s === 'AUTORIZADO')               return { color: 'blue-darken-2',   icon: 'mdi-check-circle' };
  if (s === 'OK')                       return { color: 'teal-darken-2',   icon: 'mdi-check-all' };
  if (s === 'EMPACADO')                 return { color: 'purple-darken-1', icon: 'mdi-package-variant-closed' };
  if (s === 'CANCELADO')                return { color: 'red-darken-2',    icon: 'mdi-cancel' };
  if (s === 'FINALIZADO')               return { color: 'green-darken-2',  icon: 'mdi-flag-checkered' };
  return { color: 'grey-darken-1', icon: 'mdi-circle-outline' };
};

const formatearFecha = (f: any) => f ? new Date(f).toLocaleDateString() : '---';
const formatearHora = (f: any) => f ? new Date(f).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';

const lanzarNotificacion = (text: string, color: string) => {
  snackbar.value = { show: true, text, color };
};

const eliminarPedido = async () => {
  if (!pedidoAEliminar.value) return;
  eliminando.value = true;
  try {
    const res = await axios.delete(`${import.meta.env.VITE_API_URL}/pedidos?orderId=${pedidoAEliminar.value.ORDERID}`);
    if (res.data.success) {
      pedidos.value = pedidos.value.filter(p => p.ORDERID !== pedidoAEliminar.value.ORDERID);
      totalPedidos.value--;
      lanzarNotificacion(`Pedido #${pedidoAEliminar.value.ORDERID} eliminado`, 'success');
    } else {
      lanzarNotificacion(res.data.message || 'Error al eliminar', 'error');
    }
  } catch (e: any) {
    lanzarNotificacion(e.response?.data?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
    dialogEliminar.value = false;
    pedidoAEliminar.value = null;
  }
};

const irAEdicion = (item: any) => {
  if (item.ESTATUS !== 'PENDIENTE') return;
  router.push({ name: 'pedidos-edicion', query: { id: item.ORDERID } });
};

const imprimirPDF = async (item: any) => {
  pdfCargando.value = item.ORDERID;
  try {
    const [pedidoRes, conteoRes] = await Promise.all([
      axios.get(`${import.meta.env.VITE_API_URL}/pedidos?orderId=${item.ORDERID}`),
      item.ESTATUS === 'OK'
        ? axios.get(`${import.meta.env.VITE_API_URL}/pedidos/conteo`, { params: { orderId: item.ORDERID } })
        : Promise.resolve(null),
    ]);

    if (!pedidoRes.data.success) { lanzarNotificacion('No se pudo cargar el pedido', 'error'); return; }

    const pedido = pedidoRes.data.data;
    const lineas = pedido.lineas || [];
    const cliente = riesgosMap.value[item.CLIENTEID];

    let conteo: ConteoPDFData | undefined;
    if (conteoRes?.data?.success && conteoRes.data.data) {
      conteo = {
        fechaConteo:  conteoRes.data.data.fechaConteo,
        estadoConteo: conteoRes.data.data.estadoConteo,
        lineas:       conteoRes.data.data.lineas,
      };
    }

    await generarPedidoPDF({
      numeroOrden: item.ORDERID,
      fecha: item.FECHA,
      estatus: item.ESTATUS,
      cliente: {
        codcliente: item.CLIENTEID,
        nombrecliente: cliente?.NOMBRECLIENTE || `Cliente ${item.CLIENTEID}`,
        nit: item.NIF20 || item.CIF || '',
        direccionFiscal: item.DIRECCION1 || '',
        direccionEnvio:  item.RUTA || '',
      },
      lineas: lineas.map((l: any) => ({
        codigo: l.CODARTICULO,
        descripcion: l.DESCRIPCION || '',
        cantidad: Number(l.PRODUCTCOUNT),
        precioUnitario: Number(l.PRECIOUNITARIO),
        descuentos: [l.DESCUENTO1, l.DESCUENTO2, l.DESCUENTO3, l.DESCUENTO4]
          .map(Number).filter(d => d > 0),
        sinDescuento: !!l.NODTOAPLICABLE,
        diasProteccion: Number(l.DIASPROTECCION ?? 0),
        porcentajeIva: Number(l.PORCENTAJEIVA ?? 0),
      })),
      totalUSD: lineas.reduce((s: number, l: any) => s + Number(l.PRECIOUNITARIO) * Number(l.PRODUCTCOUNT), 0),
      totalIVA: lineas.reduce((s: number, l: any) => s + Number(l.MONTOIVA ?? 0), 0),
      conteo,
    });
  } catch {
    lanzarNotificacion('Error al generar el PDF', 'error');
  } finally {
    pdfCargando.value = null;
  }
};

let refreshInterval: ReturnType<typeof setInterval> | null = null;
onMounted(async () => {
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/rutero/zonas`);
    zonas.value = res.data.data ?? [];
  } catch { /* silencioso */ }
  refreshInterval = setInterval(() => obtenerPedidos(), 60_000);
});
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval); });
</script>

<style scoped>
.custom-table :deep(th) {
  font-weight: 900 !important;
  color: #455A64 !important;
  font-size: 0.75rem !important;
}
.cursor-pointer { cursor: pointer; }
.opacity-80 { opacity: 0.9; }
</style>