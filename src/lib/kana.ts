export type KanaScript = 'hiragana' | 'katakana'
export type KanaGroup = 'basic' | 'dakuten' | 'youon'

export interface KanaItem {
  kana: string
  romaji: string
  script: KanaScript
  group: KanaGroup
  row: string
}

const H_BASIC: [string, string, string][] = [
  ['あ', 'a', 'a'], ['い', 'i', 'a'], ['う', 'u', 'a'], ['え', 'e', 'a'], ['お', 'o', 'a'],
  ['か', 'ka', 'ka'], ['き', 'ki', 'ka'], ['く', 'ku', 'ka'], ['け', 'ke', 'ka'], ['こ', 'ko', 'ka'],
  ['さ', 'sa', 'sa'], ['し', 'shi', 'sa'], ['す', 'su', 'sa'], ['せ', 'se', 'sa'], ['そ', 'so', 'sa'],
  ['た', 'ta', 'ta'], ['ち', 'chi', 'ta'], ['つ', 'tsu', 'ta'], ['て', 'te', 'ta'], ['と', 'to', 'ta'],
  ['な', 'na', 'na'], ['に', 'ni', 'na'], ['ぬ', 'nu', 'na'], ['ね', 'ne', 'na'], ['の', 'no', 'na'],
  ['は', 'ha', 'ha'], ['ひ', 'hi', 'ha'], ['ふ', 'fu', 'ha'], ['へ', 'he', 'ha'], ['ほ', 'ho', 'ha'],
  ['ま', 'ma', 'ma'], ['み', 'mi', 'ma'], ['む', 'mu', 'ma'], ['め', 'me', 'ma'], ['も', 'mo', 'ma'],
  ['や', 'ya', 'ya'], ['ゆ', 'yu', 'ya'], ['よ', 'yo', 'ya'],
  ['ら', 'ra', 'ra'], ['り', 'ri', 'ra'], ['る', 'ru', 'ra'], ['れ', 're', 'ra'], ['ろ', 'ro', 'ra'],
  ['わ', 'wa', 'wa'], ['を', 'wo', 'wa'], ['ん', 'n', 'wa'],
]

const H_DAKUTEN: [string, string, string][] = [
  ['が', 'ga', 'ga'], ['ぎ', 'gi', 'ga'], ['ぐ', 'gu', 'ga'], ['げ', 'ge', 'ga'], ['ご', 'go', 'ga'],
  ['ざ', 'za', 'za'], ['じ', 'ji', 'za'], ['ず', 'zu', 'za'], ['ぜ', 'ze', 'za'], ['ぞ', 'zo', 'za'],
  ['だ', 'da', 'da'], ['ぢ', 'ji', 'da'], ['づ', 'zu', 'da'], ['で', 'de', 'da'], ['ど', 'do', 'da'],
  ['ば', 'ba', 'ba'], ['び', 'bi', 'ba'], ['ぶ', 'bu', 'ba'], ['べ', 'be', 'ba'], ['ぼ', 'bo', 'ba'],
  ['ぱ', 'pa', 'pa'], ['ぴ', 'pi', 'pa'], ['ぷ', 'pu', 'pa'], ['ぺ', 'pe', 'pa'], ['ぽ', 'po', 'pa'],
]

