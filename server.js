require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({
  origin: ['https://masterlaw.cl', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
}

// ══ HEALTH ══
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'MasterlawIA API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    ia: !!process.env.OPENAI_API_KEY
  });
});

// ══ AUTH ══
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, rut, telefono } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authError) return res.status(400).json({ error: authError.message });
    const { data: user, error: dbError } = await supabase
      .from('users')
      .insert({ id: authData.user.id, email, nombre, rut, telefono })
      .select().single();
    if (dbError) return res.status(400).json({ error: dbError.message });
    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, plan: user.plan },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const { data: user } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, plan: user.plan },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
  res.json({ ok: true, user });
});

// ══ DASHBOARD ══
app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [
      { data: user },
      { data: contratos },
      { data: props },
      { data: tareas }
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', uid).single(),
      supabase.from('contratos').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('propiedades').select('*').eq('user_id', uid),
      supabase.from('tareas').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10)
    ]);
    res.json({
      ok: true,
      user,
      contratos: contratos || [],
      propiedades: props || [],
      tareas: tareas || [],
      stats: {
        contratos_total: contratos?.length || 0,
        contratos_firmados: contratos?.filter(c => c.estado === 'signed').length || 0,
        contratos_pendientes: contratos?.filter(c => c.estado === 'pending').length || 0,
        propiedades_total: props?.length || 0,
        tareas_pendientes: tareas?.filter(t => t.estado === 'pendiente').length || 0
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══ CONTRATOS ══
app.get('/api/contratos', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contratos').select('*').eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, contratos: data });
});

app.post('/api/contratos', authRequired, async (req, res) => {
  const { tipo, partes, monto } = req.body;
  if (!tipo) return res.status(400).json({ error: 'Tipo requerido' });
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: 'Eres un abogado chileno experto. Genera contratos legales completos segun legislacion chilena vigente. Incluye articulos especificos del Codigo Civil o Codigo del Trabajo segun corresponda.'
        },
        {
          role: 'user',
          content: `Genera un ${tipo} completo segun derecho chileno 2025. Datos: ${JSON.stringify(partes || {})}. Monto: ${monto || 'A convenir'}`
        }
      ]
    });
    const contenido = completion.choices[0].message.content;
    const { data: contrato, error } = await supabase
      .from('contratos')
      .insert({ user_id: req.user.id, tipo, partes, contenido, monto, estado: 'draft' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, contrato });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/contratos/:id/estado', authRequired, async (req, res) => {
  const { estado } = req.body;
  const { data, error } = await supabase
    .from('contratos').update({ estado, updated_at: new Date() })
    .eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, contrato: data });
});

// ══ PROPIEDADES ══
app.get('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades').select('*').eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, propiedades: data });
});

app.post('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades').insert({ ...req.body, user_id: req.user.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, propiedad: data });
});

// ══ TAREAS ══
app.get('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('tareas').select('*').eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tareas: data });
});

app.post('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('tareas').insert({ ...req.body, user_id: req.user.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tarea: data });
});

app.put('/api/tareas/:id', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('tareas').update({ ...req.body, updated_at: new Date() })
    .eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tarea: data });
});

// ══ IA CONSULTA ══
app.post('/api/ia/consulta', authRequired, async (req, res) => {
  const { mensaje, modo, historial } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    const msgs = [
      {
        role: 'system',
        content: `Eres MasterlawIA, asistente juridico enterprise especializado en derecho chileno. Usuario: ${user?.nombre || 'Usuario'}. Modo: ${modo || 'guia'}. Responde en espanol chileno. Cita leyes especificas (Codigo Civil, Codigo del Trabajo, Ley 19.799, Ley 18.101). Respuestas concisas y utiles.`
      },
      ...(historial || []).slice(-8),
      { role: 'user', content: mensaje }
    ];
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: msgs
    });
    const respuesta = completion.choices[0].message.content;
    res.json({ ok: true, respuesta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══ CLIENTES ══
app.get('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('clientes').select('*').eq('admin_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, clientes: data });
});

app.post('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('clientes').insert({ ...req.body, admin_id: req.user.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, cliente: data });
});

// ══ 404 ══
app.use((req, res) => res.status(404).json({ error: 'Endpoint no encontrado' }));

// ══ INICIO LOCAL ══

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Masterlaw API corriendo puerto ${PORT}`);
  });
}

// ══ EXPORT VERCEL ══

module.exports = app;