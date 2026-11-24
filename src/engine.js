/*!
 * bibibobo engine — demo fork
 * 原始实现：https://github.com/hakihakii/bibibobo
 * Copyright (c) 2026 hakihakii (Lumoswitch) — MIT License
 *
 * 本文件基于上述 MIT 项目修改：把口型/音色抽成数据、解耦音高与口型索引、
 * 增加起音辅音、双元音滑动与效果链。原始版权与许可声明保留，详见 LICENSE。
 */
import { CORPUS } from './corpus.js';

export const TAU = Math.PI * 2;
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** 上游原版五种口型，用于「经典」声线，保证听感接近原版。 */
export const LEGACY_VOWELS = [[800, 1200], [400, 2200], [350, 800], [600, 1700], [300, 2600]];

/** 同一个字永远得到同一个数 —— 产品的记忆点。 */
export const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 9973, 7);

/** 一个汉字算一声，一串英文或数字算一声。 */
export const syllables = (s) => s.match(/[A-Za-z_/.0-9]+|[\u4e00-\u9fff]/g) ?? [];

/** 按标点切句，每句各自套一条语气规则。 */
export const splitSentences = (text) =>
  (text.match(/[^？?！!。.，,、；;…~～\n]+[？?！!。.，,、；;…~～]*/g) ?? [])
    .map((s) => ({ text: s, tk: syllables(s) }))
    .filter((s) => s.tk.length);

/** 确定性随机数：保证同一段文字每次生成完全一样的声音。 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** 抗混叠振荡器：锯齿 / 方波 / 脉冲 / 三角。 */
function makeOsc(kind, sr) {
  let ph = 0;
  if (kind === 'square' || kind === 'pulse') {
    const w = kind === 'pulse' ? 0.32 : 0.5;
    return (f) => {
      const dt = f / sr; ph += dt; if (ph >= 1) ph -= 1;
      let v = ph < w ? 1 : -1;
      v += polyblep(ph, dt);
      v -= polyblep((ph - w + 1) % 1, dt);
      return v;
    };
  }
  if (kind === 'triangle') {
    return (f) => {
      const dt = f / sr; ph += dt; if (ph >= 1) ph -= 1;
      return 1 - 4 * Math.abs(ph - 0.5);
    };
  }
  return (f) => {
    const dt = f / sr; ph += dt; if (ph >= 1) ph -= 1;
    return 2 * ph - 1 - polyblep(ph, dt);
  };
}

/** 状态变量滤波器，取带通输出。 */
function bandpass(sr) {
  let lp = 0, bp = 0;
  return (x, fc, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, sr / 6)) / sr);
    const hp = x - lp - bp / q;
    bp += f * hp; lp += f * bp;
    return bp;
  };
}

/** 一句用什么语气：看句末标点。 */
function pickProsody(text, corpus, v) {
  const P = corpus.prosody;
  const t = text.trim();
  let key = 'flat';
  if (/[？?]$/.test(t)) key = /(吗|呢|吧|什么|怎么|为什么|哪|谁|几)/.test(t) ? 'doubt' : 'ask';
  else if (/[！!]$/.test(t)) key = 'shout';
  else if (/(……|\.\.\.|…)$/.test(t)) key = 'sad';
  else if (/[~～]$/.test(t)) key = 'drag';
  else if (/^[(（].*[)）]$/.test(t)) key = 'whisper';
  const base = P[key] ?? P.flat;
  const k = v.prosody?.intensity ?? 1;
  return {
    key,
    pitch: (base.pitch ?? 0) * k,
    lastGlide: (base.lastGlide ?? 0) * k,
    lastStretch: (base.lastStretch ?? 0) * k,
    rate: 1 + ((base.rate ?? 1) - 1) * k,
    gain: 1 + ((base.gain ?? 1) - 1) * k,
  };
}

