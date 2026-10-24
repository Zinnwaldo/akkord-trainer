// ============================================================
// songs.test.mjs — Song-Sammler: Startlisten, Seed, Nashville, Import
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, loadAppCached } from './extract.mjs';

const { exports: X, errors } = loadAppCached();
const { SONGS, SONG_SEED } = X;

test('Skript läuft ohne Init-Fehler, SONGS exportiert', () => {
  assert.deepEqual(errors, []);
  assert.ok(SONGS && typeof SONGS.nashvilleChord === 'function');
  assert.ok(Array.isArray(SONG_SEED));
});

test('SONG_SEED: eindeutige ids, Pflichtfelder', () => {
  const ids = SONG_SEED.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SONG_SEED) {
    assert.match(s.id, /^seed-/);
    assert.ok(s.title && s.list, s.id);
    assert.ok(['klavier', 'gitarre', 'beides'].includes(s.instrument), s.id);
  }
});

test('Erster Start: drei Startlisten, Seed in „Neu gehört“', () => {
  const st = SONGS.normalizeState(null);
  assert.deepEqual([...st.lists.map(l => l.name)], ['Neu gehört', 'Am Üben', 'Kann ich']);
  const neu = st.lists[0].id;
  assert.equal(st.songs.length, SONG_SEED.length);
  for (const s of SONG_SEED.filter(x => x.list === 'Neu gehört')) {
    assert.equal(st.songs.find(x => x.id === s.id).listId, neu);
  }
  assert.equal(st.active, neu);
});

test('Gespeicherter Stand: eigene Listen bleiben, neue Seeds kommen dazu, gelöschte nicht', () => {
  const saved = {
    lists: [{ id: 'l1', name: 'Meine' }], songs: [], seeded: [SONG_SEED[0].id], active: 'l1',
  };
  const st = SONGS.normalizeState(saved);
  assert.equal(st.lists[0].name, 'Meine');
  assert.ok(!st.songs.some(s => s.id === SONG_SEED[0].id), 'gelöschter Seed kehrt zurück');
  assert.equal(st.songs.length, SONG_SEED.length - 1);
  assert.ok(st.lists.some(l => l.name === 'Neu gehört'), 'Zielliste des Seeds wird angelegt');
});

test('Laden aus localStorage, kaputtes JSON fällt auf Startstand zurück', () => {
  const app = loadApp({ localStorageData: { chordtrainer_songs: '{kaputt' } });
  assert.deepEqual(app.errors, []);
  const st = app.exports.SONGS.normalizeState(null);
  assert.equal(st.lists.length, 3);
});

test('Nashville: einzelne Akkorde', () => {
  const C = 0, G = 7;
  assert.equal(SONGS.nashvilleChord('C', C), '1');
  assert.equal(SONGS.nashvilleChord('Am7', C), '6m7');
  assert.equal(SONGS.nashvilleChord('Fmaj7', C), '4maj7');
  assert.equal(SONGS.nashvilleChord('G7sus4', C), '57sus4');
  assert.equal(SONGS.nashvilleChord('C/E', C), '1/3');
  assert.equal(SONGS.nashvilleChord('Bb', C), 'b7');
  assert.equal(SONGS.nashvilleChord('D', G), '5');
  assert.equal(SONGS.nashvilleChord('Hm', G), '3m');
  assert.equal(SONGS.nashvilleChord('F#m7b5', G), '7m7b5');
  assert.equal(SONGS.nashvilleChord('Bridge', C), null);
  assert.equal(SONGS.nashvilleChord('x2', C), null);
});

test('Nashville: Freitext behält Taktstriche und Wörter, ohne Tonart nichts', () => {
  assert.equal(SONGS.nashvilleText('C G Am F | C G F C', 'C'), '1 5 6m 4 | 1 5 4 1');
  assert.equal(SONGS.nashvilleText('Strophe: G, D, Em, C x2', 'G'), 'Strophe: 1, 5, 6m, 4 x2');
  assert.equal(SONGS.nashvilleText('Am F C G', 'Am'), '1m b6 b3 b7');
  assert.equal(SONGS.nashvilleText('C G Am F', ''), null);
  assert.equal(SONGS.nashvilleText('1 5 6m 4', 'C'), null);
});

test('Import: zusammenführen über id und Listennamen', () => {
  const st = SONGS.normalizeState(null);
  const n0 = st.songs.length;
  const neu = st.lists[0];
  const r = SONGS.mergeImport(st, {
    lists: [{ id: 'fremd', name: 'Am Üben' }, { id: 'x', name: 'Lagerfeuer' }],
    songs: [
      { id: 'a', listId: 'fremd', title: 'Song A', key: 'G', instrument: 'gitarre', updated: 5 },
      { id: 'b', listId: 'x', title: 'Song B' },
      { id: SONG_SEED[0].id, listId: 'fremd', title: 'Umbenannt', updated: 9 },
      { title: '' },
    ],
  });
  assert.deepEqual({ ...r }, { added: 2, updated: 1 });
  assert.equal(st.songs.length, n0 + 2);
  const ueben = st.lists.find(l => l.name === 'Am Üben');
  assert.equal(st.songs.find(s => s.id === 'a').listId, ueben.id);
  assert.ok(st.lists.some(l => l.name === 'Lagerfeuer'));
  assert.equal(st.songs.find(s => s.id === SONG_SEED[0].id).title, 'Umbenannt');
  assert.ok(neu);
  assert.throws(() => SONGS.mergeImport(st, { foo: 1 }));
});

test('Import: ungültige Tonart und Instrument werden bereinigt', () => {
  const st = SONGS.normalizeState(null);
  SONGS.mergeImport(st, [{ id: 'z', title: 'Z', key: 'H-Dur', instrument: 'Ukulele', list: 'Kann ich' }]);
  const z = st.songs.find(s => s.id === 'z');
  assert.equal(z.key, '');
  assert.equal(z.instrument, 'beides');
  assert.equal(st.lists.find(l => l.id === z.listId).name, 'Kann ich');
});
