require('dotenv').config();

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { toFile } = require('openai');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.CLAVE_API_DE_OPENAI;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || process.env.CLAVE_API_DE_DEEPSEEK;
const supabase = createClient(SUPABASE_URL || 'https://invalid.local', SUPABASE_KEY || 'missing');
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const deepseek = DEEPSEEK_KEY ? new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: DEEPSEEK_KEY }) : null;

const PROJECT_ID = '94fcd6cf-0111-49e7-8109-0bc9a97c6f85';
const IA_BUCKET = 'ia';
const DRIVE = {
  root: { id: '1cJDWcJacd-FSCqulQavqKS61-k-PE7o_', name: 'MASTERLAW - ENTRENAMIENTO IA', url: 'https://drive.google.com/drive/folders/1cJDWcJacd-FSCqulQavqKS61-k-PE7o_' },
  audio: { id: '1hGjzuFoxbDl2i8mujKfMqQ3H3GM_RfxR', name: '00_INBOX_AUDIOS', url: 'https://drive.google.com/drive/folders/1hGjzuFoxbDl2i8mujKfMqQ3H3GM_RfxR' },
  docs: { id: '1ApEXLU353PO2BCei30iIEydeEI64UFS0', name: '01_INBOX_DOCUMENTOS', url: 'https://drive.google.com/drive/folders/1ApEXLU353PO2BCei30iIEydeEI64UFS0' },
  contracts: { id: '1m3Mlikc7mFTtnsvXtQ4VnwD8eEdpzLy0', name: '02_CONTRATOS', url: 'https://drive.google.com/drive/folders/1m3Mlikc7mFTtnsvXtQ4VnwD8eEdpzLy0' },
  panos: { id: '1da1YhEzpfGJJDighx9l_ZOahfiU6Wr6u', name: '03_PROPIEDADES_Y_PANOS', url: 'https://drive.google.com/drive/folders/1da1YhEzpfGJJDighx9l_ZOahfiU6Wr6u' },
  knowledge: { id: '1PRfvMGOUSXuf7bhPnue_nKvvGQIAN5ak', name: '04_CONOCIMIENTO_VALIDADO', url: 'https://drive.google.com/drive/folders/1PRfvMGOUSXuf7bhPnue_nKvvGQIAN5ak' },
  reports: { id: '1381agr3HaKu86ZlQhTfnUSt5YFE1Tzjx', name: '05_REPORTES_IA', url: 'https://drive.google.com/drive/folders/1381agr3HaKu86ZlQhTfnUSt5YFE1Tzjx' },
  models: { id: '189cd6QdIvKm5v3uUscOmJFVM4Ad61b6H', name: '06_MODELOS_Y_DATASETS', url: 'https://drive.google.com/drive/folders/189cd6QdIvKm5v3uUscOmJFVM4Ad61b6H' }
};

function fail(res, status, error) { return res.status(status).json({ ok: false, error }); }
function bearer(req) { return (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }
function safeName(name = 'archivo') {
  return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 140) || 'archivo';
}

async function adminRequired(req, res, next) {
  if (!JWT_SECRET) return fail(res, 503, 'Configuración de autenticación incompleta');
  const token = bearer(req);
  if (!token) return fail(res, 401, 'Autenticación requerida');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.email) return fail(res, 401, 'Token inválido');
    const email = String(payload.email).toLowerCase();
    const { data: identity } = await supabase.from('ml_identidad_roles').select('id,email,rol,activo').eq('email', email).eq('rol', 'admin').eq('activo', true).limit(1).maybeSingle();
    let isAdmin = !!identity;
    if (!isAdmin && payload.id) {
      const { data: u } = await supabase.from('usuarios').select('id,email,rol,activo').eq('id', payload.id).limit(1).maybeSingle();
      isAdmin = !!u && u.rol === 'admin' && u.activo !== false;
    }
    if (!isAdmin) return fail(res, 403, 'Acceso exclusivo ADMIN');
    req.admin = { id: payload.id || identity?.id, email };
    next();
  } catch (_) { return fail(res, 401, 'Sesión inválida o vencida'); }
}