/** 写一声：振荡器 → 双共振峰 → 包络 → 起音。 */
function renderSyllable(out, sr, t, m, dur, h, v, corpus, vowel, onset, glide) {
  const start = Math.floor(t * sr);
  const n = Math.floor(dur * sr);
  if (n <= 0 || start >= out.length) return;

  const osc = makeOsc(v.source?.osc ?? 'saw', sr);
  const f1 = bandpass(sr);
  const f2 = bandpass(sr);

  const pts = Array.isArray(vowel.f[0]) ? vowel.f : [vowel.f, vowel.f];
  const [a1, b1] = pts[0];
  const [a2, b2] = pts[1];

  const fs = v.formant.scale;
  const q1 = v.formant.q[0];
  const q2 = v.formant.q[1];
  const mix = v.formant.mix;
  const gain = v.formant.gain;
  const vib = v.pitch.vibrato;

  for (let i = 0; i < n && start + i < out.length; i++) {
    const x = i / sr;
    const u = n > 1 ? i / n : 0;
    const pv = 1 + vib.depth * Math.sin(TAU * vib.rate * x);
    const pitch = mtof(m + glide * u + v.pitch.chirp * Math.exp(-x * 30)) * pv;
    const s = osc(pitch);
    const fa1 = (a1 + (a2 - a1) * u) * fs;
    const fa2 = (b1 + (b2 - b1) * u) * fs;
    const env = Math.min(1, x * 200) * Math.min(1, (dur - x) * 40);
    out[start + i] += (f1(s, fa1, q1) + mix * f2(s, fa2, q2)) * env * gain;
  }

  if (!onset || onset.type === 'none') return;
  const rnd = mulberry32(h + 17);
  const n2 = Math.floor((onset.dur ?? 0.03) * sr);
  const g = (onset.gain ?? 0.5) * gain;

  if (onset.type === 'noise') {
    const bp = bandpass(sr);
    const centre = (onset.band[0] + onset.band[1]) / 2;
    for (let i = 0; i < n2 && start + i < out.length; i++) {
      const env = Math.exp(-i / (n2 * 0.35));
      out[start + i] += bp(rnd() * 2 - 1, centre, 1.6) * env * g * 2.2;
    }
  } else if (onset.type === 'burst') {
    const o = makeOsc('saw', sr);
    for (let i = 0; i < n2 && start + i < out.length; i++) {
      const env = Math.exp(-i / (n2 * 0.3));
      out[start + i] += o(onset.f ?? 200) * env * g * 0.9;
    }
  } else if (onset.type === 'nasal') {
    for (let i = 0; i < n2 && start + i < out.length; i++) {
      const env = Math.exp(-i / (n2 * 0.6));
      out[start + i] += Math.sin(TAU * (onset.f ?? 120) * (i / sr)) * env * g * 0.5;
    }
  }
}

function reverb(input, sr, mix) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((d) => ({
    buf: new Float32Array(Math.max(1, Math.floor(d * sr))), i: 0, f: 0,
  }));
  const ap = { buf: new Float32Array(Math.max(1, Math.floor(0.005 * sr))), i: 0 };
  const out = new Float32Array(input.length);
  const fb = 0.72, damp = 0.35;
  for (let n = 0; n < input.length; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.f = y * (1 - damp) + c.f * damp;
      c.buf[c.i] = input[n] + c.f * fb;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    acc /= combs.length;
    const b = ap.buf[ap.i];
    const y2 = -acc + b * 0.5;
    ap.buf[ap.i] = acc + b * 0.5;
    ap.i = (ap.i + 1) % ap.buf.length;
    out[n] = input[n] * (1 - mix) + y2 * mix;
  }
  return out;
}

function applyFx(src, sr, fx) {
  let y = Float32Array.from(src);

  if (fx.crush > 0) {
    const bits = 16 - Math.round(fx.crush * 11);
    const levels = 2 ** Math.max(3, bits);
    const hold = 1 + Math.round(fx.crush * (sr / 9000));
    let last = 0;
    for (let i = 0; i < y.length; i++) {
      if (i % hold === 0) last = Math.round(y[i] * levels) / levels;
      y[i] = last;
    }
  }

  if (fx.lowpass > 0) {
    const fc = 14000 * Math.pow(0.06, fx.lowpass);
    const a = 1 - Math.exp((-TAU * fc) / sr);
    let z = 0;
    for (let i = 0; i < y.length; i++) { z += a * (y[i] - z); y[i] = z; }
  }

  if (fx.reverb > 0) y = reverb(y, sr, Math.min(0.85, fx.reverb));

  const drive = fx.drive > 0 ? fx.drive : 1;
  for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * drive);
  return y;
}

