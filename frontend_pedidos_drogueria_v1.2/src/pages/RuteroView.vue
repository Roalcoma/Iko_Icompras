<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <div class="d-flex align-center mb-6">
      <v-icon size="36" color="primary" class="mr-3">mdi-truck-delivery</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black text-on-surface">Rutero de Entrega</h1>
        <p class="text-body-2 text-grey-darken-1 mb-0">Gestión de rutas y confirmación de entregas</p>
      </div>
    </div>

    <!-- Filtro zona -->
    <v-card rounded="xl" elevation="2" class="mb-4 pa-4">
      <v-row density="comfortable" align="center">
        <v-col cols="12" sm="5">
          <v-autocomplete
            v-model="zonaSeleccionada"
            :items="zonas"
            item-title="display"
            item-value="zona"
            label="Zona / Ruta"
            prepend-inner-icon="mdi-map-marker"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            return-object
            @keyup.enter="buscar"
          />
        </v-col>
        <v-col cols="auto">
          <v-btn icon="mdi-format-list-bulleted" variant="tonal" color="primary" title="Ver todas las zonas" @click="modalZonas = true" />
        </v-col>
        <v-col cols="auto">
          <v-btn color="primary" :loading="cargando" prepend-icon="mdi-magnify" @click="buscar">Buscar</v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Modal zonas -->
    <v-dialog v-model="modalZonas" max-width="420" scrollable>
      <v-card rounded="xl">
        <v-card-title class="d-flex align-center pa-4">
          <v-icon start color="primary">mdi-map-marker-multiple</v-icon>
          Zonas disponibles
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-2" style="max-height:420px">
          <v-list density="compact" lines="one">
            <v-list-item
              v-for="z in zonas"
              :key="z.zona"
              :title="z.display"
              prepend-icon="mdi-map-marker"
              rounded="lg"
              class="mb-1"
              @click="() => { zonaSeleccionada = z; modalZonas = false; buscar(); }"
            />
            <v-list-item v-if="!zonas.length" title="No hay zonas disponibles" disabled />
          </v-list>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <v-spacer /><v-btn variant="text" @click="modalZonas = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Tabs -->
    <v-card rounded="xl" elevation="2">
      <v-tabs v-model="tab" color="primary" class="border-b">
        <v-tab value="oficina"><v-icon start>mdi-office-building</v-icon>Oficina</v-tab>
        <v-tab value="ruteros" @click="cargarRuteros">
          <v-icon start>mdi-clipboard-list</v-icon>
          Ruteros Activos
          <v-badge v-if="ruteros.length" :content="ruteros.length" color="primary" inline class="ml-2" />
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="tab">

        <!-- TAB OFICINA -->
        <v-tabs-window-item value="oficina">
          <div v-if="facturas.length" class="pa-3 d-flex align-center gap-3 flex-wrap">
            <v-btn
              size="small" variant="tonal"
              :color="todasSeleccionadas ? 'grey' : 'primary'"
              :prepend-icon="todasSeleccionadas ? 'mdi-checkbox-multiple-blank-outline' : 'mdi-checkbox-multiple-marked'"
              @click="toggleTodas"
            >{{ todasSeleccionadas ? 'Deseleccionar todas' : 'Seleccionar todas' }}</v-btn>
            <span class="text-caption text-grey-darken-1">{{ seleccionadas.size }} de {{ facturas.length }} seleccionadas</span>
            <v-spacer />
            <v-btn
              color="success" variant="elevated"
              prepend-icon="mdi-clipboard-check-outline"
              :disabled="!seleccionadas.size"
              :loading="creando"
              @click="crearRutero"
            >
              Crear Rutero y PDF ({{ seleccionadas.size }})
            </v-btn>
          </div>
          <v-data-table
            :headers="headersOficina"
            :items="facturas"
            density="compact"
            :loading="cargando"
            no-data-text="Busca una zona para ver las facturas pendientes"
            class="rounded-b-xl"
          >
            <template #item.sel="{ item }">
              <v-checkbox-btn
                :model-value="seleccionadas.has(clave(item))"
                color="primary"
                @update:model-value="toggleSel(item)"
              />
            </template>
            <template #item.TOTAL="{ item }">
              <span class="font-weight-bold">${{ Number(item.TOTAL).toFixed(2) }}</span>
            </template>
            <template #item.BULTOS="{ item }">
              <v-chip size="x-small" color="blue-darken-1" variant="tonal">{{ item.BULTOS ?? 0 }}</v-chip>
            </template>
          </v-data-table>
        </v-tabs-window-item>

        <!-- TAB RUTEROS ACTIVOS -->
        <v-tabs-window-item value="ruteros">
          <div class="pa-4">
            <div v-if="cargandoRuteros" class="text-center pa-8">
              <v-progress-circular indeterminate color="primary" />
            </div>
            <div v-else-if="!ruteros.length" class="text-center pa-8 text-grey-darken-1">
              <v-icon size="48" class="mb-2">mdi-clipboard-check-outline</v-icon>
              <div>No hay ruteros activos</div>
            </div>
            <v-expansion-panels v-else variant="accordion">
              <v-expansion-panel
                v-for="r in ruteros"
                :key="r.ID"
                @group:selected="(ev) => { if (ev.value) cargarFacturasRutero(r.ID); }"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center gap-3 w-100 flex-wrap">
                    <v-chip color="primary" size="small" variant="tonal" class="font-weight-bold">{{ r.NUMERO }}</v-chip>
                    <span class="font-weight-medium">{{ r.CODRUTA }} - {{ r.NOMBRE_RUTA }}</span>
                    <v-spacer />
                    <v-chip
                      size="x-small"
                      :color="r.ENTREGADAS >= r.TOTAL_FACTURAS ? 'success' : 'warning'"
                      variant="tonal"
                    >
                      {{ r.ENTREGADAS }}/{{ r.TOTAL_FACTURAS }} entregadas
                    </v-chip>
                    <span class="text-caption text-grey-darken-1">{{ r.FECHA }}</span>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="d-flex justify-space-between align-center mb-3">
                    <v-btn
                      size="small" variant="tonal" color="primary"
                      prepend-icon="mdi-file-pdf-box"
                      @click.stop="imprimirRutero(r)"
                    >Reimprimir PDF</v-btn>
                    <v-btn
                      size="small" color="success" variant="elevated"
                      prepend-icon="mdi-check-all"
                      :loading="confirmandoRutero === r.ID"
                      :disabled="r.ENTREGADAS >= r.TOTAL_FACTURAS"
                      @click.stop="confirmarRuteroCompleto(r.ID)"
                    >
                      Confirmar todo
                    </v-btn>
                  </div>

                  <div v-if="!facturasRutero[r.ID]" class="text-center pa-4">
                    <v-progress-circular indeterminate size="24" color="primary" />
                  </div>
                  <v-data-table
                    v-else
                    :headers="headersRutero"
                    :items="facturasRutero[r.ID]"
                    density="compact"
                    hide-default-footer
                    :items-per-page="-1"
                  >
                    <template #item.estado="{ item }">
                      <v-icon :color="item.FECHARECIBIDO ? 'success' : 'grey-lighten-1'">
                        {{ item.FECHARECIBIDO ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                      </v-icon>
                    </template>
                    <template #item.BULTOS="{ item }">
                      <v-chip size="x-small" color="blue-darken-1" variant="tonal">{{ item.BULTOS ?? 0 }}</v-chip>
                    </template>
                    <template #item.TOTAL="{ item }">
                      <span>${{ Number(item.TOTAL).toFixed(2) }}</span>
                    </template>
                    <template #item.actions="{ item }">
                      <v-btn
                        v-if="!item.FECHARECIBIDO"
                        size="x-small" color="success" variant="tonal"
                        icon="mdi-check"
                        :loading="confirmandoFactura === clave(item)"
                        @click.stop="confirmarFactura(r.ID, item)"
                      />
                      <v-icon v-else color="success" size="small">mdi-check-circle</v-icon>
                    </template>
                  </v-data-table>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-tabs-window-item>

      </v-tabs-window>
    </v-card>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" rounded="pill" timeout="4000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '../assets/drogueria_logo.png';

const API = import.meta.env.VITE_API_URL;

const tab              = ref('oficina');
const zonaSeleccionada = ref<{ zona: string; display: string } | null>(null);
const zonas            = ref<{ zona: string; display: string }[]>([]);
const modalZonas       = ref(false);
const facturas         = ref<any[]>([]);
const cargando         = ref(false);
const creando          = ref(false);
const seleccionadas    = ref<Set<string>>(new Set());
const snackbar         = ref({ show: false, text: '', color: '' });

// Ruteros activos
const ruteros           = ref<any[]>([]);
const cargandoRuteros   = ref(false);
const facturasRutero    = reactive<Record<number, any[]>>({});
const confirmandoRutero = ref<number | null>(null);
const confirmandoFactura = ref<string | null>(null);

const todasSeleccionadas = computed(() =>
  facturas.value.length > 0 && facturas.value.every(f => seleccionadas.value.has(clave(f)))
);

const headersOficina = [
  { title: '',        key: 'sel',           sortable: false, width: '48px' },
  { title: 'Factura', key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente', key: 'CLIENTE' },
  { title: 'Ruta',    key: 'NOMBRE_RUTA' },
  { title: 'Bultos',  key: 'BULTOS',  align: 'center' as const },
  { title: 'Total',   key: 'TOTAL',   align: 'end'    as const },
];

const headersRutero = [
  { title: '',        key: 'estado',        sortable: false, width: '48px' },
  { title: 'Factura', key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente', key: 'CLIENTE' },
  { title: 'Bultos',  key: 'BULTOS',  align: 'center' as const },
  { title: 'Total',   key: 'TOTAL',   align: 'end'    as const },
  { title: '',        key: 'actions', sortable: false, width: '56px' },
];

const clave = (f: any) => `${f.NUMSERIE}-${f.NUMFACTURA}`;
const notify = (text: string, color: string) => snackbar.value = { show: true, text, color };

const toggleSel = (item: any) => {
  const s = new Set(seleccionadas.value);
  const k = clave(item);
  if (s.has(k)) s.delete(k); else s.add(k);
  seleccionadas.value = s;
};

const toggleTodas = () => {
  if (todasSeleccionadas.value) {
    seleccionadas.value = new Set();
  } else {
    seleccionadas.value = new Set(facturas.value.map(clave));
  }
};

onMounted(async () => {
  try {
    const res = await axios.get(`${API}/rutero/zonas`);
    zonas.value = res.data.data ?? [];
  } catch { /* silencioso */ }
});

const buscar = async () => {
  const zona = (zonaSeleccionada.value?.zona ?? '').trim();
  if (!zona) { notify('Ingresa una zona', 'warning'); return; }
  cargando.value = true;
  seleccionadas.value = new Set();
  try {
    const res = await axios.get(`${API}/rutero/facturas`, { params: { zona } });
    facturas.value = res.data.data ?? [];
    seleccionadas.value = new Set(facturas.value.map(clave));
    if (!facturas.value.length) notify('No hay facturas pendientes para esa zona', 'info');
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error desconocido', 'error');
  } finally {
    cargando.value = false;
  }
};

const crearRutero = async () => {
  if (!seleccionadas.value.size) return;
  const zona = zonaSeleccionada.value;
  if (!zona) return;

  const lista = facturas.value.filter(f => seleccionadas.value.has(clave(f)));
  creando.value = true;
  try {
    const res = await axios.post(`${API}/rutero/crear`, {
      codruta:   parseInt(zona.zona),
      nombreRuta: zona.display,
      facturas:  lista.map(f => ({ numserie: f.NUMSERIE, numfactura: f.NUMFACTURA })),
    });
    const { id, numero } = res.data.data;
    notify(`Rutero ${numero} creado`, 'success');
    generarPDF(numero, zona.display, lista);
    // Refresh: las facturas asignadas ya no aparecen
    await buscar();
    // Recargar la lista de ruteros activos
    await cargarRuteros();
    // Cargar el detalle del rutero recién creado
    await cargarFacturasRutero(id);
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al crear rutero', 'error');
  } finally {
    creando.value = false;
  }
};

const cargarRuteros = async () => {
  cargandoRuteros.value = true;
  try {
    const codruta = zonaSeleccionada.value?.zona ? parseInt(zonaSeleccionada.value.zona) : undefined;
    const params = codruta ? { codruta } : {};
    const res = await axios.get(`${API}/rutero/ruteros`, { params });
    ruteros.value = res.data.data ?? [];
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al cargar ruteros', 'error');
  } finally {
    cargandoRuteros.value = false;
  }
};

const cargarFacturasRutero = async (idrutero: number) => {
  if (facturasRutero[idrutero]) return; // ya cargado
  try {
    const res = await axios.get(`${API}/rutero/ruteros/${idrutero}/facturas`);
    facturasRutero[idrutero] = res.data.data ?? [];
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al cargar facturas', 'error');
  }
};

const confirmarFactura = async (idrutero: number, item: any) => {
  const k = clave(item);
  confirmandoFactura.value = k;
  try {
    await axios.put(`${API}/rutero/confirmar-factura`, {
      idrutero,
      numserie:   item.NUMSERIE,
      numfactura: item.NUMFACTURA,
    });
    // Update local state
    item.FECHARECIBIDO = new Date().toISOString();
    const r = ruteros.value.find(x => x.ID === idrutero);
    if (r) r.ENTREGADAS = (r.ENTREGADAS || 0) + 1;
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al confirmar', 'error');
  } finally {
    confirmandoFactura.value = null;
  }
};

const confirmarRuteroCompleto = async (id: number) => {
  confirmandoRutero.value = id;
  try {
    await axios.put(`${API}/rutero/ruteros/${id}/confirmar`);
    notify('Rutero marcado como entregado', 'success');
    // Remove from list
    ruteros.value = ruteros.value.filter(r => r.ID !== id);
    delete facturasRutero[id];
  } catch (e: any) {
    notify(e.response?.data?.error || e.message || 'Error al confirmar rutero', 'error');
  } finally {
    confirmandoRutero.value = null;
  }
};

const imprimirRutero = async (r: any) => {
  let lista = facturasRutero[r.ID];
  if (!lista) {
    try {
      const res = await axios.get(`${API}/rutero/ruteros/${r.ID}/facturas`);
      lista = res.data.data ?? [];
      facturasRutero[r.ID] = lista;
    } catch { notify('No se pudo cargar las facturas', 'error'); return; }
  }
  generarPDF(r.NUMERO, `${r.CODRUTA} - ${r.NOMBRE_RUTA}`, lista);
};

// ─── PDF ──────────────────────────────────────────────────────────────────────
const generarPDF = (numero: string, zonaDisplay: string, lista: any[]) => {
  const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const logo  = new Image();
  logo.src    = logoUrl;

  const build = () => {
    const addHeader = (pageNum: number, totalPages: number) => {
      try { doc.addImage(logo, 'PNG', 10, 6, 28, 13); } catch { /* sin logo */ }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(31, 78, 121);
      doc.text('DROGUERIA INTERCONTINENTAL, C.A.', 105, 11, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('RIF: J-501590192', 105, 15.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(31, 78, 121);
      doc.text('REPARTO A CLIENTE', 105, 20, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(50, 50, 50);
      const infoLine = `Nro: ${numero}    Ruta: ${zonaDisplay}    Fecha: ${fecha}    Pág. ${pageNum} de ${totalPages}`;
      doc.text(infoLine, 105, 24.5, { align: 'center' });

      doc.setDrawColor(31, 78, 121);
      doc.setLineWidth(0.5);
      doc.line(10, 27, 205, 27);
    };

    // ── Agrupa por cliente ──────────────────────────────────────────────────
    const grouped = new Map<string, { cod: string; nombre: string; items: any[] }>();
    for (const f of lista) {
      const key = `${f.CODCLIENTE}`;
      if (!grouped.has(key)) grouped.set(key, { cod: f.CODCLIENTE ?? '', nombre: f.CLIENTE ?? '', items: [] });
      grouped.get(key)!.items.push(f);
    }

    const body: any[] = [];
    let totalDocs   = 0;
    let totalBultos = 0;
    const totalClientes = grouped.size;

    for (const { cod, nombre, items } of grouped.values()) {
      const subtotalBultos = items.reduce((s, f) => s + (Number(f.BULTOS) || 0), 0);
      totalDocs   += items.length;
      totalBultos += subtotalBultos;

      // Fila cabecera de cliente
      body.push([
        { content: `(${cod}) ${nombre}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [208, 228, 248] } },
        { content: `BULTOS: ${subtotalBultos}`, styles: { fontStyle: 'bold', halign: 'right', fillColor: [208, 228, 248] } },
      ]);

      // Filas de facturas
      for (const f of items) {
        const facturaText = f.FACTURA_VISUAL ?? `${f.NUMSERIE}-${f.NUMFACTURA}`;
        const pedidoText  = f.PEDIDO ? `Ped: ${f.PEDIDO}` : '';
        body.push([
          { content: pedidoText ? `${facturaText}\n${pedidoText}` : facturaText, styles: { fontSize: 7 } },
          { content: String(f.BULTOS ?? 0), styles: { halign: 'center' } },
          { content: '1', styles: { halign: 'center' } },
          { content: '0', styles: { halign: 'center' } },
          '',
        ]);
      }
    }

    // Fila totales
    body.push([
      {
        content: `Recibí Conforme: _______________________     Nro. Documentos: ${totalDocs}     Nro. Renglones: ${totalClientes}     Cant. Bultos/Cestas: ${totalBultos}     Encomiendas: 0`,
        colSpan: 5,
        styles: { fontStyle: 'bold', fontSize: 7.5, halign: 'left', fillColor: [240, 240, 240] },
      },
    ]);

    autoTable(doc, {
      startY: 29,
      head: [['FACTURA', 'B/C', 'DOCS.', 'CESTAS', 'FIRMA / RECIBIDO']],
      body,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, valign: 'middle' },
      headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 99.9, minCellHeight: 8 },
      },
      rowPageBreak: 'avoid',
      didDrawPage: (data) => {
        const pageNum   = (doc as any).internal.getCurrentPageInfo().pageNumber;
        const totalPgs  = (doc as any).internal.getNumberOfPages();
        addHeader(pageNum, totalPgs);
      },
    });

    // Corregir cabeceras en páginas ya generadas
    const totalPgs = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPgs; p++) {
      doc.setPage(p);
      addHeader(p, totalPgs);
    }

    doc.save(`${numero}_${zonaDisplay.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    notify(`PDF ${numero} generado`, 'success');
  };

  if (logo.complete && logo.naturalWidth > 0) {
    build();
  } else {
    logo.onload  = build;
    logo.onerror = build;
  }
};
</script>
