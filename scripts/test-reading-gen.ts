import { writeFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'

// Node 測試環境 polyfill（瀏覽器 API）
Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: false, userAgent: 'node-test' },
  configurable: true,
})
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  configurable: true,
})

import { generateReadingQuestionSet } from '../src/lib/reading-generate'
import {
  detectPassageLang,
  normalizePassageText,
  READING_PASSAGE_MIN,
} from '../src/lib/reading-spec'
import { buildHeuristicReadingQuestions } from '../src/lib/reading-heuristic'

const text = `日本にほん海かいで、冬ふゆのかに「ズワイガニ」をとる漁りょうが6日むいかから始はじまりました。

石川県いしかわけんでは、6日むいか午前ごぜん0時じ、18の船ふねが漁りょうを始はじめました。

そして、午前ごぜん8時じごろ、たくさん、かにをとった船ふねが金沢港かなざわこうに戻もどってきました。

漁りょうをした人ひとは「みなさんに早はやく食たべてほしいです」と話はなしていました。

「ズワイガニ」のオスをとる漁りょうは、来年らいねんの3月がつ20日はつかまで行おこないます。メスをとる漁りょうは、来月らいげつ29日にちまでです。`

async function main() {
  const normalized = normalizePassageText(text)
  const chars = [...normalized].length
  const heuristic = buildHeuristicReadingQuestions(normalized, 4)

  const result = await generateReadingQuestionSet(text, {
    count: 4,
    title: 'ズワイガニ漁解禁',
    onProgress: (p) => {
      console.error(`[progress] ${p.stage} ${p.message} ${p.detail ?? ''}`)
    },
  })

  const report = {
    ok: true,
    charCount: chars,
    minRequired: READING_PASSAGE_MIN,
    lang: detectPassageLang(normalized),
    heuristicCount: heuristic.length,
    generator: result.generator,
    questionCount: result.passage.questions.length,
    title: result.passage.title,
    questions: result.passage.questions.map((q, i) => ({
      no: i + 1,
      type: q.type,
      prompt: q.prompt,
      answer: q.answer,
      choices: q.choices,
      explanation: q.explanation,
      hasFourChoices: q.choices.length === 4,
      answerInChoices: q.choices.includes(q.answer),
    })),
    checks: {
      enoughQuestions: result.passage.questions.length >= 3 && result.passage.questions.length <= 5,
      allFourChoices: result.passage.questions.every((q) => q.choices.length === 4),
      allAnswersValid: result.passage.questions.every((q) => q.choices.includes(q.answer)),
    },
  }

  writeFileSync('scripts/test-reading-gen-out.json', JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))
  if (!report.checks.enoughQuestions || !report.checks.allFourChoices || !report.checks.allAnswersValid) {
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
