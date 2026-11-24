import { synth, toWav, syllables, splitSentences, CLASSIC_FISH } from './engine.js';
import { CORPUS } from './corpus.js';
import { PRESETS, PRESET_MAP, clonePreset } from './presets.js';

const $ = (id) => document.getElementById(id);
const MAX_CHARS = 200;

const state = {
  preset: clonePreset(PRESETS[0]),
  presetId: PRESETS[0].id,
  dirty: false,
  samples: null,
  wavBytes: 0,
  stats: { duration: 0, kinds: 0 },
};

const player = new Audio();
player.preload = 'auto';
const previewer = new Audio();
previewer.preload = 'auto';

let playbackId = 0;
let previewUrl = null;
let currentUrl = null;
let renderTimer = 0;
let previewTimer = 0;

/* ---------- 控件定义：六个层，每层若干旋钮 ---------- */

const LAYERS = [
  {
    no: 1, name: '音源', open: true,
    controls: [
      {
        name: '波形', type: 'select',
        options: [['saw', '锯齿'], ['square', '方波'], ['pulse', '脉冲'], ['triangle', '三角']],
        get: (p) => p.source.osc,
        set: (p, v) => { p.source.osc = v; },
      },
    ],
  },
  {
    no: 2, name: '口型', open: true,
    controls: [
      { name: '尖 ↔ 闷', min: 0.7, max: 1.5, step: 0.01, get: (p) => p.formant.scale, set: (p, v) => { p.formant.scale = v; } },
      { name: 'F2 权重', min: 0, max: 1.2, step: 0.01, get: (p) => p.formant.mix, set: (p, v) => { p.formant.mix = v; } },
      { name: '共振锐度', min: 2, max: 9, step: 0.5, get: (p) => p.formant.q[0], set: (p, v) => { p.formant.q = [v, v + 1]; } },
      { name: '单声增益', min: 0.06, max: 0.3, step: 0.005, get: (p) => p.formant.gain, set: (p, v) => { p.formant.gain = v; } },
    ],
  },
  {
    no: 3, name: '音高', open: true,
    controls: [
      {
        name: '音阶', type: 'scale',
        get: (p) => p.pitch.scale,
        set: (p, v) => { p.pitch.scale = v; },
      },
      { name: '移调（半音）', min: -12, max: 12, step: 1, get: (p) => p.pitch.transpose, set: (p, v) => { p.pitch.transpose = v; } },
      { name: '颤音深度', min: 0, max: 0.04, step: 0.001, get: (p) => p.pitch.vibrato.depth, set: (p, v) => { p.pitch.vibrato.depth = v; } },
      { name: '字头滑音', min: 0, max: 3, step: 0.1, get: (p) => p.pitch.chirp, set: (p, v) => { p.pitch.chirp = v; } },
      { name: '句尾下落', min: -6, max: 2, step: 1, get: (p) => p.pitch.fall, set: (p, v) => { p.pitch.fall = v; } },
    ],
  },
  {
    no: 4, name: '节奏', open: false,
    controls: [
      { name: '字间隔（秒）', min: 0.07, max: 0.3, step: 0.005, get: (p) => p.rhythm.step, set: (p, v) => { p.rhythm.step = v; } },
      { name: '字长比例', min: 0.4, max: 1.2, step: 0.01, get: (p) => p.rhythm.hold, set: (p, v) => { p.rhythm.hold = v; } },
      { name: '重叠', min: 0, max: 0.4, step: 0.01, get: (p) => p.rhythm.overlap, set: (p, v) => { p.rhythm.overlap = v; } },
      { name: '句间停顿', min: 0.08, max: 0.5, step: 0.01, get: (p) => p.rhythm.gap, set: (p, v) => { p.rhythm.gap = v; } },
    ],
  },
  {
    no: 5, name: '语气', open: false,
    controls: [
      { name: '语气强度', min: 0, max: 2, step: 0.05, get: (p) => p.prosody.intensity, set: (p, v) => { p.prosody.intensity = v; } },
    ],
  },
  {
    no: 6, name: '效果', open: false,
    controls: [
      { name: '混响', min: 0, max: 0.6, step: 0.01, get: (p) => p.fx.reverb, set: (p, v) => { p.fx.reverb = v; } },
      { name: '低通', min: 0, max: 0.9, step: 0.01, get: (p) => p.fx.lowpass, set: (p, v) => { p.fx.lowpass = v; } },
      { name: '复古（位深压缩）', min: 0, max: 0.8, step: 0.01, get: (p) => p.fx.crush, set: (p, v) => { p.fx.crush = v; } },
      { name: '限幅驱动', min: 1, max: 4, step: 0.1, get: (p) => p.fx.drive, set: (p, v) => { p.fx.drive = v; } },
    ],
  },
];

