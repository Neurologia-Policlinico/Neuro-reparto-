-- =====================================================================
--  Neuro Reparto - schema database Supabase
--  Incollare tutto in: Supabase -> SQL Editor -> New query -> Run
-- =====================================================================

-- ---------- PROFILI (nome visualizzato dei medici) ----------
create table if not exists public.profili (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default ''
);

-- crea automaticamente il profilo quando si aggiunge un utente
create or replace function public.nuovo_profilo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.nuovo_profilo();

-- ---------- REPARTI ----------
create table if not exists public.reparti (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordine int not null default 0
);

-- ---------- LETTI ----------
create table if not exists public.letti (
  id uuid primary key default gen_random_uuid(),
  reparto_id uuid not null references public.reparti(id) on delete cascade,
  nome text not null,                -- es. "1", "2", "12bis"
  ordine int not null default 0,
  creato_il timestamptz not null default now()
);
create index if not exists letti_reparto_idx on public.letti(reparto_id);

-- ---------- PAZIENTI ----------
create table if not exists public.pazienti (
  id uuid primary key default gen_random_uuid(),
  letto_id uuid not null references public.letti(id) on delete cascade,
  reparto_id uuid not null references public.reparti(id) on delete cascade,
  nome text not null,
  note text not null default '',
  dimesso boolean not null default false,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid references auth.users(id)
);
create index if not exists pazienti_reparto_idx on public.pazienti(reparto_id) where not dimesso;
-- un solo paziente attivo per letto
create unique index if not exists un_paziente_per_letto on public.pazienti(letto_id) where not dimesso;

-- ---------- ATTIVITA' (e sotto-attività tramite parent_id) ----------
create table if not exists public.attivita (
  id uuid primary key default gen_random_uuid(),
  paziente_id uuid not null references public.pazienti(id) on delete cascade,
  reparto_id uuid not null references public.reparti(id) on delete cascade,
  parent_id uuid references public.attivita(id) on delete cascade,
  testo text not null,
  urgente boolean not null default false,
  fatta boolean not null default false,
  creata_da uuid references auth.users(id) default auth.uid(),
  creata_il timestamptz not null default now(),
  fatta_da uuid references auth.users(id),
  fatta_il timestamptz
);
create index if not exists attivita_reparto_idx on public.attivita(reparto_id) where not fatta;
create index if not exists attivita_paziente_idx on public.attivita(paziente_id);

-- ---------- ISCRIZIONI ALLE NOTIFICHE PUSH ----------
create table if not exists public.notifiche_iscrizioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  reparti uuid[],                    -- null = tutti i reparti
  creato_il timestamptz not null default now()
);

-- ---------- CONSEGNE PER LA GUARDIA ----------
alter table public.pazienti add column if not exists consegna text not null default '';
alter table public.pazienti add column if not exists gravita smallint not null default 0;   -- 0 nessuna, 1 da monitorare, 2 critico
alter table public.pazienti add column if not exists rianimazione text;                     -- null, 'si', 'limitata', 'no'
alter table public.pazienti add column if not exists allergie text not null default '';
alter table public.pazienti add column if not exists consegna_il timestamptz;
alter table public.pazienti add column if not exists consegna_da uuid references auth.users(id);
alter table public.attivita add column if not exists guardia boolean not null default false; -- valutazione per la guardia
alter table public.attivita add column if not exists ora text;                              -- es. "22:00"
create index if not exists attivita_guardia_idx on public.attivita(guardia) where guardia and not fatta;

-- ---------- aggiornamento automatico data modifica paziente / consegna ----------
create or replace function public.tocca_paziente()
returns trigger language plpgsql as $$
begin
  new.aggiornato_il := now();
  new.aggiornato_da := auth.uid();
  if new.consegna is distinct from old.consegna
     or new.gravita is distinct from old.gravita
     or new.rianimazione is distinct from old.rianimazione
     or new.allergie is distinct from old.allergie then
    new.consegna_il := now();
    new.consegna_da := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists pazienti_tocca on public.pazienti;
create trigger pazienti_tocca before update on public.pazienti
  for each row execute function public.tocca_paziente();

-- =====================================================================
--  SICUREZZA (Row Level Security): solo utenti autenticati
-- =====================================================================
alter table public.profili               enable row level security;
alter table public.reparti               enable row level security;
alter table public.letti                 enable row level security;
alter table public.pazienti              enable row level security;
alter table public.attivita              enable row level security;
alter table public.notifiche_iscrizioni  enable row level security;

drop policy if exists "leggi profili" on public.profili;
create policy "leggi profili" on public.profili for select to authenticated using (true);
drop policy if exists "modifica proprio profilo" on public.profili;
create policy "modifica proprio profilo" on public.profili for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "leggi reparti" on public.reparti;
create policy "leggi reparti" on public.reparti for select to authenticated using (true);

drop policy if exists "medici letti" on public.letti;
create policy "medici letti" on public.letti for all to authenticated using (true) with check (true);

drop policy if exists "medici pazienti" on public.pazienti;
create policy "medici pazienti" on public.pazienti for all to authenticated using (true) with check (true);

drop policy if exists "medici attivita" on public.attivita;
create policy "medici attivita" on public.attivita for all to authenticated using (true) with check (true);

drop policy if exists "proprie iscrizioni" on public.notifiche_iscrizioni;
create policy "proprie iscrizioni" on public.notifiche_iscrizioni for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
--  TEMPO REALE
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.letti;    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.pazienti; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.attivita; exception when duplicate_object then null; end;
  end if;
end $$;

