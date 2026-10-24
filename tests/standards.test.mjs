// ============================================================
// standards.test.mjs — Jazz-Standards-Bereich: Datenmodell,
// Stufenberechnung, Transposition, Setlist (localStorage).
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, loadAppCached } from './extract.mjs';

const { exports: X, errors } = loadAppCached();
const {
  JAZZ_STANDARDS, parseBars, parseSongKey, standardRoman, transposeStandard,
  transposeChord, classifyFunction, NOTE_TO_SEMI,
} = X;
// Arrays aus der vm-Sandbox haben einen fremden Prototyp → für deepEqual normalisieren
const plain = v => JSON.parse(JSON.stringify(v));

test('Standards-Code lädt ohne Init-Fehler', () => {
  assert.deepEqual(errors, []);
  assert.ok(Array.isArray(JAZZ_STANDARDS) && JAZZ_STANDARDS.length >= 10);
});

test('Schema: Titel, Komponist, Tonart, Form, Abschnitte A/B/C, Taktzahl', () => {
  const titles = new Set();
  for (const s of JAZZ_STANDARDS) {
    assert.ok(s.title && s.composer && s.form, `Pflichtfeld fehlt bei ${s.title}`);
    assert.ok(!titles.has(s.title), `Doppelter Titel ${s.title}`);
    titles.add(s.title);
    assert.ok(parseSongKey(s.key), `Tonart nicht lesbar: ${s.title} (${s.key})`);
    const main = s.sections.filter(x => !x.variant);
    assert.ok(main.length >= 1 && main.length <= 3, `${s.title}: 1–3 Hauptabschnitte erwartet`);
    for (const sec of main) assert.match(sec.label, /^[ABC]$/, `${s.title}: Abschnitt ${sec.label}`);
    // Taktzahl der Form = Summe der Abschnitte gemäß Formzeile (Varianten ersetzen A)
    const lens = Object.fromEntries(main.map(x => [x.label, parseBars(x.chords).length]));
    const letters = (s.form.match(/^[ABC]+/) || [''])[0].split('');
    const variantLens = s.sections.filter(x => x.variant).map(x => parseBars(x.chords).length);
    let total = letters.reduce((n, l) => n + lens[l], 0);
    // ATTYA: A2 (8) und A3 (12) ersetzen das 2. und 4. A
    if (variantLens.length) total = total - variantLens.length * lens.A + variantLens.reduce((a, b) => a + b, 0);
    assert.equal(total, s.bars, `${s.title}: Taktsumme ${total} ≠ ${s.bars}`);
  }
});

test('parseBars: Takte mit |, mehrere Akkorde pro Takt', () => {
  assert.deepEqual(plain(parseBars('Cm7 | F7 |  Dm7b5 G7 ')), [['Cm7'], ['F7'], ['Dm7b5', 'G7']]);
});

