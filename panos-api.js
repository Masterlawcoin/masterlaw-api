require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY
);

// Mantiene compatibilidad con los tokens existentes de server.js.
// TODO de seguridad separado: retirar el fallback cuando JWT_SECRET esté verificado en producción.
const JWT_SECRET = process.env.JWT_SECRET || 'masterlaw-secreto-2025-abc123';

const WRITE_ROLES = new Set(['ceo', 'broker']);
const MAX_LIMIT = 1000;

function setCors(req, res) {
  const allowed = new Set([
    'https://masterlaw.cl',
    'https://www.masterlaw.cl',
    'https://masterlaw-api.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ]);
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function authenticate(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Token requerido'), { status: 401 });
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    throw Object.assign(new Error('Token inválido'), { status: 401 });
  }
}

function requireWriteRole(user) {
  if (!WRITE_ROLES.has(String(user?.rol || '').toLowerCase())) {
    throw Object.assign(new Error('Permisos insuficientes para modificar paños'), { status: 403 });
  }
}

function safeText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function safeSearch(value) {
  return safeText(value, 120)
    .replace(/[^\p{L}\p{N}\s\-_/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function intParam(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const PANO_WRITE_FIELDS = new Set([
  'nombre', 'manzana', 'comuna', 'region', 'normativa', 'estado', 'broker_codigo',
  'm2_total', 'precio_est', 'comentario', 'origen', 'codigo', 'direccion',
  'responsable_historico', 'pre_estado', 'estado_legacy', 'captacion', 'link',
  'uf_m2', 'total_uf', 'precio_pesos', 'comision_dividir', 'comision_corretaje',
  'zonificacion', 'densidad_hab_ha', 'altura_pisos', 'altura_metros', 'lotes',
  'constructibilidad', 'uso_suelo', 'superficie_predial_min', 'estrategia'
]);

function pickPanoPayload(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (PANO_WRITE_FIELDS.has(key)) out[key] = value === '' ? null : value;
  }
  if (typeof out.nombre === 'string') out.nombre = safeText(out.nombre, 240);
  if (typeof out.comuna === 'string') out.comuna = safeText(out.comuna, 160);
  if (typeof out.region === 'string') out.region = safeText(out.region, 160);
  if (typeof out.estado === 'string') out.estado = safeText(out.estado, 80).toLowerCase();
  return out;
}

async function validateEstado(estado) {
  if (!estado) return;
  const { data, error } = await supabase
    .from('ml_pano_estados')
    .select('slug')
    .eq('slug', estado)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error(`Estado de paño inválido: ${estado}`), { status: 400 });
}

async function getPanoEnriquecido(id) {
  const { data, error } = await supabase
    .from('ml_panos_web_ordenados')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function listPanos(url) {
  const estado = safeText(url.searchParams.get('estado'), 80).toLowerCase();
  const personaEstado = safeText(url.searchParams.get('persona_estado'), 80).toLowerCase();
  const etapa = safeText(url.searchParams.get('etapa'), 100).toLowerCase();
  const comuna = safeText(url.searchParams.get('comuna'), 160);
  const broker = safeText(url.searchParams.get('broker'), 100);
  const q = safeSearch(url.searchParams.get('q'));
  const limit = intParam(url.searchParams.get('limit'), 500, 1, MAX_LIMIT);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, 1000000);

  let query = supabase
    .from('ml_panos_web_ordenados')
    .select('*', { count: 'exact' })
    .order('orden_operativo', { ascending: true })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (estado) query = query.eq('estado', estado);
  if (personaEstado) query = query.eq('persona_estado_prioritario', personaEstado);
  if (etapa) query = query.eq('etapa_investigacion_slug', etapa);
  if (comuna) query = query.ilike('comuna', `%${comuna}%`);
  if (broker) query = query.eq('broker_codigo', broker);
  if (q) {
    query = query.or(`nombre.ilike.%${q}%,direccion.ilike.%${q}%,comuna.ilike.%${q}%,codigo.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    panos: data || [],
    meta: {
      total: count ?? (data || []).length,
      limit,
      offset,
      orden: ['estado_comercial', 'prioridad_personas', 'etapa_investigacion', 'completitud'],
      fuente: 'ml_panos_web_ordenados'
    }
  };
}

async function getCatalogos() {
  const [estados, personas, etapas] = await Promise.all([
    supabase.from('ml_pano_estados').select('slug,label,color,orden').order('orden'),
    supabase.from('ml_pano_persona_estados').select('slug,label,orden,final,activa').eq('activa', true).order('orden'),
    supabase.from('ml_pano_etapas_investigacion').select('slug,label,orden,source_label,estado_pano_relacionado,alcance,activa').eq('activa', true).order('orden')
  ]);

  const error = estados.error || personas.error || etapas.error;
  if (error) throw new Error(error.message);

  return {
    estados: estados.data || [],
    estados_personas: personas.data || [],
    etapas_investigacion: etapas.data || [],
    logica: {
      estado_historico_2019: 'solo_snapshot_no_sobrescribe_actual',
      orden_lista: 'estado_comercial > prioridad_personas > etapa_investigacion > completitud'
    }
  };
}

async function getResumen() {
  const { data, error } = await supabase
    .from('ml_panos_web_ordenados')
    .select('id,estado,estado_label,persona_estado_prioritario,persona_estado_prioritario_label,comuna,m2_total,personas_unicas,predios_activos,estado_historico_2019');
  if (error) throw new Error(error.message);

  const rows = data || [];
  const byEstado = {};
  const byPersona = {};
  const byComuna = {};
  let m2Total = 0;
  let personas = 0;
  let predios = 0;
  let conSnapshot2019 = 0;

  for (const row of rows) {
    const estado = row.estado || 'sin_estado';
    const persona = row.persona_estado_prioritario || 'sin_personas';
    const comuna = row.comuna || 'SIN COMUNA';
    byEstado[estado] = (byEstado[estado] || 0) + 1;
    byPersona[persona] = (byPersona[persona] || 0) + 1;
    byComuna[comuna] = (byComuna[comuna] || 0) + 1;
    m2Total += Number(row.m2_total || 0);
    personas += Number(row.personas_unicas || 0);
    predios += Number(row.predios_activos || 0);
    if (row.estado_historico_2019) conSnapshot2019 += 1;
  }

  return {
    total_panos: rows.length,
    m2_total: m2Total,
    personas_unicas_sumadas_por_pano: personas,
    predios_activos: predios,
    con_snapshot_2019: conSnapshot2019,
    por_estado: byEstado,
    por_estado_personas: byPersona,
    por_comuna: byComuna
  };
}

async function getPersonasPano(panoId) {
  const { data: predios, error: predioError } = await supabase
    .from('ml_pano_predios')
    .select('id,direccion,rol_sii,m2,incluido_en_pano')
    .eq('pano_id', panoId)
    .is('eliminado_at', null)
    .neq('activo', false)
    .order('id');
  if (predioError) throw new Error(predioError.message);

  const predioIds = (predios || []).map(p => p.id);
  if (!predioIds.length) return { predios: predios || [], personas: [] };

  const { data: personas, error: personaError } = await supabase
    .from('ml_pano_duenos')
    .select('id,predio_id,nombre,rut,donde_vive,telefonos,correos,email,estado,investigado,persona_key,porcentaje,derechos,notas,fuentes,updated_at')
    .in('predio_id', predioIds)
    .eq('activo', true)
    .is('eliminado_at', null);
  if (personaError) throw new Error(personaError.message);

  const { data: catalogo, error: catalogoError } = await supabase
    .from('ml_pano_persona_estados')
    .select('slug,label,orden')
    .eq('activa', true);
  if (catalogoError) throw new Error(catalogoError.message);
  const orderMap = new Map((catalogo || []).map(x => [x.slug, x.orden]));

  const sorted = (personas || []).sort((a, b) => {
    const oa = orderMap.get(a.estado) ?? 999;
    const ob = orderMap.get(b.estado) ?? 999;
    if (oa !== ob) return oa - ob;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  });

  return { predios: predios || [], personas: sorted };
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    const user = authenticate(req);
    const url = new URL(req.url, `https://${req.headers.host || 'masterlaw-api.vercel.app'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/api/panos') {
      const result = await listPanos(url);
      return send(res, 200, { ok: true, ...result });
    }

    if (req.method === 'GET' && path === '/api/panos/catalogos') {
      const catalogos = await getCatalogos();
      return send(res, 200, { ok: true, ...catalogos });
    }

    if (req.method === 'GET' && path === '/api/panos/resumen') {
      const resumen = await getResumen();
      return send(res, 200, { ok: true, resumen });
    }

    const personasMatch = path.match(/^\/api\/panos\/(\d+)\/personas$/);
    if (req.method === 'GET' && personasMatch) {
      requireWriteRole(user);
      const panoId = Number(personasMatch[1]);
      const pano = await getPanoEnriquecido(panoId);
      if (!pano) return send(res, 404, { ok: false, error: 'Paño no encontrado' });
      const detalle = await getPersonasPano(panoId);
      return send(res, 200, { ok: true, pano, ...detalle });
    }

    const investigacionMatch = path.match(/^\/api\/panos\/(\d+)\/investigacion$/);
    if (req.method === 'POST' && investigacionMatch) {
      requireWriteRole(user);
      const panoId = Number(investigacionMatch[1]);
      const body = req.body || {};
      const etapaSlug = safeText(body.etapa_slug, 100).toLowerCase();
      if (!etapaSlug) return send(res, 400, { ok: false, error: 'etapa_slug requerido' });

      const [{ data: pano, error: panoError }, { data: etapa, error: etapaError }] = await Promise.all([
        supabase.from('ml_panos').select('id,estado').eq('id', panoId).maybeSingle(),
        supabase.from('ml_pano_etapas_investigacion').select('slug,estado_pano_relacionado').eq('slug', etapaSlug).eq('activa', true).maybeSingle()
      ]);
      if (panoError) throw new Error(panoError.message);
      if (etapaError) throw new Error(etapaError.message);
      if (!pano) return send(res, 404, { ok: false, error: 'Paño no encontrado' });
      if (!etapa) return send(res, 400, { ok: false, error: 'Etapa de investigación inválida' });

      const aplicarEstado = body.aplicar_estado === true && etapa.estado_pano_relacionado;
      const estadoNuevo = aplicarEstado ? etapa.estado_pano_relacionado : null;

      const { data: investigacion, error: invError } = await supabase
        .from('ml_pano_investigacion')
        .insert({
          pano_id: panoId,
          predio_id: body.predio_id || null,
          dueno_id: body.dueno_id || null,
          persona_key: body.persona_key || null,
          etapa_slug: etapaSlug,
          tipo: safeText(body.tipo || etapaSlug, 120),
          agente: safeText(body.agente || user.email || user.rol, 160),
          resultado: body.resultado || null,
          transcripcion: body.transcripcion || null,
          datos_json: body.datos_json || {},
          estado_anterior: pano.estado || null,
          estado_nuevo: estadoNuevo,
          visible_broker: body.visible_broker !== false,
          visible_admin: body.visible_admin !== false
        })
        .select('*')
        .single();
      if (invError) throw new Error(invError.message);

      if (estadoNuevo && estadoNuevo !== pano.estado) {
        const { error: updateError } = await supabase
          .from('ml_panos')
          .update({ estado: estadoNuevo, updated_at: new Date().toISOString() })
          .eq('id', panoId);
        if (updateError) throw new Error(updateError.message);
      }

      const enriched = await getPanoEnriquecido(panoId);
      return send(res, 201, { ok: true, investigacion, pano: enriched });
    }

    const estadoMatch = path.match(/^\/api\/panos\/(\d+)\/estado$/);
    if (req.method === 'PUT' && estadoMatch) {
      requireWriteRole(user);
      const panoId = Number(estadoMatch[1]);
      const estado = safeText(req.body?.estado, 80).toLowerCase();
      if (!estado) return send(res, 400, { ok: false, error: 'Estado requerido' });
      await validateEstado(estado);

      const { data: anterior, error: prevError } = await supabase
        .from('ml_panos')
        .select('id,estado')
        .eq('id', panoId)
        .maybeSingle();
      if (prevError) throw new Error(prevError.message);
      if (!anterior) return send(res, 404, { ok: false, error: 'Paño no encontrado' });

      const { error } = await supabase
        .from('ml_panos')
        .update({ estado, updated_at: new Date().toISOString() })
        .eq('id', panoId);
      if (error) throw new Error(error.message);

      await supabase.from('ml_pano_investigacion').insert({
        pano_id: panoId,
        tipo: 'cambio_estado_manual',
        agente: safeText(user.email || user.rol, 160),
        estado_anterior: anterior.estado,
        estado_nuevo: estado,
        resultado: safeText(req.body?.motivo, 1000) || null,
        datos_json: { origen: 'pagina_panos' }
      });

      const pano = await getPanoEnriquecido(panoId);
      return send(res, 200, { ok: true, pano });
    }

    const idMatch = path.match(/^\/api\/panos\/(\d+)$/);
    if (req.method === 'GET' && idMatch) {
      const pano = await getPanoEnriquecido(Number(idMatch[1]));
      if (!pano) return send(res, 404, { ok: false, error: 'Paño no encontrado' });
      return send(res, 200, { ok: true, pano });
    }

    if (req.method === 'PUT' && idMatch) {
      requireWriteRole(user);
      const panoId = Number(idMatch[1]);
      const payload = pickPanoPayload(req.body || {});
      if (!Object.keys(payload).length) return send(res, 400, { ok: false, error: 'No hay campos editables' });
      if (payload.estado) await validateEstado(payload.estado);
      payload.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('ml_panos')
        .update(payload)
        .eq('id', panoId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return send(res, 404, { ok: false, error: 'Paño no encontrado' });

      const pano = await getPanoEnriquecido(panoId);
      return send(res, 200, { ok: true, pano });
    }

    if (req.method === 'POST' && path === '/api/panos') {
      requireWriteRole(user);
      const payload = pickPanoPayload(req.body || {});
      if (!payload.nombre) return send(res, 400, { ok: false, error: 'Nombre del paño requerido' });
      if (payload.estado) await validateEstado(payload.estado);
      if (!payload.origen) payload.origen = 'web_masterlaw';

      const { data, error } = await supabase
        .from('ml_panos')
        .insert({ ...payload, canonical_status: 'canonical', activo: true })
        .select('id')
        .single();
      if (error) throw new Error(error.message);

      const pano = await getPanoEnriquecido(data.id);
      return send(res, 201, { ok: true, pano });
    }

    return send(res, 404, { ok: false, error: `Endpoint de paños no encontrado: ${path}` });
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Error interno' });
  }
};
