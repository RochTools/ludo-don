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
export const PARTNER = { red: 'yellow', yellow: 'red', green: 'blue', blue: 'green' };

/**
 * order: colours in play, clockwise.
 * teams: 2 v 2 with partners sitting opposite (red+yellow, green+blue); needs all four colours.
 *  - partners never capture each other and may share a cell
 *  - the team wins when BOTH partners have all four pieces home
 *  - a player who is already home still rolls, and spends those numbers on the partner's pieces
 */
export function newGame(order, teams = false) {
  const pieces = {};
  for (const c of order) pieces[c] = [0, 0, 0, 0];
  const useTeams = teams && order.length === 4;
  // blue (bottom of the screen) always starts when it is playing
  const first = Math.max(0, order.indexOf('blue'));
  return { order: [...order], turn: first, sixes: 0, bank: [], bonus: 0, finished: [], over: false, pieces, partner: useTeams ? { ...PARTNER } : null, left: [], away: {} };
}

export const current = (s) => s.order[s.turn];
/** Colours that quit the game (their pieces are removed; counted as home so the rest of the rules keep working) */
export const isLeft = (s, c) => !!(s.left && s.left.includes(c));
const homeDone = (s, c) => s.pieces[c].every((p) => p === FINISH);
/** Colour whose pieces move now: the current player's, or the partner's once the current player is home */
export const mover = (s) => {
  const c = current(s);
  return s.partner && homeDone(s, c) ? s.partner[c] : c;
};
export const teamOf = (s, c) => (s.partner ? [c, s.partner[c]] : [c]);
export const rollDice = (rng = Math.random) => 1 + Math.floor(rng() * 6);

/** Pieces of the current player that can use `value` */
export function legalMoves(s, value) {
  const color = mover(s);
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

  const color = mover(s);
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
      if (oc === color || (s.partner && oc === s.partner[color])) continue; // partners are safe from each other
      s.pieces[oc].forEach((p, j) => {
        if (trackIndex(oc, p) === idx) { s.pieces[oc][j] = 0; captured.push({ color: oc, piece: j }); }
      });
    }
  }

  const reachedHome = to === FINISH;
  const playerDone = homeDone(s, color);
  if (playerDone && !s.finished.includes(color)) s.finished.push(color);
  checkEnd(s);
  if (!s.over && !playerDone && (captured.length > 0 || reachedHome)) s.bonus++;
  return { color, piece: i, value, from, to, path, captured, reachedHome, playerDone };
}

/** Has the game been decided? Sets s.over and the final order in s.finished */
export function checkEnd(s) {
  if (s.over) return;
  const left = (c) => isLeft(s, c);
  if (s.partner) {
    // a team wins when both partners are home; the other team loses. A team whose players both quit loses at once.
    let win = s.order.find((c) => homeDone(s, c) && homeDone(s, s.partner[c]) && !(left(c) && left(s.partner[c])));
    const gone = s.order.find((c) => left(c) && left(s.partner[c]));
    if (gone) win = s.order.find((c) => c !== gone && c !== s.partner[gone]);
    if (win) {
      const team = [win, s.partner[win]];
      const first = s.finished.filter((c) => team.includes(c));
      for (const c of team) if (!first.includes(c)) first.push(c);
      const rest = s.finished.filter((c) => !team.includes(c));
      for (const c of s.order) if (!team.includes(c) && !rest.includes(c)) rest.push(c);
      s.finished = [...first, ...rest];
      s.over = true;
    }
  } else {
    const active = s.order.filter((c) => !s.finished.includes(c) && !left(c));
    if (active.length <= 1) {
      for (const c of active) s.finished.push(c);
      s.over = true;
    }
  }
}

/** A player quits: pieces are removed, and if it was their turn it passes on */
export function leave(s, color) {
  if (s.over || isLeft(s, color) || !s.order.includes(color)) return;
  const wasTheirTurn = current(s) === color;
  s.left = [...(s.left || []), color];
  s.pieces[color] = [FINISH, FINISH, FINISH, FINISH];
  s.finished = s.finished.filter((c) => c !== color);
  if (s.away) delete s.away[color];
  checkEnd(s);
  if (!s.over && wasTheirTurn) endTurn(s);
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
  // in team games a finished player still rolls for the partner, so bonus rolls stay
  if (s.bonus > 0 && (s.partner || !s.finished.includes(color))) { s.bonus--; return 'roll'; }
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
  do { s.turn = (s.turn + 1) % s.order.length; } while (isLeft(s, s.order[s.turn]) ? !s.partner : (!s.partner && s.finished.includes(s.order[s.turn])));
}
