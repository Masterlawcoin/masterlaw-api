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
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_KEY
);

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors({
  origin: [
    'https://masterlaw.cl',
    'https://www.masterlaw.cl',
    'https://masterlaw-api.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Token requerido'
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: 'Token inválido'
    });
  }
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      rol: user.rol || 'cliente',
      plan: user.plan || 'starter'
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/* HEALTH */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'MasterlawIA API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    chatgpt: !!process.env.OPENAI_API_KEY
  });
});

/* AUTH REGISTER */
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, rut, telefono, plan, rol } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'Email y contraseña requeridos'
    });
  }

  try {
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

    if (authError) {
      return res.status(400).json({
        ok: false,
        error: authError.message
      });
    }

    const { data: user, error: dbError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        email,
        nombre,
        rut,
        telefono,
        plan: plan || 'starter',
        rol: rol || 'cliente',
        activo: true
      })
      .select()
      .single();

    if (dbError) {
      return res.status(400).json({
        ok: false,
        error: dbError.message
      });
    }

    const token = signToken(user);

    res.json({
      ok: true,
      token,
      user
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

/* AUTH LOGIN */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'Email y contraseña requeridos'
    });
  }

  try {
    const { data: authData, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      return res.status(401).json({
        ok: false,
        error: 'Credenciales incorrectas'
      });
    }

    let { data: user, error: userError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      const created = await supabase
        .from('usuarios')
        .insert({
          id: authData.user.id,
          email,
          nombre: email.split('@')[0],
          rol: 'cliente',
          plan: 'starter',
          activo: true
        })
        .select()
        .single();

      if (created.error) {
        return res.status(400).json({
          ok: false,
          error: created.error.message
        });
      }

      user = created.data;
    }

    const token = signToken(user);

    res.json({
      ok: true,
      token,
      user
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

/* AUTH ME */
app.get('/api/auth/me', authRequired, async (req, res) => {
  const { data: user, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) {
    return res.status(401).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    user
  });
});

/* HUB */
app.get('/api/hub', authRequired, async (req, res) => {
  try {
    const [usuarios, propiedades, leads, ofertas, pendientes] =
      await Promise.all([
        supabase.from('usuarios').select('*'),
        supabase.from('propiedades_venta').select('*'),
        supabase.from('leads_frutillar').select('*'),
        supabase.from('ofertas').select('*'),
        supabase.from('pendientes').select('*')
      ]);

    res.json({
      ok: true,
      usuarios: usuarios.data || [],
      propiedades: propiedades.data || [],
      leads: leads.data || [],
      ofertas: ofertas.data || [],
      pendientes: pendientes.data || []
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

/* DASHBOARD */
app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;

    const [
      usuario,
      contratos,
      propiedadesVenta,
      pendientes,
      leads,
      ofertas,
      tramitaciones,
      comisiones,
      contactos,
      servicios
    ] = await Promise.all([
      supabase.from('usuarios').select('*').eq('id', uid).single(),
      supabase.from('contratos').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10),
      supabase.from('propiedades_venta').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('pendientes').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('leads_frutillar').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('ofertas').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('tramitaciones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('comisiones').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('contactos').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('servicios').select('*')
    ]);

    const props = propiedadesVenta.data || [];
    const tasks = pendientes.data || [];
    const cont = contratos.data || [];

    res.json({
      ok: true,
      user: usuario.data,
      usuario: usuario.data,
      contratos: cont,
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
        contratos_total: cont.length,
        contratos_firmados: cont.filter(c => c.estado === 'signed' || c.estado === 'firmado').length,
        contratos_pendientes: cont.filter(c => c.estado === 'pending' || c.estado === 'pendiente').length,
        propiedades_total: props.length,
        tareas_pendientes: tasks.filter(t => t.estado === 'pendiente' || t.completado === false).length,
        leads_total: (leads.data || []).length,
        ofertas_total: (ofertas.data || []).length,
        tramitaciones_total: (tramitaciones.data || []).length
      }
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

/* CONTRATOS */
app.get('/api/contratos', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contratos')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    contratos: data || []
  });
});

app.post('/api/contratos', authRequired, async (req, res) => {
  const { tipo, partes, monto } = req.body;

  if (!tipo) {
    return res.status(400).json({
      ok: false,
      error: 'Tipo requerido'
    });
  }

  try {
    let contenido = '';

    try {
      const completion = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: 'Eres MasterlawIA, abogado chileno experto. Genera contratos claros, completos y útiles según derecho chileno.'
          },
          {
            role: 'user',
            content: `Genera un ${tipo} completo según derecho chileno. Datos: ${JSON.stringify(partes || {})}. Monto: ${monto || 'A convenir'}`
          }
        ]
      });

      contenido = completion.choices[0].message.content;
    } catch {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: 'Eres MasterlawIA, abogado chileno experto. Genera contratos claros, completos y útiles según derecho chileno.'
          },
          {
            role: 'user',
            content: `Genera un ${tipo} completo según derecho chileno. Datos: ${JSON.stringify(partes || {})}. Monto: ${monto || 'A convenir'}`
          }
        ]
      });

      contenido = completion.choices[0].message.content;
    }

    const { data: contrato, error } = await supabase
      .from('contratos')
      .insert({
        user_id: req.user.id,
        tipo,
        partes,
        contenido,
        monto,
        estado: 'draft'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    res.json({
      ok: true,
      contrato
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

app.put('/api/contratos/:id/estado', authRequired, async (req, res) => {
  const { estado } = req.body;

  const { data, error } = await supabase
    .from('contratos')
    .update({
      estado,
      updated_at: new Date()
    })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    contrato: data
  });
});

/* PROPIEDADES */
app.get('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades_venta')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    propiedades: data || []
  });
});

