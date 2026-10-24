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

// ---------- Struktur, klingende Tonart, stotco-Import, Harmonie-Wege ----------

test('Struktur: Text ↔ Abschnitte, Tonart je Abschnitt, H → B', () => {
  const secs = SONGS.parseStructure('Intro: Am F | C G\nRefrain [Ab]: Ab | Eb\n  | Fm | Cm\nBridge [Hm]: Hm7 | E7\nLeer:');
  assert.deepEqual([...secs.map(s => s.name)], ['Intro', 'Refrain', 'Bridge']);
  assert.equal(secs[1].key, 'Ab');
  assert.match(secs[1].chords, /Ab \| Eb \| \| Fm \| Cm/);
  assert.equal(secs[2].key, 'Bm');
  assert.equal(secs[2].chords, 'Bm7 | E7');
  assert.equal(SONGS.structureText(secs).split('\n')[1].startsWith('Refrain [Ab]: '), true);
  assert.equal(JSON.stringify(SONGS.parseStructure(SONGS.structureText(secs))), JSON.stringify(secs));
});

test('cleanSong: alte Einträge ohne Struktur bleiben gültig, Freitext bleibt', () => {
  const s = SONGS.cleanSong({ title: 'Alt', chords: 'C G Am F', key: 'C' });
  assert.deepEqual([...s.sections], []);
  assert.equal(s.chords, 'C G Am F');
  const t = SONGS.cleanSong({ title: 'Neu', key: 'Fm', sections: [{ name: 'A', chords: 'Fm | Cm', key: 'quatsch' }, { name: 'B', chords: ' | ' }] });
  assert.equal(t.sections.length, 1);
  assert.equal(t.sections[0].key, '');
});

test('Gespeicherter Stand vom alten Reiter (ohne sections) lädt unverändert', () => {
  const saved = { lists: [{ id: 'l1', name: 'Neu gehört' }], seeded: SONG_SEED.map(s => s.id), active: 'l1',
    songs: [{ id: 'x', listId: 'l1', title: 'Alt', chords: 'G D Em C', key: 'G', note: 'n', instrument: 'gitarre', updated: 1 }] };
  const app = loadApp({ localStorageData: { [SONGS.STORE_KEY]: JSON.stringify(saved) } });
  assert.equal(SONGS.STORE_KEY, 'chordtrainer_songs');
  const st = app.exports.SONGS.normalizeState(saved);
  assert.equal(st.songs[0].chords, 'G D Em C');
  assert.equal(st.songs[0].sections.length, 0);
});

test('Ansicht: cleanBarsText wirft Anweisungen raus, % wiederholt', () => {
  assert.equal(SONGS.cleanBarsText('| Am F | C G | x4'), 'Am F | C G');
  assert.equal(SONGS.cleanBarsText('| Cm | Eb (bzw. Ebmaj7) | Ab |'), 'Cm | Eb Ebmaj7 | Ab');
  assert.equal(SONGS.cleanBarsText('C | % | F'), 'C | C | F');
  assert.equal(SONGS.cleanBarsText('Hm | N.C. | E7'), 'Bm | N.C. | E7');
});

test('Ansicht: Songtonart als Zentrum, Abschnitt mit eigener Tonart (Lemon Tree)', () => {
  const song = SONGS.cleanSong({ title: 'Lemon Tree', key: 'Fm', sections: [
    { name: 'Strophe', chords: 'Fm | Cm | Bbm | Cm' },
    { name: 'Refrain', key: 'Ab', chords: 'Ab | Eb | Fm | Cm | Db | Eb7' },
  ] });
  const shown = SONGS.songShown(song);
  assert.equal(shown.key, 'Fm');
  const [str, ref] = shown.sections;
  assert.equal(str.centers[0].key, 'Fm');
  assert.deepEqual([...str.bars.flat().map(b => b.local)], ['i', 'v', 'iv', 'v']);
  assert.equal(ref.centers[0].key, 'Ab');
  assert.equal(ref.centers[0].rel, 'bIII');
  assert.deepEqual([...ref.bars.flat().map(b => b.local)], ['I', 'V', 'vi', 'iii', 'IV', 'V7']);
  // Darstellung der Standards: Etikett, Pfeil, Stufen
  const html = X.stdHwSectionsHTML ? X.stdHwSectionsHTML(shown) : null;
  if (html) { assert.match(html, /in Ab/); assert.match(html, /hw-chord/); }
  // ohne Tonart keine Harmonie-Wege
  assert.equal(SONGS.songShown({ ...song, key: '', sections: song.sections.map(s => ({ ...s, key: '' })) }), null);
});

