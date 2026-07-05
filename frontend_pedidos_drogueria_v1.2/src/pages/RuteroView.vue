<template>
  <v-container fluid class="pa-6 bg-background h-100">

    <div class="d-flex align-center mb-6">
      <v-icon size="36" color="primary" class="mr-3">mdi-truck-delivery</v-icon>
      <div>
        <h1 class="text-h5 font-weight-black text-on-surface">Rutero de Entrega</h1>
        <p class="text-body-2 text-grey-darken-1 mb-0">Facturas pendientes de entrega por zona</p>
      </div>
    </div>

    <!-- Filtro zona -->
    <v-card rounded="xl" elevation="2" class="mb-4 pa-4">
      <v-row dense align="center">
        <v-col cols="12" sm="5">
          <v-autocomplete
            v-model="zonaSeleccionada"
            :items="zonas"
            item-title="display"
            item-value="zona"
            label="Zona"
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
        <v-spacer />
        <v-col cols="auto">
          <v-btn color="success" variant="tonal" prepend-icon="mdi-file-pdf-box" :disabled="!facturas.length" @click="generarPDF">Generar PDF</v-btn>
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
          <v-spacer />
          <v-btn variant="text" @click="modalZonas = false">Cerrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Tabs -->
    <v-card rounded="xl" elevation="2">
      <v-tabs v-model="tab" color="primary" class="border-b">
        <v-tab value="oficina"><v-icon start>mdi-office-building</v-icon>Oficina</v-tab>
        <v-tab value="transporte"><v-icon start>mdi-truck</v-icon>Transportista</v-tab>
      </v-tabs>

      <v-tabs-window v-model="tab">

        <!-- TAB OFICINA -->
        <v-tabs-window-item value="oficina">
          <v-data-table
            :headers="headersOficina"
            :items="facturas"
            density="compact"
            :loading="cargando"
            no-data-text="Busca una zona para ver las facturas pendientes"
            class="rounded-b-xl"
          >
            <template #item.TOTAL="{ item }">
              <span class="font-weight-bold">${{ Number(item.TOTAL).toFixed(2) }}</span>
            </template>
          </v-data-table>
        </v-tabs-window-item>

        <!-- TAB TRANSPORTISTA -->
        <v-tabs-window-item value="transporte">
          <div class="pa-3 d-flex justify-end">
            <v-btn color="success" :loading="guardando" :disabled="!marcados.size" prepend-icon="mdi-check-all" @click="confirmarEntregas">
              Confirmar Entregas ({{ marcados.size }})
            </v-btn>
          </div>
          <v-data-table
            :headers="headersTransporte"
            :items="facturas"
            density="compact"
            :loading="cargando"
            no-data-text="Busca una zona para ver las facturas"
            class="rounded-b-xl"
            @click:row="toggleMarcado"
          >
            <template #item.estado="{ item }">
              <v-icon :color="marcados.has(claveFactura(item)) ? 'success' : 'grey-lighten-1'">
                {{ marcados.has(claveFactura(item)) ? 'mdi-check-circle' : 'mdi-circle-outline' }}
              </v-icon>
            </template>
            <template #item.TOTAL="{ item }">
              <span>${{ Number(item.TOTAL).toFixed(2) }}</span>
            </template>
          </v-data-table>
        </v-tabs-window-item>

      </v-tabs-window>
    </v-card>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" rounded="pill">{{ snackbar.text }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API = import.meta.env.VITE_API_URL;

const tab              = ref('oficina');
const zonaSeleccionada = ref<{ zona: string; display: string } | null>(null);
const zonas            = ref<{ zona: string; display: string }[]>([]);
const modalZonas       = ref(false);
const facturas         = ref<any[]>([]);
const cargando         = ref(false);
const guardando        = ref(false);
const marcados         = ref<Set<string>>(new Set());
const snackbar         = ref({ show: false, text: '', color: '' });

