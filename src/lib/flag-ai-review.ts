import { CHOICE_COUNT, SENTENCE_MAX, SENTENCE_MIN } from './ai-gen-spec'
import type { FlaggedQuiz } from './db'
import { saveFlaggedAiReview, updateQuizFromFlagFix } from './db'
import { inspectWholeQuestion } from './flag-inspect'
import { chatText, isModelReady } from './llm'
import { isMostlyEnglish, sanitizeChoices } from './text-lang'

export type AiFlagVerdict = 'ok' | 'fix' | 'discard'

export interface AiFlagReview {
  verdict: AiFlagVerdict
  issues: string[]
  note: string
  /** 整題修正稿（必須成套；不可只改單一欄） */
  fixed?: {
    prompt: string
    sentence?: string
    passage?: string
    answer: string
    choices: string[]
    explanation: string
  }
  reviewedAt: number
  raw?: string
}

function charLen(s: string): number {
  return [...s.replace(/\s/g, '')].length
}

function describeWholeItem(item: FlaggedQuiz): string {
  const parts = [
    `【類型】${item.kind}`,
    `【題幹】${item.prompt}`,
  ]
  if (item.passage) parts.push(`【短文】${item.passage}`)
  if (item.sentence) parts.push(`【句子】${item.sentence}`)
  parts.push(`【正解】${item.answer}`)
  parts.push(`【四個選項】${item.choices.join(' ／ ')}`)
  if (item.explanation) parts.push(`【說明】${item.explanation}`)
  return parts.join('\n')
}

function parseReviewLines(text: string, original: FlaggedQuiz): AiFlagReview {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const map = new Map<string, string>()
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_\u4e00-\u9fff]+)[:：|｜]\s*(.*)$/)
    if (m) map.set(m[1].toLowerCase(), m[2].trim())
  }

  const itemLine = map.get('item') ?? map.get('整題') ?? map.get('fixed')
  if (itemLine?.includes('|')) {
    const p = itemLine.split('|').map((x) => x.trim())
    if (p.length >= 4) {
      map.set('prompt', map.get('prompt') ?? p[0])
      map.set('sentence', map.get('sentence') ?? p[1])
      map.set('answer', map.get('answer') ?? p[2])
      map.set('choices', map.get('choices') ?? p[3])
      if (p[4]) map.set('explanation', map.get('explanation') ?? p[4])
    }
  }

  const verdictRaw = (map.get('verdict') ?? map.get('判定') ?? map.get('結果') ?? '').toLowerCase()
  let verdict: AiFlagVerdict = 'fix'
  if (/^ok\b|通過|無問題|可用|fine|good/.test(verdictRaw)) verdict = 'ok'
  else if (/discard|delete|刪除|廢棄|無效|重產/.test(verdictRaw)) verdict = 'discard'
  else if (/fix|修正|repair|改寫|重寫/.test(verdictRaw)) verdict = 'fix'

  const issuesRaw = map.get('issues') ?? map.get('問題') ?? map.get('整題問題') ?? ''
  const issues = issuesRaw
    ? issuesRaw.split(/[;；]/).map((s) => s.trim()).filter(Boolean)
    : []

  const note =
    map.get('note') ??
    map.get('整題結論') ??
    map.get('說明') ??
    map.get('總結') ??
    (issues.join('；') || '已完成整題審視')

  let fixed: AiFlagReview['fixed'] | undefined

  if (verdict === 'fix') {
    const prompt = (map.get('prompt') ?? map.get('題幹') ?? map.get('提示') ?? '').trim()
    const sentence = (map.get('sentence') ?? map.get('句子') ?? '').trim()
    const passage = (map.get('passage') ?? map.get('短文') ?? '').trim()
    const answer = (map.get('answer') ?? map.get('正解') ?? '').trim()
    const choiceRaw = (map.get('choices') ?? map.get('選項') ?? '').trim()
    const explanation = (
      map.get('explanation') ??
      map.get('解說') ??
      map.get('說明文字') ??
      ''
    ).trim()

    const choices = choiceRaw
      ? choiceRaw.split(/[/／,、]/).map((c) => c.trim()).filter(Boolean)
      : []

    const cleaned = answer
      ? sanitizeChoices(choices.length ? choices : [answer], answer, choices, CHOICE_COUNT)
      : null

    const hasStem =
      original.kind === 'reading'
        ? Boolean(passage || original.passage)
        : Boolean(sentence || original.sentence || prompt)

    if (
      cleaned &&
      cleaned.choices.length === CHOICE_COUNT &&
      prompt &&
      answer &&
      hasStem &&
      !isMostlyEnglish(cleaned.answer) &&
      !cleaned.choices.some(isMostlyEnglish)
    ) {
      fixed = {
        prompt,
        sentence: sentence || (original.kind === 'reading' ? undefined : original.sentence),
        passage: passage || (original.kind === 'reading' ? original.passage : undefined),
        answer: cleaned.answer,
        choices: cleaned.choices,
        explanation: explanation || cleaned.answer,
      }
      if (fixed.sentence) {
        const len = charLen(fixed.sentence)
        if (len < SENTENCE_MIN || len > SENTENCE_MAX + 5) {
          issues.push(`修正句長度約 ${len} 字，建議落在 ${SENTENCE_MIN}～${SENTENCE_MAX}`)
        }
      }
    } else {
      verdict = 'discard'
      issues.push('模型未給出完整可替換的整題（題幹＋句子／短文＋正解＋四選項）')
    }
  }

  return {
    verdict,
    issues: issues.length ? issues : [note],
    note,
    fixed,
    reviewedAt: Date.now(),
    raw: text.slice(0, 1200),
  }
}

