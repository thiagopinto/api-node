#!/usr/bin/env bash

echo "=========================================="
echo " 1. Testando rota rápida (GET /)..."
echo "=========================================="
curl -i http://localhost:3000/
echo -e "\n"

echo "=========================================="
echo " 2. Disparando /slow (aguarda 5s)..."
echo "=========================================="
curl -i http://localhost:3000/slow
echo -e "\n"
