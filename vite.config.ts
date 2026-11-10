import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type ViteDevServer } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const libraryFile = path.join(projectRoot, 'data', 'library.json')

function emptyLibrary() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    vocab: [],
    phrases: [],
    readingPassages: [],
    quizBank: [],
    reviewQueue: [],
    practiceLog: [],
    flaggedQuizzes: [],
  }
}

function readLibraryFromDisk() {
  fs.mkdirSync(path.dirname(libraryFile), { recursive: true })
  if (!fs.existsSync(libraryFile)) {
    const empty = emptyLibrary()
    fs.writeFileSync(libraryFile, `${JSON.stringify(empty, null, 2)}\n`, 'utf8')
    return empty
  }
  try {
    return JSON.parse(fs.readFileSync(libraryFile, 'utf8')) as ReturnType<typeof emptyLibrary>
  } catch {
    return emptyLibrary()
  }
}

function writeLibraryToDisk(data: unknown) {
  const base = emptyLibrary()
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const snap = {
    version: 1,
    updatedAt: new Date().toISOString(),
    vocab: Array.isArray(raw.vocab) ? raw.vocab : base.vocab,
    phrases: Array.isArray(raw.phrases) ? raw.phrases : base.phrases,
    readingPassages: Array.isArray(raw.readingPassages) ? raw.readingPassages : base.readingPassages,
    quizBank: Array.isArray(raw.quizBank) ? raw.quizBank : base.quizBank,
    reviewQueue: Array.isArray(raw.reviewQueue) ? raw.reviewQueue : base.reviewQueue,
    practiceLog: Array.isArray(raw.practiceLog) ? raw.practiceLog : base.practiceLog,
    flaggedQuizzes: Array.isArray(raw.flaggedQuizzes) ? raw.flaggedQuizzes : base.flaggedQuizzes,
  }
  fs.mkdirSync(path.dirname(libraryFile), { recursive: true })
  const tmp = `${libraryFile}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, libraryFile)
  return snap
}

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function attachLibraryApi(server: ViteDevServer) {
  server.middlewares.use('/api/library', (req, res, next) => {
    void (async () => {
      try {
        if (req.method === 'GET') {
          const data = readLibraryFromDisk()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ path: libraryFile, data }))
          return
        }
        if (req.method === 'PUT' || req.method === 'POST') {
          const text = await readRequestBody(req)
          const parsed = text ? JSON.parse(text) : {}
          const data = writeLibraryToDisk(parsed.data ?? parsed)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ path: libraryFile, data }))
          return
        }
        res.statusCode = 405
        res.end(JSON.stringify({ error: 'method not allowed' }))
      } catch (e) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
      }
    })().catch(next)
  })
}

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
    {
      name: 'jp-leader-library-file',
      configureServer(server) {
        attachLibraryApi(server)
      },
      configurePreviewServer(server) {
        attachLibraryApi(server)
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
            // 題庫 API 絕不快取，否則跨瀏覽器會讀到舊資料
            urlPattern: /\/api\/library$/i,
            handler: 'NetworkOnly',
          },
          {
            // 大型靜態資料改執行時快取，失敗不阻斷安裝
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
