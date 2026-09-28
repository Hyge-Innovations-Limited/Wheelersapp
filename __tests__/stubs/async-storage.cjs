// In-memory stand-in for @react-native-async-storage/async-storage.
// Like secure-store.cjs, the Map lives on globalThis so the test and the
// bundled code under test share one store.
const store = (globalThis.__WHEELERS_TEST_ASYNC_STORAGE__ ??= new Map());
const AsyncStorage = {
  __store: store,
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => { store.set(key, String(value)); },
  removeItem: async (key) => { store.delete(key); },
  getAllKeys: async () => [...store.keys()],
  multiRemove: async (keys) => { keys.forEach((key) => store.delete(key)); },
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
