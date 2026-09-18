import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite'

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
  },
})
