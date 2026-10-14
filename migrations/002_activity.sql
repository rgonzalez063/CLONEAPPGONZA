-- Activity log: what the appraiser did in a session, in order. Cleared together with the session.
create table session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  ts timestamptz not null default now(),
  event_type text not null,
  detail jsonb not null default '{}'
);
create index session_events_session_idx on session_events (session_id, ts desc, id desc);
