// Organizer: Ideen, Aufgaben, Termine und Notizen – auf allen Geräten, Phoenix trägt per Sprache ein.
// Daten liegen im selben Supabase-Projekt wie Heft (Tabelle "eintraege", art = "organizer").

import { galaxie } from './galaxie.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ART = 'organizer';

const I = {
  heute: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  idee: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  aufgabe: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  termin: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  notiz: '<svg viewBox="0 0 24 24"><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></svg>',
  alle: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  lupe: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  mikro: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  haken: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  phoenix: '<svg viewBox="0 0 24 24"><path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 1-7z"/></svg>',
  galaxie: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  logo: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h9M5 17h6"/><circle cx="18" cy="16" r="3"/></svg>',
};

const BEREICHE = {
  business: { name: 'Business', farbe: 'var(--business)', hex: '#4c9dff' },
  stream: { name: 'Stream & Content', farbe: 'var(--stream)', hex: '#c46bff' },
  privat: { name: 'Privat', farbe: 'var(--privat)', hex: '#41f2a3' },
  volleyball: { name: 'Volleyball', farbe: 'var(--volleyball)', hex: '#ffa94d' },
  sonstiges: { name: 'Sonstiges', farbe: 'var(--sonstiges)', hex: '#9aa3c7' },
};
const TYPEN = { idee: 'Idee', aufgabe: 'Aufgabe', termin: 'Termin', notiz: 'Notiz' };

// Grobe Einordnung ohne KI (Phoenix sortiert genauer, wenn er einträgt)
const STICHWORTE = {
  stream: ['stream', 'twitch', 'tiktok', 'youtube', 'clip', 'video', 'content', 'overlay', 'kanal', 'follower', 'zuschauer', 'live', 'discord', 'shorts', 'reel', 'instagram'],
  business: ['business', 'kunde', 'webdesign', 'website', 'shop', 'dropshipping', 'geld', 'umsatz', 'verkauf', 'firma', 'rechnung', 'marketing', 'ads', 'produkt', 'bewerbung', 'ausbildung', 'investition'],
  volleyball: ['volleyball', 'training', 'spiel', 'turnier', 'mannschaft', 'aufschlag', 'block', 'pritschen', 'baggern'],
  privat: ['freund', 'familie', 'geburtstag', 'urlaub', 'essen', 'zimmer', 'outfit', 'friseur', 'arzt', 'einkaufen', 'film', 'serie', 'party', 'mama', 'papa'],
};
function bereichRaten(text) {
  const t = text.toLowerCase();
  let best = 'sonstiges', punkte = 0;
  for (const [b, worte] of Object.entries(STICHWORTE)) { const p = worte.filter((w) => t.includes(w)).length; if (p > punkte) { punkte = p; best = b; } }
  return best;
}

/* ================= Zustand ================= */

const zst = {
  ansicht: localStorage.getItem('org.ansicht') || 'heute',
  bereich: 'alle',
  suche: '',
  neuTyp: 'idee',
  eintraege: new Map(), // id -> eintrag
  uid: null,
};
let client = null;

const cacheLaden = () => { try { for (const e of JSON.parse(localStorage.getItem('org.cache') || '[]')) zst.eintraege.set(e.id, e); } catch {} };
const cacheSichern = () => { try { localStorage.setItem('org.cache', JSON.stringify([...zst.eintraege.values()])); } catch {} };
const warteschlange = () => { try { return JSON.parse(localStorage.getItem('org.offen') || '[]'); } catch { return []; } };
const warteschlangeSetzen = (l) => localStorage.setItem('org.offen', JSON.stringify(l));

function hinweis(t, ms = 2500) {
  const h = $('#hinweis'); h.textContent = t; h.hidden = false;
  clearTimeout(hinweis.t); hinweis.t = setTimeout(() => (h.hidden = true), ms);
}

/* ================= Cloud ================= */

async function start() {
  cacheLaden();
  zeichnen();
  const { url, key } = window.HEFT_SUPABASE || {};
  client = window.supabase.createClient(url, key, { auth: { persistSession: true, storageKey: 'heft-anmeldung', autoRefreshToken: true } });
  const { data } = await client.auth.getSession();
  sitzung(data.session);
  client.auth.onAuthStateChange((_e, s) => sitzung(s));
}

