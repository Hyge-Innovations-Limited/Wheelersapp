// A stand-in for lib/api's KYC call: the test sets what the "server" says.
// Shared through globalThis, like the secure-store stub: the code under test
// is bundled with its own copy of this file.
const state = (globalThis.__WHEELERS_TEST_KYC__ ??= { answer: null, calls: 0 });
module.exports = {
  __kyc: state,
  getDriverKycStatus: async () => {
    state.calls += 1;
    if (state.answer instanceof Error) throw state.answer;
    return { kycStatus: state.answer };
  },
};
