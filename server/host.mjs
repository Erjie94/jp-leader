/**
 * Windows 個人主機：靜態 dist + GET/PUT /api/library
 * 用法：複製 .env.host.example → .env.host，填 LIBRARY_TOKEN，再 npm run host:build
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvFile(path.join(projectRoot, '.env.host'))

const PORT = Number(process.env.PORT || 8787) || 8787
const LIBRARY_TOKEN = (process.env.LIBRARY_TOKEN || '').trim()
const DIST_DIR = path.resolve(projectRoot, process.env.DIST_DIR || 'dist')
const LIBRARY_PATH = path.resolve(
  projectRoot,
  process.env.LIBRARY_PATH || path.join('data', 'library.json'),
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
}

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
  fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true })
  if (!fs.existsSync(LIBRARY_PATH)) {
    const empty = emptyLibrary()
    fs.writeFileSync(LIBRARY_PATH, `${JSON.stringify(empty, null, 2)}\n`, 'utf8')
    return empty
  }
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'))
  } catch {
    return emptyLibrary()
  }
}

function writeLibraryToDisk(data) {
  const base = emptyLibrary()
  const raw = data && typeof data === 'object' ? data : {}
  const clientUpdatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
      ? raw.updatedAt.trim()
      : new Date().toISOString()
  const snap = {
    version: 1,
    updatedAt: clientUpdatedAt,
    vocab: Array.isArray(raw.vocab) ? raw.vocab : base.vocab,
    phrases: Array.isArray(raw.phrases) ? raw.phrases : base.phrases,
    readingPassages: Array.isArray(raw.readingPassages)
      ? raw.readingPassages
      : base.readingPassages,
    quizBank: Array.isArray(raw.quizBank) ? raw.quizBank : base.quizBank,
    reviewQueue: Array.isArray(raw.reviewQueue) ? raw.reviewQueue : base.reviewQueue,
    practiceLog: Array.isArray(raw.practiceLog) ? raw.practiceLog : base.practiceLog,
    flaggedQuizzes: Array.isArray(raw.flaggedQuizzes)
      ? raw.flaggedQuizzes
      : base.flaggedQuizzes,
  }
  fs.mkdirSync(path.dirname(LIBRARY_PATH), { recursive: true })
  const tmp = `${LIBRARY_PATH}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, LIBRARY_PATH)
  return snap
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS,
  })
  res.end(JSON.stringify(data))
}

function checkAuth(req) {
  if (!LIBRARY_TOKEN) return false
  const header = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) return false
  return m[1].trim() === LIBRARY_TOKEN
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent(reqPath.split('?')[0] || '/')
  const cleaned = path.normalize(decoded).replace(/^([/\\])+/, '')
  const full = path.resolve(root, cleaned)
  if (!full.startsWith(path.resolve(root))) return null
  return full
}

async function handleLibrary(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }
  if (!LIBRARY_TOKEN) {
    sendJson(res, 503, {
      error: 'LIBRARY_TOKEN not configured. Copy .env.host.example to .env.host',
    })
    return
  }
  if (!checkAuth(req)) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }
  try {
    if (req.method === 'GET') {
      const data = readLibraryFromDisk()
      sendJson(res, 200, { path: LIBRARY_PATH, data })
      return
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const text = await readBody(req)
      const parsed = text ? JSON.parse(text) : {}
      const data = writeLibraryToDisk(parsed.data ?? parsed)
      sendJson(res, 200, { path: LIBRARY_PATH, data })
      return
    }
    sendJson(res, 405, { error: 'method not allowed' })
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

function serveStatic(req, res) {
  const urlPath = (req.url || '/').split('?')[0] || '/'
  let filePath = safeJoin(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('dist not found. Run npm run build first.')
    return
  }
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0] || '/'
  if (urlPath === '/api/library' || urlPath.startsWith('/api/library/')) {
    void handleLibrary(req, res)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405)
    res.end('Method Not Allowed')
    return
  }
  serveStatic(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[jp-leader host] http://127.0.0.1:${PORT}`)
  console.log(`[jp-leader host] library: ${LIBRARY_PATH}`)
  console.log(`[jp-leader host] dist: ${DIST_DIR}`)
  if (!LIBRARY_TOKEN) {
    console.warn('[jp-leader host] WARNING: LIBRARY_TOKEN missing — /api/library will return 503')
  } else {
    console.log('[jp-leader host] LIBRARY_TOKEN: configured')
  }
})
