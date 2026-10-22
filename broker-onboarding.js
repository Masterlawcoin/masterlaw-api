const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
const TERMS_VERSION = 'broker-web-2026-10-21';
const LOGIN_URL = 'https://masterlaw.cl/os2/login';

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function cors(req, res) {
  const allowed = new Set([
    'https://masterlaw.cl',
    'https://www.masterlaw.cl',
    'https://masterlaw-api.vercel.app'
  ]);
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, payload) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function clean(value, max = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 254).toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validRut(rut) {
  if (!rut) return true;
  return /^[0-9.]{7,12}-[0-9kK]$/.test(rut);
}

function brokerPage() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="index,follow">
<title>Registro Broker Inmobiliario | MASTERLAW®</title>
<meta name="description" content="Registro de brokers inmobiliarios externos en MASTERLAW. Crea tu cuenta, recibe tu código de broker y completa tu perfil profesional.">
<style>
:root{--bg:#07111f;--panel:#0d1a2b;--panel2:#12243a;--txt:#f5f7fb;--muted:#9fb0c8;--line:#233a56;--accent:#40d9b0;--accent2:#6bb8ff;--danger:#ff7b7b;--ok:#77e6b4}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#142c49 0,#07111f 42%,#040912 100%);color:var(--txt);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.wrap{width:min(1060px,calc(100% - 28px));margin:0 auto;padding:26px 0 54px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:30px}.brand{font-weight:900;letter-spacing:.08em;font-size:20px}.brand span{color:var(--accent)}.login{color:var(--txt);text-decoration:none;border:1px solid var(--line);padding:10px 14px;border-radius:12px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1.05fr;gap:28px;align-items:start}.hero{padding:26px 8px 0 4px}.eyebrow{display:inline-flex;border:1px solid #2b5470;background:#0d2234;border-radius:999px;padding:7px 11px;color:#b9d8ee;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5vw,58px);line-height:1.02;margin:18px 0 16px;letter-spacing:-.04em}.hero h1 em{font-style:normal;color:var(--accent)}.hero p{color:var(--muted);font-size:17px;line-height:1.65;max-width:560px}.steps{display:grid;gap:11px;margin-top:26px}.step{display:flex;gap:12px;align-items:flex-start;color:#ced9e8}.num{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#11304a;color:var(--accent);font-weight:900;flex:none}.card{background:linear-gradient(180deg,rgba(18,36,58,.98),rgba(10,24,40,.98));border:1px solid var(--line);box-shadow:0 24px 70px rgba(0,0,0,.35);border-radius:22px;padding:24px}.card h2{margin:0 0 7px;font-size:24px}.sub{color:var(--muted);font-size:14px;line-height:1.5;margin:0 0 20px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.full{grid-column:1/-1}label{display:block;color:#c6d3e3;font-size:12px;font-weight:800;margin:0 0 7px}input,select{width:100%;background:#081522;border:1px solid #29415d;color:var(--txt);border-radius:12px;padding:13px 12px;outline:none;font:inherit}input:focus,select:focus{border-color:var(--accent2);box-shadow:0 0 0 3px rgba(107,184,255,.12)}input::placeholder{color:#647891}.check{display:flex;gap:10px;align-items:flex-start;margin-top:6px;color:#b9c8da;font-size:12px;line-height:1.45}.check input{width:18px;height:18px;margin-top:1px;flex:none}.cta{width:100%;border:0;border-radius:13px;padding:14px 18px;margin-top:16px;background:linear-gradient(90deg,var(--accent),#63c7ff);color:#04221a;font-weight:900;font-size:15px;cursor:pointer}.cta:disabled{opacity:.55;cursor:not-allowed}.msg{display:none;margin-top:14px;padding:12px 14px;border-radius:12px;font-size:13px;line-height:1.5}.msg.err{display:block;background:rgba(255,123,123,.1);border:1px solid rgba(255,123,123,.35);color:#ffc0c0}.msg.ok{display:block;background:rgba(119,230,180,.1);border:1px solid rgba(119,230,180,.35);color:#c9ffe4}.success{display:none;text-align:center;padding:16px 4px 4px}.success.show{display:block}.success .code{display:inline-block;margin:14px 0;background:#071522;border:1px solid #2e5672;border-radius:12px;padding:12px 18px;font-size:20px;font-weight:900;letter-spacing:.08em;color:var(--accent)}.success a{display:block;text-decoration:none;background:var(--accent);color:#042219;border-radius:12px;padding:13px 16px;font-weight:900;margin-top:12px}.fine{margin-top:20px;color:#7388a2;font-size:11px;line-height:1.5}.hp{position:absolute!important;left:-9999px!important;opacity:0!important;pointer-events:none!important}@media(max-width:820px){.grid{grid-template-columns:1fr}.hero{padding-top:0}.hero h1{font-size:42px}.card{padding:20px}.fields{grid-template-columns:1fr}.full{grid-column:auto}.wrap{width:min(100% - 20px,680px);padding-top:18px}.top{margin-bottom:20px}}@media(max-width:420px){.hero h1{font-size:36px}.hero p{font-size:15px}.login{font-size:12px;padding:9px 10px}.brand{font-size:17px}}
</style>
</head>
<body>
<main class="wrap">
  <div class="top"><div class="brand">MASTER<span>LAW®</span></div><a class="login" href="${LOGIN_URL}">Ya tengo cuenta</a></div>
  <div class="grid">
    <section class="hero">
      <span class="eyebrow">Red profesional inmobiliaria</span>
      <h1>Opera como <em>Broker Inmobiliario</em> dentro de MASTERLAW.</h1>
      <p>Registra tu perfil profesional para gestionar oportunidades, clientes, propiedades y coordinación jurídica desde un solo sistema.</p>
      <div class="steps">
        <div class="step"><span class="num">1</span><div><b>Crea tu cuenta.</b><br>Recibes un código único de broker.</div></div>
        <div class="step"><span class="num">2</span><div><b>Completa perfil y verificación.</b><br>Tu cuenta queda marcada para completar KYC y antecedentes profesionales.</div></div>
        <div class="step"><span class="num">3</span><div><b>Trabaja dentro del sistema.</b><br>Accede al ecosistema inmobiliario y jurídico de MASTERLAW.</div></div>
      </div>
    </section>

    <section class="card" id="card">
      <div id="formBox">
        <h2>Crear cuenta de broker</h2>
        <p class="sub">Este registro es para brokers inmobiliarios externos. Los datos deben corresponder al titular de la cuenta.</p>
        <form id="brokerForm" novalidate>
          <div class="fields">
            <div class="full"><label for="nombre">Nombre completo *</label><input id="nombre" name="nombre" autocomplete="name" required maxlength="120" placeholder="Nombre y apellidos"></div>
            <div><label for="nombre_comercial">Nombre comercial</label><input id="nombre_comercial" name="nombre_comercial" maxlength="120" placeholder="Empresa o corredora"></div>
            <div><label for="rut">RUT</label><input id="rut" name="rut" maxlength="16" placeholder="12.345.678-9"></div>
            <div><label for="email">Correo *</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="correo@empresa.cl"></div>
            <div><label for="telefono">Teléfono</label><input id="telefono" name="telefono" autocomplete="tel" maxlength="30" placeholder="+56 9 ..."></div>
            <div><label for="region">Región</label><input id="region" name="region" maxlength="80" placeholder="Metropolitana"></div>
            <div><label for="comuna">Comuna</label><input id="comuna" name="comuna" maxlength="80" placeholder="Providencia"></div>
            <div class="full"><label for="referido_por">Código de referido</label><input id="referido_por" name="referido_por" maxlength="40" placeholder="Opcional"></div>
            <div><label for="password">Contraseña *</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128" placeholder="Mínimo 10 caracteres"></div>
            <div><label for="password2">Repetir contraseña *</label><input id="password2" name="password2" type="password" autocomplete="new-password" required minlength="10" maxlength="128" placeholder="Repite tu contraseña"></div>
            <input class="hp" id="website" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="full check"><input id="terms" type="checkbox" required><label for="terms">Declaro que los datos son correctos y acepto los términos de uso, tratamiento de datos y reglas de operación para brokers de MASTERLAW.</label></div>
          </div>
          <button class="cta" id="submitBtn" type="submit">Crear mi cuenta de broker</button>
          <div class="msg" id="msg"></div>
        </form>
        <div class="fine">El alta crea una cuenta profesional. La activación comercial completa puede requerir KYC/KYB, validación de antecedentes y aceptación de condiciones específicas antes de ciertas operaciones.</div>
      </div>
      <div class="success" id="success">
        <h2>Cuenta creada</h2>
        <p class="sub">Tu perfil ya quedó registrado en MASTERLAW. Guarda tu código de broker:</p>
        <div class="code" id="brokerCode"></div>
        <p class="sub">Estado inicial: <b>Pendiente de completar KYC/perfil</b>.</p>
        <a href="${LOGIN_URL}">Ingresar a MASTERLAW</a>
      </div>
    </section>
  </div>
</main>
<script>
(function(){
  var q=new URLSearchParams(location.search);
  [['nombre','nombre'],['email','email'],['telefono','telefono'],['referido_por','ref']].forEach(function(x){var v=q.get(x[1]);if(v)document.getElementById(x[0]).value=v});
  var f=document.getElementById('brokerForm'),btn=document.getElementById('submitBtn'),msg=document.getElementById('msg');
  function show(text,type){msg.className='msg '+type;msg.textContent=text}
  f.addEventListener('submit',async function(e){
    e.preventDefault();msg.className='msg';msg.textContent='';
    var p=document.getElementById('password').value,p2=document.getElementById('password2').value;
    if(p!==p2)return show('Las contraseñas no coinciden.','err');
    if(p.length<10)return show('La contraseña debe tener al menos 10 caracteres.','err');
    if(!document.getElementById('terms').checked)return show('Debes aceptar las condiciones para continuar.','err');
    btn.disabled=true;btn.textContent='Creando cuenta…';
    try{
      var payload={
        nombre:document.getElementById('nombre').value,
        nombre_comercial:document.getElementById('nombre_comercial').value,
        rut:document.getElementById('rut').value,
        email:document.getElementById('email').value,
        telefono:document.getElementById('telefono').value,
        region:document.getElementById('region').value,
        comuna:document.getElementById('comuna').value,
        referido_por:document.getElementById('referido_por').value,
        password:p,
        accept_terms:true,
        website:document.getElementById('website').value
      };
      var r=await fetch('/api/brokers/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var data=await r.json().catch(function(){return {}});
      if(!r.ok||!data.ok)throw new Error(data.error||'No fue posible crear la cuenta.');
      document.getElementById('formBox').style.display='none';
      document.getElementById('brokerCode').textContent=data.broker.codigo;
      document.getElementById('success').classList.add('show');
    }catch(err){show(err.message||'No fue posible crear la cuenta.','err');btn.disabled=false;btn.textContent='Crear mi cuenta de broker'}
  });
})();
</script>
</body></html>`;
}

async function emailExists(table, email) {
  const { data, error } = await supabase.from(table).select('email').ilike('email', email).limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function generateBrokerCode() {
  for (let i = 0; i < 12; i++) {
    const code = `BR-${crypto.randomInt(100000, 1000000)}`;
    const [a, b] = await Promise.all([
      supabase.from('ml_brokers').select('codigo').eq('codigo', code).limit(1),
      supabase.from('ml_broker_usuarios').select('codigo').eq('codigo', code).limit(1)
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    if (!(a.data || []).length && !(b.data || []).length) return code;
  }
  throw new Error('No fue posible generar un código de broker único.');
}

async function rollbackRegistration(authUserId, email, codigo) {
  const jobs = [];
  if (email) jobs.push(supabase.from('ml_broker_usuarios').delete().eq('email', email));
  if (codigo) jobs.push(supabase.from('ml_broker_perfiles_admin').delete().eq('codigo', codigo));
  if (codigo) jobs.push(supabase.from('ml_brokers').delete().eq('codigo', codigo));
  if (authUserId) jobs.push(supabase.from('usuarios').delete().eq('id', authUserId));
  await Promise.allSettled(jobs);
  if (authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
}

async function registerBroker(req, res) {
  if (!supabase) return json(res, 503, { ok: false, error: 'Servicio de registro no configurado.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (clean(body.website, 200)) return json(res, 200, { ok: true }); // honeypot

  const nombre = clean(body.nombre, 120);
  const nombreComercial = clean(body.nombre_comercial, 120) || null;
  const email = normalizeEmail(body.email);
  const telefono = clean(body.telefono, 30) || null;
  const rut = clean(body.rut, 16) || null;
  const region = clean(body.region, 80) || null;
  const comuna = clean(body.comuna, 80) || null;
  const referidoPor = clean(body.referido_por, 40) || null;
  const password = String(body.password || '');
  const acceptTerms = body.accept_terms === true || body.accept_terms === 'true';

  if (nombre.length < 3) return json(res, 400, { ok: false, error: 'Ingresa tu nombre completo.' });
  if (!validEmail(email)) return json(res, 400, { ok: false, error: 'Ingresa un correo válido.' });
  if (!validRut(rut)) return json(res, 400, { ok: false, error: 'El formato del RUT no es válido.' });
  if (password.length < 10 || password.length > 128) return json(res, 400, { ok: false, error: 'La contraseña debe tener entre 10 y 128 caracteres.' });
  if (!acceptTerms) return json(res, 400, { ok: false, error: 'Debes aceptar las condiciones para crear la cuenta.' });

  let authUserId = null;
  let codigo = null;
  try {
    const [inBrokers, inLegacy, inUsers] = await Promise.all([
      emailExists('ml_brokers', email),
      emailExists('ml_broker_usuarios', email),
      emailExists('usuarios', email)
    ]);
    if (inBrokers || inLegacy || inUsers) {
      return json(res, 409, { ok: false, error: 'Ese correo ya está registrado. Ingresa con tu cuenta o recupera tu contraseña.' });
    }

    codigo = await generateBrokerCode();
    const now = new Date().toISOString();

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol: 'broker', broker_codigo: codigo, broker_tipo: 'inmobiliario_externo' }
    });
    if (authError) throw authError;
    authUserId = authData.user.id;

    const { error: userError } = await supabase.from('usuarios').insert({
      id: authUserId,
      nombre,
      email,
      rol: 'broker',
      broker_id: codigo,
      activo: true,
      plan: 'gratis',
      rut,
      telefono
    });
    if (userError) throw userError;

    const { error: brokerError } = await supabase.from('ml_brokers').insert({
      codigo,
      nombre,
      email,
      telefono,
      activo: true,
      nivel: 1,
      referido_por: referidoPor,
      pais: 'cl',
      tipo: 'broker',
      estado: 'pendiente_kyc',
      rut,
      terminos_version: TERMS_VERSION,
      acepto_at: now
    });
    if (brokerError) throw brokerError;

    const passwordHash = await bcrypt.hash(password, 10);
    const { error: legacyError } = await supabase.from('ml_broker_usuarios').insert({
      email,
      password_hash: passwordHash,
      codigo,
      nombre,
      rol: 'broker',
      activo: true,
      permisos: { clientes: true, acciones: true, marketing: true, correos: true },
      puede_clientes: true,
      puede_acciones: true,
      puede_marketing: true,
      puede_correos: true,
      rut,
      telefono,
      region,
      nombre_comercial: nombreComercial,
      profile_completed: false,
      terminos_version: TERMS_VERSION
    });
    if (legacyError) throw legacyError;

    const { error: profileError } = await supabase.from('ml_broker_perfiles_admin').insert({
      codigo,
      nombre,
      nombre_comercial: nombreComercial,
      rut,
      email,
      telefono,
      profesion: 'Broker inmobiliario externo',
      zona: comuna,
      region,
      comuna,
      rol: 'broker',
      estado: 'Pendiente KYC',
      activo: true,
      puede_crear_clientes: true,
      puede_editar_clientes: true,
      puede_ver_comisiones: true,
      puede_exportar: true,
      notas_admin: 'Autoregistro web. Pendiente completar KYC/perfil profesional.'
    });
    if (profileError) throw profileError;

    await supabase.from('ml_broker_admin_auditoria').insert({
      broker_codigo: codigo,
      accion: 'registro_publico',
      admin_codigo: null,
      detalle: { fuente: 'web', estado: 'pendiente_kyc', terminos_version: TERMS_VERSION }
    }).catch(() => {});

    return json(res, 201, {
      ok: true,
      broker: { codigo, nombre, email, estado: 'pendiente_kyc' },
      next: { action: 'login_and_complete_profile', login_url: LOGIN_URL }
    });
  } catch (error) {
    await rollbackRegistration(authUserId, email, codigo);
    const duplicate = String(error && error.message || '').toLowerCase().includes('duplicate');
    return json(res, duplicate ? 409 : 500, {
      ok: false,
      error: duplicate ? 'Ese correo o código ya está registrado.' : 'No fue posible completar el registro. Intenta nuevamente.'
    });
  }
}

module.exports = async (req, res) => {
  setCommonHeaders(res);
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(brokerPage());
  }
  if (req.method === 'POST') return registerBroker(req, res);
  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return json(res, 405, { ok: false, error: 'Método no permitido.' });
};
