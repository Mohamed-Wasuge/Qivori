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
    // ⛔ DO NOT ADD manualChunks HERE — IT WILL CRASH PRODUCTION ⛔
    // manualChunks causes "Cannot access 'X' before initialization" (TDZ) errors
    // because it forces modules into chunks that break Rollup's initialization order.
    // React.lazy() boundaries already handle code splitting correctly.
    // Pre-push hook will block any push that adds manualChunks.
    // See: commits 88dcd89, 1938f09, 38d39c8, f6b86a6 (March 2026 incident)
  }
})