// Statusanzeige oben rechts (wie bei Phoenix) und Uhr
function statusZeigen(text, unter, fehler = false) {
  $('#status-titel').textContent = text; $('#status-unter').textContent = unter;
  $('#status-unter').style.color = fehler ? 'var(--warn)' : '';
}
setInterval(() => { $('#uhr').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }, 1000);
addEventListener('offline', () => statusZeigen('Offline Mode', 'Changes queued', true));
addEventListener('online', () => statusZeigen('Phoenix Link Active', 'All Systems Nominal'));

function sitzung(s) {
  const vorher = zst.uid;
  zst.uid = s?.user?.id || null;
  $('#konto').className = 'konto' + (zst.uid ? '' : ' aus');
  $('#konto').innerHTML = `<i></i>${zst.uid ? esc(s.user.email) : 'Nicht angemeldet'}`;
  if (zst.uid && zst.uid !== vorher) { laden(); live(); }
  if (!zst.uid) { zeichnen(); statusZeigen('Link Offline', 'Login required', true); }
  else statusZeigen('Phoenix Link Active', navigator.onLine ? 'All Systems Nominal' : 'Offline · queued', !navigator.onLine);
}

async function laden() {
  const { data, error } = await client.from('eintraege').select('id, daten, geaendert, geloescht').eq('art', ART);
  if (error) { statusZeigen('Sync Error', error.message.slice(0, 40), true); return hinweis('Laden fehlgeschlagen: ' + error.message); }
  const offen = new Set(warteschlange().map((e) => e.id));
  for (const z of data) {
    if (offen.has(z.id)) continue;
    if (z.geloescht) zst.eintraege.delete(z.id);
    else zst.eintraege.set(z.id, { ...z.daten, id: z.id, geaendert: z.geaendert });
  }
  cacheSichern();
  zeichnen();
  nachholen();
}

// Live: Was Phoenix oder ein anderes Gerät einträgt, erscheint sofort
let kanal;
function live() {
  kanal?.unsubscribe();
  kanal = client.channel('organizer')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eintraege', filter: `art=eq.${ART}` }, (p) => {
      const z = p.new || p.old;
      if (!z?.id) return;
      if (p.eventType === 'DELETE' || z.geloescht) zst.eintraege.delete(z.id);
      else {
        const neu = !zst.eintraege.has(z.id);
        zst.eintraege.set(z.id, { ...z.daten, id: z.id, geaendert: z.geaendert });
        if (neu && z.daten?.quelle === 'phoenix') hinweis(`Phoenix hat notiert: ${z.daten.titel}`, 4000);
      }
      cacheSichern(); zeichnen();
    })
    .subscribe();
}
// Ersatz, falls Live nicht durchkommt
setInterval(() => { if (zst.uid && !document.hidden) laden(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && zst.uid) laden(); });
addEventListener('online', () => nachholen());

async function speichern(e) {
  e.geaendert = Date.now();
  zst.eintraege.set(e.id, e);
  cacheSichern(); zeichnen();
  warteschlangeSetzen([...warteschlange().filter((x) => x.id !== e.id), { id: e.id, geloescht: false }]);
  await nachholen();
}
async function loeschen(id) {
  zst.eintraege.delete(id);
  cacheSichern(); zeichnen();
  warteschlangeSetzen([...warteschlange().filter((x) => x.id !== id), { id, geloescht: true, zeit: Date.now() }]);
  await nachholen();
}
async function nachholen() {
  if (!zst.uid || !navigator.onLine) return;
  const offen = warteschlange();
  if (!offen.length) return;
  const zeilen = offen.map((o) => {
    if (o.geloescht) return { besitzer: zst.uid, art: ART, id: o.id, daten: null, geloescht: true, geaendert: o.zeit };
    const e = zst.eintraege.get(o.id);
    if (!e) return null;
    const { id, ...daten } = e;
    return { besitzer: zst.uid, art: ART, id, daten, geloescht: false, geaendert: e.geaendert };
  }).filter(Boolean);
  const { error } = await client.from('eintraege').upsert(zeilen, { onConflict: 'besitzer,art,id' });
  if (error) return hinweis('Speichern in der Cloud fehlgeschlagen – wird später erneut versucht.');
  warteschlangeSetzen(warteschlange().filter((o) => !offen.some((x) => x.id === o.id)));
}

