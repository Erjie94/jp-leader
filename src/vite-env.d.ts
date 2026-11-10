/// <reference types="vite/client" />

interface JpLeaderDesktop {
  isDesktop: boolean
  platform: string
  googleTranslate?: (params: {
    sl: string
    tl: string
    q: string
  }) => Promise<unknown>
}

interface Window {
  jpLeaderDesktop?: JpLeaderDesktop
}
