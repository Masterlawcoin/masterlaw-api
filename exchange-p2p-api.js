'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { accessDecision } = require('./exchange/p2p-access');

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
  methods: ['GET','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '256kb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

function authRequired(req, res, next) {
  if (!jwtSecret) return res.status(503).json({ ok:false, eligible:false, reason:'MASTERLAW_AUTH_NOT_CONFIGURED' });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_REQUIRED' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_TOKEN_INVALID' });
  }
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
    fail_closed: true,
    chain: { name: 'Arc Testnet', chain_id: 5042002 },
    settlement: 'ARC_USDC_ESCROW_V1_4',
    mediation: 'MASTERLAW_CASE_MANAGEMENT_PLUS_MULTISIG',
    pii_onchain: false,
    database_mutation: false
  });
});

app.get('/api/exchange/p2p/access', authRequired, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok:false, eligible:false, reason:'MASTERLAW_IDENTITY_STORE_UNAVAILABLE' });

  try {
    const { data:user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ ok:false, eligible:false, reason:'MASTERLAW_IDENTITY_NOT_FOUND' });
    }

    const decision = accessDecision(user);
    return res.status(decision.eligible ? 200 : 403).json({
      ok: true,
      user_id: req.user.id,
      eligible: decision.eligible,
      kyc_status: decision.status,
      kyc_level: decision.level ?? null,
      reason: decision.reason,
      wallet_binding_required: true,
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

app.get('/api/exchange/p2p/health', (_req, res) => {
  res.json({
    ok:true,
    service:'MASTERLAW_P2P_CONTROL_PLANE',
    version:'1.0.0-testnet',
    identity_store_configured:!!supabase,
    jwt_configured:!!jwtSecret,
    chain_id:5042002,
    writes_enabled:false
  });
});

module.exports = app;
