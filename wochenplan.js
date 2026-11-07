// Wochenplan, Checkliste, Ersatzvorschläge, Trainingsplan und Wochen-Check.
// Ilias (2026-11-03): „Ich habe maximale Zeitprobleme … organisier mein komplettes Leben."
//
// Daten (alle als Organizer-Einträge mit typ "plan", damit sie mit abgleichen):
//   plan-vorlage        Wochenarten pro Woche (Schule/Arbeit/Urlaub) und dauerhafte Änderungen je Wochentag
//   plan-tag-JJJJ-MM-TT Änderungen nur an diesem Tag, Häkchen, Trainings-Notizen
//   plan-training       Übungen der Einheiten A/B/C
//   plan-check-JJJJ-MM-TT Wochen-Check (Montag der Woche)
//   plan-cache          die nächsten 14 Tage fertig ausgerechnet – daraus liest Phoenix

let A; // { zst, speichern, hinweis, $, esc, zeichnen }
export function wochenplanEinrichten(api) { A = api; }

/* ================= Grundlagen ================= */

export const KAT = {
  schule: { name: 'Schule', hex: '#4c9dff' },
  arbeit: { name: 'Arbeit', hex: '#3d7bd9' },
  fahrt: { name: 'Fahrt', hex: '#5d6488' },
  morgen: { name: 'Morgen', hex: '#7d86ad' },
  essen: { name: 'Essen', hex: '#c9a27a' },
  volleyball: { name: 'Volleyball', hex: '#ffa94d' },
  training: { name: 'Training', hex: '#41f2a3' },
  lernen: { name: 'Lernen', hex: '#ffd84d' },
  business: { name: 'Business', hex: '#5fb3ff' },
  stream: { name: 'Stream', hex: '#c46bff' },
  freunde: { name: 'Freunde', hex: '#ff6bb5' },
  familie: { name: 'Familie', hex: '#ff8f6b' },
  haushalt: { name: 'Haushalt', hex: '#9aa3c7' },
  zocken: { name: 'Zocken', hex: '#8f7bff' },
  frei: { name: 'Freizeit', hex: '#6f78a3' },
  puffer: { name: 'Puffer', hex: '#566089' },
  check: { name: 'Wochen-Check', hex: '#a46bff' },
  schlaf: { name: 'Schlaf', hex: '#353a63' },
};
// Diese Blöcke kann man abhaken (Fahrt, Essen usw. nicht)
const ABHAKBAR = new Set(['schule', 'arbeit', 'volleyball', 'training', 'lernen', 'business', 'stream', 'freunde', 'familie', 'haushalt', 'check', 'schlaf']);
// In diese Blöcke darf ein verpasster Block verschoben werden
const VERSCHIEBBAR_IN = new Set(['puffer', 'frei', 'zocken', 'freunde']);
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WT_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WOCHENARTEN = { arbeit: 'Arbeit', schule: 'Schule', urlaub: 'Urlaub / frei' };

const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minuten = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ausIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plusTage = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const montagVon = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const kw = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const t = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - t); const j = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - j) / 864e5 + 1) / 7); };
const neueId = () => 'b' + Math.random().toString(36).slice(2, 9);
const jetztMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/* ================= Schule, Ferien, Feiertage ================= */

// Brühlwiesenschule, Klasse 10ITa (Stundenplan-Foto 2026-11-03): Beginn/Ende je Wochentag
const SCHULE = { 1: [480, 1000], 2: [480, 955], 3: [525, 900], 4: [480, 900], 5: [525, 900] };
// Ferienordnung (Stand 20.05.2026) – Schultage darin werden zu Arbeitstagen
const FERIEN = [['2026-10-05', '2026-10-17'], ['2026-12-23', '2027-01-12'], ['2027-03-22', '2027-04-02'], ['2027-06-28', '2027-08-06'],
  ['2027-10-04', '2027-10-16'], ['2027-12-23', '2028-01-11'], ['2028-04-03', '2028-04-14'], ['2028-07-03', '2028-08-11']];
const BEWEGLICH = ['2027-02-08', '2027-02-09', '2027-05-07', '2027-05-28'];
// Blockunterricht 10 IT, Schuljahr 2026/27 (Plan Stand 12.01.2026): Montage der Schulwochen. Alle anderen Wochen = Arbeit.
const BLOCKUNTERRICHT = new Set(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2027-01-11', '2027-01-18', '2027-01-25',
  '2027-04-05', '2027-04-12', '2027-04-19', '2027-06-07', '2027-06-14', '2027-06-21']);

function ostern(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, monat - 1, tag);
}
const feiertagCache = new Map();
// Gesetzliche Feiertage in Hessen
export function feiertag(d) {
  const j = d.getFullYear();
  if (!feiertagCache.has(j)) {
    const o = ostern(j), f = (n) => iso(plusTage(o, n));
    feiertagCache.set(j, {
      [`${j}-01-01`]: 'Neujahr', [f(-2)]: 'Karfreitag', [f(1)]: 'Ostermontag', [`${j}-05-01`]: 'Tag der Arbeit', [f(39)]: 'Christi Himmelfahrt',
      [f(50)]: 'Pfingstmontag', [f(60)]: 'Fronleichnam', [`${j}-10-03`]: 'Tag der Deutschen Einheit', [`${j}-12-25`]: '1. Weihnachtstag', [`${j}-12-26`]: '2. Weihnachtstag',
    });
  }
  return feiertagCache.get(j)[iso(d)] || null;
}
const inFerien = (d) => { const s = iso(d); return FERIEN.some(([a, b]) => s >= a && s <= b) || BEWEGLICH.includes(s); };

/* ================= Einträge ================= */

const holen = (id) => A.zst.eintraege.get(id);
function eintrag(id, unterart, standard = {}) {
  return structuredClone(holen(id)) || { id, typ: 'plan', unterart, titel: 'Plan', bereich: 'privat', erstellt: Date.now(), ...standard };
}
const vorlage = () => holen('plan-vorlage') || { wochen: {}, standard: 'arbeit', anpassung: {} };
export const wochenArt = (montag) => vorlage().wochen?.[iso(montag)] || (BLOCKUNTERRICHT.has(iso(montag)) ? 'schule' : vorlage().standard || 'arbeit');

// Was für ein Tag ist das? (schule | arbeit | frei | wochenende) + Grund
export function tagArt(d) {
  const wd = d.getDay(), ft = feiertag(d);
  if (ft) return { art: 'frei', grund: ft };
  if (wd === 0 || wd === 6) return { art: 'wochenende' };
  const w = wochenArt(montagVon(d));
  if (w === 'urlaub') return { art: 'frei', grund: 'Urlaub' };
  if (w === 'schule' && inFerien(d)) return { art: 'arbeit', grund: 'Schulferien' };
  return { art: w };
}

/* ================= Standard-Wochenplan ================= */

