// Pure game rules — no DOM, so it can be tested in Node.
//
// A turn works like this:
//   1. The player rolls. A 6 is SAVED in state.bank and they roll again (max 2 sixes;
//      the 3rd six in a row loses the whole turn).
//   2. The first non-6 ends the roll sequence and is saved too.
//   3. The player then spends every saved number, in any order, on any pieces.
//   4. Capturing a piece or reaching home earns a bonus roll sequence (state.bonus).
import { FINISH, START_IDX, SAFE_IDX, TRACK_LEN } from './config.js';

export function trackIndex(color, p) {
  return p >= 1 && p <= 51 ? (START_IDX[color] + p - 1) % TRACK_LEN : -1;
}

/** order: colours in play, clockwise */
export function newGame(order) {
  const pieces = {};
  for (const c of order) pieces[c] = [0, 0, 0, 0];
  return { order: [...order], turn: 0, sixes: 0, bank: [], bonus: 0, finished: [], over: false, pieces };
}

export const current = (s) => s.order[s.turn];
export const rollDice = (rng = Math.random) => 1 + Math.floor(rng() * 6);

/** Pieces of the current player that can use `value` */
export function legalMoves(s, value) {
  const color = current(s);
  const res = [];
  s.pieces[color].forEach((p, i) => {
    if (p === 0) { if (value === 6) res.push(i); }
    else if (p + value <= FINISH) res.push(i);
  });
  return res;
}

/** Every (piece, value) the current player can play from the saved numbers */
export function allMoves(s) {
  const out = [];
  for (const value of new Set(s.bank)) {
    for (const piece of legalMoves(s, value)) out.push({ piece, value });
  }
  return out;
}

/**
 * Register a dice roll.
 *  'again'   – it was a 6 (saved); roll again
 *  'ready'   – roll sequence finished; spend the saved numbers
 *  'forfeit' – third six in a row; turn is lost (already passed to the next player)
 */
export function applyRoll(s, value) {
  if (value === 6) {
    s.sixes++;
    if (s.sixes >= 3) { endTurn(s); return { type: 'forfeit' }; }
    s.bank.push(6);
    return { type: 'again' };
  }
  s.sixes = 0;
  s.bank.push(value);
  return { type: 'ready' };
}

/** Play `value` (taken from the saved numbers) with piece `i`. Mutates s. */
export function applyMove(s, i, value) {
  const k = s.bank.indexOf(value);
  if (k < 0) throw new Error('value not in bank');
  s.bank.splice(k, 1);

  const color = current(s);
  const from = s.pieces[color][i];
  const to = from === 0 ? 1 : from + value;
  const path = [];
  if (from === 0) path.push(1);
  else for (let p = from + 1; p <= to; p++) path.push(p);
  s.pieces[color][i] = to;

  const captured = [];
  const idx = trackIndex(color, to);
  if (idx >= 0 && !SAFE_IDX.has(idx)) {
    for (const oc of s.order) {
      if (oc === color) continue;
      s.pieces[oc].forEach((p, j) => {
        if (trackIndex(oc, p) === idx) { s.pieces[oc][j] = 0; captured.push({ color: oc, piece: j }); }
      });
    }
  }

  const reachedHome = to === FINISH;
  const playerDone = s.pieces[color].every((p) => p === FINISH);
  if (playerDone && !s.finished.includes(color)) s.finished.push(color);
  if (s.order.length - s.finished.length <= 1) {
    for (const c of s.order) if (!s.finished.includes(c)) s.finished.push(c);
    s.over = true;
  }
  if (!s.over && !playerDone && (captured.length > 0 || reachedHome)) s.bonus++;
  return { color, piece: i, value, from, to, path, captured, reachedHome, playerDone };
}

/**
 * Decide what happens next. Call after a roll sequence and after every move.
 *  'moves' – the player still has a playable saved number
 *  'roll'  – nothing left to play, but a bonus roll sequence is owed to the same player
 *  'next'  – turn passed to the next player
 *  'over'  – game finished
 */
export function settle(s) {
  if (s.over) return 'over';
  const color = current(s);
  if (s.bank.length && allMoves(s).length) return 'moves';
  s.bank = [];
  s.sixes = 0;
  if (s.bonus > 0 && !s.finished.includes(color)) { s.bonus--; return 'roll'; }
  s.bonus = 0;
  nextTurn(s);
  return 'next';
}

/** Lose the rest of this turn (used for three sixes) */
export function endTurn(s) {
  s.bank = [];
  s.bonus = 0;
  nextTurn(s);
}

/** Next player's turn (skipping players who already finished) */
export function nextTurn(s) {
  s.sixes = 0;
  s.bank = [];
  if (s.over) return;
  do { s.turn = (s.turn + 1) % s.order.length; } while (s.finished.includes(s.order[s.turn]));
}
