/** 單字／片語／短文題庫預設參數 */
export const QUIZ_DEFAULTS = {
  vocabSessionSize: 8,
  vocabBuildBatch: 16,
  vocabMinBank: 20,
  phraseSessionSize: 8,
  phraseBuildBatch: 16,
  phraseMinBank: 12,
  readingSessionSize: 8,
  readingMinBank: 8,
  refreshChance: 0.1,
} as const
