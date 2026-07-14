<template>
  <div class="login-wrapper d-flex align-center justify-center" :style="{ minHeight: '100vh', background: loginBg }">

    <v-btn
        :color="authStore.modoPruebas ? 'warning' : 'white'"
        :variant="authStore.modoPruebas ? 'elevated' : 'tonal'"
        rounded="pill"
        size="small"
        class="font-weight-bold"
        style="position: fixed; top: 24px; right: 24px;"
        :prepend-icon="authStore.modoPruebas ? 'mdi-flask' : 'mdi-flask-outline'"
        @click="authStore.toggleModoPruebas()"
      >
        {{ authStore.modoPruebas ? 'MODO PRUEBAS ACTIVO' : 'Usar BD de pruebas' }}
      </v-btn>

      <v-container style="max-width: 420px;">

        <v-alert
          v-if="authStore.modoPruebas"
          type="warning"
          variant="elevated"
          density="compact"
          class="mb-4"
          icon="mdi-flask"
        >
          Vas a iniciar sesión contra la base de datos de <strong>pruebas</strong>.
        </v-alert>

        <div class="text-center mb-8">
          <v-img
            :src="brandingStore.logo"
            alt="logo"
            max-width="140"
            class="mx-auto mb-4"
          />
          <h1 class="text-h5 font-weight-bold text-white mb-1">Terminal de Ventas</h1>
          <span class="text-caption text-cyan-lighten-3">Droguería Intercontinental</span>
        </div>

        <v-card rounded="xl" elevation="12" class="pa-8">
          <v-card-title class="text-h6 font-weight-bold text-center mb-6 pa-0" style="color: #164E63;">
            Iniciar Sesión
          </v-card-title>

          <v-form @submit.prevent="handleLogin">
            <v-text-field
              v-model="password"
              label="Contraseña"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPass ? 'mdi-eye-off' : 'mdi-eye'"
              :type="showPass ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              color="primary"
              class="mb-5"
              :disabled="loading"
              autofocus
              @click:append-inner="showPass = !showPass"
              @keyup.enter="handleLogin"
            />

            <v-alert
              v-if="errorMsg"
              type="error"
              variant="tonal"
              density="compact"
              class="mb-4"
              :text="errorMsg"
            />

            <v-btn
              type="submit"
              color="primary"
              variant="elevated"
              size="large"
              block
              rounded="lg"
              :loading="loading"
              class="font-weight-bold"
            >
              Ingresar
            </v-btn>
          </v-form>
        </v-card>

        <div class="text-center mt-6 text-caption text-cyan-lighten-4" style="opacity: 0.5;">
          &copy; {{ new Date().getFullYear() }} REDSIP
        </div>
      </v-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import { useBrandingStore, darkenHex } from '../stores/useBrandingStore';

const authStore     = useAuthStore();
const brandingStore = useBrandingStore();
const router        = useRouter();

const loginBg = computed(() => {
  const p = brandingStore.primary;
  const d = darkenHex(p);
  return `linear-gradient(135deg, ${p} 0%, ${d} 50%, #0F172A 100%)`;
});

const password = ref('');
const showPass = ref(false);
const loading  = ref(false);
const errorMsg = ref('');

const handleLogin = async () => {
  if (!password.value) {
    errorMsg.value = 'Ingresa tu contraseña';
    return;
  }
  loading.value  = true;
  errorMsg.value = '';

  const result = await authStore.login(password.value);

  if (result.success) {
    if (!authStore.esAdmin && authStore.modulosVisibles.length === 0) {
      authStore.logout();
      errorMsg.value = 'Tu usuario no tiene módulos asignados. Contacta al administrador.';
    } else {
      const primerModulo = authStore.modulosVisibles[0];
      router.push(primerModulo?.ruta ?? '/');
    }
  } else {
    errorMsg.value = result.message;
  }
  loading.value = false;
};
</script>
