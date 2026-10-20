// Stands in for react in hook tests: runs a hook once, effects at once, and
// keeps the latest state where the test can read it.
const state = { values: [], cleanups: [] };
module.exports = {
  useState(initial) {
    const i = state.values.length;
    state.values.push(initial);
    return [initial, (next) => { state.values[i] = typeof next === 'function' ? next(state.values[i]) : next; }];
  },
  useRef(initial) { return { current: initial }; },
  useEffect(effect) { const cleanup = effect(); if (cleanup) state.cleanups.push(cleanup); },
  __state: state,
};
