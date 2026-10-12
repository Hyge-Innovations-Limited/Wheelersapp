// Stands in for lib/api in referral-entry tests: the test decides what the server says.
const calls = [];
let refuse = null;
module.exports = {
  calls,
  refuseWith(reason) { refuse = reason; },
  async applyReferralCode(input) {
    calls.push(input);
    if (refuse) throw new Error(refuse);
    return { ok: true };
  },
};
