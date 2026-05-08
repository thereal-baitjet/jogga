import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['app-icon-logo.png', 'mainLogo.png', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        manifest: {
          name: 'Jogga',
          short_name: 'Jogga',
          description: 'Personalized adaptive AI running coach.',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'app-icon-logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'app-icon-logo.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'app-icon-logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/__\/auth\//, /^\/__\/firebase\//],
          runtimeCaching: [
            {
              urlPattern: /\/__\/auth\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'firebase-auth-network-only',
              },
            },
            {
              urlPattern: /\/__\/firebase\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'firebase-init-network-only',
              },
            },
            {
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheName: 'api-network-only',
              },
            },
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'firestore-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase';
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
            if (id.includes('/lucide-react/')) return 'icons';
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