const H_YOUON: [string, string, string][] = [
  ['きゃ', 'kya', 'kya'], ['きゅ', 'kyu', 'kya'], ['きょ', 'kyo', 'kya'],
  ['しゃ', 'sha', 'sha'], ['しゅ', 'shu', 'sha'], ['しょ', 'sho', 'sha'],
  ['ちゃ', 'cha', 'cha'], ['ちゅ', 'chu', 'cha'], ['ちょ', 'cho', 'cha'],
  ['にゃ', 'nya', 'nya'], ['にゅ', 'nyu', 'nya'], ['にょ', 'nyo', 'nya'],
  ['ひゃ', 'hya', 'hya'], ['ひゅ', 'hyu', 'hya'], ['ひょ', 'hyo', 'hya'],
  ['みゃ', 'mya', 'mya'], ['みゅ', 'myu', 'mya'], ['みょ', 'myo', 'mya'],
  ['りゃ', 'rya', 'rya'], ['りゅ', 'ryu', 'rya'], ['りょ', 'ryo', 'rya'],
  ['ぎゃ', 'gya', 'gya'], ['ぎゅ', 'gyu', 'gya'], ['ぎょ', 'gyo', 'gya'],
  ['じゃ', 'ja', 'ja'], ['じゅ', 'ju', 'ja'], ['じょ', 'jo', 'ja'],
  ['びゃ', 'bya', 'bya'], ['びゅ', 'byu', 'bya'], ['びょ', 'byo', 'bya'],
  ['ぴゃ', 'pya', 'pya'], ['ぴゅ', 'pyu', 'pya'], ['ぴょ', 'pyo', 'pya'],
]

const HIRA_TO_KATA: Record<string, string> = {
  あ: 'ア', い: 'イ', う: 'ウ', え: 'エ', お: 'オ',
  か: 'カ', き: 'キ', く: 'ク', け: 'ケ', こ: 'コ',
  さ: 'サ', し: 'シ', す: 'ス', せ: 'セ', そ: 'ソ',
  た: 'タ', ち: 'チ', つ: 'ツ', て: 'テ', と: 'ト',
  な: 'ナ', に: 'ニ', ぬ: 'ヌ', ね: 'ネ', の: 'ノ',
  は: 'ハ', ひ: 'ヒ', ふ: 'フ', へ: 'ヘ', ほ: 'ホ',
  ま: 'マ', み: 'ミ', む: 'ム', め: 'メ', も: 'モ',
  や: 'ヤ', ゆ: 'ユ', よ: 'ヨ',
  ら: 'ラ', り: 'リ', る: 'ル', れ: 'レ', ろ: 'ロ',
  わ: 'ワ', を: 'ヲ', ん: 'ン',
  が: 'ガ', ぎ: 'ギ', ぐ: 'グ', げ: 'ゲ', ご: 'ゴ',
  ざ: 'ザ', じ: 'ジ', ず: 'ズ', ぜ: 'ゼ', ぞ: 'ゾ',
  だ: 'ダ', ぢ: 'ヂ', づ: 'ヅ', で: 'デ', ど: 'ド',
  ば: 'バ', び: 'ビ', ぶ: 'ブ', べ: 'ベ', ぼ: 'ボ',
  ぱ: 'パ', ぴ: 'ピ', ぷ: 'プ', ぺ: 'ペ', ぽ: 'ポ',
  ゃ: 'ャ', ゅ: 'ュ', ょ: 'ョ',
}

function toKatakana(hira: string): string {
  return [...hira].map((c) => HIRA_TO_KATA[c] ?? c).join('')
}

function build(script: KanaScript, group: KanaGroup, rows: [string, string, string][]): KanaItem[] {
  return rows.map(([hira, romaji, row]) => ({
    kana: script === 'hiragana' ? hira : toKatakana(hira),
    romaji,
    script,
    group,
    row,
  }))
}

export const ALL_KANA: KanaItem[] = [
  ...build('hiragana', 'basic', H_BASIC),
  ...build('hiragana', 'dakuten', H_DAKUTEN),
  ...build('hiragana', 'youon', H_YOUON),
  ...build('katakana', 'basic', H_BASIC),
  ...build('katakana', 'dakuten', H_DAKUTEN),
  ...build('katakana', 'youon', H_YOUON),
]

export function filterKana(
  script: KanaScript,
  groups: KanaGroup[],
): KanaItem[] {
  return ALL_KANA.filter((k) => k.script === script && groups.includes(k.group))
}

export function normalizeRomaji(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '')
}

export function normalizeKana(input: string): string {
  return input.trim().replace(/\s+/g, '')
}
