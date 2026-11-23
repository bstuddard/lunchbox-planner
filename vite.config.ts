import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwind from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { developmentFiles, release } from './build/release'
import { validators } from './build/validators'
const base = process.env.PLANNER_BASE || '/'
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw Error('PLANNER_BASE must be an absolute directory path ending in /.')
export default defineConfig({
  base,
  build: { license: { fileName: 'dependency-licenses.txt' } },
  plugins: [
    vue(),
    tailwind(),
    validators(),
    developmentFiles(),
    release(),
    VitePWA({
      registerType: 'prompt',
      scope: base,
      base,
      injectRegister: false,
      manifest: {
        id: base,
        name: 'Lunchbox Planner',
        short_name: 'Lunchbox',
        description: 'Plan school lunches and check off what you pack.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#faf9f6',
        theme_color: '#203f32',
        icons: [
          {
            src: base + 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: base + 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: base + 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
})
