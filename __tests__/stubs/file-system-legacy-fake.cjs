// Stand-in for expo-file-system/legacy with no signal: files are there, uploads fail, so the queue keeps them.
exports.getInfoAsync = async () => ({ exists: true, size: 1000 });
exports.deleteAsync = async () => {};
exports.uploadAsync = async () => ({ status: 0 });
exports.FileSystemUploadType = { BINARY_CONTENT: 0 };
