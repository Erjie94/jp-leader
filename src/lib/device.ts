/** Chromebook／低功耗瀏覽器：建議勿自動載入本機 WebLLM */

export function isDesktopApp(): boolean {
  return Boolean(typeof window !== 'undefined' && window.jpLeaderDesktop?.isDesktop)
}

export function isChromeOs(): boolean {
  if (typeof navigator === 'undefined') return false
  return /CrOS/i.test(navigator.userAgent || '')
}

/** 粗判：觸控＋小螢幕 */
export function isCoarseMobileWeb(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const touch =
    navigator.maxTouchPoints > 0 ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches)
  const small = window.innerWidth > 0 && window.innerWidth <= 1024
  return touch && small
}

/** 非桌面 Electron，且為 CrOS／觸控小螢幕 → 低功耗預設 */
export function isLowPowerWebClient(): boolean {
  if (isDesktopApp()) return false
  if (isChromeOs()) return true
  if (isCoarseMobileWeb()) return true
  return false
}
