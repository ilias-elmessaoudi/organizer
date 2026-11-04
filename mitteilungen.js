// Mitteilungen aufs Handy: Anmelden fürs Push und die Erinnerungsliste für den Server.
// Der Server (Supabase-Funktion „erinnern", siehe server/) liest jede Minute den Eintrag push-plan
// und schickt, was fällig ist – auch wenn der PC aus und die App zu ist.

const FUNKTION = 'https://dhtblosutrzawchscgpt.supabase.co/functions/v1/erinnern';

// Was erinnert wird und wie lange vorher (Minuten)
export const ARTEN = {
  termin: { name: 'Termine', vorher: 30 },
  aufgabe: { name: 'Fällige Aufgaben (8 Uhr bzw. zur Uhrzeit)', vorher: 0 },
  volleyball: { name: 'Volleyball (45 Min vorher – Fahrt + Sachen)', vorher: 45 },
  training: { name: 'Calisthenics-Training', vorher: 10 },
  lernen: { name: 'Lernblöcke', vorher: 0 },
  stream: { name: 'Stream', vorher: 15 },
  schlaf: { name: 'Schlafenszeit (30 Min vorher: Zocken beenden)', vorher: 30 },
  check: { name: 'Wochen-Check', vorher: 0 },
};

let A; // { zst, speichern, hinweis, $, esc, client(), terminListe(von, bis), aufgabenListe(von, bis), planListe(von, tage) }
export function mitteilungenEinrichten(api) { A = api; }

const einst = () => A.zst.eintraege.get('push-plan')?.arten || Object.fromEntries(Object.keys(ARTEN).map((k) => [k, true]));
const istIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const alsApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function schluesselBytes(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
}

async function abo() {
  const reg = await navigator.serviceWorker?.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function einschalten() {
  if (!A.zst.uid) return A.hinweis('Erst anmelden – die Erinnerungen hängen an deinem Konto.');
  if (istIos() && !alsApp()) return A.hinweis('Auf dem iPhone geht das nur aus der App auf dem Home-Bildschirm: Teilen → „Zum Home-Bildschirm“, dann dort öffnen.', 9000);
  if (!('PushManager' in window)) return A.hinweis('Dieser Browser kann keine Mitteilungen empfangen.', 6000);
  const erlaubt = await Notification.requestPermission();
  if (erlaubt !== 'granted') return A.hinweis('Mitteilungen sind nicht erlaubt. In den Einstellungen des Handys/Browsers für den Organizer erlauben.', 8000);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // öffentlichen Schlüssel holt die App vom Server
    const k = window.HEFT_SUPABASE.key;
    const { oeffentlich } = await (await fetch(FUNKTION, { headers: { apikey: k, Authorization: 'Bearer ' + k } })).json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluesselBytes(oeffentlich) });
  }
  const j = sub.toJSON();
  const { error } = await A.client().from('push_abos').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, geraet: geraetName() }, { onConflict: 'endpoint' });
  if (error) return A.hinweis('Anmelden fürs Push hat nicht geklappt: ' + error.message, 8000);
  A.hinweis('Mitteilungen sind an. Probier „Test schicken“.');
}
async function ausschalten() {
  const sub = await abo();
  if (sub) { await A.client().from('push_abos').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  A.hinweis('Mitteilungen auf diesem Gerät aus.');
}
const geraetName = () => (istIos() ? 'iPhone/iPad' : /android/i.test(navigator.userAgent) ? 'Android' : 'PC') + ' · ' + new Date().toLocaleDateString('de-DE');

async function testSchicken() {
  const { data } = await A.client().auth.getSession();
  const r = await fetch(FUNKTION, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.HEFT_SUPABASE.key, Authorization: 'Bearer ' + data.session?.access_token }, body: JSON.stringify({ test: true }) });
  const j = await r.json().catch(() => ({}));
  A.hinweis(r.ok ? (j.geschickt ? `Test geschickt an ${j.geschickt} Gerät(e).` : 'Kein Gerät angemeldet – erst „Einschalten“.') : 'Test ging nicht: ' + (j.fehler || r.status), 6000);
}

