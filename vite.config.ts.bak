import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VERCEL ? '/' : './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://swampland-situated-barbell.ngrok-free.dev',
        changeOrigin: true,
      },
      '/images': {
        target: 'https://swampland-situated-barbell.ngrok-free.dev',
        changeOrigin: true,
      }
    }
  }
})
