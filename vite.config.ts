import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // tauri.conf.json points devUrl at port 1420; without a fixed port Vite
  // falls back to 5173 and `tauri dev` waits forever for the dev server.
  server: {
    port: 1420,
    strictPort: true,
  },
})