const b = (von, bis, kat, titel, extra = {}) => ({ id: `${kat}-${von}`, von, bis, kat, titel, ...extra });
// Blöcke nacheinander in [start, ende) legen; was nicht mehr passt, fällt weg
function folge(start, ende, liste) {
  const aus = [];
  let t = start;
  for (const x of liste) {
    if (!x) continue;
    const dauer = Math.min(x.d, ende - t);
    if (dauer < 15) break;
    aus.push(b(t, t + dauer, x.kat, x.titel, x.extra));
    t += dauer;
  }
  if (ende - t >= 15) aus.push(b(t, ende, 'frei', 'Freizeit'));
  return aus;
}
const TRAINING = { 2: 'A', 4: 'B', 6: 'C' }; // Di, Do, Sa – nie an Volleyball-Tagen
const training = (wd) => TRAINING[wd] && { d: 45, kat: 'training', titel: `Calisthenics – Einheit ${TRAINING[wd]}`, extra: { einheit: TRAINING[wd], fest: true } };
const schlaf = (von) => b(von, 1440, 'schlaf', 'Schlafen', { fest: true });
const essen = { d: 30, kat: 'essen', titel: 'Essen & kurz abschalten' };
const familie = { d: 30, kat: 'familie', titel: 'Zeit mit der Familie' };

// Abend ab der Heimkehr – gleich in Schul-, Arbeits- und freien Wochen
function abend(wd, heim, lern) {
  const fix = [];
  let vor;
  if (wd === 1) { // Montag: Volleyball 20–22
    vor = folge(heim, 1140, [essen, lern, { d: 30, kat: 'puffer', titel: 'Puffer – frei für Unerwartetes' }]);
    fix.push(b(1140, 1170, 'essen', 'Abendessen'), b(1175, 1200, 'fahrt', 'Fahrt zum Volleyball'), b(1200, 1320, 'volleyball', 'Volleyball-Training', { fest: true }),
      b(1320, 1365, 'fahrt', 'Heimfahrt & Duschen'), b(1365, 1395, 'puffer', 'Runterkommen – Handy weg'), schlaf(1395));
  } else if (wd === 2) { // Dienstag: Training A + Stream
    vor = folge(heim, 1140, [essen, training(2), lern]);
    fix.push(b(1140, 1170, 'essen', 'Abendessen'), b(1170, 1320, 'stream', 'Stream (Twitch) – früh starten, Zuschauer sind 19:30–22 da'),
      b(1320, 1395, 'puffer', 'Runterkommen / Puffer'), schlaf(1395));
  } else if (wd === 3) { // Mittwoch: Volleyball 19:30–22
    vor = folge(heim, 1110, [essen, lern, familie]);
    fix.push(b(1110, 1140, 'essen', 'Abendessen'), b(1145, 1170, 'fahrt', 'Fahrt zum Volleyball'), b(1170, 1320, 'volleyball', 'Volleyball-Training', { fest: true }),
      b(1320, 1365, 'fahrt', 'Heimfahrt & Duschen'), b(1365, 1395, 'puffer', 'Runterkommen – Handy weg'), schlaf(1395));
  } else if (wd === 4) { // Donnerstag: Training B, Freunde oder Zocken
    vor = folge(heim, 1140, [essen, training(4), lern, familie]);
    fix.push(b(1140, 1170, 'essen', 'Abendessen'), b(1170, 1350, 'freunde', 'Freunde – wenn es sich ergibt, sonst Zocken (bis 22:30)', { optional: true }),
      b(1350, 1395, 'puffer', 'Runterkommen / Puffer'), schlaf(1395));
  } else { // Freitag: Business, Stream, lange Nacht ok
    vor = folge(heim, 1140, [essen, { d: 60, kat: 'business', titel: 'Business: Shop & Content' }, { d: 75, kat: 'freunde', titel: 'Freunde / Freizeit – wenn es sich ergibt', extra: { optional: true } }]);
    fix.push(b(1140, 1170, 'essen', 'Abendessen'), b(1170, 1380, 'stream', 'Stream (Twitch) – Freitagabend, die meisten Zuschauer'), b(1380, 1440, 'zocken', 'Zocken / Freizeit – Schlafen ab ca. 0:30'));
  }
  return [...vor, ...fix];
}

function werktag(wd, art) {
  const [s, e] = art === 'schule' ? SCHULE[wd] : [480, 990];
  const ziel = art === 'schule' ? 'Schule' : 'Arbeit';
  const lern = art === 'schule' ? { d: 45, kat: 'lernen', titel: 'Hausaufgaben & Lernen' } : { d: 60, kat: 'business', titel: 'Business: Shop & Content' };
  return [
    b(s - 75, s - 30, 'morgen', 'Aufstehen, Duschen, Frühstück'),
    b(s - 30, s, 'fahrt', `Fahrt zur ${ziel}`),
    b(s, e, art, art === 'schule' ? 'Schule – Blockunterricht' : 'Arbeit', { fest: true }),
    b(e, e + 30, 'fahrt', 'Heimfahrt'),
    ...abend(wd, e + 30, lern),
  ];
}
// Freier Werktag (Urlaub, Feiertag): mehr Business, Freunde und Training
function freierWerktag(wd) {
  return [
    b(510, 555, 'morgen', 'Aufstehen & Frühstück'),
    ...folge(570, 1080, [
      { d: 150, kat: 'business', titel: 'Business-Block (freier Tag)' }, { d: 60, kat: 'essen', titel: 'Mittagessen' },
      training(wd) || { d: 45, kat: 'frei', titel: 'Rausgehen / Bewegung' },
      { d: 165, kat: 'freunde', titel: 'Freunde – wenn es sich ergibt', extra: { optional: true } },
      { d: 60, kat: 'haushalt', titel: 'Erledigungen & Haushalt' },
    ]),
    ...abend(wd, 1080, null),
  ];
}
function samstag() {
  return [
    b(570, 615, 'morgen', 'Ausschlafen, Frühstück'),
    b(615, 675, 'haushalt', 'Zimmer, Wäsche, Haushalt'),
    b(690, 735, 'training', 'Calisthenics – Einheit C', { einheit: 'C', fest: true }),
    b(750, 795, 'essen', 'Mittagessen'),
    b(810, 960, 'business', 'Business-Block: Shop & Content'),
    b(960, 1140, 'freunde', 'Freunde – wenn es sich ergibt', { optional: true }),
    b(1140, 1170, 'essen', 'Abendessen'),
    b(1170, 1440, 'zocken', 'Zocken / Freizeit – Schlafen ab ca. 0:30'),
  ];
}
function sonntag(naechsteWoche) {
  return [
    b(600, 645, 'morgen', 'Ausschlafen, Frühstück'),
    b(645, 780, 'frei', 'Freizeit'),
    b(780, 870, 'familie', 'Mittagessen mit der Familie', { fest: true }),
    b(900, 960, naechsteWoche === 'schule' ? 'lernen' : 'business', naechsteWoche === 'schule' ? 'Lernen & Schulsachen für die Woche' : 'Business: Woche vorbereiten'),
    b(960, 1110, 'freunde', 'Freunde – wenn es sich ergibt', { optional: true }),
    b(1110, 1170, 'familie', 'Abendessen mit der Familie'),
    b(1170, 1190, 'check', 'Wochen-Check mit Phoenix', { fest: true }),
    b(1200, 1350, 'zocken', 'Zocken – Schluss um 22:30'),
    b(1350, 1395, 'puffer', 'Runterkommen, Sachen für morgen packen'),
    schlaf(1395),
  ];
}

