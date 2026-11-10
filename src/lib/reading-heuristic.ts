import { shuffle } from './quiz-fallback'
import {
  detectPassageLang,
  validateReadingQuestion,
  type ReadingQuestionDraft,
} from './reading-spec'

/** 離線啟發式產題：不需模型，保證至少能練；強化對 NHK Easy「漢字＋讀音夾寫」 */

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。．.！!？?\n])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => [...s].length >= 8)
}

/** 優先：引號詞、連續漢字複詞；降低純假名雜訊 */
function pickContentWords(sentence: string): string[] {
  const quoted = [...sentence.matchAll(/[「『]([^」』]{2,12})[」』]/g)].map((m) => m[1])
  const kanjiCompounds = sentence.match(/[\u4e00-\u9fff]{2,6}/g) ?? []
  const ranked = [...quoted, ...kanjiCompounds]
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 10)
  return [...new Set(ranked)]
}

function pickFacts(text: string): Array<{ label: string; value: string; prompt: string }> {
  const facts: Array<{ label: string; value: string; prompt: string }> = []
  const boat = text.match(/(\d+)\s*の船/)
  if (boat) {
    facts.push({
      label: 'boats',
      value: `${boat[1]}隻`,
      prompt: '漁を始めた船は何隻でしたか。',
    })
  }
  const startDay = text.match(/(\d+)\s*日[むいかはつかにち]/g)
  if (startDay?.[0]) {
    const n = startDay[0].match(/\d+/)?.[0]
    if (n) {
      facts.push({
        label: 'start',
        value: `${n}日`,
        prompt: '漁が始まったのは何日ですか。',
      })
    }
  }
  if (/金沢港/.test(text)) {
    facts.push({
      label: 'port',
      value: '金沢港',
      prompt: 'かにをとった船はどこに戻りましたか。',
    })
  }
  if (/石川県/.test(text)) {
    facts.push({
      label: 'pref',
      value: '石川県',
      prompt: 'この漁の話はどの県のできごとですか。',
    })
  }
  const maleUntil = text.match(/オス[\s\S]{0,40}?(\d+)\s*月[\s\S]{0,12}?(\d+)\s*日/)
  if (maleUntil) {
    facts.push({
      label: 'male',
      value: `${maleUntil[1]}月${maleUntil[2]}日`,
      prompt: 'オスのズワイガニ漁はいつまでですか。',
    })
  }
  const femaleUntil = text.match(/メス[\s\S]{0,30}?(\d+)\s*日/)
  if (femaleUntil) {
    facts.push({
      label: 'female',
      value: `${femaleUntil[1]}日まで`,
      prompt: 'メスのズワイガニ漁はいつまでですか。',
    })
  }
  return facts
}

function distractors(pool: string[], answer: string, n = 3): string[] {
  return shuffle(pool.filter((x) => x && x !== answer)).slice(0, n)
}

const GENERIC_DISTRACTORS_JA = ['東京', '大阪', '横浜', '学校', '会社', '友達', '昨日', '来週']
const GENERIC_DISTRACTORS_ZH = ['今天', '昨天', '學校', '公司', '朋友', '家人', '時間', '地點']
const NUMBER_DISTRACTORS = ['3日', '10日', '12隻', '20隻', '1月1日', '5月5日', '来年まで', '今日まで']

