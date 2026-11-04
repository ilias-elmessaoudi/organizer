-- Push-Mitteilungen für den Organizer (einmal im Supabase-SQL-Editor ausführen).
-- Ilias (2026-11-04): „Ich kriege keine Nachricht – z. B. Volleyball."
-- Das Handy meldet sich in push_abos an; die Funktion „erinnern" läuft jede Minute,
-- liest die Erinnerungsliste (Eintrag push-plan) und schickt fällige Mitteilungen.

create table if not exists public.push_abos (
  endpoint  text primary key,
  besitzer  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh    text not null,
  auth      text not null,
  geraet    text,
  erstellt  timestamptz not null default now()
);
alter table public.push_abos enable row level security;
drop policy if exists "eigene abos" on public.push_abos;
create policy "eigene abos" on public.push_abos for all
  using (besitzer = auth.uid()) with check (besitzer = auth.uid());

-- Push-Schlüssel des Servers (legt die Funktion selbst an; keine Regel = nur der Server kommt dran)
create table if not exists public.push_schluessel (
  id          int primary key,
  oeffentlich text not null,
  privat      text not null
);
alter table public.push_schluessel enable row level security;

-- Was schon geschickt wurde (nur der Server schreibt hier, deshalb keine Regel für Nutzer)
create table if not exists public.push_gesendet (
  besitzer   uuid not null,
  schluessel text not null,
  zeit       timestamptz not null default now(),
  primary key (besitzer, schluessel)
);
alter table public.push_gesendet enable row level security;

-- Jede Minute die Funktion anstoßen
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('organizer-erinnern') where exists (select 1 from cron.job where jobname = 'organizer-erinnern');
select cron.schedule('organizer-erinnern', '* * * * *', $$
  select net.http_post(
    url := 'https://dhtblosutrzawchscgpt.supabase.co/functions/v1/erinnern',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || '<anon-Schlüssel aus config.js>'),
    body := '{}'::jsonb
  )
$$);
