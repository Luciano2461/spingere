import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Pages serve l'app sotto /spingere/; in locale usare `npm run dev`.
export default defineConfig({
  base: '/spingere/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Spingere',
        short_name: 'Spingere',
        description: 'Diario degli allenamenti in palestra, 100% offline.',
        lang: 'it',
        start_url: '/spingere/',
        scope: '/spingere/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ea4b23',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // .mjs: worker di pdf.js (import PDF), così funziona anche offline
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,json,webmanifest}'],
        // schermate di avvio: le usa iOS solo quando si aggiunge l'app alla Home, non servono offline
        globIgnores: ['splash/**'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Immagini esercizi: non nel precache, ma in cache al primo uso (o da Impostazioni → scarica tutto).
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/exercises/') && url.pathname.endsWith('.webp'),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', expiration: { maxEntries: 2500 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
