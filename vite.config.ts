/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { legal } from './src/config/legal.js'

export default defineConfig({
  plugins: [react(), {
    name: 'titre-produit',
    transformIndexHtml: () => [{ tag: 'title', children: legal.productName, injectTo: 'head' }],
  }],
  server: { port: 5199, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
