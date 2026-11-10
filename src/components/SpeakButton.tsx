import { useTranslation } from 'react-i18next'
import { speakJapanese, stopSpeaking } from '../lib/tts'

export function SpeakButton({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation()
  if (!text?.trim()) return null
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        stopSpeaking()
        speakJapanese(text)
      }}
    >
      {label ?? t('tts.speak')}
    </button>
  )
}