-- =====================================================================
--  DATI INIZIALI: reparti e letti
-- =====================================================================
insert into public.reparti (nome, ordine) values
  ('Stroke', 1),
  ('PUCA', 2),
  ('Ospedaliera', 3),
  ('Amaducci Uomini', 4),
  ('Amaducci Donne', 5)
on conflict (nome) do nothing;

insert into public.letti (reparto_id, nome, ordine)
select r.id, n::text, n
from public.reparti r
cross join lateral generate_series(1, case r.nome
    when 'Stroke' then 8
    when 'PUCA' then 8
    when 'Ospedaliera' then 8
    when 'Amaducci Uomini' then 10
    when 'Amaducci Donne' then 10
  end) as n
where not exists (select 1 from public.letti l where l.reparto_id = r.id);

-- =====================================================================
--  TRASFERIMENTO paziente in un altro letto (anche di altro reparto)
-- =====================================================================
create or replace function public.trasferisci_paziente(p_paziente uuid, p_letto uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_reparto uuid;
begin
  select reparto_id into v_reparto from public.letti where id = p_letto;
  if v_reparto is null then raise exception 'Letto non trovato'; end if;
  update public.pazienti set letto_id = p_letto, reparto_id = v_reparto where id = p_paziente;
  update public.attivita set reparto_id = v_reparto where paziente_id = p_paziente and reparto_id <> v_reparto;
end $$;
grant execute on function public.trasferisci_paziente(uuid, uuid) to authenticated;

-- =====================================================================
--  PACCHETTI DI ATTIVITA' (modificabili dall'app)
--  voci = [{"t": "testo attività", "f": ["sotto-attività", ...]}, ...]
-- =====================================================================
create table if not exists public.pacchetti (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordine int not null default 0,
  voci jsonb not null default '[]'::jsonb,
  aggiornato_il timestamptz not null default now()
);
alter table public.pacchetti enable row level security;
drop policy if exists "medici pacchetti" on public.pacchetti;
create policy "medici pacchetti" on public.pacchetti for all to authenticated using (true) with check (true);

-- pacchetti iniziali di esempio (inseriti solo se la tabella è vuota): da adattare ai vostri protocolli
insert into public.pacchetti (nome, ordine, voci)
select v.nome, v.ordine, v.voci::jsonb from (values
  ('Ingresso (generale)', 1, '[
    {"t":"Riconciliazione terapia domiciliare"},
    {"t":"Esami ematici di ingresso","f":["Emocromo","Funzionalità renale ed elettroliti","Funzionalità epatica","Coagulazione","Glicemia"]},
    {"t":"ECG"},
    {"t":"Valutazione rischio cadute e lesioni da pressione"},
    {"t":"Contatto con i familiari / caregiver"}
  ]'),
  ('Ictus ischemico', 2, '[
    {"t":"TC encefalo di controllo a 24h"},
    {"t":"RM encefalo"},
    {"t":"Ecocolordoppler TSA"},
    {"t":"Ecocardiogramma"},
    {"t":"Monitoraggio ECG / Holter"},
    {"t":"Esami fattori di rischio","f":["Profilo lipidico","HbA1c","TSH"]},
    {"t":"Screening disfagia"},
    {"t":"Valutazione fisiatrica"},
    {"t":"Valutazione logopedica"},
    {"t":"Impostare terapia antitrombotica"},
    {"t":"Profilassi TVP"}
  ]'),
  ('Post trombolisi / trombectomia', 3, '[
    {"t":"NIHSS seriati"},
    {"t":"Monitoraggio PA"},
    {"t":"Glicemia"},
    {"t":"TC encefalo di controllo a 24h"},
    {"t":"Antitrombotici solo dopo TC di controllo"}
  ]'),
  ('Ictus emorragico', 4, '[
    {"t":"TC encefalo di controllo"},
    {"t":"Angio-TC"},
    {"t":"Controllo PA al target"},
    {"t":"Coagulazione / reverse anticoagulante"},
    {"t":"Consulenza neurochirurgica"},
    {"t":"Screening disfagia"},
    {"t":"Valutazione fisiatrica"}
  ]'),
  ('Crisi epilettica', 5, '[
    {"t":"EEG"},
    {"t":"RM encefalo"},
    {"t":"Esami","f":["Glicemia","Elettroliti, Ca, Mg","CK","Livelli antiepilettici"]},
    {"t":"ECG"},
    {"t":"Valutare terapia antiepilettica"},
    {"t":"Informare su idoneità alla guida"}
  ]'),
  ('Malattia demielinizzante', 6, '[
    {"t":"RM encefalo e midollo con mdc"},
    {"t":"Rachicentesi","f":["Esame chimico-fisico","Bande oligoclonali","Indice IgG"]},
    {"t":"Potenziali evocati"},
    {"t":"Esami","f":["Vitamina D","Autoimmunità","Anticorpi AQP4 / MOG"]},
    {"t":"Programmare terapia"}
  ]'),
  ('Dimissione', 7, '[
    {"t":"Lettera di dimissione"},
    {"t":"Prescrizioni / piani terapeutici"},
    {"t":"Prenotare controllo ambulatoriale"},
    {"t":"Esami da eseguire dopo la dimissione"},
    {"t":"Riabilitazione / continuità assistenziale"}
  ]')
) as v(nome, ordine, voci)
where not exists (select 1 from public.pacchetti);

-- =====================================================================
--  PERMESSI DI ACCESSO ALLE TABELLE (solo utenti autenticati)
--  Nei progetti Supabase recenti le tabelle create via SQL non sono
--  accessibili all'app senza questi permessi. Chi può fare cosa riga per
--  riga resta deciso dalle regole RLS definite sopra.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.trasferisci_paziente(uuid, uuid) to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
-- nessun accesso per chi non ha fatto login
revoke all on all tables in schema public from anon;
