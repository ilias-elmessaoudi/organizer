// Berichtsheft: pro Tag Stichpunkte, pro Woche ein Ausbildungsnachweis als PDF.
// Drin steht nur, was Ilias selbst tippt oder Phoenix sagt. Es wird nichts dazugedichtet.
// Einträge: bericht-JJJJ-MM-TT (ein Tag) und bericht-angaben. Typ "plan", damit sie nicht in den Listen auftauchen.
import { tagArt, iso, ausIso, plusTage, montagVon, kw } from './wochenplan.js';
import { diktatEinrichten } from './diktat.js';

let A; // { zst, speichern, hinweis, $, esc, zeichnen }
export function berichtEinrichten(a) { A = a; }

const BEREICHE = { betrieb: 'Betrieb', unterweisung: 'Unterweisung', schule: 'Berufsschule' };
const KURZ = { betrieb: 'Betrieb', unterweisung: 'Unterw.', schule: 'Schule' };
const FOLGE = { betrieb: 'unterweisung', unterweisung: 'schule', schule: 'betrieb' };
const STATUS = { urlaub: 'Urlaub', krank: 'Krank' };
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MIKRO = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

const z = { woche: null, tag: null, bereich: null, text: '', fokus: false };

const heuteTag = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const holen = (id) => A.zst.eintraege.get(id);
const tagId = (d) => 'bericht-' + iso(d);
const angaben = () => holen('bericht-angaben') || {};
const neueId = () => 'p' + Math.random().toString(36).slice(2, 9);
const kurz = (d) => `${WT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
const datumVoll = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const standardBereich = (d) => (tagArt(d).art === 'schule' ? 'schule' : 'betrieb');
const istArbeitstag = (d) => ['arbeit', 'schule'].includes(tagArt(d).art);
const zaehlt = (d) => { const b = angaben().beginn; return istArbeitstag(d) && (!b || iso(d) >= b); };
const hatInhalt = (d) => { const e = holen(tagId(d)); return !!(e?.status || e?.punkte?.length); };

function tagKopie(d) {
  return structuredClone(holen(tagId(d))) || { id: tagId(d), typ: 'plan', unterart: 'bericht', titel: 'Berichtsheft', bereich: 'business', erstellt: Date.now(), datum: iso(d), status: '', punkte: [] };
}

function tagArtText(d) {
  const t = tagArt(d);
  return { schule: 'Berufsschule', arbeit: 'Betrieb', frei: t.grund || 'Frei', wochenende: 'Wochenende' }[t.art] || '';
}

// Arbeitstage seit Ausbildungsbeginn ohne Eintrag (heute zählt erst ab morgen als fehlend)
export function fehlendeTage() {
  const b = angaben().beginn;
  if (!b) return [];
  const heute = heuteTag(), aus = [];
  for (let d = ausIso(b); d < heute; d = plusTage(d, 1)) if (istArbeitstag(d) && !hatInhalt(d)) aus.push(d);
  return aus;
}

function nachweisNr(mo) {
  const b = angaben().beginn;
  if (!b) return null;
  const nr = Math.round((mo - montagVon(ausIso(b))) / 6048e5) + 1;
  return nr >= 1 ? nr : null;
}

function ausbildungsjahr(mo) {
  const bs = angaben().beginn;
  if (!bs) return null;
  const b = ausIso(bs), so = plusTage(mo, 6);
  let jahre = so.getFullYear() - b.getFullYear();
  if (so < new Date(so.getFullYear(), b.getMonth(), b.getDate())) jahre--;
  return Math.max(jahre, 0) + 1;
}

/* ================= Hinweis auf der Kommando-Seite ================= */

export function berichtHinweis() {
  const heute = heuteTag(), fehlend = fehlendeTage();
  const heuteOffen = zaehlt(heute) && !hatInhalt(heute) && new Date().getHours() >= 15;
  if (!fehlend.length && !heuteOffen) return '';
  const teile = [];
  if (heuteOffen) teile.push('Heute fehlt noch dein Eintrag.');
  if (fehlend.length) teile.push(fehlend.length === 1 ? `${kurz(fehlend[0])} ist noch leer.` : `${fehlend.length} frühere Tage sind noch leer.`);
  return `<button class="panel b-hinweis" data-ansicht="bericht"><b>Berichtsheft</b><small>${teile.join(' ')}</small></button>`;
}

/* ================= Ansicht ================= */

const punktZeile = (d, p) => {
  const s = `${iso(d)}|${p.id}`;
  return `<li>
    <button class="b-chip ${p.bereich}" data-wechsel="${s}" title="Bereich wechseln">${KURZ[p.bereich] || p.bereich}</button>
    <input class="b-punkt" data-text="${s}" value="${A.esc(p.text)}" aria-label="Stichpunkt">
    <input class="b-std" data-std="${s}" type="number" min="0" max="24" step="0.5" value="${p.stunden ?? ''}" placeholder="Std" aria-label="Stunden">
    <button class="b-weg" data-weg="${s}" title="Entfernen" aria-label="Entfernen">✕</button>
  </li>`;
};

function tagKarte(d, heute) {
  const e = holen(tagId(d));
  const punkte = e?.punkte || [];
  const fehlt = zaehlt(d) && +d < +heute && !hatInhalt(d);
  return `<div class="panel b-tag ${+d === +heute ? 'heute' : ''} ${fehlt ? 'fehlt' : ''}">
    <div class="b-tag-kopf">
      <div><b>${kurz(d)}</b><small>${fehlt ? 'fehlt noch' : A.esc(tagArtText(d))}</small></div>
      <select data-status="${iso(d)}" aria-label="Art des Tages">
        <option value="">Normal</option>
        ${Object.entries(STATUS).map(([k, n]) => `<option value="${k}" ${e?.status === k ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <button class="b-mehr" data-plus="${iso(d)}" title="Für diesen Tag eintragen" aria-label="Für diesen Tag eintragen">${PLUS}</button>
    </div>
    ${punkte.length ? `<ul class="b-punkte">${punkte.map((p) => punktZeile(d, p)).join('')}</ul>` : `<div class="b-leer">${e?.status ? STATUS[e.status] : 'Noch nichts eingetragen'}</div>`}
  </div>`;
}

export function berichtAnsicht() {
  const heute = heuteTag();
  z.woche ||= montagVon(heute);
  const mo = z.woche, tage = Array.from({ length: 7 }, (_, i) => plusTage(mo, i));
  if (!z.tag || z.tag < mo || z.tag > tage[6]) z.tag = heute >= mo && heute <= tage[6] ? heute : mo;
  const bereich = z.bereich || standardBereich(z.tag);
  const zaehlbar = tage.filter(zaehlt), fertig = zaehlbar.filter(hatInhalt).length;
  const nr = nachweisNr(mo), fehlend = fehlendeTage().length;
  const sichtbar = tage.filter((d, i) => i < 5 || holen(tagId(d))?.punkte?.length || +d === +z.tag);
  const a = angaben();
  return `<div class="plan-kopf panel">
      <div class="plan-woche">
        <button data-b="zurueck" title="Woche zurück">‹</button>
        <div><b>KW ${kw(mo)}</b><small>${mo.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${tage[6].toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</small></div>
        <button data-b="vor" title="Woche vor">›</button>
        ${+mo !== +montagVon(heute) ? '<button data-b="heute" class="klein">Heute</button>' : ''}
      </div>
      <div class="plan-stat">
        <span><b>${fertig}/${zaehlbar.length}</b><small>Tage eingetragen</small></span>
        ${nr ? `<span><b>Nr. ${nr}</b><small>Nachweis</small></span>` : ''}
        ${fehlend ? `<span class="warn"><b>${fehlend}</b><small>Tage offen</small></span>` : ''}
      </div>
      <div class="b-knoepfe">
        <button class="b-knopf" data-b="angaben">Angaben</button>
        <button class="b-knopf haupt" data-b="pdf">PDF speichern</button>
      </div>
    </div>
    ${a.beginn ? '' : '<button class="panel b-hinweis" data-b="angaben"><b>Einmal einrichten</b><small>Trag deine Angaben und den Ausbildungsbeginn ein, dann stimmen Nummer, Ausbildungsjahr und die Liste der offenen Tage.</small></button>'}
    <div class="panel b-eingabe">
      <div class="panel-titel">Was hast du gemacht?</div>
      <div class="b-zeile">
        <select id="b-tag" aria-label="Tag">${tage.map((d) => `<option value="${iso(d)}" ${+d === +z.tag ? 'selected' : ''}>${kurz(d)}</option>`).join('')}</select>
        <select id="b-bereich" aria-label="Bereich">${Object.entries(BEREICHE).map(([k, n]) => `<option value="${k}" ${k === bereich ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="b-zeile">
        <input id="b-text" value="${A.esc(z.text)}" placeholder="z. B. Kontaktformular mit PHP gebaut" autocomplete="off" enterkeyhint="done" aria-label="Stichpunkt">
        <button class="mikro" id="b-mikro" title="Diktieren" aria-label="Diktieren">${MIKRO}</button>
        <button class="hinzu" id="b-dazu" title="Eintragen" aria-label="Eintragen">${PLUS}</button>
      </div>
    </div>
    <div class="b-tage">${sichtbar.map((d) => tagKarte(d, heute)).join('')}</div>`;
}

async function eintragen() {
  const feld = A.$('#b-text'), text = feld.value.trim();
  if (!text) return feld.focus();
  const e = tagKopie(z.tag);
  e.punkte.push({ id: neueId(), text, bereich: A.$('#b-bereich').value, stunden: null, quelle: 'app' });
  z.text = ''; z.fokus = true;
  await A.speichern(e);
}

async function punktAendern(schluessel, wie) {
  const [t, pid] = schluessel.split('|');
  const e = tagKopie(ausIso(t)), i = e.punkte.findIndex((p) => p.id === pid);
  if (i < 0) return;
  wie(e.punkte, i);
  await A.speichern(e);
}

export function berichtVerdrahten(ziel) {
  const feld = ziel.querySelector('#b-text');
  if (!feld) return;
  diktatEinrichten({ feld, mikro: ziel.querySelector('#b-mikro'), melden: A.hinweis });
  A.zst.diktatHier = true;
  feld.oninput = () => { z.text = feld.value; };
  feld.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); eintragen(); } };
  if (z.fokus) { z.fokus = false; feld.focus(); }

  ziel.onchange = async (ev) => {
    const t = ev.target;
    if (t.id === 'b-tag') { z.tag = ausIso(t.value); z.bereich = null; A.$('#b-bereich').value = standardBereich(z.tag); return; }
    if (t.id === 'b-bereich') { z.bereich = t.value; return; }
    if (t.dataset.status) { const e = tagKopie(ausIso(t.dataset.status)); e.status = t.value; return A.speichern(e); }
    if (t.dataset.text) {
      const neu = t.value.trim();
      return punktAendern(t.dataset.text, (l, i) => { if (neu) l[i].text = neu; else l.splice(i, 1); });
    }
    if (t.dataset.std) {
      const n = parseFloat(t.value.replace(',', '.'));
      return punktAendern(t.dataset.std, (l, i) => { l[i].stunden = Number.isFinite(n) && n >= 0 ? n : null; });
    }
  };

  ziel.onclick = async (ev) => {
    const b = ev.target.closest('[data-b]')?.dataset.b;
    if (b === 'zurueck' || b === 'vor') { z.woche = plusTage(z.woche, b === 'vor' ? 7 : -7); z.tag = null; z.bereich = null; return A.zeichnen(); }
    if (b === 'heute') { z.woche = montagVon(heuteTag()); z.tag = null; z.bereich = null; return A.zeichnen(); }
    if (b === 'angaben') return angabenBlatt();
    if (b === 'pdf') return pdfSpeichern(ev.target.closest('button'));
    if (ev.target.closest('#b-dazu')) return eintragen();
    const weg = ev.target.closest('[data-weg]')?.dataset.weg;
    if (weg) return punktAendern(weg, (l, i) => l.splice(i, 1));
    const wechsel = ev.target.closest('[data-wechsel]')?.dataset.wechsel;
    if (wechsel) return punktAendern(wechsel, (l, i) => { l[i].bereich = FOLGE[l[i].bereich] || 'betrieb'; });
    const plus = ev.target.closest('[data-plus]')?.dataset.plus;
    if (plus) {
      z.tag = ausIso(plus); z.bereich = null;
      A.$('#b-tag').value = plus; A.$('#b-bereich').value = standardBereich(z.tag);
      feld.focus(); feld.scrollIntoView({ block: 'center' });
    }
  };
}

/* ================= Angaben ================= */

function angabenBlatt() {
  const a = angaben(), box = A.$('#blatt-box');
  const feld = (id, name, wert, zusatz = '') => `<label class="feld">${name}<input id="ba-${id}" value="${A.esc(wert)}" ${zusatz}></label>`;
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Berichtsheft</b><button data-a="sichern">Fertig</button></div>
    ${feld('name', 'Name', a.name ?? 'Ilias El Messaoudi')}
    ${feld('beruf', 'Ausbildungsberuf', a.beruf ?? '', 'placeholder="z. B. Fachinformatiker Anwendungsentwicklung"')}
    ${feld('betrieb', 'Betrieb', a.betrieb ?? 'Netperformers')}
    ${feld('abteilung', 'Abteilung (falls gefragt)', a.abteilung ?? '')}
    ${feld('beginn', 'Ausbildungsbeginn', a.beginn ?? '', 'type="date"')}`;
  A.$('#blatt').hidden = false;
  box.onclick = async (ev) => {
    const w = ev.target.closest('[data-a]')?.dataset.a;
    if (!w) return;
    A.$('#blatt').hidden = true;
    if (w !== 'sichern') return;
    const lies = (id) => box.querySelector('#ba-' + id).value.trim();
    await A.speichern({ ...(holen('bericht-angaben') || { id: 'bericht-angaben', typ: 'plan', unterart: 'bericht-angaben', titel: 'Berichtsheft-Angaben', bereich: 'business', erstellt: Date.now() }),
      name: lies('name'), beruf: lies('beruf'), betrieb: lies('betrieb'), abteilung: lies('abteilung'), beginn: lies('beginn') });
  };
}

/* ================= PDF ================= */

function pdfBaustein() {
  if (window.PDFLib) return Promise.resolve();
  return new Promise((ok, nein) => {
    const s = document.createElement('script');
    s.src = 'vendor/pdf-lib.min.js';
    s.onload = ok;
    s.onerror = () => nein(new Error('Der PDF-Baustein konnte nicht geladen werden.'));
    document.head.append(s);
  });
}

// Zeilen je Abschnitt: pro Tag die Stichpunkte, dazu Urlaub, Krank und freie Tage
function abschnitte(mo) {
  const aus = { betrieb: [], unterweisung: [], schule: [] };
  for (let i = 0; i < 7; i++) {
    const d = plusTage(mo, i), e = holen(tagId(d)), t = tagArt(d);
    if (e?.status) aus[standardBereich(d)].push({ d, text: STATUS[e.status] || e.status, stunden: null });
    else if (t.art === 'frei' && !e?.punkte?.length) aus.betrieb.push({ d, text: t.grund || 'Frei', stunden: null });
    for (const p of e?.punkte || []) (aus[p.bereich] || aus.betrieb).push({ d, text: p.text, stunden: p.stunden ?? null });
  }
  return aus;
}

export async function berichtPdfBytes(mo) {
  await pdfBaustein();
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica), fett = await pdf.embedFont(StandardFonts.HelveticaBold);
  const a = angaben(), B = 595.28, H = 841.89, R = 48;
  const schwarz = rgb(0, 0, 0), grau = rgb(0.38, 0.38, 0.38), linie = rgb(0.72, 0.72, 0.72), flaeche = rgb(0.93, 0.93, 0.93);
  pdf.setTitle(`Ausbildungsnachweis KW ${kw(mo)}`); pdf.setAuthor(a.name || '');

  // Helvetica kennt nur westeuropäische Zeichen, alles andere würde sonst das PDF abbrechen
  const sauber = (t) => [...String(t ?? '').replace(/\s+/g, ' ')].map((c) => { try { normal.widthOfTextAtSize(c, 10); return c; } catch { return '?'; } }).join('');
  const breite = (t, f, g) => f.widthOfTextAtSize(t, g);
  function umbrechen(text, f, g, max) {
    const zeilen = []; let z2 = '';
    for (let w of sauber(text).split(' ')) {
      while (breite(w, f, g) > max) {
        let n = w.length; while (n > 1 && breite(w.slice(0, n), f, g) > max) n--;
        if (z2) { zeilen.push(z2); z2 = ''; }
        zeilen.push(w.slice(0, n)); w = w.slice(n);
      }
      const probe = z2 ? z2 + ' ' + w : w;
      if (breite(probe, f, g) > max) { zeilen.push(z2); z2 = w; } else z2 = probe;
    }
    if (z2) zeilen.push(z2);
    return zeilen.length ? zeilen : [''];
  }

  let seite = pdf.addPage([B, H]), y = H - R;
  const text = (t, x, yy, { f = normal, g = 10, c = schwarz } = {}) => seite.drawText(sauber(t), { x, y: yy, font: f, size: g, color: c });
  const strich = (x1, yy, x2, c = linie, d = 0.6) => seite.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: d, color: c });
  const platz = (n) => { if (y - n < R) { seite = pdf.addPage([B, H]); y = H - R; } };

  const nr = nachweisNr(mo), jahr = ausbildungsjahr(mo);
  text('Ausbildungsnachweis', R, y - 16, { f: fett, g: 18 });
  const nrText = nr ? `Nr. ${nr}` : 'Nr. ______';
  text(nrText, B - R - breite(nrText, fett, 12), y - 14, { f: fett, g: 12 });
  y -= 30;
  strich(R, y, B - R, schwarz, 1);
  y -= 16;

  const mitte = (R + B - R) / 2 + 8;
  const zeileAngabe = (l1, w1, l2, w2) => {
    text(l1, R, y, { g: 8, c: grau }); text(l2, mitte, y, { g: 8, c: grau });
    if (w1) text(w1, R, y - 12, { g: 10.5 }); if (w2) text(w2, mitte, y - 12, { g: 10.5 });
    strich(R, y - 16, mitte - 16); strich(mitte, y - 16, B - R);
    y -= 30;
  };
  zeileAngabe('Name', a.name, 'Ausbildungsjahr', jahr ? `${jahr}. Ausbildungsjahr` : '');
  zeileAngabe('Ausbildungsberuf', a.beruf, 'Betrieb', a.betrieb);
  zeileAngabe('Abteilung', a.abteilung, 'Ausbildungswoche', `KW ${kw(mo)}: ${datumVoll(mo)} bis ${datumVoll(plusTage(mo, 6))}`);
  y -= 4;

  const tagB = 58, stdB = 42, textX = R + tagB, textB = B - R - stdB - textX - 8;
  const daten = abschnitte(mo);
  const titel = { betrieb: 'Betriebliche Tätigkeiten', unterweisung: 'Unterweisungen, betrieblicher Unterricht, sonstige Schulungen', schule: 'Themen des Berufsschulunterrichts' };
  for (const k of ['betrieb', 'unterweisung', 'schule']) {
    platz(60);
    seite.drawRectangle({ x: R, y: y - 16, width: B - 2 * R, height: 18, color: flaeche });
    text(titel[k], R + 6, y - 11, { f: fett, g: 9.5 });
    text('Stunden', B - R - breite('Stunden', normal, 8) - 6, y - 11, { g: 8, c: grau });
    y -= 30;
    const zeilen = daten[k];
    if (!zeilen.length) { text('Keine Einträge', textX, y, { g: 9.5, c: grau }); y -= 15; }
    let letzter = null;
    for (const r of zeilen) {
      const umbruch = umbrechen(r.text, normal, 10, textB);
      platz(umbruch.length * 13 + 4);
      if (letzter !== +r.d) { text(kurz(r.d), R + 6, y, { f: fett, g: 9 }); letzter = +r.d; }
      if (r.stunden != null) { const s = String(r.stunden).replace('.', ','); text(s, B - R - breite(s, normal, 10) - 6, y); }
      umbruch.forEach((l, i) => text(l, textX, y - i * 13));
      y -= umbruch.length * 13 + 3;
    }
    const summe = zeilen.reduce((s, r) => s + (r.stunden || 0), 0);
    if (summe > 0) {
      const s = String(summe).replace('.', ',');
      strich(B - R - stdB, y + 9, B - R);
      text('Summe', B - R - stdB - breite('Summe', normal, 8.5) - 6, y - 2, { g: 8.5, c: grau });
      text(s, B - R - breite(s, fett, 10) - 6, y - 2, { f: fett });
      y -= 14;
    }
    y -= 8;
  }

  platz(96);
  y = Math.min(y, H - R) - 6;
  text('Durch die nachfolgende Unterschrift wird die Richtigkeit und Vollständigkeit der obigen Angaben bestätigt.', R, y, { g: 8.5, c: grau });
  y -= 46;
  strich(R, y, mitte - 16, schwarz); strich(mitte, y, B - R, schwarz);
  text('Datum, Unterschrift Auszubildende/r', R, y - 11, { g: 8, c: grau });
  text('Datum, Unterschrift Ausbilder/in', mitte, y - 11, { g: 8, c: grau });
  return pdf.save();
}

