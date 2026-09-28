// Stand-in for react-native: only NativeModules, which the test fills in.
const NativeModules = (globalThis.__WHEELERS_TEST_NATIVE_MODULES__ ??= {});
module.exports = { NativeModules };
