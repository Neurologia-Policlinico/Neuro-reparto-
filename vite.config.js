import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH: sottocartella in cui viene pubblicata l'app
// (es. "/neuro-reparto/" su GitHub Pages). Di default la radice "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { host: true },
})
