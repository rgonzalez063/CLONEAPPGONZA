-- Appraisal adjustment support tool (working name: appraisal-support)
-- Postgres 15+. Access: row level security, every user-owned table has user_id.
-- Times are timestamptz (UTC). Money is integer cents; per-unit rates are numeric(14,4) dollars.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- users
-- Supabase Auth owns auth.users; this table holds app profile data.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- templates
create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  state text not null,                    -- 'TX'
  mls text not null,                      -- 'HARMLS'
  property_type text not null,            -- 'SFR'
  settings jsonb not null default '{}',   -- paired tolerances, group defs, sensitivity trim, exclude rules, cost defaults, quality tables
  features jsonb not null default '[]',   -- ordered list of feature keys + custom feature defs
  dataset_names jsonb not null default '["Dataset 1","Dataset 2","Dataset 3"]',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mls, property_type, name)
);
create index on templates (user_id, mls, property_type);

-- ---------------------------------------------------------------- sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  template_id uuid references templates(id) on delete set null,
  name text not null,
  state text not null,
  mls text not null,
  property_type text not null,
  effective_date date not null,
  settings jsonb not null default '{}',   -- session overrides of the template settings
  subject jsonb not null default '{}',    -- address, zip, gla, baths, stories, quality, effective_age | depreciation_pct, basement, garage, ...
  favorite boolean not null default false,
  cloned_from uuid references sessions(id) on delete set null,
  status text not null default 'open' check (status in ('open','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on sessions (user_id, updated_at desc);
create index on sessions (user_id, favorite) where favorite;

-- Every meaningful click, for the activity log and for rebuilding state.
create table session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  ts timestamptz not null default now(),
  event_type text not null,
  detail jsonb not null default '{}'
);
create index on session_events (session_id, ts);

-- ---------------------------------------------------------------- datasets and properties
create table datasets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  name text not null,
  source_files jsonb not null default '[]',   -- file names, row counts, upload times
  excluded_after_effective int not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, slot)
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  mls_number text not null,
  address text,
  sale_price integer not null check (sale_price > 0),   -- whole dollars
  contract_date date,
  sale_date date not null,
  concessions integer not null default 0,
  financing text,
  sale_type text,                     -- standard | reo | short_sale
  property_rights text,               -- fee_simple | leasehold
  gla integer,
  lot_size integer,                   -- sqft
  year_built smallint,
  beds smallint,
  baths_full smallint,
  baths_half smallint,
  stories numeric(3,1),
  garage_spaces numeric(3,1),
  carport_spaces numeric(3,1),
  basement_size integer,
  basement_fin_size integer,
  condition text,                     -- C1..C6 with plus steps
  quality text,                       -- Q1..Q6
  features jsonb not null default '{}',   -- views, water, style, sewer, pool, fireplaces, external influence, ...
  raw jsonb not null default '{}',        -- original CSV row
  deleted boolean not null default false,
  edits jsonb not null default '{}',      -- field -> {from,to}
  created_at timestamptz not null default now(),
  unique (dataset_id, mls_number)
);
create index on properties (dataset_id) where not deleted;
create index on properties (dataset_id, sale_date);

-- ---------------------------------------------------------------- analysis
-- One widget per feature the appraiser analyzes.
create table feature_widgets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null,           -- 'gla', 'lot_size', 'baths_full', 'garage', 'condition', 'custom:<slug>'
  position smallint not null,
  unit text,                           -- 'sqft' | 'acres' | 'each' | ...
  done boolean not null default false,
  locked boolean not null default false,
  modeled boolean not null default false,
  chosen_value numeric(14,4),
  constraint_low numeric(14,4),
  constraint_high numeric(14,4),
  snipped boolean not null default false,
  comment_settings jsonb not null default '{}',
  extra_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, feature_key)
);
create index on feature_widgets (session_id, position);

-- Results are derived data. They are recomputed when data, settings or modeling change.
create table method_results (
  id bigint generated always as identity primary key,
  widget_id uuid not null references feature_widgets(id) on delete cascade,
  dataset_id uuid references datasets(id) on delete cascade,
  method text not null check (method in
    ('TPS','APS','GD','SENS','COST','ALLOC','OLS','ROLS','TS','LAD','LMS','RLMS','ModQ')),
  variant text not null default '',    -- 'avg' | 'median' | 'analysis1' | 'analysis2'
  value numeric(14,4),
  mae numeric(14,4),
  mae_se numeric(14,4),
  r_squared numeric(8,6),
  detail jsonb not null default '{}',  -- pairs counts, group stats, trendline, cost steps
  status text not null default 'ok' check (status in ('ok','no_result','excluded')),
  status_reason text,
  computed_at timestamptz not null default now(),
  unique (widget_id, dataset_id, method, variant)
);
create index on method_results (widget_id);

create table matched_pairs (
  id bigint generated always as identity primary key,
  widget_id uuid not null references feature_widgets(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  property_a uuid not null references properties(id) on delete cascade,
  property_b uuid not null references properties(id) on delete cascade,
  kind text not null check (kind in ('true','adjusted')),
  price_diff numeric(14,2) not null,
  feature_diff numeric(14,4) not null,
  rate numeric(14,4) not null,
  outlier boolean not null default false
);
create index on matched_pairs (widget_id, dataset_id);

-- Time adjustment per dataset (transactional step 5).
create table time_adjustments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  basis text not null default 'contract' check (basis in ('contract','sale')),
  model text not null,                 -- poly4 | poly3 | poly2 | linear | log | none | manual
  coefficients jsonb not null default '[]',
  oldest_date date,
  manual_pct_per_month numeric(8,4),
  unique (session_id, dataset_id)
);

-- Peers / prior choices: finished choices are stored per user and anonymized for sharing.
create table adjustment_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  feature_key text not null,
  zip text not null,
  quality text,
  property_type text not null,
  effective_date date not null,
  value numeric(14,4) not null,
  created_at timestamptz not null default now(),
  unique (session_id, feature_key)
);
create index on adjustment_choices (user_id, zip, feature_key, effective_date);

-- Reference tables a user can edit.
create table quality_scales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  uad_quality text not null,           -- 'Q1+', 'Q1', ... 'Q6'
  lifespan_years smallint not null,
  dwelling_quality numeric(3,1) not null,
  pool_quality text,
  patio_quality text,
  unique (user_id, uad_quality)
);
create table condition_ages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  uad_condition text not null,         -- 'C1', 'C2+', ...
  effective_age smallint not null,
  unique (user_id, uad_condition)
);

-- Exported files (PDF/RTF/PNG/CSV) kept for the workfile.
create table exports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                  -- primary_summary | comments | method_overview | feature_details | matched_pairs | settings | property_info | csv
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index on exports (session_id, kind);

-- ---------------------------------------------------------------- row level security
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','templates','sessions','session_events','datasets','properties',
    'feature_widgets','adjustment_choices','quality_scales','condition_ages','exports']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy own_profile on profiles using (id = auth.uid()) with check (id = auth.uid());
create policy own_templates on templates using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_sessions on sessions using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_events on session_events using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_datasets on datasets using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_properties on properties using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_widgets on feature_widgets using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_choices on adjustment_choices using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_quality on quality_scales using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_condition on condition_ages using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_exports on exports using (user_id = auth.uid()) with check (user_id = auth.uid());
-- method_results, matched_pairs, time_adjustments are reached only through widgets/sessions
-- the caller owns, via server-side routes that check ownership (service role); no direct client access.
