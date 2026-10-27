// Versteht deutsche Zeitangaben im Text: "morgen 18 Uhr", "jeden Dienstag und Donnerstag um 19 Uhr",
// "halb 8", "am 3.11. um 14:30", "alle 2 Wochen", "werktags", "bis 15.12." …
// Ergebnis: { datum: Date|null, mitZeit, wiederholung: {freq, intervall, tage, bis}|null, rest, treffer }

const TAGE = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };
const TAG_KURZ = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };
const MONATE = { januar: 0, jan: 0, februar: 1, feb: 1, märz: 2, maerz: 2, mär: 2, april: 3, apr: 3, mai: 4, juni: 5, jun: 5, juli: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, oktober: 9, okt: 9, november: 10, nov: 10, dezember: 11, dez: 11 };
const ZAHLEN = { ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12 };
const TAG_NAMEN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const TAG_KUERZEL = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const zahl = (s) => (/^\d+$/.test(s) ? +s : ZAHLEN[s] ?? NaN);
const tagRegex = '(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)';

export function zeitErkennen(text, jetzt = new Date()) {
  let t = ' ' + text + ' ';
  const treffer = [];
  const weg = (re, fn) => { t = t.replace(re, (...m) => { const r = fn(...m); if (r === false) return m[0]; treffer.push(m[0].trim()); return ' '; }); };
  let stunde = null, minute = 0, tagesteil = null;
  let datum = null; // Date (nur Tag)
  let wdh = null;

  // ── Wiederholung ──────────────────────────────────────────────
  weg(/\b(bis (?:zum |zum )?)(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/i, (_m, _b, d, mo, j) => { (wdh ||= {}).bis = baueTag(+d, +mo - 1, j, jetzt).toISOString(); });
  weg(/\b(werktags|unter der woche|montags? bis freitags?)\b/i, () => { wdh = { ...(wdh || {}), freq: 'woche', intervall: 1, tage: [1, 2, 3, 4, 5] }; });
  weg(/\b(am wochenende|wochenends|jedes wochenende)\b/i, () => { wdh = { ...(wdh || {}), freq: 'woche', intervall: 1, tage: [6, 0] }; });
  // "jeden Dienstag und Donnerstag", "jeden Montag, Mittwoch"
  weg(new RegExp(`\\b(?:jeden|jede|immer|alle)\\s+(\\d+|zwei|drei|vier)?\\s*(?:wochen\\s+)?(?:am\\s+)?${tagRegex}((?:\\s*(?:,|und|&|\\+)\\s*${tagRegex})*)`, 'i'), (_m, n, erster, weitere) => {
    const tage = [TAGE[erster.toLowerCase()], ...[...(weitere || '').matchAll(new RegExp(tagRegex, 'gi'))].map((x) => TAGE[x[1].toLowerCase()])];
    wdh = { ...(wdh || {}), freq: 'woche', intervall: n ? zahl(n.toLowerCase()) || 1 : 1, tage: [...new Set(tage)] };
  });
  // "montags", "dienstags und freitags"
  weg(/\b(montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)((?:\s*(?:,|und|&)\s*(?:montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags))*)\b/i, (_m, a, b) => {
    const tage = [a, ...[...(b || '').matchAll(/(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)s/gi)].map((x) => x[1])].map((x) => TAGE[x.toLowerCase().replace(/s$/, '')]);
    wdh = { ...(wdh || {}), freq: 'woche', intervall: 1, tage: [...new Set(tage)] };
  });
  weg(/\balle\s+(\d+|zwei|drei|vier|fünf|sechs)\s+(tage|wochen|monate)\b/i, (_m, n, e) => { wdh = { ...(wdh || {}), freq: { tage: 'tag', wochen: 'woche', monate: 'monat' }[e.toLowerCase()], intervall: zahl(n.toLowerCase()) || 1 }; });
  weg(/\b(jeden tag|täglich|taeglich)\b/i, () => { wdh = { ...(wdh || {}), freq: 'tag', intervall: 1 }; });
  weg(/\b(jede woche|wöchentlich|woechentlich|einmal (?:in der|pro) woche)\b/i, () => { wdh = { ...(wdh || {}), freq: 'woche', intervall: 1, ...(wdh?.tage ? {} : {}) }; });
  weg(/\b(jeden monat|monatlich|einmal im monat)\b/i, () => { wdh = { ...(wdh || {}), freq: 'monat', intervall: 1 }; });
  weg(/\b(jedes jahr|jährlich|jaehrlich)\b/i, () => { wdh = { ...(wdh || {}), freq: 'jahr', intervall: 1 }; });
  if (wdh && !wdh.freq) wdh.freq = 'woche';
  if (wdh && wdh.freq && !wdh.intervall) wdh.intervall = 1;
  if (wdh?.bis && !wdh.freq) wdh = null;

  // ── Zahlendatum zuerst (sonst wird "3.11." als 3:11 Uhr gelesen) ──
  const heute = new Date(jetzt); heute.setHours(0, 0, 0, 0);
  weg(/\b(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?!\d)/i, (_m, d, mo, j) => { if (datum) return false; datum = baueTag(+d, +mo - 1, j, jetzt); });

  // ── Uhrzeit ───────────────────────────────────────────────────
  weg(/\b(morgens|früh|vormittags|mittags|nachmittags|abends|nachts)\b/i, (m) => { tagesteil = m.toLowerCase(); });
  weg(/\bhalb\s+(\d{1,2}|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)(?:\s*uhr)?\b/i, (_m, h) => { stunde = (zahl(h.toLowerCase()) + 23) % 24; minute = 30; });
  weg(/\bviertel\s+nach\s+(\d{1,2}|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\b/i, (_m, h) => { stunde = zahl(h.toLowerCase()); minute = 15; });
  weg(/\bviertel\s+vor\s+(\d{1,2}|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\b/i, (_m, h) => { stunde = (zahl(h.toLowerCase()) + 23) % 24; minute = 45; });
  weg(/\b(?:um\s+|ab\s+|gegen\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:uhr|h)?\b/i, (_m, h, mi) => { if (stunde !== null) return false; stunde = +h; minute = +mi; });
  weg(/\b(?:um\s+|ab\s+|gegen\s+)?([01]?\d|2[0-3])\.([0-5]\d)\s*uhr\b/i, (_m, h, mi) => { if (stunde !== null) return false; stunde = +h; minute = +mi; });
  weg(/\b(?:um|ab|gegen)\s+([01]?\d|2[0-3])(?:\s*uhr)?\b(?!\.\d)/i, (_m, h) => { if (stunde !== null) return false; stunde = +h; minute = 0; });
  weg(/\b([01]?\d|2[0-3])\s*uhr\b/i, (_m, h) => { if (stunde !== null) return false; stunde = +h; minute = 0; });
  // "abends 7": nackte kleine Zahl, wenn ein Tagesteil genannt ist
  if (stunde === null && tagesteil) weg(/(?:^|\s)([1-9]|1[0-2])(?=\s|$)/, (_m, h) => { stunde = +h; minute = 0; });
  if (stunde !== null && stunde <= 12 && tagesteil &&/nachmittags|abends|nachts/.test(tagesteil) && stunde < 12) stunde += 12;
  if (stunde === null && tagesteil) stunde = { morgens: 8, früh: 8, vormittags: 10, mittags: 12, nachmittags: 15, abends: 19, nachts: 22 }[tagesteil];

  // ── Datum ─────────────────────────────────────────────────────
  const plusTage = (n) => { const d = new Date(heute); d.setDate(d.getDate() + n); return d; };
  weg(/\b(?:am\s+)?(\d{1,2})\.?\s+(januar|jan|februar|feb|märz|maerz|mär|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez)\.?(?:\s+(\d{4}))?\b/i, (_m, d, mo, j) => { if (datum) return false; datum = baueTag(+d, MONATE[mo.toLowerCase()], j, jetzt); });
  weg(/\bübermorgen\b/i, () => { if (datum) return false; datum = plusTage(2); });
  weg(/\bmorgen\b(?!s)/i, () => { if (datum) return false; datum = plusTage(1); });
  weg(/\bheute\b/i, () => { if (datum) return false; datum = plusTage(0); });
  weg(/\bin\s+(\d+|einem|einer|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)\s+(tag|tagen|woche|wochen|monat|monaten)\b/i, (_m, n, e) => {
    if (datum) return false;
    const k = zahl(n.toLowerCase()) || 1, einh = e.toLowerCase();
    datum = einh.startsWith('tag') ? plusTage(k) : einh.startsWith('woche') ? plusTage(7 * k) : (() => { const d = new Date(heute); d.setMonth(d.getMonth() + k); return d; })();
  });
  weg(/\bnächste\s+woche\b/i, () => { if (datum) return false; datum = plusTage(((8 - heute.getDay()) % 7) || 7); });
  weg(new RegExp(`\\b(?:am\\s+|nächsten\\s+|kommenden\\s+|diesen\\s+)?${tagRegex}\\b`, 'i'), (m, tag) => {
    if (datum || wdh?.tage) return false;
    const ziel = TAGE[tag.toLowerCase()], naechster = /nächsten|kommenden/i.test(m);
    let diff = (ziel - heute.getDay() + 7) % 7;
    if (diff === 0 && (naechster || (stunde !== null && (stunde < jetzt.getHours() || (stunde === jetzt.getHours() && minute <= jetzt.getMinutes()))))) diff = 7;
    if (naechster && diff < 7 && diff !== 0) diff += 0;
    datum = plusTage(diff);
  });

  // Serie ohne Datum: erster Termin ab jetzt
  if (wdh && !datum) datum = naechsterTag(wdh, heute, stunde, minute, jetzt);
  else if (wdh?.freq === 'woche' && !wdh.tage && datum) wdh.tage = [datum.getDay()];
  if (wdh?.freq === 'woche' && !wdh.tage) wdh.tage = [(datum || heute).getDay()];
  // Nur Uhrzeit: heute, oder morgen wenn schon vorbei
  if (!datum && stunde !== null) { datum = plusTage(0); if (stunde < jetzt.getHours() || (stunde === jetzt.getHours() && minute <= jetzt.getMinutes())) datum = plusTage(1); }
  if (datum && stunde !== null) datum.setHours(stunde, minute, 0, 0);

  const rest = t.replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,.:–-]+|[\s,.:–-]+$/g, '').trim();
  return { datum, mitZeit: stunde !== null, wiederholung: wdh, rest, treffer };
}

function baueTag(d, m, j, jetzt) {
  let jahr = j ? (+j < 100 ? 2000 + +j : +j) : jetzt.getFullYear();
  const x = new Date(jahr, m, d);
  // Ohne Jahr und schon vorbei → nächstes Jahr
  if (!j) { const h = new Date(jetzt); h.setHours(0, 0, 0, 0); if (x < h) x.setFullYear(jahr + 1); }
  return x;
}

function naechsterTag(wdh, heute, stunde, minute, jetzt) {
  const vorbei = (d) => stunde !== null && d.getTime() === heute.getTime() && (stunde < jetzt.getHours() || (stunde === jetzt.getHours() && minute <= jetzt.getMinutes()));
  if (wdh.freq === 'woche' && wdh.tage?.length) {
    for (let i = 0; i < 8; i++) { const d = new Date(heute); d.setDate(d.getDate() + i); if (wdh.tage.includes(d.getDay()) && !vorbei(d)) return d; }
  }
  const d = new Date(heute);
  if (vorbei(d)) d.setDate(d.getDate() + 1);
  return d;
}

// Alle Vorkommen eines (Serien-)Termins zwischen von und bis
export function vorkommen(beginnIso, wdh, von, bis, max = 200) {
  if (!beginnIso) return [];
  const start = new Date(beginnIso);
  if (!wdh) return start >= von && start < bis ? [start] : [];
  const ende = wdh.bis ? new Date(Math.min(new Date(wdh.bis).setHours(23, 59, 59), bis)) : bis;
  const liste = [], n = wdh.intervall || 1;
  const mit = (d) => { const x = new Date(d); x.setHours(start.getHours(), start.getMinutes(), 0, 0); return x; };
  if (wdh.freq === 'woche') {
    const tage = wdh.tage?.length ? wdh.tage : [start.getDay()];
    const wocheStart = new Date(start); wocheStart.setHours(0, 0, 0, 0); wocheStart.setDate(wocheStart.getDate() - ((wocheStart.getDay() + 6) % 7));
    for (let d = new Date(Math.max(start.getTime() - 864e5 * 7, wocheStart.getTime())); d < ende && liste.length < max; d.setDate(d.getDate() + 1)) {
      const wochen = Math.floor((d - wocheStart) / (7 * 864e5));
      const x = mit(d);
      if (tage.includes(d.getDay()) && wochen % n === 0 && x >= start && x >= von && x < ende) liste.push(x);
    }
  } else {
    for (let i = 0, x = new Date(start); x < ende && liste.length < max && i < 5000; i++) {
      if (x >= von) liste.push(new Date(x));
      if (wdh.freq === 'tag') x.setDate(x.getDate() + n);
      else if (wdh.freq === 'monat') x.setMonth(x.getMonth() + n);
      else x.setFullYear(x.getFullYear() + n);
    }
  }
  return liste;
}

// "jeden Di & Do", "alle 2 Wochen Mo", "täglich", "monatlich (am 3.)"
export function wiederholungText(wdh, beginnIso) {
  if (!wdh) return '';
  const n = wdh.intervall || 1;
  let s;
  if (wdh.freq === 'tag') s = n === 1 ? 'täglich' : `alle ${n} Tage`;
  else if (wdh.freq === 'woche') {
    const tage = [...(wdh.tage || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const name = tage.length === 5 && !tage.includes(0) && !tage.includes(6) ? 'werktags' : tage.length === 1 ? TAG_NAMEN[tage[0]] : tage.map((d) => TAG_KUERZEL[d]).join(' & ');
    s = n === 1 ? (name === 'werktags' ? name : `jeden ${name}`) : `alle ${n} Wochen ${name}`;
  } else if (wdh.freq === 'monat') s = n === 1 ? `monatlich${beginnIso ? ` am ${new Date(beginnIso).getDate()}.` : ''}` : `alle ${n} Monate`;
  else s = 'jährlich';
  return s + (wdh.bis ? ` bis ${new Date(wdh.bis).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}` : ' · unbefristet');
}

export { TAG_KUERZEL };
