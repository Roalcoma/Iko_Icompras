import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import LoginView          from '../pages/LoginView.vue';
import CatalogoView       from '../pages/CatalogoView.vue';
import CarritoView        from '../pages/CarritoView.vue';
import PedidosEstatusView from '../pages/PedidosEstatusView.vue';
import PedidosEdicionView from '../pages/PedidosEdicionView.vue';
import BackOfficeView     from '../pages/BackOfficeView.vue';
import PromocionesView    from '../pages/PromocionesView.vue';
import ClientesAdminView  from '../pages/ClientesAdminView.vue';
import AprobacionPsicotropicosView from '../pages/AprobacionPsicotropicosView.vue';
import ReclamosView       from '../pages/ReclamosView.vue';
import EcommerceView      from '../pages/EcommerceView.vue';
import AuditoriaView      from '../pages/AuditoriaView.vue';
import RuteroView         from '../pages/RuteroView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login',            name: 'login',           component: LoginView,          meta: { public: true } },
    { path: '/',                 name: 'catalogo',        component: CatalogoView,       meta: { ruta: '/' } },
    { path: '/carrito',          name: 'carrito',         component: CarritoView,        meta: { ruta: '/carrito' } },
    { path: '/pedidos-estatus',  name: 'estatus',         component: PedidosEstatusView, meta: { ruta: '/pedidos-estatus' } },
    { path: '/pedidos-edicion',  name: 'pedidos-edicion', component: PedidosEdicionView, meta: { ruta: '/pedidos-edicion' } },
    { path: '/backoffice',       name: 'backoffice',      component: BackOfficeView,     meta: { ruta: '/backoffice', soloAdmin: true } },
    { path: '/promociones',      name: 'promociones',     component: PromocionesView,    meta: { ruta: '/promociones' } },
    { path: '/gestion-clientes', name: 'gestion-clientes',component: ClientesAdminView,  meta: { ruta: '/gestion-clientes' } },
    { path: '/aprobacion-psicotropicos', name: 'aprobacion-psicotropicos', component: AprobacionPsicotropicosView, meta: { ruta: '/aprobacion-psicotropicos' } },
    { path: '/reclamos',         name: 'reclamos',        component: ReclamosView,       meta: { ruta: '/reclamos' } },
    { path: '/ecommerce',        name: 'ecommerce',       component: EcommerceView,      meta: { ruta: '/ecommerce' } },
    { path: '/auditoria',        name: 'auditoria',       component: AuditoriaView,      meta: { ruta: '/auditoria' } },
    { path: '/rutero',           name: 'rutero',          component: RuteroView,         meta: { ruta: '/rutero' } },
  ]
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) return { name: 'login' };

  if (authStore.esAdmin) return true;

  if (to.meta.soloAdmin) {
    const primero = authStore.modulosVisibles[0];
    return primero ? { path: primero.ruta } : { name: 'login' };
  }

  const ruta = to.meta.ruta as string | undefined;
  if (ruta && !authStore.tienePermiso(ruta)) {
    const primero = authStore.modulosVisibles[0];
    return primero ? { path: primero.ruta } : { name: 'login' };
  }

  return true;
});

export default router;
