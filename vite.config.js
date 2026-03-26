import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core vendor libs
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/@supabase')) return 'vendor'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/pdfjs-dist')) return 'pdf'
          if (id.includes('node_modules/@sentry')) return 'sentry'
          if (id.includes('node_modules/html2canvas')) return 'html2canvas'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (id.includes('node_modules/retell-client') || id.includes('node_modules/livekit-client')) return 'retell'
          // Shared infrastructure — MUST be in own chunks to prevent TDZ errors
          if (id.includes('context/AppContext')) return 'app-core'
          if (id.includes('context/CarrierContext')) return 'carrier-context'
          if (id.includes('lib/supabase') || id.includes('lib/api.js')) return 'api'
          if (id.includes('lib/database')) return 'database'
          if (id.includes('lib/i18n')) return 'i18n'
          if (id.includes('lib/analytics') || id.includes('lib/conversion-funnel')) return 'analytics'
          if (id.includes('utils/generatePDF')) return 'pdf-utils'
          if (id.includes('pages/carrier/shared')) return 'carrier-shared'
          if (id.includes('hooks/useSubscription')) return 'app-core'
          // Split carrier sub-modules into separate chunks
          if (id.includes('components/carrier/SettingsTab')) return 'carrier-settings'
          if (id.includes('components/carrier/DispatchTab')) return 'carrier-dispatch'
          if (id.includes('components/carrier/ProfitIQTab')) return 'carrier-profitiq'
          if (id.includes('components/carrier/LoadsPipeline')) return 'carrier-pipeline'
          if (id.includes('components/carrier/Overlays')) return 'carrier-overlays'
          if (id.includes('components/carrier/OnboardingWizard')) return 'carrier-onboarding'
          if (id.includes('components/carrier/OverviewTab')) return 'carrier-overview'
          // Split mobile sub-modules
          if (id.includes('components/mobile/MobileChatTab')) return 'mobile-chat'
          if (id.includes('components/mobile/MobileHomeTab')) return 'mobile-home'
          if (id.includes('components/mobile/MobileLoadsTab')) return 'mobile-loads'
          if (id.includes('components/mobile/MobileMoneyTab')) return 'mobile-money'
          if (id.includes('components/mobile/MobileIFTATab')) return 'mobile-ifta'
        }
      }
    }
  }
})
