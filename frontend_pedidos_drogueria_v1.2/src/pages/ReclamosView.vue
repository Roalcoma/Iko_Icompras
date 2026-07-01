<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-comment-alert</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Reclamos</h1>
        <span class="text-caption text-medium-emphasis">Registro de reclamos de clientes</span>
      </div>
    </div>

    <v-row>
      <!-- Formulario -->
      <v-col cols="12" md="5">
        <v-card rounded="xl" elevation="2" class="pa-4">
          <div class="text-subtitle-1 font-weight-bold mb-4">Nuevo Reclamo</div>

          <v-text-field
            :model-value="clienteSeleccionado ? `${clienteSeleccionado.CODCLIENTE} - ${clienteSeleccionado.NOMBRECLIENTE}` : ''"
            label="Cliente"
            placeholder="Click para buscar..."
            variant="outlined"
            density="comfortable"
            readonly
            prepend-inner-icon="mdi-account-box"
            class="mb-3"
            @click="modalCliente = true"
          >
            <template v-slot:append-inner>
              <v-btn color="primary" variant="elevated" size="small" @click="modalCliente = true">
                <v-icon size="18">mdi-magnify</v-icon>
              </v-btn>
            </template>
          </v-text-field>

          <v-select
            v-model="facturaSeleccionada"
            :items="opcionesFactura"
            item-title="texto"
            item-value="valor"
            label="Factura relacionada"
            variant="outlined"
            density="comfortable"
            :disabled="!clienteSeleccionado"
            :loading="cargandoFacturas"
            class="mb-3"
            return-object
          />

          <v-textarea
            v-model="textoReclamo"
            label="Descripción del reclamo"
            variant="outlined"
            density="comfortable"
            rows="5"
            class="mb-3"
          />

          <v-btn
            block color="primary" size="large" variant="elevated"
            :loading="guardando"
            :disabled="!clienteSeleccionado || !textoReclamo.trim()"
            @click="guardarReclamo"
          >
            Guardar Reclamo
          </v-btn>
        </v-card>
      </v-col>

      <!-- Listado -->
      <v-col cols="12" md="7">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4">
            <v-text-field v-model="busqueda" label="Buscar por cliente o texto" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarReclamos" />
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headers" :items="reclamos" :items-length="totalReclamos" :loading="cargando"
            v-model:items-per-page="itemsPerPage" @update:options="cargarPagina">
            <template v-slot:item.FECHACREACION="{ item }">
              {{ new Date(item.FECHACREACION).toLocaleDateString('es-VE') }}
            </template>
            <template v-slot:item.FACTURA="{ item }">
              <span v-if="item.NUMSERIE && item.NUMFACTURA">{{ item.NUMSERIE }}-{{ item.NUMFACTURA }}</span>
              <span v-else class="text-grey">—</span>
            </template>
            <template v-slot:item.RECLAMO="{ item }">
              <div style="max-width: 320px; white-space: normal;">{{ item.RECLAMO }}</div>
            </template>
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CLIENTEID || item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
          </v-data-table-server>
        </v-card>
      </v-col>
    </v-row>

    <!-- Modal búsqueda cliente -->
    <v-dialog v-model="modalCliente" max-width="700">
      <v-card class="rounded-lg">
        <v-card-title class="bg-primary text-on-primary font-weight-bold d-flex justify-space-between align-center">
          <span><v-icon start>mdi-account-search</v-icon> Seleccionar Cliente</span>
          <v-btn icon="mdi-close" variant="text" color="white" @click="modalCliente = false"></v-btn>
        </v-card-title>
        <v-card-text class="pt-6">
          <v-text-field v-model="busquedaCliente" label="Escribe CIF o Nombre..." variant="outlined" append-inner-icon="mdi-magnify" @keyup.enter="buscarClientes" class="mb-4" autofocus></v-text-field>
          <v-data-table :headers="headersClientes" :items="clientesEncontrados" :loading="cargandoClientes" items-per-page="5">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn color="success" size="small" @click="seleccionarCliente(item)">Seleccionar</v-btn>
            </template>
          </v-data-table>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

