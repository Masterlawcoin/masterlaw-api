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
  normalizeWallet,
  attestP2PSession,
  issueEntitlement,
  verifyEntitlement
} = require('./exchange/p2p-wallet-binding');
const {
  CASE_STATES,
  ALLOWED_TRANSITIONS,
  RISK_LEVELS,
  EVIDENCE_VISIBILITY,
  RESOLUTION_MODES,
  validateTransition,
  prepareCase,
  prepareEvidence,
  prepareResolution
} = require('./exchange/p2p-case-admin');

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
const p2pAdminRoles = new Set(
  String(process.env.P2P_ADMIN_ROLES || 'admin')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean)
);

function releaseMeta() {
  return {
    schema:'MASTERLAW_P2P_RELEASE_V1',
    git_sha:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    git_ref:process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || null,
    environment:process.env.VERCEL_ENV || (process.env.GITHUB_ACTIONS ? 'github-actions' : process.env.NODE_ENV || 'local'),
    chain_id:ARC_CHAIN_ID,
    real_money_enabled:false
  };
}

function authRequired(req, res, next) {
  if (!jwtSecret) return res.status(503).json({ ok:false, eligible:false, reason:'MASTERLAW_AUTH_NOT_CONFIGURED' });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_REQUIRED' });
  try {
    const claims = jwt.verify(token, jwtSecret);
    if (!claims?.id || claims.type === ENTITLEMENT_TYPE) throw new Error('invalid identity token type');
    req.user = claims;
    next();
  } catch {
    return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_INVALID' });
  }
}

async function getCurrentUser(userId) {
  if (!supabase) return { status:503, ok:false, reason:'MASTERLAW_IDENTITY_STORE_UNAVAILABLE' };
  const { data:user, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !user) return { status:401, ok:false, reason:'MASTERLAW_IDENTITY_NOT_FOUND' };
  return { status:200, ok:true, user };
}

async function getMasterlawAccess(userId) {
  const current = await getCurrentUser(userId);
  if (!current.ok) return current;
  const decision = accessDecision(current.user);
  return { status:decision.eligible ? 200 : 403, ok:true, user:current.user, decision };
}