async function audit(actor, action, entityType, entityId, afterData = {}, metadata = {}) {
  try { await supabase.from('ml_intel_audit_log').insert({ project_id: PROJECT_ID, actor, action, entity_type: entityType, entity_id: entityId ? String(entityId) : null, before_data: null, after_data: afterData, metadata }); } catch (_) {}
}

function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return { resumen_ejecutivo: t };
}

async function analyzeWithAI(text, context = {}) {
  const prompt = `Eres el motor privado de inteligencia empresarial de MASTERLAW (Chile). Analiza información de empresa, negociación inmobiliaria, contratos, operaciones y documentación. NO inventes hechos. Separa hechos explícitos de inferencias. Devuelve SOLO JSON válido con esta estructura: {"area_principal":"INMOBILIARIO|JURIDICO|COMERCIAL|OPERACIONES|FINANZAS|ADMINISTRACION|TECNOLOGIA|MARKETING|OTRO","tipo_fuente":"audio|documento|contrato|nota|otro","resumen_ejecutivo":"","hechos":[{"hecho":"","evidencia":"","confianza":0}],"personas_entidades":[{"nombre":"","rol":"","confianza":0}],"negociacion":{"existe":false,"etapa":"","precio_pedido":null,"oferta":null,"moneda":"","brecha_pct":null,"objeciones":[],"decisores_pendientes":[],"proxima_accion_recomendada":""},"contratos_obligaciones":[],"riesgos":[{"riesgo":"","nivel":"bajo|medio|alto","fundamento":""}],"decisiones_compromisos":[],"tareas_sugeridas":[{"tarea":"","prioridad":"baja|media|alta","responsable_sugerido":"","fecha_mencionada":null}],"tags_entrenamiento":[],"confianza_global":0,"requiere_revision_admin":true}. Contexto: ${JSON.stringify(context)}. Contenido: ${String(text).slice(0, 90000)}`;
  const messages = [{ role: 'system', content: 'Responde estrictamente en JSON. No inventes datos ausentes.' }, { role: 'user', content: prompt }];
  let raw = '', model = null;
  if (openai) {
    model = process.env.IA_ANALYSIS_MODEL || 'gpt-4o-mini';
    try { const r = await openai.chat.completions.create({ model, temperature: 0.1, response_format: { type: 'json_object' }, messages }); raw = r.choices?.[0]?.message?.content || ''; } catch (_) { raw = ''; }
  }
  if (!raw && deepseek) {
    model = process.env.IA_DEEPSEEK_MODEL || 'deepseek-chat';
    const r = await deepseek.chat.completions.create({ model, temperature: 0.1, messages });
    raw = r.choices?.[0]?.message?.content || '';
  }
  if (!raw) throw new Error('No hay proveedor IA disponible');
  return { model, result: extractJson(raw) };
}

app.get('/api/ia-training/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, module: 'MASTERLAW Entrenamiento IA', admin_only: true, version: '4.0.0', database: !!SUPABASE_URL, ai: { openai: !!OPENAI_KEY, deepseek: !!DEEPSEEK_KEY }, drive_root_configured: true });
});
app.get('/api/ia-training/me', adminRequired, (req, res) => res.json({ ok: true, admin: req.admin }));

app.get('/api/ia-training/summary', adminRequired, async (req, res) => {
  try {
    const [intake, knowledge, analyses, chunks, pending, folders] = await Promise.all([
      supabase.from('ml_masterlaw_drive_intake').select('*', { count: 'exact', head: true }),
      supabase.from('ml_conocimiento_empresa').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('ml_ia_analisis').select('*', { count: 'exact', head: true }),
      supabase.from('ml_intel_chunks').select('*', { count: 'exact', head: true }),
      supabase.from('ml_masterlaw_drive_intake').select('*', { count: 'exact', head: true }).neq('review_status', 'approved'),
      supabase.from('ml_intel_external_folders').select('folder_code,name,external_url,status,purpose').like('folder_code', 'IA_%').order('folder_code')
    ]);
    res.json({ ok: true, stats: { fuentes_registradas: intake.count || 0, conocimiento_validado: knowledge.count || 0, analisis_ia: analyses.count || 0, fragmentos_indexados: chunks.count || 0, pendientes_revision: pending.count || 0 }, drive: DRIVE, folders: folders.data || [] });
  } catch (e) { fail(res, 500, e.message); }
});

