<template>
  <v-container fluid class="py-6 px-4">
    <div class="d-flex align-center mb-4 ga-3 flex-wrap">
      <span class="text-h6 font-weight-bold">Control de Pedidos</span>
      <v-chip-group v-model="estatusTab" mandatory class="ml-2">
        <v-chip value="PENDIENTE"  filter>Pendientes</v-chip>
        <v-chip value="AUTORIZADO" filter>Autorizados</v-chip>
        <v-chip value="TODOS"      filter>Todos</v-chip>
      </v-chip-group>
      <v-spacer />
      <v-text-field
        v-model="search" density="compact" variant="outlined"
        prepend-inner-icon="mdi-magnify" placeholder="Buscar..."
        hide-details clearable style="max-width:260px"
        @update:model-value="cargar"
      />
    </div>

    <v-data-table
      :headers="headers"
      :items="pedidos"
      :loading="cargando"
      :items-per-page="50"
      item-value="baseOrderId"
      show-expand
      v-model:expanded="expanded"
      @update:expanded="onExpand"
      class="elevation-1"
    >
      <template #item.baseOrderId="{ item }">
        <span class="font-weight-medium font-mono">{{ item.baseOrderId }}</span>
      </template>

      <template #item.estatusGeneral="{ item }">
        <v-chip :color="item.estatusGeneral === 'PENDIENTE' ? 'warning' : 'success'" size="small" variant="tonal">
          {{ item.estatusGeneral }}
        </v-chip>
      </template>

      <template #item.fecha="{ item }">
        {{ item.fecha ? new Date(item.fecha).toLocaleDateString('es-PY') : '—' }}
      </template>

      <template #item.subCount="{ item }">
        <v-chip size="x-small" color="secondary" variant="outlined">{{ item.subPedidos.length }}</v-chip>
      </template>

      <template #item.totalGeneral="{ item }">
        {{ fmt(item.totalGeneral) }}
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex ga-1">
          <v-btn
            v-if="item.estatusGeneral === 'PENDIENTE'"
            color="success" size="small" variant="tonal" icon
            :loading="autorizando === item.baseOrderId"
            @click.stop="confirmarAutorizar(item)"
          >
            <v-icon>mdi-check</v-icon>
            <v-tooltip activator="parent">Autorizar todos</v-tooltip>
          </v-btn>
          <v-btn
            color="error" size="small" variant="tonal" icon
            :loading="eliminando === item.baseOrderId"
            @click.stop="confirmarEliminar(item)"
          >
            <v-icon>mdi-delete-outline</v-icon>
            <v-tooltip activator="parent">Eliminar y reprocesar</v-tooltip>
          </v-btn>
        </div>
      </template>

      <template #expanded-row="{ item }">
        <tr>
          <td :colspan="headers.length + 1" class="pa-0">
            <v-sheet class="px-4 py-3" color="surface-variant">

              <div v-for="sub in item.subPedidos" :key="sub.ORDERID" class="mb-4">
                <!-- Cabecera del sub-pedido -->
                <div class="d-flex align-center ga-2 mb-2">
                  <v-chip size="x-small" :color="sub.ESTATUS === 'PENDIENTE' ? 'warning' : 'success'" variant="tonal">
                    {{ sub.ESTATUS }}
                  </v-chip>
                  <span class="font-weight-medium text-body-2">{{ sub.ORDERID }}</span>
                  <v-chip size="x-small" color="primary" variant="outlined">
                    {{ sub.SUFIJO === 'Normal' ? 'Normal' : sub.SUFIJO }}
                  </v-chip>
                  <span class="text-caption text-medium-emphasis">
                    {{ sub.NLINEAS }} {{ sub.NLINEAS === 1 ? 'línea' : 'líneas' }} · {{ fmt(sub.TOTAL) }}
                  </span>
                </div>

                <!-- Líneas del sub-pedido -->
                <template v-if="lineas[sub.ORDERID]?.length">
                  <v-table density="compact" class="rounded mb-1">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th>Descripción</th>
                        <th>Lote</th>
                        <th class="text-right">Cant.</th>
                        <th class="text-right">P. Bruto</th>
                        <th class="text-right">Dto 1%</th>
                        <th class="text-right">Dto 2%</th>
                        <th class="text-right">Dto 3%</th>
                        <th class="text-right">P. Final</th>
                        <th class="text-right">Total Bruto</th>
                        <th class="text-right">Total Dto</th>
                        <th class="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="l in lineas[sub.ORDERID]" :key="l.CODARTICULO + '_' + l.LOTE">
                        <td>{{ l.CODARTICULO }}</td>
                        <td>{{ l.DESCRIPCION }}</td>
                        <td><v-chip v-if="l.LOTE" size="x-small" variant="outlined">{{ l.LOTE }}</v-chip><span v-else class="text-medium-emphasis">—</span></td>
                        <td class="text-right">{{ l.CANTIDAD }}</td>
                        <td class="text-right">{{ fmt(l.PRECIO_BRUTO) }}</td>
                        <td class="text-right">{{ l.DESC1 > 0 ? l.DESC1 + '%' : '—' }}</td>
                        <td class="text-right">{{ l.DESC2 > 0 ? l.DESC2 + '%' : '—' }}</td>
                        <td class="text-right">
                          <span v-if="l.DESC3 > 0" class="text-orange-darken-2 font-weight-medium">{{ l.DESC3 }}%</span>
                          <span v-else>—</span>
                        </td>
                        <td class="text-right">{{ fmt(l.PRECIO_FINAL) }}</td>
                        <td class="text-right">{{ fmt(l.TOTAL_BRUTO) }}</td>
                        <td class="text-right">
                          <span v-if="l.TOTAL_DESCUENTO > 0" class="text-error">-{{ fmt(l.TOTAL_DESCUENTO) }}</span>
                          <span v-else>—</span>
                        </td>
                        <td class="text-right font-weight-medium">{{ fmt(l.PRECIO_FINAL * l.CANTIDAD) }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </template>
                <div v-else-if="cargandoLineas[sub.ORDERID]" class="pa-2">
                  <v-progress-circular indeterminate size="16" class="mr-2" />
                  <span class="text-caption">Cargando líneas...</span>
                </div>
                <div v-else class="text-caption text-medium-emphasis pa-1">Sin líneas</div>

                <v-divider v-if="item.subPedidos.indexOf(sub) < item.subPedidos.length - 1" class="mt-2" />
              </div>

            </v-sheet>
          </td>
        </tr>
      </template>
    </v-data-table>

    <!-- Diálogo autorizar -->
    <v-dialog v-model="dlgAutorizar" max-width="400">
      <v-card>
        <v-card-title>Autorizar pedido</v-card-title>
        <v-card-text>
          ¿Autorizar <strong>{{ pedidoSeleccionado?.baseOrderId }}</strong> y todos sus sub-pedidos
          ({{ pedidoSeleccionado?.subPedidos?.filter((s: any) => s.ESTATUS === 'PENDIENTE').length }} pendiente(s))?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dlgAutorizar = false">Cancelar</v-btn>
          <v-btn color="success" variant="tonal" :loading="!!autorizando" @click="ejecutarAutorizar">Autorizar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo eliminar -->
    <v-dialog v-model="dlgEliminar" max-width="420">
      <v-card>
        <v-card-title class="text-error">Eliminar pedido</v-card-title>
        <v-card-text>
          Se eliminarán todos los sub-pedidos de <strong>{{ pedidoSeleccionado?.baseOrderId }}</strong>
          ({{ pedidoSeleccionado?.subPedidos?.length }} sub-pedido(s)) y el archivo se restablecerá para reprocesarse.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dlgEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="tonal" :loading="!!eliminando" @click="ejecutarEliminar">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3500">{{ snack.msg }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'

const api = import.meta.env.VITE_API_URL

const headers = [
  { title: 'Pedido',      key: 'baseOrderId',    sortable: true },
  { title: 'Cliente',     key: 'nombreCliente',  sortable: false },
  { title: 'Estado',      key: 'estatusGeneral', sortable: true },
  { title: 'Fecha',       key: 'fecha',          sortable: true },
  { title: 'Sub-pedidos', key: 'subCount',       sortable: false, align: 'center' as const },
  { title: 'Total',       key: 'totalGeneral',   sortable: false, align: 'end' as const },
  { title: '',            key: 'actions',        sortable: false },
]

const estatusTab = ref('PENDIENTE')
const search     = ref('')
const cargando   = ref(false)
const pedidos    = ref<any[]>([])
const expanded   = ref<string[]>([])
const lineas     = ref<Record<string, any[]>>({})
const cargandoLineas = ref<Record<string, boolean>>({})

const autorizando        = ref<string | null>(null)
const eliminando         = ref<string | null>(null)
const dlgAutorizar       = ref(false)
const dlgEliminar        = ref(false)
const pedidoSeleccionado = ref<any>(null)

const snack = ref({ show: false, msg: '', color: 'success' })

function fmt(v: any) {
  return Number(v || 0).toLocaleString('es-PY', { minimumFractionDigits: 2 })
}

async function cargar() {
  cargando.value = true
  try {
    const res = await axios.get(`${api}/pedidos-ctrl`, {
      params: { estatus: estatusTab.value, search: search.value, limit: 500 },
    })
    pedidos.value = res.data.data
  } catch {
    toast('Error al cargar pedidos', 'error')
  }
  cargando.value = false
}

async function onExpand(exp: string[]) {
  expanded.value = exp
  // Cargar líneas de todos los sub-pedidos del grupo expandido
  for (const baseId of exp) {
    const grupo = pedidos.value.find(p => p.baseOrderId === baseId)
    if (!grupo) continue
    for (const sub of grupo.subPedidos) {
      if (lineas.value[sub.ORDERID] !== undefined || cargandoLineas.value[sub.ORDERID]) continue
      cargandoLineas.value[sub.ORDERID] = true
      try {
        const res = await axios.get(`${api}/pedidos-ctrl/${encodeURIComponent(sub.ORDERID)}/lineas`)
        lineas.value[sub.ORDERID] = res.data
      } catch { lineas.value[sub.ORDERID] = [] }
      cargandoLineas.value[sub.ORDERID] = false
    }
  }
}

function confirmarAutorizar(item: any) {
  pedidoSeleccionado.value = item
  dlgAutorizar.value = true
}

async function ejecutarAutorizar() {
  const grupo = pedidoSeleccionado.value
  if (!grupo) return
  autorizando.value = grupo.baseOrderId
  dlgAutorizar.value = false
  try {
    const pendientes = grupo.subPedidos.filter((s: any) => s.ESTATUS === 'PENDIENTE')
    for (const sub of pendientes) {
      await axios.post(`${api}/pedidos-ctrl/${encodeURIComponent(sub.ORDERID)}/autorizar`)
    }
    toast(`${grupo.baseOrderId} autorizado`)
    await cargar()
  } catch {
    toast('Error al autorizar', 'error')
  }
  autorizando.value = null
}

function confirmarEliminar(item: any) {
  pedidoSeleccionado.value = item
  dlgEliminar.value = true
}

async function ejecutarEliminar() {
  const grupo = pedidoSeleccionado.value
  if (!grupo) return
  eliminando.value = grupo.baseOrderId
  dlgEliminar.value = false
  try {
    // El servicio ya borra todos los sub-pedidos al recibir cualquier ORDERID del grupo
    const refOrderId = grupo.subPedidos[0]?.ORDERID ?? grupo.baseOrderId
    await axios.delete(`${api}/pedidos-ctrl/${encodeURIComponent(refOrderId)}`)
    toast(`${grupo.baseOrderId} eliminado — archivo listo para reprocesar`)
    // Limpiar lineas cacheadas del grupo
    for (const sub of grupo.subPedidos) delete lineas.value[sub.ORDERID]
    await cargar()
  } catch {
    toast('Error al eliminar', 'error')
  }
  eliminando.value = null
}

function toast(msg: string, color = 'success') {
  snack.value = { show: true, msg, color }
}

watch(estatusTab, cargar)
onMounted(cargar)
</script>
