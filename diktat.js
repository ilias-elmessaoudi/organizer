// Diktieren: eigenes Mikrofon wählbar, Pegelanzeige, klare Fehlermeldungen.
// Am PC erkennt Phoenix (Whisper, der Ton bleibt auf dem Rechner); sonst die Spracherkennung des Browsers.

const PHOENIX = 'http://127.0.0.1:7332/api/diktat';
const Erkennung = window.SpeechRecognition || window.webkitSpeechRecognition;

const einst = (() => { try { return JSON.parse(localStorage.getItem('org.diktat') || '{}'); } catch { return {}; } })();
einst.weg ||= 'auto';           // auto | phoenix | browser
einst.mikro ||= '';             // deviceId, leer = Standard
const merken = () => { try { localStorage.setItem('org.diktat', JSON.stringify(einst)); } catch {} };

let hinweis = (t) => console.log(t);
let ziel = null, knopf = null;

export function diktatEinrichten({ feld, mikro, melden }) {
  ziel = feld; knopf = mikro; hinweis = melden;
  knopf.hidden = !navigator.mediaDevices?.getUserMedia && !Erkennung;
  knopf.onclick = () => (laeuft ? stoppen() : starten());
}

// Ist Phoenix auf diesem PC erreichbar? (winziger Aufruf, kurze Wartezeit)
async function phoenixDa() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 900);
    const r = await fetch(PHOENIX, { method: 'POST', body: new Uint8Array(2), signal: ctl.signal, headers: { 'Content-Type': 'application/octet-stream' } });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

const MIKRO_FEHLER = {
  NotAllowedError: 'Der Zugriff aufs Mikrofon ist gesperrt. Klick links in der Adresszeile aufs Schloss → Mikrofon → Zulassen, dann neu laden.',
  NotFoundError: 'Kein Mikrofon gefunden. Ist es eingesteckt? In den Diktier-Einstellungen ein anderes wählen.',
  NotReadableError: 'Das Mikrofon ist belegt (z. B. von Discord, OBS oder Streamlabs exklusiv) oder abgesteckt.',
  OverconstrainedError: 'Das gewählte Mikrofon gibt es nicht mehr. In den Diktier-Einstellungen neu wählen.',
};
const ERKENNUNG_FEHLER = {
  'not-allowed': 'Der Zugriff aufs Mikrofon ist gesperrt. In der Adresszeile aufs Schloss → Mikrofon → Zulassen.',
  'service-not-allowed': 'Dieser Browser erlaubt keine Spracherkennung. Am PC Phoenix starten oder Edge/Chrome/Safari nutzen.',
  network: 'Die Spracherkennung dieses Browsers geht nicht (Opera kann das z. B. gar nicht). Am PC Phoenix starten oder Edge/Chrome nutzen.',
  'no-speech': 'Nichts gehört. Ist das richtige Mikrofon gewählt? (Diktier-Einstellungen)',
  'audio-capture': 'Kein Mikrofon erreichbar. In den Diktier-Einstellungen prüfen.',
  'language-not-supported': 'Deutsch wird von der Spracherkennung dieses Browsers nicht unterstützt.',
};

/* ================= Aufnahme ================= */

let laeuft = null; // { art, stop() }

async function starten() {
  let weg = einst.weg;
  if (weg !== 'browser') {
    const da = await phoenixDa();
    if (da) weg = 'phoenix';
    else if (weg === 'phoenix') return hinweis('Phoenix antwortet nicht. Läuft er auf diesem PC? Sonst in den Diktier-Einstellungen „Browser“ wählen.', 6000);
    else weg = 'browser';
  }
  if (weg === 'browser' && !Erkennung) return hinweis('Dieser Browser kann nicht diktieren. Am PC Phoenix starten oder Edge/Chrome/Safari nutzen.', 6000);
  return weg === 'phoenix' ? phoenixAufnahme() : browserErkennung();
}
function stoppen() { laeuft?.stop(); }

function anzeigen(an, pegel = 0) {
  knopf.classList.toggle('an', !!an);
  knopf.classList.toggle('denkt', an === 'denkt');
  knopf.style.setProperty('--pegel', String(Math.min(1, pegel)));
}

