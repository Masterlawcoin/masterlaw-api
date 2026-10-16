'use strict';

const {
  DEFAULT_P2P_EDGE,
  normalizeWallet,
  validateSessionToken,
  attestP2PSession,
  verifyEntitlement
} = require('./p2p-wallet-binding');

const PROTECTED_ACTIONS = new Set([
  'create_offer',
  'take_offer',
  'mark_paid',
  'release',
  'cancel',
  'dispute'
]);

function cleanAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (!PROTECTED_ACTIONS.has(action)) throw new Error('P2P_GATEWAY_ACTION_NOT_ALLOWED');
  return action;
}

function cleanPayload(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_P2P_GATEWAY_PAYLOAD');
  const { action: _ignored, p2p_session_token: _forbidden, entitlement: _forbidden2, ...payload } = body;
  const raw = JSON.stringify(payload);
  if (raw.length > 64 * 1024) throw new Error('P2P_GATEWAY_PAYLOAD_TOO_LARGE');
  return payload;
}

async function enforceAndForward({
  entitlementToken,
  p2pSessionToken,
  body,
  entitlementSecret,
  getCurrentAccess,
  fetchImpl = global.fetch,
  edgeUrl = DEFAULT_P2P_EDGE
}) {
  if (!entitlementSecret) throw new Error('P2P_ENTITLEMENT_SIGNING_NOT_CONFIGURED');
  if (typeof getCurrentAccess !== 'function') throw new Error('MASTERLAW_ACCESS_RECHECK_UNAVAILABLE');
  if (typeof fetchImpl !== 'function') throw new Error('P2P_GATEWAY_FETCH_UNAVAILABLE');

  const action = cleanAction(body?.action);
  const claims = verifyEntitlement(entitlementToken, entitlementSecret);
  const wallet = normalizeWallet(claims.wallet);
  const sessionToken = validateSessionToken(p2pSessionToken);

  const access = await getCurrentAccess(claims.user_id);
  if (!access?.ok) {
    const error = new Error(access?.reason || 'MASTERLAW_IDENTITY_NOT_FOUND');
    error.status = Number(access?.status || 403);
    throw error;
  }
  if (!access.decision?.eligible || String(access.decision?.status || '').toUpperCase() !== 'VERIFIED') {
    const error = new Error(access.decision?.reason || 'MASTERLAW_KYC_NOT_VERIFIED');
    error.status = 403;
    throw error;
  }

  const attested = await attestP2PSession({
    sessionToken,
    expectedWallet: wallet,
    fetchImpl,
    endpoint: edgeUrl
  });
  if (attested.wallet !== wallet) throw new Error('P2P_SESSION_WALLET_MISMATCH');

  const payload = cleanPayload(body);
  const upstream = await fetchImpl(edgeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ action, ...payload })
  });
  const upstreamBody = await upstream.json().catch(() => null);
  if (!upstream.ok || !upstreamBody?.ok) {
    const error = new Error(upstreamBody?.error || `P2P_UPSTREAM_HTTP_${upstream.status}`);
    error.status = Number(upstream.status || 502);
    error.upstream = upstreamBody;
    throw error;
  }

  return {
    action,
    wallet,
    user_id: String(claims.user_id),
    kyc_status: 'VERIFIED',
    kyc_level: access.decision.level ?? claims.kyc_level,
    identity_rechecked: true,
    wallet_rechecked: true,
    enforcement: 'MASTERLAW_ENTITLEMENT_PLUS_SIGNED_P2P_SESSION',
    upstream: upstreamBody,
    database_mutation_by_gateway: false,
    supabase_configuration_mutation: false,
    real_money_enabled: false
  };
}

module.exports = {
  PROTECTED_ACTIONS,
  cleanAction,
  cleanPayload,
  enforceAndForward
};
