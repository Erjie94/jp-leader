import { CHOICE_COUNT } from './ai-gen-spec'
import type { FlaggedQuiz } from './db'
import { hasHangul, hasLatinLetters, isAllowedChoiceText, isAllowedQuizText } from './lang-gate'
import { isMostlyEnglish } from './text-lang'

export type LocalVerdict = 'ok' | 'fix' | 'discard'

export interface LocalInspectResult {
  /** 本地整題檢查若發現缺陷，不得判 ok */
  ok: boolean
  verdict: LocalVerdict
  issues: string[]
  /** 可選：本地就能湊出的整題修正 */
  fixed?: {
    prompt: string
    sentence?: string
    passage?: string
    answer: string
    choices: string[]
    explanation: string
  }
}

function isDigitNoise(s: string): boolean {
  const t = s.trim()
  if (!t) return true
  if (/^\d+$/.test(t)) return true
  if (/^選項\d+$/.test(t)) return true
  // 幾乎全是數字／符號
  const digits = t.replace(/\D/g, '')
  return digits.length >= 3 && digits.length >= t.length * 0.6
}

function isCjkGloss(s: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(s) && !isMostlyEnglish(s) && !isDigitNoise(s)
}

/** 這類句型幾乎任何名詞都能填 → 四選一同類時整題無唯一解 */
function isOverGenericBlankSentence(sentence: string): boolean {
  const s = sentence.replace(/\s/g, '')
  return (
    /^これ[はが]____です[。．]?$/.test(s) ||
    /^それ[はが]____です[。．]?$/.test(s) ||
    /^あれ[はが]____です[。．]?$/.test(s) ||
    /^これは____だ[。．]?$/.test(s) ||
    /^____です[。．]?$/.test(s)
  )
}

function looksLikeNounChoice(s: string): boolean {
  const t = s.trim()
  if (!t || t.length > 6) return false
  if (isDigitNoise(t) || isMostlyEnglish(t)) return false
  // 短詞、無動詞詞尾感
  return /^[\u3040-\u30ff\u3400-\u9fffー]+$/.test(t) && !/[るうくすつぬむ]$/.test(t)
}

/**
 * 整題結構＋命題邏輯檢查（不呼叫模型）。
 * 用來擋住「四選皆可填」「選項出現數字雜訊」卻被模型誤判 ok 的情況。
 */
export function inspectWholeQuestion(item: FlaggedQuiz): LocalInspectResult {
  const issues: string[] = []
  const choices = item.choices.map((c) => c.trim()).filter(Boolean)
  const answer = item.answer.trim()
  const sentence = (item.sentence ?? '').trim()
  const prompt = item.prompt.trim()

  if (choices.length !== CHOICE_COUNT) {
    issues.push(`選項數量應為 ${CHOICE_COUNT}，目前 ${choices.length}`)
  }

  const uniq = new Set(choices)
  if (uniq.size < choices.length) {
    issues.push('選項有重複')
  }

  if (!choices.includes(answer)) {
    issues.push('正解不在選項中')
  }

  if (isMostlyEnglish(answer) || choices.some(isMostlyEnglish)) {
    issues.push('正解或選項含英文')
  }

  if (
    hasHangul(answer) ||
    choices.some(hasHangul) ||
    (sentence && hasHangul(sentence)) ||
    hasHangul(prompt)
  ) {
    issues.push('題幹／選項含韓文')
  }

  if (
    hasLatinLetters(answer) ||
    choices.some(hasLatinLetters) ||
    (sentence && hasLatinLetters(sentence)) ||
    hasLatinLetters(prompt)
  ) {
    issues.push('題幹／選項含拉丁字母（英文等）')
  }

  if (!isAllowedChoiceText(answer) || choices.some((c) => !isAllowedChoiceText(c))) {
    issues.push('正解或選項未通過語言閘門')
  }

  if (sentence && !isAllowedQuizText(sentence, { allowBlank: true })) {
    issues.push('句子含不允許的字元')
  }

  const noise = choices.filter(isDigitNoise)
  if (noise.length) {
    issues.push(`選項出現明顯非題意內容：${noise.join('、')}（數字／占位雜訊）`)
  }

  // 意思題／單字題：選項應為可理解的中日文詞義，不可混入無關符號
  const meaningLike =
    /意思|意味|哪個.*表示|選出正確單字|這個單字/.test(prompt) ||
    (!sentence.includes('____') && !item.passage)

  if (meaningLike && noise.length >= 1) {
    issues.push('詞義／單字題不應出現與語意無關的選項')
  }

  // 空白句過泛 + 四個選項都能文法上成立 → 整題無區辨力
  if (sentence && isOverGenericBlankSentence(sentence)) {
    const nounish = choices.filter(looksLikeNounChoice)
    if (nounish.length >= 3) {
      issues.push(
        `句子「${sentence}」過於空泛，選項「${choices.join('／')}」幾乎都能填入，整題沒有唯一合理正解`,
      )
    }
  }

  // 有空白但選項類型混雜到無法比較（例如 家人 vs 1440）
  if (choices.some(isCjkGloss) && noise.length >= 1) {
    issues.push('選項類型不一致：語意選項與無關雜訊混在同一題')
  }

  if (!issues.length) {
    return { ok: true, verdict: 'ok', issues: [] }
  }

  // 嘗試本地整題修正：意思題去掉雜訊、補同類干擾項
  let fixed: LocalInspectResult['fixed']
  const cleanChoices = choices.filter((c) => c === answer || (isCjkGloss(c) && !isDigitNoise(c)))
  if (
    meaningLike &&
    answer &&
    isCjkGloss(answer) &&
    !isOverGenericBlankSentence(sentence)
  ) {
    const pool = ['家人', '朋友', '學校', '今天', '學生', '老師', '時間', '書本']
    const next = [answer, ...cleanChoices.filter((c) => c !== answer)]
    for (const p of pool) {
      if (next.length >= CHOICE_COUNT) break
      if (!next.includes(p)) next.push(p)
    }
    if (next.length >= CHOICE_COUNT && next.includes(answer)) {
      fixed = {
        prompt: prompt || '這個單字的意思是？',
        sentence: sentence || undefined,
        answer,
        choices: next.slice(0, CHOICE_COUNT),
        explanation: item.explanation?.trim() || `${sentence || prompt}＝${answer}`,
      }
    }
  }

  // 空泛填空題：本地改寫成「看意思選日文」以避免四選皆可
  if (isOverGenericBlankSentence(sentence) && answer && isCjkGloss(answer)) {
    const meaning =
      item.explanation?.match(/[=＝]\s*(.+)$/)?.[1]?.trim() ||
      (answer === '本' ? '書' : answer)
    const jaPool = ['本', '水', '茶', '車', '学校', '友達'].filter((w) => w !== answer)
    const choices2 = [answer, ...jaPool].slice(0, CHOICE_COUNT)
    fixed = {
      prompt: `哪個日文單字表示「${meaning}」？`,
      sentence: meaning,
      answer,
      choices: choices2,
      explanation: `${meaning} → ${answer}`,
    }
  }

  const verdict: LocalVerdict = fixed ? 'fix' : 'discard'
  return {
    ok: false,
    verdict,
    issues,
    fixed,
  }
}
