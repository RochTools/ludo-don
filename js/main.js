// Boot: start screen, audio unlock, install button, service worker
import { COLORS } from './config.js';
import { S } from './strings.js';
import * as audio from './audio.js';
import { createUI } from './ui.js';
import { createGame, loadSave } from './game.js';

const $ = (s) => document.querySelector(s);
const ui = createUI();
const game = createGame(ui);

// ---------- Settings (who plays each colour) ----------
const SETTINGS_KEY = 'ludo.settings.v1';
const DEFAULT_SEATS = { red: 'human', green: 'cpu', yellow: 'cpu', blue: 'cpu' };
let settings = { seats: { ...DEFAULT_SEATS } };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* */ }
const persist = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* */ } };

// Browsers only allow sound after a touch
window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
audio.preload();

// ---------- Start screen ----------
const MODES = [['human', S.human], ['cpu', S.cpu], ['off', S.off]];
function renderSeats() {
  $('#seats').innerHTML = COLORS.map((c) => `
    <div class="seat">
      <img src="assets/pieces/${c}.png" alt="">
      <span class="nm">${S.name(c)}</span>
      <div class="seg" data-c="${c}">
        ${MODES.map(([m, label]) => `<button data-m="${m}" class="${(settings.seats[c] || 'off') === m ? 'on' : ''}">${label}</button>`).join('')}
      </div>
    </div>`).join('');
}
$('#seats').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  settings.seats[b.parentElement.dataset.c] = b.dataset.m;
  $('#menu-error').hidden = true;
  persist();
  renderSeats();
});

function seatConfig() {
  const cfg = {};
  for (const c of COLORS) { const m = settings.seats[c]; cfg[c] = m === 'human' || m === 'cpu' ? m : null; }
  return cfg;
}

function begin(cfg, teams = false) {
  if (Object.values(cfg).filter(Boolean).length < 2) {
    const e = $('#menu-error');
    e.textContent = S.needTwo;
    e.hidden = false;
    return;
  }
  game.start(cfg, teams);
}
$('#btn-start').addEventListener('click', () => begin(seatConfig()));

// ---------- Menu views and quick presets ----------
// seats: red top-left, green top-right, yellow bottom-right, blue bottom-left (red/yellow and green/blue face each other)
const H = 'human', C = 'cpu';
const PRESETS = {
  c1: { red: H, yellow: C },
  c2: { red: H, green: C, yellow: C },
  c3: { red: H, green: C, yellow: C, blue: C },
  p2: { red: H, yellow: H },
  p3: { red: H, green: H, yellow: H },
  p4: { red: H, green: H, yellow: H, blue: H },
};
// partner games: red+yellow vs green+blue, partners sit opposite and never capture each other
const TEAM_PRESETS = {
  t1: { red: H, green: C, yellow: C, blue: C },
  t2: { red: H, green: C, yellow: H, blue: C },
  t4: { red: H, green: H, yellow: H, blue: H },
};
function showView(name) {
  document.querySelectorAll('#screen-menu .view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  if (name === 'custom') $('#menu-error').hidden = true;
}
let toastTimer = 0;
function toast() {
  const t = $('#toast');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 1600);
}
$('#screen-menu').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { showView(go.dataset.go); return; }
  if (e.target.closest('[data-soon]')) { toast(); return; }
  const p = e.target.closest('[data-preset]');
  const none = { red: null, green: null, yellow: null, blue: null };
  if (p && TEAM_PRESETS[p.dataset.preset]) begin({ ...none, ...TEAM_PRESETS[p.dataset.preset] }, true);
  else if (p) begin({ ...none, ...PRESETS[p.dataset.preset] });
});

function refreshResume() { $('#btn-resume').hidden = !loadSave(); }
$('#btn-resume').addEventListener('click', () => { const s = loadSave(); if (s) game.resume(s); });

game.onExit = () => { refreshResume(); showView('home'); ui.showScreen('menu'); };
$('#btn-menu').addEventListener('click', () => game.openPause());

// ---------- Install button ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#btn-install').hidden = false;
});
$('#btn-install').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  $('#btn-install').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#btn-install').hidden = true; });

// ---------- Service worker (offline) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* not available on file:// */ });
  });
}

renderSeats();
refreshResume();