const controlRefs = [];

/* ---------- 构建界面 ---------- */

function buildPresetOptions() {
  const sel = $('preset');
  sel.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')
    + '<option value="__custom" disabled>自定义（已修改）</option>';
  sel.value = state.presetId;
}

function buildControls() {
  const root = $('controls');
  root.innerHTML = LAYERS.map((layer) => `
    <details class="ctrl-group" ${layer.open ? 'open' : ''}>
      <summary><span class="ctrl-layer-no">${layer.no}</span>${layer.name}</summary>
      <div class="ctrl-body"></div>
    </details>
  `).join('');

  const bodies = root.querySelectorAll('.ctrl-body');

  LAYERS.forEach((layer, li) => {
    layer.controls.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'ctrl-row';

      if (c.type) {
        const options = c.type === 'scale'
          ? Object.entries(CORPUS.scales).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('')
          : c.options.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
        row.innerHTML = `<div class="ctrl-row-head"><span class="ctrl-row-name">${c.name}</span></div>
          <select class="inline-select">${options}</select>`;
        bodies[li].appendChild(row);

        const select = row.querySelector('select');
        select.addEventListener('change', () => {
          if (c.type === 'scale') c.set(state.preset, CORPUS.scales[select.value].notes.slice());
          else c.set(state.preset, select.value);
          onEdit();
        });
        controlRefs.push({ ctrl: c, input: select, kind: c.type });
        return;
      }

      row.innerHTML = `<div class="ctrl-row-head">
          <span class="ctrl-row-name">${c.name}</span>
          <span class="ctrl-row-val">—</span>
        </div>
        <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.min}">`;
      bodies[li].appendChild(row);

      const input = row.querySelector('input');
      const val = row.querySelector('.ctrl-row-val');
      const sync = () => { val.textContent = format(c, Number(input.value)); };
      input.addEventListener('input', () => {
        c.set(state.preset, Number(input.value));
        sync();
        onEdit();
      });
      controlRefs.push({ ctrl: c, input, val, kind: 'range', sync });
    });
  });
}

function format(c, v) {
  if (c.step >= 1) return `${v > 0 ? '+' : ''}${v.toFixed(0)}`;
  return v.toFixed(c.step < 0.01 ? 3 : 2);
}

function syncControls() {
  for (const ref of controlRefs) {
    const value = ref.ctrl.get(state.preset);
    if (ref.kind === 'range') {
      ref.input.value = value;
      ref.val.textContent = format(ref.ctrl, value);
    } else if (ref.kind === 'scale') {
      const key = Object.keys(CORPUS.scales).find((k) => JSON.stringify(CORPUS.scales[k].notes) === JSON.stringify(value));
      if (key) {
        ref.input.value = key;
      } else {
        if (!ref.input.querySelector('option[value="__custom"]')) {
          const opt = document.createElement('option');
          opt.value = '__custom'; opt.textContent = '自定义音阶'; opt.disabled = true;
          ref.input.appendChild(opt);
        }
        ref.input.value = '__custom';
      }
    } else {
      ref.input.value = value;
    }
  }
  $('preset-name').value = state.preset.name;
  $('preset-desc').textContent = state.preset.desc
    || (state.preset.legacy ? '经典算法：音高与口型同源。' : '自定义音色：参数组合。');
}

function buildCorpusChips() {
  const upper = CORPUS.vowels.length * 8 * CORPUS.onsets.length;
  const chips = [
    `<b>${CORPUS.vowels.length}</b> 口型`,
    `<b>${CORPUS.onsets.length}</b> 起音`,
    `<b>${Object.keys(CORPUS.prosody).length}</b> 语气`,
    `<b>${Object.keys(CORPUS.scales).length}</b> 音阶`,
    `<b>${upper}</b> 音节上限`,
  ];
  $('corpus-chips').innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join('');
}