app.get('/api/ia-training/intake', adminRequired, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 80), 200);
  const { data, error } = await supabase.from('ml_masterlaw_drive_intake').select('external_file_id,external_url,file_name,mime,bytes,source_parent_folder_id,source_batch,decision,classification,sensitivity,reason,classifier_result,review_status,reviewed_by,reviewed_at,metadata,created_at,updated_at').order('created_at', { ascending: false }).limit(limit);
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true, items: data || [] });
});

app.get('/api/ia-training/analyses', adminRequired, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 60), 150);
  const { data, error } = await supabase.from('ml_ia_analisis').select('id,created_at,caso_id,modelo,respuesta_json,solicitud_id,area').order('created_at', { ascending: false }).limit(limit);
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true, analyses: data || [] });
});

app.get('/api/ia-training/knowledge', adminRequired, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 60), 150);
  const { data, error } = await supabase.from('ml_conocimiento_empresa').select('id,area_codigo,tipo,titulo,contenido,prioridad,metadata,activo,created_at,updated_at').eq('activo', true).order('updated_at', { ascending: false }).limit(limit);
  if (error) return fail(res, 500, error.message);
  res.json({ ok: true, knowledge: data || [] });
});

app.post('/api/ia-training/analyze-text', adminRequired, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (text.length < 20) return fail(res, 400, 'Falta contenido suficiente para analizar');
  if (text.length > 100000) return fail(res, 413, 'Contenido demasiado extenso');
  try {
    const context = { source_type: req.body?.source_type || 'nota', title: req.body?.title || null, source_id: req.body?.source_id || null, admin: req.admin.email };
    const ai = await analyzeWithAI(text, context);
    const payload = { ...ai.result, _governance: { review_status: 'pending_admin_review', approved_as_knowledge: false, source_title: context.title, source_id: context.source_id, created_by: req.admin.email } };
    const { data, error } = await supabase.from('ml_ia_analisis').insert({ modelo: ai.model, respuesta_json: payload, area: ai.result.area_principal || 'OTRO' }).select().single();
    if (error) return fail(res, 500, error.message);
    await audit(req.admin.email, 'ia.analysis.created', 'ml_ia_analisis', data.id, payload, { module: 'training' });
    res.json({ ok: true, analysis: data });
  } catch (e) { fail(res, 500, e.message); }
});

app.post('/api/ia-training/analysis/:id/approve', adminRequired, async (req, res) => {
  try {
    const { data: analysis, error } = await supabase.from('ml_ia_analisis').select('*').eq('id', req.params.id).single();
    if (error || !analysis) return fail(res, 404, 'Análisis no encontrado');
    const r = analysis.respuesta_json || {}, g = r._governance || {};
    if (g.approved_as_knowledge) return fail(res, 409, 'Este análisis ya fue aprobado');
    const title = String(req.body?.title || g.source_title || r.resumen_ejecutivo || `Análisis ${analysis.id}`).slice(0, 250);
    const content = JSON.stringify({ resumen_ejecutivo: r.resumen_ejecutivo, hechos: r.hechos || [], negociacion: r.negociacion || {}, contratos_obligaciones: r.contratos_obligaciones || [], riesgos: r.riesgos || [], decisiones_compromisos: r.decisiones_compromisos || [], tareas_sugeridas: r.tareas_sugeridas || [], tags_entrenamiento: r.tags_entrenamiento || [] }, null, 2);
    const { data: knowledge, error: ke } = await supabase.from('ml_conocimiento_empresa').insert({ area_codigo: r.area_principal || analysis.area || 'OTRO', tipo: req.body?.tipo || r.tipo_fuente || 'analisis_ia', titulo: title, contenido: content, prioridad: Number(req.body?.prioridad || 3), metadata: { provenance: 'ml_ia_analisis', analysis_id: analysis.id, approved_by: req.admin.email, approved_at: new Date().toISOString(), model: analysis.modelo, confidence: r.confianza_global ?? null, source_id: g.source_id || null }, activo: true }).select().single();
    if (ke) return fail(res, 500, ke.message);
    r._governance = { ...g, review_status: 'approved_by_admin', approved_as_knowledge: true, knowledge_id: knowledge.id, approved_by: req.admin.email, approved_at: new Date().toISOString() };
    await supabase.from('ml_ia_analisis').update({ respuesta_json: r }).eq('id', analysis.id);
    await audit(req.admin.email, 'ia.analysis.approved', 'ml_conocimiento_empresa', knowledge.id, knowledge, { analysis_id: analysis.id });
    res.json({ ok: true, knowledge });
  } catch (e) { fail(res, 500, e.message); }
});

