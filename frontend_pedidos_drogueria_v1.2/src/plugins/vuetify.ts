import { createVuetify } from 'vuetify'
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#0891B2',
          'primary-darken-1': '#0E7490',
          secondary: '#059669',
          'secondary-darken-1': '#047857',
          accent: '#22D3EE',
          error: '#DC2626',
          warning: '#F59E0B',
          info: '#0891B2',
          success: '#059669',
          background: '#F0FDFA',
          surface: '#FFFFFF',
          'surface-variant': '#E8F1F6',
          'on-primary': '#FFFFFF',
          'on-secondary': '#FFFFFF',
          'on-surface': '#164E63',
          'on-background': '#164E63',
        },
      },
      dark: {
        colors: {
          primary: '#22D3EE',
          'primary-darken-1': '#0891B2',
          secondary: '#34D399',
          'secondary-darken-1': '#059669',
          accent: '#67E8F9',
          error: '#F87171',
          warning: '#FBBF24',
          info: '#22D3EE',
          success: '#34D399',
          background: '#0F172A',
          surface: '#1E293B',
          'surface-variant': '#334155',
          'on-primary': '#0F172A',
          'on-secondary': '#0F172A',
          'on-surface': '#E2E8F0',
          'on-background': '#E2E8F0',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
    },
    VCard: {
      rounded: 'xl',
      elevation: 2,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
  },
})
