import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // bind 0.0.0.0 so Caddy can reach the dev server
    port: 5173,
  },
})