/* ================= Hilfen ================= */

const heuteStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const tagText = (iso, mitZeit = true) => {
  if (!iso) return '';
  const d = new Date(iso), h = heuteStart(), t = Math.round((new Date(d).setHours(0, 0, 0, 0) - h) / 864e5);
  const tag = t === 0 ? 'Heute' : t === 1 ? 'Morgen' : t === -1 ? 'Gestern' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const zeit = mitZeit && iso.length > 10 && !(d.getHours() === 0 && d.getMinutes() === 0) ? ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  return tag + zeit;
};
const ueberfaellig = (e) => e.faellig && e.status !== 'erledigt' && new Date(e.faellig) < heuteStart();
const istHeute = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

function gefiltert(typ) {
  const q = zst.suche.toLowerCase();
  return [...zst.eintraege.values()].filter((e) =>
    (!typ || e.typ === typ) && (zst.bereich === 'alle' || e.bereich === zst.bereich)
    && (!q || [e.titel, e.text, e.ausbau, ...(e.stichworte || [])].join(' ').toLowerCase().includes(q)));
}

/* ================= Darstellung ================= */

const ANSICHTEN = { heute: ['Kommando', I.heute], galaxie: ['Galaxie', I.galaxie], idee: ['Ideen', I.idee], aufgabe: ['Aufgaben', I.aufgabe], termin: ['Termine', I.termin], notiz: ['Notizen', I.notiz], alle: ['Alles', I.alle] };

function zeichnen() {
  const zahl = (t) => [...zst.eintraege.values()].filter((e) => e.typ === t && e.status !== 'erledigt' && e.status !== 'archiv').length;
  $('#navi').innerHTML = Object.entries(ANSICHTEN).map(([k, [n, ic]]) => `<button data-ansicht="${k}" class="${k === zst.ansicht ? 'an' : ''}">${ic}${n}${TYPEN[k] ? `<span class="zahl">${zahl(k) || ''}</span>` : ''}</button>`).join('')
    + '<div class="titel">Bereiche</div>' + Object.entries(BEREICHE).map(([k, b]) => `<button data-bereich="${k}" class="${zst.bereich === k ? 'an' : ''}"><span class="punkt" style="background:${b.farbe}"></span>${b.name}</button>`).join('');
  $('#tabs').innerHTML = ['heute', 'galaxie', 'idee', 'aufgabe', 'termin'].map((k) => `<button data-ansicht="${k}" class="${k === zst.ansicht ? 'an' : ''}">${ANSICHTEN[k][1]}${ANSICHTEN[k][0]}</button>`).join('');
  $('#titel').textContent = ANSICHTEN[zst.ansicht][0];
  $('#art-wahl').innerHTML = Object.entries(TYPEN).map(([k, n]) => `<button data-typ="${k}" class="${k === zst.neuTyp ? 'an' : ''}">${I[k]}${n}</button>`).join('');
  $('#neu-text').placeholder = { idee: 'Neue Idee …', aufgabe: 'Neue Aufgabe …', termin: 'Neuer Termin …', notiz: 'Neue Notiz …' }[zst.neuTyp];
  $('#filter').innerHTML = `<button data-bereich="alle" class="${zst.bereich === 'alle' ? 'an' : ''}">Alle</button>` + Object.entries(BEREICHE).map(([k, b]) => `<button data-bereich="${k}" class="${zst.bereich === k ? 'an' : ''}"><i style="background:${b.farbe}"></i>${b.name}</button>`).join('');
  const ziel = $('#inhalt');
  if (!zst.uid && !zst.eintraege.size) { ziel.innerHTML = anmeldeFormular(); return anmeldenVerdrahten(); }
  ziel.innerHTML = ({ heute: heuteAnsicht, galaxie: galaxieAnsicht, idee: ideenAnsicht, aufgabe: aufgabenAnsicht, termin: termineAnsicht, notiz: notizenAnsicht, alle: allesAnsicht })[zst.ansicht]();
  galaxieEinhaengen();
}

/* ================= Ideen-Galaxie ================= */

