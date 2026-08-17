import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/favicon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/apple-touch-icon.png',
        'brand/logo-revi-dark.svg',
      ],
      manifest: {
        name: 'Revi | Captura de Leads',
        short_name: 'Revi Captura',
        description: 'Captacao de leads em eventos presenciais',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000011',
        theme_color: '#000011',
        lang: 'pt-BR',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Arquivo proprio: o maskable precisa de margem, senao o Android
          // recorta o simbolo ao aplicar a mascara circular.
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell em cache: o app precisa abrir offline inclusive em cold start.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        // Nunca deixe o SW responder chamadas de API pelo cache: dados de lead
        // sao gerenciados pelo IndexedDB, nao pelo cache HTTP.
        navigateFallbackDenylist: [/^\/api/, /^\/functions/],
        runtimeCaching: [
          {
            // Supabase/Edge Functions: sempre rede. Se falhar, a fila local resolve.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        // Permite testar o comportamento offline com `npm run dev`.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
})
