-- Appraisal support tool: schema. Authorization is enforced in the data layer (lib/server/repo.ts):
-- every query is scoped by user_id, and tests prove a second user gets nothing back.


create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Opaque login tokens. Only a hash is stored, so a database leak does not leak live sessions.
create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index auth_sessions_user_idx on auth_sessions (user_id);

create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  state text not null,
  mls text not null,
  property_type text not null,
  settings jsonb not null default '{}',      -- transactional, paired sales, comment options
  features jsonb not null default '[]',      -- ordered widgets: key plus comment options
  dataset_names jsonb not null default '[]',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mls, property_type, name)
);
create index templates_user_idx on templates (user_id, mls, property_type);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  template_id uuid references templates(id) on delete set null,
  name text not null,
  state text not null,
  mls text not null,
  property_type text not null,
  effective_date date not null,
  settings jsonb not null default '{}',
  subject jsonb,
  widgets jsonb not null default '{}',
  widget_order jsonb not null default '[]',   -- jsonb does not keep key order, and the order of features is part of the layout
  data_version integer not null default 0,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id, updated_at desc);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null,
  excluded_after_effective integer not null default 0,
  unique (session_id, slot)
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  mls_number text not null,
  sale_price integer not null check (sale_price > 0),
  sale_date date not null,
  contract_date date,
  status text not null default 'closed',
  vals jsonb not null default '{}',          -- numeric features and group flags
  meta jsonb,                                -- concessions, financing, special conditions, ownership
  src_text jsonb,                            -- source text columns used by feature groups
  deleted boolean not null default false,
  edits jsonb,
  unique (dataset_id, mls_number)
);
create index properties_dataset_idx on properties (dataset_id);
