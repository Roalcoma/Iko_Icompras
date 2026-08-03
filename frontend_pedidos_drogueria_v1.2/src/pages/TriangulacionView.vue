<template>
  <v-container max-width="1000" class="py-6">
    <div class="d-flex align-center mb-4">
      <span class="text-h6 font-weight-bold">Promos de Triangulación</span>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="abrirNuevaPromo">Nueva promo</v-btn>
    </div>

    <v-alert v-if="!promos.length && !cargando" type="info" variant="tonal" class="mb-4">
      No hay promos configuradas. Crea una con el botón de arriba.
    </v-alert>

    <v-expansion-panels v-model="panelAbierto" class="mb-4">
      <v-expansion-panel v-for="p in promos" :key="p.id" :value="p.id">
        <v-expansion-panel-title>
          <div class="d-flex align-center ga-3 flex-wrap" style="flex:1">
            <v-chip :color="p.activo ? 'success' : 'default'" size="small" variant="tonal">
              {{ p.activo ? 'Activa' : 'Inactiva' }}
            </v-chip>
            <span class="font-weight-medium">{{ p.nombre }}</span>
            <v-chip size="x-small" color="primary" variant="outlined">{{ p.tipo }}</v-chip>
            <span class="text-caption text-medium-emphasis">{{ p.nombreEntidad || p.codigo }} · base {{ p.base }}</span>
            <v-spacer />
            <v-btn size="small" variant="text" icon @click.stop="abrirEditarPromo(p)">
              <v-icon>mdi-pencil-outline</v-icon>
            </v-btn>
            <v-btn size="small" variant="text" color="error" icon @click.stop="confirmarEliminarPromo(p)">
              <v-icon>mdi-delete-outline</v-icon>
            </v-btn>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <p class="text-caption text-medium-emphasis mb-3">
            Código: <strong>{{ p.codigo }}</strong> · Mide por: <strong>{{ p.base }}</strong>
          </p>

          <v-table density="compact" class="mb-3">
            <thead>
              <tr>
                <th>Mínimo</th>
                <th>Máximo</th>
                <th>Descuento %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in p.escalas" :key="e.id">
                <td>{{ e.minimo }}</td>
                <td>{{ e.maximo ?? '∞' }}</td>
                <td>{{ e.porcentaje }}%</td>
                <td>
                  <v-btn size="x-small" icon variant="text" color="error" @click="eliminarEscala(p, e)">
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </td>
              </tr>
              <tr v-if="!p.escalas.length">
                <td colspan="4" class="text-center text-medium-emphasis py-2">Sin escalas</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Formulario inline para nueva escala -->
          <div class="d-flex align-center ga-2 flex-wrap">
            <v-text-field
              v-model.number="nuevaEscala[p.id].minimo"
              label="Mínimo" type="number" min="0"
              density="compact" variant="outlined" hide-details style="max-width:130px"
            />
            <v-text-field
              v-model="nuevaEscala[p.id].maximo"
              label="Máximo (vacío=∞)" type="number" min="0"
              density="compact" variant="outlined" hide-details style="max-width:150px"
            />
            <v-text-field
              v-model.number="nuevaEscala[p.id].porcentaje"
              label="Descuento %" type="number" min="0" max="100"
              density="compact" variant="outlined" hide-details style="max-width:130px"
            />
            <v-btn color="primary" size="small" variant="tonal"
              :loading="guardandoEscala === p.id"
              @click="agregarEscala(p)">
              Agregar escala
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Diálogo crear / editar promo -->
    <v-dialog v-model="dlgPromo" max-width="560" persistent>
      <v-card>
        <v-card-title>{{ editandoPromo?.id ? 'Editar promo' : 'Nueva promo' }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="form.nombre" label="Nombre de la promo *"
            variant="outlined" density="compact" class="mb-3"
          />
          <v-select
            v-model="form.tipo"
            :items="['PROVEEDOR','MARCA']"
            label="Tipo *" variant="outlined" density="compact" class="mb-3"
            @update:model-value="limpiarCodigo"
          />
          <v-autocomplete
            v-model="form.codigo"
            :items="sugerencias"
            item-value="codigo"
            item-title="nombre"
            :label="form.tipo === 'PROVEEDOR' ? 'Proveedor *' : 'Marca *'"
            variant="outlined" density="compact" class="mb-1"
            :loading="buscando"
            no-filter
            return-object
            @update:search="onBuscar"
            @update:model-value="onSeleccionarEntidad"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :subtitle="item.raw.codigo" />
            </template>
          </v-autocomplete>
          <p class="text-caption text-medium-emphasis mb-3">
            Código guardado: <strong>{{ form.codigoRaw || '—' }}</strong>
          </p>
          <v-select
            v-model="form.base"
            :items="['UNIDADES','MONTO']"
            label="Base de medición *" variant="outlined" density="compact" class="mb-3"
          />
          <v-switch v-model="form.activo" label="Activa" color="success" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dlgPromo = false">Cancelar</v-btn>
          <v-btn color="primary" variant="tonal" :loading="guardandoPromo" @click="guardarPromo">Guardar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Diálogo confirmar eliminar promo -->
    <v-dialog v-model="dlgEliminar" max-width="380">
      <v-card>
        <v-card-title class="text-error">Eliminar promo</v-card-title>
        <v-card-text>¿Eliminar la promo <strong>{{ promoAEliminar?.nombre }}</strong>? Se borrarán también todas sus escalas.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dlgEliminar = false">Cancelar</v-btn>
          <v-btn color="error" variant="tonal" :loading="eliminandoPromo" @click="ejecutarEliminarPromo">Eliminar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000">{{ snack.msg }}</v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import axios from 'axios'

const api = import.meta.env.VITE_API_URL

const cargando     = ref(false)
const promos       = ref<any[]>([])
const panelAbierto = ref<number | undefined>(undefined)

const dlgPromo      = ref(false)
const guardandoPromo = ref(false)
const editandoPromo = ref<any>(null)

const dlgEliminar     = ref(false)
const eliminandoPromo = ref(false)
const promoAEliminar  = ref<any>(null)

const guardandoEscala = ref<number | null>(null)
const nuevaEscala = ref<Record<number, { minimo: number; maximo: string; porcentaje: number }>>({})

const buscando    = ref(false)
const sugerencias = ref<any[]>([])
let buscarTimer: ReturnType<typeof setTimeout> | null = null

const form = reactive({
  nombre: '',
  tipo: 'PROVEEDOR' as 'PROVEEDOR' | 'MARCA',
  codigo: null as any,
  codigoRaw: '',
  nombreEntidad: '',
  base: 'UNIDADES' as 'UNIDADES' | 'MONTO',
  activo: true,
})

const snack = ref({ show: false, msg: '', color: 'success' })

function toast(msg: string, color = 'success') {
  snack.value = { show: true, msg, color }
}

async function cargar() {
  cargando.value = true
  try {
    const res = await axios.get(`${api}/triangulacion`)
    promos.value = res.data
    // Inicializar escalas nuevas por promo
    for (const p of promos.value) {
      if (!nuevaEscala.value[p.id])
        nuevaEscala.value[p.id] = { minimo: 0, maximo: '', porcentaje: 0 }
    }
  } catch { toast('Error al cargar promos', 'error') }
  cargando.value = false
}

function abrirNuevaPromo() {
  editandoPromo.value = null
  Object.assign(form, { nombre: '', tipo: 'PROVEEDOR', codigo: null, codigoRaw: '', nombreEntidad: '', base: 'UNIDADES', activo: true })
  sugerencias.value = []
  dlgPromo.value = true
}

function abrirEditarPromo(p: any) {
  editandoPromo.value = p
  sugerencias.value = [{ codigo: p.codigo, nombre: p.nombreEntidad || p.codigo }]
  Object.assign(form, {
    nombre:        p.nombre,
    tipo:          p.tipo,
    codigo:        { codigo: p.codigo, nombre: p.nombreEntidad || p.codigo },
    codigoRaw:     p.codigo,
    nombreEntidad: p.nombreEntidad,
    base:          p.base,
    activo:        p.activo,
  })
  dlgPromo.value = true
}

function limpiarCodigo() {
  form.codigo = null
  form.codigoRaw = ''
  form.nombreEntidad = ''
  sugerencias.value = []
}

function onSeleccionarEntidad(val: any) {
  if (val && typeof val === 'object') {
    form.codigoRaw     = val.codigo
    form.nombreEntidad = val.nombre
  }
}

function onBuscar(q: string) {
  if (buscarTimer) clearTimeout(buscarTimer)
  if (!q || q.length < 2) { sugerencias.value = []; return }
  buscarTimer = setTimeout(async () => {
    buscando.value = true
    try {
      const endpoint = form.tipo === 'PROVEEDOR' ? 'proveedores' : 'marcas'
      const res = await axios.get(`${api}/triangulacion/buscar/${endpoint}`, { params: { q } })
      sugerencias.value = res.data
    } catch { /* ignorar */ }
    buscando.value = false
  }, 300)
}

async function guardarPromo() {
  if (!form.nombre || !form.codigoRaw || !form.base) {
    toast('Completa todos los campos requeridos', 'error'); return
  }
  guardandoPromo.value = true
  const payload = {
    nombre: form.nombre, tipo: form.tipo, codigo: form.codigoRaw,
    nombreEntidad: form.nombreEntidad, base: form.base, activo: form.activo,
  }
  try {
    if (editandoPromo.value?.id) {
      await axios.put(`${api}/triangulacion/${editandoPromo.value.id}`, payload)
      toast('Promo actualizada')
    } else {
      await axios.post(`${api}/triangulacion`, payload)
      toast('Promo creada')
    }
    dlgPromo.value = false
    await cargar()
  } catch { toast('Error al guardar', 'error') }
  guardandoPromo.value = false
}

function confirmarEliminarPromo(p: any) {
  promoAEliminar.value = p
  dlgEliminar.value = true
}

async function ejecutarEliminarPromo() {
  eliminandoPromo.value = true
  try {
    await axios.delete(`${api}/triangulacion/${promoAEliminar.value.id}`)
    toast('Promo eliminada')
    dlgEliminar.value = false
    await cargar()
  } catch { toast('Error al eliminar', 'error') }
  eliminandoPromo.value = false
}

async function agregarEscala(p: any) {
  const e = nuevaEscala.value[p.id]
  if (!e || e.porcentaje <= 0) { toast('Ingresa un porcentaje válido', 'error'); return }
  guardandoEscala.value = p.id
  try {
    await axios.post(`${api}/triangulacion/${p.id}/escalas`, {
      minimo:     e.minimo,
      maximo:     e.maximo !== '' ? Number(e.maximo) : null,
      porcentaje: e.porcentaje,
    })
    nuevaEscala.value[p.id] = { minimo: 0, maximo: '', porcentaje: 0 }
    toast('Escala agregada')
    await cargar()
  } catch { toast('Error al agregar escala', 'error') }
  guardandoEscala.value = null
}

async function eliminarEscala(p: any, e: any) {
  try {
    await axios.delete(`${api}/triangulacion/escalas/${e.id}`)
    toast('Escala eliminada')
    await cargar()
  } catch { toast('Error al eliminar escala', 'error') }
}

onMounted(cargar)
</script>
