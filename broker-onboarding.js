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

function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function cors(req, res) {
  const allowed = new Set(['https://masterlaw.cl','https://www.masterlaw.cl','https://masterlaw-api.vercel.app']);
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, status, payload) {
  headers(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
function clean(v, max = 160) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function email(v) { return clean(v, 254).toLowerCase(); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validRut(v) { return !v || /^[0-9.]{7,12}-[0-9kK]$/.test(v); }

function page() {
return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Registro Broker Inmobiliario | MASTERLAW®</title><meta name="description" content="Crea tu cuenta de broker inmobiliario externo en MASTERLAW."><style>
:root{--bg:#06101c;--p:#0d1d30;--p2:#122840;--t:#f6f8fb;--m:#9cafc6;--l:#29435e;--a:#44ddb5;--b:#68bfff;--e:#ff8f8f}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 8% 0,#163452 0,#06101c 44%,#030812 100%);color:var(--t);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.w{width:min(1060px,calc(100% - 28px));margin:auto;padding:24px 0 54px}.top{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:28px}.brand{font-weight:950;letter-spacing:.08em;font-size:20px}.brand i{font-style:normal;color:var(--a)}.login{color:var(--t);text-decoration:none;border:1px solid var(--l);padding:10px 13px;border-radius:12px;font-size:13px;font-weight:800}.g{display:grid;grid-template-columns:1fr 1.05fr;gap:28px}.hero{padding:25px 5px}.tag{display:inline-block;border:1px solid #2e5871;background:#0c2539;padding:7px 11px;border-radius:99px;color:#c4e1f2;font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.hero h1{font-size:clamp(36px,5vw,58px);line-height:1.02;letter-spacing:-.045em;margin:18px 0 14px}.hero h1 span{color:var(--a)}.hero>p{color:var(--m);font-size:17px;line-height:1.62}.steps{display:grid;gap:12px;margin-top:25px}.s{display:flex;gap:11px;color:#d1dbea}.n{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:#12334d;color:var(--a);font-weight:950;flex:none}.card{background:linear-gradient(180deg,rgba(18,40,64,.98),rgba(8,22,37,.98));border:1px solid var(--l);border-radius:22px;padding:24px;box-shadow:0 28px 70px #0006}.card h2{margin:0 0 6px}.sub{margin:0 0 20px;color:var(--m);font-size:14px;line-height:1.5}.f{display:grid;grid-template-columns:1fr 1fr;gap:13px}.full{grid-column:1/-1}label{display:block;margin:0 0 6px;color:#cbd7e5;font-size:12px;font-weight:850}input{width:100%;border:1px solid var(--l);background:#071522;color:var(--t);border-radius:12px;padding:12px;font:inherit;outline:none}input:focus{border-color:var(--b);box-shadow:0 0 0 3px #68bfff1e}input::placeholder{color:#667c95}.ck{display:flex;gap:9px;align-items:flex-start;color:#b8c8da;font-size:12px;line-height:1.45}.ck input{width:18px;height:18px;flex:none;margin-top:1px}.btn{width:100%;margin-top:16px;border:0;border-radius:13px;padding:14px 16px;background:linear-gradient(90deg,var(--a),var(--b));color:#032119;font-weight:950;font-size:15px;cursor:pointer}.btn:disabled{opacity:.55}.msg{display:none;margin-top:13px;padding:11px 13px;border-radius:11px;font-size:13px}.msg.err{display:block;color:#ffd0d0;border:1px solid #ff8f8f55;background:#ff8f8f12}.fine{margin-top:18px;color:#738aa3;font-size:11px;line-height:1.5}.success{display:none;text-align:center;padding:18px 5px}.success.on{display:block}.code{display:inline-block;margin:12px 0 16px;padding:12px 18px;border:1px solid #315a74;background:#071522;border-radius:12px;color:var(--a);font-size:21px;font-weight:950;letter-spacing:.08em}.go{display:block;margin-top:14px;background:var(--a);color:#032119;text-decoration:none;border-radius:12px;padding:13px;font-weight:950}.hp{position:absolute;left:-9999px;opacity:0;pointer-events:none}@media(max-width:820px){.g{grid-template-columns:1fr}.hero{padding:0 4px}.card{padding:20px}.f{grid-template-columns:1fr}.full{grid-column:auto}.w{width:min(100% - 20px,680px)}}@media(max-width:420px){.hero h1{font-size:36px}.hero>p{font-size:15px}.brand{font-size:17px}}
</style></head><body><main class="w"><div class="top"><div class="brand">MASTER<i>LAW®</i></div><a class="login" href="${LOGIN_URL}">Ya tengo cuenta</a></div><div class="g"><section class="hero"><span class="tag">Red profesional inmobiliaria</span><h1>Opera como <span>Broker Inmobiliario</span> dentro de MASTERLAW.</h1><p>Registra tu perfil profesional para gestionar oportunidades, clientes, propiedades y coordinación jurídica desde un solo sistema.</p><div class="steps"><div class="s"><b class="n">1</b><div><strong>Crea tu cuenta.</strong><br>Recibes un código único de broker.</div></div><div class="s"><b class="n">2</b><div><strong>Completa perfil y KYC.</strong><br>Tu cuenta queda identificada para la validación profesional.</div></div><div class="s"><b class="n">3</b><div><strong>Trabaja dentro de MASTERLAW.</strong><br>Accede al ecosistema inmobiliario y jurídico.</div></div></div></section><section class="card"><div id="box"><h2>Crear cuenta de broker</h2><p class="sub">Para brokers inmobiliarios externos. Los datos deben corresponder al titular de la cuenta.</p><form id="form" novalidate><div class="f"><div class="full"><label>Nombre completo *</label><input id="nombre" required maxlength="120" autocomplete="name" placeholder="Nombre y apellidos"></div><div><label>Nombre comercial</label><input id="comercial" maxlength="120" placeholder="Empresa o corredora"></div><div><label>RUT</label><input id="rut" maxlength="16" placeholder="12.345.678-9"></div><div><label>Correo *</label><input id="email" type="email" required maxlength="254" autocomplete="email" placeholder="correo@empresa.cl"></div><div><label>Teléfono</label><input id="telefono" maxlength="30" autocomplete="tel" placeholder="+56 9 ..."></div><div><label>Región</label><input id="region" maxlength="80" placeholder="Metropolitana"></div><div><label>Comuna</label><input id="comuna" maxlength="80" placeholder="Providencia"></div><div class="full"><label>Código de referido</label><input id="ref" maxlength="40" placeholder="Opcional"></div><div><label>Contraseña *</label><input id="pass" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="Mínimo 10 caracteres"></div><div><label>Repetir contraseña *</label><input id="pass2" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="Repite la contraseña"></div><input class="hp" id="website" tabindex="-1" autocomplete="off"><div class="full ck"><input id="terms" type="checkbox" required><label for="terms">Declaro que los datos son correctos y acepto los términos de uso, tratamiento de datos y reglas de operación para brokers de MASTERLAW.</label></div></div><button class="btn" id="btn" type="submit">Crear mi cuenta de broker</button><div id="msg" class="msg"></div></form><div class="fine">El registro crea la cuenta profesional. Algunas operaciones requieren completar KYC/KYB y validaciones adicionales.</div></div><div id="ok" class="success"><h2>Cuenta creada</h2><p class="sub">Tu broker ya quedó registrado. Guarda tu código:</p><div class="code" id="code"></div><p class="sub">Estado inicial: <b>Pendiente de completar KYC/perfil</b>.</p><a class="go" href="${LOGIN_URL}">Ingresar a MASTERLAW</a></div></section></div></main><script>
(function(){var q=new URLSearchParams(location.search);[['nombre','nombre'],['email','email'],['telefono','telefono'],['ref','ref']].forEach(function(x){var v=q.get(x[1]);if(v)document.getElementById(x[0]).value=v});var f=document.getElementById('form'),b=document.getElementById('btn'),m=document.getElementById('msg');function err(t){m.className='msg err';m.textContent=t}f.addEventListener('submit',async function(e){e.preventDefault();m.className='msg';var p=document.getElementById('pass').value,p2=document.getElementById('pass2').value;if(p!==p2)return err('Las contraseñas no coinciden.');if(p.length<10)return err('La contraseña debe tener al menos 10 caracteres.');if(!document.getElementById('terms').checked)return err('Debes aceptar las condiciones para continuar.');b.disabled=true;b.textContent='Creando cuenta…';try{var data={nombre:document.getElementById('nombre').value,nombre_comercial:document.getElementById('comercial').value,rut:document.getElementById('rut').value,email:document.getElementById('email').value,telefono:document.getElementById('telefono').value,region:document.getElementById('region').value,comuna:document.getElementById('comuna').value,referido_por:document.getElementById('ref').value,password:p,accept_terms:true,website:document.getElementById('website').value};var r=await fetch('/api/brokers/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),j=await r.json().catch(function(){return{}});if(!r.ok||!j.ok)throw new Error(j.error||'No fue posible crear la cuenta.');document.getElementById('box').style.display='none';document.getElementById('code').textContent=j.broker.codigo;document.getElementById('ok').classList.add('on')}catch(x){err(x.message||'No fue posible crear la cuenta.');b.disabled=false;b.textContent='Crear mi cuenta de broker'}})})();
</script></body></html>`;
}

async function exists(table, mail) {
  const { data, error } = await supabase.from(table).select('email').ilike('email', mail).limit(1);
  if (error) throw error;
  return !!(data && data.length);
}
async function code() {
  for (let i=0;i<12;i++) {
    const c=`BR-${crypto.randomInt(100000,1000000)}`;
    const [a,b]=await Promise.all([
      supabase.from('ml_brokers').select('codigo').eq('codigo',c).limit(1),
      supabase.from('ml_broker_usuarios').select('codigo').eq('codigo',c).limit(1)
    ]);
    if(a.error) throw a.error; if(b.error) throw b.error;
    if(!(a.data||[]).length && !(b.data||[]).length) return c;
  }
  throw new Error('No fue posible generar un código único.');
}
async function rollback(authId, codigo) {
  const jobs=[];
  if(codigo) jobs.push(supabase.from('ml_broker_usuarios').delete().eq('codigo',codigo));
  if(codigo) jobs.push(supabase.from('ml_broker_perfiles_admin').delete().eq('codigo',codigo));
  if(codigo) jobs.push(supabase.from('ml_brokers').delete().eq('codigo',codigo));
  if(authId) jobs.push(supabase.from('usuarios').delete().eq('id',authId));
  await Promise.allSettled(jobs);
  if(authId) { try { await supabase.auth.admin.deleteUser(authId); } catch(_) {} }
}

async function register(req,res){
  if(!supabase) return send(res,503,{ok:false,error:'Servicio de registro no configurado.'});
  let body={}; try { body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}); } catch(_) { return send(res,400,{ok:false,error:'Solicitud inválida.'}); }
  if(clean(body.website,200)) return send(res,200,{ok:true});
  const nombre=clean(body.nombre,120), comercial=clean(body.nombre_comercial,120)||null, mail=email(body.email), telefono=clean(body.telefono,30)||null, rut=clean(body.rut,16)||null, region=clean(body.region,80)||null, comuna=clean(body.comuna,80)||null, referido=clean(body.referido_por,40)||null, password=String(body.password||''), terms=body.accept_terms===true||body.accept_terms==='true';
  if(nombre.length<3) return send(res,400,{ok:false,error:'Ingresa tu nombre completo.'});
  if(!validEmail(mail)) return send(res,400,{ok:false,error:'Ingresa un correo válido.'});
  if(!validRut(rut)) return send(res,400,{ok:false,error:'El formato del RUT no es válido.'});
  if(password.length<10||password.length>128) return send(res,400,{ok:false,error:'La contraseña debe tener entre 10 y 128 caracteres.'});
  if(!terms) return send(res,400,{ok:false,error:'Debes aceptar las condiciones para crear la cuenta.'});
  let authId=null,codigo=null;
  try{
    const [a,b,c]=await Promise.all([exists('ml_brokers',mail),exists('ml_broker_usuarios',mail),exists('usuarios',mail)]);
    if(a||b||c) return send(res,409,{ok:false,error:'Ese correo ya está registrado. Ingresa con tu cuenta o recupera tu contraseña.'});
    codigo=await code(); const now=new Date().toISOString();
    const auth=await supabase.auth.admin.createUser({email:mail,password,email_confirm:true,user_metadata:{nombre,rol:'broker',broker_codigo:codigo,broker_tipo:'inmobiliario_externo'}});
    if(auth.error) throw auth.error; authId=auth.data.user.id;
    const u=await supabase.from('usuarios').insert({id:authId,nombre,email:mail,rol:'broker',broker_id:codigo,activo:true,plan:'gratis',rut,telefono}); if(u.error) throw u.error;
    const br=await supabase.from('ml_brokers').insert({codigo,nombre,email:mail,telefono,activo:true,nivel:1,referido_por:referido,pais:'cl',tipo:'broker',estado:'pendiente_kyc',rut,terminos_version:TERMS_VERSION,acepto_at:now}); if(br.error) throw br.error;
    const hash=await bcrypt.hash(password,10);
    const lg=await supabase.from('ml_broker_usuarios').insert({email:mail,password_hash:hash,codigo,nombre,rol:'broker',activo:true,permisos:{clientes:true,acciones:true,marketing:true,correos:true},puede_clientes:true,puede_acciones:true,puede_marketing:true,puede_correos:true,rut,telefono,region,nombre_comercial:comercial,profile_completed:false,terminos_version:TERMS_VERSION}); if(lg.error) throw lg.error;
    const pf=await supabase.from('ml_broker_perfiles_admin').insert({codigo,nombre,nombre_comercial:comercial,rut,email:mail,telefono,profesion:'Broker inmobiliario externo',zona:comuna,region,comuna,rol:'broker',estado:'Pendiente KYC',activo:true,puede_crear_clientes:true,puede_editar_clientes:true,puede_ver_comisiones:true,puede_exportar:true,notas_admin:'Autoregistro web. Pendiente completar KYC/perfil profesional.'}); if(pf.error) throw pf.error;
    await supabase.from('ml_broker_admin_auditoria').insert({broker_codigo:codigo,accion:'registro_publico',admin_codigo:null,detalle:{fuente:'web',estado:'pendiente_kyc',terminos_version:TERMS_VERSION}});
    return send(res,201,{ok:true,broker:{codigo,nombre,email:mail,estado:'pendiente_kyc'},next:{action:'login_and_complete_profile',login_url:LOGIN_URL}});
  }catch(e){
    await rollback(authId,codigo);
    const t=String(e&&e.message||'').toLowerCase(),dup=t.includes('duplicate')||t.includes('already')||t.includes('exists')||t.includes('registered');
    return send(res,dup?409:500,{ok:false,error:dup?'Ese correo o código ya está registrado.':'No fue posible completar el registro. Intenta nuevamente.'});
  }
}

module.exports=async(req,res)=>{headers(res);cors(req,res);if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}if(req.method==='GET'){res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(page())}if(req.method==='POST')return register(req,res);res.setHeader('Allow','GET, POST, OPTIONS');return send(res,405,{ok:false,error:'Método no permitido.'})};
