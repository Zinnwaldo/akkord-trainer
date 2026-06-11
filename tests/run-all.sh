#!/usr/bin/env bash
# Führt die komplette Testsuite aus. Exit-Code != 0 bei Fehlschlägen.
# Dependency-frei: nur Node-Bordmittel (node:test, node:vm).
set -uo pipefail

cd "$(dirname "$0")/.."

echo "Node-Version: $(node --version)"
echo "Starte Testsuite (node --test tests/) ..."
echo

node --test tests/
exit $?