async function p2pAdminRequired(req, res, next) {
  try {
    const current = await getCurrentUser(req.user.id);
    if (!current.ok) return res.status(current.status).json({ ok:false, reason:current.reason });
    const role = String(current.user.rol || '').trim().toLowerCase();
    if (current.user.activo === false || !p2pAdminRoles.has(role)) {
      return res.status(403).json({ ok:false, reason:'P2P_ADMIN_ROLE_REQUIRED' });
    }
    req.p2pAdmin = { user_id:current.user.id, role };
    next();
  } catch (error) {
    return res.status(503).json({
      ok:false,
      reason:'P2P_ADMIN_AUTH_UNAVAILABLE',
      error:process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
}

function adminPacketError(res, error) {
  const code = String(error?.code || error?.message || 'INVALID_ADMIN_PACKET');
  return res.status(400).json({
    ok:false,
    reason:code,
    database_mutation:false,
    real_money_enabled:false
  });
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
      entitlement_ttl_seconds: ENTITLEMENT_TTL_SECONDS,
      server_verification: '/api/exchange/p2p/verify-entitlement'
    },
    admin_workspace: {
      mode: 'PREPARE_ONLY',
      role_source: 'MASTERLAW_USUARIOS_ROL',
      default_roles: ['admin'],
      case_schema: 'MASTERLAW_P2P_CASE_V1',
      evidence_schema: 'MASTERLAW_P2P_EVIDENCE_V1',
      resolution_schema: 'MASTERLAW_P2P_RESOLUTION_V1'
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

app.post('/api/exchange/p2p/verify-entitlement', async (req, res) => {
  if (!entitlementSecret) {
    return res.status(503).json({ ok:false, verified:false, reason:'P2P_ENTITLEMENT_SIGNING_NOT_CONFIGURED', database_mutation:false, real_money_enabled:false });
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ ok:false, verified:false, reason:'P2P_ENTITLEMENT_REQUIRED', database_mutation:false, real_money_enabled:false });
  }
  try {
    const expectedWallet = normalizeWallet(req.body?.expected_wallet);
    const claims = verifyEntitlement(token, entitlementSecret);
    if (claims.wallet !== expectedWallet) {
      return res.status(403).json({ ok:false, verified:false, reason:'P2P_ENTITLEMENT_WALLET_MISMATCH', database_mutation:false, real_money_enabled:false });
    }

    const access = await getMasterlawAccess(claims.user_id);
    if (!access.ok) {
      return res.status(access.status).json({ ok:false, verified:false, reason:access.reason, database_mutation:false, real_money_enabled:false });
    }
    if (!access.decision.eligible || String(access.decision.status || '').toUpperCase() !== 'VERIFIED') {
      return res.status(403).json({
        ok:false,
        verified:false,
        reason:access.decision.reason || 'MASTERLAW_KYC_NOT_VERIFIED',
        kyc_status:access.decision.status,
        database_mutation:false,
        real_money_enabled:false
      });
    }

    return res.json({
      ok:true,
      verified:true,
      user_id:String(claims.user_id),
      wallet:claims.wallet,
      chain_id:ARC_CHAIN_ID,
      kyc_status:'VERIFIED',
      kyc_level:access.decision.level ?? claims.kyc_level,
      wallet_attestation:'P2P_SIGNED_SESSION',
      entitlement_expires_at:new Date(Number(claims.exp) * 1000).toISOString(),
      identity_rechecked:true,
      persistence:'NOT_WRITTEN',
      database_mutation:false,
      real_money_enabled:false,
      next:'P2P_BACKEND_MUST_ENFORCE_VERIFIED_ENTITLEMENT'
    });
  } catch (error) {
    const known = new Set([
      'INVALID_ARC_WALLET',
      'INVALID_P2P_ENTITLEMENT_TOKEN',
      'INVALID_P2P_ENTITLEMENT_TYPE',
      'INVALID_P2P_ENTITLEMENT_SUBJECT',
      'INVALID_P2P_ENTITLEMENT_CHAIN',
      'INVALID_P2P_ENTITLEMENT_KYC',
      'INVALID_P2P_ENTITLEMENT_KYC_LEVEL',
      'INVALID_P2P_ENTITLEMENT_ATTESTATION',
      'INVALID_P2P_ENTITLEMENT_PERSISTENCE',
      'INVALID_P2P_ENTITLEMENT_SCOPE'
    ]);
    const reason = known.has(error.message) ? error.message : 'P2P_ENTITLEMENT_INVALID_OR_EXPIRED';
    return res.status(403).json({
      ok:false,
      verified:false,
      reason,
      database_mutation:false,
      real_money_enabled:false
    });
  }
});

app.get('/api/exchange/p2p/admin/state-machine', authRequired, p2pAdminRequired, (req, res) => {
  res.json({
    ok:true,
    actor:req.p2pAdmin,
    chain_id:ARC_CHAIN_ID,
    states:CASE_STATES,
    transitions:ALLOWED_TRANSITIONS,
    risk_levels:[...RISK_LEVELS],
    evidence_visibility:[...EVIDENCE_VISIBILITY],
    resolution_modes:[...RESOLUTION_MODES],
    browser_broadcast_allowed:false,
    database_mutation:false,
    real_money_enabled:false
  });
});

app.post('/api/exchange/p2p/admin/prepare-transition', authRequired, p2pAdminRequired, (req, res) => {
  try {
    const transition = validateTransition(req.body?.from, req.body?.to);
    return res.json({
      ok:true,
      transition,
      actor:req.p2pAdmin,
      prepared_only:true,
      database_mutation:false,
      real_money_enabled:false
    });
  } catch (error) {
    return adminPacketError(res, error);
  }
});

app.post('/api/exchange/p2p/admin/prepare-case', authRequired, p2pAdminRequired, (req, res) => {
  try {
    return res.json({ ok:true, actor:req.p2pAdmin, ...prepareCase(req.body || {}) });
  } catch (error) {
    return adminPacketError(res, error);
  }
});

app.post('/api/exchange/p2p/admin/prepare-evidence', authRequired, p2pAdminRequired, (req, res) => {
  try {
    return res.json({ ok:true, actor:req.p2pAdmin, ...prepareEvidence(req.body || {}) });
  } catch (error) {
    return adminPacketError(res, error);
  }
});

app.post('/api/exchange/p2p/admin/prepare-resolution', authRequired, p2pAdminRequired, (req, res) => {
  try {
    const body = { ...(req.body || {}), approved_by:req.p2pAdmin.user_id };
    return res.json({ ok:true, actor:req.p2pAdmin, ...prepareResolution(body) });
  } catch (error) {
    return adminPacketError(res, error);
  }
});

app.get('/api/exchange/p2p/health', (_req, res) => {
  res.json({
    ok:true,
    service:'MASTERLAW_P2P_CONTROL_PLANE',
    version:'1.3.0-testnet',
    release:releaseMeta(),
    identity_store_configured:!!supabase,
    jwt_configured:!!jwtSecret,
    entitlement_signing_configured:!!entitlementSecret,
    wallet_attestation_source:'P2P_SIGNED_SESSION_READ_ONLY',
    entitlement_verifier:'STATELESS_PLUS_CURRENT_KYC_RECHECK',
    admin_workspace:'PREPARE_ONLY',
    resolution_approver_source:'AUTHENTICATED_ADMIN',
    chain_id:ARC_CHAIN_ID,
    writes_enabled:false,
    real_money_enabled:false
  });
});

module.exports = app;