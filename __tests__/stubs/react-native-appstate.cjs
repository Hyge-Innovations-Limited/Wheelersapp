// Stands in for react-native's AppState: the test says when the app goes away and comes back.
const listeners = new Set();
module.exports = {
  AppState: {
    addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
  },
  __emit(state) { for (const listener of listeners) listener(state); },
  __count() { return listeners.size; },
};
