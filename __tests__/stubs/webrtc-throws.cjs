// Stand-in for react-native-webrtc on a build without its native side: loading it throws,
// as the real one does on iOS. The test counts how often anything tried.
globalThis.__WHEELERS_TEST_WEBRTC_LOADS__ = (globalThis.__WHEELERS_TEST_WEBRTC_LOADS__ ?? 0) + 1;
throw new Error('new NativeEventEmitter() requires a non-null argument.');