async function pdfSpeichern(knopf) {
  const mo = z.woche, heute = heuteTag();
  knopf.disabled = true;
  try {
    const bytes = await berichtPdfBytes(mo);
    const name = `Berichtsheft_KW${String(kw(mo)).padStart(2, '0')}_${plusTage(mo, 3).getFullYear()}.pdf`;
    const datei = new File([bytes], name, { type: 'application/pdf' });
    const handy = /iPhone|iPad|Android/.test(navigator.userAgent) && navigator.canShare?.({ files: [datei] });
    if (handy) {
      await navigator.share({ files: [datei], title: name }).catch((f) => { if (f.name !== 'AbortError') throw f; });
    } else {
      const url = URL.createObjectURL(datei), a = document.createElement('a');
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    const leer = Array.from({ length: 7 }, (_, i) => plusTage(mo, i)).filter((d) => zaehlt(d) && +d <= +heute && !hatInhalt(d)).length;
    A.hinweis(leer ? `PDF fertig. ${leer === 1 ? 'Ein Tag ist' : leer + ' Tage sind'} darin noch leer.` : 'PDF fertig.', 3500);
  } catch (f) {
    A.hinweis('PDF ging nicht: ' + f.message, 5000);
  } finally {
    knopf.disabled = false;
  }
}