test('Alle Akkorde sind lesbar und in alle 12 Tonarten transponierbar', () => {
  for (const s of JAZZ_STANDARDS) {
    for (const sec of s.sections) {
      for (const bar of parseBars(sec.chords)) {
        for (const c of bar) {
          assert.match(c, /^[A-G][#b]?/, `${s.title}: ${c}`);
          assert.ok(standardRoman(c, 0), `${s.title}: keine Stufe für ${c}`);
          for (let i = 0; i < 12; i++) assert.match(transposeChord(c, i, true), /^[A-G][#b]?/);
        }
      }
    }
  }
});

test('standardRoman: Stufen wie in der Progressions-Bibliothek', () => {
  const C = 0, G = NOTE_TO_SEMI.G, Ab = NOTE_TO_SEMI.Ab;
  assert.equal(standardRoman('Dm7', C), 'ii7');
  assert.equal(standardRoman('G7', C), 'V7');
  assert.equal(standardRoman('Cmaj7', C), 'Imaj7');
  assert.equal(standardRoman('C6', C), 'I6');
  assert.equal(standardRoman('D7b5', C), 'II7');
  assert.equal(standardRoman('Am7b5', G), 'iiø');
  assert.equal(standardRoman('D7', G), 'V7');
  assert.equal(standardRoman('Ebmaj7', G), 'bVImaj7');
  assert.equal(standardRoman('Gm', G), 'i');
  assert.equal(standardRoman('CmMaj7', C), 'imaj7');
  assert.equal(standardRoman('Dm6', NOTE_TO_SEMI.D), 'i6');
  assert.equal(standardRoman('Bdim7', Ab), 'biii°7');
  assert.equal(classifyFunction(standardRoman('Am7b5', G)), 'subdom');
  assert.equal(classifyFunction(standardRoman('D7', G)), 'dominant');
  assert.equal(classifyFunction(standardRoman('Gm', G)), 'tonic');
});

test('transposeStandard: Original unverändert, Transposition hält Stufen', () => {
  const al = JAZZ_STANDARDS.find(s => s.title === 'Autumn Leaves');
  const orig = transposeStandard(al, '');
  assert.equal(orig.key, 'Gm');
  assert.deepEqual(plain(orig.sections[0].bars.flat().map(x => x.chord)), plain(parseBars(al.sections[0].chords).flat()));
  const em = transposeStandard(al, 'E');
  assert.equal(em.key, 'Em');
  assert.deepEqual(plain(em.sections[0].bars.flat().map(x => x.chord)),
    ['Am7', 'D7', 'Gmaj7', 'Cmaj7', 'F#m7b5', 'B7', 'Em', 'Em']);
  assert.deepEqual(plain(em.sections[0].bars.flat().map(x => x.roman)),
    plain(orig.sections[0].bars.flat().map(x => x.roman)));
  // Moll mit b-Vorzeichen: Cm schreibt Ab statt G#
  const cm = transposeStandard(al, 'C');
  assert.ok(cm.sections[0].bars.flat().some(x => x.chord === 'Abmaj7'));
});

test('Setlist: hinzufügen, verschieben, entfernen, in localStorage gespeichert', () => {
  const app = loadApp({ localStorageData: { chordtrainer_setlist: JSON.stringify(['Misty', 'Gibt es nicht']) } });
  const { setlistAdd, setlistMove, setlistRemove, loadSetlist } = app.exports;
  const read = () => JSON.parse(app.localStorage.getItem('chordtrainer_setlist'));
  loadSetlist();                 // unbekannte Titel fallen raus
  setlistAdd('Solar');
  assert.deepEqual(read(), ['Misty', 'Solar']);
  setlistAdd('Solar');           // keine Duplikate
  assert.deepEqual(read(), ['Misty', 'Solar']);
  setlistMove('Solar', -1);
  assert.deepEqual(read(), ['Solar', 'Misty']);
  setlistMove('Solar', -1);      // Rand: bleibt
  assert.deepEqual(read(), ['Solar', 'Misty']);
  setlistRemove('Solar');
  assert.deepEqual(read(), ['Misty']);
});

test('Kaputtes Setlist-JSON bricht nichts', () => {
  const app = loadApp({ localStorageData: { chordtrainer_setlist: '{kaputt' } });
  assert.deepEqual(app.errors, []);
});

test('Ansicht umschalten und Standards rendern läuft mit DOM-Stubs', () => {
  const app = loadApp();
  assert.doesNotThrow(() => { app.exports.setView('standards'); app.exports.setView('trainer'); });
  const sections = app.sandbox.document.getElementById('stdSections').innerHTML;
  assert.match(sections, /hw-chord/);
  assert.match(sections, /hw-pair/);
  assert.match(sections, /hw-f-(tonic|subdom|dominant|other)/);
});

test('Tonzentren: jeder Abschnitt vollständig und lesbar eingetragen', () => {
  for (const s of JAZZ_STANDARDS) {
    for (const sec of s.sections) {
      assert.ok(Array.isArray(sec.centers) && sec.centers.length, `${s.title} ${sec.label}: centers fehlt`);
      const n = parseBars(sec.chords).flat().length;
      const sum = sec.centers.reduce((a, [, k]) => a + k, 0);
      assert.equal(sum, n, `${s.title} ${sec.label}: ${sum} Zentren-Akkorde ≠ ${n} Akkorde`);
      for (const [k] of sec.centers) assert.ok(parseSongKey(k), `${s.title}: Tonzentrum ${k}`);
    }
  }
});

test('Tonzentren wandern mit der Transposition, lokale Stufen bleiben', () => {
  const al = JAZZ_STANDARDS.find(s => s.title === 'Autumn Leaves');
  const orig = transposeStandard(al, '');
  assert.deepEqual(plain(orig.sections[0].centers.map(c => [c.key, c.rel])), [['Bb', 'bIII'], ['Gm', 'i']]);
  assert.deepEqual(plain(orig.sections[0].bars.flat().map(x => x.local)),
    ['ii7', 'V7', 'Imaj7', 'IVmaj7', 'iiø', 'V7', 'i', 'i']);
  const em = transposeStandard(al, 'E');
  assert.deepEqual(plain(em.sections[0].centers.map(c => c.key)), ['G', 'Em']);
  assert.deepEqual(plain(em.sections[0].bars.flat().map(x => x.local)),
    plain(orig.sections[0].bars.flat().map(x => x.local)));
  const attya = transposeStandard(JAZZ_STANDARDS.find(s => s.title === 'All the Things You Are'), 'C');
  assert.deepEqual(plain(attya.sections[0].centers.map(c => c.key)), ['C', 'E']);
});

test('Beziehungen: Quintfall, SubV, II–V, sonst neutral', () => {
  const { stdHwRelation: rel } = X;
  assert.equal(rel('Dm7', 'G7'), 'pair');
  assert.equal(rel('Am7b5', 'D7'), 'pair');
  assert.equal(rel('Abm7', 'Db7'), 'pair');
  assert.equal(rel('G7', 'Cmaj7'), 'fifth');
  assert.equal(rel('C7#5', 'Fm7'), 'fifth');
  assert.equal(rel('Db7', 'C6'), 'half');
  assert.equal(rel('Cmaj7', 'Dm7'), 'none');
  assert.equal(rel('Fm7', 'Bbm7'), 'none');
});

test('Gruppen: Tonika erreicht → „in“, sonst nur angesteuert', () => {
  const { stdHwSegments } = X;
  const satin = transposeStandard(JAZZ_STANDARDS.find(s => s.title === 'Satin Doll'), '');
  const g = stdHwSegments(satin.sections[0]);
  assert.deepEqual(plain(g.map(x => [x.center.key, x.reached])),
    [['C', false], ['D', false], ['G', false], ['C', true]]);
  // gleiche Akkorde hintereinander werden zusammengefasst (C6 | C6 → 2 Takte)
  const last = g[3].items[g[3].items.length - 1];
  assert.equal(last.chord, 'C6');
  assert.equal(last.dur, 2);
});

test('Transposition schreibt Grundtöne nach Buchstaben-Abstand (Ab → C: F#m7, nicht Gbm7)', () => {
  const attya = JAZZ_STANDARDS.find(s => s.title === 'All the Things You Are');
  const c = transposeStandard(attya, 'C');
  const a = c.sections[0].bars.flat().map(x => x.chord);
  assert.deepEqual(plain(a), ['Am7', 'Dm7', 'G7', 'Cmaj7', 'Fmaj7', 'F#m7', 'B7', 'Emaj7', 'Emaj7']);
  const a2 = c.sections[1].bars.flat().map(x => x.chord);
  assert.ok(a2.includes('C#m7') && a2.includes('F#7'), a2.join(' '));
  const bb = transposeStandard(JAZZ_STANDARDS.find(s => s.title === 'Solar'), 'Bb');
  assert.equal(bb.sections[0].bars[0][0].chord, 'BbmMaj7');
});
