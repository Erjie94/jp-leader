const fs = require('fs')
const path = require('path')

const LIBRARY_VERSION = 1

function emptySnapshot() {
  return {
    version: LIBRARY_VERSION,
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function normalizeSnapshot(raw) {
  const base = emptySnapshot()
  if (!raw || typeof raw !== 'object') return base
  return {
    version: typeof raw.version === 'number' ? raw.version : LIBRARY_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    vocab: Array.isArray(raw.vocab) ? raw.vocab : [],
    phrases: Array.isArray(raw.phrases) ? raw.phrases : [],
    readingPassages: Array.isArray(raw.readingPassages) ? raw.readingPassages : [],
    quizBank: Array.isArray(raw.quizBank) ? raw.quizBank : [],
    reviewQueue: Array.isArray(raw.reviewQueue) ? raw.reviewQueue : [],
    practiceLog: Array.isArray(raw.practiceLog) ? raw.practiceLog : [],
    flaggedQuizzes: Array.isArray(raw.flaggedQuizzes) ? raw.flaggedQuizzes : [],
  }
}

function isEmptySnapshot(snap) {
  return (
    !snap.vocab.length &&
    !snap.phrases.length &&
    !snap.readingPassages.length &&
    !snap.quizBank.length &&
    !snap.reviewQueue.length &&
    !snap.practiceLog.length &&
    !snap.flaggedQuizzes.length
  )
}

function readLibraryFile(filePath) {
  ensureDir(path.dirname(filePath))
  if (!fs.existsSync(filePath)) {
    const empty = emptySnapshot()
    fs.writeFileSync(filePath, `${JSON.stringify(empty, null, 2)}\n`, 'utf8')
    return empty
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return normalizeSnapshot(raw)
  } catch {
    return emptySnapshot()
  }
}

function writeLibraryFile(filePath, data) {
  ensureDir(path.dirname(filePath))
  const snap = normalizeSnapshot(data)
  snap.updatedAt = new Date().toISOString()
  snap.version = LIBRARY_VERSION
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, filePath)
  return snap
}

/**
 * @param {{ projectRoot?: string, userDataDir?: string, packaged?: boolean }} opts
 */
function resolveLibraryPath(opts = {}) {
  const packaged = Boolean(opts.packaged)
  if (!packaged && opts.projectRoot) {
    return path.join(opts.projectRoot, 'data', 'library.json')
  }
  if (opts.userDataDir) {
    return path.join(opts.userDataDir, 'data', 'library.json')
  }
  if (opts.projectRoot) {
    return path.join(opts.projectRoot, 'data', 'library.json')
  }
  throw new Error('resolveLibraryPath: missing projectRoot/userDataDir')
}

module.exports = {
  LIBRARY_VERSION,
  emptySnapshot,
  normalizeSnapshot,
  isEmptySnapshot,
  readLibraryFile,
  writeLibraryFile,
  resolveLibraryPath,
}
