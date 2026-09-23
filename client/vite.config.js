import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'CAT Copilot',
        short_name: 'Copilot',
        description: 'Smart Operator Assistant for CAT machinery',
        theme_color: '#FFCD11',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: '/index.html'
      },
      // The service worker is off in dev by default, which means a refresh while offline shows
      // a blank page - the offline demo failing in the worst possible way. Enabled so the dev
      // server behaves like the built app.
      devOptions: { enabled: true, type: 'module' }
    })
  ],
  server: {
    host: true,
    port: 5173,
    // Vite rejects Host headers it does not recognise, which 403s every tunnel URL. Allow the
    // tunnel providers by domain suffix rather than disabling the check outright - the
    // hostname changes on every `cloudflared tunnel` run, so pinning one is not workable.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
    // Proxying keeps the client and API on one origin, so the phone only ever needs a single
    // tunnel URL and there is no CORS or mixed-content handling to get wrong on demo day.
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true }
    }
  }
})