test('Ansicht: Quintfall und II–V werden erkannt (Friend in Me Bridge)', () => {
  const song = SONGS.cleanSong({ title: 'F', key: 'Eb', sections: [{ name: 'Bridge', chords: 'Gm C7 | Fm Bb7 | Eb' }] });
  const groups = X.stdHwSegments(SONGS.songShown(song).sections[0]);
  assert.deepEqual([...groups[0].items.map(i => i.rel)], ['pair', 'fifth', 'pair', 'fifth', 'none']);
});

const STOTCO = () => ({
  songs: [
    { id: 's1', titel: "You've Got a Friend in Me", kuenstler: 'Misc Cartoons', originalTonart: 'Eb', transposeOffset: 0,
      abschnitte: [{ name: 'Intro', takte: [['Eb', 'G7'], ['Cm', 'B7'], ['%']] }], notizen: '' },
    { id: 's2', titel: 'Lemon Tree', kuenstler: "Fool's Garden", originalTonart: 'Am', transposeOffset: 2,
      abschnitte: [{ name: 'Strophe', takte: [['Am'], ['Em']] }], notizen: 'Capo 8' },
    { id: 's3', titel: 'Wonderwall', kuenstler: 'Oasis', originalTonart: 'F#m', abschnitte: [{ name: 'Strophe', takte: [['F#m7'], ['A']] }] },
    { id: 's4', titel: 'Nicht in der Setliste', kuenstler: 'X', originalTonart: 'C', abschnitte: [] },
  ],
  setlisten: [{ id: 'sl1', name: 'Song-Sammler', eintraege: [{ songId: 's1' }, { songId: 's2' }, { songId: 's3' }] }],
  einstellungen: { notation: 'international' },
});

test('stotco: Format erkannt, eigener Export nicht', () => {
  assert.equal(SONGS.isStotcoExport(STOTCO()), true);
  assert.equal(SONGS.isStotcoExport({ format: 'akkord-trainer-songs', songs: [{ title: 'a' }] }), false);
  assert.equal(SONGS.isStotcoExport([{ title: 'a' }]), false);
});

test('stotco: Song umwandeln, % aufgelöst, Akkorde 1:1 (klingend), Capo/Offset nur als Notiz', () => {
  const [a, b] = STOTCO().songs.map(SONGS.stotcoSong);
  assert.equal(a.sections[0].chords, 'Eb G7 | Cm B7 | B7');
  assert.equal(a.key, 'Eb');
  assert.equal(b.key, 'Am');
  assert.equal(b.sections[0].chords, 'Am | Em');
  assert.match(b.note, /Capo-Hinweis/);
  assert.match(b.note, /transponiert auf Bm/);
});

test('stotco: nur Setliste „Song-Sammler“, ergänzt vorhandene Songs, Neue in „Neu gehört“', () => {
  const st = SONGS.normalizeState(null);
  const n0 = st.songs.length;
  const ueben = st.lists.find(l => l.name === 'Am Üben');
  st.songs.find(s => s.id === 'seed-lemon-tree').listId = ueben.id;   // schon verschoben
  const r = SONGS.mergeImport(st, STOTCO());
  assert.equal(r.stotco, true);
  assert.equal(r.source, 'setlist');
  assert.equal(r.total, 3);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 0);                             // beide haben schon Struktur und Tonart aus dem Seed
  assert.equal(r.unchanged, 2);
  assert.deepEqual([...r.byTitle], ["You've Got a Friend in Me"]);
  assert.equal(st.songs.length, n0 + 1);
  const friend = st.songs.find(s => s.id === 'seed-friend-in-me');
  assert.equal(friend.artist, 'Randy Newman');          // Interpret bleibt
  assert.equal(friend.key, 'Eb');
  assert.equal(friend.sections.length, SONG_SEED.find(x => x.id === 'seed-friend-in-me').sections.length); // Struktur aus dem Seed bleibt
  const lemon = st.songs.find(s => s.id === 'seed-lemon-tree');
  assert.equal(lemon.listId, ueben.id);                   // Liste bleibt
  assert.equal(lemon.key, 'Fm');                         // Seed-Tonart wird nicht überschrieben
  const ww = st.songs.find(s => s.title === 'Wonderwall');
  assert.equal(st.lists.find(l => l.id === ww.listId).name, 'Neu gehört');
  assert.ok(!st.songs.some(s => s.title === 'Nicht in der Setliste'));
  // zweiter Import: nichts doppelt, unverändert
  const r2 = SONGS.mergeImport(st, STOTCO());
  assert.equal(st.songs.length, n0 + 1);
  assert.equal(r2.added, 0);
  assert.equal(r2.unchanged, 3);
});

