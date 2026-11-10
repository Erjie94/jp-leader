const KEY = 'jp-leader-onboarding-done'

export function isOnboardingDone(): boolean {
  return localStorage.getItem(KEY) === '1'
}

export function completeOnboarding(): void {
  localStorage.setItem(KEY, '1')
}

export function resetOnboarding(): void {
  localStorage.removeItem(KEY)
}
