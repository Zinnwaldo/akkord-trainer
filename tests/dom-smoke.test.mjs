// ============================================================
// dom-smoke.test.mjs — Smoke-Tests für die HTML-Hülle
// (Datei wird nur im Speicher verarbeitet, nie ausgegeben — sie
//  enthält ~226 KB inkl. Base64-Fonts.)
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readHtml, extractScriptSource, loadAppCached } from './extract.mjs';

const html = readHtml();
const script = extractScriptSource(html);
// HTML ohne den Skript-Block (für ID- und Ressourcen-Analysen)
const htmlOnly = html.replace(script, '');

test('HTML grob parsebar: DOCTYPE, html/head/body, schließende Tags', () => {
  assert.match(html, /^\s*<!DOCTYPE html>/i, 'DOCTYPE fehlt');
  for (const tag of ['<html', '<head', '<body', '</body>', '</html>']) {
    assert.ok(html.includes(tag), `"${tag}" fehlt`);
  }
  assert.match(html, /<html[^>]*lang="de"/, 'lang="de" fehlt am <html>-Tag');
});

test('Genau ein <script>-Block', () => {
  const opens = html.match(/<script\b/g) || [];
  const closes = html.match(/<\/script>/g) || [];
  assert.equal(opens.length, 1, `Erwartet 1 <script>, gefunden ${opens.length}`);
  assert.equal(closes.length, 1, `Erwartet 1 </script>, gefunden ${closes.length}`);
  assert.ok(script.length > 1000, 'Skript-Block verdächtig kurz');
});

test('Alle per getElementById referenzierten IDs existieren im HTML', () => {
  // IDs aus dem JS (statische Aufrufe)
  const referenced = new Set();
  for (const m of script.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    referenced.add(m[1]);
  }
  // Zusätzlich: IDs, die beim Sandbox-Lauf tatsächlich angefordert wurden
  // (fängt auch dynamisch zusammengesetzte IDs ab, soweit der Init-Pfad sie nutzt)
  for (const id of loadAppCached().requestedIds) referenced.add(id);

  assert.ok(referenced.size > 0, 'Keine getElementById-Aufrufe gefunden (Extraktion defekt?)');

  // IDs aus dem HTML (ohne Skript-Block)
  const defined = new Set();
  for (const m of htmlOnly.matchAll(/\bid\s*=\s*"([^"]+)"/g)) defined.add(m[1]);
  for (const m of htmlOnly.matchAll(/\bid\s*=\s*'([^']+)'/g)) defined.add(m[1]);

  const missing = [...referenced].filter(id => !defined.has(id));
  assert.deepEqual(missing, [],
    'Im JS referenziert, aber nicht im HTML definiert: ' + missing.join(', '));
});

test('Keine doppelten IDs im HTML', () => {
  const seen = new Map();
  for (const m of htmlOnly.matchAll(/\bid\s*=\s*"([^"]+)"/g)) {
    seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n}x)`);
  assert.deepEqual(dupes, [], 'Doppelte IDs: ' + dupes.join(', '));
});

test('Offline-fähig: keine externen http(s)-Ressourcen', () => {
  const findings = [];
  // src/href auf http(s)
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']\s*(https?:\/\/[^"']*)["']/gi)) {
    findings.push(`Attribut lädt extern: ${m[1].slice(0, 80)}`);
  }
  // CSS url(http...) und @import
  for (const m of html.matchAll(/url\(\s*["']?(https?:\/\/[^"')]*)/gi)) {
    findings.push(`CSS url() lädt extern: ${m[1].slice(0, 80)}`);
  }
  for (const m of html.matchAll(/@import\s+["'(]+\s*(https?:\/\/[^"')]*)/gi)) {
    findings.push(`@import lädt extern: ${m[1].slice(0, 80)}`);
  }
  // fetch/XHR/WebSocket im Skript
  for (const pat of [/\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/]) {
    if (pat.test(script)) findings.push(`Skript nutzt Netzwerk-API: ${pat}`);
  }
  // Hinweis: xmlns="http://www.w3.org/2000/svg" ist ein Namespace-Bezeichner,
  // keine geladene Ressource — wird von den Mustern oben bewusst nicht erfasst,
  // außer als src/href. Falls doch getroffen, hier ausfiltern:
  const real = findings.filter(f => !f.includes('www.w3.org/2000/svg') && !f.includes('www.w3.org/1999/xhtml'));
  assert.deepEqual(real, [], 'Externe Ressourcen gefunden:\n  ' + real.join('\n  '));
});

test('Fonts sind eingebettet (data:-URLs), keine Font-CDNs', () => {
  assert.ok(/url\(\s*["']?data:font|url\(\s*["']?data:application\/font|src:\s*url\(\s*["']?data:/i.test(html)
    || !/@font-face/i.test(html),
    'Es gibt @font-face ohne eingebettete data:-URL');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), 'Google-Fonts-CDN referenziert');
});

test('Sandbox-Lauf: Init-Code überlebt die DOM-Stubs', () => {
  const app = loadAppCached();
  assert.deepEqual(app.errors, [],
    'Fehler beim Sandbox-Lauf: ' + JSON.stringify(app.errors, null, 2));
  // Plausibilität: Die wichtigsten UI-IDs wurden beim Init angefordert
  for (const id of ['chordsDisplay', 'progName', 'timer', 'btnNext']) {
    assert.ok(app.requestedIds.has(id), `Init hat "${id}" nie angefordert`);
  }
});
