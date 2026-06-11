# Testumgebung für den Akkord-Progression-Trainer

Automatisierte, wiederholbare Tests für die Single-File-App
`chord-progression-trainer.html` — **komplett dependency-frei**
(nur Node-Bordmittel: `node:test`, `node:vm`, `node:assert`).
Kein `npm install` nötig oder vorgesehen.

## Tests ausführen

```bash
bash tests/run-all.sh
# oder direkt:
node --test tests/*.test.mjs
```

Exit-Code `0` = alles grün, `!= 0` = mindestens ein Fehlschlag.
Benötigt Node ≥ 20 (getestet mit v22).

## Aufbau

| Datei | Zweck |
|---|---|
| `extract.mjs` | Extrahiert den `<script>`-Block aus der HTML-Datei (~226 KB, Base64-Fonts — wird nie ausgegeben) und führt ihn in einer `node:vm`-Sandbox mit minimalen DOM-Stubs aus (document/getElementById-Dummies, localStorage als Map, Timer-No-Ops). Exportiert die reinen Funktionen und Daten (`PROGRESSIONS`, `transposeChord`, `chordVoicings`, `classifyFunction`, `weightedPick`, …). Fängt Init-Fehler ab und dokumentiert sie (`errors`, `missingExports`). |
| `unit.test.mjs` | Technische Invarianten: Schema der Progressionen (name/style/difficulty/mode, `chords.length === roman.length`), Transponierbarkeit aller Akkorde in alle 12 Tonarten, Round-Trip-Transposition (enharmonischer Vergleich auf Halbton-Ebene), Voicings nicht-leer und im 2-Oktaven-Tastaturbereich (0–23), `weightedPick` (Pool-Länge 1, Gleichverteilung, 3x-Gewichtung "schwer"), `pickNextProgression`-Grundinvariante. |
| `theory.test.mjs` | **Inhaltliche** Musiktheorie-Prüfung: eigener Stufensymbol-Parser (`bVImaj7`, `iiø`, `V/vi`, `i/bVII` …) → erwarteter Grundton-Halbton relativ zu C + erwartete Qualität, verglichen mit dem tatsächlichen Akkord. Sekundärdominanten und Slash-Bässe werden aufgelöst (Regel: hat der Akkord selbst einen Slash, ist `X/Y` Slash-Bass-Notation, sonst Sekundärfunktion). Zusätzlich `classifyFunction`-Stichproben (I→Tonika, IV→Subdominante, V7→Dominante, bVII→Dominante/Backdoor …). Bei konstantem Versatz aller Akkorde gibt der Test eine Diagnose aus ("scheint in G statt C notiert"). |
| `dom-smoke.test.mjs` | Smoke-Tests der HTML-Hülle: grob parsebar, genau ein `<script>`, alle per `getElementById` referenzierten IDs existieren im HTML (Regex + tatsächlich angeforderte IDs aus dem Sandbox-Lauf), keine doppelten IDs, offline-fähig (keine externen http(s)-Ressourcen, Fonts eingebettet), Init-Code überlebt die DOM-Stubs. |
| `run-all.sh` | Führt alles aus, propagiert den Exit-Code. |

### Bezugskonvention der Theorie-Tests

Die Bibliothek ist laut Quellkommentar "Notiert in C", `transposeProgression`
rechnet relativ zu C und die Tonartanzeige zeigt `key + "m"` für Moll.
Daraus folgt: `I`/`i` muss **immer** auf dem Halbton 0 (C) stehen — auch in
Moll-Progressionen (`i` = Cm). Progressionen, die stattdessen in A-Moll, G, D
oder F notiert sind, schlagen absichtlich fehl: Bei ihnen stimmt die
Tonartanzeige der App nach Transposition nicht mit dem klingenden Material
überein. **Das sind echte App-Befunde, keine Testfehler — bitte nicht
"wegmocken", sondern die Bibliothek korrigieren.**

Bekannte rote Tests (Stand der Erstellung): Andalusisch, i–bVI–bIII–bVII,
Lament Bass, Flamenco-Kadenz, i–bIII–bVII–IV, Livin' on a Prayer,
Wonderwall (Verse), I Will Survive (alle in Am statt Cm notiert),
Girl from Ipanema A (in F), Dorian Vamp (in D), Mixolydian Vamp (in G)
sowie `classifyFunction('i/bVII')` → `other` statt Tonika.

## Review-Agenten

In `.claude/agents/` liegen drei Agenten-Definitionen für inhaltliche Reviews
(nutzbar in Claude Code, z. B. via Agent-Tool oder `@agent-name`):

- **`music-theory-reviewer`** — prüft Stufensymbole vs. Akkorde, die
  Original-Tonarten der Karaoke-Songs (`originalKey`), Voicing-Definitionen
  und die Funktionsklassifikation; meldet Befunde mit Korrekturvorschlag.
- **`code-reviewer`** — prüft Logik (Timer, History-Index-Drift, Filter,
  Transpositions-Kanten), XSS-Risiken aller `innerHTML`-Zuweisungen und die
  localStorage-Behandlung (kaputtes JSON, Migration).
- **`ux-reviewer`** — prüft Bedienbarkeit im Übe-Kontext (Lesbarkeit aus
  Distanz, Shortcuts) und Accessibility (ARIA/aria-live, Fokus, Kontraste,
  reine Farb-Kodierung, reduced-motion, Touch-Ziele).

Alle Agenten wissen, dass die HTML-Datei nie komplett gelesen werden darf
(Base64-Fonts) und nutzen `sed -n '848,1773p'` für den Skript-Teil.

## Grenzen der Testumgebung

- Kein echter Browser/DOM: Rendering, CSS, Animationen, Tastatur-Events und
  echtes localStorage-Verhalten werden nicht getestet (nur Logik + Statik).
- Timer sind in der Sandbox No-Ops — `startTimer`/Intervall-Trainer werden
  nur strukturell, nicht zeitlich geprüft.
- Verteilungstests (`weightedPick`) sind statistisch mit sehr großzügigen
  Schranken (> 8 Sigma), praktisch nicht flaky.
- Die Zeilenangaben (848/1773) sind nicht hart kodiert — `extract.mjs` sucht
  `<script>`/`</script>` selbst; ändert sich die Datei, funktioniert die
  Extraktion weiter, solange es genau einen Skript-Block gibt.