function einsetzen(text) {
  text = (text || '').trim();
  if (!text) return hinweis('Nichts verstanden – nochmal etwas lauter oder näher ans Mikro.');
  const vorher = ziel.value.trim();
  ziel.value = (vorher ? vorher + ' ' : '') + text;
  ziel.dispatchEvent(new Event('input', { bubbles: true }));
  ziel.focus();
}

async function mikrofonOeffnen() {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (einst.mikro) audio.deviceId = { exact: einst.mikro };
  return navigator.mediaDevices.getUserMedia({ audio });
}

// Lautstärke messen (für Anzeige und automatisches Stoppen nach einer Sprechpause)
function pegelMesser(strom, jeBild) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const an = ac.createAnalyser(); an.fftSize = 1024;
  ac.createMediaStreamSource(strom).connect(an);
  const puffer = new Float32Array(an.fftSize);
  let aus = false;
  const schritt = () => {
    if (aus) return;
    an.getFloatTimeDomainData(puffer);
    let s = 0; for (const v of puffer) s += v * v;
    jeBild(Math.sqrt(s / puffer.length));
    setTimeout(schritt, 50);
  };
  schritt();
  return () => { aus = true; ac.close().catch(() => {}); };
}

async function phoenixAufnahme() {
  let strom;
  try { strom = await mikrofonOeffnen(); } catch (f) { return hinweis(MIKRO_FEHLER[f.name] || 'Mikrofon geht nicht: ' + f.message, 8000); }
  const teile = [];
  const rec = new MediaRecorder(strom);
  rec.ondataavailable = (e) => e.data.size && teile.push(e.data);
  let gesprochen = false, stillSeit = performance.now();
  const start = performance.now();
  const pegelAus = pegelMesser(strom, (rms) => {
    anzeigen(true, rms * 8);
    const jetzt = performance.now();
    if (rms > .02) { gesprochen = true; stillSeit = jetzt; }
    // nach dem Sprechen 2,5 s Pause → fertig; nie länger als 2 Minuten
    if ((gesprochen && jetzt - stillSeit > 2500) || jetzt - start > 120000) laeuft?.stop();
    if (!gesprochen && jetzt - start > 8000) { laeuft?.stop(); hinweis('Nichts gehört. Stimmt das Mikrofon? (Zahnrad neben dem Mikro-Knopf)', 6000); }
  });
  const fertig = new Promise((ok) => (rec.onstop = ok));
  rec.start(250);
  laeuft = {
    art: 'phoenix',
    stop: () => { if (rec.state !== 'inactive') rec.stop(); },
  };
  await fertig;
  pegelAus(); strom.getTracks().forEach((t) => t.stop());
  laeuft = null;
  if (!gesprochen) return anzeigen(false);
  anzeigen('denkt');
  try {
    const pcm = await als16k(new Blob(teile, { type: rec.mimeType }));
    const r = await fetch(PHOENIX, { method: 'POST', body: pcm, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.fehler || r.status);
    einsetzen(j.text);
  } catch (f) { hinweis('Phoenix konnte das nicht erkennen: ' + f.message, 6000); }
  anzeigen(false);
}

// Aufnahme → 16 kHz Mono, 16 Bit (das Format, das Phoenix' Erkennung erwartet)
async function als16k(blob) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const ton = await ac.decodeAudioData(await blob.arrayBuffer());
  ac.close().catch(() => {});
  const off = new OfflineAudioContext(1, Math.ceil(ton.duration * 16000), 16000);
  const q = off.createBufferSource(); q.buffer = ton; q.connect(off.destination); q.start();
  const f = (await off.startRendering()).getChannelData(0);
  const aus = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) aus[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
  return aus.buffer;
}