let gx = null;
const gxCanvas = document.createElement('canvas');
function galaxieFeld(gross = false) {
  return `<div class="panel galaxie-feld" id="galaxie-platz">
    <div class="galaxie-kopf"><span>Ideen-Galaxie</span><small id="gx-statistik"></small></div>
    <div class="legende">${Object.values(BEREICHE).map((b) => `<span><i style="background:${b.hex};box-shadow:0 0 6px ${b.hex}"></i>${b.name}</span>`).join('')}</div>
    <div class="galaxie-fuss"><small>${gross ? 'Ziehen dreht · Rad / zwei Finger zoomen · Stern antippen öffnet' : 'Ziehen dreht · Stern antippen öffnet'}</small><b>${zst.uid ? 'ONLINE' : 'OFFLINE'}</b></div></div>`;
}
function galaxieEinhaengen() {
  const platz = $('#galaxie-platz');
  if (!platz) return;
  platz.prepend(gxCanvas);
  gx ||= galaxie(gxCanvas, {
    farben: Object.fromEntries(Object.entries(BEREICHE).map(([k, b]) => [k, b.hex])),
    namen: Object.fromEntries(Object.entries(BEREICHE).map(([k, b]) => [k, b.name])),
    beiKlick: (e) => details(e.id),
  });
  gx.setzen(gefiltert().filter((e) => e.status !== 'archiv'));
  const st = gx.statistik;
  $('#gx-statistik').textContent = `${st.sterne} Sterne · ${st.verbindungen} Verbindungen`;
}
function galaxieAnsicht() { return `<div class="galaxie-gross">${galaxieFeld(true)}</div>`; }