app.post('/api/ia-training/upload-url', adminRequired, async (req, res) => {
  const name = safeName(req.body?.name || 'audio.bin');
  const mime = String(req.body?.mime || 'application/octet-stream').slice(0, 150);
  const kind = String(req.body?.kind || 'audio').toLowerCase() === 'document' ? 'document' : 'audio';
  const path = `training/${kind}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${name}`;
  try {
    const { data, error } = await supabase.storage.from(IA_BUCKET).createSignedUploadUrl(path);
    if (error) return fail(res, 500, error.message);
    await audit(req.admin.email, 'ia.upload_url.created', 'storage_object', path, { bucket: IA_BUCKET, mime, kind });
    res.json({ ok: true, bucket: IA_BUCKET, path, token: data.token, signedUrl: data.signedUrl, mime, kind });
  } catch (e) { fail(res, 500, e.message); }
});

app.post('/api/ia-training/upload-complete', adminRequired, async (req, res) => {
  const path = String(req.body?.path || '');
  if (!path.startsWith('training/')) return fail(res, 400, 'Ruta de carga inválida');
  const name = safeName(req.body?.name || path.split('/').pop() || 'archivo');
  const mime = String(req.body?.mime || 'application/octet-stream');
  const bytes = Number(req.body?.bytes || 0) || null;
  const kind = req.body?.kind === 'document' ? 'document' : 'audio';
  const externalId = `supabase:${IA_BUCKET}:${path}`;
  try {
    const { data, error } = await supabase.from('ml_masterlaw_drive_intake').upsert({ external_file_id: externalId, external_url: null, file_name: name, mime, bytes, source_parent_folder_id: kind === 'document' ? DRIVE.docs.id : DRIVE.audio.id, source_batch: 'admin_training_web', decision: 'include', classification: kind === 'document' ? 'documento_pendiente_analisis' : 'audio_pendiente_transcripcion', sensitivity: 'restricted', reason: 'Carga privada desde módulo Entrenamiento IA', classifier_result: {}, review_status: 'pending', metadata: { storage_bucket: IA_BUCKET, storage_path: path, upload_source: 'training_web', admin_only: true } }, { onConflict: 'external_file_id' }).select().single();
    if (error) return fail(res, 500, error.message);
    await audit(req.admin.email, 'ia.upload.completed', 'ml_masterlaw_drive_intake', externalId, data, { path });
    res.json({ ok: true, intake: data });
  } catch (e) { fail(res, 500, e.message); }
});

