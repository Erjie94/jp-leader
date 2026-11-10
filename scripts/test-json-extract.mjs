import { readFileSync } from 'fs'
import { createRequire } from 'module'

// 直接複製最新 repair 邏輯做快速驗證
function closeOpenFrames(s) {
  let inString = false, escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
  }
  if (inString) s += '"'
  s = s.replace(/[,:\s]+$/g, '')
  const stack = []
  inString = false; escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if ((ch === '}' || ch === ']') && stack.length && stack[stack.length - 1] === ch) stack.pop()
  }
  while (stack.length) s += stack.pop()
  JSON.parse(s)
  return s
}

function repair(text) {
  const s = text.trim()
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '}') continue
    try { return closeOpenFrames(s.slice(0, i + 1)) } catch {}
  }
  return closeOpenFrames(s)
}

const truncated = '{"words":[{"word":"会う","reading":"あう","meaning":"見面"},{"word":"行く","reading":"いく","meaning":"去"},{"word":"食'
const fixed = repair(truncated)
const data = JSON.parse(fixed)
console.log('words', data.words.length, data.words)
console.log('OK')
