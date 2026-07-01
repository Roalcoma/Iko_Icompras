<template>
  <v-app>

    <v-navigation-drawer
      v-if="authStore.isAuthenticated"
      v-model="drawer"
      app
      color="primary-darken-1"
      elevation="0"
    >
      <div class="pa-6 d-flex flex-column align-center">
        <div class="mb-3 d-flex justify-center" style="width:100%;max-width:160px;">
          <v-img :src="logoEmpresaUrl" alt="logo" contain width="100%" />
        </div>
        <h2 class="text-h6 font-weight-bold text-white mb-0" style="letter-spacing:0.5px;">Terminal de Ventas</h2>
        <span class="text-caption text-cyan-lighten-3">Droguería Intercontinental</span>
      </div>

      <v-divider class="mb-2 opacity-30" />

      <v-list density="comfortable" nav class="px-3">
        <v-list-item
          v-for="modulo in authStore.modulosVisibles"
          :key="modulo.codigo"
          :to="modulo.ruta"
          :prepend-icon="modulo.icono"
          :title="modulo.nombre"
          active-color="accent"
          rounded="lg"
          class="mb-1 text-white"
        >
          <template v-if="modulo.ruta === '/carrito'" v-slot:append>
            <v-badge v-if="totalArticulos > 0" color="error" :content="totalArticulos" inline />
          </template>
        </v-list-item>
      </v-list>

      <template v-slot:append>
        <div class="pa-4 text-center">
          <v-divider class="mb-4 opacity-30" />
          <div class="text-caption text-cyan-lighten-4" style="opacity:0.6;">
            &copy; {{ new Date().getFullYear() }} — REDSIP
          </div>
        </div>
      </template>
    </v-navigation-drawer>

    <v-app-bar v-if="authStore.isAuthenticated" app elevation="0" color="surface" border="b">
      <v-app-bar-nav-icon @click="drawer = !drawer" color="primary" />
      <v-app-bar-title class="font-weight-bold" style="color: #164E63;">Terminal de Ventas</v-app-bar-title>

      <v-spacer />

      <v-chip
        v-if="authStore.modoPruebas"
        color="warning" variant="elevated"
        class="mr-3 font-weight-bold"
        prepend-icon="mdi-flask"
        size="small"
      >
        MODO PRUEBAS
      </v-chip>

      <v-chip
        v-if="carritoStore.tasa > 0"
        color="secondary" variant="tonal"
        class="mr-3 font-weight-bold"
        prepend-icon="mdi-trending-up"
        size="small"
      >
        TASA: Bs. {{ carritoStore.tasa.toFixed(2) }}
      </v-chip>

      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" variant="text" color="primary" class="text-none">
            <v-icon start>mdi-account-circle</v-icon>
            <span class="d-none d-sm-inline text-caption font-weight-bold">
              {{ authStore.usuario?.nombre ?? authStore.usuario?.usuario }}
            </span>
            <v-chip v-if="authStore.esAdmin" size="x-small" color="warning" class="ml-2">Admin</v-chip>
            <v-icon end size="small">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item :subtitle="authStore.usuario?.usuario">
            <template v-slot:title>
              <span class="font-weight-bold">{{ authStore.usuario?.nombre }}</span>
            </template>
          </v-list-item>
          <v-divider />
          <v-list-item
            prepend-icon="mdi-logout"
            title="Cerrar sesión"
            color="error"
            @click="handleLogout"
          />
        </v-list>
      </v-menu>
    </v-app-bar>

    <v-main :class="authStore.isAuthenticated ? 'bg-background' : ''">
      <router-view v-slot="{ Component }">
        <v-fade-transition mode="out-in">
          <component :is="Component" />
        </v-fade-transition>
      </router-view>
    </v-main>

    <v-snackbar v-model="errorTasa" color="error" timeout="5000" location="bottom right">
      <v-icon start>mdi-alert-circle</v-icon>
      No se pudo obtener la tasa del día.
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useCarritoStore } from './stores/useCarritoStore';
import { useAuthStore }    from './stores/useAuthStore';
import { usePromocionesStore } from './stores/usePromocionesStore';
import logoEmpresaUrl from './assets/drogueria_logo.png';

const drawer        = ref(true);
const errorTasa     = ref(false);
const carritoStore   = useCarritoStore();
const authStore      = useAuthStore();
const promocionesStore = usePromocionesStore();
const router         = useRouter();

const totalArticulos = computed(() =>
  carritoStore.articulos.reduce((t, i) => t + i.cantidad, 0)
);

const obtenerTasa = async () => {
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/tasa`);
    if (res.data.success) carritoStore.setTasa(res.data.tasa);
  } catch {
    errorTasa.value = true;
  }
};

const handleLogout = () => {
  authStore.logout();
  router.push('/login');
};

onMounted(() => {
  if (authStore.isAuthenticated) {
    obtenerTasa();
    promocionesStore.cargarVigentes().then(() => carritoStore.recalcularPromociones());
  }
});
watch(() => authStore.isAuthenticated, v => {
  if (v) {
    obtenerTasa();
    promocionesStore.cargarVigentes().then(() => carritoStore.recalcularPromociones());
  }
});
</script>

<style>
.v-list-item--active { font-weight: bold !important; }
.v-main { min-height: 100vh; }
</style>
