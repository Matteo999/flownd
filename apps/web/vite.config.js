import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // In locale /api/* va al backend avviato con `npm run dev:api`.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
