// بورڈ کی جیومیٹری اور مستقل اقدار
// Board is 900x900: 15x15 cells of 60px (matches assets/board/LUDO_BOARD.svg).

export const COLORS = ['red', 'green', 'yellow', 'blue']; // clockwise, starting top-left
export const BOARD = 900;
export const CELL = 60;
export const TRACK_LEN = 52;
export const FINISH = 57; // 0 = base, 1..51 = track, 52..56 = home column (5 visible cells), 57 = home

// ٹریک انڈیکس جہاں ہر رنگ کی گوٹی پہلی بار اترتی ہے
export const START_IDX = { red: 1, green: 14, yellow: 27, blue: 40 };
// محفوظ گھر: چاروں سٹارٹ + چاروں ستارے (سٹارٹ سے 8 قدم آگے)
export const SAFE_IDX = new Set([1, 9, 14, 22, 27, 35, 40, 48]);

// 52 گھروں کا ٹریک [col, row]، گھڑی کی سمت میں
export const TRACK = (() => {
  const t = [];
  for (let c = 0; c <= 5; c++) t.push([c, 6]); //   0–5
  for (let r = 5; r >= 0; r--) t.push([6, r]); //   6–11
  t.push([7, 0]); //                                12
  for (let r = 0; r <= 5; r++) t.push([8, r]); //  13–18
  for (let c = 9; c <= 14; c++) t.push([c, 6]); // 19–24
  t.push([14, 7]); //                               25
  for (let c = 14; c >= 9; c--) t.push([c, 8]); // 26–31
  for (let r = 9; r <= 14; r++) t.push([8, r]); // 32–37
  t.push([7, 14]); //                               38
  for (let r = 14; r >= 9; r--) t.push([6, r]); // 39–44
  for (let c = 5; c >= 0; c--) t.push([c, 8]); //  45–50
  t.push([0, 7]); //                                51
  return t;
})();

// Home-column cell (p = 52..56). Arms: red = left, green = top, yellow = right, blue = bottom.
export function homeCell(color, p) {
  const k = p - 51; // 1..5
  switch (color) {
    case 'red': return [k, 7];
    case 'green': return [7, k];
    case 'yellow': return [14 - k, 7];
    default: return [7, 14 - k]; // blue
  }
}

// The four base circles of each colour (SVG slot-COLOUR-1..4 centres)
export const BASE_SLOTS = {
  red: [[110, 110], [250, 110], [110, 250], [250, 250]],
  green: [[650, 110], [790, 110], [650, 250], [790, 250]],
  blue: [[110, 650], [250, 650], [110, 790], [250, 790]],
  yellow: [[650, 650], [790, 650], [650, 790], [790, 790]],
};

// Four spots inside each colour's triangle of the centre square (centre = 450,450)
const FIN_DIR = { red: [-1, 0], green: [0, -1], yellow: [1, 0], blue: [0, 1] };
function finishSlot(color, i) {
  const [ux, uy] = FIN_DIR[color];
  const vx = -uy, vy = ux;
  const lateral = (i % 2 === 0 ? -1 : 1) * 12;
  const dist = i < 2 ? 67 : 46;
  return { x: 450 + ux * dist + vx * lateral, y: 450 + uy * dist + vy * lateral };
}

// گوٹی (رنگ، پیش رفت p، نمبر i) کہاں دکھائی جائے
export function locate(color, p, i) {
  if (p === 0) {
    const [x, y] = BASE_SLOTS[color][i];
    return { x, y, key: `b${color}${i}`, s: 1 };
  }
  if (p === FINISH) {
    const f = finishSlot(color, i);
    return { x: f.x, y: f.y, key: `f${color}${i}`, s: 0.4 };
  }
  let c, r, key;
  if (p <= 51) {
    const idx = (START_IDX[color] + p - 1) % TRACK_LEN;
    [c, r] = TRACK[idx];
    key = `t${idx}`;
  } else {
    [c, r] = homeCell(color, p);
    key = `h${color}${p}`;
  }
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, key, s: 1 };
}
