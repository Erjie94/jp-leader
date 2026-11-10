/** Web Speech API 日文朗讀 */
export function speakJapanese(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ja-JP'
  utter.rate = 0.92
  const voices = window.speechSynthesis.getVoices()
  const ja = voices.find((v) => v.lang.startsWith('ja'))
  if (ja) utter.voice = ja
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}
