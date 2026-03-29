import tailwindcss from '@tailwindcss/vite'
import preact from '@preact/preset-vite'
import bedframeConfig from './src/_config/bedframe.config'
import { resolve } from 'node:path'
import { bedframe } from '@bedframe/core'
import { defineConfig } from 'vite'

// https://vite.dev/config/
const { manifest, pages } = bedframeConfig.extension
const {
  tests,
} = bedframeConfig.development.template.config

export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, './src'),
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    bedframe(manifest),
    preact(),
    tailwindcss(),
  ],
  build: {
    outDir: resolve(__dirname, 'dist', mode),
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
  test: tests,
  server: {
    port: Number(process.env.BEDFRAME_DEV_PORT) || 5173,
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
}))

