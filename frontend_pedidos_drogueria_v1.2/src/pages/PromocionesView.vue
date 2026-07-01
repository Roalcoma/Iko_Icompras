<template>
  <v-container fluid class="pa-6 bg-background h-100">
    <div class="d-flex align-center mb-6">
      <v-icon color="primary" size="32" class="mr-3">mdi-sale</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black" style="color: #164E63;">Promociones</h1>
        <span class="text-caption text-medium-emphasis">Grupos de artículos y escalas de descuento</span>
      </div>
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="promos">Promociones</v-tab>
      <v-tab value="grupos">Grupos de Artículos</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ===================== PROMOCIONES ===================== -->
      <v-window-item value="promos">
        <v-card rounded="xl" elevation="2">
          <v-card-title class="pa-4 d-flex align-center">
            <v-text-field v-model="busquedaPromo" label="Buscar promoción" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" hide-details clearable @keyup.enter="cargarPromociones"
              style="max-width: 320px;" class="mr-3" />
            <v-spacer />
            <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNuevaPromo">Nueva Promoción</v-btn>
          </v-card-title>
          <v-divider />
          <v-data-table-server
            :headers="headersPromos" :items="promos" :items-length="totalPromos" :loading="cargandoPromos"
            v-model:items-per-page="itemsPerPagePromos" @update:options="cargarPaginaPromos">
            <template v-slot:item.escalas="{ item }">
              <v-chip v-for="(e, i) in item.escalas" :key="i" size="x-small" color="orange-darken-2" variant="flat" class="mr-1 mb-1">
                {{ e.MINIMO }}{{ e.MAXIMO ? '-' + e.MAXIMO : '+' }} = {{ e.PORCENTAJE }}%
              </v-chip>
            </template>
            <template v-slot:item.ACTIVO="{ item }">
              <v-switch :model-value="!!item.ACTIVO" color="success" density="compact" hide-details
                @update:model-value="(v: any) => toggleActivo(item, v)" />
            </template>
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-pencil" variant="text" size="small" @click="abrirEditarPromo(item)" />
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>

      <!-- ===================== GRUPOS DE ARTICULOS ===================== -->
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
              <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-format-list-bulleted" @click="abrirMiembros(item)">
                Artículos
              </v-btn>
            </template>
          </v-data-table-server>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialog: nuevo/editar grupo -->
    <v-dialog v-model="modalGrupo.mostrar" max-width="600">
      <v-card rounded="xl">
        <v-card-title class="pa-4">{{ modalGrupo.id ? 'Editar' : 'Nuevo' }} Grupo de Artículos</v-card-title>
        <v-card-text>
          <v-text-field v-model="modalGrupo.nombre" label="Nombre del grupo" variant="outlined" density="comfortable" class="mb-3" autofocus />
          <v-btn-toggle v-model="modalGrupo.tipo" color="primary" variant="outlined" divided mandatory class="mb-4">
            <v-btn value="MANUAL">Manual</v-btn>
            <v-btn value="CONDICION">Por condición</v-btn>
          </v-btn-toggle>

          <template v-if="modalGrupo.tipo === 'CONDICION'">
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-subtitle-2 font-weight-bold">Condiciones (todas se combinan con Y)</span>
              <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="agregarCondicion('articulos')">Agregar condición</v-btn>
            </div>
            <v-row v-for="(c, i) in modalGrupo.condiciones" :key="i" dense align="center" class="mb-1">
              <v-col cols="4">
                <v-select v-model="c.campo" :items="camposArticulos" item-title="label" item-value="codigo"
                  label="Campo" variant="outlined" density="compact" hide-details />
              </v-col>
              <v-col cols="3">
                <v-select v-model="c.operador" :items="operadoresPara(c.campo, 'articulos')" label="Operador" variant="outlined" density="compact" hide-details />
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
            <v-text-field v-model="busquedaArticuloAgregar" label="Buscar artículo para agregar" prepend-inner-icon="mdi-magnify"
              variant="outlined" density="compact" class="mb-3" @keyup.enter="buscarArticulosParaAgregar" />
            <v-list v-if="resultadosArticulo.length" border rounded class="mb-4" max-height="200" style="overflow-y:auto;">
              <v-list-item v-for="art in resultadosArticulo" :key="art.CODARTICULO" :title="art.DESCRIPCION" :subtitle="art.REFPROVEEDOR">
                <template v-slot:append>
                  <v-btn size="small" color="success" @click="agregarMiembro(art.CODARTICULO)">Agregar</v-btn>
                </template>
              </v-list-item>
            </v-list>
            <div class="d-flex align-center mb-3 gap-2">
              <v-btn prepend-icon="mdi-microsoft-excel" color="success" variant="tonal" size="small" @click="$refs.excelArticulos.click()" :loading="importandoExcel">
                Importar Excel
              </v-btn>
              <input ref="excelArticulos" type="file" accept=".xlsx,.xls" style="display:none" @change="importarExcel" />
              <span v-if="resultadoImport" class="text-caption">{{ resultadoImport }}</span>
            </div>
            <v-divider class="mb-3" />
          </template>
          <div class="text-subtitle-2 font-weight-bold mb-2">Artículos en el grupo ({{ totalMiembros }})</div>
          <v-data-table-server
            :headers="modalMiembros.grupo?.TIPO === 'CONDICION' ? headersMiembrosCondicion : headersMiembros"
            :items="miembros" :items-length="totalMiembros" :loading="cargandoMiembros"
            v-model:items-per-page="itemsPerPageMiembros" @update:options="cargarPaginaMiembros" density="compact">
            <template v-slot:item.acciones="{ item }">
              <v-btn icon="mdi-delete-outline" color="error" variant="text" size="small" @click="quitarMiembro(item.CODARTICULO)" />
            </template>
          </v-data-table-server>
        </v-card-text>
        <v-card-actions class="pa-4"><v-spacer /><v-btn variant="text" @click="modalMiembros.mostrar = false">Cerrar</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: crear/editar promoción -->
    <v-dialog v-model="modalPromo.mostrar" max-width="700" persistent>
      <v-card rounded="xl">
        <v-card-title class="pa-4 bg-primary text-white">{{ modalPromo.id ? 'Editar' : 'Nueva' }} Promoción</v-card-title>
        <v-card-text class="pa-4">
          <v-text-field v-model="modalPromo.nombre" label="Nombre" variant="outlined" density="comfortable" class="mb-3" />
          <v-select v-model="modalPromo.idGrupoArticulos" :items="todosLosGrupos" item-title="NOMBRE" item-value="ID"
            label="Grupo de artículos" variant="outlined" density="comfortable" class="mb-3" />
          <v-row dense>
            <v-col cols="6">
              <v-select v-model="modalPromo.base" :items="['UNIDADES', 'MONTO']" label="Base de la escala" variant="outlined" density="comfortable" />
            </v-col>
            <v-col cols="6">
              <v-select v-model="modalPromo.alcanceCliente" :items="opcionesAlcance" item-title="texto" item-value="valor"
                label="Alcance de cliente" variant="outlined" density="comfortable" />
            </v-col>
          </v-row>
          <v-select v-if="modalPromo.alcanceCliente !== 'TODOS'" v-model="modalPromo.idGrupoClientes"
            :items="todosLosGruposClientes" item-title="NOMBRE" item-value="ID" label="Grupo de clientes"
            variant="outlined" density="comfortable" class="mb-3" />
          <v-row dense class="mb-3">
            <v-col cols="6"><v-text-field v-model="modalPromo.fechaInicio" type="date" label="Fecha inicio" variant="outlined" density="comfortable" /></v-col>
            <v-col cols="6"><v-text-field v-model="modalPromo.fechaFin" type="date" label="Fecha fin" variant="outlined" density="comfortable" /></v-col>
          </v-row>

          <v-divider class="mb-3" />
          <div class="d-flex align-center justify-space-between mb-2">
            <span class="text-subtitle-2 font-weight-bold">Escalas</span>
            <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-plus" @click="agregarEscala">Agregar tramo</v-btn>
          </div>
          <v-row v-for="(esc, i) in modalPromo.escalas" :key="i" dense align="center" class="mb-1">
            <v-col cols="4"><v-text-field v-model.number="esc.minimo" type="number" label="Mínimo" variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="4"><v-text-field v-model.number="esc.maximo" type="number" label="Máximo (vacío = sin tope)" variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="3"><v-text-field v-model.number="esc.porcentaje" type="number" label="%" variant="outlined" density="compact" hide-details /></v-col>
            <v-col cols="1"><v-btn icon="mdi-close" size="small" variant="text" color="error" @click="modalPromo.escalas.splice(i, 1)" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer /><v-btn variant="text" @click="modalPromo.mostrar = false">Cancelar</v-btn>
          <v-btn color="primary" variant="elevated" :loading="guardandoPromo" @click="guardarPromo">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="aviso.mostrar" :color="aviso.color" timeout="3000">{{ aviso.texto }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { usePromocionesStore } from '../stores/usePromocionesStore';
import { useCarritoStore } from '../stores/useCarritoStore';

const API = import.meta.env.VITE_API_URL;
const promocionesStore = usePromocionesStore();
const carritoStore = useCarritoStore();
const refrescarPromocionesGlobal = () => promocionesStore.cargarVigentes().then(() => carritoStore.recalcularPromociones());
const tab = ref('promos');
const aviso = ref({ mostrar: false, texto: '', color: 'success' });
const lanzarAviso = (texto: string, color = 'success') => aviso.value = { mostrar: true, texto, color };

// ---------- PROMOCIONES ----------
const busquedaPromo = ref('');
const promos = ref<any[]>([]);
const totalPromos = ref(0);
const cargandoPromos = ref(false);
const itemsPerPagePromos = ref(10);
const paginaPromos = ref(1);
const headersPromos = [
  { title: 'Nombre', key: 'NOMBRE' },
  { title: 'Grupo Artículos', key: 'NOMBREGRUPOARTICULOS' },
  { title: 'Base', key: 'BASE' },
  { title: 'Escalas', key: 'escalas', sortable: false },
  { title: 'Activa', key: 'ACTIVO', sortable: false },
  { title: '', key: 'acciones', sortable: false },
];
const opcionesAlcance = [
  { texto: 'Todos los clientes', valor: 'TODOS' },
  { texto: 'Solo grupo (incluir)', valor: 'INCLUIR_GRUPO' },
  { texto: 'Todos menos grupo (excluir)', valor: 'EXCLUIR_GRUPO' },
];

const cargarPromociones = async () => {
  cargandoPromos.value = true;
  try {
    const res = await axios.get(`${API}/promociones`, { params: { search: busquedaPromo.value, page: paginaPromos.value, limit: itemsPerPagePromos.value } });
    if (res.data.success) { promos.value = res.data.data; totalPromos.value = res.data.total; }
  } finally { cargandoPromos.value = false; }
};
const cargarPaginaPromos = (opt: any) => { paginaPromos.value = opt.page; itemsPerPagePromos.value = opt.itemsPerPage; cargarPromociones(); };

const toggleActivo = async (item: any, activo: boolean) => {
  try {
    await axios.patch(`${API}/promociones/${item.ID}/activo`, { activo });
    item.ACTIVO = activo;
    lanzarAviso('Estado actualizado');
    refrescarPromocionesGlobal();
  } catch { lanzarAviso('Error al actualizar estado', 'error'); }
};

const modalPromo = ref<any>({ mostrar: false, id: null, nombre: '', idGrupoArticulos: null, base: 'UNIDADES', alcanceCliente: 'TODOS', idGrupoClientes: null, fechaInicio: '', fechaFin: '', escalas: [] });
const guardandoPromo = ref(false);
const todosLosGrupos = ref<any[]>([]);
const todosLosGruposClientes = ref<any[]>([]);

const cargarSelectsGrupos = async () => {
  const [resArt, resCli] = await Promise.all([
    axios.get(`${API}/promociones/grupos-articulos`, { params: { limit: 200 } }),
    axios.get(`${API}/promociones/grupos-clientes`, { params: { limit: 200 } }),
  ]);
  if (resArt.data.success) todosLosGrupos.value = resArt.data.data;
  if (resCli.data.success) todosLosGruposClientes.value = resCli.data.data;
};

const abrirNuevaPromo = () => {
  modalPromo.value = { mostrar: true, id: null, nombre: '', idGrupoArticulos: null, base: 'UNIDADES', alcanceCliente: 'TODOS', idGrupoClientes: null, fechaInicio: '', fechaFin: '', escalas: [] };
};
const abrirEditarPromo = (item: any) => {
  modalPromo.value = {
    mostrar: true, id: item.ID, nombre: item.NOMBRE, idGrupoArticulos: item.IDGRUPOARTICULOS ?? null,
    base: item.BASE, alcanceCliente: item.ALCANCE_CLIENTE, idGrupoClientes: item.IDGRUPOCLIENTES ?? null,
    fechaInicio: (item.FECHAINICIO || '').slice(0, 10), fechaFin: (item.FECHAFIN || '').slice(0, 10),
    escalas: (item.escalas || []).map((e: any) => ({ minimo: e.MINIMO, maximo: e.MAXIMO, porcentaje: e.PORCENTAJE })),
  };
};
const agregarEscala = () => modalPromo.value.escalas.push({ minimo: 0, maximo: null, porcentaje: 0 });

const guardarPromo = async () => {
  if (!modalPromo.value.nombre || !modalPromo.value.idGrupoArticulos || !modalPromo.value.fechaInicio || !modalPromo.value.fechaFin) {
    lanzarAviso('Completa nombre, grupo de artículos y fechas', 'warning'); return;
  }
  guardandoPromo.value = true;
  try {
    const payload = {
      nombre: modalPromo.value.nombre, idGrupoArticulos: modalPromo.value.idGrupoArticulos, base: modalPromo.value.base,
      alcanceCliente: modalPromo.value.alcanceCliente, idGrupoClientes: modalPromo.value.alcanceCliente === 'TODOS' ? null : modalPromo.value.idGrupoClientes,
      fechaInicio: modalPromo.value.fechaInicio, fechaFin: modalPromo.value.fechaFin, escalas: modalPromo.value.escalas,
    };
    if (modalPromo.value.id) await axios.put(`${API}/promociones/${modalPromo.value.id}`, payload);
    else await axios.post(`${API}/promociones`, payload);
    lanzarAviso('Promoción guardada');
    modalPromo.value.mostrar = false;
    cargarPromociones();
    refrescarPromocionesGlobal();
  } catch { lanzarAviso('Error al guardar la promoción', 'error'); }
  finally { guardandoPromo.value = false; }
};

// ---------- GRUPOS DE ARTICULOS ----------
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
  { title: 'Artículos', key: 'TOTALARTICULOS' },
  { title: '', key: 'acciones', sortable: false },
];
const camposArticulos = ref<any[]>([]);
const camposClientes = ref<any[]>([]);
const cargarCamposDisponibles = async () => {
  const res = await axios.get(`${API}/promociones/campos-disponibles`);
  if (res.data.success) { camposArticulos.value = res.data.data.articulos; camposClientes.value = res.data.data.clientes; }
};
const operadoresPara = (codigoCampo: string, entidad: 'articulos' | 'clientes') => {
  const lista = entidad === 'articulos' ? camposArticulos.value : camposClientes.value;
  const def = lista.find((c: any) => c.codigo === codigoCampo);
  if (!def) return ['=', '<>', 'CONTIENE'];
  return def.tipo === 'numero' ? ['=', '<>', '>', '<', '>=', '<='] : ['=', '<>', 'CONTIENE'];
};

