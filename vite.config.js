import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'carrier-pages': ['./src/pages/CarrierPages.jsx'],
          'broker-pages': ['./src/pages/BrokerPages.jsx'],
          'vendor': ['react', 'react-dom'],
        }
      }
    }
  }
})
