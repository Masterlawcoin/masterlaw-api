require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

/* ══ SUPABASE ══ */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY
);

/* ══ IA RUNTIME ══
 * Gemini ejecuta las tareas IA del backend.
 * ChatGPT actúa como agente coordinador/orquestador externo de Masterlaw.
 */
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.CLAVE_API_DE_GEMINI || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || process.env.IA_GEMINI_MODEL || 'gemini-3.8-flash';
const JWT_SECRET = process.env.JWT_SECRET || 'masterlaw-secreto-2025-abc123';

async function geminiGenerate(messages, maxOutputTokens = 1200, requestedModel = null) {
  if (!GEMINI_KEY) {
    const err = new Error('Gemini no está configurado en este entorno');
    err.status = 503;
    throw err;
  }

  const model = (requestedModel && String(requestedModel).startsWith('gemini-'))
    ? String(requestedModel)
    : GEMINI_MODEL;

  const systemText = (messages || [])
    .filter(m => m && m.role === 'system')
    .map(m => String(m.content || ''))
    .filter(Boolean)
    .join('\n\n');

  const contents = (messages || [])
    .filter(m => m && m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));

  const body = {
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Continuar.' }] }],
    generationConfig: { maxOutputTokens }
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_KEY
      },
      body: JSON.stringify(body)
    }
  );

  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map(p => p?.text || '')
    .join('\n')
    .trim();
  if (!text) throw new Error('Gemini no devolvió contenido');
  return { text, model };
}

/* ══ CORS ══ */
app.use(cors({
  origin: [
    'https://masterlaw.cl',
    'https://www.masterlaw.cl',
    'https://masterlaw-api.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.options('*', cors());

/* ══ AUTH HELPERS ══ */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      rol: user.rol || 'cliente',
      plan: user.plan || 'starter'
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ ok: false, error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

/* ══ HEALTH ══ */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'MasterlawIA API',
    version: '2.2.0-gemini',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    gemini: !!GEMINI_KEY,
    gemini_model: GEMINI_MODEL,
    coordinator: 'chatgpt'
  });
});

/* ══ REGISTER ══ */
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, rut, telefono, plan, rol } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) return res.status(400).json({ ok: false, error: authError.message });

    const { data: user, error: dbError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        email,
        nombre: nombre || email.split('@')[0],
        rut: rut || null,
        telefono: telefono || null,
        plan: plan || 'gratis',
        rol: rol || 'cliente',
        activo: true
      })
      .select()
      .single();

    if (dbError) return res.status(400).json({ ok: false, error: dbError.message });
    res.json({ ok: true, token: signToken(user), user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══ LOGIN ══ */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });

  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });

    let { data: user, error: ue } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (ue || !user) {
      const ins = await supabase
        .from('usuarios')
        .insert({
          id: authData.user.id,
          email,
          nombre: email.split('@')[0],
          rol: 'cliente',
          plan: 'gratis',
          activo: true
        })
        .select()
        .single();
      if (ins.error) return res.status(400).json({ ok: false, error: ins.error.message });
      user = ins.data;
    }

    res.json({ ok: true, token: signToken(user), user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══ ME ══ */
app.get('/api/auth/me', authRequired, async (req, res) => {
  const { data: user, error } = await supabase.from('usuarios').select('*').eq('id', req.user.id).single();
  if (error) return res.status(401).json({ ok: false, error: error.message });
  res.json({ ok: true, user });
});

/* ══ FORGOT PASSWORD ══ */
app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: 'Email requerido' });
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://masterlaw.cl/login/' });
    res.json({ ok: true, message: 'Si el correo existe, recibirás el enlace' });
  } catch (_) {
    res.json({ ok: true, message: 'Si el correo existe, recibirás el enlace' });
  }
});

