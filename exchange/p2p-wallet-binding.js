'use strict';

const jwt = require('jsonwebtoken');

const ARC_CHAIN_ID = 5042002;
const DEFAULT_P2P_EDGE = 'https://tjyplcnvwjzpfcbctlrs.supabase.co/functions/v1/masterlawex-p2p';
const ENTITLEMENT_TYPE = 'MASTERLAW_P2P_ENTITLEMENT_V1';
const ENTITLEMENT_ISSUER = 'masterlaw-api';
const ENTITLEMENT_AUDIENCE = 'masterlawex-p2p';
const ENTITLEMENT_TTL_SECONDS = 15 * 60;

function normalizeWallet(value) {
  const wallet = String(value || '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw new Error('INVALID_ARC_WALLET');
  return wallet.toLowerCase();
}

function validateSessionToken(value) {
  const token = String(value || '').trim();
  if (token.length < 16 || token.length > 8192 || /[\r\n]/.test(token)) throw new Error('INVALID_P2P_SESSION_TOKEN');
  return token;
}

async function attestP2PSession({ sessionToken, expectedWallet, fetchImpl = global.fetch, endpoint = DEFAULT_P2P_EDGE }) {
  if (typeof fetchImpl !== 'function') throw new Error('P2P_ATTESTATION_FETCH_UNAVAILABLE');
  const token = validateSessionToken(sessionToken);
  const expected = expectedWallet ? normalizeWallet(expectedWallet) : null;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action: 'me' })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.profile) throw new Error('P2P_SIGNED_SESSION_NOT_VERIFIED');

  const wallet = normalizeWallet(payload.profile.wallet);
  if (expected && wallet !== expected) throw new Error('P2P_SESSION_WALLET_MISMATCH');

  return {
    wallet,
    attestation: 'P2P_SIGNED_SESSION',
    source: 'MASTERLAWEX_P2P_EDGE_READ_ONLY'
  };
}

function issueEntitlement({ secret, userId, wallet, kycStatus, kycLevel, expiresIn = ENTITLEMENT_TTL_SECONDS }) {
  if (!secret) throw new Error('MASTERLAW_AUTH_NOT_CONFIGURED');
  if (!userId) throw new Error('MASTERLAW_IDENTITY_REQUIRED');
  const normalizedWallet = normalizeWallet(wallet);
  const ttl = Number(expiresIn);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600) throw new Error('INVALID_ENTITLEMENT_TTL');

  return jwt.sign({
    type: ENTITLEMENT_TYPE,
    user_id: String(userId),
    wallet: normalizedWallet,
    chain_id: ARC_CHAIN_ID,
    kyc_status: String(kycStatus || 'VERIFIED'),
    kyc_level: Number(kycLevel || 1),
    wallet_attestation: 'P2P_SIGNED_SESSION',
    persistence: 'NOT_WRITTEN',
    database_mutation: false,
    real_money_enabled: false
  }, secret, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE,
    subject: String(userId),
    expiresIn: ttl
  });
}

function verifyEntitlement(token, secret) {
  if (!secret) throw new Error('MASTERLAW_AUTH_NOT_CONFIGURED');
  const raw = String(token || '').trim();
  if (raw.length < 32 || raw.length > 16384 || /[\r\n]/.test(raw)) throw new Error('INVALID_P2P_ENTITLEMENT_TOKEN');
  const claims = jwt.verify(raw, secret, {
    issuer: ENTITLEMENT_ISSUER,
    audience: ENTITLEMENT_AUDIENCE
  });
  if (claims.type !== ENTITLEMENT_TYPE) throw new Error('INVALID_P2P_ENTITLEMENT_TYPE');
  if (!claims.sub || !claims.user_id || String(claims.sub) !== String(claims.user_id)) throw new Error('INVALID_P2P_ENTITLEMENT_SUBJECT');
  if (Number(claims.chain_id) !== ARC_CHAIN_ID) throw new Error('INVALID_P2P_ENTITLEMENT_CHAIN');
  if (String(claims.kyc_status || '').toUpperCase() !== 'VERIFIED') throw new Error('INVALID_P2P_ENTITLEMENT_KYC');
  if (!Number.isInteger(Number(claims.kyc_level)) || Number(claims.kyc_level) < 1) throw new Error('INVALID_P2P_ENTITLEMENT_KYC_LEVEL');
  if (claims.wallet_attestation !== 'P2P_SIGNED_SESSION') throw new Error('INVALID_P2P_ENTITLEMENT_ATTESTATION');
  if (claims.persistence !== 'NOT_WRITTEN') throw new Error('INVALID_P2P_ENTITLEMENT_PERSISTENCE');
  if (claims.real_money_enabled !== false || claims.database_mutation !== false) throw new Error('INVALID_P2P_ENTITLEMENT_SCOPE');
  claims.wallet = normalizeWallet(claims.wallet);
  return claims;
}

module.exports = {
  ARC_CHAIN_ID,
  DEFAULT_P2P_EDGE,
  ENTITLEMENT_TYPE,
  ENTITLEMENT_TTL_SECONDS,
  normalizeWallet,
  validateSessionToken,
  attestP2PSession,
  issueEntitlement,
  verifyEntitlement
};