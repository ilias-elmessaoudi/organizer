// Ideen-Galaxie: alle Einträge als Sterne auf einer Kugel, verbunden nach gemeinsamen Themen.
// Jeder Bereich ist ein leuchtender Kern, um den seine Ideen, Pläne und Termine kreisen.
// Eigene 3D-Projektion auf Canvas, ohne Bibliothek.

const FUELL = new Set(['der', 'die', 'das', 'und', 'oder', 'mit', 'für', 'von', 'ein', 'eine', 'einen', 'auf', 'aus', 'bei', 'nach', 'zum', 'zur', 'ich', 'mein', 'meine', 'mir', 'mich', 'nicht', 'auch', 'noch', 'dann', 'wenn', 'dass', 'über', 'unter', 'mehr', 'jeden', 'jede', 'jeder', 'einmal', 'immer', 'heute', 'morgen', 'machen', 'neue', 'neuen', 'neues', 'test']);
const worte = (e) => new Set(`${e.titel} ${e.text || ''}`.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !FUELL.has(w)));

// Fester Zufall aus der ID, damit jeder Stern immer am selben Platz steht
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function zufall(seed) { let s = Math.floor(seed * 2 ** 31) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967295; }

const RICHTUNG = { // Mittelpunkt jedes Bereichs auf der Kugel (Längen-/Breitengrad), gleichmäßig verteilt
  business: [0, .55], stream: [1.26, -.5], privat: [2.51, .5], volleyball: [3.77, -.55], sonstiges: [5.03, .1],
};
const kugel = (lon, lat) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];

