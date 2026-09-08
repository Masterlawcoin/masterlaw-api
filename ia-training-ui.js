const DRIVE = {
  audio: 'https://drive.google.com/drive/folders/1hGjzuFoxbDl2i8mujKfMqQ3H3GM_RfxR',
  docs: 'https://drive.google.com/drive/folders/1ApEXLU353PO2BCei30iIEydeEI64UFS0',
  contracts: 'https://drive.google.com/drive/folders/1m3Mlikc7mFTtnsvXtQ4VnwD8eEdpzLy0',
  panos: 'https://drive.google.com/drive/folders/1da1YhEzpfGJJDighx9l_ZOahfiU6Wr6u'
};

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://*.supabase.in; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MASTERLAW · Entrenamiento IA</title>
<style>
:root{--bg:#080b10;--card:#11151d;--line:#252c39;--txt:#eef2f7;--muted:#8f9aaa;--gold:#d7b66c;--good:#4ade80;--warn:#fbbf24;--bad:#fb7185}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at 8% 0,#171c27 0,#080b10 38%);color:var(--txt)}button,input,textarea{font:inherit}.hidden{display:none!important}
.wrap{max-width:1440px;margin:auto;padding:24px}.login{max-width:460px;margin:11vh auto;padding:18px}.card{background:rgba(17,21,29,.96);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 55px #0004}
.brand{font-weight:900;letter-spacing:.08em}.brand span{color:var(--gold)}h1{margin:4px 0 6px;font-size:28px}h2{font-size:17px;margin:0 0 12px}.muted,small{color:var(--muted)}
.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:22px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}.stat{grid-column:span 3}.stat b{display:block;font-size:30px;margin-top:7px}.main{grid-column:span 8}.side{grid-column:span 4}
.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{border:1px solid var(--line);background:#171d27;color:var(--txt);padding:10px 13px;border-radius:11px;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center}.primary{background:var(--gold);border-color:var(--gold);color:#151108;font-weight:850}.good{border-color:#225f38}
input,textarea{width:100%;border:1px solid var(--line);background:#0b0f15;color:var(--txt);border-radius:11px;padding:11px;margin:7px 0}textarea{min-height:150px;resize:vertical}.err{color:var(--bad);font-size:13px}
.drop{border:1px dashed #4b566a;border-radius:15px;padding:22px;text-align:center;background:#0c1017}.progress{height:7px;background:#202632;border-radius:99px;overflow:hidden;margin-top:10px}.progress i{display:block;width:0;height:100%;background:var(--gold)}
.pill,.tag{border:1px solid var(--line);border-radius:999px;padding:6px 9px;font-size:11px;color:var(--muted)}.tag{padding:4px 7px}.item{padding:12px 0;border-bottom:1px solid var(--line)}.item:last-child{border:0}.item strong{display:block;margin-bottom:4px}
.tabs{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}.tab{padding:8px 11px;border-radius:10px;color:var(--muted);cursor:pointer}.tab.on{background:#1a202b;color:var(--txt)}.scroll{overflow:auto;max-height:520px}.table{width:100%;border-collapse:collapse;font-size:12px}.table td,.table th{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left}.table th{color:var(--muted)}.ok{color:var(--good)}.warn{color:var(--warn)}
@media(max-width:900px){.stat{grid-column:span 6}.main,.side{grid-column:1/-1}}@media(max-width:520px){.wrap{padding:14px}.stat{grid-column:1/-1}.top{align-items:flex-start}}
</style></head>
<body>
<div id="login" class="login"><div class="card">
 <div class="brand">MASTERLAW <span>INTELLIGENCE</span></div><h1>Entrenamiento IA</h1>
 <p class="muted">Centro privado. Acceso exclusivo de administradores autorizados.</p>
 <input id="email" type="email" autocomplete="username" placeholder="Correo ADMIN">
 <input id="password" type="password" autocomplete="current-password" placeholder="Contraseña">
 <button id="loginBtn" class="btn primary">Ingresar</button><div id="loginErr" class="err"></div>
</div></div>

<div id="app" class="wrap hidden">
 <div class="top"><div><div class="brand">MASTERLAW <span>INTELLIGENCE</span></div><h1>Entrenamiento IA / Machine Learning</h1><div class="muted">Información → análisis → revisión ADMIN → conocimiento validado</div></div>
 <div class="actions"><span id="adminBadge" class="pill"></span><button id="logoutBtn" class="btn">Salir</button></div></div>

 <div class="grid">
  <div class="card stat"><small>Fuentes registradas</small><b id="sSources">—</b></div>
  <div class="card stat"><small>Análisis IA</small><b id="sAnalysis">—</b></div>
  <div class="card stat"><small>Conocimiento validado</small><b id="sKnowledge">—</b></div>
  <div class="card stat"><small>Pendientes ADMIN</small><b id="sPending">—</b></div>

  <section class="card main"><h2>Carga y alimentación</h2>
   <div class="drop"><strong>Subir audio/documento privado</strong><div class="muted" style="margin:7px 0 12px">Audios ≤25 MB: transcripción + análisis inmediato. Para lotes grandes, usa Drive.</div>
    <input id="file" type="file" accept="audio/*,.mp3,.m4a,.wav,.amr,.ogg,.aac,.pdf,.doc,.docx,.txt">
    <div id="progress" class="progress hidden"><i id="bar"></i></div><div id="uploadMsg" class="muted"></div>
   </div>
   <div class="actions" style="margin-top:12px">
    <a class="btn primary" href="${DRIVE.audio}" target="_blank" rel="noreferrer">INBOX AUDIOS · Drive</a>
    <a class="btn" href="${DRIVE.docs}" target="_blank" rel="noreferrer">Documentos</a>
    <a class="btn" href="${DRIVE.contracts}" target="_blank" rel="noreferrer">Contratos</a>
    <a class="btn" href="${DRIVE.panos}" target="_blank" rel="noreferrer">Paños</a>
   </div>
  </section>

  <aside class="card side"><h2>Regla de aprendizaje</h2>
   <div class="item"><strong>1 · Ingreso</strong><span class="muted">El material se registra con procedencia.</span></div>
   <div class="item"><strong>2 · IA analiza</strong><span class="muted">Hechos, negociación, riesgos, obligaciones y tareas.</span></div>
   <div class="item"><strong>3 · ADMIN revisa</strong><span class="muted">El análisis no es conocimiento oficial todavía.</span></div>
   <div class="item"><strong>4 · Validación</strong><span class="muted">Solo lo aprobado alimenta conocimiento oficial.</span></div>
  </aside>

  <section class="card main">
   <div class="tabs"><span class="tab on" data-tab="analyses">Revisión IA</span><span class="tab" data-tab="intake">Fuentes</span><span class="tab" data-tab="knowledge">Conocimiento</span><span class="tab" data-tab="manual">Analizar texto</span></div>
   <div id="analyses" class="pane"><div id="analysisList"></div></div>
   <div id="intake" class="pane hidden"><div class="scroll"><table class="table"><thead><tr><th>Archivo</th><th>Clasificación</th><th>Estado</th><th>Fecha</th></tr></thead><tbody id="intakeRows"></tbody></table></div></div>
   <div id="knowledge" class="pane hidden"><div id="knowledgeList"></div></div>
   <div id="manual" class="pane hidden"><input id="manualTitle" placeholder="Título o referencia"><textarea id="manualText" placeholder="Pega minuta, WhatsApp, negociación, transcripción o antecedente..."></textarea><button id="analyzeBtn" class="btn primary">Analizar y enviar a revisión</button><div id="manualMsg" class="muted"></div></div>
  </section>
  <aside class="card side"><h2>Fuentes Drive IA</h2><div id="folderList"></div></aside>
 </div>
</div>

<script>
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
let token=sessionStorage.getItem('ml_admin_token')||'';
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function logout(){token='';sessionStorage.removeItem('ml_admin_token');$('#app').classList.add('hidden');$('#login').classList.remove('hidden')}
async function api(path,opt={}){
 const headers=Object.assign({},opt.headers||{}, {'Content-Type':'application/json'});
 if(token)headers.Authorization='Bearer '+token;
 const r=await fetch(path,Object.assign({},opt,{headers}));let d={};try{d=await r.json()}catch(e){}
 if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;
}
async function login(){
 $('#loginErr').textContent='';
 try{
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})});
  const d=await r.json();if(!r.ok||!d.token)throw new Error(d.error||'Credenciales incorrectas');
  token=d.token;sessionStorage.setItem('ml_admin_token',token);await boot();
 }catch(e){token='';sessionStorage.removeItem('ml_admin_token');$('#loginErr').textContent=e.message}
}
async function boot(){
 const me=await api('/api/ia-training/me');
 $('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#adminBadge').textContent='ADMIN · '+me.admin.email;
 await Promise.all([loadSummary(),loadAnalyses(),loadIntake(),loadKnowledge()]);
}
async function loadSummary(){
 const d=await api('/api/ia-training/summary'),s=d.stats;
 $('#sSources').textContent=s.fuentes_registradas;$('#sAnalysis').textContent=s.analisis_ia;$('#sKnowledge').textContent=s.conocimiento_validado;$('#sPending').textContent=s.pendientes_revision;
 $('#folderList').innerHTML=(d.folders||[]).map(f=>'<div class="item"><strong>'+esc(f.name)+'</strong><span class="muted">'+esc(f.purpose||'')+'</span></div>').join('');
}
async function loadIntake(){
 const d=await api('/api/ia-training/intake?limit=100');
 $('#intakeRows').innerHTML=(d.items||[]).map(x=>'<tr><td>'+esc(x.file_name)+'<br><small>'+esc(x.mime||'')+'</small></td><td>'+esc(x.classification||'—')+'</td><td><span class="tag">'+esc(x.review_status||'—')+'</span></td><td>'+esc((x.created_at||'').slice(0,16).replace('T',' '))+'</td></tr>').join('');
}
async function loadAnalyses(){
 const d=await api('/api/ia-training/analyses?limit=50');
 $('#analysisList').innerHTML=(d.analyses||[]).map(a=>{
  const r=a.respuesta_json||{},g=r._governance||{},approved=Boolean(g.approved_as_knowledge);
  const button=approved?'':'<button class="btn good" data-approve="'+esc(a.id)+'">Aprobar como conocimiento</button>';
  return '<div class="item"><div style="display:flex;justify-content:space-between;gap:10px"><strong>'+esc(g.source_title||r.resumen_ejecutivo||('Análisis '+a.id))+'</strong><span class="tag '+(approved?'ok':'warn')+'">'+(approved?'VALIDADO':'REVISAR')+'</span></div><div class="muted">'+esc(a.area||'OTRO')+' · '+esc(a.modelo||'IA')+'</div><p>'+esc(r.resumen_ejecutivo||'Sin resumen')+'</p>'+button+'</div>';
 }).join('')||'<p class="muted">Aún no hay análisis.</p>';
}
async function approve(id){
 if(!confirm('¿Aprobar este análisis como conocimiento oficial?'))return;
 try{await api('/api/ia-training/analysis/'+encodeURIComponent(id)+'/approve',{method:'POST',body:'{}'});await Promise.all([loadAnalyses(),loadKnowledge(),loadSummary()])}catch(e){alert(e.message)}
}
async function loadKnowledge(){
 const d=await api('/api/ia-training/knowledge?limit=50');
 $('#knowledgeList').innerHTML=(d.knowledge||[]).map(k=>'<div class="item"><strong>'+esc(k.titulo)+'</strong><div class="muted">'+esc(k.area_codigo||'OTRO')+' · '+esc(k.tipo||'')+'</div></div>').join('')||'<p class="muted">Sin conocimiento validado.</p>';
}
async function analyzeManual(){
 const text=$('#manualText').value.trim();if(text.length<20){alert('Agrega más contenido.');return}
 $('#manualMsg').textContent='Analizando…';
 try{await api('/api/ia-training/analyze-text',{method:'POST',body:JSON.stringify({text,title:$('#manualTitle').value.trim(),source_type:'nota'})});$('#manualMsg').textContent='Listo: enviado a revisión ADMIN.';$('#manualText').value='';await Promise.all([loadAnalyses(),loadSummary()])}catch(e){$('#manualMsg').textContent=e.message}
}
async function upload(file){
 const kind=file.type.startsWith('audio/')||/\.(mp3|m4a|wav|amr|ogg|aac)$/i.test(file.name)?'audio':'document';
 $('#progress').classList.remove('hidden');$('#bar').style.width='12%';$('#uploadMsg').textContent='Preparando carga privada…';
 try{
  const u=await api('/api/ia-training/upload-url',{method:'POST',body:JSON.stringify({name:file.name,mime:file.type||'application/octet-stream',kind})});
  $('#bar').style.width='30%';$('#uploadMsg').textContent='Subiendo…';
  const put=await fetch(u.signedUrl,{method:'PUT',headers:{'Content-Type':file.type||u.mime,'x-upsert':'false'},body:file});
  if(!put.ok)throw new Error('Error de carga '+put.status);
  $('#bar').style.width='68%';
  const reg=await api('/api/ia-training/upload-complete',{method:'POST',body:JSON.stringify({path:u.path,name:file.name,mime:file.type||u.mime,bytes:file.size,kind})});
  if(kind==='audio'&&file.size<=25*1024*1024){$('#bar').style.width='80%';$('#uploadMsg').textContent='Transcribiendo y analizando…';await api('/api/ia-training/transcribe',{method:'POST',body:JSON.stringify({external_file_id:reg.intake.external_file_id})});$('#uploadMsg').textContent='Listo. Revisa el análisis antes de aprobar.'}else{$('#uploadMsg').textContent=kind==='audio'?'Audio registrado para cola de procesamiento.':'Documento registrado.'}
  $('#bar').style.width='100%';await Promise.all([loadIntake(),loadAnalyses(),loadSummary()]);
 }catch(e){$('#bar').style.width='0%';$('#uploadMsg').textContent=e.message}
}
$('#loginBtn').onclick=login;$('#password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('#logoutBtn').onclick=logout;$('#analyzeBtn').onclick=analyzeManual;$('#file').onchange=e=>{if(e.target.files[0])upload(e.target.files[0])};
$('#analysisList').addEventListener('click',e=>{const b=e.target.closest('[data-approve]');if(b)approve(b.dataset.approve)});
$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');$$('.pane').forEach(p=>p.classList.add('hidden'));$('#'+t.dataset.tab).classList.remove('hidden')});
if(token)boot().catch(()=>logout());
</script></body></html>`);
};
