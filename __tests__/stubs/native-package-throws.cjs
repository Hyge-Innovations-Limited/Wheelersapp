// Stand-in for a native package on a build without its native side: loading it throws,
// as expo-local-authentication and react-native-passkeys do. Counted, because on a phone
// such a load after start-up is a crash, not an error anyone can catch.
globalThis.__WHEELERS_TEST_NATIVE_LOADS__ = (globalThis.__WHEELERS_TEST_NATIVE_LOADS__ ?? 0) + 1;
throw new Error("Cannot find native module");
