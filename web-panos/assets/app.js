const ML={
  apiBase:'https://masterlaw-api.vercel.app',
  staticMenu:[
    {slug:'panos_dashboard',titulo:'Resumen',ruta:'/panos/',orden:10},
    {slug:'panos_listado',titulo:'Paños',ruta:'/panos/panos.html',orden:20},
    {slug:'panos_investigacion',titulo:'Investigación',ruta:'/panos/investigacion.html',orden:30},
    {slug:'panos_vendidos',titulo:'Vendidos y comisiones',ruta:'/panos/vendidos.html',orden:40},
    {slug:'panos_documentos',titulo:'Documentos',ruta:'/panos/documentos.html',orden:50},
    {slug:'panos_historial',titulo:'Historial',ruta:'/panos/historial.html',orden:60}
  ],
  pages:{
    dashboard:{title:'Resumen de Paños',desc:'Visión operativa, comercial y financiera del inventario inmobiliario.'},
    panos:{title:'Paños',desc:'Registro maestro ordenado por estado comercial, propietarios e investigación.'},
    investigacion:{title:'Investigación',desc:'Trabajo pendiente por paño, predio y propietario, priorizado para gestión.'},
    vendidos:{title:'Vendidos y comisiones',desc:'Cierres, GMV, fee pool, facturación, cobro y participación MASTERLAW.'},
    documentos:{title:'Documentos',desc:'Fuentes Drive y documentos vinculados a cada expediente de paño.'},
    historial:{title:'Historial',desc:'Auditoría de investigación, cambios de estado y movimientos del expediente.'},
    detalle:{title:'Ficha del paño',desc:'Paño → predios → propietarios → investigación → documentos → venta → historial.'}
  }
};

const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=v=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(Number(v||0));
const money=v=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(v||0));
const date=v=>v?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(v)):'—';
const pct=v=>`${num(v)}%`;

function token(){
  const qp=new URLSearchParams(location.search).get('token');
  if(qp){localStorage.setItem('masterlaw_token',qp);return qp}
  const keys=['masterlaw_token','token','jwt','auth_token','ml_token'];
  for(const k of keys){const v=localStorage.getItem(k)||sessionStorage.getItem(k);if(v)return v}
  return window.MASTERLAW_TOKEN||'';
}

