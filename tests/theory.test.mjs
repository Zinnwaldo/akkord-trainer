// ============================================================
// theory.test.mjs — INHALTLICHE Prüfung der Progressions-Bibliothek
//
// Eigener kleiner Theorie-Checker: Stufensymbole (roman) werden geparst
// und in einen erwarteten Grundton-Halbton relativ zu C plus eine
// erwartete Akkordqualität übersetzt. Das wird gegen den tatsächlichen
// chords-Eintrag verglichen (Grundton via NOTE_TO_SEMI, Qualität via Suffix).
//
// Bezugskonvention (aus der App abgeleitet): Die Bibliothek ist laut
// Kommentar "Notiert in C", transposeProgression rechnet Intervalle
// relativ zu C, und die Tonartanzeige zeigt key + "m" für Moll.
// Damit muss "I" bzw. "i" IMMER auf dem Halbton 0 (C) stehen — auch in
// Moll-Progressionen (i = Cm). Progressionen, die stattdessen z. B. in
// A-Moll oder G notiert sind, sind ECHTE Inkonsistenzen der App
// (falsche Tonartanzeige nach Transposition) und sollen hier fehlschlagen.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppCached } from './extract.mjs';

const X = loadAppCached().exports;
const { PROGRESSIONS, NOTE_TO_SEMI, classifyFunction } = X;

// ---------- Roman-Numeral-Parser ----------
const DEGREE_SEMI = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

// Parst ein einzelnes Stufensymbol OHNE Slash, z. B. "bVImaj7", "iiø", "V7".
// Liefert { semi, upper, quality } oder null.
function parseDegree(token) {
  const m = token.match(/^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/);
  if (!m) return null;
  const [, acc, numeral, suffix] = m;
  const upper = numeral === numeral.toUpperCase();
  let semi = DEGREE_SEMI[numeral.toUpperCase()];
  if (acc === 'b') semi = (semi + 11) % 12;
  if (acc === '#') semi = (semi + 1) % 12;
  return { semi, upper, suffix: suffix.trim() };
}

// Erwartete Qualitäts-Menge (Akkord-Suffixe) aus Stufensymbol ableiten.
// isDominantFunction: V oder Sekundärdominante → Dom7 zusätzlich erlaubt.
function expectedQualities(deg, isDominantFunction) {
  const s = deg.suffix;
  if (/ø/.test(s) || /m7b5/.test(s)) return new Set(['m7b5']);
  if (/maj7/.test(s)) return new Set(['maj7']);
  if (/(^|[^a-z])7/.test(s) || s === '7') {
    return deg.upper ? new Set(['7']) : new Set(['m7']);
  }
  if (s === '') {
    if (deg.upper) {
      const set = new Set(['', 'maj7']);
      if (isDominantFunction) set.add('7');
      return set;
    }
    return new Set(['m', 'm7']);
  }
  return null; // unbekanntes Suffix → wird als Befund gemeldet
}

