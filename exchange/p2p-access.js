'use strict';

const express = require('express');

const ALLOWED_KYC = new Set(['VERIFIED']);
const REVIEW_KYC = new Set(['KYC_PENDING', 'PENDING', 'ENHANCED_REVIEW', 'REVIEW']);
const BLOCKED_KYC = new Set(['BLOCKED', 'REJECTED', 'EXPIRED']);

function normalizeStatus(user) {
  const raw = user?.kyc_status ?? user?.estado_kyc ?? user?.kyc_state ?? null;
  return raw ? String(raw).trim().toUpperCase() : 'NOT_CONFIGURED';
}

function accessDecision(user, now = Date.now()) {
  if (!user || user.activo === false) {
    return { eligible: false, status: 'BLOCKED', reason: 'MASTERLAW_ACCOUNT_INACTIVE' };
  }

  const status = normalizeStatus(user);
  if (BLOCKED_KYC.has(status)) return { eligible: false, status, reason: `KYC_${status}` };
  if (REVIEW_KYC.has(status)) return { eligible: false, status, reason: `KYC_${status}` };
  if (!ALLOWED_KYC.has(status)) return { eligible: false, status, reason: 'KYC_NOT_VERIFIED' };

  const expiresRaw = user.kyc_expires_at ?? user.kyc_expira_at ?? null;
  if (expiresRaw) {
    const expires = Date.parse(expiresRaw);
    if (!Number.isFinite(expires) || expires <= now) {
      return { eligible: false, status: 'EXPIRED', reason: 'KYC_EXPIRED' };
    }
  }

  if (user.p2p_blocked === true || user.exchange_blocked === true) {
    return { eligible: false, status: 'BLOCKED', reason: 'P2P_BLOCKED_BY_MASTERLAW' };
  }

  return {
    eligible: true,
    status: 'VERIFIED',
    reason: 'KYC_VERIFIED',
    level: Number(user.kyc_level ?? user.nivel_kyc ?? 1) || 1
  };
}

function createP2PAccessRouter({ supabase, authRequired }) {
  if (!supabase || typeof authRequired !== 'function') throw new Error('P2P access router requires supabase and authRequired');

  const router = express.Router();

  // Read-only gate. It reuses Masterlaw usuarios.id and never creates another exchange identity.
  router.get('/access', authRequired, async (req, res) => {
    try {
      const { data: user, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', req.user.id)
        .single();

      if (error || !user) {
        return res.status(401).json({
          ok: false,
          eligible: false,
          status: 'BLOCKED',
          reason: 'MASTERLAW_IDENTITY_NOT_FOUND'
        });
      }

      const decision = accessDecision(user);
      return res.status(decision.eligible ? 200 : 403).json({
        ok: true,
        user_id: req.user.id,
        eligible: decision.eligible,
        kyc_status: decision.status,
        kyc_level: decision.level ?? null,
        reason: decision.reason,
        requirements: decision.eligible ? [] : [
          'MASTERLAW_IDENTITY',
          'KYC_VERIFIED',
          'ACCOUNT_ACTIVE',
          'P2P_NOT_BLOCKED'
        ]
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        eligible: false,
        status: 'BLOCKED',
        reason: 'KYC_GATE_UNAVAILABLE',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message
      });
    }
  });

  // Public capability description for the exchange UI. No PII and no database write.
  router.get('/policy', (_req, res) => {
    res.json({
      ok: true,
      identity_source: 'MASTERLAW_USUARIOS_ID',
      kyc_required_for: ['CREATE_P2P_OFFER', 'TAKE_P2P_OFFER', 'RECEIVE_FIAT_INSTRUCTIONS', 'OPEN_REAL_MONEY_TRADE'],
      fail_closed: true,
      chain: { name: 'Arc Testnet', chain_id: 5042002 },
      settlement: 'ARC_USDC_ESCROW',
      mediation: 'MASTERLAW_CASE_MANAGEMENT_PLUS_MULTISIG',
      pii_onchain: false
    });
  });

  return router;
}

module.exports = { createP2PAccessRouter, accessDecision, normalizeStatus };