async function api(path,options={}){
  const t=token();
  if(!t)throw Object.assign(new Error('AUTH_REQUIRED'),{status:401});
  const res=await fetch(`${ML.apiBase}${path}`,{
    ...options,
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${t}`,...(options.headers||{})}
  });
  let body={};try{body=await res.json()}catch{}
  if(!res.ok)throw Object.assign(new Error(body.error||`HTTP ${res.status}`),{status:res.status});
  return body;
}

function currentView(){return document.body.dataset.view||'dashboard'}
function pageInfo(){return ML.pages[currentView()]||ML.pages.dashboard}
function slugForView(){return ({dashboard:'panos_dashboard',panos:'panos_listado',investigacion:'panos_investigacion',vendidos:'panos_vendidos',documentos:'panos_documentos',historial:'panos_historial'})[currentView()]||''}

function authScreen(){
  document.body.innerHTML=`<div class="auth-block"><h2>Acceso MASTERLAW</h2><p>Este módulo usa la sesión privada de MASTERLAW. Inicia sesión y vuelve a Paños.</p><div class="actions"><a class="btn primary" href="/login/">Ir a iniciar sesión</a><button class="btn" onclick="location.reload()">Reintentar</button></div></div>`;
}

function shell(){
  const p=pageInfo();
  document.body.innerHTML=`<div class="ml-shell">
    <aside class="ml-sidebar" id="sidebar"><div class="ml-brand"><strong>MASTERLAW</strong><span>PAÑOS · ERP INMOBILIARIO</span></div><nav class="ml-nav" id="menu"></nav><div class="ml-side-foot">Supabase = dato operativo<br>Drive = documentos y respaldo</div></aside>
    <main class="ml-main"><header class="ml-topbar"><div style="display:flex;gap:10px;align-items:center"><button class="btn mobile-toggle" id="toggle">☰</button><h1>${esc(p.title)}</h1></div><div class="meta">50% del fee pool total · acceso privado</div></header>
    <div class="ml-content"><div class="page-head"><div><h2>${esc(p.title)}</h2><p>${esc(p.desc)}</p></div><div class="actions" id="pageActions"></div></div><div id="content"><div class="loading">Cargando información…</div></div></div></main>
  </div>`;
  $('#toggle')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));
}

async function menu(){
  let rows=ML.staticMenu;
  try{const r=await api('/api/panos/web/menu');if(r.menu?.length)rows=r.menu}catch{}
  const active=slugForView();
  $('#menu').innerHTML=rows.sort((a,b)=>a.orden-b.orden).map(x=>`<a href="${esc(x.ruta)}" class="${x.slug===active?'active':''}"><span class="dot"></span>${esc(x.titulo)}</a>`).join('');
}

function badge(text,type=''){return `<span class="badge ${type}">${esc(text||'—')}</span>`}
function stateBadge(row){
  const s=String(row.estado||'').toLowerCase();
  const type=s==='vendido'||s==='confirmado'?'success':s==='promesado'||s==='a_confirmar'?'info':s==='no_disponible'?'danger':'warn';
  return badge(row.estado_label||row.estado||'Sin estado',type)
}
function financeBadge(v){
  const s=String(v||'').toLowerCase();
  const type=s.includes('cobrado')||s.includes('cerrado')?'success':s.includes('pendiente')?'warn':'info';
  return badge((v||'—').replaceAll('_',' '),type)
}
function card(label,value,sub=''){return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>`}
function empty(msg){return `<div class="empty">${esc(msg)}</div>`}
function err(e){return `<div class="notice error"><strong>No se pudo cargar.</strong> ${esc(e.message||e)}</div>`}
function openPano(id){location.href=`/panos/pano.html?id=${encodeURIComponent(id)}`}
window.openPano=openPano;

async function dashboard(){
  try{
    const {resumen}=await api('/api/panos/resumen');
    const op=resumen.operacion||{};const v=resumen.ventas||{};
    $('#content').innerHTML=`
      <div class="grid kpi-grid">
        ${card('Paños activos / registro',num(op.total_panos),'inventario canónico y revisión')}
        ${card('Superficie registrada',`${num(op.m2_total)} m²`,'suma operacional')}
        ${card('Predios activos',num(op.predios_activos),'predios asociados')}
        ${card('Ventas reportadas',num(v.ventas_reportadas),'precios finales: '+num(v.precios_confirmados||0))}
        ${card('GMV KPI',money(v.gmv_kpi_clp),'base confirmada o referencial')}
      </div>
      <div class="grid section-grid">
        <section class="card"><div class="card-head"><h3>Pipeline por estado comercial</h3><a class="btn" href="/panos/panos.html">Abrir listado</a></div><div class="card-body">${stateList(op.por_estado||{})}</div></section>
        <section class="card financial"><div class="card-head"><h3>MASTERLAW · ventas</h3>${badge('50% fee pool')}</div><div class="card-body">
          <div class="metric"><small>Ingreso neto KPI</small><strong>${money(v.masterlaw_neto_clp)}</strong></div>
          <div class="metric"><small>Ingreso bruto c/IVA</small><strong>${money(v.masterlaw_bruto_clp)}</strong></div>
          <div class="metric"><small>Pendiente de cobro</small><strong>${money(v.masterlaw_pendiente_cobro_clp)}</strong></div>
          <div class="metric"><small>Take rate neto</small><strong>${pct(Number(v.masterlaw_take_rate_neto||0)*100)}</strong></div>
          <div class="metric"><small>Participación fee pool</small><strong>${pct(Number(v.masterlaw_share_fee_pool||0)*100)}</strong></div>
          <div class="metric"><small>Ticket medio</small><strong>${money(v.ticket_medio_clp)}</strong></div>
        </div></section>
      </div>
      <div class="notice warn" style="margin-top:14px">Los precios de venta no confirmados siguen visibles como referencia, pero no se convierten en precio escriturado hasta cargar respaldo final.</div>`;
  }catch(e){$('#content').innerHTML=err(e)}
}

function stateList(obj){
  const entries=Object.entries(obj);const max=Math.max(1,...entries.map(([,v])=>Number(v||0)));
  return `<div class="state-list">${entries.map(([k,v])=>`<div class="state-row"><div><strong>${esc(k.replaceAll('_',' ').toUpperCase())}</strong><div class="progress"><i style="width:${Math.max(2,Number(v||0)/max*100)}%"></i></div></div><span>${num(v)}</span></div>`).join('')}</div>`;
}

function toolbar(extra=''){
  return `<div class="toolbar"><div class="field"><input id="q" placeholder="Buscar nombre, dirección, comuna o código"></div><div class="field small"><select id="estado"><option value="">Todos los estados</option><option value="promesado">Promesado</option><option value="confirmado">Confirmado</option><option value="a_confirmar">A confirmar</option><option value="a_contactar">A contactar</option><option value="investigar">Investigar</option><option value="incompleto">Incompleto</option><option value="no_disponible">No disponible</option><option value="vendido">Vendido</option></select></div>${extra}<button class="btn primary" id="buscar">Filtrar</button></div>`;
}

async function panos(mode='all'){
  const isInv=mode==='investigacion';
  $('#content').innerHTML=toolbar()+`<div class="card"><div id="rows" class="loading">Cargando paños…</div></div>`;
  const load=async()=>{
    try{
      const q=$('#q').value.trim();const est=$('#estado').value;
      const sp=new URLSearchParams({limit:'500'});if(q)sp.set('q',q);if(est)sp.set('estado',est);
      const r=await api(`/api/panos?${sp}`);let rows=r.panos||[];
      if(isInv)rows=rows.filter(x=>x.estado==='investigar'||x.persona_estado_prioritario==='investigar'||x.etapa_investigacion_slug);
      $('#rows').className='table-wrap';
      $('#rows').innerHTML=rows.length?`<table class="data-table"><thead><tr><th>Paño</th><th>Comuna</th><th>Estado</th><th>Propietarios</th><th>Investigación</th><th class="num">m²</th><th class="num">Predios</th><th>Finanzas</th></tr></thead><tbody>${rows.map(r=>`<tr onclick="openPano(${Number(r.id)})" style="cursor:pointer"><td><div class="name">${esc(r.nombre||'Sin nombre')}</div><div class="minor">#${esc(r.id)} · ${esc(r.codigo||r.direccion||'')}</div></td><td>${esc(r.comuna||'—')}</td><td>${stateBadge(r)}</td><td>${badge(r.persona_estado_prioritario_label||r.persona_estado_prioritario||'sin personas',r.persona_estado_prioritario==='confirmado'?'success':'warn')}<div class="minor">${num(r.personas_unicas)} personas</div></td><td>${r.etapa_investigacion_label?badge(r.etapa_investigacion_label,'info'):'—'}</td><td class="num">${num(r.m2_total)}</td><td class="num">${num(r.predios_activos)}</td><td>${r.venta_id?`${financeBadge(r.venta_estado_financiero)}<div class="minor">${esc(r.venta_comprador||'')}</div>`:'—'}</td></tr>`).join('')}</tbody></table>`:empty(isInv?'No hay paños con investigación pendiente para este filtro.':'No hay paños para este filtro.');
    }catch(e){$('#rows').className='';$('#rows').innerHTML=err(e)}
  };
  $('#buscar').onclick=load;$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')load()});await load();
}

async function vendidos(){
  try{
    const [vr,sr]=await Promise.all([api('/api/panos/ventas?limit=300'),api('/api/panos/ventas/resumen')]);
    const rows=vr.ventas||[];const s=sr.resumen||{};
    $('#content').innerHTML=`<div class="grid kpi-grid">
      ${card('Ventas',num(s.ventas_reportadas),'cierres reportados')}${card('GMV KPI',money(s.gmv_kpi_clp),'confirmado o referencial')}${card('Fee pool neto',money(s.comision_total_neta_clp),'ambos lados')}${card('MASTERLAW neto',money(s.masterlaw_neto_clp),'50% del fee pool')}${card('Pendiente cobro',money(s.masterlaw_pendiente_cobro_clp),'MASTERLAW bruto pendiente')}
    </div><div class="notice warn" style="margin-bottom:14px">Regla operativa: MASTERLAW recibe 50% del fee pool total. Un precio de referencia no se considera precio final hasta quedar confirmado con respaldo.</div>
    <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Paño / operación</th><th>Comprador</th><th class="num">m²</th><th class="num">Base KPI</th><th class="num">Fee pool neto</th><th class="num">MASTERLAW neto</th><th class="num">MASTERLAW bruto</th><th>Precio</th><th>Finanzas</th></tr></thead><tbody>${rows.map(v=>`<tr onclick="openPano(${Number(v.pano_id)})" style="cursor:pointer"><td><div class="name">${esc(v.deal_key||`Paño ${v.pano_id}`)}</div><div class="minor">Paño #${esc(v.pano_id)} · ${date(v.fecha_venta||v.fecha_reporte)}</div></td><td>${esc(v.comprador_marca||'—')}</td><td class="num">${num(v.m2_reportado||v.m2_canonico)}</td><td class="num">${money(v.base_kpi_clp)}</td><td class="num">${money(v.comision_total_neta_clp)}</td><td class="num"><strong>${money(v.masterlaw_neto_clp)}</strong></td><td class="num">${money(v.masterlaw_bruto_clp)}</td><td>${v.precio_confirmado?badge('Confirmado','success'):badge('Referencia','warn')}</td><td>${financeBadge(v.estado_financiero)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }catch(e){$('#content').innerHTML=err(e)}
}

async function selectorPage(type){
  $('#content').innerHTML=`<div class="notice">Selecciona un paño para revisar ${type==='documentos'?'sus fuentes y documentos Drive':'su historial y auditoría'}.</div><div style="height:12px"></div>`+toolbar()+`<div class="card"><div id="rows" class="loading">Cargando paños…</div></div>`;
  const load=async()=>{
    try{
      const q=$('#q').value.trim(),est=$('#estado').value;const sp=new URLSearchParams({limit:'500'});if(q)sp.set('q',q);if(est)sp.set('estado',est);
      const r=await api(`/api/panos?${sp}`);const rows=r.panos||[];
      $('#rows').className='table-wrap';$('#rows').innerHTML=rows.length?`<table class="data-table"><thead><tr><th>Paño</th><th>Comuna</th><th>Estado</th><th class="num">Predios</th><th class="num">Personas</th><th>Acción</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="name">${esc(x.nombre||'Sin nombre')}</div><div class="minor">#${x.id} · ${esc(x.direccion||'')}</div></td><td>${esc(x.comuna||'—')}</td><td>${stateBadge(x)}</td><td class="num">${num(x.predios_activos)}</td><td class="num">${num(x.personas_unicas)}</td><td><a class="btn" href="/panos/pano.html?id=${x.id}#${type}">Abrir ${type}</a></td></tr>`).join('')}</tbody></table>`:empty('Sin resultados');
    }catch(e){$('#rows').innerHTML=err(e)}
  };$('#buscar').onclick=load;$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')load()});await load();
}

async function detalle(){
  const id=Number(new URLSearchParams(location.search).get('id'));
  if(!id){$('#content').innerHTML=err(new Error('Falta id de paño'));return}
  try{
    const panoR=await api(`/api/panos/${id}`);const p=panoR.pano||{};
    const jobs=[api(`/api/panos/${id}/personas`).catch(()=>({predios:[],personas:[]})),api(`/api/panos/${id}/documentos`).catch(()=>({documentos:[]})),api(`/api/panos/${id}/historial`).catch(()=>({historial:[]})),p.venta_id?api(`/api/panos/${id}/venta`).catch(()=>({venta:null,movimientos:[]})):Promise.resolve({venta:null,movimientos:[]})];
    const [people,docs,hist,sale]=await Promise.all(jobs);
    $('#content').innerHTML=`
      <div class="grid kpi-grid">${card('Estado',stateBadge(p))}${card('Superficie',`${num(p.m2_total)} m²`)}${card('Predios',num(p.predios_activos))}${card('Personas',num(p.personas_unicas))}${card('Completitud',`${num(p.completitud)}%`)}</div>
      <div class="grid detail-grid">
        <section class="card"><div class="card-head"><h3>Paño</h3><span>#${id}</span></div><div class="card-body"><dl class="detail-list"><dt>Nombre</dt><dd>${esc(p.nombre||'—')}</dd><dt>Dirección</dt><dd>${esc(p.direccion||'—')}</dd><dt>Comuna</dt><dd>${esc(p.comuna||'—')}</dd><dt>Región</dt><dd>${esc(p.region||'—')}</dd><dt>UF/m²</dt><dd>${num(p.uf_m2)}</dd><dt>Total UF</dt><dd>${num(p.total_uf)}</dd><dt>Precio pesos</dt><dd>${money(p.precio_pesos)}</dd><dt>Estado histórico 2019</dt><dd>${esc(p.estado_historico_2019_label||p.estado_historico_2019||'—')}</dd></dl></div></section>
        <section class="card"><div class="card-head"><h3>Trabajo actual</h3></div><div class="card-body"><dl class="detail-list"><dt>Propietarios</dt><dd>${esc(p.persona_estado_prioritario_label||p.persona_estado_prioritario||'—')}</dd><dt>Etapa</dt><dd>${esc(p.etapa_investigacion_label||'—')}</dd><dt>Último resultado</dt><dd>${esc(p.investigacion_resultado||'—')}</dd><dt>Evolución 2019</dt><dd>${esc(p.evolucion_desde_2019||'—')}</dd><dt>Última actualización</dt><dd>${date(p.updated_at)}</dd></dl></div></section>
      </div>
      ${saleSection(sale.venta||null,p)}
      <div class="grid detail-grid" style="margin-top:14px">
        <section class="card" id="predios"><div class="card-head"><h3>Predios</h3><span>${people.predios?.length||0}</span></div><div class="card-body">${prediosHtml(people.predios||[])}</div></section>
        <section class="card" id="propietarios"><div class="card-head"><h3>Propietarios / personas</h3><span>${people.personas?.length||0}</span></div><div class="card-body">${personasHtml(people.personas||[])}</div></section>
      </div>
      <section class="card" id="documentos" style="margin-top:14px"><div class="card-head"><h3>Documentos y fuentes</h3><span>${docs.documentos?.length||0}</span></div><div class="card-body">${docsHtml(docs.documentos||[])}</div></section>
      <section class="card" id="historial" style="margin-top:14px"><div class="card-head"><h3>Historial y auditoría</h3><span>${hist.historial?.length||0}</span></div><div class="card-body">${histHtml(hist.historial||[])}</div></section>`;
  }catch(e){$('#content').innerHTML=err(e)}
}

function saleSection(v,p){if(!v&&!p.venta_id)return'';const x=v||p;return `<section class="card financial" id="venta" style="margin-top:14px"><div class="card-head"><h3>Venta y comisión</h3>${financeBadge(x.estado_financiero||p.venta_estado_financiero)}</div><div class="card-body"><div class="metric"><small>Comprador</small><strong>${esc(x.comprador_marca||p.venta_comprador||'—')}</strong></div><div class="metric"><small>Base KPI</small><strong>${money(x.base_kpi_clp||p.venta_base_kpi_clp)}</strong></div><div class="metric"><small>MASTERLAW neto</small><strong>${money(x.masterlaw_neto_clp||p.venta_masterlaw_neto_clp)}</strong></div><div class="metric"><small>MASTERLAW bruto</small><strong>${money(x.masterlaw_bruto_clp||p.venta_masterlaw_bruto_clp)}</strong></div><div class="metric"><small>Pendiente cobro</small><strong>${money(x.masterlaw_pendiente_cobro_clp||p.venta_pendiente_cobro_clp)}</strong></div><div class="metric"><small>Precio final</small><strong>${(x.precio_confirmado||p.venta_precio_confirmado)?'CONFIRMADO':'REFERENCIAL'}</strong></div></div></section>`}
function prediosHtml(rows){return rows.length?`<div class="table-wrap"><table class="data-table" style="min-width:620px"><thead><tr><th>Dirección</th><th>Rol</th><th class="num">m²</th><th>Incluido</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.direccion||'—')}</td><td>${esc(x.rol_sii||'—')}</td><td class="num">${num(x.m2)}</td><td>${x.incluido_en_pano===false?badge('No','warn'):badge('Sí','success')}</td></tr>`).join('')}</tbody></table></div>`:empty('Sin predios asociados')}
function personasHtml(rows){return rows.length?`<div class="stack">${rows.map(x=>`<div><div class="strong">${esc(x.nombre||'Sin nombre')} ${badge(x.estado||'sin estado',x.estado==='confirmado'?'success':'warn')}</div><div class="muted" style="font-size:12px;margin-top:4px">${esc(x.rut||'')} ${esc(x.email||'')} ${Array.isArray(x.telefonos)?esc(x.telefonos.join(' · ')):esc(x.telefonos||'')}</div></div>`).join('')}</div>`:empty('Sin propietarios/personas cargados')}
function docsHtml(rows){return rows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Archivo / fuente</th><th>Hoja / fila</th><th>Match</th><th>Confianza</th><th>Drive</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="name">${esc(x.fuente_archivo||'Fuente')}</div><div class="minor">${esc(x.nota||'')}</div></td><td>${esc(x.fuente_hoja||'—')} ${x.fuente_fila?`· fila ${x.fuente_fila}`:''}</td><td>${badge(x.match_status||'—','info')}</td><td>${x.match_confidence??'—'}</td><td>${x.drive_item_id?`<a class="btn" target="_blank" rel="noopener" href="https://drive.google.com/open?id=${encodeURIComponent(x.drive_item_id)}">Abrir</a>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('No hay fuentes registradas para este paño')}
function histHtml(rows){return rows.length?`<div class="timeline">${rows.map(x=>`<div class="event"><strong>${esc((x.tipo||x.etapa_slug||'Evento').replaceAll('_',' '))}</strong>${x.estado_anterior||x.estado_nuevo?` ${badge(`${x.estado_anterior||'—'} → ${x.estado_nuevo||'—'}`,'info')}`:''}<p>${esc(x.resultado||'Sin detalle')}</p><time>${date(x.creado)} · ${esc(x.agente||'sistema')}</time></div>`).join('')}</div>`:empty('Sin eventos registrados')}

async function init(){
  if(!token()){authScreen();return}
  shell();await menu();
  const view=currentView();
  if(view==='dashboard')return dashboard();
  if(view==='panos')return panos('all');
  if(view==='investigacion')return panos('investigacion');
  if(view==='vendidos')return vendidos();
  if(view==='documentos')return selectorPage('documentos');
  if(view==='historial')return selectorPage('historial');
  if(view==='detalle')return detalle();
  return dashboard();
}

document.addEventListener('DOMContentLoaded',init);
