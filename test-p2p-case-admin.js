'use strict';

const assert = require('assert');
const {
  ARC_CHAIN_ID,
  validateTransition,
  prepareCase,
  prepareEvidence,
  prepareResolution
} = require('./exchange/p2p-case-admin');

const BUYER='0x1111111111111111111111111111111111111111';
const SELLER='0x2222222222222222222222222222222222222222';
const ESCROW='0x3333333333333333333333333333333333333333';
const ORDER='0x'+'44'.repeat(32);
const CONTENT='0x'+'55'.repeat(32);

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error && error.message === code);
}

const prepared = prepareCase({
  case_number:'P2P-2026-0001',
  external_trade_id:'trade-uuid-1',
  buyer_user_id:'user-buyer',
  seller_user_id:'user-seller',
  buyer_wallet:BUYER,
  seller_wallet:SELLER,
  chain_id:ARC_CHAIN_ID,
  escrow_address:ESCROW,
  escrow_trade_id:'7',
  order_ref:ORDER,
  crypto_amount_base_units:'25000000',
  fiat_currency:'CLP',
  risk_snapshot:{ level:'HIGH', source:'P2P_AGENT_SNAPSHOT', signals:['payment-name-mismatch'], score:72 }
});
assert.equal(prepared.packet.chain_id, 5042002);
assert.equal(prepared.packet.status, 'OPENED');
assert.equal(prepared.packet.risk_snapshot.score, 72);
assert.equal(prepared.packet.risk_snapshot.auto_action, false);
assert.equal(prepared.packet.risk_snapshot.human_review_required, true);
assert.match(prepared.case_hash, /^0x[0-9a-f]{64}$/);
assert.equal(prepared.onchain_commitment.pii_onchain, false);
assert.equal(prepared.database_mutation, false);
assert.equal(prepared.real_money_enabled, false);
assert.deepEqual(prepareCase({
  case_number:'P2P-2026-0001', external_trade_id:'trade-uuid-1', buyer_user_id:'user-buyer', seller_user_id:'user-seller',
  buyer_wallet:BUYER, seller_wallet:SELLER, chain_id:5042002, escrow_address:ESCROW, escrow_trade_id:'7', order_ref:ORDER,
  crypto_amount_base_units:'25000000', fiat_currency:'CLP', risk_snapshot:{ level:'HIGH', source:'P2P_AGENT_SNAPSHOT', signals:['payment-name-mismatch'], score:72 }
}).case_hash, prepared.case_hash);

assert.deepEqual(validateTransition('OPENED','UNDER_REVIEW'), {from:'OPENED',to:'UNDER_REVIEW'});
assert.deepEqual(validateTransition('BLOCKED','UNDER_REVIEW'), {from:'BLOCKED',to:'UNDER_REVIEW'});
throwsCode(() => validateTransition('OPENED','EXECUTED'), 'INVALID_CASE_TRANSITION');
throwsCode(() => validateTransition('CLOSED','UNDER_REVIEW'), 'CASE_STATE_TERMINAL');
throwsCode(() => prepareCase({case_number:'x',external_trade_id:'y',buyer_wallet:BUYER,seller_wallet:BUYER,crypto_amount_base_units:'1'}), 'BUYER_SELLER_WALLET_MATCH');
throwsCode(() => prepareCase({case_number:'x',external_trade_id:'y',buyer_wallet:BUYER,seller_wallet:SELLER,chain_id:84532,crypto_amount_base_units:'1'}), 'ARC_TESTNET_ONLY');
throwsCode(() => prepareCase({case_number:'x',external_trade_id:'y',buyer_wallet:BUYER,seller_wallet:SELLER,crypto_amount_base_units:'1',risk_snapshot:{level:'HIGH',score:101}}), 'INVALID_RISK_SCORE');
throwsCode(() => prepareCase({case_number:'x',external_trade_id:'y',buyer_wallet:BUYER,seller_wallet:SELLER,crypto_amount_base_units:'1',risk_snapshot:{level:'HIGH',score:'not-a-number'}}), 'INVALID_RISK_SCORE');

const evidence = prepareEvidence({
  case_hash:prepared.case_hash,
  evidence_type:'BANK_TRANSFER_RECEIPT',
  storage_ref:'private://masterlaw/p2p/P2P-2026-0001/receipt-01',
  sha256:CONTENT,
  visibility:'CASE_TEAM',
  submitted_by:'user-buyer'
});
assert.match(evidence.evidence_manifest_hash, /^0x[0-9a-f]{64}$/);
assert.equal(evidence.content_hash, CONTENT);
assert.equal(evidence.upload_performed, false);
assert.equal(evidence.database_mutation, false);
assert.equal(evidence.real_money_enabled, false);

const resolution = prepareResolution({
  case_hash:prepared.case_hash,
  current_status:'ARBITRATION_PENDING',
  mode:'ARBITER_RELEASE_BUYER',
  rationale_code:'PAYMENT_CONFIRMED',
  evidence_manifest_hashes:[evidence.evidence_manifest_hash],
  human_approved:true,
  approved_by:'masterlaw-admin-1'
});
assert.equal(resolution.next_status,'RESOLUTION_APPROVED');
assert.equal(resolution.execution_path,'ARBITER_MULTISIG');
assert.equal(resolution.browser_broadcast_allowed,false);
assert.equal(resolution.real_money_enabled,false);
assert.match(resolution.resolution_hash,/^0x[0-9a-f]{64}$/);

const split = prepareResolution({
  case_hash:prepared.case_hash,
  current_status:'AGREEMENT_PENDING_SIGNATURES',
  mode:'MUTUAL_SPLIT_AGREEMENT',
  rationale_code:'MUTUAL_SETTLEMENT',
  evidence_manifest_hashes:[],
  split_buyer_amount_base_units:'10000000',
  human_approved:true,
  approved_by:'masterlaw-admin-1'
});
assert.equal(split.execution_path,'PARTY_MUTUAL_SPLIT');
throwsCode(() => prepareResolution({
  case_hash:prepared.case_hash,current_status:'ARBITRATION_PENDING',mode:'ARBITER_REFUND_SELLER',rationale_code:'NO_PAYMENT',human_approved:false,approved_by:'masterlaw-admin-1'
}), 'HUMAN_APPROVAL_REQUIRED');

console.log('P2P admin case packet tests passed');
