// All DOM work: pieces, per-player dice, overlay
import { BOARD, COLORS, locate } from './config.js';
import { S } from './strings.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const COLOR_HEX = { red: '#D82643', green: '#078A52', blue: '#1168CD', yellow: '#D58E00' };
const STEP_MS = 190;
const IDLE_FACE = 5; // shown on every dice before its first roll

// Offsets when several pieces share one cell (SVG px)
const STACK = {
  2: { s: 0.72, o: [[-11, 0], [11, 0]] },
  3: { s: 0.62, o: [[-12, -10], [12, -10], [0, 12]] },
  4: { s: 0.55, o: [[-12, -12], [12, -12], [-12, 12], [12, 12]] },
};

export function createUI() {
  const layer = $('#pieces');
  const pieceEls = {}; // "green0" -> div
  const dice = {}; // color -> { slot, btn, pips, medal }
  let pickHandler = null;
  let diceResolve = null; // { color, fn }

  document.querySelectorAll('.dice-slot').forEach((slot) => {
    const c = slot.dataset.c;
    const btn = slot.querySelector('.dice');
    btn.innerHTML = Array.from({ length: 9 }, () => '<i></i>').join('');
    slot.style.setProperty('--pc', COLOR_HEX[c]);
    dice[c] = { slot, btn, pips: [...btn.children], medal: slot.querySelector('.medal') };
    btn.addEventListener('click', () => {
      if (diceResolve && diceResolve.color === c) { const f = diceResolve.fn; diceResolve = null; f(); }
    });
  });
  function showFace(c, v) { dice[c].pips.forEach((p, k) => p.classList.toggle('on', !!v && PIPS[v].includes(k))); }

  layer.addEventListener('click', (e) => {
    const pc = e.target.closest('.piece');
    if (pc && pc.classList.contains('movable') && pickHandler) pickHandler(+pc.dataset.i);
  });

  // ---- number picker (small popup above a tapped piece) ----
  const board = $('#board');
  const picker = $('#picker');
  function closePicker() { picker.hidden = true; picker.innerHTML = ''; picker.onclick = null; }
  function openPicker(color, i, bank, legal, onPick) {
    const b = board.getBoundingClientRect();
    const r = pieceEls[color + i].getBoundingClientRect();
    const cx = ((r.left + r.width / 2 - b.left) / b.width) * 100;
    const cy = ((r.top + r.height / 2 - b.top) / b.height) * 100;
    picker.style.setProperty('--pc', COLOR_HEX[color]);
    picker.innerHTML = bank.map((v, k) => `<button class="pv" data-k="${k}"${legal.includes(v) ? '' : ' disabled'}>${v}</button>`).join('');
    picker.style.left = `${Math.min(82, Math.max(18, cx))}%`;
    picker.style.top = `${cy}%`;
    picker.className = `picker ${cy < 22 ? 'below' : 'above'}`;
    picker.hidden = false;
    picker.onclick = (e) => {
      const btn = e.target.closest('.pv');
      if (btn && !btn.disabled) onPick(bank[+btn.dataset.k]);
    };
  }
  board.addEventListener('pointerdown', (e) => {
    if (!picker.hidden && !e.target.closest('.picker') && !e.target.closest('.piece.movable')) closePicker();
  });

  // Pieces are 5.8% of the board wide and positioned with transform (no layout per frame).
  // translate % is relative to the piece itself, so convert board px -> piece-widths.
  const PIECE_W = 5.8;
  const tr = (v) => (v / BOARD) * 100 / PIECE_W * 100 - 50;
  function setPos(el, x, y, s = 1) {
    el.style.transform = `translate(${tr(x)}%, ${tr(y)}%) scale(${s})`;
  }

  return {
    showScreen(name) {
      document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    },

    /** Create the pieces and show only the dice of colours in play */
    setupBoard(order) {
      layer.innerHTML = '';
      for (const k of Object.keys(pieceEls)) delete pieceEls[k];
      for (const c of order) {
        for (let i = 0; i < 4; i++) {
          const el = document.createElement('div');
          el.className = 'piece';
          el.dataset.color = c;
          el.dataset.i = i;
          el.innerHTML = `<span class="hop"><img src="assets/pieces/${c}.png" alt="" draggable="false"></span>`;
          layer.appendChild(el);
          pieceEls[c + i] = el;
        }
      }
      diceResolve = null;
      for (const c of COLORS) {
        const d = dice[c];
        d.slot.style.visibility = order.includes(c) ? 'visible' : 'hidden';
        d.slot.classList.remove('active');
        d.btn.classList.remove('ready', 'rolling');
        d.btn.disabled = true;
        d.medal.textContent = '';
        showFace(c, IDLE_FACE);
      }
    },

    /** Place all pieces (stacked offsets where cells are shared) */
    layoutAll(state, instant = false) {
      if (instant) layer.classList.add('instant');
      const groups = new Map();
      for (const c of state.order) {
        state.pieces[c].forEach((p, i) => {
          const loc = locate(c, p, i);
          if (!groups.has(loc.key)) groups.set(loc.key, []);
          groups.get(loc.key).push({ c, i, loc });
        });
      }
      for (const list of groups.values()) {
        const n = Math.min(list.length, 4);
        list.forEach(({ c, i, loc }, k) => {
          const el = pieceEls[c + i];
          if (list.length > 1) {
            const st = STACK[n];
            const [dx, dy] = st.o[k % st.o.length];
            setPos(el, loc.x + dx, loc.y + dy, st.s);
          } else setPos(el, loc.x, loc.y, loc.s);
          el.style.zIndex = 10 + i;
        });
      }
      if (instant) { void layer.offsetWidth; layer.classList.remove('instant'); }
    },

    /** Hop a piece along its path, cell by cell */
    async animateMove(color, i, path, onStep) {
      const el = pieceEls[color + i];
      el.style.zIndex = 1000;
      for (const p of path) {
        const l = locate(color, p, i);
        setPos(el, l.x, l.y, l.s);
        el.classList.remove('hopping'); void el.offsetWidth; el.classList.add('hopping');
        onStep && onStep(p);
        await sleep(STEP_MS);
      }
      el.classList.remove('hopping');
    },

    async sendHome(color, i) {
      const el = pieceEls[color + i];
      const l = locate(color, 0, i);
      el.style.zIndex = 900;
      setPos(el, l.x, l.y, 1);
      await sleep(STEP_MS * 2);
    },

    /**
     * Highlight the pieces that can move. Tap a piece:
     *  - if the saved numbers are all the same, play it straight away
     *  - otherwise a small popup lists every saved number; tap one to use it
     * Resolves with { piece, value }.
     */
    pickMove(color, moves, bank) {
      return new Promise((resolve) => {
        const pieces = [...new Set(moves.map((m) => m.piece))];
        pieces.forEach((i) => pieceEls[color + i].classList.add('movable'));
        const sameNumbers = new Set(bank).size <= 1;
        const done = (choice) => { this.clearMovable(); resolve(choice); };
        pickHandler = (i) => {
          const legal = moves.filter((m) => m.piece === i).map((m) => m.value);
          if (sameNumbers) return done({ piece: i, value: legal[0] });
          openPicker(color, i, bank, legal, (v) => done({ piece: i, value: v }));
        };
      });
    },
    clearMovable() {
      pickHandler = null;
      closePicker();
      layer.querySelectorAll('.movable').forEach((e) => e.classList.remove('movable'));
    },

    // ---- Dice (one per player) ----
    /** Highlight the current player's dice, dim the rest, show medals */
    setTurn(state) {
      const cur = state.over ? null : state.order[state.turn];
      for (const c of state.order) {
        dice[c].slot.classList.toggle('active', c === cur);
        const rank = state.finished.indexOf(c);
        dice[c].medal.textContent = rank >= 0 ? S.medals[rank] : '';
      }
    },
    waitDiceClick(color) {
      const b = dice[color].btn;
      b.disabled = false;
      b.classList.add('ready');
      return new Promise((resolve) => {
        diceResolve = { color, fn: () => { b.classList.remove('ready'); b.disabled = true; resolve(); } };
      });
    },
    async rollDice(color, value) {
      const b = dice[color].btn;
      b.classList.add('rolling');
      const t0 = performance.now();
      let f = 0;
      while (performance.now() - t0 < 650) {
        f = (f + 1 + (f % 2)) % 6; // cycles through faces, no randomness needed
        showFace(color, f + 1);
        await sleep(85);
      }
      b.classList.remove('rolling');
      showFace(color, value);
    },

    // ---- Overlay ----
    showOverlay({ title, ranking, rules, actions }) {
      $('#ov-title').textContent = title;
      $('#ov-list').innerHTML = (ranking || []).map((c, k) => `<li>
        <span class="md">${S.medals[k]}</span><img src="assets/pieces/${c}.png" alt="">
        <span>${S.name(c)}</span><span class="ps">${S.ranks[k]}</span></li>`).join('');
      $('#ov-extra').innerHTML = rules
        ? `<div class="rules"><h3>${S.rulesTitle}</h3><ul>${S.rules.map((r) => `<li>${r}</li>`).join('')}</ul></div>`
        : '';
      const box = $('#ov-actions');
      box.innerHTML = '';
      for (const a of actions) {
        const b = document.createElement('button');
        b.className = 'btn' + (a.primary ? ' primary' : '');
        b.textContent = a.label;
        b.addEventListener('click', a.onClick);
        box.appendChild(b);
      }
      $('#overlay').hidden = false;
    },
    hideOverlay() { $('#overlay').hidden = true; },
  };
}