export function galaxie(canvas, { farben, namen, beiKlick }) {
  const ctx = canvas.getContext('2d');
  let knoten = [], kanten = [], hubs = [];
  let gierung = 0, neigung = -.28, zoom = 1, ziehen = null, tempo = .0016, hover = null, auswahl = null, sichtbar = true;
  let W = 0, H = 0, dpr = 1;

  // Sternenhimmel und Milchstraßen-Band (einmal erzeugt)
  const r0 = zufall(.4242);
  const sterne = Array.from({ length: 420 }, () => { const u = r0() * 2 - 1, t = r0() * Math.PI * 2, s = Math.sqrt(1 - u * u); return { p: [s * Math.cos(t) * 6, u * 6, s * Math.sin(t) * 6], g: r0() * 1.2 + .2, h: r0() }; });
  const band = Array.from({ length: 1400 }, () => {
    const arm = Math.floor(r0() * 2), d = Math.pow(r0(), .7) * 1.55 + 1.12, w = d * 2.2 + arm * Math.PI + (r0() - .5) * .5;
    // Spiralscheibe, um 53° gekippt, damit man sie schräg von oben sieht
    const x = Math.cos(w) * d, y = (r0() - .5) * .16 * (3 - d), z = Math.sin(w) * d, k = Math.cos(.92), s = Math.sin(.92);
    return { p: [x, y * k - z * s, y * s + z * k], g: r0() * 1.1 + .25, f: r0() };
  });

  function setzen(eintraege) {
    const alt = new Map(knoten.map((k) => [k.e.id, k]));
    knoten = eintraege.map((e) => {
      const b = RICHTUNG[e.bereich] ? e.bereich : 'sonstiges';
      const [lon, lat] = RICHTUNG[b], r = zufall(hash(e.id));
      const streu = .38 + (e.typ === 'idee' ? 0 : .12);
      const p = kugel(lon + (r() - .5) * streu * 2, lat + (r() - .5) * streu * 1.4);
      const tiefe = .9 + r() * .14;
      return { e, b, p: p.map((v) => v * tiefe), worte: worte(e), tags: new Set((e.stichworte || []).map((s) => s.toLowerCase())), puls: r() * 6, a: alt.get(e.id)?.a ?? 0 };
    });
    hubs = Object.keys(RICHTUNG).filter((b) => knoten.some((k) => k.b === b)).map((b) => ({ b, p: kugel(...RICHTUNG[b]).map((v) => v * .72) }));
    // Verbindungen: gemeinsame Stichworte zählen viel, gemeinsame Wörter etwas, gleicher Bereich wenig
    const paare = [];
    for (let i = 0; i < knoten.length; i++) for (let j = i + 1; j < knoten.length; j++) {
      const a = knoten[i], c = knoten[j];
      let w = 0;
      for (const t of a.tags) if (c.tags.has(t)) w += 3;
      for (const t of a.worte) if (c.worte.has(t)) w += 1.2;
      if (a.b === c.b) w += .6;
      if (w >= 1.8) paare.push({ a, c, w });
    }
    paare.sort((x, y) => y.w - x.w);
    const grad = new Map();
    kanten = paare.filter(({ a, c }) => { const ga = grad.get(a) || 0, gc = grad.get(c) || 0; if (ga >= 4 || gc >= 4) return false; grad.set(a, ga + 1); grad.set(c, gc + 1); return true; });
  }

  function groesse() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  // 3D → Bildschirm
  function proj(p) {
    const cg = Math.cos(gierung), sg = Math.sin(gierung), cn = Math.cos(neigung), sn = Math.sin(neigung);
    let x = p[0] * cg - p[2] * sg, z = p[0] * sg + p[2] * cg, y = p[1];
    const y2 = y * cn - z * sn; z = y * sn + z * cn; y = y2;
    const R = Math.min(W, H) * .33 * zoom, kamera = 3.4, f = kamera / (kamera - z);
    return { x: W / 2 + x * R * f, y: H / 2 + y * R * f, z, f };
  }

  function malen(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = Math.min(W, H) * .33 * zoom;
    // Nebel hinter der Kugel
    const neb = ctx.createRadialGradient(W / 2, H / 2, R * .1, W / 2, H / 2, R * 1.9);
    neb.addColorStop(0, 'rgba(150, 90, 255, .22)'); neb.addColorStop(.45, 'rgba(70, 30, 140, .1)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // Sterne
    for (const s of sterne) {
      const q = proj(s.p); if (q.z > 2.5) continue;
      const fl = .5 + .5 * Math.sin(t / 900 + s.h * 40);
      ctx.fillStyle = `rgba(210, 200, 255, ${.25 + fl * .45})`;
      ctx.fillRect(q.x, q.y, s.g * q.f * .6, s.g * q.f * .6);
    }
    // Milchstraße: zwei Spiralarme durch die Kugel
    for (const b of band) {
      const q = proj(b.p); if (q.f <= 0) continue;
      const farbe = b.f < .55 ? '180, 140, 255' : b.f < .85 ? '120, 170, 255' : '255, 170, 230';
      ctx.fillStyle = `rgba(${farbe}, ${.3 + b.g * .38})`;
      const g = b.g * q.f * 1.5;
      if (g > 1.6) { ctx.beginPath(); ctx.arc(q.x, q.y, g / 2, 0, 7); ctx.fill(); } else ctx.fillRect(q.x, q.y, g, g);
    }
    // Kugelgitter (HUD)
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = .6;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      for (let lon = 0; lon <= 360; lon += 8) { const q = proj(kugel(lon * Math.PI / 180, lat * Math.PI / 180)); lon ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = 'rgba(164, 107, 255, .13)'; ctx.stroke();
    }
    for (let lon = 0; lon < 180; lon += 30) {
      ctx.beginPath();
      for (let lat = 0; lat <= 360; lat += 8) { const q = proj(kugel(lon * Math.PI / 180, lat * Math.PI / 180)); lat ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = 'rgba(164, 107, 255, .1)'; ctx.stroke();
    }
    // Atmosphäre: leuchtender Rand der Kugel und Kern in der Mitte
    const rand = ctx.createRadialGradient(W / 2, H / 2, R * .86, W / 2, H / 2, R * 1.12);
    rand.addColorStop(0, 'rgba(164, 107, 255, 0)'); rand.addColorStop(.55, 'rgba(164, 107, 255, .16)'); rand.addColorStop(1, 'rgba(164, 107, 255, 0)');
    ctx.fillStyle = rand; ctx.beginPath(); ctx.arc(W / 2, H / 2, R * 1.12, 0, 7); ctx.fill();
    const innen = ctx.createRadialGradient(W / 2 - R * .3, H / 2 - R * .35, 0, W / 2, H / 2, R);
    innen.addColorStop(0, 'rgba(190, 150, 255, .07)'); innen.addColorStop(1, 'rgba(60, 20, 120, .02)');
    ctx.fillStyle = innen; ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 7); ctx.fill();
    const kern = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * .22);
    const atem = .75 + .25 * Math.sin(t / 900);
    kern.addColorStop(0, `rgba(255, 245, 255, ${.9 * atem})`); kern.addColorStop(.18, `rgba(200, 150, 255, ${.55 * atem})`); kern.addColorStop(1, 'rgba(120, 60, 220, 0)');
    ctx.fillStyle = kern; ctx.beginPath(); ctx.arc(W / 2, H / 2, R * .22, 0, 7); ctx.fill();
    // Äußere Ringe wie bei Phoenix
    ctx.save(); ctx.translate(W / 2, H / 2);
    ctx.strokeStyle = 'rgba(164, 107, 255, .35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.32, t / 4000, t / 4000 + 1.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 1.32, t / 4000 + Math.PI, t / 4000 + Math.PI + 1.1); ctx.stroke();
    ctx.setLineDash([2, 6]); ctx.strokeStyle = 'rgba(164, 107, 255, .2)';
    ctx.beginPath(); ctx.arc(0, 0, R * 1.42, -t / 6000, -t / 6000 + Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 72; i++) { const w = (i / 72) * Math.PI * 2 + t / 9000, l = i % 6 ? 4 : 9; ctx.strokeStyle = `rgba(164, 107, 255, ${i % 6 ? .12 : .3})`; ctx.beginPath(); ctx.moveTo(Math.cos(w) * R * 1.5, Math.sin(w) * R * 1.5); ctx.lineTo(Math.cos(w) * (R * 1.5 + l), Math.sin(w) * (R * 1.5 + l)); ctx.stroke(); }
    ctx.restore();

    const P = new Map(knoten.map((k) => [k, proj(k.p)]));
    const H2 = new Map(hubs.map((h) => [h.b, proj(h.p)]));
    const fokus = hover || auswahl;
    const nachbarn = new Set();
    if (fokus) for (const k of kanten) { if (k.a === fokus) nachbarn.add(k.c); if (k.c === fokus) nachbarn.add(k.a); }
    ctx.globalCompositeOperation = 'lighter';
    // Fäden von den Kernen zu ihren Sternen
    for (const k of knoten) {
      const a = H2.get(k.b), b = P.get(k);
      ctx.strokeStyle = hexA(farben[k.b], .07 * (b.z > 0 ? 1.4 : .7));
      ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Verbindungen: leuchtende Bögen, die zur Mitte hin durchhängen
    for (const k of kanten) {
      const a = P.get(k.a), b = P.get(k.c);
      const hell = fokus ? (k.a === fokus || k.c === fokus ? 1 : .15) : .55;
      const tiefe = (a.z + b.z) / 2 > 0 ? 1 : .55;
      const mx = (a.x + b.x) / 2 + (W / 2 - (a.x + b.x) / 2) * .22, my = (a.y + b.y) / 2 + (H / 2 - (a.y + b.y) / 2) * .22;
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, hexA(farben[k.a.b], .55 * hell * tiefe)); g.addColorStop(1, hexA(farben[k.c.b], .55 * hell * tiefe));
      ctx.strokeStyle = g; ctx.lineWidth = Math.min(3, .6 + k.w * .25) * (hell > .9 ? 1.6 : 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
      // Lichtpunkt, der an der Verbindung entlangwandert
      if (hell > .3) { const u = ((t / 2600 + hash(k.a.e.id + k.c.e.id)) % 1); const x = (1 - u) ** 2 * a.x + 2 * (1 - u) * u * mx + u * u * b.x, y = (1 - u) ** 2 * a.y + 2 * (1 - u) * u * my + u * u * b.y; ctx.fillStyle = `rgba(255,255,255,${.5 * hell * tiefe})`; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
    }
    // Kerne der Bereiche
    for (const h of hubs) {
      const q = H2.get(h.b), r = 10 * q.f * zoom ** .5;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 3.2);
      g.addColorStop(0, hexA(farben[h.b], .9)); g.addColorStop(.25, hexA(farben[h.b], .35)); g.addColorStop(1, hexA(farben[h.b], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 3.2, 0, 7); ctx.fill();
    }
    // Sterne (Einträge), hinten zuerst
    const reihe = [...knoten].sort((x, y) => P.get(x).z - P.get(y).z);
    for (const k of reihe) {
      const q = P.get(k);
      k.a = Math.min(1, k.a + .04);
      const dimm = fokus && k !== fokus && !nachbarn.has(k) ? .25 : 1;
      const tief = q.z > 0 ? 1 : .55;
      const basis = k.e.typ === 'idee' ? 4.2 : k.e.typ === 'aufgabe' ? 3 : k.e.typ === 'termin' ? 3.4 : 2.6;
      const erledigt = k.e.status === 'erledigt' || k.e.status === 'archiv';
      const r = basis * q.f * (1 + .18 * Math.sin(t / 700 + k.puls)) * (k === fokus ? 1.6 : 1) * k.a;
      const al = dimm * tief * (erledigt ? .35 : 1) * k.a;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4);
      g.addColorStop(0, hexA(farben[k.b], .85 * al)); g.addColorStop(.3, hexA(farben[k.b], .3 * al)); g.addColorStop(1, hexA(farben[k.b], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 4, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${.95 * al})`;
      if (k.e.typ === 'termin') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-r * .55, -r * .55, r * 1.1, r * 1.1); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(q.x, q.y, r * .55, 0, 7); ctx.fill(); }
      if (k.e.ausbau) { ctx.strokeStyle = hexA('#41f2a3', .8 * al); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, r * 1.3, 0, 7); ctx.stroke(); }
      k.bild = { x: q.x, y: q.y, r: Math.max(8, r * 2) };
    }
    // Beschriftungen
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    for (const h of hubs) {
      const q = H2.get(h.b);
      ctx.font = '600 10px Bahnschrift, Rajdhani, "Segoe UI", sans-serif';
      if (q.z < -.35) continue;
      ctx.fillStyle = hexA(farben[h.b], q.z > 0 ? .95 : .4);
      ctx.fillText(namen[h.b].toUpperCase().split('').join(' '), q.x, q.y - 16 * q.f);
    }
    const beschriften = fokus ? [fokus, ...nachbarn] : reihe.filter((k) => P.get(k).z > .62 && k.e.typ === 'idee').slice(-4).reverse();
    const belegt = [];
    for (const k of beschriften) {
      const q = P.get(k), text = k.e.titel.length > 34 ? k.e.titel.slice(0, 32) + '…' : k.e.titel;
      ctx.font = `${k === fokus ? 600 : 500} ${k === fokus ? 13 : 11}px "Segoe UI", system-ui, sans-serif`;
      const b = ctx.measureText(text).width + 14;
      const box = [q.x - b / 2, q.y + 10, q.x + b / 2, q.y + 30];
      if (k !== fokus && belegt.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      belegt.push(box);
      ctx.fillStyle = 'rgba(8, 6, 16, .78)'; ctx.strokeStyle = hexA(farben[k.b], .6);
      rund(ctx, q.x - b / 2, q.y + 10, b, 20, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#efe8ff'; ctx.fillText(text, q.x, q.y + 24);
    }
  }

  let raf, letzte = performance.now();
  function schleife(t) {
    const dt = Math.min(50, t - letzte); letzte = t;
    if (!ziehen && !hover) gierung += tempo * dt / 16;
    malen(t);
    raf = sichtbar ? requestAnimationFrame(schleife) : 0;
  }

  // Bedienung: ziehen dreht, Rad/Pinch zoomt, Tippen öffnet
  const treffer = (x, y) => { let best = null, d = 1e9; for (const k of knoten) { if (!k.bild) continue; const dd = Math.hypot(k.bild.x - x, k.bild.y - y); if (dd < k.bild.r + 6 && dd < d) { d = dd; best = k; } } return best; };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const finger = new Map();
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch {} finger.set(e.pointerId, pos(e)); ziehen = { x: e.clientX, y: e.clientY, g: gierung, n: neigung, weg: 0 }; });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (finger.size === 2 && finger.has(e.pointerId)) {
      const [a, b] = [...finger.values()], vorher = Math.hypot(a[0] - b[0], a[1] - b[1]);
      finger.set(e.pointerId, [x, y]);
      const [c, d] = [...finger.values()], nachher = Math.hypot(c[0] - d[0], c[1] - d[1]);
      zoom = Math.max(.55, Math.min(2.6, zoom * nachher / (vorher || nachher))); return;
    }
    if (ziehen) {
      const dx = e.clientX - ziehen.x, dy = e.clientY - ziehen.y; ziehen.weg = Math.max(ziehen.weg, Math.hypot(dx, dy));
      gierung = ziehen.g + dx * .006; neigung = Math.max(-1.2, Math.min(1.2, ziehen.n + dy * .006));
    } else { hover = e.pointerType === 'mouse' ? treffer(x, y) : null; canvas.style.cursor = hover ? 'pointer' : 'grab'; }
  });
  const los = (e) => {
    finger.delete(e.pointerId);
    if (ziehen && ziehen.weg < 6) { const k = treffer(...pos(e)); if (k) { auswahl = k; beiKlick?.(k.e); } else auswahl = null; }
    ziehen = null;
  };
  canvas.addEventListener('pointerup', los);
  canvas.addEventListener('pointercancel', los);
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(.55, Math.min(2.6, zoom * Math.exp(-e.deltaY * .0012))); }, { passive: false });

  const ro = new ResizeObserver(groesse); ro.observe(canvas);
  groesse();
  // Nur animieren, wenn die Kugel im Bild und die App im Vordergrund ist – und danach zuverlässig wieder anlaufen
  let imBild = true;
  const pruefen = () => { sichtbar = imBild && !document.hidden; if (sichtbar && !raf) { letzte = performance.now(); raf = requestAnimationFrame(schleife); } };
  const sichtWaechter = new IntersectionObserver(([e]) => { imBild = e.isIntersecting; pruefen(); });
  sichtWaechter.observe(canvas);
  document.addEventListener('visibilitychange', pruefen);
  raf = requestAnimationFrame(schleife);

  return {
    setzen,
    beenden() { cancelAnimationFrame(raf); ro.disconnect(); sichtWaechter.disconnect(); document.removeEventListener('visibilitychange', pruefen); },
    get statistik() { return { sterne: knoten.length, verbindungen: kanten.length, kerne: hubs.length }; },
  };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}
function rund(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
