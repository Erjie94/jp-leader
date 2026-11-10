import { clearQuizzes } from './db'
import { purgeForeignQuizzes } from './quiz-bank'

const PHRASE_READING_SCRUB_KEY = 'jp-leader-quiz-scrub-v20261107-drop-phrase-reading'
const FOREIGN_SCRUB_KEY = 'jp-leader-quiz-scrub-v20261107-lang'

/** 一次性清除片語／閱讀題庫，並 scrub 非法語言單字題 */
export async function runOneTimeQuizScrub(): Promise<void> {
  if (localStorage.getItem(PHRASE_READING_SCRUB_KEY) !== '1') {
    try {
      await clearQuizzes('phrase')
      await clearQuizzes('reading')
    } finally {
      localStorage.setItem(PHRASE_READING_SCRUB_KEY, '1')
    }
  }

  if (localStorage.getItem(FOREIGN_SCRUB_KEY) === '1') return
  try {
    await purgeForeignQuizzes()
  } finally {
    localStorage.setItem(FOREIGN_SCRUB_KEY, '1')
  }
}