const EXAMPLES = [
  { label: '疑问', text: '今天吃白饭？' },
  { label: '感叹', text: '没饭了！真的没饭了！' },
  { label: '省略', text: '其实……我早就知道了……' },
  { label: '耳语', text: '（小声）别让他们听见。' },
  { label: '拖长', text: '等——等——我——啊~' },
  { label: '中英混', text: 'Bibo bobo 2026，听懂了吗？' },
];

function buildExamples() {
  const root = $('examples');
  root.innerHTML = EXAMPLES.map((e, i) =>
    `<button class="example" type="button" data-i="${i}"><span>${e.label}</span>${e.text}</button>`).join('');
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.example');
    if (!btn) return;
    const item = EXAMPLES[Number(btn.dataset.i)];
    $('text').value = item.text;
    updateCount();
    render();
    play();
  });
}

/* ---------- 渲染与播放 ---------- */

function textValue() {
  return $('text').value.slice(0, MAX_CHARS);
}

function render() {
  const text = textValue();
  const t0 = performance.now();
  let result;
  try {
    result = synth(text, { voice: state.preset, corpus: CORPUS });
  } catch (err) {
    console.error(err);
    showError('合成出错了：' + err.message);
    return;
  }
  state.samples = result.samples;
  state.stats = { duration: result.duration, kinds: result.kinds };
  const wav = result.samples.length ? toWav(result.samples, result.sampleRate) : new Uint8Array(0);
  state.wavBytes = wav.length;
  state.lastSynthMs = performance.now() - t0;
  state.wav = wav;

  draw(result.samples);
  updateStats(result);
  updateCount();

  const empty = result.samples.length === 0;
  $('play').disabled = empty;
  $('save').disabled = empty;
  $('ab').disabled = empty;
  if (empty) showError('先写一句台词吧 —— 空文本不会生成 0.4 秒的静音文件。');
  else hideError();
}

function updateStats(result) {
  $('stats').innerHTML = `
    <span><b>${result.duration.toFixed(2)} s</b>时长</span>
    <span><b>${(state.wavBytes / 1024).toFixed(0)} KB</b>体积</span>
    <span><b>${result.kinds}</b>种音节</span>
    <span><b>${state.lastSynthMs.toFixed(0)} ms</b>合成</span>`;
}

function updateCount() {
  const text = textValue();
  const n = syllables(text).length;
  const s = splitSentences(text).length;
  $('count').textContent = `${n} 声 · ${s} 句${text.length >= MAX_CHARS ? ' · 已截断' : ''}`;
}

function draw(samples) {
  const canvas = $('scope');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 150;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // 网格
  g.strokeStyle = 'rgba(124,245,198,0.07)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }

  // 中轴
  g.strokeStyle = 'rgba(124,245,198,0.18)';
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();

  if (!samples || !samples.length) {
    g.fillStyle = '#41536a';
    g.font = '12px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('等待台词', w / 2, h / 2 - 10);
    return;
  }

  const n = Math.max(1, Math.floor(samples.length / w));
  const peaks = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let peak = 0;
    for (let i = x * n; i < (x + 1) * n && i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    peaks[x] = peak;
  }

  const H = h * 0.46;
  const mid = h / 2;

  // 对称包络：先画上半，再倒着画下半
  g.beginPath();
  g.moveTo(0, mid - peaks[0] * H);
  for (let x = 1; x < w; x++) g.lineTo(x, mid - peaks[x] * H);
  for (let x = w - 1; x >= 0; x--) g.lineTo(x, mid + peaks[x] * H);
  g.closePath();
  g.fillStyle = 'rgba(124, 245, 198, 0.16)';
  g.fill();

  // 上沿亮线
  g.beginPath();
  g.moveTo(0, mid - peaks[0] * H);
  for (let x = 1; x < w; x++) g.lineTo(x, mid - peaks[x] * H);
  g.strokeStyle = '#7cf5c6';
  g.lineWidth = 1.2;
  g.lineJoin = 'round';
  g.stroke();
}

function playBuffer(wav, audio = player) {
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  const prev = audio === player ? currentUrl : previewUrl;
  audio.src = url;
  if (audio === player) currentUrl = url; else previewUrl = url;
  if (prev) URL.revokeObjectURL(prev);
  return audio.play();
}

async function play() {
  if (!state.wav || !state.wav.length) return;
  const id = ++playbackId;
  player.pause();
  previewer.pause();
  try {
    await playBuffer(state.wav);
  } catch (err) {
    if (id !== playbackId) return;
    console.error(err);
    showError('播放失败，请再点一次「说！」，或直接下载 WAV。');
  }
}

