/**
 * 快速整合檢查：單字三模式＋片語註解產題
 * 執行：npx tsx scripts/test-vocab-phrase-gen.ts
 */
import { SEED_VOCAB } from '../src/data/seed-vocab'
import { SEED_PHRASES } from '../src/data/seed-phrases'
import type { VocabEntry } from '../src/lib/db'
import { buildVocabQuestionsForEntry } from '../src/lib/generate'
import { pickBlankHeuristic } from '../src/lib/phrase-blank-select'
import { buildAnnotatedPhraseQuiz } from '../src/lib/phrase-quiz-build'
import { VOCAB_QUIZ_MODES } from '../src/lib/quiz-modes'

let failed = 0

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('OK:', msg)
  }
}

const vocab: VocabEntry[] = SEED_VOCAB.map((v, i) => ({
  ...v,
  id: `v${i}`,
  source: 'manual' as const,
  createdAt: i,
}))

const qs = buildVocabQuestionsForEntry(vocab[0], vocab, VOCAB_QUIZ_MODES)
assert(qs.length >= 2, `vocab entry yields modes (${qs.length})`)
assert(
  qs.every((q) => q.choices.length === 4 && Object.keys(q.choiceExplanations).length === 4),
  'vocab questions have 4 annotated choices',
)

const seed = SEED_PHRASES[0]
const blank = pickBlankHeuristic(seed.phrase)
assert(blank && seed.phrase.includes(blank.blankWord), 'heuristic blank in phrase')

const draft = buildAnnotatedPhraseQuiz({
  phrase: seed.phrase,
  reading: seed.reading,
  meaning: seed.meaning,
  blankWord: seed.blankWord,
  peerBlanks: SEED_PHRASES.map((p) => p.blankWord),
  vocabWords: vocab.map((v) => v.word),
})
assert(draft && draft.choices.length === 4, 'phrase quiz has 4 choices')
assert(
  draft && draft.choices.every((c) => draft.choiceExplanations[c]),
  'phrase quiz fully annotated',
)

if (failed) {
  process.exitCode = 1
  console.error(`\n${failed} check(s) failed`)
} else {
  console.log('\nAll checks passed')
}
