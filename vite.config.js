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
          // Only split heavy node_modules — let Rollup handle app code via lazy() boundaries
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/') || id.includes('@supabase')) return 'vendor'
            if (id.includes('jspdf') || id.includes('pdfjs-dist')) return 'pdf'
            if (id.includes('@sentry')) return 'sentry'
            if (id.includes('html2canvas')) return 'html2canvas'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('retell-client') || id.includes('livekit-client')) return 'retell'
          }
        }
      }
    }
  }
})