function mergeReviews(
  local: ReturnType<typeof inspectWholeQuestion>,
  ai: AiFlagReview,
): AiFlagReview {
  const issues = [...new Set([...local.issues, ...ai.issues])]

  // 本地已確認整題有缺陷時，禁止維持 ok
  if (!local.ok && ai.verdict === 'ok') {
    if (local.fixed || ai.fixed) {
      return {
        ...ai,
        verdict: 'fix',
        issues,
        note: `本地整題檢查未過：${local.issues[0] ?? '有缺陷'}。${ai.note}`,
        fixed: ai.fixed ?? local.fixed,
        reviewedAt: Date.now(),
      }
    }
    return {
      ...ai,
      verdict: local.verdict === 'discard' ? 'discard' : 'fix',
      issues,
      note: `本地整題檢查未過，不可判可用。${ai.note}`,
      fixed: local.fixed,
      reviewedAt: Date.now(),
    }
  }

  // 本地已有完整修正、AI 無修正時用本地稿
  if (!local.ok && local.fixed && !ai.fixed && ai.verdict !== 'ok') {
    return {
      ...ai,
      verdict: 'fix',
      issues,
      note: ai.note || local.issues.join('；'),
      fixed: local.fixed,
      reviewedAt: Date.now(),
    }
  }

  if (!local.ok) {
    return { ...ai, issues, note: `${ai.note}（已併入本地整題檢查）` }
  }

  return ai
}

/**
 * 整題審視流程：
 * 1) 本地整題邏輯檢查（空泛填空、數字雜訊選項等）
 * 2) 再請模型整題審視；若本地已抓到缺陷，禁止模型判 ok
 * 3) 合併結果；必要時用本地整題修正稿
 */