function browserErkennung() {
  const e = new Erkennung();
  e.lang = 'de-DE'; e.interimResults = true; e.continuous = false;
  const vorher = ziel.value.trim();
  let text = '', fehler = null;
  e.onresult = (ev) => {
    text = [...ev.results].map((r) => r[0].transcript).join('');
    ziel.value = (vorher ? vorher + ' ' : '') + text;
  };
  e.onerror = (ev) => { fehler = ev.error; };
  e.onend = () => {
    laeuft = null; anzeigen(false);
    if (fehler && fehler !== 'aborted') hinweis(ERKENNUNG_FEHLER[fehler] || 'Spracherkennung: ' + fehler, 8000);
    else if (!text.trim()) hinweis('Nichts verstanden – nochmal etwas lauter oder näher ans Mikro.');
    ziel.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try { e.start(); } catch (f) { return hinweis('Spracherkennung startet nicht: ' + f.message, 6000); }
  anzeigen(true, .5);
  laeuft = { art: 'browser', stop: () => e.stop() };
}

/* ================= Einstellungen ================= */

export async function diktatEinstellungen(box, schliessen) {
  box.innerHTML = `<div class="blatt-kopf"><button data-a="zu">Schließen</button><b>Diktieren</b><span></span></div>
    <label class="feld">Mikrofon<select id="dk-mikro"><option value="">Standard von Windows / Gerät</option></select></label>
    <div class="feld">Test – sprich etwas<div class="pegel"><i id="dk-pegel"></i></div><small id="dk-pegel-text">Mikrofon wird geöffnet …</small></div>
    <label class="feld">Erkennung<select id="dk-weg">
      <option value="auto">Automatisch – Phoenix am PC, sonst Browser</option>
      <option value="phoenix">Nur Phoenix (PC, Ton bleibt auf dem Rechner)</option>
      <option value="browser">Nur Browser (Handy / iPad)</option>
    </select></label>
    <div class="feld">Status<div class="status-liste" id="dk-status"><span>Prüfe …</span></div></div>
    <p class="meta">Die Browser-Erkennung nimmt immer das Standard-Mikrofon des Geräts; die Auswahl oben gilt für Phoenix und den Test. Gesperrtes Mikrofon: in der Adresszeile aufs Schloss → Mikrofon → Zulassen.</p>`;
  const sel = box.querySelector('#dk-mikro'), weg = box.querySelector('#dk-weg');
  weg.value = einst.weg;
  weg.onchange = () => { einst.weg = weg.value; merken(); };
  let pegelAus = null, strom = null;
  const testen = async () => {
    pegelAus?.(); strom?.getTracks().forEach((t) => t.stop());
    const balken = box.querySelector('#dk-pegel'), txt = box.querySelector('#dk-pegel-text');
    try {
      strom = await mikrofonOeffnen();
      txt.textContent = strom.getAudioTracks()[0]?.label || 'Mikrofon offen';
      let spitze = 0;
      pegelAus = pegelMesser(strom, (rms) => {
        if (!box.isConnected) { aufraeumen(); return; }
        spitze = Math.max(spitze * .9, rms);
        balken.style.width = Math.min(100, spitze * 800) + '%';
        balken.classList.toggle('gut', spitze > .02);
      });
      // erst nach der Freigabe zeigt der Browser die Namen aller Mikrofone
      const geraete = (await navigator.mediaDevices.enumerateDevices()).filter((g) => g.kind === 'audioinput' && g.deviceId !== 'default' && g.deviceId !== 'communications');
      sel.innerHTML = '<option value="">Standard von Windows / Gerät</option>' + geraete.map((g, i) => `<option value="${g.deviceId}">${(g.label || 'Mikrofon ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
      sel.value = geraete.some((g) => g.deviceId === einst.mikro) ? einst.mikro : '';
    } catch (f) {
      txt.textContent = MIKRO_FEHLER[f.name] || 'Mikrofon geht nicht: ' + f.message;
      balken.style.width = '0';
    }
  };
  const aufraeumen = () => { pegelAus?.(); pegelAus = null; strom?.getTracks().forEach((t) => t.stop()); strom = null; };
  sel.onchange = () => { einst.mikro = sel.value; merken(); testen(); };
  box.onclick = (ev) => { if (ev.target.closest('[data-a="zu"]')) { aufraeumen(); schliessen(); } };
  testen();
  const status = box.querySelector('#dk-status');
  const da = await phoenixDa();
  status.innerHTML = [
    `<span class="${da ? 'ok' : 'aus'}">Phoenix auf diesem PC: ${da ? 'erreichbar' : 'nicht erreichbar'}</span>`,
    `<span class="${Erkennung ? 'ok' : 'aus'}">Browser-Erkennung: ${Erkennung ? 'vorhanden' : 'gibt es hier nicht'}</span>`,
    `<span class="ok">Benutzt wird: ${einst.weg === 'browser' ? 'Browser' : da ? 'Phoenix' : einst.weg === 'phoenix' ? 'Phoenix (startet gerade nicht!)' : 'Browser'}</span>`,
  ].join('');
  return aufraeumen;
}