function parseChordPart(part) {
  const m = part.match(/^([A-G][#b]?)(.*)$/);
  if (!m || !(m[1] in NOTE_TO_SEMI)) return null;
  return { semi: NOTE_TO_SEMI[m[1]], suffix: m[2] };
}

// Prüft ein (chord, roman)-Paar; liefert Liste von Befunden (leer = ok).
function checkPair(chord, roman) {
  const findings = [];
  const chordParts = chord.split('/');
  const romanParts = roman.split('/');

  let mainRoman = romanParts[0];
  let bassRoman = null;
  let secondaryTarget = null;

  if (romanParts.length === 2) {
    if (chordParts.length === 2) {
      // Akkord hat Slash-Bass → roman "X/Y" ist Slash-Bass-Notation (z. B. i/bVII)
      bassRoman = romanParts[1];
    } else {
      // Kein Slash im Akkord → Sekundärfunktion (z. B. V/vi = Dominante der vi. Stufe)
      secondaryTarget = romanParts[1];
    }
  } else if (romanParts.length > 2) {
    findings.push(`Stufensymbol "${roman}" hat mehr als einen Slash`);
    return findings;
  }

  const mainDeg = parseDegree(mainRoman);
  if (!mainDeg) {
    findings.push(`Stufensymbol "${mainRoman}" nicht parsebar`);
    return findings;
  }

  // Erwarteter Grundton-Halbton relativ zu C
  let expectedSemi = mainDeg.semi;
  let isDominantFunction = mainDeg.upper && mainDeg.semi === 7 && !secondaryTarget; // V
  if (secondaryTarget) {
    const target = parseDegree(secondaryTarget);
    if (!target) {
      findings.push(`Sekundärziel "${secondaryTarget}" in "${roman}" nicht parsebar`);
      return findings;
    }
    // V/x = Dur(-Dominante) eine Quinte über der Zielstufe
    expectedSemi = (target.semi + mainDeg.semi) % 12;
    isDominantFunction = mainDeg.upper && mainDeg.semi === 7;
  }

  const actualMain = parseChordPart(chordParts[0]);
  if (!actualMain) {
    findings.push(`Akkord "${chord}" nicht parsebar`);
    return findings;
  }

  if (actualMain.semi !== expectedSemi) {
    findings.push(
      `Grundton: "${roman}" erwartet Halbton ${expectedSemi} rel. zu C, ` +
      `Akkord "${chord}" steht auf Halbton ${actualMain.semi} (Differenz ${(actualMain.semi - expectedSemi + 12) % 12} HT)`
    );
  }

  const quals = expectedQualities(mainDeg, isDominantFunction);
  if (!quals) {
    findings.push(`Unbekanntes Stufen-Suffix in "${roman}"`);
  } else if (!quals.has(actualMain.suffix)) {
    findings.push(
      `Qualität: "${roman}" erwartet eine von {${[...quals].map(q => q || 'Dur').join(', ')}}, ` +
      `Akkord "${chord}" hat Suffix "${actualMain.suffix || 'Dur'}"`
    );
  }

  // Slash-Bass prüfen
  if (bassRoman) {
    const bassDeg = parseDegree(bassRoman);
    const actualBass = parseChordPart(chordParts[1]);
    if (!bassDeg) {
      findings.push(`Bass-Stufe "${bassRoman}" nicht parsebar`);
    } else if (!actualBass) {
      findings.push(`Bass-Note in "${chord}" nicht parsebar`);
    } else if (actualBass.semi !== bassDeg.semi) {
      findings.push(
        `Bass: "/${bassRoman}" erwartet Halbton ${bassDeg.semi} rel. zu C, ` +
        `"${chord}" hat Bass auf Halbton ${actualBass.semi}`
      );
    }
  } else if (chordParts.length === 2 && romanParts.length === 1) {
    findings.push(`Akkord "${chord}" hat Slash-Bass, Stufensymbol "${roman}" aber nicht`);
  }

  return findings;
}

// ---------- Tests: jede Progression einzeln ----------
for (const prog of PROGRESSIONS) {
  test(`Stufensymbole vs. Akkorde: ${prog.name}`, () => {
    const allFindings = [];
    const offsets = [];
    prog.chords.forEach((chord, i) => {
      const roman = prog.roman[i];
      const fs = checkPair(chord, roman);
      fs.forEach(f => allFindings.push(`[${i}] ${roman} ↔ ${chord}: ${f}`));
      // Offset für Diagnose sammeln (konstanter Versatz = falsche Bezugstonart)
      const deg = parseDegree(roman.split('/')[0]);
      const act = parseChordPart(chord.split('/')[0]);
      if (deg && act) offsets.push((act.semi - deg.semi + 12) % 12);
    });

    let hint = '';
    const uniq = [...new Set(offsets)];
    if (allFindings.length > 0 && uniq.length === 1 && uniq[0] !== 0) {
      const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
      hint = `\n  → Diagnose: Progression scheint einheitlich in ${NOTE[uniq[0]]} ` +
             `statt C notiert zu sein (konstanter Versatz +${uniq[0]} HT). ` +
             `Tonartanzeige/Transposition der App wird dadurch falsch.`;
    }

    assert.equal(allFindings.length, 0,
      `Inkonsistenzen in "${prog.name}" (${prog.mode}):\n  ` +
      allFindings.join('\n  ') + hint);
  });
}

// ---------- classifyFunction: Stichproben gegen Erwartungsliste ----------
test('classifyFunction: Kern-Stichproben (I, IV, V7, bVII, ...)', () => {
  const expectations = [
    ['I', 'tonic'], ['Imaj7', 'tonic'], ['i', 'tonic'], ['i7', 'tonic'],
    ['iii', 'tonic'], ['vi', 'tonic'],
    ['IV', 'subdom'], ['iv', 'subdom'], ['iv7', 'subdom'],
    ['ii', 'subdom'], ['ii7', 'subdom'], ['iiø', 'subdom'], ['II', 'subdom'],
    ['bVI', 'subdom'], ['bIII', 'subdom'],
    ['V', 'dominant'], ['V7', 'dominant'], ['VII7', 'dominant'],
    ['bVII', 'dominant'],          // Backdoor-Dominante
    ['bVII7', 'dominant'],
    ['bII7', 'dominant'],          // Tritonus-Substitution
    ['V/vi', 'dominant'], ['V/V', 'dominant'],  // Sekundärdominanten
  ];
  const wrong = [];
  for (const [roman, expected] of expectations) {
    const got = classifyFunction(roman);
    if (got !== expected) wrong.push(`${roman}: erwartet "${expected}", erhalten "${got}"`);
  }
  assert.deepEqual(wrong, [], 'Fehlklassifikationen:\n  ' + wrong.join('\n  '));
});

test('classifyFunction: Slash-Bass-Stufen (i/bVII sollte Tonika-Funktion behalten)', () => {
  // Musikalisch ist i mit Terz-/Septbass weiterhin Tonika-Funktion.
  // Die App liefert hier "other" — wenn dieser Test fehlschlägt, ist das
  // ein (kleiner) echter Befund in classifyFunction, kein Testfehler.
  assert.equal(classifyFunction('i/bVII'), 'tonic',
    '"i/bVII" (Lament Bass) wird nicht als Tonika klassifiziert');
});

test('classifyFunction: Randfälle crashen nicht', () => {
  for (const r of ['', null, undefined, '???', 'bbb', 'V/', '/vi']) {
    const got = classifyFunction(r);
    assert.equal(typeof got, 'string');
  }
});
