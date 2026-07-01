<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-account-group</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Gestión de Clientes</h1>
        <span class="text-caption text-medium-emphasis">Descuento global y grupos de clientes</span>
      </div>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="clientes">Clientes</v-tab>
      <v-tab value="grupos">Grupos de Clientes</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ===================== CLIENTES ===================== -->
      <v-window-item value="clientes">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4">
            <v-text-field v-model="busquedaCliente" label="Buscar por nombre o CIF" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarClientes" style="max-width: 320px;" />
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headersClientes" :items="clientes" :items-length="totalClientes" :loading="cargandoClientes"
            v-model:items-per-page="itemsPerPageClientes" @update:options="cargarPaginaClientes">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.DESCUENTO="{ item }">
              <div class="d-flex align-center" style="max-width: 140px;">
                <v-text-field v-model.number="item.DESCUENTO" type="number" density="compact" variant="outlined" hide-details
                  suffix="%" style="max-width: 100px;" />
                <v-btn icon="mdi-content-save" size="small" color="primary" variant="text" class="ml-1"
                  @click="guardarDescuento(item)" :loading="guardandoId === item.CODCLIENTE" />
              </div>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>

      <!-- ===================== GRUPOS DE CLIENTES ===================== -->
      <v-window-item value="grupos">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4 d-flex align-center">
            <v-text-field v-model="busquedaGrupo" label="Buscar grupo" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarGrupos"
              style="max-width: 320px;" class="mr-3" />
            <v-spacer />
            <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNuevoGrupo">Nuevo Grupo</v-btn>
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headersGrupos" :items="grupos" :items-length="totalGrupos" :loading="cargandoGrupos"
            v-model:items-per-page="itemsPerPageGrupos" @update:options="cargarPaginaGrupos">
            <template v-slot:item.TIPO="{ item }">
              <v-chip size="x-small" :color="item.TIPO === 'CONDICION' ? 'purple-darken-1' : 'blue-grey'" variant="flat">
                {{ item.TIPO === 'CONDICION' ? 'Por condición' : 'Manual' }}
              </v-chip>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-pencil" variant="text" size="small" @click="abrirEditarGrupo(item)" />
              <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-account-multiple" @click="abrirMiembros(item)">
                Clientes
              </v-btn>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialog: nuevo/editar grupo -->
    <v-dialog v-model="modalGrupo.mostrar" max-width="600">
      <v-card rounded="xl">
        <v-card-title class="pa-4">{{ modalGrupo.id ? 'Editar' : 'Nuevo' }} Grupo de Clientes</v-card-title>
        <v-card-text>
          <v-text-field v-model="modalGrupo.nombre" label="Nombre del grupo" variant="outlined" density="comfortable" class="mb-3" autofocus />
          <v-btn-toggle v-model="modalGrupo.tipo" color="primary" variant="outlined" divided mandatory class="mb-4">
            <v-btn value="MANUAL">Manual</v-btn>
            <v-btn value="CONDICION">Por condición</v-btn>
          </v-btn-toggle>

          <template v-if="modalGrupo.tipo === 'CONDICION'">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold">Condiciones (todas se combinan con Y)</span>
              <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="modalGrupo.condiciones.push({ campo: '', operador: '=', valor: '' })">Agregar condición</v-btn>
            </div>
            <v-row v-for="(c, i) in modalGrupo.condiciones" :key="i" dense align="center" class="mb-1">
              <v-col cols="4">
                <v-select v-model="c.campo" :items="camposClientes" item-title="label" item-value="codigo"
                  label="Campo" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="3">
                <v-select v-model="c.operador" :items="operadoresPara(c.campo)" label="Operador" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="4">
                <v-text-field v-model="c.valor" label="Valor" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="1"><v-btn icon="mdi-close" size="small" variant="text" color="error" @click="modalGrupo.condiciones.splice(i, 1)" /></v-col>
            </v-row>
          </template>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer /><v-btn variant="text" @click="modalGrupo.mostrar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="elevated" :loading="guardandoGrupo" @click="guardarGrupo">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: miembros del grupo -->
    <v-dialog v-model="modalMiembros.mostrar" max-width="800">
      <v-card rounded="xl">
        <v-card-title class="pa-4 bg-primary text-white d-flex align-center justify-space-between">
          <span>{{ modalMiembros.grupo?.NOMBRE }}</span>
          <v-chip v-if="modalMiembros.grupo?.TIPO === 'CONDICION'" size="small" color="white" variant="flat" class="text-purple-darken-1">Por condición — solo lectura</v-chip>
        </v-card-title>
        <v-card-text class="pa-4">
          <template v-if="modalMiembros.grupo?.TIPO !== 'CONDICION'">
            <v-text-field v-model="busquedaClienteAgregar" label="Buscar cliente para agregar" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" class="mb-3" @keyup.enter="buscarClientesParaAgregar" />
            <v-list v-if="resultadosCliente.length" border rounded class="mb-4" max-height="200" style="overflow-y:auto;">
              <v-list-item v-for="cli in resultadosCliente" :key="cli.CODCLIENTE" :title="`${cli.CODCLIENTE} - ${cli.NOMBRECLIENTE}`" :subtitle="cli.ID">
                <template v-slot:append>
                  <v-btn size="small" color="success" @click="agregarMiembro(cli.CODCLIENTE)">Agregar</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <div class="d-flex align-center mb-3 gap-2">
              <v-btn prepend-icon="mdi-microsoft-excel" color="success" variant="tonal" size="small" @click="$refs.excelClientes.click()" :loading="importandoExcel">
                Importar Excel
              </v-btn>
              <input ref="excelClientes" type="file" accept=".xlsx,.xls" style="display:none" @change="importarExcel" />
              <span v-if="resultadoImport" class="text-caption">{{ resultadoImport }}</span>
            </div>
            <v-divider class="mb-3" />
          </template>
          <div class="text-subtitle-2 font-weight-bold mb-2">Clientes en el grupo ({{ totalMiembros }})</div>
          <v-data-table-server
            :headers="modalMiembros.grupo?.TIPO === 'CONDICION' ? headersMiembrosCondicion : headersMiembros"
            :items="miembros" :items-length="totalMiembros" :loading="cargandoMiembros"
            v-model:items-per-page="itemsPerPageMiembros" @update:options="cargarPaginaMiembros" density="compact">
            <template v-slot:item.cliente_concat="{ item }">
              <span class="font-weight-medium">{{ item.CODCLIENTE }}</span>
              <span class="text-grey ml-1">— {{ item.NOMBRECLIENTE }}</span>
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" @click="quitarMiembro(item.CODCLIENTE)" />
            </template>
          </v-data-table-server>
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="modalMiembros.mostrar = false">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;
const tab = ref('clientes');
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

