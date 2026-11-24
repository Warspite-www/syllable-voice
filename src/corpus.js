/*! 语料包 core-zh@1.1.0 —— 数据只描述参数，不含可执行逻辑（可安全分享）。 */

export const CORPUS = {
  schema: 'bibibobo.corpus/1',
  id: 'core-zh',
  name: '中文核心语料',
  version: '1.1.0',
  license: 'MIT',
  note: '13 组口型 × 8 个音高 × 5 种起音 × 7 条语气 —— 全部由哈希位切片选取。',

  vowels: [
    { id: 'a', name: '啊', f: [800, 1200], dur: 1.0 },
    { id: 'e', name: '呃', f: [500, 1800], dur: 0.95 },
    { id: 'i', name: '衣', f: [400, 2200], dur: 0.9 },
    { id: 'o', name: '哦', f: [450, 900], dur: 1.05 },
    { id: 'u', name: '乌', f: [350, 800], dur: 1.05 },
    { id: 'v', name: '迂', f: [320, 1900], dur: 0.9 },
    { id: 'an', name: '安', f: [700, 1100], dur: 1.1 },
    { id: 'en', name: '恩', f: [550, 1650], dur: 1.0 },
    { id: 'ang', name: '昂', f: [750, 1000], dur: 1.15 },
    { id: 'ai', name: '爱', f: [[750, 1250], [450, 1900]], dur: 1.2 },
    { id: 'ou', name: '欧', f: [[500, 900], [380, 800]], dur: 1.2 },
    { id: 'ao', name: '奥', f: [[750, 1150], [480, 850]], dur: 1.2 },
    { id: 'er', name: '儿', f: [490, 1350], dur: 1.1 },
  ],

  onsets: [
    { id: 'none', name: '无' },
    { id: 's', name: '丝', type: 'noise', band: [4200, 8200], dur: 0.035, gain: 0.45 },
    { id: 'b', name: '波', type: 'burst', f: 180, dur: 0.022, gain: 0.6 },
    { id: 't', name: '特', type: 'burst', f: 620, dur: 0.016, gain: 0.5 },
    { id: 'm', name: '摸', type: 'nasal', f: 120, dur: 0.028, gain: 0.55 },
  ],

  prosody: {
    flat: { name: '陈述', pitch: 0, lastGlide: 0, lastStretch: 0, rate: 1, gain: 1 },
    ask: { name: '疑问（升调）', pitch: 0, lastGlide: 5, lastStretch: 0.1, rate: 1, gain: 1 },
    doubt: { name: '反问（先降后升）', pitch: -1, lastGlide: 7, lastStretch: 0.12, rate: 0.97, gain: 1 },
    shout: { name: '感叹（整句升高）', pitch: 3, lastGlide: 2, lastStretch: 0.06, rate: 0.95, gain: 1.15 },
    sad: { name: '省略（压低、尾音下落）', pitch: -3, lastGlide: -4, lastStretch: 0.08, rate: 1.1, gain: 0.92 },
    drag: { name: '拖长（波浪号）', pitch: -1, lastGlide: -2, lastStretch: 0.22, rate: 1.25, gain: 0.98 },
    whisper: { name: '耳语（括号）', pitch: -2, lastGlide: -1, lastStretch: 0.02, rate: 1.12, gain: 0.55 },
  },

  /* 音阶预设：可直接替换成五声、和声小调等 */
  scales: {
    pentatonic: { name: '五声大调（原版）', notes: [76, 79, 81, 83, 84] },
    pentatonicLow: { name: '五声低音', notes: [62, 64, 67, 69] },
    major: { name: '自然大调', notes: [72, 74, 76, 77, 79, 81, 83, 84] },
    minor: { name: '自然小调', notes: [69, 71, 72, 74, 76, 77, 79, 81] },
    whole: { name: '全音阶（飘）', notes: [72, 74, 76, 78, 80, 82] },
  },
};