/* ══ HUB ══ */
app.get('/api/hub', authRequired, async (req, res) => {
  try {
    const [u, p, l, o, pe] = await Promise.all([
      supabase.from('usuarios').select('*'),
      supabase.from('propiedades_venta').select('*'),
      supabase.from('leads_frutillar').select('*'),
      supabase.from('ofertas').select('*'),
      supabase.from('pendientes').select('*')
    ]);
    res.json({
      ok: true,
      usuarios: u.data || [],
      propiedades: p.data || [],
      leads: l.data || [],
      ofertas: o.data || [],
      pendientes: pe.data || []
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══ DASHBOARD ══ */
app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [usuario, contratos, propiedades, pendientes, leads, ofertas, tramitaciones, comisiones, contactos, servicios] = await Promise.all([
      supabase.from('usuarios').select('*').eq('id', uid).single(),
      supabase.from('contratos').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('propiedades_venta').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('pendientes').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('leads_frutillar').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('ofertas').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('tramitaciones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('comisiones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('contactos').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('servicios').select('*')
    ]);

    const props = propiedades.data || [];
    const tasks = pendientes.data || [];
    const conts = contratos.data || [];

    res.json({
      ok: true,
      user: usuario.data,
      contratos: conts,
      propiedades: props,
      propiedades_venta: props,
      tareas: tasks,
      pendientes: tasks,
      leads: leads.data || [],
      ofertas: ofertas.data || [],
      tramitaciones: tramitaciones.data || [],
      comisiones: comisiones.data || [],
      contactos: contactos.data || [],
      servicios: servicios.data || [],
      stats: {
        contratos_total: conts.length,
        contratos_firmados: conts.filter(c => c.estado === 'firmado' || c.estado === 'signed').length,
        contratos_pendientes: conts.filter(c => c.estado === 'pendiente' || c.estado === 'pending').length,
        propiedades_total: props.length,
        tareas_pendientes: tasks.filter(t => !t.completado).length,
        leads_total: (leads.data || []).length,
        ofertas_total: (ofertas.data || []).length
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ══ CONTRATOS ══ */
app.get('/api/contratos', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('contratos').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, contratos: data || [] });
});

app.post('/api/contratos', authRequired, async (req, res) => {
  const { tipo, partes, monto } = req.body;
  if (!tipo) return res.status(400).json({ ok: false, error: 'Tipo requerido' });

  try {
    const msgs = [
      { role: 'system', content: 'Eres MasterlawIA, asistente jurídico chileno. Genera borradores claros y completos; no inventes antecedentes ausentes y marca los datos que requieran revisión profesional.' },
      { role: 'user', content: `Genera un ${tipo} completo. Datos: ${JSON.stringify(partes || {})}. Monto: ${monto || 'A convenir'}` }
    ];
    const ai = await geminiGenerate(msgs, 2500);

    const { data: contrato, error } = await supabase
      .from('contratos')
      .insert({ user_id: req.user.id, tipo, partes, contenido: ai.text, monto, estado: 'draft' })
      .select()
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, contrato, proveedor: 'gemini', modelo: ai.model });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

app.put('/api/contratos/:id/estado', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contratos')
    .update({ estado: req.body.estado })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, contrato: data });
});

/* ══ PROPIEDADES ══ */
app.get('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('propiedades_venta').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, propiedades: data || [] });
});

app.post('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('propiedades_venta').insert({ ...req.body, broker_id: req.user.id }).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, propiedad: data });
});

/* ══ TAREAS / PENDIENTES ══ */
app.get('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('pendientes').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, tareas: data || [], pendientes: data || [] });
});

app.post('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('pendientes').insert(req.body).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, tarea: data });
});

app.put('/api/tareas/:id', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('pendientes').update(req.body).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, tarea: data });
});

/* ══ CLIENTES / CONTACTOS ══ */
app.get('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('contactos').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, clientes: data || [], contactos: data || [] });
});

app.post('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('contactos').insert(req.body).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, cliente: data });
});

/* ══ PAÑOS ══ */
app.get('/api/panos', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('panos').select('*').order('id');
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, panos: data || [] });
});

app.post('/api/panos', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('panos').insert(req.body).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, pano: data });
});

/* ══ LEADS FRUTILLAR ══ */
app.get('/api/leads', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('leads_frutillar').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, leads: data || [] });
});

app.post('/api/leads', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('leads_frutillar').insert(req.body).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, lead: data });
});

/* ══ COMISIONES ══ */
app.get('/api/comisiones', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('comisiones').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, comisiones: data || [] });
});

app.post('/api/comisiones', authRequired, async (req, res) => {
  const { tipo_operacion, precio, participantes, pano_id } = req.body;
  const pct = tipo_operacion === 'venta' ? 0.02 : tipo_operacion === 'pano' ? 0.01 : 1 / 12;
  const neta = Math.round(precio * pct);
  const iva = Math.round(neta * 0.19);
  const bruta = neta + iva;
  const n = (participantes || ['masterlaw']).length;
  const division = (participantes || ['masterlaw']).map(b => ({
    broker: b,
    monto_bruto: Math.round(bruta / n),
    monto_neto: Math.round(neta / n),
    iva: Math.round(iva / n)
  }));

  const { data, error } = await supabase
    .from('comisiones')
    .insert({
      tipo_operacion,
      precio,
      porcentaje: pct,
      comision_neta: neta,
      iva,
      comision_bruta: bruta,
      participantes: division,
      pano_id: pano_id || null
    })
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, comision: data, division, neta, iva, bruta });
});

