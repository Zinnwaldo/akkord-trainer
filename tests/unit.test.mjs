// ============================================================
// unit.test.mjs — Technische Invarianten der App-Logik
// Läuft mit: node --test tests/
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppCached } from './extract.mjs';

const app = loadAppCached();
const X = app.exports;

const {
  PROGRESSIONS, STYLES, DIFFICULTIES, KEYS,
  NOTE_TO_SEMI, transposeChord, transposeProgression,
  chordVoicings, normalizeToBoard, weightedPick,
  loadHard,
} = X;

// ---------- Hilfsfunktionen ----------
const CHORD_RE = /^([A-G])([#b]?)(.*)$/;

function parseChordPart(part) {
  const m = part.match(CHORD_RE);
  if (!m) return null;
  const root = m[1] + m[2];
  if (!(root in NOTE_TO_SEMI)) return null;
  return { root, semi: NOTE_TO_SEMI[root], suffix: m[3] };
}

function parseChord(chord) {
  const parts = chord.split('/');
  const main = parseChordPart(parts[0]);
  if (!main) return null;
  if (parts.length === 1) return { main, bass: null };
  if (parts.length > 2) return null;
  const bass = parseChordPart(parts[1]);
  if (!bass) return null;
  return { main, bass };
}

const ALL_CHORDS = [...new Set(PROGRESSIONS.flatMap(p => p.chords))];

// ---------- Sandbox-Selbstprüfung ----------
test('Extraktion: Skript lief durch, alle Kernsymbole verfügbar', () => {
  assert.deepEqual(app.errors, [],
    'Init-Code ist in der Sandbox durchgefallen: ' + JSON.stringify(app.errors));
  assert.deepEqual(app.missingExports, [],
    'Fehlende Exporte: ' + app.missingExports.join(', '));
  assert.ok(Array.isArray(PROGRESSIONS) && PROGRESSIONS.length > 0);
});

// ---------- Schema ----------
test('Schema: jede Progression hat name/style/difficulty/mode/chords/roman', () => {
  const styleSet = new Set(STYLES.filter(s => s !== 'alle'));
  const diffSet = new Set(DIFFICULTIES.filter(d => d !== 'alle'));
  for (const p of PROGRESSIONS) {
    assert.equal(typeof p.name, 'string', `name fehlt: ${JSON.stringify(p)}`);
    assert.ok(p.name.length > 0, `leerer Name`);
    assert.ok(styleSet.has(p.style), `${p.name}: style "${p.style}" nicht in STYLES`);
    assert.ok(diffSet.has(p.difficulty), `${p.name}: difficulty "${p.difficulty}" nicht in DIFFICULTIES`);
    assert.ok(['major', 'minor'].includes(p.mode), `${p.name}: mode "${p.mode}" ungültig`);
    assert.ok(Array.isArray(p.chords) && p.chords.length > 0, `${p.name}: chords leer`);
    assert.ok(Array.isArray(p.roman), `${p.name}: roman fehlt`);
    assert.equal(p.chords.length, p.roman.length,
      `${p.name}: chords.length (${p.chords.length}) !== roman.length (${p.roman.length})`);
    if (p.originalKey !== undefined) {
      assert.match(p.originalKey, /^[A-G][#b]?m?$/, `${p.name}: originalKey "${p.originalKey}" ungültig`);
      assert.ok(p.originalKey.replace(/m$/, '') in NOTE_TO_SEMI,
        `${p.name}: originalKey-Grundton unbekannt`);
    }
  }
});

test('Schema: Progressionsnamen sind eindeutig (Favoriten/Schwer-Set arbeiten namensbasiert)', () => {
  // Hinweis: Arrays aus der vm-Sandbox haben einen fremden Prototyp,
  // daher Längenvergleich statt deepStrictEqual gegen ein Host-[].
  const names = PROGRESSIONS.map(p => p.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.equal(dupes.length, 0, 'Doppelte Namen: ' + [...dupes].join(', '));
});

// ---------- Transposition ----------
test('transposeChord: jeder Bibliotheks-Akkord ist in alle 12 Tonarten transponierbar und wieder parsebar', () => {
  for (const chord of ALL_CHORDS) {
    assert.ok(parseChord(chord), `Ausgangsakkord nicht parsebar: "${chord}"`);
    for (let n = 0; n < 12; n++) {
      for (const preferFlats of [false, true]) {
        const t = transposeChord(chord, n, preferFlats);
        const parsed = parseChord(t);
        assert.ok(parsed,
          `Nicht parsebar nach Transposition: "${chord}" +${n} (${preferFlats ? 'b' : '#'}) → "${t}"`);
      }
    }
  }
});

test('transposeChord Round-Trip: +n dann +(12-n) ergibt enharmonisch denselben Akkord', () => {
  for (const chord of ALL_CHORDS) {
    const orig = parseChord(chord);
    for (let n = 0; n < 12; n++) {
      for (const flats1 of [false, true]) {
        const up = transposeChord(chord, n, flats1);
        const back = transposeChord(up, (12 - n) % 12, !flats1);
        const round = parseChord(back);
        assert.ok(round, `Round-Trip nicht parsebar: "${chord}" → "${up}" → "${back}"`);
        assert.equal(round.main.semi, orig.main.semi,
          `Round-Trip-Grundton weicht ab: "${chord}" → "${back}"`);
        assert.equal(round.main.suffix, orig.main.suffix,
          `Round-Trip-Suffix weicht ab: "${chord}" → "${back}"`);
        if (orig.bass) {
          assert.equal(round.bass.semi, orig.bass.semi,
            `Round-Trip-Bass weicht ab: "${chord}" → "${back}"`);
        }
      }
    }
  }
});

test('transposeProgression: Tonart wird gesetzt, Akkordanzahl bleibt, alle Ziel-Tonarten funktionieren', () => {
  const keys = KEYS.filter(k => k !== 'zufällig');
  for (const p of PROGRESSIONS) {
    for (const key of keys) {
      const t = transposeProgression(p, key);
      assert.equal(t.key, key);
      assert.equal(t.chords.length, p.chords.length, `${p.name} → ${key}: Akkordanzahl verändert`);
      for (const c of t.chords) {
        assert.ok(parseChord(c), `${p.name} → ${key}: Akkord "${c}" nicht parsebar`);
      }
    }
  }
});

// ---------- Voicings ----------
test('chordVoicings: liefert für jeden Bibliotheks-Akkord (in allen 12 Tonarten) nicht-leere Voicings', () => {
  for (const chord of ALL_CHORDS) {
    for (let n = 0; n < 12; n++) {
      for (const preferFlats of [false, true]) {
        const t = transposeChord(chord, n, preferFlats);
        const v = chordVoicings(t, preferFlats);
        assert.ok(v, `chordVoicings(null) für "${t}" (aus "${chord}" +${n})`);
        const variants = ['shellIv', 'aIv', 'bIv', 'tonesIv'].filter(k => Array.isArray(v[k]) && v[k].length > 0);
        assert.ok(variants.length > 0, `Keine Voicing-Variante für "${t}"`);
        assert.equal(typeof v.rootName, 'string');
        assert.ok(v.rootName.length > 0, `rootName leer für "${t}"`);
      }
    }
  }
});

test('chordVoicings: alle Voicing-Töne liegen im 2-Oktaven-Tastaturbereich (0–23 Halbtöne)', () => {
  for (const chord of ALL_CHORDS) {
    for (let n = 0; n < 12; n++) {
      const t = transposeChord(chord, n, false);
      const v = chordVoicings(t, false);
      assert.ok(v, `kein Voicing für "${t}"`);
      for (const key of ['shellIv', 'aIv', 'bIv', 'tonesIv']) {
        if (!v[key]) continue;
        const { notes } = normalizeToBoard(v.rootSemi, v[key]);
        for (const note of notes) {
          assert.ok(note >= 0 && note <= 23,
            `"${t}" ${key}: Ton ${note} außerhalb der Klaviatur (0–23)`);
        }
      }
    }
  }
});

// ---------- weightedPick ----------
test('weightedPick: Pool der Länge 1 → kein Crash, liefert genau dieses Element', () => {
  const only = { name: '__only__' };
  for (let i = 0; i < 100; i++) {
    assert.equal(weightedPick([only]), only);
  }
});

test('weightedPick: Verteilung plausibel (gleichgewichtet ohne Schwer-Markierung)', () => {
  // hardSet im Sandbox-Scope auf leer setzen
  app.localStorage.setItem('chordtrainer_hard', '[]');
  loadHard();

  const pool = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }];
  const counts = new Map(pool.map(p => [p.name, 0]));
  const N = 12000;
  for (let i = 0; i < N; i++) {
    const picked = weightedPick(pool);
    assert.ok(pool.includes(picked), 'weightedPick liefert Element außerhalb des Pools');
    counts.set(picked.name, counts.get(picked.name) + 1);
  }
  for (const [name, c] of counts) {
    // Erwartung 3000; sehr großzügige Schranken gegen Flakiness (>8 Sigma)
    assert.ok(c > 2550 && c < 3450,
      `Unplausible Verteilung: "${name}" wurde ${c}/${N} mal gezogen (erwartet ~3000)`);
  }
});

test('weightedPick: schwer markierte Progression erscheint ~3x so oft', () => {
  app.localStorage.setItem('chordtrainer_hard', JSON.stringify(['schwer']));
  loadHard();
  try {
    const pool = [{ name: 'schwer' }, { name: 'leicht' }];
    let hard = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (weightedPick(pool).name === 'schwer') hard++;
    }
    const frac = hard / N; // Erwartung 3/4 = 0.75
    assert.ok(frac > 0.70 && frac < 0.80,
      `Schwer-Anteil ${frac.toFixed(3)} statt ~0.75`);
  } finally {
    // Sandbox-Zustand zurücksetzen, damit andere Tests unbeeinflusst bleiben
    app.localStorage.setItem('chordtrainer_hard', '[]');
    loadHard();
  }
});

// ---------- pickNextProgression (Grundinvariante) ----------
test('pickNextProgression: liefert immer eine gültige, transponierte Progression', () => {
  const keys = new Set(KEYS.filter(k => k !== 'zufällig'));
  for (let i = 0; i < 200; i++) {
    const p = X.pickNextProgression();
    assert.ok(p && typeof p.name === 'string');
    assert.ok(keys.has(p.key), `Unbekannte Tonart: "${p.key}"`);
    assert.equal(p.chords.length, p.roman.length);
    for (const c of p.chords) {
      assert.ok(parseChord(c), `${p.name}: Akkord "${c}" nicht parsebar`);
    }
  }
});
