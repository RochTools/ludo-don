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
const svgSafe = { red: [[6, 2], [1, 6]], green: [[12, 6], [8, 1]], yellow: [[8, 12], [13, 8]], blue: [[2, 8], [6, 13]] };
for (const c of COLORS) {
  const s = START_IDX[c];
  const cells = [TRACK[s], TRACK[(s + 8) % 52]].map((x) => x.join(','));
  for (const w of svgSafe[c].map((x) => x.join(','))) assert.ok(cells.includes(w), `${c}: ${w} should be safe`);
}
// last visible home-column cell, then home = centre
assert.deepEqual(homeCell('red', 56), [5, 7]);
assert.deepEqual(homeCell('green', 56), [7, 5]);
assert.deepEqual(homeCell('yellow', 56), [9, 7]);
assert.deepEqual(homeCell('blue', 56), [7, 9]);
assert.equal(FINISH, 57);
for (const c of COLORS) { const l = locate(c, 51, 0); assert.ok(l.x >= 0 && l.x <= 900); }

// --- saved sixes ---
{
  const s = E.newGame(['red', 'green']);
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
  assert.equal(s.pieces.red[0], 4);
  assert.deepEqual(s.bank, [6]);
  E.applyMove(s, 1, 6);
  assert.equal(E.settle(s), 'next');
  assert.equal(E.current(s), 'green');
  assert.deepEqual(s.bank, []);
}
{
  // three sixes in a row = whole turn lost, saved numbers disappear
  const s = E.newGame(['red', 'green']);
  E.applyRoll(s, 6); E.applyRoll(s, 6);
  assert.equal(E.applyRoll(s, 6).type, 'forfeit');
  assert.equal(E.current(s), 'green');
  assert.deepEqual(s.bank, []);
  // a non-six in between resets the count
  E.applyRoll(s, 6); assert.equal(E.applyRoll(s, 2).type, 'ready');
  assert.equal(s.sixes, 0);
}
{
  // a number nobody can use is dropped and the turn passes
  const s = E.newGame(['red', 'green']);
  E.applyRoll(s, 4);
  assert.equal(E.settle(s), 'next');
  assert.equal(E.current(s), 'green');
}
{
  // capture -> bonus roll
  const s = E.newGame(['red', 'green']);
  s.pieces.red[0] = 18; // track idx 18 -> +3 = idx 21 (not a safe cell)
  s.pieces.green[0] = 8; // green's p=8 is track idx 21
  assert.equal(E.trackIndex('green', s.pieces.green[0]), 21);
  E.applyRoll(s, 3);
  const r = E.applyMove(s, 0, 3);
  assert.equal(r.captured.length, 1);
  assert.equal(s.pieces.green[0], 0);
  assert.equal(E.settle(s), 'roll');
  assert.equal(E.current(s), 'red');
}

{
  // the CPU takes a capture when it has the number
  const s = E.newGame(['red', 'green']);
  s.pieces.red[0] = 18; s.pieces.red[1] = 30;
  s.pieces.green[0] = 8; // green p=8 sits on track idx 21, three cells ahead of red p=18
  s.bank = [3, 2];
  const m = chooseBest(s, () => 0.5);
  assert.deepEqual(m, { piece: 0, value: 3 });
}

// blue (bottom of the screen) always starts
assert.equal(E.current(E.newGame(COLORS)), 'blue');
assert.equal(E.current(E.newGame(['green', 'blue'])), 'blue');
assert.equal(E.current(E.newGame(['red', 'green'])), 'red');

// --- team (partner) games ---
{
  const s = E.newGame(COLORS, true);
  s.turn = 0; // (a real game starts with blue)
  assert.equal(s.partner.red, 'yellow');
  // partners never capture each other, and may share a cell
  s.pieces.red[0] = 18; s.pieces.yellow[0] = 18 - 13 + 52 - 52; // placeholder, set below
  const yp = ((E.trackIndex('red', 21) - START_IDX.yellow + 52) % 52) + 1; // yellow p on the same cell as red p=21
  s.pieces.yellow[0] = yp;
  s.pieces.green[0] = ((E.trackIndex('red', 21) - START_IDX.green + 52) % 52) + 1; // an opponent on that cell
  s.bank = [3];
  const r = E.applyMove(s, 0, 3);
  assert.deepEqual(r.captured.map((c) => c.color), ['green'], 'only the opponent is captured');
  assert.equal(s.pieces.yellow[0], yp, 'partner is not captured');
}
{
  // a finished player rolls for the partner; the team wins only when both are home
  const s = E.newGame(COLORS, true);
  s.turn = 0; // (a real game starts with blue)
  s.pieces.red = [57, 57, 57, 57];
  s.finished = ['red'];
  s.pieces.yellow = [57, 57, 57, 53];
  s.turn = 0; // red's turn but red is home
  assert.equal(E.mover(s), 'yellow');
  s.bank = [4];
  assert.deepEqual(E.allMoves(s), [{ piece: 3, value: 4 }]);
  const r = E.applyMove(s, 3, 4);
  assert.equal(r.color, 'yellow');
  assert.equal(s.over, true);
  assert.deepEqual(s.finished.slice(0, 2), ['red', 'yellow']);
  assert.equal(s.finished.length, 4);
}
{
  // one partner home while the other is still out: game goes on, and bonus rolls survive
  const s = E.newGame(COLORS, true);
  s.turn = 0; // (a real game starts with blue)
  s.pieces.red = [57, 57, 57, 56];
  s.pieces.yellow = [3, 0, 0, 0];
  s.bank = [1];
  E.applyMove(s, 3, 1);
  assert.equal(s.over, false);
  assert.deepEqual(s.finished, ['red']);
  assert.equal(E.mover(s), 'yellow');
  E.nextTurn(s);
  E.nextTurn(s); // green
  E.nextTurn(s); // blue
  E.nextTurn(s); // red again — finished players are NOT skipped in team games
  assert.equal(E.current(s), 'red');
}


