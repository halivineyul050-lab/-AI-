export function createGame(random = Math.random) {
  const values = Array.from({ length: 16 }, (_, i) => i % 8);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return { cards: values.map(value => ({ value, matched: false })), selected: [], moves: 0, matched: 0, locked: false, paused: false, won: false };
}

export function flipCard(state, index) {
  const card = state.cards[index];
  if (!card || state.paused || state.won || state.locked || card.matched || state.selected.includes(index)) return 'ignored';
  state.selected.push(index);
  if (state.selected.length === 1) return 'first';
  state.moves++;
  const first = state.cards[state.selected[0]];
  if (first.value !== card.value) { state.locked = true; return 'mismatch'; }
  first.matched = card.matched = true;
  state.matched++;
  state.selected = [];
  state.won = state.matched === 8;
  return 'match';
}

export function settleMismatch(state) {
  if (!state.locked) return;
  state.selected = [];
  state.locked = false;
}
