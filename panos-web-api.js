require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY
);

const ALLOWED_ROLES = new Set(['ceo', 'broker']);

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
    const user = jwt.verify(token, secret);
    const rol = String(user?.rol || '').toLowerCase();
    if (!ALLOWED_ROLES.has(rol)) {
      throw Object.assign(new Error('Permisos insuficientes'), { status: 403 });
    }
    return user;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Token inválido'), { status: 401 });
  }
}

async function getMenu(user) {
  const { data, error } = await supabase
    .from('ml_web_menu_panos')
    .select('slug,titulo,descripcion,ruta,icono,orden,roles,fuente_api,metadata')
    .order('orden');
  if (error) throw new Error(error.message);
  const rol = String(user?.rol || '').toLowerCase();
  return (data || []).filter(row => Array.isArray(row.roles) && row.roles.includes(rol));
}

async function getDocumentos(panoId) {
  const { data, error } = await supabase
    .from('ml_pano_fuentes_registro')
    .select('id,pano_id,drive_item_id,fuente_archivo,fuente_hoja,fuente_fila,match_status,match_confidence,match_method,nota,registro,creado,actualizado')
    .eq('pano_id', panoId)
    .order('actualizado', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

async function getHistorial(panoId, user) {
  let query = supabase
    .from('ml_pano_investigacion')
    .select('id,pano_id,predio_id,dueno_id,persona_key,etapa_slug,tipo,agente,telefono,resultado,datos_json,estado_anterior,estado_nuevo,visible_broker,visible_admin,creado')
    .eq('pano_id', panoId)
    .order('creado', { ascending: false })
    .limit(500);

  if (String(user?.rol || '').toLowerCase() === 'broker') {
    query = query.eq('visible_broker', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Método no permitido' });
    const user = authenticate(req);
    const url = new URL(req.url, `https://${req.headers.host || 'masterlaw-api.vercel.app'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/panos/web/menu') {
      const menu = await getMenu(user);
      return send(res, 200, {
        ok: true,
        menu,
        jerarquia_ficha: ['paño','predios','propietarios','investigación','documentos','venta','historial'],
        fuente: 'ml_web_menu_panos'
      });
    }

    const documentos = path.match(/^\/api\/panos\/(\d+)\/documentos$/);
    if (documentos) {
      const panoId = Number(documentos[1]);
      return send(res, 200, { ok: true, pano_id: panoId, documentos: await getDocumentos(panoId) });
    }

    const historial = path.match(/^\/api\/panos\/(\d+)\/historial$/);
    if (historial) {
      const panoId = Number(historial[1]);
      return send(res, 200, { ok: true, pano_id: panoId, historial: await getHistorial(panoId, user) });
    }

    return send(res, 404, { ok: false, error: 'Ruta web de Paños no encontrada' });
  } catch (error) {
    return send(res, error.status || 500, { ok: false, error: error.message || 'Error interno' });
  }
};
