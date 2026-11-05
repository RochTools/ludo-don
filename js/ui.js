// All DOM work: pieces, per-player dice, overlay
import { BOARD, COLORS, locate } from './config.js';
import { S } from './strings.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// pip centres per face (% of the face)
const PIPS = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
// cube rotation [x, y] that brings face v to the front
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
const ROLL_MS = 900;
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
  const dice = {}; // color -> { slot, btn, medal }
  let pickHandler = null;
  let diceResolve = null; // { color, fn }
  let pickCancel = null; // resolves a pending pickMove with null
  let gearHandler = null;

  document.querySelectorAll('.dice-slot').forEach((slot) => {
    const c = slot.dataset.c;
    const btn = slot.querySelector('.dice');
    btn.innerHTML = '<div class="d-sh"></div><div class="d-lift"><div class="d-cube">' +
      [1, 2, 3, 4, 5, 6].map((v) => `<div class="d-f" data-v="${v}">${PIPS[v].map(([x, y]) => `<i class="d-p" style="left:${x}%;top:${y}%"></i>`).join('')}</div>`).join('') +
      '</div></div>';
    slot.style.setProperty('--pc', COLOR_HEX[c]);
    dice[c] = { slot, btn, cube: btn.querySelector('.d-cube'), lift: btn.querySelector('.d-lift'), sh: btn.querySelector('.d-sh'), anims: [], medal: slot.querySelector('.medal') };
    const gear = document.createElement('button');
    gear.className = 'gear';
    gear.hidden = true;
    gear.setAttribute('aria-label', 'Player options');
    gear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" fill-rule="evenodd" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.3 7.3 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>';
    gear.addEventListener('click', () => gearHandler && gearHandler(c));
    slot.appendChild(gear);
    dice[c].gear = gear;
    btn.addEventListener('click', () => {
      if (diceResolve && diceResolve.color === c) { const f = diceResolve.fn; diceResolve = null; f(); }
    });
  });
  function showFace(c, v) {
    const d = dice[c];
    d.anims.forEach((a) => a.cancel());
    d.anims = [];
    const [rx, ry] = FACE_ROT[v];
    d.cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

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
        d.btn.classList.remove('ready');
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
        const done = (choice) => { pickCancel = null; this.clearMovable(); resolve(choice); };
        pickCancel = () => done(null);
        pickHandler = (i) => {
          const legal = moves.filter((m) => m.piece === i).map((m) => m.value);
          if (sameNumbers) return done({ piece: i, value: legal[0] });
          openPicker(color, i, bank, legal, (v) => done({ piece: i, value: v }));
        };
      });
    },
    /** Let any pending 'tap the dice' / 'pick a piece' wait finish (the computer takes over) */
    releaseWaits() {
      if (diceResolve) { const f = diceResolve.fn; diceResolve = null; f(); }
      if (pickCancel) { const f = pickCancel; pickCancel = null; f(); }
    },
    onGear(fn) { gearHandler = fn; },
    /** Show the gear for people (or people handed over to the computer), grey out players who left */
    markSeats(state, seats) {
      for (const c of COLORS) {
        const d = dice[c];
        const inGame = state.order.includes(c);
        const left = !!(state.left && state.left.includes(c));
        const away = !!(state.away && state.away[c]);
        d.slot.classList.toggle('gone', left);
        d.slot.classList.toggle('away', away);
        d.gear.hidden = !inGame || left || !(seats[c] === 'human' || away);
        for (let i = 0; i < 4; i++) { const el = pieceEls[c + i]; if (el) el.style.display = left ? 'none' : ''; }
      }
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
    /** Lift, spin, drop and bounce; the result is already decided, the spin just lands on it */
    async rollDice(color, value) {
      const d = dice[color];
      const [rx, ry] = FACE_ROT[value];
      const o = { duration: ROLL_MS, fill: 'forwards' };
      d.anims.forEach((a) => a.cancel());
      d.anims = [
        d.cube.animate([
          { transform: `rotateX(${rx + 720}deg) rotateY(${ry + 1080}deg) rotateZ(90deg)` },
          { transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(0deg)` },
        ], { ...o, easing: 'cubic-bezier(.2,.6,.3,1)' }),
        d.lift.animate([
          { transform: 'translateY(0) scale(1)' },
          { transform: 'translateY(-26px) scale(1.15)', offset: 0.35 },
          { transform: 'translateY(0) scale(1)', offset: 0.7 },
          { transform: 'translateY(-6px)', offset: 0.85 },
          { transform: 'translateY(0)' },
        ], o),
        d.sh.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(.6)', opacity: 0.5, offset: 0.35 },
          { transform: 'scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'scale(.9)', offset: 0.85 },
          { transform: 'scale(1)' },
        ], o),
      ];
      await d.anims[0].finished.catch(() => {});
      showFace(color, value); // freeze on the final face, drop the animations
    },

    // ---- Overlay ----
    showOverlay({ title, ranking, rules, text, actions }) {
      $('#ov-title').textContent = title;
      $('#ov-list').innerHTML = (ranking || []).map((c, k) => `<li>
        <span class="md">${S.medals[k]}</span><img src="assets/pieces/${c}.png" alt="">
        <span>${S.name(c)}</span><span class="ps">${S.ranks[k]}</span></li>`).join('');
      $('#ov-extra').innerHTML = rules
        ? `<div class="rules"><h3>${S.rulesTitle}</h3><ul>${S.rules.map((r) => `<li>${r}</li>`).join('')}</ul></div>`
        : text ? `<p class="ov-text">${text}</p>` : '';
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
