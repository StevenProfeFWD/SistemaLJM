#!/usr/bin/env bash
# Uso: bash scripts/ciclo.sh <n>  — corre la suite completa con cobertura y registra el ciclo.
cd "$(dirname "$0")/.."
npx vitest run --coverage --reporter=default --reporter=json --outputFile.json=resultados/ultimo.json > resultados/salida-ciclo-$1.txt 2>&1
node scripts/resumen-ciclo.mjs "$1"