const modalGrupo = ref<any>({ mostrar: false, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] });
const guardandoGrupo = ref(false);
const agregarCondicion = (_entidad: 'articulos' | 'clientes') => modalGrupo.value.condiciones.push({ campo: '', operador: '=', valor: '' });

const abrirNuevoGrupo = () => {
  modalGrupo.value = { mostrar: true, id: null, nombre: '', tipo: 'MANUAL', condiciones: [] };
};
const abrirEditarGrupo = async (item: any) => {
  modalGrupo.value = { mostrar: true, id: item.ID, nombre: item.NOMBRE, tipo: item.TIPO || 'MANUAL', condiciones: [] };
  if (item.TIPO === 'CONDICION') {
    const res = await axios.get(`${API}/promociones/grupos-articulos/${item.ID}/condiciones`);
    if (res.data.success) modalGrupo.value.condiciones = res.data.data.map((c: any) => ({ campo: c.campo, operador: c.operador, valor: c.valor }));
  }
};
const guardarGrupo = async () => {
  if (!modalGrupo.value.nombre) { lanzarAviso('Ingresa un nombre', 'warning'); return; }
  guardandoGrupo.value = true;
  try {
    const payload = { nombre: modalGrupo.value.nombre, tipo: modalGrupo.value.tipo, condiciones: modalGrupo.value.condiciones };
    if (modalGrupo.value.id) await axios.put(`${API}/promociones/grupos-articulos/${modalGrupo.value.id}`, { ...payload, activo: true });
    else await axios.post(`${API}/promociones/grupos-articulos`, payload);
    lanzarAviso('Grupo guardado');
    modalGrupo.value.mostrar = false;
    cargarGrupos();
    cargarSelectsGrupos();
  } catch (e: any) { lanzarAviso(e.response?.data?.message || 'Error al guardar grupo', 'error'); }
  finally { guardandoGrupo.value = false; }
};

