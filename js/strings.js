// All UI text in one place
export const NAME = {
  green: 'Green',
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
};

export const S = {
  human: 'Human',
  cpu: 'CPU',
  off: 'Off',
  name: (c) => NAME[c],
  needTwo: 'Choose at least two players',
  gameOver: 'Game Over',
  paused: 'Menu',
  playAgain: 'Play Again',
  menu: 'Main Menu',
  resume: 'Resume',
  newGame: 'New Game',
  ranks: ['1st place', '2nd place', '3rd place', '4th place'],
  medals: ['🥇', '🥈', '🥉', '4'],
  rulesTitle: 'Rules',
  rules: [
    'You need a <b>6</b> to bring a piece out of base.',
    'A 6 is <b>saved</b> and you roll again. When a number other than 6 comes, use all your saved numbers in any order: tap a piece, then tap the number you want to play.',
    'Three sixes in a row lose the whole turn.',
    'Capturing an opponent or reaching home gives a <b>bonus roll</b>.',
    'Coloured and star cells are <b>safe</b>. On other cells an opponent can capture you.',
    'You need the <b>exact</b> number to reach home.',
    'The first player to bring all four pieces home wins.',
    '<b>Gear next to your dice:</b> hand your seat to the computer for a while (and take it back with “I\'m back”), or leave the game for good: your pieces are removed.',
    '<b>Partner games (2 v 2):</b> partners never capture each other. The team wins when <b>both</b> partners have all four pieces home. A player who is already home keeps rolling, and the numbers are played on the partner\'s pieces.',
  ],

};
