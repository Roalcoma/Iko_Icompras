import { createRouter, createWebHistory } from 'vue-router';
import ConfigView        from '../pages/ConfigView.vue';
import ActualizadorView  from '../pages/ActualizadorView.vue';
import PedidosCtrlView   from '../pages/PedidosCtrlView.vue';
import TriangulacionView from '../pages/TriangulacionView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/',               name: 'config',        component: ConfigView },
    { path: '/actualizador',   name: 'actualizador',  component: ActualizadorView },
    { path: '/pedidos',        name: 'pedidos',        component: PedidosCtrlView },
    { path: '/triangulacion',  name: 'triangulacion',  component: TriangulacionView },
  ],
});

export default router;
