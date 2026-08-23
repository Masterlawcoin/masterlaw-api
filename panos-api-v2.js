require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const legacyHandler = require('./panos-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY
);

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
  const secret = process.env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error('JWT_SECRET no configurado'), { status: 500 });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Token requerido'), { status: 401 });
  try {
    return jwt.verify(token, secret);
  } catch {
    throw Object.assign(new Error('Token inválido'), { status: 401 });
  }
}

function requireWriteRole(user) {
  if (!WRITE_ROLES.has(String(user?.rol || '').toLowerCase())) {
    throw Object.assign(new Error('Permisos insuficientes'), { status: 403 });
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

function numericOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw Object.assign(new Error('Valor numérico inválido'), { status: 400 });
  return n;
}

async function getPanoFinanzas(id) {
  const { data, error } = await supabase
    .from('ml_panos_web_finanzas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function listPanosFinanzas(url) {
  const estado = safeText(url.searchParams.get('estado'), 80).toLowerCase();
  const personaEstado = safeText(url.searchParams.get('persona_estado'), 80).toLowerCase();
  const etapa = safeText(url.searchParams.get('etapa'), 100).toLowerCase();
  const comuna = safeText(url.searchParams.get('comuna'), 160);
  const broker = safeText(url.searchParams.get('broker'), 100);
  const comprador = safeText(url.searchParams.get('comprador'), 120);
  const financiero = safeText(url.searchParams.get('estado_financiero'), 80).toLowerCase();
  const q = safeSearch(url.searchParams.get('q'));
  const limit = intParam(url.searchParams.get('limit'), 500, 1, MAX_LIMIT);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, 1000000);

  let query = supabase
    .from('ml_panos_web_finanzas')
    .select('*', { count: 'exact' })
    .order('orden_operativo', { ascending: true })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (estado) query = query.eq('estado', estado);
  if (personaEstado) query = query.eq('persona_estado_prioritario', personaEstado);
  if (etapa) query = query.eq('etapa_investigacion_slug', etapa);
  if (comuna) query = query.ilike('comuna', `%${comuna}%`);
  if (broker) query = query.eq('broker_codigo', broker);
  if (comprador) query = query.ilike('venta_comprador', `%${comprador}%`);
  if (financiero) query = query.eq('venta_estado_financiero', financiero);
  if (q) query = query.or(`nombre.ilike.%${q}%,direccion.ilike.%${q}%,comuna.ilike.%${q}%,codigo.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    panos: data || [],
    meta: {
      total: count ?? (data || []).length,
      limit,
      offset,
      fuente: 'ml_panos_web_finanzas',
      regla_masterlaw: '50% fee pool total'
    }
  };
}

async function getResumenFinanciero() {
  const [{ data: rows, error }, { data: finanzas, error: finError }] = await Promise.all([
    supabase
      .from('ml_panos_web_finanzas')
      .select('id,estado,estado_label,persona_estado_prioritario,comuna,m2_total,personas_unicas,predios_activos,estado_historico_2019'),
    supabase.from('ml_pano_ventas_kpi_resumen').select('*').maybeSingle()
  ]);
  if (error) throw new Error(error.message);
  if (finError) throw new Error(finError.message);

  const byEstado = {};
  const byPersona = {};
  const byComuna = {};
  let m2Total = 0;
  let personas = 0;
  let predios = 0;
  let conSnapshot2019 = 0;

  for (const row of rows || []) {
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
    operacion: {
      total_panos: (rows || []).length,
      m2_total: m2Total,
      personas_unicas_sumadas_por_pano: personas,
      predios_activos: predios,
      con_snapshot_2019: conSnapshot2019,
      por_estado: byEstado,
      por_estado_personas: byPersona,
      por_comuna: byComuna
    },
    ventas: finanzas || {},
    reglas: {
      masterlaw_share_fee_pool_pct: 50,
      descripcion: 'MASTERLAW recibe siempre 50% del fee pool total'
    }
  };
}

async function listVentas(url) {
  const comprador = safeText(url.searchParams.get('comprador'), 120);
  const financiero = safeText(url.searchParams.get('estado_financiero'), 80).toLowerCase();
  const precioConfirmado = url.searchParams.get('precio_confirmado');
  const limit = intParam(url.searchParams.get('limit'), 200, 1, 1000);

  let query = supabase
    .from('ml_pano_ventas_kpi')
    .select('*')
    .order('fecha_venta', { ascending: false, nullsFirst: false })
    .order('fecha_reporte', { ascending: false })
    .limit(limit);

  if (comprador) query = query.ilike('comprador_marca', `%${comprador}%`);
  if (financiero) query = query.eq('estado_financiero', financiero);
  if (precioConfirmado === 'true') query = query.eq('precio_confirmado', true);
  if (precioConfirmado === 'false') query = query.eq('precio_confirmado', false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getVentaPano(panoId) {
  const [{ data: venta, error }, { data: movimientos, error: movError }] = await Promise.all([
    supabase.from('ml_pano_ventas_kpi').select('*').eq('pano_id', panoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ml_pano_venta_movimientos').select('*').eq('pano_id', panoId).order('creado', { ascending: false }).limit(100)
  ]);
  if (error) throw new Error(error.message);
  if (movError) throw new Error(movError.message);
  return { venta, movimientos: movimientos || [] };
}

const VENTA_WRITE_FIELDS = new Set([
  'fecha_venta', 'precio_final_clp', 'precio_final_fuente', 'precio_confirmado',
  'estado_facturacion', 'fecha_factura', 'numero_factura',
  'monto_facturado_neto_clp', 'monto_facturado_iva_clp', 'monto_facturado_bruto_clp',
  'estado_cobro', 'fecha_cobro', 'monto_cobrado_clp',
  'evidencia_factura_drive_id', 'evidencia_pago_drive_id', 'fecha_cierre_financiero', 'notas'
]);

function pickVentaPayload(body) {
  const out = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!VENTA_WRITE_FIELDS.has(key)) continue;
    if (['precio_final_clp','monto_facturado_neto_clp','monto_facturado_iva_clp','monto_facturado_bruto_clp','monto_cobrado_clp'].includes(key)) {
      out[key] = numericOrNull(value);
    } else if (key === 'precio_confirmado') {
      out[key] = value === true;
    } else {
      out[key] = value === '' ? null : value;
    }
  }
  return out;
}

async function updateVentaPano(panoId, body, user) {
  const payload = pickVentaPayload(body);
  if (!Object.keys(payload).length) throw Object.assign(new Error('No hay campos financieros editables'), { status: 400 });

  const { data: actual, error: actualError } = await supabase
    .from('ml_pano_ventas')
    .select('id,deal_key,precio_final_clp,precio_confirmado,estado_cobro,monto_cobrado_clp')
    .eq('pano_id', panoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (actualError) throw new Error(actualError.message);
  if (!actual) throw Object.assign(new Error('Venta no encontrada para este paño'), { status: 404 });

  const finalPrice = payload.precio_final_clp ?? actual.precio_final_clp;
  const confirmed = payload.precio_confirmado ?? actual.precio_confirmado;
  if (confirmed && !(Number(finalPrice) > 0)) {
    throw Object.assign(new Error('Para confirmar precio debe existir precio_final_clp mayor a 0'), { status: 400 });
  }
  if (payload.estado_cobro === 'cobrado' && !(Number(payload.monto_cobrado_clp ?? actual.monto_cobrado_clp) > 0)) {
    throw Object.assign(new Error('Cobro total requiere monto_cobrado_clp mayor a 0'), { status: 400 });
  }

  const { error } = await supabase.from('ml_pano_ventas').update(payload).eq('id', actual.id);
  if (error) throw new Error(error.message);

  await supabase.from('ml_pano_investigacion').insert({
    pano_id: panoId,
    tipo: 'venta_finanzas_actualizada',
    agente: safeText(user.email || user.rol, 160),
    resultado: 'Actualización financiera de venta desde API de Paños.',
    datos_json: { deal_key: actual.deal_key, campos_actualizados: Object.keys(payload), regla_masterlaw: '50% fee pool total' },
    estado_anterior: 'vendido',
    estado_nuevo: 'vendido',
    visible_broker: true,
    visible_admin: true
  });

  return getVentaPano(panoId);
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    const url = new URL(req.url, `https://${req.headers.host || 'masterlaw-api.vercel.app'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/api/panos') {
      authenticate(req);
      const result = await listPanosFinanzas(url);
      return send(res, 200, { ok: true, ...result });
    }

    if (req.method === 'GET' && path === '/api/panos/resumen') {
      authenticate(req);
      const resumen = await getResumenFinanciero();
      return send(res, 200, { ok: true, resumen });
    }

    if (req.method === 'GET' && path === '/api/panos/ventas') {
      const user = authenticate(req);
      requireWriteRole(user);
      const ventas = await listVentas(url);
      return send(res, 200, { ok: true, ventas, regla_masterlaw: { share_fee_pool_pct: 50 } });
    }

    if (req.method === 'GET' && path === '/api/panos/ventas/resumen') {
      const user = authenticate(req);
      requireWriteRole(user);
      const { data, error } = await supabase.from('ml_pano_ventas_kpi_resumen').select('*').maybeSingle();
      if (error) throw new Error(error.message);
      return send(res, 200, { ok: true, resumen: data || {}, regla_masterlaw: { share_fee_pool_pct: 50 } });
    }

    const ventaMatch = path.match(/^\/api\/panos\/(\d+)\/venta$/);
    if (req.method === 'GET' && ventaMatch) {
      const user = authenticate(req);
      requireWriteRole(user);
      const data = await getVentaPano(Number(ventaMatch[1]));
      return send(res, 200, { ok: true, ...data });
    }

    if (req.method === 'PUT' && ventaMatch) {
      const user = authenticate(req);
      requireWriteRole(user);
      const data = await updateVentaPano(Number(ventaMatch[1]), req.body || {}, user);
      return send(res, 200, { ok: true, ...data });
    }

    const idMatch = path.match(/^\/api\/panos\/(\d+)$/);
    if (req.method === 'GET' && idMatch) {
      authenticate(req);
      const pano = await getPanoFinanzas(Number(idMatch[1]));
      if (!pano) return send(res, 404, { ok: false, error: 'Paño no encontrado' });
      return send(res, 200, { ok: true, pano });
    }

    return legacyHandler(req, res);
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Error interno' });
  }
};
