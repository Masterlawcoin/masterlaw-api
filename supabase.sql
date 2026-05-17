-- ══════════════════════════════════════
-- MASTERLAW IA — Tablas Supabase
-- Pegar en SQL Editor de supabase.com
-- ══════════════════════════════════════

-- 1. USUARIOS
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  nombre text,
  rut text,
  telefono text,
  plan text default 'gratis' check (plan in ('gratis','starter','professional','enterprise')),
  rol text default 'user' check (rol in ('user','admin','franquiciado','corredor')),
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. CONTRATOS
create table if not exists contratos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  tipo text not null,
  partes jsonb default '{}',
  contenido text,
  pdf_url text,
  estado text default 'draft' check (estado in ('draft','pending','signed','cancelled')),
  monto text,
  moneda text default 'CLP',
  firma_estado jsonb default '{}',
  metadatos jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. PROPIEDADES
create table if not exists propiedades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  tipo text,
  operacion text check (operacion in ('venta','arriendo','arriendo_temporal')),
  titulo text,
  descripcion text,
  direccion text,
  comuna text,
  ciudad text default 'Santiago',
  precio numeric,
  moneda text default 'CLP',
  uf_precio numeric,
  dormitorios int default 0,
  banos int default 1,
  m2_total numeric,
  m2_util numeric,
  estado text default 'borrador' check (estado in ('borrador','publicada','negociando','vendida','arrendada')),
  portales jsonb default '[]',
  fotos jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. TAREAS DE AGENTES
create table if not exists tareas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  agente text,
  descripcion text not null,
  area text,
  estado text default 'pendiente' check (estado in ('pendiente','en_proceso','completada','cancelada')),
  prioridad text default 'normal' check (prioridad in ('baja','normal','alta','urgente')),
  fecha_limite timestamptz,
  resultado jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. LOGS DE AGENTES
create table if not exists agentes_logs (
  id uuid default gen_random_uuid() primary key,
  agente text not null,
  accion text,
  input jsonb,
  output jsonb,
  tokens_usados int default 0,
  duracion_ms int,
  error text,
  created_at timestamptz default now()
);

-- 6. CLIENTES
create table if not exists clientes (
  id uuid default gen_random_uuid() primary key,
  admin_id uuid references users(id),
  nombre text not null,
  rut text,
  email text,
  telefono text,
  tipo text default 'persona' check (tipo in ('persona','empresa')),
  razon_social text,
  plan_contratado text,
  notas text,
  created_at timestamptz default now()
);

-- 7. MENSAJES / NOTIFICACIONES
create table if not exists mensajes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id) on delete cascade,
  de text,
  tipo text,
  contenido text,
  leido boolean default false,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- ══ ROW LEVEL SECURITY ══
alter table users        enable row level security;
alter table contratos    enable row level security;
alter table propiedades  enable row level security;
alter table tareas       enable row level security;
alter table clientes     enable row level security;
alter table mensajes     enable row level security;

-- Políticas básicas (cada usuario ve solo sus datos)
create policy "users_own" on users for all using (auth.uid() = id);
create policy "contratos_own" on contratos for all using (auth.uid() = user_id);
create policy "propiedades_own" on propiedades for all using (auth.uid() = user_id);
create policy "tareas_own" on tareas for all using (auth.uid() = user_id);
create policy "clientes_own" on clientes for all using (auth.uid() = admin_id);
create policy "mensajes_own" on mensajes for all using (auth.uid() = user_id);

-- Logs son públicos para insertar (los agentes los escriben)
create policy "logs_insert" on agentes_logs for insert with check (true);
create policy "logs_admin" on agentes_logs for select using (true);
