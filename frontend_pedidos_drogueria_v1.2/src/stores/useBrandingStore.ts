import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';
import defaultLogo from '../assets/drogueria_logo.png';

const CACHE_KEY = 'app_branding';
const API = `${import.meta.env.VITE_API_URL}/api/branding`;

export const darkenHex = (hex: string, amount = 0.15): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (n >> 16) - Math.round((n >> 16) * amount));
    const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(((n >> 8) & 0xff) * amount));
    const b = Math.max(0, (n & 0xff) - Math.round((n & 0xff) * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export const lightenHex = (hex: string, amount = 0.3): string => {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (n >> 16) + Math.round((255 - (n >> 16)) * amount));
    const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * amount));
    const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export const useBrandingStore = defineStore('branding', () => {
    const cached     = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    const primary    = ref<string>(cached?.primary    ?? '#0891B2');
    const secondary  = ref<string>(cached?.secondary  ?? '#059669');
    const logoBase64 = ref<string | null>(cached?.logoBase64 ?? null);

    const logo = computed<string>(() => logoBase64.value ?? (defaultLogo as string));

    const _persist = () => localStorage.setItem(CACHE_KEY, JSON.stringify({
        primary: primary.value, secondary: secondary.value, logoBase64: logoBase64.value,
    }));

    const init = async () => {
        try {
            const res = await axios.get(API);
            if (res.data.success) {
                const d = res.data.data;
                primary.value    = d.primary    ?? primary.value;
                secondary.value  = d.secondary  ?? secondary.value;
                logoBase64.value = d.logoBase64  ?? null;
                _persist();
            }
        } catch { /* keep cached / defaults */ }
    };

    const update = async (data: { primary: string; secondary: string; logoBase64: string | null }) => {
        await axios.put(API, data);
        primary.value    = data.primary;
        secondary.value  = data.secondary;
        logoBase64.value = data.logoBase64;
        _persist();
    };

    return { primary, secondary, logoBase64, logo, init, update };
});