function previewSnippet() {
  const text = textValue();
  const first = splitSentences(text)[0];
  if (!first) return null;
  const snip = first.tk.slice(0, 5).join('');
  if (!snip) return null;
  const { samples, sampleRate } = synth(snip, { voice: state.preset, corpus: CORPUS });
  if (!samples.length) return null;
  return toWav(samples, sampleRate);
}

async function playPreview() {
  if (!$('autopreview').checked) return;
  const wav = previewSnippet();
  if (!wav) return;
  try {
    player.pause();
    previewer.pause();
    await playBuffer(wav, previewer);
  } catch { /* 自动试听失败不打扰用户 */ }
}

async function playAB() {
  if (!state.samples || !state.samples.length) return;
  const text = textValue();
  const b = synth(text, { voice: CLASSIC_FISH, corpus: CORPUS });
  const gap = new Float32Array(Math.floor(0.35 * 44100));
  const merged = new Float32Array(state.samples.length + gap.length + b.samples.length);
  merged.set(state.samples, 0);
  merged.set(b.samples, state.samples.length + gap.length);
  const wav = toWav(merged, 44100);
  try {
    player.pause();
    previewer.pause();
    await playBuffer(wav);
    toast('A：当前音色　→　B：经典大肥鱼');
  } catch (err) {
    console.error(err);
    showError('播放失败，请重试。');
  }
}

