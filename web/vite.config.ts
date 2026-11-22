import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'

const appInfo = readFileSync(
  new URL('../build/macos/Info.plist', import.meta.url),
  'utf8',
)
const appVersion = appInfo
  .match(
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
  )?.[1]
  .trim()
if (!appVersion)
  throw new Error('Missing CFBundleShortVersionString in Info.plist')

export default defineConfig(({ mode }) => {
  const cloud = mode === 'sync'
  return {
    define: { 'import.meta.env.FAMO_VERSION': JSON.stringify(appVersion) },
    plugins: [
      react(),
      tailwindcss(),
      !cloud && {
        name: 'keep-embed-placeholder',
        closeBundle() {
          writeFileSync(new URL('./dist/.gitkeep', import.meta.url), '')
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      outDir: cloud ? 'dist-sync' : 'dist',
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          ...(!cloud && {
            menuBar: fileURLToPath(new URL('./menu-bar.html', import.meta.url)),
          }),
        },
      },
    },
    server: {
      strictPort: true,
      ...(!cloud && { proxy: { '/api': 'http://127.0.0.1:8787' } }),
    },
  }
})
