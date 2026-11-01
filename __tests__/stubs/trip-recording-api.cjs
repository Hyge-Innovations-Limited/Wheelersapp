// Stand-in for '@/lib/api' in the trip recorder tests: the server says this driver records.
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
exports.ApiError = ApiError;
exports.getTripRecordingSetting = async () => {
  if (globalThis.__WHEELERS_TEST_RECORDING_SETTING__) return globalThis.__WHEELERS_TEST_RECORDING_SETTING__();
  return { recordTrips: true };
};
// The start call: who was announced, and what the server answers (a test may change it).
exports.startTripRecordingOnServer = async ({ rideId }) => {
  (globalThis.__WHEELERS_TEST_RECORDING_STARTS__ ??= []).push(rideId);
  if (globalThis.__WHEELERS_TEST_RECORDING_START__) return globalThis.__WHEELERS_TEST_RECORDING_START__(rideId);
  return { ok: true, nextSegmentIndex: 0 };
};
exports.getTripRecordingUploadUrl = async () => ({ url: 'https://example.invalid/put' });
exports.completeTripRecordingSegment = async () => ({ ok: true });
