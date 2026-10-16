'use strict';

const express = require('express');
const p2pApp = require('./exchange-p2p-api');

const app = express();
const MASTERLAW_P2P_ORIGIN = 'https://p2p.masterlaw.cl';

app.use((req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (origin !== MASTERLAW_P2P_ORIGIN) return next();

  res.setHeader('Access-Control-Allow-Origin', MASTERLAW_P2P_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-P2P-Session');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // The downstream app keeps its existing CORS policy for every other origin.
  // For this verified custom domain only, remove Origin after setting the exact
  // response header so the existing middleware treats it as a same-origin call.
  delete req.headers.origin;
  return next();
});

app.use(p2pApp);

module.exports = app;