app.post('/api/ia-training/transcribe', adminRequired, async (req, res) => {
  if (!openai) return fail(res, 503, 'Transcripción OpenAI no configurada');
  const externalId = String(req.body?.external_file_id || '');
  if (!externalId.startsWith(`supabase:${IA_BUCKET}:`)) return fail(res, 400, 'Los archivos de Drive entran por el sincronizador; esta ruta procesa carga privada directa');
  const path = externalId.slice(`supabase:${IA_BUCKET}:`.length);
  try {
    const { data: row, error: re } = await supabase.from('ml_masterlaw_drive_intake').select('*').eq('external_file_id', externalId).single();
    if (re || !row) return fail(res, 404, 'Archivo no registrado');
    if ((row.bytes || 0) > 25 * 1024 * 1024) return fail(res, 413, 'Para transcripción inmediata usa audios de hasta 25 MB; los mayores pasan a cola');
    const { data: blob, error: de } = await supabase.storage.from(IA_BUCKET).download(path);
    if (de) return fail(res, 500, de.message);
    const buf = Buffer.from(await blob.arrayBuffer());
    const file = await toFile(buf, row.file_name || 'audio', { type: row.mime || 'audio/mpeg' });
    const transcribeModel = process.env.IA_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
    const tr = await openai.audio.transcriptions.create({ file, model: transcribeModel });
    const transcript = String(tr.text || '').trim();
    if (!transcript) return fail(res, 422, 'No se obtuvo transcripción');
    const ai = await analyzeWithAI(transcript, { source_type: 'audio', title: row.file_name, source_id: externalId, source: 'private_upload' });
    const result = { ...ai.result, transcript, _governance: { review_status: 'pending_admin_review', approved_as_knowledge: false, source_title: row.file_name, source_id: externalId, created_by: req.admin.email } };
    const { data: analysis, error: ae } = await supabase.from('ml_ia_analisis').insert({ modelo: `${transcribeModel} + ${ai.model}`, respuesta_json: result, area: ai.result.area_principal || 'OTRO' }).select().single();
    if (ae) return fail(res, 500, ae.message);
    await supabase.from('ml_masterlaw_drive_intake').update({ classification: 'audio_transcrito_analizado', classifier_result: { analysis_id: analysis.id, area: ai.result.area_principal, confidence: ai.result.confianza_global }, review_status: 'pending', metadata: { ...(row.metadata || {}), transcription_model: transcribeModel, analysis_id: analysis.id } }).eq('external_file_id', externalId);
    await audit(req.admin.email, 'ia.audio.transcribed_analyzed', 'ml_ia_analisis', analysis.id, { source_id: externalId, area: ai.result.area_principal }, { model: transcribeModel });
    res.json({ ok: true, analysis, transcript_chars: transcript.length });
  } catch (e) { fail(res, 500, e.message); }
});

app.get('/admin/entrenamiento-ia', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://*.supabase.in; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  res.type('html').send(PAGE);
});

