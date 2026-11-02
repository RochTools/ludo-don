// بورڈ کی جیومیٹری اور مستقل اقدار
// بورڈ 750×750 ہے، 15×15 گھر، ہر گھر 50px۔

export const COLORS = ['green', 'red', 'blue', 'yellow']; // گھڑی کی سمت (اوپر بائیں سے شروع)
export const BOARD = 750;
export const CELL = 50;
export const TRACK_LEN = 52;
export const FINISH = 57; // 0 = base, 1..51 = track, 52..56 = home column (5 visible cells), 57 = home

// ٹریک انڈیکس جہاں ہر رنگ کی گوٹی پہلی بار اترتی ہے
export const START_IDX = { green: 1, red: 14, blue: 27, yellow: 40 };
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

// Home-column cell (p = 52..56)
export function homeCell(color, p) {
  const k = p - 51; // 1..5
  switch (color) {
    case 'green': return [k, 7];
    case 'red': return [7, k];
    case 'blue': return [14 - k, 7];
    default: return [7, 14 - k]; // yellow
  }
}

// اڈے کے چار خانے (SVG کے دائروں کے مرکز)
export const BASE_SLOTS = {
  green: [[75, 150], [150, 75], [225, 150], [150, 225]],
  red: [[525, 150], [600, 75], [675, 150], [600, 225]],
  blue: [[525, 600], [600, 525], [675, 600], [600, 675]],
  yellow: [[75, 600], [150, 525], [225, 600], [150, 675]],
};

// منزل (درمیانی ستارہ) میں ہر رنگ کے مثلث کے اندر چار جگہیں
const FIN_DIR = { green: [-1, 0], red: [0, -1], blue: [1, 0], yellow: [0, 1] };
function finishSlot(color, i) {
  const [ux, uy] = FIN_DIR[color];
  const vx = -uy, vy = ux;
  const lateral = (i % 2 === 0 ? -1 : 1) * 10;
  const dist = i < 2 ? 56 : 38;
  return { x: 375 + ux * dist + vx * lateral, y: 375 + uy * dist + vy * lateral };
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
