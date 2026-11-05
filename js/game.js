// Game controller: engine + UI + AI + audio + saved game
import * as E from './engine.js';
import { chooseBest } from './ai.js';
import * as audio from './audio.js';
import { COLORS } from './config.js';
import { S } from './strings.js';

const SAVE_KEY = 'ludo.save.v4';

export function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (d && d.state && d.seats && Array.isArray(d.state.order) && !d.state.over) return d;
  } catch { /* ignore corrupt data */ }
  return null;
}
const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } };

export function createGame(ui) {
  let state = null;
  let seats = null;
  let orig = null; // the seats as chosen in the menu (a player who hands over to the computer is only 'away')
  let run = 0;
  let paused = false;
  let waiters = [];

  const sleep = async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    while (paused) await new Promise((r) => waiters.push(r));
  };
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, seats, orig })); } catch { /* */ }
  };
  function setPaused(v) {
    paused = v;
    if (!v) { waiters.forEach((f) => f()); waiters = []; }
  }

  function begin() {
    run++;
    paused = false;
    ui.hideOverlay();
    ui.showScreen('game');
    ui.setupBoard(state.order);
    ui.layoutAll(state, true);
    ui.setTurn(state);
    ui.markSeats(state, seats);
    loop(run);
  }

  async function loop(id) {
    const alive = () => id === run;
    while (alive() && !state.over) {
      const color = E.current(state);
      const isHuman = () => seats[E.mover(state)] === 'human'; // the one who moves decides, even on a finished partner's dice
      save();
      ui.setTurn(state);

      // 1) Roll. Every 6 is saved and the player rolls again; the first other number
      //    ends the sequence. A third 6 in a row loses the turn.
      let forfeit = false;
      // (a game restarted in the middle of a turn, e.g. after someone quit, still has saved numbers to spend)
      if (!state.bank.length) for (;;) {
        if (isHuman()) await ui.waitDiceClick(color);
        else await sleep(700);
        if (!alive()) return;
        const value = E.rollDice();
        audio.play('dice');
        await ui.rollDice(color, value);
        if (!alive()) return;
        const r = E.applyRoll(state, value);
        if (r.type === 'forfeit') { forfeit = true; break; }
        if (r.type === 'ready') break;
        await sleep(450); // a six: roll again
        if (!alive()) return;
      }
      if (forfeit) {
        await sleep(1200); if (!alive()) return;
        ui.setTurn(state);
        continue;
      }

      // 2) Spend the saved numbers, in any order
      let st = E.settle(state);
      if (st !== 'moves') { // nothing playable
        await sleep(1000); if (!alive()) return;
        continue;
      }
      while (st === 'moves' && alive()) {
        const moves = E.allMoves(state);
        const mc = E.mover(state); // the colour being moved (the partner's once this player is home)
        const human = isHuman();
        let choice;
        const distinct = new Set(moves.map((m) => `${state.pieces[mc][m.piece]}:${m.value}`)).size;
        if (human && distinct > 1) {
          choice = await ui.pickMove(mc, moves, state.bank);
          if (!choice) choice = chooseBest(state); // the player handed over to the computer while choosing
        } else {
          await sleep(human ? 350 : 650);
          choice = human ? moves[0] : chooseBest(state);
        }
        if (!alive()) return;

        const res = E.applyMove(state, choice.piece, choice.value);
        await ui.animateMove(res.color, choice.piece, res.path, () => audio.play('move', 0.8));
        if (!alive()) return;
        if (res.captured.length) {
          audio.play('kill', 0.9);
          await Promise.all(res.captured.map((c) => ui.sendHome(c.color, c.piece)));
        }
        if (res.reachedHome) audio.play('win', 0.8);
        ui.layoutAll(state);
        if (res.playerDone) { await sleep(1200); if (!alive()) return; }
        st = E.settle(state);
        ui.setTurn(state);
        if (st !== 'moves') { await sleep(300); if (!alive()) return; }
      }
    }
    if (alive() && state.over) finish();
  }

  function finish() {
    clearSave();
    ui.setTurn(state);
    audio.play('over');
    ui.showOverlay({
      title: state.partner ? `${S.name(state.finished[0])} & ${S.name(state.partner[state.finished[0]])} win!` : S.gameOver,
      ranking: state.finished.filter((c) => !E.isLeft(state, c)),
      actions: [
        { label: S.playAgain, primary: true, onClick: () => start(seatConfig(), !!state.partner) },
        { label: S.menu, onClick: () => api.onExit && api.onExit() },
      ],
    });
  }

  const seatConfig = () => Object.fromEntries(COLORS.map((c) => [c, (orig || seats)[c] || null]));

  function start(cfg, withTeams = false) {
    const order = COLORS.filter((c) => cfg[c]);
    seats = {};
    order.forEach((c) => { seats[c] = cfg[c]; });
    orig = { ...seats };
    state = E.newGame(order, withTeams);
    begin();
  }

  function resume(saved) {
    state = saved.state;
    seats = saved.seats;
    orig = saved.orig || { ...saved.seats };
    begin();
  }

  /** Gear menu: resume / start a new game / read the rules (the rules stay closed until asked for) */
  function openPause() {
    setPaused(true);
    ui.showOverlay({
      title: S.paused,
      actions: [
        { label: S.resume, primary: true, onClick: () => { ui.hideOverlay(); setPaused(false); } },
        { label: 'Start New Game', onClick: () => { run++; setPaused(false); ui.hideOverlay(); api.onExit && api.onExit(); } },
        { label: 'Read Rules', onClick: showRules },
      ],
    });
  }
  function showRules() {
    ui.showOverlay({ title: S.rulesTitle, rules: true, actions: [{ label: 'Back', primary: true, onClick: openPause }] });
  }

  // ---------- Gear next to a player's dice: hand over to the computer for a while, or leave ----------
  const closeMenu = () => { ui.hideOverlay(); setPaused(false); };
  function playerMenu(color) {
    if (!state || state.over || E.isLeft(state, color)) return;
    setPaused(true);
    const away = !!(state.away && state.away[color]);
    const name = S.name(color);
    ui.showOverlay({
      title: name,
      text: away ? 'The computer is playing for you.' : 'Need a break? Let the computer play for you until you are back.',
      actions: [
        away
          ? { label: "I'm back", primary: true, onClick: () => { delete state.away[color]; seats[color] = 'human'; ui.markSeats(state, seats); closeMenu(); } }
          : { label: 'Let AI play', primary: true, onClick: () => {
              state.away = state.away || {};
              state.away[color] = true;
              seats[color] = 'cpu';
              ui.markSeats(state, seats);
              ui.releaseWaits(); // if it is this player's turn right now, the computer takes it from here
              closeMenu();
            } },
        { label: 'Leave game', onClick: () => confirmLeave(color) },
        { label: 'Close', onClick: closeMenu },
      ],
    });
  }
  function confirmLeave(color) {
    ui.showOverlay({
      title: 'Do you want to continue?',
      text: `Do you really want to leave the game? Your pieces will be removed. This cannot be undone.`,
      actions: [
        { label: 'Yes, leave', onClick: () => doLeave(color) },
        { label: 'No', primary: true, onClick: closeMenu },
      ],
    });
  }
  function doLeave(color) {
    run++; // stop the running turn loop; a new one starts from the new state
    ui.releaseWaits();
    ui.clearMovable();
    E.leave(state, color);
    seats[color] = 'cpu';
    setPaused(false);
    ui.hideOverlay();
    ui.layoutAll(state, true);
    ui.setTurn(state);
    ui.markSeats(state, seats);
    if (state.over) { finish(); return; }
    // nobody who is still playing is a person (everyone quit or handed over for good): back to the menu
    const person = state.order.some((c) => !E.isLeft(state, c) && (seats[c] === 'human' || (state.away && state.away[c])));
    if (!person) { clearSave(); api.onExit && api.onExit(); return; }
    loop(run);
  }

  const api = { start, resume, openPause, playerMenu, onExit: null };
  return api;
}
