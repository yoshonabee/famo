import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { writeFileSync } from 'node:fs'
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'keep-embed-placeholder',
      closeBundle() {
        writeFileSync(new URL('./dist/.gitkeep', import.meta.url), '')
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
})
