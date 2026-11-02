// Computer player: scores every possible (piece, number) and plays the best one
import { FINISH, SAFE_IDX, TRACK_LEN } from './config.js';
import { allMoves, current, trackIndex } from './engine.js';

// Can an opponent capture a piece standing on this cell with their next roll?
function threatened(s, color, idx) {
  if (SAFE_IDX.has(idx)) return false;
  for (const oc of s.order) {
    if (oc === color) continue;
    for (const p of s.pieces[oc]) {
      const j = trackIndex(oc, p);
      if (j < 0) continue;
      const d = (idx - j + TRACK_LEN) % TRACK_LEN;
      if (d >= 1 && d <= 6 && p + d <= 51) return true;
    }
  }
  return false;
}

function score(s, i, value, rng) {
  const color = current(s);
  const p = s.pieces[color][i];
  const to = p === 0 ? 1 : p + value;
  let v = 0;

  if (to === FINISH) v += 120;
  const idx = trackIndex(color, to);
  if (idx >= 0) {
    if (SAFE_IDX.has(idx)) v += 18;
    else {
      for (const oc of s.order) {
        if (oc === color) continue;
        for (const q of s.pieces[oc]) if (trackIndex(oc, q) === idx) v += 90 + q;
      }
      if (threatened(s, color, idx)) v -= 35;
    }
  }
  if (to > 51 && to < FINISH) v += 25; // home column is safe
  if (p === 0) v += 45; // bring a piece out
  if (p > 0 && p <= 51 && threatened(s, color, trackIndex(color, p))) v += 30; // escape danger
  v += value * 1.5 + to * 0.3 + rng() * 4;
  return v;
}

/** Best { piece, value } among the saved numbers */
export function chooseBest(s, rng = Math.random) {
  const moves = allMoves(s);
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    const v = score(s, m.piece, m.value, rng);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
