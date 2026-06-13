const test = require('node:test');
const assert = require('node:assert/strict');
const stateCore = require('../shared-state.js');

test('syncDefaultPlayers injects fixed players with stable ids', () => {
  const state = stateCore.defaultState();

  const changed = stateCore.syncDefaultPlayers(state);

  assert.equal(changed, true);
  assert.equal(state.players.length, stateCore.DEFAULT_PLAYER_NAMES.length);
  assert.deepEqual(
    state.players.map(player => player.name),
    stateCore.DEFAULT_PLAYER_NAMES
  );
  assert.ok(state.players.every(player => player.id.startsWith('player-')));
});

test('extractSharedState excludes UI-only fields', () => {
  const state = stateCore.defaultState();
  state.currentDate = '2026-06-13';
  state.selectedLoserIds = ['player-1'];
  state.stake = 15000;
  state.players = [{ id: 'player-1', name: 'Dũng', active: true, source: 'built-in' }];

  const shared = stateCore.extractSharedState(state);

  assert.equal(shared.currentDate, undefined);
  assert.equal(shared.selectedLoserIds, undefined);
  assert.equal(shared.stake, undefined);
  assert.equal(shared.players.length, 1);
});

test('buildState merges shared state and ui state with normalization', () => {
  const state = stateCore.buildState(
    {
      players: [{ id: 'player-a', name: '  Đức  ' }],
      sets: [{ id: 'set-1', date: '2026-06-12', loserIds: ['player-a'], stake: '20000' }],
      payments: [{ id: 'payment-1', playerId: 'player-a', amount: '5000' }]
    },
    {
      currentDate: '2026-06-13',
      selectedLoserIds: ['player-a'],
      stake: '10000'
    }
  );

  assert.equal(state.players[0].name, 'Đức');
  assert.equal(state.sets[0].stake, 20000);
  assert.equal(state.payments[0].amount, 5000);
  assert.equal(state.currentDate, '2026-06-13');
  assert.equal(state.stake, 10000);
  assert.deepEqual(state.selectedLoserIds, ['player-a']);
});
