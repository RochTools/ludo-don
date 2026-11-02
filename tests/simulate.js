// npm test — checks geometry, the saved-sixes rules, then plays thousands of random games
import assert from 'node:assert/strict';
import { COLORS, FINISH, TRACK, START_IDX, SAFE_IDX, homeCell, locate } from '../js/config.js';
import * as E from '../js/engine.js';
import { chooseBest } from '../js/ai.js';

// --- geometry ---
assert.equal(TRACK.length, 52);
assert.equal(new Set(TRACK.map((c) => c.join(','))).size, 52, 'track cells are unique');
for (let i = 0; i < 52; i++) {
  const [a, b] = TRACK[i], [c, d] = TRACK[(i + 1) % 52];
  assert.ok(Math.abs(a - c) + Math.abs(b - d) <= 2, `track ${i}->${i + 1} is connected`);
}
// coloured safe cells in the SVG: [col,row]
const svgSafe = { green: [[6, 2], [1, 6]], red: [[8, 1], [12, 6]], blue: [[13, 8], [8, 12]], yellow: [[6, 13], [2, 8]] };
for (const c of COLORS) {
  const s = START_IDX[c];
  const cells = [TRACK[s], TRACK[(s + 8) % 52]].map((x) => x.join(','));
  for (const w of svgSafe[c].map((x) => x.join(','))) assert.ok(cells.includes(w), `${c}: ${w} should be safe`);
}
// last visible home-column cell, then home = centre
assert.deepEqual(homeCell('green', 56), [5, 7]);
assert.deepEqual(homeCell('red', 56), [7, 5]);
assert.deepEqual(homeCell('blue', 56), [9, 7]);
assert.deepEqual(homeCell('yellow', 56), [7, 9]);
assert.equal(FINISH, 57);
for (const c of COLORS) { const l = locate(c, 51, 0); assert.ok(l.x >= 0 && l.x <= 750); }

// --- saved sixes ---
{
  const s = E.newGame(['green', 'red']);
  assert.equal(E.applyRoll(s, 6).type, 'again');
  assert.equal(E.applyRoll(s, 6).type, 'again');
  assert.deepEqual(s.bank, [6, 6]);
  assert.equal(E.applyRoll(s, 3).type, 'ready');
  assert.deepEqual(s.bank, [6, 6, 3]);
  // all pieces in base: only a 6 can move
  assert.deepEqual(E.allMoves(s).map((m) => m.value), [6, 6, 6, 6].slice(0, E.allMoves(s).length));
  // spend: 6 (bring out), 6 (bring out second), 3 (move first) — any order
  E.applyMove(s, 0, 6);
  assert.deepEqual(s.bank, [6, 3]);
  assert.equal(E.settle(s), 'moves');
  E.applyMove(s, 0, 3);
  assert.equal(s.pieces.green[0], 4);
  assert.deepEqual(s.bank, [6]);
  E.applyMove(s, 1, 6);
  assert.equal(E.settle(s), 'next');
  assert.equal(E.current(s), 'red');
  assert.deepEqual(s.bank, []);
}
{
  // three sixes in a row = whole turn lost, saved numbers disappear
  const s = E.newGame(['green', 'red']);
  E.applyRoll(s, 6); E.applyRoll(s, 6);
  assert.equal(E.applyRoll(s, 6).type, 'forfeit');
  assert.equal(E.current(s), 'red');
  assert.deepEqual(s.bank, []);
  // a non-six in between resets the count
  E.applyRoll(s, 6); assert.equal(E.applyRoll(s, 2).type, 'ready');
  assert.equal(s.sixes, 0);
}
{
  // a number nobody can use is dropped and the turn passes
  const s = E.newGame(['green', 'red']);
  E.applyRoll(s, 4);
  assert.equal(E.settle(s), 'next');
  assert.equal(E.current(s), 'red');
}
{
  // capture -> bonus roll
  const s = E.newGame(['green', 'red']);
  s.pieces.green[0] = 18; // track idx 18 -> +3 = idx 21 (not a safe cell)
  s.pieces.red[0] = 8; // red's p=8 is track idx 21
  assert.equal(E.trackIndex('red', s.pieces.red[0]), 21);
  E.applyRoll(s, 3);
  const r = E.applyMove(s, 0, 3);
  assert.equal(r.captured.length, 1);
  assert.equal(s.pieces.red[0], 0);
  assert.equal(E.settle(s), 'roll');
  assert.equal(E.current(s), 'green');
}

// --- random games ---
function lcg(seed) { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const setups = [['green', 'blue'], ['green', 'red', 'blue'], COLORS, ['red', 'yellow']];
let games = 0, captures = 0, maxTurns = 0, forfeits = 0;
for (let g = 0; g < 2000; g++) {
  const rng = lcg(g + 1);
  const s = E.newGame(setups[g % setups.length]);
  let turns = 0;
  while (!s.over) {
    assert.ok(++turns < 40000, 'game does not finish');
    // roll sequence
    let r;
    do {
      r = E.applyRoll(s, E.rollDice(rng));
      assert.ok(s.bank.filter((v) => v === 6).length <= 2);
    } while (r.type === 'again');
    if (r.type === 'forfeit') { forfeits++; continue; }
    // spend the saved numbers
    let st = E.settle(s);
    while (st === 'moves') {
      const m = chooseBest(s, rng);
      assert.ok(E.allMoves(s).some((x) => x.piece === m.piece && x.value === m.value));
      const res = E.applyMove(s, m.piece, m.value);
      captures += res.captured.length;
      for (const c of s.order) for (const p of s.pieces[c]) assert.ok(p >= 0 && p <= FINISH);
      const seen = new Map();
      for (const c of s.order) for (const p of s.pieces[c]) {
        const idx = E.trackIndex(c, p);
        if (idx < 0 || SAFE_IDX.has(idx)) continue;
        if (seen.has(idx) && seen.get(idx) !== c) assert.fail('two colours on one unsafe cell');
        seen.set(idx, c);
      }
      st = E.settle(s);
    }
  }
  assert.equal(s.finished.length, s.order.length);
  assert.equal(new Set(s.finished).size, s.order.length);
  games++; maxTurns = Math.max(maxTurns, turns);
}
console.log(`OK  ${games} games, ${captures} captures, ${forfeits} three-six forfeits, longest ${maxTurns} turns`);
