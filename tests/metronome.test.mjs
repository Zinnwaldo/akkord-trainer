// ============================================================
// metronome.test.mjs — Metronom: Tempo-Grenzen, Raster, Speicherung
// (Audio selbst wird nicht getestet; die Sandbox hat kein Web Audio.)
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, loadAppCached } from './extract.mjs';

const app = loadAppCached().exports;

test('Metronom-Helfer sind exportiert', () => {
  for (const n of ['clampBpm', 'normalizeSubdiv', 'metroStepSec', 'metroIsBeat', 'loadMetro', 'saveMetro']) {
    assert.equal(typeof app[n], 'function', `${n} fehlt`);
  }
});

test('clampBpm: Bereich 40–240, Standard bei Unsinn', () => {
  assert.equal(app.clampBpm(80), 80);
  assert.equal(app.clampBpm('120'), 120);
  assert.equal(app.clampBpm(10), 40);
  assert.equal(app.clampBpm(999), 240);
  assert.equal(app.clampBpm(99.6), 100);
  assert.equal(app.clampBpm('abc'), app.METRO_DEFAULT);
});

test('normalizeSubdiv: nur Viertel/Achtel/Sechzehntel', () => {
  assert.equal(app.normalizeSubdiv(1), 1);
  assert.equal(app.normalizeSubdiv('2'), 2);
  assert.equal(app.normalizeSubdiv(4), 4);
  assert.equal(app.normalizeSubdiv(3), 1);
  assert.equal(app.normalizeSubdiv(undefined), 1);
});

test('metroStepSec: Klickabstand je Unterteilung', () => {
  assert.equal(app.metroStepSec(60, 1), 1);
  assert.equal(app.metroStepSec(60, 2), 0.5);
  assert.equal(app.metroStepSec(120, 4), 0.125);
});

test('metroIsBeat: Betonung nur auf Vierteln', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => app.metroIsBeat(i, 1)), [true, true, true, true]);
  assert.deepEqual([0, 1, 2, 3].map(i => app.metroIsBeat(i, 2)), [true, false, true, false]);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => app.metroIsBeat(i, 4)), [true, false, false, false, true]);
});

test('Einstellungen: laden klemmt, speichern schreibt zurück', () => {
  const a = loadApp({ localStorageData: { chordtrainer_metro: JSON.stringify({ bpm: 300, subdiv: 4 }) } });
  assert.deepEqual(a.errors, []);
  // loadMetro lief im Init; saveMetro schreibt den (geklemmten) Zustand zurück
  a.exports.saveMetro();
  assert.deepEqual(JSON.parse(a.localStorage.getItem('chordtrainer_metro')), { bpm: 240, subdiv: 4 });
  assert.equal(a.sandbox.document.getElementById('metroBpm').value, 240);
  assert.equal(a.sandbox.document.getElementById('metroSub').value, '4');
});

test('Kaputter localStorage-Eintrag bricht den Start nicht', () => {
  const a = loadApp({ localStorageData: { chordtrainer_metro: '{kaputt' } });
  assert.deepEqual(a.errors, []);
  a.exports.saveMetro();
  assert.deepEqual(JSON.parse(a.localStorage.getItem('chordtrainer_metro')), { bpm: 80, subdiv: 1 });
});
