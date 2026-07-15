<template>
  <v-container max-width="700" class="py-8">
    <v-card>
      <v-card-title class="text-h6 pa-5 pb-2">
        <v-icon start>mdi-cloud-download-outline</v-icon>
        Actualizar aplicación desde GitHub
      </v-card-title>
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-5">
          Descarga el ZIP configurado desde GitHub, reemplaza los archivos del proyecto
          (respetando <code>.env</code>, <code>connections.json</code> y
          <code>node_modules</code>) y reinicia los servicios NSSM configurados.
        </p>
        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-update"
          :loading="actualizando"
          :disabled="actualizando"
          @click="actualizar"
        >
          Descargar e instalar actualización
        </v-btn>
      </v-card-text>

      <template v-if="resultado">
        <v-divider />
        <v-card-text>
          <v-alert
            :type="resultado.success ? 'success' : 'error'"
            variant="tonal"
            class="mb-4"
          >
            {{ resultado.mensaje }}
            <span v-if="resultado.archivosCopiados"> ({{ resultado.archivosCopiados }} archivos)</span>
            <span v-if="resultado.reiniciando"> Reiniciando servicios…</span>
          </v-alert>

          <div v-if="resultado.log?.length">
            <p class="text-body-2 font-weight-medium mb-2">Log de instalación:</p>
            <v-sheet
              color="surface-variant"
              rounded
              class="pa-3 overflow-y-auto"
              style="max-height:300px;font-family:monospace;font-size:12px;white-space:pre-wrap;"
            >{{ resultado.log.join('\n') }}</v-sheet>
          </div>
        </v-card-text>
      </template>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'

const api          = import.meta.env.VITE_API_URL
const actualizando = ref(false)
const resultado    = ref<any>(null)

async function actualizar() {
  actualizando.value = true
  resultado.value    = null
  try {
    const res = await axios.post(`${api}/sistema/actualizar`)
    resultado.value = res.data
  } catch (e: any) {
    resultado.value = {
      success: false,
      mensaje: e?.response?.data?.mensaje ?? e?.message ?? 'Error de red',
      log:     e?.response?.data?.log ?? [],
    }
  }
  actualizando.value = false
}
</script>
