import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'intranet.lanchoneteshalom',
      'intranet.lanchoneteshalom.local',
      '100.82.234.51',
      '192.168.15.9',
      'https://containing-hydrogen-involves-quilt.trycloudflare.com'
    ]
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: [
      'intranet.lanchoneteshalom',
      'intranet.lanchoneteshalom.local',
      '100.82.234.51',
      '192.168.15.9',
      'https://containing-hydrogen-involves-quilt.trycloudflare.com'
    ]
  }
})