// --- leaving the game ---
{
  // 3 players: the one whose turn it is quits -> turn passes, pieces removed, game goes on
  const s = E.newGame(['red', 'green', 'yellow']);
  s.bank = [4]; s.bonus = 1;
  E.leave(s, 'red');
  assert.ok(E.isLeft(s, 'red') && !s.over);
  assert.equal(E.current(s), 'green');
  assert.deepEqual(s.bank, []);
  // turns skip the player who left
  E.nextTurn(s); E.nextTurn(s);
  assert.equal(E.current(s), 'green');
  // second quit leaves one player: game over, the remaining player is first
  E.leave(s, 'yellow');
  assert.ok(s.over);
  assert.equal(s.finished[0], 'green');
}
{
  // quitting out of turn does not disturb the current turn
  const s = E.newGame(['red', 'green', 'yellow']);
  s.turn = 1; s.bank = [3, 2];
  E.leave(s, 'yellow');
  assert.equal(E.current(s), 'green');
  assert.deepEqual(s.bank, [3, 2]);
}
{
  // team game: a partner quits -> the other rolls for both; both of a team quit -> the other team wins
  const s = E.newGame(COLORS, true);
  s.turn = 0; // (a real game starts with blue)
  E.leave(s, 'yellow');
  assert.ok(!s.over);
  s.turn = s.order.indexOf('yellow');
  assert.equal(E.mover(s), 'red', 'the partner plays the numbers of the player who left');
  E.leave(s, 'red');
  assert.ok(s.over);
  assert.ok(['green', 'blue'].includes(s.finished[0]));
}

// --- random games ---
function lcg(seed) { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const setups = [['red', 'yellow'], ['red', 'green', 'yellow'], COLORS, ['green', 'blue']];
let games = 0, captures = 0, maxTurns = 0, forfeits = 0;
for (let g = 0; g < 2400; g++) {
  const rng = lcg(g + 1);
  const teamGame = g >= 2000; // the last 400 are 2 v 2 partner games
  const s = E.newGame(teamGame ? COLORS : setups[g % setups.length], teamGame);
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
      if (teamGame) for (const c of res.captured) assert.notEqual(c.color, E.PARTNER[res.color], 'partner captured');
      for (const c of s.order) for (const p of s.pieces[c]) assert.ok(p >= 0 && p <= FINISH);
      const seen = new Map();
      for (const c of s.order) for (const p of s.pieces[c]) {
        const idx = E.trackIndex(c, p);
        if (idx < 0 || SAFE_IDX.has(idx)) continue;
        if (seen.has(idx) && seen.get(idx) !== c && !(teamGame && E.PARTNER[c] === seen.get(idx))) assert.fail('two colours on one unsafe cell');
        seen.set(idx, c);
      }
      st = E.settle(s);
    }
  }
  assert.equal(s.finished.length, s.order.length);
  assert.equal(new Set(s.finished).size, s.order.length);
  if (teamGame) {
    const w = s.finished[0];
    assert.ok(s.pieces[w].every((p) => p === FINISH) && s.pieces[E.PARTNER[w]].every((p) => p === FINISH), 'winning team is fully home');
    assert.ok([w, E.PARTNER[w]].includes(s.finished[1]));
  }
  games++; maxTurns = Math.max(maxTurns, turns);
}

// --- games where players quit at random moments always finish ---
for (let g = 0; g < 300; g++) {
  const rng = lcg(9000 + g);
  const teams = g % 2 === 0;
  const s = E.newGame(teams ? COLORS : setups[1 + (g % 3)], teams);
  let steps = 0;
  while (!s.over) {
    assert.ok(++steps < 60000, 'game with quitters does not finish');
    if (rng() < 0.004) { const c = s.order[Math.floor(rng() * s.order.length)]; E.leave(s, c); if (s.over) break; }
    let r;
    do { r = E.applyRoll(s, E.rollDice(rng)); } while (r.type === 'again');
    if (r.type === 'forfeit') continue;
    let st = E.settle(s);
    while (st === 'moves') { const m = chooseBest(s, rng); E.applyMove(s, m.piece, m.value); st = E.settle(s); }
  }
}
console.log(`OK  ${games} games, ${captures} captures, ${forfeits} three-six forfeits, longest ${maxTurns} turns`);
