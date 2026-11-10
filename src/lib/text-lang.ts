import {
  filterAllowedChoices,
  hasLatinLetters,
  isAllowedChoiceText,
  isAllowedQuizText,
} from './lang-gate'

export { hasHangul, hasLatinLetters, isAllowedChoiceText, isAllowedQuizText } from './lang-gate'

/** 判斷字串是否偏英文（選擇題要迴避） */
export function isMostlyEnglish(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const letters = t.replace(/[^A-Za-z]/g, '')
  const cjk = t.replace(/[^\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, '')
  if (letters.length === 0) return false
  // 有明顯拉丁字母，且幾乎沒有中日文字 → 視為英文
  if (cjk.length === 0 && letters.length >= 2) return true
  // 拉丁字母明顯多於 CJK
  return letters.length >= 3 && letters.length > cjk.length * 2
}

export function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text)
}

export function hasChinese(text: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(text)
}

/** 常見英文釋義 → 繁中（CSV／模型兜底） */
const EN_TO_ZH: Record<string, string> = {
  'to meet': '見面',
  'to eat': '吃',
  'to drink': '喝',
  'to go': '去',
  'to come': '來',
  'to see': '看',
  'to look': '看',
  'to watch': '看',
  'to hear': '聽',
  'to ask': '問',
  'to listen': '聽',
  'to read': '讀',
  'to write': '寫',
  'to buy': '買',
  'to sell': '賣',
  'to do': '做',
  'to make': '做／製作',
  'to speak': '說',
  'to say': '說',
  'to think': '想',
  'to know': '知道',
  'to understand': '懂',
  'to study': '學習',
  'to learn': '學習',
  'to teach': '教',
  'to work': '工作',
  'to sleep': '睡覺',
  'to wake up': '起床',
  'to return': '回去',
  'to enter': '進入',
  'to exit': '出去',
  'to open': '打開',
  'to close': '關閉',
  'to wait': '等待',
  'to walk': '走路',
  'to run': '跑',
  'to sit': '坐',
  'to stand': '站',
  'to give': '給',
  'to receive': '收到',
  'to take': '拿',
  'to put': '放置',
  'to use': '使用',
  'to need': '需要',
  'to want': '想要',
  'to like': '喜歡',
  'to love': '愛',
  'to live': '住',
  'school': '學校',
  teacher: '老師',
  student: '學生',
  friend: '朋友',
  family: '家人',
  water: '水',
  book: '書',
  today: '今天',
  tomorrow: '明天',
  yesterday: '昨天',
  now: '現在',
  time: '時間',
  big: '大的',
  small: '小的',
  new: '新的',
  old: '舊的',
  expensive: '貴的',
  cheap: '便宜的',
  fun: '有趣的',
  happy: '快樂的',
  good: '好的',
  bad: '壞的',
  hot: '熱的',
  cold: '冷的',
  morning: '早上',
  afternoon: '下午',
  evening: '晚上',
  night: '夜晚',
  person: '人',
  people: '人們',
  japan: '日本',
  japanese: '日文／日本人',
  english: '英文',
  china: '中國',
  taiwan: '台灣',
  house: '家',
  home: '家',
  station: '車站',
  train: '電車',
  car: '車子',
  food: '食物',
  rice: '飯',
  meal: '餐',
  tea: '茶',
  coffee: '咖啡',
  money: '錢',
  year: '年',
  month: '月',
  week: '週',
  day: '天／日',
  hour: '小時',
  minute: '分鐘',
  name: '名字',
  what: '什麼',
  where: '哪裡',
  when: '何時',
  who: '誰',
  why: '為什麼',
  how: '如何',
}

function normalizeEnKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.;]+$/g, '')
}

/** 若為英文釋義則盡量轉繁中；多義用分號切開分別翻譯 */
export function toZhMeaning(raw: string): string {
  if (!raw.trim()) return raw
  if (!isMostlyEnglish(raw) && (hasChinese(raw) || hasJapanese(raw))) return raw

  const parts = raw.split(/[;/｜|]+/).map((p) => p.trim()).filter(Boolean)
  const translated = parts.map((part) => {
    const key = normalizeEnKey(part)
    if (EN_TO_ZH[key]) return EN_TO_ZH[key]
    // 去掉 to / a / the 再試
    const stripped = key.replace(/^(to|a|an|the)\s+/, '')
    if (EN_TO_ZH[stripped]) return EN_TO_ZH[stripped]
    if (EN_TO_ZH[`to ${stripped}`]) return EN_TO_ZH[`to ${stripped}`]
    return null
  })

  if (translated.every(Boolean)) return translated.join('／')
  // 部分翻得出來就用翻出的；其餘保留原文但後面會被選項過濾擋掉
  const mixed = translated.map((t, i) => t ?? parts[i]).join('／')
  return mixed
}

const CJK_FILLERS = [
  '學校', '朋友', '時間', '今天', '明天', '學生', '老師', '家庭', '讀書', '吃飯',
  '飲む', '行く', '見る', '聞く', '書く', '買う', '大きい', '小さい', '新しい', '楽しい',
]

/**
 * 清掉英文／韓文／非法字元選項；不足時僅用合法中日文備援補齊。
 * 不補「選項N」假選項——湊不滿 size 時回傳現有長度，由驗證層整題作廢。
 */
export function sanitizeChoices(
  choices: string[],
  answer: string,
  extraPool: string[] = [],
  size = 4,
): { answer: string; choices: string[] } {
  let cleanAnswer = answer.trim()
  if (isMostlyEnglish(cleanAnswer) || hasLatinLetters(cleanAnswer)) {
    cleanAnswer = toZhMeaning(cleanAnswer)
  }
  if (!isAllowedChoiceText(cleanAnswer) && !isAllowedQuizText(cleanAnswer)) {
    return { answer: cleanAnswer, choices: [] }
  }

  const pool = filterAllowedChoices(
    [...extraPool, ...CJK_FILLERS].map((x) => (isMostlyEnglish(x) ? toZhMeaning(x) : x)),
  ).filter((x) => x !== cleanAnswer)

  const cleaned = filterAllowedChoices(
    choices.map((c) => {
      const t = c.trim()
      if (!t) return ''
      if (isMostlyEnglish(t) || hasLatinLetters(t)) return toZhMeaning(t)
      return t
    }),
  )

  const result = [...new Set([cleanAnswer, ...cleaned.filter((c) => c !== cleanAnswer)])].filter(
    isAllowedChoiceText,
  )

  for (const p of shuffleLocal(pool)) {
    if (result.length >= size) break
    if (!result.includes(p)) result.push(p)
  }

  return {
    answer: cleanAnswer,
    choices: shuffleLocal(result.slice(0, size)),
  }
}

function shuffleLocal<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 題目文字若含英文提示，一併盡量淨化意思欄 */
export function sanitizeMeaningField(text: string): string {
  if (!isMostlyEnglish(text)) return text
  return toZhMeaning(text)
}