app.post('/api/propiedades', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades_venta')
    .insert({
      ...req.body,
      broker_id: req.user.id
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    propiedad: data
  });
});

/* TAREAS / PENDIENTES */
app.get('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('pendientes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    tareas: data || [],
    pendientes: data || []
  });
});

app.post('/api/tareas', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('pendientes')
    .insert({
      ...req.body,
      contacto: req.body.contacto || req.user.email || null
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    tarea: data
  });
});

app.put('/api/tareas/:id', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('pendientes')
    .update({
      ...req.body
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    tarea: data
  });
});

/* IA CONSULTA */
app.post('/api/ia/consulta', authRequired, async (req, res) => {
  const { mensaje, modo, historial } = req.body;

  if (!mensaje) {
    return res.status(400).json({
      ok: false,
      error: 'Mensaje requerido'
    });
  }

  try {
    const { data: user } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', req.user.id)
      .single();

    const systemPrompt = `
Eres MasterlawIA, asistente jurídico, inmobiliario y empresarial para Chile.
Usuario: ${user?.nombre || 'Usuario'}.
Modo: ${modo || 'guia'}.

Prioridad:
1. Responder práctico y claro.
2. En materia inmobiliaria chilena considerar compraventa, promesa, comisión, corretaje, estudio de títulos, arriendos, posesiones efectivas y trámites.
3. Si corresponde, mencionar que debe revisar abogado antes de firmar.
4. Usar español chileno.
`;

    const msgs = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...(historial || []).slice(-8),
      {
        role: 'user',
        content: mensaje
      }
    ];

    try {
      const completion = await deepseek.chat.completions.create({
        model: 'deepseek-chat',
        max_tokens: 1200,
        messages: msgs
      });

      return res.json({
        ok: true,
        proveedor: 'deepseek',
        respuesta: completion.choices[0].message.content
      });
    } catch (deepError) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1200,
        messages: msgs
      });

      return res.json({
        ok: true,
        proveedor: 'chatgpt',
        respuesta: completion.choices[0].message.content
      });
    }
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

/* IA STATUS */
app.get('/api/ia/status', (req, res) => {
  res.json({
    ok: true,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    chatgpt: !!process.env.OPENAI_API_KEY,
    modo: 'deepseek primero, chatgpt respaldo'
  });
});

/* CLIENTES */
app.get('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contactos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    clientes: data || [],
    contactos: data || []
  });
});

app.post('/api/clientes', authRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('contactos')
    .insert(req.body)
    .select()
    .single();

  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    cliente: data
  });
});

/* 404 */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Endpoint no encontrado'
  });
});

/* LOCAL SOLO SI CORRESPONDE */
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Masterlaw API corriendo puerto ${PORT}`);
  });
}

/* EXPORT VERCEL */
module.exports = app;