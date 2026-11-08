import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// L'app è pubblicata su https://edobartobf.github.io/food-shopper/
const BASE = '/food-shopper/'

export default defineConfig({
  base: BASE,
  plugins: [
    vue(),
    VitePWA({
      // Service worker scritto a mano: serve per ricevere screenshot dal menu "Condividi" (POST multipart)
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'icona-192.png', 'icona-512.png'],
      manifest: {
        name: 'Dispensa',
        short_name: 'Dispensa',
        description: 'Ricettario e lista della spesa condivisi',
        lang: 'it',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f4ef',
        theme_color: '#2f6b4f',
        icons: [
          { src: 'icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icona-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: `${BASE}condividi`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'immagini', accept: ['image/*'] }],
          },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
})
