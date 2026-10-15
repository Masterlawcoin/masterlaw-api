'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');
const {
  ARC_CHAIN_ID,
  ENTITLEMENT_TYPE,
  ENTITLEMENT_TTL_SECONDS,
  normalizeWallet,
  validateSessionToken,
  attestP2PSession,
  issueEntitlement,
  verifyEntitlement
} = require('./exchange/p2p-wallet-binding');

(async () => {
  const wallet = '0xAa000000000000000000000000000000000000Bb';
  const normalized = wallet.toLowerCase();
  assert.strictEqual(normalizeWallet(wallet), normalized);
  assert.throws(() => normalizeWallet('not-a-wallet'), /INVALID_ARC_WALLET/);
  assert.throws(() => validateSessionToken('short'), /INVALID_P2P_SESSION_TOKEN/);

  let captured = null;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({ ok:true, profile:{ wallet } })
    };
  };

  const attested = await attestP2PSession({
    sessionToken: 'signed-p2p-session-token-1234567890',
    expectedWallet: wallet,
    fetchImpl: fakeFetch,
    endpoint: 'https://example.test/p2p'
  });
  assert.deepStrictEqual(attested, {
    wallet: normalized,
    attestation: 'P2P_SIGNED_SESSION',
    source: 'MASTERLAWEX_P2P_EDGE_READ_ONLY'
  });
  assert.strictEqual(captured.url, 'https://example.test/p2p');
  assert.strictEqual(captured.options.method, 'POST');
  assert.strictEqual(captured.options.headers.authorization, 'Bearer signed-p2p-session-token-1234567890');
  assert.deepStrictEqual(JSON.parse(captured.options.body), { action:'me' });

  await assert.rejects(() => attestP2PSession({
    sessionToken: 'signed-p2p-session-token-1234567890',
    expectedWallet: '0xCc000000000000000000000000000000000000Dd',
    fetchImpl: fakeFetch
  }), /P2P_SESSION_WALLET_MISMATCH/);

  await assert.rejects(() => attestP2PSession({
    sessionToken: 'signed-p2p-session-token-1234567890',
    expectedWallet: wallet,
    fetchImpl: async () => ({ ok:false, json:async()=>({ok:false}) })
  }), /P2P_SIGNED_SESSION_NOT_VERIFIED/);

  const secret = 'test-masterlaw-jwt-secret-that-is-long-enough';
  const entitlement = issueEntitlement({
    secret,
    userId: 'user-123',
    wallet,
    kycStatus: 'VERIFIED',
    kycLevel: 2
  });
  const claims = verifyEntitlement(entitlement, secret);
  assert.strictEqual(claims.type, ENTITLEMENT_TYPE);
  assert.strictEqual(claims.sub, 'user-123');
  assert.strictEqual(claims.user_id, 'user-123');
  assert.strictEqual(claims.wallet, normalized);
  assert.strictEqual(claims.chain_id, ARC_CHAIN_ID);
  assert.strictEqual(claims.kyc_status, 'VERIFIED');
  assert.strictEqual(claims.kyc_level, 2);
  assert.strictEqual(claims.wallet_attestation, 'P2P_SIGNED_SESSION');
  assert.strictEqual(claims.persistence, 'NOT_WRITTEN');
  assert.strictEqual(claims.database_mutation, false);
  assert.strictEqual(claims.real_money_enabled, false);
  assert.ok(claims.exp - claims.iat <= ENTITLEMENT_TTL_SECONDS);
  assert.ok(claims.exp - claims.iat >= ENTITLEMENT_TTL_SECONDS - 1);

  const decoded = jwt.decode(entitlement);
  assert.strictEqual(decoded.id, undefined, 'entitlement must not contain Masterlaw login id claim');
  assert.strictEqual(decoded.aud, 'masterlawex-p2p');
  assert.strictEqual(decoded.iss, 'masterlaw-api');

  assert.throws(() => verifyEntitlement(entitlement, 'wrong-secret'), /invalid signature/i);
  assert.throws(() => issueEntitlement({ secret, userId:'user-123', wallet, kycStatus:'VERIFIED', expiresIn:7200 }), /INVALID_ENTITLEMENT_TTL/);

  console.log('MASTERLAW P2P STATELESS WALLET ENTITLEMENT PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
