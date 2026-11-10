import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

async function proxyGoogleTranslate(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
) {
  try {
    const host = req.headers.host ?? '127.0.0.1'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const q = url.searchParams.get('q')?.trim() ?? ''
    const sl = url.searchParams.get('sl') ?? 'auto'
    const tl = url.searchParams.get('tl') ?? 'zh-TW'
    if (!q) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'missing q' }))
      return
    }
    const target = new URL('https://translate.googleapis.com/translate_a/single')
    target.searchParams.set('client', 'gtx')
    target.searchParams.set('sl', sl)
    target.searchParams.set('tl', tl)
    target.searchParams.set('q', q)
    const upstream = await fetch(`${target.toString()}&dt=t&dt=rm`)
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}

export default defineConfig({
  base: './',
  // Linux／Chromebook 上 WebLLM 需要跨來源隔離才能用 SharedArrayBuffer
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  plugins: [
    {
      name: 'jp-leader-gtx-proxy',
      configureServer(server) {
        server.middlewares.use('/api/gtx', (req, res) => {
          void proxyGoogleTranslate(req, res)
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/gtx', (req, res) => {
          void proxyGoogleTranslate(req, res)
        })
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 開發模式不註冊 SW，避免 Cache.add 網路錯誤干擾
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'templates/vocab-import-template.csv'],
      manifest: {
        name: '日習 JP Leader',
        short_name: '日習',
        description: '可離線的日文打字練習與測驗',
        theme_color: '#1a3a4a',
        background_color: '#f3eee4',
        display: 'standalone',
        lang: 'zh-Hant',
        start_url: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // 不預快取大型資料／巨量 JS，降低 Cache.add 失敗機率
        globPatterns: ['**/*.{html,ico,svg,woff2}', 'assets/index-*.css', 'assets/index-*.js'],
        globIgnores: ['**/assets/lib-*.js', '**/sw.js', '**/workbox-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // 大型資料改執行時快取，失敗不阻斷安裝
            urlPattern: /\/data\/.*\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jp-leader-data',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