function karte(e) {
  const b = BEREICHE[e.bereich] || BEREICHE.sonstiges;
  return `<div class="karte" data-id="${e.id}" style="--farbe:${b.farbe}"><b>${esc(e.titel)}</b>${e.text ? `<p>${esc(e.text)}</p>` : ''}
    <div class="fuss"><span class="marke-bereich">${b.name}</span>${(e.stichworte || []).slice(0, 4).map((s) => `<span class="tag">#${esc(s)}</span>`).join('')}
    ${e.ausbau ? '<span class="ausgebaut">✓ ausgebaut</span>' : ''}${e.quelle === 'phoenix' ? `<span class="phoenix">${I.phoenix}Phoenix</span>` : ''}</div></div>`;
}
function aufgabeZeile(e) {
  const b = BEREICHE[e.bereich] || BEREICHE.sonstiges;
  const unter = [e.faellig ? `<small class="${ueberfaellig(e) ? 'ueber' : ''}">${tagText(e.faellig)}</small>` : '', `<small>${b.name}</small>`].filter(Boolean).join(' · ');
  return `<div class="zeile ${e.status === 'erledigt' ? 'erledigt' : ''}" data-id="${e.id}" style="--farbe:${b.farbe}"><button class="haken" data-haken="${e.id}" title="Erledigt">${I.haken}</button>
    <div class="mitte"><b>${e.prioritaet >= 3 ? '<span class="prio">!!! </span>' : e.prioritaet === 2 ? '<span class="prio">!! </span>' : ''}${esc(e.titel)}</b>${unter}</div>${e.quelle === 'phoenix' ? `<span class="phoenix">${I.phoenix}</span>` : ''}</div>`;
}
function terminZeile(e) {
  const b = BEREICHE[e.bereich] || BEREICHE.sonstiges, d = e.beginn ? new Date(e.beginn) : null;
  return `<div class="zeile" data-id="${e.id}" style="--farbe:${b.farbe}"><span class="streifen"></span><div class="uhr"><b>${d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–'}</b><small>${d ? d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : ''}</small></div>
    <div class="mitte"><b>${esc(e.titel)}</b><small>${[tagText(e.beginn, false), e.ort, e.google ? 'in Google' : ''].filter(Boolean).map(esc).join(' · ')}</small></div>${e.quelle === 'phoenix' ? `<span class="phoenix">${I.phoenix}</span>` : ''}</div>`;
}
const liste = (zeilen, leer) => zeilen.length ? `<div class="liste">${zeilen.join('')}</div>` : `<div class="leer">${leer}</div>`;
const abschnitt = (t, unter = '') => `<div class="abschnitt"><h2>${t}</h2><small>${unter}</small></div>`;

function heuteAnsicht() {
  const aufgaben = gefiltert('aufgabe').filter((e) => e.status !== 'erledigt' && (ueberfaellig(e) || istHeute(e.faellig) || (!e.faellig && e.prioritaet >= 3)))
    .sort((a, b) => (a.faellig || '9').localeCompare(b.faellig || '9'));
  const termine = gefiltert('termin').filter((e) => e.beginn && new Date(e.beginn) >= heuteStart() && new Date(e.beginn) < new Date(heuteStart().getTime() + 2 * 864e5)).sort((a, b) => a.beginn.localeCompare(b.beginn));
  const ideen = gefiltert('idee').filter((e) => e.status !== 'archiv').sort((a, b) => b.erstellt - a.erstellt).slice(0, 5);
  const panel = (t, unter, inhalt) => `<div class="panel"><div class="panel-titel"><span>${t}</span><small>${unter}</small></div>${inhalt}</div>`;
  return `<div class="kommando">
    <div class="spalte">
      ${panel('Termine', 'heute & morgen', termine.length ? `<div class="liste">${termine.map(terminZeile).join('')}</div>` : '<div class="leer">Keine Termine. Sag: „Phoenix, trag mir … ein“.</div>')}
      ${panel('Zu erledigen', aufgaben.length ? aufgaben.length + ' offen' : 'alles klar', aufgaben.length ? `<div class="liste">${aufgaben.map(aufgabeZeile).join('')}</div>` : '<div class="leer">Nichts fällig.</div>')}
    </div>
    <div class="spalte mitte-spalte">${galaxieFeld()}</div>
    <div class="spalte">
      ${panel('Neueste Ideen', ideen.length + ' neu', ideen.length ? `<div class="karten">${ideen.map(karte).join('')}</div>` : '<div class="leer">Sag einfach: „Phoenix, ich hab eine Idee: …“</div>')}
    </div>
  </div>`;
}
function ideenAnsicht() {
  const l = gefiltert('idee').filter((e) => e.status !== 'archiv').sort((a, b) => b.erstellt - a.erstellt);
  return l.length ? `<div class="karten">${l.map(karte).join('')}</div>` : '<div class="leer">Keine Ideen gefunden.</div>';
}
function aufgabenAnsicht() {
  const l = gefiltert('aufgabe');
  const offen = l.filter((e) => e.status !== 'erledigt');
  const gruppen = [
    ['Überfällig', offen.filter(ueberfaellig)],
    ['Heute', offen.filter((e) => istHeute(e.faellig))],
    ['Demnächst', offen.filter((e) => e.faellig && !ueberfaellig(e) && !istHeute(e.faellig))],
    ['Ohne Datum', offen.filter((e) => !e.faellig)],
  ];
  const sort = (a, b) => (b.prioritaet || 1) - (a.prioritaet || 1) || (a.faellig || '').localeCompare(b.faellig || '');
  const erledigt = l.filter((e) => e.status === 'erledigt').sort((a, b) => b.geaendert - a.geaendert).slice(0, 15);
  return gruppen.filter(([, g]) => g.length).map(([t, g]) => abschnitt(t, g.length) + liste(g.sort(sort).map(aufgabeZeile))).join('')
    + (offen.length ? '' : '<div class="leer" style="margin-top:12px">Keine offenen Aufgaben.</div>')
    + (erledigt.length ? abschnitt('Erledigt') + liste(erledigt.map(aufgabeZeile)) : '');
}
function termineAnsicht() {
  const l = gefiltert('termin').sort((a, b) => (a.beginn || '').localeCompare(b.beginn || ''));
  const kommend = l.filter((e) => !e.beginn || new Date(e.beginn) >= heuteStart());
  const tage = new Map();
  for (const e of kommend) { const k = e.beginn ? tagText(e.beginn, false) : 'Ohne Datum'; if (!tage.has(k)) tage.set(k, []); tage.get(k).push(e); }
  const vorbei = l.filter((e) => e.beginn && new Date(e.beginn) < heuteStart()).reverse().slice(0, 10);
  return ([...tage].map(([t, g]) => abschnitt(t) + liste(g.map(terminZeile))).join('') || '<div class="leer">Keine kommenden Termine.</div>')
    + (vorbei.length ? abschnitt('Vergangen') + liste(vorbei.map(terminZeile)) : '')
    + '<p style="color:var(--text-2);font-size:13px;margin-top:16px">Termine, die du Phoenix sagst, landen zusätzlich in deinem Google Kalender – mit Erinnerung aufs Handy.</p>';
}
function notizenAnsicht() {
  const l = gefiltert('notiz').sort((a, b) => b.geaendert - a.geaendert);
  return l.length ? `<div class="karten">${l.map(karte).join('')}</div>` : '<div class="leer">Keine Notizen.</div>';
}
function allesAnsicht() {
  const l = gefiltert().sort((a, b) => b.geaendert - a.geaendert);
  return l.length ? liste(l.map((e) => e.typ === 'aufgabe' ? aufgabeZeile(e) : e.typ === 'termin' ? terminZeile(e) : `<div class="zeile" data-id="${e.id}" style="--farbe:${(BEREICHE[e.bereich] || BEREICHE.sonstiges).farbe}"><span class="streifen"></span><div class="mitte"><b>${esc(e.titel)}</b><small>${TYPEN[e.typ]} · ${(BEREICHE[e.bereich] || BEREICHE.sonstiges).name}${e.text ? ' · ' + esc(e.text.slice(0, 60)) : ''}</small></div></div>`)) : '<div class="leer">Nichts gefunden.</div>';
}

/* ================= Details bearbeiten ================= */

function ausbauHtml(md) {
  // Kleines Markdown: Überschriften, Listen, fett
  const zeilen = esc(md).split('\n');
  let html = '', liste = null;
  for (const z of zeilen) {
    const fett = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    let m;
    if ((m = z.match(/^#{1,4}\s+(.*)/))) { if (liste) { html += `</${liste}>`; liste = null; } html += `<h4>${fett(m[1])}</h4>`; }
    else if ((m = z.match(/^\s*[-*•]\s+(.*)/))) { if (liste !== 'ul') { if (liste) html += `</${liste}>`; html += '<ul>'; liste = 'ul'; } html += `<li>${fett(m[1])}</li>`; }
    else if ((m = z.match(/^\s*\d+[.)]\s+(.*)/))) { if (liste !== 'ol') { if (liste) html += `</${liste}>`; html += '<ol>'; liste = 'ol'; } html += `<li>${fett(m[1])}</li>`; }
    else { if (liste) { html += `</${liste}>`; liste = null; } if (z.trim()) html += `<p>${fett(z)}</p>`; }
  }
  return html + (liste ? `</${liste}>` : '');
}

const lokal = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return iso.length <= 10 ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00` : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function details(id) {
  const e = structuredClone(zst.eintraege.get(id)); if (!e) return;
  const box = $('#blatt-box');
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>${TYPEN[e.typ]}</b><button data-a="sichern">Fertig</button></div>
    <label class="feld">Titel<input id="d-titel" value="${esc(e.titel)}"></label>
    <label class="feld">Text<textarea id="d-text">${esc(e.text || '')}</textarea></label>
    ${e.ausbau ? `<div class="ausbau"><h3>Ausgebaut von Phoenix</h3>${ausbauHtml(e.ausbau)}</div>` : ''}
    ${e.typ === 'idee' && !e.ausbau ? `<div class="tipp">Tipp: Sag „Phoenix, bau die Idee ${esc(e.titel.slice(0, 40))} aus“ – dann schreibt er erste Schritte, Vor- und Nachteile oder einen Plan dazu.</div>` : ''}
    <div class="feld">Bereich<div class="bereiche" id="d-bereich">${Object.entries(BEREICHE).map(([k, b]) => `<button data-b="${k}" class="${e.bereich === k ? 'an' : ''}"><i style="background:${b.farbe}"></i>${b.name}</button>`).join('')}</div></div>
    <div class="zweier">
      <label class="feld">Art<select id="d-typ">${Object.entries(TYPEN).map(([k, n]) => `<option value="${k}" ${k === e.typ ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${e.typ === 'aufgabe' ? `<label class="feld">Priorität<select id="d-prio">${[[1, 'Normal'], [2, 'Wichtig'], [3, 'Sehr wichtig']].map(([v, n]) => `<option value="${v}" ${(e.prioritaet || 1) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : '<span></span>'}
    </div>
    ${e.typ === 'aufgabe' ? `<label class="feld">Fällig<input id="d-faellig" type="datetime-local" value="${lokal(e.faellig)}"></label>` : ''}
    ${e.typ === 'termin' ? `<div class="zweier"><label class="feld">Beginn<input id="d-beginn" type="datetime-local" value="${lokal(e.beginn)}"></label><label class="feld">Ort<input id="d-ort" value="${esc(e.ort || '')}"></label></div>` : ''}
    <label class="feld">Stichworte (mit Komma)<input id="d-tags" value="${esc((e.stichworte || []).join(', '))}"></label>
    <div class="knoepfe">
      ${e.typ === 'aufgabe' ? `<button class="btn haupt" data-a="erledigt">${e.status === 'erledigt' ? 'Wieder öffnen' : 'Erledigt'}</button>` : ''}
      ${e.typ === 'idee' ? `<button class="btn" data-a="archiv">${e.status === 'archiv' ? 'Aus Archiv holen' : 'Archivieren'}</button><button class="btn" data-a="zuAufgabe">Als Aufgabe</button>` : ''}
      <button class="btn gefahr" data-a="loeschen">Löschen</button>
    </div>
    <p class="meta">${e.quelle === 'phoenix' ? 'Von Phoenix notiert · ' : ''}Erstellt ${new Date(e.erstellt).toLocaleString('de-DE')}${e.google ? ' · auch im Google Kalender' : ''}</p>`;
  $('#blatt').hidden = false;
  let bereich = e.bereich;
  $('#d-bereich').onclick = (ev) => { const b = ev.target.closest('[data-b]'); if (!b) return; bereich = b.dataset.b; box.querySelectorAll('#d-bereich button').forEach((x) => x.classList.toggle('an', x === b)); };
  const uebernehmen = () => {
    e.titel = $('#d-titel').value.trim() || e.titel; e.text = $('#d-text').value; e.bereich = bereich; e.typ = $('#d-typ').value;
    e.stichworte = $('#d-tags').value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
    if ($('#d-prio')) e.prioritaet = +$('#d-prio').value;
    if ($('#d-faellig')) e.faellig = $('#d-faellig').value ? new Date($('#d-faellig').value).toISOString() : null;
    if ($('#d-beginn')) e.beginn = $('#d-beginn').value ? new Date($('#d-beginn').value).toISOString() : null;
    if ($('#d-ort')) e.ort = $('#d-ort').value;
  };
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'zu') return ($('#blatt').hidden = true);
    uebernehmen();
    if (a === 'erledigt') e.status = e.status === 'erledigt' ? 'offen' : 'erledigt';
    if (a === 'archiv') e.status = e.status === 'archiv' ? 'offen' : 'archiv';
    if (a === 'zuAufgabe') { e.typ = 'aufgabe'; e.status = 'offen'; }
    if (a === 'loeschen') { if (!confirm(`„${e.titel}“ löschen?`)) return; $('#blatt').hidden = true; return loeschen(e.id); }
    $('#blatt').hidden = true;
    await speichern(e);
  };
}
$('.blatt-hinter').onclick = () => ($('#blatt').hidden = true);

/* ================= Eingaben ================= */

async function hinzufuegen() {
  const text = $('#neu-text').value.trim();
  if (!text) return;
  if (!zst.uid) return hinweis('Bitte zuerst anmelden (gleiches Konto wie Heft).');
  const datum = $('#neu-datum').value ? new Date($('#neu-datum').value).toISOString() : null;
  const [titel, ...rest] = text.split(/\s+[–-]\s+|:\s+/);
  const e = {
    id: crypto.randomUUID(), typ: zst.neuTyp, titel: rest.length && titel.length < 70 ? titel : text.slice(0, 120), text: rest.length && titel.length < 70 ? rest.join(': ') : (text.length > 120 ? text : ''),
    bereich: zst.bereich !== 'alle' ? zst.bereich : bereichRaten(text), stichworte: [], status: 'offen', prioritaet: 1, quelle: 'app', erstellt: Date.now(),
  };
  if (e.typ === 'aufgabe') e.faellig = datum;
  if (e.typ === 'termin') e.beginn = datum;
  $('#neu-text').value = ''; $('#neu-datum').value = '';
  await speichern(e);
  hinweis(`${TYPEN[e.typ]} gespeichert · ${BEREICHE[e.bereich].name}`);
}
$('#hinzu').onclick = hinzufuegen;
$('#neu-text').onkeydown = (e) => { if (e.key === 'Enter') hinzufuegen(); };

// Diktieren (Spracherkennung des Browsers)
const Erkennung = window.SpeechRecognition || window.webkitSpeechRecognition;
let erkennung = null;
$('#mikro').hidden = !Erkennung;
$('#mikro').onclick = () => {
  if (erkennung) { erkennung.stop(); return; }
  erkennung = new Erkennung(); erkennung.lang = 'de-DE'; erkennung.interimResults = true;
  const vorher = $('#neu-text').value;
  erkennung.onresult = (ev) => { $('#neu-text').value = (vorher ? vorher + ' ' : '') + [...ev.results].map((r) => r[0].transcript).join(''); };
  erkennung.onend = () => { erkennung = null; $('#mikro').classList.remove('an'); };
  erkennung.start(); $('#mikro').classList.add('an');
};

document.addEventListener('click', async (ev) => {
  const an = ev.target.closest('[data-ansicht]'); if (an) { zst.ansicht = an.dataset.ansicht; localStorage.setItem('org.ansicht', zst.ansicht); if (TYPEN[zst.ansicht]) zst.neuTyp = zst.ansicht; zeichnen(); scrollTo(0, 0); return; }
  const be = ev.target.closest('#filter [data-bereich], #navi [data-bereich]'); if (be) { zst.bereich = zst.bereich === be.dataset.bereich ? 'alle' : be.dataset.bereich; zeichnen(); return; }
  const ty = ev.target.closest('[data-typ]'); if (ty) { zst.neuTyp = ty.dataset.typ; zeichnen(); $('#neu-text').focus(); return; }
  const ha = ev.target.closest('[data-haken]');
  if (ha) { const e = structuredClone(zst.eintraege.get(ha.dataset.haken)); e.status = e.status === 'erledigt' ? 'offen' : 'erledigt'; await speichern(e); if (e.status === 'erledigt') hinweis('Erledigt ✓'); return; }
  const k = ev.target.closest('#inhalt [data-id]'); if (k) details(k.dataset.id);
});
$('#suche').oninput = (e) => { zst.suche = e.target.value; zeichnen(); };

/* ================= Anmeldung (gleiches Konto wie Heft) ================= */

function anmeldeFormular() {
  return `<div class="anmelden"><h2>Anmelden</h2><p>Mit demselben Konto wie in Heft. Danach siehst du hier alles, was du Phoenix sagst.</p>
    <label class="feld">E-Mail<input id="a-mail" type="email" autocomplete="username"></label>
    <label class="feld">Passwort<input id="a-pw" type="password" autocomplete="current-password"></label>
    <p id="a-fehler" style="color:#ff6b6b" hidden></p>
    <div class="knoepfe"><button class="btn haupt" id="a-los">Anmelden</button></div></div>`;
}
function anmeldenVerdrahten() {
  $('#a-los').onclick = async () => {
    const { error } = await client.auth.signInWithPassword({ email: $('#a-mail').value.trim(), password: $('#a-pw').value });
    if (error) { $('#a-fehler').textContent = /invalid/i.test(error.message) ? 'E-Mail oder Passwort stimmt nicht.' : error.message; $('#a-fehler').hidden = false; }
  };
}
$('#konto').onclick = async () => {
  if (!zst.uid) { zst.eintraege.clear(); return zeichnen(); }
  if (confirm('Abmelden? Deine Einträge bleiben in der Cloud.')) { await client.auth.signOut(); zst.eintraege.clear(); localStorage.removeItem('org.cache'); zeichnen(); }
};

/* ================= Start ================= */

$('#lupe').innerHTML = I.lupe; $('#mikro').innerHTML = I.mikro; $('#hinzu').innerHTML = I.plus; $('.logo').innerHTML = I.logo;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
start();
