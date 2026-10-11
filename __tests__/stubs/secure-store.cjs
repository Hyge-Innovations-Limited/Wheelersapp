// In-memory stand-in for expo-secure-store.
//
// The backing Map lives on globalThis on purpose: the test bundles this file
// into the module under test, so a module-local Map would give the test and
// the code under test two different stores.
const store = (globalThis.__WHEELERS_TEST_SECURE_STORE__ ??= new Map());

module.exports = {
  __store: store,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  getItemAsync: async (k) => (store.has(k) ? store.get(k) : null),
  setItemAsync: async (k, v) => { store.set(k, v); },
  deleteItemAsync: async (k) => { store.delete(k); },
};
