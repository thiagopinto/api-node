#!/usr/bin/env bash

# Uso: ./scripts/panic.sh true   (Ativa o pânico)
#      ./scripts/panic.sh false  (Desativa o pânico)

STATE=${1:-true}

cd "$(dirname "$0")/.." || exit 1
yarn tsx scripts/publish-panic.ts "$STATE"
