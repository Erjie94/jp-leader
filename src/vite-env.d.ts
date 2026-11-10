/// <reference types="vite/client" />

interface JpLeaderLibrarySnapshot {
  version: number
  updatedAt: string
  vocab: unknown[]
  phrases: unknown[]
  readingPassages: unknown[]
  quizBank: unknown[]
  reviewQueue: unknown[]
  practiceLog: unknown[]
  flaggedQuizzes: unknown[]
}

interface JpLeaderDesktop {
  isDesktop: boolean
  platform: string
  googleTranslate?: (params: {
    sl: string
    tl: string
    q: string
  }) => Promise<unknown>
  readLibrary?: () => Promise<JpLeaderLibrarySnapshot>
  writeLibrary?: (data: JpLeaderLibrarySnapshot) => Promise<JpLeaderLibrarySnapshot>
  getLibraryPath?: () => Promise<string>
}

interface Window {
  jpLeaderDesktop?: JpLeaderDesktop
}
