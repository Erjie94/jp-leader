import { shuffle } from './quiz-fallback'
import {
  detectPassageLang,
  validateReadingQuestion,
  type ReadingQuestionDraft,
} from './reading-spec'

/** 離線啟發式產題：不需模型，保證至少能練 */

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。．.！!？?\n])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => [...s].length >= 8)
}

function pickContentWords(sentence: string): string[] {
  const ja = sentence.match(/[\u4e00-\u9fff]{2,}|[\u3040-\u30ff]{3,}/g) ?? []
  const zh = sentence.match(/[\u4e00-\u9fff]{2,4}/g) ?? []
  return [...new Set([...ja, ...zh])].filter((w) => w.length >= 2 && w.length <= 8)
}

function distractors(pool: string[], answer: string, n = 3): string[] {
  return shuffle(pool.filter((x) => x !== answer)).slice(0, n)
}

const GENERIC_DISTRACTORS_JA = ['今日', '昨日', '学校', '会社', '友達', '家族', '時間', '場所', '理由', '結果']
const GENERIC_DISTRACTORS_ZH = ['今天', '昨天', '學校', '公司', '朋友', '家人', '時間', '地點', '原因', '結果']

export function buildHeuristicReadingQuestions(
  sourceText: string,
  count: number,
): ReadingQuestionDraft[] {
  const sentences = splitSentences(sourceText)
  if (!sentences.length) return []

  const lang = detectPassageLang(sourceText)
  const generic = lang === 'zh' ? GENERIC_DISTRACTORS_ZH : GENERIC_DISTRACTORS_JA
  const wordPool = [
    ...new Set(sentences.flatMap(pickContentWords)),
    ...generic,
  ]
  const out: ReadingQuestionDraft[] = []
  const target = Math.min(5, Math.max(3, count))

  // 1) 主旨：以首句為核心
  {
    const head = sentences[0]
    const answer = lang === 'zh' ? '說明短文開頭的主題' : '短文の冒頭で述べている内容'
    const wrong =
      lang === 'zh'
        ? ['完全無關的廣告', '旅遊訂票步驟', '與內容相反的結論']
        : ['無関係な宣伝', '旅行予約の手順', '内容と反対の結論']
    const prompt =
      lang === 'zh'
        ? '這段短文開頭主要在說什麼？'
        : 'この文章の冒頭で主に述べていることはどれですか。'
    // 用縮短首句當正確選項
    const headShort = [...head].slice(0, 28).join('') + ([...head].length > 28 ? '…' : '')
    const v = validateReadingQuestion({
      type: 'main',
      prompt,
      answer: headShort,
      choices: [headShort, ...wrong],
      explanation: lang === 'zh' ? `對應短文開頭：${headShort}` : `冒頭の内容：${headShort}`,
    })
    if (v) out.push(v)
    void answer
  }

  // 2–N) 細節／語彙：從各句抽關鍵詞
  for (const sentence of shuffle(sentences)) {
    if (out.length >= target) break
    const words = pickContentWords(sentence)
    if (!words.length) continue
    const answer = words[0]
    const dens = distractors(wordPool, answer, 3)
    while (dens.length < 3) {
      const g = generic[dens.length % generic.length]
      if (!dens.includes(g) && g !== answer) dens.push(g)
      else dens.push(`${g}${dens.length}`)
    }

    const isVocab = out.filter((q) => q.type === 'vocab').length < 1
    if (isVocab) {
      const v = validateReadingQuestion({
        type: 'vocab',
        prompt:
          lang === 'zh'
            ? `根據短文，下列哪一詞出現在：「${[...sentence].slice(0, 22).join('')}…」附近？`
            : `次の文脈に出てくる語はどれですか。「${[...sentence].slice(0, 22).join('')}…」`,
        answer,
        choices: [answer, ...dens],
        explanation: lang === 'zh' ? `短文中出現「${answer}」。` : `本文に「${answer}」があります。`,
      })
      if (v) out.push(v)
      continue
    }

    const snippet = [...sentence].slice(0, 36).join('') + ([...sentence].length > 36 ? '…' : '')
    const prompt =
      lang === 'zh'
        ? '根據短文，下列哪一項敘述較符合內容？'
        : '本文の内容に最も近いものはどれですか。'
    const wrongs =
      lang === 'zh'
        ? [`文中完全沒提到「${answer}」`, '短文主張與事實相反', '這是無關的結論']
        : [`本文に「${answer}」は出てこない`, '本文と反対の主張', '無関係な結論']
    const v = validateReadingQuestion({
      type: out.length % 2 === 0 ? 'detail' : 'inference',
      prompt,
      answer: snippet,
      choices: [snippet, ...wrongs],
      explanation:
        lang === 'zh' ? `依據句子：${snippet}` : `根拠の文：${snippet}`,
    })
    if (v) out.push(v)
  }

  // 補推論題
  while (out.length < target && sentences.length) {
    const s = sentences[out.length % sentences.length]
    const prompt =
      lang === 'zh' ? '從短文可合理推得的是？' : '本文から妥当に読み取れることはどれですか。'
    const answer =
      lang === 'zh'
        ? '短文描述了某個具體情況或主張'
        : '具体的な状況や主張が述べられている'
    const v = validateReadingQuestion({
      type: 'inference',
      prompt,
      answer,
      choices:
        lang === 'zh'
          ? [answer, '短文沒有任何訊息', '短文只列數學公式', '短文與題幹無關']
          : [answer, '何も述べていない', '数式だけが書いてある', '設問と無関係'],
      explanation:
        lang === 'zh' ? `綜合全文可判斷。參考：${[...s].slice(0, 20).join('')}…` : `全体から判断。例：${[...s].slice(0, 20).join('')}…`,
    })
    if (v) out.push(v)
    else break
  }

  return out.slice(0, target)
}
