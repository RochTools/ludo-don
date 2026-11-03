// npm run check-board — verifies assets/board/LUDO_BOARD.svg matches the game logic exactly:
//  * every track cell, start cell, safe cell and home-lane cell is where the engine expects it
//  * every piece position the game can show lands on the centre of the right SVG cell / base circle
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_SLOTS, CELL, COLORS, FINISH, SAFE_IDX, START_IDX, TRACK, homeCell, locate } from '../js/config.js';

const svg = readFileSync(new URL('../assets/board/LUDO_BOARD.svg', import.meta.url), 'utf8');

// --- read the SVG ---
const cells = new Map(); // "col,row" -> { kind, colour, safe }
for (const m of svg.matchAll(/<rect class="cell([^"]*)"[^>]*?>/g)) {
  const tag = m[0];
  const get = (k) => (tag.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
  cells.set(`${get('data-col')},${get('data-row')}`, {
    kind: get('data-kind'), colour: get('data-colour') || null, safe: m[1].includes('safe'),
    x: +get('x'), y: +get('y'), w: +get('width'),
  });
}
const slots = {};
for (const m of svg.matchAll(/<circle class="slot" id="slot-(\w+)-(\d)"[^>]*cx="([\d.]+)" cy="([\d.]+)"/g)) {
  (slots[m[1]] ||= []).push([+m[3], +m[4]]);
}

// --- cells ---
assert.equal(cells.size, 72, 'expected 52 track + 20 lane cells');
for (const c of cells.values()) assert.equal(c.w, CELL, 'cell size must match CELL');

const trackKeys = new Set(TRACK.map((t) => t.join(',')));
const laneKeys = new Set();
for (const c of COLORS) for (let p = 52; p <= 56; p++) laneKeys.add(homeCell(c, p).join(','));
assert.equal(trackKeys.size + laneKeys.size, 72);
for (const k of cells.keys()) assert.ok(trackKeys.has(k) || laneKeys.has(k), `SVG cell ${k} is not part of the engine's board`);

const startCell = {}; // colour -> "col,row"
const safeCell = {};
TRACK.forEach((t, idx) => {
  const key = t.join(',');
  const cell = cells.get(key);
  assert.ok(cell, `track cell ${idx} (${key}) missing in SVG`);
  const startOf = COLORS.find((c) => START_IDX[c] === idx);
  const starOf = COLORS.find((c) => (START_IDX[c] + 8) % 52 === idx);
  if (startOf) {
    assert.equal(cell.kind, 'start', `${key} should be the ${startOf} start`);
    assert.equal(cell.colour, startOf, `${key} start has the wrong colour`);
    startCell[startOf] = key;
  } else if (starOf) {
    assert.equal(cell.kind, 'path', `${key}`);
    assert.ok(cell.safe, `${key} should be a safe cell`);
    assert.equal(cell.colour, starOf, `${key} safe cell has the wrong colour`);
    safeCell[starOf] = key;
  } else {
    assert.equal(cell.kind, 'path', `${key} should be a plain path cell`);
    assert.ok(!cell.safe && !cell.colour, `${key} is coloured/safe in the SVG but NOT in the game`);
  }
  assert.equal(SAFE_IDX.has(idx), Boolean(startOf || starOf), `SAFE_IDX disagrees at track ${idx}`);
});
for (const c of COLORS) for (let p = 52; p <= 56; p++) {
  const cell = cells.get(homeCell(c, p).join(','));
  assert.ok(cell && cell.kind === 'lane' && cell.colour === c, `${c} lane cell for p=${p} is wrong`);
}

// --- base circles ---
for (const c of COLORS) {
  assert.equal(slots[c]?.length, 4, `${c} needs 4 base circles`);
  for (const [x, y] of BASE_SLOTS[c]) {
    assert.ok(slots[c].some(([sx, sy]) => sx === x && sy === y), `${c} base slot ${x},${y} not in SVG`);
  }
}

// --- every position the game can show ---
const centre = (key) => { const c = cells.get(key); return [c.x + CELL / 2, c.y + CELL / 2]; };
let checked = 0;
for (const c of COLORS) {
  for (let p = 1; p <= 56; p++) {
    const l = locate(c, p, 0);
    const key = p <= 51 ? TRACK[(START_IDX[c] + p - 1) % 52].join(',') : homeCell(c, p).join(',');
    const [cx, cy] = centre(key);
    assert.deepEqual([l.x, l.y], [cx, cy], `${c} p=${p} is not on the centre of cell ${key}`);
    checked++;
  }
  for (let i = 0; i < 4; i++) {
    const l = locate(c, 0, i);
    assert.deepEqual([l.x, l.y], BASE_SLOTS[c][i]);
    const f = locate(c, FINISH, i); // finished pieces sit inside the centre square (360..540)
    assert.ok(f.x > 360 && f.x < 540 && f.y > 360 && f.y < 540, `${c} finish slot ${i} outside the centre`);
  }
}
console.log(`OK  board matches the game: 72 cells, 8 safe cells, 16 base circles, ${checked} piece positions`);
