// Web Audio sounds.
// Files are fetched at page load (cheap, cached by the service worker) but only DECODED
// one at a time after the first touch, so a tap on the dice never waits on audio work.
const FILES = {
  dice: 'dice.mp3',
  move: 'move.mp3',
  kill: 'kill.mp3',
  win: 'win.mp3',
  over: 'game-over.mp3',
};
const DECODE_ORDER = ['dice', 'move', 'kill', 'win', 'over'];
const MAX = { kill: 1.6 }; // cut long sounds (seconds)

let ctx = null;
let started = false;
const raw = {}; // name -> ArrayBuffer (fetched, not yet decoded)
const buffers = {}; // name -> AudioBuffer

/** Call once at page load */
export function preload() {
  for (const [k, f] of Object.entries(FILES)) {
    fetch(`assets/sounds/${f}`)
      .then((r) => r.arrayBuffer())
      .then((b) => { raw[k] = b; })
      .catch(() => { /* sound missing: game still works */ });
  }
}

const idle = (ms) => new Promise((r) => setTimeout(r, ms));

async function decodeAll() {
  for (const k of DECODE_ORDER) {
    for (let i = 0; i < 50 && !raw[k]; i++) await idle(100); // wait for fetch
    if (!raw[k]) continue;
    try {
      const data = raw[k];
      delete raw[k];
      buffers[k] = await new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail));
    } catch { /* skip */ }
    await idle(200); // breathe between decodes so the UI stays smooth
  }
}

/** Browsers only allow audio after a touch; call on the first one */
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) { started = true; setTimeout(decodeAll, 600); }
  } catch { /* ignore */ }
}

export function play(name, volume = 1) {
  if (!ctx || !buffers[name]) return;
  try {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffers[name];
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    const max = MAX[name];
    if (max) {
      gain.gain.setValueAtTime(volume, now + max - 0.3);
      gain.gain.linearRampToValueAtTime(0, now + max);
      src.start(now, 0, max);
    } else src.start(now);
  } catch { /* ignore */ }
}
