// ══════════════════════════════════════════════════════
//  MASTERLAW IA — API Server v1.0
//  Express + Supabase + Claude API
//  Ejecutar: node server.js (o npm run dev con nodemon)
// ══════════════════════════════════════════════════════
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── SUPABASE ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── MIDDLEWARE ──
app.use(cors({
  origin: [
    'https://masterlaw.cl',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { error: 'Demasiadas solicitudes, intenta en 15 minutos' }
});
const iaLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Límite de consultas IA por minuto alcanzado' }
});
app.use('/api/', limiter);
app.use('/api/ia/', iaLimiter);

// ── AUTH MIDDLEWARE ──
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ══════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, rut, telefono } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  try {
    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authError) return res.status(400).json({ error: authError.message });

    // Crear perfil en tabla users
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

    res.json({ ok: true, token, user: { id: user.id, email, nombre, plan: 'gratis', rol: 'user' } });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor: ' + e.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const { data: user } = await supabase
      .from('users').select('*').eq('id', authData.user.id).single();

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

// GET /api/auth/me
app.get('/api/auth/me', authRequired, async (req, res) => {
  const { data: user } = await supabase
    .from('users').select('*').eq('id', req.user.id).single();
  res.json({ ok: true, user });
});

// ══════════════════════════════════════════════════════
//  CONTRATOS ROUTES
// ══════════════════════════════════════════════════════

// GET /api/contratos
app.get('/api/contratos', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contratos')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, contratos: data, total: data.length });
});

// POST /api/contratos
app.post('/api/contratos', authRequired, async (req, res) => {
  const { tipo, partes, monto, modalidad_firma } = req.body;
  if (!tipo) return res.status(400).json({ error: 'Tipo de contrato requerido' });

  try {
    // Generar contenido con Claude
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `Eres un abogado chileno experto. Genera contratos legales completos según la legislación chilena vigente.
Incluye: artículos específicos del Código Civil o Código del Trabajo según corresponda.
Formato: texto legal formal, en español chileno, listo para firma.
${modalidad_firma === 'fea' ? 'Incluye cláusula de aceptación de firma electrónica avanzada según Ley 19.799.' : ''}`,
      messages: [{
        role: 'user',
        content: `Genera un ${tipo} completo según derecho chileno 2025.
Datos: ${JSON.stringify(partes || {})}
Monto: ${monto || 'A convenir'}
Incluye todas las cláusulas necesarias.`
      }]
    });

    const contenido = msg.content[0].text;

    // Guardar en Supabase
    const { data: contrato, error } = await supabase
      .from('contratos')
      .insert({
        user_id: req.user.id,
        tipo, partes, contenido, monto,
        estado: 'draft',
        metadatos: { tokens_usados: msg.usage.input_tokens + msg.usage.output_tokens }
      })
      .select().single();

    if (error) return res.status(500).json({ error: error.message });

    // Log del agente
    await supabase.from('agentes_logs').insert({
      agente: 'agente_legal',
      accion: 'generar_contrato',
      input: { tipo, partes },
      output: { contrato_id: contrato.id },
      tokens_usados: msg.usage.input_tokens + msg.usage.output_tokens
    });

    res.json({ ok: true, contrato });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/contratos/:id/estado
app.put('/api/contratos/:id/estado', authRequired, async (req, res) => {
  const { estado } = req.body;
  const { data, error } = await supabase
    .from('contratos')
    .update({ estado, updated_at: new Date() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, contrato: data });
});

// ══════════════════════════════════════════════════════
//  PROPIEDADES ROUTES
// ══════════════════════════════════════════════════════

// GET /api/propiedades
app.get('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, propiedades: data });
});

// POST /api/propiedades
app.post('/api/propiedades', authRequired, async (req, res) => {
  const campos = req.body;
  const { data, error } = await supabase
    .from('propiedades')
    .insert({ ...campos, user_id: req.user.id })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, propiedad: data });
});

// ══════════════════════════════════════════════════════
//  TAREAS ROUTES
// ══════════════════════════════════════════════════════

// GET /api/tareas
app.get('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('tareas')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tareas: data });
});

