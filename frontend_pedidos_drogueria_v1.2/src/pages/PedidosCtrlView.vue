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
      item-value="ORDERID"
      show-expand
      v-model:expanded="expanded"
      @update:expanded="onExpand"
      class="elevation-1"
    >
      <template #item.ESTATUS="{ item }">
        <v-chip :color="item.ESTATUS === 'PENDIENTE' ? 'warning' : 'success'" size="small" variant="tonal">
          {{ item.ESTATUS }}
        </v-chip>
      </template>

      <template #item.FECHA="{ item }">
        {{ item.FECHA ? new Date(item.FECHA).toLocaleDateString('es-PY') : '—' }}
      </template>

      <template #item.TOTAL="{ item }">
        {{ Number(item.TOTAL).toLocaleString('es-PY', { minimumFractionDigits: 2 }) }}
      </template>

      <template #item.actions="{ item }">
        <div class="d-flex ga-1">
          <v-btn
            v-if="item.ESTATUS === 'PENDIENTE'"
            color="success" size="small" variant="tonal" icon
            :loading="autorizando === item.ORDERID"
            @click.stop="confirmarAutorizar(item)"
          >
            <v-icon>mdi-check</v-icon>
            <v-tooltip activator="parent">Autorizar</v-tooltip>
          </v-btn>
          <v-btn
            color="error" size="small" variant="tonal" icon
            :loading="eliminando === item.ORDERID"
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
              <template v-if="lineas[item.ORDERID]?.length">
                <v-table density="compact" class="rounded">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th class="text-right">Cant.</th>
                      <th class="text-right">P. Bruto</th>
                      <th class="text-right">Dto 1%</th>
                      <th class="text-right">Dto 2%</th>
                      <th class="text-right">Dto 3%</th>
                      <th class="text-right">P. Final</th>
                      <th class="text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="l in lineas[item.ORDERID]" :key="l.CODARTICULO">
                      <td>{{ l.CODARTICULO }}</td>
                      <td>{{ l.DESCRIPCION }}</td>
                      <td class="text-right">{{ l.CANTIDAD }}</td>
                      <td class="text-right">{{ fmt(l.PRECIO_BRUTO) }}</td>
                      <td class="text-right">{{ l.DESC1 > 0 ? l.DESC1 + '%' : '—' }}</td>
                      <td class="text-right">{{ l.DESC2 > 0 ? l.DESC2 + '%' : '—' }}</td>
                      <td class="text-right">
                        <span v-if="l.DESC3 > 0" class="text-orange-darken-2 font-weight-medium">{{ l.DESC3 }}%</span>
                        <span v-else>—</span>
                      </td>
                      <td class="text-right">{{ fmt(l.PRECIO_FINAL) }}</td>
                      <td class="text-right">{{ fmt(l.PRECIO_FINAL * l.CANTIDAD) }}</td>
                    </tr>
                  </tbody>
                </v-table>
              </template>
              <div v-else-if="cargandoLineas[item.ORDERID]" class="pa-2">
                <v-progress-circular indeterminate size="20" />
              </div>
              <div v-else class="text-body-2 text-medium-emphasis pa-2">Sin líneas</div>
            </v-sheet>
          </td>
        </tr>
      </template>
    </v-data-table>

    <!-- Diálogo autorizar -->
    <v-dialog v-model="dlgAutorizar" max-width="380">
      <v-card>
        <v-card-title>Autorizar pedido</v-card-title>
        <v-card-text>
          ¿Autorizar el pedido <strong>{{ pedidoSeleccionado?.ORDERID }}</strong>? Pasará a estado AUTORIZADO en el sistema.
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
          Se eliminarán <strong>todos</strong> los sub-pedidos del mismo archivo (EC-{{ baseNum }}, sufijos P, SD, NI, etc.)
          y el archivo se restablecerá para reprocesarse.
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
  { title: 'Pedido',  key: 'ORDERID',        sortable: true },
  { title: 'Cliente', key: 'NOMBRE_CLIENTE',  sortable: false },
  { title: 'Estado',  key: 'ESTATUS',         sortable: true },
  { title: 'Fecha',   key: 'FECHA',           sortable: true },
  { title: 'Líneas',  key: 'NLINEAS',         sortable: false, align: 'end' },
  { title: 'Total',   key: 'TOTAL',           sortable: false, align: 'end' },
  { title: '',        key: 'actions',         sortable: false },
]

const estatusTab = ref('PENDIENTE')
const search     = ref('')
const cargando   = ref(false)
const pedidos    = ref<any[]>([])
const expanded   = ref<string[]>([])
const lineas     = ref<Record<string, any[]>>({})
const cargandoLineas = ref<Record<string, boolean>>({})

const autorizando         = ref<string | null>(null)
const eliminando          = ref<string | null>(null)
const dlgAutorizar        = ref(false)
const dlgEliminar         = ref(false)
const pedidoSeleccionado  = ref<any>(null)
const baseNum             = ref('')

const snack = ref({ show: false, msg: '', color: 'success' })

function fmt(v: any) {
  return Number(v || 0).toLocaleString('es-PY', { minimumFractionDigits: 2 })
}

async function cargar() {
  cargando.value = true
  try {
    const res = await axios.get(`${api}/pedidos-ctrl`, {
      params: { estatus: estatusTab.value, search: search.value, limit: 200 },
    })
    pedidos.value = res.data.data
  } catch {
    toast('Error al cargar pedidos', 'error')
  }
  cargando.value = false
}

async function onExpand(exp: string[]) {
  for (const oid of exp) {
    if (lineas.value[oid] || cargandoLineas.value[oid]) continue
    cargandoLineas.value[oid] = true
    try {
      const res = await axios.get(`${api}/pedidos-ctrl/${encodeURIComponent(oid)}/lineas`)
      lineas.value[oid] = res.data
    } catch { lineas.value[oid] = [] }
    cargandoLineas.value[oid] = false
  }
}

function confirmarAutorizar(item: any) {
  pedidoSeleccionado.value = item
  dlgAutorizar.value = true
}

async function ejecutarAutorizar() {
  const oid = pedidoSeleccionado.value?.ORDERID
  if (!oid) return
  autorizando.value = oid
  dlgAutorizar.value = false
  try {
    await axios.post(`${api}/pedidos-ctrl/${encodeURIComponent(oid)}/autorizar`)
    toast(`${oid} autorizado`)
    await cargar()
  } catch {
    toast('Error al autorizar', 'error')
  }
  autorizando.value = null
}

function confirmarEliminar(item: any) {
  pedidoSeleccionado.value = item
  baseNum.value = (item.ORDERID as string).match(/^EC-(\d+)/)?.[1] ?? ''
  dlgEliminar.value = true
}

async function ejecutarEliminar() {
  const oid = pedidoSeleccionado.value?.ORDERID
  if (!oid) return
  eliminando.value = oid
  dlgEliminar.value = false
  try {
    await axios.delete(`${api}/pedidos-ctrl/${encodeURIComponent(oid)}`)
    toast(`Pedido ${oid} eliminado — archivo listo para reprocesar`)
    delete lineas.value[oid]
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
