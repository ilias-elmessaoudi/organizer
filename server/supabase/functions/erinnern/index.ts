// Supabase Edge Function „erinnern": schickt fällige Organizer-Erinnerungen als Push aufs Handy.
// Läuft jede Minute (pg_cron, siehe ../push.sql). SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY gibt es automatisch.
// Den Push-Schlüssel erzeugt die Funktion beim ersten Lauf selbst und legt ihn in push_schluessel ab
// (nur der Server kommt dran) – so muss nie jemand einen geheimen Schlüssel von Hand eintragen.
// Die normale JWT-Prüfung von Supabase bleibt an: Minuten-Auftrag und App rufen mit dem öffentlichen anon-Schlüssel auf
// (den setzt die Einrichtung aus SUPABASE_ANON_KEY selbst ein), der Test zusätzlich mit der Anmeldung des Nutzers.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import postgres from 'npm:postgres@3.4.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Beim ersten Start legt die Funktion ihre Tabellen und den Minuten-Auftrag selbst an (SUPABASE_DB_URL gibt es automatisch).
// Dieselben Befehle stehen zum Nachlesen in ../push.sql.
const EINRICHTUNG = `-- Push-Mitteilungen für den Organizer (einmal im Supabase-SQL-Editor ausführen).
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
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer __ANON__'),
    body := '{}'::jsonb
  )
$$);
`;
let eingerichtet: Promise<void> | null = null;
function einrichten() {
  eingerichtet ||= (async () => {
    const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
    try { await db.unsafe(EINRICHTUNG.replace('__ANON__', Deno.env.get('SUPABASE_ANON_KEY')!)); } finally { await db.end(); }
  })().catch((f) => { eingerichtet = null; throw f; });
  return eingerichtet;
}

let schluessel: { oeffentlich: string; privat: string } | null = null;
async function vapid() {
  if (schluessel) return schluessel;
  const { data } = await sb.from('push_schluessel').select('oeffentlich, privat').eq('id', 1).maybeSingle();
  if (data) schluessel = data;
  else {
    const neu = webpush.generateVAPIDKeys();
    await sb.from('push_schluessel').insert({ id: 1, oeffentlich: neu.publicKey, privat: neu.privateKey });
    const { data: d2 } = await sb.from('push_schluessel').select('oeffentlich, privat').eq('id', 1).single(); // falls zwei Läufe gleichzeitig
    schluessel = d2;
  }
  webpush.setVapidDetails('https://ilias-elmessaoudi.github.io/organizer/', schluessel!.oeffentlich, schluessel!.privat);
  return schluessel!;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const antwort = (daten: unknown, status = 200) => new Response(JSON.stringify(daten), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Erinnerung = { zeit: string; titel: string; text?: string; schluessel: string };

async function schicken(besitzer: string, nachricht: { titel: string; text?: string; schluessel: string }) {
  const { data: abos } = await sb.from('push_abos').select('*').eq('besitzer', besitzer);
  let ok = 0;
  for (const a of abos || []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ titel: nachricht.titel, text: nachricht.text || '', tag: nachricht.schluessel }), { TTL: 600, urgency: 'high' });
      ok++;
    } catch (f) {
      const code = (f as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_abos').delete().eq('endpoint', a.endpoint); // Handy hat sich abgemeldet
      else console.error('Push fehlgeschlagen', code, String(f).slice(0, 200));
    }
  }
  return ok;
}

// Rückfall für Einträge, die Phoenix angelegt hat, während die App nicht offen war (keine Serien)
function direkteErinnerungen(eintraege: { id: string; daten: Record<string, unknown> }[]): Erinnerung[] {
  const aus: Erinnerung[] = [];
  for (const { id, daten: e } of eintraege) {
    if (e.typ === 'termin' && typeof e.beginn === 'string' && !e.wiederholung) {
      const b = new Date(e.beginn);
      if (e.beginn.length <= 10) continue;
      aus.push({ zeit: new Date(b.getTime() - 30 * 60e3).toISOString(), titel: `${e.titel}`, text: `In 30 Minuten (${b.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })})${e.ort ? ' · ' + e.ort : ''}`, schluessel: `t:${id}:${b.toISOString()}` });
    }
    if (e.typ === 'aufgabe' && typeof e.faellig === 'string' && e.status !== 'erledigt' && !e.wiederholung) {
      let f = new Date(e.faellig);
      const nurTag = e.faellig.length <= 10 || /T00:00(:00)?/.test(e.faellig);
      if (nurTag) f = new Date(f.getTime() + 8 * 3600e3);
      aus.push({ zeit: f.toISOString(), titel: `Fällig: ${e.titel}`, text: 'Aufgabe im Organizer', schluessel: `a:${id}:${f.toISOString().slice(0, 10)}` });
    }
  }
  return aus;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try { await einrichten(); } catch (f) { return antwort({ fehler: 'Einrichtung: ' + String(f).slice(0, 300) }, 500); }
  const { oeffentlich } = await vapid();
  if (req.method === 'GET') return antwort({ oeffentlich });
  const body = await req.json().catch(() => ({}));

  // Test-Mitteilung aus der App (angemeldeter Nutzer)
  if (body.test) {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return antwort({ fehler: 'nicht angemeldet' }, 401);
    const n = await schicken(user.id, { titel: 'Organizer', text: 'Mitteilungen funktionieren 👍', schluessel: 'test-' + Date.now() });
    return antwort({ geschickt: n });
  }

  const jetzt = Date.now();
  const { data: abos } = await sb.from('push_abos').select('besitzer');
  const besitzer = [...new Set((abos || []).map((a) => a.besitzer))];
  let gesamt = 0;
  for (const b of besitzer) {
    const { data: zeilen } = await sb.from('eintraege').select('id, daten').eq('besitzer', b).eq('art', 'organizer').eq('geloescht', false);
    const plan = (zeilen || []).find((z) => z.id === 'push-plan')?.daten as { liste?: Erinnerung[]; aus?: boolean } | undefined;
    if (plan?.aus) continue;
    const alle = new Map<string, Erinnerung>();
    for (const e of direkteErinnerungen((zeilen || []).filter((z) => z.daten) as never)) alle.set(e.schluessel, e);
    for (const e of plan?.liste || []) alle.set(e.schluessel, e); // die App weiß es genauer (Serien, Wochenplan, Einstellungen)
    // fällig: in den letzten 3 Minuten oder in den nächsten 30 Sekunden
    const faellig = [...alle.values()].filter((e) => { const t = Date.parse(e.zeit); return t <= jetzt + 30e3 && t > jetzt - 3 * 60e3; });
    if (!faellig.length) continue;
    const { data: schon } = await sb.from('push_gesendet').select('schluessel').eq('besitzer', b).in('schluessel', faellig.map((e) => e.schluessel));
    const gesendet = new Set((schon || []).map((s) => s.schluessel));
    for (const e of faellig) {
      if (gesendet.has(e.schluessel)) continue;
      await sb.from('push_gesendet').insert({ besitzer: b, schluessel: e.schluessel });
      gesamt += await schicken(b, e);
    }
  }
  // Alte Merker aufräumen
  if (new Date().getMinutes() === 0) await sb.from('push_gesendet').delete().lt('zeit', new Date(jetzt - 3 * 864e5).toISOString());
  return antwort({ geschickt: gesamt });
});
