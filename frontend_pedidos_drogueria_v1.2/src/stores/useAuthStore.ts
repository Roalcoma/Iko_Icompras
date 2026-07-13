import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

const API = `${import.meta.env.VITE_API_URL}/auth`;

export interface ModuloPermiso {
    codigo: string;
    nombre: string;
    ruta: string;
    icono: string;
    orden: number;
    puede_ver: boolean;
}

export interface UsuarioAuth {
    id: number | string;
    usuario: string;
    visibilidad: number;
    codVendedor?: number | null;
    es_admin: boolean;
    modulos: ModuloPermiso[];
}

const STORAGE_KEY = 'auth_session';
const INACTIVITY_MS = 7 * 60 * 60 * 1000;

export const useAuthStore = defineStore('auth', () => {
    const stored  = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    const token   = ref<string | null>(stored?.token ?? null);
    const usuario = ref<UsuarioAuth | null>(stored?.usuario ?? null);

    if (token.value) axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;

    const modoPruebas = ref(false);

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
        if (!token.value) return;
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => logout(), INACTIVITY_MS);
    };

    const startActivityWatcher = () => {
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
            window.addEventListener(evt, resetInactivityTimer, { passive: true })
        );
        resetInactivityTimer();
    };

    const stopActivityWatcher = () => {
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
            window.removeEventListener(evt, resetInactivityTimer)
        );
        if (inactivityTimer) clearTimeout(inactivityTimer);
    };

    if (token.value) startActivityWatcher();

    // Interceptor global: cualquier 401 (excepto el login) cierra la sesión automáticamente
    axios.interceptors.response.use(
        res => res,
        err => {
            if (err.response?.status === 401 && token.value && !err.config?.url?.includes('/auth/login')) {
                logout();
            }
            return Promise.reject(err);
        }
    );

    const aplicarHeaderModoPruebas = () => {
        if (modoPruebas.value) {
            axios.defaults.headers.common['X-Modo-Pruebas'] = 'true';
        } else {
            delete axios.defaults.headers.common['X-Modo-Pruebas'];
        }
    };

    const toggleModoPruebas = () => {
        modoPruebas.value = !modoPruebas.value;
        aplicarHeaderModoPruebas();
    };

    const isAuthenticated = computed(() => !!token.value && !!usuario.value);
    const esAdmin         = computed(() => usuario.value?.es_admin ?? false);

    const modulosVisibles = computed<ModuloPermiso[]>(() =>
        (usuario.value?.modulos ?? [])
            .filter(m => m.puede_ver)
            .sort((a, b) => a.orden - b.orden)
    );

    const tienePermiso = (ruta: string): boolean =>
        modulosVisibles.value.some(m => m.ruta === ruta);

    const login = async (clave: string): Promise<{ success: boolean; message: string }> => {
        try {
            const res = await axios.post(`${API}/login`, { clave });
            if (res.data.success) {
                token.value = res.data.token;
                usuario.value = res.data.usuario;
                axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: res.data.token, usuario: res.data.usuario }));
                startActivityWatcher();
                return { success: true, message: 'Login exitoso' };
            }
            return { success: false, message: res.data.message };
        } catch (error: any) {
            return { success: false, message: error.response?.data?.message ?? 'Error de conexión con el servidor' };
        }
    };

    const logout = () => {
        token.value   = null;
        usuario.value = null;
        delete axios.defaults.headers.common['Authorization'];
        localStorage.removeItem(STORAGE_KEY);
        stopActivityWatcher();
    };

    return { token, usuario, isAuthenticated, esAdmin, modulosVisibles, tienePermiso, login, logout, modoPruebas, toggleModoPruebas, resetInactivityTimer };
});