const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MASTERLAW · Entrenamiento IA</title><style>
:root{--bg:#090b10;--card:#11151d;--line:#242b38;--txt:#edf2f7;--muted:#8d98a8;--accent:#d5b46b;--good:#4ade80;--warn:#fbbf24;--bad:#fb7185}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:radial-gradient(circle at 10% 0,#171b26 0,#090b10 34%);color:var(--txt)}button,input,textarea{font:inherit}.hidden{display:none!important}.wrap{max-width:1440px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:18px;align-items:center;margin-bottom:24px}.brand{font-weight:850;letter-spacing:.08em}.brand span{color:var(--accent)}.pill{border:1px solid var(--line);background:#0d1118;padding:8px 12px;border-radius:999px;color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}.card{background:rgba(17,21,29,.94);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 18px 50px #0004}.stat{grid-column:span 3}.stat b{display:block;font-size:30px;margin-top:8px}.stat small,.muted{color:var(--muted)}.main{grid-column:span 8}.side{grid-column:span 4}h1{font-size:28px;margin:2px 0 6px}h2{font-size:17px;margin:0 0 12px}.actions{display:flex;gap:9px;flex-wrap:wrap}.btn{border:1px solid var(--line);background:#171d27;color:var(--txt);padding:10px 13px;border-radius:11px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px}.btn.primary{background:var(--accent);border-color:var(--accent);color:#13100a;font-weight:800}.btn.good{border-color:#225f38}input,textarea{width:100%;background:#0b0f15;border:1px solid var(--line);color:var(--txt);border-radius:11px;padding:11px}textarea{min-height:145px;resize:vertical}.login{max-width:460px;margin:12vh auto}.login .card{padding:26px}.field{margin:13px 0}.err{color:var(--bad);font-size:13px;margin-top:10px}.table{width:100%;border-collapse:collapse;font-size:12px}.table td,.table th{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.table th{color:var(--muted);font-weight:600}.tag{padding:4px 7px;border:1px solid var(--line);border-radius:999px;font-size:10px;white-space:nowrap}.scroll{overflow:auto;max-height:520px}.drop{border:1px dashed #485368;border-radius:15px;padding:24px;text-align:center;background:#0c1017}.progress{height:7px;border-radius:99px;background:#202632;overflow:hidden;margin-top:10px}.progress i{display:block;height:100%;background:var(--accent);width:0%}.item{padding:12px 0;border-bottom:1px solid var(--line)}.item:last-child{border:0}.item strong{display:block;margin-bottom:4px}.tabs{display:flex;gap:8px;margin:18px 0;flex-wrap:wrap}.tab{cursor:pointer;padding:8px 11px;border-radius:10px;color:var(--muted)}.tab.on{background:#191f2a;color:var(--txt)}.ok{color:var(--good)}.warn{color:var(--warn)}@media(max-width:900px){.stat{grid-column:span 6}.main,.side{grid-column:1/-1}}@media(max-width:520px){.wrap{padding:14px}.stat{grid-column:1/-1}.top{align-items:flex-start}}
</style></head><body>
<div id="login" class="login"><div class="card"><div class="brand">MASTERLAW <span>INTELLIGENCE</span></div><h1>Entrenamiento IA</h1><p class="muted">Centro privado. Acceso exclusivo de administradores autorizados.</p><div class="field"><input id="email" type="email" autocomplete="username" placeholder="Correo ADMIN"></div><div class="field"><input id="password" type="password" autocomplete="current-password" placeholder="Contraseña"></div><button class="btn primary" id="loginBtn">Ingresar</button><div id="loginErr" class="err"></div></div></div>
<div id="app" class="wrap hidden"><div class="top"><div><div class="brand">MASTERLAW <span>INTELLIGENCE</span></div><h1>Entrenamiento IA / Machine Learning</h1><div class="muted">Información → análisis → revisión ADMIN → conocimiento validado</div></div><div class="actions"><span id="adminBadge" class="pill"></span><button id="logout" class="btn">Salir</button></div></div>
<div class="grid"><div class="card stat"><small>Fuentes registradas</small><b id="sSources">—</b></div><div class="card stat"><small>Análisis IA</small><b id="sAnalysis">—</b></div><div class="card stat"><small>Conocimiento validado</small><b id="sKnowledge">—</b></div><div class="card stat"><small>Pendientes ADMIN</small><b id="sPending">—</b></div>
<section class="card main"><h2>Entrada rápida</h2><div class="drop"><strong>Subir audio/documento privado</strong><div class="muted" style="margin:7px 0 14px">Para análisis inmediato. Para lotes grandes usa Drive.</div><input id="file" type="file" accept="audio/*,.mp3,.m4a,.wav,.amr,.ogg,.aac,.pdf,.doc,.docx,.txt" style="max-width:520px"><div class="progress hidden" id="progress"><i id="bar"></i></div><div id="uploadMsg" class="muted" style="margin-top:8px"></div></div><div class="actions" style="margin-top:12px"><a class="btn primary" href="${DRIVE.audio.url}" target="_blank" rel="noreferrer">Abrir INBOX de audios en Drive</a><a class="btn" href="${DRIVE.docs.url}" target="_blank" rel="noreferrer">Documentos</a><a class="btn" href="${DRIVE.contracts.url}" target="_blank" rel="noreferrer">Contratos</a><a class="btn" href="${DRIVE.panos.url}" target="_blank" rel="noreferrer">Paños</a></div></section>
<aside class="card side"><h2>Gobierno del aprendizaje</h2><div class="item"><strong>1 · Ingreso</strong><span class="muted">Audio, documento, contrato, minuta o antecedente.</span></div><div class="item"><strong>2 · IA analiza</strong><span class="muted">Hechos, riesgos, negociación, obligaciones y tareas.</span></div><div class="item"><strong>3 · ADMIN revisa</strong><span class="muted">Nada se vuelve “verdad” por sí solo.</span></div><div class="item"><strong>4 · Aprendizaje</strong><span class="muted">Solo lo aprobado entra al conocimiento oficial.</span></div></aside>
<section class="card main"><div class="tabs"><span class="tab on" data-tab="analyses">Revisión IA</span><span class="tab" data-tab="intake">Fuentes</span><span class="tab" data-tab="knowledge">Conocimiento</span><span class="tab" data-tab="manual">Analizar texto</span></div><div id="analyses" class="pane"><div id="analysisList"></div></div><div id="intake" class="pane hidden"><div class="scroll"><table class="table"><thead><tr><th>Archivo</th><th>Clasificación</th><th>Estado</th><th>Fecha</th></tr></thead><tbody id="intakeRows"></tbody></table></div></div><div id="knowledge" class="pane hidden"><div id="knowledgeList"></div></div><div id="manual" class="pane hidden"><input id="manualTitle" placeholder="Título o referencia"><textarea id="manualText" placeholder="Pega aquí una minuta, WhatsApp, negociación, transcripción, antecedente..."></textarea><button id="analyzeBtn" class="btn primary">Analizar y enviar a revisión</button><div id="manualMsg" class="muted" style="margin-top:8px"></div></div></section><aside class="card side"><h2>Drive IA</h2><div id="folderList"></div></aside></div></div>
<script>
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let token=sessionStorage.getItem('ml_admin_token')||'';const api=async(path,opt={})=>{const headers={...(opt.headers||{}),'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const r=await fetch(path,{...opt,headers});let d={};try{d=await r.json()}catch{}if((r.status===401||r.status===403)&&path!='/api/ia-training/me')logout();if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function logout(){token='';sessionStorage.removeItem('ml_admin_token');$('#app').classList.add('hidden');$('#login').classList.remove('hidden')}async function login(){$('#loginErr').textContent='';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#email').value.trim(),password:$('#password').value})});const d=await r.json();if(!r.ok||!d.token)throw new Error(d.error||'No fue posible ingresar');token=d.token;sessionStorage.setItem('ml_admin_token',token);await boot()}catch(e){sessionStorage.removeItem('ml_admin_token');token='';$('#loginErr').textContent=e.message}}async function boot(){const me=await api('/api/ia-training/me');$('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#adminBadge').textContent='ADMIN · '+me.admin.email;await Promise.all([loadSummary(),loadAnalyses(),loadIntake(),loadKnowledge()])}async function loadSummary(){const d=await api('/api/ia-training/summary'),s=d.stats;$('#sSources').textContent=s.fuentes_registradas;$('#sAnalysis').textContent=s.analisis_ia;$('#sKnowledge').textContent=s.conocimiento_validado;$('#sPending').textContent=s.pendientes_revision;$('#folderList').innerHTML=(d.folders||[]).map(f=>'<div class="item"><strong>'+esc(f.name)+'</strong><span class="muted">'+esc(f.purpose||'')+'</span></div>').join('')}async function loadIntake(){const d=await api('/api/ia-training/intake?limit=100');$('#intakeRows').innerHTML=(d.items||[]).map(x=>'<tr><td>'+esc(x.file_name)+'<br><small class="muted">'+esc(x.mime||'')+'</small></td><td>'+esc(x.classification||'—')+'</td><td><span class="tag">'+esc(x.review_status||'—')+'</span></td><td>'+esc((x.created_at||'').slice(0,16).replace('T',' '))+'</td></tr>').join('')}async function loadAnalyses(){const d=await api('/api/ia-training/analyses?limit=50');$('#analysisList').innerHTML=(d.analyses||[]).map(a=>{const r=a.respuesta_json||{},g=r._governance||{},approved=!!g.approved_as_knowledge;return '<div class="item"><div style="display:flex;justify-content:space-between;gap:10px"><strong>'+esc(g.source_title||r.resumen_ejecutivo||('Análisis '+a.id))+'</strong><span class="tag '+(approved?'ok':'warn')+'">'+(approved?'VALIDADO':'REVISAR')+'</span></div><div class="muted">'+esc(a.area||'OTRO')+' · '+esc(a.modelo||'IA')+'</div><p>'+esc(r.resumen_ejecutivo||'Sin resumen')+'</p>'+(!approved?'<button class="btn good" onclick="approve(\''+a.id+'\')">Aprobar como conocimiento</button>':'')+'</div>'}).join('')||'<p class="muted">Aún no hay análisis.</p>'}async function approve(id){if(!confirm('¿Aprobar este análisis como conocimiento oficial?'))return;try{await api('/api/ia-training/analysis/'+id+'/approve',{method:'POST',body:'{}'});await Promise.all([loadAnalyses(),loadKnowledge(),loadSummary()])}catch(e){alert(e.message)}}async function loadKnowledge(){const d=await api('/api/ia-training/knowledge?limit=50');$('#knowledgeList').innerHTML=(d.knowledge||[]).map(k=>'<div class="item"><strong>'+esc(k.titulo)+'</strong><div class="muted">'+esc(k.area_codigo||'OTRO')+' · '+esc(k.tipo||'')+'</div></div>').join('')||'<p class="muted">Sin conocimiento validado.</p>'}async function analyzeManual(){const text=$('#manualText').value.trim();if(text.length<20)return alert('Agrega más contenido.');$('#manualMsg').textContent='Analizando…';try{await api('/api/ia-training/analyze-text',{method:'POST',body:JSON.stringify({text,title:$('#manualTitle').value.trim(),source_type:'nota'})});$('#manualMsg').textContent='Listo: enviado a revisión ADMIN.';$('#manualText').value='';await Promise.all([loadAnalyses(),loadSummary()])}catch(e){$('#manualMsg').textContent=e.message}}
async function upload(file){const kind=file.type.startsWith('audio/')||/\.(mp3|m4a|wav|amr|ogg|aac)$/i.test(file.name)?'audio':'document';$('#progress').classList.remove('hidden');$('#bar').style.width='15%';$('#uploadMsg').textContent='Preparando carga privada…';try{const u=await api('/api/ia-training/upload-url',{method:'POST',body:JSON.stringify({name:file.name,mime:file.type||'application/octet-stream',kind})});$('#bar').style.width='35%';$('#uploadMsg').textContent='Subiendo…';const put=await fetch(u.signedUrl,{method:'PUT',headers:{'Content-Type':file.type||u.mime},body:file});if(!put.ok)throw new Error('No fue posible subir el archivo ('+put.status+')');$('#bar').style.width='70%';const reg=await api('/api/ia-training/upload-complete',{method:'POST',body:JSON.stringify({path:u.path,name:file.name,mime:file.type||u.mime,bytes:file.size,kind})});$('#bar').style.width='82%';if(kind==='audio'&&file.size<=25*1024*1024){$('#uploadMsg').textContent='Transcribiendo y analizando…';await api('/api/ia-training/transcribe',{method:'POST',body:JSON.stringify({external_file_id:reg.intake.external_file_id})});$('#uploadMsg').textContent='Audio transcrito y analizado. Revisa el resultado antes de aprobarlo.'}else{$('#uploadMsg').textContent=kind==='audio'?'Audio registrado. Los archivos grandes pasan a cola.':'Documento registrado para análisis.'}$('#bar').style.width='100%';await Promise.all([loadIntake(),loadAnalyses(),loadSummary()])}catch(e){$('#uploadMsg').textContent=e.message;$('#bar').style.width='0%'}}
$('#loginBtn').onclick=login;$('#password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('#logout').onclick=logout;$('#analyzeBtn').onclick=analyzeManual;$('#file').onchange=e=>e.target.files[0]&&upload(e.target.files[0]);$$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');$$('.pane').forEach(p=>p.classList.add('hidden'));$('#'+t.dataset.tab).classList.remove('hidden')});if(token)boot().catch(logout);
</script></body></html>`;

module.exports = app;
