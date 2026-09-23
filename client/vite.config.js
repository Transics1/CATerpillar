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
      // Off in dev by default, which makes an offline refresh a blank page.
      devOptions: { enabled: true, type: 'module' }
    })
  ],
  server: {
    host: true,
    port: 5173,
    // Vite 403s Host headers it does not recognise. Allow tunnel providers by suffix rather
    // than disabling the check - the hostname changes on every run.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
    // One origin for client and API: a single tunnel URL, and no CORS to get wrong.
    proxy: {
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true }
    }
  }
})