const cargarGrupos = async () => {
  cargandoGrupos.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-articulos`, { params: { search: busquedaGrupo.value, page: paginaGrupos.value, limit: itemsPerPageGrupos.value } });
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
const paginaMiembros = ref(1);
const headersMiembros = [
  { title: 'Código', key: 'CODARTICULO' },
  { title: 'Referencia', key: 'REFPROVEEDOR' },
  { title: 'Descripción', key: 'DESCRIPCION' },
  { title: '', key: 'acciones', sortable: false },
];
const headersMiembrosCondicion = [
  { title: 'Código', key: 'CODARTICULO' },
  { title: 'Referencia', key: 'REFPROVEEDOR' },
  { title: 'Descripción', key: 'DESCRIPCION' },
];
const busquedaArticuloAgregar = ref('');
const resultadosArticulo = ref<any[]>([]);
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
    const res = await axios.post(`${API}/promociones/grupos-articulos/${modalMiembros.value.grupo.ID}/importar-excel`, fd);
    const d = res.data;
    resultadoImport.value = `✓ ${d.insertados} nuevos` + (d.noEncontrados.length ? ` · ${d.noEncontrados.length} no encontrados` : '') + (d.yaEnGrupo.length ? ` · ${d.yaEnGrupo.length} ya estaban` : '');
    cargarMiembros();
  } catch (err: any) {
    lanzarAviso(err.response?.data?.message || 'Error al importar', 'error');
  } finally {
    importandoExcel.value = false;
    (e.target as HTMLInputElement).value = '';
  }
};

const abrirMiembros = (grupo: any) => {
  modalMiembros.value = { mostrar: true, grupo };
  paginaMiembros.value = 1;
  resultadosArticulo.value = [];
  busquedaArticuloAgregar.value = '';
  resultadoImport.value = '';
  cargarMiembros();
};
const cargarMiembros = async () => {
  if (!modalMiembros.value.grupo) return;
  cargandoMiembros.value = true;
  try {
    const res = await axios.get(`${API}/promociones/grupos-articulos/${modalMiembros.value.grupo.ID}/articulos`, { params: { page: paginaMiembros.value, limit: itemsPerPageMiembros.value } });
    if (res.data.success) { miembros.value = res.data.data; totalMiembros.value = res.data.total; }
  } finally { cargandoMiembros.value = false; }
};
const cargarPaginaMiembros = (opt: any) => { paginaMiembros.value = opt.page; itemsPerPageMiembros.value = opt.itemsPerPage; cargarMiembros(); };

const buscarArticulosParaAgregar = async () => {
  if (!busquedaArticuloAgregar.value) { resultadosArticulo.value = []; return; }
  const res = await axios.get(`${API}/products/get-products`, { params: { articulo: busquedaArticuloAgregar.value, page: 1, limit: 10 } });
  if (res.data.success) resultadosArticulo.value = res.data.data;
};

const agregarMiembro = async (codArticulo: number) => {
  try {
    await axios.post(`${API}/promociones/grupos-articulos/${modalMiembros.value.grupo.ID}/articulos`, { codArticulo });
    lanzarAviso('Artículo agregado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al agregar artículo', 'error'); }
};
const quitarMiembro = async (codArticulo: number) => {
  try {
    await axios.delete(`${API}/promociones/grupos-articulos/${modalMiembros.value.grupo.ID}/articulos/${codArticulo}`);
    lanzarAviso('Artículo quitado');
    cargarMiembros();
    cargarGrupos();
  } catch { lanzarAviso('Error al quitar artículo', 'error'); }
};

onMounted(() => {
  cargarPromociones();
  cargarGrupos();
  cargarSelectsGrupos();
  cargarCamposDisponibles();
});
</script>
