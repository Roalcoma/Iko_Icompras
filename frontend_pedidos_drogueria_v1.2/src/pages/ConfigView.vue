<template>
  <v-container max-width="700" class="py-8">

    <v-card class="mb-6">
      <v-card-title class="text-h6 pa-5 pb-2">
        <v-icon start>mdi-folder-sync</v-icon>
        Integración Icompras
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Carpeta donde Icompras deposita los archivos <code>.txt</code> de pedidos.
          El servicio los escanea automáticamente cada 30 segundos.
        </p>
        <v-text-field
          v-model="ruta"
          label="Ruta de carpeta"
          placeholder="C:\Icompras\Pedidos"
          variant="outlined"
          density="compact"
          :loading="cargando"
          :disabled="cargando"
        />
        <v-text-field
          v-model.number="intervalo"
          label="Intervalo de sincronización (segundos)"
          type="number"
          min="5"
          variant="outlined"
          density="compact"
          :loading="cargando"
          :disabled="cargando"
          hint="Mínimo 5 segundos. El cambio toma efecto tras el próximo escaneo automático."
          persistent-hint
          class="mt-3"
        />
        <v-text-field
          v-model.number="dptoPsicotropicos"
          label="Departamento de psicotrópicos"
          type="number"
          min="1"
          variant="outlined"
          density="compact"
          :loading="cargando"
          :disabled="cargando"
          hint="Código de departamento (SECCION) que identifica productos psicotrópicos."
          persistent-hint
          class="mt-3"
        />
        <div class="d-flex ga-3 mt-4 flex-wrap">
          <v-btn color="primary" :loading="guardandoRuta" @click="guardarRuta">
            Guardar
          </v-btn>
          <v-btn variant="tonal" :loading="escaneando" @click="escanearAhora">
            <v-icon start>mdi-magnify-scan</v-icon>
            Sincronizar ahora
          </v-btn>
        </div>
        <v-alert
          v-if="mensajeRuta"
          :type="tipoRuta"
          class="mt-4"
          closable
          variant="tonal"
          @click:close="mensajeRuta = ''"
        >{{ mensajeRuta }}</v-alert>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title class="text-h6 pa-5 pb-2">
        <v-icon start>mdi-github</v-icon>
        Actualizador — Configuración
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-4">
          URL del ZIP en GitHub y nombres de los servicios NSSM para el reinicio automático.
        </p>
        <v-text-field
          v-model="githubZipUrl"
          label="URL del ZIP en GitHub"
          placeholder="https://github.com/usuario/repo/archive/refs/heads/main.zip"
          variant="outlined"
          density="compact"
          class="mb-3"
          :disabled="cargando"
        />
        <v-text-field
          v-model="nssmBackend"
          label="Servicio NSSM — Backend (opcional)"
          placeholder="icompras-backend"
          variant="outlined"
          density="compact"
          class="mb-3"
          :disabled="cargando"
        />
        <v-text-field
          v-model="nssmFrontend"
          label="Servicio NSSM — Frontend (opcional)"
          placeholder="icompras-frontend"
          variant="outlined"
          density="compact"
          :disabled="cargando"
        />
        <v-btn color="primary" :loading="guardandoCfg" class="mt-2" @click="guardarConfigActualizador">
          Guardar
        </v-btn>
        <v-alert
          v-if="mensajeCfg"
          :type="tipoCfg"
          class="mt-4"
          closable
          variant="tonal"
          @click:close="mensajeCfg = ''"
        >{{ mensajeCfg }}</v-alert>
      </v-card-text>
    </v-card>

  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

const api = import.meta.env.VITE_API_URL

const ruta               = ref('')
const intervalo          = ref(30)
const dptoPsicotropicos  = ref(6)
const cargando     = ref(false)
const guardandoRuta = ref(false)
const escaneando   = ref(false)
const mensajeRuta  = ref('')
const tipoRuta     = ref<'success' | 'error'>('success')

const githubZipUrl   = ref('')
const nssmBackend    = ref('')
const nssmFrontend   = ref('')
const guardandoCfg   = ref(false)
const mensajeCfg     = ref('')
const tipoCfg        = ref<'success' | 'error'>('success')

onMounted(async () => {
  cargando.value = true
  try {
    const [r1, r2] = await Promise.all([
      axios.get(`${api}/ecommerce/config`),
      axios.get(`${api}/sistema/db-config`),
    ])
    ruta.value         = r1.data.ruta ?? ''
    intervalo.value         = r2.data.config?.intervaloEscaneo    ?? 30
    dptoPsicotropicos.value = r2.data.config?.dptoPsicotropicos  ?? 6
    githubZipUrl.value = r2.data.config?.githubZipUrl ?? ''
    nssmBackend.value  = r2.data.config?.nssmServicioBackend ?? ''
    nssmFrontend.value = r2.data.config?.nssmServicioFrontend ?? ''
  } catch {
    mensajeRuta.value = 'No se pudo conectar al backend.'
    tipoRuta.value    = 'error'
  }
  cargando.value = false
})

async function guardarRuta() {
  guardandoRuta.value = true
  try {
    await Promise.all([
      axios.put(`${api}/ecommerce/config`, { ruta: ruta.value }),
      axios.post(`${api}/sistema/db-config/guardar`, { intervaloEscaneo: intervalo.value, dptoPsicotropicos: dptoPsicotropicos.value }),
    ])
    tipoRuta.value    = 'success'
    mensajeRuta.value = 'Configuración guardada correctamente.'
  } catch (e: any) {
    tipoRuta.value    = 'error'
    mensajeRuta.value = e?.response?.data?.message ?? 'Error al guardar.'
  }
  guardandoRuta.value = false
}

async function escanearAhora() {
  escaneando.value = true
  try {
    const res = await axios.post(`${api}/ecommerce/escanear`)
    tipoRuta.value    = 'success'
    mensajeRuta.value = `Escaneo completado: ${res.data.importados} importados, ${res.data.errores} errores.`
    if (res.data.mensaje) mensajeRuta.value += ` ${res.data.mensaje}`
  } catch (e: any) {
    tipoRuta.value    = 'error'
    mensajeRuta.value = e?.response?.data?.message ?? 'Error al escanear.'
  }
  escaneando.value = false
}

async function guardarConfigActualizador() {
  guardandoCfg.value = true
  try {
    await axios.post(`${api}/sistema/db-config/guardar`, {
      githubZipUrl:         githubZipUrl.value,
      nssmServicioBackend:  nssmBackend.value,
      nssmServicioFrontend: nssmFrontend.value,
    })
    tipoCfg.value    = 'success'
    mensajeCfg.value = 'Configuración del actualizador guardada.'
  } catch (e: any) {
    tipoCfg.value    = 'error'
    mensajeCfg.value = e?.response?.data?.message ?? 'Error al guardar.'
  }
  guardandoCfg.value = false
}
</script>