// ---------- CLIENTES ----------
const busquedaCliente = ref('');
const clientes = ref<any[]>([]);
const totalClientes = ref(0);
const cargandoClientes = ref(false);
const itemsPerPageClientes = ref(10);
const paginaClientes = ref(1);
const guardandoId = ref<number | null>(null);
const headersClientes = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
  { title: 'Teléfono', key: 'TELF' },
  { title: 'Descuento Global', key: 'DESCUENTO', sortable: false },
];

const cargarClientes = async () => {
  cargandoClientes.value = true;
  try {
    const res = await axios.get(`${API}/clientes/paginado`, { params: { search: busquedaCliente.value, page: paginaClientes.value, limit: itemsPerPageClientes.value } });
    if (res.data.success) { clientes.value = res.data.data; totalClientes.value = res.data.total; }
  } finally { cargandoClientes.value = false; }
};
const cargarPaginaClientes = (opt: any) => { paginaClientes.value = opt.page; itemsPerPageClientes.value = opt.itemsPerPage; cargarClientes(); };

const guardarDescuento = async (item: any) => {
  guardandoId.value = item.CODCLIENTE;
  try {
    await axios.patch(`${API}/clientes/${item.CODCLIENTE}/descuento`, { descuento: Number(item.DESCUENTO) || 0 });
    lanzarAviso('Descuento actualizado');
  } catch { lanzarAviso('Error al actualizar descuento', 'error'); }
  finally { guardandoId.value = null; }
};

// ---------- GRUPOS DE CLIENTES ----------
const busquedaGrupo = ref('');
const grupos = ref<any[]>([]);
const totalGrupos = ref(0);
const cargandoGrupos = ref(false);
const itemsPerPageGrupos = ref(10);
const paginaGrupos = ref(1);
const headersGrupos = [
  { title: 'ID', key: 'ID' },
  { title: 'Nombre', key: 'NOMBRE' },
  { title: 'Tipo', key: 'TIPO', sortable: false },
  { title: 'Clientes', key: 'TOTALCLIENTES' },
  { title: '', key: 'acciones', sortable: false },
];
const camposClientes = ref<any[]>([]);
const cargarCamposDisponibles = async () => {
  const res = await axios.get(`${API}/promociones/campos-disponibles`);
  if (res.data.success) camposClientes.value = res.data.data.clientes;
};
const operadoresPara = (codigoCampo: string) => {
  const def = camposClientes.value.find((c: any) => c.codigo === codigoCampo);
  if (!def) return ['=', '<>', 'CONTIENE'];
  return def.tipo === 'numero' ? ['=', '<>', '>', '<', '>=', '<='] : ['=', '<>', 'CONTIENE'];
};

const modalGrupo = ref<any>({ mostrar: false, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] });
const guardandoGrupo = ref(false);

