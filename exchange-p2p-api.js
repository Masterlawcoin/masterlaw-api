'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { accessDecision } = require('./exchange/p2p-access');
const {
  ARC_CHAIN_ID,
  DEFAULT_P2P_EDGE,
  ENTITLEMENT_TYPE,
  ENTITLEMENT_TTL_SECONDS,
  attestP2PSession,
  issueEntitlement
} = require('./exchange/p2p-wallet-binding');

const app = express();
app.use(cors({
  origin: [
    'https://masterlaw.cl',
    'https://www.masterlaw.cl',
    'https://arcx-exchange-v2.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '256kb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const entitlementSecret = process.env.P2P_ENTITLEMENT_SECRET || jwtSecret;
const p2pEdgeUrl = process.env.MASTERLAWEX_P2P_EDGE_URL || DEFAULT_P2P_EDGE;
const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

function authRequired(req, res, next) {
  if (!jwtSecret) return res.status(503).json({ ok:false, eligible:false, reason:'MASTERLAW_AUTH_NOT_CONFIGURED' });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_REQUIRED' });
  try {
    const claims = jwt.verify(token, jwtSecret);
    // A short-lived P2P entitlement must never be accepted as a Masterlaw login token.
    if (!claims?.id || claims.type === ENTITLEMENT_TYPE) throw new Error('invalid identity token type');
    req.user = claims;
    next();
  } catch {
    return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_INVALID' });
  }
}

async function getMasterlawAccess(userId) {
  if (!supabase) return { status:503, ok:false, reason:'MASTERLAW_IDENTITY_STORE_UNAVAILABLE' };
  const { data:user, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !user) return { status:401, ok:false, reason:'MASTERLAW_IDENTITY_NOT_FOUND' };
  const decision = accessDecision(user);
  return { status:decision.eligible ? 200 : 403, ok:true, user, decision };
}

app.get('/api/exchange/p2p/policy', (_req, res) => {
  res.json({
    ok: true,
    identity_source: 'MASTERLAW_USUARIOS_ID',
    kyc_required_for: [
      'CREATE_P2P_OFFER',
      'TAKE_P2P_OFFER',
      'RECEIVE_FIAT_INSTRUCTIONS',
      'OPEN_REAL_MONEY_TRADE'
    ],
    wallet_binding: {
      mode: 'MASTERLAW_JWT_PLUS_P2P_SIGNED_SESSION',
      persistence: 'TEMPORARY_NOT_WRITTEN',
      entitlement_ttl_seconds: ENTITLEMENT_TTL_SECONDS
    },
    fail_closed: true,
    chain: { name: 'Arc Testnet', chain_id: ARC_CHAIN_ID },
    settlement: 'ARC_USDC_ESCROW_V1_4',
    mediation: 'MASTERLAW_CASE_MANAGEMENT_PLUS_MULTISIG',
    pii_onchain: false,
    database_mutation: false,
    real_money_enabled: false
  });
});

app.get('/api/exchange/p2p/access', authRequired, async (req, res) => {
  try {
    const access = await getMasterlawAccess(req.user.id);
    if (!access.ok) return res.status(access.status).json({ ok:false, eligible:false, reason:access.reason });
    const { decision } = access;
    return res.status(access.status).json({
      ok: true,
      user_id: req.user.id,
      eligible: decision.eligible,
      kyc_status: decision.status,
      kyc_level: decision.level ?? null,
      reason: decision.reason,
      wallet_binding_required: true,
      wallet_binding_mode: 'TEMPORARY_ATTESTATION',
      real_money_enabled: false,
      next: decision.eligible ? 'BIND_ARC_WALLET' : 'COMPLETE_OR_REVIEW_KYC'
    });
  } catch (error) {
    return res.status(503).json({
      ok:false,
      eligible:false,
      reason:'MASTERLAW_KYC_GATE_UNAVAILABLE',
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

app.post('/api/exchange/p2p/bind-wallet', authRequired, async (req, res) => {
  try {
    const access = await getMasterlawAccess(req.user.id);
    if (!access.ok) return res.status(access.status).json({ ok:false, eligible:false, reason:access.reason });
    if (!access.decision.eligible) {
      return res.status(403).json({
        ok:true,
        eligible:false,
        reason:access.decision.reason,
        kyc_status:access.decision.status,
        real_money_enabled:false
      });
    }

    const attested = await attestP2PSession({
      sessionToken: req.body?.p2p_session_token,
      expectedWallet: req.body?.expected_wallet,
      endpoint: p2pEdgeUrl
    });

    const entitlement = issueEntitlement({
      secret: entitlementSecret,
      userId: req.user.id,
      wallet: attested.wallet,
      kycStatus: access.decision.status,
      kycLevel: access.decision.level,
      expiresIn: ENTITLEMENT_TTL_SECONDS
    });

    return res.json({
      ok:true,
      eligible:true,
      user_id:req.user.id,
      wallet:attested.wallet,
      chain_id:ARC_CHAIN_ID,
      kyc_status:access.decision.status,
      kyc_level:access.decision.level ?? null,
      wallet_attestation:attested.attestation,
      binding:'ATTESTED_TEMPORARY',
      persistence:'NOT_WRITTEN',
      database_mutation:false,
      entitlement,
      expires_in:ENTITLEMENT_TTL_SECONDS,
      real_money_enabled:false,
      next:'SERVER_SIDE_P2P_ENTITLEMENT_ENFORCEMENT_REQUIRED'
    });
  } catch (error) {
    const known = new Set([
      'INVALID_ARC_WALLET',
      'INVALID_P2P_SESSION_TOKEN',
      'P2P_SIGNED_SESSION_NOT_VERIFIED',
      'P2P_SESSION_WALLET_MISMATCH'
    ]);
    const reason = known.has(error.message) ? error.message : 'P2P_WALLET_BINDING_UNAVAILABLE';
    const status = known.has(error.message) ? 403 : 503;
    return res.status(status).json({
      ok:false,
      eligible:false,
      reason,
      database_mutation:false,
      real_money_enabled:false,
      error: process.env.NODE_ENV === 'production' ? undefined : (known.has(error.message) ? undefined : error.message)
    });
  }
});

app.get('/api/exchange/p2p/health', (_req, res) => {
  res.json({
    ok:true,
    service:'MASTERLAW_P2P_CONTROL_PLANE',
    version:'1.1.0-testnet',
    identity_store_configured:!!supabase,
    jwt_configured:!!jwtSecret,
    entitlement_signing_configured:!!entitlementSecret,
    wallet_attestation_source:'P2P_SIGNED_SESSION_READ_ONLY',
    chain_id:ARC_CHAIN_ID,
    writes_enabled:false,
    real_money_enabled:false
  });
});

module.exports = app;
