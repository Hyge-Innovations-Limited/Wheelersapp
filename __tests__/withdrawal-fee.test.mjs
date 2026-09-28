import test from 'node:test';
import assert from 'node:assert/strict';
import { withdrawalBreakdown, withdrawalFeeOf, minWithdrawalOf } from '../lib/withdrawal-fee.ts';

test('the fee comes out of the amount', () => {
  assert.deepEqual(withdrawalBreakdown(5000, 45), { amountNgn: 5000, feeNgn: 45, receiveNgn: 4955 });
  assert.deepEqual(withdrawalBreakdown(0, 45), { amountNgn: 0, feeNgn: 0, receiveNgn: 0 });
  assert.deepEqual(withdrawalBreakdown(30, 45), { amountNgn: 30, feeNgn: 30, receiveNgn: 0 }, 'never below zero');
});

test('the fee and minimum come from the server; an older server charges nothing', () => {
  assert.equal(withdrawalFeeOf({ withdrawalFeeNgn: 45 }), 45);
  assert.equal(withdrawalFeeOf({}), 0);
  assert.equal(withdrawalFeeOf(null), 0);
  assert.equal(minWithdrawalOf({ minWithdrawalNgn: 95 }), 95);
  assert.equal(minWithdrawalOf(undefined), 0);
});
