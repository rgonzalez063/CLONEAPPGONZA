-- Market files: every listing of every status for a session (up to two files), used for the 1004MC and market summaries.
create table market_files (
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 2),
  name text not null default '',
  listings jsonb not null default '[]',
  notes jsonb not null default '{}', -- the appraiser's conclusions and wording for this file
  updated_at timestamptz not null default now(),
  primary key (session_id, slot)
);
