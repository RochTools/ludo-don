// Computer player — "cunning" version.
//
// For its turn the CPU looks at EVERY way of spending all its saved numbers
// (piece + number + order, depth-first), judges the resulting board, and plays the
// first move of the best line. The board is judged by:
//   + progress (pieces further along, out of base, in the safe home column, finished)
//   + opponent progress destroyed (captures, weighted by how far the victim had got)
//   + threats: our pieces sitting 1-6 cells behind an opponent on an unsafe cell
//   + bonus rolls earned (capture / reaching home)
//   - risk: chance an opponent can hit each of our pieces on an unsafe cell next turn
//   + extra attention to whoever is closest to winning
import { FINISH, SAFE_IDX, START_IDX, TRACK_LEN } from './config.js';
import { allMoves, applyMove, current, trackIndex } from './engine.js';

// Approximate chance an opponent piece can land exactly d cells ahead of itself next turn
// (a single roll hits each of 1..6 with 1/6; a 6 followed by another number reaches 7..11).
const HIT = [0, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.045, 0.045, 0.045, 0.045, 0.045, 0.02];
// Chance an opponent in base rolls a 6 and then x, landing x cells after their start
const FROM_BASE = 1 / 36;

function clone(s) {
  const pieces = {};
  for (const c of s.order) pieces[c] = [...s.pieces[c]];
  return { ...s, bank: [...s.bank], finished: [...s.finished], pieces };
}

/** Chance that one of the opponents hits `color` standing on track cell idx next turn */
function risk(s, color, idx) {
  if (SAFE_IDX.has(idx)) return 0;
  let safe = 1;
  for (const oc of s.order) {
    if (oc === color) continue;
    let inBase = 0;
    for (const p of s.pieces[oc]) {
      if (p === 0) { inBase++; continue; }
      const j = trackIndex(oc, p);
      if (j < 0) continue;
      const d = (idx - j + TRACK_LEN) % TRACK_LEN;
      if (d >= 1 && d <= 12 && p + d <= 51) safe *= 1 - HIT[d];
    }
    if (inBase) {
      const d = (idx - START_IDX[oc] + TRACK_LEN) % TRACK_LEN;
      if (d >= 1 && d <= 5) safe *= 1 - FROM_BASE;
    }
  }
  return 1 - safe;
}

// How valuable a piece is (what we lose if it is captured / gain if we capture it)
const worth = (p) => (p === 0 ? 0 : p + 14);

/** How good is this board for `color`? */
function evaluate(s, color, rng) {
  let v = 0;
  for (const c of s.order) {
    const mine = c === color;
    // opponents who are close to winning matter more
    const done = s.pieces[c].filter((p) => p === FINISH).length;
    const w = mine ? 1 : -(0.55 + 0.2 * done);
    for (const p of s.pieces[c]) {
      let f = 0;
      if (p === FINISH) f = FINISH + 30;
      else if (p > 51) f = p + 14; // home column: safe
      else if (p > 0) {
        f = p + 8; // out of base
        if (SAFE_IDX.has(trackIndex(c, p))) f += 5;
      }
      v += w * f;
    }
  }

  // danger to our pieces, and pressure on theirs
  for (const p of s.pieces[color]) {
    const idx = trackIndex(color, p);
    if (idx < 0) continue;
    v -= risk(s, color, idx) * worth(p) * 0.7;
    for (const oc of s.order) {
      if (oc === color) continue;
      for (const q of s.pieces[oc]) {
        const j = trackIndex(oc, q);
        if (j < 0 || SAFE_IDX.has(j)) continue;
        const d = (j - idx + TRACK_LEN) % TRACK_LEN;
        if (d >= 1 && d <= 6) v += 0.2 * 0.5 * worth(q); // we threaten them
      }
    }
  }
  v += s.bonus * 12; // earned bonus rolls
  if (s.over) v += s.finished[0] === color ? 5000 : -5000;
  return v + rng() * 1.5;
}

/** Best achievable evaluation from this position by spending the saved numbers */
function search(s, color, rng) {
  const moves = allMoves(s);
  if (!moves.length) return evaluate(s, color, rng);
  let best = -Infinity;
  for (const m of moves) {
    const n = clone(s);
    applyMove(n, m.piece, m.value);
    const v = n.over ? evaluate(n, color, rng) : search(n, color, rng);
    if (v > best) best = v;
  }
  return best;
}

/** Best { piece, value } to play now */
export function chooseBest(s, rng = Math.random) {
  const color = current(s);
  const moves = allMoves(s);
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    const n = clone(s);
    applyMove(n, m.piece, m.value);
    const v = n.over ? evaluate(n, color, rng) : search(n, color, rng);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
