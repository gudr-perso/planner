import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/notion-api': {
        target: 'https://api.notion.com/v1',
        rewrite: (path) => path.replace(/^\/notion-api/, ''),
        changeOrigin: true,
      },
    },
  },
})