/* ══ OFERTAS ══ */
app.get('/api/ofertas', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('ofertas').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, ofertas: data || [] });
});

app.post('/api/ofertas', authRequired, async (req, res) => {
  const { data, error } = await supabase.from('ofertas').insert({ ...req.body }).select().single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, oferta: data });
});

/* ══ AGENTES IA ══ */
app.post('/api/agentes/run', authRequired, async (req, res) => {
  const { agente, input, broker_id } = req.body;
  const sistemas = {
    panos: 'Eres el agente de paños de MasterlawIA Chile. Analiza paños inmobiliarios, detecta deudas TGR y sugiere estrategias de venta.',
    frutillar: 'Eres el agente de Frutillar. Gestiona leads de parcelas, programa contactos y analiza presupuestos de compradores.',
    comisiones: 'Eres el agente de comisiones de MasterlawIA. Calcula divisiones exactas con IVA y genera liquidaciones.',
    publicidad: 'Eres el agente de publicidad de MasterlawIA. Genera textos optimizados para portales inmobiliarios chilenos.',
    juridico: 'Eres el agente jurídico de MasterlawIA. Redacta borradores, revisa antecedentes y alerta vencimientos; no inventes hechos ni presentes una inferencia como conclusión jurídica definitiva.'
  };

  const systemPrompt = sistemas[agente] || 'Eres un agente IA de MasterlawIA Chile. Ayuda con tareas inmobiliarias y jurídicas.';
  const start = Date.now();

  try {
    const ai = await geminiGenerate([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input || 'Revisar estado actual y alertas pendientes.' }
    ], 800);

    const duracion = Date.now() - start;
    await supabase.from('agentes_logs').insert({
      agente,
      trigger_tipo: 'api',
      input_resumen: (input || '').substring(0, 100),
      output_resumen: ai.text.substring(0, 100),
      duracion_ms: duracion,
      estado: 'ok',
      modelo: ai.model,
      broker_id: broker_id || null
    });

    res.json({ ok: true, output: ai.text, duracion, proveedor: 'gemini', modelo: ai.model });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

/* ══ IA CONSULTA — acepta con o sin auth ══ */
app.post('/api/ia/consulta', async (req, res) => {
  const { mensaje, historial, sistema, modelo } = req.body;
  if (!mensaje) return res.status(400).json({ ok: false, error: 'Mensaje requerido' });

  const systemPrompt = sistema || 'Eres MasterlawIA, asistente jurídico e inmobiliario para Chile. Responde en español, claro y práctico. No inventes antecedentes ausentes.';
  const msgs = [
    { role: 'system', content: systemPrompt },
    ...(historial || []).slice(-8),
    { role: 'user', content: mensaje }
  ];

  try {
    const ai = await geminiGenerate(msgs, 1200, modelo);
    return res.json({ ok: true, proveedor: 'gemini', modelo: ai.model, respuesta: ai.text, coordinador: 'chatgpt' });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

/* ══ IA STATUS ══ */
app.get('/api/ia/status', (req, res) => {
  res.json({
    ok: true,
    runtime: 'gemini',
    gemini: !!GEMINI_KEY,
    modelo: GEMINI_MODEL,
    coordinador: 'chatgpt',
    modo: 'Gemini ejecuta; ChatGPT coordina'
  });
});

/* ══ MARKETPLACE KEYS ══ */
app.post('/api/marketplace/keys', authRequired, async (req, res) => {
  const { portal, api_key, token, cuenta_id, webhook_url } = req.body;
  const { data, error } = await supabase
    .from('marketplace_keys')
    .upsert({
      portal,
      api_key_encrypted: api_key,
      token_encrypted: token,
      cuenta_id,
      webhook_url,
      activo: true
    })
    .select()
    .single();
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, portal: data });
});

/* ══ 404 ══ */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado: ' + req.path });
});

/* ══ LOCAL ══ */
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`MasterlawIA API corriendo en puerto ${PORT}`));
}

module.exports = app;
