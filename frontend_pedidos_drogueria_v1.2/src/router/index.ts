import { createRouter, createWebHistory } from 'vue-router';
import ConfigView       from '../pages/ConfigView.vue';
import ActualizadorView from '../pages/ActualizadorView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/',             name: 'config',       component: ConfigView },
    { path: '/actualizador', name: 'actualizador', component: ActualizadorView },
  ],
});

export default router;