function standardTag(d) {
  const wd = d.getDay(), t = tagArt(d);
  if (wd === 6) return samstag();
  if (wd === 0) return sonntag(wochenArt(montagVon(plusTage(d, 1))));
  if (t.art === 'frei') return freierWerktag(wd);
  return werktag(wd, t.art);
}
const anpassungsSchluessel = (d) => { const t = tagArt(d); return `${t.art === 'wochenende' ? 'wochenende' : t.art}-${d.getDay()}`; };

// Lernblöcke vor Klassenarbeiten: an den drei Tagen davor je 45 Minuten
const PRUEFUNG = /klassenarbeit|klausur|\btest\b|prüfung|lzk|lernzielkontrolle|arbeit schreiben/i;
function pruefungen() {
  return [...A.zst.eintraege.values()].filter((e) => (e.typ === 'termin' || e.typ === 'aufgabe') && e.status !== 'erledigt' && PRUEFUNG.test(e.titel || '') && (e.beginn || e.faellig));
}

// Plan eines Tages: Tagesänderung > dauerhafte Änderung > Standard; dazu Lernblöcke
export function tagPlan(d) {
  const tag = holen('plan-tag-' + iso(d));
  let bloecke = tag?.bloecke || vorlage().anpassung?.[anpassungsSchluessel(d)] || standardTag(d);
  bloecke = structuredClone(bloecke);
  for (const p of pruefungen()) {
    const am = new Date(p.beginn || p.faellig); am.setHours(0, 0, 0, 0);
    const vorher = Math.round((am - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    if (vorher < 1 || vorher > 3) continue;
    const id = `lernen-${p.id}`;
    if (bloecke.some((x) => x.id === id) || tag?.weg?.includes(id)) continue;
    // Lernen lieber statt Business/Freizeit am frühen Abend als um 22 Uhr
    einschieben(bloecke, { id, kat: 'lernen', titel: `Lernen: ${p.titel}`, d: 45, fest: true, ziele: new Set([...VERSCHIEBBAR_IN, 'business']), spaetestens: 1260 });
  }
  return bloecke.sort((x, y) => x.von - y.von);
}

// Einen Block in die erste passende flexible Lücke schieben (die Lücke wird kürzer)
function einschieben(bloecke, neu) {
  const ziele = neu.ziele || VERSCHIEBBAR_IN;
  const ziel = bloecke.filter((x) => ziele.has(x.kat) && !x.fest && x.bis - x.von >= neu.d && (!neu.ab || x.bis - Math.max(x.von, neu.ab) >= neu.d) && (!neu.spaetestens || Math.max(x.von, neu.ab || 0) <= neu.spaetestens))
    .sort((x, y) => x.von - y.von)[0];
  if (!ziel) return false;
  const von = Math.max(ziel.von, neu.ab || 0);
  const block = { id: neu.id || neueId(), von, bis: von + neu.d, kat: neu.kat, titel: neu.titel, fest: !!neu.fest, einheit: neu.einheit };
  const rest = [];
  if (von - ziel.von >= 15) rest.push({ ...ziel, id: ziel.id + '-a', bis: von });
  if (ziel.bis - block.bis >= 15) rest.push({ ...ziel, id: ziel.id + '-b', von: block.bis });
  bloecke.splice(bloecke.indexOf(ziel), 1, ...rest, block);
  return true;
}

/* ================= Ansicht: Wochenplan ================= */

const zst2 = { tag: null, woche: null }; // gewählter Tag / Montag der gezeigten Woche

function status(d, id) { return holen('plan-tag-' + iso(d))?.status?.[id] || null; }

export function wochenStatistik(montag) {
  let ok = 0, gesamt = 0, trOk = 0, trGes = 0, lern = 0, biz = 0;
  const heute = new Date(); heute.setHours(23, 59, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = plusTage(montag, i);
    for (const x of tagPlan(d)) {
      if (!ABHAKBAR.has(x.kat) || x.kat === 'schlaf') continue;
      const st = status(d, x.id);
      if (d <= heute) { gesamt++; if (st === 'ok') ok++; }
      if (x.kat === 'training') { trGes++; if (st === 'ok') trOk++; }
      if (st === 'ok' && x.kat === 'lernen') lern += x.bis - x.von;
      if (st === 'ok' && x.kat === 'business') biz += x.bis - x.von;
    }
  }
  return { ok, gesamt, trOk, trGes, lern, biz };
}
// Trainings in Folge, die geklappt haben (rückwärts ab heute)
function trainingsSerie() {
  let serie = 0;
  for (let i = 0; i < 120; i++) {
    const d = plusTage(new Date(), -i);
    const tr = tagPlan(d).filter((x) => x.kat === 'training');
    for (const x of tr.reverse()) {
      const st = status(d, x.id);
      if (st === 'ok') serie++;
      else if (st === 'nein' || (i > 0 && !st)) return serie;
    }
  }
  return serie;
}

export function planAnsicht() {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  zst2.tag ||= heute; zst2.woche ||= montagVon(heute);
  const mo = zst2.woche, art = wochenArt(mo), st = wochenStatistik(mo);
  const tage = Array.from({ length: 7 }, (_, i) => plusTage(mo, i));
  const proz = st.gesamt ? Math.round((st.ok / st.gesamt) * 100) : 0;
  return `${checkKarte()}
  <div class="plan-kopf panel">
    <div class="plan-woche">
      <button data-p="zurueck" title="Woche zurück">‹</button>
      <div><b>KW ${kw(mo)}</b><small>${mo.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${plusTage(mo, 6).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</small></div>
      <button data-p="vor" title="Woche vor">›</button>
      ${+mo !== +montagVon(heute) ? '<button data-p="heute" class="klein">Heute</button>' : ''}
    </div>
    <div class="wochenart">${Object.entries(WOCHENARTEN).map(([k, n]) => `<button data-wochenart="${k}" class="${art === k ? 'an' : ''}">${n}</button>`).join('')}</div>
    <div class="plan-stat">
      <span><b>${proz}%</b><small>abgehakt (${st.ok}/${st.gesamt})</small></span>
      <span><b>${st.trOk}/${st.trGes}</b><small>Trainings</small></span>
      <span><b>${trainingsSerie()}</b><small>Trainings in Folge</small></span>
      <span><b>${(st.lern / 60).toFixed(1).replace('.', ',')} h</b><small>gelernt</small></span>
      <span><b>${(st.biz / 60).toFixed(1).replace('.', ',')} h</b><small>Business</small></span>
    </div>
  </div>
  <div class="tag-wahl">${tage.map((d) => `<button data-tag="${iso(d)}" class="${+d === +zst2.tag ? 'an' : ''} ${+d === +heute ? 'heute' : ''}"><b>${WT[d.getDay()]}</b><small>${d.getDate()}.</small><i style="background:${tagFarbe(d)}"></i></button>`).join('')}</div>
  <div class="plan-raster">
    <div class="woche-gitter">${wochenGitter(tage, heute)}</div>
    <div class="tag-spalte">${tagListe(zst2.tag)}</div>
  </div>`;
}
const tagFarbe = (d) => { const t = tagArt(d); return t.art === 'schule' ? KAT.schule.hex : t.art === 'arbeit' ? KAT.arbeit.hex : t.art === 'frei' ? KAT.freunde.hex : KAT.frei.hex; };

function wochenGitter(tage, heute) {
  const px = 0.62, start = 360;
  const stunden = Array.from({ length: 19 }, (_, i) => `<span style="top:${i * 60 * px}px">${String(6 + i).padStart(2, '0')}</span>`).join('');
  return `<div class="gitter-zeit">${stunden}</div>` + tage.map((d) => {
    const t = tagArt(d);
    const bl = tagPlan(d).filter((x) => x.bis > start).map((x) => {
      const top = (Math.max(x.von, start) - start) * px, h = Math.max(6, (x.bis - Math.max(x.von, start)) * px - 1.5);
      const s = status(d, x.id);
      return `<div class="g-block ${s || ''}" data-tag="${iso(d)}" data-block="${x.id}" title="${hm(x.von)}–${hm(x.bis)} ${A.esc(x.titel)}" style="top:${top}px;height:${h}px;--farbe:${KAT[x.kat]?.hex || '#777'}">${h > 15 ? `<span>${A.esc(x.titel.split(' – ')[0])}</span>` : ''}</div>`;
    }).join('');
    const jetzt = +d === +heute ? `<div class="g-jetzt" style="top:${(jetztMin() - start) * px}px"></div>` : '';
    return `<div class="g-tag ${+d === +zst2.tag ? 'an' : ''}" data-tag="${iso(d)}"><div class="g-kopf">${WT[d.getDay()]} ${d.getDate()}.<small>${t.grund || (t.art === 'wochenende' ? '' : WOCHENARTEN[t.art] || '')}</small></div><div class="g-flaeche" style="height:${1080 * px}px">${bl}${jetzt}</div></div>`;
  }).join('');
}

function tagListe(d) {
  const t = tagArt(d), heute = new Date(); heute.setHours(0, 0, 0, 0);
  const istHeute = +d === +heute, jm = jetztMin();
  const tag = holen('plan-tag-' + iso(d));
  const zeilen = tagPlan(d).map((x) => {
    const s = status(d, x.id), jetzt = istHeute && jm >= x.von && jm < x.bis;
    const haken = ABHAKBAR.has(x.kat) ? `<div class="haken-knoepfe"><button data-ok="${x.id}" class="${s === 'ok' ? 'an' : ''}" title="Hat geklappt">✓</button><button data-nein="${x.id}" class="${s === 'nein' ? 'an' : ''}" title="Hat nicht geklappt">✕</button></div>` : '';
    return `<div class="p-zeile ${s || ''} ${jetzt ? 'jetzt' : ''}" data-block="${x.id}" style="--farbe:${KAT[x.kat]?.hex || '#777'}">
      <span class="p-zeit">${hm(x.von)}<small>${hm(x.bis)}</small></span><span class="streifen"></span>
      <div class="mitte"><b>${A.esc(x.titel)}</b><small>${KAT[x.kat]?.name || x.kat}${x.fest ? ' · fest' : x.optional ? ' · wenn es sich ergibt' : ' · flexibel'}${s === 'verschoben' ? ' · verschoben' : ''}${x.notiz ? ' · ' + A.esc(x.notiz) : ''}</small></div>${haken}</div>`;
  }).join('');
  return `<div class="abschnitt"><h2>${WT_LANG[d.getDay()]}, ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</h2><small>${t.grund || (t.art === 'wochenende' ? 'Wochenende' : WOCHENARTEN[t.art])}${tag?.bloecke ? ' · an diesem Tag geändert' : ''}</small></div>
    <div class="liste plan-liste">${zeilen}</div>
    <div class="plan-knoepfe"><button class="btn" data-p="neu">+ Block</button>${tag?.bloecke ? '<button class="btn" data-p="zuruecksetzen">Tag zurücksetzen</button>' : ''}</div>`;
}

export function planVerdrahten(ziel) {
  ziel.onclick = async (ev) => {
    const el = (s) => ev.target.closest(s);
    if (el('[data-p="zurueck"]')) { zst2.woche = plusTage(zst2.woche, -7); zst2.tag = zst2.woche; return A.zeichnen(); }
    if (el('[data-p="vor"]')) { zst2.woche = plusTage(zst2.woche, 7); zst2.tag = zst2.woche; return A.zeichnen(); }
    if (el('[data-p="heute"]')) { zst2.tag = null; zst2.woche = null; return A.zeichnen(); }
    if (el('[data-wochenart]')) return wochenartSetzen(zst2.woche, el('[data-wochenart]').dataset.wochenart);
    if (el('[data-p="neu"]')) return blockBearbeiten(zst2.tag, null);
    if (el('[data-p="zuruecksetzen"]')) { const t = eintrag('plan-tag-' + iso(zst2.tag), 'tag'); delete t.bloecke; t.weg = []; return A.speichern(t); }
    if (el('[data-check]')) return wochenCheck(ausIso(el('[data-check]').dataset.check));
    const ok = el('[data-ok]'), nein = el('[data-nein]');
    if (ok) return abhaken(zst2.tag, ok.dataset.ok, 'ok');
    if (nein) return nichtGeklappt(zst2.tag, nein.dataset.nein);
    const g = el('.g-block');
    if (g) { zst2.tag = ausIso(g.dataset.tag); A.zeichnen(); return blockBearbeiten(zst2.tag, g.dataset.block); }
    const tg = el('[data-tag]');
    if (tg) { zst2.tag = ausIso(tg.dataset.tag); return A.zeichnen(); }
    const z = el('.p-zeile');
    if (z) return blockBearbeiten(zst2.tag, z.dataset.block);
  };
}

async function wochenartSetzen(montag, art) {
  const v = eintrag('plan-vorlage', 'vorlage', { titel: 'Wochenplan', wochen: {}, standard: 'arbeit', anpassung: {} });
  v.wochen ||= {}; v.wochen[iso(montag)] = art;
  await A.speichern(v);
  A.hinweis(`KW ${kw(montag)} ist jetzt eine ${WOCHENARTEN[art]}-Woche.`);
}

// Häkchen setzen (nochmal tippen nimmt es weg)
async function abhaken(d, id, wert) {
  const t = eintrag('plan-tag-' + iso(d), 'tag', { datum: iso(d) });
  t.status ||= {};
  t.status[id] = t.status[id] === wert ? null : wert;
  if (!t.status[id]) delete t.status[id];
  await A.speichern(t);
}

// Den Tag als eigene Liste festschreiben (für Änderungen nur an diesem Tag)
function tagFestschreiben(d) {
  const t = eintrag('plan-tag-' + iso(d), 'tag', { datum: iso(d) });
  if (!t.bloecke) t.bloecke = tagPlan(d);
  return t;
}

/* ===== Nicht geklappt → Ersatzvorschläge ===== */

function ersatzVorschlaege(d, block) {
  const dauer = block.bis - block.von, aus = [];
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  for (let i = 0; i < 8 && aus.length < 5; i++) {
    const tag = plusTage(+d < +heute ? heute : d, i);
    const ab = +tag === +heute ? Math.max(jetztMin() + 10, 0) : 0;
    for (const x of tagPlan(tag)) {
      if (!VERSCHIEBBAR_IN.has(x.kat) || x.id === block.id) continue;
      const von = Math.max(x.von, ab);
      if (x.bis - von < dauer || von >= 1410) continue;
      if (+tag === +d && von <= block.von) continue;
      aus.push({ tag, von: Math.ceil(von / 15) * 15, ersetzt: x });
      if (aus.length >= 5) break;
    }
  }
  return aus.filter((v) => v.von + dauer <= v.ersetzt.bis + 14);
}

function nichtGeklappt(d, id) {
  const x = tagPlan(d).find((y) => y.id === id); if (!x) return;
  const vorschlaege = ersatzVorschlaege(d, x);
  const box = $blatt();
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Hat nicht geklappt</b><span></span></div>
    <p class="plan-frage"><b>${A.esc(x.titel)}</b><br><small>${WT_LANG[d.getDay()]}, ${hm(x.von)}–${hm(x.bis)}</small></p>
    <div class="feld">Ersatz – such dir einen Platz aus</div>
    <div class="liste">${vorschlaege.map((v, i) => `<div class="zeile ersatz" data-v="${i}" style="--farbe:${KAT[x.kat].hex}"><span class="streifen"></span><div class="mitte"><b>${WT_LANG[v.tag.getDay()]}, ${v.tag.getDate()}.${v.tag.getMonth() + 1}. · ${hm(v.von)}–${hm(v.von + x.bis - x.von)}</b><small>statt „${A.esc(v.ersetzt.titel)}“</small></div></div>`).join('') || '<div class="leer">In den nächsten Tagen ist kein passender freier Platz – kürzer machen oder streichen.</div>'}</div>
    <label class="feld">Woran lag es? (optional)<input id="pn-grund" placeholder="z. B. länger gearbeitet, zu müde"></label>
    <div class="knoepfe"><button class="btn" data-a="kurz">Heute nur kurz (die Hälfte)</button><button class="btn" data-a="nur">Nur als „nicht geklappt“ markieren</button><button class="btn gefahr" data-a="streichen">Diesmal streichen</button></div>`;
  blattAuf();
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a, v = ev.target.closest('[data-v]');
    if (a === 'zu') return blattZu();
    const grund = box.querySelector('#pn-grund').value.trim();
    const quelle = tagFestschreiben(d);
    quelle.status ||= {};
    const q = quelle.bloecke.find((y) => y.id === id);
    if (grund && q) q.notiz = grund;
    if (v) {
      const wahl = vorschlaege[+v.dataset.v];
      quelle.status[id] = 'verschoben';
      const zielTag = +wahl.tag === +d ? quelle : tagFestschreiben(wahl.tag);
      einschieben(zielTag.bloecke, { kat: x.kat, titel: `Nachholen: ${x.titel.replace(/^Nachholen: /, '')}`, d: x.bis - x.von, ab: wahl.von, fest: true, einheit: x.einheit });
      if (zielTag !== quelle) await A.speichern(zielTag);
      await A.speichern(quelle);
      blattZu();
      return A.hinweis(`Verschoben auf ${WT_LANG[wahl.tag.getDay()]} ${hm(wahl.von)}.`);
    }
    if (a === 'kurz' && q) {
      const neuBis = q.von + Math.max(15, Math.round((q.bis - q.von) / 2 / 5) * 5);
      quelle.bloecke.push({ ...q, id: neueId(), von: neuBis, kat: 'puffer', titel: 'Puffer', fest: false, notiz: '' });
      q.bis = neuBis; q.titel = q.titel + ' (kurz)';
      delete quelle.status[id];
    } else if (a === 'nur' || a === 'streichen') {
      quelle.status[id] = 'nein';
      if (a === 'streichen' && q) { q.kat = 'puffer'; q.titel = `Frei (statt ${x.titel})`; delete quelle.status[id]; }
    } else return;
    await A.speichern(quelle);
    blattZu();
  };
}

/* ===== Block bearbeiten / neu ===== */

function blockBearbeiten(d, id) {
  const x = id ? tagPlan(d).find((y) => y.id === id) : { von: 1080, bis: 1140, kat: 'frei', titel: '' };
  if (!x) return;
  const box = $blatt();
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>${id ? 'Block ändern' : 'Neuer Block'}</b><button data-a="sichern">Fertig</button></div>
    <label class="feld">Was<input id="pb-titel" value="${A.esc(x.titel)}" placeholder="z. B. Zahnarzt, Freunde, Lernen Mathe"></label>
    <div class="zweier"><label class="feld">Von<input id="pb-von" type="time" value="${hm(x.von)}"></label><label class="feld">Bis<input id="pb-bis" type="time" value="${x.bis >= 1440 ? '23:59' : hm(x.bis)}"></label></div>
    <label class="feld">Art<select id="pb-kat">${Object.entries(KAT).map(([k, v]) => `<option value="${k}" ${k === x.kat ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
    <label class="feld">Gilt für<select id="pb-umfang"><option value="tag">Nur ${WT_LANG[d.getDay()]}, ${d.toLocaleDateString('de-DE')}</option><option value="immer">Jeden ${WT_LANG[d.getDay()]} (${tagArt(d).art === 'wochenende' ? 'Wochenende' : WOCHENARTEN[tagArt(d).art] + '-Wochen'})</option></select></label>
    <label class="feld"><span><input type="checkbox" id="pb-fest" ${x.fest ? 'checked' : ''} style="display:inline;width:auto;margin:0 6px 0 0"> Fester Termin (wird nicht für Ersatz verschoben)</span></label>
    ${x.einheit ? `<p class="meta">Trainingseinheit ${x.einheit} – Übungen im Tab „Training“.</p>` : ''}
    <div class="knoepfe">${id ? '<button class="btn gefahr" data-a="weg">Block entfernen</button>' : ''}</div>`;
  blattAuf();
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'zu') return blattZu();
    const umfang = box.querySelector('#pb-umfang').value;
    let liste, speicherZiel;
    if (umfang === 'immer') {
      speicherZiel = eintrag('plan-vorlage', 'vorlage', { titel: 'Wochenplan', wochen: {}, standard: 'arbeit', anpassung: {} });
      speicherZiel.anpassung ||= {};
      const schl = anpassungsSchluessel(d);
      liste = speicherZiel.anpassung[schl] ||= structuredClone(vorlage().anpassung?.[schl] || standardTag(d));
    } else { speicherZiel = tagFestschreiben(d); liste = speicherZiel.bloecke; }
    const i = liste.findIndex((y) => y.id === id);
    if (a === 'weg') { if (i >= 0) liste.splice(i, 1); else { speicherZiel.weg = [...(speicherZiel.weg || []), id]; } }
    else {
      const von = minuten(box.querySelector('#pb-von').value || '00:00');
      let bis = minuten(box.querySelector('#pb-bis').value || '00:00'); if (bis === 1439) bis = 1440;
      if (bis <= von) return A.hinweis('„Bis“ muss nach „Von“ liegen.');
      const neu = { ...(i >= 0 ? liste[i] : { id: neueId() }), von, bis, kat: box.querySelector('#pb-kat').value, titel: box.querySelector('#pb-titel').value.trim() || KAT[box.querySelector('#pb-kat').value].name, fest: box.querySelector('#pb-fest').checked };
      if (i >= 0) liste[i] = neu; else liste.push(neu);
      // Überdeckte flexible Blöcke kürzen
      for (const y of [...liste]) {
        if (y === neu || y.fest || !VERSCHIEBBAR_IN.has(y.kat)) continue;
        if (y.von < neu.bis && y.bis > neu.von) {
          if (y.von >= neu.von && y.bis <= neu.bis) liste.splice(liste.indexOf(y), 1);
          else if (y.von < neu.von) y.bis = neu.von; else y.von = neu.bis;
        }
      }
    }
    liste.sort((p, q) => p.von - q.von);
    await A.speichern(speicherZiel);
    blattZu();
  };
}

/* ================= Wochen-Check ================= */

// Fällig ab Sonntag 18 Uhr für die laufende Woche, Mo/Di noch für die letzte
export function checkFaellig() {
  const jetzt = new Date(), wd = jetzt.getDay();
  let mo = null;
  if (wd === 0 && jetzt.getHours() >= 18) mo = montagVon(jetzt);
  else if (wd === 1 || wd === 2) mo = montagVon(plusTage(jetzt, -7));
  if (!mo || holen('plan-check-' + iso(mo))?.erledigt) return null;
  // Nur für Wochen, in denen der Plan schon benutzt wurde (etwas abgehakt oder geändert)
  const benutzt = Array.from({ length: 7 }, (_, i) => holen('plan-tag-' + iso(plusTage(mo, i)))).some(Boolean);
  if (!benutzt) return null;
  return mo;
}
export function checkKarte() {
  const mo = checkFaellig(); if (!mo) return '';
  const st = wochenStatistik(mo);
  return `<div class="panel check-karte"><div><b>Wochen-Check KW ${kw(mo)}</b><small>${st.ok}/${st.gesamt} abgehakt · ${st.trOk}/${st.trGes} Trainings – 5 Minuten, dann ist die neue Woche geplant.</small></div><button class="btn haupt" data-check="${iso(mo)}">Jetzt machen</button></div>`;
}
export function wochenCheck(mo = checkFaellig() || montagVon(new Date())) {
  const st = wochenStatistik(mo), naechste = plusTage(mo, 7), alt = holen('plan-check-' + iso(mo)) || {};
  const box = $blatt();
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Wochen-Check KW ${kw(mo)}</b><button data-a="sichern">Fertig</button></div>
    <div class="plan-stat klein"><span><b>${st.gesamt ? Math.round((st.ok / st.gesamt) * 100) : 0}%</b><small>abgehakt</small></span><span><b>${st.trOk}/${st.trGes}</b><small>Trainings</small></span><span><b>${(st.lern / 60).toFixed(1).replace('.', ',')} h</b><small>Lernen</small></span><span><b>${(st.biz / 60).toFixed(1).replace('.', ',')} h</b><small>Business</small></span></div>
    <label class="feld">Was lief gut?<textarea id="wc-gut">${A.esc(alt.gut || '')}</textarea></label>
    <label class="feld">Was hat nicht geklappt – und warum?<textarea id="wc-schlecht">${A.esc(alt.schlecht || '')}</textarea></label>
    <label class="feld">Was ändern wir nächste Woche?<textarea id="wc-aendern">${A.esc(alt.aendern || '')}</textarea></label>
    <label class="feld">Wie ging es dir? (1 = mies, 5 = top)<select id="wc-stimmung">${[1, 2, 3, 4, 5].map((n) => `<option ${+(alt.stimmung || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="feld">Nächste Woche (KW ${kw(naechste)}) ist<select id="wc-art">${Object.entries(WOCHENARTEN).map(([k, n]) => `<option value="${k}" ${wochenArt(naechste) === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p class="meta">Du kannst den Check auch Phoenix sagen: „Phoenix, Wochen-Check“.</p>`;
  blattAuf();
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'zu') return blattZu();
    const c = eintrag('plan-check-' + iso(mo), 'check', { titel: `Wochen-Check KW ${kw(mo)}`, woche: iso(mo) });
    Object.assign(c, { gut: box.querySelector('#wc-gut').value, schlecht: box.querySelector('#wc-schlecht').value, aendern: box.querySelector('#wc-aendern').value,
      stimmung: +box.querySelector('#wc-stimmung').value, erledigt: true, statistik: st, datum: Date.now() });
    await A.speichern(c);
    const art = box.querySelector('#wc-art').value;
    if (art !== wochenArt(naechste)) await wochenartSetzen(naechste, art);
    blattZu();
    A.hinweis('Wochen-Check gespeichert. Neue Woche, neuer Versuch.');
  };
}

/* ================= Kommando: Heute im Plan ================= */

export function heutePanel() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const jm = jetztMin(), plan = tagPlan(d);
  const jetzt = plan.find((x) => jm >= x.von && jm < x.bis), weiter = plan.filter((x) => x.von > jm).slice(0, 4);
  const z = (x) => `<div class="zeile" data-planlink style="--farbe:${KAT[x.kat]?.hex}"><span class="streifen"></span><div class="mitte"><b>${A.esc(x.titel)}</b><small>${hm(x.von)}–${hm(x.bis)} · ${KAT[x.kat]?.name}</small></div>${status(d, x.id) === 'ok' ? '<span class="ok-marke">✓</span>' : ''}</div>`;
  return `${checkKarte()}<div class="panel"><div class="panel-titel"><span>Heute im Plan</span><small>${WOCHENARTEN[tagArt(d).art] || 'Wochenende'}</small></div>
    ${jetzt ? `<div class="jetzt-block" style="--farbe:${KAT[jetzt.kat]?.hex}"><small>Jetzt · bis ${hm(jetzt.bis)}</small><b>${A.esc(jetzt.titel)}</b></div>` : ''}
    <div class="liste">${weiter.map(z).join('') || '<div class="leer">Für heute ist nichts mehr geplant.</div>'}</div></div>`;
}

/* ================= Training ================= */

// Nur Boden + zwei 5-kg-Hanteln (Stand 2026-11-03). Steigern: Schaffst du in allen Sätzen das obere Ende, nimm die nächste Stufe.
export const STANDARD_TRAINING = {
  A: { name: 'Drücken & Bauch', uebungen: [
    { id: 'a1', name: 'Aufwärmen', vorgabe: '5 Min', hinweis: 'Hampelmann, Armkreisen, Schultern rollen, 10 Kniebeugen' },
    { id: 'a2', name: 'Liegestütze', vorgabe: '4 × 6–15', hinweis: 'Stufen: auf Knien → normal → Füße erhöht → Archer. Körper gerade, Brust bis kurz über den Boden' },
    { id: 'a3', name: 'Pike-Liegestütze', vorgabe: '3 × 5–10', hinweis: 'Hüfte hoch (umgedrehtes V), Kopf Richtung Boden – für die Schultern' },
    { id: 'a4', name: 'Dips an Stuhl oder Bett', vorgabe: '3 × 8–15', hinweis: 'Hände hinter dir auf der Kante, Ellbogen nach hinten' },
    { id: 'a5', name: 'Schulterdrücken mit Hanteln', vorgabe: '3 × 10–15', hinweis: '2 × 5 kg, langsam runter (3 Sek.)' },
    { id: 'a6', name: 'Unterarmstütz (Plank)', vorgabe: '3 × 30–60 s', hinweis: 'Bauch und Po fest' },
    { id: 'a7', name: 'Hollow Hold', vorgabe: '3 × 20–40 s', hinweis: 'Rücken flach am Boden, Arme und Beine gestreckt anheben' },
  ] },
  B: { name: 'Ziehen & Rücken (ohne Stange)', uebungen: [
    { id: 'b1', name: 'Aufwärmen', vorgabe: '5 Min', hinweis: 'Armkreisen, Katze-Kuh, 10 Superman' },
    { id: 'b2', name: 'Einarmiges Rudern mit Hantel', vorgabe: '4 × 12–20 je Arm', hinweis: 'Eine Hand aufs Bett gestützt, Hantel zur Hüfte ziehen, oben 1 Sek. halten' },
    { id: 'b3', name: 'Tisch-Rudern', vorgabe: '3 × 6–12', hinweis: 'Nur unter einem sehr stabilen Tisch! Rücklings drunter, Brust an die Tischkante ziehen' },
    { id: 'b4', name: 'Reverse Snow Angels', vorgabe: '3 × 10–15', hinweis: 'Bauchlage, Arme gestreckt vom Po über den Kopf führen' },
    { id: 'b5', name: 'Bizeps-Curls', vorgabe: '3 × 12–20', hinweis: 'Langsam runter, nicht schwingen' },
    { id: 'b6', name: 'Superman halten', vorgabe: '3 × 20–40 s', hinweis: 'Bauchlage, Arme und Beine leicht anheben' },
    { id: 'b7', name: 'Seitstütz', vorgabe: '3 × 20–40 s je Seite', hinweis: 'Hüfte nicht absacken lassen' },
  ] },
  C: { name: 'Beine & Ganzkörper', uebungen: [
    { id: 'c1', name: 'Aufwärmen', vorgabe: '5 Min', hinweis: 'Seilspringen ohne Seil, Ausfallschritte, Hüftkreisen' },
    { id: 'c2', name: 'Kniebeugen mit Hanteln', vorgabe: '4 × 15–25', hinweis: 'Hanteln an den Schultern, tief und kontrolliert' },
    { id: 'c3', name: 'Bulgarian Split Squats', vorgabe: '3 × 8–12 je Bein', hinweis: 'Hinterer Fuß auf Stuhl oder Bett' },
    { id: 'c4', name: 'Hüftheben (Glute Bridge)', vorgabe: '3 × 12–20', hinweis: 'Einbeinig, sobald beidbeinig leicht ist' },
    { id: 'c5', name: 'Wadenheben einbeinig', vorgabe: '3 × 15–20', hinweis: 'An der Treppenstufe, ganz runter und ganz hoch – gut fürs Springen' },
    { id: 'c6', name: 'Liegestütze (leicht)', vorgabe: '2 × 10', hinweis: 'Nur locker, für den Oberkörper' },
    { id: 'c7', name: 'Mountain Climbers', vorgabe: '3 × 30 s', hinweis: 'Zum Schluss für die Ausdauer' },
  ] },
};
const trainingDaten = () => holen('plan-training') || { einheiten: STANDARD_TRAINING };

// Wann war welche Einheit zuletzt, mit welchen Wiederholungen?
function letzteWerte(einheit, vorDatum) {
  let best = null;
  for (const e of A.zst.eintraege.values()) {
    if (e.unterart !== 'tag' || !e.uebungen?.[einheit] || e.datum >= vorDatum) continue;
    if (!best || e.datum > best.datum) best = e;
  }
  return best;
}

let trainingsTag = null;
export function trainingAnsicht() {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  // nächster Trainingstag ab heute (oder der gewählte)
  if (!trainingsTag) {
    for (let i = 0; i < 8; i++) { const d = plusTage(heute, i); if (tagPlan(d).some((x) => x.kat === 'training')) { trainingsTag = d; break; } }
    trainingsTag ||= heute;
  }
  const d = trainingsTag, block = tagPlan(d).find((x) => x.kat === 'training');
  const einheit = block?.einheit || 'A', daten = trainingDaten().einheiten, e = daten[einheit];
  const tag = holen('plan-tag-' + iso(d)), werte = tag?.uebungen?.[einheit] || {};
  const letzte = letzteWerte(einheit, iso(d));
  const woche = Array.from({ length: 7 }, (_, i) => plusTage(montagVon(heute), i));
  return `<div class="panel training-kopf">
      <div><small>Ziel</small><b>Wieder stark werden: 3 × pro Woche, 45 Minuten, nur Boden + 2 × 5 kg Hanteln</b>
      <p>Di = A (Drücken), Do = B (Ziehen), Sa = C (Beine) – nie an Volleyball-Tagen. Schaffst du in allen Sätzen das obere Ende der Vorgabe, nimm beim nächsten Mal die schwerere Stufe oder mehr Wiederholungen.</p></div>
      <div class="plan-stat"><span><b>${trainingsSerie()}</b><small>in Folge</small></span><span><b>${wochenStatistik(montagVon(heute)).trOk}/${wochenStatistik(montagVon(heute)).trGes}</b><small>diese Woche</small></span></div>
    </div>
    <div class="tag-wahl">${woche.map((x) => { const tb = tagPlan(x).find((y) => y.kat === 'training'); return `<button data-ttag="${iso(x)}" class="${+x === +d ? 'an' : ''} ${tb ? '' : 'leer-tag'}"><b>${WT[x.getDay()]}</b><small>${tb ? tb.einheit || '✓' : '–'}</small>${tb && status(x, tb.id) === 'ok' ? '<i style="background:#41f2a3"></i>' : ''}</button>`; }).join('')}</div>
    <div class="abschnitt"><h2>${block ? `Einheit ${einheit}: ${A.esc(e.name)}` : `Kein Training am ${WT_LANG[d.getDay()]}`}</h2><small>${WT_LANG[d.getDay()]}, ${d.toLocaleDateString('de-DE')}${block ? ` · ${hm(block.von)}–${hm(block.bis)}` : ''}${letzte ? ` · letztes Mal ${ausIso(letzte.datum).toLocaleDateString('de-DE')}` : ''}</small></div>
    ${block ? `<div class="liste uebungen">${e.uebungen.map((u) => {
      const w = werte[u.id] || {}, l = letzte?.uebungen?.[einheit]?.[u.id]?.wdh;
      return `<div class="zeile uebung ${w.ok ? 'fertig' : ''}" data-ueb="${u.id}" style="--farbe:${KAT.training.hex}"><button class="kreis" data-uok="${u.id}">${w.ok ? '✓' : ''}</button>
        <div class="mitte"><b>${A.esc(u.name)} <span class="vorgabe">${A.esc(u.vorgabe)}</span></b><small>${A.esc(u.hinweis || '')}${l ? ` · letztes Mal: ${A.esc(l)}` : ''}</small></div>
        <input class="wdh" data-wdh="${u.id}" value="${A.esc(w.wdh || '')}" placeholder="Wdh. z. B. 12,10,9"></div>`;
    }).join('')}</div>
    <div class="plan-knoepfe"><button class="btn haupt" data-tfertig>Training geschafft</button><button class="btn" data-tnein>Hat nicht geklappt</button></div>` : '<div class="leer">An diesem Tag ist kein Training geplant. Im Wochenplan kannst du einen Block „Training“ hinzufügen.</div>'}
    <div class="abschnitt"><h2>Alle Einheiten</h2><small>tippen zum Bearbeiten</small></div>
    <div class="karten">${Object.entries(daten).map(([k, v]) => `<div class="karte" data-einheit="${k}" style="--farbe:${KAT.training.hex}"><b>Einheit ${k}: ${A.esc(v.name)}</b><p>${v.uebungen.map((u) => A.esc(u.name)).join(' · ')}</p></div>`).join('')}</div>
    <p class="meta" style="margin-top:14px">Später sinnvoll: eine Klimmzugstange für den Türrahmen – dann kommen echte Klimmzüge dazu.</p>`;
}

export function trainingVerdrahten(ziel) {
  ziel.onclick = async (ev) => {
    const el = (s) => ev.target.closest(s);
    if (el('[data-ttag]')) { trainingsTag = ausIso(el('[data-ttag]').dataset.ttag); return A.zeichnen(); }
    const d = trainingsTag, block = tagPlan(d).find((x) => x.kat === 'training');
    if (el('[data-einheit]')) return einheitBearbeiten(el('[data-einheit]').dataset.einheit);
    if (!block) return;
    const einheit = block.einheit || 'A';
    if (el('[data-uok]')) {
      const t = eintrag('plan-tag-' + iso(d), 'tag', { datum: iso(d) });
      t.uebungen ||= {}; t.uebungen[einheit] ||= {};
      const u = (t.uebungen[einheit][el('[data-uok]').dataset.uok] ||= {});
      u.ok = !u.ok;
      // alle Übungen fertig → Training im Plan abhaken
      const alle = trainingDaten().einheiten[einheit].uebungen.every((x) => t.uebungen[einheit][x.id]?.ok);
      t.status ||= {}; if (alle) t.status[block.id] = 'ok';
      await A.speichern(t);
      if (alle) A.hinweis('Training geschafft – stark! 💪');
      return;
    }
    if (el('[data-tfertig]')) { await abhaken(d, block.id, 'ok'); return A.hinweis('Training abgehakt.'); }
    if (el('[data-tnein]')) return nichtGeklappt(d, block.id);
  };
  ziel.onchange = async (ev) => {
    const f = ev.target.closest('[data-wdh]'); if (!f) return;
    const d = trainingsTag, block = tagPlan(d).find((x) => x.kat === 'training'); if (!block) return;
    const einheit = block.einheit || 'A';
    const t = eintrag('plan-tag-' + iso(d), 'tag', { datum: iso(d) });
    t.uebungen ||= {}; t.uebungen[einheit] ||= {};
    (t.uebungen[einheit][f.dataset.wdh] ||= {}).wdh = f.value.trim();
    await A.speichern(t);
  };
}

function einheitBearbeiten(k) {
  const daten = structuredClone(trainingDaten().einheiten), e = daten[k];
  const box = $blatt();
  const zeichnenListe = () => e.uebungen.map((u, i) => `<div class="ueb-edit" data-i="${i}">
      <input data-f="name" value="${A.esc(u.name)}" placeholder="Übung"><input data-f="vorgabe" value="${A.esc(u.vorgabe)}" placeholder="z. B. 3 × 10">
      <input data-f="hinweis" value="${A.esc(u.hinweis || '')}" placeholder="Hinweis"><button data-a="ueb-weg" data-i="${i}" title="Entfernen">✕</button></div>`).join('');
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Einheit ${k}</b><button data-a="sichern">Fertig</button></div>
    <label class="feld">Name<input id="te-name" value="${A.esc(e.name)}"></label>
    <div class="feld">Übungen</div><div id="te-liste">${zeichnenListe()}</div>
    <div class="knoepfe"><button class="btn" data-a="ueb-neu">+ Übung</button><button class="btn" data-a="standard">Auf Standard zurücksetzen</button></div>`;
  blattAuf();
  const lesen = () => box.querySelectorAll('.ueb-edit').forEach((z) => { const u = e.uebungen[+z.dataset.i]; z.querySelectorAll('[data-f]').forEach((f) => (u[f.dataset.f] = f.value)); });
  box.onclick = async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'zu') return blattZu();
    lesen();
    if (a === 'ueb-neu') { e.uebungen.push({ id: k.toLowerCase() + neueId(), name: '', vorgabe: '3 × 10', hinweis: '' }); box.querySelector('#te-liste').innerHTML = zeichnenListe(); return; }
    if (a === 'ueb-weg') { e.uebungen.splice(+ev.target.closest('[data-i]').dataset.i, 1); box.querySelector('#te-liste').innerHTML = zeichnenListe(); return; }
    if (a === 'standard') daten[k] = structuredClone(STANDARD_TRAINING[k]);
    else { e.name = box.querySelector('#te-name').value.trim() || e.name; e.uebungen = e.uebungen.filter((u) => u.name.trim()); }
    const t = eintrag('plan-training', 'training', { titel: 'Trainingsplan' });
    t.einheiten = daten;
    await A.speichern(t);
    blattZu();
  };
}

/* ================= Blatt (Seitenfenster) ================= */

const $blatt = () => A.$('#blatt-box');
const blattAuf = () => { A.$('#blatt').hidden = false; };
const blattZu = () => { A.$('#blatt').hidden = true; };

// Für die Mitteilungen: alle Blöcke der nächsten n Tage
export function planTage(n) {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const aus = [];
  for (let i = 0; i < n; i++) { const d = plusTage(heute, i); for (const b of tagPlan(d)) aus.push({ datum: d, b }); }
  return aus;
}

/* ================= Für Phoenix: die nächsten 14 Tage ausgerechnet ================= */

let cacheZeit = 0;
export function cacheAktualisieren() {
  if (!A.zst.uid) return;
  clearTimeout(cacheZeit);
  cacheZeit = setTimeout(async () => {
    const heute = new Date(); heute.setHours(0, 0, 0, 0);
    const tage = {};
    for (let i = -1; i < 14; i++) {
      const d = plusTage(heute, i), t = tagArt(d);
      tage[iso(d)] = { art: t.art, grund: t.grund || '', bloecke: tagPlan(d).map(({ id, von, bis, kat, titel, fest, optional, einheit }) => ({ id, von, bis, kat, titel, fest: !!fest, optional: !!optional, einheit: einheit || null })) };
    }
    const alt = holen('plan-cache');
    if (alt && JSON.stringify(alt.tage) === JSON.stringify(tage)) return;
    const c = eintrag('plan-cache', 'cache', { titel: 'Plan (für Phoenix)' });
    c.tage = tage; c.training = trainingDaten().einheiten;
    await A.speichern(c);
  }, 1500);
}

// Datums-Hilfen auch fürs Berichtsheft
export { iso, ausIso, plusTage, montagVon, kw };

// Markierung „jetzt“ jede Minute nachziehen, ohne alles neu zu zeichnen
setInterval(() => {
  const jm = jetztMin();
  document.querySelectorAll('.g-jetzt').forEach((g) => (g.style.top = (jm - 360) * 0.62 + 'px'));
}, 60000);
