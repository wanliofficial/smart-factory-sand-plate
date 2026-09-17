import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对路径产物：便于部署到任意子目录；本地查看请用 npm run preview（ES module 不能用 file:// 直接打开）
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    chunkSizeWarningLimit: 2000
  }
})
