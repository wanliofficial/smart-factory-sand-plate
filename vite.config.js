import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), wgslVitePlugin()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5188,
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        park: resolve(root, 'park/index.html'),
        energy: resolve(root, 'energy/index.html'),
        crystal: resolve(root, 'crystal/index.html'),
        gears: resolve(root, 'gears/index.html'),
        quantum: resolve(root, 'quantum/index.html'),
        city: resolve(root, 'city/index.html'),
      },
    },
  },
})
