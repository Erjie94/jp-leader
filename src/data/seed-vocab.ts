import type { VocabEntry } from '../lib/db'

type Seed = Omit<VocabEntry, 'id' | 'createdAt' | 'source'>

/** 離線預設單字（精簡子集，首次可手動擴充／線上匯入） */
export const SEED_VOCAB: Seed[] = [
  { word: '食べる', reading: 'たべる', meaning: '吃' },
  { word: '飲む', reading: 'のむ', meaning: '喝' },
  { word: '行く', reading: 'いく', meaning: '去' },
  { word: '来る', reading: 'くる', meaning: '來' },
  { word: '見る', reading: 'みる', meaning: '看' },
  { word: '聞く', reading: 'きく', meaning: '聽／問' },
  { word: '読む', reading: 'よむ', meaning: '讀' },
  { word: '書く', reading: 'かく', meaning: '寫' },
  { word: '買う', reading: 'かう', meaning: '買' },
  { word: '会う', reading: 'あう', meaning: '見面' },
  { word: '学校', reading: 'がっこう', meaning: '學校' },
  { word: '先生', reading: 'せんせい', meaning: '老師' },
  { word: '学生', reading: 'がくせい', meaning: '學生' },
  { word: '友達', reading: 'ともだち', meaning: '朋友' },
  { word: '家族', reading: 'かぞく', meaning: '家人' },
  { word: '水', reading: 'みず', meaning: '水' },
  { word: 'ご飯', reading: 'ごはん', meaning: '飯／餐' },
  { word: '本', reading: 'ほん', meaning: '書' },
  { word: '今日', reading: 'きょう', meaning: '今天' },
  { word: '明日', reading: 'あした', meaning: '明天' },
  { word: '昨日', reading: 'きのう', meaning: '昨天' },
  { word: '今', reading: 'いま', meaning: '現在' },
  { word: '時間', reading: 'じかん', meaning: '時間' },
  { word: '何', reading: 'なに', meaning: '什麼' },
  { word: '誰', reading: 'だれ', meaning: '誰' },
  { word: 'どこ', reading: 'どこ', meaning: '哪裡' },
  { word: 'いつ', reading: 'いつ', meaning: '何時' },
  { word: 'どう', reading: 'どう', meaning: '怎樣' },
  { word: '大きい', reading: 'おおきい', meaning: '大的' },
  { word: '小さい', reading: 'ちいさい', meaning: '小的' },
]