test('stotco: ohne Setliste alle Songs; eigene Struktur wird nicht überschrieben', () => {
  const st = SONGS.normalizeState(null);
  const lemon = st.songs.find(s => s.id === 'seed-lemon-tree');
  lemon.sections = SONGS.parseStructure('Eigene: Fm | Cm');
  lemon.key = 'Fm';
  const data = STOTCO(); data.setlisten = [];
  const r = SONGS.mergeImport(st, data);
  assert.equal(r.source, 'all');
  assert.equal(r.total, 4);
  assert.equal(lemon.sections[0].name, 'Eigene');
  assert.equal(lemon.stotcoId, undefined);               // nicht verknüpft
  const d2 = STOTCO(); d2.songs[1].abschnitte = [{ name: 'Neu', takte: [['Am']] }];
  SONGS.mergeImport(st, d2);
  assert.equal(lemon.sections[0].name, 'Eigene');        // auch beim zweiten Import nicht
  // Song ohne Struktur: übernimmt stotco und folgt späteren Importen
  const ho = st.songs.find(s => s.id === 'seed-ho-hey');
  ho.sections = [];
  SONGS.mergeImport(st, { songs: [{ id: 'h', titel: 'Ho Hey', kuenstler: 'The Lumineers', originalTonart: 'C', abschnitte: [{ name: 'A', takte: [['C']] }] }] });
  assert.equal(ho.stotcoId, 'h');
  SONGS.mergeImport(st, { songs: [{ id: 'h', titel: 'Ho Hey', kuenstler: 'The Lumineers', originalTonart: 'C', abschnitte: [{ name: 'B', takte: [['F']] }] }] });
  assert.equal(ho.sections[0].name, 'B');
});

test('stotco: Titel-Abgleich nur bei Eindeutigkeit', () => {
  const st = SONGS.normalizeState(null);
  st.songs.push(SONGS.cleanSong({ id: 'sing2', title: 'Sing', artist: 'Ed Sheeran', listId: st.lists[0].id }));
  const r = SONGS.mergeImport(st, { songs: [{ id: 'q', titel: 'Sing', kuenstler: 'travis ', originalTonart: 'F#m', abschnitte: [] }] });
  assert.equal(r.added, 0);                                  // Travis exakt (Groß/Klein, Leerzeichen egal)
  assert.equal(r.unchanged, 1);                              // dem Seed-Song zugeordnet, nichts neu
  const r2 = SONGS.mergeImport(st, { songs: [{ id: 'q2', titel: 'Sing', kuenstler: 'Pentatonix', abschnitte: [] }] });
  assert.equal(r2.added, 1);                                 // zwei Kandidaten → lieber neu
});

// ---------- Seed v2: sieben Songs mit Struktur, Nachreichen in alte Speicherstände ----------

test('SONG_SEED v2: sieben Songs mit Struktur, Tonart, Lemon Tree Refrain in Ab', () => {
  assert.equal(SONG_SEED.length, 7);
  for (const s of SONG_SEED) {
    assert.equal(s.v, 2, s.id);
    assert.ok(X.parseSongKey(s.key), s.id);
    assert.ok(s.sections.length >= 4, s.id);
    assert.ok(SONGS.songShown(SONGS.cleanSong(s)), s.id);
  }
  const lemon = SONG_SEED.find(s => s.id === 'seed-lemon-tree');
  assert.equal(lemon.key, 'Fm');
  assert.equal(lemon.sections.find(x => x.name === 'Refrain').key, 'Ab');
  const ref = SONGS.songShown(SONGS.cleanSong(lemon)).sections.find(x => x.label === 'Refrain');
  assert.equal(ref.bars[0][0].local, 'I');
});

