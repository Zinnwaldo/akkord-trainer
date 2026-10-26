// ============================================================
// jazzy.test.mjs — Gruppe „Jazzy Chord Progressions“ im Trainer
// (10 Folgen, Idee: Denilson Silva). Notiert in C, Tonart der Vorlage
// in originalKey; zurück transponiert muss genau die Vorlage entstehen.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppCached } from './extract.mjs';

const { exports: X, errors } = loadAppCached();
const { PROGRESSIONS, STYLES, transposeProgression, chordVoicings, voicingForType } = X;

const GROUP = 'Jazzy Chord Progressions';

// Vorlage, wie notiert (Reihenfolge = Nummer im Namen)
const SOURCE = [
  ['Dm7', 'G7', 'Cmaj7', 'Am7'],
  ['Fmaj7', 'Gm7', 'C7', 'Fmaj7'],
  ['Cmaj7', 'A7', 'Dm7', 'G7'],
  ['Bbmaj7', 'Eb9', 'Am7b5', 'D7'],
  ['Em7', 'A7', 'Dmaj7', 'Bm7'],
  ['Gm7', 'C7', 'Fmaj7', 'Dm7', 'G7', 'Cmaj7'],
  ['Am7', 'D7', 'Gmaj7', 'Cmaj7'],
  ['Ebmaj7', 'Ab7', 'Dbmaj7', 'Gb7'],
  ['F#m7b5', 'B7', 'Em7', 'A7'],
  ['Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7', 'Cmaj7'],
];

const group = PROGRESSIONS.filter(p => p.style === GROUP);

test('Jazzy: Gruppe ist als Stil wählbar und enthält genau 10 Folgen', () => {
  assert.deepEqual(errors, []);
  assert.ok(STYLES.includes(GROUP), `"${GROUP}" fehlt in STYLES`);
  assert.equal(group.length, 10);
  group.forEach((p, i) => assert.ok(p.name.startsWith(`${i + 1} · `), `Reihenfolge/Name: ${p.name}`));
});

test('Jazzy: Akkordzahlen je Folge (4,4,4,4,4,6,4,4,4,7)', () => {
  assert.deepEqual([...group.map(p => p.chords.length)], [4, 4, 4, 4, 4, 6, 4, 4, 4, 7]);
  for (const p of group) assert.equal(p.roman.length, p.chords.length, p.name);
});

test('Jazzy: in die Tonart der Vorlage transponiert = Vorlage', () => {
  group.forEach((p, i) => {
    assert.ok(p.originalKey, `${p.name}: originalKey fehlt`);
    const t = transposeProgression(p, p.originalKey.replace(/m$/, ''));
    assert.deepEqual([...t.chords], SOURCE[i], p.name);
  });
});

test('Jazzy: jeder Akkord hat ein Voicing (auch 9 und m7b5), in allen Voicing-Typen', () => {
  for (const p of group) {
    for (const c of p.chords) {
      const v = chordVoicings(c, false);
      assert.ok(v, `${p.name}: kein Voicing für ${c}`);
      for (const type of ['shell', 'a', 'b', 'tones']) {
        assert.ok(voicingForType(v, type), `${c}: Typ ${type} leer`);
      }
    }
  }
});

test('Voicing 9: Shell 3/b7, Rootless A 3-5-b7-9, B b7-9-3-5', () => {
  const v = chordVoicings('Eb9', true);
  assert.equal(v.quality, '9');
  assert.equal(v.shell, 'G·Db');
  assert.equal(v.a, 'G·Bb·Db·F');
  assert.equal(v.b, 'Db·F·G·Bb');
  const h = chordVoicings('Am7b5', false);
  assert.equal(h.tones, 'A·C·D#·G'); // Kreuz-Schreibweise der Engine (D# = Eb)
  assert.equal(chordVoicings('F#m7b5', false).tones, 'F#·A·C·E');
});

test('Jazzy: Aufwärmen erkennt die Akkordarten der Gruppe (9 = Dominante, m7b5 = vermindert)', () => {
  const { wuChordQuality } = X;
  assert.equal(wuChordQuality('Eb9'), 'dominant');
  assert.equal(wuChordQuality('Am7b5'), 'dim');
  assert.equal(wuChordQuality('F#m7b5'), 'dim');
  for (const p of group) for (const c of p.chords) assert.ok(wuChordQuality(c), `${p.name}: ${c}`);
});
