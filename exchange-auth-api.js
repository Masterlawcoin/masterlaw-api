'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const allowedOrigins = new Set([
  'https://masterlaw.cl',
  'https://www.masterlaw.cl',
  'https://arcx-exchange-v2.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
]);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin) || /^https:\/\/arcx-exchange-v2-[a-z0-9-]+\.vercel\.app$/i.test(origin)) return cb(null, true);
    return cb(new Error('CORS_ORIGIN_BLOCKED'));
  },
  credentials: false,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit:'64kb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

function configured(res) {
  if (!supabase || !jwtSecret) {
    res.status(503).json({ ok:false, error:'MASTERLAW_AUTH_NOT_CONFIGURED' });
    return false;
  }
  return true;
}
function signToken(user) {
  return jwt.sign({ id:user.id, email:user.email, rol:user.rol || 'cliente', plan:user.plan || 'gratis' }, jwtSecret, { expiresIn:'30d' });
}
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); }
function authRequired(req,res,next) {
  if (!configured(res)) return;
  const token = bearer(req);
  if (!token) return res.status(401).json({ ok:false, error:'TOKEN_REQUIRED' });
  try { req.user = jwt.verify(token, jwtSecret); return next(); }
  catch { return res.status(401).json({ ok:false, error:'TOKEN_INVALID' }); }
}
async function readUser(id) {
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data;
}

app.get('/api/exchange/auth/health', (_req,res) => res.json({ ok:true, auth:'MASTERLAW_EXISTING_ACCOUNTS', registration_enabled:false, database_mutation:false }));

app.post('/api/exchange/auth/login', async (req,res) => {
  if (!configured(res)) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ ok:false, error:'EMAIL_PASSWORD_REQUIRED' });
  try {
    const { data:authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !authData?.user?.id) return res.status(401).json({ ok:false, error:'INVALID_CREDENTIALS' });
    const user = await readUser(authData.user.id);
    if (!user || user.activo === false) return res.status(403).json({ ok:false, error:'MASTERLAW_ACCOUNT_DISABLED_OR_MISSING' });
    return res.json({ ok:true, token:signToken(user), user, registration_enabled:false });
  } catch (error) {
    return res.status(503).json({ ok:false, error:'MASTERLAW_LOGIN_UNAVAILABLE' });
  }
});

app.get('/api/exchange/auth/me', authRequired, async (req,res) => {
  try {
    const user = await readUser(req.user.id);
    if (!user || user.activo === false) return res.status(401).json({ ok:false, error:'MASTERLAW_ACCOUNT_DISABLED_OR_MISSING' });
    return res.json({ ok:true, user });
  } catch {
    return res.status(503).json({ ok:false, error:'MASTERLAW_PROFILE_UNAVAILABLE' });
  }
});

app.post('/api/exchange/auth/forgot', async (req,res) => {
  if (!configured(res)) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ ok:false, error:'EMAIL_REQUIRED' });
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo:'https://masterlaw.cl/login/' });
  } catch {}
  return res.json({ ok:true, message:'Si el correo existe, recibirás el enlace de recuperación.' });
});

app.use((_req,res) => res.status(404).json({ ok:false, error:'AUTH_ENDPOINT_NOT_FOUND' }));
module.exports = app;