export async function reviewFlaggedWithAi(item: FlaggedQuiz): Promise<AiFlagReview> {
  if (!isModelReady()) throw new Error('Model not loaded')

  const local = inspectWholeQuestion(item)

  // 本地已能產出完整修正 → 仍可問模型 refinement，但預設先帶本地稿
  const forbidOk = !local.ok
  const knownIssues = local.issues.length
    ? `【本地已判定的整題缺陷——禁止判 ok】\n${local.issues.map((x) => `- ${x}`).join('\n')}`
    : '【本地結構檢查】未發現硬傷；請仍做整題命題邏輯審視。'

  const { text } = await chatText(
    `你是日文命題審核員。必須把題幹＋句子／短文＋正解＋四選項當「同一道題」審視。

絕對不可判 ok 的情況（整題層級）：
A) 句子太空泛（如「これは____です。」），且四個選項填進去文法都通 → 沒有唯一正解
B) 選項混入數字／無關雜訊（如 1440、1442）與語意選項並列
C) 正解不在選項中、選項重複、英文選項

範例（必須判 fix 或 discard，不可 ok）：
- 選出正確單字／これは____です。／本／茶・水・本・車 → 四選皆可填，整題無效
- 這個單字的意思是？／家族／家人／家人・1440・1442・今天 → 數字選項無關，整題無效

只輸出純文字行：
verdict:ok|fix|discard
issues:整題問題1；整題問題2
note:一句話
（verdict=fix 時必須給完整新題，不可只改一欄）
prompt:...
sentence:...
passage:...
answer:...
choices:選1/選2/選3/選4
explanation:...
${forbidOk ? '重要：本題本地已確認有缺陷，verdict 禁止輸出 ok。' : ''}`,
    `${knownIssues}

待審整題：
${describeWholeItem(item)}

請輸出整題判定${forbidOk ? '（須為 fix 或 discard）與完整新題' : ''}。`,
    0.2,
    480,
  )

  let ai = parseReviewLines(
    text || 'verdict:discard\nissues:模型無輸出\nnote:無法整題審視',
    item,
  )

  // 模型若仍亂判 ok，本地強制覆蓋
  ai = mergeReviews(local, ai)

  // 本地有修正稿且最終需要 fix 卻沒有 fixed
  if (ai.verdict === 'fix' && !ai.fixed && local.fixed) {
    ai = { ...ai, fixed: local.fixed }
  }

  // 再用本地檢查「修正後的整題」是否仍空泛／含雜訊
  if (ai.fixed) {
    const probe: FlaggedQuiz = {
      ...item,
      prompt: ai.fixed.prompt,
      sentence: ai.fixed.sentence,
      passage: ai.fixed.passage,
      answer: ai.fixed.answer,
      choices: ai.fixed.choices,
      explanation: ai.fixed.explanation,
    }
    const after = inspectWholeQuestion(probe)
    if (!after.ok) {
      if (after.fixed) {
        ai = {
          ...ai,
          verdict: 'fix',
          issues: [...ai.issues, ...after.issues.map((x) => `修正稿仍有問題後再修：${x}`)],
          fixed: after.fixed,
          note: `${ai.note}；已用本地規則重寫整題`,
        }
      } else {
        ai = {
          ...ai,
          verdict: 'discard',
          issues: [...ai.issues, ...after.issues],
          fixed: undefined,
          note: '修正稿仍無法通過整題檢查，建議刪除',
        }
      }
    }
  }

  await saveFlaggedAiReview(item.id, ai)
  return ai
}

export async function applyFlagAiFix(
  item: FlaggedQuiz,
  review: AiFlagReview,
  opts?: { unflag?: boolean },
): Promise<void> {
  if (review.verdict !== 'fix' || !review.fixed) {
    throw new Error('No complete fixed question to apply')
  }
  const f = review.fixed
  if (!f.prompt || !f.answer || !f.choices || f.choices.length !== CHOICE_COUNT) {
    throw new Error('Fixed question incomplete')
  }
  await updateQuizFromFlagFix(
    item,
    {
      prompt: f.prompt,
      sentence: f.sentence,
      passage: f.passage,
      answer: f.answer,
      choices: f.choices,
      explanation: f.explanation,
    },
    { unflag: opts?.unflag !== false },
  )
}

/** 僅跑本地整題檢查（供測試／除錯） */
export { inspectWholeQuestion }
