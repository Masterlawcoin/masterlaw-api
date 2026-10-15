-- MASTERLAW P2P CONTROL PLANE
-- PREPARED MIGRATION ONLY — DO NOT EXECUTE AUTOMATICALLY.
-- This file is intentionally committed as a reviewable artifact. It does not run by itself.
-- ARC Testnet only: chain_id 5042002.

begin;

-- Reuse the existing Masterlaw identity. Do not create a second exchange user table.
alter table public.usuarios
  add column if not exists kyc_status text,
  add column if not exists kyc_level integer,
  add column if not exists kyc_provider text,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_expires_at timestamptz,
  add column if not exists p2p_blocked boolean not null default false;

-- Wallet ownership is private Masterlaw data. Only the wallet itself is public on ARC.
create table if not exists public.p2p_wallet_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  wallet_address text not null,
  chain_id bigint not null default 5042002 check (chain_id = 5042002),
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','REVOKED','BLOCKED')),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chain_id, wallet_address)
);

create index if not exists p2p_wallet_links_user_idx on public.p2p_wallet_links(user_id);

-- Private Masterlaw mediation/arbitration case. No bank data or ID documents belong on-chain.
create table if not exists public.p2p_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  external_trade_id text not null unique,
  buyer_user_id uuid references public.usuarios(id),
  seller_user_id uuid references public.usuarios(id),
  buyer_wallet text not null,
  seller_wallet text not null,
  chain_id bigint not null default 5042002 check (chain_id = 5042002),
  escrow_address text,
  escrow_trade_id numeric(78,0),
  order_ref text,
  crypto_amount_base_units numeric(78,0) not null check (crypto_amount_base_units > 0),
  fiat_currency text,
  status text not null default 'OPENED' check (status in (
    'OPENED',
    'EVIDENCE_REQUESTED',
    'UNDER_REVIEW',
    'MEDIATION_PROPOSED',
    'AGREEMENT_PENDING_SIGNATURES',
    'ARBITRATION_PENDING',
    'RESOLUTION_APPROVED',
    'ONCHAIN_EXECUTION_PENDING',
    'EXECUTED',
    'CLOSED',
    'BLOCKED'
  )),
  case_hash text,
  resolution_hash text,
  agreement_hash text,
  onchain_tx_hash text,
  risk_snapshot jsonb not null default '{}'::jsonb,
  assigned_to uuid references public.usuarios(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists p2p_cases_status_idx on public.p2p_cases(status);
create index if not exists p2p_cases_buyer_idx on public.p2p_cases(buyer_user_id);
create index if not exists p2p_cases_seller_idx on public.p2p_cases(seller_user_id);
create index if not exists p2p_cases_escrow_trade_idx on public.p2p_cases(chain_id, escrow_address, escrow_trade_id);

-- Append-only audit timeline for mediation and compliance actions.
create table if not exists public.p2p_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.p2p_cases(id) on delete cascade,
  actor_user_id uuid references public.usuarios(id),
  actor_role text,
  event_type text not null,
  event_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists p2p_case_events_case_idx on public.p2p_case_events(case_id, created_at);

-- Evidence metadata only. Documents should live in controlled private storage, referenced here.
create table if not exists public.p2p_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.p2p_cases(id) on delete cascade,
  submitted_by uuid references public.usuarios(id),
  evidence_type text not null,
  storage_ref text not null,
  sha256 text not null,
  visibility text not null default 'CASE_TEAM' check (visibility in ('CASE_TEAM','PARTIES','COMPLIANCE_ONLY')),
  created_at timestamptz not null default now()
);

create index if not exists p2p_evidence_case_idx on public.p2p_evidence(case_id, created_at);

-- Recommended KYC state constraint after existing data is reviewed and normalized:
-- alter table public.usuarios add constraint usuarios_kyc_status_check
--   check (kyc_status is null or kyc_status in ('REGISTERED','KYC_PENDING','VERIFIED','ENHANCED_REVIEW','BLOCKED','REJECTED','EXPIRED'));

-- RLS must be reviewed against the actual Masterlaw auth model before this migration is executed.
-- Do not enable broad client-side write policies. P2P case/evidence writes should be service-side and role checked.

commit;
