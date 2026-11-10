/**
 * 小模型友善的「一行一筆」格式解析。
 * 選項不足時仍回傳，交由 validate／sanitize；湊不滿 4 則整題作廢。
 */

export function completeLines(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, ''),
    )
    .trim()

  if (!normalized) return []

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean)
  return lines
    .map((l) => l.replace(/^\d+[.)、]\s*/, '').replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#') && !/^json$/i.test(l))
}

/** 從雜訊輸出中抽出最像管線格式的一行 */
export function pickPipeLine(text: string): string | null {
  const lines = completeLines(text)
  const scored = lines
    .map((l) => {
      const pipes = (l.match(/[|｜]/g) ?? []).length
      return { l, pipes }
    })
    .filter((x) => x.pipes >= 2)
    .sort((a, b) => b.pipes - a.pipes)
  return scored[0]?.l ?? lines.find((l) => l.includes('|') || l.includes('｜')) ?? null
}

export function splitFields(line: string, expectedMin: number): string[] | null {
  let parts = line.includes('|')
    ? line.split('|').map((p) => p.trim())
    : line.includes('\t')
      ? line.split('\t').map((p) => p.trim())
      : null

  if (!parts) {
    if (line.includes('｜')) parts = line.split('｜').map((p) => p.trim())
    else return null
  }

  while (parts.length && parts[parts.length - 1] === '') parts.pop()
  if (parts.length < expectedMin) return null
  return parts
}

function parseChoiceField(choiceRaw: string, answer: string): string[] {
  const choices = choiceRaw
    ? choiceRaw.split(/[/／,、;；]/).map((c) => c.trim()).filter(Boolean)
    : []
  const uniq = [answer, ...choices.filter((c) => c !== answer)]
  return [...new Set(uniq.map((c) => c.trim()).filter(Boolean))]
}

export function parseVocabLines(text: string): Array<{ word: string; reading: string; meaning: string }> {
  const out: Array<{ word: string; reading: string; meaning: string }> = []
  for (const line of completeLines(text)) {
    const parts = splitFields(line, 2)
    if (!parts) continue
    const word = parts[0]
    const reading = parts[1] ?? ''
    const meaning = parts[2] ?? parts[1] ?? ''
    if (!word || word.length > 20) continue
    if (/^[{[]/.test(word)) continue
    // 語言閘門：拒收含韓文／拉丁字母的詞條
    if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(word + reading + meaning)) continue
    if (/[A-Za-z]/.test(word + reading + meaning)) continue
    out.push({ word, reading, meaning: meaning || reading || word })
  }
  return out
}

export function parsePhraseLine(text: string): {
  prompt: string
  sentence: string
  answer: string
  choices: string[]
  explanation: string
} | null {
  const candidates = [pickPipeLine(text), ...completeLines(text)].filter(Boolean) as string[]
  for (const line of candidates) {
    // 至少要有 提示|句子|答案
    const parts = splitFields(line, 3)
    if (!parts) continue
    const prompt = parts[0] || '選出正確答案'
    const sentence = parts[1]
    const answer = parts[2]
    const choiceRaw = parts[3] ?? ''
    const explanation = parts[4] ?? answer
    if (!sentence || !answer) continue
    // 有時模型把選項漏掉或把說明塞進選項欄——仍盡量收下
    const choices = parseChoiceField(choiceRaw, answer)
    return { prompt, sentence, answer, choices: choices.length ? choices : [answer], explanation }
  }
  return null
}
