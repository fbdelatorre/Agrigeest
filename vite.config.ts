import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode !== 'native' && VitePWA({
      filename: 'service-worker.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png'],
      manifest: {
        id: '/',
        name: 'AgriGest - Gestão Agrícola',
        short_name: 'AgriGest',
        description: 'Aplicativo de gestão agrícola para controle de áreas, operações e estoque',
        lang: 'pt-BR',
        theme_color: '#2D5E40',
        background_color: '#f0f9f1',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['maplibre-gl'],
  },
}));
