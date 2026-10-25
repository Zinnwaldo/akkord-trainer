// ============================================================
// warmup.test.mjs — Reiter „Aufwärmen“ (Mini-Version)
// Notenschreibung und Fingersatz der 12 Dur-Tonleitern gegen eine von
// Hand geschriebene Referenz, Fünftonfigur je Akkordart, ABC-Ausgabe,
// abcjs-Einbindung (gepinnt, nur als Laufzeit-Nachladen).
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, loadAppCached, readHtml, extractScriptSource } from './extract.mjs';

const X = loadAppCached().exports;

// ------------------------------------------------------------
// Referenz: Dur-Tonleitern rechte Hand, eine Oktave aufwärts.
// Von Hand notiert (Standard-Fingersätze wie in gängigen Tonleiter-
// Tabellen, z. B. Hanon Nr. 39): Daumen bei b-Tonarten auf C und F,
// bei Fis/Ges auf H/Ces und Eis/F, bei Des auf F und C.
// ------------------------------------------------------------
const REF_MAJOR = {
  'C':  ['C D E F G A B C',          '1 2 3 1 2 3 4 5'],
  'G':  ['G A B C D E F# G',         '1 2 3 1 2 3 4 5'],
  'D':  ['D E F# G A B C# D',        '1 2 3 1 2 3 4 5'],
  'A':  ['A B C# D E F# G# A',       '1 2 3 1 2 3 4 5'],
  'E':  ['E F# G# A B C# D# E',      '1 2 3 1 2 3 4 5'],
  'B':  ['B C# D# E F# G# A# B',     '1 2 3 1 2 3 4 5'],
  'F#': ['F# G# A# B C# D# E# F#',   '2 3 4 1 2 3 1 2'],
  'Gb': ['Gb Ab Bb Cb Db Eb F Gb',   '2 3 4 1 2 3 1 2'],
  'Db': ['Db Eb F Gb Ab Bb C Db',    '2 3 1 2 3 4 1 2'],
  'Ab': ['Ab Bb C Db Eb F G Ab',     '3 4 1 2 3 1 2 3'],
  'Eb': ['Eb F G Ab Bb C D Eb',      '3 1 2 3 4 1 2 3'],
  'Bb': ['Bb C D Eb F G A Bb',       '4 1 2 3 1 2 3 4'],
  'F':  ['F G A Bb C D E F',         '1 2 3 4 1 2 3 4'],
};
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pc = name => (SEMI[name[0]] + (name.match(/#/g) || []).length - (name.slice(1).match(/b/g) || []).length + 12) % 12;
const wt = (...a) => Array.from(X.wuTransposeChords(...a));
const isBlack = midi => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

test('Aufwärmen: alle Funktionen exportiert', () => {
  for (const n of ['wuMajorScale', 'wuChordFigure', 'wuFigureBars', 'wuAbc', 'wuTransposeChords', 'wuKeyboardSVG', 'SYNTH', 'WARMUP']) {
    assert.ok(X[n], `${n} fehlt`);
  }
});

test('Referenztabelle selbst ist stimmig (Dur-Intervalle, 7 Buchstaben, Daumen nie auf Schwarz)', () => {
  const steps = [2, 2, 1, 2, 2, 2, 1];
  for (const [key, [names, fingers]] of Object.entries(REF_MAJOR)) {
    const ns = names.split(' ');
    assert.equal(ns.length, 8, key);
    for (let i = 0; i < 7; i++) {
      assert.equal((pc(ns[i + 1]) - pc(ns[i]) + 12) % 12, steps[i], `${key}: Schritt ${i + 1}`);
    }
    assert.equal(new Set(ns.slice(0, 7).map(n => n[0])).size, 7, `${key}: jeder Buchstabe genau einmal`);
    const fs = fingers.split(' ').map(Number);
    ns.forEach((n, i) => {
      if (fs[i] === 1) assert.ok(!isBlack(pc(n)), `${key}: Daumen auf schwarzer Taste ${n}`);
    });
  }
});

test('Dur-Tonleitern: Schreibweise und Fingersatz aller 12 Tonarten (plus Ges) wie Referenz', () => {
  assert.deepEqual([...X.WU_MAJOR_KEYS].sort(), Object.keys(REF_MAJOR).sort());
  for (const [key, [names, fingers]] of Object.entries(REF_MAJOR)) {
    const sc = X.wuMajorScale(key);
    assert.ok(sc, key);
    assert.equal(sc.up.map(n => n.name).join(' '), names, `${key}: Töne`);
    assert.equal(sc.up.map(n => n.finger).join(' '), fingers, `${key}: Finger`);
    // abwärts: dieselben Töne und Finger rückwärts, ohne den oberen Grundton doppelt
    assert.equal(sc.down.map(n => n.name).join(' '), names.split(' ').slice(0, 7).reverse().join(' '), `${key}: abwärts`);
    assert.equal(sc.down.map(n => n.finger).join(' '), fingers.split(' ').slice(0, 7).reverse().join(' '), `${key}: Finger abwärts`);
    // klingt eine Oktave aufwärts
    assert.equal(sc.up[7].midi - sc.up[0].midi, 12, `${key}: Oktave`);
    sc.up.forEach((n, i) => assert.equal(n.midi % 12, pc(n.name), `${key}: MIDI passt zu ${n.name}`));
  }
});

test('Dur-Tonleitern: Sonderfälle Ces in Ges-Dur, Eis in Fis-Dur, keine Doppelvorzeichen', () => {
  assert.ok(X.wuMajorScaleNames('Gb').includes('Cb'));
  assert.ok(!X.wuMajorScaleNames('Gb').includes('B'));
  assert.ok(X.wuMajorScaleNames('F#').includes('E#'));
  assert.ok(!X.wuMajorScaleNames('F#').includes('F'));
  for (const k of X.WU_MAJOR_KEYS) {
    assert.ok(X.wuMajorScaleNames(k).every(n => !/##|bb/.test(n)), k);
  }
});

test('Paralleles Dur für Moll-Folgen (Block 2)', () => {
  const ref = { C: 'Eb', 'C#': 'E', D: 'F', Eb: 'Gb', E: 'G', F: 'Ab', 'F#': 'A', G: 'Bb', 'G#': 'B', A: 'C', Bb: 'Db', B: 'D' };
  for (const [m, M] of Object.entries(ref)) {
    assert.equal(X.wuScaleKeyFor(m, true), M, `${m}-Moll`);
    assert.ok(X.WU_SCALE_FINGERS_RH[M], `Fingersatz für ${M} vorhanden`);
  }
  assert.equal(X.wuScaleKeyFor('Db', false), 'Db');
});

test('Fünftonfigur: Akkordart aus dem Symbol', () => {
  const ref = {
    'C': 'major', 'Cmaj7': 'major', 'C6': 'major', 'G/B': 'major', 'Bb': 'major',
    'G7': 'dominant', 'Db7': 'dominant', 'E9': 'dominant',
    'Am': 'minor', 'Dm7': 'minor', 'Cm/Bb': 'minor', 'F#m7': 'minor',
    'Dm7b5': 'dim', 'Bdim7': 'dim', 'C#°7': 'dim', 'Bø': 'dim',
  };
  for (const [c, q] of Object.entries(ref)) assert.equal(X.wuChordQuality(c), q, c);
});

test('Fünftonfigur: Töne je Akkordart (Referenz von Hand)', () => {
  const ref = {
    'Dm7': 'D E F G A', 'G7': 'G A B C D', 'Cmaj7': 'C D E F G',
    'Dm7b5': 'D Eb F G Ab', 'Bdim7': 'B C D E F',
    'Bbm7': 'Bb C Db Eb F', 'F#7': 'F# G# A# B C#', 'C#7': 'C# D# E# F# G#',
    'Ebm7': 'Eb F Gb Ab Bb', 'Abm7': 'Ab Bb Cb Db Eb', 'Cb': 'Cb Db Eb Fb Gb',
    'G#m7b5': 'G# A B C# D', 'D#m7': 'D# E# F# G# A#', 'Gbmaj7': 'Gb Ab Bb Cb Db',
    'Am': 'A B C D E', 'E': 'E F# G# A B', 'Cm/Bb': 'C D Eb F G',
  };
  for (const [c, tones] of Object.entries(ref)) {
    const f = X.wuChordFigure(c);
    assert.equal(f.notes.map(n => n.name).join(' '), tones, c);
    assert.deepEqual(Array.from(f.notes, n => n.finger), [1, 2, 3, 4, 5], `${c}: Finger 1–5`);
  }
});

test('Fünftonfigur: Intervalle, fünf aufeinanderfolgende Buchstaben, in jeder Tonart', () => {
  const IV = { major: [0, 2, 4, 5, 7], dominant: [0, 2, 4, 5, 7], minor: [0, 2, 3, 5, 7], dim: [0, 1, 3, 5, 6] };
  const suffix = { major: 'maj7', dominant: '7', minor: 'm7', dim: 'm7b5' };
  const roots = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (const r of roots) for (const q of Object.keys(IV)) {
    const f = X.wuChordFigure(r + suffix[q]);
    assert.equal(f.quality, q);
    assert.deepEqual(Array.from(f.notes, n => n.midi - f.notes[0].midi), IV[q], `${r}${suffix[q]}`);
    const L = 'CDEFGAB';
    const li0 = L.indexOf(f.notes[0].name[0]);
    f.notes.forEach((n, i) => assert.equal(n.name[0], L[(li0 + i) % 7], `${r}${suffix[q]}: Buchstabe ${i + 1}`));
    assert.ok(f.notes.every(n => !/##|bb/.test(n.name)), `${r}${suffix[q]}: Doppelvorzeichen`);
  }
});

test('Fünftonfigur: Grundton wird nur bei Doppelvorzeichen umgeschrieben', () => {
  assert.equal(X.wuChordFigure('A#').chord, 'Bb');          // Ais-Dur bräuchte Cisis
  assert.equal(X.wuChordFigure('A#7').notes.map(n => n.name).join(' '), 'Bb C D Eb F');
  assert.equal(X.wuChordFigure('Fb').chord, 'E');           // Fes-Dur bräuchte Heses
  assert.equal(X.wuChordFigure('E#7').chord, 'F7');
  assert.equal(X.wuChordFigure('Cb').chord, 'Cb');          // Ces-Dur geht ohne Doppel-b
  assert.equal(X.wuChordFigure('A#m7').chord, 'A#m7');      // Ais-Moll: A# B# C# D# E#
  assert.equal(X.wuChordFigure('G/B').chord, 'G/B');
});

test('Fünftonfigur: Takte 1-2-3-4-5-4-3-2, Schluss auf dem Grundton', () => {
  const bars = X.wuFigureBars(['Dm7', 'G7', 'Cmaj7']);
  assert.equal(bars.length, 4);
  bars.slice(0, 3).forEach(b => {
    assert.deepEqual(Array.from(b.notes, n => n.finger), [1, 2, 3, 4, 5, 4, 3, 2]);
    assert.equal(b.notes.reduce((a, n) => a + n.len, 0), 8, 'ein 4/4-Takt in Achteln');
  });
  assert.deepEqual(Array.from(bars, b => b.chord), ['Dm7', 'G7', 'Cmaj7', '']);
  assert.equal(bars[0].notes.map(n => n.name).join(' '), 'D E F G A G F E');
  assert.equal(bars[3].notes.length, 1);
  assert.equal(bars[3].notes[0].name, 'C');
  assert.equal(bars[3].notes[0].finger, 1);
  assert.equal(bars[3].notes[0].len, 8);
});

test('Folge aus dem Trainer: Umschreiben in Ges, Fis, Des und Moll-Tonarten', () => {
  const iiVI = ['Dm7', 'G7', 'Cmaj7'];
  assert.deepEqual(wt(iiVI, 'C', 'Gb', false), ['Abm7', 'Db7', 'Gbmaj7']);
  assert.deepEqual(wt(iiVI, 'C', 'F#', false), ['G#m7', 'C#7', 'F#maj7']);
  assert.deepEqual(wt(['C', 'F', 'G'], 'C', 'Gb', false), ['Gb', 'Cb', 'Db']);
  assert.deepEqual(wt(['C', 'F', 'G'], 'C', 'B', false), ['B', 'E', 'F#']);
  assert.deepEqual(wt(['Dm7b5', 'G7', 'Cm7'], 'C', 'F#', true), ['G#m7b5', 'C#7', 'F#m7']);
  assert.deepEqual(wt(['Fm7', 'Bb7', 'Ebmaj7'], 'C', 'Eb', true), ['Abm7', 'Db7', 'Gbmaj7']);
  assert.equal(X.wuTonicName(6, false, false), 'F#');
  assert.equal(X.wuTonicName(6, true, false), 'Gb');
  assert.equal(X.wuTonicName(1, false, false), 'Db');
  assert.equal(X.wuTonicName(1, false, true), 'C#');
  assert.equal(X.wuTonicName(8, false, true), 'G#');
});

test('Alle Bibliotheks-Folgen in allen Tonarten: Figur ohne Doppelvorzeichen, Takte vollständig', () => {
  for (const p of X.PROGRESSIONS) for (let s = 0; s < 12; s++) for (const gb of [false, true]) {
    const minor = p.mode === 'minor';
    const ton = X.wuTonicName(s, gb, minor);
    const chords = X.wuTransposeChords(p.chords, 'C', ton, minor);
    const bars = X.wuFigureBars(chords);
    assert.equal(bars.length, p.chords.length + 1, `${p.name} in ${ton}`);
    for (const b of bars) {
      assert.equal(b.notes.reduce((a, n) => a + n.len, 0), 8, `${p.name} in ${ton}`);
      assert.ok(b.notes.every(n => !/##|bb/.test(n.name)), `${p.name} in ${ton}: ${b.chord}`);
    }
    assert.ok(X.wuMajorScale(X.wuScaleKeyFor(ton, minor)), `${p.name}: Tonleiter für ${ton}`);
  }
});

test('ABC: Vorzeichnung trägt die Tonleiter, keine überflüssigen Vorzeichen', () => {
  for (const k of X.WU_MAJOR_KEYS) {
    const abc = X.wuAbc(k, X.wuScaleBars(k));
    assert.match(abc, new RegExp(`^K:${k.replace('#', '\\#')}$`, 'm'), k);
    const body = abc.split('\n').slice(4).join('\n').replace(/"[^"]*"/g, '').replace(/![1-5]!/g, '');
    assert.ok(!/[_^=]/.test(body), `${k}: Tonleiter braucht keine Einzelvorzeichen: ${body}`);
    assert.equal((abc.match(/![1-5]!/g) || []).length, 15, `${k}: 15 Fingerzahlen`);
    assert.match(abc, /\|\]\n$/, `${k}: Schlussstrich`);
  }
  // C-Dur-Tonleiter genau
  assert.equal(X.wuAbc('C', X.wuScaleBars('C')).split('\n')[4], '!1!C!2!D!3!E!1!F !2!G!3!A!4!B!5!c | !4!B!3!A!2!G!1!F !3!E!2!D!1!C2 |]');
});

test('ABC: fremde Töne bekommen Vorzeichen, die im Takt weiter gelten', () => {
  // E-Dur über Folge in C: G# muss mit ^ stehen, beim zweiten G# im Takt nicht noch einmal
  const abc = X.wuAbc('C', X.wuFigureBars(['E']));
  const bar = abc.split('\n')[4].split('|')[0];
  assert.equal((bar.match(/\^G/g) || []).length, 1, bar);
  assert.equal((bar.match(/\^F/g) || []).length, 1, bar);
  // Bb-Akkord in Fis-Dur: B und E mit b, C/D/F mit Auflösungszeichen
  const abc2 = X.wuAbc('F#', X.wuFigureBars(['Bb']));
  assert.match(abc2.split('\n')[4], /"Bb"!1!_B!2!=c!3!=d!4!_e !5!=f!4!e!3!d!2!c/);
});

test('Klaviatur: Fingerzahlen auf den markierten Tasten', () => {
  const svg = X.wuKeyboardSVG(X.wuMajorScale('Eb').up);
  for (const f of [1, 2, 3, 4]) assert.ok(svg.includes(`>${f}</text>`), `Finger ${f}`);
  assert.ok(!svg.includes('>5</text>'), 'Es-Dur rechts braucht keinen 5. Finger');
  assert.ok(svg.startsWith('<svg'), 'SVG');
});

test('abcjs: exakt gepinnte Version, Prüfsumme, nur nachgeladen (kein <script src>)', () => {
  assert.match(X.WU_ABCJS.version, /^\d+\.\d+\.\d+$/);
  assert.ok(X.WU_ABCJS.urls.length >= 1);
  for (const u of X.WU_ABCJS.urls) {
    assert.ok(/^https:\/\/(cdn\.jsdelivr\.net\/npm\/abcjs@|cdnjs\.cloudflare\.com\/ajax\/libs\/abcjs\/)/.test(u), u);
    assert.ok(u.includes(X.WU_ABCJS.version), `${u} nicht auf ${X.WU_ABCJS.version} gepinnt`);
  }
  assert.match(X.WU_ABCJS.integrity, /^sha384-[A-Za-z0-9+/=]{64}$/);
  // Außer abcjs keine externen Adressen im Skript
  const script = extractScriptSource(readHtml());
  const urls = [...script.matchAll(/https?:\/\/[^\s'"`)]+/g)].map(m => m[0])
    .filter(u => !u.startsWith('http://www.w3.org/'));
  assert.deepEqual([...new Set(urls)].sort(), [...X.WU_ABCJS.urls].sort());
});

test('Reiter Aufwärmen: Umschalten läuft ohne Fehler, Blues-SYNTH ohne AudioContext still', () => {
  const app = loadApp();
  assert.doesNotThrow(() => app.exports.setView('warmup'));
  assert.doesNotThrow(() => app.exports.setView('blues'));
  assert.doesNotThrow(() => app.exports.setView('trainer'));
  assert.equal(app.exports.SYNTH.ensure(), false);
  assert.ok(app.requestedIds.has('warmupView'));
});
