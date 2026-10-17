// Stand-in for `expo`: which native modules this pretend build has (none, unless a test says so).
globalThis.__WHEELERS_TEST_EXPO_MODULES__ ??= {};
exports.requireOptionalNativeModule = (name) => globalThis.__WHEELERS_TEST_EXPO_MODULES__[name] ?? null;