function saveWav() {
  if (!state.wav || !state.wav.length) return;
  const name = (state.preset.name || 'bibibobo').replace(/[\\/:*?"<>|\s]+/g, '-');
  const url = URL.createObjectURL(new Blob([state.wav], { type: 'audio/wav' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- 编辑与预设管理 ---------- */

function onEdit() {
  markDirty();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    render();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(playPreview, 80);
  }, 170);
}

function markDirty() {
  if (state.dirty) return;
  state.dirty = true;
  $('preset').value = '__custom';
}

function loadPreset(id) {
  const p = PRESET_MAP.get(id);
  if (!p) return;
  state.preset = clonePreset(p);
  state.presetId = id;
  state.dirty = false;
  $('preset').value = id;
  syncControls();
  render();
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

function showShareLink(url) {
  let box = $('share-link');
  if (!box) {
    box = document.createElement('input');
    box.id = 'share-link';
    box.className = 'input';
    box.readOnly = true;
    box.setAttribute('aria-label', '分享链接');
    document.querySelector('.voice-head').appendChild(box);
  }
  box.hidden = false;
  box.value = url;
  box.focus();
  box.select();
  toast('浏览器拦截了自动复制，链接已选中，按 Ctrl+C / ⌘+C 复制。');
}

function showError(msg) { const el = $('play-error'); el.textContent = msg; el.hidden = false; }
function hideError() { $('play-error').hidden = true; }

function randomize() {
  for (const ref of controlRefs) {
    const c = ref.ctrl;
    if (c.type === 'scale') {
      const keys = Object.keys(CORPUS.scales);
      const key = keys[Math.floor(Math.random() * keys.length)];
      ref.input.value = key;
      c.set(state.preset, CORPUS.scales[key].notes.slice());
    } else if (c.type === 'select') {
      const opt = c.options[Math.floor(Math.random() * c.options.length)][0];
      ref.input.value = opt;
      c.set(state.preset, opt);
    } else {
      const steps = Math.round((c.max - c.min) / c.step);
      const v = c.min + Math.round(Math.random() * steps) * c.step;
      c.set(state.preset, Number(v.toFixed(3)));
    }
  }
  state.preset.name = '随机的 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  state.preset.desc = '随机生成的一组参数。';
  syncControls();
  onEdit();
  toast('已随机一个音色，不满意再点一次。');
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('不是有效的音色文件');
  const p = clonePreset(CLASSIC_FISH);
  p.id = typeof raw.id === 'string' ? raw.id.slice(0, 40) : 'imported-' + Date.now();
  p.name = typeof raw.name === 'string' ? raw.name.slice(0, 24) : '导入的音色';
  p.desc = typeof raw.desc === 'string' ? raw.desc.slice(0, 120) : '从文件导入。';
  p.legacy = Boolean(raw.legacy);

  // 先深合并，缺失字段回落到默认值，避免读到 undefined 抛错
  const merged = {
    ...p,
    source: { ...p.source, ...(raw.source || {}) },
    formant: { ...p.formant, ...(raw.formant || {}) },
    pitch: { ...p.pitch, ...(raw.pitch || {}), vibrato: { ...p.pitch.vibrato, ...(raw.pitch?.vibrato || {}) } },
    rhythm: { ...p.rhythm, ...(raw.rhythm || {}) },
    prosody: { ...p.prosody, ...(raw.prosody || {}) },
    fx: { ...p.fx, ...(raw.fx || {}) },
  };
  if (!Array.isArray(merged.formant.q) || merged.formant.q.length < 2) merged.formant.q = [4, 5];

  for (const layer of LAYERS) {
    for (const c of layer.controls) {
      if (c.type === 'select') {
        const allowed = c.options.map(([v]) => v);
        if (allowed.includes(merged.source?.osc)) c.set(p, merged.source.osc);
      } else if (c.type === 'scale') {
        const arr = merged.pitch?.scale;
        if (Array.isArray(arr) && arr.length >= 2 && arr.every((n) => Number.isFinite(n) && n > 24 && n < 108)) {
          c.set(p, arr.slice(0, 12));
        }
      } else {
        const v = c.get(merged);
        if (Number.isFinite(v)) c.set(p, Math.min(c.max, Math.max(c.min, v)));
      }
    }
  }
  return p;
}

function applyImported(raw) {
  const p = sanitize(raw);
  state.preset = p;
  state.dirty = true;
  $('preset').value = '__custom';
  syncControls();
  render();
}

function encodeShare(p) {
  const json = JSON.stringify(p);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ---------- 事件绑定 ---------- */

function bind() {
  $('text').addEventListener('input', () => {
    if ($('text').value.length > MAX_CHARS) {
      $('text').value = $('text').value.slice(0, MAX_CHARS);
      toast(`台词上限 ${MAX_CHARS} 字，已截断。`);
    }
    updateCount();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 200);
  });

  $('play').addEventListener('click', play);
  $('save').addEventListener('click', saveWav);
  $('ab').addEventListener('click', playAB);

  $('preset').addEventListener('change', (e) => {
    if (e.target.value === '__custom') return;
    loadPreset(e.target.value);
    toast(`已切换到「${state.preset.name}」`);
  });

  $('preset-name').addEventListener('input', (e) => {
    state.preset.name = e.target.value.slice(0, 24);
    markDirty();
  });

  $('dice').addEventListener('click', randomize);
  $('reset').addEventListener('click', () => {
    const id = PRESET_MAP.has(state.presetId) ? state.presetId : 'fish-2';
    loadPreset(id);
    toast('已还原到预设参数');
  });

  $('share').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#v=${encodeShare(state.preset)}`;
    const ok = await copyText(url);
    if (ok && url.length < 1800) toast('分享链接已复制，打开即还原这套音色。');
    else if (ok) toast('链接较长，已复制，但部分聊天软件可能截断。');
    else showShareLink(url);
  });

  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.preset.name || 'voice').replace(/\s+/g, '-')}.bibivoice.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出音色 JSON —— 只含参数，不含代码。');
  });

  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      applyImported(JSON.parse(text));
      toast('音色已导入。');
    } catch (err) {
      console.error(err);
      toast('导入失败：' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      play();
    }
  });

  window.addEventListener('resize', () => draw(state.samples));

  // 在已打开的标签页里粘贴分享链接（只改 hash）也能生效
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/#v=(.+)$/);
    if (!m) return;
    try {
      applyImported(decodeShare(m[1]));
      toast('已从链接还原音色。');
    } catch (err) {
      console.error(err);
      toast('链接里的音色解析失败。');
    }
  });
}

function boot() {
  buildPresetOptions();
  buildControls();
  buildCorpusChips();
  buildExamples();
  bind();

  const hash = location.hash.match(/#v=(.+)$/);
  if (hash) {
    try {
      applyImported(decodeShare(hash[1]));
      toast('已从链接还原音色。');
    } catch (err) {
      console.error(err);
      toast('链接里的音色解析失败，已回落到默认预设。');
    }
  } else {
    syncControls();
    render();
  }
  // 首次渲染后画一次波形（字体/尺寸可能刚就绪）
  setTimeout(() => draw(state.samples), 60);
}

boot();
