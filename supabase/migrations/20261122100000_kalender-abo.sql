-- =============================================================================
-- Das Kalender-Abo (22. November 2026)
-- =============================================================================
-- Je Person ein geheimer Link, den die Kalender-App abonniert (Function
-- `kalender`): nur lesend, nur die eigenen Aufgaben, erst nach „Plan senden".
-- Der Link steht nur als Prüfsumme da, und kein Client darf die Tabelle lesen
-- oder schreiben. Begründung und Einzelheiten am selben Block in `schema.sql`.
-- =============================================================================

create table if not exists public.kalender_abos (
  person_id       uuid primary key,
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  token_hash      text not null unique,
  sprache         text not null default 'de' check (sprache ~ '^[a-z]{2}$'),
  erstellt_at     timestamptz not null default now(),
  abgerufen_at    timestamptz,

  constraint kalender_abos_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete cascade
);

create index if not exists kalender_abos_congregation_idx
  on public.kalender_abos (congregation_id);

alter table public.kalender_abos enable row level security;
revoke all on public.kalender_abos from anon, authenticated;
