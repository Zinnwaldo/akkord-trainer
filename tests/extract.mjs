// ============================================================
// extract.mjs — Extrahiert den <script>-Block aus der Single-File-App
// und evaluiert ihn dependency-frei in einer node:vm-Sandbox mit
// minimalen DOM-Stubs. Exportiert die reinen Funktionen und Daten.
//
// WICHTIG: Die HTML-Datei ist ~226 KB (Base64-Fonts). Sie wird nur
// in den Speicher gelesen und geschnitten, niemals ausgegeben.
// ============================================================
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.join(__dirname, '..', 'chord-progression-trainer.html');

// Symbole, die wir aus dem Skript exportieren wollen.
// (Top-Level const/let landen in vm-Skripten NICHT auf globalThis,
//  daher wird am Ende des Skripts ein Capture-Block angehängt.)
const EXPORT_NAMES = [
  // Daten
  'PROGRESSIONS', 'STYLES', 'DIFFICULTIES', 'KEYS',
  'NOTE_TO_SEMI', 'SEMI_TO_NOTE_SHARP', 'SEMI_TO_NOTE_FLAT',
  'VOICING_DEFS', 'WHITE_SEMIS', 'BLACK_POS',
  // Reine Funktionen
  'transposeChord', 'transposeProgression', 'formatChord',
  'classifyFunction', 'buildTransitionHint', 'weightedPick',
  'spellSemis', 'chordVoicings', 'voicingForType',
  'normalizeToBoard', 'keyboardSVG',
  // Zustandsbezogene Helfer (nutzen localStorage-Stub)
  'loadHard', 'saveHard', 'loadFavorites', 'saveFavorites',
  'loadStats', 'saveStats', 'pickNextProgression', 'formatDuration',
];

export function readHtml() {
  return readFileSync(HTML_PATH, 'utf8');
}

// Liefert nur den Inhalt zwischen <script> und </script>.
export function extractScriptSource(html = readHtml()) {
  const open = html.indexOf('<script>');
  if (open < 0) throw new Error('Kein <script>-Tag in der HTML-Datei gefunden');
  const start = open + '<script>'.length;
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error('Kein schließendes </script> gefunden');
  return html.slice(start, end);
}

// ------------------------------------------------------------
// Minimale DOM-Stubs
// ------------------------------------------------------------
function makeClassList() {
  const set = new Set();
  return {
    add: (...cs) => cs.forEach(c => set.add(c)),
    remove: (...cs) => cs.forEach(c => set.delete(c)),
    contains: c => set.has(c),
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      on ? set.add(c) : set.delete(c);
      return on;
    },
  };
}

function makeElement(tag = 'div', id = null) {
  return {
    tagName: String(tag).toUpperCase(),
    id,
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    title: '',
    className: '',
    dataset: {},
    style: {},
    classList: makeClassList(),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { return child; },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    click() {},
    focus() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
}

function makeLocalStorage(backing = new Map()) {
  return {
    getItem: k => (backing.has(String(k)) ? backing.get(String(k)) : null),
    setItem: (k, v) => backing.set(String(k), String(v)),
    removeItem: k => backing.delete(String(k)),
    clear: () => backing.clear(),
    get length() { return backing.size; },
    key: i => [...backing.keys()][i] ?? null,
    _backing: backing,
  };
}

function makeDocument(requestedIds) {
  const byId = new Map();
  return {
    getElementById(id) {
      requestedIds.add(id);
      if (!byId.has(id)) byId.set(id, makeElement('div', id));
      return byId.get(id);
    },
    createElement: tag => makeElement(tag),
    createTextNode: text => ({ textContent: text }),
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: makeElement('body'),
    documentElement: makeElement('html'),
    _byId: byId,
  };
}

// ------------------------------------------------------------
// Hauptfunktion: Skript in Sandbox laden, Symbole exportieren
// ------------------------------------------------------------
export function loadApp({ localStorageData } = {}) {
  const errors = [];          // gefangene Laufzeitfehler (Init-Code etc.)
  const requestedIds = new Set(); // alle per getElementById angeforderten IDs

  const backing = new Map(Object.entries(localStorageData ?? {}));
  const localStorage = makeLocalStorage(backing);
  const document = makeDocument(requestedIds);

  const sandbox = {
    document,
    localStorage,
    sessionStorage: makeLocalStorage(),
    navigator: { userAgent: 'node-vm-test', language: 'de' },
    console: { log() {}, warn() {}, error() {}, info() {} },
    // Timer-Stubs: nichts wird tatsächlich geplant — die Tests sollen
    // deterministisch sein und der Prozess soll sauber enden.
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    alert() {}, confirm() { return true; }, prompt() { return null; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const source = extractScriptSource();

  // Capture-Block: läuft im selben Skript-Scope, sieht daher auch
  // Top-Level-const/let und schreibt sie auf globalThis.__exports.
  const capture = `
;globalThis.__exports = globalThis.__exports || {};
(function () {
  for (const name of ${JSON.stringify(EXPORT_NAMES)}) {
    try { globalThis.__exports[name] = eval(name); } catch (e) { /* Symbol fehlt */ }
  }
})();`;

  const runOnce = src => vm.runInContext(src, sandbox, {
    filename: 'chord-progression-trainer.<script>.js',
    timeout: 10_000,
  });

  try {
    runOnce(source + capture);
  } catch (err) {
    // Init-Code (DOM-abhängig) ist durchgefallen. Fallback: Skript vor dem
    // INIT-Abschnitt abschneiden, damit wenigstens Funktionen/Daten
    // exportiert werden. Der Fehler wird dokumentiert.
    errors.push({ phase: 'full-run', message: String(err && err.message || err) });
    const cutMarkers = ['// INIT', 'loadFavorites();'];
    let cut = -1;
    for (const m of cutMarkers) {
      cut = source.lastIndexOf(m);
      if (cut >= 0) break;
    }
    if (cut >= 0) {
      try {
        runOnce(source.slice(0, cut) + capture);
      } catch (err2) {
        errors.push({ phase: 'truncated-run', message: String(err2 && err2.message || err2) });
      }
    }
  }

  const exports = sandbox.__exports || {};
  const missingExports = EXPORT_NAMES.filter(n => !(n in exports));

  return { exports, errors, missingExports, requestedIds, sandbox, localStorage };
}

// Bequemer Default-Export für Tests: einmal laden, Ergebnis teilen.
let cached = null;
export function loadAppCached() {
  if (!cached) cached = loadApp();
  return cached;
}
