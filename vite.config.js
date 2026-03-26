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
    // No manualChunks — let Rollup handle ALL chunk splitting naturally.
    // manualChunks causes TDZ (Cannot access 'X' before initialization) errors
    // in production because it forces modules into chunks that break initialization order.
    // React.lazy() boundaries already provide proper code splitting.
  }
})