const abrirNuevoGrupo = () => {
  modalGrupo.value = { mostrar: true, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] };
};
const abrirEditarGrupo = async (item: any) => {
  modalGrupo.value = { mostrar: true, id: item.ID, nombre: item.NOMBRE, tipo: item.TIPO || 'MANUAL', condiciones: [] };
  if (item.TIPO === 'CONDICION') {
    const res = await axios.get(`${API}/promociones/grupos-clientes/${item.ID}/condiciones`);
    if (res.data.success) modalGrupo.value.condiciones = res.data.data.map((c: any) => ({ campo: c.campo, operador: c.operador, valor: c.valor }));
  }
};
const guardarGrupo = async () => {
  if (!modalGrupo.value.nombre) { lanzarAviso('Ingresa un nombre', 'warning'); return; }
  guardandoGrupo.value = true;
  try {
    const payload = { nombre: modalGrupo.value.nombre, tipo: modalGrupo.value.tipo, condiciones: modalGrupo.value.condiciones };
    if (modalGrupo.value.id) await axios.put(`${API}/promociones/grupos-clientes/${modalGrupo.value.id}`, { ...payload, activo: true });
    else await axios.post(`${API}/promociones/grupos-clientes`, payload);
    lanzarAviso('Grupo guardado');
    modalGrupo.value.mostrar = false;
    cargarGrupos();
  } catch (e: any) { lanzarAviso(e.response?.data?.message || 'Error al guardar grupo', 'error'); }
  finally { guardandoGrupo.value = false; }
};

const cargarGrupos = async () => {
  cargandoGrupos.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-clientes`, { params: { search: busquedaGrupo.value, page: paginaGrupos.value, limit: itemsPerPageGrupos.value } });
    if (res.data.success) { grupos.value = res.data.data; totalGrupos.value = res.data.total; }
  } finally { cargandoGrupos.value = false; }
};
const cargarPaginaGrupos = (opt: any) => { paginaGrupos.value = opt.page; itemsPerPageGrupos.value = opt.itemsPerPage; cargarGrupos(); };

// ---------- MIEMBROS DEL GRUPO ----------
const modalMiembros = ref<any>({ mostrar: false, grupo: null });
const miembros = ref<any[]>([]);
const totalMiembros = ref(0);
const cargandoMiembros = ref(false);
const itemsPerPageMiembros = ref(10);
const importandoExcel = ref(false);
const resultadoImport = ref('');

const importarExcel = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !modalMiembros.value.grupo) return;
  importandoExcel.value = true;
  resultadoImport.value = '';
  try {
    const fd = new FormData();
    fd.append('archivo', file);
    const res = await axios.post(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/importar-excel`, fd);
    const d = res.data;
    resultadoImport.value = `✓ ${d.insertados} nuevos` + (d.noEncontrados.length ? ` · ${d.noEncontrados.length} no encontrados` : '') + (d.yaEnGrupo.length ? ` · ${d.yaEnGrupo.length} ya estaban` : '');
    cargarPaginaMiembros({ page: 1, itemsPerPage: itemsPerPageMiembros.value });
  } catch (err: any) {
    lanzarAviso(err.response?.data?.message || 'Error al importar', 'error');
  } finally {
    importandoExcel.value = false;
    (e.target as HTMLInputElement).value = '';
  }
};
const paginaMiembros = ref(1);
const headersMiembros = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
  { title: '', key: 'acciones', sortable: false },
];
const headersMiembrosCondicion = [
  { title: 'Cliente', key: 'cliente_concat', sortable: false },
  { title: 'CIF', key: 'CIF' },
];
const busquedaClienteAgregar = ref('');
const resultadosCliente = ref<any[]>([]);

const abrirMiembros = (grupo: any) => {
  modalMiembros.value = { mostrar: true, grupo };
  paginaMiembros.value = 1;
  resultadosCliente.value = [];
  busquedaClienteAgregar.value = '';
  resultadoImport.value = '';
  cargarMiembros();
};
const cargarMiembros = async () => {
  if (!modalMiembros.value.grupo) return;
  cargandoMiembros.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes`, { params: { page: paginaMiembros.value, limit: itemsPerPageMiembros.value } });
    if (res.data.success) { miembros.value = res.data.data; totalMiembros.value = res.data.total; }
  } finally { cargandoMiembros.value = false; }
};
const cargarPaginaMiembros = (opt: any) => { paginaMiembros.value = opt.page; itemsPerPageMiembros.value = opt.itemsPerPage; cargarMiembros(); };

const buscarClientesParaAgregar = async () => {
  if (!busquedaClienteAgregar.value) { resultadosCliente.value = []; return; }
  const res = await axios.get(`${API}/clientes`, { params: { cif: busquedaClienteAgregar.value } });
  if (res.data.success) resultadosCliente.value = res.data.clientes;
};

const agregarMiembro = async (codCliente: number) => {
  try {
    await axios.post(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes`, { codCliente });
    lanzarAviso('Cliente agregado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al agregar cliente', 'error'); }
};
const quitarMiembro = async (codCliente: number) => {
  try {
    await axios.delete(`${API}/promociones/grupos-clientes/${modalMiembros.value.grupo.ID}/clientes/${codCliente}`);
    lanzarAviso('Cliente quitado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al quitar cliente', 'error'); }
};

onMounted(() => {
  cargarClientes();
  cargarGrupos();
  cargarCamposDisponibles();
});
</script>
