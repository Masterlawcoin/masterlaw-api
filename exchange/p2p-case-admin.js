'use strict';

const crypto = require('crypto');

const ARC_CHAIN_ID = 5042002;
const CASE_STATES = Object.freeze([
  'OPENED',
  'EVIDENCE_REQUESTED',
  'UNDER_REVIEW',
  'MEDIATION_PROPOSED',
  'AGREEMENT_PENDING_SIGNATURES',
  'ARBITRATION_PENDING',
  'RESOLUTION_APPROVED',
  'ONCHAIN_EXECUTION_PENDING',
  'EXECUTED',
  'CLOSED',
  'BLOCKED'
]);
const TERMINAL_STATES = new Set(['CLOSED']);
const ALLOWED_TRANSITIONS = Object.freeze({
  OPENED: ['EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'BLOCKED'],
  EVIDENCE_REQUESTED: ['UNDER_REVIEW', 'BLOCKED'],
  UNDER_REVIEW: ['MEDIATION_PROPOSED', 'ARBITRATION_PENDING', 'BLOCKED'],
  MEDIATION_PROPOSED: ['AGREEMENT_PENDING_SIGNATURES', 'ARBITRATION_PENDING', 'UNDER_REVIEW', 'BLOCKED'],
  AGREEMENT_PENDING_SIGNATURES: ['RESOLUTION_APPROVED', 'ARBITRATION_PENDING', 'BLOCKED'],
  ARBITRATION_PENDING: ['RESOLUTION_APPROVED', 'BLOCKED'],
  RESOLUTION_APPROVED: ['ONCHAIN_EXECUTION_PENDING', 'BLOCKED'],
  ONCHAIN_EXECUTION_PENDING: ['EXECUTED', 'BLOCKED'],
  EXECUTED: ['CLOSED'],
  CLOSED: [],
  BLOCKED: ['UNDER_REVIEW']
});
const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const EVIDENCE_VISIBILITY = new Set(['CASE_TEAM', 'PARTIES', 'COMPLIANCE_ONLY']);
const RESOLUTION_MODES = new Set(['ARBITER_RELEASE_BUYER', 'ARBITER_REFUND_SELLER', 'MUTUAL_SPLIT_AGREEMENT']);

function assert(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}
function cleanText(value, code, max = 180) {
  const out = String(value ?? '').trim();
  assert(out && out.length <= max, code);
  return out;
}
function optionalText(value, max = 180) {
  if (value == null || String(value).trim() === '') return null;
  const out = String(value).trim();
  assert(out.length <= max, 'INVALID_TEXT_FIELD');
  return out;
}
function wallet(value, code) {
  const out = String(value ?? '').trim().toLowerCase();
  assert(/^0x[0-9a-f]{40}$/.test(out), code);
  return out;
}
function bytes32(value, code, { allowNull = false } = {}) {
  if ((value == null || value === '') && allowNull) return null;
  const raw = String(value ?? '').trim().toLowerCase().replace(/^0x/, '');
  assert(/^[0-9a-f]{64}$/.test(raw), code);
  return `0x${raw}`;
}
function positiveIntegerString(value, code) {
  const out = String(value ?? '').trim();
  assert(/^\d+$/.test(out) && BigInt(out) > 0n, code);
  return out;
}
function optionalPositiveIntegerString(value, code) {
  if (value == null || value === '') return null;
  return positiveIntegerString(value, code);
}
function normalizeSignals(value) {
  if (value == null) return [];
  assert(Array.isArray(value) && value.length <= 20, 'INVALID_RISK_SIGNALS');
  return value.map((item) => cleanText(item, 'INVALID_RISK_SIGNAL', 120));
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}
function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}
function sha256Hex(value) {
  return `0x${crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex')}`;
}
function normalizeRiskSnapshot(input = {}) {
  const level = String(input.level ?? 'LOW').trim().toUpperCase();
  assert(RISK_LEVELS.has(level), 'INVALID_RISK_LEVEL');
  return {
    level,
    source: optionalText(input.source, 80) || 'HUMAN_REVIEW',
    signals: normalizeSignals(input.signals),
    score: input.score == null ? null : Number(input.score),
    auto_action: false,
    human_review_required: true
  };
}
function validateTransition(from, to) {
  const a = String(from ?? '').trim().toUpperCase();
  const b = String(to ?? '').trim().toUpperCase();
  assert(CASE_STATES.includes(a), 'INVALID_CASE_STATE');
  assert(CASE_STATES.includes(b), 'INVALID_NEXT_CASE_STATE');
  assert(!TERMINAL_STATES.has(a), 'CASE_STATE_TERMINAL');
  assert(ALLOWED_TRANSITIONS[a].includes(b), 'INVALID_CASE_TRANSITION');
  return { from: a, to: b };
}
function prepareCase(input = {}) {
  const chainId = Number(input.chain_id ?? ARC_CHAIN_ID);
  assert(chainId === ARC_CHAIN_ID, 'ARC_TESTNET_ONLY');
  const buyerWallet = wallet(input.buyer_wallet, 'INVALID_BUYER_WALLET');
  const sellerWallet = wallet(input.seller_wallet, 'INVALID_SELLER_WALLET');
  assert(buyerWallet !== sellerWallet, 'BUYER_SELLER_WALLET_MATCH');

  const status = String(input.status ?? 'OPENED').trim().toUpperCase();
  assert(CASE_STATES.includes(status), 'INVALID_CASE_STATE');
  const packet = {
    schema: 'MASTERLAW_P2P_CASE_V1',
    case_number: cleanText(input.case_number, 'INVALID_CASE_NUMBER', 80),
    external_trade_id: cleanText(input.external_trade_id, 'INVALID_EXTERNAL_TRADE_ID', 120),
    buyer_user_id: optionalText(input.buyer_user_id, 80),
    seller_user_id: optionalText(input.seller_user_id, 80),
    buyer_wallet: buyerWallet,
    seller_wallet: sellerWallet,
    chain_id: ARC_CHAIN_ID,
    escrow_address: input.escrow_address ? wallet(input.escrow_address, 'INVALID_ESCROW_ADDRESS') : null,
    escrow_trade_id: optionalPositiveIntegerString(input.escrow_trade_id, 'INVALID_ESCROW_TRADE_ID'),
    order_ref: bytes32(input.order_ref, 'INVALID_ORDER_REF', { allowNull: true }),
    crypto_amount_base_units: positiveIntegerString(input.crypto_amount_base_units, 'INVALID_CRYPTO_AMOUNT'),
    fiat_currency: optionalText(input.fiat_currency, 12)?.toUpperCase() || null,
    status,
    risk_snapshot: normalizeRiskSnapshot(input.risk_snapshot || {})
  };
  const caseHash = sha256Hex(packet);
  return {
    packet,
    case_hash: caseHash,
    onchain_commitment: {
      chain_id: ARC_CHAIN_ID,
      escrow_address: packet.escrow_address,
      escrow_trade_id: packet.escrow_trade_id,
      case_hash: caseHash,
      pii_onchain: false
    },
    database_mutation: false,
    real_money_enabled: false
  };
}
function prepareEvidence(input = {}) {
  const visibility = String(input.visibility ?? 'CASE_TEAM').trim().toUpperCase();
  assert(EVIDENCE_VISIBILITY.has(visibility), 'INVALID_EVIDENCE_VISIBILITY');
  const sha256 = bytes32(input.sha256, 'INVALID_EVIDENCE_SHA256');
  const manifest = {
    schema: 'MASTERLAW_P2P_EVIDENCE_V1',
    case_hash: bytes32(input.case_hash, 'INVALID_CASE_HASH'),
    evidence_type: cleanText(input.evidence_type, 'INVALID_EVIDENCE_TYPE', 80),
    storage_ref: cleanText(input.storage_ref, 'INVALID_STORAGE_REF', 240),
    sha256,
    visibility,
    submitted_by: optionalText(input.submitted_by, 80),
    note: optionalText(input.note, 500)
  };
  return {
    manifest,
    evidence_manifest_hash: sha256Hex(manifest),
    content_hash: sha256,
    upload_performed: false,
    database_mutation: false
  };
}
function prepareResolution(input = {}) {
  const mode = String(input.mode ?? '').trim().toUpperCase();
  assert(RESOLUTION_MODES.has(mode), 'INVALID_RESOLUTION_MODE');
  const currentStatus = String(input.current_status ?? '').trim().toUpperCase();
  assert(['MEDIATION_PROPOSED', 'AGREEMENT_PENDING_SIGNATURES', 'ARBITRATION_PENDING'].includes(currentStatus), 'CASE_NOT_READY_FOR_RESOLUTION');

  const packet = {
    schema: 'MASTERLAW_P2P_RESOLUTION_V1',
    case_hash: bytes32(input.case_hash, 'INVALID_CASE_HASH'),
    current_status: currentStatus,
    mode,
    rationale_code: cleanText(input.rationale_code, 'INVALID_RATIONALE_CODE', 80),
    evidence_manifest_hashes: Array.isArray(input.evidence_manifest_hashes)
      ? input.evidence_manifest_hashes.map((v) => bytes32(v, 'INVALID_EVIDENCE_MANIFEST_HASH'))
      : [],
    split_buyer_amount_base_units: mode === 'MUTUAL_SPLIT_AGREEMENT'
      ? positiveIntegerString(input.split_buyer_amount_base_units, 'INVALID_SPLIT_BUYER_AMOUNT')
      : null,
    human_approved: input.human_approved === true,
    approved_by: optionalText(input.approved_by, 80)
  };
  assert(packet.human_approved, 'HUMAN_APPROVAL_REQUIRED');
  assert(packet.approved_by, 'APPROVER_REQUIRED');
  assert(packet.evidence_manifest_hashes.length <= 50, 'TOO_MANY_EVIDENCE_HASHES');

  const resolutionHash = sha256Hex(packet);
  return {
    packet,
    resolution_hash: resolutionHash,
    next_status: 'RESOLUTION_APPROVED',
    execution_path: mode === 'MUTUAL_SPLIT_AGREEMENT' ? 'PARTY_MUTUAL_SPLIT' : 'ARBITER_MULTISIG',
    browser_broadcast_allowed: false,
    database_mutation: false,
    real_money_enabled: false
  };
}

module.exports = {
  ARC_CHAIN_ID,
  CASE_STATES,
  ALLOWED_TRANSITIONS,
  RISK_LEVELS,
  EVIDENCE_VISIBILITY,
  RESOLUTION_MODES,
  canonicalJson,
  sha256Hex,
  normalizeRiskSnapshot,
  validateTransition,
  prepareCase,
  prepareEvidence,
  prepareResolution
};
