/**
 * 測驗文字語言硬閘門：只允許日文假名／漢字、繁中常用字、空白與題目標點。
 * 明確拒絕韓文 Hangul、拉丁字母（含英文）、數字雜訊為主的選項。
 */

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/
/** 拉丁字母（排除我們允許的空白／符號題） */
const LATIN = /[A-Za-z]/
/** 允許字元：假名、漢字、全形／半形空白、常見標點、填空、數字少量（年份等） */
const ALLOWED_CHAR =
  /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\s　。．、，,！？!？?：:；;「」『』（）()【】\[\]…—\-・／/＿_〜~＝=0-9]/

export function hasHangul(text: string): boolean {
  return HANGUL.test(text)
}

export function hasLatinLetters(text: string): boolean {
  return LATIN.test(text)
}

/** 題幹／句子／短文／選項／正解是否可入庫 */
export function isAllowedQuizText(text: string, opts?: { allowBlank?: boolean }): boolean {
  const t = text.trim()
  if (!t) return false
  if (hasHangul(t)) return false
  if (hasLatinLetters(t)) return false

  // 允許 ____ 填空
  const normalized = opts?.allowBlank === false ? t : t.replace(/_{2,}|＿{2,}/g, '')
  for (const ch of normalized) {
    if (!ALLOWED_CHAR.test(ch)) return false
  }
  return true
}

/** 選項專用：拒數字為主的雜訊 */
export function isAllowedChoiceText(text: string): boolean {
  if (!isAllowedQuizText(text)) return false
  const t = text.trim()
  if (/^\d+$/.test(t)) return false
  if (/^選項\d+$/.test(t)) return false
  const digits = t.replace(/\D/g, '')
  if (digits.length >= 3 && digits.length >= t.length * 0.6) return false
  return true
}

export function filterAllowedChoices(choices: string[]): string[] {
  return [...new Set(choices.map((c) => c.trim()).filter(isAllowedChoiceText))]
}
