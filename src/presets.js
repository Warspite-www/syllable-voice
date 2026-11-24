/*! 官方音色预设 —— 一个 preset 只是参数，不含代码，可自由导入导出。 */

const base = {
  source: { osc: 'saw' },
  formant: { scale: 1, q: [4, 5], mix: 0.7, gain: 0.16 },
  pitch: { scale: [76, 79, 81, 83, 84], transpose: 0, vibrato: { rate: 6, depth: 0.012 }, chirp: 0, fall: 0 },
  rhythm: { step: 0.13, hold: 0.8, maxDur: 0.13, gap: 0.22, overlap: 0 },
  prosody: { intensity: 1 },
  fx: { reverb: 0, lowpass: 0, crush: 0, drive: 2.4 },
};

const make = (p) => ({
  ...base, ...p,
  source: { ...base.source, ...(p.source || {}) },
  formant: { ...base.formant, ...(p.formant || {}) },
  pitch: { ...base.pitch, ...(p.pitch || {}), vibrato: { ...base.pitch.vibrato, ...(p.pitch?.vibrato || {}) } },
  rhythm: { ...base.rhythm, ...(p.rhythm || {}) },
  prosody: { ...base.prosody, ...(p.prosody || {}) },
  fx: { ...base.fx, ...(p.fx || {}) },
});

export const PRESETS = [
  make({
    id: 'fish-classic', name: '大肥鱼 · 经典', tag: '原版', legacy: true,
    desc: '与上游完全一致的算法：5 组口型、5 个音高，音高与口型同源。',
    formant: { scale: 1.25, gain: 0.16 },
    pitch: { scale: [76, 79, 81, 83, 84], chirp: 1.5 },
    rhythm: { step: 0.13, maxDur: 0.13, hold: 0.8 },
    fx: { drive: 2.4 },
  }),
  make({
    id: 'lumo-classic', name: '路墨 · 经典', tag: '原版', legacy: true,
    desc: '原版低音声线：4 个音高、句尾自然下落。',
    formant: { scale: 0.9, gain: 0.17 },
    pitch: { scale: [62, 64, 67, 69], fall: -2 },
    rhythm: { step: 0.16, maxDur: 0.2, hold: 0.7 },
    fx: { drive: 2.4 },
  }),
  make({
    id: 'fish-2', name: '大肥鱼 2.0', tag: '新语料', legacy: false,
    desc: '13 组口型 + 5 种起音，音高与口型解耦，长句不再翻来覆去那几声。',
    formant: { scale: 1.25, gain: 0.16, mix: 0.7 },
    pitch: { scale: [76, 79, 81, 83, 84], chirp: 1.4 },
    rhythm: { step: 0.13, maxDur: 0.14, hold: 0.8 },
    fx: { drive: 2.4, reverb: 0.08 },
  }),
  make({
    id: 'lumo-2', name: '路墨 2.0', tag: '新语料', legacy: false,
    desc: '低音 + 双元音滑动，句尾轻轻下落。',
    formant: { scale: 0.9, gain: 0.17, mix: 0.72 },
    pitch: { scale: [62, 64, 67, 69], fall: -2, chirp: 0.2 },
    rhythm: { step: 0.16, maxDur: 0.2, hold: 0.72 },
    fx: { drive: 2.2, reverb: 0.06 },
  }),
  make({
    id: 'radio', name: '深夜电台', tag: '风格', legacy: false,
    desc: '低音域 + 小调 + 混响，适合念旁白。',
    formant: { scale: 0.86, gain: 0.15, mix: 0.8, q: [5, 6] },
    pitch: { scale: [57, 60, 62, 64], fall: -3, vibrato: { rate: 4.5, depth: 0.009 } },
    rhythm: { step: 0.19, maxDur: 0.22, hold: 0.78, gap: 0.3 },
    fx: { reverb: 0.3, lowpass: 0.22, drive: 2.0 },
  }),
  make({
    id: 'robot', name: '小机器人', tag: '风格', legacy: false,
    desc: '方波 + 位深压缩 + 无颤音，机械感。',
    source: { osc: 'square' },
    formant: { scale: 1.1, gain: 0.13, mix: 0.55, q: [6, 7] },
    pitch: { scale: [72, 76, 79, 84], chirp: 0, vibrato: { rate: 0, depth: 0 } },
    rhythm: { step: 0.1, maxDur: 0.11, hold: 0.85, gap: 0.16 },
    fx: { crush: 0.42, lowpass: 0.12, drive: 2.6 },
  }),
  make({
    id: 'whisper', name: '悄悄话', tag: '风格', legacy: false,
    desc: '高锐度、低增益、短句尾，括号里的台词会自动变耳语。',
    formant: { scale: 1.02, gain: 0.1, mix: 0.6, q: [6, 7] },
    pitch: { scale: [67, 69, 72, 74], chirp: 0.4, fall: -1, vibrato: { rate: 5, depth: 0.006 } },
    rhythm: { step: 0.14, maxDur: 0.12, hold: 0.7, gap: 0.18 },
    fx: { reverb: 0.18, lowpass: 0.1, drive: 1.9 },
  }),
];

export const PRESET_MAP = new Map(PRESETS.map((p) => [p.id, p]));

export function clonePreset(p) {
  return JSON.parse(JSON.stringify(p));
}
