// Stand-in for '@/lib/api' in the trip recorder tests: the server says this driver records.
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
exports.ApiError = ApiError;
exports.getTripRecordingSetting = async () => ({ recordTrips: true });
exports.getTripRecordingUploadUrl = async () => ({ url: 'https://example.invalid/put' });
exports.completeTripRecordingSegment = async () => ({ ok: true });