// ---------- FORMULARIO ----------
const clienteSeleccionado = ref<any>(null);
const textoReclamo = ref('');
const guardando = ref(false);

const opcionesFactura = ref<{ texto: string; valor: { numSerie: string | null; numFactura: number | null } }[]>([
  { texto: 'Ninguna', valor: { numSerie: null, numFactura: null } },
]);
const facturaSeleccionada = ref(opcionesFactura.value[0]);
const cargandoFacturas = ref(false);

const cargarFacturasCliente = async (codCliente: number) => {
  cargandoFacturas.value = true;
  try {
    const res = await axios.get(`${API}/reclamos/facturas/${codCliente}`);
    const facturas = res.data.success ? res.data.data : [];
    opcionesFactura.value = [
      { texto: 'Ninguna', valor: { numSerie: null, numFactura: null } },
      ...facturas.map((f: any) => ({
        texto: `${f.NUMSERIE}-${f.NUMFACTURA} — ${new Date(f.FECHA).toLocaleDateString('es-VE')} — $ ${Number(f.TOTALNETO || 0).toFixed(2)}`,
        valor: { numSerie: f.NUMSERIE, numFactura: f.NUMFACTURA },
      })),
    ];
    facturaSeleccionada.value = opcionesFactura.value[0];
  } finally { cargandoFacturas.value = false; }
};

const guardarReclamo = async () => {
  if (!clienteSeleccionado.value || !textoReclamo.value.trim()) return;
  guardando.value = true;
  try {
    await axios.post(`${API}/reclamos`, {
      codCliente: clienteSeleccionado.value.CODCLIENTE,
      numSerie: facturaSeleccionada.value.valor.numSerie,
      numFactura: facturaSeleccionada.value.valor.numFactura,
      reclamo: textoReclamo.value,
    });
    lanzarAviso('Reclamo guardado correctamente');
    clienteSeleccionado.value = null;
    textoReclamo.value = '';
    opcionesFactura.value = [{ texto: 'Ninguna', valor: { numSerie: null, numFactura: null } }];
    facturaSeleccionada.value = opcionesFactura.value[0];
    cargarReclamos();
  } catch {
    lanzarAviso('Error al guardar el reclamo', 'error');
  } finally {
    guardando.value = false;
  }
};

// ---------- BUSQUEDA DE CLIENTE ----------
const modalCliente = ref(false);
const busquedaCliente = ref('');
const clientesEncontrados = ref<any[]>([]);
const cargandoClientes = ref(false);
const headersClientes = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF/ID', key: 'ID' },
  { title: 'Acción', key: 'acciones', align: 'end' as const },
];

const buscarClientes = async () => {
  if (!busquedaCliente.value) return;
  cargandoClientes.value = true;
  try {
    const res = await axios.get(`${API}/clientes`, { params: { cif: busquedaCliente.value } });
    if (res.data.success) clientesEncontrados.value = res.data.clientes;
  } finally { cargandoClientes.value = false; }
};

const seleccionarCliente = (cliente: any) => {
  clienteSeleccionado.value = cliente;
  modalCliente.value = false;
  cargarFacturasCliente(cliente.CODCLIENTE);
};

// ---------- LISTADO ----------
const busqueda = ref('');
const reclamos = ref<any[]>([]);
const totalReclamos = ref(0);
const cargando = ref(false);
const itemsPerPage = ref(10);
const pagina = ref(1);
const headers = [
  { title: 'ID', key: 'ID' },
  { title: 'Fecha', key: 'FECHACREACION' },
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'Factura', key: 'FACTURA', sortable: false },
  { title: 'Reclamo', key: 'RECLAMO', sortable: false },
];

const cargarReclamos = async () => {
  cargando.value = true;
  try {
    const res = await axios.get(`${API}/reclamos`, { params: { search: busqueda.value, page: pagina.value, limit: itemsPerPage.value } });
    if (res.data.success) { reclamos.value = res.data.data; totalReclamos.value = res.data.total; }
  } finally { cargando.value = false; }
};
const cargarPagina = (opt: any) => { pagina.value = opt.page; itemsPerPage.value = opt.itemsPerPage; cargarReclamos(); };

onMounted(cargarReclamos);
</script>