export function buildHeuristicReadingQuestions(
  sourceText: string,
  count: number,
): ReadingQuestionDraft[] {
  const sentences = splitSentences(sourceText)
  if (!sentences.length) return []

  const lang = detectPassageLang(sourceText)
  const generic = lang === 'zh' ? GENERIC_DISTRACTORS_ZH : GENERIC_DISTRACTORS_JA
  const wordPool = [...new Set(sentences.flatMap(pickContentWords)), ...generic]
  const facts = pickFacts(sourceText)
  const out: ReadingQuestionDraft[] = []
  const target = Math.min(5, Math.max(3, count))

  // 1) 主旨
  {
    const head = sentences[0]
    const hasCrab = /ズワイガニ|かに|蟹/.test(sourceText)
    const answer = hasCrab
      ? 'ズワイガニ漁が始まったこと'
      : [...head].slice(0, 22).join('') + ([...head].length > 22 ? '…' : '')
    const wrong = hasCrab
      ? ['旅行の予約方法', '学校の時間割', '料理の作り方']
      : ['無関係な宣伝', '旅行予約の手順', '内容と反対の結論']
    const v = validateReadingQuestion({
      type: 'main',
      prompt: 'この文章の主な内容はどれですか。',
      answer,
      choices: [answer, ...wrong],
      explanation: hasCrab
        ? '本文はズワイガニ漁の開始について述べています。'
        : `冒頭：${[...head].slice(0, 24).join('')}…`,
    })
    if (v) out.push(v)
  }

  // 2) 語彙：優先引號詞（如 ズワイガニ）
  {
    const quoted = pickContentWords(sourceText).find((w) => /[ァ-ヶー]/.test(w) || w.length >= 3)
    const answer = quoted ?? pickContentWords(sourceText)[0]
    if (answer) {
      const dens = distractors(wordPool, answer, 3)
      while (dens.length < 3) dens.push(generic[dens.length] ?? `語${dens.length}`)
      const v = validateReadingQuestion({
        type: 'vocab',
        prompt: '本文に出てくる語として正しいものはどれですか。',
        answer,
        choices: [answer, ...dens],
        explanation: `本文に「${answer}」があります。`,
      })
      if (v) out.push(v)
    }
  }

  // 3+) 細節事實題
  for (const fact of shuffle(facts)) {
    if (out.length >= target) break
    const dens = distractors([...NUMBER_DISTRACTORS, ...generic, ...wordPool], fact.value, 3)
    while (dens.length < 3) dens.push(NUMBER_DISTRACTORS[dens.length] ?? `他${dens.length}`)
    const v = validateReadingQuestion({
      type: 'detail',
      prompt: fact.prompt,
      answer: fact.value,
      choices: [fact.value, ...dens],
      explanation: `本文の情報：${fact.value}`,
    })
    if (v) out.push(v)
  }

  // 推論：漁業者發言
  if (out.length < target && /食たべてほしい|食べてほしい/.test(sourceText)) {
    const answer = '早くかにを食べてほしい'
    const v = validateReadingQuestion({
      type: 'inference',
      prompt: '漁をした人の話から読み取れることはどれですか。',
      answer,
      choices: [answer, '船を売りたい', '港を閉じたい', '漁をやめたい'],
      explanation: '「みなさんに早く食べてほしい」と話しています。',
    })
    if (v) out.push(v)
  }

  // 補足：句子細節
  for (const sentence of shuffle(sentences)) {
    if (out.length >= target) break
    const snippet = [...sentence].slice(0, 34).join('') + ([...sentence].length > 34 ? '…' : '')
    const v = validateReadingQuestion({
      type: 'detail',
      prompt: '本文の内容に最も近いものはどれですか。',
      answer: snippet,
      choices: [snippet, '本文と反対の主張', '無関係な宣伝', '数式の説明'],
      explanation: `根拠：${snippet}`,
    })
    if (v) out.push(v)
  }

  while (out.length < target) {
    const v = validateReadingQuestion({
      type: 'inference',
      prompt: '本文から妥当に読み取れることはどれですか。',
      answer: '具体的な漁のできごとが述べられている',
      choices: [
        '具体的な漁のできごとが述べられている',
        '何も述べていない',
        '数式だけが書いてある',
        '設問と無関係',
      ],
      explanation: '本文は漁の開始や帰港など具体的な出来事を述べています。',
    })
    if (!v) break
    out.push(v)
  }

  return out.slice(0, target)
}
