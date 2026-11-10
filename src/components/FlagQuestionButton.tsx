import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { flagQuizItem, type FlaggedKind } from '../lib/db'

export interface FlagQuestionPayload {
  kind: FlaggedKind
  mode?: string
  prompt: string
  sentence?: string
  passage?: string
  answer: string
  choices: string[]
  explanation?: string
  quizId?: string
}

interface Props {
  item: FlagQuestionPayload
  /** 標記成功後（通常用來跳過本題） */
  onFlagged?: () => void
}

/** 題目區塊右上角：紅色標記圖示 */
export function FlagQuestionButton({ item, onFlagged }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const flag = async () => {
    if (busy || done) return
    setBusy(true)
    try {
      await flagQuizItem(item)
      setDone(true)
      onFlagged?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`flag-icon-btn${done ? ' is-done' : ''}`}
      disabled={busy || done}
      onClick={() => void flag()}
      title={done ? t('flag.done') : t('flag.hint')}
      aria-label={done ? t('flag.done') : t('flag.button')}
    >
      {busy ? (
        <span className="flag-icon-busy" aria-hidden />
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
          <path
            fill="currentColor"
            d="M6 3a1 1 0 0 0-1 1v16a1 1 0 1 0 2 0v-6h.17l.1.03C9.4 14.6 11.2 15 13 15c1.9 0 3.5-.5 5.1-1.4A1 1 0 0 0 19 12.7V5.3a1 1 0 0 0-1.4-.9C16 5.1 14.5 5.5 12.7 5.5c-1.7 0-3.3-.4-5-.9A1 1 0 0 0 7 4.5V4a1 1 0 0 0-1-1z"
          />
        </svg>
      )}
    </button>
  )
}

/** 包住題幹／選項，右上角放標記圖示 */
export function QuestionBlock({
  children,
  flag,
}: {
  children: ReactNode
  flag: ReactNode
}) {
  return (
    <div className="question-block">
      {flag}
      {children}
    </div>
  )
}