/** 兜底音色：与上游 fish 一致。 */
export const CLASSIC_FISH = {
  id: 'fish-classic', name: '大肥鱼 · 经典', legacy: true,
  source: { osc: 'saw' },
  formant: { scale: 1.25, q: [4, 5], mix: 0.7, gain: 0.16 },
  pitch: { scale: [76, 79, 81, 83, 84], transpose: 0, vibrato: { rate: 6, depth: 0.012 }, chirp: 1.5, fall: 0 },
  rhythm: { step: 0.13, hold: 0.8, maxDur: 0.13, gap: 0.22, overlap: 0 },
  prosody: { intensity: 1 },
  fx: { reverb: 0, lowpass: 0, crush: 0, drive: 2.4 },
};

/**
 * 把一句话合成为单声道采样。
 * @returns {{samples: Float32Array, sampleRate: number, syllables: number, kinds: number, duration: number}}
 */
export function synth(text, opts = {}) {
  const v = opts.voice ?? CLASSIC_FISH;
  const corpus = opts.corpus ?? CORPUS;
  const sr = opts.sampleRate ?? 44100;
  const step = opts.step ?? v.rhythm.step;
  const gap = opts.gap ?? v.rhythm.gap;
  const overlap = Math.min(0.6, Math.max(0, v.rhythm.overlap ?? 0));
  const effStep = step * (1 - overlap);

  const sentences = splitSentences(text);
  if (!sentences.length) {
    return { samples: new Float32Array(0), sampleRate: sr, syllables: 0, kinds: 0, duration: 0 };
  }

  const total = sentences.reduce((n, s) => n + s.tk.length * effStep + gap, 0) + 0.6;
  const out = new Float32Array(Math.ceil(total * sr));
  const kinds = new Set();
  let count = 0;
  let t = 0.02;

  for (const { text: s, tk } of sentences) {
    const p = pickProsody(s, corpus, v);
    tk.forEach((w, i) => {
      const last = i === tk.length - 1;
      const h = hash(w);

      // 音高、口型、起音用哈希的不同位切片，避免互相相关。
      const pitchIdx = h % v.pitch.scale.length;
      let vowel, onset;
      if (v.legacy) {
        vowel = { id: 'legacy', f: LEGACY_VOWELS[h % LEGACY_VOWELS.length], dur: 1 };
        onset = corpus.onsets[0];
      } else {
        vowel = corpus.vowels[(h >>> 4) % corpus.vowels.length];
        onset = corpus.onsets[(h >>> 9) % corpus.onsets.length];
      }
      kinds.add(`${pitchIdx}:${vowel.id}:${onset.id}`);

      const m = v.pitch.scale[pitchIdx] + (v.pitch.transpose ?? 0) + p.pitch;
      const baseDur = Math.min(step * v.rhythm.hold, v.rhythm.maxDur) / p.rate;
      const dur = baseDur + (last ? p.lastStretch : 0);
      const glide = last ? (last && p.lastGlide !== 0 ? p.lastGlide : v.pitch.fall) : 0;

      renderSyllable(out, sr, t + i * effStep, m, dur, h, v, corpus, vowel, onset, last ? glide : 0);
      count++;
    });
    t += tk.length * effStep + gap;
  }

  const samples = applyFx(out, sr, v.fx);
  return { samples, sampleRate: sr, syllables: count, kinds: kinds.size, duration: samples.length / sr };
}

/** 打包成 16 位单声道 WAV。 */
export function toWav(samples, sampleRate = 44100) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const d = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  d.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, sampleRate, true);
  d.setUint32(28, sampleRate * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  str(36, 'data');
  d.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    d.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return new Uint8Array(buf);
}