// POST /api/tareas
app.post('/api/tareas', authRequired, async (req, res) => {
  const { descripcion, area, prioridad, fecha_limite, agente } = req.body;
  const { data, error } = await supabase
    .from('tareas')
    .insert({ user_id: req.user.id, descripcion, area, prioridad, fecha_limite, agente })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tarea: data });
});

// PUT /api/tareas/:id
app.put('/api/tareas/:id', authRequired, async (req, res) => {
  const { estado } = req.body;
  const { data, error } = await supabase
    .from('tareas')
    .update({ estado, updated_at: new Date() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, tarea: data });
});

// ══════════════════════════════════════════════════════
//  IA ROUTES — Claude API directo
// ══════════════════════════════════════════════════════

// POST /api/ia/consulta
app.post('/api/ia/consulta', authRequired, async (req, res) => {
  const { mensaje, modo, historial } = req.body;
  if (!mensaje) return res.status(400).json({ error: 'Mensaje requerido' });

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Obtener datos del usuario para contexto
    const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    const { data: contratos } = await supabase.from('contratos').select('count').eq('user_id', req.user.id);
    const { data: props } = await supabase.from('propiedades').select('count').eq('user_id', req.user.id);
    const { data: tareas } = await supabase.from('tareas').select('count').eq('user_id', req.user.id).eq('estado', 'pendiente');

    const sistema = `Eres MasterlawIA, asistente jurídico enterprise especializado en derecho chileno.
Usuario: ${user?.nombre || 'Usuario'} · Plan: ${user?.plan || 'starter'}
Datos del sistema:
- ${contratos?.[0]?.count || 0} contratos en total
- ${props?.[0]?.count || 0} propiedades registradas  
- ${tareas?.[0]?.count || 0} tareas pendientes
Modo actual: ${modo || 'guia'}
Responde en español chileno. Cita leyes específicas cuando corresponda (Código Civil, Código del Trabajo, Ley 19.799, Ley 18.101).
Respuestas claras y accionables. Formato markdown cuando ayude.`;

    const msgs = [
      ...(historial || []).slice(-8),
      { role: 'user', content: mensaje }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: sistema,
      messages: msgs
    });

    const respuesta = response.content[0].text;

    // Log
    await supabase.from('agentes_logs').insert({
      agente: 'agente_legal_ia',
      accion: 'consulta_' + (modo || 'guia'),
      input: { mensaje: mensaje.substring(0, 200) },
      output: { respuesta: respuesta.substring(0, 200) },
      tokens_usados: response.usage.input_tokens + response.usage.output_tokens
    });

    res.json({ ok: true, respuesta, tokens: response.usage });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════
//  DASHBOARD — Stats combinadas
// ══════════════════════════════════════════════════════
app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [
      { data: user },
      { data: contratos },
      { data: props },
      { data: tareas },
      { data: mensajes },
      { data: logs }
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', uid).single(),
      supabase.from('contratos').select('id,tipo,estado,monto,created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
      supabase.from('propiedades').select('id,tipo,operacion,precio,estado').eq('user_id', uid),
      supabase.from('tareas').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10),
      supabase.from('mensajes').select('count').eq('user_id', uid).eq('leido', false),
      supabase.from('agentes_logs').select('agente,created_at').order('created_at', { ascending: false }).limit(20)
    ]);

    res.json({
      ok: true,
      stats: {
        contratos_total: contratos?.length || 0,
        contratos_firmados: contratos?.filter(c => c.estado === 'signed').length || 0,
        contratos_pendientes: contratos?.filter(c => c.estado === 'pending').length || 0,
        propiedades_total: props?.length || 0,
        tareas_pendientes: tareas?.filter(t => t.estado === 'pendiente').length || 0,
        mensajes_sin_leer: mensajes?.[0]?.count || 0
      },
      contratos_recientes: contratos || [],
      propiedades: props || [],
      tareas: tareas || [],
      actividad_agentes: logs || [],
      user
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'MasterlawIA API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    claude: !!process.env.ANTHROPIC_API_KEY
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── INICIO ──
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   MasterlawIA API v1.0 — Puerto ${PORT}  ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  Supabase: ${process.env.SUPABASE_URL ? '✅ Conectado' : '❌ Sin configurar'}       ║`);
  console.log(`║  Claude:   ${process.env.ANTHROPIC_API_KEY ? '✅ Conectado' : '❌ Sin configurar'}       ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});

module.exports = app;
