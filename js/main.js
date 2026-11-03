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

$('#btn-start').addEventListener('click', () => {
  const cfg = seatConfig();
  if (Object.values(cfg).filter(Boolean).length < 2) {
    const e = $('#menu-error');
    e.textContent = S.needTwo;
    e.hidden = false;
    return;
  }
  game.start(cfg);
});

function refreshResume() { $('#btn-resume').hidden = !loadSave(); }
$('#btn-resume').addEventListener('click', () => { const s = loadSave(); if (s) game.resume(s); });

game.onExit = () => { refreshResume(); ui.showScreen('menu'); };
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
