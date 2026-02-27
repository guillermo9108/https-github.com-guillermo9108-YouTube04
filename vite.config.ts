import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRÍTICO: Permite que la app funcione en subcarpetas de un NAS o servidor local
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Forzar a Vite a usar la versión distribuida de jsmediatags para evitar errores de bundling CommonJS
      'jsmediatags': 'jsmediatags/dist/jsmediatags.min.js'
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'lucide-react'],
          ai: ['@google/genai']
        }
      }
    }
  }
})