const headersOficina = [
  { title: 'Factura',    key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente',    key: 'CLIENTE' },
  { title: 'Dirección',  key: 'DIRECCION', sortable: false },
  { title: 'Ruta',       key: 'NOMBRE_RUTA' },
  { title: 'Zona',       key: 'ZONA' },
  { title: 'Bultos',     key: 'BULTOS', align: 'center' as const },
  { title: 'Total',      key: 'TOTAL', align: 'end' as const },
];

const headersTransporte = [
  { title: '',           key: 'estado',        sortable: false, width: '48px' },
  { title: 'Factura',    key: 'FACTURA_VISUAL', sortable: false },
  { title: 'Cliente',    key: 'CLIENTE' },
  { title: 'Bultos',     key: 'BULTOS', align: 'center' as const },
  { title: 'Total',      key: 'TOTAL', align: 'end' as const },
];

const claveFactura = (f: any) => `${f.NUMSERIE}-${f.NUMFACTURA}-${f.N}`;

const notify = (text: string, color: string) => snackbar.value = { show: true, text, color };

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
  marcados.value = new Set();
  try {
    const res = await axios.get(`${API}/rutero/facturas`, { params: { zona } });
    facturas.value = res.data.data ?? [];
    if (!facturas.value.length) notify('No hay facturas pendientes para esa zona', 'info');
  } catch (e: any) {
    notify(e.response?.data?.message || 'Error al buscar facturas', 'error');
  } finally {
    cargando.value = false;
  }
};

const toggleMarcado = (_e: any, { item }: any) => {
  const clave = claveFactura(item);
  const set = new Set(marcados.value);
  if (set.has(clave)) set.delete(clave); else set.add(clave);
  marcados.value = set;
};

const confirmarEntregas = async () => {
  if (!marcados.value.size) return;
  guardando.value = true;
  let exitosas = 0;
  for (const clave of marcados.value) {
    const [numserie, numfactura, n] = clave.split('-');
    try {
      await axios.put(`${API}/rutero/marcar-entregado`, { numserie, numfactura: Number(numfactura), n: Number(n) });
      exitosas++;
    } catch { /* continúa con las demás */ }
  }
  guardando.value = false;
  notify(`${exitosas} factura(s) marcadas como entregadas`, 'success');
  buscar();
};

const generarPDF = () => {
  if (!facturas.value.length) return;
  const zona = (zonaSeleccionada.value?.display ?? zonaSeleccionada.value?.zona ?? '').toUpperCase();
  const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  // --- Encabezado ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('DROGUERIA INTERCONTINENTAL, C.A.', 105, 15, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`RUTERO DE ENTREGA — ZONA: ${zona}`, 105, 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha: ${fecha}  ${hora}`, 105, 27, { align: 'center' });

  // --- Agrupar por cliente ---
  const grouped: Record<string, any[]> = {};
  for (const f of facturas.value) {
    const key = `${f.CLIENTE}||${f.DIRECCION}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  }

  const rows: any[] = [];
  let totalBultos = 0;

  for (const key of Object.keys(grouped)) {
    const grupo = grouped[key];
    const [cliente, direccion] = key.split('||');
    const ruta = grupo[0]?.NOMBRE_RUTA || '';
    const factsList = grupo.map(f => f.FACTURA_VISUAL).join('\n');
    const bultos = grupo.reduce((s, f) => s + Number(f.BULTOS || 1), 0);
    totalBultos += bultos;
    const clienteTexto = ruta ? `${cliente}\n${direccion}\nRuta: ${ruta}` : `${cliente}\n${direccion}`;
    rows.push([clienteTexto, factsList, String(bultos), '']);
  }

  rows.push([{ content: 'TOTALES', styles: { fontStyle: 'bold' } }, '', { content: String(totalBultos), styles: { fontStyle: 'bold' } }, '']);

  autoTable(doc, {
    startY: 32,
    head: [['CLIENTE / DIRECCIÓN', 'FACTURAS', 'BULT', 'RECIBIDO / FIRMA']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, valign: 'top' },
    headStyles: { fillColor: [31, 78, 121], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 45 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 50 },
    },
    rowPageBreak: 'avoid',
  });

  doc.save(`Rutero_${zona}_${fecha.replace(/\//g, '-')}.pdf`);
  notify('PDF generado', 'success');
};
</script>
