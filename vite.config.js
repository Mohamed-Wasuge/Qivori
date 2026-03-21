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
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/pdfjs-dist')) return 'pdf'
          if (id.includes('node_modules/@sentry')) return 'sentry'
          if (id.includes('node_modules/html2canvas')) return 'html2canvas'
          if (id.includes('node_modules/lucide-react')) return 'icons'
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