// Speicherstand wie ihn 54713f0 hinterlassen hat: Seed-Songs ohne Struktur, kein seedApplied
function oldSaved(patch = {}) {
  const lists = [{ id: 'l1', name: 'Neu gehört' }, { id: 'l2', name: 'Am Üben' }];
  const songs = SONG_SEED.map(s => ({ id: s.id, listId: 'l1', title: s.title, artist: s.artist, key: '', chords: '', note: '', instrument: 'beides', updated: 0 }));
  for (const [id, p] of Object.entries(patch)) Object.assign(songs.find(s => s.id === id), p);
  return { lists, songs, seeded: SONG_SEED.map(s => s.id), active: 'l1' };
}

test('Seed v2 kommt in alte Speicherstände: leere Felder werden gefüllt', () => {
  const st = SONGS.normalizeState(oldSaved());
  assert.equal(st.songs.length, 7);
  for (const s of SONG_SEED) {
    const mine = st.songs.find(x => x.id === s.id);
    assert.equal(mine.key, s.key, s.id);
    assert.equal(mine.sections.length, s.sections.length, s.id);
    assert.equal(mine.note, s.note, s.id);
    assert.equal(mine.listId, 'l1');
    assert.equal(st.seedApplied[s.id].v, 2);
  }
});

test('Seed v2 überschreibt nichts Eigenes; Liste, Instrument, Löschung bleiben', () => {
  const saved = oldSaved({
    'seed-ho-hey': { key: 'D', note: 'meine Notiz', listId: 'l2', instrument: 'gitarre' },
    'seed-crazy-gnarls': { chords: 'Cm Eb Ab G', sections: [{ name: 'Eigen', chords: 'Cm | G' }] },
  });
  saved.songs = saved.songs.filter(s => s.id !== 'seed-hotel-california');   // gelöscht
  const st = SONGS.normalizeState(saved);
  const ho = st.songs.find(s => s.id === 'seed-ho-hey');
  assert.equal(ho.key, 'D');
  assert.equal(ho.note, 'meine Notiz');
  assert.equal(ho.listId, 'l2');
  assert.equal(ho.instrument, 'gitarre');
  assert.ok(ho.sections.length > 0);                         // leere Struktur wurde gefüllt
  const crazy = st.songs.find(s => s.id === 'seed-crazy-gnarls');
  assert.equal(crazy.sections[0].name, 'Eigen');
  assert.equal(crazy.chords, 'Cm Eb Ab G');
  assert.equal(crazy.key, 'Cm');
  assert.ok(!st.songs.some(s => s.id === 'seed-hotel-california'));
});

test('Seed-Upgrade: einmalig, später geänderte Seed-Werte ersetzen nur unveränderte Felder', () => {
  const st = SONGS.normalizeState(oldSaved());
  const saved = JSON.parse(JSON.stringify(st));
  const ho = saved.songs.find(s => s.id === 'seed-ho-hey');
  ho.note = 'von Karsten';
  const t0 = saved.songs.find(s => s.id === 'seed-sing-travis').updated;
  // gleiche Version: nichts passiert
  const again = SONGS.normalizeState(JSON.parse(JSON.stringify(saved)));
  assert.equal(again.songs.find(s => s.id === 'seed-ho-hey').note, 'von Karsten');
  assert.equal(again.songs.find(s => s.id === 'seed-sing-travis').updated, t0);
  // gedachte Seed-v3 mit neuer Notiz und Tonart
  const v3 = SONG_SEED.map(s => ({ ...s, v: 3, note: s.note + ' (v3)' }));
  const up = SONGS.applySeed(JSON.parse(JSON.stringify(again)), v3);
  assert.equal(up.songs.find(s => s.id === 'seed-ho-hey').note, 'von Karsten');
  assert.match(up.songs.find(s => s.id === 'seed-sing-travis').note, /\(v3\)$/);
});

test('App-Start mit altem Speicherstand: Nachträge landen in localStorage', () => {
  const app = loadApp({ localStorageData: { chordtrainer_songs: JSON.stringify(oldSaved()) } });
  assert.deepEqual(app.errors, []);
  const stored = JSON.parse(app.localStorage.getItem('chordtrainer_songs'));
  assert.equal(stored.songs.find(s => s.id === 'seed-lemon-tree').key, 'Fm');
  assert.equal(stored.seedApplied['seed-lemon-tree'].v, 2);
});
