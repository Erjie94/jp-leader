import { afterEach, describe, expect, it, vi } from 'vitest'

describe('device helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('detects CrOS as low power', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      jpLeaderDesktop: undefined,
      innerWidth: 1280,
      matchMedia: () => ({ matches: false }),
    })
    const { isChromeOs, isLowPowerWebClient } = await import('./device')
    expect(isChromeOs()).toBe(true)
    expect(isLowPowerWebClient()).toBe(true)
  })

  it('desktop app is not low power even on CrOS ua', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; CrOS x86_64)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      jpLeaderDesktop: { isDesktop: true },
      innerWidth: 800,
      matchMedia: () => ({ matches: true }),
    })
    const { isLowPowerWebClient } = await import('./device')
    expect(isLowPowerWebClient()).toBe(false)
  })

  it('touch + small screen is low power without CrOS', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', {
      jpLeaderDesktop: undefined,
      innerWidth: 900,
      matchMedia: () => ({ matches: true }),
    })
    const { isLowPowerWebClient, isCoarseMobileWeb } = await import('./device')
    expect(isCoarseMobileWeb()).toBe(true)
    expect(isLowPowerWebClient()).toBe(true)
  })
})