export async function mitteilungenEinstellungen(box, schliessen) {
  const sub = await abo().catch(() => null);
  const an = !!sub && Notification.permission === 'granted';
  const e = einst();
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Mitteilungen</b><span></span></div>
    <div class="feld">Auf diesem Gerät<div class="status-liste"><span class="${an ? 'ok' : 'aus'}">${an ? 'Mitteilungen sind an' : 'Mitteilungen sind aus'}</span>
      ${istIos() && !alsApp() ? '<span class="aus">iPhone: Öffne den Organizer vom Home-Bildschirm (Teilen → „Zum Home-Bildschirm“), sonst gehen keine Mitteilungen.</span>' : ''}</div></div>
    <div class="knoepfe">${an ? '<button class="btn" data-a="aus">Ausschalten</button><button class="btn haupt" data-a="test">Test schicken</button>' : '<button class="btn haupt" data-a="an">Einschalten</button>'}</div>
    <div class="feld" style="margin-top:18px">Woran erinnert wird</div>
    ${Object.entries(ARTEN).map(([k, v]) => `<label class="schalter"><input type="checkbox" data-art="${k}" ${e[k] !== false ? 'checked' : ''}><span>${v.name}</span></label>`).join('')}
    <p class="meta">Die Mitteilungen kommen vom Server – auch wenn der PC aus und der Organizer zu ist. Änderungen im Plan gelten, sobald der Organizer sie einmal gespeichert hat.</p>`;
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'zu') return schliessen();
    if (a === 'an') { await einschalten(); return mitteilungenEinstellungen(box, schliessen); }
    if (a === 'aus') { await ausschalten(); return mitteilungenEinstellungen(box, schliessen); }
    if (a === 'test') return testSchicken();
  };
  box.onchange = async (ev) => {
    const c = ev.target.closest('[data-art]'); if (!c) return;
    const arten = { ...einst(), [c.dataset.art]: c.checked };
    await planSpeichern(arten);
  };
}

/* ===== Erinnerungsliste für die nächsten 14 Tage ===== */

const hm = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const um = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function liste(arten) {
  // ab heute 0 Uhr – so ändert sich die Liste nur bei echten Änderungen (und einmal am Tag)
  const von = new Date(new Date().setHours(0, 0, 0, 0)), bis = new Date(+von + 14 * 864e5), aus = [];
  if (arten.termin !== false) for (const { e, wann, ganztags } of A.terminListe(von, bis)) {
    const zeit = ganztags ? new Date(new Date(wann).setHours(8, 0, 0, 0)) : new Date(wann.getTime() - ARTEN.termin.vorher * 60e3);
    aus.push({ zeit: zeit.toISOString(), titel: e.titel, text: ganztags ? 'Heute' : `Um ${hm(wann)} – in 30 Minuten${e.ort ? ' · ' + e.ort : ''}`, schluessel: `t:${e.id}:${wann.toISOString()}` });
  }
  if (arten.aufgabe !== false) for (const { e, wann, nurTag } of A.aufgabenListe(von, bis)) {
    const zeit = nurTag ? new Date(new Date(wann).setHours(8, 0, 0, 0)) : wann;
    aus.push({ zeit: zeit.toISOString(), titel: `Fällig: ${e.titel}`, text: nurTag ? 'Heute fällig' : `Um ${hm(wann)}`, schluessel: `a:${e.id}:${wann.toISOString().slice(0, 10)}` });
  }
  for (const { datum, b } of A.planListe(14)) {
    if (!ARTEN[b.kat] || arten[b.kat] === false || b.optional) continue;
    const start = new Date(datum); start.setHours(0, b.von, 0, 0);
    const zeit = new Date(start.getTime() - ARTEN[b.kat].vorher * 60e3);
    const titel = b.titel.split(' – ')[0];
    const text = b.kat === 'schlaf' ? `Um ${um(b.von)} ist Schlafenszeit – Zocken langsam beenden.`
      : b.kat === 'volleyball' ? `Um ${um(b.von)} – Sachen packen, in 15 Min losfahren.`
      : ARTEN[b.kat].vorher ? `Um ${um(b.von)} – in ${ARTEN[b.kat].vorher} Minuten` : `Jetzt, bis ${um(b.bis)}`;
    aus.push({ zeit: zeit.toISOString(), titel, text, schluessel: `p:${b.id}:${start.toISOString().slice(0, 10)}` });
  }
  return aus.filter((x) => Date.parse(x.zeit) >= +von).sort((a, b) => a.zeit.localeCompare(b.zeit)).slice(0, 400);
}

async function planSpeichern(arten = einst()) {
  const alt = A.zst.eintraege.get('push-plan');
  const neu = liste(arten);
  if (alt && JSON.stringify(alt.liste) === JSON.stringify(neu) && JSON.stringify(alt.arten) === JSON.stringify(arten)) return;
  await A.speichern({ ...(alt || { id: 'push-plan', typ: 'plan', unterart: 'push', titel: 'Erinnerungen', bereich: 'privat', erstellt: Date.now() }), liste: neu, arten });
}

let warte = 0;
export function erinnerungenAktualisieren() {
  if (!A?.zst.uid) return;
  clearTimeout(warte);
  warte = setTimeout(() => planSpeichern().catch((f) => console.warn('Erinnerungen', f)), 2500);
}
export const erinnerungsListe = () => liste(einst()); // zum Nachsehen
