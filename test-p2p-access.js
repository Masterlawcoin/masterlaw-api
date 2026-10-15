'use strict';

const { accessDecision, normalizeStatus } = require('./exchange/p2p-access');

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const now = Date.parse('2026-10-15T21:00:00Z');

eq(normalizeStatus({}), 'NOT_CONFIGURED', 'missing KYC');
eq(accessDecision(null, now).eligible, false, 'missing identity blocked');
eq(accessDecision({ activo:false, kyc_status:'VERIFIED' }, now).reason, 'MASTERLAW_ACCOUNT_INACTIVE', 'inactive account');
eq(accessDecision({ activo:true }, now).reason, 'KYC_NOT_VERIFIED', 'missing KYC status fails closed');
eq(accessDecision({ activo:true, kyc_status:'KYC_PENDING' }, now).eligible, false, 'pending blocked');
eq(accessDecision({ activo:true, kyc_status:'ENHANCED_REVIEW' }, now).eligible, false, 'enhanced review blocked');
eq(accessDecision({ activo:true, kyc_status:'REJECTED' }, now).eligible, false, 'rejected blocked');
eq(accessDecision({ activo:true, kyc_status:'VERIFIED', p2p_blocked:true }, now).reason, 'P2P_BLOCKED_BY_MASTERLAW', 'manual P2P block');
eq(accessDecision({ activo:true, kyc_status:'VERIFIED', kyc_expires_at:'2026-10-14T00:00:00Z' }, now).reason, 'KYC_EXPIRED', 'expired KYC');
eq(accessDecision({ activo:true, kyc_status:'VERIFIED', kyc_expires_at:'2027-01-01T00:00:00Z', kyc_level:2 }, now).eligible, true, 'verified KYC allowed');
eq(accessDecision({ activo:true, kyc_status:'VERIFIED', kyc_expires_at:'2027-01-01T00:00:00Z', kyc_level:2 }, now).level, 2, 'KYC level preserved');

console.log('MASTERLAW P2P KYC ACCESS POLICY PASS');
