/** 從模型回覆取出第一個完整 JSON；若被截斷則嘗試補齊括號 */
export function extractJsonPayload(text: string): string {
  const raw = text.trim()
  if (!raw) throw new Error('Model returned empty response')

  const fence = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  const candidate = fence?.[1]?.trim() || raw

  try {
    JSON.parse(candidate)
    return candidate
  } catch {
    /* continue */
  }

  const startObj = candidate.indexOf('{')
  const startArr = candidate.indexOf('[')
  let start = -1
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj
  else if (startArr >= 0) start = startArr
  if (start < 0) throw new Error('Model did not return JSON')

  const slice = candidate.slice(start)
  try {
    JSON.parse(slice)
    return slice
  } catch {
    /* continue */
  }

  const complete = takeBalanced(slice)
  if (complete) {
    try {
      JSON.parse(complete)
      return complete
    } catch {
      /* continue */
    }
  }

  const repaired = repairTruncatedJson(slice)
  if (repaired) return repaired

  throw new Error('Model JSON was truncated or incomplete')
}

function takeBalanced(text: string): string | null {
  if (text[0] !== '{' && text[0] !== '[') return null

  let depth = 0
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return text.slice(0, i + 1)
    }
  }
  return null
}

function closeOpenFrames(s: string): string | null {
  let inString = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    }
  }
  if (inString) s += '"'

  s = s.replace(/[,:\s]+$/g, '')

  const stack: string[] = []
  inString = false
  escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop()
    }
  }
  while (stack.length) s += stack.pop()

  try {
    JSON.parse(s)
    return s
  } catch {
    return null
  }
}

/** 截斷時：先截到最後一個完整 `}`，再關閉剩餘括號 */
export function repairTruncatedJson(text: string): string | null {
  const s = text.trim()
  if (!s.startsWith('{') && !s.startsWith('[')) return null

  // 由後往前，找每個 `}` 作為截斷點再嘗試關閉
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '}') continue
    const attempt = closeOpenFrames(s.slice(0, i + 1))
    if (attempt) return attempt
  }

  return closeOpenFrames(s)
}
